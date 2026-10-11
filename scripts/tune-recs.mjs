// Tunes the suggestions' weights and cut-offs (TUNING in js/recommend.js) on
// the benchmark communities, and writes what it found to
// data/tuning_results.json for the workbench's Tuning section. It never
// changes TUNING or any datasheet: the team decides, then TUNING is edited
// by hand. The held-out communities (benchmark_heldout.json) are never used
// here: the workbench checks the candidates on them afterwards.
//
//   node scripts/tune-recs.mjs
//
// The goal, in order: (1) no to-avoid option gets a chip; (2) lists stay
// short (on average at most MAX_SUGGESTED Suggested and MAX_SEE_ALSO See
// also per list); (3) as many good choices Suggested as possible (a See
// also counts half). It searches the cut-offs only (one grid, every list;
// kept only if they gain at least MIN_GAIN), ties going to the setting
// closest to today's. Weights are left alone: searching them (2026-10-10)
// gained on the benchmarks and lost on the held-out set, i.e. it learned the
// 18 examples (RECOMMENDATIONS.md, "Tuning"). `--weights` still tries them, one list
// and one weight at a time in steps of STEP, for comparison only.
// Team only: delete before launch, with the workbench.

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
// recommend.js reads /data with fetch, as in the browser: serve it from disk
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(`.${url}`, ROOT), "utf8")) });
const { loadRecommendations, TUNING } = await import("../js/recommend.js");
const { benchmarkScores, benchTotals, LIST_KEY } = await import("../js/bench.js");

const MAX_SUGGESTED = 5;
const MAX_SEE_ALSO = 8;
const STEP = 0.25;
const WEIGHT_MAX = 2.5;
const MIN_GAIN = 1;   // one more good choice Suggested (or two more as See also)

const recs = await loadRecommendations();
const bench = JSON.parse(readFileSync(new URL("data/benchmark_communities.json", ROOT), "utf8")).communities;
const KINDS = ["values", ...Object.keys(LIST_KEY)];
const range = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Math.round((from + i * step) * 100) / 100);

/** One list (or all), measured: hits (Suggested + half of See also), whether it keeps the rules, and the numbers. */
function measure(t, kinds = KINDS) {
  const rows = benchmarkScores(recs, bench, t, kinds);
  const tot = benchTotals(rows);
  const n = rows.length;
  const short = kinds.every((k) => {
    if (k === "values") return rows.reduce((s, r) => s + r.values.chips - Math.min(r.values.chips, t.values.max), 0) / n <= MAX_SEE_ALSO;
    const sug = rows.reduce((s, r) => s + r[k].sugChips, 0) / n;
    const see = rows.reduce((s, r) => s + r[k].chips - r[k].sugChips, 0) / n;
    return sug <= MAX_SUGGESTED && see <= MAX_SEE_ALSO;
  });
  const hits = tot.coreSug + tot.coreSee / 2 + tot.goodSug + tot.goodSee / 2;
  return { hits, ok: tot.avoid === 0 && short, tot };
}

// how far a setting is from today's (the tie-break)
const flat = (t) => [t.suggested, t.seeAlso, t.supportFrom, ...KINDS.flatMap((k) => Object.values(t[k].weights))];
const distance = (a, b) => flat(a).reduce((s, x, i) => s + Math.abs(x - flat(b)[i]), 0);
const better = (a, b, t, tb) => (a.ok !== b.ok ? a.ok : a.hits !== b.hits ? a.hits > b.hits : distance(t, TUNING) < distance(tb, TUNING));

/** The cut-offs, all together on a grid. */
function tuneCutoffs(base) {
  let best = { t: base, m: measure(base) };
  for (const suggested of range(0.3, 0.7, 0.05))
    for (const seeAlso of range(0.15, suggested - 0.05, 0.05))
      for (const supportFrom of range(0.15, 0.4, 0.05)) {
        const t = { ...structuredClone(base), suggested, seeAlso, supportFrom };
        const m = measure(t);
        if (better(m, best.m, t, best.t)) best = { t, m };
      }
  // keep the old cut-offs unless the new ones gain enough
  const m0 = measure(base);
  return best.m.ok && (!m0.ok || best.m.hits - m0.hits >= MIN_GAIN) ? best.t : base;
}

/** One list's weights, one at a time (the type's weight stays, as the yardstick: only the ratios matter). */
function tuneWeights(base, kind) {
  let t = structuredClone(base);
  let m = measure(t, [kind]);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const w of Object.keys(t[kind].weights).filter((w) => w !== "type")) {
      let best = { t, m };
      for (const x of range(0, WEIGHT_MAX, STEP)) {
        const c = structuredClone(t);
        c[kind].weights[w] = x;
        const cm = measure(c, [kind]);
        if (better(cm, best.m, c, best.t)) best = { t: c, m: cm };
      }
      if (best.m.ok && (!m.ok || best.m.hits - m.hits >= MIN_GAIN)) { t = best.t; m = best.m; moved = true; }
    }
    if (!moved) break;
  }
  return t;
}

const log = [];
const step = (label, t) => { const m = measure(t); log.push({ label, tuning: t, ...m.tot, hits: m.hits, ok: m.ok }); console.log(`${label.padEnd(26)} values ${m.tot.coreSug}/${m.tot.core} (+${m.tot.coreSee}) · approaches ${m.tot.goodSug}/${m.tot.good} (+${m.tot.goodSee}) · avoid ${m.tot.avoid} · ~${m.tot.chips} chips/list${m.ok ? "" : " · BREAKS A RULE"}`); return t; };

let t = step("Today's settings", structuredClone(TUNING));
t = step("Cut-offs searched", tuneCutoffs(t));
if (process.argv.includes("--weights")) {
  for (const kind of KINDS) t = tuneWeights(t, kind);
  t = step("+ weights (comparison only)", t);
}

writeFileSync(new URL("data/tuning_results.json", ROOT), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  note: "Made by scripts/tune-recs.mjs on benchmark_communities.json only (never the held-out set). Candidates for TUNING in js/recommend.js; nothing is changed until the team decides. Workbench only.",
  rules: { maxSuggested: MAX_SUGGESTED, maxSeeAlso: MAX_SEE_ALSO, step: STEP, minGain: MIN_GAIN },
  steps: log,
}, null, 1)}\n`);
console.log("Written: data/tuning_results.json");
