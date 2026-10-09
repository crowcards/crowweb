// Copies what the server shares with the editor into functions/shared/, so
// it's deployed with the functions: the view-mode rules (js/view-modes.js)
// and the data they need. Runs by itself before every functions deploy
// (firebase.json "predeploy"); nothing to do by hand. On the emulator the
// functions read the repo's own files instead, so this copy is only for
// deploys (functions/shared/ is gitignored).

import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "functions", "shared");
const FILES = ["js/view-modes.js", "data/rule_schema.json", "data/governance_scales.json"];

rmSync(out, { recursive: true, force: true });
for (const f of FILES) {
  mkdirSync(join(out, f, ".."), { recursive: true });
  cpSync(join(root, f), join(out, f));
}
console.log(`Copied ${FILES.length} shared files to functions/shared/`);
