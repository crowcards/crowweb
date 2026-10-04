// What a card's values recommend: decision approaches (structure), joining
// options (membership) and conflict approaches, from the three
// value_recommendations_*.json files. Only items a person has accepted are used.
//
//   const recs = await loadRecommendations();
//   const why = reasonsFor(recs.decision, card.basics.values, recs.valueLabel);
//   why.get("lazy_consensus") → [{ id: "trust__lazy_consensus", valueLabel: "Trust", why: "…" }]
//
// Used by Membership and Processes for the "Suggested" chips in their lists.

import { loadData } from "./data.js";

const FILES = {
  decision: "value_recommendations_decision",
  membership: "value_recommendations_membership",
  conflict: "value_recommendations_conflict",
};

export async function loadRecommendations() {
  const [values, ...lists] = await Promise.all([loadData("values"), ...Object.values(FILES).map((f) => loadData(f))]);
  return {
    valueLabel: Object.fromEntries(values.items.map((v) => [v.id, v.label])),
    ...Object.fromEntries(Object.keys(FILES).map((kind, i) => [kind, lists[i].items.filter((r) => r.status === "accepted")])),
  };
}

/** For these values: option id → the reasons it's recommended (one per value). */
export function reasonsFor(list, values = [], valueLabel = {}) {
  const reasons = new Map();
  for (const r of list) {
    if (!values.includes(r.value)) continue;
    if (!reasons.has(r.recommends)) reasons.set(r.recommends, []);
    reasons.get(r.recommends).push({ id: r.id, value: r.value, valueLabel: valueLabel[r.value] || r.value, why: r.why });
  }
  return reasons;
}

/** "Because you value Trust: …" lines for an option's reasons. */
const reasonText = (reasons) => reasons.map((r) => `Because you value *${r.valueLabel}*: ${r.why}`);   // the value in italics (richText)

/** A choices `badge` (see js/controls/choices.js): "Suggested", with the reasons. */
export const suggestedBadge = (reasons) => (opt) => {
  const r = reasons.get(opt.id);
  return r ? { label: "Suggested", notes: reasonText(r) } : null;
};
