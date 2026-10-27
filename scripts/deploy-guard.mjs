// Runs by itself before every deploy (firebase.json "predeploy"); nothing to
// do by hand. Until staging has its own project (TODO.md), one project holds
// both sites, the functions and the database, so this stops the live parts
// going out from anywhere but a released main:
//
//   staging   the staging site (staging.crowcards.org): from any branch
//   live      the live site (crowcards.org)                    ┐ only from main, with nothing
//   functions the server (shared by both sites)               │ uncommitted, matching GitHub
//   firestore the database's rules and indexes                ┘ (origin/main)
//
// It also checks the two hosting entries in firebase.json say the same
// (headers, redirects, …): JSON can't share them, so they're written twice.
// The live one may only add to what's ignored (the workbench, team files).
//
// A guard against mistakes, not people: anyone who can deploy can get round it.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const what = process.argv[2];
const root = join(import.meta.dirname, "..");
const stop = (why) => { console.error(`\nDeploy stopped (${what}): ${why}\n`); process.exit(1); };

// the two hosting entries match, apart from their target, hooks and ignores
const [staging, live] = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")).hosting;
const shared = ({ target, predeploy, ignore, ...rest }) => JSON.stringify(rest);
if (shared(staging) !== shared(live)) stop("firebase.json's staging and live hosting entries differ (headers, redirects, …): make them the same.");
if (staging.ignore.some((i) => !live.ignore.includes(i))) stop("firebase.json's live hosting entry must ignore everything the staging one does.");

if (what !== "staging") {
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }).trim();
  const branch = git("branch --show-current");
  if (branch !== "main") stop(`this goes live, so it's deployed from main only (you're on ${branch || "no branch"}). For staging: firebase deploy --only hosting:staging`);
  if (git("status --porcelain")) stop("there are uncommitted changes; commit them on beta and release them through a pull request.");
  try { git("fetch --quiet origin main"); } catch { stop("couldn't reach GitHub to check main is up to date; try again."); }
  if (git("rev-parse HEAD") !== git("rev-parse origin/main")) stop("main here doesn't match GitHub's: git pull (or push), then deploy again.");
}
console.log(`Deploy guard: ${what} OK`);
