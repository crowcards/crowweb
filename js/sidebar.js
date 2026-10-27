// A sidebar on narrow screens (styles.css .sidebar-bar / .sidebar-panel): a
// slim bar under the site header, whose button (.sidebar-toggle, showing
// where you are, with a pixel ▾) opens the sidebar's contents as a drop-down
// panel. On wide screens the bar is hidden and the panel is the sidebar.
// Used by the editor (its modules) and the docs (their sections).
//
//   const nav = narrowSidebar(document.querySelector(".sidebar"), { onToggle });
//   nav.set(false);   // close it (e.g. on moving to another module)
//
// It closes when a link in it is picked, on Escape (focus back to the
// button), and when the window widens past the breakpoint.

import { narrowWidth } from "./dom.js";

export function narrowSidebar(nav, { onToggle = () => {} } = {}) {
  const toggle = nav.querySelector(".sidebar-toggle");
  const isOpen = () => nav.classList.contains("is-open");
  function set(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    onToggle(open);
  }
  toggle.addEventListener("click", () => set(!isOpen()));
  // picking a link closes it (even the one you're already on, which doesn't change the address)
  nav.querySelector(".sidebar-panel").addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isOpen()) return;
    set(false);
    toggle.focus();
  });
  matchMedia(`(width >= ${narrowWidth()})`).addEventListener("change", () => { if (isOpen()) set(false); });
  return { set };
}
