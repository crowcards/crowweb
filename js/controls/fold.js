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

import { el, uid } from "../dom.js";
import { getPref, setPref } from "../prefs.js";

export function foldSection({ title, key, level = 2, children = [] }) {
  const prefKey = `fold:${key}`;
  const open = getPref(prefKey, false);

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

  return el("section", { className: `fold fold-${level}` }, el(`h${level}`, {}, toggle), body);
}
