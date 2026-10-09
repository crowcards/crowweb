// The Federation module: how the community connects with other servers.
//
//   const data = await loadFederationData();
//   const form = renderFederation(container, card.federation, data, { onInput, onCommit, stateKey });
//   form.collect()   → the federation object to save
//
// federation_subscription_lists.json holds shared lists (block- and
// allowlists) and the tools and services that help with federation
// decisions; each item's category says which. A note says how the
// community's rules shape who it federates with.

import { loadData, loadProtocolItems } from "../data.js";
import { el } from "../dom.js";
import { renderChoices, scaleField, YES_NO } from "../controls/choices.js";
import { textField } from "../controls/fields.js";
import { pickList } from "../controls/picklist.js";
import { suggestField } from "../controls/suggest.js";
import { sectionMaker } from "../controls/fold.js";
import { showIf } from "../reveal.js";
import { asideOf, picksAside } from "../set-aside.js";

// item categories that are tools or services; anything else is a shared list
const TOOL_CATEGORIES = ["tool", "service"];
const categoryOf = (item) => item.categories?.[0] ?? item.category ?? item.kind ?? "blocklist";

export async function loadFederationData() {
  const [enums, lists, protocols] = await Promise.all([
    loadData("enums"),
    loadData("federation_subscription_lists"),
    loadProtocolItems(),
  ]);
  return {
    approaches: enums.federationApproach,
    ladder: enums.federationResponseLadder,
    lists: lists.items.filter((i) => !TOOL_CATEGORIES.includes(categoryOf(i))),
    tools: lists.items.filter((i) => TOOL_CATEGORIES.includes(categoryOf(i))),
    protocols,
  };
}

export function renderFederation(container, federation = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "federation", setAside = asideOf() } = {}) {
  const subs = federation.subscriptions || {};
  const bridging = federation.bridging || {};

  // ── approach and response ladder ──────────────────────────
  // with an allowlist, say how servers get onto it
  const usesAllowlist = (a) => a === "allowlist_first";
  const approach = renderChoices({
    type: "radio",
    legend: "Overall approach",
    layout: "buttons",   // each approach's description shows on hover
    options: data.approaches,
    selected: federation.approach || null,
    clearable: true,
    onChange: (a) => {
      showIf(allowlist.element, usesAllowlist(a));
      onCommit();
    },
  });
  const allowlist = textField({
    label: "How servers get on your allowlist",
    hint: "How do you decide who gets added, and how can a server ask to be added?",
    multiline: true,
    value: federation.allowlistPolicy ?? setAside.get("allowlistPolicy"),   // (set aside while the approach was another)
    onInput,
    onCommit,
  });
  allowlist.element.hidden = !usesAllowlist(federation.approach);

  // in steps, like conflict management: several on one step happen in parallel
  const ladder = pickList({
    legend: "When there’s a problem with another server",
    hint: "Select the responses your community takes, dragging them into the order you escalate. You can click on each to add a note.",
    options: data.ladder,
    items: federation.responseLadder || [],
    remembered: setAside.list("responseLadder:"),
    noteHint: "When and how you use this response (optional).",
    filterable: false,
    staged: true,
    primary: false,
    tagsHint: false,   // (the hint above says it)
    chosenLegend: "Your steps",
    emptyText: "No responses chosen yet.",
    onInput,
    onCommit,
  });

  // ── subscriptions and server lists ────────────────────────
  // subscribedLists holds known list ids and anything else people typed
  const lists = suggestField({
    label: "Shared lists you follow",
    hint: "Lists other communities maintain, which you use too. Pick from the list, or type any other.",
    items: data.lists,
    multiple: true,
    allowCustom: true,
    browse: true,
    values: subs.subscribedLists || [],
    onCommit,
  });

  // ── your own block list, and tools for deciding ───────────
  const shares = scaleField({
    legend: "Do you share your block list?",
    hint: "So other communities can use it, or see who you don’t federate with.",
    options: YES_NO,
    layout: "buttons",
    value: subs.sharesBlocklist,
    onChange: (v) => {
      showIf(blocklistLink.element, v === "yes");
      onCommit();
    },
  });
  const blocklistLink = textField({
    label: "Link to your block list",
    type: "url",
    placeholder: "https://",
    value: subs.blocklistLink ?? setAside.get("subscriptions.blocklistLink"),
    onInput,
    onCommit,
  });
  blocklistLink.element.hidden = subs.sharesBlocklist !== "yes";
  const tools = suggestField({
    label: "Tools or services you use for federation decisions",
    hint: data.tools.length ? "Pick from the list, or type any other." : "Type the name of each one and press Enter.",
    items: data.tools,
    multiple: true,
    allowCustom: true,
    browse: data.tools.length > 0,
    values: subs.decisionTools || [],
    onCommit,
  });

  // ── how the community's rules shape who it federates with: one note ──
  const rulesNote = textField({
    label: "How your rules shape who you federate with",
    hint: "Optional. E.g. which of your rules you look at when deciding whether to federate with, limit or block another server.",
    multiline: true,
    value: federation.rulesNote,
    onInput,
    onCommit,
  });

  // ── bridging ──────────────────────────────────────────────
  const bridged = scaleField({
    legend: "Do you bridge to other networks?",
    hint: "Whether your community is also reachable from other protocols, e.g. through a bridge between ActivityPub and AT Protocol.",
    options: YES_NO,
    layout: "buttons",
    value: bridging.bridges,
    onChange: (v) => {
      showIf(protocols.element, v === "yes");
      onCommit();
    },
  });
  const protocols = suggestField({
    label: "Bridged protocols",
    hint: "Start typing, e.g. AT Protocol, Matrix, Nostr. Anything not listed can be typed in full.",
    items: data.protocols,
    multiple: true,
    allowCustom: true,
    values: bridging.protocols?.length ? bridging.protocols : setAside.get("bridging.protocols") || [],
    onCommit,
  });
  protocols.element.hidden = bridging.bridges !== "yes";

  const section = sectionMaker(stateKey);   // each section folds; closed at first, then as the person left it
  container.replaceChildren(
    el("p", { textContent: "This page is currently mostly designed for decentralized social media systems. Let us know if you have thoughts on how to expand it to other systems!" }),
    section("approach", "Approach & responses", approach, allowlist, ladder),
    section("lists", "Lists & tools", lists, shares, blocklistLink, tools),
    section("rules", "Rules for federation", rulesNote.element),
    section("bridging", "Bridging", bridged, protocols),
  );

  return {
    collect: () => ({
      ...federation,
      approach: approach.value(),
      allowlistPolicy: usesAllowlist(approach.value()) ? allowlist.value() : null,
      responseLadder: ladder.value(),
      subscriptions: {
        ...subs,
        subscribedLists: lists.value(),
        sharesBlocklist: shares.value(),
        blocklistLink: shares.value() === "yes" ? blocklistLink.value() : null,
        decisionTools: tools.value(),
      },
      rulesNote: rulesNote.value(),
      bridging: {
        ...bridging,
        bridges: bridged.value(),
        protocols: bridged.value() === "yes" ? protocols.value() : [],
      },
    }),
    // set aside: answers that only count with another answer (kept for switching back)
    setAside: () => ({
      allowlistPolicy: usesAllowlist(approach.value()) ? null : allowlist.value(),
      ...picksAside("responseLadder:", ladder.remembered()),
      "subscriptions.blocklistLink": shares.value() === "yes" ? null : blocklistLink.value(),
      "bridging.protocols": bridged.value() === "yes" ? null : protocols.value(),
    }),
    focusFirst: () => {},
  };
}
