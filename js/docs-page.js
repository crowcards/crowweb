// The sidebar of a reference page (docs.html, scales.html, style.html): on narrow screens
// a bar that drops the contents down (js/sidebar.js); third-level lists
// that fold; and the link for the part of the page being read highlighted
// (and named in the narrow bar).

import { narrowSidebar } from "./sidebar.js";
import { topLine } from "./scroll.js";

// Narrow screens: the sidebar is a bar that drops the contents down; opened,
// the section you're reading is scrolled into view in the list
const nav = document.getElementById('docs-nav');
narrowSidebar(nav, { onToggle: (open) => { if (open) nav.querySelector('a.active')?.scrollIntoView({ block: 'nearest' }); } });

// Sidebar: third-level lists fold away behind a small pixel +/- toggle.
// Closed to start; a list opens by itself when you scroll into one of its
// sections. Without JS everything simply stays open.
document.querySelectorAll('.sidebar .sub .sub').forEach((list, i) => {
  const item = list.parentElement;
  const label = item.querySelector(':scope > a').textContent;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pixel-toggle nav-fold';
  btn.setAttribute('aria-label', `Show or hide ${label}`);
  btn.setAttribute('aria-expanded', 'false');
  list.id ||= `sidebar-fold-${i}`;
  btn.setAttribute('aria-controls', list.id);
  btn.addEventListener('click', () => setFold(item, !item.classList.contains('is-open')));
  item.classList.add('foldable');
  item.insertBefore(btn, list);
});

function setFold(item, open) {
  item.classList.toggle('is-open', open);
  item.querySelector(':scope > .nav-fold').setAttribute('aria-expanded', String(open));
}

// Sidebar: highlight the link for the part of the page being read — the
// last linked heading or section whose top has scrolled past the header
// (and, on narrow screens, the bar under it, which also names it).
const navLinks = [...document.querySelectorAll('.sidebar a[href^="#"]')];
const targets = navLinks
  .map(a => ({ a, el: document.getElementById(a.hash.slice(1)) }))
  .filter(t => t.el);

function highlightCurrent() {
  const line = topLine() + 40;
  let current = null;
  for (const t of targets) {
    const top = t.el.getBoundingClientRect().top;
    if (top <= line && (!current || top > current.top)) current = { a: t.a, top };
  }
  navLinks.forEach(a => a.classList.toggle('active', a === current?.a));
  document.getElementById('docs-nav-current').textContent = current?.a.textContent || 'Contents';

  // open a folded list when its section becomes the current one (only on
  // the change, so it doesn't fight someone who just closed it)
  if (current?.a !== lastActive) {
    lastActive = current?.a;
    const fold = lastActive?.closest('.foldable');
    if (fold) setFold(fold, true);
  }
}
let lastActive;

addEventListener('scroll', highlightCurrent, { passive: true });
addEventListener('resize', highlightCurrent);
highlightCurrent();
