// Edit some shown text in place: "Edit" beside it opens a field in its
// spot, and a pixel ✓ closes the field again. Used for a custom
// module's name and description (the page's title and lede).
//
//   editInPlace({ display: titleEl, slot: titleToolsEl, field: nameField, label: "module name" });
//
// The page keeps `display` up to date as the field changes (it saves as
// usual); this only swaps between showing the text and editing it.

import { el, button } from "../dom.js";

export function editInPlace({ display, slot, field, label }) {
  const editButton = button("Edit", "link-button", () => open(true));   // "Edit", as in folded rows
  editButton.setAttribute("aria-label", `Edit the ${label}`);
  const done = button("", "icon-button", () => open(false));
  done.append(el("span", { className: "pixel-tick" }));
  done.setAttribute("aria-label", `Done editing the ${label}`);
  const editor = el("div", { className: "inline-edit", hidden: true }, field.element, done);

  function open(on) {
    display.hidden = on;
    editButton.hidden = on;
    editor.hidden = !on;
    if (on) field.focus();
    else editButton.focus();
  }

  slot.replaceChildren(editButton, editor);
  return { open: () => open(true) };
}
