// Letter-by-letter hover: wraps each letter of an element in span.letter so
// CSS can light them up one at a time (styles.css .letter). Screen readers
// get the plain text: as the aria-label of a heading, link or button (or
// something inside one), or else as a visually hidden copy, since a plain
// span's aria-label is often ignored. Used by site.js for page titles and
// headers, and by fold.js for section headings drawn later.

export function wrapLetters(el) {
  const text = el.textContent.replace(/\s+/g, " ").trim();
  const named = el.closest("a, button, h1, h2, h3, h4, h5, h6");
  if (named) el.setAttribute("aria-label", text);

  const walker = document.createTreeWalker(el, 4);   // 4 = NodeFilter.SHOW_TEXT: text only
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const frag = document.createDocumentFragment();
    for (const ch of node.textContent) {
      if (/\s/.test(ch)) {
        frag.append(ch);
      } else {
        const span = document.createElement("span");
        span.className = "letter";
        span.textContent = ch;
        span.setAttribute("aria-hidden", "true");
        frag.append(span);
      }
    }
    node.replaceWith(frag);
  }
  if (!named) el.append(Object.assign(document.createElement("span"), { className: "visually-hidden", textContent: text }));
  return el;
}
