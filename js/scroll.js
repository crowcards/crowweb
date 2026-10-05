// Keeping your place on the page while things change around you.
//
// keepPlace(scope, change) — run `change` (e.g. redrawing the suggestion box
//   above a module's fields) without what you're looking at moving: the
//   field you're in (or the first thing in view in `scope`) is put back
//   where it was on screen.
// pointTo(target, label) — a small pill at the top of the screen ("↑ New
//   suggestion") that scrolls up to `target`; it goes once clicked, once
//   the target comes into view, or after a few seconds.
// holdFloor(watch) — when `watch` gets shorter while you're scrolled down,
//   the page would have to scroll back and everything would jump; instead
//   a spacer under it holds the page's length, shrinking away again as you
//   scroll up. floor.reset() drops it (e.g. on moving to another module).

import { el } from "./dom.js";

/** What to hold still: the focused field in `scope` if it's on screen, else the first thing in view. */
function anchorIn(scope) {
  const inView = (node) => { const r = node.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  const focused = document.activeElement;
  if (focused && scope.contains(focused) && inView(focused)) return focused;
  return [...scope.querySelectorAll(".field, .fold, .callout, p, h2, h3")].find((node) => node.getBoundingClientRect().top >= 0 && inView(node)) || null;
}

export function keepPlace(scope, change) {
  const anchor = anchorIn(scope);
  const before = anchor?.getBoundingClientRect().top;
  change();
  if (!anchor?.isConnected) return;
  const moved = anchor.getBoundingClientRect().top - before;
  if (moved) scrollBy(0, moved);
}

/** Where the page starts under the sticky bars at the top (the site header; on narrow screens, the editor's bar). */
function topLine() {
  return Math.max(0, ...[...document.querySelectorAll(".site-header, .editor-nav")]
    .filter((bar) => ["sticky", "fixed"].includes(getComputedStyle(bar).position))
    .map((bar) => bar.getBoundingClientRect().bottom));
}
/** Is (enough of) `target` in sight below those bars to notice? */
const inSight = (target) => target.getBoundingClientRect().bottom > topLine() + 40;

let pill = null;
let pillTimer = null;
export function pointTo(target, label) {
  // only if it's out of sight above
  if (inSight(target)) return;
  if (!pill) {
    pill = el("button", { type: "button", className: "place-pill", hidden: true });
    pill.addEventListener("click", () => {
      const y = scrollY + pill.target.getBoundingClientRect().top - topLine() - 16;   // just below the bars
      scrollTo({ top: Math.max(0, y), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      hidePill();
    });
    document.body.append(pill);
    addEventListener("scroll", () => {
      if (pill.target && !pill.hidden && inSight(pill.target)) hidePill();
    }, { passive: true });
  }
  pill.target = target;
  pill.textContent = `↑ ${label}`;
  pill.hidden = false;
  pill.style.animation = "none";   // restart its flash each time it's shown
  void pill.offsetWidth;
  pill.style.animation = "";
  clearTimeout(pillTimer);
  pillTimer = setTimeout(hidePill, 6000);
}
function hidePill() {
  if (pill) pill.hidden = true;
}

export function holdFloor(watch) {
  const spacer = el("div", { className: "page-floor" });
  spacer.setAttribute("aria-hidden", "true");
  watch.after(spacer);
  let lastY = scrollY;            // where the page was (before any forced scroll back)
  let lastHeight = watch.offsetHeight;
  const base = () => document.documentElement.scrollHeight - spacer.offsetHeight;   // the page without the spacer
  const needed = () => Math.max(0, lastY + innerHeight - base());                   // spacer that keeps lastY reachable
  const setSpacer = (px) => { spacer.style.height = `${Math.round(px)}px`; };

  addEventListener("scroll", () => {
    lastY = scrollY;
    if (spacer.offsetHeight > needed()) setSpacer(needed());   // scrolled up: the spacer shrinks away
  }, { passive: true });

  new ResizeObserver(() => {
    const height = watch.offsetHeight;
    if (height < lastHeight) {
      setSpacer(Math.max(spacer.offsetHeight, needed()));
      if (scrollY !== lastY) scrollTo(0, lastY);   // undo the browser's pull back, before it's painted
    }
    lastHeight = height;
  }).observe(watch);

  return {
    reset() {
      setSpacer(0);
      lastHeight = watch.offsetHeight;
    },
  };
}
