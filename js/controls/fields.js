// Labelled form fields: textField (one line, or several for notes) and
// selectField (a dropdown).
//
//   const name = textField({ label: "Community name", value, onInput, onCommit });
//   container.append(name.element);
//   name.value()   → the trimmed text, or null if empty (matching the empty card)
//
// onInput fires while typing (schedule a save); onCommit when the field is
// left (save now). Other options: hint, type ("text" | "url"), placeholder.

import { el, uid } from "../dom.js";

export function textField({
  label,
  hint,
  value = "",
  type = "text",
  multiline = false,
  placeholder = "",
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const id = uid("field");
  const hintEl = hint ? el("p", { className: "field-hint", id: `${id}-hint`, textContent: hint }) : null;
  const input = multiline
    ? el("textarea", { id, rows: 4 })
    : el("input", { id, type, autocomplete: "off" });
  input.value = value || "";
  if (placeholder) input.placeholder = placeholder;
  if (hintEl) input.setAttribute("aria-describedby", hintEl.id);
  input.addEventListener("input", () => onInput());
  input.addEventListener("change", () => onCommit());

  const element = el("div", { className: "field" },
    el("label", { className: "mono-u", htmlFor: id, textContent: label }),
    hintEl,
    input,
  );

  return {
    element,
    input,
    value: () => input.value.trim() || null,
    focus: () => input.focus(),
  };
}

/**
 * A labelled dropdown.
 *
 *   const type = selectField({ label: "Community type", options: [{ id, label }],
 *                              value, placeholder: "Choose a type…", onChange });
 *   type.value()        → the chosen id, or null
 *   type.setHint(text)  → change the hint under the label
 */
export function selectField({ label, hint = "", options, value = null, placeholder = "Choose…", onChange = () => {} } = {}) {
  const id = uid("select");
  const hintEl = el("p", { className: "field-hint", id: `${id}-hint`, textContent: hint, hidden: !hint });
  const select = el("select", { id },
    el("option", { value: "", textContent: placeholder }),
    ...options.map((o) => el("option", { value: o.id, textContent: o.label })),
  );
  select.value = value || "";
  select.setAttribute("aria-describedby", hintEl.id);
  select.addEventListener("change", () => onChange(select.value || null));

  const element = el("div", { className: "field" },
    el("label", { className: "mono-u", htmlFor: id, textContent: label }),
    hintEl,
    select,
  );

  return {
    element,
    value: () => select.value || null,
    setHint: (text) => { hintEl.textContent = text; hintEl.hidden = !text; },
  };
}
