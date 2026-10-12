# Recommendations in CROW Cards: how they were built, and what's next

A handoff for whoever picks up the next steps, starting with our own language model. It explains how the editor's recommendations work, how they were developed and tested, what we learned, and what's left to do.

Related documents:
- `DESIGN.md`, "Recommendations behavior": how recommendations work today, in short. The code is the final word.
- `TODO.md`: the tasks themselves (Improvement tasks, the Local Model notes, before-launch items).

---

## 1. What the recommendations do

When a community fills in a card, the editor suggests **values** (from CommunityRule's list of 69) and **approaches**: ways of joining, decision-making, and conflict management. It marks options in a list with a chip ("Suggested", or a quieter "See also"), each with its reasons, and offers a few ideas to add ("More like this / Try something new").

Three rules have guided everything:
1. **It only suggests.** It never selects anything for people.
2. **Every suggestion says why**, including anything that counts against it.
3. **Everything comes from datasheets the team can read, review and fix.** No hidden model, no learning from users (yet).

### The flow today

```
 What the community tells us           What the datasheets say (data/)
 (set-up and Basics)
 ─────────────────────────             ─────────────────────────────────────
 community type ──────────────────▶    type_value_fit, type_approach_fit
 format (online space) ───────────▶    format_value_fit, format_approach_fit
 where it wants to be on ─────────▶    governance_scales (positions, 1–7)
   the three scales
 description and keywords ────────▶    value_groups (each value's words)      values only
 size ────────────────────────────▶    approach_size_fit                      approaches only
 values it selects ───────────────▶    value_recommendations_*                approaches only
                                             │
          each gives every option a number from −1 (against) to +1 (for),
          with a reason; anything that doesn't apply is skipped
                                             │
                                             ▼
                 the numbers are averaged, some counting more: the score
                                             │
                                             ▼
         Suggested  ·  See also  ·  no chip, with "not a fit" shown  ·  nothing
```

- **Suggested:** a score of at least 0.5, with at least two pieces of evidence for it, one of them about this community in particular (its community type, format, description, or the values it selected). Closeness on the scales and fit with the size help, but never earn a chip on their own. A value that's very common for the community type can be Suggested on that alone. At most 5 values.
- **See also:** a score of at least 0.3, with evidence for it.
- **No chip, reason shown:** the community type marks it "generally not a fit", or it's "rarely a fit" anywhere.
- **For approaches, the community type counts only where it differs from the usual.** Mediation suits almost every community type, so being a club doesn't push it; do-ocracy is unusual in general but common in open source, so for open source it counts.
- **Values come first.** The values a community selects then become evidence for approaches.

The weights and cut-offs are `TUNING` in `js/recommend.js`; the whole calculation is `scoreList` in the same file. The full table of weights is in `DESIGN.md`.

### The datasheets behind it

| File | What it says | Size |
|---|---|---|
| `community_types.json` | The 21 community types: what kind of group the community is (a workplace, a support group, an open-source project, citizen science, …). | 21 |
| `type_value_fit.json`, `type_approach_fit.json` | How common each value and approach is for each community type, −2 to +2, with a reason; a few marked "generally not a fit" or "interesting" (unusual for this type, but workable). Removed marks are kept under `removed`, with why. | 206 + 519 marks |
| `formats.json`, `format_value_fit.json`, `format_approach_fit.json` | The 6 kinds of online space, and the little each says on its own (e.g. a team isn't open to join). | 6; 9 + 15 marks |
| `option_flags.json` | Options that rarely fit anywhere (e.g. investor board seats), unless a community type says otherwise. | 4 |
| `governance_scales.json` | Where each approach and value sits on the three scales (1–7), with each scale's definition and how it applies to each kind of option. | 143 positions |
| `value_recommendations_{decision,membership,conflict}.json` | How strongly a selected value argues for or against each approach, with a reason. | 316 links |
| `approach_size_fit.json` | How well each approach suits each community size. | 70 |
| `value_groups.json` | The value tabs, each value's word list (matched in the description), and fixes to CommunityRule's wording. | 69 values |
| `benchmark_communities.json`, `benchmark_heldout.json` | Example communities with what they'd choose: the answer key (see section 3). | 18 + 10 |

**The three scales** (a card's own scales use the same positions):
- **Participatory:** how many members take part in a decision, and how much say they have. For conflict, how much of the community takes part beyond the people in it. Joining options aren't scored on it: how open joining is shows in the joining tiers.
- **Transparent:** how visible the process, the criteria and the reasons are to members (not necessarily the public). Confidential conflict processes (mediation, circles) score low by design; that isn't a flaw.
- **Hierarchical:** how much the authority to decide sits with particular people, roles or levels rather than with members as equals.
- Values are placed where a community that holds the value would tend to want to be. 25 values (e.g. Trust, Localism) say nothing about governance and have no positions. The scales describe; they don't judge.

---

## 2. How we got here

### The first version (Phase 3–4, early October 2026)

Values suggested approaches through value links (`value_recommendations_*`), plus closeness on the scales and fit with the size. Values were suggested from the description (each value's word list) and the scales. "More like this" offered the options closest on the scales, and "Try something new" the most opposite, plus one at random.

**What was wrong with it:** it knew nothing about *what kind of group* a community is, so a family chat and a worker co-op with similar scales got similar suggestions. Most of the weight sat on the scales and the values, whose datasheets were first drafts. The word lists rarely matched how communities actually describe themselves. And there was no way to tell whether a change made things better or worse.

### The rebuild (9 October 2026)

We started over from how to make a recommendation, deciding these together:
1. **Ask what kind of group it is.** A new required field, first called "Setting", now **Community type** (21 types, plus Other). It's public from the Misty view mode, and a fork copies it.
2. **Write the answer key first.** 18 benchmark communities, one per community type (except identity / cultural and DAO / web3, which have none yet), each with its description, scales, and what it would choose: core values, and good, acceptable and to-avoid approaches. Everything after was measured against them.
3. **Draft fit tables for each community type**, with "generally not a fit" (used sparingly) and "interesting" (unusual but workable: later the material for "Try something new"). Options that are a poor fit almost everywhere went into `option_flags.json` instead of being repeated for every type.
4. **One way of scoring for everything:** every kind of evidence becomes a number from −1 to +1, averaged with weights. Evidence that doesn't apply is skipped, not counted as zero. There are two tiers (Suggested and See also), each with a score threshold and a minimum amount of evidence.
5. **Review all the other datasheets:**
   - **The scales** got precise definitions, and an outside review (web Claude) led to 47 positions being changed.
   - **Size fit** was re-scored with a written rule: an approach strains with size only where it needs the whole membership, personal acquaintance, or a few people's work that grows with every member.
   - **The value links** were pruned in passes: contradictions, stretched reasons, and reasons that assumed the worst version of an approach (e.g. a manager who doesn't hear both sides).
   - **The value tabs** were settled, and 18 placeholder descriptions rewritten.
6. **Regenerate the word lists.** Mining CommunityRule's value descriptions for distinctive words (TF-IDF) was tried and set aside: those descriptions are written as examples ("wheelchair ramps"), not the way communities talk, so it gave fragments and even opposites. Instead, each value's list is its own name plus everyday phrases (e.g. Community care: "look after each other", "check in on"), with words that match too many values removed. Matching is by word stem (`js/stem.js`: "organize / organizing / organizer" match), phrases must match in order, and a match after "not", "no" or "never" is skipped. `scripts/make-value-terms.mjs` proposes and measures the lists.
7. **Build a workbench** (`bench.html`) to review every datasheet, see every score broken down, and measure against the benchmarks.

The baseline after the rebuild was 30 of 78 core values and 51 of 110 good approaches Suggested on the benchmarks, with no to-avoid chips.

### The rename (9–10 October 2026)

What used to be called "community type" was really the kind of online space, so it became **Format** (6 formats: chat group, forum, mailing list, social network, peer production, team). The new kind-of-group field took the name **Community type**. The datasheets, editor, docs, export, published card, server and scripts were all updated. On 10 October, **citizen science** moved from format to community type: it's a kind of group (often run by scientists or an institution, but also by communities), whose usual format is peer production.

### Tuning (10 October 2026)

To check we weren't fooling ourselves, web Claude drafted **10 held-out communities** without seeing our datasheets: a flat workplace, a strict hobby forum, an open-source project just forked, a classroom on a wiki, and so on. The rule: **never tune on them, only check against them.**

What happened:
1. **Searching the weights and cut-offs overfitted.** The best numbers for the 18 benchmarks made the held-out results worse every time. We kept the hand-set numbers.
2. **The held-out set exposed two problems with the rules:**
   - **22 to-avoid options got a chip.** Two general pieces of evidence, closeness on the scales and fit with the size, added up to a chip for options the community type said nothing about (Holacracy for a radio club, an elected board for a creator's Discord). Fix: a chip now needs evidence about this community in particular.
   - **Values marked "very common for groups like yours" got no chip at all**, because they had only that one piece of evidence. Fix: a strong community-type mark can make a value Suggested on its own.
3. **Each remaining wrong chip was traced to one datasheet entry, and a person decided** whether the entry or the example was wrong:
   - three examples corrected
   - one community-type mark removed
   - two value links dropped, because they described how an approach works, not who it suits
   - a missing dimension found: research × "application review" is right for a lab, wrong for citizen science. That led to the **format × approach** table.
4. **"More like this / Try something new" was redone** to use the same scores, so it never offers something the recommendations wouldn't back. Reasons now show on hover, and the random pick is gone.
5. **Interesting marks that clashed with an example** were settled one by one: three dropped, three kept on purpose. An unusual option is supposed to be unusual: one example's "avoid" isn't enough to drop it.

---

## 3. Where it stands, and how it's measured

**How it's measured.** Each example community's answers go through the editor's own scoring (`js/bench.js`), and its chips are compared with what it would choose. In order of importance:
1. no option the community would clearly reject gets a chip
2. lists stay short (about 5 chips)
3. as many good choices as possible are Suggested

"49 of 78 core values" means: add up each community's 3–5 core values (78 in all, counting a value once per community), and count how many came out Suggested for that community.

| With the editor's settings (10 October 2026) | 18 benchmarks | 10 held-out |
|---|---|---|
| Core values Suggested (and See also) | 49 of 78 (+26) | 17 of 48 (+14) |
| Suggested values the community would accept | about 90% | about 75% |
| Good approaches Suggested (and See also) | 55 of 110 (+32) | 17 of 65 (+23) |
| Clearly wrong options with a chip | 0 | 0 |
| Chips per list | about 5 | about 5 |

**Verdict: reasonable for now, not yet a strong guide.** It's safe and explains itself, and when it suggests a value, the value is usually fair. But it's cautious: on unfamiliar communities, about a quarter of good approaches are Suggested, though most get at least See also.

**Caveats:**
- **Both sets are small.**
- **The held-out set has shaped several decisions** (the rule changes, three example fixes, the citizen-science marks), so its numbers are somewhat optimistic.
- **All 28 example communities were written by Claude,** not by real communities.

**Weakest areas, roughly in order:**
1. **Conflict management:** 1 of 20 good choices Suggested on the held-out set.
2. **The identity / cultural community type:** a starting-point table, to work out with the Blacksky folks.
3. **Descriptions:** the word lists find few values, because people rarely use the values' own words. On the benchmarks, words alone find about a third of core values.
4. **The citizen-science community type:** its marks are new (approved 2026-10-11) and checked on only one example, Fireball Count.

---

## 4. What we learned (please keep to these)

1. **Improve the datasheets, not the numbers.** The scoring passes on whatever the datasheets say, so its mistakes trace back to single entries. Every real gain came from fixing data, or from rules about how far to trust general evidence.
2. **The loop:**
   1. measure (in `bench.html`)
   2. find the entry behind each miss or wrong chip (the reasons name it)
   3. have **a person** decide whether the entry or the example is wrong
   4. fix that one entry and record why
   5. measure again

   Change a weight or threshold only when many misses share one cause and the change holds on examples you didn't tune on.
3. **Keep a test set you never tune on.** Once something is chosen *because* of a test set, that set stops being a fair test. Use a fresh one for each round of checking.
4. **General evidence explains; specific evidence decides.** Closeness on the scales and fit with the size apply to any community, so on their own they let in odd suggestions.
5. **Compare with the usual.** An approach that suits almost everyone shouldn't be pushed to everyone.
6. **Write reasons that are fair to the approach.** A reason that assumes its worst version, or describes how it works rather than who it suits, turns into a bad suggestion.
7. **Safe before helpful.** One clearly wrong chip costs more trust than a missed good one.

---

## 5. The tools

All of these are for the team; they're deleted before launch (see TODO.md).

- **`bench.html`**, the workbench, served by the local emulator at localhost:5000/bench.html (see `README.md`). Its tabs:
  - **Log:** what was worked on and approved, one line each (`data/workbench_log.json`, edited by hand).
  - **Benchmarks:** each example community (the 18 benchmarks, or the 10 held-out) and how it scores.
  - **Fit:** the community type marks (with an "Approve this type" button and a check against the examples), the format tables and size fit.
  - **Positions, Value scores, Value word lists:** the other datasheets.
  - **Review cases:** the drafted communities to rate (part C), with each rater's ratings kept in their browser and downloaded as a file; loading several raters' files shows what's most often wrong, and whether the editor still suggests it.
  - **Try it:** start from any example or review case, or a file of your own, and see every score broken down.
- **`js/bench.js`:** the benchmark scoring, used by the workbench and loadable in Node.
- **`node scripts/review.mjs approve <community type>`:** marks a community type and its marks accepted. `terms <value>|all` takes a value's proposed word list.
- **`node scripts/make-value-terms.mjs`:** proposes and measures word lists.
- **`node scripts/seed-test-cards.mjs`:** test cards on the local emulator, for checking by hand.
- **`COUNT_PROPOSED`** (in `js/view-modes.js`): while it's on, entries still in review count. It's turned off before launch.

A useful way to test without a browser: load the editor's own code in Node, serving `data/` to it from disk:
```js
import { readFileSync } from "node:fs";   // (a script saved in crowweb/)
globalThis.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(readFileSync(`.${url}`, "utf8")) });   // run from crowweb/
const { loadRecommendations, TUNING } = await import("./js/recommend.js");
const { benchmarkScores, benchTotals, benchLine } = await import("./js/bench.js");
```
There's no tuning tool any more: searching the numbers overfitted (part 2, "Tuning"). A new way to tune, from the students' ratings, is for whoever takes it on.

---

## 6. What's next

### A. Our own language model (the main next step)

**Why:** the word lists have hit their ceiling, and much of what a community says (its description, its rules, its notes) can't be turned into suggestions with word matching.

**Constraints (from TODO.md, "Local Model"):**
- **What it is:** a small, open model, run by the team on our own server in the `cos-princeton-hci-crow` Google Cloud project, so what communities write is never sent to an outside company. Cheap to run.
- **How the site reaches it:** never directly. Only our server (a Cloud Function) calls it, after checking the card's key, with a limit on how often.
- **What it may do:** only suggest. Its output looks like everything else: chips with reasons, for people to accept or change.
- **Before switching it on:** set a team policy (what it may see, what's logged, what happens when it's down).

**What it should do, roughly in order:**
1. **Suggest values from the description,** quoting the sentence each came from. This replaces the word lists as the description evidence, and the word lists stay as the fallback when the model is slow or down. It plugs into the existing scoring as one piece of evidence, so the rest of the flow stays the same.
2. **Turn pasted rules into the card's rules:** which listed rules match (with qualifiers), plus custom rules for the rest, each with the sentence it came from. This brings back the "Your rules, in your words" box (`rules.communityRulesText`).
3. **Suggest approaches from everything known so far,** including free-text notes in each module, and prompt reflection on unusual or radical ways of organizing.
4. **Act as a helper while a group fills in its card:** reflective prompts and small structured activities, for communities working without a facilitator.
5. **Help fill in a card from a community's link** (its about page and rules), together with the planned pre-filling for Bonfire, Mastodon and Acorn.

**A suggested first milestone, before any server work:** an offline comparison.
1. Run a candidate model over the descriptions of the 28 example communities, then of the drafted set B (described below), where the values it suggests can be rated.
2. Turn its output into the same evidence the word lists produce.
3. Score it with `js/bench.js` against the word lists on the 28, and compare the two by rating on set B.

That tells us whether the model is worth its cost before anything is wired in, and which model size is enough.

### B. Put the main datasheets on firmer ground

These four rest on one person's careful judgment, checked at a high level:
- **The community type fit tables** (the most influential): a written rubric for what +2, +1, "interesting" and "not a fit" mean, several raters per community type, agreement measured, and a check against real communities of each type. Start with conflict management.
- **The scales positions:** several raters score each option and value on the three scales, using the definitions; measure agreement (e.g. Krippendorff's alpha); resolve the disagreements; record the method.
- **The value links:** a rubric (when does a value argue for or against an approach, and what makes it +2 rather than +1), grounded where possible in governance research and real communities' rules. It should also catch links that describe a mechanism rather than a fit.
- **The word lists:** test them on the 300 drafted descriptions. The model may replace them as the main source anyway.

Watch for contradictions between datasheets: the same idea can be counted twice, e.g. in a value link and a community type mark.

### C. Better examples to test on

- **300 drafted communities, for people to rate** (by web Claude; the instructions are kept with the team, not in the repo). Unlike the 28 examples, these have no answer key. They were written in two steps, so the tool's vocabulary doesn't leak into them:
  1. the communities first, in their own words, without seeing any of our lists: a mix of kinds of group, places and sizes; a quarter a single line, half a short paragraph, a quarter detailed (history, rules, a recent problem); a third tricky
  2. then the set-up answers, picked from our menus as a member would: community type, format, size, the scales and, in set A, the values

  Two sets:
  - **Set A (200), set-up with values:** rate the suggested approaches.
  - **Set B (100), set-up without values:** rate the suggested values.

  Students rate each case's suggestions: are they reasonable for this community, and is any of them wrong? Work through them 25 at a time, trace the problems to datasheet entries, and propose fixes. Keep some batches aside, never looked at during fixing, for the final check. Rate them in the workbench's Review cases tab: each rater downloads their ratings as a file into `ratings/` (in the repo, not deployed), and loading everyone's files there shows what's most often wrong. The cases go in `data/review_cases.json`.
- **15–30 real communities:** their own about text and rules (with permission, or public and quoted briefly), their community type, format and size, and ideally what their members or moderators would choose. Measure on them **without** tuning to them: that's the honest number.

### D. Open questions and smaller tasks

- **Identity / cultural:** work out its table with the Blacksky folks.
- **Strong "against" marks can vanish.** Because the community type is compared with the usual, an "against" that most types share says nothing for any of them. The current rules stop this from causing wrong chips, but it should be revisited if a case turns up.
- **Maybe later:** word lists for approaches ("we vote on everything" → majority rule); a chosen decision-making approach as evidence for conflict management; our own starting templates, perhaps from the benchmark communities; recommendations that learn from published cards (opt-in, once the Library exists).
- **Before launch:** turn off `COUNT_PROPOSED`, and delete the workbench and its scripts (or keep the examples and scripts for the team).
