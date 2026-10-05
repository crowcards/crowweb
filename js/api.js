// The editor's only line to the backend: the three Cloud Functions in
// functions/index.js. Everything goes through them — the browser never
// reads or writes Firestore directly (the security rules deny it).
//
// Served from localhost (firebase emulators:start), it talks to the local
// emulator instead, so test cards never touch the real database.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

// Public project identifiers, not secrets: every Firebase web app ships them.
const firebaseConfig = {
  apiKey: "AIzaSyDrZhudhMJOmIpAkRfnRYnYQUyzjqlTYlg",
  authDomain: "cos-princeton-hci-crow.firebaseapp.com",
  projectId: "cos-princeton-hci-crow",
  appId: "1:1006402724320:web:0b9ee39ba86c13d7f64b85",
};

const functions = getFunctions(initializeApp(firebaseConfig));

export const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocal) connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const call = (name) => {
  const fn = httpsCallable(functions, name);
  return async (data) => (await fn(data)).data;
};

const _createCard = call("createCard");
const _getCard = call("getCard");
const _updateCard = call("updateCard");

/** Make a new empty card. Returns { cardId, secret } — the only time the secret is ever sent. */
export const createCard = () => _createCard();

/** Fetch a card. Returns the card object. */
export const getCard = async (cardId, secret) => (await _getCard({ cardId, secret })).card;

/**
 * Merge `updates` (e.g. { basics: {...} }) into a card. Returns
 * { card, updatedAt }: the card after the save, and this save's timestamp.
 *
 * Pass `ifUpdatedAt` (the card's updatedAt as last seen) to refuse the save
 * if someone else has changed the card since; errorKind() calls that a
 * "conflict".
 */
export const updateCard = (cardId, secret, updates, { ifUpdatedAt, reset } = {}) =>
  _updateCard({ cardId, secret, updates, ifUpdatedAt, ...(reset ? { reset } : {}) });
// reset: ["rules", …] puts those parts back as they are on a new, empty card
// (the server's makeEmptyCard decides what empty is).

/**
 * Sort a failed call into what the editor needs to know:
 *   "no-card"  — no card has this ID (stop, ask the person)
 *   "bad-key"  — the card exists but the secret doesn't match (stop, ask)
 *   "conflict" — the card changed elsewhere since it was loaded (stop, ask)
 *   "offline"  — network trouble (worth retrying)
 *   "other"    — anything else
 */
export function errorKind(err) {
  const code = String(err?.code || "").replace(/^functions\//, "");
  if (code === "not-found") return "no-card";
  if (code === "permission-denied") return "bad-key";
  if (code === "failed-precondition") return "conflict";
  if (code === "unavailable" || code === "deadline-exceeded") return "offline";
  if (code === "internal" && !navigator.onLine) return "offline";   // how the SDK reports a dropped connection
  return "other";
}
