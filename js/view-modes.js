// What a published card shows, in each view mode: the one set of rules,
// used by the editor (previews, Export) and, from Phase 4b, by the server
// (to make the public copies). Plain code: no page, no fetching; data is
// passed in, so the same file runs anywhere.
//
//   viewCard(card, mode)              → the card as that mode shows it (same shape, less in it)
//   rulesCount(card, ruleSchema)      → { behavior, content, other, total } | null
//   cardScales(card, scaleData, opts) → { participatory: { score, basedOn } | null, … }
//   shows(field, mode)                → does this mode show that part of a card?
//
// The modes, from least to most shared: Minimal, Minimal plus, Foggy, Full
// (see the Task log in CLAUDE.md). Never shown in any mode: the editor-only part (set-aside
// answers, dismissed suggestions, …) and attribution (credit comes in 4b,
// and only if the contributor opts in). Switched-off modules are left out.

export const MODES = [
  { id: "minimal", label: "Minimal", forkable: false,
    description: "The basics: who you are, your platform, how people join, how many rules you have, and the three scales." },
  { id: "minimal_plus", label: "Minimal plus", forkable: true,
    description: "Minimal, plus your rules themselves and where your servers, members and admins are." },
  { id: "foggy", label: "Foggy", forkable: true,
    description: "Most of your card, without the notes on how you use things: infrastructure, joining, rules, decision-making, conflict steps and federation." },
  { id: "full", label: "Full", forkable: true,
    description: "Everything, with your notes, your own modules, and downloads." },
];
const MODE_IDS = MODES.map((m) => m.id);
const from = (first) => MODE_IDS.slice(MODE_IDS.indexOf(first));   // this mode and every fuller one
const ALL = MODE_IDS;

/**
 * The parts of a card, and the modes that show them (the view-mode table in CLAUDE.md).
 * Exported for the outline ("Not shared" labels), the Publish preview and
 * forking (what a fork copies).
 */
export const FIELDS = {
  basics: ALL,                          // name, link, type, size, keywords, values
  platform: ALL,                        // platform, software, platform type, structural model
  platformDetails: from("foggy"),       // protocol, open source, self-hosted
  costs: from("foggy"),
  tools: from("foggy"),
  locations: from("minimal_plus"),
  joiningTiers: ALL,
  joiningWays: from("foggy"),           // with their notes
  closedNote: from("foggy"),
  structure: from("foggy"),             // decision-making approaches (Membership, and the Processes tabs)
  structureNotes: ["full"],
  membershipNote: ["full"],
  rulesCount: ALL,
  rules: from("minimal_plus"),          // the rules link, covenants, selected rules (with qualifiers and wording), custom rules
  conflictSteps: from("foggy"),
  processNotes: ["full"],               // notes per approach in each tab, conflict notes, general notes
  channels: from("foggy"),              // Foggy: only whether any channel is specified; Full: which
  federationSteps: from("foggy"),       // approach and response ladder
  federationNotes: ["full"],
  federationRest: ["full"],             // allowlist policy, shared lists, block list, tools, rules, bridging
  customModules: ["full"],
  scales: ALL,
  downloads: ["full"],
};

export const shows = (field, mode) => (FIELDS[field] || []).includes(mode);

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
    // custom modules are only shown in Full: below that, their ids go too
    modules: (card.modules || []).filter((id) => !id.startsWith("cm_") || has("customModules")),
    basics: { ...card.basics },
  };

  if (on.has("infrastructure")) {
    const inf = card.infrastructure || {};
    view.infrastructure = {
      platform: pick(inf.platform, [
        "platform", "software", "type", "structuralModel",
        ...(has("platformDetails") ? ["usesProtocol", "protocol", "openSource", "selfHosted"] : []),
      ]),
      ...(has("costs") ? { costs: inf.costs } : {}),
      ...(has("tools") ? { tools: inf.tools } : {}),
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
        ...(has("joiningWays") ? { ways: j.ways } : {}),
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

  if (on.has("federation") && has("federationSteps")) {
    const f = card.federation || {};
    view.federation = {
      approach: f.approach,
      responseLadder: withNotes(f.responseLadder, has("federationNotes")),
      ...(has("federationRest") ? pick(f, ["allowlistPolicy", "subscriptions", "relevantRules", "ruleNotes", "bridging"]) : {}),
    };
  }

  if (has("customModules")) view.customModules = (card.customModules || []).filter((m) => on.has(m.id));
  return view;
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
export function cardScales(card, scaleData, { includeProposed = false } = {}) {
  const usable = (it) => it.status === "accepted" || (includeProposed && it.status === "proposed");
  const byId = new Map(scaleData.items.filter(usable).map((it) => [it.id, it]));
  const chosen = scoredChoices(card).map(([list, id]) => byId.get(`${list}:${id}`)).filter(Boolean);
  return Object.fromEntries(scaleData.scales.map((sc) => {
    const scores = chosen.map((it) => it[sc.id]).filter((v) => v != null);
    return [sc.id, scores.length ? { score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), basedOn: scores.length } : null];
  }));
}
