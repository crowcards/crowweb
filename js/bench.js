// The example communities, scored: how the suggestions do against what
// each would choose (benchmark_communities.json, and the held-out set,
// benchmark_heldout.json). Used by the workbench (bench.html), and loadable
// in Node to measure without a browser (RECOMMENDATIONS.md, "The tools").
// Team only: delete before launch, with the workbench.

import { scoreList } from "./recommend.js";

// the approach lists: scoreList's kind → the benchmark's key
export const LIST_KEY = { decision: "decision", membership: "joining", conflict: "conflict" };

/**
 * A community's set-up answers, as the editor's Basics: an example with an
 * answer key (its core values as the values chosen) or a review case (its
 * own values, if any).
 */
export const basicsOf = (c) => ({ type: c.type, format: c.format, size: c.size, targetScales: c.targetScales, description: c.description, keywords: c.keywords || [], values: c.values || c.expected?.values.core || [] });
const chipped = (r) => r?.tier === "suggested" || r?.tier === "see";

/**
 * Each community's result with tuning `t`: values { core, suggested, see,
 * chips } and, per approach list, { good, suggested, see, avoidChipped[],
 * chips }.
 */
export function benchmarkScores(recs, communities, t) {
  return communities.map((c) => {
    const basics = basicsOf(c);
    const r = { id: c.id, name: c.name };
    const v = scoreList(recs, "values", basics, t);
    const core = c.expected.values.core;
    r.values = { core: core.length, suggested: core.filter((x) => v.get(x)?.tier === "suggested").length, see: core.filter((x) => v.get(x)?.tier === "see").length,
      chips: [...v.values()].filter(chipped).length };
    for (const [kind, key] of Object.entries(LIST_KEY)) {
      const s = scoreList(recs, kind, basics, t);
      const e = c.expected[key];
      r[kind] = { good: e.good.length, suggested: e.good.filter((x) => s.get(x)?.tier === "suggested").length, see: e.good.filter((x) => s.get(x)?.tier === "see").length,
        avoidChipped: e.avoid.filter((x) => chipped(s.get(x))), chips: [...s.values()].filter(chipped).length };
    }
    return r;
  });
}

/** Totals over the communities. */
export function benchTotals(rows) {
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  const kinds = Object.keys(LIST_KEY);
  const over = (f) => sum((r) => kinds.reduce((n, k) => n + f(r[k]), 0));
  return {
    core: sum((r) => r.values.core), coreSug: sum((r) => r.values.suggested), coreSee: sum((r) => r.values.see),
    good: over((x) => x.good), goodSug: over((x) => x.suggested), goodSee: over((x) => x.see),
    avoid: over((x) => x.avoidChipped.length),
    chips: rows.length ? Math.round(over((x) => x.chips) / rows.length / kinds.length) : 0,
  };
}

export const benchLine = (tot) => `Values: ${tot.coreSug} of ${tot.core} core values Suggested (${tot.coreSee} more as See also). Approaches: ${tot.goodSug} of ${tot.good} good choices Suggested (${tot.goodSee} more as See also); ${tot.avoid} to-avoid options got a chip; about ${tot.chips} chips per list.`;
