// Shared behaviour for every page: letter-by-letter title hover and the
// narrow-screen menu.

import { wrapLetters } from "./letters.js";
import { narrowWidth } from "./dom.js";

// Wrap each letter of [data-letters] elements (and page headers) in a span
// so CSS can light them up one at a time (js/letters.js).
for (const el of document.querySelectorAll("[data-letters], main h1, main h2")) wrapLetters(el);

// Hovered letters light up orange or lime, picked at random each time.
document.addEventListener("pointerover", (e) => {
  const letter = e.target.closest?.(".letter");
  if (letter) letter.classList.toggle("hover-lime", Math.random() < 0.5);
});

// Letters in [data-flicker] titles now and then flash an accent colour,
// mostly the capitals (C, R, O, W). Each flash blinks on, off, on again so
// it reads as a flicker rather than a fade. One letter at a time, fast,
// often overlapping (used on the home page title).
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const el of document.querySelectorAll("[data-flicker]")) {
    const letters = [...el.querySelectorAll(".letter")];
    const caps = letters.filter((l) => /[A-Z]/.test(l.textContent));
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    // skip letters that are already lit, so overlapping flickers don't collide
    const unlit = (list) => list.filter((l) => !l.matches(".flash, .flash-lime"));

    const flash = () => {
      const letter = pick(unlit(Math.random() < 0.75 ? caps : letters));
      if (!letter) return;
      const tone = Math.random() < 0.5 ? "flash" : "flash-lime";
      const hold = 200 + Math.random() * 450;
      letter.classList.add(tone);
      setTimeout(() => letter.classList.remove(tone), 60);
      setTimeout(() => letter.classList.add(tone), 110);
      setTimeout(() => letter.classList.remove(tone), 110 + hold);
    };

    const fast = () => {
      flash();
      setTimeout(fast, 150 + Math.random() * 500);
    };

    setTimeout(fast, 800);
  }
}

// Light / dark toggle. The mode itself is set early by theme.js.
const themeToggle = document.querySelector(".theme-toggle");

if (themeToggle) {
  const root = document.documentElement;
  const sync = () => themeToggle.setAttribute("aria-pressed", String(root.dataset.theme === "dark"));
  sync();
  themeToggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
    sync();
  });
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
  matchMedia(`(width >= ${narrowWidth()})`).addEventListener("change", () => setMenu(false));
}

// Back to the top: a pixel arrow in the bottom-right corner, shown once the
// page has been scrolled down a way. Now and then one of its pixels flashes
// lime or pink.
const ARROW = [   // 7x7, x marks a pixel
  "...x...",
  "..xxx..",
  ".x.x.x.",
  "x..x..x",
  "...x...",
  "...x...",
  "...x...",
];
/**
 * A corner button drawn in pixels (styles.css .corner-button): a 7x7 map,
 * "x" for each pixel. The back-to-top arrow, and the card page's report flag.
 */
export function pixelButton(rows, className, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `corner-button ${className}`;
  b.setAttribute("aria-label", label);
  b.title = label;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== "x") return;
    const px = document.createElement("span");
    px.style.gridArea = `${y + 1} / ${x + 1}`;
    b.append(px);
  }));
  return b;
}

const toTop = pixelButton(ARROW, "to-top", "Back to the top");
toTop.removeAttribute("title");
toTop.hidden = true;
const pixels = [...toTop.children];
document.body.append(toTop);
toTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  // the page's (visible) title: focus moves there, so the keyboard starts from the top too
  const title = [...document.querySelectorAll("main h1")].find((h) => h.offsetParent);
  if (title) {
    if (!title.hasAttribute("tabindex")) title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
});
const syncToTop = () => { toTop.hidden = window.scrollY < 300; };
addEventListener("scroll", syncToTop, { passive: true });
syncToTop();
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const flicker = () => {
    if (!toTop.hidden) {
      const px = pixels[Math.floor(Math.random() * pixels.length)];
      const tone = Math.random() < 0.5 ? "flash-lime" : "flash-pink";
      px.classList.add(tone);
      setTimeout(() => px.classList.remove(tone), 450);
    }
    setTimeout(flicker, 1200 + Math.random() * 2600);
  };
  setTimeout(flicker, 1500);
}
