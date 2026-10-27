// A custom module's page: one the community added for something the built-in
// modules don't cover. Its name and description are the page's title and
// lede, edited in place ("Edit" beside each). Then any number of fields,
// each a question with the community's answer, of one of a few kinds:
//   text      — a written answer                      value: "…"
//   checkbox  — options to tick, any number           value: ["option", …]
//   radio     — options to pick one from              value: "option" | null
//   scale     — 1–5, 1–7 or 0–10, with what each end means   value: a number | null, min, max, low, high
//               (min / max: the range; a field without them is 1–5)
// Each field has an id ("f_…"). A field folds into a one-line summary once
// it's done (✓), and fields can be put in order.
//
//   const form = renderCustomModule(container, module, { head, onInput, onCommit, onDelete, setAside });
//   form.collect()   → the module, as stored in card.customModules
//   form.setAside()  → what switching a field's kind set aside (js/set-aside.js)
//
// head: { title, titleTools, description, descriptionTools } — the page's
// title and lede, and the slots beside them for the edit buttons.

import { el, button } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderChoices, scaleField } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { tagInput } from "../controls/tags.js";
import { editInPlace } from "../controls/inline-edit.js";
import { reveal } from "../reveal.js";
import { asideOf } from "../set-aside.js";

const FIELD_TYPES = [
  { id: "text", label: "Text" },
  { id: "checkbox", label: "Checkboxes" },
  { id: "radio", label: "Radio buttons" },
  { id: "scale", label: "Scale" },
];
/** The ranges a scale field can have (1–5 unless chosen otherwise). */
const RANGES = [
  { id: "1-5", min: 1, max: 5, label: "1–5" },
  { id: "1-7", min: 1, max: 7, label: "1–7" },
  { id: "0-10", min: 0, max: 10, label: "0–10" },
];
/** A scale field's range (also used by Export). */
export const scaleRange = (f) => RANGES.find((r) => r.min === (f.min ?? 1) && r.max === (f.max ?? 5)) || RANGES[0];
/** What a kind's answer is remembered under: the kind, and for a scale its range (each range keeps its own answer). */
const answerKey = (type, f) => (type === "scale" ? `scale:${scaleRange(f).id}` : type);

/** A random id with this prefix, e.g. "cm_aB7xK9mP" (a module) or "f_…" (a field). */
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const randomId = (prefix) => `${prefix}_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CHARS[b % CHARS.length]).join("")}`;

/** A new custom module, ready to add to card.customModules. */
export function newCustomModule({ name, description = null }) {
  return { id: randomId("cm"), name, description, fields: [] };
}

/** A field's answer in a few words, for its folded summary line. */
export function answerText(f) {
  if (f.type === "checkbox") return (f.value || []).join(", ");
  if (f.type === "scale") return f.value != null ? `${f.value} of ${scaleRange(f).max}` : "";   // (0 is an answer)
  return f.value || "";
}

const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
const ATTRS = ["options", "low", "high", "min", "max"];   // what kinds share or keep beside the answer

/**
 * One field's inputs: its question, its kind, and the answer (which changes
 * with the kind). Switching kinds keeps each kind's own answer, and the
 * options and scale ends; what the current kind doesn't save is set aside
 * under the field's id ({ options?, low?, high?, answers: { kind: value } }),
 * and comes back if the kind is switched back.
 */
function fieldRow(saved, hooks, setAside) {
  const id = saved.id || randomId("f");   // (a field from before fields had ids gets one now)
  const asideKey = `fields:${id}`;
  const kept = setAside.get(asideKey) || {};
  let type = saved.type || "text";
  // options, scale range and ends: as saved, else as set aside
  const attrs = Object.fromEntries(ATTRS.map((k) => [k, saved[k] ?? kept[k]]).filter(([, v]) => v != null));
  // each kind's answer (a scale's, per range); the saved one is its kind's
  const answers = { ...kept.answers, [answerKey(type, attrs)]: saved.value };
  let f = { label: saved.label, ...attrs, value: answers[answerKey(type, attrs)] };   // what the current kind's answer is drawn from
  const question = textField({ label: "Question", value: f.label, ...hooks });
  const kind = selectField({
    label: "Kind of answer",
    options: FIELD_TYPES,
    value: type,
    placeholder: "Choose a kind… (text if none)",
    // the new kind's answer cascades in: its own earlier answer (if any),
    // with the options and scale ends as they are now
    onChange: (v) => {
      const { value, ...now } = answer.collect();
      Object.assign(attrs, now);
      answers[answerKey(type, attrs)] = value;
      type = v || "text";
      f = { ...f, ...attrs, value: answers[answerKey(type, attrs)] };
      drawAnswer();
      reveal(area);
      hooks.onCommit();
    },
  });
  const area = el("div");
  let answer;   // { element, collect } for the current kind

  // options to tick or pick from: typed in, then the answer drawn from them
  function choicesAnswer(multiple) {
    let options = f.options || [];
    let value = multiple ? (Array.isArray(f.value) ? f.value : []) : (typeof f.value === "string" ? f.value : null);
    const box = el("div");
    const list = tagInput({
      label: "Options",
      hint: "Type each option and press Enter.",
      values: options,
      maxLength: 120,
      onCommit: () => { options = list.value(); drawChoices(); hooks.onCommit(); },
    });
    let choices;
    function drawChoices() {
      value = multiple ? (choices ? choices.value() : value).filter((v) => options.includes(v)) : (choices ? choices.value() : value);
      if (!multiple && !options.includes(value)) value = null;
      choices = options.length
        ? renderChoices({
          type: multiple ? "checkbox" : "radio",
          legend: "Answer",
          options: options.map((o) => ({ id: o, label: o })),
          selected: value,
          clearable: !multiple,
          onChange: hooks.onCommit,
        })
        : null;
      box.replaceChildren(choices ? choices.element : el("p", { className: "field-hint", textContent: "Add some options, then select the answer." }));
    }
    drawChoices();
    return {
      element: el("div", {}, list.element, box),
      collect: () => ({ options, value: choices ? choices.value() : multiple ? [] : null }),
    };
  }

  // a scale: its range first (1–5, 1–7 or 0–10), then what each end means, then the answer
  function scaleAnswer() {
    const r = scaleRange(f);
    const range = scaleField({
      legend: "Scale",
      options: RANGES.map(({ id, label }) => ({ id, label })),
      value: r.id,
      layout: "buttons",
      clearable: false,
      // another range: the answer comes along if it fits; if not, it's set
      // aside (each range keeps its own), and an answer this range had before comes back
      onChange: (to) => {
        const { value, ...now } = answer.collect();
        answers[answerKey("scale", now)] = value;
        const next = RANGES.find((x) => x.id === to);
        Object.assign(attrs, now, { min: next.min, max: next.max });
        const fits = value != null && value >= next.min && value <= next.max;
        f = { ...f, ...attrs, value: answers[answerKey("scale", attrs)] ?? (fits ? value : null) };
        drawAnswer();
        hooks.onCommit();
      },
    });
    const low = textField({ label: `${r.min} means`, value: f.low, placeholder: "e.g. Never", ...hooks });
    const high = textField({ label: `${r.max} means`, value: f.high, placeholder: "e.g. Always", ...hooks });
    const steps = Array.from({ length: r.max - r.min + 1 }, (_, i) => String(r.min + i)).map((n) => ({ id: n, label: n }));
    const choice = scaleField({ legend: "Answer", options: steps, value: f.value == null ? null : String(f.value), onChange: hooks.onCommit });
    return {
      element: el("div", {}, range.element, low.element, high.element, choice.element),
      collect: () => ({ min: r.min, max: r.max, low: low.value(), high: high.value(), value: choice.value() == null ? null : Number(choice.value()) }),
    };
  }

  function drawAnswer() {
    if (type === "text") {
      const t = textField({ label: "Answer", multiline: true, value: typeof f.value === "string" ? f.value : "", ...hooks });
      answer = { element: t.element, collect: () => ({ value: t.value() || "" }) };
    } else if (type === "scale") answer = scaleAnswer();
    else answer = choicesAnswer(type === "checkbox");
    area.replaceChildren(answer.element);
  }
  drawAnswer();

  return {
    element: el("div", {}, question.element, kind.element, area),
    collect: () => ({ id, label: question.value() || "", type, ...answer.collect() }),
    focus: () => question.focus(),
    // set aside: what this kind doesn't save (options, scale ends), and the other kinds' answers
    setAside: () => {
      const now = answer.collect();
      const others = Object.fromEntries(Object.entries(answers).filter(([k, v]) => k !== type && !isEmpty(v)));
      return { [asideKey]: {
        ...Object.fromEntries(ATTRS.filter((k) => !(k in now) && !isEmpty(attrs[k])).map((k) => [k, attrs[k]])),
        ...(Object.keys(others).length ? { answers: others } : {}),
      } };
    },
  };
}

export function renderCustomModule(container, module, { head, onInput = () => {}, onCommit = () => {}, onDelete = () => {}, setAside = asideOf() } = {}) {
  const name = textField({ label: "Module name", value: module.name, onInput, onCommit });
  const description = textField({
    label: "What this module covers",
    multiline: true,
    value: module.description,
    onInput,
    onCommit,
  });
  // edited in place beside the page's title and lede (or, without a page
  // head, e.g. in tests, at the top of the form)
  if (head) {
    editInPlace({ display: head.title, slot: head.titleTools, field: name, label: "module name" });
    editInPlace({ display: head.description, slot: head.descriptionTools, field: description, label: "description" });
  }

  const fields = renderRows({
    legend: "Fields",
    hint: "Each field is a question with your community’s answer: written, selected, picked, or on a scale.",
    items: module.fields || [],
    addLabel: "Add a field",
    emptyText: "No fields yet.",
    reorderable: true,
    newItem: () => ({ id: randomId("f"), label: "", type: "text", value: "" }),
    itemName: (f) => (f.label ? `“${f.label}”` : "this field"),
    // folded: "Where we meet: Library"
    summarize: (f) => (f.label ? `${f.label}${answerText(f) ? `: ${answerText(f)}` : ""}` : ""),
    renderRow: (f, rowHooks) => fieldRow(f, rowHooks, setAside),
    onInput,
    onCommit,
  });

  const remove = button("Delete this module", "link-button link-button-danger", () => onDelete());

  container.replaceChildren(el("div", { className: "fields" },
    head ? null : name.element,
    head ? null : description.element,
    fields.element,
    el("hr", { className: "pixel-divider" }),
    el("p", { className: "field-hint" }, "Deleting removes this module and everything in it. To hide it instead, unselect it under Basics → Modules. "),
    el("p", {}, remove),
  ));

  return {
    collect: () => ({
      ...module,
      name: name.value() || "Untitled module",
      description: description.value(),
      fields: fields.value(),
    }),
    setAside: () => fields.setAside(),   // (a deleted field's go with it)
    focusFirst: () => fields.element.querySelector("input, textarea")?.focus(),
  };
}
