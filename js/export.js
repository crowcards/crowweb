// Export: the card's answers as a readable summary, and as downloads — the
// raw data (JSON) and community documentation (Markdown). (A visual
// summary card comes later.) Only Basics and the modules the card uses are
// included, never editor-only state (dismissed suggestions, the structure's
// change log, what costs were pre-filled from) — the same rule public views
// follow.
//
//   const data = await loadExportData();
//   renderExport(container, card, data, defaults);
//
// One outline of the card (cardOutline) is drawn on the page and written as
// Markdown, so the two always say the same thing. Labels come from each
// module's own data loader.

import { el, button } from "./dom.js";
import { moduleEntries } from "./modules.js";
import { loadBasicsData } from "./sections/basics.js";
import { loadInfrastructureData } from "./sections/infrastructure.js";
import { loadMembershipData } from "./sections/membership.js";
import { loadRulesData } from "./sections/rules.js";
import { loadProcessesData } from "./sections/processes.js";
import { loadFederationData, cardRules } from "./sections/federation.js";
import { answerText } from "./sections/custom.js";

export async function loadExportData() {
  const [basics, infrastructure, membership, rules, processes, federation] = await Promise.all([
    loadBasicsData(), loadInfrastructureData(), loadMembershipData(), loadRulesData(), loadProcessesData(), loadFederationData(),
  ]);
  return { basics, infrastructure, membership, rules, processes, federation };
}

// ── little helpers ──────────────────────────────────────────
const labelIn = (list, id) => list?.find((x) => x.id === id)?.label ?? id;
const labels = (list, ids = []) => ids.map((id) => labelIn(list, id));
const yesNo = (v) => ({ true: "Yes", false: "No", varies: "It varies" })[String(v)] ?? null;
const withNote = (label, note) => (note ? `${label}: ${note}` : label);
/** A step's name from where it falls (as the editor shows it). */
const stepName = (n, total) => `Step ${n} (${n === 1 ? "first" : n === total ? "last resort" : "escalation"})`;
/** Steps ([{ id, note, stage, primary? }]) as rows: "Step 1 (first)": ["Peer Mediation (primary): note", …]. */
function stepRows(steps = [], options) {
  const total = new Set(steps.map((s) => s.stage)).size;
  return [...new Set(steps.map((s) => s.stage))].sort((a, b) => a - b).map((stage, i) => [
    stepName(i + 1, total),
    steps.filter((s) => s.stage === stage).map((s) => withNote(`${labelIn(options, s.id)}${s.primary ? " (primary)" : ""}`, s.note)),
  ]);
}

// ── the outline: [{ title, rows: [[label, value]] }], value a string or a list ──
const SECTIONS = {
  basics: (b = {}, d) => [
    ["Community", b.communityName],
    ["Link", b.communityLink],
    ["Type", b.communityType && labelIn(d.basics.types, b.communityType)],
    ["Size", b.communitySize && labelIn(d.basics.sizes, b.communitySize)],
    ["Keywords", b.communityKeywords],
    ["Values", labels(d.basics.values, b.values)],
  ],
  infrastructure: (inf = {}, d) => {
    const x = d.infrastructure;
    const p = inf.platform || {};
    const places = (ids) => labels(x.places, ids);
    return [
      ["Platform", p.platform && labelIn(x.platforms, p.platform)],
      ["Platform type", p.type && labelIn(x.platformTypes, p.type)],
      ["Software", p.software],
      ["Uses an open protocol", yesNo(p.usesProtocol)],
      ["Protocol", p.protocol],
      ["Open source", yesNo(p.openSource)],
      ["Self-hosted", yesNo(p.selfHosted)],
      ["Structural model", p.structuralModel],
      ["Costs", x.costCategories.filter((c) => inf.costs?.[c.id]).map((c) => `${c.label}: ${labelIn(x.costValues, inf.costs[c.id])}`)],
      ["Other tools", (inf.additionalSystems || []).filter((t) => t.toolName).map((t) =>
        `${[t.toolName, t.category && labelIn(x.toolCategories, t.category)].filter(Boolean).join(" · ")}${t.usedFor ? ` — ${t.usedFor}` : ""}`)],
      ["Servers", places(inf.legalCompliance?.serverLocations)],
      ["Members", places(inf.legalCompliance?.userLocations)],
      ["Admin team", places(inf.legalCompliance?.adminTeamLocations)],
    ];
  },
  membership: (m = {}, d) => {
    const x = d.membership;
    return [
      ["How people join", labels(x.tiers, m.joiningTiers)],
      ["About being closed", m.closedNote],
      ["Ways of joining", (m.registrationJoining || []).map((id) => withNote(labelIn(x.options, id), m.joiningNotes?.[id]))],
      ["Structure", (m.structure || []).map((id) => withNote(labelIn(x.approaches, id), m.structureNotes?.[id]))],
      ["Anything else", m.generalNote],
    ];
  },
  rules: (r = {}, d) => {
    const x = d.rules;
    const all = cardRules(r, d.federation.ruleTypes, x.qualifierSets);
    const groups = [...new Set(all.map((rule) => rule.group))];
    return [
      ["Where the rules live", r.communityRulesLink],
      ["Covenants and guidelines", labels(x.covenants, r.covenants)],
      ["Adapted from", labels(x.covenants, r.adaptedFrom)],
      ...groups.map((g) => [g, all.filter((rule) => rule.group === g).map((rule) => (rule.qualifier ? `${rule.label} (${rule.qualifier})` : rule.label))]),
    ];
  },
  processes: (pr = {}, d, card) => {
    const x = d.processes;
    const structure = card.membership?.structure || [];
    const usedFor = (part) => structure.map((id) => withNote(labelIn(x.decisionApproaches, id), pr[part]?.approachNotes?.[id]));
    const comms = pr.communications || {};
    return [
      ["Changing the rules and structure", usedFor("institutionalChange")],
      ["About changing the rules", pr.institutionalChange?.generalNote],
      ["Maintenance", usedFor("maintenance")],
      ["About maintenance", pr.maintenance?.generalNote],
      ["Moderation", usedFor("moderation")],
      ["About moderation", pr.moderation?.generalNote],
      ...stepRows(pr.conflictManagement?.approaches, x.conflictApproaches).map(([label, v]) => [`Conflict: ${label.toLowerCase()}`, v]),
      ["About conflict", pr.conflictManagement?.generalNote],
      ["Channels", [...x.channels.filter((c) => comms.channels?.[c.id]).map((c) => c.label),
        ...(comms.customChannels || []).filter((c) => c.name).map((c) => (c.description ? `${c.name} — ${c.description}` : c.name))]],
    ];
  },
  federation: (f = {}, d, card) => {
    const x = d.federation;
    const subs = f.subscriptions || {};
    const rules = cardRules(card.rules || {}, x.ruleTypes, x.qualifierSets);
    return [
      ["Overall approach", f.approach && labelIn(x.approaches, f.approach)],
      ["How servers get on the allowlist", f.allowlistPolicy],
      ...stepRows(f.responseLadder, x.ladder).map(([label, v]) => [`When there’s a problem: ${label.toLowerCase()}`, v]),
      ["Shared lists followed", labels(x.lists, subs.subscribedLists)],
      ["Shares its block list", yesNo(subs.sharesBlocklist)],
      ["Block list", subs.sharesBlocklist ? subs.blocklistLink : null],
      ["Tools for federation decisions", labels(x.tools, subs.decisionTools)],
      ["Rules that guide federation decisions", rules.filter((r) => (f.relevantRules || []).includes(r.id)).map((r) => withNote(r.label, f.ruleNotes?.[r.id]))],
      ["Bridges to", f.bridging?.enabled ? f.bridging.protocols : null],
    ];
  },
};
const custom = (m) => (m.fields || []).filter((f) => f.label).map((f) =>
  [f.label, f.type === "scale" && f.value ? `${answerText(f)}${f.low || f.high ? ` (1 = ${f.low || "…"}, 5 = ${f.high || "…"})` : ""}` : answerText(f)]);

/** The card as an outline: { title, sections: [{ title, rows: [[label, value]] }] }, empty answers left out. */
export function cardOutline(card, data, defaults) {
  const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");
  const sections = moduleEntries(defaults, card).map((m) => {
    const rows = m.custom
      ? custom((card.customModules || []).find((c) => c.id === m.id) || {})
      : SECTIONS[m.id]?.(card[m.id], data, card) || [];
    return { title: m.label, rows: rows.filter(([, v]) => filled(v)) };
  });
  return { title: card.basics?.communityName || "Untitled card", sections };
}

/** The outline as Markdown: a heading per module, a bullet per answer. */
export function toMarkdown(outline, card) {
  const lines = [`# ${outline.title}`, "", `*A CROW Card, exported from crowcards.org on ${new Date().toISOString().slice(0, 10)}. Card ${card.id}.*`, ""];
  for (const s of outline.sections) {
    lines.push(`## ${s.title}`, "");
    if (!s.rows.length) lines.push("*Nothing filled in yet.*", "");
    for (const [label, value] of s.rows) {
      if (Array.isArray(value)) lines.push(`- **${label}:**`, ...value.map((v) => `  - ${v}`));
      else lines.push(`- **${label}:** ${String(value).replace(/\n+/g, " ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The card's data for download: Basics and the modules it uses, without editor-only state. */
export function cardData(card) {
  const on = new Set(card.modules || []);
  const { structureReviewed, structureLog, ...membership } = card.membership || {};
  const { costsPrefill, ...infrastructure } = card.infrastructure || {};
  const parts = { infrastructure, membership, rules: card.rules, processes: card.processes, federation: card.federation };
  return {
    id: card.id,
    schemaVersion: card.schemaVersion,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    modules: card.modules,
    basics: card.basics,
    ...Object.fromEntries(Object.entries(parts).filter(([id]) => on.has(id))),
    customModules: (card.customModules || []).filter((m) => on.has(m.id)),
  };
}

/** Save `text` as a file. */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** "crd_abc123_20261005-143012": the card's ID and when it was exported (local time; sorts in order). */
function fileName(card) {
  const d = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${card.id}_${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/** The Export page: the downloads, then the summary. */
export function renderExport(container, card, data, defaults) {
  const outline = cardOutline(card, data, defaults);
  const summaryCard = button("Summary card", "button button-small", () => {});
  summaryCard.disabled = true;
  container.replaceChildren(
    el("div", { className: "fields" },
      el("p", { textContent: "Everything your community has entered, from Basics and the modules you use (modules you’ve switched off are left out). Download it as:" }),
      el("p", { className: "button-row" },
        button("Raw data (JSON)", "button button-small", () => download(`${fileName(card)}.json`, `${JSON.stringify(cardData(card), null, 2)}\n`, "application/json")),
        button("Documentation (Markdown)", "button button-small", () => download(`${fileName(card)}.md`, toMarkdown(outline, card), "text/markdown")),
        summaryCard, el("span", { className: "field-hint", textContent: "a visual summary card: coming later" })),
    ),
    ...outline.sections.flatMap((s) => [
      el("h2", { textContent: s.title }),
      s.rows.length
        ? el("dl", { className: "summary summary-list export-list" }, ...s.rows.flatMap(([label, value]) => [
          el("dt", { className: "mono-u summary-label", textContent: label }),
          el("dd", {}, Array.isArray(value) ? el("ul", {}, ...value.map((v) => el("li", { textContent: v }))) : String(value)),
        ]))
        : el("p", { className: "field-hint", textContent: "Nothing filled in yet." }),
    ]),
  );
}
