// A text box that suggests matches as you type: arrow keys or the mouse to
// pick one. Used for countries, platforms, protocols and tool names.
//
//   const where = suggestField({
//     label: "Where your servers are",
//     items: [{ id: "DE", label: "Germany", aliases: [{ name: "Deutschland" }], note: "region" }],
//     multiple: true,          // several picks, shown as tags with ×; value() → ids
//     allowCustom: false,      // also accept typed text that isn't in the list
//     values: ["DE"],          // multiple: what's saved   (single: value: "DE" or "typed text")
//     onCommit,
//   });
//
// Single mode (multiple: false) is a text box with suggestions: value() →
// { id, text } — id is the picked item's id, or null for typed text (only
// kept when allowCustom); stored() → what a card keeps: the id if it's
// listed, else the typed text, else null (storedValue(v) for a value). onChange({ id, text }) hears about every change,
// picked or typed. browse: true also shows the whole list (to scroll through)
// when the box is clicked or ↓ is pressed, before anything is typed — for
// short lists people won't know ahead of time, like the tools in a category.
// setItems(list) swaps what's suggested (e.g. once a category is chosen);
// setHint(text) changes the hint; hintTip: true shows it behind a small "i"
// beside the label instead of under it (dom.js infoTip), e.g. Locations. selectField (fields.js) is built on this:
// a dropdown is a browsable list without typed values.
//
// Matching ignores capitals, accents and punctuation ("cote divoire" finds
// Côte d'Ivoire) and checks each item's label and aliases. Exact matches come
// first, then names starting with what was typed, then words starting with
// it, then anything containing it. An alias match shows as "matches …",
// except aliases marked disputed, which find the item but aren't shown.

import { el, uid, infoTip } from "../dom.js";
import { tagList } from "./tags.js";

const MAX_RESULTS = 8;

const norm = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const squash = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const aliasesOf = (item) => (item.aliases || []).map((a) => (typeof a === "string" ? { name: a } : a));

/** Items matching `query`, best first: [{ item, via }] (via = the alias that matched, if shown). */
function matchItems(items, query) {
  const q = squash(query);
  if (!q) return [];
  const results = [];
  for (const item of items) {
    let best = null;
    for (const [name, alias] of [[item.label, null], ...aliasesOf(item).map((a) => [a.name, a])]) {
      const n = squash(name);
      const words = norm(name).split(/[^a-z0-9]+/).filter(Boolean);
      const score = n === q ? 0 : n.startsWith(q) ? 1 : words.some((w) => w.startsWith(q)) ? 2 : n.includes(q) ? 3 : null;
      if (score == null) continue;
      if (!best || score < best.score || (score === best.score && best.alias && !alias)) best = { score, alias };
    }
    if (best) results.push({ item, score: best.score, via: best.alias && !best.alias.disputed ? best.alias.name : null });
  }
  return results
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .slice(0, MAX_RESULTS);
}

/** A single value as a card stores it: the listed item's id, or the typed text, or null. */
export const storedValue = (v) => v?.id || v?.text || null;

export function suggestField({
  label,
  hint,
  items,
  multiple = false,
  allowCustom = false,
  values = [],
  value = null,
  placeholder = "",
  browse = false,
  hintTip = false,
  onChange = () => {},
  onCommit = () => {},
} = {}) {
  let byId = new Map(items.map((i) => [i.id, i]));
  const labelOf = (v) => byId.get(v)?.label ?? v;
  const id = uid("suggest");
  const listId = `${id}-list`;
  // the hint: under the label, or behind an "i" beside it (either way the field points to it)
  const tip = hintTip && hint ? infoTip(hint, `${id}-hint`) : null;
  const hintEl = tip ? tip.querySelector(".choice-tip") : el("p", { className: "field-hint", id: `${id}-hint`, textContent: hint || "", hidden: !hint });
  const labelEl = el("label", { className: "mono-u", htmlFor: id, textContent: label });

  const input = el("input", { type: "text", id, autocomplete: "off", placeholder });
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.setAttribute("aria-describedby", hintEl.id);
  const list = el("ul", { className: "suggest-list plain-list", id: listId, hidden: true });
  list.setAttribute("role", "listbox");

  // what's chosen: multiple → array of ids / typed strings; single → { id, text }
  const picks = multiple ? [...values] : null;
  let single = multiple ? null : (value == null ? { id: null, text: "" } : { id: byId.has(value) ? value : null, text: labelOf(value) });
  if (!multiple) input.value = single.text;
  let chosen = single ? { ...single } : null;   // single mode: what was last chosen (and saved)

  const tags = multiple ? tagList({
    ariaLabel: label,
    onRemove: (v) => {
      picks.splice(picks.indexOf(v), 1);
      renderTags();
      input.focus();
      onCommit();
    },
  }) : null;
  const renderTags = () => tags?.render(picks.map((v) => ({ id: v, label: labelOf(v) })));
  renderTags();

  // ── the suggestion list ─────────────────────────────────────
  let shown = [];
  let active = -1;

  function open() {
    // nothing typed: the whole list if browsing, otherwise nothing
    // browsing: the whole list when nothing's typed, or when the box just
    // shows what's already picked (so clicking a filled box still shows everything)
    const typed = input.value.trim() && !(single?.id && input.value === single.text);
    const matches = typed ? matchItems(items, input.value) : browse ? items.map((item) => ({ item })) : [];
    shown = matches.filter(({ item }) => !(multiple && picks.includes(item.id)));
    const current = single?.id ? shown.findIndex(({ item }) => item.id === single.id) : -1;
    active = current >= 0 ? current : shown.length ? 0 : -1;   // start on what's picked
    list.replaceChildren(...shown.map(({ item, via }, i) => {
      const li = el("li", { id: `${id}-opt-${i}` },
        el("span", { textContent: item.label }),
        via ? el("span", { className: "suggest-note", textContent: ` matches ${via}` }) : null,
        item.note ? el("span", { className: "suggest-note", textContent: ` ${item.note}` }) : null,
      );
      li.setAttribute("role", "option");
      li.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus in the box
      li.addEventListener("click", () => choose(item));
      return li;
    }));
    list.hidden = !shown.length;
    input.setAttribute("aria-expanded", String(!list.hidden));
    highlight();
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", list.children[active].id);
      list.children[active].scrollIntoView?.({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  function choose(item) {
    if (multiple) {
      if (!picks.includes(item.id)) picks.push(item.id);
      input.value = "";
      renderTags();
    } else {
      single = { id: item.id, text: item.label };
      input.value = item.label;
      chosen = { ...single };
      onChange({ ...single });
    }
    close();
    onCommit();
  }

  /** Typed text that isn't a list item: kept only when allowCustom. */
  function chooseTyped() {
    const text = input.value.trim();
    if (multiple) {
      if (allowCustom && text && !picks.some((p) => norm(labelOf(p)) === norm(text))) {
        picks.push(text);
        renderTags();
        onCommit();
      }
      input.value = "";
    } else {
      const exact = matchItems(items, text).find((r) => r.score === 0);
      if (exact) return choose(exact.item);
      if (!text) single = { id: null, text: "" };
      else if (allowCustom) single = { id: null, text };
      else { single = { ...chosen }; input.value = single.text; }   // not in the list: put back what was chosen
      if (single.text !== chosen.text) {
        chosen = { ...single };
        onChange({ ...single });
        onCommit();
      }
    }
    close();
  }

  input.addEventListener("input", () => {
    if (!multiple && single.id && input.value !== single.text) single = { id: null, text: input.value };
    open();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (list.hidden) open();
      if (!shown.length) return;
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!list.hidden && active >= 0) choose(shown[active].item);
      else chooseTyped();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Backspace" && multiple && !input.value && picks.length) {
      picks.pop();
      renderTags();
      onCommit();
    }
  });
  if (browse) {
    input.addEventListener("focus", () => { if (!input.value.trim()) open(); });
    input.addEventListener("click", () => { if (list.hidden) open(); });
  }
  input.addEventListener("blur", () => {
    if (multiple && !allowCustom) input.value = "";
    else if (input.value.trim() !== (multiple ? "" : chosen.text)) chooseTyped();
    close();
  });

  const element = el("div", { className: "field" },
    tip ? el("div", { className: "field-label" }, labelEl, tip) : labelEl,
    tip ? null : hintEl,
    tags?.element,
    el("div", { className: browse ? "suggest suggest-browse" : "suggest" }, input, list),
  );

  return {
    element,
    value: () => (multiple ? [...picks] : { ...single }),
    stored: () => storedValue(single),
    /** Single mode: set the text and id from outside (e.g. filling in a tool's type). */
    set: (v) => {
      single = v == null ? { id: null, text: "" } : { id: byId.has(v) ? v : null, text: labelOf(v) };
      input.value = single.text;
      chosen = { ...single };
    },
    /** Suggest from a different list from now on; what's chosen stays as it is. */
    setItems: (list) => {
      items = list;
      byId = new Map([...byId, ...list.map((i) => [i.id, i])]);   // keep earlier items' labels
    },
    setHint: (text) => { hintEl.textContent = text || ""; if (!tip) hintEl.hidden = !text; },
    focus: () => input.focus(),
  };
}
