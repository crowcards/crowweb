// Brings every stored card up to the current card schema (SCHEMA_VERSION in
// js/view-modes.js), with the same conversion the server applies when it
// reads an older card (upgradeCard): the card, each of its private
// versions, and, for a published card, its public copies, made again from
// the converted versions exactly as publishing makes them (so the scales a
// card shows are worked out afresh, on the current range).
//
//   node scripts/migrate-cards.mjs            list what it would change; changes nothing
//   node scripts/migrate-cards.mjs --apply    change it
//
// Run once per release that changes the schema, during the maintenance
// window (README.md, "Releasing"): after the release, before the site comes
// back. Running it again changes nothing (cards already current are skipped).
//
// Talks to the database as you (gcloud auth application-default login, as
// for staging-cards.mjs); with FIRESTORE_EMULATOR_HOST set, to the local
// emulator instead. GCLOUD_PROJECT picks the project (default: the live one).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const PROJECT = process.env.GCLOUD_PROJECT || "cos-princeton-hci-crow";
const apply = process.argv.includes("--apply");
const require = createRequire(join(root, "functions", "package.json"));
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore(initializeApp({ projectId: PROJECT }));

const vm = await import(join(root, "js", "view-modes.js"));
const json = (name) => JSON.parse(readFileSync(join(root, "data", name), "utf8"));
const data = { ...vm, ruleSchema: json("rule_schema.json"), scales: json("governance_scales.json") };

const where = process.env.FIRESTORE_EMULATOR_HOST ? "the local emulator" : PROJECT;
console.log(`${apply ? "Converting" : "Checking (nothing changes without --apply)"}: cards in ${where} to schema ${vm.SCHEMA_VERSION}`);

const totals = { cards: 0, current: 0, converted: 0, versions: 0, publicCopies: 0 };
for (const doc of (await db.collection("cards").get()).docs) {
  totals.cards++;
  const card = doc.data();
  const next = vm.upgradeCard(card);
  if (next === card) { totals.current++; continue; }

  // its private versions, oldest first, each converted
  const versionDocs = (await doc.ref.collection("versions").orderBy("version").get()).docs;
  const versions = versionDocs.map((d) => ({ ref: d.ref, ...d.data() })).map((v) => ({ ...v, card: vm.upgradeCard(v.card) }));
  const p = next.publishing || {};
  const latest = versions.find((v) => v.version === p.version);
  // a published card: its fingerprint from the converted version (so it doesn't
  // look edited), and its public copies made again (as functions/index.js writePublic)
  const published = p.status === "published" && !p.hidden && latest;
  if (published) next.publishing = { ...p, fingerprint: vm.contentFingerprint(latest.card) };

  console.log(`  ${doc.id}  ${card.schemaVersion || "(none)"} → ${next.schemaVersion}  ${versions.length} version(s)${published ? ", public copies rebuilt" : ""}  ${card.basics?.name || "(no name)"}`);
  totals.converted++;
  totals.versions += versions.length;
  if (published) totals.publicCopies += 1 + versions.length;
  if (!apply) continue;

  const batch = db.batch();   // (one card at a time: a card and its copies change together)
  batch.set(doc.ref, next);
  for (const v of versions) {
    const { ref, ...stored } = v;
    batch.set(ref, stored);
  }
  if (published) {
    const publicRef = db.collection("public").doc(doc.id);
    batch.set(publicRef, {
      id: next.id,
      env: next.env,
      listed: p.listed,
      version: p.version,
      publishedAt: p.publishedAt,
      credit: vm.creditOf(next.attribution),
      forkedFrom: next.forkedFrom ?? null,
      versions: versions.map((v) => ({ version: v.version, publishedAt: v.publishedAt, note: v.note })),
      ...vm.publicView(latest.card, p.mode, data),
    });
    for (const v of versions) {
      batch.set(publicRef.collection("versions").doc(String(v.version)),
        { version: v.version, publishedAt: v.publishedAt, note: v.note, ...vm.publicView(v.card, p.mode, data) });
    }
  }
  await batch.commit();
}

console.log(`\n${totals.cards} card(s): ${totals.current} already current, ${totals.converted} ${apply ? "converted" : "to convert"}`
  + ` (${totals.versions} private version(s), ${totals.publicCopies} public cop${totals.publicCopies === 1 ? "y" : "ies"} rebuilt).`);
if (!apply && totals.converted) console.log("Nothing changed. To convert them: node scripts/migrate-cards.mjs --apply");
process.exit(0);   // (the database connection would keep it running)
