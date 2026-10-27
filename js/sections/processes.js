// The Processes module: how the community changes its own rules, maintains
// its space, moderates, handles conflict, and communicates.
//
//   const data = await loadProcessesData();
//   const form = renderProcesses(container, card.processes, data, { onInput, onCommit, stateKey, getPart, setParts });
//   form.collect()   → the processes object to save
//
// First a box with a tab each for institutional change, maintenance and
// moderation. Each shows the community's structure (one shared list, kept
// in membership.structure) as tags to adjust while thinking about that kind
// of work, each tag taking its own note for that tab (approachNotes), then
// the tab's general note. Then Conflict management and Communications.

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { pickList, notesOf } from "../controls/picklist.js";
import { sectionMaker } from "../controls/fold.js";
import { tabBox } from "../controls/tabs.js";
import { logChanges, structureIds, changeStructure } from "../structure.js";
import { asideOf, picksAside } from "../set-aside.js";
import { loadRecommendations, suggestionsFrom } from "../recommend.js";

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
    channels: enums.communicationChannels,
  };
}

/** The three areas the structure is used for: the Processes tabs (also named on the card). */
export const WORK_AREAS = [
  { part: "institutionalChange", id: "change", label: "Change" },
  { part: "maintenance", id: "maintenance", label: "Maintenance" },
  { part: "moderation", id: "moderation", label: "Moderation" },
];

/** A custom channel in one line: "Zine — Monthly" (also used by Export). */
export const channelLine = (c) => [c.name, c.description].filter(Boolean).join(" — ");

export function renderProcesses(container, processes = {}, data, hooksIn = {}) {
  const { onInput = () => {}, onCommit = () => {}, stateKey = "processes", getPart = () => ({}), setParts = () => {}, setAside = asideOf() } = hooksIn;
  const hooks = { onInput, onCommit };
  const con = processes.conflictManagement || {};
  const comms = processes.communications || {};
  const note = (label, value) => textField({ label, multiline: true, value, ...hooks });
  // options the card's values recommend get a "Suggested" chip
  const recs = suggestionsFrom(data.recs, getPart("basics"));

  // ── the shared structure list ─────────────────────────────
  // each tab edits the one list (a change made in one shows in the others
  // straight away, and is saved to membership); notes are per tab
  const structurePickers = [];
  const setStructure = (ids, from, section) => {
    const m = getPart("membership");
    const ed = getPart("editor");
    // both at once: the change's log entry, and the structure itself (Membership's
    // own notes stay with their approaches, or are set aside and come back with them)
    const { structure, setAside: aside } = changeStructure(m, ids, ed.setAside);
    setParts({ editor: { ...ed, structureLog: logChanges(ed.structureLog, structureIds(m), ids, section), setAside: aside }, membership: { ...m, structure } });
    for (const p of structurePickers) if (p !== from) p.select(ids);
  };
  function structureSection(saved = {}, { usedFor, section, generalLabel }) {
    const structure = structureIds(getPart("membership"));
    const notes = saved.approachNotes || {};
    const picker = pickList({
      legend: `Approaches for ${usedFor}`,
      legendHidden: true,
      tagsHint: false,   // (the hint above says it)
      filterLabel: "approaches",
      options: data.decisionApproaches,
      items: structure.map((id) => ({ id, note: notes[id] || null })),
      remembered: setAside.list(`${section}.approachNotes:`),   // notes on approaches removed earlier: back if they're added again
      chosenLegend: null,
      emptyText: "None chosen yet. Select approaches in the list below.",
      noteHint: `How it’s used for ${usedFor} (optional).`,
      badge: recs.badge("decision"),
      alike: recs.alike("decision"),
      // first in the tab: the hint (naming this tab's work, highlighted), then the tags
      before: [el("p", { className: "field-hint" },
        "The decision-making approaches you use, first set in ",
        el("a", { className: "inline", href: "#membership", textContent: "Membership" }),
        ". Select or unselect to change them everywhere; click one to note how it’s used for ",
        el("mark", { className: "tab-term", textContent: usedFor }), ".")],
      onSelect: (ids) => setStructure(ids, picker, section),
      ...hooks,
    });
    structurePickers.push(picker);
    return { saved, structure: picker, note: note(generalLabel, saved.generalNote) };
  }
  const inst = structureSection(processes.institutionalChange, { usedFor: "changing the rules and structure", section: "institutionalChange", generalLabel: "Anything else about changing the rules" });
  const main = structureSection(processes.maintenance, { usedFor: "maintenance", section: "maintenance", generalLabel: "Anything else about maintenance" });
  const mod = structureSection(processes.moderation, { usedFor: "moderation", section: "moderation", generalLabel: "Anything else about moderation" });

  // ── conflict management ───────────────────────────────────
  const conApproaches = pickList({
    legend: "How conflicts are handled",
    hint: "Select the ones you use, then put them in steps above.",
    options: data.conflictApproaches,
    items: con.approaches || [],
    remembered: setAside.list("conflictManagement.approaches:"),
    staged: true,
    chosenLegend: "Your steps",
    badge: recs.badge("conflict"),
    alike: recs.alike("conflict"),
    ...hooks,
  });
  const conNote = note("Anything else about conflict", con.generalNote);

  // ── communications ────────────────────────────────────────
  const channels = renderChoices({
    legend: "Channels you have",
    options: data.channels,
    selected: comms.channels || [],
    onChange: onCommit,
  });
  const customChannels = renderRows({
    legend: "Other channels",
    items: comms.customChannels || [],
    addLabel: "Add a channel",
    newItem: () => ({ name: "", description: "" }),
    itemName: (c) => (c.name ? `“${c.name}”` : "this channel"),
    summarize: (c) => (c.name ? channelLine(c) : ""),
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

  const section = sectionMaker(stateKey);   // each section folds; closed at first, then as the person left it
  // "Your community structure", then the tabs; in each, the hint and tags,
  // the list to tick from, and the tab's general note
  const tab = (id, label, t) => ({ id, label, children: [el("div", { className: "fields" }, t.structure.element, t.note.element)] });
  const tabs = tabBox({
    label: "How your structure is used",
    key: `${stateKey}:structure`,
    tabs: WORK_AREAS.map((w) => tab(w.id, w.label, { institutionalChange: inst, maintenance: main, moderation: mod }[w.part])),
  });
  container.replaceChildren(
    el("div", { className: "fields" },
      el("p", { className: "mono-u", textContent: "Your community structure" }),
      tabs.element),
    section("conflict", "Conflict management", conApproaches.element, conNote.element),
    section("communications", "Communications", channels.element, customChannels.element),
  );

  const work = (t) => ({ ...t.saved, approachNotes: notesOf(t.structure.value()), generalNote: t.note.value() });
  return {
    // set aside: notes (and primary marks) on approaches no longer selected
    setAside: () => ({
      ...picksAside("institutionalChange.approachNotes:", inst.structure.remembered()),
      ...picksAside("maintenance.approachNotes:", main.structure.remembered()),
      ...picksAside("moderation.approachNotes:", mod.structure.remembered()),
      ...picksAside("conflictManagement.approaches:", conApproaches.remembered()),
    }),
    collect: () => ({
      ...processes,
      moderation: work(mod),
      maintenance: work(main),
      conflictManagement: { ...con, approaches: conApproaches.value(), generalNote: conNote.value() },
      institutionalChange: work(inst),
      communications: {
        ...comms,
        channels: channels.value(),   // the ids of the channels you have
        customChannels: customChannels.value(),
      },
    }),
    focusFirst: () => {},
  };
}
