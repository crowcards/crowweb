// Small view preferences remembered in this browser, e.g. which sections of
// a module someone left open. Not part of the card: nothing here is saved to
// the server or shared. Kept under one localStorage key; if storage is
// blocked, preferences simply aren't remembered.

const KEY = "crow-prefs";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

/** The remembered value for `name`, or `fallback` if there isn't one. */
export function getPref(name, fallback) {
  const all = readAll();
  return name in all ? all[name] : fallback;
}

export function setPref(name, value) {
  const all = readAll();
  all[name] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
