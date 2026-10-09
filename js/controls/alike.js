// "More like this / Try something new": a strip of options to add, for the
// one selected last (js/recommend.js alike). Shown under the tags of a pick
// list and of Basics' values, and in a pick's pop-up; clicking one adds it
// (and the strip then shows what's like that one).
//
//   const strip = alikeStrip({ labelOf: (id) => …, onAdd: (id) => … });
//   strip.show("Sociocracy", { like: [id], fresh: [id] });   strip.hide();
//   strip.show(name, picks, { full: "Unselect one to add another." })   → shown, but nothing can be added

import { el, button } from "../dom.js";

export function alikeStrip({ labelOf, onAdd }) {
  const element = el("div", { className: "alike", hidden: true });
  element.setAttribute("aria-live", "polite");
  const row = (title, ids, full) => (ids.length
    ? el("div", { className: "alike-row" },
      el("span", { className: "mono-u summary-label", textContent: title }),
      ...ids.map((id) => {
        const add = button(`+ ${labelOf(id)}`, "tag tag-add", () => onAdd(id));
        add.setAttribute("aria-label", `Add ${labelOf(id)}`);
        add.disabled = Boolean(full);
        return add;
      }))
    : null);
  return {
    element,
    show(name, { like, fresh }, { full } = {}) {
      element.replaceChildren(...[
        row(`More like ${name}`, like, full),
        row("Try something new", fresh, full),
        full ? el("p", { className: "field-hint", textContent: full }) : null,
      ].filter(Boolean));
      element.hidden = !element.children.length;
    },
    hide: () => { element.hidden = true; },
  };
}
