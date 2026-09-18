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

// Hovered letters light up orange or lime, picked at random each time.
document.addEventListener("pointerover", (e) => {
  const letter = e.target.closest?.(".letter");
  if (letter) letter.classList.toggle("hover-lime", Math.random() < 0.5);
});

// Letters in [data-flicker] titles now and then flash an accent colour,
// mostly the capitals (C, R, O, W). Each flash blinks on, off, on again so
// it reads as a flicker rather than a fade.
//   data-flicker          one letter at a time, fast, often overlapping
//   data-flicker="gentle" a small burst of 2–3 letters every 1–3 seconds,
//                         staggered a little (used in the header)
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

    const gentle = () => {
      const count = 2 + Math.floor(Math.random() * 2);   // 2 or 3 letters
      let delay = 0;
      for (let i = 0; i < count; i++) {
        setTimeout(flash, delay);
        delay += 100 + Math.random() * 200;              // stagger within the burst
      }
      setTimeout(gentle, 1000 + Math.random() * 2000);   // next burst in 1–3 s
    };

    setTimeout(el.dataset.flicker === "gentle" ? gentle : fast, 800);
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
  matchMedia("(width >= 64rem)").addEventListener("change", () => setMenu(false));
}
