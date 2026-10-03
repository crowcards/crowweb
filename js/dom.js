// Small helpers for building the editor's forms in code.

/**
 * Make an element: el("p", { className: "hint", textContent: "…" }, child, …).
 * Props are set as properties; children (nodes or strings) are appended.
 */
export function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c != null && c !== false));
  return e;
}

let n = 0;

/** A page-unique id for linking labels and hints to their inputs. */
export const uid = (prefix = "f") => `${prefix}-${++n}`;
