// A published card (card.html, at /c/crd_…): the card as its view mode
// shows it, read through the server (getPublicCard), never from the
// database directly. ?v=2 shows an earlier version. Above the card: its
// version, credit and link; then the card itself (card-view.js renderCard,
// as Export shows it); the Markdown download is Export's own outline.
//
// A pixel flag in the corner, under the back-to-top arrow, reports the card
// to the CROW team (reportCard); not on a preview.
//
// "Fork this card" (Foggy, Misty and Full): a pop-up says what the new card
// gets, then the server makes it from this public copy (forkCard), and the
// editor opens at "Save your key".
//
// #preview: the editor's "Preview what readers see" (js/publish.js) opens
// this page in a new tab and hands it the card, by message, as it would be
// published; nothing is fetched or stored.

import { el, button } from "./dom.js";
import { getPublicCard, forkCard, reportCard, errorKind } from "./api.js";
import { pixelButton } from "./site.js";
import { renderChoices } from "./controls/choices.js";
import { textField } from "./controls/fields.js";
import { showPopup, closePopup } from "./popup.js";
import { loadSession, saveSession } from "./session.js";
import { loadExportData, viewOutline, toMarkdown, download, fileName } from "./export.js";
import { renderCard } from "./card-view.js";
import { loadModuleDefaults } from "./modules.js";
import { MODES, forkCopies, REPORT_REASONS } from "./view-modes.js";

const main = document.getElementById("card-page");
const cardId = location.pathname.match(/\/c\/(crd_[A-Za-z0-9]+)/)?.[1];
const isPreview = location.hash === "#preview";
const version = Number(new URLSearchParams(location.search).get("v")) || null;

const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function unavailable(message) {
  document.title = "Card not available — CROW";
  main.replaceChildren(
    el("h1", { textContent: "This card isn’t available" }),
    el("p", { className: "lede lede-small", textContent: message }),
    el("p", {}, "You can ", el("a", { className: "inline", href: "/make.html", textContent: "make a card of your own" }), "."),
  );
}

/** The editor's draft, as it would be published (sent by the tab that opened this one). */
function previewFromEditor() {
  return new Promise((resolve, reject) => {
    if (!window.opener) return reject(new Error("no editor"));
    addEventListener("message", (e) => {
      if (e.source === window.opener && e.origin === location.origin && e.data?.type === "crow-preview") resolve(e.data.view);
    });
    window.opener.postMessage({ type: "crow-preview-ready" }, location.origin);
    setTimeout(() => reject(new Error("no answer")), 5000);
  });
}

async function show() {
  if (!cardId && !isPreview) return unavailable("There’s no card at this address. Check the link you were given.");
  let pub, data, defaults;
  try {
    [pub, data, defaults] = await Promise.all([isPreview ? previewFromEditor() : getPublicCard(cardId, version), loadExportData(), loadModuleDefaults()]);
  } catch (err) {
    console.error(err);
    if (isPreview) return unavailable("This preview has closed. Open it again from the editor’s Export page.");
    return unavailable(errorKind(err) === "no-card"
      ? "It may not have been published, or it may have been unpublished. Check the link you were given."
      : "We couldn’t load it just now. Check your connection, then reload the page.");
  }
  if (isPreview) return draw(pub, data, defaults, { preview: true });
  draw(pub, data, defaults);
  const report = pixelButton(FLAG, "report-button", "Report this card");
  report.addEventListener("click", () => askReport(pub));
  document.body.append(report);
}

/** Draw a public copy (or, preview, the editor's draft as it would be published). */
function draw(pub, data, defaults, { preview = false } = {}) {
  const card = pub.card;
  const b = card.basics || {};
  const mode = MODES.find((m) => m.id === pub.mode);
  document.title = `${preview ? "Preview: " : ""}${b.name || "A community"} — CROW Card`;
  if (pub.listed && !preview) document.querySelector('meta[name="robots"]')?.remove();   // listed cards may be found by search engines


  // the version shown, and the others
  const latest = pub.versions.at(-1)?.version;
  const versionLink = (v) => `/c/${pub.id}${v === latest ? "" : `?v=${v}`}`;
  const versions = el("details", { className: "card-versions" },
    el("summary", { className: "mono-u", textContent: `Versions (${pub.versions.length})` }),
    el("ul", { className: "plain-list" }, ...[...pub.versions].reverse().map((v) => el("li", {},
      v.version === pub.version
        ? el("b", { textContent: `v${v.version}` })
        : el("a", { className: "inline", href: versionLink(v.version), textContent: `v${v.version}` }),
      ` · ${date(v.publishedAt)}${v.note ? ` · ${v.note}` : ""}`))));

  const link = `${location.origin}/c/${pub.id}`;
  const copy = button("Copy link", "link-button", () => navigator.clipboard?.writeText(link).then(() => { copy.textContent = "Copied"; }));
  const credit = pub.credit ? [pub.credit.name, pub.credit.organization].filter(Boolean).join(", ") : null;
  // where this card was forked from, if it was
  const from = pub.forkedFrom;
  const forkedFrom = from ? el("p", {}, "Forked from ",
    el("a", { className: "inline", href: `/c/${from.cardId}${from.version ? `?v=${from.version}` : ""}`, textContent: from.name || "another card" }),
    from.version ? ` · v${from.version}` : "",
    from.mode ? ` · ${MODES.find((m) => m.id === from.mode)?.label || from.mode} view` : "") : null;
  const fork = !preview && mode?.forkable ? button("Fork this card", "button button-small", () => askFork(pub, mode)) : null;

  const outline = viewOutline(pub, data, defaults);
  const downloads = pub.mode === "full" && !preview
    ? el("p", { className: "button-row" },
      button("Raw data (JSON)", "button button-small", () => download(`${fileName(card)}.json`, `${JSON.stringify(card, null, 2)}\n`, "application/json")),
      button("Documentation (Markdown)", "button button-small", () => download(`${fileName(card)}.md`, toMarkdown(outline, card), "text/markdown")))
    : null;

  main.replaceChildren(...[
    el("div", { className: "callout card-meta" },
      preview
        ? el("p", {}, el("b", { className: "mono-u", textContent: "Preview" }), ` · not published · ${mode?.label || pub.mode} view. This is how your card would look to readers. Close this tab to go back to the editor.`)
        : el("p", {},
          el("b", { className: "mono-u", textContent: `v${pub.version}` }),
          ` · published ${date(pub.publishedAt)}`,
          pub.version !== latest ? el("span", {}, " · an earlier version (", el("a", { className: "inline", href: versionLink(latest), textContent: "see the latest" }), ")") : null),
      credit ? el("p", { textContent: `Shared by ${credit}` }) : null,
      forkedFrom,
      preview ? null : versions,
      preview ? null : el("p", { className: "button-row" }, copy, fork)),
    downloads,
    renderCard(pub, data, defaults, { heading: "h1" }),
  ].filter(Boolean));
}

show();

/**
 * "Fork: Garden Club (Misty view)": what the new card gets and doesn't, then
 * the server makes it, and the editor opens at "Save your key" (the new
 * card's key, saved in this browser like a new card's).
 */
function askFork(pub, mode) {
  const { copied, notCopied } = forkCopies(pub.mode);
  const current = loadSession();
  const error = el("p", { className: "form-error", role: "alert", hidden: true });
  const start = button("Fork this card", "button button-small", async () => {
    start.disabled = true;
    start.textContent = "Making your card…";
    error.hidden = true;
    try {
      const { cardId, secret } = await forkCard(pub.id, pub.version);
      saveSession({ cardId, secret, confirmed: false });   // (not yet confirmed: the editor asks them to save it first)
      location.href = "/make.html";
    } catch (err) {
      console.error(err);
      error.textContent = errorKind(err) === "offline" ? "Can’t reach the server. Check your connection and try again." : "Something went wrong. Please try again.";
      error.hidden = false;
      start.disabled = false;
      start.textContent = "Fork this card";
    }
  });
  const list = (title, items) => el("div", {}, el("p", { className: "mono-u summary-label", textContent: title }), el("ul", {}, ...items.map((t) => el("li", { textContent: t }))));
  showPopup({
    title: `Fork: ${pub.card.basics?.name || "this card"} (${mode.label} view)`,
    body: el("div", {},
      el("p", { textContent: "Start a card of your own from this one. You get a copy of what this view shares, to change as you like; this card isn’t changed." }),
      el("div", { className: "fork-lists" }, list("Copied", copied), list("Not copied", notCopied)),
      current ? el("p", { className: "callout callout-small", textContent: `This browser is editing card ${current.cardId}. Forking switches to the new card, so make sure you’ve saved ${current.cardId}’s ID and secret first.` }) : null,
      error,
      el("p", { className: "button-row" }, start, button("Cancel", "link-button", closePopup))),
  });
}

// the report flag: a straight pole, its cloth with a slight ripple
const FLAG = [
  "xxx..xx",
  "xxxxxxx",
  "xxxxxxx",
  "xxxxxxx",
  "x..xx..",
  "x......",
  "x......",
];

/** "Report: Garden Club": a reason or a note on what's wrong (or both), an optional email, then send it to the CROW team. */
function askReport(pub) {
  const reason = renderChoices({ type: "radio", legend: "Why are you reporting it?", layout: "buttons", options: REPORT_REASONS, clearable: true });
  const details = textField({ label: "What’s wrong", multiline: true, hint: "Choose a reason above, or say what’s wrong here (or both). Up to 1,000 characters." });
  details.input.maxLength = 1000;
  const email = textField({ label: "Your email (optional)", type: "email", hint: "Optional, but strongly recommended, so the CROW team can follow up with you. Only the team sees it." });
  const error = el("p", { className: "form-error", role: "alert", hidden: true });
  const send = button("Send report", "button button-small", async () => {
    if (!reason.value() && !details.value()) {   // (a reason, or at least a note)
      error.textContent = "Choose a reason, or say what’s wrong.";
      error.hidden = false;
      return;
    }
    send.disabled = true;
    send.textContent = "Sending…";
    error.hidden = true;
    try {
      await reportCard(pub.id, { version: pub.version, reason: reason.value(), details: details.value(), email: email.value() });
      showPopup({ title: "Thanks", message: "The CROW team will look at this card." });
    } catch (err) {
      console.error(err);
      error.textContent = {
        "too-big": "This card has already been reported, and the CROW team will look at it.",
        invalid: err.message,
        offline: "Can’t reach the server. Check your connection and try again.",
      }[errorKind(err)] || "Something went wrong. Please try again.";
      error.hidden = false;
      send.disabled = false;
      send.textContent = "Send report";
    }
  });
  showPopup({
    title: `Report: ${pub.card.basics?.name || "this card"}`,
    body: el("div", { className: "fields" }, reason.element, details.element, email.element, error,
      el("p", { className: "button-row" }, send, button("Cancel", "link-button", closePopup))),
  });
}
