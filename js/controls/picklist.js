// Pick items from a list; picked items show as tags above it. Clicking a
// tag opens a pop-up to annotate it (a note; and, staged, its step); a tag
// with a note gets a small pixel asterisk badge, which also opens it. A
// tag's × unselects it. Used for:
//   - Processes' approaches: filterable list, a note on each
//   - Membership's ways of joining: a note on each
//   - Conflict management and Federation's response ladder: staged — tags
//     dragged into steps (several on one step happen in parallel); conflict
//     approaches can also be marked primary
//
//   const pick = pickList({
//     legend: "Approaches",
//     options: [{ id, label, description }],
//     items: [{ id, note }],        // what's saved; ids no longer in options are dropped
//     notes: true,                  // a note on each pick (default)
//     filterable: true,             // a "Filter…" box over the list (default)
//     staged: false,                // drag tags into steps; items: [{ id, note, stage, primary }]
//     primary: true,                // staged: whether a pick can be marked primary
//     chosenLegend: "What you use",
//     onInput, onCommit,
//   });
//   pick.value()   → [{ id, note?, stage?, primary? }], in the order shown
//
// A list whose ticks live somewhere else (e.g. the shared structure list,
// shown in several Processes tabs): onSelect(ids) hears every tick change,
// and pick.select(ids) re-syncs the ticks without firing anything. An item
// unticked and ticked again gets its note (and primary mark) back:
// `remembered` ([{ id, note, primary? }], items not selected now) seeds that
// from what was set aside (js/set-aside.js), and pick.remembered() lists
// what's being kept, to set it aside.
//
// detachChosen: the tags aren't placed above the list; pick.chosenElement
// is put wherever the page wants it. noteHint changes the hint on each note.
// layout ("compact" by default, or "described"), legendHidden, before /
// after (nodes above the tags / below the list) and pick.show(visible) work
// as in choices.js. chosenLegend: null for no label over the tags;
// tagsHint: false when the page already says how to annotate.

import { el, button } from "../dom.js";
import { renderChoices, scaleField } from "./choices.js";
import { textField } from "./fields.js";
import { showPopup, closePopup } from "../popup.js";

/** Picks' notes as { id: note }, only the notes that say something (e.g. Processes' approachNotes). */
export const notesOf = (picks = []) => Object.fromEntries(picks.filter((p) => p.note).map((p) => [p.id, p.note]));

/** Where step n of `total` falls: "First", "Escalation" or "Last resort" (also used by Export). */
export const stepRole = (n, total) => (n === 1 ? "First" : n === total ? "Last resort" : "Escalation");

export function pickList({
  legend,
  legendHidden = false,
  hint,
  options,
  items = [],
  remembered = [],
  notes = true,
  filterable = true,
  filterLabel,
  staged = false,
  primary: canBePrimary = true,   // staged: a "Primary" box in each pop-up
  chosenLegend = "What you use",
  tagsHint: showTagsHint = true,   // the "Click one to add a note." line over the tags
  emptyText = "Nothing chosen yet. Select items in the list below.",
  noteHint = "How it works in your community (optional).",
  badge,
  layout = "compact",
  before = [],
  after = [],
  detachChosen = false,
  onSelect = () => {},
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const byId = new Map(options.map((o) => [o.id, o]));
  const labelOf = (id) => byId.get(id).label;
  // a fresh pick: just its id (and an empty note), on a new last step if
  // staged — or what it had before, if it was unticked earlier
  const removed = new Map(remembered.filter((r) => byId.has(r.id)).map((r) => [r.id, { ...r }]));
  let picks = [];
  const lastStage = () => Math.max(0, ...picks.map((p) => p.stage || 0));
  const blank = (id) => {
    const before = removed.get(id);
    if (before) return staged ? { ...before, stage: lastStage() + 1 } : before;   // back on a new last step
    return { id, ...(notes ? { note: null } : {}), ...(staged ? { stage: lastStage() + 1, primary: false } : {}) };
  };
  for (const i of items.filter((x) => byId.has(x.id))) picks.push({ ...blank(i.id), ...i });
  const annotatable = notes || staged;

  // ── the tags ──────────────────────────────────────────────
  // in order (the ladder): a pixel arrow points from each tag to the next.
  // staged: tags in columns, one per step, arrows between the steps.
  const tags = el("ul", { className: `tags plain-list pick-tags${staged ? " in-stages" : ""}` });
  const empty = el("p", { className: "field-hint", textContent: emptyText });
  const tagsHint = annotatable && showTagsHint
    ? el("p", {
      className: "field-hint",
      textContent: staged
        ? `Drag them into the order you’d try them; put ones you’d use at the same time on the same step. Click one to add a note${canBePrimary ? " or mark it primary" : ""}.`
        : "Click one to add a note.",
    })
    : null;
  const chosen = el("div", { className: "field pick-chosen" },
    chosenLegend ? el("p", { className: "mono-u", textContent: chosenLegend }) : null,
    tagsHint,
    empty,
    tags,
  );

  let dragged = null;
  /** Something can be dropped here: allow it, and highlight while it's over. */
  const dropTarget = (node, onDrop) => {
    node.addEventListener("dragover", (e) => { if (dragged) { e.preventDefault(); node.classList.add("is-over"); } });
    node.addEventListener("dragleave", () => node.classList.remove("is-over"));
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove("is-over");
      if (dragged) onDrop(e);
    });
  };

  /** One tag: its name (opens the pop-up), its ×, and the note badge if it has a note. */
  function tagFor(p) {
    const name = [labelOf(p.id), p.primary ? "Primary" : null].filter(Boolean).join(" · ");
    const annotated = Boolean(p.note);
    const open = annotatable ? button(name, "tag-open", () => annotate(p)) : el("span", { textContent: name });
    if (annotatable) open.setAttribute("aria-label", `${name}${annotated ? " (has a note)" : ""}: open to annotate`);
    const remove = button("", "tag-remove", () => untick(p.id));
    remove.append(el("span"));   // the pixel X
    remove.setAttribute("aria-label", `Remove ${labelOf(p.id)}`);
    const mark = annotated ? button("", "note-mark", () => annotate(p)) : null;
    mark?.setAttribute("aria-label", `Open the note on ${labelOf(p.id)}`);
    const tag = el("li", { className: `tag${annotated ? " has-note" : ""}` }, open, remove, mark);
    if (staged) {
      tag.draggable = true;
      tag.addEventListener("dragstart", (e) => {
        dragged = p;
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        tag.classList.add("is-dragging");
        tags.classList.add("is-dragging-over");
      });
      tag.addEventListener("dragend", () => {
        dragged = null;
        tag.classList.remove("is-dragging");
        tags.classList.remove("is-dragging-over");
      });
    }
    return tag;
  }

  // ── steps (staged) ────────────────────────────────────────
  const stageCount = () => new Set(picks.map((p) => p.stage)).size;
  /** Steps numbered 1, 2, 3… with no gaps, keeping their order. */
  function renumber() {
    const order = [...new Set(picks.map((p) => p.stage))].sort((a, b) => a - b);
    for (const p of picks) p.stage = order.indexOf(p.stage) + 1;
    picks.sort((a, b) => a.stage - b.stage);
  }
  /** A step's name from where it falls: first, escalation, last resort; and when shared, in parallel. */
  const stageName = (n, total, size) => `${n} · ${stepRole(n, total)}${size > 1 ? " · in parallel" : ""}`;
  /** Put a pick on step n; "new" = a new last step; { before: n } = a new step just before step n. */
  function moveTo(p, target) {
    if (target === "new") p.stage = lastStage() + 1;
    else if (typeof target === "object") {
      for (const x of picks) if (x !== p && x.stage >= target.before) x.stage += 1;
      p.stage = target.before;
    } else p.stage = target;
    renumber();
  }

  function renderStages() {
    renumber();
    const total = stageCount();
    // each step: a gap on its left (drop there for a new step before it; an
    // arrow from the step before), then the step itself; and a last gap at
    // the end for a new last step. Every step has the same shape, so steps
    // that wrap onto a new row line up with the first row.
    const gap = (before, arrow) => {
      const g = el(before === null ? "li" : "div", { className: `pick-gap${arrow ? " has-arrow" : ""}` });
      g.setAttribute("aria-hidden", "true");
      dropTarget(g, () => { moveTo(dragged, before === null ? "new" : { before }); changed(); });
      return g;
    };
    const parts = [];
    for (let n = 1; n <= total; n++) {
      const inStage = picks.filter((p) => p.stage === n);
      const stage = el("div", { className: "pick-stage" },
        el("p", { className: "mono-u summary-label", textContent: stageName(n, total, inStage.length) }),
        el("ul", { className: "tags plain-list" }, ...inStage.map(tagFor)));
      dropTarget(stage, () => { moveTo(dragged, n); changed(); });   // dropped on a step: joins it
      parts.push(el("li", { className: "pick-step" }, gap(n, n > 1), stage));
    }
    parts.push(gap(null, false));
    tags.replaceChildren(...parts);
  }

  function renderTags() {
    empty.hidden = picks.length > 0;
    if (tagsHint) tagsHint.hidden = !picks.length;
    if (staged) renderStages();
    else tags.replaceChildren(...picks.map(tagFor));
  }
  const changed = () => { renderTags(); onCommit(); };

  /** The pop-up for one pick: its note, and (staged) its step and whether it's primary. */
  function annotate(p) {
    let savedNote = p.note;   // the note as last saved (so closing only saves a change)
    const note = notes
      ? textField({ label: "Note", hint: noteHint, multiline: true, value: p.note,
        onInput: () => { p.note = note.value(); onInput(); },
        onCommit: () => { savedNote = p.note; onCommit(); } })
      : null;
    // staged: which step (the same number as another = in parallel), and
    // primary. The steps are drawn again after each move, since "A new last
    // step" adds one (and the pick's number can change).
    const stepBox = el("div");
    const drawStep = () => stepBox.replaceChildren(scaleField({
      legend: "Step",
      hint: "The order you’d try it in. Give two the same step to use them at the same time.",
      options: [...Array.from({ length: stageCount() }, (_, i) => ({ id: String(i + 1), label: String(i + 1) })), { id: "new", label: "A new last step" }],
      value: String(p.stage),
      clearable: false,   // every pick is on a step
      onChange: (v) => { moveTo(p, v === "new" ? "new" : Number(v)); changed(); drawStep(); },
    }).element);
    if (staged) drawStep();
    const primary = staged && canBePrimary ? renderChoices({
      legend: "Primary",
      legendHidden: true,
      options: [{ id: "primary", label: "Primary", description: "A preferred way your community handles conflict." }],
      selected: p.primary ? ["primary"] : [],
      onChange: (v) => { p.primary = v.length > 0; changed(); },
    }) : null;
    showPopup({
      title: labelOf(p.id),
      body: el("div", {},
        byId.get(p.id).description ? el("p", { className: "field-hint", textContent: byId.get(p.id).description }) : null,
        staged ? stepBox : null,
        primary?.element,
        note?.element,
        el("p", { className: "button-row" },
          button("Done", "button button-small", closePopup),
          button("Remove", "link-button link-button-danger", () => { untick(p.id); closePopup(); }),
        ),
      ),
    }).then(() => {
      if (note) p.note = note.value();
      renderTags();   // (its note badge)
      if (note && p.note !== savedNote) onCommit();   // a note typed but not yet saved
    });
    note?.focus();
  }

  // ── the list to tick from ─────────────────────────────────
  const list = renderChoices({
    legend,
    legendHidden,
    hint,
    options,
    selected: picks.map((p) => p.id),
    layout,
    filterable,
    filterLabel,
    badge,
    listClass: filterable ? "scroll-list" : "",
    before: [...before, ...(detachChosen ? [] : [chosen])],   // e.g. a callout, then the tags
    after,
    onChange: (ids) => {
      sync(ids);
      onSelect(ids);
      onCommit();
    },
  });

  /** A newly ticked item gets a tag (at the end); an unticked one loses it (its note is kept). */
  function sync(ids) {
    for (const p of picks) if (!ids.includes(p.id)) removed.set(p.id, p);
    const have = new Set(picks.map((p) => p.id));
    picks = picks.filter((p) => ids.includes(p.id));
    for (const id of ids) if (!have.has(id)) picks.push(blank(id));
    renderTags();
  }

  function untick(id) {
    list.setOne(id, false);
    sync(list.value());
    onSelect(list.value());
    onCommit();
  }

  renderTags();
  return {
    element: list.element,
    chosenElement: chosen,
    value: () => picks.map((p) => ({
      id: p.id,
      ...(notes ? { note: p.note } : {}),
      ...(staged ? { stage: p.stage, ...(canBePrimary ? { primary: Boolean(p.primary) } : {}) } : {}),
    })),
    /** Unselected items that still have a note (kept, so it comes back if re-selected). */
    remembered: () => [...removed.values()]
      .filter((p) => (p.note || p.primary) && !picks.some((q) => q.id === p.id))
      .map((p) => ({ id: p.id, ...(p.note ? { note: p.note } : {}), ...(p.primary ? { primary: true } : {}) })),
    show: list.show,
    /** Tick exactly these, from outside (fires nothing). */
    select: (ids) => {
      const valid = ids.filter((id) => byId.has(id));
      list.set(valid);
      sync(valid);
    },
  };
}
