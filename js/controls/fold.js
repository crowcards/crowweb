// A collapsible section: an orange heading with a pixel plus that opens and
// closes what's under it. Used for the sections inside a module (e.g.
// Processes' four). Closed the first time someone sees it; after that it
// stays the way they left it (remembered in this browser, see js/prefs.js).
//
//   container.append(foldSection({ title: "Conflict management", key, children: [ … ] }));
//
// `key` names the section for remembering, e.g. "crd_x:processes:conflict".
// `level` is the heading level: 2 for a module's sections (default), 3 for
// groups inside a section (e.g. each rule type inside Rules → Behavior).
// foldable: false starts it as a plain heading, always open, until
// section.enableFold() makes it collapsible (left open), e.g. once the first
// answer in it is given.

import { el, uid } from "../dom.js";
import { wrapLetters } from "../letters.js";
import { getPref, setPref } from "../prefs.js";

/**
 * A module's sections, each a fold with a column of fields:
 *   const section = sectionMaker(stateKey);
 *   section("costs", "Costs", field, otherField, someElement)
 * Fields can be controls (with .element) or plain elements.
 */
export const sectionMaker = (stateKey) => (name, title, ...parts) => foldSection({
  title,
  key: `${stateKey}:${name}`,
  children: [el("div", { className: "fields" }, ...parts.map((p) => p.element ?? p))],
});

export function foldSection({ title, key, level = 2, foldable = true, actions = [], children = [] }) {
  const prefKey = `fold:${key}`;
  const open = foldable ? getPref(prefKey, false) : true;

  const body = el("div", { className: "fold-body", id: uid("fold"), hidden: !open }, ...children);
  const toggle = el("button", { type: "button", className: "pixel-toggle with-label", textContent: title });
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-controls", body.id);
  toggle.addEventListener("click", () => {
    const nowOpen = body.hidden;
    body.hidden = !nowOpen;
    toggle.setAttribute("aria-expanded", String(nowOpen));
    setPref(prefKey, nowOpen);
  });

  const heading = el(`h${level}`, {}, foldable ? toggle : title);
  // section headings (level 2) light up letter by letter, like the site's
  // other Argent headings; smaller headings change colour as a whole
  // (the letters go in one span inside the button, so the button's gap only
  // sits between the plus and the title; the button keeps the title as its name)
  if (level === 2) {
    const letters = el("span", { textContent: title });
    toggle.replaceChildren(letters);
    wrapLetters(letters);   // (once inside the button, which names it)
    toggle.setAttribute("aria-label", title);
    if (!foldable) wrapLetters(heading);
  }
  // actions: small buttons beside the heading (e.g. Rules' "Select all / Clear")
  const head = actions.length ? el("div", { className: "fold-head" }, heading, el("span", { className: "fold-actions" }, ...actions)) : heading;
  const section = el("section", { className: `fold fold-${level}` }, head, body);
  section.enableFold = () => {
    if (heading.contains(toggle)) return;
    heading.replaceChildren(toggle);
    toggle.setAttribute("aria-expanded", "true");
    setPref(prefKey, true);
  };
  return section;
}
