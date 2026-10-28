// Takes a site down for maintenance (e.g. while a major release goes out):
// every address shows the "Back soon" page (coming-soon.html), except the
// Privacy page. Run by hand:
//
//   node scripts/maintenance.mjs staging   try it on staging.crowcards.org
//   node scripts/maintenance.mjs live      take crowcards.org down
//
// To bring a site back, deploy it as usual (a release, for live), or roll it
// back in the Firebase console (Hosting → the site → release history).
//
// It deploys only the pages: the server and database are untouched, so cards
// are safe. Editor tabs left open are asked to reload (a new version.json),
// and then show "Back soon". The headers and redirects are the site's own,
// from firebase.json; the page and what it loads are copied into
// .firebase/maintenance/ (ignored by git and hosting).

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { join } from "node:path";

const target = process.argv[2];
if (!["staging", "live"].includes(target)) {
  console.error("Which site? node scripts/maintenance.mjs staging (or live)");
  process.exit(1);
}
const root = join(import.meta.dirname, "..");
const out = join(root, ".firebase", "maintenance");
const config = join(root, ".maintenance.json");   // removed after the deploy

const ask = createInterface({ input: process.stdin, output: process.stdout });
const site = target === "live" ? "crowcards.org" : "staging.crowcards.org";
const answer = await ask.question(`Take ${site} down, showing "Back soon"? Type yes: `);
ask.close();
if (answer.trim() !== "yes") process.exit(0);

// the "Back soon" page, Privacy, and what they load
const FILES = ["coming-soon.html", "privacy.html", "styles.css", "img",
  "js/theme.js", "js/site.js", "js/letters.js", "js/dom.js", "js/crow.js"];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(out, f), { recursive: true });
// a version of its own, so open editor tabs stop saving and reload
writeFileSync(join(out, "version.json"), `${JSON.stringify({ version: "maintenance", stampedAt: new Date().toISOString() })}\n`);

const entry = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")).hosting.find((h) => h.target === target);
const { predeploy, ignore, ...rest } = entry;
const hosting = { ...rest, public: ".firebase/maintenance", rewrites: [{ source: "**", destination: "/coming-soon.html" }] };
writeFileSync(config, JSON.stringify({ hosting }, null, 2));
try {
  execFileSync("firebase", ["deploy", "--config", config, "--only", `hosting:${target}`], { cwd: root, stdio: "inherit" });
  console.log(`\n${site} now shows "Back soon". To bring it back, deploy it as usual.`);
} finally {
  rmSync(config, { force: true });
}
