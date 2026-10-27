// "More like this / Try something new": a strip of options to add
// (js/recommend.js alike): more like the one selected last, and something new
// from everything selected, each with its reason in the shared hover bubble.
// Shown under the tags of a pick list and of Basics' values, and in a pick's
// pop-up; clicking one adds it (and "More like this" then follows that one).
//
//   const strip = alikeStrip({ labelOf: (id) => …, onAdd: (id) => … });
//   strip.show("Sociocracy", { like: [{ id, why }], fresh: [{ id, why }] });   strip.hide();
//   strip.show(null, { like: [], fresh })   → only "Try something new"
//   strip.show(name, picks, { full: "Unselect one to add another." })   → shown, but nothing can be added

import { el, button, uid } from "../dom.js";

export function alikeStrip({ labelOf, onAdd }) {
  const element = el("div", { className: "alike", hidden: true });
  element.setAttribute("aria-live", "polite");
  const row = (title, picks, full) => (picks.length
    ? el("div", { className: "alike-row" },
      el("span", { className: "mono-u summary-label", textContent: title }),
      ...picks.map(({ id, why }) => {
        const add = button(`+ ${labelOf(id)}`, "tag tag-add", () => onAdd(id));
        add.setAttribute("aria-label", `Add ${labelOf(id)}`);
        if (why) {
          const tip = el("span", { className: "choice-tip", id: uid("alike-why"), role: "tooltip", textContent: why });
          add.append(tip);
          add.setAttribute("aria-describedby", tip.id);
        }
        add.disabled = Boolean(full);
        return add;
      }))
    : null);
  return {
    element,
    show(name, { like, fresh }, { full } = {}) {
      element.replaceChildren(...[
        name ? row(`More like ${name}`, like, full) : null,
        row("Try something new", fresh, full),
        full ? el("p", { className: "field-hint", textContent: full }) : null,
      ].filter(Boolean));
      element.hidden = !element.children.length;
    },
    hide: () => { element.hidden = true; },
  };
}
