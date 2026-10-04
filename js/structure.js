// The community's structure (membership.structure) is one list, edited from
// Membership and from three Processes sections. Every change is logged in
// membership.structureLog, oldest first:
//   { id, change: "added" | "removed", from: "<section>", at }
//   { change: "reviewed", from: "membership", at }   — the structure was
//     confirmed in Membership (Keep these changes, or edited there)
// so the editor can say what changed where, and what was already kept.

export const SECTION_LABELS = {
  membership: "Membership",
  moderation: "Moderation",
  maintenance: "Maintenance",
  institutionalChange: "Institutional change",
};

const now = () => new Date().toISOString();

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
 * Changes made from Processes that were already kept: the latest entry per
 * approach before the last "reviewed" marker, if it came from Processes (an
 * approach whose latest entry came from Membership — e.g. an Undo — isn't).
 */
export function alreadyKept(log = []) {
  const last = log.map((e) => e.change).lastIndexOf("reviewed");
  const latest = new Map();
  for (const e of log.slice(0, Math.max(last, 0))) if (e.id) latest.set(e.id, e);
  return [...latest.values()].filter((e) => e.from !== "membership");
}
