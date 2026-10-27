// A card drawn as a card: one summary box. At the top, the name, what kind
// of community it is and where it is; the description; tags and values.
// Then each module in its own light outline: Infrastructure and Membership
// side by side (Membership: its tiers as pixel tiles, Joining, and Structure
// with the scales as pixel tiles), Processes (decision-making and conflict
// side by side, communications), Rules, Federation and custom modules. Notes hide behind a pixel asterisk badge (the editor's), shown on
// hover, focus or a tap. Used for the published card page, its preview, and
// Export's "Your Card in full", so the editor shows what readers see.
//
//   const box = renderCard(view, data, defaults, { heading: "h1" });
//
// view: a public copy (view-modes.js publicView): { mode, card, rulesCount,
// scales }; data: Export's reference data (loadExportData); defaults: the
// module defaults (for module names and order). What the view leaves out
// isn't mentioned; empty answers are left out; a module with nothing filled
// in says so. (The view's name is said above the card, by the page.)

import { el, button, infoTip, pixelIcon, cutWithMore } from "./dom.js";
import { cardOutline, labelIn, labels } from "./export.js";
import { moduleEntries } from "./modules.js";
import { toolName } from "./sections/infrastructure.js";
import { channelLine, WORK_AREAS } from "./sections/processes.js";
import { DESCRIPTION } from "./sections/basics.js";
import { answerText, scaleRange } from "./sections/custom.js";
import { structureIds } from "./structure.js";
import { shows } from "./view-modes.js";

const NOTE_MAX = 300;          // characters of a note shown in its bubble (the rest: the raw data download)
const DESCRIPTION_LONG = 260;  // a description longer than this is cut to a few lines, with "…" to read it whole
const TIER_ICONS = { open: "join-open", tiered_probationary: "join-tiered", restricted_approvals: "join-restricted", closed: "join-closed" };
/** The pixel star for a primary step (and its key, on Processes' heading). */
const STAR = () => pixelIcon("star", { className: "px-icon px-star", label: "primary" });
// the headings' levels under the card's name (set by renderCard: the name's level + 1, + 2)
let H = { module: "h3", group: "h4" };

// ── small pieces ────────────────────────────────────────────
const has = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "");
/** A dark pixel pill (the platform, a joining tier, the federation approach). */
const pill = (text) => el("span", { className: "card-pill", textContent: text });
/** A small mono label, e.g. "COSTS". */
const small = (text) => el("span", { className: "mono-u summary-label", textContent: text });

/**
 * The pixel asterisk badge for notes ([[label, text]], those given): each
 * note in the bubble, under its label, cut at NOTE_MAX characters. None: nothing.
 */
function noteMark(notes) {
  const shown = notes.filter(([, text]) => has(text));
  if (!shown.length) return null;
  const cut = (t) => { const s = String(t).trim(); return s.length <= NOTE_MAX ? s : `${s.slice(0, NOTE_MAX).replace(/\s+\S*$/, "")}… (the rest is in the raw data)`; };
  return infoTip(shown.map(([label, text]) => el("span", { className: "card-tip-line" }, label ? el("b", { className: "mono-u", textContent: label }) : null, cut(text))), undefined, { note: true });
}
/** Something with more to say in the shared bubble, on hover or keyboard focus (.tip-host). */
function withTip(node, text) {
  if (!has(text)) return node;
  node.classList.add("tip-host");
  node.tabIndex = 0;
  node.append(el("span", { className: "choice-tip", role: "tooltip", textContent: text }));
  return node;
}
/** A tag (orange; soft: gray), with a note badge on its corner if it has notes, and a bubble if it has a tip. */
function tag(label, notes = [], { soft = false, tip = null } = {}) {
  const mark = noteMark(notes);
  return withTip(el("li", { className: `tag${soft ? " tag-soft" : ""}${mark ? " has-note" : ""}` }, label, mark), tip);
}
/** Tags in a row: plain labels, or [label, notes, tip] (notes on a badge, a tip in a bubble). */
const tags = (items, opts = {}) => el("ul", { className: "tags plain-list" }, ...items.map((t) => (Array.isArray(t) ? tag(t[0], t[1], { ...opts, tip: t[2] }) : tag(t, [], opts))));
/**
 * A module: a light outline, its heading (and a badge for its general notes; `aside`, on the
 * heading's right), then its parts (or "Not filled in yet"). shared: false when the view shares
 * none of the module's parts: then, with nothing to show, it's left out (a card never says
 * what its view leaves out).
 */
function moduleBox(title, parts, { notes = [], className = "", aside = null, shared = true } = {}) {
  const filled = parts.flat().filter(Boolean);
  if (!shared && !filled.length && !aside) return null;
  const head = el(H.module, { className: "card-module-head" }, title, noteMark(notes));
  return el("section", { className: `summary card-module ${className}`.trim() },
    aside ? el("div", { className: "card-module-top" }, head, aside) : head,
    ...(filled.length || aside ? filled : [el("p", { className: "field-hint", textContent: "Not filled in yet." })]));
}
/** A pixel icon on a lime tile; its name (and more) in a bubble. */
const tile = (icon, label, tip) => withTip(el("span", { className: "card-tile", role: "img", ariaLabel: label }, pixelIcon(icon)), tip);
/** A group inside a module (Decision making, Conflict, …): a small heading, with a badge for its notes. */
const group = (title, notes, ...parts) => el("div", { className: "card-group-box" }, el(H.group, { className: "card-sub mono-u" }, title, noteMark(notes)), ...parts.flat().filter(Boolean));
/** Label / answer rows (Infrastructure's model, costs, other tools): [[label, value]], the empty ones left out. */
function facts(rows) {
  const shown = rows.filter(([, v]) => has(v));
  return shown.length ? el("dl", { className: "card-facts" }, ...shown.flatMap(([label, v]) => [el("dt", { className: "mono-u summary-label", textContent: label }), el("dd", {}, v)])) : null;
}

/**
 * Steps ([{ id, note, stage, primary? }]): the stages one under another,
 * a pixel arrow between, the approaches of a stage side by side (a pixel star: primary),
 * each with its note on a badge. across: left to right instead.
 */
function steps(list = [], options, { across = false } = {}) {
  if (!list.length) return [];
  const stages = [...new Set(list.map((s) => s.stage))].sort((a, b) => a - b);
  return [
    el("div", { className: `card-steps${across ? " card-steps-across" : ""}` }, ...stages.flatMap((stage, i) => [
      i ? el("span", { className: "flow-arrow", ariaHidden: "true" }) : null,
      tags(list.filter((s) => s.stage === stage).map((s) => [s.primary ? el("span", { className: "card-primary" }, labelIn(options, s.id), STAR()) : labelIn(options, s.id), [[null, s.note]]])),
    ].filter(Boolean))),
  ];
}

/** A scale as a lime tile with its pixel icon (its name, aim and score in a bubble) and a column of squares filled to the score (the target, if shown, outlined). */
function scaleTile(sc, score, target, range) {
  const cells = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.max - i).map((n) => {
    const cell = el("i", { className: `${score != null && n <= score ? "on" : ""}${n === target ? " target" : ""}`.trim() });
    return n === target ? withTip(cell, `Where they’d like to be: ${target}`) : cell;   // its key, on hover or focus
  });
  return el("div", { className: "card-scale" },
    tile(`scale-${sc.id}`, sc.label, `${sc.label} · ${[target != null ? `aim: ${target}` : null, `scored: ${score ?? "not scored"}`].filter(Boolean).join(", ")}`),
    el("span", { className: "card-scale-bar", role: "img",
      ariaLabel: `${sc.label}: ${score ?? "not scored"} of ${range.max}${target != null ? `; they’d like ${target}` : ""}` }, ...cells));
}

/** Rows of an outline section (Rules) as groups in columns, without the empty or unshared ones. */
function outlineGroups(rows) {
  const shown = rows.filter(([, v]) => has(v) && v !== "N/A" && v !== "Not shared");
  return shown.length ? [el("div", { className: "card-columns-flow" }, ...shown.map(([label, value]) => el("div", { className: "card-flow-group" },
    small(label),
    Array.isArray(value)
      ? el("ul", {}, ...value.map((v) => (v.custom ? el("li", { className: "custom", textContent: v.text, title: "A custom rule" }) : el("li", { textContent: v }))))
      : el("p", { textContent: String(value) }))))] : [];
}

/**
 * A custom module: its description as a short gray line under the heading, then each answered
 * question as a group in columns: text and a radio choice as written, checkboxes as tags, and a
 * scale as a row of squares filled to the answer, its two ends' words either side.
 */
function customModule(m) {
  const answered = (m.fields || []).filter((f) => f.label && has(answerText(f)));
  const answer = (f) => {
    if (f.type === "checkbox") return tags(f.value);
    if (f.type !== "scale") return el("p", { textContent: answerText(f) });
    const { min, max } = scaleRange(f);
    const cells = Array.from({ length: max - min + 1 }, (_, i) => el("i", { className: min + i <= f.value ? "on" : "" }));
    return el("p", { className: "card-scale-row" },
      f.low ? small(f.low) : null,
      el("span", { className: "card-scale-bar is-across", role: "img", ariaLabel: `${answerText(f)}${f.low || f.high ? ` (${min} = ${f.low || "…"}, ${max} = ${f.high || "…"})` : ""}` }, ...cells),
      f.high ? small(f.high) : null);
  };
  return [
    has(m.description) ? el("p", { className: "card-intro", textContent: m.description }) : null,
    answered.length ? el("div", { className: "card-columns-flow" }, ...answered.map((f) => el("div", { className: "card-flow-group" }, small(f.label), answer(f)))) : null,
  ];
}

// ── the parts ───────────────────────────────────────────────
/** Whether a card's software says more than its platform: typed in, unlike the listed platform's (or for a typed platform). */
function ownSoftware(p, x) {
  if (!p.software?.trim() || ["proprietary", "none"].includes(p.software.trim().toLowerCase())) return false;
  const listed = x.platformRecords[p.platform];
  return !listed || p.software.trim().toLowerCase() !== String(listed.software || "").toLowerCase();
}

/** Each place once, its roles (servers, members, admins) in a bubble. */
function places(inf, x) {
  const roles = new Map();
  for (const [key, role] of [["servers", "servers"], ["members", "members"], ["adminTeam", "admins"]]) {
    for (const code of inf.locations?.[key] || []) roles.set(code, [...(roles.get(code) || []), role]);
  }
  return roles.size ? el("div", { className: "card-places" }, pixelIcon("pin", { label: "Where" }),
    el("ul", { className: "plain-list mono-u" }, ...[...roles].map(([code, r]) => withTip(el("li", { textContent: labelIn(x.places, code) }),
      `${r.join(", ").replace(/^./, (c) => c.toUpperCase())}`)))) : null;
}

/** Protocol-based (which protocol, in a bubble), open source, self-hosted on one line: bold for yes, struck through for no, marked if it varies. */
function platformFlags(p) {
  const flag = (label, v, tip) => (v ? withTip(el("span", { className: `card-flag is-${v}` }, label,
    v === "varies" ? " (varies)" : null,
    el("span", { className: "visually-hidden", textContent: v === "yes" ? ": yes" : v === "no" ? ": no" : "" })), tip) : null);
  const shown = [flag("Protocol-based", p.usesProtocol, p.usesProtocol === "yes" ? p.protocol : null), flag("Open source", p.openSource), flag("Self-hosted", p.selfHosted)].filter(Boolean);
  return shown.length ? el("p", { className: "card-flags mono-u" }, ...shown.flatMap((f, i) => (i ? [el("span", { className: "card-sep", ariaHidden: "true" }), f] : [f]))) : null;
}

function infrastructure(inf, d) {
  const x = d.infrastructure;
  const p = inf.platform || {};
  const answered = x.costCategories.filter((c) => inf.costs?.[c.id]);
  const paid = answered.filter((c) => inf.costs[c.id] === "yes").map((c) => c.label);
  const tools = (inf.tools || []).filter((t) => t.tool);
  return [
    p.platform || ownSoftware(p, x) ? el("div", { className: "card-group" },
      p.platform ? pill(labelIn(x.platforms, p.platform)) : null,
      // the software only when it adds something: the listed platform's name already includes its
      // software (e.g. "ActivityPub client (Mastodon)"), so only software typed in differently, or for a typed platform
      ownSoftware(p, x) ? pill(p.software) : null) : null,
    platformFlags(p),
    facts([
      ["Type", p.type ? labelIn(x.platformTypes, p.type) : null],
      ["Model", p.structuralModel],
      ["Costs", paid.length ? paid.join(", ") : answered.length ? "None" : null],
      // each tool by its name; its kind and what it's used for in a bubble
      ["Other tools", has(tools) ? tags(tools.map((t) => [toolName(t.tool, x), [], [labelIn(x.toolCategories, t.category), t.usedFor].filter(has).join(" · ")]), { soft: true }) : null],
      // Foggy: only the kinds of tools
      ["Other tools", has(inf.toolCategories) ? tags(labels(x.toolCategories, inf.toolCategories), { soft: true }) : null],
    ]),
  ];
}

/** How people join: its tiers as lime tiles (each one's name and what it means in a bubble), for Membership's heading. */
function joiningTiers(j, d) {
  const tiers = d.membership.tiers.filter((t) => j.tiers?.includes(t.id));
  return tiers.length ? el("ul", { className: "plain-list" }, ...tiers.map((t) => el("li", {}, tile(TIER_ICONS[t.id] || "join-open", t.label, `${t.label}: ${t.description}`)))) : null;
}
/**
 * Membership: JOINING (the ways of joining, in two columns, each with its note on a badge; the
 * note on joining and about being closed on the heading's), then STRUCTURE (the scales; the
 * note on how membership is organized on the heading's). Its tiers go on the module's heading.
 */
function membership(m, d, scaleTiles) {
  const j = m.joining || {};
  const joinNotes = [["Joining", j.note], ["About being closed", j.closedNote]];
  const orgNotes = [[null, m.generalNote]];
  return [
    has(j.ways) || joinNotes.some(([, t]) => has(t)) ? group("Joining", joinNotes,
      has(j.ways) ? el("div", { className: "card-ways" }, tags(j.ways.map((w) => [labelIn(d.membership.options, w.id), [[null, w.note]]]))) : null) : null,
    scaleTiles || has(m.generalNote) ? group("Structure", orgNotes, scaleTiles) : null,
  ];
}

function processes(card, d, scaleTiles) {   // (scaleTiles: only when Membership is off)
  const m = card.membership || {};
  const pr = card.processes || {};
  const xm = d.membership;
  const xp = d.processes;
  const on = new Set(card.modules || []);
  // the Processes tabs, in the card's order (Change, Maintenance, Moderation)
  const TABS = WORK_AREAS.map((w) => [w.part, w.label]);
  const structure = structureIds(card.membership);
  // decision making: each approach (its Membership note on its badge), and beside it the
  // tabs that say how it's used, all their notes on one badge
  const decisions = structure.length ? group("Decision making",
    TABS.map(([part, label]) => [label, pr[part]?.generalNote]),
    el("ul", { className: "plain-list card-decisions" }, ...structure.map((id) => {
      const used = TABS.filter(([part]) => has(pr[part]?.approachNotes?.[id]));
      return el("li", {},
        tags([[labelIn(xm.approaches, id), [[null, m.structure?.find((s) => s.id === id)?.note]]]]),
        used.length ? el("span", { className: "card-used" }, el("span", { className: "card-used-line", ariaHidden: "true" }),
          el("span", { className: "card-used-areas mono-u" }, ...used.map(([, label]) => el("span", { textContent: label }))),
          noteMark(used.map(([part, label]) => [label, pr[part].approachNotes[id]]))) : null);
    }))) : null;
  const conflict = on.has("processes") && has(pr.conflictManagement?.approaches)
    ? group("Conflict", [[null, pr.conflictManagement.generalNote]], steps(pr.conflictManagement.approaches, xp.conflictApproaches)) : null;
  // communications: Misty only says whether any channel is specified; Full, which
  const comms = pr.communications;
  const channelList = !comms ? null : "channelsSpecified" in comms
    ? (comms.channelsSpecified ? el("p", { textContent: "At least one channel specified" }) : null)
    : (has(comms.channels) || has(comms.customChannels?.filter((c) => c.name))
      ? tags([...labels(xp.channels, comms.channels), ...(comms.customChannels || []).filter((c) => c.name).map(channelLine)], { soft: true })
      : null);
  return [
    scaleTiles,
    decisions || conflict ? el("div", { className: "card-pair" }, decisions, conflict) : null,
    channelList ? group("Communications", [], channelList) : null,
  ];
}

function federation(card, d) {
  const f = card.federation || {};
  const x = d.federation;
  const subs = f.subscriptions || {};
  // the block list: public (a link to it, if given) or not
  const blocklist = subs.sharesBlocklist ? el("span", { className: "card-flag is-yes" }, "Block list ",
    subs.sharesBlocklist === "yes"
      ? (subs.blocklistLink ? el("a", { className: "inline", href: subs.blocklistLink, target: "_blank", rel: "noopener nofollow", textContent: "public" }) : "public")
      : "not public") : null;
  const bridges = f.bridging?.bridges ? el("span", { className: `card-flag is-${f.bridging.bridges}` }, "Bridges",
    el("span", { className: "visually-hidden", textContent: f.bridging.bridges === "yes" ? ": yes" : ": no" })) : null;
  // two columns: the approach, the block list and bridges, and the lists, tools and protocols;
  // beside them, when there's a problem (the response ladder, left to right)
  const overview = [
    f.approach ? el("div", { className: "card-group" }, pill(labelIn(x.approaches, f.approach))) : null,
    blocklist || bridges ? el("p", { className: "card-flags mono-u" }, ...[blocklist, bridges].filter(Boolean).flatMap((v, i) => (i ? [el("span", { className: "card-sep", ariaHidden: "true" }), v] : [v]))) : null,
    facts([
      ["Lists", has(subs.subscribedLists) ? tags(labels(x.lists, subs.subscribedLists), { soft: true }) : null],
      ["Tools", has(subs.decisionTools) ? tags(labels(x.tools, subs.decisionTools), { soft: true }) : null],
      ["Bridged to", has(f.bridging?.protocols) ? tags(f.bridging.protocols, { soft: true }) : null],
    ]),
  ].filter(Boolean);
  const ladder = has(f.responseLadder) ? group("When there’s a problem", [], steps(f.responseLadder, x.ladder, { across: true })) : null;
  return overview.length && ladder ? [el("div", { className: "card-pair" }, el("div", { className: "card-stack" }, ...overview), ladder)] : [...overview, ladder];
}

/** Rules counted by type (Foggy): a group per type, "3 of 11 · +1 custom". */
const ruleCounts = (types) => outlineGroups(types.map((t) => [t.label, [t.of ? `${t.chosen} of ${t.of}` : null, t.custom ? `+${t.custom} custom` : null].filter(Boolean).join(" · ")]));

/** The description's parts (DESCRIPTION's order), as one paragraph in a tinted box; a long one cut to a few lines, with "…" to read it whole. */
function description(parts = {}) {
  const texts = DESCRIPTION.map((q) => parts?.[q.id]?.trim()).filter(Boolean)
    .map((t) => (/[.!?…)"”]$/.test(t) ? t : `${t}.`));   // each part ends as a sentence
  if (!texts.length) return null;
  const text = texts.join(" ");
  const box = el("div", { className: "card-description" }, el("p", { textContent: text }));
  return text.length <= DESCRIPTION_LONG ? box : cutWithMore(box, "Read the whole description");
}

// ── the card ────────────────────────────────────────────────
export function renderCard(view, data, defaults, { heading = "h2" } = {}) {
  const level = Number(heading.slice(1));
  H = { module: `h${Math.min(level + 1, 6)}`, group: `h${Math.min(level + 2, 6)}` };
  const card = view.card;
  const b = card.basics || {};
  const targets = b.targetScales || {};
  const sc = data.scales;
  const scales = sc.scales.filter((s) => view.scales?.[s.id] || targets[s.id] != null);
  // the outline gives the Rules and custom modules' rows (as Export words them)
  const outline = cardOutline(card, data, defaults, { mode: view.mode, rulesCount: view.rulesCount, scales: view.scales });
  const rowsOf = (title) => outline.sections.find((s) => s.title === title)?.rows || [];
  const on = new Set(card.modules || []);

  // the top, the same on every card: the name (a link to the community, when there's one) and
  // TYPE • FORMAT • SIZE, with where it is on the right
  const kinds = [b.type && b.type !== "other" ? labelIn(data.basics.communityTypes, b.type) : null,
    b.format ? labelIn(data.basics.formats, b.format) : null, b.size ? labelIn(data.basics.sizes, b.size) : null].filter(Boolean);
  const top = el("header", { className: "card-top" },
    el("div", { className: "card-title" },
      el(heading, {}, b.link ? el("a", { href: b.link, target: "_blank", rel: "noopener nofollow", textContent: b.name || "A community" }) : b.name || "A community"),
      kinds.length ? el("p", { className: "card-kinds mono-u" }, ...kinds.flatMap((k, i) => (i ? [el("span", { className: "card-sep", ariaHidden: "true" }), k] : [k]))) : null),
    on.has("infrastructure") ? places(card.infrastructure || {}, data.infrastructure) : null);
  const tagRows = facts([
    ["Tags", has(b.keywords) ? tags(b.keywords, { soft: true }) : null],
    ["Values", has(b.values) ? tags(labels(data.basics.values, b.values)) : null],
  ]);
  // the scales (what the card's choices add up to; in Full, where they'd like to be): in Membership's
  // Structure, or (Membership off) in Processes
  const scaleTiles = scales.length ? el("div", { className: "card-scales" }, ...scales.map((s) => scaleTile(s, view.scales?.[s.id]?.score ?? null, targets[s.id] ?? null, sc.range))) : null;

  const m = card.membership || {};
  const j = m.joining || {};
  const pair = [];
  if (on.has("infrastructure")) pair.push(moduleBox("Infrastructure", infrastructure(card.infrastructure || {}, data)));
  if (on.has("membership")) pair.push(moduleBox("Membership", membership(m, data, scaleTiles), { aside: joiningTiers(j, data) }));
  const modules = [];
  if (pair.length) modules.push(el("div", { className: "card-pair" }, ...pair));
  const tilesHere = on.has("membership") ? null : scaleTiles;
  // the key to the primary step's star, in the box's top-right corner
  const primary = on.has("processes") && card.processes?.conflictManagement?.approaches?.some((s) => s.primary)
    ? el("p", { className: "card-key summary-label" }, STAR(), " primary") : null;
  // (Processes' parts are shared from Misty: in Minimal and Foggy, it's left out unless it has the scales)
  const processesShared = !view.mode || ["structure", "conflictSteps", "channels"].some((f) => shows(f, view.mode));
  if (on.has("processes") || tilesHere || structureIds(card.membership).length) modules.push(moduleBox("Processes", processes(card, data, tilesHere), { aside: primary, shared: processesShared }));
  // Rules: Foggy counts them by type ("3 of 11 · +1 custom"); fuller views show them (Export's rows)
  if (on.has("rules")) modules.push(moduleBox("Rules", view.rulesByType ? ruleCounts(view.rulesByType) : outlineGroups(rowsOf("Rules")), { className: "card-rules" }));
  if (on.has("federation") && card.federation) {
    const f = card.federation;
    modules.push(moduleBox("Federation", federation(card, data), { notes: [["Allowlist", f.allowlistPolicy], ["How rules shape who we federate with", f.rulesNote]] }));
  }
  for (const e of moduleEntries(defaults, card).filter((x) => x.custom)) modules.push(moduleBox(e.label, customModule((card.customModules || []).find((c) => c.id === e.id) || {})));

  return el("article", { className: "summary card-view" }, top, description(b.description), tagRows, ...modules.filter(Boolean));
}
