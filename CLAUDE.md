# CROW Cards — notes for Claude

Context for Claude Code sessions helping develop CROW Cards. Claude Code reads this file automatically in this repo; people can read it too. Setting up a machine (accounts, installs, running locally) is in `README.md`. The code is the final word: if this file and the code disagree, trust the code and update this file. Last reviewed in full: 2026-10-06.

## The project

CROW Cards (crowcards.org) is a tool for communities to describe how they govern themselves. People fill in a structured form (a "card"); with Phase 4, cards can be published, browsed in a Library, and forked as a starting point. A collaboration between Princeton HCI and Bonfire Networks; the project lead is Sohyeon.

- Live: crowcards.org (GitHub Pages, from `main`, until launch; then Firebase) · Staging: staging.crowcards.org (Firebase, deployed from `beta`)
- Firebase / Google Cloud project: `cos-princeton-hci-crow` (one project for hosting, database, functions, and later the language model's VM)
- The team's plan (what's done, in progress, and to do; tasks to claim): the **Task log** at the end of this file.

## How to work on this project

Contributors range from developers to researchers who are comfortable in a terminal but not with backend code, so:

- **Propose first, build on agreement.** Work in small chunks, each checked before the next. Before building, say what you'll do and why, in plain language; flag anything ambiguous and ask, rather than guess. This applies to data files (e.g. new datasheets, scoring files) as much as to code.
- **Golden rule: never create redundant or near-duplicate CSS or JS.** Before writing something new, look for a shared piece that does it (see "Where things live"), and reuse or extend it. Shared helpers go in the shared files, not copied into a page or module.
- **Explain as you go.** Say what changed, where, and why; point to files as `path:line`.
- **Checking your work:** there's no saved test suite (by choice). For each change, write quick checks aimed at it (jsdom for code and data; Playwright against the local emulator only when a change needs a real browser, e.g. layout, or flows through the server), run them, and don't keep them. End each step with a short "Please check" list for the person: what to look at in the browser (light and dark mode, phone width), downloads, and so on.
- **Git and deploying are the person's job.** Don't commit, push or deploy unless asked. Work happens on a branch off `beta` (staging); never on `main`, which serves crowcards.org until launch. Remind the person that `firebase deploy` updates staging for the whole team, and that its database holds the team's test cards.
- **Keep the docs in step.** After a major piece of work, update this file, including its Task log (status and notes; never someone else's claim); every so often, review the codebase for duplication and dead code.
- **Wording:** in the UI, "select / unselect", never "tick". Write UI text in plain, friendly language.
- **Secrets:** a card's secret is never shown again after it's created, never logged, never sent anywhere but the server. Never put keys or credentials in the repo.

## Running and deploying (quick reference; details in README.md)

- `firebase emulators:start` in the repo (add `--import=emulator-data --export-on-exit` to keep local test cards): the site at localhost:5000, the emulator dashboard at localhost:4000. `js/api.js` uses the emulator automatically on localhost, so nothing local touches staging.
- `firebase deploy --only functions,hosting` deploys to staging (the person does this). The hosting deploy runs `scripts/stamp-version.mjs` first.

## Architecture

- **Hosting:** Firebase Hosting serves `crowweb/` (`"public": "."`). Pages: `index.html`, `about.html`, `make.html` (the editor: start / key / set-up / modules / export), `docs.html`, `laws.html` (laws for a card's locations; savable as a PDF), `library.html` (placeholder until Phase 4), `coming-soon.html` (maintenance page, turned on with a hosting rewrite), `404.html` (root-relative paths), `style.html` (style reference, noindex, not linked; includes a preview of the four view modes), `scales.html` (the team's review of `governance_scales.json`, noindex, not linked). Hosting ignores `functions/`, `scripts/`, rules / index files, `README.md`, `CLAUDE.md`, logs, `emulator-data/`.
- **Deploy stamp:** `firebase.json` hosting `predeploy` runs `scripts/stamp-version.mjs`, writing `version.json` (a hash of the site's html/js/css/json; gitignored). `js/freshness.js` uses it to stop an editor tab left open across a deploy from saving (see "Editor behaviour").
- **Database:** Firestore, deny-all security rules (all access goes through the functions).
  - `cards/{cardId}`: one document per card (the schema below).
  - `cardKeys/{sha256 of the secret}`: `{ cardId, createdAt, lastUsedAt }`, the auth mapping.
- **Cloud Functions** (`functions/index.js`, Node 24, us-central1, `maxInstances: 10`):
  - `createCard()` → `{ cardId, secret }`: `crd_` + 12 letters/digits; a 32-byte URL-safe secret; the card and its key written in one batch.
  - `getCard({ cardId, secret })` → `{ card }`.
  - `updateCard({ cardId, secret, updates, ifUpdatedAt, reset })` → `{ updatedAt }` (plus `{ card }` after a reset). Only `EDITABLE_PARTS` (`modules`, `basics`, `infrastructure`, `membership`, `rules`, `processes`, `federation`, `customModules`, `attribution`, `editor`); each part must be the same kind (list / object; `modules` may be null) as on a new card; each part sent replaces the stored one whole (Firestore `mergeFields`), so the editor always sends whole parts. `ifUpdatedAt` is checked in a transaction (`failed-precondition` if the card changed). `reset: [parts]` puts parts back as `makeEmptyCard` defines them. A card over ~900 KB is refused (`resource-exhausted`).
  - `verifyKey` checks the key first (one read); only on failure is the card looked up, so a typo'd ID (`not-found`, "No card has this ID") is told apart from a wrong secret (`permission-denied`). `lastUsedAt` is written at most once a day.
- **Reference data:** 22 JSON files in `/data/`, loaded with `loadData()` (`js/data.js`, cached per page): platforms, cost_rules, cost_overrides, tools, values, value_conflicts, value_recommendations_{decision,membership,conflict}, membership_options, membership_tiers, decision_approaches, conflict_management, rule_schema, covenants, community_types, module_defaults, federation_subscription_lists, countries, laws, enums, governance_scales (the 1–5 scales, under review). The same files drive the editor, the docs (Reference tables via `js/docs-reference.js`) and the laws page. `laws.json` is a placeholder until a student's reviewed datasheet replaces it.

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
status ("draft"), visibility ("private"), forkedFrom (null)   // placeholders: replaced in Phase 4 (see below)

modules                           // ordered built-in + custom module ids; null = not set up yet, [] = none (Basics is implicit)
customModules: [{ id, name, description, fields: [{ id, label, type: "text"|"checkbox"|"radio"|"scale", value, options?, low?, high? }] }]   // ids "cm_…", "f_…"
attribution: { contributorName, contributorEmail, organization }
editor: {                         // editor-only: never in public views or exports
  costsPrefill: { platformName, typeId, costs } | null,   // what costs were pre-filled from
  structureReviewed[], structureLog[],   // the "changed in Processes" notice; log entries { id, change: "added"|"removed"|"reviewed", from, at }
  dismissedSuggestions[],
  setAside: { "<part>.<key>": value }    // e.g. "membership.joining.closedNote", "membership.structure:<id>": { note },
                                         // "processes.moderation.approachNotes:<id>": { note }, "federation.relevantRules:<id>": { selected?, note? },
                                         // "rules.selected:<id>": { qualifier }, "rules.ruleEdits:<id>", "customModules.<cm id>.fields:<field id>": { options?, low?, high?, answers? }
}

basics: { name, link, type, size, keywords[], values[] }

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
  relevantRules[], ruleNotes { <rule id>: note },   // the card's rules that guide federation decisions
  bridging: { bridges ("yes"|"no"|null), protocols[] }
}
```

## Reference data shape

Most files are `{ version, updatedAt, source? / note?, items: [{ id, label, description, … }] }`. The exceptions keep their own top-level lists: `enums.json` (one list per enum, e.g. `communitySize`), `rule_schema.json` (`qualifierSets`, `categories`, `types`), `cost_rules.json` (`categories`, `types`), `countries.json` (`countries`, `regions`), `membership_tiers.json` (`tiers`), `module_defaults.json` (`modules`, `default`, `byCommunityType`, `byStructuralModel`).

The `id` is stable snake_case, and is what a card stores; the `label` is what the UI shows, so labels can be reworded without breaking cards. "Category" (`category` / `categories`) groups items in a list (tools, federation lists, laws, rule categories); "type" is what a community or platform is. Recommendation files hold `{ id, value, recommends, why, status }`; only `status: "accepted"` is used.

## Editor behaviour (make.html)

- **Flow:** Start ("Start a new card" / "Edit an existing card") → Save your key (ID + secret, Copy, Download .txt, must confirm) → Set up (Basics + modules; name required) → Editor. Modules are `make.html#<id>`; `#export` is the Export page.
- **Sidebar:** card name / ID, modules (with a lime flag dot when a suggestion waits), Save + status, Forget, Reset, Export, Docs. Narrow screens: a slim bar (module ▾, Docs, status + name + "+" menu) that drops the module list down (`js/sidebar.js`, shared with the docs).
- **Autosave** (`js/autosave.js`): one saver per card part, ~1 s debounce, saves on leaving a field, one save at a time across the page, each with `ifUpdatedAt`; retries network errors with backoff. Stops (and says why) on: no-card, bad-key, conflict (pop-up: "Load the latest version" or "Keep mine", covering every unsaved part), stale (the deploy guard: "Reload the page"), too-big, invalid. Warns before leaving with unsaved changes (the browser's own box).
- **Forms:** each module is `render<Module>(container, part, data, hooks)` → `{ collect, setAside?, focusFirst }`, mounted by `mountSection` in `js/make.js` with hooks `onInput`, `onCommit`, `stateKey`, `getPart`, `setPart` / `setParts` (change other parts; the form's own part is recorded first, so suggestions never see a half-done change), and `setAside` (that part's set-aside answers). `syncAside` keeps `editor.setAside` in step.
- **Pre-filling:** a listed platform fills in its details (from `platforms.json`) and the usual costs (`cost_rules.json` + `cost_overrides.json`); a later platform change pops up what changed; a platform-type change offers the cost changes, each accepted or not.
- **Suggestions** (`js/suggestions.js`, recomputed after each finished change): the structural model ↔ the Federation module; the structure changed in Processes (on Membership, with Keep / Undo, each change named with where it came from); a quiet note in Processes. Dismissed ids live in `editor.dismissedSuggestions`. A new suggestion out of sight gets a "↑ New suggestion" pill.
- **Recommendations** (`js/recommend.js`): a card's values add lime "Suggested" chips (with reasons) in decision-making approaches, ways of joining and conflict management. No recommendation boxes (tried; chips preferred).
- **Module defaults:** a community type suggests modules (`module_defaults.json`); during set-up they switch automatically while untouched.
- **Rules:** select rules by type (Select all / Clear), qualifiers per rule; a summary at the bottom with "Change wording" (`ruleEdits`, keeping the original) and Custom rules.
- **Processes:** the shared structure in three tabs (Change, Maintenance, Moderation), each with its own notes; Conflict management as steps (drag into order; same step = in parallel; primary); Communications.
- **Reset:** clear chosen modules, or start over on the same card (ID and secret kept). **Export:** the card as an outline on the page, as Markdown, and as JSON (`cardData`: Basics + switched-on modules; never `editor` or `attribution`).
- **Pop-ups:** one shared `<dialog>` (`js/popup.js`): `showPopup` (tone "error" = pink), `confirmPopup` (instead of the browser's `confirm()`).

## Design system (crowcards.org)

- Tokens in `styles.css`. Colours: `--bg` beige `#F3EADF`, `--ink` `#141414`, `--gray`, `--line`, `--accent` orange `#FF8F00`, `--lime` `#BFFF00`, `--ink-on-color`, `--error` (light `#D10068`, dark `#FF1F8F`); mixes `--tint --tint-strong --glass --veil`. Sizes: `--fs-xs .72 / -s .9 / -m 1 / -body 1.2 / -l` (clamp), display `--fs-lede --fs-h --fs-art`. One breakpoint: `--narrow` (64rem).
- Fonts: Argent Pixel CF italic (headings, display), Helvetica LT Pro (body), Source Code Pro (mono, at 0.8em of the text around it).
- Dark mode: `[data-theme="dark"]` on `<html>` (screen only; print always uses the light colours), saved in localStorage.
- Links are mono, uppercase, with an orange underline, except `a.inline` (flows with body text). Pixel squares as bullets; Argent headings orange, lime on hover, letter by letter.
- Pixel look: stepped pixel corners (one shared clip-path, `--px` the step; pseudo-elements listed outside `:is()`), the pixel box for fields (`--box-px`, `--box-line`, `--field-fill`, registered as non-inheriting), pixel icons (X, +/−, ▾, arrows, the flag dot).

## Where things live

- **Shared controls** (`js/controls/`): `choices` (checkbox / radio lists: layouts, filter, sub-choices, badges, `show()`; `scaleField` for one-row radios; `YES_NO`, `YES_NO_VARIES`), `fields` (text; `selectField` = a dropdown built on `suggest`), `suggest` (type-ahead; `stored()`, `storedValue`), `tags`, `rows` (repeatable rows: summarize, reorderable, `setAside()`), `picklist` (pick + notes / steps; `remembered`; `notesOf`, `stepRole`), `fold` (foldable sections, `sectionMaker`), `tabs`, `inline-edit`.
- **Shared modules** (`js/`): `dom` (`el`, `button`, `chip`, `richText`, `uid`, `narrowWidth`), `data` (`loadData`), `api` (server calls, `errorKind`), `session`, `autosave`, `freshness` (deploy guard), `set-aside`, `structure` (the shared structure and its log: `changeStructure`, `logChanges`), `suggestions`, `recommend` (`suggestionsFrom`, `FROM_VALUES`), `modules` (module defaults), `view-modes` (what each view mode shows; the rules count and scales; no page code, so the server can use it), `export` (`cardOutline`, `publicOutline`, `outlineElements`, `cardData`, `toMarkdown`), `popup` (`showPopup`, `confirmPopup`), `reveal` (things appearing after a choice), `scroll` (`keepPlace`, `pointTo`, `holdFloor`, `topLine`), `sidebar` (`narrowSidebar`), `laws`, `letters`, `prefs` (browser-only view prefs), `site` / `theme` / `crow` (every page), `docs-page` (the docs, scales and style pages' sidebars), `docs-reference` (tables built from data files: docs, scales), `laws-page`, `style-page`.
- **Section helpers shared with Export:** `qualifierLabel` (rules.js), `toolLine` (infrastructure.js), `channelLine` (processes.js).
- **CSS:** `styles.css` = site-wide tokens and shared pieces (header, callout, buttons, pixel toggles / X / caret, one pill shape for `.chip` / `.tag` / docs pills, `.plain-list`, tables (sideways scroll on narrow screens), tabs, the sidebar layout and narrow bar, print styles `.no-print` / `.print-only`); `make.css` = editor only; `docs.css` = the docs and scales pages. `style.html` (+ `js/style-page.js`) shows the components.
- **Tests:** none kept in the repo; see "Checking your work" above.

# Task log

The team's plan, in one place: what's done, what's being worked on, and what's still to do. People read it (e.g. on GitHub); Claude reads it too.

**Claiming a task:** put your name in its **Who** column and set **Status** to *In progress* (commit that on your branch, and tell the team). If a task already has a name, ask that person before taking it over. When it's finished, set it to *Done*, and add anything others need to know to the notes or to the relevant section of this file.

**Statuses:** *Done* · *In progress* · *In review* (built or drafted, waiting for someone to check) · *To do* · *Later*.

**For Claude:** when you finish a piece of work, update its row here (status, notes) along with the rest of this file; don't change someone else's claim.

## Now

| Task | Status | Who | Notes |
|---|---|---|---|
| 4a: review the governance scores | In review | Sohyeon | On `scales.html`. Accept or change each option's scores and reason; only accepted scores count. |
| 4b: publishing | To do (plan proposed, **not yet approved**) | | Revisit after the 4a review. Claude's proposal: (1) server and storage (`published` on the card, private `cards/{id}/versions/{n}`, public `publicCards/{id}` + `/versions/{n}`, five functions, database rules, the copy-to-server script); (2) the editor's Publish page; (3) checks on the emulator. Sohyeon has answered the proposal's questions (recorded under "Phase 4 → Decisions"), but hasn't approved the plan as a whole: go over it again before building. |
| Set up the language model's VM | To do | | Needed for UX tasks 1 and 2. In the project `cos-princeton-hci-crow`. |

## Done

| Phase | What it covered | Status |
|---|---|---|
| 1. The editor and the server | The basics of connecting the frontend to the backend: starting a new card or opening one with its card ID and secret; the secret shown once, to copy or download; answers saved automatically as you go, without overwriting changes made elsewhere; Basics, the first section. | Done |
| 2. The rest of the editor | Infrastructure, Membership, Rules, Processes and Federation, and a community's own custom modules, built from shared components (choice lists, type-ahead fields, tags, lists with notes, repeatable rows, folding sections, tabs, etc). | Done |
| 3. Pre-filling and recommendations | We fill in platform details and usual costs; a card's values suggest decision-making approaches, ways of joining and conflict management, with reasons; a community's type suggests its modules; suggestions appear where a selection affects a module (e.g. a federated platform suggests Federation). Pre-filled stuff / recommendations are defined in a series of datasheets we make. We will want to improve the recommendation / suggestions engine eventually (see UX task 3). | Done |
| 3.5. Basic UI/UX improvements | A design pass over every field and page (with a style page of the components); export as JSON and Markdown; the Docs page; a review of how cards are stored, so answers set aside while editing come back; a guard for editor tabs left open across an update, and syncing across several tabs on the same card. Also the Laws to know page (savable as a PDF), to be updated with the final datasheet. | Done |
| 4a. View modes and the 1–5 scales (built) | What each view mode shows, as one set of rules (`js/view-modes.js`); the governance scales and their scoring file (`data/governance_scales.json`, under review on `scales.html`); Export's outline understands modes ("Not shared" / "N/A", the rules count, the scales); a preview of the four modes on `style.html`. | Done (scores in review) |

## Phase 4: publishing and sharing

Let communities publish their card for others to read, browse published cards in the Library, and start a new card from one they like (forking), while each community decides how much it shares.

### The work

| Chunk | What it covers | Status | Who |
|---|---|---|---|
| 4a. View modes | What each mode shows, as one shared set of rules; the 1–5 scales and the scoring file behind them. | In review (scores) | Sohyeon (review) |
| 4b. Publish | Server: private full versions, public copies per mode, database rules; copying `view-modes.js` and its data files to the server at deploy. Editor: a Publish panel with the view mode (and a preview of each), listed / unlisted, credit, a note on what changed, Publish changes and Unpublish. | To do (next) | |
| 4c. The public card page | The card in its view mode, its versions, credit, downloads (Full only), the report icon, and a short link to share (`/c/crd_…`). | To do | |
| 4d. The Library | Listed cards: a filter sidebar (type, size, platform model, the 1–5 scales, values, search), a grid that adapts to the window, and a grid / list toggle. Visual design to work through first. | To do | |
| 4e. Forking | "Use as a starting point" from Minimal plus, Foggy and Full; what's not shared starts empty; the opening pop-up for each mode; "Adapted from …" on the new card. | To do | |
| 4f. Safety | Reports (saved for the team), taking a card down, and the protections needed before launch (see "Before launch"). | To do | |

### Decisions (agreed 2026-10-05 / 06)

- **Publishing is a snapshot.** Publish releases the card as it is now; the draft stays private, and edits only reach readers when the community presses Publish changes. Each publish is a numbered version (v1, v2…), with its date and an optional note on what changed. Unpublish withdraws it.
- **Visibility:** listed (in the Library, and readable by link), unlisted (readable only by link; card links can't be guessed), or not published (the private draft). Listed and unlisted cards use the same view modes.
- **View modes** decide how much a published card shows: Minimal, Minimal plus, Foggy or Full (table below). A new card starts on Minimal.
- **Version history is public,** following the card's current visibility and view mode: if a community shares less later, its earlier versions are shown in the same, smaller way.
- **Never public:** the `editor` part (dismissed suggestions, answers set aside while editing, …) and the contributor's email (kept only so the CROW team can get in touch). **Credit is opt-in:** the contributor's name and organisation appear only if they choose to show them.
- **Minimum to publish:** enough to show Minimal: a community name and type are required. Anything else Minimal shows but the card hasn't filled in is listed in the Publish panel as a reminder ("Publish anyway"), not a blocker.
- **On public pages,** "N/A" means the community hasn't filled something in; "Not shared" means its view mode leaves it out.
- **Links** are short: `crowcards.org/c/crd_…` (a hosting rewrite to the card page).
- **Forking** works from Minimal plus, Foggy and Full. A fork copies only what's shared; the rest starts empty, and a pop-up at the start explains, for that view mode, what was copied and what wasn't. The fork records `forkedFrom` (card, version, name) and shows "Adapted from …".
- **Reporting:** a small pixel "report" icon above the back-to-top arrow on public pages. Reports are saved as a list in the database (`reports`) for the team to check, with email alerts added before a public launch.
- **Publishing in the editor (4b):** a "Publish" page in the sidebar, next to Export (`make.html#publish`): status, view mode (with a preview), listed / unlisted, credit, a note on what changed, Publish / Publish changes, Unpublish. Anyone with the card's key can publish (for now). Publishing needs the community name and type, and the contributor's **email (required)**, shown with: "Only the CROW team sees this, to contact you about your card. It's never shown publicly." Name and organisation are optional, shown only if ticked.
- **Unpublishing** removes all public copies at once but keeps the private versions, so publishing again carries on numbering (v4 after v3). A separate, clearly worded "Unpublish and delete history" also deletes the private versions, for a fresh start at v1.
- **Taking a card down** (the CROW team): to start, in the Firebase console, following a written procedure (mark it hidden, remove its public copies; the server refuses to re-publish a hidden card); a small admin page with Google sign-in for the team later, if needed.
- **The Library:** a sidebar of filters (the shared sidebar: a drop-down bar on narrow screens), and a card grid that adapts to the window, with a grid / list toggle. Visual design still to decide.
- **The scales:** Participatory, Transparent, Hierarchical (it stays "Hierarchical", 5 = most hierarchical: the scales describe, they don't judge). A card's score = the average of the *accepted* scores of its decision-making approaches, joining tiers, ways of joining and conflict approaches, rounded to a whole number, shown with "based on N choices"; an option that says nothing about a scale (null) is left out, not counted as low; nothing scored = "N/A". The same scores feed UX task 3.

### View modes

What a published card shows in each mode. Changing the mode changes every published version at once. (The code's version of this table is `FIELDS` in `js/view-modes.js`.)

| Part of the card | Minimal | Minimal plus | Foggy | Full |
|---|---|---|---|---|
| Basics: name, link, type, size, keywords, values | Yes | Yes | Yes | Yes |
| Platform: platform, software, platform type, structural model | Yes | Yes | Yes | Yes |
| Locations (servers, members, admin team) | No | Yes | Yes | Yes |
| Rest of Infrastructure: protocol, open source, self-hosted, costs, tools | No | No | Yes | Yes |
| How people join (tiers) | Yes | Yes | Yes | Yes |
| Ways of joining, with their notes | No | No | Yes | Yes |
| Rules: a count per kind (e.g. "18 rules: 11 on behavior, 7 on content") | Yes | Yes | Yes | Yes |
| The rules themselves: selected rules, qualifiers, wording, covenants, custom rules | No | Yes | Yes | Yes |
| Decision-making approaches (in Membership and the Processes tabs) | No | No | No notes | Yes |
| Conflict management steps | No | No | No notes | Yes |
| Communication: whether a channel is specified (Full: which) | No | No | Yes | Yes |
| Federation: approach and response ladder | No | No | No notes | Yes |
| The 1–5 scales | Yes | Yes | Yes | Yes |
| All notes and general notes, the rest of Federation | No | No | No | Yes |
| Custom modules | No | No | No | Yes |
| Downloads (JSON, Markdown) | No | No | No | Yes |
| Can be forked | No | Yes | Yes | Yes |

"No notes" = shown, without the community's notes on it. Federation only appears for communities that use the Federation module.

### How publishing works

- Each published version is kept **in full, privately**: only the server can read it.
- What the public sees is **made from it for the card's current view mode**, and only that is stored where anyone can read it (straight from the database, no key needed). Changing the mode makes the public copies again, so less really means less: notes are removed from public reach, not just hidden on the page.
- The rules for what each mode shows live in **one place** (`js/view-modes.js`), used both by the editor (Export, previews) and, from 4b, by the server (copied to it at deploy), so the preview and the public card can never disagree.
- Everything else (publishing, changing the mode, forking, reporting) goes through the server, which checks the card's key.

### 4a: what was built

- `js/view-modes.js`: `MODES` (names, descriptions, forkable), `FIELDS` + `shows(field, mode)` (the table above), `viewCard(card, mode)` (the card as a mode shows it; never `editor` or `attribution`; switched-off modules left out), `rulesCount(card, ruleSchema)`, `cardScales(card, scaleData, { includeProposed })`. No page code, so the server can use it.
- `data/governance_scales.json`: 74 options (32 decision-making approaches, 4 joining tiers, 19 ways of joining, 19 conflict approaches) scored 1–5 on each scale (null where an option says nothing about it), each with a quotable reason and a status (`proposed` until accepted). Reviewed on `scales.html` (built from the file by `js/docs-reference.js`).
- `js/export.js`: `cardOutline(card, data, defaults, { mode, rulesCount, scales })` (with a mode: one "Not shared" row per hidden part, "N/A" for empty ones, the rules count, a "Governance scales" section); `publicOutline(card, data, defaults, mode)` puts it together; `outlineElements` draws an outline; Export's raw data is `viewCard(card, "full")`.
- `style.html` → View modes: one sample card in all four modes.

## UX improvements

Ways to make filling in a card easier and the suggestions smarter, alongside Phase 4.

**The language model (for tasks 1 and 2):** the team's own small open model, to run on a VM in the project `cos-princeton-hci-crow` (not set up yet), so what communities write never goes to a third party. The browser doesn't call the VM directly (its address and any key would be public, and anyone could use it): a Cloud Function calls it on the editor's behalf, checking the card's key, with a rate limit. The model only ever **suggests**: people review what it proposes and choose what to keep; nothing is selected silently.

| Task | Depends on | Status | Who |
|---|---|---|---|
| 1. Values from a description | The language model | To do | |
| 2. Rules from pasted text | The language model | To do | |
| 3. Weighted suggestions for decision-making approaches | 4a's scores (in review) | To do | |

1. **Values from a description.**
   - *Sohyeon's notes:* improve the Basics / set-up page so people are prompted to describe their community, its goals, and the culture they want to cultivate. The local LLM takes that open text and suggests values. Limit value selection to 5 that best describe the community; people can then edit / scroll / review. Let them know it doesn't mean the absence of other values.
   - *Notes:* a new `basics.description` (and maybe goals / culture as separate prompts). The model's suggestions reuse the lime "Suggested" chips in the values list. **Decided:** 5 is a limit on how many values a card can select (the values list in Basics stops further selections at 5, saying why; today it has no limit, so this is a change to Basics too). *To decide:* where the description sits in the view modes (Minimal shows all of Basics).
2. **Rules from pasted text.**
   - *Sohyeon's notes:* improve the Rules page so people can copy in their rule text, and the local LLM fills in the applicable rules and adds any custom rules.
   - *Notes:* this brings back "Your rules, in your words" (`rules.communityRulesText`, already in the schema). The model maps the text to rule ids and qualifiers, plus custom rules for anything else; the page shows them as proposed selections to accept or change, each with the sentence it came from where the model can give it.
3. **Weighted suggestions for decision-making approaches.**
   - *Sohyeon's notes:* develop a simple algorithm to provide more nuanced / weighted suggestions, using (i) values, (ii) a 1–5 scale for participatory, transparent and hierarchical that the community indicates, and (iii) attributes like community type and size. Propose another approach if better. (a) Also "more like this" / "something different" for each approach, so people can look at similar things and also very different things.
   - *Notes:* a simple, explainable score for each approach, made of: how close its own scores (4a's scoring file) are to what the community says it wants on the three scales; the existing value recommendations (e.g. "Trust" suggests consensus); and how well it suits the community's type and size (a small new datasheet to review, e.g. consensus can strain in very large communities). Each suggestion says why (e.g. "close to what you want on participation · suggested by your value *Trust* · can strain in large communities"). "More like this" / "something different" = the approaches with the nearest and furthest scores. Once communities say what they want on the scales, the editor can also point out gaps ("you'd like decisions to be very transparent, but the approaches you've chosen average 2"). *To decide:* where in the editor a community says what it wants on the three scales (these are new inputs, different from the 4a scales, which describe what a card chose).

## Before launch

| Task | Status | Who |
|---|---|---|
| App Check, so only the CROW site can use the server; and limits on how often cards can be made, forked or reported | To do | |
| Restrict the Firebase browser key to our own sites (Google Cloud console → APIs & Services → Credentials) | To do | |
| Security headers for the site (in `firebase.json`) | To do | |
| The reviewed `laws.json` (Prishaa's datasheet replaces the placeholder) | To do | |
| An accessibility review | To do | |
| Switch crowcards.org from GitHub Pages to Firebase | To do | |

## Later

- **A visual summary card** to download and share (image and / or PDF): Export's disabled third download; also on the public card page.
- **Filling in from a community's link** (suggest Basics from its website).
- **Starting templates** from CommunityRule's governance templates (`_all_templates.json`, not yet used).
- **Linked data (JSON-LD)**, once there are real published cards to shape it against.
- **To consider:** shared editing and recovering a lost key (several stewards per community); comparing cards, e.g. checking two communities' policies before they federate; showing a community's card on its platform (e.g. Bonfire); translation.

## Open questions

- **The Library's design:** what a card looks like in the grid and in the list, and which filters matter most.
- **UX task 1:** where the community's description sits in the view modes.
- **UX task 3:** where communities say what they want on the three scales.
