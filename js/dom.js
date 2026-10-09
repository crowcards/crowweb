// Small helpers for building the editor's forms in code.

/**
 * Make an element: el("p", { className: "field-hint", textContent: "…" }, child, …).
 * Props are set as properties; children (nodes or strings) are appended.
 */
export function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children.filter((c) => c != null && c !== false));
  return e;
}

/**
 * A small pixel "i" that shows a hint in a bubble (make.css .info-tip; the
 * bubble is the shared .choice-tip): on hover or keyboard focus, and on a tap
 * (it stays until tapped again, for touch screens). The bubble's id can be
 * given, so a field can point to it (aria-describedby).
 */
export function infoTip(text, id = uid("tip")) {
  const bubble = el("span", { className: "choice-tip", id, role: "tooltip", textContent: text });
  const b = el("button", { type: "button", className: "info-tip" }, el("span", { className: "info-tip-i", textContent: "i" }), bubble);
  b.setAttribute("aria-label", "More about this");
  b.setAttribute("aria-describedby", id);
  b.setAttribute("aria-expanded", "false");
  b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true")));
  b.addEventListener("blur", () => b.setAttribute("aria-expanded", "false"));
  return b;
}

/** A button that runs onClick: button("Done", "button button-small", () => …). */
export function button(label, className, onClick) {
  const b = el("button", { type: "button", className, textContent: label });
  b.addEventListener("click", onClick);
  return b;
}

let n = 0;

/** A page-unique id for linking labels and hints to their inputs. */
export const uid = (prefix = "f") => `${prefix}-${++n}`;

/** A small lime chip, e.g. "Suggested" (styled by .chip in make.css); quiet: the softer one ("Also fits"). */
export const chip = (label, { quiet = false } = {}) => el("span", { className: quiet ? "chip chip-quiet" : "chip", textContent: label });

/**
 * Text with a little formatting, for sentences built in code:
 *   [[Suggested]]  → the lime chip it mentions (so text matches the chips)
 *   [[~Also fits]] → the quiet chip
 *   *Trust*        → italics (e.g. a value's name)
 * richText("Because you value *Trust*: …") → nodes to append.
 */
export function richText(text) {
  return text.split(/(\[\[.+?\]\]|\*[^*]+\*)/).filter((p) => p !== "").map((part) =>
    part.startsWith("[[~") ? chip(part.slice(3, -2), { quiet: true })
      : part.startsWith("[[") ? chip(part.slice(2, -2))
      : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? el("em", { textContent: part.slice(1, -1) })
        : part);
}

/** The one narrow-screen breakpoint, read from --narrow in styles.css so it's defined in a single place. */
export const narrowWidth = () => getComputedStyle(document.documentElement).getPropertyValue("--narrow").trim() || "64rem";
