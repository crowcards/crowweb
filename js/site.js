// Shared behaviour for every page: letter-by-letter title hover and the
// narrow-screen menu.

// Wrap each letter of [data-letters] elements (and page headers) in a span
// so CSS can light them up one at a time. Screen readers get the plain text
// via aria-label.
for (const el of document.querySelectorAll("[data-letters], main h1, main h2")) {
  el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
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
}

// Letters in [data-flicker] titles now and then flash an accent colour,
// mostly the capitals (C, R, O, W). Each flash blinks on, off, on again so
// it reads as a flicker rather than a fade.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const el of document.querySelectorAll("[data-flicker]")) {
    const letters = [...el.querySelectorAll(".letter")];
    const caps = letters.filter((l) => /[A-Z]/.test(l.textContent));
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    const flicker = () => {
      // skip letters that are already lit, so overlapping flickers don't collide
      const unlit = (list) => list.filter((l) => !l.matches(".flash, .flash-lime"));
      const letter = pick(unlit(Math.random() < 0.75 ? caps : letters));
      if (letter) {
        const tone = Math.random() < 0.5 ? "flash" : "flash-lime";
        const hold = 200 + Math.random() * 450;
        letter.classList.add(tone);
        setTimeout(() => letter.classList.remove(tone), 60);
        setTimeout(() => letter.classList.add(tone), 110);
        setTimeout(() => letter.classList.remove(tone), 110 + hold);
      }
      // the next flicker often starts before this one ends, so they overlap
      setTimeout(flicker, 150 + Math.random() * 500);
    };
    setTimeout(flicker, 800);
  }
}

// Three-dot menu on narrow screens.
const header = document.querySelector(".site-header");
const toggle = header?.querySelector(".menu-toggle");

function setMenu(open) {
  toggle.setAttribute("aria-expanded", String(open));
  header.classList.toggle("is-open", open);
}

if (toggle) {
  toggle.addEventListener("click", () => {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });
  document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) setMenu(false);
  });
  matchMedia("(width >= 64rem)").addEventListener("change", () => setMenu(false));
}
