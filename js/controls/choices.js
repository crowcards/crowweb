// A list of checkboxes or radio buttons, one row per option. Used for
// community size, values, the module picker, membership, and later modules.
//
//   const choices = renderChoices({
//     type: "checkbox",                 // or "radio"
//     legend: "How people join",        // shown as the field's label
//     hint: "Pick all that apply.",
//     options: [{ id, label, description }],
//     selected: ["open_access"],        // radio: a single id or null
//     onChange: (value) => …,           // checkbox: ids in option order; radio: id or null
//   });
//   container.append(choices.element);
//
// Layouts:
//   "described" (default) — the name over its description
//   "compact"             — just the name, with a pixel plus that opens the
//                           description (or `details(option)`) underneath
// Other options: legendHidden (screen-reader-only legend), clearable (a
// radio "Clear" link), filterable (a "Filter…" box above the list, for long
// lists; filterLabel names what's filtered, default: the legend), before / after (nodes placed above / below the list), listClass
// (an extra class on the list), flag ({ text, show(id, checked) }: a small
// note under an option, e.g. "Has saved content").
//
// sub: a follow-up choice that opens under an option when it's ticked
// (checkbox lists, "described" layout), e.g. a rule's "Allowed / Not allowed":
//   sub: { options: [{ id, label }], applies: (opt) => true, values: { optId: subId }, legend: "…" }
// choices.subValue(optId) → the follow-up answer for a ticked option, or null.
//
// badge: (opt) => ({ label, notes: [text] }) | null — a small lime chip next
// to an option's name (e.g. "Suggested"), with its notes under the
// description ("described") or in the pixel-plus details ("compact").

import { el, uid, chip as makeChip, richText } from "../dom.js";

export function renderChoices({
  type = "checkbox",
  legend,
  legendHidden = false,
  hint,
  options,
  selected = type === "radio" ? null : [],
  layout = "described",
  details,
  clearable = false,
  filterable = false,
  filterLabel = legend.toLowerCase(),
  before = [],
  after = [],
  listClass = "",
  flag,
  sub,
  badge = () => null,
  onChange = () => {},
} = {}) {
  const group = uid("choice");
  const isChosen = (id) => (type === "radio" ? selected === id : selected.includes(id));
  const inputs = new Map();   // option id → its input
  const flags = new Map();    // option id → its flag line
  const subs = new Map();     // option id → { box, inputs } for follow-up choices

  const list = el("div", { className: `choices ${listClass}`.trim() });

  for (const opt of options) {
    const id = uid("opt");
    const input = el("input", { type, id, name: group, value: opt.id, checked: isChosen(opt.id) });
    inputs.set(opt.id, input);
    input.addEventListener("change", () => {
      refreshFlags();
      refreshSubs();
      if (clear) clear.hidden = !value();
      onChange(value());
    });

    const b = badge(opt);
    const chip = b ? makeChip(b.label) : null;
    const badgeNotes = (b?.notes || []).map((n) => el("p", { className: "choice-badge-note" }, ...richText(n)));

    let row;
    if (layout === "compact") {
      const about = el("div", { className: "choice-about", id: uid("about"), hidden: true },
        ...(details ? details(opt) : [el("p", { textContent: opt.description })]),
        ...badgeNotes);
      const toggle = el("button", { type: "button", className: "pixel-toggle", title: `About ${opt.label}` });
      toggle.setAttribute("aria-label", `About ${opt.label}`);
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", about.id);
      toggle.addEventListener("click", () => {
        about.hidden = !about.hidden;
        toggle.setAttribute("aria-expanded", String(!about.hidden));
      });
      row = el("div", { className: "choice choice-compact" },
        input,
        el("label", { htmlFor: id, className: "choice-name" }, opt.label, chip),
        toggle,
        about,
      );
    } else {
      const flagLine = flag ? Object.assign(makeChip(flag.text), { hidden: true }) : null;
      flagLine?.classList.add("choice-flag");
      if (flagLine) flags.set(opt.id, flagLine);
      const label = el("label", { htmlFor: id },
        el("span", { className: "choice-name" }, opt.label, chip),
        opt.description ? el("span", { className: "choice-desc", textContent: opt.description }) : null,
        ...badgeNotes,
        flagLine,
      );
      const follow = sub && (sub.applies ? sub.applies(opt) : true) ? followUp(opt) : null;
      row = el("div", { className: "choice" }, input, follow ? el("div", {}, label, follow) : label);
    }
    row.dataset.search = `${opt.label} ${opt.description || ""}`.toLowerCase();
    list.append(row);
  }

  const clear = type === "radio" && clearable
    ? el("button", { type: "button", className: "link-button", textContent: "Clear", hidden: selected == null })
    : null;
  clear?.addEventListener("click", () => {
    set(null);
    onChange(null);
  });

  let search = null;
  if (filterable) {
    search = el("input", { type: "search", id: uid("filter"), placeholder: `Filter ${filterLabel}…`, autocomplete: "off" });
    search.addEventListener("input", () => filter(search.value));
  }

  const element = el("fieldset", { className: "field" },
    el("legend", { className: legendHidden ? "visually-hidden" : "mono-u", textContent: legend }),
    hint ? el("p", { className: "field-hint", textContent: hint }) : null,
    ...before,
    search ? el("label", { className: "visually-hidden", htmlFor: search.id, textContent: `Filter ${filterLabel}` }) : null,
    search,
    list,
    ...after,
    clear,
  );

  function value() {
    const on = options.filter((o) => inputs.get(o.id).checked).map((o) => o.id);
    return type === "radio" ? on[0] ?? null : on;
  }

  /** Select exactly these (radio: one id or null). */
  function set(v) {
    for (const [id, input] of inputs) input.checked = type === "radio" ? v === id : v.includes(id);
    if (clear) clear.hidden = !v;
    refreshFlags();
    refreshSubs();
  }

  /** Tick or untick one option (checkbox lists), without firing onChange. */
  function setOne(id, on) {
    inputs.get(id).checked = on;
    refreshFlags();
    refreshSubs();
  }

  /** The follow-up radio buttons for one option, shown while it's ticked. */
  function followUp(opt) {
    const name = uid("sub");
    const subInputs = new Map();
    const box = el("fieldset", { className: "choice-sub" },
      el("legend", { className: "visually-hidden", textContent: `${opt.label}: ${sub.legend || "details"}` }),
      el("div", { className: "scale" }, ...sub.options.map((o) => {
        const sid = uid("subopt");
        const radio = el("input", { type: "radio", id: sid, name, value: o.id, checked: sub.values?.[opt.id] === o.id });
        radio.addEventListener("change", () => onChange(value()));
        subInputs.set(o.id, radio);
        return el("div", { className: "choice" }, radio, el("label", { htmlFor: sid, className: "choice-name", textContent: o.label }));
      })),
    );
    subs.set(opt.id, { box, inputs: subInputs });
    return box;
  }

  function refreshSubs() {
    for (const [id, { box }] of subs) box.hidden = !inputs.get(id).checked;
  }

  /** The follow-up answer for a ticked option, or null. */
  function subValue(id) {
    const s = subs.get(id);
    if (!s || !inputs.get(id).checked) return null;
    for (const [sid, radio] of s.inputs) if (radio.checked) return sid;
    return null;
  }

  function refreshFlags() {
    for (const [id, line] of flags) line.hidden = !flag.show(id, inputs.get(id).checked);
  }
  refreshFlags();
  refreshSubs();

  /** Show only options whose name or description contains `query`. */
  function filter(query) {
    const q = query.trim().toLowerCase();
    for (const row of list.children) row.hidden = !!q && !row.dataset.search.includes(q);
  }

  return { element, value, set, setOne, filter, subValue };
}
