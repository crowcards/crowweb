# CROW Cards — notes for Claude

Context for Claude Code sessions helping develop CROW Cards. Claude Code reads this file automatically in this repo; people can read it too. Setting up a machine (accounts, installs, running locally) is in `README.md`. The code is the final word: if this file and the code disagree, trust the code and update this file. Last reviewed in full: 2026-10-06.

## The project

CROW Cards (crowcards.org) is a tool for communities to describe how they govern themselves. People fill in a structured form (a "card"); with Phase 4, cards can be published, browsed in a Library, and forked as a starting point. A collaboration between Princeton HCI and Bonfire Networks; the project lead is Sohyeon.

- Live: crowcards.org (GitHub Pages, from `main`, until launch; then Firebase) · Staging: staging.crowcards.org (Firebase, deployed from `beta`)
- Firebase / Google Cloud project: `cos-princeton-hci-crow` (one project for hosting, database, functions, and later the language model's VM)
- The team's shared plan, readable by collaborators: `plan.html` (noindex, not linked).

## How to work on this project

Contributors range from developers to researchers who are comfortable in a terminal but not with backend code, so:

- **Propose first, build on agreement.** Work in small chunks, each checked before the next. Before building, say what you'll do and why, in plain language; flag anything ambiguous and ask, rather than guess. This applies to data files (e.g. new datasheets, scoring files) as much as to code.
- **Golden rule: never create redundant or near-duplicate CSS or JS.** Before writing something new, look for a shared piece that does it (see "Where things live"), and reuse or extend it. Shared helpers go in the shared files, not copied into a page or module.
- **Explain as you go.** Say what changed, where, and why; point to files as `path:line`.
- **Checking your work:** there's no saved test suite (by choice). For each change, write quick checks aimed at it (jsdom for code and data; Playwright against the local emulator only when a change needs a real browser, e.g. layout, or flows through the server), run them, and don't keep them. End each step with a short "Please check" list for the person: what to look at in the browser (light and dark mode, phone width), downloads, and so on.
- **Git and deploying are the person's job.** Don't commit, push or deploy unless asked. Work happens on a branch off `beta` (staging); never on `main`, which serves crowcards.org until launch. Remind the person that `firebase deploy` updates staging for the whole team, and that its database holds the team's test cards.
- **Keep the docs in step.** After a major piece of work, update this file (and `plan.html` for anything the team tracks there); every so often, review the codebase for duplication and dead code.
- **Wording:** in the UI, "select / unselect", never "tick". Write UI text in plain, friendly language.
- **Secrets:** a card's secret is never shown again after it's created, never logged, never sent anywhere but the server. Never put keys or credentials in the repo.

## Running and deploying (quick reference; details in README.md)

- `firebase emulators:start` in the repo (add `--import=emulator-data --export-on-exit` to keep local test cards): the site at localhost:5000, the emulator dashboard at localhost:4000. `js/api.js` uses the emulator automatically on localhost, so nothing local touches staging.
- `firebase deploy --only functions,hosting` deploys to staging (the person does this). The hosting deploy runs `scripts/stamp-version.mjs` first.

## Architecture

- **Hosting:** Firebase Hosting serves `crowweb/` (`"public": "."`). Pages: `index.html`, `about.html`, `make.html` (the editor: start / key / set-up / modules / export), `docs.html`, `laws.html` (laws for a card's locations; savable as a PDF), `library.html` (placeholder until Phase 4), `coming-soon.html` (maintenance page, turned on with a hosting rewrite), `404.html` (root-relative paths), `style.html` (style reference, noindex, not linked), `plan.html` (the team's plan, noindex, not linked). Hosting ignores `functions/`, `scripts/`, rules / index files, `README.md`, `CLAUDE.md`, logs, `emulator-data/`.
- **Deploy stamp:** `firebase.json` hosting `predeploy` runs `scripts/stamp-version.mjs`, writing `version.json` (a hash of the site's html/js/css/json; gitignored). `js/freshness.js` uses it to stop an editor tab left open across a deploy from saving (see "Editor behaviour").
- **Database:** Firestore, deny-all security rules (all access goes through the functions).
  - `cards/{cardId}`: one document per card (the schema below).
  - `cardKeys/{sha256 of the secret}`: `{ cardId, createdAt, lastUsedAt }`, the auth mapping.
- **Cloud Functions** (`functions/index.js`, Node 24, us-central1, `maxInstances: 10`):
  - `createCard()` → `{ cardId, secret }`: `crd_` + 12 letters/digits; a 32-byte URL-safe secret; the card and its key written in one batch.
  - `getCard({ cardId, secret })` → `{ card }`.
  - `updateCard({ cardId, secret, updates, ifUpdatedAt, reset })` → `{ updatedAt }` (plus `{ card }` after a reset). Only `EDITABLE_PARTS` (`modules`, `basics`, `infrastructure`, `membership`, `rules`, `processes`, `federation`, `customModules`, `attribution`, `editor`); each part must be the same kind (list / object; `modules` may be null) as on a new card; each part sent replaces the stored one whole (Firestore `mergeFields`), so the editor always sends whole parts. `ifUpdatedAt` is checked in a transaction (`failed-precondition` if the card changed). `reset: [parts]` puts parts back as `makeEmptyCard` defines them. A card over ~900 KB is refused (`resource-exhausted`).
  - `verifyKey` checks the key first (one read); only on failure is the card looked up, so a typo'd ID (`not-found`, "No card has this ID") is told apart from a wrong secret (`permission-denied`). `lastUsedAt` is written at most once a day.
- **Reference data:** 21 JSON files in `/data/`, loaded with `loadData()` (`js/data.js`, cached per page): platforms, cost_rules, cost_overrides, tools, values, value_conflicts, value_recommendations_{decision,membership,conflict}, membership_options, membership_tiers, decision_approaches, conflict_management, rule_schema, covenants, community_types, module_defaults, federation_subscription_lists, countries, laws, enums. The same files drive the editor, the docs (Reference tables via `js/docs-reference.js`) and the laws page. `laws.json` is a placeholder until a student's reviewed datasheet replaces it.

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

## Phase 4 design (agreed 2026-10-05)

The readable version, with the view-mode table, is `plan.html`.
- **Publishing is a snapshot.** Publish releases the card as it is; the draft stays private; Publish changes releases a new numbered version (v1, v2…, with a date and an optional note). Unpublish withdraws it.
- **Visibility:** listed (in the Library and by link), unlisted (by link only), or not published (the private draft).
- **View modes** (listed and unlisted alike; a new card starts on Minimal), each showing:
  - **Minimal:** Basics; platform, software, platform type, structural model; how people join (tiers); a count of rules per kind; the 1–5 scales.
  - **Minimal plus:** Minimal + the rules themselves (selected rules, qualifiers, wording, covenants, custom rules) + locations.
  - **Foggy:** Basics; all of Infrastructure; tiers + ways of joining with their notes; rules; decision-making approaches (no notes); conflict management steps (no notes); whether a communication channel is specified; Federation approach and ladder (no notes).
  - **Full:** everything, with notes, custom modules, and the JSON / Markdown downloads.
  - **Every mode:** credit if opted in; the 1–5 scales (participatory, transparent, hierarchical; computed from decision-making approaches, joining and conflict management via a reviewed scoring file).
- **On public pages:** "N/A" = the community hasn't filled it in; "Not shared" = the view mode leaves it out.
- **Version history is public,** shown in the card's current view mode.
- **Never public:** `editor` (incl. set-aside answers) and the contributor's email (kept for the CROW team to get in touch). **Credit is opt-in:** name and organisation, only if the contributor chooses.
- **Minimum to publish:** what Minimal needs: community name and type are required; anything else Minimal shows but is empty is listed in the Publish panel as a reminder ("Publish anyway"), not a blocker.
- **How it's stored:** each published version is kept in full, privately (server-only); the public sees copies made for the current view mode, stored where browsers may read them directly (no key needed). Changing the mode remakes the public copies, so less really means less. The view-mode rules live in ONE file (`js/view-modes.js`), used by the editor's preview and copied to the server at deploy.
- **Links:** `/c/crd_…` (a hosting rewrite to the card page).
- **The Library:** a filter sidebar (the shared sidebar: a drop-down bar on narrow screens) and a card grid that adapts to the window, with a grid / list toggle; filters include type, size, platform model, the scales, values and search. Visual design still to work through.
- **Forking:** from Minimal plus, Foggy and Full only; a fork copies what's shared, the rest starts empty; a pop-up at the start explains, for that mode, what was copied and what wasn't; the fork records `forkedFrom` (card, version, name) and shows "Adapted from …".
- **Safety:** a pixel "report" icon above the back-to-top arrow on public pages; reports saved as a list in the database (`reports`) for the team to check (email alerts before a public launch). The CROW team takes cards down: to start, in the Firebase console (mark hidden, remove the public copies; the server refuses to re-publish a hidden card); an admin page with Google sign-in for the team later, if needed.
- **Chunks:** 4a view modes + the 1–5 scales (scoring file drafted by Claude, reviewed by the team) → 4b publish (server + editor Publish panel) → 4c the public card page → 4d the Library → 4e forking → 4f safety and launch prep.

## TODO: UX improvements

Sohyeon's notes on improvements we want to work on, with implementation notes (Claude) under each. All three use the team's own language model (a small open model, to run on a VM in the project `cos-princeton-hci-crow`; not set up yet), so the community's text never goes to a third party. 

If you are working on something, please tag yourself on it! 

**Shared piece for (1) and (2):** the browser shouldn't call the VM directly (its address and any key would be public, and anyone could use it). A Cloud Function calls it on the editor's behalf (checking the card's key, with a rate limit), and returns suggestions, not changes: the person always reviews before anything is selected.

1. **Basics / set-up: describe your community, get suggested values.**
   - *Sohyeon's notes:* improve the Basics / set-up page so people are prompted to describe their community, its goals, and the culture they want to cultivate. The local LLM takes that open text and suggests values. Limit value selection to 5 that best describe the community; people can then edit / scroll / review. Let them know it doesn't mean the absence of other values.
   - *Notes:* a new `basics.description` (and maybe goals / culture as separate prompts); its place in the view modes is to decide (Minimal shows all of Basics). The model's suggestions reuse the lime "Suggested" chips in the values list. To decide: is 5 a limit on what the model suggests, or on how many values a card can select?
2. **Rules: paste your rules, get them filled in.**
   - *Sohyeon's notes:* improve the Rules page so people can copy in their rule text, and the local LLM fills in the applicable rules and adds any custom rules.
   - *Notes:* this brings back "Your rules, in your words" (`rules.communityRulesText`, already in the schema). The model maps the text to rule ids and qualifiers, plus custom rules for anything else; the page shows them as proposed selections to accept or change (with the sentence each came from, if the model can give it), rather than selecting silently.
3. **Weighted suggestions for decision-making approaches.**
   - *Sohyeon's notes:* develop a simple algorithm for more nuanced / weighted suggestions, using (i) values, (ii) a 1–5 scale for participatory, transparent and hierarchical that the community indicates, and (iii) attributes like community type and size. Propose another approach if better. (a) Also "more like this" / "something different" for each approach, so people can look at similar and very different ones.
   - *Notes:* this can share Phase 4a's scoring file (each approach scored 1–5 on the same three scales): an approach's fit = how close its scores are to the community's chosen 1–5s, plus the existing value recommendations, plus how well it suits the community's type and size (a small new data file to review). "More like this" / "something different" = the approaches nearest to and furthest from it on those scores. Simple, explainable weights, so each suggestion can say why. The community's chosen 1–5s are new inputs (where they're asked is to decide), different from the 4a scales, which describe what a card chose.

## What's next

- **Now:** Phase 4, starting with 4a (its scoring file also feeds UX task 3); the UX improvements as the language model's VM becomes available. Propose before building.
- **Before launch:** App Check (and rate limits on making, forking and reporting cards); security headers in `firebase.json`; the reviewed `laws.json`; an accessibility review.
- **After Phase 4:** the visual summary card (Export's disabled third download; also on the public card page); filling in from a community's link and rules page (brings back "Your rules, in your words"); recommendations from more of a card (e.g. how participatory and transparent it is); CommunityRule's governance templates as starting cards (`_all_templates.json`, not yet used); JSON-LD once there are real published cards. To consider: shared editing / key recovery, comparing cards (e.g. before federating), showing a card on a platform (e.g. Bonfire), translation.

## Design system (crowcards.org)

- Tokens in `styles.css`. Colours: `--bg` beige `#F3EADF`, `--ink` `#141414`, `--gray`, `--line`, `--accent` orange `#FF8F00`, `--lime` `#BFFF00`, `--ink-on-color`, `--error` (light `#D10068`, dark `#FF1F8F`); mixes `--tint --tint-strong --glass --veil`. Sizes: `--fs-xs .72 / -s .9 / -m 1 / -body 1.2 / -l` (clamp), display `--fs-lede --fs-h --fs-art`. One breakpoint: `--narrow` (64rem).
- Fonts: Argent Pixel CF italic (headings, display), Helvetica LT Pro (body), Source Code Pro (mono, at 0.8em of the text around it).
- Dark mode: `[data-theme="dark"]` on `<html>` (screen only; print always uses the light colours), saved in localStorage.
- Links are mono, uppercase, with an orange underline, except `a.inline` (flows with body text). Pixel squares as bullets; Argent headings orange, lime on hover, letter by letter.
- Pixel look: stepped pixel corners (one shared clip-path, `--px` the step; pseudo-elements listed outside `:is()`), the pixel box for fields (`--box-px`, `--box-line`, `--field-fill`, registered as non-inheriting), pixel icons (X, +/−, ▾, arrows, the flag dot).

## Where things live

- **Shared controls** (`js/controls/`): `choices` (checkbox / radio lists: layouts, filter, sub-choices, badges, `show()`; `scaleField` for one-row radios; `YES_NO`, `YES_NO_VARIES`), `fields` (text; `selectField` = a dropdown built on `suggest`), `suggest` (type-ahead; `stored()`, `storedValue`), `tags`, `rows` (repeatable rows: summarize, reorderable, `setAside()`), `picklist` (pick + notes / steps; `remembered`; `notesOf`, `stepRole`), `fold` (foldable sections, `sectionMaker`), `tabs`, `inline-edit`.
- **Shared modules** (`js/`): `dom` (`el`, `button`, `chip`, `richText`, `uid`, `narrowWidth`), `data` (`loadData`), `api` (server calls, `errorKind`), `session`, `autosave`, `freshness` (deploy guard), `set-aside`, `structure` (the shared structure and its log: `changeStructure`, `logChanges`), `suggestions`, `recommend` (`suggestionsFrom`, `FROM_VALUES`), `modules` (module defaults), `export` (`cardOutline`, `cardData`, `toMarkdown`), `popup` (`showPopup`, `confirmPopup`), `reveal` (things appearing after a choice), `scroll` (`keepPlace`, `pointTo`, `holdFloor`, `topLine`), `sidebar` (`narrowSidebar`), `laws`, `letters`, `prefs` (browser-only view prefs), `site` / `theme` / `crow` (every page), `docs-page` (docs and plan sidebars), `docs-reference` (docs tables), `laws-page`, `style-page`.
- **Section helpers shared with Export:** `qualifierLabel` (rules.js), `toolLine` (infrastructure.js), `channelLine` (processes.js).
- **CSS:** `styles.css` = site-wide tokens and shared pieces (header, callout, buttons, pixel toggles / X / caret, one pill shape for `.chip` / `.tag` / docs pills, `.plain-list`, tables (sideways scroll on narrow screens), tabs, the sidebar layout and narrow bar, print styles `.no-print` / `.print-only`); `make.css` = editor only; `docs.css` = docs and plan. `style.html` (+ `js/style-page.js`) shows the components.
- **Tests:** none kept in the repo; see "Checking your work" above.
