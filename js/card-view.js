// A card drawn as a card: one summary box, sections divided by dotted pixel
// lines, with pills, tags, pixel badges, scale bars, a costs table and step
// flows. Used for the published card page, its preview, and Export's "Your
// Card in full", so the editor shows what readers see.
//
//   const box = renderCard(view, data, defaults, { heading: "h1" });
//
// view: a public copy (view-modes.js publicView): { mode, card, rulesCount,
// scales }; data: Export's reference data (loadExportData); defaults: the
// module defaults (for module names and order). What the view leaves out
// isn't mentioned; empty answers are left out; a section with nothing filled
// in says so. Long notes are cut short, with a "…" button to read them whole.

import { el, button } from "./dom.js";
import { MODES } from "./view-modes.js";
import { cardOutline, labelIn, labels } from "./export.js";
import { moduleEntries } from "./modules.js";
import { toolLine } from "./sections/infrastructure.js";
import { channelLine, WORK_AREAS } from "./sections/processes.js";
import { DESCRIPTION } from "./sections/basics.js";
import { structureIds } from "./structure.js";

const NOTE_MAX = 80;    // characters of a note shown before "…"

// ── small pieces ────────────────────────────────────────────
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");
/** A pixel pill (type, size, how people join, an approach). */
const pill = (text) => el("span", { className: "card-pill", textContent: text });
/** Tags in a row: orange (chosen things), or soft (gray: keywords, places). */
const tags = (items, { soft = false } = {}) => el("ul", { className: "tags plain-list" },
  ...items.map((t) => el("li", { className: `tag${soft ? " tag-soft" : ""}` }, ...[].concat(t))));
/** A yes / no / varies answer as a pixel ✓ / ✗ (or "varies"), after its label. */
const yesNo = (label, v) => (v ? el("span", { className: "card-yesno" }, small(label), " ",
  v === "varies" ? el("span", { className: "mono-u summary-label", textContent: "varies" })
    : el("span", { className: v === "yes" ? "icon-yes" : "icon-no", role: "img", ariaLabel: v === "yes" ? "yes" : "no" })) : null);
/** A small mono label, e.g. "CHANGE". */
const small = (text) => el("span", { className: "mono-u summary-label", textContent: text });
/** One line (or none): its parts, those given. */
const line = (...parts) => (parts.some((p) => p != null && p !== "") ? el("p", { className: "card-line" }, ...parts.filter((p) => p != null && p !== "")) : null);

/**
 * A note, cut at NOTE_MAX characters with a pixel "…" button to read it
 * whole (and to fold it again). label: an optional small label before it;
 * nested: under an approach, as "↳ CHANGE · note".
 */
function note(text, label, { nested = false } = {}) {
  if (!has(text)) return null;
  const full = String(text).trim();
  const body = el("span", { textContent: full });
  const p = el("p", { className: "card-note" },
    nested ? el("span", { className: "icon-sub", ariaHidden: "true" }) : null,   // ↳: under the approach above
    label ? small(label) : null, label ? (nested ? " · " : " ") : null,
    el("span", { className: "icon-note", role: "img", ariaLabel: "Note:" }), body);
  if (full.length <= NOTE_MAX) return p;
  const short = `${full.slice(0, NOTE_MAX).replace(/\s+\S*$/, "")}…`;
  body.textContent = short;
  const more = button("", "card-more", () => {
    const open = more.getAttribute("aria-expanded") !== "true";
    body.textContent = open ? full : short;
    more.setAttribute("aria-expanded", String(open));
    more.setAttribute("aria-label", open ? "Show less" : "Read the whole note");
  });
  more.append(el("span"), el("span"), el("span"));   // three pixel dots
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", "Read the whole note");
  p.append(" ", more);
  return p;
}

/**
 * Steps ([{ id, note, stage, primary? }]): left to right, a column per step
 * with arrows between, notes under; or (numbered) a numbered list, a line
 * per step with its approaches side by side, and their notes under the step.
 */
function flow(steps = [], options, { numbered = false } = {}) {
  if (!steps.length) return [];
  const stages = [...new Set(steps.map((s) => s.stage))].sort((a, b) => a - b);
  const label = (s) => `${labelIn(options, s.id)}${s.primary ? " ★" : ""}`;
  const inStage = (stage) => tags(steps.filter((s) => s.stage === stage).map(label));
  return [
    numbered
      ? el("ol", { className: "plain-list card-steps" }, ...stages.map((stage, i) => el("li", {},
        el("div", { className: "card-step" }, el("span", { className: "card-step-n", textContent: `${i + 1}.` }), inStage(stage)),
        ...steps.filter((s) => s.stage === stage && s.note).map((s) => note(s.note, labelIn(options, s.id), { nested: true })))))
      : el("div", { className: "card-flow" }, ...stages.flatMap((stage, i) => [
        i ? el("span", { className: "flow-arrow", ariaHidden: "true" }) : null,
        inStage(stage),
      ].filter(Boolean))),
    ...(numbered ? [] : steps.filter((s) => s.note).map((s) => note(s.note, labelIn(options, s.id)))),
    steps.some((s) => s.primary) ? el("p", { className: "card-note", textContent: "★ primary" }) : null,
  ];
}

/** A pixel bar for a scale: its score filled in, the community's target (if shown) outlined. */
function scaleBar(sc, score, target, range) {
  const cells = Array.from({ length: range.max - range.min + 1 }, (_, i) => {
    const n = range.min + i;
    const cell = el("i", { className: `${score != null && n <= score ? "on" : ""}${n === target ? " target" : ""}`.trim() });
    if (n === target) {   // its key, on hover or focus
      cell.tabIndex = 0;
      cell.append(el("span", { className: "choice-tip", role: "tooltip", textContent: `Where they’d like to be: ${target}` }));
    }
    return cell;
  });
  return el("div", { className: "card-scale" },
    el("span", { className: "mono-u card-scale-name", textContent: sc.label }),
    el("span", { className: "card-scale-bar", role: "img",
      ariaLabel: `${sc.label}: ${score ?? "not scored"} of ${range.max}${target != null ? `; they’d like ${target}` : ""}` }, ...cells),
    el("span", { className: "card-scale-score", textContent: score != null ? `${score}/${range.max}` : "–" }));
}

/** A group's small heading (an icon before it, optionally). */
const head = (title, icon) => el("div", { className: "card-head" }, icon ? el("span", { className: icon, ariaHidden: "true" }) : null, small(title));

/** General notes gathered in a small note box: [[label, text]], a label column and the notes beside it; none, no box. */
function notesBox(items) {
  const shown = items.filter(([, text]) => has(text));
  return shown.length ? el("aside", { className: "callout card-notes-box" }, head("Notes"), el("div", { className: "card-notes" },
    ...shown.flatMap(([label, text]) => [small(label), note(text)]))) : null;
}

/** A section: a small heading, then its parts (or "Not filled in yet"). */
function section(title, parts) {
  const filled = parts.flat().filter(Boolean);
  return el("section", { className: "card-section" },
    el("h3", { textContent: title }),
    ...(filled.length ? filled : [el("p", { className: "field-hint", textContent: "Not filled in yet." })]));
}

// ── the sections ────────────────────────────────────────────
/** Whether a card's software says more than its platform: typed in, unlike the listed platform's (or for a typed platform). */
function ownSoftware(p, x) {
  if (!p.software?.trim() || ["proprietary", "none"].includes(p.software.trim().toLowerCase())) return false;
  const listed = x.platformRecords[p.platform];
  return !listed || p.software.trim().toLowerCase() !== String(listed.software || "").toLowerCase();
}

function infrastructure(inf, d) {
  const x = d.infrastructure;
  const p = inf.platform || {};
  // costs: a row per answered category, a column per answer (Y O S R N), a pixel dot in its
  // column; each letter's word shows in the shared bubble on hover or focus
  const answered = x.costCategories.filter((c) => inf.costs?.[c.id]);
  const costs = answered.length ? el("table", { className: "card-costs" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col", className: "mono-u card-costs-title", textContent: "Costs" }), ...x.costValues.map((v) => {
      const th = el("th", { scope: "col", tabIndex: 0 }, el("span", { ariaHidden: "true", textContent: v.label[0] }),
        el("span", { className: "choice-tip", role: "tooltip", textContent: v.label }));
      th.setAttribute("aria-label", v.label);
      return th;
    }))),
    el("tbody", {}, ...answered.map((c) => el("tr", {},
      el("th", { scope: "row", className: "mono-u", textContent: c.label }),
      ...x.costValues.map((v) => el("td", {}, inf.costs[c.id] === v.id ? el("span", { className: "card-dot", role: "img", ariaLabel: v.label }) : null)))))) : null;
  // locations: each place once, with the roles it has
  const roles = new Map();
  for (const [key, role] of [["servers", "servers"], ["members", "members"], ["adminTeam", "admins"]]) {
    for (const code of inf.locations?.[key] || []) roles.set(code, [...(roles.get(code) || []), role]);
  }
  // two columns: the platform and how it's run on the left, the costs on the right
  const left = [
    p.platform ? el("div", {}, pill(labelIn(x.platforms, p.platform))) : null,
    p.type ? line(labelIn(x.platformTypes, p.type)) : null,
    // the software only when it adds something: the listed platform's name already includes its
    // software (e.g. "ActivityPub client (Mastodon)"), so only software typed in differently, or for a typed platform
    ownSoftware(p, x) ? el("div", {}, pill(p.software)) : null,
    roles.size ? el("ul", { className: "plain-list card-places" }, ...[...roles].map(([code, r]) => el("li", {},
      el("span", { className: "tag tag-soft", textContent: labelIn(x.places, code) }),
      el("span", { className: "tag-role", textContent: r.join(", ") })))) : null,
    line(yesNo("Open protocol", p.usesProtocol)),
    p.usesProtocol === "yes" && p.protocol ? el("p", { className: "card-note" }, el("span", { className: "icon-sub", ariaHidden: "true" }), p.protocol) : null,
    line(yesNo("Open source", p.openSource)),
    line(yesNo("Self-hosted", p.selfHosted)),
    p.structuralModel ? line(small("Structural model"), " ", p.structuralModel) : null,
  ].filter(Boolean);
  return [
    left.length || costs ? el("div", { className: "card-columns" },
      left.length ? el("div", {}, ...left) : null,
      costs ? el("div", {}, costs) : null) : null,
    has(inf.tools?.filter((t) => t.tool)) ? el("div", {}, small("Other tools"), tags(inf.tools.filter((t) => t.tool).map((t) => toolLine(t, x)), { soft: true })) : null,
    // Foggy: only the kinds of tools
    has(inf.toolCategories) ? el("div", {}, small("Other tools"), tags(labels(x.toolCategories, inf.toolCategories), { soft: true })) : null,
  ];
}

function membershipAndProcesses(card, d, scaleBars) {
  const m = card.membership || {};
  const pr = card.processes || {};
  const j = m.joining || {};
  const xm = d.membership;
  const xp = d.processes;
  // the structure, each approach with any notes on how it's used (Membership's, and each Processes tab's)
  // the Processes tabs, in the card's order (Maintenance, Moderation, Change)
  const TABS = ["maintenance", "moderation", "institutionalChange"].map((part) => [part, WORK_AREAS.find((w) => w.part === part).label]);
  const structure = structureIds(card.membership);
  const comms = pr.communications;
  const channelList = !comms ? [] : "channelsSpecified" in comms
    ? (comms.channelsSpecified ? [line("At least one channel specified")] : [])
    : (has(comms.channels) || has(comms.customChannels?.filter((c) => c.name))
      ? [tags([...labels(xp.channels, comms.channels), ...(comms.customChannels || []).filter((c) => c.name).map(channelLine)])]
      : []);
  const channels = channelList.length
    ? [el("div", { className: "card-channels" },
      head("Communications", "icon-announce"),
      ...channelList)]
    : [];
  // how people join, then the ways (and any notes on them): one column
  const joining = [
    has(j.tiers) || has(j.ways) ? el("div", { className: "card-group" },
      ...(j.tiers || []).map((t) => pill(labelIn(xm.tiers, t))),
      has(j.ways) ? tags(j.ways.map((w) => labelIn(xm.options, w.id))) : null) : null,
    ...(j.ways || []).filter((w) => w.note).map((w) => note(w.note, labelIn(xm.options, w.id))),
    note(j.closedNote, "Closed"),
  ];
  // two columns: how decisions are made and conflict, and beside them the general notes
  const left = [
    // each approach with its Membership note beside it, and how each tab uses it under it
    structure.length ? el("div", {}, head("How decisions are made"), el("ul", { className: "plain-list card-structure" },
      ...structure.map((id) => el("li", {},
        el("div", { className: "card-approach" }, tags([labelIn(xm.approaches, id)]), note(m.structure?.find((s) => s.id === id)?.note)),
        ...TABS.map(([part, label]) => note(pr[part]?.approachNotes?.[id], label, { nested: true })))))) : null,
    has(pr.conflictManagement?.approaches) ? el("div", {}, head("Conflict"), ...flow(pr.conflictManagement.approaches, xp.conflictApproaches, { numbered: true })) : null,
  ].filter(Boolean);
  // the general notes, together, in a small box to the right (none: no box)
  const notes = notesBox([["Membership", m.generalNote], ...TABS.map(([part, label]) => [label, pr[part]?.generalNote]), ["Conflict", pr.conflictManagement?.generalNote]]);
  return [
    scaleBars,
    ...joining,
    left.length || notes ? el("div", { className: "card-columns" }, el("div", {}, ...left), notes) : null,
    ...channels,
  ];
}

function federation(card, d) {
  const f = card.federation || {};
  const x = d.federation;
  const subs = f.subscriptions || {};
  // the block list: public (a link to it, if given) or not
  const blocklist = subs.sharesBlocklist ? el("span", { className: "card-yesno" }, small("Block list"), " ",
    subs.sharesBlocklist === "yes"
      ? (subs.blocklistLink ? el("a", { className: "inline", href: subs.blocklistLink, target: "_blank", rel: "noopener nofollow", textContent: "public" }) : "public")
      : "not public") : null;
  return [
    // the approach, the block list, whether they bridge, and the shared lists followed, in a row
    f.approach || blocklist || f.bridging?.bridges || has(subs.subscribedLists) ? el("div", { className: "card-row" },
      f.approach ? pill(labelIn(x.approaches, f.approach)) : null,
      blocklist,
      yesNo("Bridges", f.bridging?.bridges),
      has(subs.subscribedLists) ? el("span", { className: "card-group" },
        el("span", { className: "icon-list", ariaHidden: "true" }), small("Lists"), tags(labels(x.lists, subs.subscribedLists), { soft: true })) : null) : null,
    note(f.allowlistPolicy, "Allowlist"),
    // when there's a problem: the heading and the ladder on one line (its notes under)
    has(f.responseLadder) ? (() => {
      const [ladder, ...rest] = flow(f.responseLadder, x.ladder);
      return el("div", {}, el("div", { className: "card-inline" }, head("When there’s a problem", "icon-meet"), ladder), ...rest);
    })() : null,
    has(subs.decisionTools) ? el("div", {}, small("Tools"), tags(labels(x.tools, subs.decisionTools), { soft: true })) : null,
    note(f.rulesNote, "Rules"),
    has(f.bridging?.protocols) ? el("div", {}, small("Bridged to"), tags(f.bridging.protocols, { soft: true })) : null,
  ];
}

/** Rules counted by type (Foggy): a row per type, "3 of 11 · +1 custom". */
const ruleCounts = (types) => (types.length ? [el("dl", { className: "summary-list card-rows" }, ...types.flatMap((t) => [
  el("dt", { className: "mono-u summary-label", textContent: t.label }),
  el("dd", {}, [t.of ? `${t.chosen} of ${t.of}` : null, t.custom ? `+${t.custom} custom` : null].filter(Boolean).join(" · ")),
]))] : []);

/** The description's parts (DESCRIPTION's order), as one paragraph; none, nothing. */
function description(parts = {}) {
  const texts = DESCRIPTION.map((q) => parts?.[q.id]?.trim()).filter(Boolean)
    .map((t) => (/[.!?…)"”]$/.test(t) ? t : `${t}.`));   // each part ends as a sentence
  return texts.length ? el("p", { className: "card-description", textContent: texts.join(" ") }) : null;
}

/** Rows of an outline section (Rules, custom modules) as a compact list, without the empty or unshared ones. */
function outlineRows(rows) {
  const shown = rows.filter(([, v]) => has(v) && v !== "N/A" && v !== "Not shared");
  return shown.length ? [el("dl", { className: "summary-list card-rows" }, ...shown.flatMap(([label, value]) => [
    el("dt", { className: "mono-u summary-label", textContent: label }),
    el("dd", {}, Array.isArray(value)
      ? el("ul", {}, ...value.map((v) => (v.custom ? el("li", { className: "custom", textContent: v.text, title: "A custom rule" }) : el("li", { textContent: v }))))
      : String(value)),
  ]))] : [];
}

// ── the card ────────────────────────────────────────────────
export function renderCard(view, data, defaults, { heading = "h2" } = {}) {
  const card = view.card;
  const b = card.basics || {};
  const mode = MODES.find((m) => m.id === view.mode);
  const targets = b.targetScales || {};
  const sc = data.scales;
  const scales = sc.scales.filter((s) => view.scales?.[s.id] || targets[s.id] != null);
  // the outline gives the Rules and custom modules' rows (as Export words them)
  const outline = cardOutline(card, data, defaults, { mode: view.mode, rulesCount: view.rulesCount, scales: view.scales });
  const rowsOf = (title) => outline.sections.find((s) => s.title === title)?.rows || [];
  const on = new Set(card.modules || []);

  const top = el("div", { className: "card-top" },
    // the name, linking to the community (when there's a link)
    el("div", { className: "card-title" }, el(heading, {},
      b.link ? el("a", { href: b.link, target: "_blank", rel: "noopener nofollow", textContent: b.name || "A community" }) : b.name || "A community")),
    b.type || b.size ? el("div", { className: "card-group" },
      b.type ? pill(labelIn(data.basics.types, b.type)) : null,
      b.size ? pill(labelIn(data.basics.sizes, b.size)) : null) : null,
    // the community in its own words: the parts the view shows, as one paragraph
    description(b.description),
    has(b.keywords) ? tags(b.keywords, { soft: true }) : null,
    has(b.values) ? tags(labels(data.basics.values, b.values)) : null);
  // the scales (what the card's choices add up to; in Full, where they'd like to be), in Membership & Processes
  const scaleBars = scales.length ? el("div", { className: "card-scales" }, ...scales.map((s) => scaleBar(s, view.scales?.[s.id]?.score ?? null, targets[s.id] ?? null, sc.range))) : null;

  const sections = [];
  if (on.has("infrastructure")) sections.push(section("Infrastructure", infrastructure(card.infrastructure || {}, data)));
  // Rules: Foggy counts them by type ("3 of 11 · +1 custom"); fuller views show them (Export's rows)
  if (on.has("rules")) sections.push(section("Rules", view.rulesByType ? ruleCounts(view.rulesByType) : outlineRows(rowsOf("Rules"))));
  if (on.has("membership") || on.has("processes") || scaleBars) sections.push(section("Membership & Processes", membershipAndProcesses(card, data, scaleBars)));
  if (on.has("federation") && card.federation) sections.push(section("Federation", federation(card, data)));
  for (const m of moduleEntries(defaults, card).filter((e) => e.custom)) sections.push(section(m.label, outlineRows(rowsOf(m.label))));

  return el("article", { className: "summary card-view" },
    mode ? el("p", { className: "card-mode mono-u", textContent: `${mode.label} view` }) : null,
    top,
    ...sections);
}
