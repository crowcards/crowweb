// style.html: every kind of field, colour and type size used in Make, drawn
// with the real shared controls so a styling change shows up here. The
// site's style reference (not linked from the site; noindex).
// Each specimen is labelled with where it comes from.

import { loadExportData } from "./export.js";
import { MODES, publicView } from "./view-modes.js";
import { renderCard } from "./card-view.js";
import { loadModuleDefaults } from "./modules.js";
import { el, chip, richText, button } from "./dom.js";
import { reveal } from "./reveal.js";
import { pointTo } from "./scroll.js";
import { editInPlace } from "./controls/inline-edit.js";
import { loadData } from "./data.js";
import { textField, selectField } from "./controls/fields.js";
import { renderChoices, scaleField, choiceTable, YES_NO, YES_NO_VARIES } from "./controls/choices.js";
import { suggestField } from "./controls/suggest.js";
import { tagList, tagInput } from "./controls/tags.js";
import { renderRows } from "./controls/rows.js";
import { pickList } from "./controls/picklist.js";
import { foldSection } from "./controls/fold.js";
import { tabBox } from "./controls/tabs.js";
import { showPopup, closePopup, confirmPopup } from "./popup.js";
import { renderBasicsSummary, loadBasicsData, targetScale } from "./sections/basics.js";
import { alikeStrip } from "./controls/alike.js";
import { renderPublish } from "./publish.js";
import { renderRules, loadRulesData } from "./sections/rules.js";

const slot = (id) => document.querySelector(`[data-ft="${id}"]`);
/** A labelled specimen: what it is, and where it comes from. */
const group = (title, source, ...children) => el("div", { className: "ft-group" },
  el("p", { className: "mono-u ft-label" }, title, " · ", el("code", { textContent: source })),
  ...children);
const opts = (...labels) => labels.map((label, i) => ({ id: `o${i}`, label, description: `What “${label}” means, in a sentence.` }));

// ── colour palette ───────────────────────────────────────────
// [token or CSS colour, name, where it's used]; values are read live, so
// they follow the light / dark toggle
const COLOURS = [
  ["Base tokens (styles.css :root)", [
    ["--bg", "background", "every page"],
    ["--ink", "text", "every page"],
    ["--gray", "secondary text", "hints, descriptions, labels"],
    ["--line", "rules & dividers", "borders, scrollbar"],
    ["--accent", "orange", "links, headings, buttons, tags"],
    ["--lime", "lime", "chips, hover text"],
    ["--ink-on-color", "text on orange / lime", "buttons, tags, chips (dark in both modes)"],
    ["--error", "error", "errors, remove / danger"],
  ]],
  ["Mixed from the base (color-mix tokens)", [
    ["--tint", "orange wash 8%", "callouts, generic table rows, docs Sometimes pill"],
    ["--tint-strong", "orange wash 14%", "inside a field while typing, tab hover, suggestion highlight, docs pills"],
    ["--glass", "see-through bg 85%", "header, menu"],
    ["--veil", "see-through bg 60%", "About-layout sheet, behind pop-ups"],
  ]],
  ["Not a token (one place)", [
    ["color-mix(in srgb, var(--gray) 12%, var(--bg))", "gray wash", "docs.css .cv.no / .rare, .badge.no"],
  ]],
];

function renderPalette() {
  const swatches = [];
  const body = COLOURS.map(([title, list]) => group(title, title.startsWith("Not a token") ? "used directly, where noted" : "tokens",
    el("div", { className: "ft-swatches" }, ...list.map(([value, name, where]) => {
      const css = value.startsWith("--") ? `var(${value})` : value;
      const code = el("p", { className: "mono" });
      swatches.push({ css, code, value });
      return el("div", { className: "ft-swatch" },
        el("div", { style: `background: ${css}` }),
        el("div", {},
          el("p", {}, el("b", { textContent: value.startsWith("--") ? value : name })),
          code,
          el("p", { className: "field-hint", textContent: value.startsWith("--") ? `${name} — ${where}` : where })));
    }))));
  // show each colour's current value (it changes with the theme)
  const probe = el("span", { hidden: true });
  document.body.append(probe);
  const refresh = () => swatches.forEach(({ css, code, value }) => {
    probe.style.color = css;
    code.textContent = value.startsWith("--") ? getComputedStyle(document.documentElement).getPropertyValue(value).trim() || "—" : getComputedStyle(probe).color;
  });
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  slot("palette").append(el("p", {}, "Toggle dark mode in the header to see the dark values."), ...body);
  refresh();
}

// ── type ─────────────────────────────────────────────────────
const SAMPLE = "Community rules for an open web — 0123456789";
const SIZES = [
  ["--fs-xs", "chips, pills, labels, sidebar links, table heads"], ["--fs-s", "hints, descriptions, tables, inputs, header links"],
  ["--fs-m", "choice names, footers, docs text, card name"], ["--fs-body", "body text"], ["--fs-l", "site title, small lede, docs h3, small buttons"],
  ["--fs-lede", "big Argent text, h3, big buttons"], ["--fs-h", "page & section heads"], ["--fs-art", "big title art"],
];
// sizes still written as numbers (file: what)
const LITERALS = [
  ["11pt", "styles.css print"], ["0.8em", "styles.css .mono-u / mono text (relative on purpose)"],
];
function renderType() {
  const row = (label, style, text = SAMPLE) => el("div", { className: "ft-type-row" }, el("span", { textContent: label }), el("p", { style, textContent: text }));
  const value = (t) => getComputedStyle(document.documentElement).getPropertyValue(t).trim();
  slot("type").append(
    group("Families", "styles.css --sans / --display / --mono",
      row("--sans", "font-family: var(--sans)"),
      row("--display", "font-family: var(--display); font-style: italic; font-size: 2rem; color: var(--accent)"),
      row("--mono", "font-family: var(--mono)"),
      el("div", { className: "ft-type-row" }, el("span", { textContent: ".mono-u (mono caps)" }), el("p", {}, el("span", { className: "mono-u", textContent: "Mono capitals: labels and legends" })))),
    group("Size tokens", "styles.css --fs-*", ...SIZES.map(([t, use]) => row(`${t}  ${value(t)}`, `font-size: var(${t})`, `${use}: ${SAMPLE}`))),
    group("Sizes still written as numbers", "deliberate one-offs", ...LITERALS.map(([v, where]) => row(v, `font-size: ${v}`, where))),
    group("Weights in use", "400 · 600 · 700", row("400", "font-weight: 400"), row("600", "font-weight: 600"), row("700", "font-weight: 700")),
    group("Headings and ledes", "styles.css h1 / h2 / h3, .lede, .lede-small",
      el("h1", { textContent: "Heading 1" }), el("h2", { textContent: "Heading 2" }), el("h3", { textContent: "Heading 3" }),
      el("p", { className: "lede", textContent: "A big lede in Argent." }),
      el("p", { className: "lede lede-small", textContent: "A small italic lede, as under each module's title." })),
  );
}

// ── buttons & links ──────────────────────────────────────────
function renderButtons() {
  const b = (cls, text) => button(text, cls, () => {});   // (just for show)
  slot("buttons").append(
    group("Buttons", "styles.css .button / .button-small",
      el("div", { className: "ft-row" }, b("button", "Start a new card"), b("button button-small", "Save"), Object.assign(b("button", "Disabled"), { disabled: true }))),
    group("Link-style buttons and links", "styles.css .link-button, a, a.inline; make.css .link-button-danger",
      el("div", { className: "ft-row" }, b("link-button", "See more ways to join (14)"), b("link-button", "Select all"), b("link-button link-button-danger", "Remove"),
        el("a", { href: "#buttons", textContent: "A link" })),
      el("p", {}, "Text with an ", el("a", { className: "inline", href: "#buttons", textContent: "inline link" }), " in it.")),
    group("Pixel toggles and closers", "styles.css .pixel-toggle, .pixel-plus / .pixel-minus; make.css .row-remove, .popup-close",
      el("div", { className: "ft-row" },
        el("button", { type: "button", className: "pixel-toggle", ariaLabel: "Closed toggle", ariaExpanded: "false" }),
        el("button", { type: "button", className: "pixel-toggle", ariaLabel: "Open toggle", ariaExpanded: "true" }),
        el("span", { className: "pixel-plus" }), el("span", { className: "pixel-minus" }),
        el("button", { type: "button", className: "row-remove", ariaLabel: "Remove" }, el("span")))),
    group("Status text", "make.css .form-error, .screen-loading; #save-status",
      el("p", { className: "form-error", textContent: "This secret doesn’t match this card." }),
      el("p", { className: "screen-loading", textContent: "Loading…" })),
  );
}

// ── text fields ──────────────────────────────────────────────
function renderText() {
  slot("text").append(
    group("One line", "fields.js textField", textField({ label: "Community name", hint: "A hint under the label.", value: "Garden Club" }).element),
    group("Link", "fields.js textField type url", textField({ label: "Link to your rules", type: "url", placeholder: "https://" }).element),
    group("Several lines (notes)", "fields.js textField multiline", textField({ label: "Anything else about membership", multiline: true, hint: "For example: who can invite people." }).element),
    group("Dropdown", "fields.js selectField", selectField({ label: "Category", options: opts("Voting & polling", "Trust & safety"), hint: "The category’s description shows here." }).element),
    group("Filter box", "choices.js filterable (input type search)", renderChoices({ legend: "Approaches", options: opts("Lazy consensus", "Do-ocracy", "Sociocracy"), layout: "compact", filterable: true }).element),
    (() => {
      const shown = el("p", { className: "lede lede-small", textContent: "Our meetups and how we run them." });
      const slot = el("span", { className: "module-head-tools" });
      const field = textField({ label: "What this module covers", multiline: true, value: shown.textContent, onInput: () => { shown.textContent = field.value() || ""; } });
      editInPlace({ display: shown, slot, field, label: "description" });
      return group("Edit in place", "inline-edit.js editInPlace (a custom module's name and description)", el("div", { className: "module-head" }, shown, slot));
    })(),
    (() => {
      const row = (label, hint, box) => {
        const f = textField({ label, hint, hintTip: true });
        if (box) f.element.append(el("label", { className: "check field-after" }, el("input", { type: "checkbox" }), box));
        return f.element;
      };
      return group("Label beside the field, hint in an “i”", "fields.js textField / suggest.js suggestField hintTip; make.css .field-rows, .field-after (Locations, Publish's contact)",
        el("div", { className: "field-rows" }, row("Contact email", "Only the CROW team sees this.", "Remember this email in this browser"), row("Your name", "Optional.", "Show my name on the published card")));
    })(),
    group("Tick box on its own", "make.css .check (key screen)", el("label", { className: "check" }, el("input", { type: "checkbox" }), "I’ve saved my card ID and secret somewhere safe")),
  );
}

// ── checkbox & radio lists ───────────────────────────────────
function renderLists(approaches) {
  const suggested = (opt) => (opt.id === "o1" ? { label: "Suggested", notes: ["Because you value *Trust*: a reason, in a sentence."] }
    : opt.id === "o2" ? { label: "Also fits", quiet: true, notes: ["Suits your size (medium): a reason, in a sentence."] } : null);
  slot("choices").append(
    group("Buttons (short lists), one choice", "choices.js layout \"buttons\": gray, lime on hover, orange when chosen; description on hover", renderChoices({ type: "radio", legend: "Community size", layout: "buttons", clearable: true, selected: "o1", options: opts("Small", "Medium", "Large") }).element),
    group("Buttons, the chosen one's description below", "choices.js layout \"buttons\" + hintBelow (Publish: how much readers see, who can find it)", renderChoices({ type: "radio", legend: "Who can find it", layout: "buttons", hintBelow: true, selected: "o0", options: opts("Unlisted", "Listed") }).element),
    group("Buttons, several choices", "choices.js layout \"buttons\", checkbox (How people join: tiers)", renderChoices({ legend: "How people join", layout: "buttons", selected: ["o0"], options: opts("Open", "Tiered / Probationary", "Restricted / Approvals", "Closed") }).element),
    group("Checkboxes, described", "choices.js (default layout)", renderChoices({ legend: "How people join", hint: "Tick every way.", options: opts("Open access", "Application review", "Invitation only"), selected: ["o0"] }).element),
    group("Radio, described, clearable", "choices.js type radio, clearable", renderChoices({ type: "radio", legend: "Overall approach", options: opts("Open", "Allowlist only", "Allow and block"), selected: "o0", clearable: true }).element),
    group("With “Suggested” and “Also fits” chips and their reasons", "choices.js badge (recommend.js; quiet: Also fits)", renderChoices({ legend: "Joining options", options: opts("Open access", "Trial period", "Invitation"), badge: suggested,
      before: [el("div", { className: "callout callout-small" }, el("p", {}, ...richText("[[Suggested]] and [[~Also fits]] tags come from your answers in Basics.")))] }).element),
    group("With group tabs", "choices.js groups (Basics' values: value_groups.json)", renderChoices({ legend: "Values", layout: "compact", filterable: true, listClass: "scroll-list", badge: suggested,
      options: opts("Trust", "Consensus", "Open source", "Mentorship").map((o, i) => ({ ...o, group: ["a", "b", "c", "c"][i] })),
      groups: { items: [{ id: "a", label: "How we treat each other", description: "The culture between members." }, { id: "b", label: "How we organize", description: "How power and decisions are shared." }, { id: "c", label: "Practices", description: "Things the community does." }], of: (o) => o.group } }).element),
    group("With a flag", "choices.js flag (module picker)", renderChoices({ legend: "Modules", options: opts("Rules", "Federation"), flag: { text: "Has saved content", show: (id, on) => id === "o1" && !on }, listClass: "module-picker" }).element),
    group("With follow-up radios (qualifiers)", "choices.js sub", renderChoices({ legend: "Rules", options: opts("AI-generated media", "Content warnings"), selected: ["o0"],
      sub: { options: [{ id: "a", label: "Allowed" }, { id: "n", label: "Not allowed" }, { id: "d", label: "Allowed with labeling / disclosure" }], values: { o0: "n" } } }).element),
    group("A capped list", "choices.js max (Basics' values: 5): the rest grey out", renderChoices({ legend: "Values", hint: "Select up to 2.", options: opts("Trust", "Openness", "Care", "Fairness"), selected: ["o0", "o1"], max: 2, layout: "compact" }).element),
    group("Compact, with pixel-plus details, scrolling", "choices.js layout compact + listClass scroll-list", renderChoices({ legend: "How membership is organised", options: approaches, selected: approaches.slice(0, 2).map((a) => a.id),
      layout: "compact", filterable: true, filterLabel: "approaches", listClass: "scroll-list", badge: (o) => (o.id === approaches[0].id ? { label: "Suggested", notes: ["Because you value *Trust*: …"] } : null) }).element),
  );
}

// ── scales & yes/no ──────────────────────────────────────────
function renderScales(scaleData) {
  slot("scales").append(
    group("Target scale, with its trade-offs", "basics.js targetScale (Basics and set-up): 1–7, each number's meaning in its bubble; the trade-offs in a note", targetScale(scaleData.scales[0], scaleData.range, 5).element),
    group("1–5 range", "choices.js scaleField with range: each number's meaning in its bubble (basics.js target scales)", scaleField({ legend: "Transparency", value: "3", range: true,
      options: ["Decisions stay with the moderators", "Outcomes are shared", "Outcomes and reasons are shared", "Mostly open", "Decisions are public"].map((d, i) => ({ id: String(i + 1), label: String(i + 1), description: `${i + 1}: ${d}` })) }).element),
    group("Yes / No / It varies", "choices.js scaleField + YES_NO_VARIES, layout buttons (Infrastructure)", scaleField({ legend: "Open source", options: YES_NO_VARIES, layout: "buttons" }).element),
    group("Yes / No", "choices.js scaleField + YES_NO, layout buttons (Infrastructure, Federation)", scaleField({ legend: "Do you share your block list?", options: YES_NO, layout: "buttons" }).element),
    group("Costs table", "choices.js choiceTable (infrastructure.js costs): a row per question, the answers as even columns of buttons; Not sure clears a row", choiceTable({ legend: "Costs", legendHidden: true,
      rows: [{ id: "hosting", label: "Hosting & servers" }, { id: "domain", label: "Domain" }], options: ["Yes", "Often", "Sometimes", "Rare", "No"].map((l) => ({ id: l, label: l })), values: { hosting: "Often" } }).element),
  );
}

// ── type-ahead & tags ────────────────────────────────────────
function renderSuggest(places) {
  const tools = opts("Loomio", "Polis", "Decidim").map((t) => ({ ...t, note: "Voting & polling" }));
  slot("suggest").append(
    group("Type-ahead, one pick", "suggest.js suggestField", suggestField({ label: "Platform", hint: "Start typing, e.g. Discord.", items: tools, allowCustom: true }).element),
    group("Type-ahead with a browse arrow", "suggest.js browse: true", suggestField({ label: "Tool", items: tools, allowCustom: true, browse: true }).element),
    group("Type-ahead, several (tags with ×)", "suggest.js multiple: true", suggestField({ label: "Where your servers are", items: places, multiple: true, values: ["DE", "US"], placeholder: "Start typing a country or region…" }).element),
    group("Tag input (type, Enter)", "tags.js tagInput", tagInput({ label: "Keywords", hint: "Press Enter after each one.", values: ["gardening", "local"] }).element),
    group("Tags, display only", "tags.js tagList (no onRemove)", (() => { const t = tagList({ ariaLabel: "Structure" }); t.render(opts("Lazy consensus", "Do-ocracy")); return t.element; })()),
  );
}

// ── rows & pick lists ────────────────────────────────────────
function renderRowsAndPicks(approaches, conflicts) {
  const rowRender = (r, h) => {
    const name = textField({ label: "Channel", value: r.name, ...h });
    return { element: el("div", {}, name.element), collect: () => ({ name: name.value() }), focus: () => name.focus() };
  };
  slot("rows").append(
    group("Repeatable rows, with summary mode", "rows.js renderRows + summarize (✓ folds a row, Edit opens it)", renderRows({ legend: "Other channels", items: [{ name: "Newsletter" }], addLabel: "Add a channel", newItem: () => ({ name: "" }), summarize: (v) => v.name || "", renderRow: rowRender }).element),
    group("Repeatable rows, reorderable", "rows.js reorderable", renderRows({ legend: "Fields", items: [{ name: "First" }, { name: "Second" }], addLabel: "Add a field", newItem: () => ({ name: "" }), reorderable: true, renderRow: rowRender }).element),
    group("Pick list: tags you click to annotate", "picklist.js (Processes structure, joining)", pickList({ legend: "Add or change approaches", options: approaches, items: [{ id: approaches[0].id, note: "Used for small changes" }], chosenLegend: "How your structure is used" }).element),
    group("Pick list in steps", "picklist.js staged (Conflict management): drag into steps; same step = in parallel", pickList({ legend: "How conflicts are handled", options: conflicts, chosenLegend: "Your steps", staged: true,
      items: [{ id: conflicts[0].id, stage: 1, primary: true, note: "Most issues" }, { id: conflicts[1].id, stage: 2 }, { id: conflicts[2].id, stage: 2 }, { id: conflicts[3].id, stage: 3 }] }).element),
    (() => {
      const strip = alikeStrip({ labelOf: (id) => id, onAdd: () => {} });
      strip.show("Sociocracy", { like: ["Holacracy", "Lazy Consensus", "Modified Consensus"], fresh: ["Autocratic Decision-Making", "Executive Committees", "Do-ocracy"] });
      const full = alikeStrip({ labelOf: (id) => id, onAdd: () => {} });
      full.show("Trust", { like: [], fresh: ["Openness", "Care", "Mutual Aid"] }, { full: "You have 5 values. Unselect one to add another." });
      return group("“More like this / Try something new”", "controls/alike.js alikeStrip (under the chosen tags of pick lists and values; with nothing scored, only random picks; at the cap, greyed)", strip.element, full.element);
    })(),
    group("Pick list in steps, no primary", "picklist.js staged, primary: false (response ladder)", pickList({ legend: "When there’s a problem", options: opts("Warn", "Mute", "Block"), items: [{ id: "o0", stage: 1 }, { id: "o1", stage: 1 }, { id: "o2", stage: 2 }], filterable: false, staged: true, primary: false, chosenLegend: "Your steps" }).element),
  );
}

// ── folds & tabs ─────────────────────────────────────────────
function renderFolds() {
  const p = (t) => el("p", { textContent: t });
  slot("folds").append(
    group("Section fold (level 2)", "fold.js foldSection", foldSection({ title: "Costs", key: "ft:fold2", children: [p("What’s inside a section.")] })),
    group("Sub-fold (level 3)", "fold.js level: 3 (Rules types)", foldSection({ title: "Harassment and personal safety", key: "ft:fold3", level: 3, children: [p("A checklist goes here.")] })),
    group("Fold with actions beside its heading", "fold.js actions (Rules' Select all / Clear)", foldSection({ title: "Harassment and personal safety", key: "ft:fold-actions", level: 3, actions: [button("Select all", "link-button", () => {}), button("Clear", "link-button", () => {})], children: [p("A checklist goes here.")] })),
    group("Plain heading (not foldable yet)", "fold.js foldable: false", foldSection({ title: "Platform", key: "ft:plain", foldable: false, children: [p("Always open.")] })),
    (() => {
      // the same small block, revealed with each combination of effects
      const sample = () => el("div", { hidden: true },
        el("p", { className: "mono-u", textContent: "How people join" }),
        el("p", { className: "field-hint", textContent: "Tick every way someone can become a member." }),
        el("div", { className: "callout" }, el("p", { textContent: "This appeared after a choice." })));
      const target = sample();
      const combos = [
        ["Cascade (the default)", {}],
        ["Pixels", { cascade: false }],
        ["Pixels, slow ending", { cascade: false, tail: true }],
        ["Pixels + text decode", { cascade: false, tail: true, decode: true }],
        ["Pixels + decode + letter sizes", { cascade: false, tail: true, decode: true, sizes: true }],
        ["Decode + letter sizes", { cascade: false, pixels: false, decode: true, sizes: true }],
      ];
      return group("Reveal", "reveal.js reveal(element) — the cascade; other effects kept to try",
        el("div", { className: "ft-row" }, ...combos.map(([label, opts]) => button(label, "button button-small", () => { target.hidden = true; reveal(target, opts); }))),
        target);
    })(),
    group("Tabs", "tabs.js tabBox", tabBox({ label: "Tabs", key: "ft:tabs", tabs: ["Change", "Maintenance", "Moderation"].map((t) => ({ id: t, label: t, children: [p(`The ${t} panel.`)] })) }).element),
  );
}

// ── callouts, chips & pills ──────────────────────────────────
function renderNotes() {
  const pill = (cls, text) => el("span", { className: cls, textContent: text });
  slot("notes").append(
    group("Callout", "styles.css .callout", el("div", { className: "callout" }, el("p", { textContent: "A note or warning, with the dotted orange edge." }))),
    group("Small callout", "make.css .callout-small", el("div", { className: "callout callout-small" }, el("p", { textContent: "Filled in from our platform data. Edit anything that’s different." }))),
    group("Suggestion box", "make.js suggestions (callout + button row + change list)", el("div", { className: "callout" },
      el("p", {}, chip("Suggestion"), " ", "Add the Federation module?"),
      el("p", {}, ...richText("A message with a [[Suggested]] chip and *italics*.")),
      el("ul", { className: "change-list plain-list" },
        el("li", {}, el("span", { className: "pixel-plus" }), "Lazy consensus (from Change)"),
        el("li", {}, el("span", { className: "pixel-minus" }), "Do-ocracy (from Moderation)")),
      el("p", { className: "button-row" }, el("button", { type: "button", className: "button button-small", textContent: "Add Federation" }), el("button", { type: "button", className: "link-button", textContent: "Dismiss" })))),
    group("Every pill-like thing", "make.css .chip (lime), .tag (orange), .tag-soft (gray), .tag-add (the strip's +), .card-pill (dark, the card), .choice-flag; docs.css .proto, .badge.*, .cv.*, .sw",
      el("div", { className: "ft-row" }, chip("Suggested"), chip("Also fits", { quiet: true }), chip("Started"), pill("tag", "Not allowed"), pill("tag tag-soft", "gardening"), pill("tag tag-add", "+ Holacracy"), pill("card-pill", "Discussion forum"), pill("proto", "ActivityPub"),
        pill("badge yes", "Yes"), pill("badge no", "No"), pill("badge var", "Varies"),
        pill("cv yes", "Yes"), pill("cv often", "Often"), pill("cv some", "Sometimes"), pill("cv rare", "Rare"), pill("cv no", "No"), pill("sw oss", "Open source"), pill("sw", "Proprietary"))),
    group("Pixel icons", "make.css .icon-* (drawn with box-shadow pixels; currentColor)",
      el("div", { className: "ft-row" }, ...[["icon-yes", "yes"], ["icon-no", "no"], ["icon-note", "note"], ["icon-sub", "nested ↳"], ["icon-meet", "when there's a problem"], ["icon-list", "lists"], ["icon-announce", "channels"], ["icon-out", "opens a new tab"]]
        .map(([cls, label]) => el("span", { className: "ft-icon" }, el("span", { className: cls }), el("span", { className: "field-hint", textContent: ` ${label}` }))))),
    group("Summary block", "make.css .summary (lime two-step pixel outline on the tint): Basics, Rules, Federation's rules, the card", el("div", { className: "summary" }, el("p", { className: "mono-u summary-label", textContent: "Summary" }), el("p", { textContent: "A summary of answers, in a compact box." }))),
    group("Dotted summary block", "make.css .summary.summary-dotted (gray dotted outline): what's been chosen in a pick list", el("div", { className: "summary summary-dotted" }, el("p", { className: "mono-u summary-label", textContent: "What you use" }), (() => { const t = tagList({ ariaLabel: "Chosen" }); t.render(opts("Lazy consensus", "Sociocracy")); return t.element; })())),
    group("Pixel divider", "styles.css hr.pixel-divider (before a closing note, between custom rules and the summary)", el("hr", { className: "pixel-divider" })),
    group("A term that changes with the tab", "make.css mark.tab-term (Processes' hint)", el("p", { className: "field-hint" }, "Click one to note how it’s used for ", el("mark", { className: "tab-term", textContent: "maintenance" }), ".")),
    group("Sidebar flag dot", "make.css .flag-dot (after a module link)", el("p", {}, "Membership", el("span", { className: "flag-dot" }))),
    group("Docs label with a rule", "docs.css .section-label", el("p", { className: "section-label mono-u", textContent: "By community type" })),
  );
}

// ── summaries ────────────────────────────────────────────────
async function renderSummaries(rulesData) {
  const basics = el("div");
  renderBasicsSummary(basics, { name: "Garden Club", link: "https://garden.example", type: "discussion_forum", size: null, keywords: ["gardening"], targetScales: { participatory: 5, transparent: 6, hierarchical: 2 }, values: ["trust"] },
    await loadBasicsData(), { entries: [{ id: "membership", label: "Membership" }, { id: "rules", label: "Rules" }], started: (id) => id === "membership" });
  // the Rules summary is the last part of the Rules form
  const rules = el("div");
  renderRules(rules, { selected: [{ id: "civility_be_respectful", qualifier: null }, { id: "spam_commercial_advertising", qualifier: "not_allowed" }],
    ruleEdits: { spam_commercial_advertising: { text: "No ads unless the mods say yes", original: "Commercial advertising" } } }, rulesData, { stateKey: "ft:rules" });
  slot("summaries").append(
    group("Basics summary", "basics.js renderBasicsSummary (.summary-list, .next-steps)", basics),
    group("Rules summary", "rules.js (.rule-summary)", rules.lastElementChild),
  );
}

// ── pop-up ───────────────────────────────────────────────────
function renderPopup() {
  const open = button("Open the pop-up", "button button-small", () => {
    const ok = button("Got it", "button button-small", closePopup);
    showPopup({ title: "Platform changed: please double-check", body: el("div", {}, el("p", { textContent: "A message in the shared pop-up." }), el("ul", {}, el("li", { textContent: "Open source: Yes (was No)" })), el("p", { className: "button-row" }, ok)) });
  });
  const error = button("Open an error pop-up", "button button-small", () => showPopup({ title: "Something needs fixing", message: "Give your community a name to continue.", tone: "error" }));
  const notice = button("Show the new-suggestion notice", "button button-small", () => {
    scrollTo(0, document.documentElement.scrollHeight);   // (it only shows when its target is out of sight above)
    pointTo(document.querySelector("h1"), "New suggestion");
  });
  const sidebar = el("div", { className: "editor-nav-panel" }, el("div", { className: "editor-actions" }, button("Save", "button button-small", () => {}), el("p", { className: "save-status", textContent: "All changes saved" })));
  slot("popups").append(
    group("Pop-up", "popup.js showPopup (make.css .popup)", open),
    group("Error pop-up", "popup.js showPopup tone: \"error\" (pink outline and title)", error),
    group("Confirm pop-up", "popup.js confirmPopup (instead of the browser's confirm())",
      button("Open a confirm pop-up", "button button-small", () => confirmPopup({ title: "Forget this card on this device?", message: "You’ll need its card ID and the secret you saved to open it again.", confirmLabel: "Forget" }))),
    group("New-suggestion notice", "scroll.js pointTo (make.css .place-pill): flashes twice", notice),
    group("The sidebar's smaller buttons", "make.css .editor-nav-panel .button-small", sidebar),
  );
}

// ── view modes (js/view-modes.js): one sample card as each mode shows it ──
async function renderViewModes() {
  const [data, defaults] = await Promise.all([loadExportData(), loadModuleDefaults()]);
  const card = {
    modules: ["infrastructure", "membership", "rules", "processes", "federation"],
    basics: { name: "Garden Club", link: "https://garden.example", type: "discussion_forum", size: "medium", keywords: ["gardening", "seeds"], targetScales: { participatory: 6, transparent: 5, hierarchical: 2 }, values: ["trust", "inclusivity"] },
    infrastructure: { platform: { platform: "activitypub_client_mastodon", software: "Mastodon", type: "self_hosted_text_primary", structuralModel: "Federation", usesProtocol: "yes", protocol: "ActivityPub", openSource: "yes", selfHosted: "yes" },
      costs: { hostingServers: "often", domain: "rare", adminModLabor: "yes", inPersonEvents: "no" }, tools: [{ tool: "loomio", category: "deliberation_decision_making", usedFor: "big decisions" }], locations: { servers: ["DE"], members: ["WORLDWIDE"], adminTeam: ["US"] } },
    membership: { joining: { tiers: ["open", "tiered_probationary"], ways: [{ id: "mentorship", note: "A buddy for the first month" }], closedNote: null },
      structure: [{ id: "lazy_consensus", note: "For day-to-day changes" }, { id: "consensus_decision_making", note: null }], generalNote: "Dues are optional, and anyone who can't pay is always welcome; we'd rather have more gardeners than more money in the tin." },
    rules: { communityRulesLink: "https://garden.example/rules", covenants: [], adaptedFrom: [], selected: [{ id: "civility_be_respectful", qualifier: null }, { id: "cw_sexual_content", qualifier: "required" }], ruleEdits: {}, customRules: [{ id: "c1", text: "Water the shared plot", typeId: null }, { id: "c2", text: "No mocking newcomers' questions", typeId: "civility" }] },
    processes: { moderation: { approachNotes: { lazy_consensus: "Two mods agree" }, generalNote: "Mods rotate each season." }, maintenance: { approachNotes: {}, generalNote: null }, institutionalChange: { approachNotes: {}, generalNote: "Yearly review" },
      conflictManagement: { approaches: [{ id: "peer_mediation", note: "First stop", stage: 1, primary: true }, { id: "circle_processes", note: null, stage: 2 }], generalNote: null }, communications: { channels: ["email"], customChannels: [] } },
    federation: { approach: "denylist_first", allowlistPolicy: null, responseLadder: [{ id: "warn", note: "For spam", stage: 1 }, { id: "mute", note: null, stage: 2 }, { id: "block", note: null, stage: 3 }],
      subscriptions: { subscribedLists: [], sharesBlocklist: "yes", blocklistLink: "https://garden.example/blocks" }, rulesNote: "Servers that allow harassment (our first rule) are blocked.", bridging: { bridges: "yes", protocols: ["AT Protocol"] } },
  };
  // the card as each mode shows it (card-view.js renderCard), one at a time
  const host = el("div");
  const show = (mode) => host.replaceChildren(renderCard(publicView(card, mode, { ruleSchema: data.ruleSchema, scales: data.scales }), data, defaults));
  const pick = renderChoices({
    type: "radio", legend: "View mode", layout: "buttons", hintBelow: true,
    options: MODES.map(({ id, label, description }) => ({ id, label, description })),
    selected: "full",
    onChange: show,
  });
  show("full");
  slot("view-modes").append(
    el("p", { className: "field-hint" }, "One sample card, as each view mode shows it (view-modes.js publicView; card-view.js renderCard: the published page, its preview, and Export). The scales use the scores still under review (", el("a", { className: "inline", href: "scales.html", textContent: "scales.html" }), ")."),
    pick.element,
    host,
  );
}

const [decisions, conflict, enums, countries, rulesData, scaleData] = await Promise.all([
  loadData("decision_approaches"), loadData("conflict_management"), loadData("enums"), loadData("countries"), loadRulesData(), loadData("governance_scales"),
]);
renderPalette();
renderType();
renderButtons();
renderText();
renderLists(decisions.items);
renderScales(scaleData);
renderSuggest([...countries.countries, ...countries.regions.map((r) => ({ ...r, note: "region" }))]);
renderRowsAndPicks(decisions.items, conflict.items);
renderFolds();
renderNotes();
renderPopup();
await renderSummaries(rulesData);
await renderViewModes();
await renderPublishing();

// ── publishing (publish.js): the Publish section, for a card published twice ──
async function renderPublishing() {
  const [data, defaults] = await Promise.all([loadExportData(), loadModuleDefaults()]);
  const card = {
    id: "crd_sample", updatedAt: "2026-10-08T12:00:00Z", modules: [], basics: { name: "Garden Club", type: "discussion_forum" },
    attribution: { contributorEmail: "garden@example.org", contributorName: "Sam", showName: true },
    publishing: { status: "published", mode: "misty", listed: false, version: 2, publishedAt: "2026-10-08T12:00:00Z", fingerprint: "(not this card)", credit: { name: "Sam" },
      history: [{ version: 1, publishedAt: "2026-10-01T12:00:00Z", note: null }, { version: 2, publishedAt: "2026-10-08T12:00:00Z", note: "Added our conflict steps" }] },
  };
  const host = el("section", { className: "publish" });
  renderPublish(host, { card, data, defaults, setAttribution: (a) => { card.attribution = a; }, onPublishing: () => {} });
  slot("publishing").append(
    el("p", { className: "field-hint", textContent: "The Publish section at the top of Export (publish.js renderPublish), for a sample card published twice with edits since; its buttons don't call the server here." }),
    host,
  );
}
