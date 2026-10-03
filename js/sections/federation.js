// The Federation module: how the community connects with other servers.
//
//   const data = await loadFederationData();
//   const form = renderFederation(container, card.federation, data, { onInput, onCommit, stateKey });
//   form.collect()   → the federation object to save

import { loadData, loadProtocolItems } from "../data.js";
import { el } from "../dom.js";
import { renderChoices } from "../controls/choices.js";
import { pickList } from "../controls/picklist.js";
import { tagInput } from "../controls/tags.js";
import { suggestField } from "../controls/suggest.js";
import { foldSection } from "../controls/fold.js";

export async function loadFederationData() {
  const [enums, lists, protocols] = await Promise.all([
    loadData("enums"),
    loadData("federation_subscription_lists"),
    loadProtocolItems(),
  ]);
  return {
    approaches: enums.federationApproach,
    ladder: enums.federationResponseLadder,
    lists: lists.items,
    protocols,
  };
}

/** A pasted server URL or handle → just its domain: "https://Social.Example.org/about" → "social.example.org". */
export function toDomain(text) {
  return text.trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "")   // scheme
    .replace(/^@?[^@/]*@/, "")     // a handle's user part: @user@host → host
    .replace(/[/?#].*$/, "")       // path, query, fragment
    .replace(/:\d+$/, "");         // port
}

export function renderFederation(container, federation = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "federation" } = {}) {
  const subs = federation.subscriptions || {};
  const bridging = federation.bridging || {};

  // ── approach and response ladder ──────────────────────────
  const approach = renderChoices({
    type: "radio",
    legend: "Overall approach",
    options: data.approaches,
    selected: federation.approach || null,
    clearable: true,
    onChange: onCommit,
  });

  const ladder = pickList({
    legend: "When there’s a problem with another server",
    hint: "Tick the responses you use, then put them in the order you escalate through them.",
    options: data.ladder,
    items: (federation.responseLadder || []).map((id) => ({ id })),
    notes: false,
    filterable: false,
    reorderable: true,
    chosenLegend: "Your ladder, first step first",
    emptyText: "No responses chosen yet.",
    onInput,
    onCommit,
  });

  // ── subscriptions and server lists ────────────────────────
  // subscribedLists holds known list ids and anything else people typed
  const knownIds = new Set(data.lists.map((l) => l.id));
  const savedLists = subs.subscribedLists || [];
  const knownLists = renderChoices({
    legend: "Shared lists you follow",
    hint: "Lists other communities maintain, which you use too.",
    options: data.lists,
    selected: savedLists.filter((id) => knownIds.has(id)),
    onChange: onCommit,
  });
  const otherLists = tagInput({
    label: "Other lists",
    hint: "Name or link of any other list you follow. Press Enter after each one.",
    values: savedLists.filter((id) => !knownIds.has(id)),
    maxLength: 200,
    onCommit,
  });

  const serverList = (label, hint, values) => tagInput({
    label,
    hint,
    values: values || [],
    maxLength: 253,
    placeholder: "example.social",
    normalize: toDomain,
    onCommit,
  });
  const allow = serverList("Allow list", "Servers you always federate with. Paste addresses or links; they’re trimmed to the server name.", subs.customAllowList);
  const deny = serverList("Deny list", "Servers whose users can’t access your community.", subs.customDenyList);
  const block = serverList("Block list", "Servers you don’t federate with at all.", subs.customBlockList);

  // ── bridging ──────────────────────────────────────────────
  const bridged = renderChoices({
    legend: "Bridging",
    legendHidden: true,
    options: [{ id: "enabled", label: "We bridge to other networks", description: "Our community is also reachable from other protocols, e.g. through a bridge between ActivityPub and AT Protocol." }],
    selected: bridging.enabled ? ["enabled"] : [],
    onChange: (v) => {
      protocols.element.hidden = !v.length;
      onCommit();
    },
  });
  const protocols = suggestField({
    label: "Bridged protocols",
    hint: "Start typing, e.g. AT Protocol, Matrix, Nostr. Anything not listed can be typed in full.",
    items: data.protocols,
    multiple: true,
    allowCustom: true,
    values: bridging.protocols || [],
    onCommit,
  });
  protocols.element.hidden = !bridging.enabled;

  const section = (name, title, ...fields) => foldSection({
    title,
    key: `${stateKey}:${name}`,
    children: [el("div", { className: "fields" }, ...fields.map((f) => f.element))],
  });
  container.replaceChildren(
    section("approach", "Approach & responses", approach, ladder),
    section("lists", "Lists & servers", knownLists, otherLists, allow, deny, block),
    section("bridging", "Bridging", bridged, protocols),
  );

  return {
    collect: () => ({
      ...federation,
      approach: approach.value(),
      responseLadder: ladder.value().map((s) => s.id),
      subscriptions: {
        ...subs,
        subscribedLists: [...knownLists.value(), ...otherLists.value()],
        customAllowList: allow.value(),
        customDenyList: deny.value(),
        customBlockList: block.value(),
      },
      bridging: {
        ...bridging,
        enabled: bridged.value().length > 0,
        protocols: protocols.value(),
      },
    }),
    focusFirst: () => {},
  };
}
