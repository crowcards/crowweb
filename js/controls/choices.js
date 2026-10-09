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
//   "buttons"             — a row of buttons: gray, lime on hover, orange when
//                           chosen; the description shows on hover / focus
//   "range"               — a numbered range (scaleField with range): the name
//                           under its radio button, the description on hover / focus
// hintBelow (radio "buttons"): the chosen option's description shows under
// the row (hintBelow: true, or a node to follow it, e.g. a docs link) instead
// of in hover bubbles.
// Other options: legendHidden (screen-reader-only legend), clearable (a
// radio "Clear" link), filterable (a "Filter…" box above the list, for long
// lists; filterLabel names what's filtered, default: the legend), before / after (nodes placed above / below the list), listClass
// (an extra class on the list), flag ({ text, show(id, checked) }: a small
// note under an option, e.g. "Has saved content").
//
// sub: a follow-up choice that opens under an option when it's ticked
// (checkbox lists, "described" layout), e.g. a rule's "Allowed / Not allowed":
//   sub: { options: [{ id, label }] or (opt) => [{ id, label }], applies: (opt) => true,
//          values: { optId: subId }, legend: "…" }
// choices.subValue(optId) → the follow-up answer for a ticked option, or null
// (subValue(optId, { evenIfOff: true }): also for an unticked one, as it was
// left, e.g. to set it aside); choices.setSub(optId, subId) sets it from code.
// scaleField: one choice in a row, that can be cleared: Yes / No (always as
// short buttons, layout "buttons"), a step's number, a numbered range. range: true makes it a numbered range spread
// across the line, each number under its radio button, and what an
// option means (its description) in a bubble on hover, like the "i";
// layout: "buttons" draws them as a row of buttons. YES_NO: the
// Yes / No options (stored "yes" / "no"); YES_NO_VARIES adds "It varies".
// choiceTable: a row per question, with the same answers as buttons in even
// columns (e.g. Infrastructure's costs); see below.
// choices.show((id, checked) => bool) hides the options it returns false for
// (what's ticked is kept), e.g. joining options outside the chosen tiers.
//
// max (checkbox lists): at most this many can be ticked; the rest are
// greyed out until one is unticked.
//
// groups: { items: [{ id, label, short?, description }], of: (opt) => group id,
// all?: { label, description } (the All tab's, under the tabs), selected?, onChange?(id) } — tabs on top of the list (All, then each
// group by its short name, with how many of its options have a badge, e.g.
// "(2)"; one line, scrolling sideways), showing only that group's options,
// the open group's name and description under them; the filter box (under
// the tabs, right above the list) searches within the group.
//
// badge: (opt) => ({ label, notes: [text] }) | null — a small lime chip next
// to an option's name (e.g. "Suggested"), with its notes under the
// description ("described") or in the pixel-plus details ("compact").

import { el, uid, chip as makeChip, richText } from "../dom.js";
import { tabRow } from "./tabs.js";

export const YES_NO = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];
export const YES_NO_VARIES = [...YES_NO, { id: "varies", label: "It varies" }];

/** Options with a badge first (loud ones, then quiet ones), then the rest, each A–Z (e.g. Suggested, Also fits, the rest). */
const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
export const suggestedFirst = (options, badge) => {
  const rank = (o) => { const b = badge(o); return b ? (b.quiet ? 1 : 0) : 2; };
  return [...options].sort((a, b) => rank(a) - rank(b) || byLabel(a, b));
};

export function scaleField({ legend, hint, options, value = null, range = false, layout = "described", clearable = true, onChange = () => {} }) {
  return renderChoices({
    type: "radio",
    legend,
    hint,
    options,
    selected: value,
    layout: range ? "range" : layout,
    listClass: range ? "scale scale-range" : layout === "buttons" ? "" : "scale",
    clearable,   // (off where an answer is always needed, e.g. a pick's step)
    onChange,
  });
}

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
  max = Infinity,
  hintBelow = false,
  badge = () => null,
  groups = null,
  onChange = () => {},
} = {}) {
  const group = uid("choice");
  const isChosen = (id) => (type === "radio" ? selected === id : selected.includes(id));
  const inputs = new Map();   // option id → its input
  const flags = new Map();    // option id → its flag line
  const subs = new Map();     // option id → { box, inputs } for follow-up choices

  const list = el("div", { className: `choices ${layout === "buttons" ? "choice-buttons " : ""}${listClass}`.trim() });

  for (const opt of options) {
    const id = uid("opt");
    const input = el("input", { type, id, name: group, value: opt.id, checked: isChosen(opt.id) });
    inputs.set(opt.id, input);
    input.addEventListener("change", () => {
      refreshBelow();
      refreshFlags();
      refreshSubs();
      refreshMax();
      if (clear) clear.hidden = !value();
      onChange(value());
    });

    const b = badge(opt);
    const chip = b ? makeChip(b.label, { quiet: b.quiet }) : null;
    const badgeNotes = (b?.notes || []).map((n) => el("p", { className: "choice-badge-note" }, ...richText(n)));

    let row;
    if (layout === "buttons" || layout === "range") {
      // buttons: a button-like label (the box itself is hidden, but still
      // takes the keyboard); range: the name under the radio button. The
      // description shows in a small box on hover or focus
      if (layout === "buttons") input.className = "choice-button-input";
      const tip = opt.description && !hintBelow ? el("span", { className: "choice-tip", id: uid("tip"), role: "tooltip", textContent: opt.description }) : null;
      if (tip) input.setAttribute("aria-describedby", tip.id);
      row = el("div", { className: `choice choice-${layout === "buttons" ? "button" : "range"}` }, input, el("label", { htmlFor: id }, opt.label), tip);
    } else if (layout === "compact") {
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
    row.dataset.label = opt.label.toLowerCase();
    row.dataset.id = opt.id;
    list.append(row);
  }

  // hintBelow: the chosen option's description, under the row
  const below = hintBelow ? el("p", { className: "field-hint choice-hint-below", id: uid("below") }) : null;
  const belowText = below ? el("span") : null;
  if (below) below.append(belowText, ...(hintBelow instanceof Node ? [" ", hintBelow] : []));
  function refreshBelow() {
    if (!below) return;
    const on = options.find((o) => inputs.get(o.id).checked);
    belowText.textContent = on?.description || "";
    below.hidden = !on?.description;
  }

  const clear = type === "radio" && clearable
    ? el("button", { type: "button", className: "link-button", textContent: "Clear", hidden: selected == null })
    : null;
  clear?.addEventListener("click", () => {
    set(null);
    onChange(null);
  });

  // the group tabs, on top of the list: which group's options show
  let shownGroup = groups?.selected ?? "all";
  const groupOf = new Map(groups ? options.map((o) => [o.id, groups.of(o)]) : []);
  const groupTabs = [{ id: "all", label: "All", name: groups?.all?.label || "All", description: groups?.all?.description || "" }, ...(groups?.items || []).map((g) => {
    const n = options.filter((o) => groupOf.get(o.id) === g.id && badge(o)).length;
    const name = g.short || g.label;
    return { ...g, name: g.label, label: n ? `${name} (${n})` : name, title: g.label };
  })];
  const groupHint = groups ? el("p", { className: "field-hint choice-group-hint" }) : null;
  const groupRow = groups ? tabRow({
    label: `Show ${filterLabel}`,
    tabs: groupTabs,
    selected: shownGroup,
    scroll: true,
    onSelect: (id) => {
      shownGroup = id;
      const g = groupTabs.find((t) => t.id === id);
      groupHint.replaceChildren(...(g?.description ? [el("b", { textContent: g.name }), ` ${g.description}`] : []));
      groupHint.hidden = !g?.description;
      groups.onChange?.(shownGroup);
      refreshRows();
    },
  }) : null;

  let search = null;
  if (filterable) {
    search = el("input", { type: "search", id: uid("filter"), placeholder: `Filter ${filterLabel}…`, autocomplete: "off" });
    search.addEventListener("input", () => filter(search.value));
  }

  // "Clear" sits beside the legend, small (or after the list if the legend is hidden)
  clear?.classList.add("legend-clear");
  const element = el("fieldset", { className: "field" },
    el("legend", { className: legendHidden ? "visually-hidden" : "mono-u" }, legend, legendHidden ? null : clear),
    hint ? el("p", { className: "field-hint", textContent: hint }) : null,
    ...before,
    groups ? el("div", { className: "choice-groups" }, groupRow.element, groupHint) : null,
    search ? el("label", { className: "visually-hidden", htmlFor: search.id, textContent: `Filter ${filterLabel}` }) : null,
    search,
    list,
    below,
    ...after,
    legendHidden ? clear : null,
  );

  function value() {
    const on = options.filter((o) => inputs.get(o.id).checked).map((o) => o.id);
    return type === "radio" ? on[0] ?? null : on;
  }

  /** Select exactly these (radio: one id or null). */
  function set(v) {
    for (const [id, input] of inputs) input.checked = type === "radio" ? v === id : v.includes(id);
    refreshBelow();
    if (clear) clear.hidden = !v;
    refreshFlags();
    refreshSubs();
    refreshMax();
  }

  /** Tick or untick one option (checkbox lists), without firing onChange. */
  function setOne(id, on) {
    inputs.get(id).checked = on;
    refreshFlags();
    refreshSubs();
    refreshMax();
  }

  /** The follow-up radio buttons for one option, shown while it's ticked. */
  function followUp(opt) {
    const name = uid("sub");
    const subInputs = new Map();
    const box = el("fieldset", { className: "choice-sub" },
      el("legend", { className: "visually-hidden", textContent: `${opt.label}: ${sub.legend || "details"}` }),
      el("div", { className: "scale" }, ...(typeof sub.options === "function" ? sub.options(opt) : sub.options).map((o) => {
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

  /** Choose a ticked option's follow-up answer from code (doesn't fire onChange). */
  function setSub(id, subId) {
    const radio = subs.get(id)?.inputs.get(subId);
    if (radio) radio.checked = true;
  }

  /** The follow-up answer for a ticked option (or an unticked one, evenIfOff), or null. */
  function subValue(id, { evenIfOff = false } = {}) {
    const s = subs.get(id);
    if (!s || (!evenIfOff && !inputs.get(id).checked)) return null;
    for (const [sid, radio] of s.inputs) if (radio.checked) return sid;
    return null;
  }

  function refreshFlags() {
    for (const [id, line] of flags) line.hidden = !flag.show(id, inputs.get(id).checked);
  }

  /** At the most allowed: the unticked ones can't be ticked. */
  function refreshMax() {
    if (max === Infinity) return;
    const full = value().length >= max;
    for (const input of inputs.values()) input.disabled = full && !input.checked;
  }
  refreshBelow();
  refreshFlags();
  refreshSubs();
  refreshMax();

  // which rows show: only the chosen group's (the group buttons, if any); within
  // it, what's typed in the filter box searches every option;
  // with nothing typed, show(visible) decides (e.g. only a chosen tier's)
  // while filtering, the closest matches come first: names starting with
  // what's typed, then a word in the name starting with it, then names
  // containing it, then matches only in the description
  let query = "";
  let visible = () => true;
  const rows = [...list.children];   // (in the given order, put back when the filter is cleared)
  let sorted = false;
  const rank = (row) => {
    const name = row.dataset.label;
    if (name.startsWith(query)) return 0;
    if (name.split(/[\s/–-]+/).some((w) => w.startsWith(query))) return 1;
    return name.includes(query) ? 2 : 3;
  };
  function refreshRows() {
    for (const row of rows) {
      const id = row.dataset.id;
      row.hidden = (shownGroup !== "all" && groupOf.get(id) !== shownGroup)   // (the group buttons, if any)
        || (query ? !row.dataset.search.includes(query) : !visible(id, inputs.get(id).checked));
    }
    if (query) list.append(...[...rows].sort((a, b) => rank(a) - rank(b)));
    else if (sorted) list.append(...rows);   // (only after a filter: moving rows can drop the focus)
    sorted = Boolean(query);
  }

  groupRow?.start();   // (the open group: its hint, and only its rows)

  /** Show only options whose name or description contains `text` (searches the group shown, or all). */
  function filter(text) {
    query = text.trim().toLowerCase();
    refreshRows();
  }

  /** With no filter typed: show only the options where visible(id, checked) is true. */
  function show(fn) {
    visible = fn;
    refreshRows();
  }

  return { element, value, set, setOne, filter, show, subValue, setSub };
}

/**
 * Choices as a table: a row per question, and the same answers for every row
 * as buttons in even columns (e.g. Infrastructure's costs). An unanswered row
 * has nothing selected; the last button (`none`, e.g. "Not sure") clears a
 * row, and shows as selected in a muted tint (it means "no answer"). When
 * the table itself is too narrow for the buttons (e.g. on a phone), they
 * become radio buttons under angled column headings, to stay compact. Each row is its own radio group;
 * the buttons are the shared button choices (.choice-button), with each
 * answer's description in its hover bubble.
 *
 *   const t = choiceTable({ legend, hint, rows: [{ id, label }], options: [{ id, label, description }],
 *                           values: { rowId: optionId }, onChange: (rowId, optionId) => {} });
 *   t.row(rowId).value() → optionId | null;  t.row(rowId).set(optionId | null)  (fires nothing)
 */
export function choiceTable({ legend, legendHidden = false, hint, rows, options, values = {}, none = "Not sure", onChange = () => {} }) {
  const answers = [...options, { id: "", label: none }];   // "" = no answer
  const radios = new Map();   // row id → its radio buttons
  const body = el("tbody", {}, ...rows.map((r) => {
    const name = uid("row");
    const cells = answers.map((o) => {
      const id = uid("opt");
      const input = el("input", { type: "radio", name, id, value: o.id, className: "choice-button-input", checked: values[r.id] != null && values[r.id] === o.id });
      input.setAttribute("aria-label", `${r.label}: ${o.label}`);
      input.addEventListener("change", () => onChange(r.id, input.value || null));
      const tip = o.description ? el("span", { className: "choice-tip", role: "tooltip", textContent: o.description }) : null;
      return { input, cell: el("td", {}, el("div", { className: "choice-buttons" }, el("div", { className: `choice choice-button${o.id ? "" : " choice-button-none"}` }, input, el("label", { htmlFor: id, textContent: o.label }), tip))) };
    });
    radios.set(r.id, cells.map((c) => c.input));
    return el("tr", {}, el("th", { scope: "row", textContent: r.label }), ...cells.map((c) => c.cell));
  }));
  // the column headings: shown on narrow screens only (the buttons say their answer)
  const head = el("thead", {}, el("tr", {},
    el("td"),
    ...answers.map((o) => el("th", { scope: "col", title: o.description || "" }, el("span", { textContent: o.label })))));
  const row = (id) => ({
    value: () => radios.get(id).find((i) => i.checked)?.value || null,
    set: (v) => { for (const i of radios.get(id)) i.checked = v != null && i.value === v; },   // (no answer: nothing selected)
  });
  return {
    element: el("fieldset", { className: "field" },
      el("legend", { className: legendHidden ? "visually-hidden" : "mono-u", textContent: legend }),
      hint ? el("p", { className: "field-hint", textContent: hint }) : null,
      el("div", { className: "choice-table-box" }, el("table", { className: "choice-table" }, head, body))),
    row,
    value: () => Object.fromEntries(rows.map((r) => [r.id, row(r.id).value()])),
  };
}
