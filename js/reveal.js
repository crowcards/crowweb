// Reveal: for things that appear after an earlier choice (a platform's
// details, how people join once a tier is picked, …). By default its parts
// cascade in: each fades and slides up a moment after the one before.
// Other effects, kept for trying out (style.html), combinable:
//   pixels — shown under a layer of page-coloured pixels that drop away in
//            random order, a few flashing lime or orange on the way out
//   tail   — the pixels go fast at first and the last few slowly
//   decode — its text scrambles through random characters before settling
//   sizes  — while decoding, some letters jump to other sizes
//
//   reveal(details);                                                  // the cascade
//   reveal(details, { cascade: false, tail: true, decode: true });   // pixels + decode
//
// With "reduce motion" on (or where canvas isn't available) it just appears.

const CELL = 8;           // pixel size, in CSS px
const FLASH = 0.06;       // share of pixels that flash a colour before going
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*+=<>/";
const SIZES = ["0.55em", "0.75em", "1.35em", "1.7em"];

export function reveal(element, { cascade = true, pixels = true, tail = false, decode = false, sizes = false } = {}) {
  element.hidden = false;
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const duration = tail ? 1800 : 900;
  if (cascade) return cascadeIn(element);
  if (pixels) dissolve(element, duration, tail);
  if (decode) decodeText(element, duration, sizes);
}

/** Show `element` (cascading in, if it was hidden) when `on`; hide it otherwise. */
export function showIf(element, on) {
  if (on && element.hidden) reveal(element);
  else if (!on) element.hidden = true;
}

/** Each child fades and slides in, a little after the one before (make.css .cascade-in). */
function cascadeIn(element) {
  const parts = [...element.children];
  parts.forEach((part, i) => part.style.setProperty("--i", i));
  element.classList.add("cascade-in");
  const done = () => {
    element.classList.remove("cascade-in");
    parts.forEach((part) => part.style.removeProperty("--i"));
  };
  setTimeout(done, 600 + parts.length * 120);
}

/** 0 → 1 over time; with a tail, fast at first and slow at the end. */
const progress = (t, tail) => (tail ? 1 - (1 - t) ** 3 : t);

function dissolve(element, duration, tail) {
  const { width, height } = element.getBoundingClientRect();
  if (!width || !height) return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  canvas.className = "reveal-layer";
  canvas.setAttribute("aria-hidden", "true");
  ctx.scale(ratio, ratio);

  const css = getComputedStyle(document.documentElement);
  const bg = css.getPropertyValue("--bg").trim();
  const colours = [css.getPropertyValue("--lime").trim(), css.getPropertyValue("--accent").trim()];
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) cells.push([x, y]);
  // random order (Fisher–Yates)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  element.classList.add("revealing");
  element.append(canvas);

  const start = performance.now();
  let gone = 0;
  let flashing = [];
  const frame = (now) => {
    // last frame's flashes go now
    for (const [x, y] of flashing) ctx.clearRect(x * CELL, y * CELL, CELL, CELL);
    flashing = [];
    const t = Math.min(1, (now - start) / duration);
    const target = Math.round(progress(t, tail) * cells.length);
    for (; gone < target; gone++) {
      const [x, y] = cells[gone];
      if (Math.random() < FLASH) {
        ctx.fillStyle = colours[Math.floor(Math.random() * colours.length)];
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        flashing.push([x, y]);
      } else ctx.clearRect(x * CELL, y * CELL, CELL, CELL);
    }
    if (gone < cells.length || flashing.length) requestAnimationFrame(frame);
    else {
      canvas.remove();
      element.classList.remove("revealing");
    }
  };
  requestAnimationFrame(frame);
}

/**
 * Each letter of the element's text shows random characters until its own
 * moment to settle (roughly left to right, with some jitter). The text is
 * put back exactly as it was at the end.
 */
function decodeText(element, duration, sizes) {
  const walker = document.createTreeWalker(element, 4);   // 4 = text nodes
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.textContent.trim()) nodes.push(walker.currentNode);
  if (!nodes.length) return;
  element.setAttribute("aria-busy", "true");

  const letters = [];
  const swaps = nodes.map((node) => {
    const wrap = document.createElement("span");
    for (const ch of node.textContent) {
      const span = document.createElement("span");
      span.textContent = ch;
      wrap.append(span);
      if (/\s/.test(ch)) continue;
      letters.push({ span, ch, size: sizes && Math.random() < 0.3 ? SIZES[Math.floor(Math.random() * SIZES.length)] : null });
    }
    node.replaceWith(wrap);
    return { node, wrap };
  });
  // when each letter settles: in reading order, spread over the duration, with jitter
  letters.forEach((l, i) => { l.at = Math.min(1, (i / letters.length) * 0.8 + Math.random() * 0.25); });

  const start = performance.now();
  let last = 0;
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    if (now - last > 45 || t === 1) {   // change characters about 20 times a second
      last = now;
      for (const l of letters) {
        if (t >= l.at) { l.span.textContent = l.ch; l.span.style.fontSize = ""; continue; }
        l.span.textContent = CHARS[Math.floor(Math.random() * CHARS.length)];
        if (l.size) l.span.style.fontSize = l.size;
      }
    }
    if (t < 1) requestAnimationFrame(frame);
    else {
      for (const { node, wrap } of swaps) wrap.replaceWith(node);
      element.removeAttribute("aria-busy");
    }
  };
  requestAnimationFrame(frame);
}
