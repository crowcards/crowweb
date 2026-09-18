// Loaded (without defer) in <head> so the colour mode is set before the page
// draws — no flash of the wrong theme. Uses the visitor's saved choice from
// the header toggle; otherwise light (beige), whatever their system setting.
try {
  document.documentElement.dataset.theme = localStorage.getItem("theme") || "light";
} catch {
  // storage blocked: stay in light mode
}
