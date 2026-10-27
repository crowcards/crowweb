// "Fill in from this link": reads a community's public server information and
// offers what it found as answers, each selectable, in a pop-up. Used by the
// Basics form (set-up and the editor), under the Link field. Never runs on
// its own, and fills in only what the person selects.
//
//   const filler = fillFromLink({ getLink, sizes, applyBasics, getPart, setParts, onCommit, onDone });
//   container.append(filler.element);   filler.refresh()   (when the link changes)
//   onDone(filled): after filling in (true), or when the link couldn't be read (false)
//   SUPPORTED: the platforms it can read so far, for people ("Mastodon")
//
// What a server runs is told by its NodeInfo (every fediverse server publishes
// one); each platform's own reader (js/fill-from-link/<platform>.js) reads the
// rest into a common summary (see mastodon.js). This file turns a summary into
// answers: the platform (with its details and usual costs, as picking it in
// Infrastructure does), name, description, size, format, how people join,
// rules and a public block list. What was filled in is recorded in the card's
// editor-only part (editor.filledFromLink), for a note at the top of each
// module concerned (js/suggestions.js).

import { el, button } from "./dom.js";
import { renderChoices } from "./controls/choices.js";
import { showPopup, closePopup } from "./popup.js";
import { loadInfrastructureData, platformFromRecord, usualCosts, definite } from "./sections/infrastructure.js";
import * as mastodon from "./fill-from-link/mastodon.js";

const READERS = [mastodon];   // (Bonfire and Acorn to come)
export const SUPPORTED = READERS.map((r) => r.LABEL);
const FORMAT = "social_network_media";   // what Mastodon is (formats.json)

/** The server behind a link: its address (https://host), or null if the link isn't one. */
function originOf(link) {
  try {
    const u = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    // (a real domain, e.g. social.coop: browsers accept almost anything as an address)
    return /^https?:$/.test(u.protocol) && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(u.hostname) ? u.origin : null;
  } catch { return null; }
}

/** What a server runs: its NodeInfo (the standard fediverse summary), or null. */
async function nodeinfoOf(origin) {
  const get = async (url) => { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(r.status); return r.json(); };
  const index = await get(`${origin}/.well-known/nodeinfo`);
  const href = index.links?.map((l) => l.href).find(Boolean);
  return href ? get(href) : null;
}

/** The size whose range takes in `n` members (enums.json communitySize minMembers). */
const sizeFor = (n, sizes) => (n == null ? null : [...sizes].reverse().find((s) => n >= (s.minMembers ?? 0))?.id ?? null);
const count = (n) => n.toLocaleString("en-US");
/** A server's software, as NodeInfo names it (lowercase), for people: "Mastodon 4.5.18". */
const softwareName = (sw, { version = false } = {}) => (sw?.name ? `${sw.name[0].toUpperCase()}${sw.name.slice(1)}${version && sw.version ? ` ${sw.version.split("-")[0]}` : ""}` : "");

/**
 * The answers a summary offers: [{ id, label, description, part, apply }].
 * apply(state) changes `state` (basics: the form's fields; other parts: the card's) in place.
 */
function offers(summary, { sizes, infra, card }) {
  const host = new URL(summary.url).host;
  const out = [];
  const add = (id, label, description, part, apply) => out.push({ id, label, description, part, apply });
  const basics = card.basics || {};
  if (summary.title) add("name", `Name: ${summary.title}`, basics.name && basics.name !== summary.title ? `Replaces “${basics.name}”.` : "The server’s name.", "basics", (s) => { s.basics.name = summary.title; });
  if (basics.link !== summary.url) add("link", `Link: ${summary.url}`, "The server’s address.", "basics", (s) => { s.basics.link = summary.url; });
  if (summary.description) add("purpose", "Description (purpose)", summary.description, "basics", (s) => { s.basics.purpose = summary.description; });
  const size = sizeFor(summary.activeUsers, sizes);
  if (size) add("size", `Size: ${sizes.find((x) => x.id === size).label}`, `${count(summary.activeUsers)} active this month.`, "basics", (s) => { s.basics.size = size; });
  if (basics.format !== FORMAT) add("format", "Format: Social network / media", `What ${softwareName(summary.software)} servers are.`, "basics", (s) => { s.basics.format = FORMAT; });

  // the platform, with its details and usual costs: as picking it in Infrastructure does
  const record = infra.platformRecords[summary.platformId];
  if (record) {
    const typeId = record.platformTypes[0];
    const usual = usualCosts(infra, typeId, record);
    const answered = Object.values(card.infrastructure?.costs || {}).some((v) => v != null);
    const name = infra.platforms.find((p) => p.id === record.id)?.label;
    add("platform", `Platform: ${name}`, answered ? "With its details. Your costs stay as you answered them." : "With its details and the costs usually paid on it.", "infrastructure", (s) => {
      s.infrastructure.platform = { ...s.infrastructure.platform, platform: record.id, ...platformFromRecord(record, typeId) };
      if (!answered) s.infrastructure.costs = { ...s.infrastructure.costs, ...definite(usual) };
      s.editor.costsPrefill = { platformName: name, typeId, costs: usual };   // (the costs' note and guides)
    });
  }

  // how people join
  const JOINING = {
    open: ["open", "open_access", "Open (open access)", "Anyone can sign up."],
    approval: ["restricted_approvals", "application_review", "Restricted / approvals (application review)", "Sign-ups need approval."],
    off: ["restricted_approvals", "invitation_only", "Restricted / approvals (invitation only)",
      `Sign-ups are off on ${host}; most such servers still invite people. If you aren’t taking anyone, choose Closed in Membership instead.`],
  };
  const [tier, way, joinLabel, joinNote] = JOINING[summary.registrations];
  add("joining", `How people join: ${joinLabel}`, joinNote, "membership", (s) => {
    s.membership.joining = { ...s.membership.joining, tiers: [tier], ways: [{ id: way, note: null }] };
  });

  // the server's rules, as the community's own (their wording kept; matching them to listed rules is for later)
  const own = new Set((card.rules?.customRules || []).map((r) => r.text?.trim()));
  const rules = summary.rules.filter((r) => !own.has(r.text));
  if (rules.length) add("rules", `Rules: ${rules.length}, as your own rules`, rules.map((r) => r.text).slice(0, 3).join(" · ") + (rules.length > 3 ? " · …" : ""), "rules", (s) => {
    const stamp = Date.now().toString(36);
    s.rules.customRules = [...(s.rules.customRules || []),
      ...rules.map((r, i) => ({ id: `custom_${stamp}${i}`, text: r.text, typeId: null, qualifierSet: null, qualifier: null }))];
  });

  // a public list of blocked servers: a shared block list
  if (summary.blocks?.length) add("blocks", `Federation: ${count(summary.blocks.length)} blocked servers, shared publicly`, `Denylist first, with your block list at ${summary.aboutUrl}.`, "federation", (s) => {
    s.federation.approach = "denylist_first";
    s.federation.subscriptions = { ...s.federation.subscriptions, sharesBlocklist: "yes", blocklistLink: summary.aboutUrl };
  });
  return out;
}

// what each part's note says was filled in (js/suggestions.js)
const PART_WORDS = { name: "the name", link: "the link", purpose: "the description", size: "the size", format: "the format",
  platform: "the platform and its details", joining: "how people join", rules: "the server’s rules, added as your own", blocks: "a public block list" };

export function fillFromLink({ getLink, sizes, applyBasics, getPart, setParts, onCommit, onDone = () => {} }) {
  const status = el("span", { className: "field-hint", role: "status" });
  const go = button("Fill in from this link", "link-button", () => run());
  const element = el("p", { className: "fill-from-link" }, go, " ", status);

  function refresh() { element.hidden = !originOf(getLink() || ""); status.textContent = ""; }

  async function run() {
    const origin = originOf(getLink() || "");
    if (!origin) return;
    go.disabled = true;
    status.textContent = "Reading…";
    try {
      const nodeinfo = await nodeinfoOf(origin).catch(() => null);
      const reader = READERS.find((r) => r.SOFTWARE === nodeinfo?.software?.name?.toLowerCase());
      if (!reader) {
        status.textContent = nodeinfo?.software?.name
          ? `This server runs ${softwareName(nodeinfo.software)}: we can only read ${SUPPORTED.join(" and ")} servers so far.`
          : `We couldn’t read this link as a server. We can read ${SUPPORTED.join(" and ")} servers so far.`;
        onDone(false);
        return;
      }
      const [summary, infra] = await Promise.all([reader.read(origin, nodeinfo), loadInfrastructureData()]);
      const card = { basics: getPart("basics"), infrastructure: getPart("infrastructure"), rules: getPart("rules") };
      const items = offers(summary, { sizes, infra, card });
      status.textContent = "";
      choose(summary, items);
    } catch {
      status.textContent = "We couldn’t read this server just now. Check the link, or try again later.";
      onDone(false);
    } finally {
      go.disabled = false;
    }
  }

  /** The pop-up: everything found, selected; fill in the ones still selected. */
  function choose(summary, items) {
    const host = new URL(summary.url).host;
    const pick = renderChoices({
      legend: "What to fill in",
      legendHidden: true,
      options: items.map(({ id, label, description }) => ({ id, label, description })),
      selected: items.map((i) => i.id),
    });
    const fill = button("Fill in selected", "button button-small", () => { apply(summary, items.filter((i) => pick.value().includes(i.id))); closePopup(); });
    const cancel = button("Cancel", "link-button", () => closePopup());
    showPopup({
      title: `Fill in from ${host}`,
      body: el("div", {},
        el("p", { textContent: `${host} runs ${softwareName(summary.software, { version: true })}. This is what it shares publicly; unselect anything you don’t want.` }),
        pick.element,
        el("p", { className: "button-row" }, fill, cancel)),
    });
  }

  /** Fill in the chosen answers: Basics through its form, the other parts on the card; then record what came from where. */
  function apply(summary, chosen) {
    if (!chosen.length) return;
    const state = { basics: {}, editor: { ...getPart("editor") } };
    for (const part of ["infrastructure", "membership", "rules", "federation"]) state[part] = { ...getPart(part) };
    for (const item of chosen) item.apply(state);
    const parts = {};
    for (const item of chosen) (parts[item.part] ||= []).push(PART_WORDS[item.id]);
    state.editor.filledFromLink = { source: new URL(summary.url).host, software: summary.software?.name || null, at: new Date().toISOString(), parts };
    applyBasics(state.basics);
    const touched = [...new Set(chosen.map((i) => i.part).filter((p) => p !== "basics"))];
    setParts({ editor: state.editor, ...Object.fromEntries(touched.map((p) => [p, state[p]])) });
    onCommit();   // (saves Basics too)
    onDone(true);
  }

  refresh();
  return { element, refresh };
}
