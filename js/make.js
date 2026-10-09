// make.html: moves between the screens (start → save your key → editor),
// makes and opens cards, and runs the editor's sidebar.

import { createCard, getCard, updateCard, errorKind } from "./api.js";
import { loadSession, saveSession, confirmKey, forgetSession } from "./session.js";
import { loadModuleDefaults, startingModules, moduleEntries, renderModulePicker, moduleSuggestion, hasSavedContent } from "./modules.js";
import { createAutosaver, onSaveStatus, saveStatus, flushAll, resetSavers, stoppedParts, unsavedParts, hasUnsaved, resumeAll } from "./autosave.js";
import { el, richText, button, chip, narrowWidth } from "./dom.js";
import { renderChoices } from "./controls/choices.js";
import { keepPlace, pointTo, holdFloor } from "./scroll.js";
import { loadExportData, renderExport } from "./export.js";
import { renderPublish } from "./publish.js";
import { renderCard } from "./card-view.js";
import { publicView, forkCopies, MODES } from "./view-modes.js";
import { loadData } from "./data.js";
import { renderBasics, renderBasicsSummary, loadBasicsData, missingBasics, listText } from "./sections/basics.js";
import { reveal } from "./reveal.js";
import { getPref, setPref } from "./prefs.js";
import { renderMembership, loadMembershipData } from "./sections/membership.js";
import { renderProcesses, loadProcessesData } from "./sections/processes.js";
import { renderFederation, loadFederationData } from "./sections/federation.js";
import { renderInfrastructure, loadInfrastructureData } from "./sections/infrastructure.js";
import { renderRules, loadRulesData } from "./sections/rules.js";
import { renderCustomModule, newCustomModule } from "./sections/custom.js";
import { textField } from "./controls/fields.js";
import { showPopup, closePopup, confirmPopup } from "./popup.js";
import { startFreshness, isStale, staleError } from "./freshness.js";
import { suggestionsFor } from "./suggestions.js";
import { asideOf, withAside, withoutAside } from "./set-aside.js";
import { narrowSidebar } from "./sidebar.js";

const $ = (id) => document.getElementById(id);

// ── screens ─────────────────────────────────────────────────
// Each screen is a [data-screen] element; exactly one is visible. Start and
// key live inside the intro layout (crow panel); the editor has its own.
function show(name, { focus = true } = {}) {
  for (const el of document.querySelectorAll("[data-screen]")) {
    el.hidden = el.dataset.screen !== name;
  }
  $("intro").hidden = name === "editor";
  // the full-page loading cover: only while loading (not if loading failed)
  $("page-loading").hidden = !(name === "loading" && $("loading-error").hidden);
  // move focus to the new screen's heading, so keyboard and screen-reader
  // users land at the top of what just appeared (not on first page load)
  if (focus) document.querySelector(`[data-screen="${name}"] h1`)?.focus();
}

/**
 * Show an error by its form (or clear it, with ""). It also opens a pop-up,
 * outlined in pink, so it can't be missed — unless the form is already in
 * a pop-up, where it just shows in place.
 */
function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
  if (message && !el.closest("dialog")) showPopup({ title: "Something needs fixing", message, tone: "error" });
}

const MESSAGES = {
  "no-card": "No card has this ID. Check that the whole ID is there, starting with crd_.",
  "bad-key": "This secret doesn’t match this card. Check that the whole secret is there, with nothing extra.",
  offline: "Couldn’t reach the server. Check your connection and try again.",
  conflict: "This card was changed somewhere else. Reload the page to get the latest version, then try again.",
  other: "Something went wrong. Please try again in a moment.",
};

// ── start: make a new card ──────────────────────────────────
$("start-new").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (await isStale({ force: true })) return showStale();   // a new card from old code would be saved in an old shape
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
  const a = el("a", { href: url, download: `crow-card-${cardId}.txt` });
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
const editor = { card: null, version: null, defaults: null, basicsData: null, savers: null, suggestions: [] };
// the parts whose refused saves have been raised in a pop-up: it's raised
// again only when another part's save is refused (or by Save)
let stopsShown = new Set();

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
    // the card, plus the approach names the "structure changed" note uses
    let approaches;
    [card, editor.defaults, editor.basicsData, approaches] = await Promise.all([
      card || getCard(session.cardId, session.secret),
      loadModuleDefaults(),
      loadBasicsData(),
      loadData("decision_approaches"),
    ]);
    editor.approachLabels = Object.fromEntries(approaches.items.map((a) => [a.id, a.label]));
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
    $("page-loading").hidden = true;
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
  if (await isStale()) throw staleError();   // old code mustn't save over the new shape
  const { cardId, secret } = loadSession();
  const result = await updateCard(cardId, secret, { [part]: data }, { ifUpdatedAt: editor.version });
  editor.version = result.updatedAt;
  return result;
}

// Each module's form: where its reference data comes from, and how it's drawn.
// Adding a module = a file in js/sections/ plus a line here. (Basics' data
// is loaded with the card, since set-up and module suggestions need it.)
const SECTIONS = {
  basics: { load: async () => editor.basicsData, render: renderBasics },
  membership: { load: loadMembershipData, render: renderMembership },
  processes: { load: loadProcessesData, render: renderProcesses },
  federation: { load: loadFederationData, render: renderFederation },
  infrastructure: { load: loadInfrastructureData, render: renderInfrastructure },
  rules: { load: loadRulesData, render: renderRules },
};

// One auto-saver per part of the card. Each sends only its own part.
// (customModules is one part holding every custom module.)
const PARTS = ["modules", "customModules", "editor", "attribution", ...Object.keys(SECTIONS)];

function startSavers() {
  resetSavers();
  stopsShown = new Set();
  editor.savers = Object.fromEntries(PARTS.map((part) => [part, createAutosaver({
    name: part,
    collect: () => editor.card[part],
    save: (data) => savePart(part, data),
  })]));
}

/**
 * A module's form, drawn into `container` from editor.card[part] and wired
 * to that part's auto-saver. `data` is the module's reference data.
 * Extra hooks: onTypeChange (Basics), afterChange (runs after each keystroke and each finished choice).
 * Forms also get `stateKey` ("<card id>:<module>"), a name for remembering
 * view preferences such as which sections are open, and getPart / setPart
 * (one part) / setParts ({ part: value, … }, several at once) to read and
 * change other parts of the card (e.g. Processes editing the shared
 * structure list in membership).
 */
function mountSection(part, container, data, { onTypeChange, afterChange } = {}) {
  const saver = editor.savers[part];
  let form = null;   // (a form can call setPart while it's still being drawn)
  form = SECTIONS[part].render(container, editor.card[part], data, {
    onInput: () => {
      editor.card[part] = form.collect();
      syncAside(part, form);
      afterChange?.();
      saver.schedule();
    },
    onCommit: () => {
      // a finished choice (or leaving a field): mark it changed, save now
      editor.card[part] = form.collect();
      saveParts(syncAside(part, form) ? [part, "editor"] : [part]);
      afterChange?.();
      refreshSuggestions();
    },
    onTypeChange,
    stateKey: `${editor.card.id}:${part}`,
    setAside: asideOf(editor.card.editor?.setAside, part),   // what this module set aside earlier (js/set-aside.js)
    getPart: (other) => editor.card[other] || {},
    setPart: (other, value) => setParts({ [other]: value }),
    setParts,
  });
  return form;

  // change other parts ({ part: value, … }) together, with this form's own
  // part as it is now, so suggestions only ever see them all changed (e.g. a
  // structure tick in Membership changes the structure and what's been
  // reviewed; one without the other would briefly look like a change from
  // Processes)
  function setParts(changes) {
    Object.assign(editor.card, changes);
    if (form) editor.card[part] = form.collect();
    const aside = form ? syncAside(part, form) : false;
    saveParts([...new Set([...Object.keys(changes), ...(aside ? ["editor"] : [])])]);
    refreshSuggestions();
  }
}

/**
 * Keep the card's set-aside answers (editor.setAside) in step with what a
 * form sets aside now (form.setAside(), under `part`). Says whether they
 * changed (the editor part is then due to be saved).
 */
function syncAside(part, form) {
  if (!form.setAside) return false;
  const ed = editor.card.editor || {};
  const next = withAside(ed.setAside, part, form.setAside());
  if (sameEntries(next, ed.setAside || {})) return false;
  editor.card.editor = { ...ed, setAside: next };
  editor.savers.editor.schedule();
  return true;
}
// (key order aside: the server may hand keys back in another order)
const sameEntries = (a, b) => Object.keys(a).length === Object.keys(b).length
  && Object.keys(a).every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

const mountBasics = (container, { afterChange, ...hooks } = {}) =>
  mountSection("basics", container, editor.basicsData, { ...hooks, afterChange: () => { renderCardName(); afterChange?.(); } });

// ── save status (shared by set-up and the editor) ───────────
const timeNow = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function statusText(s) {
  switch (s.state) {
    case "saving": return "Saving…";
    case "unsaved": return "Unsaved changes";
    case "offline": return "Offline. Changes will save when you’re back online.";
    case "retrying": return "Can’t reach the server. Retrying…";
    case "stopped": return {
      conflict: "Not saved: changed somewhere else",
      stale: "Not saved: the editor was updated. Reload the page",
      "too-big": "Not saved: the card is too big",
      invalid: "Not saved: something went wrong",
    }[s.kind] || "Not saved: this key no longer works";
    case "saved": return `Saved ${timeNow(s.at)}`;
    default: return "";
  }
}

onSaveStatus((s) => {
  $("save-status").textContent = statusText(s) || "All changes saved";
  $("save-status-bar").textContent = statusText(s) || "Saved";   // (short: the bar is narrow)
  $("setup-status").textContent = statusText(s);
  const newlyStopped = stoppedParts().filter((p) => !stopsShown.has(p));
  if (s.state === "stopped" && newlyStopped.length) {
    for (const p of newlyStopped) stopsShown.add(p);
    if (s.kind === "conflict") return showConflict();
    if (s.kind === "stale") return showStale();
    showPopup({
      title: "Changes can’t be saved",
      tone: "error",
      message: {
        "no-card": "This card no longer exists, so your latest changes couldn’t be saved.",
        "too-big": "This card has reached its size limit, so your latest changes couldn’t be saved. Shorten some of the longest answers (copy them somewhere first), then reload the page.",
        invalid: "The server couldn’t accept your latest changes. Copy anything you need from the page, then reload it and try again.",
      }[s.kind] || "The key in this browser no longer opens this card, so your latest changes couldn’t be saved. Copy anything you need from the page before leaving it.",
    });
  }
});

// ── the editor was updated since this page opened ───────────
// Its old code can't save safely (the card's shape may have changed), so it
// stops saving and asks for a reload.
function showStale() {
  showPopup({
    title: "The editor has been updated",
    tone: "error",
    body: el("div", {},
      el("p", { textContent: "A newer version of the editor went online after you opened this page. Reload to keep editing. Anything not yet saved will be lost, so copy it first if you need it." }),
      el("p", { className: "button-row" },
        button("Reload the page", "button button-small", () => { resetSavers(); location.reload(); }),
        button("Not yet", "link-button", closePopup)),
    ),
  });
}
// coming back to a tab that's been open a while: check straight away
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && await isStale({ force: true })) showStale();
});

// ── custom modules ──────────────────────────────────────────
const customModule = (id) => (editor.card.customModules || []).find((m) => m.id === id);
const isCustom = (id) => id.startsWith("cm_");

/** Does a module hold answers? (Drives the picker's "has saved content".) */
function moduleHasContent(id) {
  if (!isCustom(id)) return hasSavedContent(editor.card[id]);
  return (customModule(id)?.fields || []).some((f) => f.label || f.value);
}

/** Change the custom modules and save them. */
function setCustomModules(list) {
  editor.card.customModules = list;
  saveParts(["customModules"]);
}

/** Drop these parts' set-aside answers (e.g. a deleted custom module's), and save. */
function clearAside(parts) {
  const ed = editor.card.editor || {};
  editor.card.editor = { ...ed, setAside: withoutAside(ed.setAside, parts) };
  saveParts(["editor"]);
}

/**
 * Ask for a name and description in a pop-up, then add the module to the
 * card's custom modules. Resolves with the new module, or null if cancelled.
 */
function addCustomModule() {
  return new Promise((resolve) => {
    let added = null;
    const name = textField({ label: "Module name" });
    const description = textField({ label: "What it covers", hint: "Optional. A sentence is plenty.", multiline: true });
    const error = el("p", { className: "form-error", hidden: true });
    const add = el("button", { type: "submit", className: "button button-small", textContent: "Add module" });
    const cancel = el("button", { type: "button", className: "link-button", textContent: "Cancel" });
    const form = el("form", {},
      el("p", { textContent: "For anything about how your community works that the other modules don’t cover." }),
      name.element, description.element, error,
      el("p", { className: "button-row" }, add, cancel),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!name.value()) {
        showError(error, "Give the module a name.");
        name.focus();
        return;
      }
      added = newCustomModule({ name: name.value(), description: description.value() });
      setCustomModules([...(editor.card.customModules || []), added]);
      closePopup();
    });
    cancel.addEventListener("click", () => closePopup());
    showPopup({ title: "Add your own module", body: form }).then(() => resolve(added));
    name.focus();
  });
}

/** A custom module's page, wired to the customModules auto-saver. */
function mountCustom(id, container) {
  const update = () => {
    const next = form.collect();
    editor.card.customModules = editor.card.customModules.map((m) => (m.id === id ? next : m));
    // the name shows as the page title, the narrow bar's module, and in the sidebar (just its text)
    $("module-title").textContent = $("editor-bar-module").textContent = next.name;
    $("module-description").textContent = next.description || "";
    const link = $("module-list").querySelector(`a[data-module="${id}"]`);
    if (link) link.firstChild.textContent = next.name;
  };
  const part = `customModules.${id}`;   // where this module's set-aside answers go
  const form = renderCustomModule(container, customModule(id), {
    // the name and description are edited in place, beside the page's title and lede
    head: { title: $("module-title"), titleTools: $("module-title-tools"), description: $("module-description"), descriptionTools: $("module-description-tools") },
    setAside: asideOf(editor.card.editor?.setAside, part),
    onInput: () => { update(); syncAside(part, form); editor.savers.customModules.schedule(); },
    onCommit: () => { update(); saveParts(syncAside(part, form) ? ["customModules", "editor"] : ["customModules"]); },
    onDelete: async () => {
      const m = customModule(id);
      const ok = await confirmPopup({
        title: `Delete “${m.name}”?`,
        message: ["This deletes the module and everything in it, and can’t be undone.", "To hide it instead, unselect it under Basics → Modules."],
        confirmLabel: "Delete",
      });
      if (!ok) return;
      setCustomModules(editor.card.customModules.filter((x) => x.id !== id));
      clearAside([part]);   // its set-aside answers go with it
      setModules(editor.card.modules.filter((x) => x !== id));
      location.hash = "#basics";
    },
  });
}

/** Change which modules are on, update the sidebar, and save. */
function setModules(modules) {
  editor.card.modules = modules;
  // a tick is a finished choice: save now rather than after the delay
  saveParts(["modules"]);
  refreshSuggestions();
}

/** Save these parts of the card now (each through its auto-saver). */
function saveParts(parts) {
  for (const part of parts) {
    editor.savers[part].schedule();
    editor.savers[part].flush();
  }
}

// ── suggestions ("update other modules" flags) ──────────────
// Worked out again after each finished change (see js/suggestions.js).
/** Work out the suggestions, and mark them in the sidebar. */
function updateSuggestions() {
  editor.suggestions = suggestionsFor(editor.card, {
    defaults: editor.defaults,
    approachLabel: (id) => editor.approachLabels?.[id] || id,
  });
  renderModuleList();
  $("editor-nav-flag").hidden = !editor.suggestions.some((s) => !s.quiet);
}
/** …and redraw the open module's suggestion box (in the editor, not set-up). */
function refreshSuggestions() {
  if (!editor.card || !editor.defaults) return;
  updateSuggestions();
  if ($("editor").hidden) return;
  // redrawn above the fields: keep the field you're in still, and if a new
  // suggestion lands out of sight above, point to it
  // (only for a suggestion that's new while this module is open, not one
  // drawn with the page, e.g. on a refresh)
  const box = $("module-suggestions");
  const sameModule = box.dataset.module === currentModuleId();
  const shown = new Set([...box.children].map((n) => n.dataset.id));
  keepPlace($("module-content"), renderSuggestionBox);
  if (sameModule && [...box.children].some((n) => !shown.has(n.dataset.id))) pointTo(box, "New suggestion");
}

/** The current module's suggestions, at the top of its page. */
function renderSuggestionBox() {
  const id = currentModuleId();
  const box = $("module-suggestions");
  box.replaceChildren(...editor.suggestions.filter((s) => s.module === id).map((s) => {
    const callout = el("div", { className: "callout" },
      // a lime pill when it asks for a decision, orange when it's just a note;
      // the word is the suggestion's own label, or Suggestion / Note
      el("p", {}, s.quiet ? el("span", { className: "tag", textContent: s.label || "Note" }) : chip(s.label || "Suggestion"), " ", s.title),
      el("p", {}, ...richText(s.message)),
      // changes, one per line, each with a pixel plus or minus
      ...(s.lists || []).flatMap((list) => [
        list.heading ? el("p", { className: "field-hint", textContent: list.heading }) : null,
        el("ul", { className: "change-list plain-list" }, ...list.lines.map((l) =>
          el("li", {}, el("span", { className: l.sign === "+" ? "pixel-plus" : "pixel-minus" }, el("span", { className: "visually-hidden", textContent: l.sign === "+" ? "Added: " : "Removed: " })), l.text,
            ...(l.chip ? [" ", chip(l.chip)] : [])))),   // e.g. Kept / Undone
      ]),
      el("p", { className: "button-row" },
        s.apply ? button(s.applyLabel, "button button-small", () => applySuggestion(s.apply)) : null,
        s.alt ? button(s.alt.label, "link-button", () => applySuggestion(s.alt.apply)) : null,
        s.dismissible === false ? null : button("Dismiss", "link-button", () => dismissSuggestion(s)),
      ),
    );
    callout.dataset.id = s.id;   // which suggestion it is (to tell when a new one appears)
    return callout;
  }));
  box.dataset.module = id;
}

function applySuggestion(action) {
  saveParts(action(editor.card));
  updateSuggestions();
  renderModule({ focus: false });   // show what changed (or move on, if this module was hidden); draws the box
}

function dismissSuggestion(s) {
  editor.card.editor = { ...editor.card.editor, dismissedSuggestions: [...(editor.card.editor?.dismissedSuggestions || []), s.id] };
  saveParts(["editor"]);
  refreshSuggestions();
}

// ── module suggestions when the community type changes ──────
/**
 * On the set-up page: if the modules still match the old type's defaults,
 * switch them to the new type's straight away (and say so); if the person
 * has changed them, offer the new defaults with a button instead. In the
 * editor (autoApply: false) it always offers, never changes by itself.
 * popups: false (set-up, where the modules come last anyway) says so only
 * in the callout by the picker, without a pop-up.
 */
function suggestModules(hintEl, picker, fromType, toType, { apply, autoApply = true, popups = true }) {
  const s = moduleSuggestion(editor.defaults, picker.value(), { fromType, toType });
  hintEl.replaceChildren();
  if (!s.add.length && !s.remove.length) return;

  const label = (id) => editor.defaults.modules.find((m) => m.id === id)?.label || id;
  const typeLabel = editor.basicsData.types.find((t) => t.id === toType)?.label || "no type";
  const changes = [
    ...s.add.map((id) => `add ${label(id)}`),
    ...s.remove.map((id) => `remove ${label(id)}`),
  ].join(", ");
  const showPicker = () => hintEl.scrollIntoView({ behavior: "smooth", block: "center" });

  if (s.untouched && autoApply) {
    apply(s.next);
    hintEl.append(el("div", { className: "callout" }, el("p", { textContent: `Updated for ${typeLabel}: ${changes}.` })));
    if (!popups) return;

    const showMe = el("button", { type: "button", className: "link-button", textContent: "Show me" });
    showPopup({
      title: "Modules updated",
      body: el("div", {},
        el("p", { textContent: `Because you chose ${typeLabel}, we updated what your card covers: ${changes}.` }),
        el("p", { textContent: "You can change this any time." }),
        el("p", { className: "button-row" }, showMe),
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
  const inlineUse = button("Use suggestion", "link-button", use);
  hintEl.append(el("div", { className: "callout" },
    el("p", {}, el("b", { className: "mono-u", textContent: "Suggested modules. " }), `For ${typeLabel}: ${changes}. `, inlineUse),
  ));
  if (!popups) return;

  const popUse = el("button", { type: "button", className: "button button-small", textContent: "Use suggestion" });
  const popShow = el("button", { type: "button", className: "link-button", textContent: "Show me" });
  const popLater = el("button", { type: "button", className: "link-button", textContent: "Not now" });
  showPopup({
    title: "Suggested changes",
    body: el("div", {},
      el("p", { textContent: `Changing your community type to ${typeLabel} suggests changes to your card’s modules: ${changes}.` }),
      el("p", { textContent: "Your current modules stay as they are unless you choose to use the suggestion." }),
      el("p", { className: "button-row" }, popUse, popShow, popLater),
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
const PART_NAMES = { modules: "the module list", customModules: "your own modules", editor: "the editor’s notes (e.g. dismissed suggestions)" };
const partName = (p) => PART_NAMES[p] || moduleLabel(p);

function showConflict() {
  // every part not yet saved: refused, or still waiting behind the refused one
  const names = unsavedParts().map(partName);
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
      el("p", { className: "button-row" }, latest, mine),
    ),
  });

  const choose = async (keepMine) => {
    latest.disabled = mine.disabled = true;
    try {
      const { cardId, secret } = loadSession();
      const fresh = await getCard(cardId, secret);
      if (keepMine) {
        for (const p of unsavedParts()) fresh[p] = editor.card[p];   // (as they are now: more may have stopped since it opened)
        editor.card = fresh;
        editor.version = fresh.updatedAt;
        stopsShown = new Set();
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
// In blocks: Basics' groups (about, target scales, values), then the
// modules. Each block's Next shows the one after, once its required answers
// are in; "Show all fields at once" shows them all. Continue waits for
// everything required, and says what's missing.
let setupPicker = null;
let setupForm = null;   // set-up's Basics form
let setupBlocks = [];   // [{ element, next: { row, button, hint } | null }]

/** What's still needed, per block (the last one: the modules). */
function setupMissing() {
  const missing = missingBasics(editor.card.basics, editor.basicsData);
  return setupBlocks.map((_, i) => i < setupBlocks.length - 1
    ? missing.filter((m) => m.group === i).map((m) => m.text)
    : setupPicker.value().length ? [] : ["at least one module"]);
}
const stillNeeded = (texts) => (texts.length ? `Still needed: ${listText(texts)}.` : "");

function refreshSetup() {
  const missing = setupMissing();
  setupBlocks.forEach((b, i) => {
    if (!b.next) return;
    b.next.button.disabled = missing[i].length > 0;
    b.next.hint.textContent = stillNeeded(missing[i]);
  });
  const all = missing.flat();
  $("setup-continue").disabled = all.length > 0;
  $("setup-missing").textContent = stillNeeded(all);
}

/** Show blocks 0…last (and their Next only on the last shown, if there's one after). */
function showSetupBlocks(last) {
  setupBlocks.forEach((b, i) => {
    b.element.hidden = i > last;
    if (b.next) b.next.row.hidden = i !== last;
  });
  $("setup-finish").hidden = last < setupBlocks.length - 1;
}

/** Where set-up starts: everything with "Show all", else up to the first block still missing something. */
function firstSetupBlocks() {
  if ($("setup-show-all").checked) return showSetupBlocks(setupBlocks.length - 1);
  const missing = setupMissing();
  const first = missing.findIndex((m) => m.length);
  showSetupBlocks(first === -1 ? setupBlocks.length - 1 : first);
}

function showSetup(opts) {
  // modules are only written on Continue: until then the card counts as
  // not set up, so a refresh comes back here
  // a fork starts with its source's modules ticked; a new card with its type's
  const fork = editor.card.forkedFrom;
  const suggested = editor.card.editor?.forkModules || startingModules(editor.defaults, { communityType: editor.card.basics?.type });
  drawSetupPicker([...new Set([...suggested, ...(editor.card.customModules || []).map((m) => m.id)])]);
  // …and a note on what it was given (closable)
  $("setup-fork").hidden = !fork;
  if (fork) {
    const { notCopiedBrief, prefilledTargets } = forkCopies(fork.mode);
    const mode = MODES.find((m) => m.id === fork.mode)?.label || fork.mode;
    $("setup-fork").replaceChildren(el("div", { className: "callout" },
      el("p", {}, el("b", { className: "mono-u", textContent: "Forked " }), `from ${fork.name || "another card"} (${mode} view): your card starts with everything that view shares. Change anything.`),
      prefilledTargets ? el("p", { className: "field-hint", textContent: `Where you’d like to be on the scales starts at ${fork.name || "that card"}’s scales (what its choices add up to).` }) : null,
      el("p", { className: "field-hint", textContent: `Not copied: ${listText(notCopiedBrief)}.` }),
      el("p", {}, button("Dismiss", "link-button", () => { $("setup-fork").hidden = true; }))));
  }
  $("setup-modules-hint").replaceChildren();
  setupForm = mountBasics($("setup-basics"), {
    onTypeChange: (from, to) => suggestModules($("setup-modules-hint"), setupPicker, from, to, {
      apply: (next) => {
        setupPicker.set(next);
        refreshSetup();
      },
      popups: false,
    }),
    afterChange: refreshSetup,
  });
  setupBlocks = [...setupForm.groups, $("setup-modules-block")].map((element, i, all) => {
    if (i === all.length - 1) return { element, next: null };
    const nextButton = button("Next", "button", () => {
      row.hidden = true;
      const after = setupBlocks[i + 1];
      reveal(after.element);
      if (after.next) after.next.row.hidden = false;
      if (i + 1 === setupBlocks.length - 1) $("setup-finish").hidden = false;
      after.element.querySelector("input, select, textarea")?.focus({ preventScroll: true });
      after.element.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const hint = el("p", { className: "field-hint", id: `setup-next-hint-${i}` });
    nextButton.setAttribute("aria-describedby", hint.id);
    const row = el("div", { className: "setup-next" }, el("p", {}, nextButton), hint);
    element.append(row);
    return { element, next: { row, button: nextButton, hint } };
  });
  $("setup-show-all").checked = getPref("setupShowAll", false);
  firstSetupBlocks();
  refreshSetup();
  showError($("setup-error"), "");
  show("setup", opts);
  if (opts?.focus !== false) setupForm.focusFirst();
}

$("setup-show-all").addEventListener("change", (e) => {
  setPref("setupShowAll", e.target.checked);
  firstSetupBlocks();
});

function drawSetupPicker(selected) {
  setupPicker = renderModulePicker($("setup-modules"), editor.defaults, selected, {
    custom: editor.card.customModules || [],
    onChange: () => {
      $("setup-modules-hint").replaceChildren();
      refreshSetup();
    },
    // a new custom module starts selected
    onAdd: () => addCustomModule().then((m) => m && drawSetupPicker([...setupPicker.value(), m.id])),
  });
}

$("setup-continue").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (setupMissing().flat().length) return refreshSetup();   // (the button is disabled until then)
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
    const kind = errorKind(err);
    if (kind === "stale") showStale();
    else if (kind === "conflict") showConflict();
    showError($("setup-error"), MESSAGES[kind] || MESSAGES.other);
  } finally {
    btn.disabled = false;
    btn.textContent = "Continue to the editor";
  }
});

// ── editor ──────────────────────────────────────────────────
function showEditor(opts) {
  $("editor-id").textContent = $("editor-bar-id").textContent = editor.card.id;
  renderCardName();
  updateSuggestions();
  delete $("module-suggestions").dataset.module;   // its box is drawn fresh with the page (no "new suggestion" pill)
  show("editor", { focus: false });
  renderModule(opts);   // (draws the suggestion box)
}

function renderCardName() {
  $("editor-name").textContent = $("editor-bar-name").textContent = editor.card.basics?.name || "Untitled card";
}

// Each module is a link to #<module id>; the hash picks what the main area shows.
// (#export isn't a module: it's the Export page, opened from the sidebar)
const EXPORT = { id: "export", label: "Export", description: "Publish your card, and read through and download its answers." };
function currentModuleId() {
  const id = location.hash.slice(1);
  if (id === EXPORT.id) return id;
  const entries = moduleEntries(editor.defaults, editor.card);
  return entries.some((m) => m.id === id) ? id : "basics";
}

function renderModuleList() {
  $("module-list").replaceChildren(
    ...moduleEntries(editor.defaults, editor.card).map((m) => {
      // a module with suggestions waiting gets a small orange dot
      const flagged = editor.suggestions.some((s) => s.module === m.id && !s.quiet);
      const a = el("a", { href: `#${m.id}` }, m.label, flagged ? el("span", { className: "flag-dot" }, el("span", { className: "visually-hidden", textContent: " (has a suggestion)" })) : null);
      a.dataset.module = m.id;
      return el("li", {}, a);
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

// the space under a module that holds the page's length when it gets
// shorter while you're scrolled down (js/scroll.js holdFloor)
const floor = holdFloor($("module-panel"));

function renderModule({ focus = true } = {}) {
  if (!editor.card || $("editor").hidden) return;
  const id = currentModuleId();
  const m = id === EXPORT.id ? EXPORT : moduleEntries(editor.defaults, editor.card).find((e) => e.id === id);
  markCurrentModule();

  $("module-title").textContent = m.label;
  $("module-description").textContent = m.description || "";
  $("module-title-tools").replaceChildren();   // a custom module puts its edit buttons here
  $("module-description-tools").replaceChildren();
  $("module-title").hidden = $("module-description").hidden = false;   // (in case one was left open for editing)
  renderSuggestionBox();
  floor.reset();   // a new module: no held-open space from the last one
  const content = $("module-content");
  content.style.minHeight = "";   // (held only while a module's data loads, below)

  if (id === "basics" && basicsMode() === "summary") {
    // Basics opens as a summary (it was filled in during set-up), with what
    // to do next; Edit brings the form back
    const summaryHost = el("div");
    content.replaceChildren(el("p", { className: "button-row" }, basicsModeButton("Edit", "edit")), summaryHost);
    const builtIn = editor.defaults.modules.map((x) => x.id);
    const order = (x) => (builtIn.includes(x.id) ? builtIn.indexOf(x.id) : builtIn.length);   // built-in order, custom last
    renderBasicsSummary(summaryHost, editor.card.basics, editor.basicsData, {
      entries: moduleEntries(editor.defaults, editor.card).filter((x) => x.id !== "basics").sort((a, b) => order(a) - order(b)),
      started: moduleHasContent,
      forkedFrom: editor.card.forkedFrom,
    });
  } else if (id === "basics") {
    const basicsHost = el("div");
    const pickerHint = el("div");
    pickerHint.setAttribute("aria-live", "polite");
    const pickerHost = el("div");
    content.replaceChildren(
      el("p", { className: "button-row" }, basicsModeButton("Done editing", "summary")),
      basicsHost,
      el("h2", { textContent: "Modules" }),
      el("p", { textContent: "The parts this card covers. Unselecting one hides it from the sidebar; anything already filled in is kept." }),
      pickerHint,
      pickerHost,
    );

    const picker = renderModulePicker(pickerHost, editor.defaults, editor.card.modules, {
      custom: editor.card.customModules || [],
      onChange: (modules) => {
        pickerHint.replaceChildren();
        setModules(modules);
      },
      hasContent: moduleHasContent,
      // a new custom module starts ticked, and opens so it can be filled in
      onAdd: () => addCustomModule().then((m) => {
        if (!m) return;
        setModules([...editor.card.modules, m.id]);
        location.hash = `#${m.id}`;
      }),
    });
    // in the editor the person has already chosen modules, so a type change
    // only ever suggests (with a button); it never changes them by itself
    mountBasics(basicsHost, {
      onTypeChange: (from, to) => suggestModules(pickerHint, picker, from, to, {
        apply: (next) => { picker.set(next); setModules(next); },
        autoApply: false,
      }),
    });
  } else if (isCustom(id)) {
    mountCustom(id, content);
  } else if (id === EXPORT.id) {
    content.replaceChildren(el("p", { className: "screen-loading", textContent: "Loading…" }));
    loadExportData().then((data) => {
      if (!editor.card || currentModuleId() !== id) return;   // forgotten, or moved on, while it loaded
      const publishHost = el("section", { className: "publish" });
      const exportHost = el("section");
      content.replaceChildren(publishHost, exportHost);
      renderPublish(publishHost, {
        get card() { return editor.card; },
        data,
        defaults: editor.defaults,
        setAttribution: (attribution) => {
          editor.card.attribution = attribution;
          editor.savers.attribution.schedule();
        },
        onPublishing: (publishing) => { editor.card.publishing = publishing; },
      });
      renderExport(exportHost, editor.card, data, editor.defaults);
      exportHost.append(renderCard(publicView(editor.card, "full", { ruleSchema: data.ruleSchema, scales: data.scales }), data, editor.defaults, { heading: "h3" }));
    }, (err) => {
      console.error(err);
      content.replaceChildren(el("p", { className: "form-error", textContent: MESSAGES.other }));
    });
  } else if (SECTIONS[id]) {
    // its reference data first (fetched once, then cached), then the form
    // keep the page's height while the next module loads, so it doesn't collapse and re-grow
    content.style.minHeight = `${content.offsetHeight}px`;
    content.replaceChildren(el("p", { className: "screen-loading", textContent: "Loading…" }));
    SECTIONS[id].load().then((data) => {
      if (!editor.card || currentModuleId() !== id) return;   // forgotten, or moved on, while it loaded
      mountSection(id, content, data);
      content.style.minHeight = "";
    }, (err) => {
      console.error(err);
      content.style.minHeight = "";
      content.replaceChildren(el("p", { className: "form-error", textContent: MESSAGES.other }));
    });
  } else {
    content.replaceChildren(el("p", { textContent: "This module’s form is coming soon." }));
  }

  if (focus) $("module-title").focus();
}

// Basics' view (summary or edit) is remembered per card in this browser, so
// it's how the person left it when they come back
const basicsMode = () => getPref(`basics-mode:${editor.card.id}`, "summary");
function basicsModeButton(label, mode) {
  const b = button(label, "button button-small", async () => {
    if (mode === "summary") await flushAll();   // anything just typed is saved first
    setPref(`basics-mode:${editor.card.id}`, mode);
    renderModule();
  });
  return b;
}

addEventListener("hashchange", () => {
  setEditorNav(false);   // picking a module closes the narrow-screen panel
  renderModule();
});

// ── editor: narrow-screen sidebar panel ─────────────────────
// the module list drops down from the bar (js/sidebar.js); one open at a
// time with the bar's + menu
const editorNav = narrowSidebar($("editor-nav"), { onToggle: (open) => { if (open) setBarMenu(false); } });
const setEditorNav = editorNav.set;
// the bar's +: Save, Forget and Reset
function setBarMenu(open) {
  $("editor-bar-menu").hidden = !open;
  $("editor-bar-more").setAttribute("aria-expanded", String(open));
  if (open) setEditorNav(false);
}
$("editor-bar-more").addEventListener("click", () => setBarMenu($("editor-bar-menu").hidden));
$("editor-bar-menu").addEventListener("click", (e) => { if (e.target.closest("button, a")) setBarMenu(false); });
document.addEventListener("click", (e) => { if (!e.target.closest(".editor-bar-more")) setBarMenu(false); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("editor-bar-menu").hidden) { setBarMenu(false); $("editor-bar-more").focus(); }
});
// widening past the breakpoint (--narrow in styles.css) closes the menu (and the panel: js/sidebar.js)
matchMedia(`(width >= ${narrowWidth()})`).addEventListener("change", () => setBarMenu(false));

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
  const ok = await confirmPopup({
    title: "Forget this card on this device?",
    message: "You’ll need its card ID and the secret you saved to open it again.",
    confirmLabel: "Forget",
  });
  if (!ok) return;
  await flushAll();
  // anything that still couldn't be saved (offline, refused) would be lost
  if (hasUnsaved() && !(await confirmPopup({
    title: "Some changes aren’t saved",
    message: "They couldn’t be saved yet (see the save status). Forget the card anyway and lose them?",
    confirmLabel: "Forget anyway",
  }))) return;
  resetSavers();
  forgetSession();
  editor.card = null;
  history.replaceState(null, "", location.pathname);   // drop the #module from the address
  setEditorNav(false);
  show("start");
}

// two Forget buttons: the sidebar's, and the narrow-screen bar's
for (const btn of document.querySelectorAll("[data-forget]")) btn.addEventListener("click", forgetCard);

// ── editor: reset ───────────────────────────────────────────
// Clear chosen modules' answers, or start over: everything cleared and back
// to set-up, keeping the card's ID and secret. The server puts the parts
// back as they are on a new card (updateCard's reset); a custom module is
// cleared by emptying its fields.
function showReset() {
  const entries = moduleEntries(editor.defaults, editor.card).filter((e) => e.id !== "basics");
  const mode = renderChoices({
    type: "radio",
    legend: "What to reset",
    legendHidden: true,
    options: [
      { id: "modules", label: "Clear some modules", description: "Empty the answers in the modules you select. Everything else stays." },
      { id: "all", label: "Start over", description: "Clear everything — Basics, which modules you use, and every answer — and go back to set-up. The card keeps its ID and secret." },
    ],
    selected: "modules",
    onChange: (v) => { which.element.hidden = v !== "modules"; },
  });
  const which = renderChoices({ legend: "Modules to clear", options: entries.map(({ id, label }) => ({ id, label })) });
  const error = el("p", { className: "form-error", hidden: true });
  const go = button("Reset", "button button-small", async () => {
    const all = mode.value() === "all";
    const ids = which.value();
    if (!all && !ids.length) return showError(error, "Select at least one module to clear.");
    go.disabled = true;
    try {
      await doReset(all, ids);
      closePopup();
    } catch (err) {
      console.error(err);
      if (errorKind(err) === "stale") return showStale();
      showError(error, MESSAGES[errorKind(err)] || "Couldn’t reset. Please try again.");
      go.disabled = false;
    }
  });
  showPopup({
    title: "Reset",
    body: el("div", {},
      mode.element,
      which.element,
      el("p", { className: "field-hint", textContent: "This can’t be undone." }),
      error,
      el("p", { className: "button-row" }, go, button("Cancel", "link-button", closePopup)),
    ),
  });
}

async function doReset(all, ids) {
  if (await isStale({ force: true })) throw staleError();   // old code mustn't reset into an old shape
  await flushAll();
  const custom = all ? [] : ids.filter((id) => customModule(id));
  const reset = all ? [...PARTS, "attribution"] : ids.filter((id) => !customModule(id));
  const updates = custom.length
    ? { customModules: editor.card.customModules.map((m) => (custom.includes(m.id) ? { ...m, fields: [] } : m)) }
    : {};
  // the editor-only state that goes with a module goes with it: its
  // set-aside answers, and Infrastructure's pre-fill / the structure's log
  if (!all) {
    const ed = editor.card.editor || {};
    updates.editor = { ...ed, setAside: withoutAside(ed.setAside, [...reset, ...custom.map((id) => `customModules.${id}`)]) };
    if (reset.includes("infrastructure")) updates.editor.costsPrefill = null;
    if (reset.includes("membership")) Object.assign(updates.editor, { structureReviewed: [], structureLog: [] });
  }
  const { cardId, secret } = loadSession();
  // built on the version this page has: refused if the card changed elsewhere
  const { card } = await updateCard(cardId, secret, updates, { reset, ifUpdatedAt: editor.version });
  if (all) history.replaceState(null, "", location.pathname);   // back to set-up, not a module
  await openCard({ card });
}

// two Reset buttons: the sidebar's, and the narrow-screen bar's
for (const btn of document.querySelectorAll("[data-reset]")) btn.addEventListener("click", showReset);

// ── on load: pick up where this tab (or device) left off ───
startFreshness();
const session = loadSession();
if (!session) show("start", { focus: false });
else if (!session.confirmed) showKey(session, { focus: false });
else openCard({ focus: false });
