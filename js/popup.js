// The shared pop-up box (the <dialog class="popup"> in make.html): a message
// on top of the page, closed with its X, the Escape key, or a click outside.
//
//   showPopup({ title: "Card not found", message: "…" })
//
// `message` is plain text; pass `body` (a DOM node) instead for richer
// content such as buttons; tone: "error" outlines it in pink. Returns a
// promise that resolves when it closes.
//
// confirmPopup({ title, message, confirmLabel }) asks a yes / no question
// in the same box (instead of the browser's own confirm()): resolves true
// for the confirm button, false for Cancel or closing it. `message` can be
// a list of paragraphs.

import { el, button } from "./dom.js";

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

export function showPopup({ title = "", message = "", body = null, tone = null } = {}) {
  const d = popup();
  d.classList.toggle("is-error", tone === "error");   // an error: outlined in pink
  const titleEl = d.querySelector(".popup-title");
  titleEl.textContent = title;
  titleEl.hidden = !title;
  d.querySelector(".popup-body").replaceChildren(body || el("p", { textContent: message }));
  if (d.open) d.close();
  d.showModal();
  return new Promise((resolve) => d.addEventListener("close", resolve, { once: true }));
}

export function confirmPopup({ title, message, confirmLabel = "OK", cancelLabel = "Cancel" }) {
  let confirmed = false;
  const yes = button(confirmLabel, "button button-small", () => { confirmed = true; closePopup(); });
  const closed = showPopup({
    title,
    body: el("div", {},
      ...[].concat(message).map((text) => el("p", { textContent: text })),
      el("p", { className: "button-row" }, yes, button(cancelLabel, "link-button", closePopup))),
  });
  yes.focus();
  return closed.then(() => confirmed);
}
