// Proposes word lists for the values (value_groups.json "cues"): the words
// and phrases that, found in a community's description, suggest a value.
// For each value: its distinctive words and two-word phrases (TF-IDF over
// the 69 values' names and descriptions, by stem: js/stem.js), compared with
// its current list: kept (in both), new (found), questionable (current
// single words common across many values, likely noise). Then measures
// both lists on the benchmark communities' descriptions.
//
//   node scripts/make-value-terms.mjs     → data/value_terms_proposed.json (reviewed in bench.html → Value groups)
//
// Nothing is changed in value_groups.json: accepted terms are merged by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { stem, words } from "../js/stem.js";
import { cueMatches } from "../js/recommend.js";   // the editor's own matching, so the measurement is what card makers get

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const values = read("values").items;
const groups = read("value_groups");
const bench = read("benchmark_communities").communities;
const drafted = read("value_phrases_drafted").items;   // everyday phrases, drafted for review
const ours = new Map(groups.items.map((g) => [g.id, g]));
const reword = (t) => (groups.rewordings || []).reduce((s, [a, b]) => s.replaceAll(a, b), t);

// common words, and the template words every CommunityRule description shares
const STOP = new Set(("a an and are as at be but by can do does for from has have how i if in into is it its may might more most must no not of on "
  + "or our ours out so such than that the their them then there these they this those to too up us very was we were what when where which who whom why will "
  + "with without within would you your all any each every other others some one ones also just like only own same both between over under about after before "
  + "again further once here than through during while being been get gets got make makes made use uses used way ways well many much even ever").split(" "));
const TEMPLATE = new Set("value values mean means tension goal goals acknowledge recognize recognise vs versus often trade off community communities member members group groups people everyone someone".split(" "));
const keep = (w) => w.length > 2 && !STOP.has(w) && !TEMPLATE.has(w) && !/^\d+$/.test(w);

// each value's text: its name and the first sentence of its description (ours where rewritten): the
// definition itself. The rest ("This may mean …", "There may be a tension with …") is examples and
// trade-offs, which made noisy phrases ("start meetings", "design spaces"); the "falling short" example is left out too
const firstSentence = (t) => t.split(/(?<=[.!?])\s+/)[0];
const docs = values.map((v) => ({ id: v.id, label: v.label, text: `${v.label}. ${firstSentence(reword(ours.get(v.id)?.description || v.description))}` }));
// terms: stems of single words, and two-word phrases of kept words next to each other
function terms(text) {
  const out = [];
  // phrases stay within a clause (no "images, wheelchair")
  for (const clause of text.split(/[.,;:()!?]/)) {
    const ws = words(clause);
    ws.forEach((w, i) => {
      if (keep(w)) out.push({ key: stem(w), shown: w });
      const n = ws[i + 1];
      if (n && keep(w) && keep(n)) out.push({ key: `${stem(w)} ${stem(n)}`, shown: `${w} ${n}` });
    });
  }
  return out;
}
const docTerms = docs.map((d) => terms(d.text));
const df = new Map();
for (const ts of docTerms) for (const k of new Set(ts.map((t) => t.key))) df.set(k, (df.get(k) || 0) + 1);
const N = docs.length;

// a cue as stems ("organiz*" → "organiz"; "help each other" → its words' stems)
const cueKey = (cue) => words(cue.replace(/\*$/, "")).map(stem).join(" ");

const items = docs.map((d, i) => {
  const counts = new Map();
  for (const t of docTerms[i]) {
    const c = counts.get(t.key) || { n: 0, shown: t.shown };
    c.n++; counts.set(t.key, c);
  }
  // CommunityRule's descriptions are built from examples ("wheelchair ramps", "stipends"), not from how
  // communities describe themselves, so single words mined from them are mostly noise (first run:
  // fewer core values found, twice the wrong ones). Proposed instead: the value's own name, in its
  // word forms, and at most 3 two-word phrases that are distinctive (TF-IDF, found in this value's text only).
  // the name as one term ("labor rights", not "labor" and "rights" apart)
  // (whole, as written: "community care", not "care"; "freedom of information", not "freedom information")
  const nameWords = words(d.label);
  const nameTerms = nameWords.length ? [{ key: nameWords.map(stem).join(" "), shown: nameWords.join(" ") }] : [];
  const phrases = [...counts].filter(([k]) => k.includes(" ") && df.get(k) === 1)
    .map(([k, c]) => ({ key: k, shown: c.shown, score: c.n * Math.log(N / df.get(k)) }))
    .sort((a, b) => b.score - a.score).slice(0, 3);
  const current = ours.get(d.id)?.cues || [];
  const currentKeys = new Map(current.map((c) => [cueKey(c), c]));
  const draftedNew = (drafted[d.id] || []).filter((t) => !currentKeys.has(cueKey(t)));
  const proposedKeys = new Set([...nameTerms.map((t) => t.key), ...(drafted[d.id] || []).map(cueKey)]);
  return {
    id: d.id,
    label: d.label,
    current,
    // current terms the name or the drafted phrases also cover
    kept: current.filter((c) => proposedKeys.has(cueKey(c))),
    // proposed: the value's name as a term, and the drafted everyday phrases (not yet in the list)
    new: [...nameTerms.filter((t) => !currentKeys.has(t.key)).map((t) => t.shown), ...draftedNew],
    // shown for reference only (not proposed): phrases from the definition, often fragments or off-target
    fromDefinition: phrases.map((t) => t.shown).filter((t) => !currentKeys.has(cueKey(t))),
    // single-word cues whose stem appears in many values' texts: likely to match too often
    // (never the value's own name, e.g. "openness" for Openness)
    questionable: current.filter((c) => !cueKey(c).includes(" ") && (df.get(cueKey(c)) || 0) >= 6 && !nameTerms.some((t) => t.key === cueKey(c))),
  };
});

// measuring, with the editor's matching: which values each benchmark description (purpose, culture, keywords) suggests
const textOf = (c) => `${c.description.purpose}. ${c.description.culture}. ${c.keywords.join(". ")}`;
const matches = (lists, text) => cueMatches(text, lists).map((m) => m.id);
const asList = (pick) => items.map((it) => ({ id: it.id, cues: pick(it) }));
const currentLists = asList((it) => it.current);
const proposedLists = asList((it) => [...it.current.filter((c) => !it.questionable.includes(c)), ...it.new]);
const benchmark = bench.map((c) => {
  const text = textOf(c);
  const ok = new Set([...c.expected.values.core, ...c.expected.values.also]);
  const score = (lists) => {
    const m = matches(lists, text);
    return { found: c.expected.values.core.filter((v) => m.includes(v)), other: m.filter((v) => !ok.has(v)) };
  };
  return { id: c.id, name: c.name, core: c.expected.values.core, current: score(currentLists), proposed: score(proposedLists) };
});
// for each value's terms: which benchmark descriptions they match where the community wouldn't choose that value
// (likely noise), so they're easy to spot when reviewing
for (const it of items) {
  const hits = (term) => bench.filter((c) => !new Set([...c.expected.values.core, ...c.expected.values.also]).has(it.id))
    .filter((c) => cueMatches(textOf(c), [{ id: it.id, cues: [term] }]).length).map((c) => c.name);
  it.misfires = Object.fromEntries([...it.current, ...it.new].map((t) => [t, hits(t)]).filter(([, h]) => h.length));
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  note: "Proposed by scripts/make-value-terms.mjs, for review in bench.html → Value groups. For each value: current (its word list in value_groups.json), kept (current terms the script also found), new (the value's own name as one term, and everyday phrases drafted by Claude in data/value_phrases_drafted.json), fromDefinition (for reference only, not proposed: distinctive two-word phrases from the first sentence of its description by TF-IDF; mining CommunityRule's text gave mostly fragments), questionable (current single words common across many values' texts, likely to match too often), misfires (terms that match a benchmark community that wouldn't choose the value). benchmark: for each benchmark community, the core values its description finds by words alone, with the current lists and with the proposed ones (current minus questionable, plus new), and any values found that it wouldn't choose. Nothing here is used until accepted terms are merged into value_groups.json.",
  items,
  benchmark,
};
writeFileSync(new URL("../data/value_terms_proposed.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
const sum = (k, f) => benchmark.reduce((n, b) => n + b[k][f].length, 0);
const cores = benchmark.reduce((n, b) => n + b.core.length, 0);
console.log(`Proposed terms for ${items.length} values: ${items.reduce((n, i) => n + i.new.length, 0)} new, ${items.reduce((n, i) => n + i.questionable.length, 0)} questionable.`);
console.log(`Benchmarks (${benchmark.length}), core values found by words alone: current ${sum("current", "found")}/${cores} (${sum("current", "other")} unexpected), proposed ${sum("proposed", "found")}/${cores} (${sum("proposed", "other")} unexpected).`);
