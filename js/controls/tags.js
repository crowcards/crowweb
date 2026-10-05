// Tags: small mono chips, each with an × to remove it.
//
// tagList — just the chips, for showing a set of things (e.g. chosen values):
//   const list = tagList({ ariaLabel: "Chosen values", onRemove: (id) => … });
//   list.render([{ id, label }]);
// Without onRemove the chips are just for showing (no ×).
//
// tagInput — a labelled box where typing a word and pressing Enter, Tab or a
// comma adds it as a tag (keywords, server lists, protocols):
//   const kw = tagInput({ label: "Keywords", hint, values: ["seeds"], onCommit });
//   kw.value()   → the list of tags
// Optional normalize(text) tidies each new tag (e.g. a pasted URL → its domain)
// and can return "" to reject it.

import { el, uid } from "../dom.js";

export function tagList({ ariaLabel, onRemove } = {}) {
  const element = el("ul", { className: "tags plain-list" });
  if (ariaLabel) element.setAttribute("aria-label", ariaLabel);

  function render(items) {
    element.replaceChildren(...items.map(({ id, label }) => {
      if (!onRemove) return el("li", { className: "tag" }, el("span", { textContent: label }));
      const remove = el("button", { type: "button", className: "tag-remove" }, el("span"));   // the pixel X
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", () => onRemove(id));
      return el("li", { className: "tag" }, el("span", { textContent: label }), remove);
    }));
  }

  return { element, render };
}

export function tagInput({ label, hint, values = [], maxLength = 40, placeholder = "", normalize = (t) => t, onCommit = () => {} } = {}) {
  const tags = [...values];
  const id = uid("tags");
  const hintEl = hint ? el("p", { className: "field-hint", id: `${id}-hint`, textContent: hint }) : null;
  const input = el("input", { type: "text", id, autocomplete: "off", maxLength, placeholder });
  if (hintEl) input.setAttribute("aria-describedby", hintEl.id);

  const list = tagList({
    ariaLabel: label,
    onRemove: (tag) => {
      tags.splice(tags.indexOf(tag), 1);
      render();
      input.focus();
      onCommit();
    },
  });
  const render = () => list.render(tags.map((t) => ({ id: t, label: t })));

  // tidy what was typed; ignore blanks and repeats (in any capitalisation)
  function add() {
    const t = normalize(input.value.replace(/,/g, " ").replace(/\s+/g, " ").trim()).slice(0, maxLength);
    input.value = "";
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) return false;
    tags.push(t);
    render();
    return true;
  }

  input.addEventListener("keydown", (e) => {
    // Enter, comma, or Tab (when something's typed) adds the tag; an empty
    // box lets Tab move on to the next field as usual
    if (e.key === "Enter" || e.key === "," || (e.key === "Tab" && !e.shiftKey && input.value.trim())) {
      e.preventDefault();
      if (add()) onCommit();
    } else if (e.key === "Backspace" && !input.value && tags.length) {
      tags.pop();
      render();
      onCommit();
    }
  });
  input.addEventListener("blur", () => {
    if (add()) onCommit();   // don't lose a half-typed one
  });
  render();

  const element = el("div", { className: "field" },
    el("label", { className: "mono-u", htmlFor: id, textContent: label }),
    hintEl,
    list.element,
    input,
  );

  return { element, value: () => [...tags] };
}
