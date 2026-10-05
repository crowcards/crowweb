// A custom module's page: one the community added for something the built-in
// modules don't cover. Its name and description are the page's title and
// lede, edited in place ("Edit" beside each). Then any number of fields,
// each a question with the community's answer, of one of a few kinds:
//   text      — a written answer                      value: "…"
//   checkbox  — options to tick, any number           value: ["option", …]
//   radio     — options to pick one from              value: "option" | null
//   scale     — 1 to 5, with what each end means      value: 1–5 | null, low, high
// A field folds into a one-line summary once it's done (✓), and fields can
// be put in order.
//
//   const form = renderCustomModule(container, module, { head, onInput, onCommit, onDelete });
//   form.collect()   → the module, as stored in card.customModules
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

export const FIELD_TYPES = [
  { id: "text", label: "Text" },
  { id: "checkbox", label: "Checkboxes" },
  { id: "radio", label: "Radio buttons" },
  { id: "scale", label: "Scale (1–5)" },
];
const SCALE = [1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: String(n) }));

/** A new custom module, ready to add to card.customModules. */
export function newCustomModule({ name, description = null }) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => chars[b % chars.length]).join("");
  return { id: `cm_${random}`, name, description, fields: [] };
}

/** A field's answer in a few words, for its folded summary line. */
export function answerText(f) {
  if (f.type === "checkbox") return (f.value || []).join(", ");
  if (f.type === "scale") return f.value ? `${f.value} of 5` : "";
  return f.value || "";
}

/** One field's inputs: its question, its kind, and the answer (which changes with the kind). */
function fieldRow(f, hooks) {
  let type = f.type || "text";
  const question = textField({ label: "Question", value: f.label, ...hooks });
  const kind = selectField({
    label: "Kind of answer",
    options: FIELD_TYPES,
    value: type,
    placeholder: "Choose a kind… (text if none)",
    onChange: (v) => { type = v || "text"; drawAnswer(); reveal(area); hooks.onCommit(); },   // the new kind's answer cascades in
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

  function scaleAnswer() {
    const low = textField({ label: "1 means", value: f.low, placeholder: "e.g. Never", ...hooks });
    const high = textField({ label: "5 means", value: f.high, placeholder: "e.g. Always", ...hooks });
    const choice = scaleField({ legend: "Answer", options: SCALE, value: f.value == null ? null : String(f.value), onChange: hooks.onCommit });
    return {
      element: el("div", {}, low.element, high.element, choice.element),
      collect: () => ({ low: low.value(), high: high.value(), value: choice.value() == null ? null : Number(choice.value()) }),
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
    collect: () => ({ label: question.value() || "", type, ...answer.collect() }),
    focus: () => question.focus(),
  };
}

export function renderCustomModule(container, module, { head, onInput = () => {}, onCommit = () => {}, onDelete = () => {} } = {}) {
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
    newItem: () => ({ label: "", type: "text", value: "" }),
    itemName: (f) => (f.label ? `“${f.label}”` : "this field"),
    // folded: "Where we meet: Library"
    summarize: (f) => (f.label ? `${f.label}${answerText(f) ? `: ${answerText(f)}` : ""}` : ""),
    renderRow: fieldRow,
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
    focusFirst: () => fields.element.querySelector("input, textarea")?.focus(),
  };
}
