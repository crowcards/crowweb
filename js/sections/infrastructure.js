// The Infrastructure module: the platform the community runs on, what it
// costs, other tools it uses, and where its servers, members and admins are.
//
//   const data = await loadInfrastructureData();
//   const form = renderInfrastructure(container, card.infrastructure, data, { onInput, onCommit, stateKey });
//   form.collect()   → the infrastructure object to save
//
// Picking a platform from the list fills in the platform fields from
// platforms.json (and says so in a pop-up); everything stays editable.
// Setting the platform type fills in the costs (cost_rules.json, plus that
// platform's exceptions in cost_overrides.json) if none are answered yet, or
// suggests the changes if some are.

import { loadData, loadProtocolItems } from "../data.js";
import { el } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { suggestField } from "../controls/suggest.js";
import { foldSection } from "../controls/fold.js";
import { showPopup, closePopup } from "../popup.js";

export async function loadInfrastructureData() {
  const [platforms, communityTypes, costRules, costOverrides, enums, tools, countries, protocols] = await Promise.all([
    loadData("platforms"),
    loadData("community_types"),
    loadData("cost_rules"),
    loadData("cost_overrides"),
    loadData("enums"),
    loadData("tools"),
    loadData("countries"),
    loadProtocolItems(),
  ]);
  const communityLabel = Object.fromEntries(communityTypes.items.map((t) => [t.id, t.label]));
  return {
    platformRecords: Object.fromEntries(platforms.items.map((p) => [p.id, p])),
    // e.g. "Matrix client (Synapse)", with the community type as a note
    platforms: platforms.items.map((p) => ({
      id: p.id,
      label: p.isGeneric ? `${p.platform} (any)`
        : p.software && !["Proprietary", p.platform].includes(p.software) ? `${p.platform} (${p.software})` : p.platform,
      aliases: [p.software, p.protocol].filter((a) => a && a !== "None" && a !== "Proprietary"),
      note: communityLabel[p.communityType],
    })),
    platformTypes: Object.values(costRules.types).map((t) => ({ id: t.id, label: t.label, description: t.description })),
    structuralModels: [...new Set(platforms.items.map((p) => p.structuralModel))].sort().map((m) => ({ id: m, label: m })),
    costCategories: costRules.categories,
    typeCosts: Object.fromEntries(costRules.types.map((t) => [t.id, t.costs])),
    costOverrides: costOverrides.items,
    costValues: enums.costValues,
    tools: tools.items,
    toolTypes: [...new Set(tools.items.map((t) => t.toolType))].sort().map((t) => ({ id: t, label: t })),
    places: [
      ...countries.countries,
      ...countries.regions.map((r) => ({ ...r, note: "region" })),
    ],
    protocols,
  };
}

// yes / no / varies answers, stored as true / false / "varies"
const YES_NO = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }, { id: "varies", label: "It varies" }];
const toChoice = (v) => (v === true ? "yes" : v === false ? "no" : v === "varies" ? "varies" : null);
const fromChoice = (c) => (c === "yes" ? true : c === "no" ? false : c);

export function renderInfrastructure(container, infrastructure = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "infrastructure" } = {}) {
  const hooks = { onInput, onCommit };
  const platform = infrastructure.platform || {};
  const costs = infrastructure.costs || {};
  const legal = infrastructure.legalCompliance || {};

  // ── platform ──────────────────────────────────────────────
  const which = suggestField({
    label: "Platform",
    hint: "Start typing, e.g. Discord, Mastodon, Discourse. If yours isn’t listed, just type its name.",
    items: data.platforms,
    allowCustom: true,
    value: platform.platform,
    onChange: (v) => platformChanged(v),
    onCommit,
  });
  const typeHint = (id) => data.platformTypes.find((t) => t.id === id)?.description || "Who runs it, and what it mostly carries. This shapes the likely costs.";
  const type = selectField({
    label: "Platform type",
    options: data.platformTypes,
    value: platform.type,
    placeholder: "Choose a type…",
    hint: typeHint(platform.type),
    onChange: (id) => {
      type.setHint(typeHint(id));
      onCommit();
      // chosen by hand: the costs follow, for the listed platform if there is one
      if (id) afterTypeSet(id, data.platformRecords[which.value().id]);
    },
  });
  const software = textField({ label: "Software", hint: "e.g. Mastodon, Synapse, Discourse.", value: platform.software, ...hooks });
  const yesNo = (legend, value, { options = YES_NO, onChange = onCommit } = {}) =>
    renderChoices({ type: "radio", legend, options, selected: toChoice(value), listClass: "scale", clearable: true, onChange });

  // protocol: yes / no first; which protocol is only asked after "Yes"
  // (cards saved before usesProtocol existed count a named protocol as yes)
  const showProtocol = (c) => { protocol.element.hidden = c !== "yes"; };
  const usesProtocol = yesNo("Uses an open protocol", platform.usesProtocol ?? (platform.protocol ? true : null), {
    options: YES_NO.slice(0, 2),
    onChange: (c) => { showProtocol(c); onCommit(); },
  });
  const protocol = suggestField({ label: "Which protocol", hint: "Pick from the list, or type it.", items: data.protocols, allowCustom: true, value: platform.protocol, onCommit });
  showProtocol(usesProtocol.value());
  const openSource = yesNo("Open source", platform.openSource);
  const selfHosted = yesNo("Self-hosted", platform.selfHosted);
  const model = selectField({
    label: "Structural model",
    hint: "Centralized: one operator. Federation: many servers talking to each other. Relay: clients share relays.",
    options: data.structuralModels,
    value: platform.structuralModel,
    onChange: onCommit,
  });

  // ── pre-filling from the platform list ────────────────────
  // the fields a listed platform fills in: how each is read, shown and set
  const typeLabel = (id) => data.platformTypes.find((t) => t.id === id)?.label;
  const yesNoLabel = (c) => YES_NO.find((o) => o.id === c)?.label;
  const setType = (id) => { type.set(id); type.setHint(typeHint(id)); };
  const filled = [
    { label: "Platform type", get: () => type.value(), show: typeLabel, set: setType, from: (r, chosenType) => chosenType },
    { label: "Software", get: () => software.value(), set: software.set, from: (r) => r.software },
    { label: "Uses an open protocol", get: () => usesProtocol.value(), show: yesNoLabel,
      set: (c) => { usesProtocol.set(c); showProtocol(c); }, from: (r) => (namedProtocol(r) ? "yes" : "no") },
    // listed only when there is (or was) a protocol to name
    { label: "Protocol", get: () => (usesProtocol.value() === "yes" ? protocol.value().text || null : null), set: protocol.set,
      from: namedProtocol, optional: true },
    { label: "Open source", get: () => openSource.value(), show: yesNoLabel, set: openSource.set, from: (r) => toChoice(r.openSource) },
    { label: "Self-hosted", get: () => selfHosted.value(), show: yesNoLabel, set: selfHosted.set, from: (r) => toChoice(r.selfHostable) },
    { label: "Structural model", get: () => model.value(), set: model.set, from: (r) => r.structuralModel },
  ];
  const shown = (f, v) => (v == null ? "—" : (f.show ? f.show(v) : v));
  function namedProtocol(r) { return r.protocol && r.protocol !== "None" ? r.protocol : null; }

  let lastPlatform = platform.platform || null;
  function platformChanged(v) {
    const now = v.id || v.text || null;
    const before = lastPlatform;
    lastPlatform = now;
    if (!now || now === before) return;
    if (v.id) prefill(data.platformRecords[v.id], v.text, Boolean(before));
    else if (before) {
      showPopup({
        title: "Please review the platform details",
        message: `“${v.text}” isn’t in our platform list, so nothing was filled in. The fields under Platform may still describe the platform you had before; please check them.`,
      });
    }
  }

  /**
   * Fill the platform fields from a listed platform, and say what happened.
   * A platform that could be one of several types asks which first, so the
   * details shown afterwards are complete.
   */
  async function prefill(record, name, changing) {
    const chosenType = record.platformTypes.length > 1 ? await askType(record, name) : record.platformTypes[0];
    const rows = filled.map((f) => ({ f, before: f.get(), after: f.from(record, chosenType) }));
    for (const r of rows) r.f.set(r.after);
    const costs = chosenType ? costsForType(chosenType, record) : {};
    onCommit();

    // changing platforms: list only what changed, with what it was before
    const listed = rows.filter((r) => (changing ? r.before !== r.after : true) && !(r.f.optional && r.after == null && r.before == null));
    const items = listed.map((r) => el("li", {},
      el("b", { textContent: `${r.f.label}: ` }),
      shown(r.f, r.after),
      changing && r.before != null ? el("span", { className: "field-hint", textContent: ` (was ${shown(r.f, r.before)})` }) : null,
    ));

    const ok = el("button", { type: "button", className: "button button-small", textContent: "Got it" });
    ok.addEventListener("click", () => closePopup());
    await showPopup({
      title: changing ? "Platform changed: please double-check" : "Filled in from our platform data",
      body: el("div", {},
        el("p", {
          textContent: changing
            ? (listed.length ? `You chose ${name}, so these platform details were updated. Please check them:` : `You chose ${name}. The platform details stayed the same.`)
            : `We filled these in for ${name}. You can edit any of them:`,
        }),
        items.length ? el("ul", {}, ...items) : null,
        chosenType ? null : el("p", { className: "field-hint", textContent: "Choose a platform type under Platform when you’re ready." }),
        costs.filled ? el("p", { textContent: `The costs under Costs were filled in too, from what’s usual for ${name}.` }) : null,
        el("p", { className: "button-row" }, ok),
      ),
    });
    if (costs.diff?.length) suggestCosts(chosenType, costs.diff);
  }

  /** A pop-up asking which of a platform's possible types fits. Resolves with the id, or null for "decide later". */
  function askType(record, name) {
    return new Promise((resolve) => {
      let chosen = null;
      const buttons = record.platformTypes.map((id) => {
        const t = data.platformTypes.find((x) => x.id === id);
        const b = el("button", { type: "button", className: "button button-small", textContent: t.label });
        b.addEventListener("click", () => { chosen = id; closePopup(); });
        return el("div", { className: "choice" }, el("div", {}, b, el("p", { className: "field-hint", textContent: t.description })));
      });
      const later = el("button", { type: "button", className: "link-button", textContent: "Decide later" });
      later.addEventListener("click", () => closePopup());
      showPopup({
        title: "Which platform type?",
        body: el("div", {},
          el("p", { textContent: `${name} can be run in different ways. Which fits your community? We’ll fill in the rest of the details after.` }),
          ...buttons,
          el("p", { className: "button-row" }, later),
        ),
      }).then(() => resolve(chosen));
    });
  }

  // ── costs: one row of choices per category ────────────────
  // what each answer means is said once, above the rows, not in every row
  const costsHint = {
    element: el("div", { className: "field-hint" },
      el("p", { textContent: "Which of these your community pays for, in money or time." }),
      el("p", {}, ...data.costValues.flatMap((v, i) => [i ? " · " : "", el("b", { textContent: v.label }), `: ${v.description.replace(/\.$/, "").toLowerCase()}`])),
    ),
  };
  const costAnswers = data.costValues.map(({ id, label }) => ({ id, label }));
  const costRows = data.costCategories.map((cat) => ({
    id: cat.id,
    choices: renderChoices({
      type: "radio",
      legend: cat.label,
      options: costAnswers,
      selected: costs[cat.id] || null,
      listClass: "scale",
      clearable: true,
      onChange: onCommit,
    }),
  }));

  // ── costs that follow the platform type ───────────────────
  const costLabel = (id) => data.costValues.find((v) => v.id === id)?.label ?? "not answered";
  const categoryLabel = (id) => data.costCategories.find((c) => c.id === id).label;
  const currentCosts = () => Object.fromEntries(costRows.map((r) => [r.id, r.choices.value()]));

  /** The usual costs for a platform type, with a listed platform's own exceptions on top. */
  function usualCosts(typeId, record) {
    const own = record && data.costOverrides.find((o) => o.platform === record.platform && o.software === record.software && o.typeId === typeId);
    return { ...(data.typeCosts[typeId] || {}), ...own?.overrides };
  }

  /**
   * After the platform type is set: with no costs answered yet, fill them in
   * ({ filled: true }); otherwise return the costs that differ ({ diff }).
   */
  function costsForType(typeId, record) {
    const usual = usualCosts(typeId, record);
    const now = currentCosts();
    if (Object.values(now).every((v) => v == null)) {
      for (const r of costRows) r.choices.set(usual[r.id] ?? null);
      return { filled: true };
    }
    return { diff: costRows.filter((r) => (usual[r.id] ?? null) !== now[r.id]).map((r) => ({ id: r.id, from: now[r.id], to: usual[r.id] ?? null })) };
  }

  /** The type was chosen by hand: fill or suggest the costs, saying which. */
  function afterTypeSet(typeId, record) {
    const costs = costsForType(typeId, record);
    if (costs.filled) {
      onCommit();
      showPopup({ title: "Costs filled in", message: `We filled in the costs that are usual for ${typeLabel(typeId)} platforms. You can change any of them under Costs.` });
    } else if (costs.diff.length) suggestCosts(typeId, costs.diff);
  }

  /** A pop-up suggesting cost changes, each ticked; the person keeps the ones they want. */
  function suggestCosts(typeId, diff) {
    const pick = renderChoices({
      legend: "Suggested changes",
      legendHidden: true,
      options: diff.map((d) => ({ id: d.id, label: categoryLabel(d.id), description: `${costLabel(d.from)} → ${costLabel(d.to)}` })),
      selected: diff.map((d) => d.id),
    });
    const apply = el("button", { type: "button", className: "button button-small", textContent: "Apply ticked changes" });
    const keep = el("button", { type: "button", className: "link-button", textContent: "Keep my costs" });
    apply.addEventListener("click", () => {
      const chosen = pick.value();
      for (const d of diff) if (chosen.includes(d.id)) costRows.find((r) => r.id === d.id).choices.set(d.to);
      onCommit();
      closePopup();
    });
    keep.addEventListener("click", () => closePopup());
    return showPopup({
      title: "Suggested cost changes",
      body: el("div", {},
        el("p", { textContent: `${typeLabel(typeId)} platforms usually have different costs from the ones you’ve answered. Untick any you want to keep as they are:` }),
        pick.element,
        el("p", { className: "button-row" }, apply, keep),
      ),
    });
  }

  // ── other tools ───────────────────────────────────────────
  const tools = renderRows({
    legend: "Other tools",
    hint: "Tools beyond the main platform, e.g. for voting, decisions, or trust & safety.",
    items: infrastructure.additionalSystems || [],
    addLabel: "Add a tool",
    emptyText: "No other tools yet.",
    newItem: () => ({ toolName: "", toolType: "", usedFor: "", isCustom: true }),
    itemName: (t) => (t.toolName ? `“${t.toolName}”` : "this tool"),
    renderRow: (t, rowHooks) => {
      const toolOf = (id) => data.tools.find((x) => x.id === id);
      const known = data.tools.find((x) => x.label === t.toolName);
      // the kind follows the tool: a listed tool fills in its kind; moving
      // away from a listed tool clears the kind it filled in (a kind the
      // person typed themselves is left alone)
      let autoKind = known && t.toolType === known.toolType ? known.toolType : null;
      const toolType = suggestField({
        label: "Kind of tool",
        hint: "Pick from the list, or type your own.",
        items: data.toolTypes,
        allowCustom: true,
        browse: true,
        value: t.toolType || null,
        onCommit: rowHooks.onCommit,
      });
      const name = suggestField({
        label: "Tool",
        items: data.tools,
        allowCustom: true,
        value: known ? known.id : t.toolName || null,
        onChange: (v) => {
          const tool = v.id && toolOf(v.id);
          if (tool) {
            toolType.set(tool.toolType);
            autoKind = tool.toolType;
          } else if (autoKind && toolType.value().text === autoKind) {
            toolType.set(null);
            autoKind = null;
          }
        },
        onCommit: rowHooks.onCommit,
      });
      const usedFor = textField({ label: "What you use it for", value: t.usedFor, ...rowHooks });
      return {
        element: el("div", {}, name.element, toolType.element, usedFor.element),
        collect: () => ({
          ...t,
          toolName: name.value().text,
          toolType: toolType.value().text,
          usedFor: usedFor.value() || "",
          isCustom: !name.value().id,
        }),
        focus: () => name.focus(),
      };
    },
    ...hooks,
  });

  // ── locations ─────────────────────────────────────────────
  const places = (label, hint, values) => suggestField({
    label,
    hint,
    items: data.places,
    multiple: true,
    values: values || [],
    placeholder: "Start typing a country or region…",
    onCommit,
  });
  const servers = places("Where your servers are", "Where the community’s data is hosted.", legal.serverLocations);
  const users = places("Where your members are", "Roughly; pick a region or “Worldwide” if that’s simpler.", legal.userLocations);
  const admins = places("Where your admin team is", "Where the people running the community are based.", legal.adminTeamLocations);

  const section = (name, title, ...fields) => foldSection({
    title,
    key: `${stateKey}:${name}`,
    children: [el("div", { className: "fields" }, ...fields.map((f) => f.element))],
  });
  container.replaceChildren(
    section("platform", "Platform", which, type, software, usesProtocol, protocol, openSource, selfHosted, model),
    section("costs", "Costs", costsHint, ...costRows.map((r) => r.choices)),
    section("tools", "Other tools", tools),
    section("locations", "Locations", servers, users, admins),
  );

  return {
    collect: () => ({
      ...infrastructure,
      platform: {
        ...platform,
        platform: which.value().id || which.value().text || null,
        type: type.value(),
        software: software.value(),
        usesProtocol: fromChoice(usesProtocol.value()),
        protocol: usesProtocol.value() === "yes" ? protocol.value().text || null : null,
        openSource: fromChoice(openSource.value()),
        selfHosted: fromChoice(selfHosted.value()),
        structuralModel: model.value(),
      },
      costs: { ...costs, ...Object.fromEntries(costRows.map((r) => [r.id, r.choices.value()])) },
      additionalSystems: tools.value(),
      legalCompliance: {
        ...legal,
        serverLocations: servers.value(),
        userLocations: users.value(),
        adminTeamLocations: admins.value(),
      },
    }),
    focusFirst: () => which.focus(),
  };
}
