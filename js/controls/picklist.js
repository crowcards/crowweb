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
  reorderable = false,
  chosenLegend = "What you use",
  emptyText = "Nothing chosen yet. Tick items in the list above.",
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const known = items.filter((i) => byId.has(i.id));
  // a fresh pick: just its id, plus empty note / step if this list has them
  const blank = (id) => ({ id, ...(steps ? { step: null } : {}), ...(notes ? { note: null } : {}) });

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
        ? textField({ label: "Note", hint: "How it works in your community (optional).", multiline: true, value: item.note, ...hooks })
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
    onRemove: (item) => list.setOne(item.id, false),   // the × unticks it in the list
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
    listClass: filterable ? "scroll-list" : "",
    after: [chosen.element],
    onChange: (ids) => {
      // a newly ticked item gets a row (at the end); an unticked one loses its row
      const have = new Set(chosen.value().map((i) => i.id));
      for (const id of ids) if (!have.has(id)) chosen.add(blank(id));
      chosen.remove((i) => !ids.includes(i.id));
      onCommit();
    },
  });

  return { element: list.element, value: () => chosen.value() };
}
