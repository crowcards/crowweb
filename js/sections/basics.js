// The Basics form: who the community is. Used in two places: the set-up page
// right after a card is made, and the Basics module in the editor.
//
//   const data = await loadBasicsData();
//   const form = renderBasics(container, card.basics, data, { onInput, onCommit, onTypeChange });
//   form.collect()   → the basics object to save
//   form.focusFirst()
//
// onInput fires while typing (schedule a save); onCommit fires when a field
// is left or a choice is made (save now); onTypeChange(from, to) fires when
// the community type changes (so the module picker can re-suggest).

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { tagList, tagInput } from "../controls/tags.js";

/** The reference data the form is built from. */
export async function loadBasicsData() {
  const [types, enums, values, conflicts] = await Promise.all([
    loadData("community_types"),
    loadData("enums"),
    loadData("values"),
    loadData("value_conflicts"),
  ]);
  return {
    types: types.items,
    sizes: enums.communitySize,
    values: values.items,
    // only pairs a person has checked are shown to card makers
    conflicts: conflicts.items.filter((c) => c.status === "accepted"),
  };
}

// how strongly a pair of values pulls apart (value_conflicts.json conflict_level)
const LEVEL = {
  opposite: {
    title: "close to contradictory",
    advice: "Holding both is possible, but hard. If you do, it helps to say how you decide between them when they clash.",
  },
  strong: {
    title: "values in tension",
    advice: "Many communities hold both; it takes active balancing. You may want to say how you do it, e.g. in your rules or processes.",
  },
  soft: {
    title: "worth keeping in mind",
    advice: "Usually manageable with good practice. Just something to be aware of.",
  },
};

export function renderBasics(container, basics = {}, data, handlers = {}) {
  const { onInput = () => {}, onCommit = () => {}, onTypeChange = () => {} } = handlers;

  // ── name and link ─────────────────────────────────────────
  const name = textField({ label: "Community name", value: basics.communityName, onInput, onCommit });
  const link = textField({
    label: "Community link",
    hint: "Where people find your community online, e.g. its website or server.",
    type: "url",
    placeholder: "https://",
    value: basics.communityLink,
    onInput,
    onCommit,
  });

  // ── community type: its hint describes the chosen type ────
  const typeHint = (id) => data.types.find((t) => t.id === id)?.description
    || "What kind of space is it? This also suggests which modules your card covers.";
  let lastType = basics.communityType || null;
  const type = selectField({
    label: "Community type",
    options: data.types,
    value: lastType,
    placeholder: "Choose a type…",
    hint: typeHint(lastType),
    onChange: (to) => {
      type.setHint(typeHint(to));
      const from = lastType;
      lastType = to;
      onTypeChange(from, to);
      onCommit();
    },
  });

  // ── community size ────────────────────────────────────────
  const size = renderChoices({
    type: "radio",
    legend: "Community size",
    options: data.sizes,
    selected: basics.communitySize || null,
    clearable: true,
    onChange: onCommit,
  });

  // ── keywords ──────────────────────────────────────────────
  const keywords = tagInput({
    label: "Keywords",
    hint: "A few words people might search for, e.g. “gardening”, “open science”. Press Enter or Tab after each one.",
    values: basics.communityKeywords || [],
    onCommit,
  });

  // ── values: pick any number; pairs in tension get a note ──
  const valueById = new Map(data.values.map((v) => [v.id, v]));
  // chosen values as tags above the list, each with an ×, so a value can be
  // unticked without scrolling the list to find it
  const chosen = tagList({
    ariaLabel: "Chosen values",
    quiet: true,
    onRemove: (id) => {
      values.setOne(id, false);
      changed();
    },
  });
  const conflictNotes = el("div", { className: "conflict-notes" });
  conflictNotes.setAttribute("aria-live", "polite");

  const values = renderChoices({
    legend: "Values",
    hint: "What your community cares about. Pick as many as fit.",
    options: data.values,
    selected: basics.values || [],
    layout: "compact",
    filterable: true,
    listClass: "scroll-list",
    details: (v) => [
      el("p", { textContent: v.description }),
      v.signals ? el("p", { className: "field-hint" }, el("em", { textContent: "Example of inconsistency: " }), v.signals) : null,
    ],
    before: [chosen.element, conflictNotes],
    onChange: () => changed(),
  });

  function changed() {
    renderChosen();
    onCommit();
  }

  function renderChosen() {
    const on = new Set(values.value());
    chosen.render(data.values.filter((v) => on.has(v.id)));

    const pairs = data.conflicts.filter((c) => c.values.every((x) => on.has(x)));
    conflictNotes.replaceChildren(...pairs.map((c) => {
      const [a, b] = c.values.map((x) => valueById.get(x)?.label || x);
      const level = LEVEL[c.conflict_level] || LEVEL.strong;
      return el("div", { className: "callout" },
        el("p", {}, el("b", { className: "mono-u", textContent: `${a} and ${b}: ${level.title}` })),
        el("p", { textContent: c.note }),
        el("p", { className: "field-hint", textContent: level.advice }),
      );
    }));
  }
  renderChosen();

  container.replaceChildren(el("div", { className: "fields" },
    name.element,
    link.element,
    type.element,
    size.element,
    keywords.element,
    values.element,
  ));

  return {
    /** Everything this form edits, merged over what it was given. */
    collect: () => ({
      ...basics,
      communityName: name.value(),
      communityLink: link.value(),
      communityType: type.value(),
      communitySize: size.value(),
      communityKeywords: keywords.value(),
      values: values.value(),
    }),
    focusFirst: () => name.focus(),
  };
}
