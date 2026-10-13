# CROW Cards — to do

The roadmap, smaller tasks, what to test and review, and what's needed before launch. How the project works (architecture, behavior, design decisions, the team's procedures) is in `DESIGN.md`. People read this file (e.g. on GitHub); Claude reads it too.

**Claiming a task:** put your name in its **Who** column and set **Status** to *In progress* (commit that on your branch, and tell the team). If a task already has a name, ask that person before taking it over. When it's finished, set it to *Done*, and add anything others need to know to the notes here, or to the relevant section of `DESIGN.md`.

**Statuses:** *Done* · *In progress* · *In review* (built or drafted, waiting for someone to check) · *To do* · *Later*.

**For Claude:** when you finish a piece of work, update its row here (status, notes), and `DESIGN.md` for how things now work; don't change someone else's claim.

## Roadmap

The phases and major pieces of work, in order. We launch without the Library (Phase 5).

### Phase 1: Setting up / connecting the editor and the server
| What it covers | Status | Note |
|---|---|---|
| Starting a new card or opening one with its ID and secret; the secret shown once, to copy or download; autosave without overwriting changes made elsewhere; Basics. | Done | |

### Phase 2: Setting up the rest of the editor interface 
| What it covers | Status | Note |
|---|---|---|
| Infrastructure, Membership, Rules, Processes and Federation, and custom modules, built from shared components. | Done | |

### Phase 3: Basic UI/UX improvements, export page, DOCs, laws page
| What it covers | Status | Note |
|---|---|---|
| First, some platform details and usual costs pre-filled; values suggest approaches, with reasons; a community's type suggests its modules; suggestions where one answer affects another module. All from datasheets.  | Done | |
| A design pass over every page (and the style page); JSON and Markdown export; the Docs; set-aside answers; the deploy guard and multi-tab syncing; the Laws to know page.  | Done | |


### Phase 4: basic publish/share functionality
| What it covers | Status | Note |
|---|---|---|
| View modes (Minimal, Foggy, Misty, Full) and the 1–7 governance scales; publishing on the Export page (versions, preview, credit, unpublish); See "Publishing behavior" in `DESIGN.md`. | Done | |
| The public card page (`/c/crd_…`), drawn as one visual summary box; forking from a published card; adding reporting and the takedown procedure.  | Done | |
| Design tweaks: set-up presented in blocks, the community description text box added, target scales, values capped at 5, and scored recommendations with "More like this / Try something new". | Done | |

### Phase 5. Improve UI/UX
| What it covers | Status | Note |
|---|---|---|
| Revamp recommendations flow | Done | Rebuilt recommendations flow so every value and approach is scored from reviewed datasheets: clues from the community type, format, description, values, scales and size, with a reason for each chip. The old "community type" became Format, a new required Community type was added, and the strip was redone to offer "More like this" and "Try something new" from the same scores. Tuning on 18 benchmarks, checked against 10 held-out communities, showed the fixes had to come from the data and the chip rules rather than the numbers: it now suggests about two thirds of core values on the benchmarks (fewer on the held-out set) and puts no chip on clearly wrong options in either set. Reference **Review / validate a set of test cards** in In-progress / Notes for next steps on this front. |
| Revamp card design | Done | Built 2026-10-12 from Sohyeon's sketch: the name, TYPE • FORMAT • SIZE and the places at the top; the description in a tinted box; each module in a light outline, Infrastructure and Membership side by side (the joining tiers as lime tiles, then Joining, then Structure with the three scales); Processes with Decision making and Conflict side by side; notes behind the editor's asterisk badge, with hover bubbles elsewhere; pixel icons in `img/icons.svg`; the view mode said above the card. `scripts/seed-test-cards.mjs` makes "Variety" cards to check it on different platforms. |

### Beta release-ready
| What it covers | Status | Note |
|---|---|---|
| For Bonfire, Mastodon and Acorn (Blacksky): a community's link fills in what it can (name, type, size, keywords, description, rules, platform and costs), with a note at the top of each module on what was filled in and what's left. Needs Acorn in the datasheets. | In progress | Mastodon done 2026-10-12 (`js/fill-from-link.js`, `js/fill-from-link/mastodon.js`). Bonfire: ask Ivan and Mayel what a server shares publicly. Acorn: waiting on the Blacksky team. Released as each is ready. |
| App Check, so only the CROW site can use the server; and limits on how often cards can be made, forked or reported | In progress | Plan proposed 2026-10-12: App Check with reCAPTCHA Enterprise (the site gets a token; every function refuses calls without one; rolled out in two steps: site first, then enforced), and per-address limits on creating, forking and reporting (counts kept under a one-way hash of the address, deleted after a day). Sohyeon: the reCAPTCHA key and App Check registration in the console. |
| Restrict the Firebase browser key to our own sites (Google Cloud console → APIs & Services → Credentials) | In progress | Plan proposed 2026-10-12: limit it to our addresses (crowcards.org, staging, the Firebase defaults, localhost for the emulator), then to the APIs it uses, once the console shows which. Sohyeon, in the console, after App Check is in. |
| Security headers for the site (in `firebase.json`) | In progress | Plan proposed 2026-10-12: HSTS, nosniff, referrer policy, no framing, a permissions policy, and a content security policy (what the pages may load: our files, the Firebase SDK, Adobe Fonts, reCAPTCHA; any https server for Fill in from this link), first in report-only mode on staging, then enforced; the docs site too. |
| The reviewed `laws.json` (Prishaa's datasheet replaces the placeholder) | To do | |
| An accessibility review | To do | |
| Switch crowcards.org from GitHub Pages to Firebase | To do | |
| Docs site at launch: point its links at the app's real address (`docs-site/site.json` `appUrl`: staging → https://crowcards.org), rebuild and deploy it | To do | |
| Email the team about new reports (a function run on each new `reports` document; needs an email service chosen) | To do | |
| Delete/remove the workbench from deployed site: `bench.html`, `js/workbench.js` (its page script), `js/bench.js`, `data/workbench_log.json`, `data/review_cases.json`, `data/value_terms_proposed.json` (the word-list proposals, shown in its Value word lists tab). Decide whether the benchmark files and review scripts stay for the team: `make-value-terms.mjs` would then write its proposals outside `data/`, so they aren't deployed | To do | |
| Once the drafts are reviewed: suggestions use accepted scores, links and size fits only (`COUNT_PROPOSED = false` in `js/view-modes.js`; it also covers previews and published cards' scales) | To do | |
| Move docs to docs.crowcards.org | Done | A separate Firebase site (`crowcards-docs`) built from `docs-site/`; the app redirects its old docs addresses there. |


### Phase 6. The library and collaboration
All to do later.
| What it covers | Status | Note |
|---|---|---|
| Listed cards: a filter sidebar (type, size, platform model, the scales, values, search), a grid that adapts to the window, a grid / list toggle; public counts (forks, reports and how many were reviewed). Design to work through first. After launch. |  | |
| Shared editing and recovering a lost key (several stewards per community) | | |
| Comparing cards, e.g. two communities' policies before they federate | | |
| Showing a community's card on its platform (e.g. Bonfire, as an extension) | | |
| Culturally aware translation - possibly using our local LLM, see below | | | 


## Improvement tasks

| Task | What | Who | Notes |
|---|---|---|---|
| Set up a local LLM on GCP, along with a team policy | The team's own small open model on a VM in `cos-princeton-hci-crow`, called only through a Cloud Function (checking the card's key, rate-limited), so what communities write never goes to a third party. It only suggests; people choose. We should also consider ways the local LLM can be used for this beyond improving the recommendations. | | TODO |
| New recommendation flow using the LLM | Should be cost/power efficient, good + interesting outputs, improve the overall experience and make the app more adaptable to different platforms. See Local Model Notes below. | | |
| JSON-LD | Recommended by our community partners, make our data schema compatible with JSON-LD. Research into existing protocols, standards, lexicons, etc. See what bodies / groups we should connect with. | | |
| Pixel flags | for the countries presented on a card instead of their names, region + globe pixels as well. Needs to be reviewed beacuse it could be politically sensitive. | | |
| Compact visual summary card | To download and share (image and / or PDF): Export's disabled third download; also on the public card page. this should be parsimonious, simple, automatically generated + consistent abstractions (think CC license) | | |
| Recommendations that learn from published cards | Once we have a library going and a solid recommendation algo / LLM flow, we should consider adding in learning from published cards (opt-in) | | |
| Developing starting templates for users | From CommunityRule's governance templates (`_all_templates.json`, not yet used), or our own archetypes. | | Later |

## In-Progress / Notes

### Local Model

We want to set up a local model that can power our app. A few considerations in selection:
* Small but big enough - we want to keep costs miminal
* Open-source

There are a few things we want it to do:
* **Suggest values from a description (with the model).** The model reads the description and suggests values, in place of the word matching (which stays as the fallback). Its suggestions use the same chips and reasons; they don't mean other values are absent. 
* **Fill in rules from pasted text (with the model)**.  We originally had a open text box: "Your rules, n your words" (`rules.communityRulesText`); the model proposes rule ids, qualifiers and custom rules, each with the sentence it came from, to accept or change.
* **Suggest approaches based on context so far, and other open text boxes describing overall thoughts.** The model takes the pieces of evidence so far about what kind of community it is and what it wants to do, as well as input from an open text box on each module + for each process, to suggest approaches as well as provoke reflection on potentially interesting, unusual, radical ways of organizing. 
* **Become a synchronous helper as people fill out a CROW Card.** We'll run some governance workshops, but it would be great for the CROW to be a little facilitator if a community wants to do it on their own. e.g., providing reflective prompts or structured activities for a group to design its rules together, etc.

To support some of this work, there are a few first tasks we want to do in parallel:
* **Review the datasheets more carefully and/or create a more principled method for their construction.** In particular:
    * `governance_scales.json`
    * `value_recommendations_{decision,membership,conflict}.json`
    * `type_value_fit.json`
    * `type_approach_fit.json`
  In general, it does seem to work okay and Sohyeon did a high-level pass through every entry. But this would benefit from a project to score them properly, e.g. via crowdsourcing: several raters (students, community organizers, governance researchers) score each option and value independently on P, T and H, using the definitions and "applies" notes; measure agreement (e.g. Krippendorff's alpha), discuss and resolve the disagreements, and replace the positions with the agreed scores, recording the method. One thing to be wary of is conflicting claims across datasheets. Likewise, a project developing a rubric for scoring would be valuable, i.e., how strongly each value argues for or against each approach, −2 … +2, with a reason) were drafted, pruned in two passes (contradictions, stretched or uncharitable reasons) and approved at a high level by Sohyeon (2026-10-09). This can ground the logic that the LLM uses. 
* **Review / validate a set of test cards**. 18 benchmark communities (`benchmark_communities.json`) were written alongside the datasheets and word lists, so the suggestions are partly tuned to them and web app performs better for them. Sohyeon had Claude generate 300 (fake) communities, written without seeing our lists: 200 with their set-up answers including values (to rate the suggested approaches) and 100 without values (to rate the suggested values). They have no answer key, so they're rated rather than scored. Ideally, we want to rate them in 25-case-chunks and suggest iterations/improvements to the recommendations flow (namely, the datasheets). See `RECOMMENDATIONS.md`, part C.
* **Gather some real-world cards** This would then be further validated by a project to gather 15–30 real online communities across the community types: each one's own about / purpose text and rules as written (with permission, or public and quoted briefly), its community type, format and size, and, ideally from its members or moderators, what it would choose (core values, and good / acceptable / to-avoid approaches); then measure the suggestions on them **without** changing the datasheets or tuning to them, so the numbers say how well it works on communities nobody had in mind.

^ This is essentially developing a protocol that shapes how to think through recommending approaches + prompting reflexive decision-making (e.g., not just doing the obvious) - what does it mean to support a deliberative, intentional set-up of governance practices? 

## Recommendations

How the recommendations were built, tested and tuned, what we learned, and the next steps (the language model, firmer datasheets, better test examples): **`RECOMMENDATIONS.md`**. How they work today, in short: `DESIGN.md`, "Recommendations behavior".

## Checking things

For hand checks, `node scripts/seed-test-cards.mjs` makes a set of test cards on the local emulator (see "Running and deploying" in `DESIGN.md`).


## Datasheet review

Every datasheet in `/data/` drives what people see; each needs a careful read for accuracy, wording and gaps:

- **Platforms and costs:** `platforms.json` (platforms, types, structural models, other software; Acorn to add), `cost_rules.json`, `cost_overrides.json` (each with its reasons).
- **Basics:** `community_types.json`, `formats.json`, `values.json` (CommunityRule's, as it comes), `value_groups.json` (our groups, cues and rewritten descriptions), `value_conflicts.json`, `enums.json` (sizes, cost values, federation approaches, the response ladder, …), `module_defaults.json`.
- **Membership and processes:** `membership_tiers.json`, `membership_options.json`, `decision_approaches.json`, `conflict_management.json`.
- **Recommendations:** `governance_scales.json` (scores, levels, trade-offs, where values point), `value_recommendations_decision.json`, `value_recommendations_membership.json`, `value_recommendations_conflict.json`, `approach_size_fit.json`.
- **Rules:** `rule_schema.json` (categories, types, rules, qualifiers), `covenants.json`.
- **Infrastructure and federation:** `tools.json`, `federation_subscription_lists.json`, `countries.json`.
- **Laws:** `laws.json` (a placeholder until Prishaa's reviewed datasheet replaces it).


| Task | Status | Who | Notes |
|---|---|---|---|
| Review the governance scores | Done (2026-10-09) | Sohyeon | All 143 positions accepted, after an outside review; definitions made precise (each scale's `applies`). A careful student review is under Improvement tasks. |
| Review where each value points on the scales, and the trade-offs of each end | Done (2026-10-09) | Sohyeon | Accepted with the positions. |
| Review the suggestion drafts | Done (2026-10-09) | Sohyeon | Value links: all 318 approved 2026-10-09 at a high level (a principled method is a student task under Improvement tasks), after passes the same day: 7 conflicts fixed (e.g. Consent → lazy consensus now −1, against opt-in; Equity → pay-to-join −1; five links rewritten for deliberative polling's real definition), 14 stretched links removed, 3 reworded, 4 lowered from +2 to +1; then reasons that assumed the worst version of an approach (e.g. a manager who doesn't hear both sides) fixed: 10 removed, 8 reworded; 318 links now). Size fit: all 70 approved 2026-10-09 (re-scored the same day with a rule: strain only where the approach by its nature needs the whole membership, personal acquaintance, or a few people's work growing with every member or case; never assuming more people take part in each process as a community grows; 19 rows changed). |
| Review the value groups, cues and rewritten descriptions | Done (2026-10-09) | Sohyeon | All 69 approved: groups (23 values in two tabs), word lists (accepted proposals), and the 18 rewritten descriptions (copyedited). |



