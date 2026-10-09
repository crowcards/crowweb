# CROW Cards — to do

The roadmap, smaller tasks, what to test and review, and what's needed before launch. How the project works (architecture, behaviour, design decisions, the team's procedures) is in `CLAUDE.md`. People read this file (e.g. on GitHub); Claude reads it too.

**Claiming a task:** put your name in its **Who** column and set **Status** to *In progress* (commit that on your branch, and tell the team). If a task already has a name, ask that person before taking it over. When it's finished, set it to *Done*, and add anything others need to know to the notes here, or to the relevant section of `CLAUDE.md`.

**Statuses:** *Done* · *In progress* · *In review* (built or drafted, waiting for someone to check) · *To do* · *Later*.

**For Claude:** when you finish a piece of work, update its row here (status, notes), and `CLAUDE.md` for how things now work; don't change someone else's claim.

## Roadmap

The phases and major pieces of work, in order. We launch without the Library (Phase 5).

| Phase | What it covers | Status | Who |
|---|---|---|---|
| 1. The editor and the server | Starting a new card or opening one with its ID and secret; the secret shown once, to copy or download; autosave without overwriting changes made elsewhere; Basics. | Done | |
| 2. The rest of the editor | Infrastructure, Membership, Rules, Processes and Federation, and custom modules, built from shared components. | Done | |
| 3. Basic UI/UX improvements, export, DOCS and laws pages. | First, some platform details and usual costs pre-filled; values suggest approaches, with reasons; a community's type suggests its modules; suggestions where one answer affects another module. All from datasheets. A design pass over every page (and the style page); JSON and Markdown export; the Docs; set-aside answers; the deploy guard and multi-tab syncing; the Laws to know page. | Done | |
| 4. Publishing and sharing (+ some design tweaks) | View modes (Minimal, Foggy, Misty, Full) and the 1–7 governance scales; publishing on the Export page (versions, preview, credit, unpublish); the public card page (`/c/crd_…`), drawn as one visual summary box; forking from a published card; reporting and the takedown procedure. + alongside it: set-up in blocks, the community description, target scales, values capped at 5, and scored recommendations with "More like this / Try something new". See "Publishing behaviour" in `CLAUDE.md`. | Done (checked by hand on the emulator, 2026-10-08); one last check on staging after the next deploy (see "Things to test more carefully") | Claude |
| Beta: pre-filling from a link | For Bonfire, Mastodon and Acorn (Blacksky): a community's link fills in what it can (name, type, size, keywords, description, rules, platform and costs), with a note at the top of each module on what was filled in and what's left. Needs Acorn in the datasheets. | To plan | |
| 5. The Library | Listed cards: a filter sidebar (type, size, platform model, the scales, values, search), a grid that adapts to the window, a grid / list toggle; public counts (forks, reports and how many were reviewed). Design to work through first. After launch. | Later | |

## Improvements 

| Task | Status | Who | Notes |
|---|---|---|---|
| Better recommendations | Values stay, each in a group (Goals & causes, How we organize, How we treat each other, Justice & inclusion, Practices, Widely shared) shown as tabs on the values list; the description suggests values by matching each value's cues (with scale fit; quoting what matched); approaches keep their score (scale fit, values selected, size fit); a test page (`test-recs.html`) to tune it; later, the language model in place of cue matching (cues stay as the fallback), and maybe cues for approaches. Step 1 (groups, cues, descriptions) drafted 2026-10-08; approach suggestions in two tiers, no cap (Suggested ≥ 1, Also fits ≥ 0.5), built 2026-10-08. The description suggesting values, built 2026-10-08. The group tabs on the values list built 2026-10-08. The test page `test-recs.html` built 2026-10-08. Next: tuning on the test page; maybe word lists for approaches. | In progress | Claude |
| The language model | The team's own small open model on a VM in `cos-princeton-hci-crow`, called only through a Cloud Function (checking the card's key, rate-limited), so what communities write never goes to a third party. It only suggests; people choose. | To do | |


## Smaller tasks

| Task | Status | Who | Notes |
|---|---|---|---|
| Review the governance scores | In review | Sohyeon | `scales.html`: accept or change each option's scores and reason; only accepted scores count (once `COUNT_PROPOSED` is off). |
| Review where each value points on the scales, and the trade-offs of each end | In review | Sohyeon | `scales.html` → Values (69, all proposed). |
| Review the suggestion drafts | In review | Sohyeon | `scales.html` → Value links (114) and Size fit (70 approaches). |
| Review the value groups, cues and rewritten descriptions | In review | Sohyeon | `scales.html` → Value groups and cues (drafted 2026-10-08, in `value_groups.json`): each value's group (6), its cues for description matching, and 18 descriptions rewritten from CommunityRule placeholders. |
| Add Acorn as a platform | To do | Sohyeon | `platforms.json` (and its type, costs and module defaults); needed for the beta. |
| Values from a description (with the model) | To do | | The model reads `basics.description` and suggests up to 5 values, as "Suggested" chips; it doesn't mean other values are absent. |
| Rules from pasted text (with the model) | To do | | Brings back "Your rules, in your words" (`rules.communityRulesText`); the model proposes rule ids, qualifiers and custom rules, each with the sentence it came from, to accept or change. |

### Better recommendations: next steps (agreed 2026-10-08)

1. **Values from the description: built 2026-10-08.** Each value scores from its words and phrases in the description (× 1.5) and the scales (× 1); Suggested for the best 5 from 1, Also fits from 0.5; updates when someone leaves a description box. **To tune** on the test page: with the sample answers, the scales alone give about 15 "Also fits" values and no "Suggested" (a value's scale part rarely reaches 1), which may be too many; try a higher "Also fits" cut-off for values, or a higher scales weight.
2. **The test page, `test-recs.html`** (built 2026-10-08, for the team; deleted before launch): fill in a size, the scales, a description and values, and see every suggestion with its score broken down: values from the scales and from the description, every approach with its three parts, its total and its chip, and More like this for any option. The weights and the two cut-offs can be changed there to see the effect (the editor's own are `TUNING` in `js/recommend.js`). The description matching (`cueMatches`) is used by the editor and the page alike.
3. **Maybe later:** word lists for approaches too, so "we vote on everything" suggests majority voting directly.

### Later

- **Pixel flags** for the places on a card (instead of their names).
- **A visual summary card** to download and share (image and / or PDF): Export's disabled third download; also on the public card page.
- **Starting templates** from CommunityRule's governance templates (`_all_templates.json`, not yet used), or our own archetypes.
- **Recommendations that learn from published cards.**
- **Linked data (JSON-LD)**, once there are real published cards to shape it against.
- **To consider:** shared editing and recovering a lost key (several stewards per community); comparing cards, e.g. two communities' policies before they federate; showing a community's card on its platform (e.g. Bonfire, as an extension); translation.

## Things to test more carefully

For hand checks, `node scripts/seed-test-cards.mjs` makes a set of test cards on the local emulator (see "Running and deploying" in `CLAUDE.md`).

- **Checked by hand on the emulator (2026-10-08), all good:** publishing (and what's refused), Publish your edits / Apply these settings, the changelog comment, the pop-ups and history, Unpublish (and delete history), Preview, the public card page in all four modes (the description by mode, Foggy's tool kinds and rule counts, the federation note, the scales, long notes, versions, Copy link, downloads), forking, reporting and the takedown procedure, set-up and Basics, the Federation note, the suggestion tiers, the values' group tabs, phone width, and the docs' view-mode table.
- **On staging, after the next deploy** (things the emulator can't show):
  - **The server's copy of the shared rules.** On the emulator, the server reads `js/view-modes.js` and its data straight from the repo. When deployed, it reads a copy that `scripts/copy-shared.mjs` puts in `functions/shared/` just before the functions deploy. If that copy were missing or stale, publishing, forking or the public pages would fail or follow old rules. To check: publish a test card on staging and open its public page.
  - **Short card links.** `staging.crowcards.org/c/crd_…` should open the card page (the hosting rewrite in `firebase.json`), including after a reload.

## Things to review more carefully

Every datasheet in `/data/` drives what people see; each needs a careful read for accuracy, wording and gaps:

- **Platforms and costs:** `platforms.json` (platforms, types, structural models, other software; Acorn to add), `cost_rules.json`, `cost_overrides.json` (each with its reasons).
- **Basics:** `community_types.json`, `values.json` (CommunityRule's, as it comes), `value_groups.json` (our groups, cues and rewritten descriptions), `value_conflicts.json`, `enums.json` (sizes, cost values, federation approaches, the response ladder, …), `module_defaults.json`.
- **Membership and processes:** `membership_tiers.json`, `membership_options.json`, `decision_approaches.json`, `conflict_management.json`.
- **Recommendations:** `governance_scales.json` (scores, levels, trade-offs, where values point), `value_recommendations_decision.json`, `value_recommendations_membership.json`, `value_recommendations_conflict.json`, `approach_size_fit.json`.
- **Rules:** `rule_schema.json` (categories, types, rules, qualifiers), `covenants.json`.
- **Infrastructure and federation:** `tools.json`, `federation_subscription_lists.json`, `countries.json`.
- **Laws:** `laws.json` (a placeholder until Prishaa's reviewed datasheet replaces it).

## Before launch

| Task | Status | Who |
|---|---|---|
| App Check, so only the CROW site can use the server; and limits on how often cards can be made, forked or reported | To do | |
| Restrict the Firebase browser key to our own sites (Google Cloud console → APIs & Services → Credentials) | To do | |
| Security headers for the site (in `firebase.json`) | To do | |
| The reviewed `laws.json` (Prishaa's datasheet replaces the placeholder) | To do | |
| An accessibility review | To do | |
| Switch crowcards.org from GitHub Pages to Firebase | To do | |
| Email the team about new reports (a function run on each new `reports` document; needs an email service chosen) | To do | |
| Delete `test-recs.html` and `js/test-recs.js` (the team's test page for suggestions) | To do | |
| Once the drafts are reviewed: suggestions use accepted scores, links and size fits only (`COUNT_PROPOSED = false` in `js/view-modes.js`; it also covers previews and published cards' scales) | To do | |
