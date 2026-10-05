// Suggestions ("update other modules" flags): when something on the card
// affects another module, the editor flags that module — a dot in the sidebar
// and a note at the top of its page with Apply / Dismiss.
//
// Each rule looks at the card and returns the suggestions that apply right
// now, so flags appear as soon as a change creates them and go away when the
// situation resolves itself. A suggestion:
//   { id, module, title, message, applyLabel, apply(card) → [parts changed],
//     alt?: { label, apply(card) → [parts changed] },   // an optional second action
//     dismissible?: false,                               // no "Dismiss" when the actions cover it
//     quiet?: true,                                      // just a note: no dot in the sidebar
//     label?: "Note" }                                   // the pill's word (default: Suggestion, or Note when quiet)
// applyLabel / apply are optional: a note can be something to read and dismiss.
// Messages can show a chip: "[[Suggested]] tags…" (see richText in js/dom.js).
// lists: [{ heading?, lines: [{ sign: "+" | "−", text, chip? }] }] shows changes one
// per line, each with a pixel plus or minus (and a chip after it, e.g. "Kept").
// `id` says what triggered it (e.g. "federation-on:Federation"), so a
// dismissed suggestion comes back if the trigger changes. Dismissed ids are
// kept on the card (card.dismissedSuggestions), so everyone editing it sees
// the same thing.

import { SECTION_LABELS, logChanges, logReviewed, settledChanges } from "./structure.js";

/** Turn modules on or off, keeping the built-in order (custom modules last). */
function withModule(card, defaults, id, on) {
  const builtIn = defaults.modules.map((m) => m.id);
  const set = new Set(card.modules || []);
  if (on) set.add(id);
  else set.delete(id);
  return [...builtIn.filter((m) => set.has(m)), ...[...set].filter((m) => !builtIn.includes(m))];
}

// ── the rules ───────────────────────────────────────────────

/** A platform that federates wants the Federation module; one that doesn't, may not. */
function federationForPlatform(card, { defaults }) {
  const model = card.infrastructure?.platform?.structuralModel;
  if (!model) return [];
  const federates = /Federation|Relay/.test(model);
  const on = (card.modules || []).includes("federation");

  if (federates && !on) {
    return [{
      id: `federation-on:${model}`,
      module: "infrastructure",
      title: "Add the Federation module?",
      message: `Your platform’s structural model is ${model}, so your community connects with other servers. The Federation module covers how you handle that: your approach, shared block lists, which rules guide your decisions, and bridging.`,
      applyLabel: "Add Federation",
      apply: (c) => { c.modules = withModule(c, defaults, "federation", true); return ["modules"]; },
    }];
  }
  if (!federates && on) {
    return [{
      id: `federation-off:${model}`,
      module: "federation",
      title: "You may not need this module",
      message: `Your platform’s structural model is ${model}, which doesn’t usually connect with other servers. Hiding the Federation module keeps anything you’ve written here.`,
      applyLabel: "Hide Federation",
      apply: (c) => { c.modules = withModule(c, defaults, "federation", false); return ["modules"]; },
    }];
  }
  return [];
}

/**
 * The structure list was changed from Processes since it was last confirmed
 * in Membership: flag Membership, to keep the changes or undo them. Earlier
 * changes from Processes are listed too, each marked Kept or Undone.
 */
function structureChangedInProcesses(card, { approachLabel }) {
  const m = card.membership || {};
  const now = m.structure || [];
  const reviewed = m.structureReviewed || [];
  const added = now.filter((id) => !reviewed.includes(id));
  const removed = reviewed.filter((id) => !now.includes(id));
  if (!added.length && !removed.length) return [];

  // where each change came from: the latest log entry for that approach
  const log = m.structureLog || [];
  const from = (id) => SECTION_LABELS[[...log].reverse().find((e) => e.id === id)?.from];
  const line = (id, sign, where, chip) => ({ sign, text: `${approachLabel(id)}${where ? ` (from ${where})` : ""}`, chip });
  const earlier = settledChanges(log).filter((e) => !added.includes(e.id) && !removed.includes(e.id));

  return [{
    id: `structure-changed:${[...now].sort().join(",")}`,
    module: "membership",
    label: "Note",   // a lime pill (it asks Keep / Undo), but reads as a note
    title: "Your structure was changed in Processes",
    message: "While working on Processes, your structure changed:",
    lists: [
      { lines: [...added.map((id) => line(id, "+", from(id))), ...removed.map((id) => line(id, "−", from(id)))] },
      ...(earlier.length ? [{
        heading: "Earlier changes from Processes:",
        lines: earlier.map((e) => line(e.id, e.change === "added" ? "+" : "−", SECTION_LABELS[e.from], e.outcome === "kept" ? "Kept" : "Undone")),
      }] : []),
    ],
    applyLabel: "Keep these changes",
    apply: (c) => {
      c.membership = { ...c.membership, structureReviewed: [...now], structureLog: logReviewed(c.membership.structureLog) };
      return ["membership"];
    },
    alt: {
      label: "Undo",
      apply: (c) => {
        // back to what was confirmed; logged as changes made from Membership
        // (so these changes show as undone next time)
        c.membership = { ...c.membership, structure: [...reviewed], structureLog: logChanges(c.membership, reviewed, "membership") };
        return ["membership"];
      },
    },
    dismissible: false,
  }];
}

/**
 * Processes starts from things chosen elsewhere: the structure (Membership)
 * shown above the three tabs, and "Suggested" chips from the values (Basics).
 * A note at the top says so, until dismissed.
 */
function processesIntro(card) {
  const hasStructure = (card.membership?.structure || []).length > 0;
  const hasValues = (card.basics?.values || []).length > 0;
  if (!(card.modules || []).includes("processes") || (!hasStructure && !hasValues)) return [];
  return [{
    id: "note:processes-from-elsewhere",
    module: "processes",
    title: "Some of this is shaped by your earlier answers",
    message: [
      hasStructure ? "Your community structure is the one you chose in Membership. Changing it here updates Membership too." : null,
      hasValues ? "[[Suggested]] tags come from the Values you selected in Basics." : null,
      "Review them and adjust anything as you go.",
    ].filter(Boolean).join(" "),
    quiet: true,
  }];
}

const RULES = [federationForPlatform, structureChangedInProcesses, processesIntro];

/** The suggestions that apply to the card now, minus dismissed ones. ctx: { defaults, approachLabel } */
export function suggestionsFor(card, ctx) {
  const dismissed = new Set(card.dismissedSuggestions || []);
  return RULES.flatMap((rule) => rule(card, ctx)).filter((s) => !dismissed.has(s.id));
}
