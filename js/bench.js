// The benchmark communities, scored: how the suggestions do against what
// each example community would choose (benchmark_communities.json, and the
// held-out set, benchmark_heldout.json). Shared by the workbench
// (bench.html) and scripts/tune-recs.mjs, so both measure the same way.
// Team only: delete before launch, with the workbench.

import { scoreList } from "./recommend.js";

// the approach lists: scoreList's kind → the benchmark's key
export const LIST_KEY = { decision: "decision", membership: "joining", conflict: "conflict" };

const basicsOf = (c) => ({ type: c.type, format: c.format, size: c.size, targetScales: c.targetScales, description: c.description, keywords: c.keywords, values: c.expected.values.core });
const chipped = (r) => r?.tier === "suggested" || r?.tier === "see";

/**
 * Each community's result with tuning `t`: values { core, suggested, see,
 * chips } and, per approach list, { good, suggested, see, avoidChipped[],
 * chips, sugChips }. `kinds` limits which lists are scored (the tuning
 * script scores one list at a time).
 */
export function benchmarkScores(recs, communities, t, kinds = ["values", ...Object.keys(LIST_KEY)]) {
  return communities.map((c) => {
    const basics = basicsOf(c);
    const r = { id: c.id, name: c.name };
    if (kinds.includes("values")) {
      const v = scoreList(recs, "values", basics, t);
      const core = c.expected.values.core;
      r.values = { core: core.length, suggested: core.filter((x) => v.get(x)?.tier === "suggested").length, see: core.filter((x) => v.get(x)?.tier === "see").length,
        chips: [...v.values()].filter(chipped).length };
    }
    for (const [kind, key] of Object.entries(LIST_KEY)) {
      if (!kinds.includes(kind)) continue;
      const s = scoreList(recs, kind, basics, t);
      const e = c.expected[key];
      r[kind] = { good: e.good.length, suggested: e.good.filter((x) => s.get(x)?.tier === "suggested").length, see: e.good.filter((x) => s.get(x)?.tier === "see").length,
        avoidChipped: e.avoid.filter((x) => chipped(s.get(x))), chips: [...s.values()].filter(chipped).length,
        sugChips: [...s.values()].filter((x) => x.tier === "suggested").length };
    }
    return r;
  });
}

/** Totals over the communities, for the lists that were scored. */
export function benchTotals(rows) {
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const kinds = Object.keys(LIST_KEY).filter((k) => rows[0]?.[k]);
  const over = (f) => sum((r) => kinds.reduce((n, k) => n + f(r[k]), 0));
  return {
    core: sum((r) => r.values?.core || 0), coreSug: sum((r) => r.values?.suggested || 0), coreSee: sum((r) => r.values?.see || 0),
    good: over((x) => x.good), goodSug: over((x) => x.suggested), goodSee: over((x) => x.see),
    avoid: over((x) => x.avoidChipped.length),
    chips: kinds.length ? Math.round(over((x) => x.chips) / rows.length / kinds.length) : 0,
    sugChips: kinds.length ? over((x) => x.sugChips) / rows.length / kinds.length : 0,
  };
}

export const benchLine = (tot) => `Values: ${tot.coreSug} of ${tot.core} core values Suggested (${tot.coreSee} more as See also). Approaches: ${tot.goodSug} of ${tot.good} good choices Suggested (${tot.goodSee} more as See also); ${tot.avoid} to-avoid options got a chip; about ${tot.chips} chips per list.`;

/**
 * Why each good choice (core value, good approach) isn't Suggested: one row
 * per miss, { community, list, option, tier, score, why, signals }.
 */
export function benchMisses(recs, communities, t) {
  const out = [];
  for (const c of communities) {
    const basics = basicsOf(c);
    const lists = [["values", c.expected.values.core], ...Object.entries(LIST_KEY).map(([kind, key]) => [kind, c.expected[key].good])];
    for (const [kind, wanted] of lists) {
      const s = scoreList(recs, kind, basics, t);
      for (const id of wanted) {
        const r = s.get(id);
        if (r?.tier === "suggested") continue;
        out.push({ community: c.name, list: kind, option: id, tier: r?.tier || null, score: r?.score ?? 0, why: missReason(r, kind, t), signals: r?.signals || [] });
      }
    }
  }
  return out;
}

/** In plain words, what held an option back from Suggested (the rules: js/recommend.js, "The chips"). */
function missReason(r, kind, t) {
  if (r?.tier === "gate") return "Not a fit (gated)";
  if (!r || !r.signals.length) return "No signal at all";
  const forIt = r.signals.filter((s) => s.value >= t.supportFrom && s.full);
  if (r.score >= t.suggested) {
    if (kind !== "values" && forIt.length >= 2) return "No specific signal for it (only the scales and size)";
    if (forIt.length < 2) return "Score high enough, but only one signal for it";
    return "Score high enough, but outranked (5 at most) or a near-duplicate";
  }
  const against = r.signals.filter((s) => s.value < 0).sort((a, b) => a.value * a.weight - b.value * b.weight)[0];
  return against ? `Held back by ${against.kind}` : "Signals for it, but too weak";
}
