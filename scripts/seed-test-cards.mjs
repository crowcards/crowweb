// Makes a set of test cards on the local emulator, for checking things by
// hand: the same rich card published in each view mode, cards with
// unpublished edits, unpublished, forked, taken down, reported, a draft
// with no contact email, and "Variety" cards: different platforms and kinds
// of answers, for checking how each part of the card looks. Writes each card's ID, secret, public page and what
// to check to test-cards.local.md (ignored by git and by hosting: never
// share it). Only ever talks to the local emulator, never staging.
//
//   firebase emulators:start      (in another terminal; restart it after changing js/view-modes.js)
//   node scripts/seed-test-cards.mjs
//
// The cards live only as long as the emulator's data (keep them with
// --import=emulator-data --export-on-exit). Run it again for a fresh set.
import { writeFileSync } from "node:fs";
const FN = "http://127.0.0.1:5001/cos-princeton-hci-crow/us-central1/";
const DB = "http://127.0.0.1:8080/v1/projects/cos-princeton-hci-crow/databases/(default)/documents/";
const call = async (fn, data) => { const r = await (await fetch(FN + fn, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) })).json(); if (!r.result) throw new Error(`${fn}: ${JSON.stringify(r).slice(0, 300)}`); return r.result; };
const out = [];
const LONG = "We ask everyone to read the welcome post and the code of conduct, then introduce themselves in the newcomers thread; a moderator checks in within a week to answer questions.";

async function make(name, fill) {
  const { cardId, secret } = await call("createCard", {});
  const { card } = await call("getCard", { cardId, secret });
  const updates = fill(card);
  const { updatedAt } = await call("updateCard", { cardId, secret, updates, ifUpdatedAt: card.updatedAt });
  return { cardId, secret, updatedAt, name };
}
const edit = async (c, fn) => { const { card } = await call("getCard", c); const { updatedAt } = await call("updateCard", { cardId: c.cardId, secret: c.secret, updates: fn(card), ifUpdatedAt: card.updatedAt }); return updatedAt; };
const publish = (c, mode, note = null, listed = false) => call("publishCard", { cardId: c.cardId, secret: c.secret, mode, listed, note });

// the rich card's content (every module, notes long and short, custom rules and module)
const rich = (name) => (card) => ({
  modules: ["infrastructure", "membership", "rules", "processes", "federation", "cm_tests1"],
  basics: { ...card.basics, name, link: "https://willow.example", type: "hobby", format: "social_network_media", size: "medium",
    description: { purpose: "A home on the fediverse for gardeners, allotment holders and small growers in the river valley: seed swaps, harvest photos, planting calendars and monthly work days", culture: "Warm and patient: we help each other, and newcomers are always welcome" },
    keywords: ["gardening", "seed swaps", "local food"], targetScales: { participatory: 6, transparent: 6, hierarchical: 2 },
    values: ["trust", "consensus", "transparency", "mutual_aid", "community_care"] },
  infrastructure: { ...card.infrastructure,
    platform: { type: "self_hosted_text_primary", platform: "activitypub_client_mastodon", software: "Mastodon", usesProtocol: "yes", protocol: "ActivityPub", openSource: "yes", selfHosted: "yes", structuralModel: "Federation" },
    costs: { ...card.infrastructure.costs, hostingServers: "yes", mediaStorage: "yes", domain: "yes", emailDelivery: "no", adminModLabor: "yes", legalCompliance: "no", inPersonEvents: "no" },
    tools: [{ tool: "loomio", category: "deliberation_decision_making", usedFor: "proposals and votes" }, { tool: "Seed Ledger", category: "documentation_wikis", usedFor: "tracking the seed library" }],
    locations: { servers: ["DE"], members: ["US", "CA", "DE"], adminTeam: ["US"] } },
  membership: { ...card.membership,
    joining: { tiers: ["open", "restricted_approvals"], ways: [{ id: "open_access", note: "Anyone can make an account." }, { id: "orientation_required", note: LONG }], closedNote: null, note: "Moderators can invite people straight in; everyone else starts with the welcome thread." },
    structure: [{ id: "sociocracy", note: "Three circles: tech, moderation, events." }, { id: "lazy_consensus", note: null }],
    generalNote: "Members who have been active for three months can join a circle." },
  rules: { ...card.rules, communityRulesLink: "https://willow.example/about", covenants: ["mastodon_server_covenant"],
    selected: [{ id: "civility_be_respectful", qualifier: null }, { id: "harassment_no_harassment", qualifier: null }, { id: "harassment_no_dogpiling", qualifier: null }, { id: "discrimination_no_hate_speech", qualifier: null }, { id: "cw_sexual_content", qualifier: "required" }, { id: "cw_disturbing_traumatic_topics", qualifier: "recommended" }, { id: "ai_generated_media", qualifier: "allowed_with_disclosure" }],
    ruleEdits: { civility_be_respectful: { text: "Be kind, especially to beginners", original: "Be respectful" } },
    customRules: [{ id: "cr_t1", text: "No selling seeds for profit in the swap threads", typeId: "civility", qualifierSet: null, qualifier: null }, { id: "cr_t2", text: "Tag pest photos with #pests", typeId: null, qualifierSet: null, qualifier: null }] },
  processes: { ...card.processes,
    institutionalChange: { approachNotes: { sociocracy: "Rule changes go to a members' circle, then a two-week comment period." }, generalNote: "Big changes are announced a month ahead." },
    maintenance: { approachNotes: { lazy_consensus: "Admins update the server unless someone objects within 48 hours." }, generalNote: null },
    moderation: { approachNotes: { sociocracy: "The moderation circle decides on suspensions together." }, generalNote: LONG },
    conflictManagement: { approaches: [{ id: "peer_mediation", note: "A volunteer mediator from another circle.", stage: 1, primary: true }, { id: "restorative_practices", note: null, stage: 2, primary: false }, { id: "conflict_resolution_council", note: null, stage: 2, primary: false }], generalNote: "Anyone can ask for mediation." },
    communications: { channels: ["announcementFeed", "groupChat"], customChannels: [{ name: "Monthly town hall", description: "A video call on the first Sunday" }] } },
  federation: { ...card.federation, approach: "denylist_first", allowlistPolicy: null,
    responseLadder: [{ id: "warn", note: "We message the other server's admins first.", stage: 1 }, { id: "mute", note: null, stage: 2 }, { id: "block", note: null, stage: 3 }],
    subscriptions: { subscribedLists: ["garden_fence", "iftas_dnif"], sharesBlocklist: "yes", blocklistLink: "https://willow.example/blocks", decisionTools: ["fediseer"] },
    rulesNote: "We block servers that allow harassment or hate speech (our first rules).",
    bridging: { bridges: "yes", protocols: ["AT Protocol"] } },
  customModules: [{ id: "cm_tests1", name: "Seed library", description: "How our shared seed library works.", fields: [
    { id: "f_t1", label: "Who can borrow seeds?", type: "text", value: "Any member, up to five packets a season." },
    { id: "f_t2", label: "What we keep", type: "checkbox", value: ["Vegetables", "Herbs"], options: ["Vegetables", "Herbs", "Flowers"] },
    { id: "f_t3", label: "How organized is it?", type: "scale", value: 4, min: 1, max: 5, low: "Loose", high: "Strict" }] }],
  attribution: { ...card.attribution, contributorName: "Test Contributor", contributorEmail: "test@example.org", organization: "CROW team", showName: true, showOrganization: true },
});

const log = (c, what, check) => out.push({ ...c, what, check });

// 1–4: the same rich card, published in each mode (Full has v1 and v2)
const full = await make("Willow Commons (Full)", rich("Willow Commons (Full)"));
await publish(full, "full", "First version", true);
await edit(full, (card) => ({ membership: { ...card.membership, generalNote: "Members active for three months can join a circle; ask in the town hall." } }));
await publish(full, "full", "Reworded the membership note", true);
log(full, "Rich card, Full view, v1 and v2 (listed)", "Public page in Full: everything, notes on asterisk badges (hover, focus or tap), the joining note on Joining’s heading, “Full view” in the callout, versions v1/v2 (?v=1), downloads, credit shown, Fork; editor: Export says up to date; Basics summary; suggestion tiers in Membership / Processes / Conflict (values: trust, consensus, transparency, mutual aid, community care; medium; P6 T6 H2).");
for (const mode of ["misty", "foggy", "minimal"]) {
  const c = await make(`Willow Commons (${mode[0].toUpperCase() + mode.slice(1)})`, rich(`Willow Commons (${mode[0].toUpperCase() + mode.slice(1)})`));
  await publish(c, mode);
  log(c, `The same card, ${mode} view`, { misty: "No notes; rules listed; description: purpose and culture; Fork.", foggy: "Rule counts by type; kinds of tools (Deliberation…, Documentation…) not the tools; locations; federation overview only; description: purpose only; Fork.", minimal: "Basics, platform, how people join, how many rules, scales; description: purpose only; no Fork button." }[mode]);
}
const misty = out[1];

// 5: published, then edited without publishing
const pending = await make("Pending Edits Garden", rich("Pending Edits Garden"));
await publish(pending, "misty", "First version"); await publish(pending, "misty", "Second version");
await edit(pending, (card) => ({ basics: { ...card.basics, keywords: [...card.basics.keywords, "composting"] } }));
log(pending, "Published v2 (Misty), then edited (a keyword added)", "Export: \"Publish your edits as v3\" shows; Add a changelog comment; changing the view mode or listed shows \"Apply these settings to v2\"; Preview ↗ shows the draft with \"composting\".");

// 6: unpublished, history kept
const unpub = await make("Unpublished Garden", rich("Unpublished Garden"));
await publish(unpub, "full"); await publish(unpub, "full");
await call("unpublishCard", { cardId: unpub.cardId, secret: unpub.secret, deleteHistory: false });
log(unpub, "Published v1, v2, then unpublished (history kept)", "Its link says not available; Export: status Unpublished with history; publishing again makes v3; then try Unpublish and delete history, and publish: back to v1.");

// 7: a fork of the Misty card, published in Minimal
const fork = await call("forkCard", { cardId: misty.cardId });
const forkC = { ...fork, name: "Fork of Willow (Misty)" };
await edit(forkC, (card) => ({ basics: { ...card.basics, name: "Fork of Willow (Misty)" }, modules: card.editor.forkModules, attribution: { ...card.attribution, contributorEmail: "fork@example.org" } }));
await publish(forkC, "minimal");
log(forkC, "A fork of Willow Commons (Misty), published Minimal", "Public page: \"Forked from Willow Commons (Misty) · v1 · Misty view\" (links to it); no Fork button (Minimal); editor Basics summary: Forked from; name / link / description were empty (name added by the seed); scales pre-filled; no notes copied.");

// 8: taken down by the team
const down = await make("Taken Down Garden", rich("Taken Down Garden"));
await publish(down, "full");
const H = { "Content-Type": "application/json", Authorization: "Bearer owner" };
await fetch(`${DB}cards/${down.cardId}?updateMask.fieldPaths=publishing.hidden&updateMask.fieldPaths=publishing.status`, { method: "PATCH", headers: H, body: JSON.stringify({ fields: { publishing: { mapValue: { fields: { hidden: { booleanValue: true }, status: { stringValue: "unpublished" } } } } } }) });
const vers = await (await fetch(`${DB}public/${down.cardId}/versions`, { headers: H })).json();
for (const d of vers.documents || []) await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: "DELETE", headers: H });
await fetch(`${DB}public/${down.cardId}`, { method: "DELETE", headers: H });
log(down, "Taken down (the procedure in DESIGN.md, done by the seed)", "Its link says not available; Export says \"Taken down by the CROW team\"; publishing is refused.");

// 9: reported
const rep = await make("Reported Garden", rich("Reported Garden"));
await publish(rep, "foggy");
await call("reportCard", { cardId: rep.cardId, version: 1, reason: "spam", details: null, email: null });
await call("reportCard", { cardId: rep.cardId, version: 1, reason: null, details: "This isn't the real Willow Commons.", email: "reporter@example.org" });
log(rep, "Published Foggy, with 2 reports (in the emulator's Firestore → reports)", "Report flag under the to-top arrow: a reason or a note required; then see the reports at localhost:4000 → Firestore → reports.");

// 10: a draft without a contact email
const draft = await make("Draft Without Email", (card) => ({ modules: ["membership"], basics: { ...card.basics, name: "Draft Without Email", type: "hobby", format: "discussion_forum", size: "small", targetScales: { participatory: 4, transparent: 4, hierarchical: 4 }, values: ["learning"] } }));
log(draft, "A draft: name and type, no contact email", "Export → Publish says what's missing (the email) and is refused; add an email and it publishes v1 (Minimal by default).");

// 11–17: the card on different platforms and with different kinds of answers, all published Full
// (one Misty), to check how each part looks: yes / no / varies, every joining tier, notes long
// and short, many tools, regions, missing modules, custom modules
const VERY_LONG = "New members get a buddy for their first month: someone who answers questions, shows them where the tools and the meeting notes live, and checks in after the first two meetings. Buddies volunteer for a season at a time and get a short guide. If it isn't working out, either of you can ask the coordinators for a different buddy, no questions asked. We review the buddy guide every spring, and anyone can suggest changes.";
const variety = (name, fill) => (card) => {
  const v = fill(card);
  return { ...v, basics: { ...card.basics, name, targetScales: { participatory: 4, transparent: 4, hierarchical: 4 }, ...v.basics },
    attribution: { ...card.attribution, contributorEmail: "test@example.org" } };
};
const varieties = [
  ["Variety: Discord book club", "Discord: proprietary, no protocol, not self-hosted (all three struck through); one restricted tier; top-down decisions; many tools; no federation", (card) => ({
    modules: ["infrastructure", "membership", "processes"],
    basics: { type: "friends", format: "chat_group", size: "small", keywords: ["books", "monthly pick"], values: ["learning", "trust"],
      description: { purpose: "A small Discord for people who actually finish books", culture: "" } },
    infrastructure: { ...card.infrastructure, platform: { type: "corporate_proprietary", platform: "discord", software: "Proprietary", usesProtocol: "no", protocol: null, openSource: "no", selfHosted: "no", structuralModel: "Centralized" },
      costs: { ...card.infrastructure.costs, hostingServers: "no", domain: "no", paidSoftware: "no", adminModLabor: "yes" },
      tools: [{ tool: "google_forms", category: "surveys_feedback", usedFor: "picking next month's book" }, { tool: "cal_com", category: "events_calendars", usedFor: "" }, { tool: "eventbrite", category: "events_calendars", usedFor: "the yearly meetup" }, { tool: "Goodreads", category: "documentation_wikis", usedFor: "our shared shelf" }],
      locations: { servers: ["US"], members: ["NG", "GB"], adminTeam: ["NG"] } },
    membership: { ...card.membership, joining: { tiers: ["restricted_approvals"], ways: [{ id: "invitation_only", note: "Ask Kemi." }], closedNote: null, note: null }, structure: [{ id: "autocratic_decision_making", note: "Kemi decides; she asks first." }], generalNote: null },
    processes: { ...card.processes, conflictManagement: { approaches: [{ id: "managerial_decision", note: null, stage: 1, primary: false }], generalNote: null }, communications: { channels: ["groupChat"], customChannels: [] } },
  })],
  ["Variety: Bluesky neighbors", "Bluesky: protocol-based (AT Protocol on hover), open source, not self-hosted; open only; a long description (cut to three lines)", (card) => ({
    modules: ["infrastructure", "membership", "processes"],
    basics: { type: "neighborhood", format: "social_network_media", size: "large", keywords: [], values: ["localism", "mutual_aid", "openness"],
      description: { purpose: "Neighbors in the Eastside sharing what's happening on our streets: lost pets, road closures, free stuff on the curb, small businesses opening and closing, and the occasional argument about parking. We post as a custom feed anyone on Bluesky can follow, and a handful of volunteers keep an eye on the feed and the replies", culture: "Neighborly and practical. Assume good faith, keep it local, and don't post anyone's address" } },
    infrastructure: { ...card.infrastructure, platform: { type: "protocol_client_pds_based", platform: "at_protocol_client_bluesky", software: "Bluesky", usesProtocol: "yes", protocol: "AT Protocol", openSource: "yes", selfHosted: "no", structuralModel: "Federation" },
      costs: { ...card.infrastructure.costs, hostingServers: "no", mediaStorage: "no", domain: "yes", adminModLabor: "yes" }, tools: [], locations: { servers: ["US"], members: ["US"], adminTeam: ["US"] } },
    membership: { ...card.membership, joining: { tiers: ["open"], ways: [{ id: "open_access", note: null }], closedNote: null, note: null }, structure: [{ id: "do_ocracy", note: null }, { id: "majority_rule", note: "For feed rules, a poll in the replies." }], generalNote: null },
    processes: { ...card.processes, moderation: { approachNotes: { do_ocracy: "Whoever sees a problem first deals with it." }, generalNote: null }, communications: { channels: ["announcementFeed", "publicContactInfo"], customChannels: [] } },
  })],
  ["Variety: Matrix mutual aid", "Matrix (generic): open source and self-hosted vary; every joining tier (Closed with its note); many ways of joining with notes, one over 300 characters; notes in all three Processes areas; conflict in three steps, two in parallel; federation with an allowlist", (card) => ({
    modules: ["infrastructure", "membership", "processes", "federation"],
    basics: { type: "movement", format: "chat_group", size: "medium", keywords: ["mutual aid", "rides", "groceries"], values: ["mutual_aid", "solidarity", "consensus", "community_care", "accountability"],
      description: { purpose: "Neighbors organizing rides, groceries and childcare for each other", culture: "Solidarity, not charity" } },
    infrastructure: { ...card.infrastructure, platform: { type: "self_hosted_text_primary", platform: "chat_group__matrix_client_generic", software: "", usesProtocol: "yes", protocol: "Matrix", openSource: "varies", selfHosted: "varies", structuralModel: "Federation" },
      costs: { ...card.infrastructure.costs, hostingServers: "yes", domain: "yes", backupsDisasterRecovery: "yes", adminModLabor: "yes", inPersonEvents: "yes" },
      tools: [{ tool: "loomio", category: "deliberation_decision_making", usedFor: "proposals" }, { tool: "cryptpad", category: "documentation_wikis", usedFor: "the ride rota" }],
      locations: { servers: ["EU"], members: ["DE", "NL", "FR"], adminTeam: ["DE"] } },
    membership: { ...card.membership,
      joining: { tiers: ["open", "tiered_probationary", "restricted_approvals", "closed"],
        ways: [{ id: "open_access", note: "The public room is open to anyone." }, { id: "mentorship", note: VERY_LONG }, { id: "trial_period_provisional_membership", note: "Three months before you can vote." }, { id: "peer_sponsorship", note: null }, { id: "consensus_or_vote_based_approval", note: "For the coordinators' room only." }, { id: "membership_agreement_or_pledge", note: "Our solidarity pledge." }],
        closedNote: "The coordinators' room is full until the spring elections.", note: "Everyone starts in the public room." },
      structure: [{ id: "consensus_decision_making", note: "Weekly general meeting." }, { id: "delegated_decision_making", note: null }, { id: "rotational_leadership", note: "Facilitators rotate monthly." }, { id: "lazy_consensus", note: null }],
      generalNote: "Working groups: rides, groceries, childcare." },
    processes: { ...card.processes,
      institutionalChange: { approachNotes: { consensus_decision_making: "Changes to the pledge need two meetings." }, generalNote: "Proposals are posted a week ahead." },
      maintenance: { approachNotes: { lazy_consensus: "The tech group updates the server.", delegated_decision_making: "The tech group can spend up to 50 € without asking." }, generalNote: null },
      moderation: { approachNotes: { consensus_decision_making: "Bans are decided at the general meeting.", rotational_leadership: "The week's facilitator handles reports." }, generalNote: "Report anything to the facilitator." },
      conflictManagement: { approaches: [{ id: "peer_mediation", note: null, stage: 1, primary: true }, { id: "circle_processes", note: "If mediation doesn't settle it.", stage: 2, primary: false }, { id: "restorative_practices", note: null, stage: 2, primary: false }, { id: "consensus_building", note: null, stage: 3, primary: false }], generalNote: "Anyone can ask for a mediator." },
      communications: { channels: ["groupChat", "listserv", "feedbackForm"], customChannels: [{ name: "Phone tree", description: "For members without smartphones" }] } },
    federation: { ...card.federation, approach: "allowlist_first", allowlistPolicy: "We federate with other mutual aid groups we've met.", responseLadder: [{ id: "warn", note: null, stage: 1 }, { id: "deliberate", note: "At the general meeting.", stage: 2 }, { id: "block", note: null, stage: 3 }],
      subscriptions: { subscribedLists: [], sharesBlocklist: "no", blocklistLink: null, decisionTools: [] }, rulesNote: null, bridging: { bridges: "no", protocols: [] } },
  })],
  ["Variety: Signal support circle", "Signal: protocol-based (Signal Protocol), open source, not self-hosted; closed (with its note); no costs answered; regions as places", (card) => ({
    modules: ["infrastructure", "membership"],
    basics: { type: "support", format: "chat_group", size: "small", keywords: ["grief"], values: ["empathy", "trust"] },
    infrastructure: { ...card.infrastructure, platform: { type: "centralized_messaging", platform: "signal_chat_signal", software: "Signal", usesProtocol: "yes", protocol: "Signal Protocol", openSource: "yes", selfHosted: "no", structuralModel: "Centralized" },
      tools: [], locations: { servers: ["WORLDWIDE"], members: ["EU", "LATAM"], adminTeam: ["ES"] } },
    membership: { ...card.membership, joining: { tiers: ["closed"], ways: [], closedNote: "We keep the group small; a new circle starts each autumn.", note: null }, structure: [], generalNote: null },
  })],
  ["Variety: Lemmy makers (Misty)", "Lemmy: everything yes; Misty view: no notes or badges at all", (card) => ({
    modules: ["infrastructure", "membership", "processes"],
    basics: { type: "hobby", format: "discussion_forum", size: "large", keywords: ["3d printing", "repair"], values: ["knowledge_sharing", "openness"],
      description: { purpose: "A forum for makers: 3D printing, repair and electronics", culture: "Share your files and your failures" } },
    infrastructure: { ...card.infrastructure, platform: { type: "self_hosted_text_primary", platform: "activitypub_client_lemmy", software: "Lemmy", usesProtocol: "yes", protocol: "ActivityPub", openSource: "yes", selfHosted: "yes", structuralModel: "Federation" },
      costs: { ...card.infrastructure.costs, hostingServers: "yes", mediaStorage: "yes" }, tools: [{ tool: "hedgedoc", category: "documentation_wikis", usedFor: "build guides" }], locations: { servers: ["FI"], members: ["WORLDWIDE"], adminTeam: ["FI", "PL"] } },
    membership: { ...card.membership, joining: { tiers: ["open"], ways: [{ id: "open_access", note: "Sign up and post." }], closedNote: null, note: "Read the sidebar first." }, structure: [{ id: "lazy_consensus", note: "Mods act, then explain." }], generalNote: null },
    processes: { ...card.processes, conflictManagement: { approaches: [{ id: "mediation", note: "A mod not involved.", stage: 1, primary: false }], generalNote: null }, communications: { channels: ["announcementFeed"], customChannels: [] } },
  }), "misty"],
  ["Variety: Own forum, bare", "A typed platform and software (phpBB, shown as its own pill), no platform type; only Infrastructure (it takes the full width); no description", (card) => ({
    modules: ["infrastructure"],
    basics: { type: "club", format: "discussion_forum", size: "medium", keywords: [], values: ["reliability"] },
    infrastructure: { ...card.infrastructure, platform: { type: null, platform: "Rowing club forum", software: "phpBB", usesProtocol: "no", protocol: null, openSource: "yes", selfHosted: "yes", structuralModel: null },
      tools: [], locations: { servers: [], members: [], adminTeam: [] } },
  })],
  ["Variety: Co-op, custom modules", "No Infrastructure or Membership: Processes alone (the scales and decision-making); many rules, custom ones with and without a type; two custom modules", (card) => ({
    modules: ["rules", "processes", "cm_v1", "cm_v2"],
    basics: { type: "cooperative", format: "team", size: "small", keywords: ["bakery", "worker co-op"], values: ["common_ownership", "fair_remuneration", "consensus"],
      description: { purpose: "A worker-owned bakery's team workspace", culture: "Everyone owns it, everyone sweeps" } },
    membership: { ...card.membership, structure: [{ id: "consensus_decision_making", note: null }, { id: "elected_board_of_directors", note: "For contracts over 5,000 €." }], generalNote: null },
    rules: { ...card.rules, communityRulesLink: null, covenants: [],
      selected: [{ id: "civility_be_respectful", qualifier: null }, { id: "harassment_no_harassment", qualifier: null }, { id: "discrimination_no_hate_speech", qualifier: null }],
      ruleEdits: {}, customRules: [{ id: "cr_v1", text: "Shift swaps go in the rota channel", typeId: "civility", qualifierSet: null, qualifier: null }, { id: "cr_v2", text: "No work talk after 9 pm", typeId: null, qualifierSet: null, qualifier: null }, { id: "cr_v3", text: "Flour orders over 200 kg need two signatures", typeId: null, qualifierSet: null, qualifier: null }] },
    processes: { ...card.processes, institutionalChange: { approachNotes: { consensus_decision_making: "Bylaw changes at the yearly meeting." }, generalNote: null } },
    customModules: [
      { id: "cm_v1", name: "Shares", description: "How member shares work.", fields: [{ id: "f_v1", label: "Share price", type: "text", value: "500 €, payable over a year" }, { id: "f_v2", label: "Votes per member", type: "radio", value: "One", options: ["One", "By shares"] }] },
      { id: "cm_v2", name: "Wellbeing", description: "", fields: [{ id: "f_v3", label: "How rested is the team?", type: "scale", value: 7, min: 0, max: 10, low: "Exhausted", high: "Rested" }, { id: "f_v4", label: "What we offer", type: "checkbox", value: ["Paid sick days", "Flexible shifts"], options: ["Paid sick days", "Flexible shifts", "Therapy budget"] }] }],
  })],
];
for (const [name, check, fill, mode = "full"] of varieties) {
  const c = await make(name, variety(name, fill));
  await publish(c, mode);
  log(c, `Variety, published ${mode === "full" ? "Full" : "Misty"}`, check);
}

const md = ["# Test cards (local emulator)", "", "Made by scripts/seed-test-cards.mjs. Don't share this file or commit it. Open localhost:5000/make.html → Edit an existing card, and paste the ID and secret. Public pages: localhost:5000/c/<ID>.", ""];
for (const c of out) md.push(`## ${c.name}`, `- ID: \`${c.cardId}\``, `- Secret: \`${c.secret}\``, `- Public page: http://localhost:5000/c/${c.cardId}`, `- What it is: ${c.what}`, `- Check: ${c.check}`, "");
const file = new URL("../test-cards.local.md", import.meta.url);
writeFileSync(file, md.join("\n"));
console.log(`Made ${out.length} test cards; their keys and what to check are in ${file.pathname}`);
