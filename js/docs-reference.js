/* ────────────────────────────────────────────────────────────
   docs-reference.js
   Finds every <table data-source="..."> on the page, fetches
   the JSON file, and populates the table from the rules below.

   Each table also declares data-render="type" to pick a renderer
   (e.g. values, platforms, rules). Add new renderers as needed.
   ──────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ─── Renderers ──────────────────────────────────────────
  // Each renderer takes the parsed JSON and returns an HTML string
  // for the <tbody>. Keep them small; add more here as new sections land.

  const renderers = {
    // Simple two-column: label + description
    "simple": (data) => data.items.map(it => `
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

    // Covenants: label, description, link
    "covenants": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td>
          ${esc(it.description || "")}
          ${it.url ? `<div class="ref-sub"><a class="inline" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url)}</a></div>` : ""}
        </td>
      </tr>
    `).join(""),

    // Community types: label, description
    "communityTypes": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td>${esc(it.description || "")}</td>
      </tr>
    `).join(""),

    // Tools: label, type, description, access
    "tools": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td><span class="model">${esc(it.toolType || "")}</span></td>
        <td>${esc(it.description || "")}</td>
        <td><span class="model">${esc(it.access || "")}</span></td>
      </tr>
    `).join(""),

    // Federation subscription lists
    "subscriptionLists": (data) => data.items.map(it => `
      <tr>
        <td class="ref-name">${esc(it.label)}</td>
        <td>
          ${esc(it.description || "")}
          ${it.url ? `<div class="ref-sub"><a class="inline" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.url)}</a></div>` : ""}
        </td>
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
          const qualifierNote = type.qualifier
            ? `<span class="badge var">per-rule qualifier</span>`
            : "";
          out.push(`
            <tr>
              <td class="ref-name">${esc(type.name)} ${qualifierNote}</td>
              <td colspan="2">
                <ul class="ref-rule-list">
                  ${type.rules.map(r => `<li>${esc(r)}</li>`).join("")}
                </ul>
              </td>
            </tr>
          `);
        });
      });
      return out.join("");
    },

    // Enums: pick a sub-array by data-enum-key
    "enum": (data, el) => {
      const key = el.dataset.enumKey;
      const items = Array.isArray(data[key]) ? data[key] : [];
      return items.map(it => `
        <tr>
          <td class="ref-name">${esc(it.label)}</td>
          <td>${esc(it.description || "")}</td>
        </tr>
      `).join("");
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
      const res = await fetch(src, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      tbody.innerHTML = renderer(data, table);
    } catch (err) {
      console.error("docs-reference: failed to load", src, err);
      tbody.innerHTML = `<tr><td colspan="99" class="ref-error">Couldn't load ${esc(src)}: ${esc(err.message)}</td></tr>`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("table[data-source]").forEach(populate);
  });
})();
