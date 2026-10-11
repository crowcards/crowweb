// bench.html: the team's workbench for suggestions, in tabs: what to
// review at each stage (with live counts from the files), the benchmark
// communities, the community type fit tables, the other datasheets the suggestions
// use (positions, value links, size fit, value groups: tables drawn by
// js/docs-reference.js), "Try it" (every result from js/recommend.js and the
// datasheets, as the editor uses them; only the inputs and settings are the
// page's own), and the community type fit tables. Delete before launch.

import { el, chip, richText } from "./dom.js";
import { loadData, loadValues } from "./data.js";
import { loadRecommendations, scoreList, alike, TUNING, KINDS } from "./recommend.js";
import { benchmarkScores as scoreBench, benchTotals, benchLine, benchMisses, LIST_KEY } from "./bench.js";
import { DESCRIPTION } from "./sections/basics.js";
import { tabRow } from "./controls/tabs.js";

const [recs, values, enums, ...lists] = await Promise.all([
  loadRecommendations(), loadValues(), loadData("enums"),
  loadData("decision_approaches"), loadData("membership_options"), loadData("conflict_management"),
]);
// (for the review tabs: the files as they are, statuses and all)
const [optionFlags, termsFile, typesFile, typeValues, typeApproaches, formatValues, bench, tiers, formats, heldout, tuningFile, formatApproaches, scaleFile, sizeFile, groupsFile, ...linkFiles] = await Promise.all([
  loadData("option_flags"), loadData("value_terms_proposed").catch(() => null), loadData("community_types"), loadData("type_value_fit"), loadData("type_approach_fit"), loadData("format_value_fit"),
  loadData("benchmark_communities"), loadData("membership_tiers"), loadData("formats"),
  loadData("benchmark_heldout"), loadData("tuning_results").catch(() => null), loadData("format_approach_fit"),
  loadData("governance_scales"), loadData("approach_size_fit"), loadData("value_groups"),
  ...Object.values(KINDS).map((k) => loadData(k.file)),
]);
const scales = recs.scales;
const NAMES = { decision: "Decision-making", membership: "Ways of joining", conflict: "Conflict" };
const labelsOf = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, Object.fromEntries(lists[i].items.map((it) => [it.id, it.label]))]));
const $ = (id) => document.getElementById(id);
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2);

// ── step 1: the community's answers ──
const size = $("tr-size");
size.append(el("option", { value: "", textContent: "Not set" }), ...enums.communitySize.map((s) => el("option", { value: s.id, textContent: s.label })));
// the community type, the format, and keywords (before the scales)
const selectRow = (label, options) => {
  const select = el("select", {}, el("option", { value: "", textContent: "Not set" }), ...options.map((o) => el("option", { value: o.id, textContent: o.label })));
  $("tr-scales").before(el("label", { className: "tr-row" }, el("span", { textContent: label }), select));
  return select;
};
const typeSel = selectRow("Community type", [...recs.types, { id: "other", label: "Other" }]);
const formatSel = selectRow("Format", Object.entries(recs.formatLabel).map(([id, label]) => ({ id, label })));
const keywordsIn = el("input", { type: "text", placeholder: "comma, separated" });
$("tr-scales").before(el("label", { className: "tr-row" }, el("span", { textContent: "Keywords" }), keywordsIn));
const scaleInputs = scales.scales.map((sc) => {
  const select = el("select", {}, el("option", { value: "", textContent: "Not set" }),
    ...sc.levels.map((t, i) => el("option", { value: String(scales.range.min + i), textContent: `${scales.range.min + i}: ${t}` })));
  $("tr-scales").append(el("label", { className: "tr-row" }, el("span", { textContent: sc.label }), select));
  return [sc.id, select];
});
const descInputs = DESCRIPTION.map((d) => {
  const area = el("textarea", { placeholder: d.hint });
  $("tr-description").append(el("label", { textContent: d.label }), area);
  return [d.id, area];
});
const valueBoxes = new Map();
for (const g of [...values.groups, { id: null, short: "No group" }]) {
  const items = values.items.filter((v) => v.group === g.id);   // (once each, under its main group)
  if (!items.length) continue;
  $("tr-values").append(el("h4", { textContent: g.short || g.label }), ...items.map((v) => {
    const box = el("input", { type: "checkbox", value: v.id });
    valueBoxes.set(v.id, box);
    return el("label", {}, box, ` ${v.label}`);
  }));
}

// ── step 2: the settings, each a slider and a number, with what it does ──
const KNOBS = [
  ...[["type", "Community type"], ["description", "Description and keywords"], ["scales", "Scales"], ["format", "Format"]].map(([k, n]) => ({ group: "Values", path: `values.weights.${k}`, name: n, hint: "How much this signal counts for values.", max: 3 })),
  { group: "Values", path: "values.max", name: "At most this many Suggested", hint: "The best values above the cut-off get Suggested; the rest See also.", max: 10, step: "1" },
  { group: "Values", path: "values.typeAlone", name: "Type alone is enough from", hint: "A community type signal at least this strong gets a value Suggested on its own (1 = a +2 mark).", max: 1 },
  ...Object.entries({ decision: "Decision-making", membership: "Ways of joining", conflict: "Conflict" }).flatMap(([kind, label]) =>
    [["type", "Community type"], ["values", "Values selected"], ["scales", "Scales"], ["size", "Size"], ["format", "Format"]].map(([k, n]) => ({ group: label, path: `${kind}.weights.${k}`, name: n, hint: `How much this signal counts for ${label.toLowerCase()}.`, max: 3 }))),
  { group: "Cut-offs", path: "suggested", name: "“Suggested” from", hint: "A score at least this, with at least 2 signals for it (approaches: one of them specific: type, values or description).", max: 1 },
  { group: "Cut-offs", path: "seeAlso", name: "“See also” from", hint: "A score at least this, with a signal for it (approaches: a specific one; the scales and size never earn a chip alone).", max: 1 },
  { group: "Cut-offs", path: "supportFrom", name: "A signal counts as “for” from", hint: "How strong a signal must be to count as support.", max: 1 },
];
const get = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
for (const k of KNOBS) {
  if (k.group !== KNOBS[KNOBS.indexOf(k) - 1]?.group) $("tr-tuning").append(el("h3", { textContent: k.group }));
  k.range = el("input", { type: "range", min: "0", max: String(k.max), step: k.step || "0.05" });
  k.number = el("input", { type: "number", min: "0", step: k.step || "0.05" });
  k.range.addEventListener("input", () => { k.number.value = k.range.value; });
  k.number.addEventListener("input", () => { k.range.value = k.number.value; });
  k.element = el("div", { className: "tr-knob" },
    el("div", { className: "tr-knob-top" }, el("span", { className: "tr-knob-name", textContent: k.name })),
    el("div", { className: "tr-knob-top" }, k.range, k.number),
    el("p", { className: "field-hint", textContent: `${k.hint} Editor: ${get(TUNING, k.path)}.` }));
  $("tr-tuning").append(k.element);
}
function resetTuning() { for (const k of KNOBS) k.range.value = k.number.value = get(TUNING, k.path); }
resetTuning();

function readInputs() {
  const basics = {
    type: typeSel.value || null,
    format: formatSel.value || null,
    size: size.value || null,
    keywords: keywordsIn.value.split(",").map((w) => w.trim()).filter(Boolean),
    targetScales: Object.fromEntries(scaleInputs.map(([id, s]) => [id, s.value ? Number(s.value) : null])),
    values: [...valueBoxes].filter(([, b]) => b.checked).map(([id]) => id),
    description: Object.fromEntries(descInputs.map(([id, a]) => [id, a.value])),
  };
  const t = structuredClone(TUNING);   // (then each setting as set here)
  for (const k of KNOBS) {
    const keys = k.path.split(".");
    const n = Number(k.number.value) || 0;
    keys.slice(0, -1).reduce((o, key) => o[key], t)[keys.at(-1)] = n;
    k.element.classList.toggle("changed", n !== get(TUNING, k.path));
  }
  return { basics, t };
}

// the benchmarks, scored with tuning t (js/bench.js)
const benchmarkScores = (t) => scoreBench(recs, bench.communities, t);

// ── step 3: the results ──
const cell = (c, cls = "") => (c instanceof Node ? el("td", { className: cls }, c) : el("td", { className: cls, textContent: c ?? "" }));
const table = (heads, rows) => el("table", { className: "table" }, el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", { textContent: h })))), el("tbody", {}, ...rows));
/** A signal as a small bar from the middle (green for, pink against) and its number; "" when absent. */
function bar(sig) {
  if (!sig) return el("span", { className: "field-hint", textContent: "—" });
  const w = `${Math.min(50, Math.abs(sig.value) * 50)}%`;
  return el("span", { className: "num", title: `weight ${sig.weight.toFixed(2)}` }, el("span", { className: "tr-bar" }, sig.value ? el("i", { className: sig.value > 0 ? "pos" : "neg", style: `width:${w}` }) : null), signed(sig.value));
}
const tierChip = (tier) => (tier === "suggested" ? chip("Suggested") : tier === "see" ? chip("See also", { quiet: true }) : tier === "gate" ? el("span", { className: "tr-avoid", textContent: "not a fit" }) : "");
const ORDER = { suggested: 0, see: 1, null: 2, gate: 3 };
/** Rows sorted by tier then score, with a dashed line where each tier ends. */
function tiered(entries, cells, columns, t) {
  const sorted = entries.sort((a, b) => ORDER[a[1].tier] - ORDER[b[1].tier] || b[1].score - a[1].score);
  const out = [];
  let last = "suggested";
  const label = { see: `Suggested: from ${t.suggested}, with 2 signals for it (approaches: one specific)`, null: `See also: from ${t.seeAlso}, with a signal for it (approaches: a specific one)`, gate: "Generally not a fit, or rarely a fit: no chip" };
  for (const [id, r] of sorted) {
    const tier = String(r.tier);
    if (ORDER[tier] > ORDER[last]) { for (const k of ["see", "null", "gate"]) if (ORDER[k] > ORDER[last] && ORDER[k] <= ORDER[tier]) out.push(el("tr", { className: "cut" }, el("td", { colSpan: columns, textContent: `── ${label[k]} ──` }))); last = tier; }
    out.push(el("tr", { className: r.tier && r.tier !== "gate" ? "" : "below" }, ...cells(id, r)));
  }
  return out;
}
const why = (r) => (r.notes.length ? el("details", {}, el("summary", { textContent: "why" }), ...r.notes.map((n) => el("p", {}, ...richText(n)))) : "");
const sigOf = (r, kind) => r.signals.find((s) => s.kind === kind);

// the approach tabs, one per list, each with its counts
let kindShown = "decision";
const kindTabs = tabRow({ label: "Approaches", tabs: Object.keys(KINDS).map((k) => ({ id: k, label: NAMES[k] })), scroll: true, onSelect: (k) => { kindShown = k; render(); } });
$("tr-approach-tabs").append(kindTabs.element);
const benchNow = el("p", { className: "tr-formula" });
$("tr-formula").after(benchNow);

function render() {
  const { basics, t } = readInputs();
  $("tr-value-count").textContent = basics.values.length;
  $("tr-formula").textContent = `score = the weighted average of the signals present · Suggested ≥ ${t.suggested} with 2 signals for it, one specific (type, values, description; values: or a type signal ≥ ${t.values.typeAlone} alone) · See also ≥ ${t.seeAlso} with one for it (approaches: specific)`;
  benchNow.textContent = `On the ${bench.communities.length} benchmarks, with these settings: ${benchLine(benchTotals(benchmarkScores(t)))}`;

  // values
  const vs = scoreList(recs, "values", basics, t);
  const n = (tier) => [...vs.values()].filter((r) => r.tier === tier).length;
  $("tr-values-summary").replaceChildren(el("span", {}, el("b", { textContent: n("suggested") }), " Suggested"), el("span", {}, el("b", { textContent: n("see") }), " See also"));
  const shown = [...vs].filter(([, r]) => r.signals.length || r.tier);
  $("tr-value-tables").replaceChildren(shown.length
    ? table(["Value", "Community type", "Description", "Scales", "Format", "Score", "For", "Chip", ""], tiered(shown, (id, r) => [cell(recs.valueLabel[id] || id),
      cell(bar(sigOf(r, "type"))), cell(bar(sigOf(r, "description"))), cell(bar(sigOf(r, "scales"))), cell(bar(sigOf(r, "format"))),
      cell(signed(r.score), "num"), cell(String(r.support), "num"), cell(tierChip(r.tier)), cell(why(r))], 9, t))
    : el("p", { className: "field-hint", textContent: "Fill in step 1 to see these." }));

  // approaches: the counts on each tab, the open tab's table
  const all = Object.fromEntries(Object.keys(KINDS).map((k) => [k, scoreList(recs, k, basics, t)]));
  for (const k of Object.keys(KINDS)) {
    const c = (tier) => [...all[k].values()].filter((r) => r.tier === tier).length;
    kindTabs.tabOf(k).textContent = `${NAMES[k]} (${c("suggested")} · ${c("see")})`;
  }
  const entries = [...all[kindShown]].filter(([, r]) => r.signals.length || r.tier);
  $("tr-approaches").replaceChildren(table(["Option", "Community type", "Values", "Scales", "Size", "Format", "Score", "For", "Chip", ""], tiered(entries, (id, r) => [cell(labelsOf[kindShown][id] || id),
    cell(bar(sigOf(r, "type"))), cell(bar(sigOf(r, "values"))), cell(bar(sigOf(r, "scales"))), cell(bar(sigOf(r, "size"))), cell(bar(sigOf(r, "format"))),
    cell(signed(r.score), "num"), cell(String(r.support), "num"), cell(tierChip(r.tier)), cell(why(r))], 10, t)));
}
kindTabs.start();

// ── more like this ──
const alikeList = $("tr-alike-list"), alikeOption = $("tr-alike-option");
const ALIKE = { ...Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, { list: v.list, name: NAMES[k], labels: labelsOf[k] }])),
  values: { list: "values", name: "Values", labels: Object.fromEntries(values.items.map((v) => [v.id, v.label])) } };
alikeList.append(...Object.entries(ALIKE).map(([k, a]) => el("option", { value: k, textContent: a.name })));
function fillAlikeOptions() {
  const a = ALIKE[alikeList.value];
  alikeOption.replaceChildren(...Object.entries(a.labels).sort((x, y) => x[1].localeCompare(y[1])).map(([id, label]) => el("option", { value: id, textContent: label })));
  renderAlike();
}
function renderAlike() {
  const a = ALIKE[alikeList.value];
  // with the answers on the left: as if this option were the only one selected
  const { basics, t } = readInputs();
  const id = alikeOption.value;
  const { like, fresh } = alike(recs, alikeList.value, scoreList(recs, alikeList.value, basics, t), { last: id, options: Object.keys(a.labels), chosen: [id], lastName: a.labels[id] });
  const tags = (picks) => (picks.length ? el("ul", { className: "plain-list" }, ...picks.map((p) => el("li", {}, el("span", { className: "tag tag-soft", textContent: a.labels[p.id] || p.id }), " ", el("span", { className: "field-hint", textContent: p.why })))) : el("p", { className: "field-hint", textContent: "None." }));
  $("tr-alike").replaceChildren(el("p", { className: "field-hint", textContent: "More like this" }), tags(like), el("p", { className: "field-hint", textContent: "Try something new" }), tags(fresh));
}
alikeList.addEventListener("change", fillAlikeOptions);
alikeOption.addEventListener("change", renderAlike);
fillAlikeOptions();

// ── wiring ──
document.querySelector(".tr-left").addEventListener("input", () => { render(); renderAlike(); });
$("tr-reset").addEventListener("click", () => { resetTuning(); render(); });
$("tr-clear").addEventListener("click", () => fillInputs({}));
/** Fill in step 1 (the sample, or a benchmark community's answers). */
function fillInputs({ type, format, keywords, size: sz, targetScales, description, values: chosen }) {
  typeSel.value = type || "";
  formatSel.value = format || "";
  keywordsIn.value = (keywords || []).join(", ");
  size.value = sz || "";
  for (const [id, s] of scaleInputs) s.value = targetScales?.[id] != null ? String(targetScales[id]) : "";
  for (const [id, a] of descInputs) a.value = description?.[id] || "";
  for (const [id, b] of valueBoxes) b.checked = (chosen || []).includes(id);
  render();
}
$("tr-sample").addEventListener("click", () => fillInputs({ type: "hobby", format: "social_network_media", keywords: ["gardening", "seed swaps"], size: "medium", targetScales: { participatory: 6, transparent: 6, hierarchical: 2 },
  description: { purpose: "A home on the fediverse for gardeners, allotment holders and small growers in the river valley: seed swaps, harvest photos, free workshops for beginners and monthly work days", culture: "Warm and patient: we help each other, and everyone is welcome" },
  values: ["trust", "consensus", "transparency", "mutual_aid", "community_care"] }));

// ── the tabs: what to review, the benchmarks, try it, type fit ──
const PANELS = [["overview", "What to review"], ["bench", "Benchmarks"], ["tune", "Tuning"], ["fit", "Type fit"], ["positions", "Positions"], ["links", "Value links"], ["size", "Size fit"], ["groups", "Value groups"], ["try", "Try it"]];
const pageTabs = tabRow({ label: "Workbench", key: "bench", tabs: PANELS.map(([id, label]) => ({ id, label })), scroll: true,
  onSelect: (id) => { for (const [p] of PANELS) $(`tr-p-${p}`).hidden = p !== id; } });
$("tr-tabs").append(pageTabs.element);

// ── what to review: the stages, with counts from the files ──
const statusCount = (items) => {
  const n = (st) => items.filter((it) => it.status === st).length;
  return `${items.length} · ${n("proposed")} in review, ${n("accepted")} accepted`;
};
const STAGES = [
  { title: "Now: tuning", now: true, rows: [
    ["Weights, cut-offs and rules", "Measured on the benchmarks, then checked on the held-out set (never tuned to). See RECOMMENDATIONS.md, “Tuning”.", tuningFile ? `searched ${tuningFile.generatedAt.slice(0, 10)}` : "not run yet", "Tuning tab"],
    ["Held-out communities", "10 example communities drafted by web Claude, used only to check.", statusCount(heldout.communities), "Tuning tab"],
  ] },
  { title: "Done: the data the suggestions use", rows: [
    ["Community types", "The kinds of group for the Community type field: names, descriptions, examples.", statusCount(typesFile.items), "Type fit tab"],
    ["Type × values", "How typical each value is for each community type.", statusCount(typeValues.items), "Type fit tab"],
    ["Type × approaches", "How well each approach suits each community type, with gate (generally not a fit) and interesting (rare but viable).", statusCount(typeApproaches.items), "Type fit tab"],
    ["Format × values", "Only where the online space says something about values.", statusCount(formatValues.items), "Value links tab"],
    ["Rarely a fit anywhere", "Options that are a poor fit almost everywhere, unless a community type says otherwise.", statusCount(optionFlags.items), "Type fit tab"],
    ["Positions on the scales", "Where each approach and value sits on Participatory, Transparent, Hierarchical (1–7).", statusCount(scaleFile.items), "Positions tab"],
    ["Values for and against approaches", "Which selected values argue for or against each approach (−2 … +2).", statusCount(linkFiles.flatMap((f) => f.items)), "Value links tab"],
    ["Size fit", "How well each approach suits each size (−2 … +2).", statusCount(sizeFile.items), "Size fit tab"],
    ["Value groups and word lists", "Each value's tabs, its words and phrases, 18 rewritten descriptions.", statusCount(groupsFile.items), "Value groups tab"],
    ["Benchmark communities", "Example communities and what they'd choose: the answer key.", statusCount(bench.communities), "Benchmarks tab"],
  ] },
];
$("tr-overview").replaceChildren(...STAGES.map((st) => el("div", { className: "tr-stage" },
  el("h3", { className: st.now ? "now" : "", textContent: st.title }),
  table(["What", "The question", "Status", "Where"], st.rows.map(([what, q, status, where]) => el("tr", {}, cell(what), cell(q), cell(status, "num"), cell(where)))))));

// ── the benchmark communities, one card each ──
const LISTS = { decision: "Decision-making", joining: "Joining", conflict: "Conflict" };
const listLabels = { decision: labelsOf.decision, joining: labelsOf.membership, conflict: labelsOf.conflict };
const nameOf = (list, id) => (list === "values" ? values.items.find((v) => v.id === id)?.label : listLabels[list][id]) || id;
const pretty = (id) => id.replace(/_/g, " ");
const pills = (list, ids, kind) => ids.map((id) => (kind === "avoid" ? el("span", { className: "tr-avoid", textContent: nameOf(list, id) }) : chip(nameOf(list, id), { quiet: kind === "also" })));
const tierLabel = (id) => tiers.tiers.find((t) => t.id === id)?.label || id;
const formatLabel = (id) => formats.items.find((t) => t.id === id)?.label || id;
$("tr-bench").classList.add("tr-bench");
// the scores with the editor's own settings (TUNING)
const benchNowEditor = benchmarkScores(TUNING);
$("tr-bench").before(el("div", { className: "tr-check" }, el("b", { textContent: "With the editor's settings: " }), benchLine(benchTotals(benchNowEditor)),
  el("span", { className: "field-hint", textContent: " Each card shows its own result. Try other settings in the Try it tab." })));
const scoreLine = (c) => {
  const r = benchNowEditor.find((x) => x.id === c.id);
  const part = (label, x) => `${label} ${x.suggested}/${x.good} good Suggested${x.see ? ` (+${x.see} See also)` : ""}${x.avoidChipped.length ? `, chip on ${x.avoidChipped.map((id) => nameOf(LIST_KEY_INV[label], id)).join(", ")}` : ""}`;
  return `Scored: values ${r.values.suggested}/${r.values.core} core Suggested${r.values.see ? ` (+${r.values.see} See also)` : ""} · ${part("Decisions", r.decision)} · ${part("Joining", r.membership)} · ${part("Conflict", r.conflict)}`;
};
const LIST_KEY_INV = { Decisions: "decision", Joining: "joining", Conflict: "conflict" };
$("tr-bench").replaceChildren(...bench.communities.map((c) => {
  const e = c.expected;
  const sc = c.targetScales;
  const tryIt = el("button", { type: "button", className: "link-button", textContent: "Try it with this →" });
  tryIt.addEventListener("click", () => { fillInputs({ type: c.type, format: c.format, keywords: c.keywords, size: c.size, targetScales: sc, description: c.description, values: e.values.core }); pageTabs.select("try"); scrollTo(0, 0); });
  return el("article", {},
    el("h3", { textContent: c.name }),
    el("p", { className: "meta", textContent: `${pretty(c.type)} · ${formatLabel(c.format)} · ${c.size.replace("_", " ")} · P${sc.participatory} T${sc.transparent} H${sc.hierarchical} · ${c.status}` }),
    el("p", { className: "quote" }, el("b", { textContent: "Purpose " }), c.description.purpose),
    el("p", { className: "quote" }, el("b", { textContent: "Culture " }), c.description.culture),
    el("dl", {},
      el("dt", { textContent: "Values" }), el("dd", {}, ...pills("values", e.values.core, "good"), ...pills("values", e.values.also, "also")),
      el("dt", { textContent: "Joins as" }), el("dd", { textContent: e.joiningTiers.map(tierLabel).join(", ") }),
      ...Object.entries(LISTS).flatMap(([k, label]) => [el("dt", { textContent: label }), el("dd", {}, ...pills(k, e[k].good, "good"), ...pills(k, e[k].also, "also"), ...pills(k, e[k].avoid, "avoid"))])),
    c.notes ? el("p", { className: "note", textContent: c.notes }) : null,
    el("p", { className: "note tr-score", textContent: scoreLine(c) }),
    el("p", { className: "note" }, tryIt));
}));

// ── tuning: the settings tried, on the benchmarks and the held-out set; and what's still missed ──
const SETS = [["Benchmarks (tuned on)", bench.communities], ["Held-out (check only)", heldout.communities]];
const totalsCells = (t) => SETS.flatMap(([, set]) => {
  const x = benchTotals(scoreBench(recs, set, t));
  return [cell(`${x.coreSug}/${x.core} (+${x.coreSee})`, "num"), cell(`${x.goodSug}/${x.good} (+${x.goodSee})`, "num"), cell(el("span", { className: x.avoid ? "tr-mark neg" : "", textContent: String(x.avoid) }), "num"), cell(String(x.chips), "num")];
});
const tuneHeads = ["Settings", ...SETS.flatMap(([n]) => [`${n}: values`, "approaches", "avoid chips", "chips / list"])];
$("tr-tune-table").replaceChildren(table(tuneHeads, [
  el("tr", {}, cell(el("b", { textContent: "The editor's (TUNING)" })), ...totalsCells(TUNING)),
  ...(tuningFile?.steps || []).map((st) => el("tr", {}, cell(`${st.label} (search, ${tuningFile.generatedAt.slice(0, 10)})`), ...totalsCells(st.tuning))),
]));
if (tuningFile) {
  const last = tuningFile.steps.at(-1).tuning;
  const changed = ["suggested", "seeAlso", "supportFrom"].filter((k) => last[k] !== TUNING[k]).map((k) => `${k} ${TUNING[k]} → ${last[k]}`);
  $("tr-tune-table").append(el("p", { className: "field-hint", textContent: changed.length ? `The search's cut-offs: ${changed.join(", ")}.` : "The search kept the editor's cut-offs." }));
}
// what the editor's settings still miss, and the to-avoid options that get a chip
const listName = (kind) => ({ values: "Values", ...NAMES })[kind];
const optName = (kind, id) => (kind === "values" ? nameOf("values", id) : labelsOf[kind][id]) || id;
const avoidRows = SETS.flatMap(([setName, set]) => set.flatMap((c) => {
  const basics = { type: c.type, format: c.format, size: c.size, targetScales: c.targetScales, description: c.description, keywords: c.keywords, values: c.expected.values.core };
  return Object.entries(LIST_KEY).flatMap(([kind, key]) => {
    const s = scoreList(recs, kind, basics, TUNING);
    return c.expected[key].avoid.filter((id) => ["suggested", "see"].includes(s.get(id)?.tier))
      .map((id) => el("tr", {}, cell(setName.split(" ")[0]), cell(c.name), cell(listName(kind)), cell(optName(kind, id)), cell(tierChip(s.get(id).tier)), cell(why(s.get(id)))));
  });
}));
$("tr-tune-avoid").replaceChildren(avoidRows.length ? table(["Set", "Community", "List", "Option", "Chip", ""], avoidRows) : el("p", { className: "field-hint", textContent: "None." }));
const missSet = $("tr-tune-miss-set");
missSet.append(...SETS.map(([n], i) => el("option", { value: String(i), textContent: n })));
function renderMisses() {
  const misses = benchMisses(recs, SETS[Number(missSet.value)][1], TUNING);
  const counts = Object.entries(misses.reduce((o, m) => ({ ...o, [m.why]: (o[m.why] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  $("tr-tune-misses").replaceChildren(
    el("p", { className: "field-hint", textContent: `${misses.length} good choices not Suggested: ${counts.map(([w, n]) => `${w} (${n})`).join(" · ")}.` }),
    table(["Community", "List", "Option", "Chip", "Score", "What held it back", "Signals"], misses.map((m) => el("tr", {},
      cell(m.community), cell(listName(m.list)), cell(optName(m.list, m.option)), cell(tierChip(m.tier)), cell(m.score.toFixed(2), "num"), cell(m.why),
      cell(m.signals.map((x) => `${x.kind} ${signed(x.value)}`).join(" · "))))));
}
missSet.addEventListener("change", renderMisses);
renderMisses();

// ── type fit: one community type at a time, checked against its benchmarks ──
const FIT_LISTS = [["values", "Values"], ["decision_approaches", "Decision-making"], ["membership_options", "Joining"], ["conflict_management", "Conflict"]];
const BENCH_KEY = { decision_approaches: "decision", membership_options: "joining", conflict_management: "conflict" };
const fitName = (list, id) => (list === "values" ? nameOf("values", id) : list === "decision_approaches" ? labelsOf.decision[id] : list === "membership_options" ? labelsOf.membership[id] : labelsOf.conflict[id]) || id;
const marksFor = (type, list) => (list === "values" ? typeValues.items.filter((m) => m.type === type).map((m) => ({ ...m, option: m.value }))
  : typeApproaches.items.filter((m) => m.type === type && m.list === list)).sort((a, b) => b.fit - a.fit);
const mark = (m) => el("span", { className: `tr-mark ${m.fit > 0 ? "pos" : m.fit < 0 ? "neg" : ""}`, textContent: m.fit > 0 ? `+${m.fit}` : m.fit < 0 ? `−${-m.fit}` : "0" });
const flagPill = (f) => (f === "gate" ? el("span", { className: "tr-avoid", textContent: "gate" }) : f === "interesting" ? chip("interesting", { quiet: true }) : "");
const fitSelect = $("tr-fit-type");
// each option's typical mark: the median over all community types (a blank counts as 0); the type
// signal is the difference from it (RECOMMENDATIONS.md, "The rebuild")
const typicalOf = (() => {
  const n = typesFile.items.length;
  const cache = new Map();
  return (list, option) => {
    const key = `${list}:${option}`;
    if (!cache.has(key)) {
      const ms = (list === "values" ? typeValues.items.filter((m) => m.value === option) : typeApproaches.items.filter((m) => m.list === list && m.option === option)).map((m) => m.fit);
      const all = [...ms, ...Array(n - ms.length).fill(0)].sort((a, b) => a - b);
      cache.set(key, (all[(n - 1) >> 1] + all[n >> 1]) / 2);
    }
    return cache.get(key);
  };
})();
const rarely = (list, option) => optionFlags.items.find((f) => f.list === list && f.option === option);
// changes since the first draft ("change": added / changed, and each file's "removed"), per community type
const removedFor = (type, list) => (list === "values" ? (typeValues.removed || []).filter((m) => m.type === type).map((m) => ({ ...m, option: m.value }))
  : (typeApproaches.removed || []).filter((m) => m.type === type && m.list === list));
const changeCount = (type) => FIT_LISTS.reduce((n, [list]) => n + marksFor(type, list).filter((m) => m.change).length + removedFor(type, list).length, 0);
fitSelect.append(...typesFile.items.map((st) => {
  const n = typeValues.items.filter((m) => m.type === st.id).length + typeApproaches.items.filter((m) => m.type === st.id).length;
  const ch = changeCount(st.id);
  return el("option", { value: st.id, textContent: `${st.status === "accepted" ? "✓ " : ""}${st.label} (${st.status === "accepted" ? "approved" : ch ? `${ch} change${ch === 1 ? "" : "s"} to review` : n ? `${n} marks` : "blank for now"})` });
}));
let fitShow = "changes";   // "changes" or "all"
function renderFit() {
  const st = typesFile.items.find((x) => x.id === fitSelect.value);
  // its benchmarks: anything they expect that the marks argue against, or that they avoid but the marks favour
  const problems = [];
  const weak = [];
  for (const c of bench.communities.filter((x) => x.type === st.id)) {
    const at = (list, id) => marksFor(st.id, list).find((m) => m.option === id);
    for (const v of c.expected.values.core) if (at("values", v)?.fit < 0) problems.push(`${c.name}: core value ${nameOf("values", v)} is marked against`);
    for (const [list, key] of Object.entries(BENCH_KEY)) {
      for (const id of c.expected[key].good) { const m = at(list, id); if (m && (m.fit < 0 || m.flag === "gate")) problems.push(`${c.name}: ${fitName(list, id)} is good, but marked against`); }
      for (const id of c.expected[key].avoid) {
        const m = at(list, id);
        if (m?.fit > 0) problems.push(`${c.name}: ${fitName(list, id)} is to avoid, but marked for`);
        else if (!rarely(list, id) && (!m || (m.flag !== "gate" && m.fit > -2))) weak.push(`${fitName(list, id)} (${m ? `marked ${m.fit}` : "not marked"})`);
      }
    }
  }
  const benches = bench.communities.filter((x) => x.type === st.id).map((c) => c.name);
  const check = el("div", { className: "tr-check" },
    el("b", { textContent: benches.length ? `Benchmark: ${benches.join(", ")}. ` : "No benchmark community for this type yet. " }),
    benches.length ? (problems.length ? `${problems.length} disagreement${problems.length === 1 ? "" : "s"}:` : "No disagreements.") : "",
    problems.length ? el("ul", {}, ...problems.map((p) => el("li", { textContent: p }))) : null,
    weak.length ? el("p", { className: "field-hint", textContent: `Could still get a chip: the benchmark says no chip for these, but they aren't gated, only marked mildly against or not at all. If the community's values, scales or size point towards one, it could still be suggested. The benchmark scores (once the scoring is built) will show which actually slip through: ${weak.join(", ")}.` }) : null);
  // what to show: only the changes since the first draft (added, changed, removed), or every mark
  const changes = changeCount(st.id);
  const show = changes ? fitShow : "all";
  const showRow = el("p", { className: "tr-approve" }, el("span", { className: "label", textContent: "Show" }), ...[["changes", `Changes only (${changes})`], ["all", "All marks"]].map(([id, label]) => {
    const b = el("button", { type: "button", className: `link-button${show === id ? " tr-on" : ""}`, textContent: label, disabled: id === "changes" && !changes });
    b.setAttribute("aria-pressed", String(show === id));
    b.addEventListener("click", () => { fitShow = id; renderFit(); });
    return b;
  }));
  const changeCell = (m) => (m.removed ? el("span", { className: "tr-avoid", textContent: "removed" })
    : m.change === "added" ? chip("new") : m.change === "changed" ? el("span", {}, chip("changed", { quiet: true }), el("span", { className: "tr-was" }, " was ", mark(m.was), m.was.flag ? ` ${m.was.flag}` : "", m.was.why !== m.why ? `: ${m.was.why}` : "")) : "");
  $("tr-fit").replaceChildren(...[
    el("p", { className: "quote" }, el("b", { textContent: `${st.label}: ` }), st.description, el("span", { className: "field-hint", textContent: ` E.g. ${st.examples}.` })),
    st.change ? el("p", { className: "field-hint" }, chip("changed", { quiet: true }), ` Was: ${st.was.description} E.g. ${st.was.examples}.`) : null,
    approveRow(st),
    check,
    showRow,
    el("div", { className: "tr-fit-grid" }, ...FIT_LISTS.map(([list, label]) => {
      const all = marksFor(st.id, list);
      const ms = [...(show === "changes" ? all.filter((m) => m.change) : all), ...removedFor(st.id, list).map((m) => ({ ...m, removed: true }))];
      return el("div", {}, el("h3", { textContent: show === "changes" ? `${label} (${ms.length} change${ms.length === 1 ? "" : "s"})` : `${label} (${all.length})` }),
        ms.length ? table(["Option", "Mark", "Typical", "", "Why", show === "changes" || ms.some((m) => m.change || m.removed) ? "Change" : ""], ms.map((m) => el("tr", { className: m.removed ? "below" : "" },
          cell(fitName(list, m.option)), cell(mark(m)), cell(m.flag ? "" : mark({ fit: typicalOf(list, m.option) })), cell(flagPill(m.flag)), cell(m.why), cell(changeCell(m)))))
          : el("p", { className: "field-hint", textContent: show === "changes" ? "No changes." : "No marks: no opinion for this community type (for now)." }));
    })),
  ].filter(Boolean));
}
/**
 * Copy a review command (the page can't write files: scripts/review.mjs does)
 * and say where to run it, in `out`.
 */
async function copyCommand(command, out) {
  try {
    await navigator.clipboard.writeText(command);
    out.replaceChildren("Copied: ", el("code", { textContent: command }), ". Run it in the crowweb folder, then reload this page.");
  } catch {
    out.replaceChildren("Run this in the crowweb folder, then reload this page: ", el("code", { textContent: command }));
  }
}

/**
 * Approve (or undo) a community type. The page can't write files, so the button
 * copies the command that does (scripts/review.mjs), to run in the crowweb
 * folder; reloading then shows it approved.
 */
function approveRow(st) {
  // (approving also settles the changes: scripts/review.mjs)
  const approved = st.status === "accepted";
  const command = `node scripts/review.mjs ${approved ? "unapprove" : "approve"} ${st.id}`;
  const out = el("span", { className: "field-hint" });
  const btn = el("button", { type: "button", className: approved ? "link-button" : "button button-small", textContent: approved ? "Undo approval" : "Approve this type" });
  btn.addEventListener("click", () => copyCommand(command, out));
  return el("p", { className: "tr-approve" },
    approved ? el("span", { className: "chip", textContent: "Approved" }) : el("span", { className: "label", textContent: "In review" }), " ", btn, " ", out);
}
fitSelect.addEventListener("change", renderFit);
renderFit();
$("tr-rarely").replaceChildren(table(["Option", "List", "Why", "Exceptions (a community type marks it for or interesting)"], optionFlags.items.map((f) => el("tr", {},
  cell(fitName(f.list, f.option)), cell(FIT_LISTS.find(([l]) => l === f.list)[1]), cell(f.why),
  cell(typeApproaches.items.filter((m) => m.list === f.list && m.option === f.option && m.fit > 0).map((m) => typesFile.items.find((s) => s.id === m.type).label).join(", ") || "none")))));
$("tr-format-fit").replaceChildren(table(["Format", "Value", "Mark", "Why"], formatValues.items.map((m) => el("tr", {}, cell(formatLabel(m.format)), cell(nameOf("values", m.value)), cell(mark(m)), cell(m.why)))));
$("tr-format-approach-fit").replaceChildren(table(["Format", "List", "Option", "Mark", "Why"], formatApproaches.items.map((m) => el("tr", {}, cell(formatLabel(m.format)), cell(FIT_LISTS.find(([l]) => l === m.list)[1]), cell(fitName(m.list, m.option)), cell(mark(m)), cell(m.why)))));

// ── proposed word lists (scripts/make-value-terms.mjs) ──
/** A button that copies the command accepting a value's proposed word list (or all of them). */
function acceptRow(id, label) {
  const out = el("span", { className: "field-hint" });
  const b = el("button", { type: "button", className: "link-button", textContent: label });
  b.addEventListener("click", () => copyCommand(`node scripts/review.mjs terms ${id} && node scripts/make-value-terms.mjs`, out));
  return el("span", { className: "tr-approve" }, b, out);
}
if (termsFile) {
  const total = (k, f) => termsFile.benchmark.reduce((n, b) => n + b[k][f].length, 0);
  const cores = termsFile.benchmark.reduce((n, b) => n + b.core.length, 0);
  const termPills = (ts, kind) => (ts.length ? ts.map((t) => (kind === "avoid" ? el("span", { className: "tr-avoid", textContent: t }) : chip(t, { quiet: kind === "also" }))) : ["—"]);
  $("tr-terms").replaceChildren(
    el("div", { className: "tr-check" }, el("b", { textContent: "A test on the example communities: " }),
      `using only the word lists (no community type or scales), their Purpose, Culture and keywords find ${total("current", "found")} of their ${cores} core values with today's lists, and ${total("proposed", "found")} with the proposed lists; `,
      `values they wouldn't choose come up ${total("current", "other")} times today, ${total("proposed", "other")} with the proposal. `,
      el("span", { className: "field-hint", textContent: `Low numbers are expected: people rarely describe their community in the values' own words, which is what the type and scales signals are for. Details per community at the bottom. Generated ${termsFile.generatedAt}.` })),
    acceptRow("all", "Accept all proposals"),
    el("p", { className: "field-hint" }, "In the word list: ", chip("new", {}), " = added by the proposal; ", chip("today", { quiet: true }), " = already in the list. Questionable words would be dropped."),
    el("div", { className: "tr-fit-grid" }, el("div", {}, table(["Value", "Word list (proposed)", "Questionable", "Misfires", "Description", ""], termsFile.items.map((it) => {
      // the whole list after accepting: today's words (minus questionable), then the new ones
      const stays = it.current.filter((c) => !it.questionable.includes(c));
      return el("tr", {},
        cell(it.label),
        el("td", {}, ...termPills(stays, "also"), ...(it.new.length ? termPills(it.new, "good") : [])),
        el("td", {}, ...(it.questionable.length ? termPills(it.questionable, "avoid") : ["—"])),
        cell(Object.entries(it.misfires).map(([t, h]) => `“${t}”: ${h.join(", ")}`).join("; ") || "—"),
        cell(values.items.find((v) => v.id === it.id)?.description || ""),
        el("td", {}, acceptRow(it.id, "Accept")));
    })))),
    el("h3", { textContent: "The test, community by community" }),
    el("p", { className: "field-hint", textContent: "Each example community's core values (from the Benchmarks tab), which of them its own words find with today's word lists and with the proposed ones, and which values the proposed lists suggest that it wouldn't choose (likely noise to trim)." }),
    table(["Community", "Core values", "Found today", "Found with the proposal", "Suggested, but not theirs"], termsFile.benchmark.map((b) => el("tr", {},
      cell(b.name), cell(b.core.map((v) => nameOf("values", v)).join(", ")),
      cell(b.current.found.map((v) => nameOf("values", v)).join(", ") || "—"), cell(b.proposed.found.map((v) => nameOf("values", v)).join(", ") || "—"),
      cell(b.proposed.other.map((v) => nameOf("values", v)).join(", ") || "—")))));
} else $("tr-terms").replaceChildren(el("p", { className: "field-hint", textContent: "No proposals yet: run node scripts/make-value-terms.mjs." }));
pageTabs.start();
