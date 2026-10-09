// The Basics form: who the community is. Used in two places: the set-up page
// right after a card is made, and the Basics module in the editor.
//
//   const data = await loadBasicsData();
//   const form = renderBasics(container, card.basics, data, { onInput, onCommit, onTypeChange });
//   form.collect()   → the basics object to save
//   form.focusFirst()
//   form.groups      → [element]: about, target scales, values (set-up shows them as blocks)
//   missingBasics(basics, data) → what's still needed: [{ group, text: "a community name" }, …]
//
// onInput fires while typing (schedule a save); onCommit fires when a field
// is left or a choice is made (save now); onTypeChange(from, to) fires when
// the community type changes (so the module picker can re-suggest).

import { loadData, loadValues } from "../data.js";
import { el, chip } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderChoices, scaleField, suggestedFirst } from "../controls/choices.js";
import { tagList, tagInput } from "../controls/tags.js";
import { valueSuggestions, alike } from "../recommend.js";
import { alikeStrip } from "../controls/alike.js";
import { MODES } from "../view-modes.js";

/**
 * The community's description, in two parts (basics.description): what each
 * is called and asks (field: its part in view-modes.js FIELDS). Optional.
 * Also used by Export, the card and the Basics summary.
 */
export const DESCRIPTION = [
  { id: "purpose", field: "describePurpose", label: "Purpose", hint: "What it’s for, who it’s for, and what happens in the online space." },
  { id: "culture", field: "describeCulture", label: "Culture", hint: "The kind of culture and vibe you want to foster." },
];

/** The most values a card can select. */
const MAX_VALUES = 5;

/** The reference data the form is built from. */
export async function loadBasicsData() {
  const [types, enums, values, conflicts, scales] = await Promise.all([
    loadData("community_types"),
    loadData("enums"),
    loadValues(),
    loadData("value_conflicts"),
    loadData("governance_scales"),
  ]);
  return {
    types: types.items,
    sizes: enums.communitySize,
    values: values.items,          // with each one's group and cues (value_groups.json)
    valueGroups: values.groups,
    valuesAll: values.all,
    // only pairs a person has checked are shown to card makers
    conflicts: conflicts.items.filter((c) => c.status === "accepted"),
    scales,   // the three governance scales (governance_scales.json): targets, and the values they suggest
  };
}

/**
 * The required answers that are missing, each with the group it's in (the
 * form's `groups`: 0 about, 1 target scales, 2 values): [{ group, text }].
 */
export function missingBasics(basics = {}, data) {
  const targets = basics.targetScales || {};
  const values = basics.values || [];
  return [
    !basics.name?.trim() && { group: 0, text: "a community name" },
    ...data.scales.scales.filter((sc) => targets[sc.id] == null).map((sc) => ({ group: 1, text: `where you’d like to be on ${sc.label}` })),
    !values.length && { group: 2, text: "at least one value" },
    values.length > MAX_VALUES && { group: 2, text: `no more than ${MAX_VALUES} values` },
  ].filter(Boolean);
}

/**
 * One target scale: "Where would you like your community to be on …?", 1–7
 * with what each number means in its bubble, and the trade-offs of each end
 * in a note under it. → { element, field } (field.value(): "1"…"7" or null).
 */
export function targetScale(sc, range, value, onChange = () => {}) {
  const steps = sc.levels.map((text, i) => ({ id: String(range.min + i), label: String(range.min + i), description: `${range.min + i}: ${text}` }));
  const field = scaleField({
    legend: `Where would you like your community to be on ${sc.label}?`,
    hint: sc.description,
    options: steps,
    value: value == null ? null : String(value),
    range: true,
    clearable: false,
    onChange: (v) => onChange(Number(v)),
  });
  // the trade-offs of each end: what you gain (+) and what it costs (−)
  const end = (n, label, e) => el("div", { className: "trade-offs-end" },
    el("p", { textContent: `${n}: ${label}` }),
    el("ul", {}, ...e.pros.map((t) => el("li", { className: "gain", textContent: t })), ...e.cons.map((t) => el("li", { className: "cost", textContent: t }))));
  const tradeOffs = el("div", { className: "callout trade-offs" },
    el("p", { className: "mono-u summary-label", textContent: "Trade-offs" }),
    el("div", { className: "trade-offs-ends mono-u" }, end(range.min, sc.ends.low.title || sc.levels[0], sc.ends.low), end(range.max, sc.ends.high.title || sc.levels.at(-1), sc.ends.high)));
  return { element: el("div", { className: "target-scale" }, field.element, tradeOffs), field };
}

/** "a, b and c" */
export const listText = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);


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
  const name = textField({ label: "Community name", value: basics.name, onInput, onCommit });
  const link = textField({
    label: "Community link",
    hint: "Where people find your community online, e.g. its website or server.",
    type: "url",
    placeholder: "https://",
    value: basics.link,
    onInput,
    onCommit,
  });

  // ── community type: its hint describes the chosen type ────
  const typeHint = (id) => data.types.find((t) => t.id === id)?.description
    || "What kind of space is it? This also suggests which modules your card covers.";
  let lastType = basics.type || null;
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
    layout: "buttons",   // a row of buttons; each size's description shows on hover
    options: data.sizes,
    selected: basics.size || null,
    clearable: true,
    onChange: onCommit,
  });

  // ── the description, in two parts: before keywords and values ──
  // (on leaving a box, the values list follows: the description suggests values)
  const description = DESCRIPTION.map((d) => ({ id: d.id, field: textField({ label: d.label, hint: d.hint, multiline: true, value: basics.description?.[d.id], onInput,
    onCommit: () => { onCommit(); if (JSON.stringify(descriptionNow()) !== drawnFor) drawValues(); } }) }));
  const descriptionNow = () => Object.fromEntries(description.map((d) => [d.id, d.field.value()]));
  const describe = el("div", { className: "fields" },
    el("p", { className: "field-hint", textContent: "Describe your community. These are optional, but helpful for people to understand what your community is." }),
    ...description.map((d) => d.field.element));

  // ── keywords ──────────────────────────────────────────────
  const keywords = tagInput({
    label: "Keywords",
    hint: "A few words people might search for, e.g. “gardening”, “open science”. Press Enter or Tab after each one.",
    values: basics.keywords || [],
    onCommit,
  });

  // ── target scales: where they'd like to be, 1–7 (aims; public only in Full) ──
  const targetsNow = { ...basics.targetScales };
  const targets = data.scales.scales.map((sc) => ({ id: sc.id, ...targetScale(sc, data.scales.range, targetsNow[sc.id], (n) => {
    targetsNow[sc.id] = n;
    drawValues();   // what's suggested follows the targets
    onCommit();
  }) }));
  const targetValue = () => Object.fromEntries(targets.map((t) => [t.id, t.field.value() == null ? null : Number(t.field.value())]));

  // ── values: up to 5; pairs in tension get a note ──────────
  const valueById = new Map(data.values.map((v) => [v.id, v]));
  // chosen values as tags above the list, each with an ×, so a value can be
  // unselected without scrolling the list to find it
  const chosen = tagList({
    ariaLabel: "Chosen values",
    onRemove: (id) => {
      values.setOne(id, false);
      changed();
    },
  });
  // "More like this / Try something new" for the value selected last, also
  // from the strip itself (at 5, still shown, to help revise, but nothing can be added)
  const strip = alikeStrip({
    labelOf: (id) => valueById.get(id).label,
    onAdd: (id) => {
      values.setOne(id, true);
      alikeOf = id;
      changed();
    },
  });
  const conflictNotes = el("div", { className: "conflict-notes" });
  conflictNotes.setAttribute("aria-live", "polite");

  // the list is redrawn when the targets or the description change:
  // Suggested values first, then Also fits, then the rest A–Z
  let values = null;
  let valueGroup = "all";
  let drawnFor = null;   // (the description the list was last drawn for)
  const valuesHost = el("div");
  function drawValues() {
    drawnFor = JSON.stringify(descriptionNow());
    const badge = valueSuggestions(data.scales, data.values, { targetScales: targetsNow, description: descriptionNow() });
    const anySuggested = data.values.some((v) => badge(v));
    values = renderChoices({
      legend: "Values",
      hint: `What your community cares about. Select up to ${MAX_VALUES}.${anySuggested ? " Suggested ones come from your description and where you’d like to be on the scales." : ""}`,
      options: anySuggested ? suggestedFirst(data.values, badge) : data.values,
      selected: values ? values.value() : basics.values || [],
      layout: "compact",
      filterable: true,
      listClass: "scroll-list",
      max: MAX_VALUES,
      badge,
      // the groups (value_groups.json) as buttons; the one chosen kept when the list is redrawn
      groups: { items: data.valueGroups, all: data.valuesAll, of: (v) => v.group, selected: valueGroup, onChange: (g) => { valueGroup = g; } },
      details: (v) => [
        el("p", { textContent: v.description }),
        v.signals ? el("p", { className: "field-hint" }, el("em", { textContent: "Example of inconsistency: " }), v.signals) : null,
      ],
      before: [chosen.element, strip.element, conflictNotes],
      onChange: (ids) => {
        alikeOf = ids.find((id) => !shownValues.includes(id)) ?? alikeOf;
        changed();
      },
    });
    valuesHost.replaceChildren(values.element);
  }
  let alikeOf = null;
  drawValues();

  function changed() {
    renderChosen();
    onCommit();
  }

  let shownValues = basics.values || [];   // (what was selected before the latest change)
  function renderChosen() {
    shownValues = values.value();
    const on = new Set(values.value());
    if (alikeOf && on.has(alikeOf)) {
      strip.show(valueById.get(alikeOf).label, alike(data.scales, "values", alikeOf, data.values.map((v) => v.id), [...on]),
        { full: on.size >= MAX_VALUES ? `You have ${MAX_VALUES} values. Unselect one to add another.` : null });
    } else strip.hide();
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

  // three groups, in order (set-up shows them as blocks, one after another;
  // missingBasics says what each still needs)
  const groups = [
    el("div", { className: "fields" }, name.element, type.element, size.element, link.element, describe, keywords.element),
    el("div", { className: "fields" },
      el("h2", { textContent: "Where you’d like to be" }),
      el("p", { textContent: "Three scales describe how a community is run. There’s no right answer: each end suits some communities. Your answers suggest values below, and later, approaches to try. They’re only shown publicly if you share your full card." }),
      ...targets.map((t) => t.element)),
    el("div", { className: "fields" }, valuesHost),
  ];
  container.replaceChildren(...groups);

  return {
    /** Everything this form edits, merged over what it was given. */
    collect: () => ({
      ...basics,
      name: name.value(),
      link: link.value(),
      type: type.value(),
      size: size.value(),
      description: descriptionNow(),
      keywords: keywords.value(),
      targetScales: targetValue(),
      values: values.value(),
    }),
    focusFirst: () => name.focus(),
    groups,
  };
}

/**
 * Basics as a summary: what was filled in, at a glance, plus what to do
 * next — the card's other modules in order, each marked once started.
 * entries: [{ id, label }] (the card's modules, in order); started(id) → bool.
 */
export function renderBasicsSummary(container, basics = {}, data, { entries = [], started = () => false, forkedFrom = null } = {}) {
  const missing = missingBasics(basics, data).map((m) => m.text);
  const targets = basics.targetScales || {};
  const label = (list, id) => list.find((x) => x.id === id)?.label;
  const chips = (items, ariaLabel) => {
    const list = tagList({ ariaLabel });
    list.render(items);
    return list.element;
  };
  const none = () => el("span", { className: "field-hint", textContent: "Not answered yet" });
  const size = data.sizes.find((s) => s.id === basics.size);
  const values = data.values.filter((v) => (basics.values || []).includes(v.id));

  const rows = [
    ["Community", basics.name ? el("b", { textContent: basics.name }) : none()],
    ["Type", label(data.types, basics.type) || none()],
    ["Size", size ? `${size.label} (${size.description.charAt(0).toLowerCase()}${size.description.slice(1)})` : none()],
    ["Link", basics.link ? el("a", { className: "inline", href: basics.link, target: "_blank", rel: "noopener", textContent: basics.link }) : none()],
    ...DESCRIPTION.map((d) => [d.label, basics.description?.[d.id] ? el("span", { textContent: basics.description[d.id] }) : none()]),
    ["Keywords", basics.keywords?.length ? chips(basics.keywords.map((k) => ({ id: k, label: k })), "Keywords") : none()],
    ["Where you’d like to be", data.scales.scales.some((sc) => targets[sc.id] != null)
      ? data.scales.scales.map((sc) => `${sc.label} ${targets[sc.id] ?? "–"}`).join(" · ") + ` (of ${data.scales.range.max})`
      : none()],
    ["Values", values.length ? chips(values, "Values") : none()],
    // a fork: the published card it started from
    ...(forkedFrom ? [["Forked from", el("span", {}, el("a", { className: "inline", href: `/c/${forkedFrom.cardId}${forkedFrom.version ? `?v=${forkedFrom.version}` : ""}`, target: "_blank", rel: "noopener", textContent: forkedFrom.name || "another card" }),
      forkedFrom.version ? ` · v${forkedFrom.version}` : "",
      forkedFrom.mode ? ` · ${MODES.find((m) => m.id === forkedFrom.mode)?.label || forkedFrom.mode} view` : "")]] : []),
  ];

  container.replaceChildren(
    missing.length ? el("p", { className: "callout" }, el("b", { className: "mono-u", textContent: "Still needed: " }), `${listText(missing)}. Select Edit to add ${missing.length === 1 ? "it" : "them"}.`) : "",
    el("dl", { className: "summary summary-list" }, ...rows.flatMap(([term, value]) => [el("dt", { className: "mono-u summary-label", textContent: term }), el("dd", {}, value)])),
    el("div", { className: "callout" },
      el("p", {}, el("b", { className: "mono-u", textContent: "What’s next: " }), "work through your modules, one at a time, in this order."),
      el("ol", { className: "next-steps" }, ...entries.map((m) => el("li", {},
        el("a", { className: "inline", href: `#${m.id}`, textContent: m.label }),
        started(m.id) ? chip("Started") : null,
      ))),
    ),
  );
}
