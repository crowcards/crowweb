#!/usr/bin/env python3
"""
CROW Cards: an exploratory comparison of language models (llm/STEP2.md).

Runs every model on every task for every test community, and writes one
Markdown review file per task (review/<task>.md) for the team to read
together. Standard library only.

  python3 run_models.py                  run the three models, then write the review files
  python3 run_models.py --check          check the input files only (no VM needed)
  python3 run_models.py --review-only    rewrite the review files from the latest run,
                                         e.g. after adding the current site's suggestions
  python3 run_models.py --models phi3.5:3.8b --tasks values decision

Inputs:
  inputs/<community>.json   one per test community: which benchmark it is, the
                            students' open-text answers, and the current site's
                            suggestions (new_input.py starts one)
  rules/<name>.json         a public community's rules page: its address, when it
                            was copied, and the rules
  prompts/                  the prompt templates (see "Prompts" below)

Outputs:
  results/<time>.json       every raw answer, with what produced it (ignored by Git)
  review/<task>.md          the side-by-side review files (committed)

Ollama is reached through an SSH port tunnel from your computer (STEP1.md,
B.4), on local port 11435. Set OLLAMA_URL to use another address.
"""

import argparse
import datetime
import http.client
import json
import os
import pathlib
import statistics
import subprocess
import sys
import time
import urllib.request

EVAL_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = EVAL_DIR.parent.parent / "data"   # the site's datasheets
INPUTS_DIR = EVAL_DIR / "inputs"
RULES_DIR = EVAL_DIR / "rules"
PROMPTS_DIR = EVAL_DIR / "prompts"
RESULTS_DIR = EVAL_DIR / "results"
REVIEW_DIR = EVAL_DIR / "review"
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11435")
TIMEOUT_S = 180   # per network step; with "stream": false, about the longest wait for one answer
MODELS = ["qwen2.5:7b-instruct", "olmo-3:7b-instruct", "phi3.5:3.8b"]

# Sent with every request:
#   num_ctx: how much text Ollama reads per request. Its default (a few
#     thousand tokens) is shorter than our longer prompts (the values list
#     alone is about 4,500), and Ollama may cut a longer prompt without saying so.
#   temperature 0 and a fixed seed: the same prompt gets the same answer.
OPTIONS = {"num_ctx": 16384, "temperature": 0, "seed": 42}

BENCHMARK_FILES = ["benchmark_communities.json", "benchmark_heldout.json"]

# The open-text answers an input file can hold, one per module question.
TEXT_FIELDS = {
    "joining": "How do people join? (Membership)",
    "decision_moderation": "How are moderation decisions made? (Processes: Moderation)",
    "decision_maintenance": "How are maintenance decisions made? (Processes: Maintenance)",
    "decision_change": "How do the rules or the setup get changed? (Processes: Change)",
    "conflict": "What happens when there's a conflict? (Processes: Conflict management)",
    "federation": "How does the community handle other servers? (Federation)",
}

# The tasks. "kind" picks the prompt (prompts/<task>.txt if there is one, else
# prompts/<kind>.txt) and the review's layout:
#   from_description: pick options, given the community's description
#   from_text:        pick options, given one of the students' open-text answers
#   federation:       an approach and a response ladder, given the federation text
#   rules:            map each rule of a public rules page onto the rule schema
# "options" is the list to pick from; "answer" the key holding the picks; "team"
# where the benchmark's answer key for it is ("expected" → that part);
# "site" the current site's suggestions in the input file.
TASKS = {
    "values": {"kind": "from_description", "title": "Basics: values, from the description",
               "question": "which values this community holds", "options": "values", "answer": "picks",
               "team": "values", "site": "values"},
    "joining": {"kind": "from_description", "title": "Membership: ways of joining, from the description",
                "question": "how people join this community", "options": "joining", "answer": "picks",
                "team": "joining", "site": "joining"},
    "decision": {"kind": "from_description", "title": "Processes: decision-making, from the description",
                 "question": "how this community makes decisions", "options": "decision", "answer": "picks",
                 "team": "decision", "site": "decision"},
    "conflict": {"kind": "from_description", "title": "Processes: conflict management, from the description",
                 "question": "how this community handles conflict", "options": "conflict", "answer": "picks",
                 "team": "conflict", "site": "conflict"},
    "joining_text": {"kind": "from_text", "text": "joining", "title": "Membership: ways of joining, from what they wrote",
                     "question": "which ways of joining they describe", "options": "joining", "answer": "picks",
                     "team": "joining", "site": "joining"},
    "decision_moderation_text": {"kind": "from_text", "text": "decision_moderation",
                                 "title": "Processes: moderation decisions, from what they wrote",
                                 "question": "which decision-making approaches they describe for moderation",
                                 "options": "decision", "answer": "picks", "team": "decision", "site": "decision"},
    "decision_maintenance_text": {"kind": "from_text", "text": "decision_maintenance",
                                  "title": "Processes: maintenance decisions, from what they wrote",
                                  "question": "which decision-making approaches they describe for maintenance",
                                  "options": "decision", "answer": "picks", "team": "decision", "site": "decision"},
    "decision_change_text": {"kind": "from_text", "text": "decision_change",
                             "title": "Processes: changing the rules and setup, from what they wrote",
                             "question": "which decision-making approaches they describe for changes",
                             "options": "decision", "answer": "picks", "team": "decision", "site": "decision"},
    "conflict_text": {"kind": "from_text", "text": "conflict", "title": "Processes: conflict management, from what they wrote",
                      "question": "which conflict-management approaches they describe", "options": "conflict",
                      "answer": "picks", "team": "conflict", "site": "conflict"},
    "federation_text": {"kind": "federation", "text": "federation", "title": "Federation, from what they wrote"},
    "rules": {"kind": "rules", "title": "Rules: public rules pages mapped onto the rule schema"},
}


# ─── the site's lists ────────────────────────────────────

def load(name):
    return json.loads((DATA_DIR / name).read_text())


def option_lists():
    """Every list a task picks from, as the site shows it: {list: {id: (label, description)}}.

    Values: without the hidden ones (e.g. Holacracy), with the team's corrected
    labels and descriptions, and the site's rewordings ("This may mean…").
    """
    plain = lambda name: {i["id"]: (i["label"], i.get("description", "")) for i in load(name)["items"]}
    values = plain("values.json")
    groups = load("value_groups.json")
    for g in groups["items"]:
        if g["id"] in values:
            if g.get("hidden"):
                del values[g["id"]]
            else:
                label, text = values[g["id"]]
                values[g["id"]] = (g.get("label", label), g.get("description", text))
    for old, new in groups.get("rewordings", []):
        values = {k: (label, text.replace(old, new)) for k, (label, text) in values.items()}
    enums = load("enums.json")
    enum = lambda key: {i["id"]: (i["label"], i.get("description", "")) for i in enums[key]}
    return {
        "values": values,
        "joining": plain("membership_options.json"),
        "decision": plain("decision_approaches.json"),
        "conflict": plain("conflict_management.json"),
        "federation_approach": enum("federationApproach"),
        "federation_ladder": enum("federationResponseLadder"),
    }


def rule_schema():
    """The rule schema: {rule id: (type id, label)}, {type id: (name, qualifier set or None)}, qualifier sets."""
    schema = load("rule_schema.json")
    rules, types = {}, {}
    for category in schema["types"].values():
        for t in category:
            types[t["id"]] = (t["name"], t["qualifier"] or None)
            for r in t["rules"]:
                rules[r["id"]] = (t["id"], r["label"])
    return rules, types, schema["qualifierSets"]


def listing(options):
    return "\n".join(f"{oid}: {label}. {text}".rstrip(". ") + "." for oid, (label, text) in options.items())


def rules_listing():
    rules, types, sets = rule_schema()
    lines = []
    for tid, (name, qset) in types.items():
        q = f" (qualifier: one of {', '.join(o['id'] for o in sets[qset])})" if qset else ""
        lines.append(f"Type {tid}: {name}{q}")
        lines += [f"  {rid}: {label}" for rid, (t, label) in rules.items() if t == tid]
    return "\n".join(lines)


# ─── the inputs ──────────────────────────────────────────

def benchmarks():
    """Every benchmark community, by id."""
    return {c["id"]: c for name in BENCHMARK_FILES for c in load(name)["communities"]}


def resolve(value, options):
    """An id from an id or a label (as the workbench shows it), or None."""
    if value in options:
        return value
    return next((oid for oid, (label, _) in options.items() if label.casefold() == str(value).casefold()), None)


def load_inputs(lists):
    """The test communities and rules pages; stops with every problem listed if any are malformed."""
    known = benchmarks()
    problems, communities, pages = [], [], []
    for path in sorted(INPUTS_DIR.glob("*.json")):
        c = json.loads(path.read_text())
        where = f"inputs/{path.name}"
        if c.get("benchmark") not in known:
            problems.append(f"{where}: benchmark {c.get('benchmark')!r} isn't in {' or '.join(BENCHMARK_FILES)}")
            continue
        texts = c.get("texts", {})
        for field in texts:
            if field not in TEXT_FIELDS:
                problems.append(f"{where}: texts.{field} isn't one of {', '.join(TEXT_FIELDS)}")
        if not isinstance(c.get("aiDrafted"), bool):
            problems.append(f"{where}: aiDrafted should be true or false")
        site = {}
        for task_list, picks in (c.get("currentSite") or {}).items():
            if task_list not in ("values", "joining", "decision", "conflict"):
                problems.append(f"{where}: currentSite.{task_list} isn't one of values, joining, decision, conflict")
                continue
            ids = []
            for p in picks:
                oid = resolve(p, lists[task_list])
                if oid:
                    ids.append(oid)
                else:
                    problems.append(f"{where}: currentSite.{task_list}: {p!r} isn't an id or label on the site's list")
            if ids:   # an empty list means not added yet
                site[task_list] = ids
        communities.append({**c, "file": where, "community": known[c["benchmark"]], "site": site})
    for path in sorted(RULES_DIR.glob("*.json")):
        page = json.loads(path.read_text())
        where = f"rules/{path.name}"
        if not str(page.get("source", "")).startswith("http") or not page.get("copied"):
            problems.append(f"{where}: needs its source (the page's address) and copied (the date)")
        if not page.get("rules") or not all(isinstance(r, dict) and r.get("text") for r in page["rules"]):
            problems.append(f"{where}: rules should be a list of {{\"text\": …, \"hint\": …}}")
        pages.append({**page, "id": path.stem, "file": where})
    if problems:
        sys.exit("Problems in the input files:\n  " + "\n  ".join(problems))
    return communities, pages


# ─── the prompts ─────────────────────────────────────────

def template(task):
    for name in (task, TASKS[task]["kind"]):
        path = PROMPTS_DIR / f"{name}.txt"
        if path.exists():
            return path.read_text()
    sys.exit(f"No prompt for {task}: add prompts/{task}.txt or prompts/{TASKS[task]['kind']}.txt")


def fill(template_text, **parts):
    """Put each {part} into a template. str.replace, so templates can hold JSON as written."""
    for name, value in parts.items():
        template_text = template_text.replace("{" + name + "}", value)
    return template_text


def describe(community):
    d = community["description"]
    return "\n\n".join(t for t in (d.get("purpose"), d.get("culture")) if t)


def context(community):
    """Type, format, size and keywords: never anything from the answer key."""
    return json.dumps({k: community[k] for k in ("type", "format", "size", "keywords") if community.get(k)})


def prompts_for(task, communities, pages, lists):
    """Every (item id, prompt) the task has: one per community (or rules page)."""
    t = TASKS[task]
    if t["kind"] == "rules":
        for page in pages:
            numbered = "\n".join(f"{i}. {r['text']}" + (f" ({r['hint']})" if r.get("hint") else "")
                                 for i, r in enumerate(page["rules"], 1))
            yield page["id"], fill(template(task), rules=numbered, schema=rules_listing())
        return
    for c in communities:
        text = c.get("texts", {}).get(t.get("text"), "") if "text" in t else None
        if text is not None and not text.strip():
            continue   # no answer written for this question
        parts = {"description": describe(c["community"]), "context_json": context(c["community"]),
                 "text": text or "", "question": t.get("question", "")}
        if t["kind"] == "federation":
            parts.update(approaches=listing(lists["federation_approach"]), ladder=listing(lists["federation_ladder"]))
        else:
            parts["options"] = listing(lists[t["options"]])
        yield c["benchmark"], fill(template(task), **parts)


# ─── talking to Ollama ───────────────────────────────────

def ollama(path, payload=None):
    """Call Ollama: GET without a payload, POST with one. Returns (reply, error)."""
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(OLLAMA_URL + path, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read()), None
    # OSError: network failures (refused, timed out, dropped); HTTPException:
    # a reply cut short; ValueError: a reply that isn't JSON
    except (OSError, http.client.HTTPException, ValueError) as e:
        return None, str(e)


def ask(model, prompt):
    """One answer: (text, seconds, error); error is None when it worked."""
    start = time.monotonic()
    reply, error = ollama("/api/generate", {"model": model, "prompt": prompt, "format": "json",
                                            "stream": False, "options": OPTIONS})
    return (reply or {}).get("response", ""), round(time.monotonic() - start, 2), error


def full_name(model):
    return model if ":" in model else model + ":latest"


def check_server(models):
    """Each model's digest; stops with a useful message if this isn't our VM's Ollama, or a model is missing."""
    tags, error = ollama("/api/tags")
    if error:
        sys.exit(f"Can't reach Ollama at {OLLAMA_URL} ({error}). Is the tunnel running? (STEP1.md, B.4)")
    digests = {m.get("name"): m.get("digest") for m in tags.get("models", [])}
    missing = [m for m in models if full_name(m) not in digests]
    if missing:
        sys.exit(f"Not on the Ollama at {OLLAMA_URL}: {', '.join(missing)}. It has: {', '.join(digests) or 'nothing'}.\n"
                 "If that isn't the VM's list, the tunnel isn't reaching the VM (STEP1.md, B.4).")
    return {m: digests[full_name(m)] for m in models}


def git_state():
    try:
        git = lambda *a: subprocess.run(["git", *a], cwd=EVAL_DIR, capture_output=True, text=True).stdout.strip()
        commit = git("rev-parse", "HEAD") or None
        return commit, (bool(git("status", "--porcelain", "inputs", "rules", "prompts")) if commit else None)
    except OSError:
        return None, None


# ─── reading the answers ─────────────────────────────────

def parse(answer):
    try:
        return json.loads(answer)
    except (json.JSONDecodeError, TypeError):
        return None


def picks_in(parsed, key):
    """[(id, note)] from {"<key>": [{"id": …, "note": …}, …]}, or None if it isn't that shape."""
    if not isinstance(parsed, dict) or not isinstance(parsed.get(key), list):
        return None
    picks = []
    for item in parsed[key]:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            picks.append((item["id"], str(item.get("note") or item.get("reason") or "")))
        elif isinstance(item, str):
            picks.append((item, ""))
    return picks


def picked_ids(task, run, lists):
    """The real ids a run picked (for agreement), or None if the answer was broken."""
    t = TASKS[task]
    if run.get("error") or t["kind"] not in ("from_description", "from_text"):
        return None
    picks = picks_in(parse(run["answer"]), t["answer"])
    return None if picks is None else {oid for oid, _ in picks if oid in lists[t["options"]]}


# ─── the review files ────────────────────────────────────

def cell(text):
    """Text that's safe inside a Markdown table cell."""
    return str(text).replace("|", "\\|").replace("\n", "<br>").strip()


def quote(text):
    return "\n".join("> " + line if line.strip() else ">" for line in text.strip().splitlines())


def show_picks(task, run, lists, community=None):
    t = TASKS[task]
    if run.get("error"):
        return f"**Error:** {cell(run['error'])}"
    parsed = parse(run["answer"])
    if parsed is None:
        return f"**Not valid JSON:** {cell(run['answer'][:300])}"
    options = lists[t["options"]]
    picks = picks_in(parsed, t["answer"])
    if picks is None:
        return f"**Wrong shape:** {cell(run['answer'][:300])}"
    if not picks:
        return "*(picked nothing)*"
    avoid = set(((community or {}).get("expected", {}).get(t["team"]) or {}).get("avoid", []))
    lines = []
    for oid, note in picks:
        name = f"{options[oid][0]} (`{oid}`)" if oid in options else f"`{oid}` ⚠ **not an option on the site**"
        flag = " ⚠ *team: avoid*" if oid in avoid else ""
        lines.append(f"{name}{flag}" + (f": {note}" if note else ""))
    return cell("\n".join(lines))


def names(ids, options):
    return ", ".join(f"{options[i][0]} (`{i}`)" if i in options else f"`{i}`" for i in ids) or "none"


def team_row(task, community, lists):
    t = TASKS[task]
    key = community.get("expected", {}).get(t["team"])
    if not key:
        return "*(none in the benchmark)*"
    options = lists[t["options"]]
    right = key.get("core") or key.get("good") or []
    parts = [f"**{'core' if 'core' in key else 'good'}:** {names(right, options)}"]
    if key.get("also"):
        parts.append(f"**also:** {names(key['also'], options)}")
    if key.get("avoid"):
        parts.append(f"**avoid:** {names(key['avoid'], options)}")
    return cell("\n".join(parts))


def show_federation(run, lists):
    if run.get("error"):
        return f"**Error:** {cell(run['error'])}"
    p = parse(run["answer"])
    if not isinstance(p, dict):
        return f"**Not valid JSON:** {cell(run['answer'][:300])}"
    approach, ladder = p.get("approach"), p.get("ladder")
    approaches, steps = lists["federation_approach"], lists["federation_ladder"]
    a = (f"{approaches[approach][0]} (`{approach}`)" if approach in approaches
         else "none" if approach is None else f"`{approach}` ⚠ **not an option**")
    lad = (" → ".join(f"{steps[s][0]}" if s in steps else f"`{s}` ⚠" for s in ladder)
           if isinstance(ladder, list) else "**wrong shape**")
    return cell(f"**Approach:** {a}\n**When there's a problem:** {lad or 'none'}"
                + (f"\n{p['note']}" if p.get("note") else ""))


def number(n):
    """A rule's number as the model wrote it ("3" or 3), or None."""
    try:
        return int(n)
    except (TypeError, ValueError):
        return None


def show_rule(item, rules, types, sets):
    """One mapped rule: the schema rule (or custom), its type and qualifier, and the model's note."""
    if not isinstance(item, dict):
        return "**wrong shape**"
    rid, tid, q = item.get("rule"), item.get("type"), item.get("qualifier")
    if rid in rules:
        tid = rules[rid][0]
        text = f"{types[tid][0]} › {rules[rid][1]} (`{rid}`)"
    elif rid in (None, "custom", ""):
        text = f"Custom, type: {types[tid][0]} (`{tid}`)" if tid in types else "Custom, no type" if not tid else f"Custom, type `{tid}` ⚠ **not a type**"
    else:
        text = f"`{rid}` ⚠ **not a rule in the schema**"
    if q:
        qset = types.get(tid, (None, None))[1]
        valid = qset and q in {o["id"] for o in sets[qset]}
        text += f" · {q}" + ("" if valid else " ⚠ **not a qualifier for this type**")
    return cell(text + (f": {item['note']}" if item.get("note") else ""))


def checks_table(task, runs, models, lists):
    rows = ["| Model | Answers | Errors | Not valid JSON / wrong shape | Not options on the site | Median seconds |",
            "|---|---|---|---|---|---|"]
    t = TASKS[task]
    for m in models:
        mine = list(runs[m].values())
        errors = sum(bool(r.get("error")) for r in mine)
        broken, made_up = 0, 0
        for r in mine:
            if r.get("error"):
                continue
            p = parse(r["answer"])
            if t["kind"] in ("from_description", "from_text"):
                picks = picks_in(p, t["answer"])
                if picks is None:
                    broken += 1
                else:
                    made_up += sum(oid not in lists[t["options"]] for oid, _ in picks)
            elif t["kind"] == "federation":
                if not isinstance(p, dict) or not isinstance(p.get("ladder"), list):
                    broken += 1
                else:
                    made_up += (p.get("approach") not in (None, *lists["federation_approach"]))
                    made_up += sum(s not in lists["federation_ladder"] for s in p["ladder"])
            else:   # rules
                if not isinstance(p, dict) or not isinstance(p.get("rules"), list):
                    broken += 1
                else:
                    known = rule_schema()[0]
                    made_up += sum(isinstance(i, dict) and i.get("rule") not in (None, "", "custom") and i.get("rule") not in known
                                   for i in p["rules"])
        times = [r["seconds"] for r in mine if not r.get("error")]
        rows.append(f"| {m} | {len(mine)} | {errors} | {broken} | {made_up} | "
                    f"{statistics.median(times) if times else '–'} |")
    return "\n".join(rows)


def write_review(task, results, communities, pages, lists):
    t = TASKS[task]
    models = [m for m in results["models"] if results["models"][m]["answers"].get(task)]
    if not models:
        return None
    runs = {m: results["models"][m]["answers"][task] for m in models}
    out = [f"# Review: {t['title']}", "",
           f"From the run of {results['started']} (`{results['file']}`), at commit `{results.get('git_commit') or 'unknown'}`"
           + (" (with uncommitted changes to the inputs or prompts)" if results.get("inputs_changed") else "") + ".",
           f"Models: {', '.join(f'{m} (`{(results['models'][m]['digest'] or '')[:12]}`)' for m in models)}.", ""]
    if t["kind"] in ("from_description", "from_text"):
        out += ["The **team's benchmark picks** and the **current site's suggestions** are references to compare with, "
                "not right answers. ⚠ marks an id that isn't an option on the site, or one the team's picks list as *avoid*.", ""]
    out += ["## Checks", "", checks_table(task, runs, models, lists), ""]

    if t["kind"] == "rules":
        rules, types, sets = rule_schema()
        for page in pages:
            if not any(page["id"] in runs[m] for m in models):
                continue
            out += [f"## {page.get('name') or page['id']}", "",
                    f"Copied from {page['source']} on {page['copied']}.", "",
                    "| # | Rule, as written | " + " | ".join(models) + " |",
                    "|---|---|" + "---|" * len(models)]
            mapped = {}
            for m in models:
                p = parse(runs[m].get(page["id"], {}).get("answer", ""))
                items = p.get("rules") if isinstance(p, dict) else None
                mapped[m] = {number(i.get("n")): i for i in items if isinstance(i, dict)} if isinstance(items, list) else None
            for n, r in enumerate(page["rules"], 1):
                row = [str(n), cell(r["text"] + (f" ({r['hint']})" if r.get("hint") else ""))]
                for m in models:
                    run = runs[m].get(page["id"], {})
                    row.append(f"**Error:** {cell(run['error'])}" if run.get("error")
                               else "**broken answer**" if mapped[m] is None
                               else show_rule(mapped[m][n], rules, types, sets) if n in mapped[m] else "*(not mapped)*")
                out.append("| " + " | ".join(row) + " |")
            out.append("")
        return "\n".join(out)

    for c in communities:
        if not any(c["benchmark"] in runs[m] for m in models):
            continue
        com = c["community"]
        out += [f"## {com.get('name', c['benchmark'])}", "",
                f"`{c['benchmark']}` · {com.get('type')} · {com.get('format')} · {com.get('size')}"
                + f" · written by {c.get('writer', '?')}{', AI-drafted then edited' if c.get('aiDrafted') else ''}", ""]
        if t["kind"] == "from_description":
            out += [quote(describe(com)), ""]
        else:
            out += [f"*{TEXT_FIELDS[t['text']]}*", "", quote(c["texts"][t["text"]]), ""]
        out += ["| | Picks, and the model's reasons |", "|---|---|"]
        for m in models:
            run = runs[m].get(c["benchmark"])
            if run is None:
                continue
            shown = show_federation(run, lists) if t["kind"] == "federation" else show_picks(task, run, lists, com)
            out.append(f"| **{m}** | {shown} |")
        if t["kind"] != "federation":
            out.append(f"| *Team's benchmark picks* | {team_row(task, com, lists)} |")
            site = c["site"].get(t["site"])
            note = " *(from the description: the site can't read this text)*" if t["kind"] == "from_text" else ""
            out.append(f"| *Current site (workbench)* | "
                       + (cell(names(site, lists[t["options"]])) + note if site is not None else "*(not added yet)*") + " |")
            picked = [picked_ids(task, runs[m][c["benchmark"]], lists) for m in models if c["benchmark"] in runs[m]]
            picked = [p for p in picked if p is not None]
            if len(picked) > 1:
                every = set.intersection(*picked)
                some = {i for i in set.union(*picked) if sum(i in p for p in picked) > 1} - every
                out += ["", f"Picked by all {len(picked)} models: {names(sorted(every), lists[t['options']])}."
                        + (f" By more than one: {names(sorted(some), lists[t['options']])}." if some else "")]
        out.append("")
    return "\n".join(out)


def write_reviews(results, communities, pages, lists, tasks):
    REVIEW_DIR.mkdir(exist_ok=True)
    for task in tasks:
        text = write_review(task, results, communities, pages, lists)
        if text:
            (REVIEW_DIR / f"{task}.md").write_text(text)
            print(f"  wrote review/{task}.md")


# ─── the run ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Compare models on every task; write review/<task>.md.")
    parser.add_argument("--models", nargs="+", default=MODELS)
    parser.add_argument("--tasks", nargs="+", default=list(TASKS), choices=list(TASKS))
    parser.add_argument("--check", action="store_true", help="only check the input files")
    parser.add_argument("--review-only", action="store_true", help="rewrite the review files from the latest run")
    args = parser.parse_args()

    lists = option_lists()
    communities, pages = load_inputs(lists)
    print(f"{len(communities)} communities, {len(pages)} rules pages: the inputs look fine.")
    if args.check:
        return

    if args.review_only:
        runs = sorted(RESULTS_DIR.glob("*.json"))
        if not runs:
            sys.exit("No runs in results/ yet.")
        results = json.loads(runs[-1].read_text())
        write_reviews(results, communities, pages, lists, [t for t in args.tasks if t in TASKS])
        return

    for task in args.tasks:
        template(task)   # stop now, not halfway, if a prompt is missing
    digests = check_server(args.models)
    RESULTS_DIR.mkdir(exist_ok=True)
    started = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    path = RESULTS_DIR / f"{datetime.datetime.now():%Y%m%d-%H%M%S}.json"
    commit, changed = git_state()
    results = {"started": started, "file": f"results/{path.name}", "ollama_version": (ollama("/api/version")[0] or {}).get("version"),
               "options": OPTIONS, "git_commit": commit, "inputs_changed": changed, "models": {}}
    for model in args.models:
        print(f"\n{model}: warming up (loading it into the GPU)…")
        _, _, error = ask(model, 'Reply with the JSON object {"ok": true}')
        if error:
            sys.exit(f"{model} didn't answer: {error}")
        answers = {}
        for task in args.tasks:
            answers[task] = {}
            for item, prompt in prompts_for(task, communities, pages, lists):
                answer, seconds, error = ask(model, prompt)
                answers[task][item] = {"answer": answer, "seconds": seconds, **({"error": error} if error else {})}
                print(f"  {task} / {item}: {'ERROR ' + error if error else 'ok'} ({seconds}s)")
        results["models"][model] = {"digest": digests[model], "answers": answers}
        path.write_text(json.dumps(results, indent=2))   # saved after each model, in case a later one fails
    print(f"\nWrote {results['file']}")
    write_reviews(results, communities, pages, lists, args.tasks)


if __name__ == "__main__":
    main()
