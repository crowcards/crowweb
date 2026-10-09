// Labelled form fields: textField (one line, or several for notes) and
// selectField (a dropdown).
//
//   const name = textField({ label: "Community name", value, onInput, onCommit });
//   container.append(name.element);
//   name.value()   → the trimmed text, or null if empty (matching the empty card)
//
// onInput fires while typing (schedule a save); onCommit when the field is
// left (save now). Other options: hint, type ("text" | "url" | "email"),
// placeholder; hintTip: the hint in a small "i" beside the label instead of
// under it (dom.js infoTip), e.g. in label-beside-field rows (.field-rows).

import { el, uid, infoTip } from "../dom.js";
import { suggestField } from "./suggest.js";

export function textField({
  label,
  hint,
  value = "",
  type = "text",
  multiline = false,
  placeholder = "",
  hintTip = false,
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const id = uid("field");
  const tip = hintTip && hint ? infoTip(hint, `${id}-hint`) : null;
  const hintEl = tip ? tip.querySelector(".choice-tip") : hint ? el("p", { className: "field-hint", id: `${id}-hint`, textContent: hint }) : null;
  const input = multiline
    ? el("textarea", { id, rows: 4 })
    : el("input", { id, type, autocomplete: "off" });
  input.value = value || "";
  if (placeholder) input.placeholder = placeholder;
  if (hintEl) input.setAttribute("aria-describedby", hintEl.id);
  input.addEventListener("input", () => onInput());
  input.addEventListener("change", () => onCommit());

  const labelEl = el("label", { className: "mono-u", htmlFor: id, textContent: label });
  const element = el("div", { className: "field" },
    tip ? el("div", { className: "field-label" }, labelEl, tip) : labelEl,
    tip ? null : hintEl,
    input,
  );

  return {
    element,
    input,
    value: () => input.value.trim() || null,
    /** Fill in from code (e.g. pre-filling); doesn't fire onInput / onCommit. */
    set: (v) => { input.value = v || ""; },
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
  // the first item clears the choice; it shows as the box's placeholder
  const NONE = "__none__";
  const pick = suggestField({
    label,
    hint,
    items: [{ id: NONE, label: placeholder }, ...options.map(({ id, label }) => ({ id, label }))],
    value: value || null,
    placeholder,
    browse: true,
    onChange: (v) => {
      if (v.id === NONE || !v.id) pick.set(null);
      onChange(v.id && v.id !== NONE ? v.id : null);
    },
  });
  return {
    element: pick.element,
    value: () => (pick.value().id && pick.value().id !== NONE ? pick.value().id : null),
    /** Choose from code (e.g. pre-filling); doesn't fire onChange. */
    set: (v) => pick.set(v || null),
    setHint: pick.setHint,
    focus: pick.focus,
  };
}
