// The sidebar of a reference page (docs.html, platforms.html, style.html): on
// narrow screens a bar that drops the contents down (js/sidebar.js);
// third-level lists that fold; and the link for the part of the page being
// read highlighted (and named in the narrow bar). On the docs page, it also
// folds the main sections (data-fold) and fills the view-mode table from
// view-modes.js.

import { narrowSidebar } from "./sidebar.js";
import { topLine } from "./scroll.js";
import { getPref, setPref } from "./prefs.js";

// ── the page's sections that fold (data-fold="open" | "closed": how they start;
// after that, as the reader left them, in this browser). The heading becomes
// the toggle (the site's pixel +/−). A closed section's body is hidden "until
// found", so the browser's find still reaches it, and opens it; a link to
// anything inside opens it too. Without JS everything simply stays open.
const canFind = "onbeforematch" in document.body;   // (otherwise closed is plainly hidden)
const folds = [...document.querySelectorAll("section[data-fold]")].map((section) => {
  const heading = section.querySelector(":scope > :is(h2, h3)");
  const body = document.createElement("div");
  body.className = "doc-fold-body";
  body.id = `${section.id}-body`;
  body.append(...[...section.childNodes].filter((n) => n !== heading));
  section.append(body);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "pixel-toggle with-label";
  toggle.setAttribute("aria-controls", body.id);
  const label = document.createElement("span");   // (the heading's text in one span: the button's gap only sits between the plus and it, even once its letters are wrapped)
  label.append(...heading.childNodes);
  toggle.append(label);
  heading.append(toggle);
  const fold = { section, body, toggle, set: (open, remember = true) => {
    if (open) body.removeAttribute("hidden");
    else body.setAttribute("hidden", canFind ? "until-found" : "");
    toggle.setAttribute("aria-expanded", String(open));
    if (remember) setPref(`docs-fold:${section.id}`, open);
  } };
  toggle.addEventListener("click", () => fold.set(body.hasAttribute("hidden")));
  body.addEventListener("beforematch", () => fold.set(true));   // (found by the browser's find)
  fold.set(getPref(`docs-fold:${section.id}`, section.dataset.fold === "open"), false);
  return fold;
});

/** Open every folded section around an element (followed by a link, or found). */
function openAround(el) {
  for (const f of folds) if (f.section.contains(el) && f.body.hasAttribute("hidden")) f.set(true);
}
const hashTarget = () => location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
addEventListener("hashchange", () => { const el = hashTarget(); if (el) openAround(el); });
// opened at a link into a closed section: open it, then go there (the browser couldn't)
const arrived = hashTarget();
if (arrived && folds.some((f) => f.section.contains(arrived) && f.body.hasAttribute("hidden"))) {
  openAround(arrived);
  requestAnimationFrame(() => arrived.scrollIntoView());
}
// a link to where we already are doesn't change the hash: open before the browser scrolls
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  const el = a && document.getElementById(decodeURIComponent(a.hash.slice(1)));
  if (el) openAround(el);
});

// Open all / Close all, for the reference's groups
const allButtons = document.getElementById("reference-folds");
if (allButtons) {
  const inReference = folds.filter((f) => f.section.closest("#reference"));
  for (const [label, open] of [["Open all", true], ["Close all", false]]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-button";
    b.textContent = label;
    b.addEventListener("click", () => inReference.forEach((f) => f.set(open)));
    allButtons.append(b);
  }
}

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
    if (t.el.checkVisibility && !t.el.checkVisibility()) continue;   // (inside a closed section)
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

// The docs' view-mode tables, from view-modes.js (what the editor and server
// use): data-view-modes, each mode's name and description; data-view-fields,
// each part of a card and the modes that show it (FIELDS)
const modesTable = document.querySelector("table[data-view-modes] tbody");
const fieldsTable = document.querySelector("table[data-view-fields]");
if (modesTable || fieldsTable) {
  const { MODES, FIELDS, FIELD_LABELS, shows } = await import("./view-modes.js");
  // a table row: [text, className?] per cell, the first a row heading if asked
  const row = (cells, tag = "td") => {
    const tr = document.createElement("tr");
    for (const [text, cls] of cells) {
      const td = document.createElement(tag);
      td.textContent = text;
      if (cls) td.className = cls;
      tr.append(td);
    }
    return tr;
  };
  modesTable?.replaceChildren(...MODES.map((m) => row([[m.label, "ref-name"], [m.description], [m.forkable ? "Yes" : "No"]])));
  if (fieldsTable) {
    fieldsTable.createTHead().replaceChildren(row([["Part of the Card"], ...MODES.map((m) => [m.label])], "th"));
    fieldsTable.createTBody().replaceChildren(
      ...Object.keys(FIELDS).map((f) => row([[FIELD_LABELS[f], "ref-name"], ...MODES.map((m) => [shows(f, m.id) ? "Yes" : "–"])])),
      row([["Can be used as a starting point", "ref-name"], ...MODES.map((m) => [m.forkable ? "Yes" : "–"])]));
  }
}
