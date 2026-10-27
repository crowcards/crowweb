// Marks drafts as reviewed in the data files, from the workbench
// (bench.html), which can't write files itself: its Approve button
// copies the command to run here.
//
//   node scripts/review.mjs approve workplace     a community type: community_types.json, and all its marks
//   node scripts/review.mjs unapprove workplace   back to "proposed"
//   node scripts/review.mjs terms mutual_aid      a value's proposed word list (or "all"): into value_groups.json
//
// "Approved" is status "accepted" (status "proposed" until then), the same
// field every reviewed datasheet uses. Approving also settles the type's
// changes since the first draft ("change", "was", and its "removed" marks).
import { readFileSync, writeFileSync } from "node:fs";

const [action, id] = process.argv.slice(2);
if (!["approve", "unapprove", "terms"].includes(action) || !id) {
  console.error("Usage: node scripts/review.mjs approve|unapprove <community type id>\n       node scripts/review.mjs terms <value id>|all");
  process.exit(1);
}
const file = (name) => new URL(`../data/${name}.json`, import.meta.url);
const read = (name) => JSON.parse(readFileSync(file(name), "utf8"));
const write = (name, data) => writeFileSync(file(name), `${JSON.stringify(data, null, 2)}\n`);

// terms: accept a value's proposed word list (data/value_terms_proposed.json, from scripts/make-value-terms.mjs):
// its current words and phrases, minus the questionable ones, plus the new ones; then re-run that script
if (action === "terms") {
  const proposed = read("value_terms_proposed").items;
  const groups = read("value_groups");
  const picked = id === "all" ? proposed : proposed.filter((p) => p.id === id);
  if (!picked.length) { console.error(`No proposal for "${id}".`); process.exit(1); }
  for (const p of picked) {
    const g = groups.items.find((x) => x.id === p.id);
    g.cues = [...new Set([...p.current.filter((c) => !p.questionable.includes(c)), ...p.new])];
  }
  write("value_groups", groups);
  console.log(`Word lists accepted for ${picked.length === 1 ? picked[0].label : `${picked.length} values`}. Run node scripts/make-value-terms.mjs to refresh the proposals.`);
  process.exit(0);
}
const status = action === "approve" ? "accepted" : "proposed";

const types = read("community_types");
const type = types.items.find((s) => s.id === id);
if (!type) {
  console.error(`No community type "${id}". Types: ${types.items.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
type.status = status;
// approving also settles its changes since the first draft: no more "added" / "changed" markers, removed marks dropped
if (action === "approve") { delete type.change; delete type.was; }
write("community_types", types);
let marks = 0;
for (const name of ["type_value_fit", "type_approach_fit"]) {
  const data = read(name);
  for (const m of data.items.filter((x) => x.type === id)) {
    m.status = status;
    if (action === "approve") { delete m.change; delete m.was; }
    marks++;
  }
  if (action === "approve" && data.removed) data.removed = data.removed.filter((r) => r.type !== id);
  write(name, data);
}
console.log(`${type.label}: ${action === "approve" ? "approved" : "back in review"} (the type and its ${marks} marks). Reload the workbench to see it.`);
