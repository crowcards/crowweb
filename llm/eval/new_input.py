#!/usr/bin/env python3
"""
Start an input file for the model comparison (llm/STEP2.md): one test community,
picked from the site's benchmarks, with empty boxes for the students' open-text
answers and for the current site's suggestions.

  python3 new_input.py                      list the benchmark communities
  python3 new_input.py <benchmark id> <writer>

It writes inputs/<benchmark id>.json. Open it in your editor and fill in the
"texts" (and, later, "currentSite"); "_community" is there to read, and isn't
used. Then check every file with: python3 run_models.py --check
"""

import json
import pathlib
import sys

EVAL_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = EVAL_DIR.parent.parent / "data"
INPUTS_DIR = EVAL_DIR / "inputs"
sys.path.insert(0, str(EVAL_DIR))
from run_models import BENCHMARK_FILES, TEXT_FIELDS   # noqa: E402  (one list of questions, kept in the runner)


def main():
    communities = {c["id"]: (file, c) for file in BENCHMARK_FILES
                   for c in json.loads((DATA_DIR / file).read_text())["communities"]}
    if len(sys.argv) != 3:
        for cid, (file, c) in communities.items():
            print(f"  {cid:28} {c.get('type', ''):18} {c.get('format', ''):22} {c['name']}  ({file})")
        sys.exit("\nUsage: python3 new_input.py <benchmark id> <writer>   (writer: e.g. your initials)")
    cid, writer = sys.argv[1], sys.argv[2]
    if cid not in communities:
        sys.exit(f"{cid!r} isn't a benchmark community; run without arguments to list them.")
    INPUTS_DIR.mkdir(exist_ok=True)
    path = INPUTS_DIR / f"{cid}.json"
    if path.exists():
        sys.exit(f"inputs/{path.name} already exists: edit that one.")
    file, c = communities[cid]
    record = {
        "benchmark": cid,
        "writer": writer,
        "aiDrafted": False,
        "_community": {"from": file, **{k: c.get(k) for k in ("name", "type", "format", "size", "description", "keywords")}},
        "_questions": TEXT_FIELDS,
        "texts": {field: "" for field in TEXT_FIELDS},
        "currentSite": {"values": [], "joining": [], "decision": [], "conflict": []},
    }
    path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote inputs/{path.name}: fill in its \"texts\" (made up, in this community's voice).")


if __name__ == "__main__":
    main()
