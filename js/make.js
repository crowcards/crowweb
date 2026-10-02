// make.html: moves between the screens (start → save your key → editor),
// makes and opens cards, and runs the editor's sidebar.

import { createCard, getCard, updateCard, errorKind } from "./api.js";
import { loadSession, saveSession, confirmKey, forgetSession } from "./session.js";
import { loadModuleDefaults, startingModules, moduleEntries, renderModulePicker, moduleSuggestion } from "./modules.js";
import { createAutosaver, onSaveStatus, saveStatus, flushAll, resetSavers, stoppedParts, resumeAll } from "./autosave.js";
import { renderBasics, loadBasicsData } from "./sections/basics.js";
import { showPopup, closePopup } from "./popup.js";

const $ = (id) => document.getElementById(id);

// ── screens ─────────────────────────────────────────────────
// Each screen is a [data-screen] element; exactly one is visible. Start and
// key live inside the intro layout (crow panel); the editor has its own.
function show(name, { focus = true } = {}) {
  for (const el of document.querySelectorAll("[data-screen]")) {
    el.hidden = el.dataset.screen !== name;
  }
  $("intro").hidden = name === "editor";
  // move focus to the new screen's heading, so keyboard and screen-reader
  // users land at the top of what just appeared (not on first page load)
  if (focus) document.querySelector(`[data-screen="${name}"] h1`)?.focus();
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}

const MESSAGES = {
  "no-card": "No card has this ID. Check that the whole ID is there, starting with crd_.",
  "bad-key": "This secret doesn’t match this card. Check that the whole secret is there, with nothing extra.",
  offline: "Couldn’t reach the server. Check your connection and try again.",
  other: "Something went wrong. Please try again in a moment.",
};

// ── start: make a new card ──────────────────────────────────
$("start-new").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Making your card…";
  showError($("start-error"), "");
  try {
    const { cardId, secret } = await createCard();
    // saved straight away (not yet confirmed), so a refresh can't lose the key
    saveSession({ cardId, secret, confirmed: false });
    showKey({ cardId, secret });
  } catch (err) {
    console.error(err);
    showError($("start-error"), MESSAGES[errorKind(err)]);
  } finally {
    btn.disabled = false;
    btn.textContent = "Start a new card";
  }
});

// ── start: open an existing card ────────────────────────────
$("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const cardId = form.cardId.value.trim();
  const secret = form.secret.value.trim();
  const error = $("edit-error");

  if (!cardId || !secret) {
    showError(error, "Enter both the card ID and the secret.");
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Opening…";
  showError(error, "");
  try {
    const card = await getCard(cardId, secret);   // proves the pair is right before we keep it
    saveSession({ cardId, secret }, { remember: form.remember.checked });
    form.reset();
    openCard({ card });
  } catch (err) {
    console.error(err);
    showError(error, MESSAGES[errorKind(err)]);
  } finally {
    btn.disabled = false;
    btn.textContent = "Open card";
  }
});

// ── save your key ───────────────────────────────────────────
function showKey({ cardId, secret }, opts) {
  $("key-id").textContent = cardId;
  $("key-secret").textContent = secret;
  $("key-saved").checked = false;
  $("key-continue").disabled = true;
  show("key", opts);
}

$("key-saved").addEventListener("change", (e) => {
  $("key-continue").disabled = !e.currentTarget.checked;
});

for (const btn of document.querySelectorAll("[data-copy]")) {
  btn.addEventListener("click", async () => {
    const text = $(btn.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      flash(btn, "Copied");
    } catch {
      // clipboard blocked: select the text so the person can copy it themselves
      getSelection().selectAllChildren($(btn.dataset.copy));
      flash(btn, "Press Ctrl+C");
    }
  });
}

function flash(btn, label) {
  const original = btn.dataset.label ||= btn.textContent;
  btn.textContent = label;
  clearTimeout(btn.flashTimer);
  btn.flashTimer = setTimeout(() => (btn.textContent = original), 1800);
}

$("key-download").addEventListener("click", () => {
  const cardId = $("key-id").textContent;
  const secret = $("key-secret").textContent;
  const text = [
    "CROW Card key",
    "",
    `Card ID: ${cardId}`,
    `Secret:  ${secret}`,
    "",
    `Edit your card at ${location.origin}/make.html (choose "Edit an existing card").`,
    "",
    "Keep this file private: anyone with both lines can edit the card.",
    "The secret can't be recovered if it's lost.",
    "",
  ].join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `crow-card-${cardId}.txt` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);   // give the download a moment to start
});

$("key-continue").addEventListener("click", () => {
  confirmKey({ remember: $("key-remember").checked });
  openCard();
});

// ── opening a card ──────────────────────────────────────────
// The card as last loaded, kept up to date with what's on screen, and the
// auto-savers that write each part of it back.
// `version` is the card's updatedAt as this page last saw it: every save
// sends it, so the server can refuse a save that would overwrite changes
// made somewhere else in the meantime.
const editor = { card: null, version: null, defaults: null, basicsData: null, savers: null, basicsForm: null };
let stopShown = false;   // the "changes can't be saved" pop-up shows once per card

/**
 * Load the card in this browser's session, then go to set-up (if its
 * modules haven't been picked yet) or the editor. Loading is also the check
 * that the stored key still works: if the server says it doesn't, the key is
 * forgotten; if the server can't be reached, it's kept and the person can
 * try again.
 */
async function openCard({ card, ...opts } = {}) {
  const session = loadSession();
  if (!session) return show("start", opts);

  $("loading-text").hidden = false;
  $("loading-error").hidden = true;
  show("loading", { focus: false });

  try {
    [card, editor.defaults, editor.basicsData] = await Promise.all([
      card || getCard(session.cardId, session.secret),
      loadModuleDefaults(),
      loadBasicsData(),
    ]);
  } catch (err) {
    console.error(err);
    const kind = errorKind(err);
    if (kind === "no-card" || kind === "bad-key") {
      forgetSession();
      show("start", { focus: false });
      showPopup(kind === "no-card"
        ? { title: "Card not found", message: "The card saved in this browser no longer exists. It may have been deleted." }
        : { title: "Key doesn’t match", message: "The key saved in this browser no longer opens its card. If you have the card’s ID and secret, enter them under “Edit an existing card”." });
      return;
    }
    $("loading-text").hidden = true;
    $("loading-error").querySelector(".form-error").textContent = MESSAGES[kind];
    $("loading-error").hidden = false;
    $("loading-error").querySelector("h1").focus();
    return;
  }

  editor.card = card;
  editor.version = card.updatedAt;
  startSavers();
  if (card.modules == null) showSetup(opts);
  else showEditor(opts);
}

$("loading-retry").addEventListener("click", () => openCard());

/**
 * Save one top-level part of the card (e.g. "basics"), building on the
 * version this page last saw, and remember the new version.
 */
async function savePart(part, data) {
  const { cardId, secret } = loadSession();
  const result = await updateCard(cardId, secret, { [part]: data }, { ifUpdatedAt: editor.version });
  editor.version = result.updatedAt;
  return result;
}

// One auto-saver per part of the card. Each sends only its own part.
// (Each new module in Phase 2 adds its part name here.)
const PARTS = ["basics", "modules"];

function startSavers() {
  resetSavers();
  stopShown = false;
  editor.savers = Object.fromEntries(PARTS.map((part) => [part, createAutosaver({
    name: part,
    collect: () => editor.card[part],
    save: (data) => savePart(part, data),
  })]));
}

/**
 * The Basics form, wired to its auto-saver, rendered into `container`.
 * onTypeChange(from, to) lets the module picker next to it re-suggest.
 */
function mountBasics(container, { onTypeChange } = {}) {
  const saver = editor.savers.basics;
  const form = renderBasics(container, editor.card.basics, editor.basicsData, {
    onInput: () => {
      editor.card.basics = form.collect();
      renderCardName();
      saver.schedule();
    },
    onCommit: () => {
      // a finished choice (or leaving a field): mark it changed, save now
      editor.card.basics = form.collect();
      saver.schedule();
      saver.flush();
    },
    onTypeChange,
  });
  editor.basicsForm = form;
  return form;
}

// ── save status (shared by set-up and the editor) ───────────
const timeNow = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function statusText(s) {
  switch (s.state) {
    case "saving": return "Saving…";
    case "unsaved": return "Unsaved changes";
    case "offline": return "Offline. Changes will save when you’re back online.";
    case "retrying": return "Can’t reach the server. Retrying…";
    case "stopped": return s.kind === "conflict" ? "Not saved: changed somewhere else" : "Not saved: this key no longer works";
    case "saved": return `Saved ${timeNow(s.at)}`;
    default: return "";
  }
}

onSaveStatus((s) => {
  $("save-status").textContent = statusText(s) || "All changes saved";
  $("save-status-bar").textContent = statusText(s) || "All changes saved";
  $("setup-status").textContent = statusText(s);
  if (s.state === "stopped" && !stopShown) {
    stopShown = true;
    if (s.kind === "conflict") return showConflict();
    showPopup({
      title: "Changes can’t be saved",
      message: s.kind === "no-card"
        ? "This card no longer exists, so your latest changes couldn’t be saved."
        : "The key in this browser no longer opens this card, so your latest changes couldn’t be saved. Copy anything you need from the page before leaving it.",
    });
  }
});

// ── module suggestions when the community type changes ──────
/**
 * On the set-up page: if the modules still match the old type's defaults,
 * switch them to the new type's straight away (and say so); if the person
 * has changed them, offer the new defaults with a button instead. In the
 * editor (autoApply: false) it always offers, never changes by itself.
 */
function suggestModules(hintEl, picker, fromType, toType, { apply, autoApply = true }) {
  const s = moduleSuggestion(editor.defaults, picker.value(), { fromType, toType });
  hintEl.replaceChildren();
  if (!s.add.length && !s.remove.length) return;

  const label = (id) => editor.defaults.modules.find((m) => m.id === id)?.label || id;
  const typeLabel = editor.basicsData.types.find((t) => t.id === toType)?.label || "no type";
  const changes = [
    ...s.add.map((id) => `add ${label(id)}`),
    ...s.remove.map((id) => `remove ${label(id)}`),
  ].join(", ");
  const el = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  };
  const showPicker = () => hintEl.scrollIntoView({ behavior: "smooth", block: "center" });

  if (s.untouched && autoApply) {
    apply(s.next);
    hintEl.append(el("div", { className: "callout" }, el("p", { textContent: `Updated for ${typeLabel}: ${changes}.` })));

    const showMe = el("button", { type: "button", className: "link-button", textContent: "Show me" });
    showPopup({
      title: "Modules updated",
      body: el("div", {},
        el("p", { textContent: `Because you chose ${typeLabel}, we updated what your card covers: ${changes}.` }),
        el("p", { textContent: "You can change this any time." }),
        el("p", { className: "popup-actions" }, showMe),
      ),
    });
    showMe.addEventListener("click", () => { closePopup(); showPicker(); });
    return;
  }

  // a suggestion: offered in a callout by the picker, and in a pop-up
  const use = () => {
    apply(s.next);
    hintEl.replaceChildren();
  };
  const inlineUse = el("button", { type: "button", className: "link-button", textContent: "Use suggestion" });
  inlineUse.addEventListener("click", use);
  hintEl.append(el("div", { className: "callout" },
    el("p", {}, el("b", { className: "mono-u", textContent: "Suggested modules. " }), `For ${typeLabel}: ${changes}. `, inlineUse),
  ));

  const popUse = el("button", { type: "button", className: "button button-small", textContent: "Use suggestion" });
  const popShow = el("button", { type: "button", className: "link-button", textContent: "Show me" });
  const popLater = el("button", { type: "button", className: "link-button", textContent: "Not now" });
  showPopup({
    title: "Suggested changes",
    body: el("div", {},
      el("p", { textContent: `Changing your community type to ${typeLabel} suggests changes to your card’s modules: ${changes}.` }),
      el("p", { textContent: "Your current modules stay as they are unless you choose to use the suggestion." }),
      el("p", { className: "popup-actions" }, popUse, popShow, popLater),
    ),
  });
  popUse.addEventListener("click", () => { use(); closePopup(); });
  popShow.addEventListener("click", () => { closePopup(); showPicker(); });
  popLater.addEventListener("click", () => closePopup());
}

// ── changed somewhere else ──────────────────────────────────
// A save was refused because the card changed since this page loaded it
// (another tab, device or person). Saving is paused until the person picks:
// load the latest (dropping their unsaved edits) or keep theirs (write their
// unsaved parts over the latest; parts they didn't touch take the latest).
function showConflict() {
  const parts = stoppedParts();
  const names = parts.map((p) => (p === "modules" ? "the module list" : moduleLabel(p)));
  const el = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  };
  const latest = el("button", { type: "button", className: "button button-small", textContent: "Load the latest version" });
  const mine = el("button", { type: "button", className: "link-button", textContent: "Keep mine" });
  const error = el("p", { className: "form-error", hidden: true });

  showPopup({
    title: "Changed somewhere else",
    body: el("div", {},
      el("p", { textContent: "This card was changed somewhere else (another tab, device, or person) since you opened it, so your latest changes haven’t been saved yet." }),
      el("p", {},
        el("b", { textContent: "Load the latest version" }), ` to see their changes. Your unsaved edits to ${names.join(" and ")} will be dropped.`),
      el("p", {},
        el("b", { textContent: "Keep mine" }), ` to save your version of ${names.join(" and ")} over theirs. Everything else takes the latest version.`),
      error,
      el("p", { className: "popup-actions" }, latest, mine),
    ),
  }).then(() => {
    // closed without choosing: ask again next time a save is refused
    if (stoppedParts().length) stopShown = false;
  });

  const choose = async (keepMine) => {
    latest.disabled = mine.disabled = true;
    try {
      const { cardId, secret } = loadSession();
      const fresh = await getCard(cardId, secret);
      if (keepMine) {
        for (const p of parts) fresh[p] = editor.card[p];
        editor.card = fresh;
        editor.version = fresh.updatedAt;
        stopShown = false;
        resumeAll();
      } else {
        editor.card = fresh;
        editor.version = fresh.updatedAt;
        startSavers();
      }
      closePopup();
      rerender();
    } catch (err) {
      console.error(err);
      error.textContent = MESSAGES[errorKind(err)];
      error.hidden = false;
      latest.disabled = mine.disabled = false;
    }
  };
  latest.addEventListener("click", () => choose(false));
  mine.addEventListener("click", () => choose(true));
}

const moduleLabel = (id) =>
  moduleEntries(editor.defaults, editor.card).find((m) => m.id === id)?.label || id;

/** Redraw whichever screen is showing from editor.card. */
function rerender() {
  if (editor.card.modules == null) showSetup({ focus: false });
  else showEditor({ focus: false });
}

// ── set up: Basics + modules, right after a card is made ────
let setupPicker = null;

function showSetup(opts) {
  // modules are only written on Continue: until then the card counts as
  // not set up, so a refresh comes back here
  const suggested = startingModules(editor.defaults, { communityType: editor.card.basics?.communityType });
  setupPicker = renderModulePicker($("setup-modules"), editor.defaults, suggested, {
    onChange: () => $("setup-modules-hint").replaceChildren(),
  });
  $("setup-modules-hint").replaceChildren();
  const form = mountBasics($("setup-basics"), {
    onTypeChange: (from, to) => suggestModules($("setup-modules-hint"), setupPicker, from, to, {
      apply: (next) => setupPicker.set(next),
    }),
  });
  showError($("setup-error"), "");
  show("setup", opts);
  if (opts?.focus !== false) form.focusFirst();
}

$("setup-continue").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!editor.card.basics?.communityName) {
    showError($("setup-error"), "Give your community a name to continue.");
    editor.basicsForm.focusFirst();
    return;
  }
  showError($("setup-error"), "");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await flushAll();
    const modules = setupPicker.value();
    await savePart("modules", modules);
    editor.card.modules = modules;
    history.replaceState(null, "", "#basics");
    showEditor();
  } catch (err) {
    console.error(err);
    showError($("setup-error"), MESSAGES[errorKind(err)]);
  } finally {
    btn.disabled = false;
    btn.textContent = "Continue to the editor";
  }
});

// ── editor ──────────────────────────────────────────────────
function showEditor(opts) {
  $("editor-id").textContent = editor.card.id;
  renderCardName();
  renderModuleList();
  show("editor", { focus: false });
  renderModule(opts);
}

function renderCardName() {
  $("editor-name").textContent = editor.card.basics?.communityName || "Untitled card";
}

// Each module is a link to #<module id>; the hash picks what the main area shows.
function currentModuleId() {
  const id = location.hash.slice(1);
  const entries = moduleEntries(editor.defaults, editor.card);
  return entries.some((m) => m.id === id) ? id : "basics";
}

function renderModuleList() {
  $("module-list").replaceChildren(
    ...moduleEntries(editor.defaults, editor.card).map((m) => {
      const li = document.createElement("li");
      const a = Object.assign(document.createElement("a"), { href: `#${m.id}`, textContent: m.label });
      a.dataset.module = m.id;
      li.append(a);
      return li;
    }),
  );
  markCurrentModule();
}

function markCurrentModule() {
  const id = currentModuleId();
  $("editor-bar-module").textContent =
    moduleEntries(editor.defaults, editor.card).find((m) => m.id === id)?.label || "Basics";
  for (const a of $("module-list").querySelectorAll("a")) {
    a.classList.toggle("active", a.dataset.module === id);
    if (a.dataset.module === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function renderModule({ focus = true } = {}) {
  if (!editor.card || $("editor").hidden) return;
  const id = currentModuleId();
  const m = moduleEntries(editor.defaults, editor.card).find((e) => e.id === id);
  markCurrentModule();

  $("module-title").textContent = m.label;
  $("module-description").textContent = m.description || "";
  const content = $("module-content");

  if (id === "basics") {
    const basicsHost = document.createElement("div");
    const heading = Object.assign(document.createElement("h2"), { textContent: "Modules" });
    const hint = Object.assign(document.createElement("p"), {
      textContent: "The parts this card covers. Unticking one hides it from the sidebar; anything already filled in is kept.",
    });
    const pickerHint = document.createElement("div");
    pickerHint.setAttribute("aria-live", "polite");
    const pickerHost = document.createElement("div");
    content.replaceChildren(basicsHost, heading, hint, pickerHint, pickerHost);

    const setModules = (modules) => {
      editor.card.modules = modules;
      renderModuleList();
      // a tick is a finished choice: save now rather than after the delay
      editor.savers.modules.schedule();
      editor.savers.modules.flush();
    };
    const picker = renderModulePicker(pickerHost, editor.defaults, editor.card.modules, {
      onChange: (modules) => {
        pickerHint.replaceChildren();
        setModules(modules);
      },
    });
    // in the editor the person has already chosen modules, so a type change
    // only ever suggests (with a button); it never changes them by itself
    mountBasics(basicsHost, {
      onTypeChange: (from, to) => suggestModules(pickerHint, picker, from, to, {
        apply: (next) => { picker.set(next); setModules(next); },
        autoApply: false,
      }),
    });
  } else {
    editor.basicsForm = null;
    content.replaceChildren(
      Object.assign(document.createElement("p"), { textContent: "This module’s form is coming soon." }),
    );
  }

  if (focus) $("module-title").focus();
}

addEventListener("hashchange", () => {
  setEditorNav(false);   // picking a module closes the narrow-screen panel
  renderModule();
});

// ── editor: narrow-screen sidebar panel ─────────────────────
function setEditorNav(open) {
  $("editor-nav").classList.toggle("is-open", open);
  $("editor-nav-toggle").setAttribute("aria-expanded", String(open));
}
// tapping the module you're already on doesn't change the address, so close here too
$("module-list").addEventListener("click", (e) => {
  if (e.target.closest("a")) setEditorNav(false);
});
$("editor-nav-toggle").addEventListener("click", () => {
  setEditorNav(!$("editor-nav").classList.contains("is-open"));
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("editor-nav").classList.contains("is-open")) setEditorNav(false);
});
matchMedia("(width >= 52rem)").addEventListener("change", () => setEditorNav(false));

// ── editor: Save ────────────────────────────────────────────
// two Save buttons: the sidebar's, and the narrow-screen bar's
for (const btn of document.querySelectorAll("[data-save-now]")) {
  btn.addEventListener("click", async () => {
    // saving is paused on a conflict: Save brings the choice back up
    if (stoppedParts().length && saveStatus().kind === "conflict") return showConflict();
    btn.disabled = true;
    try {
      await flushAll();
    } finally {
      btn.disabled = false;
    }
  });
}

// ── editor: forget this card ────────────────────────────────
async function forgetCard() {
  const ok = confirm("Forget this card on this device?\n\nYou’ll need its card ID and the secret you saved to open it again.");
  if (!ok) return;
  await flushAll();
  resetSavers();
  forgetSession();
  editor.card = null;
  history.replaceState(null, "", location.pathname);   // drop the #module from the address
  setEditorNav(false);
  show("start");
}

// two Forget buttons: the sidebar's, and the narrow-screen bar's
for (const btn of document.querySelectorAll("[data-forget]")) btn.addEventListener("click", forgetCard);

// ── on load: pick up where this tab (or device) left off ───
const session = loadSession();
if (!session) show("start", { focus: false });
else if (!session.confirmed) showKey(session, { focus: false });
else openCard({ focus: false });
