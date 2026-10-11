// What a card's answers suggest: chips with reasons, in Basics' values and in
// the approach lists (decision-making in Membership and the Processes tabs,
// ways of joining, conflict management); and the "More like this / Try
// something new" strip (alike, below). How it works, for people: DESIGN.md,
// "Recommendations behaviour"; how it was built and tested: RECOMMENDATIONS.md.
//
// Every option gets signals, each from −1 (against) to +1 (for), with a weight
// (TUNING); a signal that doesn't apply is left out, not counted as 0:
//   type         — the community type (basics.type): type_value_fit /
//                  type_approach_fit, −2 … +2, halved. For approaches, the
//                  difference from the option's typical mark across all
//                  community types, so a mark only counts where this type
//                  differs from groups in general. An "interesting" mark adds
//                  its reason, not a signal (rare but viable: no push either way).
//   description  — values only: its word list found in the purpose, culture and
//                  keywords (a word ½, a phrase 1, at most 1; never negative).
//   scales       — how close it sits to the card's targets: 1 − gap ÷ 2 per
//                  targeted scale it has a position on, averaged, kept to ±1;
//                  its weight shrinks with coverage (scales used ÷ targeted).
//   format       — the online space (basics.format): format_value_fit /
//                  format_approach_fit (approaches since 2026-10-10), halved.
//   values       — approaches only: the links from the values the card selected
//                  (value_recommendations_*), added up, halved, kept to ±1.
//   size         — approaches only: approach_size_fit, halved.
// score   = the weighted average of the signals present (−1 … +1)
// support = how many signals are for it (each at least TUNING.supportFrom; the
//           scales only when they cover every targeted scale)
// The chips (rules changed 2026-10-10, after the held-out check: TODO.md,
// "Tuning"). A signal is *specific* when it knows this community: its type,
// its format, the values it selected, its description. The scales and the size are
// general: they add to the score and explain it, but never earn a chip alone
// (together they had put Holacracy forward to a radio club).
//   Approaches — Suggested: score ≥ TUNING.suggested, at least 2 signals for
//     it, one of them specific. See also: score ≥ TUNING.seeAlso and a
//     specific signal for it.
//   Values — Suggested: score ≥ TUNING.suggested and at least 2 signals for
//     it, or a type signal of at least TUNING.values.typeAlone (a +2 mark:
//     "very common for groups like yours"); the best TUNING.values.max.
//     See also: score ≥ TUNING.seeAlso and any signal for it.
//   Neither when gated: the
//   type marks it "generally not a fit", or it's "rarely a fit" anywhere
//   (option_flags.json) and the type doesn't say otherwise; then its
//   reason shows, with no chip. Among the Suggested values, one with the same
//   positions as a better one drops to See also (variety).
//
//   const recs = await loadRecommendations();
//   suggestionsFrom(recs, card.basics).badge("decision")    a choices badge ("values" too)
//   suggestionsFrom(recs, card.basics).alike("decision")    a pick list's "More like this / Try something new"

import { loadData, loadValues } from "./data.js";
import { stem, words } from "./stem.js";
import { scoredItems, COUNT_PROPOSED } from "./view-modes.js";

// (while drafts are in review, proposed ones count too: COUNT_PROPOSED)
const counts = (it) => it.status === "accepted" || (COUNT_PROPOSED && it.status === "proposed");

/** The weights and cut-offs (the workbench, bench.html, tries others). */
export const TUNING = {
  values: { weights: { type: 1, description: 1.5, scales: 1, format: 0.5 }, max: 5, typeAlone: 1 },   // typeAlone: a type signal this strong is Suggested on its own
  decision: { weights: { type: 1, values: 1, scales: 1.25, size: 0.4, format: 0.5 } },
  membership: { weights: { type: 1.25, values: 1, scales: 0.5, size: 0.4, format: 0.5 } },
  conflict: { weights: { type: 1, values: 1.25, scales: 0.75, size: 0.25, format: 0.5 } },
  suggested: 0.5,     // Suggested from (with at least 2 signals for it; see the rules above)
  seeAlso: 0.3,       // See also from (with a signal for it; approaches: a specific one)
  supportFrom: 0.25,  // a signal at least this counts as "for"
};

// each list of approaches: its value links, and its name in the other files
export const KINDS = {
  decision: { file: "value_recommendations_decision", list: "decision_approaches" },
  membership: { file: "value_recommendations_membership", list: "membership_options" },
  conflict: { file: "value_recommendations_conflict", list: "conflict_management" },
};
const LIST_OF = { values: "values", ...Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.list])) };

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (s[(n - 1) >> 1] + s[n >> 1]) / 2 : 0; };

export async function loadRecommendations() {
  const [values, scales, sizeFit, enums, types, typeValues, typeApproaches, formatValues, formatApproaches, flags, formats, ...links] = await Promise.all([
    loadValues(), loadData("governance_scales"), loadData("approach_size_fit"), loadData("enums"),
    loadData("community_types"), loadData("type_value_fit"), loadData("type_approach_fit"), loadData("format_value_fit"), loadData("format_approach_fit"),
    loadData("option_flags"), loadData("formats"),
    ...Object.values(KINDS).map((k) => loadData(k.file)),
  ]);
  // the community type marks, by "list:option" then type; and each option's typical mark (blank = 0)
  const typeMarks = new Map();
  const mark = (list, option, m) => {
    const key = `${list}:${option}`;
    if (!typeMarks.has(key)) typeMarks.set(key, new Map());
    typeMarks.get(key).set(m.type, m);
  };
  for (const m of typeValues.items.filter(counts)) mark("values", m.value, m);
  for (const m of typeApproaches.items.filter(counts)) mark(m.list, m.option, m);
  const n = types.items.length;
  const typical = new Map([...typeMarks].map(([key, by]) => [key, median([...[...by.values()].map((m) => m.fit), ...Array(n - by.size).fill(0)])]));
  return {
    values,
    scales,
    positions: scoredItems(scales, { includeProposed: COUNT_PROPOSED }),
    valueLabel: Object.fromEntries(values.items.map((v) => [v.id, v.label])),
    sizeLabel: Object.fromEntries(enums.communitySize.map((s) => [s.id, s.label.toLowerCase()])),
    typeLabel: Object.fromEntries(types.items.map((t) => [t.id, t.label])),
    formatLabel: Object.fromEntries(formats.items.map((t) => [t.id, t.label])),
    types: types.items,
    typeMarks,
    typical,
    // the format marks, by "format:list:option" (values: list "values")
    formatMarks: new Map([...formatValues.items.filter(counts).map((m) => [`${m.format}:values:${m.value}`, m]),
      ...formatApproaches.items.filter(counts).map((m) => [`${m.format}:${m.list}:${m.option}`, m])]),
    rarely: new Map(flags.items.filter(counts).map((f) => [`${f.list}:${f.option}`, f])),
    sizeFit: new Map(sizeFit.items.filter(counts).map((it) => [it.id, it])),
    links: Object.fromEntries(Object.keys(KINDS).map((kind, i) => [kind, links[i].items.filter(counts)])),
  };
}

/** The line that says where the chips come from (richText). */
export const FROM_BASICS = "[[Suggested]] and [[~See also]] tags come from your answers in Basics: your community type, where you’d like to be on the scales, your values and your size.";

/**
 * How far an item's scores are from a card's targets (or another item's
 * scores), from 0 (the same) up: the average, over the scales the targets
 * have, of the difference; a scale the item says nothing about (null) counts
 * as scaleData.neutralDistance (an average fit). null when there are no
 * targets. (Used by "More like this"; suggestions use scalesSignal.)
 */
export function scaleDistance(item, targets = {}, scaleData) {
  const on = scaleData.scales.filter((sc) => targets[sc.id] != null);
  if (!on.length) return null;
  const sum = on.reduce((acc, sc) => acc + (item[sc.id] == null ? scaleData.neutralDistance : Math.abs(item[sc.id] - targets[sc.id])), 0);
  return sum / on.length;
}

const clamp = (x) => Math.max(-1, Math.min(1, x));

/**
 * The scales signal for one item: 1 − gap ÷ 2, the gap averaged over the
 * targeted scales it has a position on, kept to ±1; with its coverage (scales
 * used ÷ targeted) and where it sits. null when none applies.
 */
export function scalesSignal(item, targets = {}, scaleData) {
  const targeted = scaleData.scales.filter((sc) => targets[sc.id] != null);
  const used = targeted.filter((sc) => item?.[sc.id] != null);
  if (!used.length) return null;
  const gap = used.reduce((acc, sc) => acc + Math.abs(item[sc.id] - targets[sc.id]), 0) / used.length;
  return {
    value: clamp(1 - gap / 2),
    coverage: used.length / targeted.length,
    where: used.map((sc) => `${sc.label} ${item[sc.id]} (you: ${targets[sc.id]})`).join(", "),
  };
}

/**
 * What a description says for each value: Map value id → { part (0 to 1),
 * matched: [text as written] }. For now, its word list found in the text
 * (cueMatches: a word counts ½, a phrase 1, at most 1); later, perhaps the
 * team's language model, with this as the fallback.
 */
export function describeValues(description = {}, values, keywords = []) {
  const text = [...Object.values(description || {}), ...(keywords || [])].filter(Boolean).join(".\n");
  return new Map(cueMatches(text, values).map((m) => [m.id, { part: Math.min(1, m.score / 2), matched: m.matched }]));
}

/**
 * Each option's signals, score, support and tier for a card: Map option id →
 * { score, support, signals: [{ kind, value, weight, note }], notes, tier }
 * (tier: "suggested" | "see" | "gate" | null; gate: the reason, no chip).
 * kind: "values", "decision", "membership" or "conflict".
 */
export function scoreList(recs, kind, basics = {}, tuning = TUNING) {
  const list = LIST_OF[kind];
  const weights = tuning[kind].weights;
  const targets = basics.targetScales || {};
  const type = basics.type && basics.type !== "other" ? basics.type : null;
  const typeName = type ? recs.typeLabel[type] || type : null;
  const options = kind === "values" ? recs.values.items.map((v) => v.id)
    : [...new Set([...recs.positions.values()].filter((it) => it.list === list).map((it) => it.option)
      .concat([...recs.typeMarks.keys()].filter((k) => k.startsWith(`${list}:`)).map((k) => k.slice(list.length + 1))))];
  const described = kind === "values" ? describeValues(basics.description, recs.values.items, basics.keywords) : null;
  const selected = basics.values || [];
  const out = new Map();
  for (const id of options) {
    const key = `${list}:${id}`;
    const signals = [];
    const add = (sigKind, value, note, weight = weights[sigKind], full = true) => { if (value != null && weight) signals.push({ kind: sigKind, value, weight, note, full }); };
    let gate = null;
    let aside = null;   // an "interesting" mark: its reason, but no push either way
    // the community type: gate, interesting, or the mark (approaches: its difference from typical)
    const m = type ? recs.typeMarks.get(key)?.get(type) : null;
    if (m?.flag === "gate") gate = `Generally not a fit for groups like yours (${typeName}): ${m.why}`;
    else if (m?.flag === "interesting") aside = `Interesting for groups like yours (${typeName}): ${m.why}`;
    else if (m) {
      const value = kind === "values" ? m.fit / 2 : clamp((m.fit - (recs.typical.get(key) || 0)) / 2);
      if (value) add("type", value, `${value > 0 ? "Common" : "Less usual"} for groups like yours (${typeName}): ${m.why}`);
    }
    const rare = recs.rarely.get(key);
    if (rare && !gate && !(m && (m.fit > 0 || m.flag === "interesting"))) gate = `Rarely a fit: ${rare.why}`;
    // the description (values)
    const d = described?.get(id);
    if (d) add("description", d.part, `Because you wrote ${d.matched.map((x) => `“${x}”`).join(", ")}.`);
    // the scales (weight shrinks with coverage)
    const item = recs.positions.get(key);
    const sc = scalesSignal(item, targets, recs.scales);
    // (it counts as support only when it covers every targeted scale: one close scale isn't much to go on)
    if (sc && sc.value !== 0) add("scales", sc.value, `${sc.value > 0 ? "Close to" : "Further from"} where you’d like to be: ${sc.where}.${sc.value > 0 && item?.why && kind === "values" ? ` ${item.why}` : ""}`, weights.scales * sc.coverage, sc.coverage === 1);
    // the format
    if (basics.format) {
      const t = recs.formatMarks.get(`${basics.format}:${key}`);
      if (t) add("format", t.fit / 2, `${t.fit > 0 ? "Fits" : "Less usual for"} a ${(recs.formatLabel[basics.format] || basics.format).toLowerCase()}: ${t.why}`);
    }
    // the values the card selected (approaches)
    if (kind !== "values") {
      const ls = recs.links[kind].filter((r) => r.recommends === id && selected.includes(r.value));
      if (ls.length) add("values", clamp(ls.reduce((acc, r) => acc + r.strength, 0) / 2),
        ls.map((r) => `${r.strength > 0 ? "Because" : "But"} you value *${recs.valueLabel[r.value] || r.value}*: ${r.why}`).join(" "));
    }
    // the size (approaches)
    if (kind !== "values" && basics.size) {
      const f = recs.sizeFit.get(key)?.[basics.size];
      if (f) add("size", f / 2, `${f > 0 ? "Suits" : "Can strain at"} your size (${recs.sizeLabel[basics.size]}): ${recs.sizeFit.get(key).why}`);
    }
    const total = signals.reduce((acc, s) => acc + s.weight, 0);
    const score = total ? signals.reduce((acc, s) => acc + s.weight * s.value, 0) / total : 0;
    const forIt = signals.filter((s) => s.value >= tuning.supportFrom && s.full);
    const specific = forIt.some((s) => SPECIFIC.has(s.kind));
    const suggested = kind === "values"
      ? forIt.length >= 2 || forIt.some((s) => s.kind === "type" && s.value >= tuning.values.typeAlone)
      : forIt.length >= 2 && specific;
    const seeAlso = kind === "values" ? forIt.length >= 1 : specific;
    const tier = gate ? "gate"
      : signals.length && score >= tuning.suggested && suggested ? "suggested"
        : signals.length && score >= tuning.seeAlso && seeAlso ? "see" : null;
    out.set(id, { score, support: forIt.length, signals, tier, gate, interesting: aside, notes: gate ? [gate] : [...(aside ? [aside] : []), ...signals.map((s) => s.note)] });
  }
  // values: at most `max` Suggested, the best first (ties: the description's part)
  if (kind === "values") {
    const ranked = [...out].filter(([, r]) => r.tier === "suggested")
      .sort((a, b) => b[1].score - a[1].score || (part(b[1]) - part(a[1])));
    ranked.slice(tuning.values.max).forEach(([, r]) => { r.tier = "see"; });
  }
  // variety (values only, where there are near-duplicates like Inclusion and Inclusivity): among the
  // Suggested, one with the same positions as a better one drops to See also. (Approaches sharing
  // positions, like the voting methods, are real alternatives, so they keep their chips.)
  const seen = [];
  for (const [id, r] of [...out].filter(([, x]) => kind === "values" && x.tier === "suggested").sort((a, b) => b[1].score - a[1].score)) {
    const pos = recs.positions.get(`${list}:${id}`);
    const sig = pos ? recs.scales.scales.map((s) => pos[s.id]).join(",") : null;
    if (sig && sig !== ",," && seen.includes(sig)) r.tier = "see";
    else if (sig) seen.push(sig);
  }
  return out;
}
const part = (r) => r.signals.find((s) => s.kind === "description")?.value || 0;
// the signals that know this community (the scales and the size are general: they never earn a chip alone)
const SPECIFIC = new Set(["type", "format", "values", "description"]);

/** A choices `badge` for scored options: Suggested, See also (quiet), or a gate's reason with no chip. */
const badgeOf = (scored) => (opt) => {
  const r = scored.get(opt.id);
  if (!r || !r.tier) return null;
  if (r.tier === "gate") return { label: null, notes: r.notes };
  return { label: r.tier === "suggested" ? "Suggested" : "See also", quiet: r.tier === "see", notes: r.notes };
};

/**
 * A card's suggestions for its lists: badge(kind) → a choices badge;
 * any(kind) → whether anything in that list has a chip; alike(kind) → a pick
 * list's `alike` (the "More like this / Try something new" strip).
 * kind: "values", "decision", "membership" or "conflict".
 *   const recs = suggestionsFrom(data.recs, card.basics);
 */
export function suggestionsFrom(recs, basics, tuning = TUNING) {
  const cache = new Map();
  const scored = (kind) => {
    if (!cache.has(kind)) cache.set(kind, scoreList(recs, kind, basics, tuning));
    return cache.get(kind);
  };
  return {
    badge: (kind) => badgeOf(scored(kind)),
    any: (kind) => [...scored(kind).values()].some((r) => r.tier === "suggested" || r.tier === "see"),
    /** For a pick list's `alike`: (last, options, chosen, lastName) → { like, fresh } in that kind's list. */
    alike: (kind) => (last, options, chosen, lastName) => alike(recs, kind, scored(kind), { last, options, chosen, lastName }),
  };
}

/**
 * "More like this / Try something new" (redone 2026-10-10), among `options`
 * (ids) that aren't `chosen`, using the same scores as the chips (`scored`,
 * from scoreList); never anything gated ("not a fit", "rarely a fit"). Each
 * comes with its reason (shown on hover).
 *   like  — for the one selected last (`last`): the 3 closest to it on the
 *           scales (values: its own group first) among those with a chip
 *           (Suggested or See also), so nothing the suggestions wouldn't back.
 *   fresh — from everything chosen: first the community type's "interesting"
 *           marks (rare for groups like yours, but viable; offered unless a
 *           specific signal is against it), then options with a chip that sit
 *           away from what's chosen on a scale (by 2 or more: new, not the
 *           opposite), the best first. 3 in all.
 * (Measured 2026-10-10 on the benchmarks and the held-out set: RECOMMENDATIONS.md, "Tuning".)
 *   alike(recs, "decision", scored, { last: "sociocracy", options: ids, chosen: ids, lastName: "Sociocracy" })
 *     → { like: [{ id, why }], fresh: [{ id, why }] }
 */
export function alike(recs, kind, scored, { last = null, options, chosen = [], lastName = "it" }) {
  const list = LIST_OF[kind];
  const pos = (x) => recs.positions.get(`${list}:${x}`);
  const scales = recs.scales.scales;
  const hasChip = (x) => ["suggested", "see"].includes(scored.get(x)?.tier);
  const firstNote = (x) => (hasChip(x) ? scored.get(x).notes[0] : null);
  // an interesting mark is offered unless the score or a specific signal is against it
  const viable = (x) => { const r = scored.get(x); return r && r.tier !== "gate" && r.score >= 0 && !r.signals.some((g) => SPECIFIC.has(g.kind) && g.value < 0); };
  const open = options.filter((x) => !chosen.includes(x) && x !== last);
  const pool = open.filter(hasChip);
  const why = (...parts) => parts.filter(Boolean).join(" ");

  // the value groups (values only): an option's tabs, and their short names
  const groupsOf = (x) => (kind === "values" ? recs.values.items.find((v) => v.id === x)?.groups || [] : []);
  const groupName = (g) => { const x = recs.values.groups.find((y) => y.id === g); return x?.short || x?.label; };
  const byScore = (a, b) => (scored.get(b)?.score || 0) - (scored.get(a)?.score || 0);

  // more like the last one: the same group first (values), then the closest on the
  // scales (when it has positions), then the best score
  let like = [];
  if (last) {
    const mine = pos(last);
    const on = mine ? Object.fromEntries(scales.filter((sc) => mine[sc.id] != null).map((sc) => [sc.id, mine[sc.id]])) : {};
    const placed = Object.keys(on).length > 0;
    const shared = (x) => groupsOf(x).find((g) => groupsOf(last).includes(g));
    like = pool
      .map((x) => ({ x, group: shared(x), d: placed ? scaleDistance(pos(x) || {}, on, recs.scales) : 0 }))
      .sort((a, b) => Boolean(b.group) - Boolean(a.group) || a.d - b.d || byScore(a.x, b.x))
      .slice(0, 3)
      .map(({ x, group }) => ({ id: x, why: why(
        placed && group ? `Close to ${lastName} on the scales, in the same group (${groupName(group)}).`
          : placed ? `Close to ${lastName} on the scales.`
            : group ? `In the same group as ${lastName} (${groupName(group)}).` : null,
        firstNote(x)) }));
  }

  // something new, from everything chosen: interesting marks, then (with a chip) away on a
  // scale by 2 or more, then (values) from a group none of the chosen are in, then the least alike
  const taken = new Set(like.map((l) => l.id));
  const rest = open.filter((x) => !taken.has(x));
  const interesting = rest.filter((x) => scored.get(x)?.interesting && viable(x)).sort(byScore)
    .map((x) => ({ id: x, why: scored.get(x).interesting }));
  const picked = [...chosen, ...(last && !chosen.includes(last) ? [last] : [])];
  const placedChosen = picked.map(pos).filter(Boolean);
  const centre = Object.fromEntries(scales.map((sc) => {
    const xs = placedChosen.map((p) => p[sc.id]).filter((v) => v != null);
    return [sc.id, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null];
  }));
  // the scale an option is furthest from the chosen ones on
  const away = (x) => {
    const p = pos(x);
    return p ? scales.filter((sc) => p[sc.id] != null && centre[sc.id] != null).map((sc) => ({ sc, gap: p[sc.id] - centre[sc.id] }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] || null : null;
  };
  const chosenGroups = new Set(picked.flatMap(groupsOf));
  const otherGroup = (x) => (kind === "values" && groupsOf(x).length && !groupsOf(x).some((g) => chosenGroups.has(g)) ? groupsOf(x)[0] : null);
  const different = rest.filter((x) => !scored.get(x)?.interesting && hasChip(x)).map((x) => {
    const a = away(x);
    const far = a && Math.abs(a.gap) >= 2;
    const g = otherGroup(x);
    const rank = far ? 0 : g ? 1 : 2;
    return { x, rank, gap: a ? Math.abs(a.gap) : 0, why: why(
      far ? `${a.gap > 0 ? "More" : "Less"} ${a.sc.label.toLowerCase()} than what you’ve chosen.`
        : g ? `From another group (${groupName(g)}).` : "Different from what you’ve chosen.",
      firstNote(x)) };
  }).sort((a, b) => a.rank - b.rank || b.gap - a.gap || byScore(a.x, b.x))
    .map(({ x, why: w }) => ({ id: x, why: w }));
  const fresh = picked.length ? [...interesting, ...different].slice(0, 3) : [];
  return { like, fresh };
}

/**
 * Which values a description suggests: each value's words and phrases
 * (value_groups.json cues) found in the text. Matching is by stem
 * (js/stem.js), so "organise" also finds "organising" and "organisers"; a
 * cue ending in * matches any ending of its last word. A phrase must match
 * word for word in order, within a sentence. A cue of two or more words
 * counts 2, one word 1; each cue counts once. A match with "not", "no",
 * "never", "without" or "n't" among the 3 words before it is skipped.
 * → [{ id, score, matched: [text as written] }], best first.
 * Also used by scripts/make-value-terms.mjs to measure word lists.
 *   cueMatches("We help each other…", values.items)
 */
export function cueMatches(text, values) {
  const NEGATION = /^(not|no|never|without)$|n['’]t$/;
  // the text as sentences of words, each with its stem
  const sentences = String(text).split(/[.!?;\n]+/).map((t) => words(t)).filter((ws) => ws.length)
    .map((ws) => ws.map((w) => ({ w, s: stem(w) })));
  const matchCue = (cue) => {
    const prefix = cue.trim().endsWith("*");
    const parts = words(cue.replace(/\*\s*$/, ""));
    if (!parts.length) return null;
    const last = parts.length - 1;
    const want = parts.map((w, i) => (prefix && i === last ? w : stem(w)));
    for (const ws of sentences) {
      for (let i = 0; i + parts.length <= ws.length; i++) {
        const ok = want.every((x, j) => (prefix && j === last ? ws[i + j].w.startsWith(x) : ws[i + j].s === x));
        if (!ok) continue;
        if (ws.slice(Math.max(0, i - 3), i).some((t) => NEGATION.test(t.w))) continue;
        return ws.slice(i, i + parts.length).map((t) => t.w).join(" ");
      }
    }
    return null;
  };
  const found = [];
  for (const v of values) {
    let score = 0;
    const matched = [];
    for (const cue of v.cues || []) {
      const m = matchCue(cue);
      if (!m) continue;
      score += words(cue).length > 1 ? 2 : 1;
      matched.push(m);
    }
    if (score) found.push({ id: v.id, score, matched });
  }
  return found.sort((a, b) => b.score - a.score);
}
