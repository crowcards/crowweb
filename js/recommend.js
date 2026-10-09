// What a card's Basics suggest: "Suggested" chips, with reasons, in
// Membership's and Processes' lists (decision-making approaches, ways of
// joining, conflict management) and in Basics' values; and the "More like
// this / Try something new" strip (alike, below).
//
// An approach's score adds up three parts, each from −1 to +1:
//   scale fit     — how close its 1–7 scores (governance_scales.json) are to
//                   the card's targets (basics.targetScales)          × 1
//   value support — the card's values' links to it, from −2 to +2
//                   (value_recommendations_*.json `strength`)          × 1
//   size fit      — how well it suits the card's size, from −2 to +2
//                   (approach_size_fit.json)                           × 0.5
// Two tiers, with no cap: options scoring at least TUNING.strong are
// "Suggested", those from TUNING.threshold up "Also fits" (a quieter chip); each says why
// (including what counts against it).
//
//   const recs = suggestionsFrom(await loadRecommendations(), card.basics);
//   pickList({ …, badge: recs.badge("decision") });   recs.any("decision") → bool
//
// A value's score adds up two parts (scoreValues):
//   scale fit    — how close it points to the card's targets, −1 to +1  × 1
//   description  — its words and phrases (value_groups.json cues) found in
//                  the card's description, 0 to +1 (a word ½, a phrase 1)  × 1.5
// The best 5 scoring at least TUNING.values.strong are "Suggested", the
// rest from TUNING.values.threshold up "Also fits"; ties go to the one the
// description backs more (valueSuggestions).

import { loadData } from "./data.js";
import { scoredItems, COUNT_PROPOSED } from "./view-modes.js";

// (while the drafts are in review, proposed ones count too: COUNT_PROPOSED)
const counts = (it) => it.status === "accepted" || (COUNT_PROPOSED && it.status === "proposed");

/**
 * The weights and the two cut-offs (test-recs.html tries others):
 * strong: "Suggested", e.g. two good reasons, or one strong one (a value linked at +2);
 * threshold: "Also fits", e.g. one value for it and nothing against, or a close fit on the scales.
 */
export const TUNING = {
  weights: { scale: 1, value: 1, size: 0.5 }, strong: 1, threshold: 0.5,
  // values: the description counts more (the community's own words); at most `max` Suggested (a card chooses up to 5)
  values: { weights: { scale: 1, description: 1.5 }, strong: 1, threshold: 0.5, max: 5 },
};

// each kind of list: its value links, and its name in the scales / size files
export const KINDS = {
  decision: { file: "value_recommendations_decision", list: "decision_approaches" },
  membership: { file: "value_recommendations_membership", list: "membership_options" },
  conflict: { file: "value_recommendations_conflict", list: "conflict_management" },
};

export async function loadRecommendations() {
  const [values, scales, sizeFit, sizes, ...links] = await Promise.all([
    loadData("values"), loadData("governance_scales"), loadData("approach_size_fit"), loadData("enums"),
    ...Object.values(KINDS).map((k) => loadData(k.file)),
  ]);
  return {
    valueLabel: Object.fromEntries(values.items.map((v) => [v.id, v.label])),
    sizeLabel: Object.fromEntries(sizes.communitySize.map((s) => [s.id, s.label.toLowerCase()])),
    scales,
    sizeFit: new Map(sizeFit.items.filter(counts).map((it) => [it.id, it])),
    links: Object.fromEntries(Object.keys(KINDS).map((kind, i) => [kind, links[i].items.filter(counts)])),
  };
}

/** The line that says where "Suggested" chips come from (richText). */
export const FROM_BASICS = "[[Suggested]] and [[~Also fits]] tags come from your answers in Basics: where you’d like to be on the scales, your values and your size.";

/**
 * How far an item's scores are from a card's targets (or another item's
 * scores), from 0 (the same) up: the average, over the scales the targets
 * have, of the difference; a scale the item says nothing about (null) counts
 * as scaleData.neutralDistance (an average fit, so an item can't come out
 * close just by saying less). null when there are no targets.
 */
export function scaleDistance(item, targets = {}, scaleData) {
  const on = scaleData.scales.filter((sc) => targets[sc.id] != null);
  if (!on.length) return null;
  const sum = on.reduce((acc, sc) => acc + (item[sc.id] == null ? scaleData.neutralDistance : Math.abs(item[sc.id] - targets[sc.id])), 0);
  return sum / on.length;
}

const clamp = (x) => Math.max(-1, Math.min(1, x));

/** Where an item sits against the targets: "Participatory 6 (you: 6), …" (scales both have). */
const sitsAt = (it, targets, scaleData) => scaleData.scales
  .filter((sc) => it[sc.id] != null && targets[sc.id] != null)
  .map((sc) => `${sc.label} ${it[sc.id]} (you: ${targets[sc.id]})`).join(", ");

/** A choices `badge` (see js/controls/choices.js) for these suggestions: Map id → { notes, quiet? } ("Also fits" when quiet). */
const badgeOf = (found) => (opt) => {
  const f = found.get(opt.id);
  return f ? { label: f.quiet ? "Also fits" : "Suggested", quiet: !!f.quiet, notes: f.notes } : null;
};

/**
 * What a description says for each value: Map value id → { part (0 to 1),
 * matched: [text as written] }. For now, its cues found in the text
 * (cueMatches: a word counts ½, a phrase 1, at most 1); later, perhaps the
 * team's language model, with this as the fallback.
 */
export function describeValues(description = {}, values) {
  const text = Object.values(description || {}).filter(Boolean).join("\n");
  return new Map(cueMatches(text, values).map((m) => [m.id, { part: Math.min(1, m.score / 2), matched: m.matched }]));
}

/**
 * Each value's score for a card (see the top of this file), with its parts
 * and reasons: Map value id → { score, scale, description, matched, notes }.
 * values: loadValues().items (with their cues).
 */
export function scoreValues(scaleData, values, basics = {}, { weights } = TUNING.values) {
  const targets = basics.targetScales || {};
  const scored = scoredItems(scaleData, { includeProposed: COUNT_PROPOSED });
  const described = describeValues(basics.description, values);
  const out = new Map();
  for (const v of values) {
    const it = scored.get(`values:${v.id}`) || {};
    const d = scaleDistance(it, targets, scaleData);
    const scale = d == null ? 0 : clamp((scaleData.neutralDistance - d) / scaleData.neutralDistance);
    const desc = described.get(v.id);
    const notes = [];
    if (desc) notes.push(`Because you wrote ${desc.matched.map((m) => `“${m}”`).join(", ")}.`);
    const where = d == null ? "" : sitsAt(it, targets, scaleData);
    if (where && scale > 0) notes.push(`Close to where you’d like to be: ${where}.${it.why ? ` ${it.why}` : ""}`);
    else if (where && scale < 0) notes.push(`Further from where you’d like to be: ${where}.`);
    out.set(v.id, { scale, description: desc?.part || 0, matched: desc?.matched || [], notes, score: weights.scale * scale + weights.description * (desc?.part || 0) });
  }
  return out;
}

/**
 * The values to suggest, as a choices badge: the best `max` scoring at least
 * `strong` are "Suggested", the rest from `threshold` up "Also fits"; ties
 * go to the one the description backs more. With no targets and no
 * description, none.
 *   const badge = valueSuggestions(scaleData, values, card.basics);
 */
export function valueSuggestions(scaleData, values, basics, tuning = TUNING.values) {
  const ranked = [...scoreValues(scaleData, values, basics, tuning)]
    .filter(([, s]) => s.score >= tuning.threshold)
    .sort((a, b) => b[1].score - a[1].score || b[1].description - a[1].description);
  let loud = 0;
  return badgeOf(new Map(ranked.map(([id, s]) => {
    const quiet = !(s.score >= tuning.strong && loud < tuning.max);
    if (!quiet) loud++;
    return [id, { notes: s.notes, quiet }];
  })));
}

/**
 * Each option's score for a card (see the top of this file), with its
 * parts and reasons: Map option id → { score, scale, value, size, notes }.
 * kind: "decision", "membership" or "conflict".
 */
export function scoreOptions(recs, kind, basics = {}, { weights } = TUNING) {
  const { scales } = recs;
  const { list } = KINDS[kind];
  const targets = basics.targetScales || {};
  const values = basics.values || [];
  const scored = scoredItems(scales, { includeProposed: COUNT_PROPOSED });
  const out = new Map();
  const at = (id) => out.get(id) || out.set(id, { scale: 0, value: 0, size: 0, notes: [] }).get(id);

  // scale fit: +1 at the targets, 0 at an average fit, down to −1
  for (const it of scored.values()) {
    if (it.list !== list) continue;
    const d = scaleDistance(it, targets, scales);
    if (d == null) continue;
    const s = at(it.option);
    s.scale = clamp((scales.neutralDistance - d) / scales.neutralDistance);
    const where = sitsAt(it, targets, scales);
    if (where && s.scale > 0) s.notes.push(`Close to where you’d like to be: ${where}.`);
    else if (where && s.scale < 0) s.notes.push(`Further from where you’d like to be: ${where}.`);
  }
  // value support: the strengths added up, ±2 = ±1
  for (const r of recs.links[kind]) {
    if (!values.includes(r.value)) continue;
    const s = at(r.recommends);
    s.value += r.strength / 2;
    s.notes.push(`${r.strength > 0 ? "Because" : "But"} you value *${recs.valueLabel[r.value] || r.value}*: ${r.why}`);
  }
  // size fit: ±2 = ±1
  if (basics.size) {
    for (const it of recs.sizeFit.values()) {
      if (it.list !== list || it[basics.size] == null || it[basics.size] === 0) continue;
      const s = at(it.option);
      s.size = it[basics.size] / 2;
      s.notes.push(`${s.size > 0 ? "Suits" : "Can strain at"} your size (${recs.sizeLabel[basics.size]}): ${it.why}`);
    }
  }
  for (const s of out.values()) s.score = weights.scale * s.scale + weights.value * clamp(s.value) + weights.size * s.size;
  return out;
}

/**
 * A card's suggestions for a module's lists: badge(kind) → a choices badge
 * ("Suggested" chips from tuning.strong, "Also fits" from tuning.threshold); any(kind) →
 * whether anything in that list has one; alike(kind) → a pick list's `alike` (the
 * "More like this" strip). kind: "decision", "membership" or "conflict".
 *   const recs = suggestionsFrom(data.recs, card.basics);
 * tuning: other weights and cut-offs (test-recs.html); TUNING otherwise.
 */
export function suggestionsFrom(recs, basics, tuning = TUNING) {
  const cache = new Map();
  const suggested = (kind) => {
    if (!cache.has(kind)) {
      const fits = [...scoreOptions(recs, kind, basics, tuning)].filter(([, s]) => s.score >= tuning.threshold);
      cache.set(kind, new Map(fits.map(([id, s]) => [id, { notes: s.notes, quiet: s.score < tuning.strong }])));
    }
    return cache.get(kind);
  };
  return {
    badge: (kind) => badgeOf(suggested(kind)),
    any: (kind) => suggested(kind).size > 0,
    /** For a pick list's `alike`: (id, options, chosen) → { like, fresh } in that kind's list. */
    alike: (kind) => (id, options, chosen) => alike(recs.scales, KINDS[kind].list, id, options, chosen),
  };
}

/**
 * "More like this / Try something new" for one item of a list (its scores in
 * governance_scales.json), among `options` (ids) that aren't `chosen`:
 * like — the 3 with the closest scores; fresh — the 2 with the most opposite
 * scores (among those scored on its scales) and 1 at random. An item with no
 * scores (or nothing scored to be opposite) gets random ones instead. The
 * random ones change each time.
 *   alike(scaleData, "decision_approaches", "sociocracy", ids, chosen) → { like: [id], fresh: [id] }
 */
export function alike(scaleData, list, id, options, chosen = []) {
  const scored = scoredItems(scaleData, { includeProposed: COUNT_PROPOSED });
  const of = (x) => scored.get(`${list}:${x}`);
  const me = of(id);
  const pool = options.filter((x) => x !== id && !chosen.includes(x));
  const random = (from, n) => [...from].sort(() => Math.random() - 0.5).slice(0, n);
  const mine = me && Object.fromEntries(scaleData.scales.filter((sc) => me[sc.id] != null).map((sc) => [sc.id, me[sc.id]]));
  if (!mine || !Object.keys(mine).length) return { like: [], fresh: random(pool, 3) };
  const byDistance = pool
    .map((x) => ({ x, d: scaleDistance(of(x) || {}, mine, scaleData) }))
    .sort((a, b) => a.d - b.d)
    .map((e) => e.x);
  const like = byDistance.slice(0, 3);
  const scoredOnMine = (x) => Object.keys(mine).some((sc) => of(x)?.[sc] != null);
  const far = byDistance.filter((x) => !like.includes(x) && scoredOnMine(x)).slice(-2).reverse();
  return { like, fresh: [...far, ...random(byDistance.filter((x) => !like.includes(x) && !far.includes(x)), 3 - far.length)] };
}

/**
 * Which values a description suggests (planned for Basics; tried out on
 * test-recs.html): each value's cues (value_groups.json, via loadValues)
 * found in the text. A cue matches whole words; a trailing * matches any
 * ending; a cue of two or more words counts 2, one word 1. A match with
 * "not", "no", "never", "without" or "n't" in the 3 words before it is
 * skipped. → [{ id, score, matched: [text as written] }], best first.
 *   cueMatches("We help each other…", values.items)
 */
export function cueMatches(text, values) {
  const NEGATION = /\b(not|no|never|without)\b|n['’]t\b/i;
  const found = [];
  for (const v of values) {
    let score = 0;
    const matched = [];
    for (const cue of v.cues || []) {
      const prefix = cue.endsWith("*");
      const words = cue.replace(/\*$/, "").trim();
      const pattern = new RegExp(`(?<![\\w'’])${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}${prefix ? "[\\w-]*" : "(?![\\w'’])"}`, "gi");
      for (const m of text.matchAll(pattern)) {
        const before = text.slice(0, m.index).split(/[.!?;\n]/).pop().trim().split(/\s+/).slice(-3).join(" ");
        if (NEGATION.test(before)) continue;
        score += words.includes(" ") ? 2 : 1;
        matched.push(m[0]);
        break;   // (each cue counts once)
      }
    }
    if (score) found.push({ id: v.id, score, matched });
  }
  return found.sort((a, b) => b.score - a.score);
}
