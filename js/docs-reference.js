/* ────────────────────────────────────────────────────────────
   docs-reference.js
   Finds every <table data-source="..."> on the page, fetches
   the JSON file, and populates the table from the rules below.

   Each table also declares data-render="type" to pick a renderer
   (e.g. values, platforms, rules). Add new renderers as needed.
   data-labels="/data/other.json" also loads a file of names (its items,
   or tiers), passed to the renderer as a lookup: id → label.
   ──────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ─── Renderers ──────────────────────────────────────────
  // Each renderer takes the parsed JSON and returns an HTML string
  // for the <tbody>. Keep them small; add more here as new sections land.

  const renderers = {
    // Simple two-column: label + description. The items are data.items, or
    // with data-enum-key="…", that list in the file (e.g. enums.json)
    "simple": (data, el) => (el.dataset.enumKey ? data[el.dataset.enumKey] || [] : data.items).map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td>${esc(it.description || "")}</td>
      </tr>
    `).join(""),

    // Values: label, description, signals (what inconsistency looks like)
    "values": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td>
          ${esc(it.description || "")}
          ${it.signals ? `<div class="ref-sub"><em>Example of inconsistency:</em> ${esc(it.signals)}</div>` : ""}
        </td>
      </tr>
    `).join(""),

    // Covenants, federation subscription lists: label, category, description, link
    "linked": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td><span class="model">${esc(it.category || "")}</span></td>
        <td>
          ${esc(it.description || "")}
          ${it.url ? `<div class="ref-sub"><a class="inline" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url)}</a></div>` : ""}
        </td>
      </tr>
    `).join(""),

    // Tools: label, categories, description, access
    "tools": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td><span class="model">${esc((it.categories || []).map(id => data.categories.find(c => c.id === id)?.label || id).join(", "))}</span></td>
        <td>${esc(it.description || "")}</td>
        <td><span class="model">${esc(it.access || "")}</span></td>
      </tr>
    `).join(""),

    // Governance scales (governance_scales.json): what each scale means
    "scaleDefinitions": (data) => data.scales.map(sc => `
      <tr>
        <td class="ref-name">${esc(sc.label)}</td>
        <td>${esc(sc.description)}</td>
        <td><span class="model">1: ${esc(sc.low)}</span></td>
        <td><span class="model">5: ${esc(sc.high)}</span></td>
      </tr>
    `).join(""),

    // Governance scales: one list's scores (data-list), named from data-labels
    "scales": (data, el, labelOf) => data.items.filter(it => it.list === el.dataset.list).map(it => `
      <tr>
        <td class="ref-name">${esc(labelOf(it.option))}</td>
        ${data.scales.map(sc => `<td class="score mono">${it[sc.id] == null ? '<span class="model" title="Says nothing about this scale">—</span>' : esc(it[sc.id])}</td>`).join("")}
        <td>${esc(it.why)}</td>
        <td><span class="badge ${it.status === "accepted" ? "yes" : "var"}">${esc(it.status)}</span></td>
      </tr>
    `).join(""),

    // Rule schema: iterate categories → types → rules, with qualifier flag
    "ruleSchema": (data) => {
      const out = [];
      data.categories.forEach(cat => {
        out.push(`
          <tr class="group-row"><td colspan="3"><strong>${esc(cat.label)}</strong> — ${esc(cat.description || "")}</td></tr>
        `);
        (data.types[cat.id] || []).forEach(type => {
          // which qualifier set the type uses (some rules may use another)
          const qualifierNote = type.qualifier
            ? `<span class="badge var">${type.qualifier === "requirement" ? "required / recommended" : "allowed / not allowed"}</span>`
            : "";
          out.push(`
            <tr>
              <td class="ref-name">${esc(type.name)} ${qualifierNote}</td>
              <td colspan="2">
                <ul class="ref-rule-list">
                  ${type.rules.map(r => `<li>${esc(r.label)}</li>`).join("")}
                </ul>
              </td>
            </tr>
          `);
        });
      });
      return out.join("");
    },
  };

  // ─── HTML escape ────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ─── Main ───────────────────────────────────────────────
  // each file fetched once, however many tables use it (e.g. enums.json)
  const files = new Map();
  const load = (src) => {
    if (!files.has(src)) {
      files.set(src, fetch(src).then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      }));
    }
    return files.get(src);
  };

  async function populate(table) {
    const src = table.dataset.source;
    const kind = table.dataset.render || "simple";
    const renderer = renderers[kind];
    const tbody = table.querySelector("tbody");

    if (!renderer || !tbody) {
      console.warn("docs-reference: missing renderer or tbody for", table);
      return;
    }

    tbody.innerHTML = `<tr><td colspan="99" class="ref-loading">Loading…</td></tr>`;

    try {
      // names from a second file, if the table asks for them (id → label)
      const names = table.dataset.labels ? await load(table.dataset.labels) : null;
      const byId = new Map((names?.items || names?.tiers || []).map((it) => [it.id, it.label]));
      tbody.innerHTML = renderer(await load(src), table, (id) => byId.get(id) ?? id);
    } catch (err) {
      console.error("docs-reference: failed to load", src, err);
      tbody.innerHTML = `<tr><td colspan="99" class="ref-error">Couldn't load ${esc(src)}: ${esc(err.message)}</td></tr>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("table[data-source]").forEach(populate);
  });
})();
