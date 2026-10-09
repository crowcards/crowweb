// What a published card shows, in each view mode: the one set of rules,
// used by the editor (previews, Export) and, from Phase 4b, by the server
// (to make the public copies). Plain code: no page, no fetching; data is
// passed in, so the same file runs anywhere.
//
//   viewCard(card, mode)              → the card as that mode shows it (same shape, less in it)
//   publicView(card, mode, data)      → a published card's public copy: { mode, card, rulesCount, scales }
//   creditOf(attribution)             → the public credit: { name?, organization? } | null
//   contentFingerprint(card)          → a short code for what a version would publish (has it changed?)
//   rulesCount(card, ruleSchema)      → { behavior, content, other, total } | null
//   rulesByType(card, ruleSchema)     → [{ id, label, chosen, of, custom }] | null
//   cardScales(card, scaleData, opts) → { participatory: { score, basedOn } | null, … }
//   shows(field, mode)                → does this mode show that part of a card?
//   FIELD_LABELS[field]               → what that part is called (for people)
//   REPORT_REASONS                    → why a published card can be reported: [{ id, label }]
//   forkCopies(mode)                  → { copied, notCopied, notCopiedBrief, prefilledTargets }: what a fork from that view gets (labels)
//   scoredItems(scaleData, opts)      → Map "list:option" → its scores (the ones that count)
//
// The modes, from least to most shared: Minimal, Foggy, Misty, Full
// (see "Publishing behaviour" in CLAUDE.md). Never shown in any mode: the editor-only part (set-aside
// answers, dismissed suggestions, …) and attribution (credit appears only
// if the contributor opts in). Switched-off modules are left out.

// While the team reviews the drafts (scales.html), proposed scores (and
// value links and size fits, in js/recommend.js) count too: in suggestions,
// previews and published cards, so they can be tried out. Before launch: false.
export const COUNT_PROPOSED = true;

export const MODES = [
  { id: "minimal", label: "Minimal", forkable: false,
    description: "The basics: who you are, your platform, how people join, how many rules you have, and the three scales." },
  { id: "foggy", label: "Foggy", forkable: true,
    description: "Minimal, plus how many rules you chose of each type (not the rules themselves), where your servers, members and admins are, the kinds of other tools you use (not which), and your federation approach: whether you share a block list, and whether you bridge to other networks." },
  { id: "misty", label: "Misty", forkable: true,
    description: "Most of your card, without the notes on how you use things: infrastructure, ways of joining, rules, decision-making, conflict steps and federation." },
  { id: "full", label: "Full", forkable: true,
    description: "Everything, with your notes, your own modules, and downloads." },
];
const MODE_IDS = MODES.map((m) => m.id);
const from = (first) => MODE_IDS.slice(MODE_IDS.indexOf(first));   // this mode and every fuller one
const ALL = MODE_IDS;

/**
 * The parts of a card, and the modes that show them (shown as a table in the docs, Publishing).
 * Exported for the outline ("Not shared" labels), the Publish preview and
 * forking (what a fork copies).
 */
export const FIELDS = {
  basics: ALL,                          // name, link, type, size, keywords, values
  // the description: its purpose in every view, its culture from Misty
  describePurpose: ALL,
  describeCulture: from("misty"),
  targetScales: ["full"],               // where the community would like to be on the scales: aims, not what its choices add up to
  platform: ALL,                        // platform, software, platform type, structural model
  platformDetails: from("misty"),       // protocol, open source, self-hosted
  costs: from("misty"),
  tools: from("misty"),
  toolCategories: ["foggy"],            // the kinds of other tools used (their categories), not the tools
  locations: from("foggy"),
  joiningTiers: ALL,
  joiningWays: from("misty"),
  joiningWaysNotes: ["full"],
  closedNote: from("misty"),
  structure: from("misty"),             // decision-making approaches (Membership, and the Processes tabs)
  structureNotes: ["full"],
  membershipNote: ["full"],
  rulesCount: ["minimal"],              // how many rules, in all (fuller views show more)
  rulesByType: ["foggy"],               // for each rule type: how many of its rules were chosen, and custom ones added
  rules: from("misty"),                 // the rules link, covenants, selected rules (with qualifiers and wording), custom rules
  conflictSteps: from("misty"),
  processNotes: ["full"],               // notes per approach in each tab, conflict notes, general notes
  channels: from("misty"),              // Misty: only whether any channel is specified; Full: which
  federationOverview: from("foggy"),    // the approach; whether a block list is shared, and whether they bridge (yes / no only)
  federationSteps: from("misty"),       // the response ladder
  federationNotes: ["full"],
  federationRest: ["full"],             // allowlist policy, shared lists, the block list's link, tools, how rules shape federation, bridged protocols
  customModules: ["full"],
  scales: ALL,
  downloads: ["full"],
};

export const shows = (field, mode) => (FIELDS[field] || []).includes(mode);

/** What each part is called, for people: "Not shared" rows, the fork pop-up. */
export const FIELD_LABELS = {
  basics: "Type, size, keywords and values",
  describePurpose: "Purpose",
  describeCulture: "Culture",
  targetScales: "Where they’d like to be on the scales",
  platform: "Platform and software",
  platformDetails: "Protocol, open source, self-hosted",
  costs: "Costs",
  tools: "Other tools",
  toolCategories: "Kinds of other tools",
  locations: "Locations",
  joiningTiers: "How people join",
  joiningWays: "Ways of joining",
  joiningWaysNotes: "Notes on ways of joining",
  closedNote: "About being closed",
  structure: "Decision-making approaches",
  structureNotes: "Notes on decision-making approaches",
  membershipNote: "Membership’s general note",
  rulesCount: "How many rules",
  rulesByType: "Rules counted by type",
  rules: "Rules",
  conflictSteps: "Conflict management steps",
  processNotes: "Notes on processes",
  channels: "Communication channels",
  federationOverview: "Federation approach, block list and bridging (yes / no)",
  federationSteps: "Response ladder",
  federationNotes: "Notes on federation",
  federationRest: "Shared lists, tools, how rules shape federation, bridged protocols",
  customModules: "Custom modules",
  scales: "Governance scales",
  downloads: "Downloads",
};

/**
 * What a fork from a view copies, and what it doesn't, as labels: the parts
 * of a card the view shows (a fork is made from them), leaving out what's
 * worked out rather than answered (the rules counts, the scales) and the
 * downloads; channels only from Full (Misty only says whether there are any).
 */
export function forkCopies(mode) {
  const worked = ["rulesCount", "rulesByType", "toolCategories", "scales", "downloads"];
  // (the description is the community's own: never copied, said once below)
  const content = Object.keys(FIELDS).filter((f) => !worked.includes(f) && !f.startsWith("describe"));
  const copies = (f) => shows(f, mode) && (f !== "channels" || mode === "full");
  // where they'd like to be: copied from Full; below, pre-filled from the card's scales instead
  const prefilled = !copies("targetScales");
  const not = content.filter((f) => !copies(f) && f !== "targetScales");
  // (never copied: the community's own name, link and description)
  const own = "the community’s name, link and description";
  return {
    copied: [...content.filter(copies).map((f) => FIELD_LABELS[f]), ...(prefilled ? ["Where they’d like to be: pre-filled from this card’s scales"] : [])],
    prefilledTargets: prefilled,
    notCopied: [own.charAt(0).toUpperCase() + own.slice(1), ...not.map((f) => FIELD_LABELS[f])],
    notCopiedBrief: [own, ...new Set(not.map((f) => FIELD_GROUPS[f]))],   // e.g. "notes", not every kind of note
  };
}

/** Parts in short groups, for brief summaries (a fork's set-up note): every kind of note is "notes". */
const FIELD_GROUPS = {
  basics: "basics", targetScales: "where they’d like to be on the scales",
  platform: "the platform", platformDetails: "infrastructure details", costs: "infrastructure details", tools: "infrastructure details", locations: "locations",
  joiningTiers: "how people join", joiningWays: "ways of joining", closedNote: "ways of joining", structure: "decision-making approaches",
  rules: "rules", conflictSteps: "conflict steps", channels: "channels",
  federationOverview: "the federation approach", federationSteps: "federation details", federationRest: "federation details",
  customModules: "custom modules",
  joiningWaysNotes: "notes", structureNotes: "notes", membershipNote: "notes", processNotes: "notes", federationNotes: "notes",
};

/** Keep these keys of an object (what a mode shows). */
const pick = (obj = {}, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
/** Picks ([{ id, note, … }]) with their notes kept or blanked. */
const withNotes = (picks = [], keep) => picks.map((p) => (keep ? p : { ...p, note: null }));

/** The card as a mode shows it: the same shape, with only what the mode shares. */
export function viewCard(card, mode) {
  if (!MODE_IDS.includes(mode)) throw new Error(`Unknown view mode: ${mode}`);
  const on = new Set(card.modules || []);
  const has = (field) => shows(field, mode);
  const view = {
    id: card.id,
    schemaVersion: card.schemaVersion,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    forkedFrom: card.forkedFrom ?? null,   // what it was adapted from (shown as "Adapted from …"), in every mode
    // custom modules are only shown in Full: below that, their ids go too
    modules: (card.modules || []).filter((id) => !id.startsWith("cm_") || has("customModules")),
    basics: { ...card.basics },
  };
  if (!has("targetScales")) delete view.basics.targetScales;
  // the description: only the parts this mode shows
  const parts = { purpose: "describePurpose", culture: "describeCulture" };
  if (card.basics?.description) view.basics.description = Object.fromEntries(Object.entries(parts).filter(([, f]) => has(f)).map(([k]) => [k, card.basics.description[k] ?? null]));

  if (on.has("infrastructure")) {
    const inf = card.infrastructure || {};
    view.infrastructure = {
      platform: pick(inf.platform, [
        "platform", "software", "type", "structuralModel",
        ...(has("platformDetails") ? ["usesProtocol", "protocol", "openSource", "selfHosted"] : []),
      ]),
      ...(has("costs") ? { costs: inf.costs } : {}),
      ...(has("tools") ? { tools: inf.tools } : {}),
      // Foggy: only the kinds of tools (not part of the schema, so a fork leaves it out)
      ...(has("toolCategories") ? { toolCategories: [...new Set((inf.tools || []).filter((t) => t.tool && t.category).map((t) => t.category))] } : {}),
      ...(has("locations") ? { locations: inf.locations } : {}),
    };
  }

  // the structure is Membership's, but the Processes tabs show it too: kept
  // (without notes) for Processes even when Membership is off
  const structure = has("structure") ? withNotes(card.membership?.structure, has("structureNotes") && on.has("membership")) : undefined;
  if (on.has("membership")) {
    const j = card.membership?.joining || {};
    view.membership = {
      joining: {
        tiers: j.tiers,
        ...(has("joiningWays") ? { ways: withNotes(j.ways, has("joiningWaysNotes")) } : {}),
        ...(has("closedNote") ? { closedNote: j.closedNote } : {}),
      },
      ...(structure ? { structure } : {}),
      ...(has("membershipNote") ? { generalNote: card.membership?.generalNote } : {}),
    };
  } else if (on.has("processes") && structure) {
    view.membership = { structure };
  }

  if (on.has("rules") && has("rules")) view.rules = { ...card.rules };

  if (on.has("processes")) {
    const pr = card.processes || {};
    const area = (a = {}) => (has("processNotes") ? a : { approachNotes: {}, generalNote: null });
    const comms = pr.communications || {};
    const anyChannel = (comms.channels || []).length > 0 || (comms.customChannels || []).some((c) => c.name);
    view.processes = {
      ...(has("structure") ? { institutionalChange: area(pr.institutionalChange), maintenance: area(pr.maintenance), moderation: area(pr.moderation) } : {}),
      ...(has("conflictSteps") ? { conflictManagement: {
        approaches: withNotes(pr.conflictManagement?.approaches, has("processNotes")),
        generalNote: has("processNotes") ? pr.conflictManagement?.generalNote ?? null : null,
      } } : {}),
      // Foggy: only whether a channel is specified; Full: which ones
      ...(has("channels") ? { communications: mode === "full" ? comms : { channelsSpecified: anyChannel } } : {}),
    };
  }

  if (on.has("federation") && has("federationOverview")) {
    const f = card.federation || {};
    const rest = has("federationRest");
    view.federation = {
      approach: f.approach,
      // below Full: only whether a block list is shared, and whether they bridge
      subscriptions: rest ? f.subscriptions : { sharesBlocklist: f.subscriptions?.sharesBlocklist ?? null },
      bridging: rest ? f.bridging : { bridges: f.bridging?.bridges ?? null },
      ...(has("federationSteps") ? { responseLadder: withNotes(f.responseLadder, has("federationNotes")) } : {}),
      ...(rest ? pick(f, ["allowlistPolicy", "rulesNote"]) : {}),
    };
  }

  if (has("customModules")) view.customModules = (card.customModules || []).filter((m) => on.has(m.id));
  return view;
}

/**
 * A published card's public copy, for a view mode: the card as the mode
 * shows it, with its scales, and (Minimal) its rules count or (Foggy) its
 * rules counted by type, worked out from the whole card (those modes leave
 * the rules themselves out). Made by the server when
 * publishing (functions/index.js), and by the editor for its previews, so
 * the two can't disagree. data: { ruleSchema, scales } (rule_schema.json,
 * governance_scales.json).
 */
export function publicView(card, mode, { ruleSchema, scales }) {
  return {
    mode,
    card: viewCard(card, mode),
    ...(shows("rulesCount", mode) ? { rulesCount: rulesCount(card, ruleSchema) } : {}),
    ...(shows("rulesByType", mode) ? { rulesByType: rulesByType(card, ruleSchema) } : {}),
    scales: cardScales(card, scales, { includeProposed: COUNT_PROPOSED }),
  };
}

/** The public credit line's parts: only what the contributor chose to show; null for none. */
export function creditOf(a = {}) {
  const credit = {
    ...(a.showName && a.contributorName?.trim() ? { name: a.contributorName.trim() } : {}),
    ...(a.showOrganization && a.organization?.trim() ? { organization: a.organization.trim() } : {}),
  };
  return Object.keys(credit).length ? credit : null;
}

/**
 * A short code for a card's content: what a published version holds (the
 * Full view, without the save time), so the editor can tell whether there
 * are edits to publish. Keys are sorted, so the same content always gives
 * the same code, however it was saved. (FNV-1a: quick, not for security.)
 */
export function contentFingerprint(card) {
  const { updatedAt, ...content } = viewCard(card, "full");
  const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`
      : JSON.stringify(v ?? null));
  let h = 0x811c9dc5;
  for (const ch of stable(content)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
}

/**
 * How many rules a card has, by kind (rule_schema.json's categories): its
 * selected rules, and its custom rules under the kind they were given (or
 * "other"). Null when the Rules module is off.
 */
export function rulesCount(card, ruleSchema) {
  if (!(card.modules || []).includes("rules")) return null;
  const kindOfType = new Map(Object.entries(ruleSchema.types).flatMap(([kind, types]) => types.map((t) => [t.id, kind])));
  const kindOfRule = new Map(Object.entries(ruleSchema.types).flatMap(([kind, types]) => types.flatMap((t) => t.rules.map((r) => [r.id, kind]))));
  const counts = Object.fromEntries([...ruleSchema.categories.map((c) => [c.id, 0]), ["other", 0]]);
  for (const s of card.rules?.selected || []) counts[kindOfRule.get(s.id) || "other"] += 1;
  for (const r of card.rules?.customRules || []) if (r.text) counts[kindOfType.get(r.typeId) || "other"] += 1;
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/**
 * The scored items that count (governance_scales.json), by id ("list:option"):
 * accepted ones, plus proposed ones with includeProposed (previews, while
 * the scores are being reviewed).
 */
export function scoredItems(scaleData, { includeProposed = false } = {}) {
  const usable = (it) => it.status === "accepted" || (includeProposed && it.status === "proposed");
  return new Map(scaleData.items.filter(usable).map((it) => [it.id, it]));
}

/**
 * A card's rules counted by type (rule_schema.json's types), for the types
 * with any: how many of the type's rules were chosen, of how many, and how
 * many custom rules were added under it; custom rules without a type come
 * last, as "Other". Null when the Rules module is off.
 */
export function rulesByType(card, ruleSchema) {
  if (!(card.modules || []).includes("rules")) return null;
  const selected = new Set((card.rules?.selected || []).map((s) => s.id));
  const custom = (card.rules?.customRules || []).filter((r) => r.text);
  const types = Object.values(ruleSchema.types).flat();
  const rows = types.map((t) => ({
    id: t.id,
    label: t.name,
    chosen: t.rules.filter((r) => selected.has(r.id)).length,
    of: t.rules.length,
    custom: custom.filter((r) => r.typeId === t.id).length,
  }));
  const untyped = custom.filter((r) => !types.some((t) => t.id === r.typeId)).length;
  return [...rows, ...(untyped ? [{ id: "other", label: "Other", chosen: 0, of: 0, custom: untyped }] : [])].filter((r) => r.chosen || r.custom);
}

/** What a card chose that the scales score: [list, option id] pairs. */
function scoredChoices(card) {
  const on = new Set(card.modules || []);
  const out = [];
  if (on.has("membership") || on.has("processes")) {
    for (const s of card.membership?.structure || []) out.push(["decision_approaches", s.id]);
  }
  if (on.has("membership")) {
    for (const t of card.membership?.joining?.tiers || []) out.push(["membership_tiers", t]);
    for (const w of card.membership?.joining?.ways || []) out.push(["membership_options", w.id]);
  }
  if (on.has("processes")) {
    for (const a of card.processes?.conflictManagement?.approaches || []) out.push(["conflict_management", a.id]);
  }
  return out;
}

/**
 * A card's three scales (governance_scales.json): on each, the average of
 * the scores of what it chose, rounded to a whole number, with how many
 * choices it's based on; null when nothing it chose is scored on that scale
 * (shown as N/A). Only accepted scores count, unless includeProposed (for
 * previews while the scores are being reviewed).
 */
export function cardScales(card, scaleData, opts) {
  const byId = scoredItems(scaleData, opts);
  const chosen = scoredChoices(card).map(([list, id]) => byId.get(`${list}:${id}`)).filter(Boolean);
  return Object.fromEntries(scaleData.scales.map((sc) => {
    const scores = chosen.map((it) => it[sc.id]).filter((v) => v != null);
    return [sc.id, scores.length ? { score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), basedOn: scores.length } : null];
  }));
}

/** Why someone can report a published card (reportCard checks the reason is one of these). */
export const REPORT_REASONS = [
  { id: "harmful", label: "Hateful or harmful content" },
  { id: "harassment", label: "Harassment or someone’s personal information" },
  { id: "spam", label: "Spam or a scam" },
  { id: "illegal", label: "Illegal content" },
  { id: "impersonation", label: "Not this community’s own card" },
  { id: "other", label: "Something else" },
];
