// Export: the card's answers as a readable summary, and as downloads — the
// raw data (JSON) and community documentation (Markdown). (A visual
// summary card comes later.) Only Basics and the modules the card uses are
// included, never the editor-only part (card.editor: dismissed suggestions,
// the structure's change log, what costs were pre-filled from) or the
// contributor's attribution — the same rule public views follow.
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
import { loadInfrastructureData, toolLine } from "./sections/infrastructure.js";
import { loadMembershipData } from "./sections/membership.js";
import { loadRulesData } from "./sections/rules.js";
import { loadProcessesData, channelLine } from "./sections/processes.js";
import { loadFederationData, cardRules } from "./sections/federation.js";
import { answerText } from "./sections/custom.js";
import { YES_NO_VARIES } from "./controls/choices.js";
import { stepRole } from "./controls/picklist.js";
import { structureIds } from "./structure.js";
import { loadData } from "./data.js";
import { viewCard, rulesCount, cardScales, shows } from "./view-modes.js";

export async function loadExportData() {
  const [basics, infrastructure, membership, rules, processes, federation, ruleSchema, scales] = await Promise.all([
    loadBasicsData(), loadInfrastructureData(), loadMembershipData(), loadRulesData(), loadProcessesData(), loadFederationData(),
    loadData("rule_schema"), loadData("governance_scales"),   // (for a view mode's rules count and scales)
  ]);
  return { basics, infrastructure, membership, rules, processes, federation, ruleSchema, scales };
}

// ── little helpers ──────────────────────────────────────────
const labelIn = (list, id) => list?.find((x) => x.id === id)?.label ?? id;
const labels = (list, ids = []) => ids.map((id) => labelIn(list, id));
const yesNo = (v) => (v ? labelIn(YES_NO_VARIES, v) : null);
const withNote = (label, note) => (note ? `${label}: ${note}` : label);
/** A step's name from where it falls (as the editor shows it). */
const stepName = (n, total) => `Step ${n} (${stepRole(n, total).toLowerCase()})`;
/** Steps ([{ id, note, stage, primary? }]) as rows: "Step 1 (first)": ["Peer Mediation (primary): note", …]. */
function stepRows(steps = [], options) {
  const total = new Set(steps.map((s) => s.stage)).size;
  return [...new Set(steps.map((s) => s.stage))].sort((a, b) => a - b).map((stage, i) => [
    stepName(i + 1, total),
    steps.filter((s) => s.stage === stage).map((s) => withNote(`${labelIn(options, s.id)}${s.primary ? " (primary)" : ""}`, s.note)),
  ]);
}

/** Steps as rows, or (none yet) one empty row for them, so a view mode can say N/A. */
const stepsOrNone = (rows, label, field) => (rows.length ? rows.map(([l, v]) => [l, v, field]) : [[label, null, field]]);
/** "18 rules: 11 on behavior, 7 on content" (kinds from rule_schema.json; "other" for custom rules without one). */
function countText(count, ruleSchema) {
  if (!count.total) return null;
  const kinds = [...ruleSchema.categories.map((c) => [c.id, c.label.toLowerCase()]), ["other", "other"]]
    .filter(([id]) => count[id]).map(([id, label]) => `${count[id]} on ${label}`);
  return `${count.total} ${count.total === 1 ? "rule" : "rules"}: ${kinds.join(", ")}`;
}
/** What a "Not shared" row is called, for each part a mode can leave out. */
const HIDDEN_LABELS = {
  platformDetails: "Protocol, open source, self-hosted", costs: "Costs", tools: "Other tools", locations: "Locations",
  joiningWays: "Ways of joining", closedNote: "About being closed", structure: "Decision-making approaches",
  membershipNote: "Anything else", rules: "The rules", conflictSteps: "Conflict management steps", processNotes: "Notes",
  channels: "Channels", federationSteps: "Approach and response ladder", federationRest: "Lists, tools, rules and bridging",
};

// ── the outline: [{ title, rows: [[label, value, field]] }], value a string or
// a list; field = the part of the card it shows (view-modes.js FIELDS), so a
// view mode can say "Not shared" for what it leaves out ──
const SECTIONS = {
  basics: (b = {}, d) => [
    ["Community", b.name, "basics"],
    ["Link", b.link, "basics"],
    ["Type", b.type && labelIn(d.basics.types, b.type), "basics"],
    ["Size", b.size && labelIn(d.basics.sizes, b.size), "basics"],
    ["Keywords", b.keywords, "basics"],
    ["Values", labels(d.basics.values, b.values), "basics"],
  ],
  infrastructure: (inf = {}, d) => {
    const x = d.infrastructure;
    const p = inf.platform || {};
    const places = (ids) => labels(x.places, ids);
    return [
      ["Platform", p.platform && labelIn(x.platforms, p.platform), "platform"],
      ["Platform type", p.type && labelIn(x.platformTypes, p.type), "platform"],
      ["Software", p.software, "platform"],
      ["Uses an open protocol", yesNo(p.usesProtocol), "platformDetails"],
      ["Protocol", p.protocol, "platformDetails"],
      ["Open source", yesNo(p.openSource), "platformDetails"],
      ["Self-hosted", yesNo(p.selfHosted), "platformDetails"],
      ["Structural model", p.structuralModel, "platform"],
      ["Costs", x.costCategories.filter((c) => inf.costs?.[c.id]).map((c) => `${c.label}: ${labelIn(x.costValues, inf.costs[c.id])}`), "costs"],
      ["Other tools", (inf.tools || []).filter((t) => t.tool).map((t) => toolLine(t, x)), "tools"],
      ["Servers", places(inf.locations?.servers), "locations"],
      ["Members", places(inf.locations?.members), "locations"],
      ["Admin team", places(inf.locations?.adminTeam), "locations"],
    ];
  },
  membership: (m = {}, d) => {
    const x = d.membership;
    const j = m.joining || {};
    return [
      ["How people join", labels(x.tiers, j.tiers), "joiningTiers"],
      ["About being closed", j.closedNote, "closedNote"],
      ["Ways of joining", (j.ways || []).map((w) => withNote(labelIn(x.options, w.id), w.note)), "joiningWays"],
      ["Structure", (m.structure || []).map((s) => withNote(labelIn(x.approaches, s.id), s.note)), "structure"],
      ["Anything else", m.generalNote, "membershipNote"],
    ];
  },
  rules: (r = {}, d, card, extras = {}) => {
    const x = d.rules;
    const all = cardRules(r, d.federation.ruleTypes, x.qualifierSets);
    const groups = [...new Set(all.map((rule) => rule.group))];
    return [
      // a view mode's count of rules by kind (e.g. "18 rules: 11 on behavior, 7 on content")
      ...(extras.rulesCount ? [["How many rules", countText(extras.rulesCount, d.ruleSchema), "rulesCount"]] : []),
      ["Where the rules live", r.communityRulesLink, "rules"],
      ["Covenants and guidelines", labels(x.covenants, r.covenants), "rules"],
      ["Adapted from", labels(x.covenants, r.adaptedFrom), "rules"],
      ...groups.map((g) => [g, all.filter((rule) => rule.group === g).map((rule) => (rule.qualifier ? `${rule.label} (${rule.qualifier})` : rule.label)), "rules"]),
    ];
  },
  processes: (pr = {}, d, card) => {
    const x = d.processes;
    const structure = structureIds(card.membership);
    const usedFor = (part) => structure.map((id) => withNote(labelIn(x.decisionApproaches, id), pr[part]?.approachNotes?.[id]));
    const comms = pr.communications || {};
    return [
      ["Changing the rules and structure", usedFor("institutionalChange"), "structure"],
      ["About changing the rules", pr.institutionalChange?.generalNote, "processNotes"],
      ["Maintenance", usedFor("maintenance"), "structure"],
      ["About maintenance", pr.maintenance?.generalNote, "processNotes"],
      ["Moderation", usedFor("moderation"), "structure"],
      ["About moderation", pr.moderation?.generalNote, "processNotes"],
      ...stepsOrNone(stepRows(pr.conflictManagement?.approaches, x.conflictApproaches).map(([label, v]) => [`Conflict: ${label.toLowerCase()}`, v]), "Conflict management steps", "conflictSteps"),
      ["About conflict", pr.conflictManagement?.generalNote, "processNotes"],
      // Foggy only says whether any channel is specified
      ["Channels", "channelsSpecified" in comms ? (comms.channelsSpecified ? "At least one specified" : null)
        : [...labels(x.channels, comms.channels), ...(comms.customChannels || []).filter((c) => c.name).map(channelLine)], "channels"],
    ];
  },
  federation: (f = {}, d, card) => {
    const x = d.federation;
    const subs = f.subscriptions || {};
    const rules = cardRules(card.rules || {}, x.ruleTypes, x.qualifierSets);
    return [
      ["Overall approach", f.approach && labelIn(x.approaches, f.approach), "federationSteps"],
      ["How servers get on the allowlist", f.allowlistPolicy, "federationRest"],
      ...stepsOrNone(stepRows(f.responseLadder, x.ladder).map(([label, v]) => [`When there’s a problem: ${label.toLowerCase()}`, v]), "Response ladder", "federationSteps"),
      ["Shared lists followed", labels(x.lists, subs.subscribedLists), "federationRest"],
      ["Shares its block list", yesNo(subs.sharesBlocklist), "federationRest"],
      ["Block list", subs.blocklistLink, "federationRest"],
      ["Tools for federation decisions", labels(x.tools, subs.decisionTools), "federationRest"],
      ["Rules that guide federation decisions", rules.filter((r) => (f.relevantRules || []).includes(r.id)).map((r) => withNote(r.label, f.ruleNotes?.[r.id])), "federationRest"],
      ["Bridges to other networks", yesNo(f.bridging?.bridges), "federationRest"],
      ["Bridged protocols", f.bridging?.protocols, "federationRest"],
    ];
  },
};
const custom = (m) => (m.fields || []).filter((f) => f.label).map((f) =>
  [f.label, f.type === "scale" && f.value ? `${answerText(f)}${f.low || f.high ? ` (1 = ${f.low || "…"}, 5 = ${f.high || "…"})` : ""}` : answerText(f)]);

/**
 * The card as an outline: { title, sections: [{ title, rows: [[label, value]] }] }.
 * Without a mode, empty answers are left out (Export). With a view `mode`
 * (`card` being viewCard's result), every row stays: "Not shared" for what
 * the mode leaves out (one row per part), "N/A" for what's empty; plus the
 * rules count and the scales (`extras`: { rulesCount, scales }).
 */
export function cardOutline(card, data, defaults, { mode, ...extras } = {}) {
  const filled = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");
  const sections = moduleEntries(defaults, card).map((m) => {
    const rows = m.custom
      ? custom((card.customModules || []).find((c) => c.id === m.id) || {})
      : SECTIONS[m.id]?.(card[m.id], data, card, extras) || [];
    if (!mode) return { title: m.label, rows: rows.filter(([, v]) => filled(v)) };
    const hidden = new Set();
    return {
      title: m.label,
      rows: rows.flatMap(([label, value, field]) => {
        if (field && !shows(field, mode)) {
          if (hidden.has(field)) return [];
          hidden.add(field);
          return [[HIDDEN_LABELS[field] || label, "Not shared"]];
        }
        return [[label, filled(value) ? value : "N/A"]];
      }),
    };
  });
  if (mode && extras.scales) {
    sections.push({
      title: "Governance scales",
      rows: data.scales.scales.map((sc) => {
        const s = extras.scales[sc.id];
        return [sc.label, s ? `${s.score} / 5 · based on ${s.basedOn} ${s.basedOn === 1 ? "choice" : "choices"}` : "N/A"];
      }),
    });
  }
  return { title: card.basics?.name || "Untitled card", sections };
}

/**
 * The card as a view mode shows it, as an outline (the public card, the
 * Publish preview). includeProposed: count scores still under review (previews only).
 */
export function publicOutline(card, data, defaults, mode, { includeProposed = false } = {}) {
  return cardOutline(viewCard(card, mode), data, defaults, {
    mode,
    rulesCount: rulesCount(card, data.ruleSchema),
    scales: cardScales(card, data.scales, { includeProposed }),
  });
}

/** The outline as Markdown: a heading per module, a bullet per answer. */
const oneLine = (v) => String(v).replace(/\n+/g, " ");   // a line break would end a Markdown bullet early

export function toMarkdown(outline, card) {
  const lines = [`# ${outline.title}`, "", `*A CROW Card, exported from crowcards.org on ${new Date().toISOString().slice(0, 10)}. Card ${card.id}.*`, ""];
  for (const s of outline.sections) {
    lines.push(`## ${s.title}`, "");
    if (!s.rows.length) lines.push("*Nothing filled in yet.*", "");
    for (const [label, value] of s.rows) {
      if (Array.isArray(value)) lines.push(`- **${label}:**`, ...value.map((v) => `  - ${oneLine(v)}`));
      else lines.push(`- **${label}:** ${oneLine(value)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The card's data for download: Basics and the modules it uses, without editor-only state. */
export const cardData = (card) => viewCard(card, "full");   // (the Full view: the same rules as a published card)

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
    ...outlineElements(outline),
  );
}

/** An outline drawn as a heading and a summary list per section (Export, the view-mode previews). */
export function outlineElements(outline, { heading = "h2" } = {}) {
  return outline.sections.flatMap((s) => [
    el(heading, { textContent: s.title }),
    s.rows.length
      ? el("dl", { className: "summary summary-list export-list" }, ...s.rows.flatMap(([label, value]) => [
        el("dt", { className: "mono-u summary-label", textContent: label }),
        el("dd", {}, Array.isArray(value) ? el("ul", {}, ...value.map((v) => el("li", { textContent: v }))) : String(value)),
      ]))
      : el("p", { className: "field-hint", textContent: "Nothing filled in yet." }),
  ]);
}
