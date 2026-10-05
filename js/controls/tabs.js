// Tabs: one box with a row of tabs, showing one panel at a time.
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

export function tabBox({ label, key, tabs, onSelect = () => {} }) {
  const prefKey = `tab:${key}`;
  const id = uid("tabs");
  const list = el("div", { className: "tab-list" });
  list.setAttribute("role", "tablist");
  if (label) list.setAttribute("aria-label", label);

  const parts = tabs.map((t) => {
    const tab = el("button", { type: "button", className: "tab", id: `${id}-${t.id}`, textContent: t.label });
    const panel = el("div", { className: "tab-panel", id: `${id}-${t.id}-panel` }, ...t.children);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("click", () => select(t.id));
    return { id: t.id, tab, panel };
  });

  function select(tabId, { focus = false } = {}) {
    const chosen = parts.find((p) => p.id === tabId) || parts[0];
    for (const p of parts) {
      const on = p === chosen;
      p.tab.setAttribute("aria-selected", String(on));
      p.tab.tabIndex = on ? 0 : -1;   // one tab stop for the row; arrows move within it
      p.panel.hidden = !on;
    }
    if (focus) chosen.tab.focus();
    setPref(prefKey, chosen.id);
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
  select(getPref(prefKey, tabs[0].id));
  return {
    element: el("div", { className: "tab-box" }, list, ...parts.map((p) => p.panel)),
    select,
  };
}
