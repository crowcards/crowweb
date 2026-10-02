// The shared pop-up box (the <dialog class="popup"> in make.html): a message
// on top of the page, closed with its X, the Escape key, or a click outside.
//
//   showPopup({ title: "Card not found", message: "…" })
//
// `message` is plain text; pass `body` (a DOM node) instead for richer
// content such as buttons. Returns a promise that resolves when it closes.

const dialog = document.getElementById("popup");
const titleEl = dialog.querySelector(".popup-title");
const bodyEl = dialog.querySelector(".popup-body");

dialog.querySelector(".popup-close").addEventListener("click", () => dialog.close());

// a click on the dimmed backdrop closes it (the dialog has no padding of its
// own, so any click whose target is the dialog itself landed outside the box)
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close();
});

/** Close the pop-up, if it's open. */
export function closePopup() {
  if (dialog.open) dialog.close();
}

export function showPopup({ title = "", message = "", body = null } = {}) {
  titleEl.textContent = title;
  titleEl.hidden = !title;
  bodyEl.replaceChildren(body || Object.assign(document.createElement("p"), { textContent: message }));
  if (dialog.open) dialog.close();
  dialog.showModal();
  return new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }));
}
