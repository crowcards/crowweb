// Which card this browser is editing: its ID and secret.
//
// By default they're kept for this tab only (sessionStorage): a refresh keeps
// you in the editor, closing the tab forgets them. With "Remember this card
// on this device" ticked they're also kept in localStorage until "Forget".
//
// `confirmed` records that the person ticked "I've saved my key", so a
// refresh on the save-your-key screen brings them back to it rather than
// skipping past it.
//
// Storage can be blocked (private windows, strict settings), so every access
// is wrapped: if it fails, the card simply isn't remembered.

const KEY = "crow-card";

function read(store) {
  try {
    const v = JSON.parse(store.getItem(KEY));
    return v?.cardId && v?.secret ? v : null;
  } catch {
    return null;
  }
}

function write(store, value) {
  try {
    if (value) store.setItem(KEY, JSON.stringify(value));
    else store.removeItem(KEY);
  } catch {}
}

/**
 * The card being edited, or null: { cardId, secret, confirmed, remembered }.
 * `remembered` says whether it's kept on this device.
 */
export function loadSession() {
  const tab = read(sessionStorage);
  const device = read(localStorage);
  const s = tab || device;
  if (!s) return null;
  return {
    cardId: s.cardId,
    secret: s.secret,
    confirmed: s.confirmed !== false,   // older entries without the flag count as confirmed
    remembered: !!device && device.cardId === s.cardId,
  };
}

/** Start (or switch to) editing a card. */
export function saveSession({ cardId, secret, confirmed = true }, { remember = false } = {}) {
  const value = { cardId, secret, confirmed };
  write(sessionStorage, value);
  write(localStorage, remember ? value : null);
}

/** Turn "remember on this device" on or off for the current card. */
export function setRemembered(remember) {
  const s = loadSession();
  if (s) saveSession(s, { remember });
}

/** Mark the current card's key as saved by the person. */
export function confirmKey({ remember = false } = {}) {
  const s = loadSession();
  if (s) saveSession({ ...s, confirmed: true }, { remember });
}

/** Forget the card everywhere in this browser. */
export function forgetSession() {
  write(sessionStorage, null);
  write(localStorage, null);
}
