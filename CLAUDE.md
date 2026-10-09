# CROW Cards — notes for Claude

Context for Claude Code sessions helping develop CROW Cards. Claude Code reads this file automatically in this repo; people can read it too. Setting up a machine (accounts, installs, running locally) is in `README.md`. The code is the final word: if this file and the code disagree, trust the code and update this file. Last reviewed in full: 2026-10-06; updated 2026-10-08.

## The project

CROW Cards (crowcards.org) is a tool for communities to describe how they govern themselves. People fill in a structured form (a "card"); cards can be published at a link and forked as a starting point (Phase 4), and later browsed in a Library (Phase 5). A collaboration between Princeton HCI and Bonfire Networks; the project lead is Sohyeon.

- Live: crowcards.org (GitHub Pages, from `main`, until launch; then Firebase) · Staging: staging.crowcards.org (Firebase, deployed from `beta`)
- Firebase / Google Cloud project: `cos-princeton-hci-crow` (one project for hosting, database, functions, and later the language model's VM)
- The team's plan (the roadmap, tasks to claim, what to test and review, before launch): **`TODO.md`**. This file is the project's context: how it works and why.

## How to work on this project

Contributors range from developers to researchers who are comfortable in a terminal but not with backend code, so:

- **Propose first, build on agreement.** Work in small chunks, each checked before the next. Before building, say what you'll do and why, in plain language; flag anything ambiguous and ask, rather than guess. This applies to data files (e.g. new datasheets, scoring files) as much as to code.
- **Golden rule: never create redundant or near-duplicate CSS or JS.** Before writing something new, look for a shared piece that does it (see "Where things live"), and reuse or extend it. Shared helpers go in the shared files, not copied into a page or module.
- **Explain as you go.** Say what changed, where, and why; point to files as `path:line`.
- **Checking your work:** there's no saved test suite (by choice); for hand checks, `scripts/seed-test-cards.mjs` makes test cards (see "Running and deploying"). For each change, write quick checks aimed at it (jsdom for code and data; Playwright against the local emulator only when a change needs a real browser, e.g. layout, or flows through the server), run them, and don't keep them. End each step with a short "Please check" list for the person: what to look at in the browser (light and dark mode, phone width), downloads, and so on.
- **Git and deploying are the person's job.** Don't commit, push or deploy unless asked. Work happens on a branch off `beta` (staging); never on `main`, which serves crowcards.org until launch. Remind the person that `firebase deploy` updates staging for the whole team, and that its database holds the team's test cards.
- **Keep the docs in step.** After a major piece of work, update this file (how things work) and `TODO.md` (status and notes; never someone else's claim); every so often, review the codebase for duplication and dead code.
- **Wording:** in the UI, "select / unselect", never "tick". Write UI text in plain, friendly language.
- **Secrets:** a card's secret is never shown again after it's created, never logged, never sent anywhere but the server. Never put keys or credentials in the repo.

## Running and deploying (quick reference; details in README.md)

- `firebase emulators:start` in the repo (add `--import=emulator-data --export-on-exit` to keep local test cards): the site at localhost:5000, the emulator dashboard at localhost:4000. `js/api.js` uses the emulator automatically on localhost, so nothing local touches staging.
- **Test cards:** with the emulator running, `node scripts/seed-test-cards.mjs` makes a set of cards for checking things by hand: one rich card published in each view mode (Full with two versions), one with unpublished edits, one unpublished, a fork, one taken down, one reported, and a draft with no contact email. Their IDs, secrets and what to check on each go to `test-cards.local.md` (ignored by git and hosting; don't share it). It only talks to the local emulator. Restart the emulator after changing `js/view-modes.js` first.
- `firebase deploy --only functions,hosting` deploys to staging (the person does this). The hosting deploy runs `scripts/stamp-version.mjs` first; the functions deploy runs `scripts/copy-shared.mjs`. A change to `firebase.json` (e.g. the `/c/` rewrite) needs the emulator restarted.

## Architecture

- **Hosting:** Firebase Hosting serves `crowweb/` (`"public": "."`). Pages: `index.html`, `about.html`, `card.html` (a published card, at `/c/crd_…`: a hosting rewrite), `make.html` (the editor: start / key / set-up / modules / export), `docs.html`, `laws.html` (laws for a card's locations; savable as a PDF), `library.html` (placeholder until the Library, Phase 5), `coming-soon.html` (maintenance page, turned on with a hosting rewrite), `404.html` (root-relative paths), `style.html` (style reference, noindex, not linked; includes a preview of the four view modes), `scales.html` (the team's review of `governance_scales.json`, noindex, not linked), `test-recs.html` (the team's page for testing and tuning suggestions, `js/test-recs.js`; noindex, not linked; to delete before launch). Hosting ignores `functions/`, `scripts/`, rules / index files, `README.md`, `CLAUDE.md`, logs, `emulator-data/`, `*.local.md`.
- **Deploy stamp:** `firebase.json` hosting `predeploy` runs `scripts/stamp-version.mjs`, writing `version.json` (a hash of the site's html/js/css/json; gitignored). `js/freshness.js` uses it to stop an editor tab left open across a deploy from saving (see "Editor behaviour").
- **Database:** Firestore, deny-all security rules (all access goes through the functions, including reading published cards).
  - `cards/{cardId}`: one document per card (the schema below).
  - `cardKeys/{sha256 of the secret}`: `{ cardId, createdAt, lastUsedAt }`, the auth mapping.
  - `cards/{cardId}/versions/{n}`: each published version in full (without `editor`), `{ version, publishedAt, note, card }`; private.
  - `public/{cardId}` and `public/{cardId}/versions/{n}`: the published card (and each version) as its view mode shows it (`publicView`), with credit, the versions list and `listed`; read only through `getPublicCard`.
- **Cloud Functions** (`functions/index.js`, Node 24, us-central1, `maxInstances: 10`):
  - `createCard()` → `{ cardId, secret }`: `crd_` + 12 letters/digits; a 32-byte URL-safe secret; the card and its key written in one batch.
  - `getCard({ cardId, secret })` → `{ card }`.
  - `updateCard({ cardId, secret, updates, ifUpdatedAt, reset })` → `{ updatedAt }` (plus `{ card }` after a reset). Only `EDITABLE_PARTS` (`modules`, `basics`, `infrastructure`, `membership`, `rules`, `processes`, `federation`, `customModules`, `attribution`, `editor`); each part must be the same kind (list / object; `modules` may be null) as on a new card; each part sent replaces the stored one whole (Firestore `mergeFields`), so the editor always sends whole parts. `ifUpdatedAt` is checked in a transaction (`failed-precondition` if the card changed). `reset: [parts]` puts parts back as `makeEmptyCard` defines them. A card over ~900 KB is refused (`resource-exhausted`).
  - `publishCard({ cardId, secret, mode, listed, note })` → `{ publishing }`: a new version; needs the name, type and a contact email (`failed-precondition`, `details.missing`); refused for a taken-down card. `updatePublishing({ cardId, secret, mode, listed })`: no new version; the public copies (and the credit, from `attribution`) are made again. `unpublishCard({ cardId, secret, deleteHistory })`: removes the public copies (and, with `deleteHistory`, the private versions). These write `publishing`, which `updateCard` can't.
  - `getPublicCard({ cardId, version? })` → the public copy; no key; "not-found" for anything unpublished.
  - `forkCard({ cardId, version? })` → `{ cardId, secret }`: a new card made **only from the public copy** (Foggy, Misty or Full), laid over the empty card (`overlay`); name, link and description cleared; below Full, `basics.targetScales` start at the source's computed scales (public in every view); `modules` null (set-up first) with the source's in `editor.forkModules`; `forkedFrom: { cardId, version, name, mode }`. `createCard` and `forkCard` share `saveNewCard`.
  - `reportCard({ cardId, version, reason, details, email })`: no key; saves `reports/{id}` `{ cardId, version, mode, reason (REPORT_REASONS id, or null when there's a note), details, email, createdAt, status: "new" }` for the team; at most 20 open reports per card.
  - The view-mode rules are the editor's `js/view-modes.js` (with `rule_schema.json` and `governance_scales.json`): read from the repo on the emulator, and from `functions/shared/` when deployed (copied there by `scripts/copy-shared.mjs`, the functions' predeploy; gitignored).
  - `verifyKey` checks the key first (one read); only on failure is the card looked up, so a typo'd ID (`not-found`, "No card has this ID") is told apart from a wrong secret (`permission-denied`). `lastUsedAt` is written at most once a day.
- **Reference data:** 24 JSON files in `/data/`, loaded with `loadData()` (`js/data.js`, cached per page; values through `loadValues()`): platforms, cost_rules, cost_overrides, tools, values, value_groups, value_conflicts, value_recommendations_{decision,membership,conflict}, membership_options, membership_tiers, decision_approaches, conflict_management, rule_schema, covenants, community_types, module_defaults, federation_subscription_lists, countries, laws, enums, governance_scales (the 1–7 scales, under review), approach_size_fit (how well each approach suits each community size, under review). The same files drive the editor, the docs (tables built by `js/docs-reference.js`: the Reference tables, the platforms by community type, expected costs; the view-mode table from `view-modes.js` via `docs-page.js`) and the laws page. Don't type a datasheet's content into a page by hand: of the docs' tables, only Column definitions is handwritten. `platforms.json` also holds `structuralModels` (what each model means) and, on generic rows, `otherSoftware`; `cost_overrides.json` holds each override's `reasons`. `laws.json` is a placeholder until a student's reviewed datasheet replaces it.

## Auth model

**Secret-key auth, no user accounts.** Creating a card returns its ID and a secret, shown once and never recoverable (only its SHA-256 hash is stored). Every read and write needs the secret. Card IDs aren't secret (published cards will show them). The secret is never shown again after the key screen, not even in the editor (screen-sharing in workshops). The editor keeps the ID + secret per tab (sessionStorage), or on the device if the person opts in ("Remember this card"); Forget clears both.

## The card schema

The canonical definition is `makeEmptyCard()` in `functions/index.js` (`schemaVersion` "0.1.0": reset before launch, no conversion code — only test cards exist). Conventions:
- **Listed-or-typed values** (covenants, lists, tools, protocols, places, a tool row's `tool`): the list's id if it's listed, else the text as typed (`storedValue`).
- **Yes/no answers:** `"yes" | "no" | "varies" | null` (`"varies"` only where the editor offers "It varies").
- **Owned picks** (the list belongs to this part): `[{ id, note }]`, in order. **Notes on picks owned elsewhere** (the shared structure, the card's rules): maps `{ <id>: note }`.
- **Editor-only state** lives in the top-level `editor` part, never inside a module. Exports and public views leave out `editor` and `attribution`.
- **Modules hold only what's true now.** An answer switched away from (an item unselected, Yes → No, another approach, a custom field's kind changed) is **set aside** in `editor.setAside` (`js/set-aside.js`) and comes back when switched back, even after a reload. A switched-off module keeps its answers in its part (exports skip it, by `modules`). Deleting (a row's ×, a custom module) really deletes; Reset also clears that part's set-aside answers.

```
id, schemaVersion, createdAt, updatedAt,
publishing: { status ("draft"|"published"|"unpublished"), mode, listed, version, publishedAt, fingerprint, credit, hidden, history: [{ version, publishedAt, note }] }   // written only by the publishing functions
forkedFrom (null)                 // a fork: { cardId, version, name, mode } of the published card it started from

modules                           // ordered built-in + custom module ids; null = not set up yet, [] = none (Basics is implicit)
customModules: [{ id, name, description, fields: [{ id, label, type: "text"|"checkbox"|"radio"|"scale", value, options?, min?, max?, low?, high? }] }]   // ids "cm_…", "f_…"; a scale's range min / max: 1–5, 1–7 or 0–10 (none = 1–5)
attribution: { contributorName, contributorEmail, organization, showName, showOrganization }   // private; name / organisation public only when "show" is ticked
editor: {                         // editor-only: never in public views or exports
  costsPrefill: { platformName, typeId, costs } | null,   // what costs were pre-filled from
  structureReviewed[], structureLog[],   // the "changed in Processes" notice; log entries { id, change: "added"|"removed"|"reviewed", from, at }
  dismissedSuggestions[],
  forkModules: null | [ids],             // a fork's modules, ticked at set-up
  setAside: { "<part>.<key>": value }    // e.g. "membership.joining.closedNote", "membership.structure:<id>": { note },
                                         // "processes.moderation.approachNotes:<id>": { note }, "rules.selected:<id>": { qualifier }, "rules.ruleEdits:<id>", "customModules.<cm id>.fields:<field id>": { options?, min?, max?, low?, high?, answers? }   // answers per kind; a scale's per range ("scale:1-7")
}

basics: { name, link, type, size, description: { purpose, culture }, keywords[], targetScales: { participatory, transparent, hierarchical }, values[] }
                                  // description: the community in its own words, two optional texts (DESCRIPTION in js/sections/basics.js; shown a part at a time by view mode, see the table; never copied by a fork)
                                  // targetScales: 1–7 each or null (aims; public only in Full); values: at most 5

infrastructure: {
  platform: { type, platform, software, usesProtocol, protocol, openSource, selfHosted, structuralModel }   // the three yes/no: strings
  costs: { 11 cost fields, values = enums.json costValues ids }
  tools: [{ tool, category, usedFor }]   // tool: tools.json id or typed name
  locations: { servers[], members[], adminTeam[] }   // countries.json codes (countries and regions)
}

membership: {
  joining: { tiers[], ways: [{ id, note }], closedNote },   // membership_tiers.json / membership_options.json ids; closedNote only while "closed" is a tier
  structure: [{ id, note }],        // decision_approaches.json ids: ONE shared list, also edited in Processes
  generalNote
}

rules: {
  communityRulesLink, communityRulesText, covenants[], adaptedFrom[],   // communityRulesText: no editor field yet (kept for "Your rules, in your words")
  selected: [{ id, qualifier }],    // rule_schema.json rule ids; qualifier id or null
  ruleEdits: { <rule id>: { text, original } },   // selected rules reworded in the Rules summary
  customRules: [{ id, text, typeId, qualifierSet, qualifier }]   // qualifierSet: "permission" | "requirement" | null
}

processes: {
  institutionalChange, maintenance, moderation: { approachNotes { <approach id>: note }, generalNote }   // the three tabs ("Change", …) over the shared structure
  conflictManagement: { approaches: [{ id, note, stage, primary }], generalNote }   // steps in order; same stage = in parallel
  communications: { channels: [ids], customChannels: [{ name, description }] }
}

federation: {
  approach ("open" | "allowlist_first" | "denylist_first"), allowlistPolicy,   // policy only with allowlist_first
  responseLadder: [{ id, note, stage }],
  subscriptions: { subscribedLists[], sharesBlocklist ("yes"|"no"|null), blocklistLink, decisionTools[] },
  rulesNote,                        // how the community's rules shape who it federates with (one note; replaced a selection of rules, 2026-10-08)
  bridging: { bridges ("yes"|"no"|null), protocols[] }
}
```

## Reference data shape

Most files are `{ version, updatedAt, source? / note?, items: [{ id, label, description, … }] }`. The exceptions keep their own top-level lists: `enums.json` (one list per enum, e.g. `communitySize`), `rule_schema.json` (`qualifierSets`, `categories`, `types`), `cost_rules.json` (`categories`, `types`), `countries.json` (`countries`, `regions`), `membership_tiers.json` (`tiers`), `module_defaults.json` (`modules`, `default`, `byCommunityType`, `byStructuralModel`).

The `id` is stable snake_case, and is what a card stores; the `label` is what the UI shows, so labels can be reworded without breaking cards. "Category" (`category` / `categories`) groups items in a list (tools, federation lists, laws, rule categories); "type" is what a community or platform is. Recommendation files hold `{ id, value, recommends, strength, why, status }` (strength −2 to +2: how strongly the value argues for or against the option); only `status: "accepted"` is used (proposed ones too while `COUNT_PROPOSED`). `values.json` is CommunityRule's list, kept as it comes (it may be refreshed from its API); the team's additions are in `value_groups.json`: `all` (the All tab's name and description), `groups` (`{ id, label, short, description }`) and, per value id, its `group`, `cues` (phrases matched in a description: whole words, a trailing `*` for any ending, two or more words count double), a `description` only where CommunityRule's is a placeholder, and `status`. `loadValues()` (`js/data.js`) merges them (a rewritten description comes with `descriptionDraft: true`). `approach_size_fit.json` holds `sizes` and `items` (`{ id: "<list>:<option>", list, option, small, medium, large, very_large, why, status }`, each −2 to +2 or null). `governance_scales.json` holds `range`, `neutralDistance`, `scales` (with `levels`, what each score from 1 to 7 means, and the trade-offs of each end: `ends.low|high.pros|cons`, two short phrases each, and an optional short `title` for the box, e.g. Transparent's "Private" / "Fully open") and `items` (`{ id: "<list>:<option>", list, option, participatory, transparent, hierarchical, why, status }`): options scored on what they are, and values (list `"values"`) scored on where they point.

## Editor behaviour (make.html)

- **Flow:** Start ("Start a new card" / "Edit an existing card") → Save your key (ID + secret, Copy, Download .txt, must confirm) → Set up → Editor. Set-up is in blocks, each shown once the one before has its required answers and its Next is selected (or all at once, "Show all fields at once", remembered in the browser): (1) name, type, size, link, the description (two optional boxes: Purpose, "What it's for, who it's for, and what happens in the online space", and Culture, "The kind of culture and vibe you want to foster"; "optional, but helpful for people to understand what your community is"), keywords; (2) where they'd like to be on the three scales (1–7, each number under its radio button, what each number means in its hover bubble, and its trade-offs under it in a note (callout), always shown: small mono capitals, + gains and − costs, the 1 end on the left and the 7 end on the right); (3) values (at most 5); (4) modules. Required: name, all three scales, 1–5 values, at least one module; Continue stays disabled until then, saying what's missing (`missingBasics` in `js/sections/basics.js`). The editor's Basics has the same order, all at once; its summary says what's still needed. Modules are `make.html#<id>`; `#export` is the Export page.
- **Sidebar:** card name / ID, modules (with a lime flag dot when a suggestion waits), Save + status, Forget, Reset, Export, Docs. Narrow screens: a slim bar (module ▾, Docs, status + name + "+" menu) that drops the module list down (`js/sidebar.js`, shared with the docs).
- **Autosave** (`js/autosave.js`): one saver per card part, ~1 s debounce, saves on leaving a field, one save at a time across the page, each with `ifUpdatedAt`; retries network errors with backoff. Stops (and says why) on: no-card, bad-key, conflict (pop-up: "Load the latest version" or "Keep mine", covering every unsaved part), stale (the deploy guard: "Reload the page"), too-big, invalid. Warns before leaving with unsaved changes (the browser's own box).
- **Forms:** each module is `render<Module>(container, part, data, hooks)` → `{ collect, setAside?, focusFirst }`, mounted by `mountSection` in `js/make.js` with hooks `onInput`, `onCommit`, `stateKey`, `getPart`, `setPart` / `setParts` (change other parts; the form's own part is recorded first, so suggestions never see a half-done change), and `setAside` (that part's set-aside answers). `syncAside` keeps `editor.setAside` in step.
- **Pre-filling:** a listed platform fills in its details (from `platforms.json`) and the usual costs (`cost_rules.json` + `cost_overrides.json`); a later platform change pops up what changed; a platform-type change offers the cost changes, each accepted or not.
- **Suggestions** (`js/suggestions.js`, recomputed after each finished change): the structural model ↔ the Federation module; the structure changed in Processes (on Membership, with Keep / Undo, each change named with where it came from); a quiet note in Processes. Dismissed ids live in `editor.dismissedSuggestions`. A new suggestion out of sight gets a "↑ New suggestion" pill.
- **Recommendations:** "Suggested" and "Also fits" chips, value suggestions and "More like this / Try something new": see "Recommendations behaviour" below.
- **Module defaults:** a community type suggests modules (`module_defaults.json`); during set-up they switch automatically while untouched, said only in a note by the module picker (no pop-up: the modules come last there); in the editor's Basics, a type change offers them in a pop-up and a note.
- **Rules:** the two categories (behavior, content) are always open (not folds); each type under them is a fold; select rules by type (Select all / Clear), qualifiers per rule; a summary at the bottom with "Change wording" (`ruleEdits`, keeping the original); custom rules sit in it under their type, marked "Custom", and those without a type last, under "Custom rules" (the same grouping as the card: `cardRules`).
- **The card, drawn** (`js/card-view.js` `renderCard(view, data, defaults)`, decided 2026-10-08): one summary box; the view's name in its top-right corner (subtle); nothing said about what the view leaves out, and empty answers left out ("Not filled in yet" for an empty section). One small text size throughout (0.8rem; headings aside). Top: the name (Argent, the same size whatever its heading level), a link to the community when it has one (no underline; lime on hover), type and size as dark pixel pills under it, the description as one paragraph (its purpose, then, from Misty, its culture), keywords (gray tags), values (tags). Then, under dotted pixel lines: Infrastructure in two columns, stacked when narrow (left: the platform as a pill, its type, the software as a pill only when it adds something (the listed platform's name already includes its software, e.g. "ActivityPub client (Mastodon)", so only software typed in differently, or for a typed platform; never "Proprietary" or "None"), the places, each once, the tag on its name with its roles beside it, then OPEN PROTOCOL ✓ with "↳ ActivityPub", OPEN SOURCE, SELF-HOSTED with bold pixel ✓ / ✗, and the structural model; right: costs as a table, "COSTS" in its top-left corner, a row per answered category in mono capitals and columns Y O S R N, each letter's word in the bubble on hover or focus, with a pixel dot), then other tools full width (Foggy: only their kinds, `infrastructure.toolCategories`, which `viewCard` works out and a fork drops), Rules (Minimal: how many; Foggy: counted by type, "3 of 11 · +1 custom"; Misty and Full: Export's rows, each custom rule under its type with a hollow bullet, and custom rules without a type last, under "Custom rules"), Membership & Processes (shown whenever there are scales): first the scales as pixel bars (filled to the score; in Full the target with a dotted black border, "Where they'd like to be: 7" on hover or focus), then how people join as pills and ways of joining as tags, their notes under (one column); then two columns, stacked when narrow (left: HOW DECISIONS ARE MADE, each approach as a tag with its Membership note beside it and "↳ MODERATION · note" under it for each tab that says how it's used, and CONFLICT, a numbered list, a line per step with its approaches side by side (★ primary) and their notes under it; right: NOTES, the general notes together in a small note box as tall as the row (its dotted edge meets the longer side), a label column and the note beside: Membership, Maintenance, Moderation, Change, Conflict; no notes, no box); then COMMUNICATIONS (a pixel megaphone; the channels; one column), Federation (in a row, well apart: the approach pill, BLOCK LIST public (a link, if given) or not public, BRIDGES ✓ / ✗, and a pixel list icon with the shared lists followed as tags; Foggy and Misty show the first three; the allowlist note; "WHEN THERE'S A PROBLEM" after a pixel icon of two arrows meeting, with the response ladder left to right on the same line; tools, the note on how their rules shape who they federate with, the bridged protocols), then custom modules. Every note starts with a small pixel note icon. Notes over 80 characters are cut, with a pixel "…" button to read them whole. The Markdown download is still Export's outline.
- **Pick lists** show what's chosen (the tags) in the dotted summary box (`.summary-dotted`: a gray dotted outline) above the list, with the "More like this" strip just under the box.
- **Pick lists with "Suggested" chips** (decision-making approaches, conflict approaches, ways of joining) list Suggested options first, then Also fits, then the rest A–Z (`suggestedFirst`); lists without suggestions (e.g. the response ladder) keep their own order.
- **Yes / No (and It varies)** are always short buttons in a row (`scaleField({ layout: "buttons" })`).
- **Group tabs** (`renderChoices({ groups })`): tabs on top of a list, on one line that scrolls sideways (`tabRow({ scroll: true })`): All, then each group by its short name (`short` in the data), with how many of its options have a chip, e.g. "Organizing (3)"; only that group's options show, with the open group's full name and description under the tabs, in small gray; the filter box (under the tabs, right above the list) searches within the group. Basics' values use the groups in `value_groups.json`; the open group stays when the list is redrawn.
- **Choice lists** can have a `max` (values: 5): the rest grey out until one is unselected. While filtering a list, the closest names come first (starting with what's typed, then a word starting with it, then containing it, then description-only matches).
- **Infrastructure:** Costs is a table: a row per category, the answers as buttons, each as wide as its word, lined up in columns (Yes, Often, Sometimes, Rare, No; "Not sure" clears a row, shown muted; unanswered rows have nothing selected). When the table itself is too narrow for the buttons (under ~34rem: a container query, so e.g. narrow phones): compact radio buttons under angled column headings. Locations are rows (Servers, Members, Admin team): the labels in one column as wide as the longest, each with a small "i" for its hint (on a small tint, outlined orange when hovered or opened), lined up with its field.
- **Processes:** the shared structure in three tabs (Change, Maintenance, Moderation), each with its own notes; Conflict management as steps (drag into order; same step = in parallel; primary); Communications.
- **Reset:** clear chosen modules, or start over on the same card (ID and secret kept). **Export:** Publish, then Download, then a dotted line and the card itself (card-view.js), as Markdown, and as JSON (the Full view: Basics + switched-on modules; never `editor` or `attribution`).
- **Pop-ups:** one shared `<dialog>` (`js/popup.js`): `showPopup` (tone "error" = pink), `confirmPopup` (instead of the browser's `confirm()`).
- **Publish (on Export, `js/publish.js`):** a status box (status, link, history, with Unpublish beside the latest version and "Unpublish and delete history" at its bottom); the view mode and listed / unlisted as text buttons (`renderChoices({ layout: "buttons", hintBelow })`), the view mode's hint holding an inline "PREVIEW ↗" (a new tab, `card.html#preview`, which asks the editor for the draft by message: nothing saved or sent) and a link to the docs; contact email (required: "Only the CROW team sees this, to contact you about your card. It's never shown publicly."; remembered in the browser only if ticked), name and organisation (optional, shown only if ticked) as label-beside-field rows with "i" hints; "Publish your edits as v3" only when the content changed since the published version (`contentFingerprint`, stored as `publishing.fingerprint`), with "Add a changelog comment"; "Apply these settings to v2" only when the mode, listed / unlisted or credit differ (no new version); with neither, a bold "Your published card is up to date". Each action ends in a pop-up with the details and link. A taken-down card says "Taken down by the CROW team". Anyone with the card's key can publish (for now).
- **A fork in set-up:** after Save your key, set-up has the source's modules selected and a closable two-line note (what wasn't copied, in short groups: `forkCopies(mode).notCopiedBrief`; that the scales start at the source's); the Basics summary says "Forked from <name> · v2 · Misty view".

## Publishing behaviour

- **A snapshot.** Publish releases the card as it is now; the draft stays private, and edits reach readers only when the community publishes them. Each publish is a numbered version (v1, v2…), with its date and an optional changelog comment.
- **Kept in full, privately; shown as the view mode allows.** Each version is stored in full where only the server can read it (`cards/{id}/versions`). What readers get is made from it for the card's current view mode (`publicView`) and stored separately (`public/{id}`), read only through `getPublicCard`. Changing the mode remakes the public copies, so less really means less: what a mode leaves out isn't sent at all. Earlier versions follow the current mode.
- **View modes:** Minimal, Foggy, Misty, Full; a new card starts on Minimal. What each shows, part by part, is `FIELDS` in `js/view-modes.js`, shown in the docs (Publishing; built from `FIELDS`). The same file is used by the editor (Export, the preview) and the server (copied at deploy), so the preview and the public card can't disagree. On public pages, "Not shared" = the mode leaves it out; "N/A" = not filled in.
- **Visibility:** listed (for the Library, Phase 5; until then, the same as unlisted) or unlisted (only by link; links can't be guessed). Links are short: `crowcards.org/c/crd_…` (a hosting rewrite to `card.html`).
- **Never public:** `editor` and `attribution` (the contact email is only for the CROW team). Credit is opt-in: name and organisation only if ticked.
- **Minimum to publish:** the community's name and type, and a contact email; whatever else is empty is left off the card.
- **Unpublishing** removes the public copies and keeps the private versions (publishing again carries on at v4); "Unpublish and delete history" deletes those too (back to v1).
- **Forking** ("Fork this card", Foggy, Misty and Full): the pop-up "Fork: <name> (<view>)" lists what's copied and what isn't (`forkCopies`); `forkCard` builds the new card only from the public copy. The community's own name, link and description are never copied; below Full, the target scales start at the source's computed scales. The fork records `forkedFrom` and its page says "Forked from <name> · v2 · Misty view".
- **Reporting:** a pixel flag under the back-to-top arrow on a published card (not the preview); a pop-up with a reason (`REPORT_REASONS`) or a note on what's wrong (at least one), and an optional (recommended) email; `reportCard` saves `reports/{id}`. Taking a card down is done by hand ("For the CROW team" below); a hidden card can't be republished.
- **The scales on a card:** 1 to 7. A card's score per scale = the average of the scores of its decision-making approaches, joining tiers, ways of joining and conflict approaches (accepted ones only, once `COUNT_PROPOSED` is off), rounded, with "based on N choices"; an option with no score on a scale (null) is left out; nothing scored = N/A. Shown in every mode; the community's own targets only in Full.

## Recommendations behaviour

How the editor suggests things to people filling in a card.

**Ground rules**
- It only **suggests**. It marks options with a chip, adds a note, or offers a few ideas to click; it never selects anything for people.
- Every suggestion **says why**, including anything that counts against it.
- Suggestions come from datasheets the team writes and reviews (on `scales.html`). Until the review is done, draft entries count too; that switch (`COUNT_PROPOSED`) is turned off before launch.

**What it uses.** Set-up asks, in this order: the community's name, type, size and link; a description in two boxes (its purpose: what it's for, who it's for and what happens there; and its culture); where it would like to be on three scales from 1 to 7 (how participatory, how transparent, how hierarchical); and up to 5 values.

**Suggesting values.** The values list is split into tabs (Goals, Organizing, Culture, Justice, Practices, Common), and each tab shows how many suggestions it holds. Each value gets a score from two things: **the description** (its words and phrases found in the two description boxes, e.g. Mutual aid: "help each other"; counts 1.5 times as much, being the community's own words) and **the scales** (how close the value points to where they'd like to be). The best 5 that score well are "Suggested"; others that score fairly well get "Also fits"; ties go to the one the description backs. Each chip quotes what matched (*Because you wrote "help each other"*) and/or where the value sits. The list updates when someone leaves a description box (not while they type) or changes a scale. With no description, suggestions come from the scales alone (as "Also fits" at most, with the current settings: see TODO.md).

**Suggesting approaches** (how decisions are made, ways of joining, how conflict is handled). Each option gets a score from three things:
- **The scales:** how close the approach sits to where the community wants to be.
- **The values they chose:** some values argue for an approach, some against (e.g. valuing *Trust* argues for consensus).
- **Their size:** some approaches suit small groups better than large ones, or the other way round (this counts half as much as the other two).

Options that score well get a lime **Suggested** chip; options that score fairly well get a quieter **Also fits** chip. There's no limit on how many. Each chip lists its reasons, e.g. "Because you value *Trust*: …" or "Can strain at your size: …". Lists show Suggested options first, then Also fits, then the rest A–Z.

**More like this / Try something new.** Under the options someone has chosen, a short strip offers, for the one they picked last: 3 similar options (closest on the scales), 2 very different ones, and 1 at random. Clicking one adds it. It also shows under the chosen values, even when 5 are chosen, to help people rethink.

**Other suggestions**, described under "Editor behaviour": the community's type suggests which modules to fill in; a known platform fills in its details and usual costs; and an answer in one module can prompt a change in another (e.g. a federated platform suggests the Federation module).

**Testing and tuning:** `test-recs.html` (for the team; deleted before launch) shows every value and approach with its score broken down, and lets the weights and cut-offs be changed to see the effect; the editor's own are `TUNING` in `js/recommend.js`. **Planned** (`TODO.md`): maybe word lists for approaches too.

**Later: our own language model.** A small open model run by the team (on a server in our Google Cloud project, not set up yet), so what communities write is never sent to an outside company. The site never talks to it directly; our server does, after checking the card's key, with a limit on how often. It would:
- read the description and suggest values, quoting the sentence each came from (the word lists stay as a backup for when the model is slow or down);
- read rules people paste in and suggest which listed rules match, plus custom rules for the rest;
- help fill in a card from a community's link (its about page and rules).

Its suggestions look and work like the others: chips with reasons, for people to accept or change. Before it's switched on, we'll compare it with the word lists on the test page.

*In the code:* `js/recommend.js` (scoring approaches, `scoreValues` / `valueSuggestions` for values, `cueMatches` / `describeValues` for the description, More like this), `js/controls/alike.js` (the strip), `data/governance_scales.json` (positions on the scales), `data/value_recommendations_*.json` (values for and against each approach), `data/approach_size_fit.json` (size), `data/value_groups.json` (the tabs and each value's words and phrases).

## Design system (crowcards.org)

- Tokens in `styles.css`. Colours: `--bg` beige `#F3EADF`, `--ink` `#141414`, `--gray`, `--line`, `--accent` orange `#FF8F00`, `--lime` `#BFFF00`, `--ink-on-color`, `--error` (light `#D10068`, dark `#FF1F8F`); mixes `--tint --tint-strong --glass --veil`. Sizes: `--fs-xs .72 / -s .9 / -m 1 / -body 1.2 / -l` (clamp), display `--fs-lede --fs-h --fs-art`. One breakpoint: `--narrow` (64rem).
- Fonts: Argent Pixel CF italic (headings, display), Helvetica LT Pro (body), Source Code Pro (mono, at 0.8em of the text around it).
- Dark mode: `[data-theme="dark"]` on `<html>` (screen only; print always uses the light colours), saved in localStorage.
- Links are mono, uppercase, with an orange underline, except `a.inline` (flows with body text). Pixel squares as bullets; Argent headings orange, lime on hover, letter by letter.
- Pixel look: stepped pixel corners (one shared clip-path, `--px` the step; pseudo-elements listed outside `:is()`), the pixel box for fields (`--box-px`, `--box-line`, `--field-fill`, registered as non-inheriting), pixel icons (X, +/−, ▾, arrows, the flag dot).

## Where things live

- **Shared controls** (`js/controls/`): `choices` (checkbox / radio lists: layouts, filter, sub-choices, badges, `show()`; `scaleField` for one-row radios; `choiceTable` for a row per question with the answers as buttons in columns (radios under angled headings when the table is narrow); `YES_NO`, `YES_NO_VARIES`), `fields` (text; `selectField` = a dropdown built on `suggest`), `suggest` (type-ahead; `stored()`, `storedValue`), `tags`, `rows` (repeatable rows: summarize, reorderable, `setAside()`), `picklist` (pick + notes / steps; `remembered`; `alike`; `notesOf`, `stepRole`), `alike` (the "More like this / Try something new" strip), `fold` (foldable sections, `sectionMaker`), `tabs` (`tabBox`: tabs with panels; `tabRow`: just the row, e.g. to filter a list), `inline-edit`.
- **Shared modules** (`js/`): `dom` (`el`, `button`, `chip`, `richText`, `uid`, `narrowWidth`, `infoTip`: a small pixel "i" with a hint bubble; `suggestField({ hintTip: true })` uses it), `data` (`loadData`), `api` (server calls, `errorKind`), `session`, `autosave`, `freshness` (deploy guard), `set-aside`, `structure` (the shared structure and its log: `changeStructure`, `logChanges`), `suggestions`, `recommend` (`suggestionsFrom`, `valueSuggestions`, `alike`, `FROM_BASICS`, `TUNING`), `modules` (module defaults), `view-modes` (what each view mode shows: `viewCard`, `publicView`, `FIELD_LABELS` (each part's name), `forkCopies(mode)` (what a fork from it gets, in full and in short groups); the rules count, rules by type and scales; `creditOf`, `contentFingerprint`, `COUNT_PROPOSED`; no page code, so the server can use it), `export` (`cardOutline`, `viewOutline`, `toMarkdown`, `download`, `fileName`, `labelIn` / `labels`), `popup` (`showPopup`, `confirmPopup`), `reveal` (things appearing after a choice), `scroll` (`keepPlace`, `pointTo`, `holdFloor`, `topLine`), `sidebar` (`narrowSidebar`), `laws`, `letters`, `prefs` (browser-only view prefs), `site` / `theme` / `crow` (every page), `docs-page` (the docs, scales and style pages' sidebars), `docs-reference` (tables built from data files: docs, scales), `laws-page`, `style-page`, `publish` (the Publish section on Export), `card-page` (the published card), `card-view` (`renderCard`: the card drawn as a card, for the published page, its preview and Export (under the downloads)).
- **Section helpers shared with Export:** `qualifierLabel` and `cardRules` (rules.js; the card's rules by type, custom ones under theirs), `DESCRIPTION` (basics.js), `toolLine` (infrastructure.js), `channelLine` (processes.js).
- **CSS:** `styles.css` = site-wide tokens and shared pieces (header, callout, buttons, pixel toggles / X / caret, one pill shape for `.chip` / `.tag` / docs pills, `.plain-list`, tables (sideways scroll on narrow screens), tabs, the sidebar layout and narrow bar, print styles `.no-print` / `.print-only`); `make.css` = editor and card (incl. `.choice-table`, `.field-rows` for label-beside-field rows, and the card's styles at the end); shared patterns are written once as selector lists: the pixel box, small gray text, small gray mono text, and flex rows (wrapping, and one-line), each component setting only its own gap; `docs.css` = the docs and scales pages. `style.html` (+ `js/style-page.js`) shows the components.
- **Tests:** none kept in the repo; see "Checking your work" above.

# For the CROW team

## Reports and taking a card down
People report published cards with the flag in the card page's corner. Reports are in the Firebase console → Firestore → `reports`: each has the card (`cardId`, `version`, `mode`), the `reason`, any `details`, the reporter's `email` (optional) and `status` (`"new"` until someone has looked).

To take a card down:
1. In Firestore, open `cards/{cardId}` and set `publishing.hidden` to `true` and `publishing.status` to `"unpublished"`. The server then refuses to publish it again, and its owner sees "Taken down by the CROW team" in Export.
2. Delete `public/{cardId}` and every document in its `versions` collection. Its link then says "This card isn't available".
3. On each of its reports, set `status` to `"done"` and add a `resolution` saying what was done.
4. If it helps, write to the contributor: their email is in `cards/{cardId}.attribution.contributorEmail` (never shown publicly).

To put a card back, set `publishing.hidden` to `false`: its owner can then publish it again.

For a report that needs no action, set its `status` to `"done"` with a `resolution` saying why.
