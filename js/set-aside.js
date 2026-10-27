// Answers set aside: what someone entered and then switched away from (an
// item unselected, a Yes changed to No, a field's kind changed). A card's
// modules hold only what's true now; what's set aside is kept in the
// editor-only part of the card (card.editor.setAside), so it comes back if
// they switch back, even after a reload, but is never exported or shown
// publicly.
//
//   card.editor.setAside = { "<part>.<key>": value, … }
//   e.g. "membership.joining.closedNote": "Full until spring"
//        "membership.joining.ways:pay_to_join": { note: "£5 a year" }
//        "federation.bridging.protocols": ["AT Protocol"]
//
// A module's form gets its own part's entries (prefix dropped) as
// `setAside` (an asideOf() reader), and returns what it sets aside now from
// form.setAside() → { key: value }; make.js keeps the store in step. An
// entry goes away when its answer is back in the module.

/** Is there anything worth keeping? */
const worthKeeping = (v) => v != null && v !== "" && !(Array.isArray(v) && !v.length)
  && !(typeof v === "object" && !Array.isArray(v) && !Object.values(v).some(worthKeeping));

/**
 * One part's entries, to read from: get(key) → the value; list(prefix) →
 * [{ id, ...value }] for keys "prefix<id>" (e.g. list("ways:") for picks).
 */
export function asideOf(store = {}, part) {
  const p = `${part}.`;
  const mine = Object.fromEntries(Object.entries(store).filter(([k]) => k.startsWith(p)).map(([k, v]) => [k.slice(p.length), v]));
  return {
    get: (key) => mine[key],
    list: (prefix) => Object.entries(mine).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ id: k.slice(prefix.length), ...v })),
  };
}

/** A pick list's remembered picks ([{ id, note, … }]) as entries "prefix<id>": { note, … }. */
export const picksAside = (prefix, picks) => Object.fromEntries(picks.map(({ id, ...rest }) => [`${prefix}${id}`, rest]));

/** The store with one part's entries replaced by `entries` (empty ones left out). */
export function withAside(store = {}, part, entries = {}) {
  const p = `${part}.`;
  return {
    ...Object.fromEntries(Object.entries(store).filter(([k]) => !k.startsWith(p))),
    ...Object.fromEntries(Object.entries(entries).filter(([, v]) => worthKeeping(v)).map(([k, v]) => [`${p}${k}`, v])),
  };
}

/** The store without any of these parts' entries (e.g. after a reset). */
export const withoutAside = (store = {}, parts) =>
  Object.fromEntries(Object.entries(store).filter(([k]) => !parts.some((p) => k.startsWith(`${p}.`))));
