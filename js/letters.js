// Letter-by-letter hover: wraps each letter of an element in span.letter so
// CSS can light them up one at a time (styles.css .letter). Screen readers
// get the plain text via aria-label. Used by site.js for page titles and
// headers, and by fold.js for section headings drawn later.

export function wrapLetters(el) {
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());

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
  return el;
}
