// Pick items from a list; each picked item becomes a row underneath, which can
// carry a note (and a step), and can be put in order. Built from the shared
// pieces: a compact checkbox list to choose from, and rows for the picks
// (a row's × unticks it). Used for:
//   - Processes' approaches: filterable list, a note on each (+ a step for conflict)
//   - Federation's response ladder: no notes, rows put in order
//
//   const pick = pickList({
//     legend: "Approaches",
//     options: [{ id, label, description }],
//     items: [{ id, note }],        // what's saved; ids no longer in options are dropped
//     notes: true,                  // a note box on each pick (default)
//     steps: [{ id, label }],       // optional: a step dropdown on each pick
//     filterable: true,             // a "Filter…" box over the list (default)
//     reorderable: false,           // ↑ / ↓ on each pick
//     chosenLegend: "What you use",
//     onInput, onCommit,
//   });
//   pick.value()   → [{ id, note?, step? }], in the order shown
//
// A list whose ticks live somewhere else (e.g. the shared structure list,
// shown in several Processes sections): onSelect(ids) hears every tick
// change, and pick.select(ids) re-syncs the ticks without firing anything.
// An item unticked and ticked again gets its note back.
//
// detachChosen: the picks aren't placed under the list; pick.chosenElement
// is put wherever the page wants it (e.g. above other fields). noteHint
// changes the hint on each note.

import { el } from "../dom.js";
import { renderChoices } from "./choices.js";
import { renderRows } from "./rows.js";
import { textField, selectField } from "./fields.js";

export function pickList({
  legend,
  hint,
  options,
  items = [],
  notes = true,
  steps,
  filterable = true,
  filterLabel,
  reorderable = false,
  chosenLegend = "What you use",
  emptyText = "Nothing chosen yet. Tick items in the list above.",
  noteHint = "How it works in your community (optional).",
  badge,
  detachChosen = false,
  onSelect = () => {},
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const known = items.filter((i) => byId.has(i.id));
  // a fresh pick: just its id, plus empty note / step if this list has them —
  // or what it had before, if it was unticked earlier
  const removed = new Map();
  const blank = (id) => removed.get(id) || { id, ...(steps ? { step: null } : {}), ...(notes ? { note: null } : {}) };

  const chosen = renderRows({
    legend: chosenLegend,
    emptyText,
    items: known,
    reorderable,
    itemName: (i) => byId.get(i.id).label,
    renderRow: (item, hooks) => {
      const step = steps
        ? selectField({ label: "Step", options: steps, value: item.step, placeholder: "Choose a step…", onChange: hooks.onCommit })
        : null;
      const note = notes
        ? textField({ label: "Note", hint: noteHint, multiline: true, value: item.note, ...hooks })
        : null;
      return {
        element: el("div", {},
          el("p", { className: "row-title", textContent: byId.get(item.id).label }),
          step?.element,
          note?.element,
        ),
        collect: () => ({
          id: item.id,
          ...(steps ? { step: step.value() } : {}),
          ...(notes ? { note: note.value() } : {}),
        }),
        focus: () => note?.focus(),
      };
    },
    onRemove: (item, current) => {   // the × unticks it in the list (keeping its note for later)
      removed.set(item.id, current);
      list.setOne(item.id, false);
      onSelect(list.value());
    },
    onInput,
    onCommit,
  });

  const list = renderChoices({
    legend,
    hint,
    options,
    selected: known.map((i) => i.id),
    layout: "compact",
    filterable,
    filterLabel,
    badge,
    listClass: filterable ? "scroll-list" : "",
    after: detachChosen ? [] : [chosen.element],
    onChange: (ids) => {
      syncRows(ids);
      onSelect(ids);
      onCommit();
    },
  });

  /** A newly ticked item gets a row (at the end); an unticked one loses its row. */
  function syncRows(ids) {
    const now = chosen.value();
    for (const item of now) if (!ids.includes(item.id)) removed.set(item.id, item);
    const have = new Set(now.map((i) => i.id));
    for (const id of ids) if (!have.has(id)) chosen.add(blank(id));
    chosen.remove((i) => !ids.includes(i.id));
  }

  return {
    element: list.element,
    chosenElement: chosen.element,
    value: () => chosen.value(),
    /** Tick exactly these, from outside (fires nothing). */
    select: (ids) => {
      list.set(ids.filter((id) => byId.has(id)));
      syncRows(ids.filter((id) => byId.has(id)));
    },
  };
}
