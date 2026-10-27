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
 * given, so a field can point to it (aria-describedby). note: the pixel
 * asterisk badge instead (.note-mark, as on the editor's tags), its bubble
 * beside it (the badge's stepped corners would clip one inside it), for a
 * note on the card; the content can then be nodes.
 */
export function infoTip(text, id = uid("tip"), { note = false } = {}) {
  const bubble = el("span", { className: "choice-tip", id, role: "tooltip" }, ...[].concat(text));
  const b = el("button", { type: "button", className: note ? "note-mark" : "info-tip" }, ...(note ? [] : [el("span", { className: "info-tip-i", textContent: "i" }), bubble]));
  b.setAttribute("aria-label", note ? "Note" : "More about this");
  b.setAttribute("aria-describedby", id);
  b.setAttribute("aria-expanded", "false");
  b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true")));
  b.addEventListener("blur", () => b.setAttribute("aria-expanded", "false"));
  return note ? el("span", { className: "note-tip" }, b, bubble) : b;
}

/** A pixel icon from the sprite (img/icons.svg), in the text color: decorative, unless it has a label. */
export function pixelIcon(name, { className = "px-icon", label = null } = {}) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", `/img/icons.svg#${name}`);
  svg.setAttribute("class", className);
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

/**
 * Cut a box's text to three lines (.is-cut, styles.css), with the pixel "…"
 * button (.more-dots) after it to show the rest; label says what it shows,
 * e.g. "Read the whole description". Printed, the text is whole.
 */
export function cutWithMore(box, label) {
  box.classList.add("is-cut");
  const more = button("", "more-dots", () => {
    const open = more.getAttribute("aria-expanded") !== "true";
    box.classList.toggle("is-cut", !open);
    more.setAttribute("aria-expanded", String(open));
    more.setAttribute("aria-label", open ? "Show less" : label);
  });
  more.append(el("span"), el("span"), el("span"));   // three pixel dots
  more.setAttribute("aria-expanded", "false");
  more.setAttribute("aria-label", label);
  box.append(more);
  return box;
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

/** A small lime chip, e.g. "Suggested" (styled by .chip in make.css); quiet: the softer one ("See also"). */
export const chip = (label, { quiet = false } = {}) => el("span", { className: quiet ? "chip chip-quiet" : "chip", textContent: label });

/**
 * Text with a little formatting, for sentences built in code:
 *   [[Suggested]]  → the lime chip it mentions (so text matches the chips)
 *   [[~See also]] → the quiet chip
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
