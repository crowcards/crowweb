// Stamps version.json with a fingerprint of the site's code and data, so an
// editor tab left open across a deploy can tell it's out of date (see
// js/freshness.js). Runs by itself before every hosting deploy (firebase.json
// "predeploy"), including staging channels; nothing to do by hand.
//
// The fingerprint comes from the files' contents, so redeploying unchanged
// files keeps the same version and doesn't ask anyone to reload.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const SKIP = new Set(["functions", "node_modules", "emulator-data", "scripts", "version.json", "firebase.json"]);
const KINDS = /\.(html|js|css|json)$/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith(".") && !SKIP.has(e.name))
    .flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : KINDS.test(e.name) ? [join(dir, e.name)] : []));
}

const hash = createHash("sha256");
for (const f of files(root).sort()) hash.update(relative(root, f)).update(readFileSync(f));
const version = hash.digest("hex").slice(0, 12);
writeFileSync(join(root, "version.json"), `${JSON.stringify({ version, stampedAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`version.json: ${version}`);
