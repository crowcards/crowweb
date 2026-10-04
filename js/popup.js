// The shared pop-up box (the <dialog class="popup"> in make.html): a message
// on top of the page, closed with its X, the Escape key, or a click outside.
//
//   showPopup({ title: "Card not found", message: "…" })
//
// `message` is plain text; pass `body` (a DOM node) instead for richer
// content such as buttons. Returns a promise that resolves when it closes.

import { el } from "./dom.js";

// The <dialog> is looked up the first time a pop-up is used (not when this
// file loads), so pages and tests without one can still import it.
let dialog = null;
function popup() {
  if (dialog) return dialog;
  dialog = document.getElementById("popup");
  dialog.querySelector(".popup-close").addEventListener("click", () => dialog.close());
  // a click on the dimmed backdrop closes it (the dialog has no padding of its
  // own, so any click whose target is the dialog itself landed outside the box)
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  return dialog;
}

/** Close the pop-up, if it's open. */
export function closePopup() {
  if (dialog?.open) dialog.close();
}

export function showPopup({ title = "", message = "", body = null } = {}) {
  const d = popup();
  const titleEl = d.querySelector(".popup-title");
  titleEl.textContent = title;
  titleEl.hidden = !title;
  d.querySelector(".popup-body").replaceChildren(body || el("p", { textContent: message }));
  if (d.open) d.close();
  d.showModal();
  return new Promise((resolve) => d.addEventListener("close", resolve, { once: true }));
}
