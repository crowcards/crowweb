// Publishing, at the top of the Export page: the card's status and link, the
// view mode (with a preview of what readers see, in a new tab: the card page,
// handed the draft by message, never saved anywhere), listed / unlisted, contact
// and credit, a note on what changed, and the buttons: Publish; once
// published, "Publish your edits as v3" (only when the card has changed
// since: a new version) and "Apply these settings to v2" (only when the view
// mode, listed / unlisted or credit differ: no new version); Unpublish. The server does the work
// (functions/index.js); this only asks it, and shows what it said.
//
//   renderPublish(container, { card, data, defaults, setAttribution, onPublishing });
//
// card: the card (editor.card, read fresh on each change); data: Export's
// reference data (loadExportData); setAttribution(attribution): change and
// autosave the card's attribution part; onPublishing(publishing): the
// server's new publishing part, to keep on the card.

import { el, button } from "./dom.js";
import { renderChoices } from "./controls/choices.js";
import { textField } from "./controls/fields.js";
import { showPopup, closePopup, confirmPopup } from "./popup.js";
import { getPref, setPref } from "./prefs.js";
import { publishCard, updatePublishing, unpublishCard, errorKind } from "./api.js";
import { loadSession } from "./session.js";
import { flushAll } from "./autosave.js";
import { MODES, creditOf, contentFingerprint, publicView } from "./view-modes.js";
import { listText } from "./sections/basics.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;   // (the server checks the same)
const EMAIL_PREF = "contactEmail";            // a contact email remembered in this browser, for the next cards

/** A published card's link: /c/<card id> on this site. */
const cardLink = (id) => `${location.origin}/c/${id}`;

const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const modeLabel = (id) => MODES.find((m) => m.id === id)?.label || id;

export function renderPublish(container, ctx) {
  const { data, defaults, setAttribution, onPublishing } = ctx;
  const card = () => ctx.card;
  const pub = () => card().publishing || { status: "draft", mode: "minimal", listed: false, version: 0 };
  const settings = { mode: pub().mode || "minimal", listed: Boolean(pub().listed) };

  // a contact email remembered in this browser fills in a new card's
  if (!card().attribution?.contributorEmail && getPref(EMAIL_PREF, null)) {
    setAttribution({ ...card().attribution, contributorEmail: getPref(EMAIL_PREF, null) });
  }

  // ── status ────────────────────────────────────────────────
  const status = el("div", { className: "callout publish-status" });
  status.setAttribute("aria-live", "polite");
  /** "v2 · 8 Oct 2026 · Full · Listed" */
  const facts = (p) => `v${p.version} · ${date(p.publishedAt)} · ${modeLabel(p.mode)} · ${p.listed ? "Listed" : "Unlisted"}`;
  /** The card's link, with Copy. */
  const linkLine = () => {
    const link = cardLink(card().id);
    const copy = button("Copy", "link-button", () => navigator.clipboard?.writeText(link).then(() => { copy.textContent = "Copied"; }));
    return el("p", {}, el("a", { className: "inline", href: link, target: "_blank", rel: "noopener", textContent: link }), " ", copy);
  };
  function drawStatus() {
    const p = pub();
    const line = (label, text) => el("p", {}, el("b", { className: "mono-u", textContent: label }), ` · ${text}`);
    // taken down by the CROW team (4f): no link, nothing to publish
    if (p.hidden) {
      return status.replaceChildren(line("Taken down", "by the CROW team. Write to crowcards@princeton.edu if you think this is a mistake."), historyList(p) || "");
    }
    status.replaceChildren(...[
      p.status === "published" ? line("Published", facts(p))
        : p.status === "unpublished" ? line("Unpublished", `${p.version} ${p.version === 1 ? "version" : "versions"} kept privately; publishing again makes v${p.version + 1}.`)
          : line("Not published", "Publishing shares your card at a link, showing as much as the view mode you choose."),
      p.status === "published" ? linkLine() : null,
      p.status === "published" && hasEdits()
        ? el("p", { className: "field-hint", textContent: `Your card has changed since v${p.version}. Readers see v${p.version} until you publish the changes.` }) : null,
      historyList(p),   // (none until something is published; Unpublish beside the latest)
      p.status !== "draft" ? el("p", { className: "publish-wipe" }, wipe) : null,
    ].filter(Boolean));
  }

  /** The published versions, newest first: each with its date and note (a link to it while published). */
  function historyList(p) {
    const items = [...(p.history || [])].reverse();
    if (!items.length) return null;
    const latest = p.history.at(-1).version;
    return el("div", { className: "publish-history" },
      el("p", { className: "mono-u summary-label", textContent: "History" }),
      el("ul", { className: "plain-list" }, ...items.map((v) => el("li", {},
        p.status === "published"
          ? el("a", { className: "inline", href: `${cardLink(card().id)}${v.version === latest ? "" : `?v=${v.version}`}`, target: "_blank", rel: "noopener", textContent: `v${v.version}` })
          : el("b", { textContent: `v${v.version}` }),
        ` · ${date(v.publishedAt)}${v.note ? ` · ${v.note}` : ""}`,
        p.status === "published" && v.version === latest ? unpublish : null))));
  }

  /** What just happened, in a pop-up: for a published card, its details and link. */
  function told(title, message) {
    const p = pub();
    showPopup({
      title,
      body: el("div", {},
        ...(p.status === "published"
          ? [el("p", { textContent: facts(p) }), linkLine()]
          : []),
        message ? el("p", { textContent: message }) : null,
        el("p", { className: "button-row" },
          p.status === "published" ? el("a", { className: "button button-small", href: cardLink(card().id), target: "_blank", rel: "noopener", textContent: "Open the card" }) : null,
          button("Done", p.status === "published" ? "link-button" : "button button-small", closePopup))),
    });
  }

  // ── view mode, with a preview ─────────────────────────────
  // its hint: "… You can PREVIEW ↗ and read specs in the DOCS." (filled in once the preview link exists, below)
  const modeHint = el("p", { className: "field-hint" });
  const mode = renderChoices({
    type: "radio",
    legend: "How much readers see",
    layout: "buttons",
    before: [modeHint],
    hintBelow: true,   // (clicking one says what it shows, under the row)
    options: MODES.map(({ id, label, description }) => ({ id, label, description: `${description}${MODES.find((m) => m.id === id).forkable ? "" : " Can’t be used as a starting point by others."}` })),
    selected: settings.mode,
    onChange: (v) => { settings.mode = v; refresh(); },
  });
  // the preview: the card page in a new tab, showing the card as it is now,
  // in the chosen view mode (js/card-page.js #preview asks for it when it
  // loads; reloading it shows the card as it is then, while this page is open)
  const previewButton = button("Preview", "link-button", () => {
    const tab = window.open("/card.html#preview", "_blank");
    const reply = (e) => {
      if (tab.closed) return removeEventListener("message", reply);
      if (e.source !== tab || e.origin !== location.origin || e.data?.type !== "crow-preview-ready") return;
      tab.postMessage({ type: "crow-preview", view: {
        id: card().id, listed: settings.listed, version: null, publishedAt: null, versions: [],
        credit: creditOf(card().attribution), forkedFrom: card().forkedFrom ?? null,
        ...publicView(card(), settings.mode, { ruleSchema: data.ruleSchema, scales: data.scales }),
      } }, location.origin);
    };
    addEventListener("message", reply);
  });
  previewButton.append(el("span", { className: "icon-out", ariaHidden: "true" }));   // (a pixel arrow: it opens a new tab)
  previewButton.setAttribute("aria-label", "Preview what readers see (opens a new tab)");
  modeHint.append("How much of your card the published page shows. You can ", previewButton, " and read specs in the ",
    el("a", { href: "/docs.html#publishing", target: "_blank", rel: "noopener", textContent: "docs" }), ".");

  const listed = renderChoices({
    type: "radio",
    legend: "Who can find it",
    layout: "buttons",
    hintBelow: true,
    options: [
      { id: "unlisted", label: "Unlisted", description: "Only people you give the link to." },
      { id: "listed", label: "Listed", description: "In the Library, for anyone to find. The Library is coming soon: until then, listed cards can also only be opened by link." },
    ],
    selected: settings.listed ? "listed" : "unlisted",
    onChange: (v) => { settings.listed = v === "listed"; refresh(); },
  });

  // ── contact and credit (the card's private attribution part) ──
  const a = () => card().attribution || {};
  const changeAttribution = (patch) => { setAttribution({ ...a(), ...patch }); refresh(); };
  const check = (label, checked, onChange) => {
    const input = el("input", { type: "checkbox", checked });
    input.addEventListener("change", () => onChange(input.checked));
    return { element: el("label", { className: "check" }, input, label), input };
  };
  const email = textField({
    label: "Contact email",
    hint: "Required to publish. Only the CROW team sees this, to contact you about your card. It’s never shown publicly.",
    hintTip: true,
    type: "email",
    value: a().contributorEmail,
    onInput: () => changeAttribution({ contributorEmail: email.value() }),
    onCommit: () => { if (remember.input.checked) setPref(EMAIL_PREF, email.value()); },
  });
  const remember = check("Remember this email in this browser, for my next cards", Boolean(getPref(EMAIL_PREF, null)) && getPref(EMAIL_PREF, null) === a().contributorEmail,
    (on) => setPref(EMAIL_PREF, on ? email.value() : null));
  const name = textField({ label: "Your name", hint: "Optional. Shown on the published card only if you tick the box.", hintTip: true, value: a().contributorName, onInput: () => changeAttribution({ contributorName: name.value() }) });
  const showName = check("Show my name on the published card", Boolean(a().showName), (on) => changeAttribution({ showName: on }));
  const org = textField({ label: "Organisation", hint: "Optional. Shown on the published card only if you tick the box.", hintTip: true, value: a().organization, onInput: () => changeAttribution({ organization: org.value() }) });
  const showOrg = check("Show the organisation on the published card", Boolean(a().showOrganization), (on) => changeAttribution({ showOrganization: on }));
  // each box under its field (in the rows: .field-after)
  for (const [field, box] of [[email, remember], [name, showName], [org, showOrg]]) {
    box.element.classList.add("field-after");
    field.element.append(box.element);
  }

  // a changelog comment: optional, so its box opens only when asked for
  const note = textField({ label: "Changelog comment", hint: "A short note readers see with this version, e.g. “Added our conflict steps”.", multiline: true });
  let noteOpen = false;
  const addNote = button("Add a changelog comment", "link-button", () => {
    noteOpen = true;
    refresh();
    note.focus();
  });

  // ── what's missing, and the buttons ───────────────────────
  const missingLine = el("p", { className: "field-hint", id: "publish-missing" });
  const error = el("p", { className: "form-error", role: "alert", hidden: true });
  const publish = button("Publish", "button button-small", () => act(async (id, secret) => {
    await flushAll();   // the snapshot is what's on screen
    return publishCard(id, secret, { ...settings, note: note.value() });
  }, (p) => { note.input.value = ""; noteOpen = false; told(`Published v${p.version}`, p.listed ? null : "Only people you give the link to can open it."); }));
  publish.setAttribute("aria-describedby", missingLine.id);
  const update = button("Apply these settings", "button button-small", () => act(async (id, secret) => {
    await flushAll();   // (the credit comes from the saved attribution)
    return updatePublishing(id, secret, settings);
  }, () => told("Published card updated", "It now uses these settings. Its version stays the same.")));
  const unpublish = button("Unpublish", "link-button", async () => {
    if (await confirmPopup({ title: "Unpublish this card?", message: ["Its link will stop working, for everyone. Your published versions are kept privately, so publishing again carries on from them.", "Your card itself isn’t changed."], confirmLabel: "Unpublish" })) {
      act((id, secret) => unpublishCard(id, secret), (p) => told("Unpublished", `Its link no longer works. Your ${p.version} published ${p.version === 1 ? "version is" : "versions are"} kept privately.`));
    }
  });
  const wipe = button("Unpublish and delete history", "link-button link-button-danger", async () => {
    if (await confirmPopup({ title: "Unpublish and delete the history?", message: ["Its link will stop working, and every published version is deleted for good. Publishing again starts at v1.", "Your card itself isn’t changed."], confirmLabel: "Unpublish and delete" })) {
      act((id, secret) => unpublishCard(id, secret, { deleteHistory: true }), () => told("Unpublished", "Its link no longer works, and its published versions are deleted."));
    }
  });
  const buttons = el("div", { className: "button-row publish-buttons" });
  const upToDate = el("p", { className: "field-hint publish-up-to-date", textContent: "Your published card is up to date. No edits or settings to publish." });

  /** Edits since the published version (its content, not when it was saved). */
  const hasEdits = () => contentFingerprint(card()) !== pub().fingerprint;
  /** Settings here that differ from the published card's: the view mode, listed / unlisted, the credit. */
  const sameCredit = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const hasNewSettings = () => settings.mode !== pub().mode || settings.listed !== Boolean(pub().listed) || !sameCredit(creditOf(card().attribution), pub().credit);

  /** Run a publishing call with this card's key; then show the new status, and say what happened (said). */
  async function act(call, said) {
    error.hidden = true;
    for (const b of [publish, update, unpublish, wipe]) b.disabled = true;
    try {
      const { cardId, secret } = loadSession();
      const { publishing } = await call(cardId, secret);
      onPublishing(publishing);
      drawStatus();
      said(publishing);
    } catch (err) {
      console.error(err);
      error.textContent = err?.details?.missing
        ? `To publish, the card needs ${listText(err.details.missing)}.`
        : {
          "bad-key": "This card can’t be published: it may have been taken down by the CROW team. Write to crowcards@princeton.edu if you think this is a mistake.",
          offline: "Can’t reach the server. Check your connection and try again.",
          stale: "The editor was updated. Reload the page, then try again.",
        }[errorKind(err)] || "Something went wrong. Please try again.";
      error.hidden = false;
    }
    refresh();
  }

  /** The buttons and lines that depend on what's filled in and the status. */
  function refresh() {
    const p = pub();
    const c = card();
    const missing = [
      !c.basics?.name?.trim() && "a community name (Basics)",
      !c.basics?.type && "a community type (Basics)",
      !EMAIL.test(c.attribution?.contributorEmail?.trim() || "") && "a contact email",
    ].filter(Boolean);
    missingLine.textContent = missing.length ? `Still needed: ${listText(missing)}.` : "";
    // published: "publish your edits" only with edits; "apply these settings" only with new settings;
    // taken down: neither
    const published = p.status === "published";
    const edits = !p.hidden && (!published || hasEdits());
    const newSettings = !p.hidden && published && hasNewSettings();
    publish.textContent = published ? `Publish your edits as v${p.version + 1}` : "Publish";
    publish.hidden = !edits;
    publish.disabled = missing.length > 0;
    update.textContent = `Apply these settings to v${p.version}`;
    update.hidden = !newSettings;
    upToDate.hidden = !published || edits || newSettings;
    for (const b of [update, unpublish, wipe]) b.disabled = false;
    missingLine.hidden = !edits;
    note.element.hidden = !edits || !noteOpen;   // (a note goes with a new version)
    addNote.hidden = !edits || noteOpen;
    drawStatus();
    buttons.replaceChildren(publish, update);
  }

  drawStatus();
  refresh();
  container.replaceChildren(
    el("h2", { textContent: "Publish" }),
    status,
    el("div", { className: "fields" },
      mode.element,
      listed.element,
      el("div", { className: "field-rows" }, email.element, name.element, org.element)),
    el("h3", { textContent: "This version" }),
    el("div", { className: "fields" },
      el("p", {}, addNote),
      note.element,
      upToDate,
      buttons,
      missingLine,
      error,
    ),
  );
}
