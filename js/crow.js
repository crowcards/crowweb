// Big pixel crow. Reads the pixel grid straight from the sprite PNG, redraws
// it on a canvas, and pushes pixels away from the mouse. Pixels spring back
// once the mouse leaves. The <img> stays as the fallback if anything fails.
//
// Markup: <div class="pixel-crow" data-grid="75"><img src="…png"></div>

const RADIUS = 7;      // push radius, in crow pixels
const PUSH = 2.2;      // how far pixels fly, relative to RADIUS
const SPREAD = 1.4;    // random wobble in each pixel's flight angle (radians)
const SPRING = 0.12;   // pull back toward home
const DAMPING = 0.72;  // velocity kept each frame

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const el of document.querySelectorAll(".pixel-crow")) {
    initCrow(el).catch(() => {}); // e.g. opened from file:// — keep the img
  }
}

async function initCrow(el) {
  const img = el.querySelector("img");
  const grid = Number(el.dataset.grid);
  await img.decode();

  // Sample the centre of each grid cell from the full-size image.
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sctx = src.getContext("2d");
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, src.width, src.height).data;
  const step = src.width / grid;

  const pixels = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x = Math.floor((col + 0.5) * step);
      const y = Math.floor((row + 0.5) * step);
      const i = (y * src.width + x) * 4;
      if (data[i + 3] < 128) continue;
      pixels.push({
        col, row,
        color: `rgb(${data[i]} ${data[i + 1]} ${data[i + 2]})`,
        k: 0.3 + Math.random() * 1.7,               // per-pixel scatter strength
        turn: (Math.random() - 0.5) * 2 * SPREAD,  // per-pixel angle offset
        x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0,
      });
    }
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  el.append(canvas);
  el.classList.add("is-live");

  let cell = 0;      // crow-pixel size in device pixels
  let pointer = null;
  let running = false;

  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    // the crow fills the middle of the canvas (see the inset in styles.css)
    const size = el.clientWidth * dpr;
    const offset = (canvas.width - size) / 2;
    cell = size / grid;
    for (const p of pixels) {
      p.hx = p.x = offset + p.col * cell;
      p.hy = p.y = offset + p.row * cell;
      p.vx = p.vy = 0;
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = Math.ceil(cell);
    for (const p of pixels) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, w);
    }
  }

  function tick() {
    const r = RADIUS * cell;
    let moving = false;
    for (const p of pixels) {
      let tx = p.hx, ty = p.hy;
      if (pointer) {
        const dx = p.hx + cell / 2 - pointer.x;
        const dy = p.hy + cell / 2 - pointer.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < r) {
          const f = (1 - d / r) ** 2 * r * PUSH * p.k;
          const a = Math.atan2(dy, dx) + p.turn;
          tx += Math.cos(a) * f;
          ty += Math.sin(a) * f;
        }
      }
      p.vx = (p.vx + (tx - p.x) * SPRING) * DAMPING;
      p.vy = (p.vy + (ty - p.y) * SPRING) * DAMPING;
      p.x += p.vx;
      p.y += p.vy;
      if (Math.abs(p.vx) > 0.05 || Math.abs(p.vy) > 0.05 || Math.abs(tx - p.x) > 0.5 || Math.abs(ty - p.y) > 0.5) {
        moving = true;
      }
    }
    draw();
    running = moving || pointer !== null;
    if (running) requestAnimationFrame(tick);
  }

  function start() {
    if (!running) {
      running = true;
      requestAnimationFrame(tick);
    }
  }

  // Listen on the window (the canvas ignores the pointer so it never blocks
  // the title beneath it) and only react inside the crow's own box.
  window.addEventListener("pointermove", (e) => {
    const box = el.getBoundingClientRect();
    const inside = e.clientX >= box.left && e.clientX <= box.right &&
                   e.clientY >= box.top && e.clientY <= box.bottom;
    if (inside) {
      const dpr = window.devicePixelRatio || 1;
      const cbox = canvas.getBoundingClientRect();
      pointer = { x: (e.clientX - cbox.left) * dpr, y: (e.clientY - cbox.top) * dpr };
      start();
    } else if (pointer) {
      pointer = null;
      start();
    }
  });
  document.documentElement.addEventListener("pointerleave", () => {
    pointer = null;
    start();
  });

  new ResizeObserver(layout).observe(el);
}
