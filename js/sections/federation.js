// The Federation module: how the community connects with other servers.
//
//   const data = await loadFederationData();
//   const form = renderFederation(container, card.federation, data, { onInput, onCommit, stateKey, getPart });
//   form.collect()   → the federation object to save
//
// federation_subscription_lists.json holds shared lists (block- and
// allowlists) and the tools and services that help with federation
// decisions; each item's category says which. The card's own rules (from
// Rules) are listed as a compact summary, to select the ones that guide
// federation decisions and note how.

import { loadData, loadProtocolItems } from "../data.js";
import { el, uid, button } from "../dom.js";
import { renderChoices, scaleField, YES_NO } from "../controls/choices.js";
import { textField } from "../controls/fields.js";
import { pickList } from "../controls/picklist.js";
import { suggestField } from "../controls/suggest.js";
import { sectionMaker } from "../controls/fold.js";
import { showPopup, closePopup } from "../popup.js";
import { showIf } from "../reveal.js";
import { qualifierLabel } from "./rules.js";
import { asideOf, picksAside } from "../set-aside.js";

// item categories that are tools or services; anything else is a shared list
const TOOL_CATEGORIES = ["tool", "service"];
const categoryOf = (item) => item.categories?.[0] ?? item.category ?? item.kind ?? "blocklist";

export async function loadFederationData() {
  const [enums, lists, protocols, schema] = await Promise.all([
    loadData("enums"),
    loadData("federation_subscription_lists"),
    loadProtocolItems(),
    loadData("rule_schema"),
  ]);
  return {
    approaches: enums.federationApproach,
    ladder: enums.federationResponseLadder,
    lists: lists.items.filter((i) => !TOOL_CATEGORIES.includes(categoryOf(i))),
    tools: lists.items.filter((i) => TOOL_CATEGORIES.includes(categoryOf(i))),
    protocols,
    // every rule type, in the Rules page's order, with its category's name
    ruleTypes: schema.categories.flatMap((cat) => (schema.types[cat.id] || []).map((t) => ({ ...t, categoryLabel: cat.label }))),
    qualifierSets: schema.qualifierSets,
  };
}

/**
 * The rules selected under Rules, in their order there, in the community's
 * wording, then the community's own rules:
 * [{ id, label, group (the kind of rule), qualifier (its label), qualifierId }]
 */
export function cardRules(rules = {}, ruleTypes, qualifierSets = {}) {
  const edits = rules.ruleEdits || {};
  const chosen = new Map((rules.selected || []).map((s) => [s.id, s.qualifier ?? null]));
  const ticked = ruleTypes.flatMap((t) => t.rules
    .filter((r) => chosen.has(r.id))
    .map((r) => {
      const q = chosen.get(r.id);
      return { id: r.id, label: edits[r.id]?.text || r.label, group: t.name, qualifierId: q, qualifier: qualifierLabel(qualifierSets, r.qualifier || t.qualifier, q) };
    }));
  const own = (rules.customRules || []).filter((r) => r.text)
    .map((r) => ({ id: r.id, label: r.text, group: "Custom rules", qualifierId: r.qualifier ?? null, qualifier: qualifierLabel(qualifierSets, r.qualifierSet, r.qualifier) }));
  return [...ticked, ...own];
}

/**
 * The card's rules as a compact summary to pick from, grouped by kind:
 * click a line (or its box) to select it; shift-click selects everything
 * between that and the last one clicked. Select all / Clear for everything
 * or one group, and quick picks for rules marked Not allowed or Required.
 * A selected rule can take a note (a pop-up); one with a note gets the badge.
 */
/**
 * What's set aside, by rule id → { selected?, note? }: notes on rules not
 * selected, and selections of rules no longer on the card (unselected under
 * Rules), so both come back with their rule.
 */
function rulesAside(rules, chosen, noteOf) {
  const listed = new Set(rules.map((r) => r.id));
  const ids = new Set([...Object.keys(noteOf), ...chosen]);
  return Object.fromEntries([...ids].map((id) => [id, {
    ...(chosen.has(id) && !listed.has(id) ? { selected: true } : {}),
    ...(noteOf[id] && !(chosen.has(id) && listed.has(id)) ? { note: noteOf[id] } : {}),
  }]));
}

function ruleSelector({ rules, selected = [], notes = {}, onInput, onCommit }) {
  const chosen = new Set(selected);
  const noteOf = { ...notes };
  const groups = [...new Set(rules.map((r) => r.group))];
  const lines = new Map();   // rule id → its line's parts
  let last = null;           // the last rule clicked, for shift-click
  const count = el("p", { className: "field-hint" });

  const set = (ids, on) => { for (const id of ids) (on ? chosen.add(id) : chosen.delete(id)); refresh(); onCommit(); };
  function refresh() {
    for (const [id, line] of lines) {
      line.box.checked = chosen.has(id);
      line.noteButton.hidden = !chosen.has(id);
      line.mark.hidden = !(chosen.has(id) && noteOf[id]);
    }
    count.textContent = `${chosen.size} of ${rules.length} ${rules.length === 1 ? "rule" : "rules"} selected.`;
  }

  function annotate(rule) {
    let savedNote = noteOf[rule.id];   // as last saved (so closing only saves a change)
    const note = textField({ label: "Note", hint: "How this rule guides federation decisions (optional).", multiline: true, value: noteOf[rule.id],
      onInput: () => { noteOf[rule.id] = note.value(); onInput(); },
      onCommit: () => { savedNote = noteOf[rule.id]; onCommit(); } });
    showPopup({
      title: rule.label,
      body: el("div", {},
        el("p", { className: "field-hint", textContent: [rule.group, rule.qualifier].filter(Boolean).join(" · ") }),
        note.element,
        el("p", { className: "button-row" }, button("Done", "button button-small", closePopup)),
      ),
    }).then(() => {
      noteOf[rule.id] = note.value();
      refresh();
      if (noteOf[rule.id] !== savedNote) onCommit();
    });
    note.focus();
  }

  const lineFor = (rule) => {
    const box = el("input", { type: "checkbox", id: uid("fedrule") });
    box.addEventListener("click", (e) => {
      // shift-click: everything from the last one clicked to this one takes this one's state
      if (e.shiftKey && last) {
        const ids = rules.map((r) => r.id);
        const [a, b] = [ids.indexOf(last), ids.indexOf(rule.id)].sort((x, y) => x - y);
        set(ids.slice(a, b + 1), box.checked);
      } else set([rule.id], box.checked);
      last = rule.id;
    });
    const noteButton = button("Note", "link-button", () => annotate(rule));
    const mark = button("", "note-mark", () => annotate(rule));
    mark.setAttribute("aria-label", `Open the note on ${rule.label}`);
    lines.set(rule.id, { box, noteButton, mark });
    return el("li", { className: "choice fed-rule" },
      box,
      el("label", { htmlFor: box.id }, el("span", { className: "choice-name" }, rule.label, rule.qualifier ? el("span", { className: "tag", textContent: rule.qualifier }) : null)),
      mark,
      noteButton,
    );
  };

  const groupIds = (g) => rules.filter((r) => r.group === g).map((r) => r.id);
  const marked = (q) => rules.filter((r) => r.qualifierId === q).map((r) => r.id);
  const quick = [
    button("Select all", "link-button", () => set(rules.map((r) => r.id), true)),
    button("Clear", "link-button", () => set(rules.map((r) => r.id), false)),
    marked("not_allowed").length ? button("+ all marked Not allowed", "link-button", () => set(marked("not_allowed"), true)) : null,
    marked("required").length ? button("+ all marked Required", "link-button", () => set(marked("required"), true)) : null,
  ];
  const element = el("div", { className: "field" },
    el("p", { className: "mono-u", textContent: "Rules that guide federation decisions" }),
    el("p", { className: "field-hint", textContent: "From your Rules. Select the ones you look at when deciding whether to federate with, limit or block another server — shift-click to select a run of them. Add a note to any you select." }),
    el("div", { className: "summary fed-rules" },
      el("p", { className: "fold-actions" }, ...quick),
      count,
      ...groups.flatMap((g) => [
        el("div", { className: "fold-head" },
          el("p", { className: "mono-u summary-label", textContent: g }),
          el("span", { className: "fold-actions" }, button("Select all", "link-button", () => set(groupIds(g), true)), button("Clear", "link-button", () => set(groupIds(g), false)))),
        el("ul", { className: "plain-list fed-rule-list" }, ...rules.filter((r) => r.group === g).map(lineFor)),
      ]),
    ),
  );
  refresh();
  return {
    element,
    value: () => rules.filter((r) => chosen.has(r.id)).map((r) => r.id),
    notes: () => Object.fromEntries(rules.filter((r) => chosen.has(r.id) && noteOf[r.id]).map((r) => [r.id, noteOf[r.id]])),
    aside: () => rulesAside(rules, chosen, noteOf),
  };
}

export function renderFederation(container, federation = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "federation", getPart = () => ({}), setAside = asideOf() } = {}) {
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

  // ── which of the card's rules guide federation decisions ──
  const rules = cardRules(getPart("rules"), data.ruleTypes, data.qualifierSets);
  // (what was set aside joins what was saved: selections and notes on rules
  // that were off the card, or unselected here)
  const asideRules = setAside.list("relevantRules:");
  const ruleChoices = {
    rules,
    selected: [...(federation.relevantRules || []), ...asideRules.filter((r) => r.selected).map((r) => r.id)],
    notes: { ...federation.ruleNotes, ...Object.fromEntries(asideRules.filter((r) => r.note).map((r) => [r.id, r.note])) },
  };
  const relevant = rules.length
    ? ruleSelector({ ...ruleChoices, onInput, onCommit })
    : {
      element: el("p", { className: "field-hint" }, "No rules selected yet. Select them under ", el("a", { className: "inline", href: "#rules", textContent: "Rules" }), ", and they’ll show here."),
      value: () => [],
      notes: () => ({}),
      aside: () => rulesAside([], new Set(ruleChoices.selected), ruleChoices.notes),   // (all of it set aside, until there are rules)
    };

  // ── bridging ──────────────────────────────────────────────
  const bridged = scaleField({
    legend: "Do you bridge to other networks?",
    hint: "Whether your community is also reachable from other protocols, e.g. through a bridge between ActivityPub and AT Protocol.",
    options: YES_NO,
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
    section("rules", "Rules for federation", relevant),
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
      relevantRules: relevant.value(),
      ruleNotes: relevant.notes(),
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
      ...Object.fromEntries(Object.entries(relevant.aside()).map(([id, a]) => [`relevantRules:${id}`, a])),
    }),
    focusFirst: () => {},
  };
}
