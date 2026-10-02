// Loaded (without defer) in <head> so the colour mode is set before the page
// draws — no flash of the wrong theme. Uses the visitor's saved choice from
// the header toggle; otherwise light (beige), whatever their system setting.
try {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
} catch {
  // storage blocked: stay in light mode
}

// Line the header crow's flap up with the wall clock, so every page is on
// the same frame at the same moment and moving between pages doesn't make
// it jump (see .sprite in styles.css). styles.css has loaded by now: a
// script waits for the stylesheets above it.
{
  const root = document.documentElement;
  const cycle = parseFloat(getComputedStyle(root).getPropertyValue("--sprite-cycle")) * 1000;
  if (cycle > 0) root.style.setProperty("--sprite-clock", `${-(Date.now() % cycle)}ms`);
}
