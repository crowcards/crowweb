// Runs by itself before every deploy (firebase.json "predeploy"); nothing to
// do by hand. Two projects (.firebaserc):
//
//   staging (cos-princeton-hci-crow-staging): staging.crowcards.org, its own
//     server and database, all test data: anything goes, from any branch
//     (normally beta): firebase deploy --project staging …
//   live (cos-princeton-hci-crow, the default): crowcards.org, the real
//     server and database: the site, functions and database rules only from
//     main, with nothing uncommitted, matching GitHub (origin/main)
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
const project = process.env.GCLOUD_PROJECT;   // (set by the Firebase CLI for predeploy hooks)
const PROJECTS = { live: "cos-princeton-hci-crow", staging: "cos-princeton-hci-crow-staging" };
const root = join(import.meta.dirname, "..");
const stop = (why) => { console.error(`\nDeploy stopped (${what}): ${why}\n`); process.exit(1); };

// the two hosting entries match, apart from their target, hooks and ignores
const [staging, live] = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")).hosting;
const shared = ({ target, predeploy, ignore, ...rest }) => JSON.stringify(rest);
if (shared(staging) !== shared(live)) stop("firebase.json's staging and live hosting entries differ (headers, redirects, …): make them the same.");
if (staging.ignore.some((i) => !live.ignore.includes(i))) stop("firebase.json's live hosting entry must ignore everything the staging one does.");

if (![PROJECTS.live, PROJECTS.staging].includes(project)) stop(`unknown project ${project || "(none)"}: deploy with --project staging, or (from main) to live.`);
// each site belongs to its own project. The live project also names a "staging"
// site (its old default site, disabled) only so the emulator, which runs as the
// live project, can serve both sites; deploying it is refused
if (what === "staging" && project === PROJECTS.live) stop("the staging site is in the staging project: firebase deploy --project staging --only functions,firestore,hosting:staging");
if (what === "live" && project === PROJECTS.staging) stop("the live site is in the live project, released from main: firebase deploy --only functions,firestore,hosting:live");
if (project === PROJECTS.live) {
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: "utf8" }).trim();
  const branch = git("branch --show-current");
  if (branch !== "main") stop(`this goes live, so it's deployed from main only (you're on ${branch || "no branch"}). For staging: firebase deploy --project staging --only functions,firestore,hosting:staging`);
  if (git("status --porcelain")) stop("there are uncommitted changes; commit them on beta and release them through a pull request.");
  try { git("fetch --quiet origin main"); } catch { stop("couldn't reach GitHub to check main is up to date; try again."); }
  if (git("rev-parse HEAD") !== git("rev-parse origin/main")) stop("main here doesn't match GitHub's: git pull (or push), then deploy again.");
}
console.log(`Deploy guard: ${what} to ${project === PROJECTS.live ? "live" : "staging"} OK`);
