// The Processes module: how the community moderates, handles conflict,
// changes its own rules, and communicates.
//
//   const data = await loadProcessesData();
//   const form = renderProcesses(container, card.processes, data, { onInput, onCommit });
//   form.collect()   → the processes object to save

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { pickList } from "../controls/picklist.js";
import { foldSection } from "../controls/fold.js";

export async function loadProcessesData() {
  const [decisions, conflict, enums] = await Promise.all([
    loadData("decision_approaches"),
    loadData("conflict_management"),
    loadData("enums"),
  ]);
  return {
    decisionApproaches: decisions.items,
    conflictApproaches: conflict.items,
    conflictSteps: enums.conflictStep,
    channels: enums.communicationChannels,
  };
}

/**
 * A 1–5 scale: five radio buttons in a row, with what 1 and 5 mean
 * underneath. Stored as a number, or null if not answered.
 */
function scale({ legend, low, high, value, onCommit }) {
  const choices = renderChoices({
    type: "radio",
    legend,
    options: [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) })),
    selected: value == null ? null : String(value),
    listClass: "scale",
    after: [el("p", { className: "scale-ends field-hint" }, el("span", { textContent: `1 = ${low}` }), el("span", { textContent: `5 = ${high}` }))],
    clearable: true,
    onChange: onCommit,
  });
  return { element: choices.element, value: () => (choices.value() == null ? null : Number(choices.value())) };
}

export function renderProcesses(container, processes = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "processes" } = {}) {
  const hooks = { onInput, onCommit };
  const mod = processes.moderationMaintenance || {};
  const con = processes.conflictManagement || {};
  const inst = processes.institutionalChange || {};
  const comms = processes.communications || {};
  const note = (label, value) => textField({ label, multiline: true, value, ...hooks });

  // ── moderation & maintenance ──────────────────────────────
  const transparency = scale({
    legend: "Transparency",
    low: "decisions and reasons stay with the moderators",
    high: "decisions, reasons and logs are public",
    value: mod.transparency,
    onCommit,
  });
  const participatory = scale({
    legend: "Participation",
    low: "a few people decide",
    high: "everyone can take part",
    value: mod.participatory,
    onCommit,
  });
  const modApproaches = pickList({
    legend: "How moderation decisions are made",
    options: data.decisionApproaches,
    items: mod.approaches,
    ...hooks,
  });
  const modNote = note("Anything else about moderation", mod.generalNote);

  // ── conflict management ───────────────────────────────────
  const conApproaches = pickList({
    legend: "How conflicts are handled",
    hint: "For each one you use, you can say at which step it comes in.",
    options: data.conflictApproaches,
    items: con.approaches,
    steps: data.conflictSteps,
    ...hooks,
  });
  const conNote = note("Anything else about conflict", con.generalNote);

  // ── institutional change ──────────────────────────────────
  const instApproaches = pickList({
    legend: "How the community changes its rules and structure",
    options: data.decisionApproaches,
    items: inst.approaches,
    ...hooks,
  });
  const instNote = note("Anything else about changing the rules", inst.generalNote);

  // ── communications ────────────────────────────────────────
  const savedChannels = comms.channels || {};
  const channels = renderChoices({
    legend: "Channels you have",
    options: data.channels,
    selected: data.channels.filter((c) => savedChannels[c.id]).map((c) => c.id),
    onChange: onCommit,
  });
  const customChannels = renderRows({
    legend: "Other channels",
    items: comms.customChannels || [],
    addLabel: "Add a channel",
    newItem: () => ({ name: "", description: "" }),
    itemName: (c) => (c.name ? `“${c.name}”` : "this channel"),
    renderRow: (c, rowHooks) => {
      const name = textField({ label: "Channel", value: c.name, ...rowHooks });
      const description = textField({ label: "What it’s for", value: c.description, ...rowHooks });
      return {
        element: el("div", {}, name.element, description.element),
        collect: () => ({ name: name.value() || "", description: description.value() || "" }),
        focus: () => name.focus(),
      };
    },
    ...hooks,
  });

  // each section folds away; closed the first time, then as the person left it
  const section = (name, title, ...fields) => foldSection({
    title,
    key: `${stateKey}:${name}`,
    children: [el("div", { className: "fields" }, ...fields.map((f) => f.element))],
  });
  container.replaceChildren(
    section("moderation", "Moderation & maintenance", transparency, participatory, modApproaches, modNote),
    section("conflict", "Conflict management", conApproaches, conNote),
    section("change", "Institutional change", instApproaches, instNote),
    section("communications", "Communications", channels, customChannels),
  );

  return {
    collect: () => ({
      ...processes,
      moderationMaintenance: {
        ...mod,
        transparency: transparency.value(),
        participatory: participatory.value(),
        approaches: modApproaches.value(),
        generalNote: modNote.value(),
      },
      conflictManagement: { ...con, approaches: conApproaches.value(), generalNote: conNote.value() },
      institutionalChange: { ...inst, approaches: instApproaches.value(), generalNote: instNote.value() },
      communications: {
        ...comms,
        // every channel is stored, true or false, as the schema has them
        channels: Object.fromEntries(data.channels.map((c) => [c.id, channels.value().includes(c.id)])),
        customChannels: customChannels.value(),
      },
    }),
    focusFirst: () => {},
  };
}
