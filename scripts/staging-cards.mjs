// Lists the cards made on the staging site, and with --delete deletes them.
// Until staging has its own project, its cards share the live database,
// marked env: "staging" (cards from before launch have no env: they count
// as staging too). Live cards (env: "live") are never touched.
//
//   node scripts/staging-cards.mjs            list them, delete nothing
//   node scripts/staging-cards.mjs --delete   delete them
//
// Deleting a card deletes everything of it: the card and its private
// versions, its key, its public copies and its reports. It can't be undone
// (beyond the database's own backups).
//
// Talks to the real database as you: once per computer, install gcloud and
// run `gcloud auth application-default login` (README.md, "Releasing").
// Uses firebase-admin from functions/ (run `npm install` in functions/ first,
// if you haven't).

import { createRequire } from "node:module";
import { join } from "node:path";

const PROJECT = "cos-princeton-hci-crow";
const del = process.argv.includes("--delete");
const require = createRequire(join(import.meta.dirname, "..", "functions", "package.json"));
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore(initializeApp({ projectId: PROJECT }));

const where = process.env.FIRESTORE_EMULATOR_HOST ? "the local emulator" : PROJECT;
const cards = (await db.collection("cards").get()).docs.filter((d) => d.data().env !== "live");
console.log(`${cards.length} staging card(s) in ${where}:`);
for (const d of cards) {
  const c = d.data();
  console.log(`  ${d.id}  ${(c.env || "(before launch)").padEnd(15)}  ${(c.publishing?.status || "draft").padEnd(11)}  ${c.basics?.name || "(no name)"}`);
}
if (!del) {
  if (cards.length) console.log("\nNothing deleted. To delete these: node scripts/staging-cards.mjs --delete");
  process.exit(0);
}

for (const d of cards) {
  const id = d.id;
  const [keys, reports] = await Promise.all(["cardKeys", "reports"].map((c) => db.collection(c).where("cardId", "==", id).get()));
  for (const k of [...keys.docs, ...reports.docs]) await k.ref.delete();
  await db.recursiveDelete(db.collection("public").doc(id));   // and its versions
  await db.recursiveDelete(d.ref);                              // and its private versions
  console.log(`  deleted ${id} (${reports.size} report(s))`);
}
console.log(`Deleted ${cards.length} staging card(s).`);
process.exit(0);   // (the database connection would keep it running)
