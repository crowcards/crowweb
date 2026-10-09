// Tabs: one box with a row of tabs, showing one panel at a time (tabBox);
// or just the row (tabRow), e.g. to filter a list.
//
//   const box = tabBox({
//     label: "How your structure is used",   // for screen readers
//     key: "processes:structure",            // remembers the open tab (prefs)
//     tabs: [{ id: "change", label: "Change", children: [...] }, …],
//   });
//   container.append(box.element);
//   box.select("moderation");
//
// onSelect(id) hears which tab is open (also the first time it's drawn).
// The arrow keys move between tabs (Home / End for the first and last), as
// people expect from tabs. Which tab was open is remembered in this browser.

import { el, uid } from "../dom.js";
import { getPref, setPref } from "../prefs.js";

/**
 * Just the row of tabs, without panels: e.g. to filter one list (choices'
 * groups). scroll: one line that scrolls sideways instead of wrapping.
 * key: remember the open tab in this browser.
 *   const row = tabRow({ label, tabs: [{ id, label, title? }], selected, onSelect, scroll: true });
 */
export function tabRow({ label, key, tabs, selected, scroll = false, onSelect = () => {}, idPrefix = uid("tabs") }) {
  const prefKey = key && `tab:${key}`;
  const list = el("div", { className: scroll ? "tab-list tab-list-scroll" : "tab-list" });
  list.setAttribute("role", "tablist");
  if (label) list.setAttribute("aria-label", label);
  const parts = tabs.map((t) => {
    const tab = el("button", { type: "button", className: "tab", id: `${idPrefix}-${t.id}`, textContent: t.label });
    if (t.title) tab.title = t.title;
    tab.setAttribute("role", "tab");
    tab.addEventListener("click", () => select(t.id));
    return { id: t.id, tab };
  });

  function select(tabId, { focus = false, remember = true } = {}) {
    const chosen = parts.find((p) => p.id === tabId) || parts[0];
    for (const p of parts) {
      const on = p === chosen;
      p.tab.setAttribute("aria-selected", String(on));
      p.tab.tabIndex = on ? 0 : -1;   // one tab stop for the row; arrows move within it
    }
    if (focus) chosen.tab.focus();
    if (scroll) chosen.tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (remember && prefKey) setPref(prefKey, chosen.id);
    onSelect(chosen.id);
  }

  list.addEventListener("keydown", (e) => {
    const at = parts.findIndex((p) => p.tab === document.activeElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: parts.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    select(parts[(to + parts.length) % parts.length].id, { focus: true });
  });

  list.append(...parts.map((p) => p.tab));
  const first = prefKey ? getPref(prefKey, selected ?? tabs[0].id) : selected ?? tabs[0].id;
  // (drawn in order; the first selection runs once the row is in the page's hands)
  return { element: list, select, tabOf: (tabId) => parts.find((p) => p.id === tabId)?.tab, start: () => select(first, { remember: false }) };
}

export function tabBox({ label, key, tabs, onSelect = () => {} }) {
  const id = uid("tabs");
  const panels = new Map(tabs.map((t) => [t.id, el("div", { className: "tab-panel", id: `${id}-${t.id}-panel` }, ...t.children)]));
  const row = tabRow({
    label, key, tabs, idPrefix: id,
    onSelect: (tabId) => {
      for (const [pid, panel] of panels) panel.hidden = pid !== tabId;
      onSelect(tabId);
    },
  });
  for (const t of tabs) {
    const tab = row.tabOf(t.id), panel = panels.get(t.id);
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
  }
  row.start();
  return {
    element: el("div", { className: "tab-box" }, row.element, ...panels.values()),
    select: row.select,
  };
}
