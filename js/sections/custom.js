// A custom module's page: one the community added for something the built-in
// modules don't cover. It has a name, a description, and any number of
// fields, each a label with a written answer.
//
//   const form = renderCustomModule(container, module, { onInput, onCommit, onDelete });
//   form.collect()   → the module, as stored in card.customModules
//
// Field `type` is always "text" for now; the schema leaves room for more.

import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderRows } from "../controls/rows.js";

/** A new custom module, ready to add to card.customModules. */
export function newCustomModule({ name, description = null }) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => chars[b % chars.length]).join("");
  return { id: `cm_${random}`, name, description, fields: [] };
}

export function renderCustomModule(container, module, { onInput = () => {}, onCommit = () => {}, onDelete = () => {} } = {}) {
  const name = textField({ label: "Module name", value: module.name, onInput, onCommit });
  const description = textField({
    label: "What this module covers",
    multiline: true,
    value: module.description,
    onInput,
    onCommit,
  });

  const fields = renderRows({
    legend: "Fields",
    hint: "Each field is a question or heading with your community’s answer.",
    items: module.fields || [],
    addLabel: "Add a field",
    emptyText: "No fields yet.",
    reorderable: true,
    newItem: () => ({ label: "", type: "text", value: "" }),
    itemName: (f) => (f.label ? `“${f.label}”` : "this field"),
    renderRow: (f, hooks) => {
      const label = textField({ label: "Field", value: f.label, ...hooks });
      const answer = textField({ label: "Answer", multiline: true, value: f.value, ...hooks });
      return {
        element: el("div", {}, label.element, answer.element),
        collect: () => ({ ...f, label: label.value() || "", type: f.type || "text", value: answer.value() || "" }),
        focus: () => label.focus(),
      };
    },
    onInput,
    onCommit,
  });

  const remove = el("button", { type: "button", className: "link-button link-button-danger", textContent: "Delete this module" });
  remove.addEventListener("click", () => onDelete());

  container.replaceChildren(el("div", { className: "fields" },
    name.element,
    description.element,
    fields.element,
    el("p", { className: "field-hint" }, "Deleting removes this module and everything in it. To hide it instead, untick it under Basics → Modules. "),
    el("p", {}, remove),
  ));

  return {
    collect: () => ({
      ...module,
      name: name.value() || "Untitled module",
      description: description.value(),
      fields: fields.value(),
    }),
    focusFirst: () => name.focus(),
  };
}
