// The Processes module: how the community moderates, maintains its space,
// handles conflict, changes its own rules, and communicates.
//
//   const data = await loadProcessesData();
//   const form = renderProcesses(container, card.processes, data, { onInput, onCommit, stateKey, getPart, setPart });
//   form.collect()   → the processes object to save
//
// Moderation, maintenance and institutional change all show the community's
// structure — one shared list kept in membership.structure — and let people
// adjust it while thinking about that kind of work. Each section keeps its
// own notes on how each approach is used there (approachNotes).

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { pickList } from "../controls/picklist.js";
import { foldSection } from "../controls/fold.js";
import { logChanges } from "../structure.js";
import { loadRecommendations, reasonsFor, suggestedBadge } from "../recommend.js";

export async function loadProcessesData() {
  const [decisions, conflict, enums, recs] = await Promise.all([
    loadData("decision_approaches"),
    loadData("conflict_management"),
    loadData("enums"),
    loadRecommendations(),
  ]);
  return {
    recs,
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

/** { "<approach id>": "note" } → only the notes that say something */
const notesOf = (picks) => Object.fromEntries(picks.filter((p) => p.note).map((p) => [p.id, p.note]));

export function renderProcesses(container, processes = {}, data, hooksIn = {}) {
  const { onInput = () => {}, onCommit = () => {}, stateKey = "processes", getPart = () => ({}), setPart = () => {} } = hooksIn;
  const hooks = { onInput, onCommit };
  const con = processes.conflictManagement || {};
  const comms = processes.communications || {};
  const note = (label, value) => textField({ label, multiline: true, value, ...hooks });
  // options the card's values recommend get a "Suggested" chip
  const values = getPart("basics").values || [];
  const suggested = (list) => suggestedBadge(reasonsFor(list, values, data.recs.valueLabel));

  // ── the shared structure list ─────────────────────────────
  // each structure section edits the one list; a change made in one is
  // shown in the others straight away, and saved to membership
  const structurePickers = [];
  const setStructure = (ids, from, section) => {
    const m = getPart("membership");
    setPart("membership", { ...m, structure: ids, structureLog: logChanges(m, ids, section) });
    for (const p of structurePickers) if (p !== from) p.select(ids);
  };
  function structureSection(saved = {}, { usedFor, section }) {
    const structure = getPart("membership").structure || [];
    const notes = saved.approachNotes || {};
    const picker = pickList({
      legend: "Add or change approaches",
      filterLabel: "approaches",
      hint: "Your structure is one list, shared with Membership: what you tick or untick here changes it everywhere.",
      options: data.decisionApproaches,
      items: structure.map((id) => ({ id, note: notes[id] || null })),
      chosenLegend: "Your community structure",
      emptyText: "No structure chosen yet. Pick approaches below, or under Membership → Structure.",
      noteHint: `How it’s used for ${usedFor} (optional).`,
      badge: suggested(data.recs.decision),
      detachChosen: true,
      onSelect: (ids) => setStructure(ids, picker, section),
      ...hooks,
    });
    structurePickers.push(picker);
    return picker;
  }

  // ── moderation and maintenance: structure, scales, notes ──
  const workSection = (saved = {}, { usedFor, section, transparency, participation }) => ({
    saved,
    structure: structureSection(saved, { usedFor, section }),
    transparency: scale({ legend: "Transparency", ...transparency, value: saved.transparency, onCommit }),
    participatory: scale({ legend: "Participation", ...participation, value: saved.participatory, onCommit }),
  });
  const mod = workSection(processes.moderation, {
    usedFor: "moderation",
    section: "moderation",
    transparency: { low: "decisions and reasons stay with the moderators", high: "decisions, reasons and logs are public" },
    participation: { low: "a few people decide", high: "everyone can take part" },
  });
  mod.note = note("Anything else about moderation", mod.saved.generalNote);
  const main = workSection(processes.maintenance, {
    usedFor: "maintenance",
    section: "maintenance",
    transparency: { low: "upkeep decisions and costs stay with whoever runs things", high: "upkeep decisions, costs and changes are shared openly" },
    participation: { low: "one person or a small team does it", high: "anyone can help" },
  });
  main.note = note("Anything else about maintenance", main.saved.generalNote);

  // ── conflict management ───────────────────────────────────
  const conApproaches = pickList({
    legend: "How conflicts are handled",
    hint: "For each one you use, you can say at which step it comes in.",
    options: data.conflictApproaches,
    items: con.approaches,
    steps: data.conflictSteps,
    badge: suggested(data.recs.conflict),
    ...hooks,
  });
  const conNote = note("Anything else about conflict", con.generalNote);

  // ── institutional change ──────────────────────────────────
  const inst = { saved: processes.institutionalChange || {} };
  inst.structure = structureSection(inst.saved, { usedFor: "changing the rules and structure", section: "institutionalChange" });
  inst.note = note("Anything else about changing the rules", inst.saved.generalNote);

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
  const section = (name, title, ...elements) => foldSection({
    title,
    key: `${stateKey}:${name}`,
    children: [el("div", { className: "fields" }, ...elements)],
  });
  // a structure section: what's chosen (with notes) first, then the scales,
  // then the list to add or change approaches, then the general note
  const structureParts = (s) => [s.structure.chosenElement, s.transparency?.element, s.participatory?.element, s.structure.element, s.note.element].filter(Boolean);
  container.replaceChildren(
    section("moderation", "Moderation", ...structureParts(mod)),
    section("maintenance", "Maintenance", ...structureParts(main)),
    section("conflict", "Conflict management", conApproaches.element, conNote.element),
    section("change", "Institutional change", ...structureParts(inst)),
    section("communications", "Communications", channels.element, customChannels.element),
  );

  const work = (s) => ({
    ...s.saved,
    transparency: s.transparency.value(),
    participatory: s.participatory.value(),
    approachNotes: notesOf(s.structure.value()),
    generalNote: s.note.value(),
  });
  // cards from before moderation / maintenance were split had one combined
  // moderationMaintenance; it isn't carried forward
  const { moderationMaintenance, ...kept } = processes;
  return {
    collect: () => ({
      ...kept,
      moderation: work(mod),
      maintenance: work(main),
      conflictManagement: { ...con, approaches: conApproaches.value(), generalNote: conNote.value() },
      institutionalChange: { ...inst.saved, approachNotes: notesOf(inst.structure.value()), generalNote: inst.note.value() },
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
