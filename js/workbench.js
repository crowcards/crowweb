// bench.html: the team's workbench for suggestions, in tabs: a log of what
// was worked on and approved; the example communities, scored; the fit
// tables (community type, format, size); the positions, value scores and
// word lists (tables mostly drawn by js/docs-reference.js); review cases,
// rated by people (kept in this browser, handed in as files); and "Try it"
// (every result from js/recommend.js and the datasheets, as the editor uses
// them; only the inputs are the page's own). Delete before launch.

import { el, chip, richText } from "./dom.js";
import { loadData, loadValues } from "./data.js";
import { loadRecommendations, scoreList, alike, TUNING, KINDS } from "./recommend.js";
import { benchmarkScores, benchTotals, benchLine, basicsOf, LIST_KEY } from "./bench.js";
import { DESCRIPTION } from "./sections/basics.js";
import { tabRow } from "./controls/tabs.js";
import { foldSection } from "./controls/fold.js";
import { confirmPopup } from "./popup.js";

const [recs, values, enums, ...lists] = await Promise.all([
  loadRecommendations(), loadValues(), loadData("enums"),
  loadData("decision_approaches"), loadData("membership_options"), loadData("conflict_management"),
]);
// (the files as they are, statuses and all)
const [optionFlags, termsFile, typesFile, typeValues, typeApproaches, formatValues, formatApproaches, bench, heldout, reviewFile, tiers, formats, logFile] = await Promise.all([
  loadData("option_flags"), loadData("value_terms_proposed").catch(() => null), loadData("community_types"), loadData("type_value_fit"), loadData("type_approach_fit"),
  loadData("format_value_fit"), loadData("format_approach_fit"), loadData("benchmark_communities"), loadData("benchmark_heldout"),
  loadData("review_cases").catch(() => null), loadData("membership_tiers"), loadData("formats"), loadData("workbench_log"),
]);
const scales = recs.scales;
const NAMES = { decision: "Decision-making", membership: "Ways of joining", conflict: "Conflict" };
const labelsOf = Object.fromEntries(Object.keys(KINDS).map((k, i) => [k, Object.fromEntries(lists[i].items.map((it) => [it.id, it.label]))]));
const $ = (id) => document.getElementById(id);
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(2);
const cell = (c, cls = "") => (c instanceof Node ? el("td", { className: cls }, c) : el("td", { className: cls, textContent: c ?? "" }));
const table = (heads, rows) => el("table", { className: "table" }, el("thead", {}, el("tr", {}, ...heads.map((h) => el("th", { textContent: h })))), el("tbody", {}, ...rows));
const why = (r) => (r.notes.length ? el("details", {}, el("summary", { textContent: "why" }), ...r.notes.map((n) => el("p", {}, ...richText(n)))) : "");
const nameOf = (list, id) => (list === "values" ? recs.valueLabel[id] : labelsOf[list][id]) || id;
const formatLabel = (id) => formats.items.find((t) => t.id === id)?.label || id;
const typeLabel = (id) => typesFile.items.find((t) => t.id === id)?.label || id;
/** A community's type, format, size and scales, in one line. */
const metaLine = (c) => [typeLabel(c.type), formatLabel(c.format), c.size?.replace("_", " "), c.targetScales && `P${c.targetScales.participatory} T${c.targetScales.transparent} H${c.targetScales.hierarchical}`].filter(Boolean).join(" · ");
/** A row of small buttons, one of them pressed (or none): clicking the pressed one unpresses it. */
function pickRow(options, current, onPick) {
  return el("span", { className: "tr-approve" }, ...options.map(([id, label]) => {
    const b = el("button", { type: "button", className: `link-button${current === id ? " tr-on" : ""}`, textContent: label });
    b.setAttribute("aria-pressed", String(current === id));
    b.addEventListener("click", () => onPick(current === id ? null : id));
    return b;
  }));
}

// ── the tabs, and the rows of tabs inside them (each .tr-lists over its .tr-list sections) ──
const PANELS = [["log", "Log"], ["bench", "Benchmarks"], ["fit", "Fit"], ["positions", "Positions"], ["links", "Value scores"], ["groups", "Value word lists"], ["review", "Review cases"], ["try", "Try it"]];
const pageTabs = tabRow({ label: "Workbench", key: "bench", tabs: PANELS.map(([id, label]) => ({ id, label })), scroll: true,
  onSelect: (id) => { for (const [p] of PANELS) $(`tr-p-${p}`).hidden = p !== id; } });
$("tr-tabs").append(pageTabs.element);
for (const box of document.querySelectorAll(".tr-lists")) {
  const parts = [...box.querySelectorAll(":scope > .tr-list")];
  const row = tabRow({ label: box.dataset.label, key: `bench:${box.id}`, tabs: parts.map((p, i) => ({ id: String(i), label: p.dataset.tab })), scroll: true,
    onSelect: (i) => parts.forEach((p, j) => { p.hidden = String(j) !== i; }) });
  box.prepend(row.element);
  row.start();
}

// ── log ──
$("tr-log").replaceChildren(table(["Date", "What", "Who"], logFile.entries.map((e) => el("tr", {}, cell(e.date), cell(e.text), cell(e.by)))));

// ── try it: step 1, the community's answers ──
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

function readInputs() {
  return {
    type: typeSel.value || null,
    format: formatSel.value || null,
    size: size.value || null,
    keywords: keywordsIn.value.split(",").map((w) => w.trim()).filter(Boolean),
    targetScales: Object.fromEntries(scaleInputs.map(([id, s]) => [id, s.value ? Number(s.value) : null])),
    values: [...valueBoxes].filter(([, b]) => b.checked).map(([id]) => id),
    description: Object.fromEntries(descInputs.map(([id, a]) => [id, a.value])),
  };
}
/** Fill in step 1 with a community's answers (an example, a review case, or one from a file), or empty them. */
function fillInputs(c = {}) {
  const b = basicsOf(c);
  typeSel.value = b.type || "";
  formatSel.value = b.format || "";
  keywordsIn.value = b.keywords.join(", ");
  size.value = b.size || "";
  for (const [id, s] of scaleInputs) s.value = b.targetScales?.[id] != null ? String(b.targetScales[id]) : "";
  for (const [id, a] of descInputs) a.value = b.description?.[id] || "";
  for (const [id, box] of valueBoxes) box.checked = b.values.includes(id);
  render();
  renderAlike();
}

// the communities to start from: the examples, the review cases, and any loaded from a file
const sources = [["Benchmarks", bench.communities], ["Held-out", heldout.communities], ...(reviewFile ? [["Review cases", reviewFile.communities]] : [])];
const pick = $("tr-pick");
function fillPicker(selected = "") {
  pick.replaceChildren(el("option", { value: "", textContent: "Start from a community…" }),
    ...sources.map(([name, cs], i) => el("optgroup", { label: `${name} (${cs.length})` }, ...cs.map((c, j) => el("option", { value: `${i}:${j}`, textContent: c.name })))));
  pick.value = selected;
}
fillPicker();
const picked = () => { const [i, j] = pick.value.split(":").map(Number); return pick.value ? sources[i][1][j] : null; };
pick.addEventListener("change", () => {
  const c = picked();
  if (!c) return;
  fillInputs(c);
  $("tr-pick-note").hidden = !c.notes;
  $("tr-pick-note").textContent = c.notes || "";
});
/** Open "Try it" with this community's answers. */
function tryCommunity(c) {
  for (const [i, [, cs]] of sources.entries()) { const j = cs.indexOf(c); if (j >= 0) pick.value = `${i}:${j}`; }
  pick.dispatchEvent(new Event("change"));
  pageTabs.select("try");
  scrollTo(0, 0);
}
const tryButton = (c) => {
  const b = el("button", { type: "button", className: "link-button", textContent: "Try it with this →" });
  b.addEventListener("click", () => tryCommunity(c));
  return b;
};
/** Read JSON files chosen in a file input: [{ name, data }], or an error naming the file. */
const readFiles = (input) => Promise.all([...input.files].map(async (f) => {
  try { return { name: f.name, data: JSON.parse(await f.text()) }; } catch { throw new Error(`${f.name} isn't a JSON file.`); }
}));
$("tr-pick-file").addEventListener("change", async (e) => {
  const note = $("tr-pick-note");
  try {
    const [{ name, data }] = await readFiles(e.target);
    const cs = (Array.isArray(data) ? data : data.communities || []).filter((c) => c?.id && c.name);
    if (!cs.length) throw new Error(`${name} has no communities (each needs an id and a name).`);
    sources.push([name, cs]);
    fillPicker(`${sources.length - 1}:0`);
    pick.dispatchEvent(new Event("change"));
    note.hidden = false;
    note.textContent = `Loaded ${cs.length} from ${name}: pick one above.`;
  } catch (err) { note.hidden = false; note.textContent = err.message; }
  e.target.value = "";
});
$("tr-clear").addEventListener("click", () => { pick.value = ""; $("tr-pick-note").hidden = true; fillInputs(); });

// ── try it: step 2, the results ──
/** A signal as a small bar from the middle (green for, pink against) and its number; "" when absent. */
function bar(sig) {
  if (!sig) return el("span", { className: "field-hint", textContent: "—" });
  const w = `${Math.min(50, Math.abs(sig.value) * 50)}%`;
  return el("span", { className: "num", title: `weight ${sig.weight.toFixed(2)}` }, el("span", { className: "tr-bar" }, sig.value ? el("i", { className: sig.value > 0 ? "pos" : "neg", style: `width:${w}` }) : null), signed(sig.value));
}
const tierChip = (tier) => (tier === "suggested" ? chip("Suggested") : tier === "see" ? chip("See also", { quiet: true }) : tier === "gate" ? el("span", { className: "tr-avoid", textContent: "not a fit" }) : "");
const ORDER = { suggested: 0, see: 1, null: 2, gate: 3 };
/** Rows sorted by tier then score, with a dashed line where each tier ends. */
function tiered(entries, cells, columns) {
  const sorted = entries.sort((a, b) => ORDER[a[1].tier] - ORDER[b[1].tier] || b[1].score - a[1].score);
  const out = [];
  let last = "suggested";
  const label = { see: `Suggested: from ${TUNING.suggested}, with 2 signals for it (approaches: one specific)`, null: `See also: from ${TUNING.seeAlso}, with a signal for it (approaches: a specific one)`, gate: "Generally not a fit, or rarely a fit: no chip" };
  for (const [id, r] of sorted) {
    const tier = String(r.tier);
    if (ORDER[tier] > ORDER[last]) { for (const k of ["see", "null", "gate"]) if (ORDER[k] > ORDER[last] && ORDER[k] <= ORDER[tier]) out.push(el("tr", { className: "cut" }, el("td", { colSpan: columns, textContent: `── ${label[k]} ──` }))); last = tier; }
    out.push(el("tr", { className: r.tier && r.tier !== "gate" ? "" : "below" }, ...cells(id, r)));
  }
  return out;
}
const sigOf = (r, kind) => r.signals.find((s) => s.kind === kind);
$("tr-formula").textContent = `The editor's settings (TUNING in js/recommend.js): score = the weighted average of the signals present · Suggested ≥ ${TUNING.suggested} with 2 signals for it, one specific (type, values, description; values: or a type signal ≥ ${TUNING.values.typeAlone} alone) · See also ≥ ${TUNING.seeAlso} with one for it (approaches: specific). On the ${bench.communities.length} benchmarks: ${benchLine(benchTotals(benchmarkScores(recs, bench.communities, TUNING)))}`;

// the approach tabs, one per list, each with its counts
let kindShown = "decision";
const kindTabs = tabRow({ label: "Approaches", tabs: Object.keys(KINDS).map((k) => ({ id: k, label: NAMES[k] })), scroll: true, onSelect: (k) => { kindShown = k; render(); } });
$("tr-approach-tabs").append(kindTabs.element);

function render() {
  const basics = readInputs();
  $("tr-value-count").textContent = basics.values.length;
  // values
  const vs = scoreList(recs, "values", basics);
  const n = (tier) => [...vs.values()].filter((r) => r.tier === tier).length;
  $("tr-values-summary").replaceChildren(el("span", {}, el("b", { textContent: n("suggested") }), " Suggested"), el("span", {}, el("b", { textContent: n("see") }), " See also"));
  const shown = [...vs].filter(([, r]) => r.signals.length || r.tier);
  $("tr-value-tables").replaceChildren(shown.length
    ? table(["Value", "Community type", "Description", "Scales", "Format", "Score", "For", "Chip", ""], tiered(shown, (id, r) => [cell(nameOf("values", id)),
      cell(bar(sigOf(r, "type"))), cell(bar(sigOf(r, "description"))), cell(bar(sigOf(r, "scales"))), cell(bar(sigOf(r, "format"))),
      cell(signed(r.score), "num"), cell(String(r.support), "num"), cell(tierChip(r.tier)), cell(why(r))], 9))
    : el("p", { className: "field-hint", textContent: "Fill in step 1 to see these." }));

  // approaches: the counts on each tab, the open tab's table
  const all = Object.fromEntries(Object.keys(KINDS).map((k) => [k, scoreList(recs, k, basics)]));
  for (const k of Object.keys(KINDS)) {
    const c = (tier) => [...all[k].values()].filter((r) => r.tier === tier).length;
    kindTabs.tabOf(k).textContent = `${NAMES[k]} (${c("suggested")} · ${c("see")})`;
  }
  const entries = [...all[kindShown]].filter(([, r]) => r.signals.length || r.tier);
  $("tr-approaches").replaceChildren(table(["Option", "Community type", "Values", "Scales", "Size", "Format", "Score", "For", "Chip", ""], tiered(entries, (id, r) => [cell(nameOf(kindShown, id)),
    cell(bar(sigOf(r, "type"))), cell(bar(sigOf(r, "values"))), cell(bar(sigOf(r, "scales"))), cell(bar(sigOf(r, "size"))), cell(bar(sigOf(r, "format"))),
    cell(signed(r.score), "num"), cell(String(r.support), "num"), cell(tierChip(r.tier)), cell(why(r))], 10)));
}
kindTabs.start();

// ── more like this ──
const alikeList = $("tr-alike-list"), alikeOption = $("tr-alike-option");
const ALIKE = { ...Object.fromEntries(Object.keys(KINDS).map((k) => [k, { name: NAMES[k], labels: labelsOf[k] }])),
  values: { name: "Values", labels: Object.fromEntries(values.items.map((v) => [v.id, v.label])) } };
alikeList.append(...Object.entries(ALIKE).map(([k, a]) => el("option", { value: k, textContent: a.name })));
function fillAlikeOptions() {
  const a = ALIKE[alikeList.value];
  alikeOption.replaceChildren(...Object.entries(a.labels).sort((x, y) => x[1].localeCompare(y[1])).map(([id, label]) => el("option", { value: id, textContent: label })));
  renderAlike();
}
function renderAlike() {
  const a = ALIKE[alikeList.value];
  // with the answers on the left: as if this option were the only one selected
  const id = alikeOption.value;
  const { like, fresh } = alike(recs, alikeList.value, scoreList(recs, alikeList.value, readInputs()), { last: id, options: Object.keys(a.labels), chosen: [id], lastName: a.labels[id] });
  const tags = (picks) => (picks.length ? el("ul", { className: "plain-list" }, ...picks.map((p) => el("li", {}, el("span", { className: "tag tag-soft", textContent: a.labels[p.id] || p.id }), " ", el("span", { className: "field-hint", textContent: p.why })))) : el("p", { className: "field-hint", textContent: "None." }));
  $("tr-alike").replaceChildren(el("p", { className: "field-hint", textContent: "More like this" }), tags(like), el("p", { className: "field-hint", textContent: "Try something new" }), tags(fresh));
}
alikeList.addEventListener("change", fillAlikeOptions);
alikeOption.addEventListener("change", renderAlike);
fillAlikeOptions();
document.querySelector(".tr-left").addEventListener("input", () => { render(); renderAlike(); });

// ── the example communities, one card each, scored with the editor's settings ──
const LISTS = { decision: "Decision-making", joining: "Joining", conflict: "Conflict" };
const LIST_OF = { decision: "decision", joining: "membership", conflict: "conflict" };   // (the benchmark's key → the list's kind)
const pills = (list, ids, kind) => ids.map((id) => (kind === "avoid" ? el("span", { className: "tr-avoid", textContent: nameOf(list, id) }) : chip(nameOf(list, id), { quiet: kind === "also" })));
const tierLabel = (id) => tiers.tiers.find((t) => t.id === id)?.label || id;
const BENCH_SETS = [["Benchmarks (18, shaped the datasheets)", bench.communities], ["Held-out (10, for checking only)", heldout.communities]];
$("tr-bench-set").append(...BENCH_SETS.map(([name], i) => el("option", { value: String(i), textContent: name })));
function renderBench() {
  const communities = BENCH_SETS[Number($("tr-bench-set").value)][1];
  const scores = benchmarkScores(recs, communities, TUNING);
  const scoreLine = (r) => [`Scored: values ${r.values.suggested}/${r.values.core} core Suggested${r.values.see ? ` (+${r.values.see} See also)` : ""}`,
    ...Object.entries(LIST_KEY).map(([kind, key]) => {
      const x = r[kind];
      return `${LISTS[key]} ${x.suggested}/${x.good} good Suggested${x.see ? ` (+${x.see} See also)` : ""}${x.avoidChipped.length ? `, chip on ${x.avoidChipped.map((id) => nameOf(kind, id)).join(", ")}` : ""}`;
    })].join(" · ");
  $("tr-bench").replaceChildren(
    el("div", { className: "tr-check" }, el("b", { textContent: "With the editor's settings: " }), benchLine(benchTotals(scores))),
    el("div", { className: "tr-bench" }, ...communities.map((c, i) => {
      const e = c.expected;
      return el("article", {},
        el("h3", { textContent: c.name }),
        el("p", { className: "meta", textContent: metaLine(c) }),
        el("p", { className: "quote" }, el("b", { textContent: "Purpose " }), c.description.purpose),
        el("p", { className: "quote" }, el("b", { textContent: "Culture " }), c.description.culture),
        el("dl", {},
          el("dt", { textContent: "Values" }), el("dd", {}, ...pills("values", e.values.core, "good"), ...pills("values", e.values.also, "also")),
          el("dt", { textContent: "Joins as" }), el("dd", { textContent: e.joiningTiers.map(tierLabel).join(", ") }),
          ...Object.entries(LISTS).flatMap(([k, label]) => [el("dt", { textContent: label }), el("dd", {}, ...pills(LIST_OF[k], e[k].good, "good"), ...pills(LIST_OF[k], e[k].also, "also"), ...pills(LIST_OF[k], e[k].avoid, "avoid"))])),
        c.notes ? el("p", { className: "note", textContent: c.notes }) : null,
        el("p", { className: "note", textContent: scoreLine(scores[i]) }),
        el("p", { className: "note" }, tryButton(c)));
    })));
}
$("tr-bench-set").addEventListener("change", renderBench);
renderBench();

// ── fit: one community type at a time, checked against its example communities ──
const FIT_LISTS = [["values", "Values"], ["decision_approaches", "Decision-making"], ["membership_options", "Joining"], ["conflict_management", "Conflict"]];
const KIND_OF = { values: "values", decision_approaches: "decision", membership_options: "membership", conflict_management: "conflict" };
const BENCH_KEY = { decision_approaches: "decision", membership_options: "joining", conflict_management: "conflict" };
const fitName = (list, id) => nameOf(KIND_OF[list], id);
const listName = (list) => FIT_LISTS.find(([l]) => l === list)[1];
const marksFor = (type, list) => (list === "values" ? typeValues.items.filter((m) => m.type === type).map((m) => ({ ...m, option: m.value }))
  : typeApproaches.items.filter((m) => m.type === type && m.list === list)).sort((a, b) => b.fit - a.fit);
const mark = (m) => el("span", { className: `tr-mark ${m.fit > 0 ? "pos" : m.fit < 0 ? "neg" : ""}`, textContent: m.fit > 0 ? `+${m.fit}` : m.fit < 0 ? `−${-m.fit}` : "0" });
const flagPill = (f) => (f === "gate" ? el("span", { className: "tr-avoid", textContent: "gate" }) : f === "interesting" ? chip("interesting", { quiet: true }) : "");
const fitSelect = $("tr-fit-type");
// each option's typical mark: the median over all community types (a blank counts as 0); the type
// signal is the difference from it (DESIGN.md, "Recommendations behavior")
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
fitSelect.append(...typesFile.items.map((st) => el("option", { value: st.id, textContent: `${st.status === "accepted" ? "✓ " : ""}${st.label}${st.status === "accepted" ? "" : " (in review)"}` })));
function renderFit() {
  const st = typesFile.items.find((x) => x.id === fitSelect.value);
  // its example communities: anything they expect that the marks argue against, or that they avoid but the marks favor
  const examples = [...bench.communities, ...heldout.communities].filter((x) => x.type === st.id);
  const problems = [];
  for (const c of examples) {
    const at = (list, id) => marksFor(st.id, list).find((m) => m.option === id);
    for (const v of c.expected.values.core) if (at("values", v)?.fit < 0) problems.push(`${c.name}: core value ${fitName("values", v)} is marked against`);
    for (const [list, key] of Object.entries(BENCH_KEY)) {
      for (const id of c.expected[key].good) { const m = at(list, id); if (m && (m.fit < 0 || m.flag === "gate")) problems.push(`${c.name}: ${fitName(list, id)} is good, but marked against`); }
      for (const id of c.expected[key].avoid) if (at(list, id)?.fit > 0) problems.push(`${c.name}: ${fitName(list, id)} is to avoid, but marked for`);
    }
  }
  $("tr-fit").replaceChildren(
    el("p", { className: "quote" }, el("b", { textContent: `${st.label}: ` }), st.description, el("span", { className: "field-hint", textContent: ` E.g. ${st.examples}.` })),
    approveRow(st),
    el("div", { className: "tr-check" },
      el("b", { textContent: examples.length ? `Examples: ${examples.map((c) => c.name).join(", ")}. ` : "No example community for this type yet." }),
      examples.length ? (problems.length ? `${problems.length} disagreement${problems.length === 1 ? "" : "s"}:` : "No disagreements.") : "",
      problems.length ? el("ul", {}, ...problems.map((p) => el("li", { textContent: p }))) : null),
    el("div", { className: "tr-fit-grid" }, ...FIT_LISTS.map(([list, label]) => {
      const ms = marksFor(st.id, list);
      return el("div", {}, el("h3", { textContent: `${label} (${ms.length})` }),
        ms.length ? table(["Option", "Mark", "Typical", "", "Why"], ms.map((m) => el("tr", {},
          cell(fitName(list, m.option)), cell(mark(m)), cell(m.flag ? "" : mark({ fit: typicalOf(list, m.option) })), cell(flagPill(m.flag)), cell(m.why))))
          : el("p", { className: "field-hint", textContent: "No marks: no opinion for this community type (for now)." }));
    })));
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
/** Approve (or undo) a community type and its marks, by a copied command (scripts/review.mjs). */
function approveRow(st) {
  const approved = st.status === "accepted";
  const out = el("span", { className: "field-hint" });
  const btn = el("button", { type: "button", className: approved ? "link-button" : "button button-small", textContent: approved ? "Undo approval" : "Approve this type" });
  btn.addEventListener("click", () => copyCommand(`node scripts/review.mjs ${approved ? "unapprove" : "approve"} ${st.id}`, out));
  return el("p", { className: "tr-approve" },
    approved ? el("span", { className: "chip", textContent: "Approved" }) : el("span", { className: "label", textContent: "In review" }), " ", btn, " ", out);
}
fitSelect.addEventListener("change", renderFit);
renderFit();
$("tr-rarely").replaceChildren(table(["Option", "List", "Why", "Exceptions (a community type marks it for or interesting)"], optionFlags.items.map((f) => el("tr", {},
  cell(fitName(f.list, f.option)), cell(listName(f.list)), cell(f.why),
  cell(typeApproaches.items.filter((m) => m.list === f.list && m.option === f.option && m.fit > 0).map((m) => typeLabel(m.type)).join(", ") || "none")))));
$("tr-format-fit").replaceChildren(table(["Format", "Value", "Mark", "Why"], formatValues.items.map((m) => el("tr", {}, cell(formatLabel(m.format)), cell(fitName("values", m.value)), cell(mark(m)), cell(m.why)))));
$("tr-format-approach-fit").replaceChildren(table(["Format", "List", "Option", "Mark", "Why"], formatApproaches.items.map((m) => el("tr", {}, cell(formatLabel(m.format)), cell(listName(m.list)), cell(fitName(m.list, m.option)), cell(mark(m)), cell(m.why)))));

// ── value word lists: what's in use, with any proposals (scripts/make-value-terms.mjs) ──
/** A button that copies the command accepting a value's proposed word list (or all of them). */
function acceptRow(id, label) {
  const out = el("span", { className: "field-hint" });
  const b = el("button", { type: "button", className: "link-button", textContent: label });
  b.addEventListener("click", () => copyCommand(`node scripts/review.mjs terms ${id} && node scripts/make-value-terms.mjs`, out));
  return el("span", { className: "tr-approve" }, b, out);
}
{
  const proposal = new Map((termsFile?.items || []).map((it) => [it.id, it]));
  const proposing = [...proposal.values()].some((p) => p.new.length || p.questionable.length);
  const groupNames = (v) => v.groups.map((id) => values.groups.find((g) => g.id === id)?.short || id).join(" · ");
  const wordPills = (v) => {
    const p = proposal.get(v.id);
    if (!p) return v.cues.map((t) => chip(t, { quiet: true }));
    return [...v.cues.map((t) => (p.questionable.includes(t) ? el("span", { className: "tr-avoid", textContent: t }) : chip(t, { quiet: true }))), ...p.new.map((t) => chip(t))];
  };
  // in group order, each value under its main group
  const ordered = [...values.groups.map((g) => g.id), null].flatMap((g) => values.items.filter((v) => v.group === g));
  const cores = termsFile?.benchmark.reduce((n, b) => n + b.core.length, 0);
  const total = (k, f) => termsFile.benchmark.reduce((n, b) => n + b[k][f].length, 0);
  $("tr-terms").replaceChildren(...[
    termsFile ? el("div", { className: "tr-check" }, el("b", { textContent: "A test on the benchmarks: " }),
      `using only the word lists (no community type or scales), their Purpose, Culture and keywords find ${total("current", "found")} of their ${cores} core values${proposing ? ` (${total("proposed", "found")} with the proposals)` : ""}, and values they wouldn't choose come up ${total("current", "other")} times. `,
      el("span", { className: "field-hint", textContent: `Low numbers are expected: people rarely describe their community in the values' own words. Generated ${termsFile.generatedAt}.` })) : null,
    proposing ? el("p", { className: "field-hint" }, "Proposed: ", chip("new", {}), " words would be added, ", el("span", { className: "tr-avoid", textContent: "questionable" }), " ones dropped (so common they'd match too often). ", acceptRow("all", "Accept all proposals")) : null,
    el("div", { className: "tr-wide" }, table(["Value", "Tab", "Word list", "Misfires", "Description", ...(proposing ? [""] : [])], ordered.map((v) => {
      const p = proposal.get(v.id);
      return el("tr", {},
        cell(v.label), cell(groupNames(v)),
        el("td", {}, ...wordPills(v)),
        cell(Object.entries(p?.misfires || {}).map(([t, h]) => `“${t}”: ${h.join(", ")}`).join("; ") || "—"),
        cell(v.descriptionDraft ? el("span", {}, el("span", { className: "badge var", textContent: "rewritten" }), ` ${v.description}`) : v.description),
        ...(proposing ? [el("td", {}, p && (p.new.length || p.questionable.length) ? acceptRow(v.id, "Accept") : "")] : []));
    }))),
    termsFile ? el("details", { className: "field-hint" }, el("summary", { textContent: "The test, community by community" }),
      el("div", { className: "tr-wide" }, table(["Community", "Core values", "Found by words", "Suggested, but not theirs"], termsFile.benchmark.map((b) => el("tr", {},
        cell(b.name), cell(b.core.map((v) => nameOf("values", v)).join(", ")),
        cell(b.current.found.map((v) => nameOf("values", v)).join(", ") || "—"), cell(b.current.other.map((v) => nameOf("values", v)).join(", ") || "—")))))) : null,
  ].filter(Boolean));
}

// ── review cases: rated by people, kept in this browser, handed in as files ──
const RATE_LISTS = { A: Object.keys(KINDS), B: ["values"] };   // set A: rate the approaches; set B: the values
/** What the editor suggests for a review case now: [{ list, option, tier, r }], Suggested first. */
const suggestionsFor = (c) => RATE_LISTS[c.set].flatMap((list) => [...scoreList(recs, list, basicsOf(c))]
  .filter(([, r]) => r.tier === "suggested" || r.tier === "see")
  .sort((a, b) => ORDER[a[1].tier] - ORDER[b[1].tier] || b[1].score - a[1].score)
  .map(([option, r]) => ({ list, option, tier: r.tier, r })));
const listTitle = (list) => (list === "values" ? "Values" : NAMES[list]);

// my ratings: { rater, cases: { id: { set, overall, note, suggestions: [{ list, option, tier, rating }] } }, changedAt, downloadedAt }
const STORE = "crow:workbench-ratings";
const mine = (() => { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } })() || { rater: "", cases: {}, changedAt: null, downloadedAt: null };
function saveMine({ changed = true } = {}) {
  if (changed) mine.changedAt = new Date().toISOString();
  try { localStorage.setItem(STORE, JSON.stringify(mine)); } catch { /* (private window: kept until the page closes; download to keep them) */ }
  renderReviewStatus();
}
/** Change a case's rating; the case keeps a copy of what was suggested when it was rated. */
function rate(c, change) {
  const rec = mine.cases[c.id] ||= { set: c.set, overall: null, note: "", suggestions: [] };
  rec.suggestions = suggestionsFor(c).map(({ list, option, tier }) => ({ list, option, tier, rating: rec.suggestions.find((x) => x.list === list && x.option === option)?.rating ?? null }));
  change(rec);
  saveMine();
}

const reviewCases = reviewFile?.communities || [];
const setSel = el("select", { id: "tr-review-set" }, el("option", { value: "A", textContent: "Set A: rate the approaches" }), el("option", { value: "B", textContent: "Set B: rate the values" }));
const batchSel = el("select", { id: "tr-review-batch" });
const raterIn = el("input", { type: "text", id: "tr-rater", value: mine.rater, placeholder: "Your initials" });   // (initials, not names: the files go in the public repo)
const status = el("span", { className: "field-hint" });
const casesBox = el("div", { className: "tr-bench" });
const inSet = () => reviewCases.filter((c) => c.set === setSel.value);
const BATCH = 25;
function fillBatches() {
  const n = Math.ceil(inSet().length / BATCH);
  batchSel.replaceChildren(...Array.from({ length: n }, (_, i) => el("option", { value: String(i), textContent: `Cases ${i * BATCH + 1}–${Math.min((i + 1) * BATCH, inSet().length)}` })));
  renderCases();
}
const inBatch = () => inSet().slice(Number(batchSel.value) * BATCH, (Number(batchSel.value) + 1) * BATCH);
function renderReviewStatus() {
  const done = inBatch().filter((c) => mine.cases[c.id]?.overall).length;
  const unsaved = mine.changedAt && (!mine.downloadedAt || mine.changedAt > mine.downloadedAt);
  status.textContent = `${done} of ${inBatch().length} rated in this batch · ${Object.values(mine.cases).filter((r) => r.overall).length} in all.${unsaved ? " You have ratings not downloaded yet." : ""}`;
}
/** The notes for students, folded so a case is first read as its members wrote it. */
function caseNotes(c) {
  const lines = [c.notes, c.tricky && `Tricky: ${c.tricky}.`, c.setupNotes && `Set-up: ${c.setupNotes}.`].filter(Boolean);
  return lines.length ? foldSection({ title: "Notes", key: `review:${c.id}:notes`, level: 3, children: lines.map((t) => el("p", { className: "note", textContent: t })) }) : null;
}
/** One case: what it says about itself, its set-up answers, and the suggestions to rate. */
function caseCard(c) {
  const rec = mine.cases[c.id];
  const ratingOf = (s) => rec?.suggestions.find((x) => x.list === s.list && x.option === s.option)?.rating ?? null;
  const redraw = () => card.replaceWith(caseCard(c));
  const sugs = suggestionsFor(c);
  const note = el("textarea", { placeholder: "Anything missing, or another note", value: rec?.note || "" });
  note.addEventListener("input", () => rate(c, (r) => { r.note = note.value; }));
  const card = el("article", {},
    el("h3", { textContent: c.name }),
    el("p", { className: "meta", textContent: `${metaLine(c)} · set ${c.set}` }),
    el("p", { className: "quote" }, el("b", { textContent: "Purpose " }), c.description.purpose),
    c.description.culture ? el("p", { className: "quote" }, el("b", { textContent: "Culture " }), c.description.culture) : null,
    c.keywords?.length ? el("p", { className: "note", textContent: `Keywords: ${c.keywords.join(", ")}` }) : null,
    c.values?.length ? el("dl", {}, el("dt", { textContent: "Values" }), el("dd", {}, ...pills("values", c.values, "good"))) : null,
    caseNotes(c),
    ...RATE_LISTS[c.set].flatMap((list) => {
      const here = sugs.filter((s) => s.list === list);
      return [el("h4", { textContent: listTitle(list) }), here.length
        ? el("ul", { className: "plain-list" }, ...here.map((s) => el("li", {}, tierChip(s.tier), nameOf(list, s.option),
          pickRow([["fine", "fine"], ["wrong", "wrong"]], ratingOf(s), (v) => { rate(c, (r) => { r.suggestions.find((x) => x.list === s.list && x.option === s.option).rating = v; }); redraw(); }),
          why(s.r))))
        : el("p", { className: "field-hint", textContent: "Nothing suggested." })];
    }),
    el("h4", { textContent: "This case, overall" }),
    pickRow([["good", "good"], ["okay", "okay"], ["poor", "poor"]], rec?.overall ?? null, (v) => { rate(c, (r) => { r.overall = v; }); redraw(); }),
    note,
    el("p", { className: "note" }, tryButton(c)));
  return card;
}
function renderCases() {
  casesBox.replaceChildren(...inBatch().map(caseCard));
  renderReviewStatus();
}
async function downloadRatings() {
  if (!mine.rater.trim()) { status.textContent = "Add your initials first, so your ratings can be told apart."; raterIn.focus(); return; }
  const today = new Date().toISOString().slice(0, 10);
  const slug = mine.rater.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const url = URL.createObjectURL(new Blob([JSON.stringify({ rater: mine.rater.trim(), downloadedAt: today, cases: mine.cases }, null, 1)], { type: "application/json" }));
  el("a", { href: url, download: `ratings-${slug}-${today}.json` }).click();
  URL.revokeObjectURL(url);
  mine.downloadedAt = new Date().toISOString();
  saveMine({ changed: false });
}
async function clearRatings() {
  if (!(await confirmPopup({ title: "Clear your ratings?", message: "This removes every rating kept in this browser. Download them first if you haven't.", confirmLabel: "Clear them" }))) return;
  Object.assign(mine, { cases: {}, changedAt: null, downloadedAt: null });
  saveMine({ changed: false });
  renderCases();
}
if (reviewCases.length) {
  raterIn.addEventListener("input", () => { mine.rater = raterIn.value; saveMine({ changed: false }); });
  setSel.addEventListener("change", fillBatches);
  batchSel.addEventListener("change", renderCases);
  const dl = el("button", { type: "button", className: "button button-small", textContent: "Download ratings" });
  dl.addEventListener("click", downloadRatings);
  const clear = el("button", { type: "button", className: "link-button", textContent: "Clear my ratings" });
  clear.addEventListener("click", clearRatings);
  $("tr-review").replaceChildren(
    el("p", { className: "tr-approve" }, el("label", { className: "label", htmlFor: "tr-rater", textContent: "Rater" }), raterIn, setSel, batchSel, dl, clear),
    el("p", {}, status), casesBox);
  fillBatches();
} else $("tr-review").replaceChildren(el("p", { className: "field-hint", textContent: "No review cases yet: they go in data/review_cases.json." }));

// everyone's ratings, from files: what's most often wrong, and whether it's still suggested
$("tr-ratings-files").addEventListener("change", async (e) => {
  const out = $("tr-ratings-summary");
  try {
    const files = (await readFiles(e.target)).map(({ name, data }) => ({ rater: data.rater || name, cases: data.cases || {} }));
    out.replaceChildren(...ratingsSummary(files));
  } catch (err) { out.replaceChildren(el("p", { className: "field-hint", textContent: err.message })); }
  e.target.value = "";
});
function ratingsSummary(files) {
  const byId = new Map(reviewCases.map((c) => [c.id, c]));
  const caseName = (id) => byId.get(id)?.name || id;
  const now = new Map();   // (each case's suggestions today, worked out once)
  const stillNow = (id, s) => {
    if (!byId.has(id)) return null;
    if (!now.has(id)) now.set(id, suggestionsFor(byId.get(id)));
    return now.get(id).some((x) => x.list === s.list && x.option === s.option);
  };
  const raters = new Map();   // case → its raters
  const options = new Map();  // list:option → { list, option, shown, wrong: [case ids], still }
  const pairs = new Map();    // case|list|option → { fine: [raters], wrong: [raters] }
  const notes = [];
  for (const f of files) {
    for (const [id, rec] of Object.entries(f.cases)) {
      if (rec.overall || rec.suggestions?.some((s) => s.rating)) raters.set(id, [...(raters.get(id) || []), f.rater]);
      if (rec.overall === "poor" || rec.note) notes.push({ id, rater: f.rater, overall: rec.overall, note: rec.note });
      for (const s of rec.suggestions || []) {
        if (!s.rating) continue;
        const key = `${s.list}:${s.option}`;
        const o = options.get(key) || { list: s.list, option: s.option, shown: 0, wrong: [], still: 0 };
        o.shown++;
        if (s.rating === "wrong") { o.wrong.push(id); if (stillNow(id, s)) o.still++; }
        options.set(key, o);
        const p = pairs.get(`${id}|${key}`) || { id, s, fine: [], wrong: [] };
        p[s.rating].push(f.rater);
        pairs.set(`${id}|${key}`, p);
      }
    }
  }
  const coverage = {};
  for (const rs of raters.values()) coverage[rs.length] = (coverage[rs.length] || 0) + 1;
  const wrong = [...options.values()].filter((o) => o.wrong.length).sort((a, b) => b.wrong.length - a.wrong.length || a.shown - b.shown);
  const split = [...pairs.values()].filter((p) => p.fine.length && p.wrong.length);
  return [
    el("p", { className: "tr-check" }, el("b", { textContent: `${files.length} file${files.length === 1 ? "" : "s"}: ` }), files.map((f) => `${f.rater} (${Object.values(f.cases).filter((r) => r.overall).length} cases)`).join(", "),
      `. ${raters.size} cases rated: ${Object.entries(coverage).map(([n, k]) => `${k} by ${n} rater${n === "1" ? "" : "s"}`).join(", ")}.`),
    el("h3", { textContent: "Most often wrong" }),
    wrong.length ? el("div", { className: "tr-wide" }, table(["Option", "List", "Wrong / rated", "Cases", "Still suggested today"], wrong.map((o) => el("tr", {},
      cell(nameOf(o.list, o.option)), cell(listTitle(o.list)), cell(`${o.wrong.length} / ${o.shown}`), cell([...new Set(o.wrong)].map(caseName).join(", ")), cell(byId.size ? `${o.still} of ${o.wrong.length}` : "—")))))
      : el("p", { className: "field-hint", textContent: "Nothing rated wrong." }),
    el("h3", { textContent: "Poor cases, and notes" }),
    notes.length ? el("div", { className: "tr-wide" }, table(["Case", "Rater", "Overall", "Note"], notes.map((n) => el("tr", {}, cell(caseName(n.id)), cell(n.rater), cell(n.overall || "—"), cell(n.note || "—")))))
      : el("p", { className: "field-hint", textContent: "None." }),
    el("h3", { textContent: "Where raters disagree" }),
    split.length ? el("div", { className: "tr-wide" }, table(["Case", "Option", "Fine", "Wrong"], split.map((p) => el("tr", {}, cell(caseName(p.id)), cell(`${nameOf(p.s.list, p.s.option)} (${listTitle(p.s.list)})`), cell(p.fine.join(", ")), cell(p.wrong.join(", "))))))
      : el("p", { className: "field-hint", textContent: "No disagreements." }),
  ];
}

pageTabs.start();
fillInputs();
