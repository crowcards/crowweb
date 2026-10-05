// The community's structure (membership.structure) is one list, edited from
// Membership and from three Processes sections. Every change is logged in
// membership.structureLog, oldest first:
//   { id, change: "added" | "removed", from: "<section>", at }
//   { change: "reviewed", from: "membership", at }   — the structure was
//     confirmed in Membership (Keep these changes, or edited there)
// so the editor can say what changed where, and what was kept or undone.

export const SECTION_LABELS = {
  membership: "Membership",
  moderation: "Moderation",
  maintenance: "Maintenance",
  institutionalChange: "Change",   // the tab's name in Processes
};

const now = () => new Date().toISOString();
const PROCESSES_SECTIONS = { moderation: 1, maintenance: 1, institutionalChange: 1 };

/** The log, plus entries for what changed between the old structure and `ids`. */
export function logChanges(membership, ids, from) {
  const before = membership.structure || [];
  const at = now();
  return [
    ...(membership.structureLog || []),
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
