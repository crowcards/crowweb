// test-recs.html: the team's page for testing and tuning suggestions. Every
// result comes from js/recommend.js and the datasheets, as the editor uses
// them; only the inputs and settings are the page's own. Delete before launch.

import { el, chip, richText } from "./dom.js";
import { loadData, loadValues } from "./data.js";
import { loadRecommendations, scoreOptions, scoreValues, valueSuggestions, alike, TUNING, KINDS } from "./recommend.js";
import { DESCRIPTION } from "./sections/basics.js";
import { tabRow } from "./controls/tabs.js";

const [recs, values, enums, ...lists] = await Promise.all([
  loadRecommendations(), loadValues(), loadData("enums"),
  loadData("decision_approaches"), loadData("membership_options"), loadData("conflict_management"),
]);
const scales = recs.scales;
const NAMES = { decision: "Decision-making", membership: "Ways of joining", conflict: "Conflict" };
const labelsOf = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, Object.fromEntries(lists[i].items.map((it) => [it.id, it.label]))]));
const $ = (id) => document.getElementById(id);
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2);

// ── step 1: the community's answers ──
const size = $("tr-size");
size.append(el("option", { value: "", textContent: "Not set" }), ...enums.communitySize.map((s) => el("option", { value: s.id, textContent: s.label })));
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
  const items = values.items.filter((v) => v.group === g.id);
  if (!items.length) continue;
  $("tr-values").append(el("h4", { textContent: g.short || g.label }), ...items.map((v) => {
    const box = el("input", { type: "checkbox", value: v.id });
    valueBoxes.set(v.id, box);
    return el("label", {}, box, ` ${v.label}`);
  }));
}

// ── step 2: the settings, each a slider and a number, with what it does ──
const KNOBS = [
  { group: "Values", path: "values.weights.scale", name: "Scales: how much they count", hint: "How close a value points to where they'd like to be (from −1, far, to +1, close), times this.", max: 3 },
  { group: "Values", path: "values.weights.description", name: "Description: how much it counts", hint: "The value's words and phrases found in the description (a word ½, a phrase 1, at most 1), times this.", max: 3 },
  { group: "Values", path: "values.strong", name: "“Suggested” from", hint: "The best values with at least this score get the lime Suggested chip…", max: 4 },
  { group: "Values", path: "values.max", name: "…but at most this many", hint: "The rest of those get Also fits instead.", max: 10, step: "1" },
  { group: "Values", path: "values.threshold", name: "“Also fits” from", hint: "Any other value with at least this score gets the quieter Also fits chip.", max: 4 },
  { group: "Approaches", path: "weights.scale", name: "Scales: how much they count", hint: "How close an approach sits to where they'd like to be (from −1, far, to +1, close), times this.", max: 3 },
  { group: "Approaches", path: "weights.value", name: "Values: how much they count", hint: "Their chosen values arguing for or against an approach (−1 to +1), times this.", max: 3 },
  { group: "Approaches", path: "weights.size", name: "Size: how much it counts", hint: "How well an approach suits their size (−1 to +1), times this.", max: 3 },
  { group: "Approaches", path: "strong", name: "“Suggested” from", hint: "A score at least this gets the lime Suggested chip.", max: 4 },
  { group: "Approaches", path: "threshold", name: "“Also fits” from", hint: "A score at least this (and under Suggested) gets the quieter Also fits chip.", max: 4 },
];
const get = (obj, path) => path.split(".").reduce((o, k) => o[k], obj);
for (const k of KNOBS) {
  if (k.group !== KNOBS[KNOBS.indexOf(k) - 1]?.group) $("tr-tuning").append(el("h3", { textContent: k.group }));
  k.range = el("input", { type: "range", min: "0", max: String(k.max), step: k.step || "0.1" });
  k.number = el("input", { type: "number", min: "0", step: k.step || "0.1" });
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
    size: size.value || null,
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

// ── step 3: the results ──
const cell = (c, cls = "") => (c instanceof Node ? el("td", { className: cls }, c) : el("td", { className: cls, textContent: c ?? "" }));
const table = (heads, rows) => el("table", { className: "table" }, el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", { textContent: h })))), el("tbody", {}, ...rows));
/** A part of a score as a small bar from the middle (green for, pink against) and its number. */
function bar(value, scaleMax) {
  const w = `${Math.min(50, (Math.abs(value) / (scaleMax || 1)) * 50)}%`;
  return el("span", { className: "num" }, el("span", { className: "tr-bar" }, value ? el("i", { className: value > 0 ? "pos" : "neg", style: `width:${w}` }) : null), signed(value));
}
const tierChip = (tier) => (tier === "Suggested" ? chip("Suggested") : tier === "Also fits" ? chip("Also fits", { quiet: true }) : "");
/** Rows, best first, each { tier, cells }, with a dashed line where each tier ends (cuts: [Suggested's label, Also fits' label]). */
function withCuts(rows, cuts, columns) {
  const out = [];
  let shown = "Suggested";
  for (const r of rows) {
    if (shown === "Suggested" && r.tier !== "Suggested") { out.push(cutRow(cuts[0], columns)); shown = "Also fits"; }
    if (shown === "Also fits" && !r.tier) { out.push(cutRow(cuts[1], columns)); shown = ""; }
    out.push(el("tr", { className: r.tier ? "" : "below" }, ...r.cells));
  }
  return out;
}
const cutRow = (label, columns) => el("tr", { className: "cut" }, el("td", { colSpan: columns, textContent: `── ${label} ──` }));

// the approach tabs, one per list, each with its counts
let kindShown = "decision";
const kindTabs = tabRow({ label: "Approaches", tabs: Object.keys(KINDS).map((k) => ({ id: k, label: NAMES[k] })), scroll: true, onSelect: (k) => { kindShown = k; render(); } });
$("tr-approach-tabs").append(kindTabs.element);

function render() {
  const { basics, t } = readInputs();
  $("tr-value-count").textContent = basics.values.length;
  $("tr-formula").textContent = `approaches: score = ${t.weights.scale} × scales + ${t.weights.value} × values + ${t.weights.size} × size · Suggested ≥ ${t.strong} · Also fits ≥ ${t.threshold}`;

  // values: every value with something for it, best first (as the editor ranks them)
  const tv = t.values;
  const vScores = scoreValues(scales, values.items, basics, tv);
  const vBadge = valueSuggestions(scales, values.items, basics, tv);
  const vTier = (v) => vBadge(v)?.label || "";
  const ranked = values.items.filter((v) => vScores.get(v.id).score > 0 || vTier(v))
    .sort((a, b) => vScores.get(b.id).score - vScores.get(a.id).score || vScores.get(b.id).description - vScores.get(a.id).description);
  const n = (tier) => values.items.filter((v) => vTier(v) === tier).length;
  $("tr-values-summary").replaceChildren(el("span", {}, el("b", { textContent: n("Suggested") }), " Suggested"), el("span", {}, el("b", { textContent: n("Also fits") }), " Also fits"),
    el("span", { className: "field-hint", textContent: `score = ${tv.weights.scale} × scales + ${tv.weights.description} × description` }));
  const vMax = Math.max(tv.weights.scale, tv.weights.description);
  $("tr-value-tables").replaceChildren(ranked.length
    ? table(["Value", "Scales", "Description", "Score", "Chip", "Matched"], withCuts(ranked.map((v) => {
      const s = vScores.get(v.id);
      return { tier: vTier(v), cells: [cell(v.label), cell(bar(s.scale * tv.weights.scale, vMax)), cell(bar(s.description * tv.weights.description, vMax)), cell(signed(s.score), "num"), cell(tierChip(vTier(v))),
        cell(s.matched.map((m) => `“${m}”`).join(", "))] };
    }), [`Suggested: the best ${tv.max} from ${tv.strong}`, `Also fits from ${tv.threshold}`], 6))
    : el("p", { className: "field-hint", textContent: "Set the scales or write a description in step 1 to see these." }));

  // approaches: the counts on each tab, the open tab's table with the cut-off lines
  const tier = (s) => (s >= t.strong ? "Suggested" : s >= t.threshold ? "Also fits" : "");
  const all = Object.fromEntries(Object.keys(KINDS).map((k) => [k, [...scoreOptions(recs, k, basics, t)].sort((a, b) => b[1].score - a[1].score)]));
  for (const k of Object.keys(KINDS)) {
    const n = (name) => all[k].filter(([, s]) => tier(s.score) === name).length;
    kindTabs.tabOf(k).textContent = `${NAMES[k]} (${n("Suggested")} · ${n("Also fits")})`;
  }
  const maxW = Math.max(t.weights.scale, t.weights.value, t.weights.size);
  const rows = withCuts(all[kindShown].map(([id, s]) => ({ tier: tier(s.score), cells: [
    cell(labelsOf[kindShown][id] || id),
    cell(bar(s.scale * t.weights.scale, maxW)), cell(bar(Math.max(-1, Math.min(1, s.value)) * t.weights.value, maxW)), cell(bar(s.size * t.weights.size, maxW)),
    cell(signed(s.score), "num"), cell(tierChip(tier(s.score))),
    cell(s.notes.length ? el("details", {}, el("summary", { textContent: "why" }), ...s.notes.map((n) => el("p", {}, ...richText(n)))) : "")] })),
  [`Suggested from ${t.strong}`, `Also fits from ${t.threshold}`], 7);
  $("tr-approaches").replaceChildren(table(["Option", "Scales", "Values", "Size", "Score", "Chip", ""], rows));
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
  const { like, fresh } = alike(scales, a.list, alikeOption.value, Object.keys(a.labels), []);
  const tags = (ids) => (ids.length ? el("ul", { className: "tags plain-list" }, ...ids.map((id) => el("li", { className: "tag tag-soft", textContent: a.labels[id] || id }))) : el("p", { className: "field-hint", textContent: "None (no scores to compare)." }));
  $("tr-alike").replaceChildren(el("p", { className: "field-hint", textContent: "More like this" }), tags(like), el("p", { className: "field-hint", textContent: "Try something new" }), tags(fresh));
}
alikeList.addEventListener("change", fillAlikeOptions);
alikeOption.addEventListener("change", renderAlike);
fillAlikeOptions();

// ── wiring ──
document.querySelector(".tr-left").addEventListener("input", render);
$("tr-reset").addEventListener("click", () => { resetTuning(); render(); });
$("tr-clear").addEventListener("click", () => {
  size.value = ""; for (const [, s] of scaleInputs) s.value = ""; for (const [, a] of descInputs) a.value = ""; for (const b of valueBoxes.values()) b.checked = false;
  render();
});
$("tr-sample").addEventListener("click", () => {
  size.value = "medium";
  for (const [id, s] of scaleInputs) s.value = { participatory: "6", transparent: "6", hierarchical: "2" }[id];
  const sample = { purpose: "A home on the fediverse for gardeners, allotment holders and small growers in the river valley: seed swaps, harvest photos, free workshops for beginners and monthly work days", culture: "Warm and patient: we help each other, and everyone is welcome" };
  for (const [id, a] of descInputs) a.value = sample[id];
  for (const [id, b] of valueBoxes) b.checked = ["trust", "consensus", "transparency", "mutual_aid", "community_care"].includes(id);
  render();
});
