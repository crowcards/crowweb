// The Infrastructure module: the platform the community runs on, what it
// costs, other tools it uses, and where its servers, members and admins are.
//
//   const data = await loadInfrastructureData();
//   const form = renderInfrastructure(container, card.infrastructure, data, { onInput, onCommit, stateKey });
//   form.collect()   → the infrastructure object to save
//
// Phase 2 builds the fields; filling them in from the chosen platform comes
// in Phase 3.

import { loadData, loadProtocolItems } from "../data.js";
import { el } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { suggestField } from "../controls/suggest.js";
import { foldSection } from "../controls/fold.js";

export async function loadInfrastructureData() {
  const [platforms, costRules, enums, tools, countries, protocols] = await Promise.all([
    loadData("platforms"),
    loadData("cost_rules"),
    loadData("enums"),
    loadData("tools"),
    loadData("countries"),
    loadProtocolItems(),
  ]);
  return {
    // e.g. "Matrix client (Synapse)", with the community type as a note
    platforms: platforms.items.map((p) => ({
      id: p.id,
      label: p.isGeneric ? `${p.platform} (any)`
        : p.software && !["Proprietary", p.platform].includes(p.software) ? `${p.platform} (${p.software})` : p.platform,
      aliases: [p.software, p.protocol].filter((a) => a && a !== "None" && a !== "Proprietary"),
      note: p.type,
    })),
    platformTypes: Object.values(costRules.types).map((t) => ({ id: t.id, label: t.label, description: t.description })),
    structuralModels: [...new Set(platforms.items.map((p) => p.structuralModel))].sort().map((m) => ({ id: m, label: m })),
    costCategories: costRules.categories,
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
    onCommit,
  });
  const typeHint = (id) => data.platformTypes.find((t) => t.id === id)?.description || "Who runs it, and what it mostly carries. This shapes the likely costs.";
  const type = selectField({
    label: "Platform type",
    options: data.platformTypes,
    value: platform.type,
    placeholder: "Choose a type…",
    hint: typeHint(platform.type),
    onChange: (id) => { type.setHint(typeHint(id)); onCommit(); },
  });
  const software = textField({ label: "Software", hint: "e.g. Mastodon, Synapse, Discourse.", value: platform.software, ...hooks });
  const protocol = suggestField({ label: "Protocol", hint: "If it uses an open protocol.", items: data.protocols, allowCustom: true, value: platform.protocol, onCommit });
  const yesNo = (legend, value) => renderChoices({ type: "radio", legend, options: YES_NO, selected: toChoice(value), listClass: "scale", clearable: true, onChange: onCommit });
  const openSource = yesNo("Open source", platform.openSource);
  const selfHosted = yesNo("Self-hosted", platform.selfHosted);
  const model = selectField({
    label: "Structural model",
    hint: "Centralized: one operator. Federation: many servers talking to each other. Relay: clients share relays.",
    options: data.structuralModels,
    value: platform.structuralModel,
    onChange: onCommit,
  });

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
    section("platform", "Platform", which, type, software, protocol, openSource, selfHosted, model),
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
        protocol: protocol.value().text || null,
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
