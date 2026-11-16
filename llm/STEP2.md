# Step 2: compare the three models (Gate 3)

**Goal:** see what each model (Qwen 2.5 7B, OLMo 3 7B, Phi-3.5 mini) actually suggests for each part of a card, given the same communities, and how sensible its reasons are. The output is a set of side-by-side review files the team reads together. This step isn't about picking a winner: it's about learning what the models do, so the next step can decide what to measure.

**Two students work on this together:**
- **Both:** choose the test communities, write their open-text answers, and gather public rules pages (2.2–2.5); then read the results together and write up what you see (2.8).
- **Student A:** runs the models (2.6). Needs STEP1.md done (the VM, Gates 1 and 2).
- **Student B:** adds what the current site suggests for the same communities, from the workbench (2.7). Needs no Google Cloud access.

---

## 2.1: What we're comparing, and why this way

Each part of a card asks something different:

| Part of the card | What the model gets | What it's asked |
|---|---|---|
| **Values** (Basics) | the community's description | which values it holds |
| **Joining** (Membership), **decision-making** and **conflict** (Processes) | the description | which approaches it likely uses |
| the same, **from what they wrote** | a member's own words, answering "how do people join?", "how are moderation decisions made?", and so on | which approaches they describe |
| **Federation** | a member's own words about other servers | its approach, and its steps when there's a problem |
| **Rules** | a public community's rules page | which of our schema's rules each of theirs matches |

The card doesn't have open-text boxes for most of these yet. Your written answers simulate what people would type if it did.

**There are no right answers here.** Each review shows two **references** beside the models' picks: the team's own picks for that community (from the site's benchmarks) and what the current site suggests. Both are reasonable guesses, not truth: a model can be *better* than them, and noticing that is as useful as noticing mistakes.

What *can* be counted without a right answer: broken answers (not valid JSON, or the wrong shape), ids that aren't options on the site, how long each answer takes, and how much the three models agree. The review files show these.

## 2.2: Choose the test communities (both)

The site's benchmarks are made-up communities the team wrote, each with a description, type, format, size and the team's picks: `data/benchmark_communities.json` (18) and `data/benchmark_heldout.json` (10).

Together, choose **6–8**: different types (a workplace, a support group, an open-source project, a hobby group…), formats (chat, forum, social network…) and sizes. List them, with their ids:

```bash
cd llm/eval
python3 new_input.py
```

## 2.3: Write their open-text answers (both)

For each chosen community, imagine one of its members answering the card's questions in their own words. Split the communities between you (3–4 each), then **read each other's** and edit for realism and consistency.

Start each community's file (with its id and your initials):

```bash
python3 new_input.py tenants_union AB
```

This writes `inputs/tenants_union.json`. Open it in your editor: `_community` shows the community's description (to read; it isn't used), and `texts` has a box for each question:

| Box | The question |
|---|---|
| `joining` | How do people join? |
| `decision_moderation` | How are moderation decisions made? |
| `decision_maintenance` | How are maintenance decisions made (keeping the space running)? |
| `decision_change` | How do the rules or the setup get changed? |
| `conflict` | What happens when there's a conflict? |
| `federation` | How does the community handle other servers? (only if it's on the fediverse; leave empty otherwise) |

How to write them:

- **Stay true to the community's description:** the same group, the same culture.
- **Write like real people do, and vary it:** short and long; vague and specific; some with jargon ("we use lazy consensus"), most without ("whoever's around just sorts it out"); at least one "we don't really have a process"; the odd typo. Real answers are rarely tidy or complete.
- **AI drafting is fine, but edit it.** AI-written text tends to be tidy, complete and full of the right terms, which models find easier than how people really write. Rough it up toward the variety above, and set `"aiDrafted": true` in that file, so the review can check whether those texts were easier.
- **Write them all before any model runs, and don't edit them after seeing results:** otherwise they drift toward what a model handles well.
- **Everything is made up.** Never a real community's words (the repo is public).

Leave `currentSite` for now (that's 2.7).

## 2.4: Gather public rules pages (both)

Choose **3–5 public communities** with their rules published online: e.g. a few fediverse servers (Mastodon servers list them on their About page), a forum, an open-source project's code of conduct. Pick different kinds and lengths.

For each, make a file in `rules/`, e.g. `rules/example_social.json`:

```json
{
  "name": "example.social",
  "source": "https://example.social/about",
  "copied": "2026-11-12",
  "rules": [
    {"text": "No racism, sexism, homophobia, transphobia or other hate speech", "hint": "This includes slurs"},
    {"text": "Put NSFW media behind a content warning"}
  ]
}
```

Copy each rule as written (`hint` is optional: the short explanation some pages give under a rule). These are public pages, committed with their address and the date copied (`ADMIN.md`, "Decisions", #3).

## 2.5: Check the inputs, and commit them (both)

```bash
python3 run_models.py --check
```

It lists any problem (a missing field, an unknown benchmark id, a malformed rules file). When it says the inputs look fine, commit them **before any model runs**, so the runs record exactly what they were given. From the repo's top folder (`cd ../..`):

```bash
git add llm/eval/inputs llm/eval/rules
git commit -m "Add the test communities' open-text answers and public rules pages for the model comparison"
git push
```

## 2.6: Run the models (Student A)

**The runner** is `llm/eval/run_models.py`. Read it through first: it's commented, standard-library Python, and you may want to change it. What it does:

- reads the inputs and the site's own lists (`data/`), as people see them on the site;
- checks it's reaching the VM's Ollama, with the three models on it, and warms each model up;
- asks each model every task for every community (and rules page), with the same settings each time: `temperature` 0 and a fixed `seed` (the same prompt gets the same answer), and `num_ctx` 16384 (so long prompts aren't cut);
- saves every raw answer to `results/` (ignored by Git), with what produced it: Ollama's version, each model's digest, the git commit;
- writes one review file per task to `review/`.

**The prompts** are in `prompts/`: four starting templates (`from_description.txt`, `from_text.txt`, `federation.txt`, `rules.txt`). The runner fills in the parts in braces: `{description}`, `{context_json}` (type, format, size, keywords), `{text}` (their written answer), `{question}`, `{options}` (the list to pick from, from the site's data), and for rules `{rules}` and `{schema}`. Nothing from the team's picks ever goes into a prompt. To give one task its own prompt, add `prompts/<task>.txt` (e.g. `prompts/values.txt`); task names are in `TASKS` in the runner.

**Running it:** start the VM, then open the tunnel in one terminal and leave it running (STEP1.md, B.4):

```bash
gcloud compute ssh crow-llm-vm -- -N -L 11435:localhost:11434
```

In another, from `llm/eval`:

```bash
python3 run_models.py
```

All three models on everything takes a while (roughly an hour for 8 communities; leave it running). To try a change on part of it: `python3 run_models.py --models phi3.5:3.8b --tasks values rules`.

**If you change a prompt,** run all three models again, not just one: a prompt tuned while watching one model favors it. Commit prompt changes before the run you'll share, so the review files name the right commit.

## 2.7: Add the current site's suggestions (Student B)

The workbench (staging.crowcards.org/bench, or `/bench` on your local emulator) runs the site's own suggestions. For each community in `inputs/`, find what the site suggests (**Try it**, with the community's description, type, format and size; or its row in the **benchmarks** tab, if it's there) for:

- **values** (Basics);
- **ways of joining**, **decision-making** and **conflict management** (the "Suggested" chips).

Write them into that community's `currentSite`, as ids or as the names the workbench shows:

```json
"currentSite": {
  "values": ["Community Care", "inclusivity"],
  "joining": ["Invitation Only"],
  "decision": ["lazy_consensus"],
  "conflict": ["Mediation"]
}
```

Check them (`python3 run_models.py --check` names any it doesn't recognize), then put them into the review files without running any model:

```bash
python3 run_models.py --review-only
```

The site can't read the open-text answers, so in those reviews its row shows what it suggests from the description, labeled as such.

## 2.8: Read the results together, and write up (both)

Open the files in `review/` (GitHub shows them as tables). Each one has:

- **Checks:** per model, how many answers were broken, how many ids weren't options on the site, and the median time;
- **one section per community** (or rules page): the input, then each model's picks with its reasons, then the two references; and which picks all three models (or more than one) agreed on. ⚠ marks an id that isn't an option on the site, or one the team's picks list as *avoid* for that community.

Read them together first; then write `llm/eval/OBSERVATIONS.md`:

- **per part of the card:** what each model does well and badly; examples worth showing (they're made up, so fine to quote);
- **the reasons:** useful, vague, or wrong? Do they point at something actually in the text?
- **failure patterns:** broken answers, made-up ids, picking too many or too few, ignoring the text, mixing up similar options;
- **agreement:** where the models agree with each other, and with the references; where a model seems *better* than the references;
- **AI-drafted vs. hand-written texts:** any difference?
- **speed:** typical seconds per answer for each model;
- **what to measure next:** which parts of the card seem worth the model, which don't, and what a proper evaluation should check, with what kind of examples.

## 2.9: STOP: Gate 3

**Don't recommend using a model with real users: this step is for learning, and the team decides what's next.**

From the repo's top folder, commit the review files, any prompt or runner changes, and the write-up (`results/` stays out):

```bash
git add llm/eval/review llm/eval/prompts llm/eval/run_models.py llm/eval/OBSERVATIONS.md
git status                     # check nothing from results/ is listed
git commit -m "Compare Qwen 2.5 7B, OLMo 3 7B and Phi-3.5 mini on every part of the card"
git push
```

Post in `#crow-cards`:

> Gate 3 done: the model comparison is in the PR: review files in `llm/eval/review/`, our observations in `llm/eval/OBSERVATIONS.md`. Could we go through them together at our next meeting?

Then stop the tunnel (Ctrl+C) and the VM.

---

## Troubleshooting

- **"Problems in the input files":** each line names the file and what's wrong; fix those and run `--check` again.
- **"Can't reach Ollama":** the tunnel isn't running, or the VM is stopped (STEP1.md, B.4).
- **"Not on the Ollama at …":** if the models it lists aren't the VM's three, the tunnel isn't reaching the VM (STEP1.md, B.4).
- **A model errors or times out on everything:** check `nvidia-smi` on the VM; all three models together need most of the GPU's memory, and `sudo systemctl restart ollama` frees it.
- **Lots of broken answers from one model:** look at its raw answers in `results/`. Often the prompt needs to spell out the shape more plainly; change it for all three models, and run them all again.
- **The review files don't show Student B's additions:** run `python3 run_models.py --review-only` after editing `currentSite`.
