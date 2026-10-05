// The community's structure (membership.structure: [{ id, note }]) is one
// list, edited from Membership and from Processes' three tabs. Every change
// is logged in the editor-only editor.structureLog, oldest first:
//   { id, change: "added" | "removed", from: "<section>", at }
//   { change: "reviewed", from: "membership", at }   — the structure was
//     confirmed in Membership (Keep these changes, or edited there)
// so the editor can say what changed where, and what was kept or undone.
// A removed approach's Membership note is set aside (js/set-aside.js:
// "membership.structure:<id>"), and comes back if it's added again.

export const SECTION_LABELS = {
  membership: "Membership",
  moderation: "Moderation",
  maintenance: "Maintenance",
  institutionalChange: "Change",   // the tab's name in Processes
};

const now = () => new Date().toISOString();
const PROCESSES_SECTIONS = { moderation: 1, maintenance: 1, institutionalChange: 1 };

/** The structure's approach ids, in order. */
export const structureIds = (membership = {}) => (membership.structure || []).map((s) => s.id);

const asideKey = (id) => `membership.structure:${id}`;

/**
 * The structure changed to these ids from outside Membership (Processes,
 * Undo): each approach keeps its Membership note; a removed one's note is
 * set aside, and one added back gets its note back from there.
 * → { structure, setAside } (the card's whole editor.setAside, updated)
 */
export function changeStructure(membership = {}, ids, setAside = {}) {
  const before = membership.structure || [];
  const aside = { ...setAside };
  for (const s of before) if (!ids.includes(s.id) && s.note) aside[asideKey(s.id)] = { note: s.note };
  const structure = ids.map((id) => before.find((s) => s.id === id) || { id, note: aside[asideKey(id)]?.note ?? null });
  for (const id of ids) delete aside[asideKey(id)];
  return { structure, setAside: aside };
}

/** The log, plus entries for what changed between the structure `before` (ids) and `ids`. */
export function logChanges(log = [], before = [], ids, from) {
  const at = now();
  return [
    ...log,
    ...ids.filter((id) => !before.includes(id)).map((id) => ({ id, change: "added", from, at })),
    ...before.filter((id) => !ids.includes(id)).map((id) => ({ id, change: "removed", from, at })),
  ];
}

/** The log, plus a marker that the structure was confirmed in Membership. */
export const logReviewed = (log = []) => [...log, { change: "reviewed", from: "membership", at: now() }];

/**
 * What happened to earlier changes made from Processes: each is "kept" (it
 * was there when the structure was confirmed in Membership) or "undone" (it
 * was reversed — Undo, or unticked / ticked back by hand). Changes still
 * waiting to be confirmed aren't included. One entry per approach: its
 * latest settled change. → [{ id, change, from, outcome }]
 */
export function settledChanges(log = []) {
  const pending = new Map();   // approach id → its latest change from Processes, not yet settled
  const settled = new Map();
  for (const e of log) {
    if (e.change === "reviewed") {
      for (const [id, p] of pending) settled.set(id, { ...p, outcome: "kept" });
      pending.clear();
    } else if (e.from in PROCESSES_SECTIONS) pending.set(e.id, e);
    else if (pending.has(e.id)) {
      // reversed from Membership (Undo, or by hand)
      if (pending.get(e.id).change !== e.change) settled.set(e.id, { ...pending.get(e.id), outcome: "undone" });
      pending.delete(e.id);
    }
  }
  return [...settled.values()];
}
