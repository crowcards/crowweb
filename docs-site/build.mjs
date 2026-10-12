// Builds the docs site (docs.crowcards.org) into dist/: the pages in src/,
// with every reference table filled in from the app's datasheets (../data)
// and view-mode rules (../js/view-modes.js), by the same renderers the
// workbench uses (../js/docs-tables.js). The prose is written by hand in
// src/; the tables are never typed in. Also copies what the pages need from
// the app (its styles, icons and the scripts they load), and says which
// datasheets have no table in the docs, so nothing new goes unexplained.
// Runs by itself before every deploy (firebase.json "predeploy"); or by hand:
//
//   node docs-site/build.mjs        then open docs-site/dist/index.html

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tableBody, viewModesBody, viewFieldsTable } from "../js/docs-tables.js";
import * as viewModes from "../js/view-modes.js";

const here = import.meta.dirname;
const app = join(here, "..");
const out = join(here, "dist");
const { appUrl } = JSON.parse(readFileSync(join(here, "site.json"), "utf8"));
const PAGES = ["index.html", "platforms.html"];

// the datasheets the docs don't need a table for: the team's own (the workbench's) and the editor's internals
const NOT_DOCUMENTED = ["benchmark_communities", "benchmark_heldout", "review_cases", "workbench_log", "value_terms_proposed", "value_phrases_drafted",
  "type_value_fit", "type_approach_fit", "format_value_fit", "format_approach_fit", "option_flags", "approach_size_fit",
  "value_recommendations_decision", "value_recommendations_membership", "value_recommendations_conflict", "value_conflicts",
  "module_defaults", "countries", "laws"];
// …and enums.json's lists explained in words rather than a table
const ENUMS_IN_PROSE = ["costValues"];   // (a card's Yes / No answers: Reference → Platforms → Expected costs)

// each datasheet read once, however many tables use it
const files = new Map();
const load = async (src) => {
  if (!files.has(src)) files.set(src, JSON.parse(readFileSync(join(app, src.replace(/^\//, "")), "utf8")));
  return files.get(src);
};
const used = new Set();   // "file" and "file#enumKey"
const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** A page with its tables filled in. */
async function build(html) {
  html = html.replaceAll("{{app}}", appUrl);
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/g)];
  let result = "", last = 0;
  for (const m of tables) {
    const dataset = Object.fromEntries([...m[1].matchAll(/\sdata-([\w-]+)(?:="([^"]*)")?/g)].map(([, k, v]) => [camel(k), v ?? ""]));
    const columns = (m[2].match(/<thead[\s\S]*?<\/thead>/)?.[0].match(/<th\b/g) || []).length;
    let inner = m[2];
    if ("viewModes" in dataset) inner = inner.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${viewModesBody(viewModes)}</tbody>`);
    else if ("viewFields" in dataset) inner = viewFieldsTable(viewModes);
    else if (dataset.source) {
      inner = inner.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${await tableBody({ dataset, columns }, load)}</tbody>`);
      const file = dataset.source.replace(/^\/data\/|\.json$/g, "");
      used.add(file);
      if (dataset.enumKey) used.add(`${file}#${dataset.enumKey}`);
    }
    result += html.slice(last, m.index) + `<table${m[1]}>${inner}</table>`;
    last = m.index + m[0].length;
  }
  return result + html.slice(last);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
const scripts = new Set();
for (const page of PAGES) {
  const html = await build(readFileSync(join(here, "src", page), "utf8"));
  writeFileSync(join(out, page), html);
  for (const [, src] of html.matchAll(/<script\b[^>]*\ssrc="(js\/[^"]+)"/g)) scripts.add(src);
}

// what the pages need from the app: styles, icons, the crow, and the scripts they load (and those scripts' imports)
for (const f of ["styles.css", "docs.css", "img/icons.svg", ...readdirSync(join(app, "img")).filter((f) => f.startsWith("crow-sprite-")).map((f) => `img/${f}`)]) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(app, f), join(out, f));
}
const todo = [...scripts];
while (todo.length) {
  const f = todo.pop();
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(app, f), join(out, f));
  const code = readFileSync(join(app, f), "utf8");
  for (const [, rel] of code.matchAll(/(?:from|import\()\s*["'](\.\/[^"']+)["']/g)) {
    const dep = join(dirname(f), rel);
    if (!scripts.has(dep)) { scripts.add(dep); todo.push(dep); }
  }
}

// datasheets (and enums.json's lists) the docs don't show: new ones may need a table and a word
const missing = readdirSync(join(app, "data")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  .filter((f) => !used.has(f) && !NOT_DOCUMENTED.includes(f));
const enums = JSON.parse(readFileSync(join(app, "data/enums.json"), "utf8"));
const missingEnums = Object.keys(enums).filter((k) => Array.isArray(enums[k]) && !used.has(`enums#${k}`) && !ENUMS_IN_PROSE.includes(k));
console.log(`Built ${PAGES.length} pages into docs-site/dist/ (links to the app: ${appUrl}).`);
if (missing.length) console.warn(`Not in the docs: ${missing.map((f) => `data/${f}.json`).join(", ")}. Add a table (or list it in NOT_DOCUMENTED in build.mjs).`);
if (missingEnums.length) console.warn(`Not in the docs: enums.json's ${missingEnums.join(", ")}. Add a table, if people should know them.`);
