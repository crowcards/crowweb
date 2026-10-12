// The workbench's reference tables (bench.html): every <table data-source="…">
// on the page, filled from its JSON file by the shared renderers in
// js/docs-tables.js (which the docs site's build uses too).

import { tableBody, esc } from "./docs-tables.js";

// each file fetched once, however many tables use it
const files = new Map();
const load = (src) => {
  if (!files.has(src)) files.set(src, fetch(src).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }));
  return files.get(src);
};

for (const table of document.querySelectorAll("table[data-source]")) {
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="99" class="ref-loading">Loading…</td></tr>`;
  tableBody({ dataset: table.dataset, columns: table.tHead?.rows[0]?.cells.length || 0 }, load)
    .then((html) => { tbody.innerHTML = html; })
    .catch((err) => {
      console.error("docs-reference: failed to load", table.dataset.source, err);
      tbody.innerHTML = `<tr><td colspan="99" class="ref-error">Couldn't load ${esc(table.dataset.source)}: ${esc(err.message)}</td></tr>`;
    });
}
