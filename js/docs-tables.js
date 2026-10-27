// The reference tables' rows, built from the datasheets: used by the docs site's
// build (docs-site/build.mjs, which writes them into the pages) and, in the
// browser, by js/docs-reference.js (the workbench, bench.html). No page code,
// so it runs anywhere.
//
//   const html = await tableBody(table, load);
//
// table: { dataset, columns }: the <table>'s data-* attributes
//   (data-source: the JSON file, data-render: which renderer, data-labels:
//   files of names, space-separated, e.g. "/data/formats.json", and any the
//   renderer reads, e.g. data-format) and how many columns its head has;
// load(src) → the parsed JSON file (each fetched once by the caller).
// A renderer takes the file, the table, a lookup (id → label, from
// data-labels) and the label files whole, and returns the rows' HTML.

export const renderers = {
  // Simple two-column: label + description. The items are data.items, or
  // with data-enum-key="…", that list in the file (e.g. enums.json)
  "simple": (data, el) => (el.dataset.enumKey ? data[el.dataset.enumKey] || [] : data.items).map(it => `
    <tr>
      <td class="ref-name">${esc(it.label)}</td>
      <td>${esc(it.description || "")}</td>
    </tr>
  `).join(""),

  // Values: label, description, signals (what inconsistency looks like);
  // with data-labels="/data/value_groups.json", the team's description where
  // CommunityRule's is a placeholder; values we hide (hidden: true) left out
  "values": (data, el, labelOf, [ours] = []) => data.items.filter(it => !ours?.items.find(x => x.id === it.id)?.hidden).map(it => `
    <tr>
      <td class="ref-name">${esc(ours?.items.find(x => x.id === it.id)?.label || it.label)}</td>
      <td>
        ${esc(reword(ours, ours?.items.find(x => x.id === it.id)?.description || it.description || ""))}
        ${it.signals ? `<div class="ref-sub"><em>Example of inconsistency:</em> ${esc(it.signals)}</div>` : ""}
      </td>
    </tr>
  `).join(""),

  // Covenants, federation subscription lists: label, category (only when the
  // table has a column for it: covenants have none), description, link
  "linked": (data, el) => data.items.map(it => `
    <tr>
      <td class="ref-name">${esc(it.label)}</td>
      ${el.columns > 2 ? `<td><span class="model">${esc(it.category || "")}</span></td>` : ""}
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

  // Governance scales (governance_scales.json): what each scale means, how it
  // applies to each kind of option ("applies"), and what each level means
  // (the range, e.g. 1–7, comes from the file)
  "scaleDefinitions": (data) => data.scales.map(sc => `
    <tr>
      <td class="ref-name">${esc(sc.label)}</td>
      <td>${esc(sc.description)}${sc.applies ? `<div class="ref-sub">${[["decision", "Decision-making"], ["conflict", "Conflict"], ["joining", "Joining"], ["values", "Values"]].filter(([k]) => sc.applies[k]).map(([k, label]) => `<b>${label}:</b> ${esc(sc.applies[k])}`).join("<br>")}</div>` : ""}</td>
      <td>${sc.levels.map((t, i) => `<span class="model">${data.range.min + i}</span> ${esc(t)}`).join("<br>")}</td>
    </tr>
  `).join(""),

  // Governance scales: the trade-offs of each end (shown when a community chooses its targets)
  "scaleEnds": (data) => data.scales.map(sc => {
    const end = (n, label, e) => `<td><span class="model">${n}: ${esc(label)}</span>
      <div class="ref-sub">${e.pros.map(t => `+ ${esc(t)}`).join("<br>")}<br>${e.cons.map(t => `− ${esc(t)}`).join("<br>")}</div></td>`;
    return `<tr><td class="ref-name">${esc(sc.label)}</td>${end(data.range.min, sc.ends.low.title || sc.levels[0], sc.ends.low)}${end(data.range.max, sc.ends.high.title || sc.levels.at(-1), sc.ends.high)}</tr>`;
  }).join(""),

  // Governance scales (or size fit, approach_size_fit.json: its sizes are the
  // columns): one list's scores (data-list), named from data-labels
  "scales": (data, el, labelOf) => data.items.filter(it => it.list === el.dataset.list).map(it => `
    <tr>
      <td class="ref-name">${esc(labelOf(it.option))}</td>
      ${(data.scales || data.sizes).map(sc => `<td class="score mono">${it[sc.id] == null ? '<span class="model" title="Says nothing about this scale">—</span>' : esc(it[sc.id])}</td>`).join("")}
      <td>${esc(it.why)}${it.was ? `<div class="ref-sub"><span class="badge var">changed</span> was ${(data.scales || data.sizes).map(sc => it.was[sc.id] == null ? "—" : esc(it.was[sc.id])).join(" · ")}: ${esc(it.was.why)}</div>` : ""}</td>
      <td><span class="badge ${it.status === "accepted" ? "yes" : "var"}">${esc(it.status)}</span></td>
    </tr>
  `).join(""),

  // Value links (value_recommendations_*.json): value → option, with its
  // strength (−2 to +2); data-status keeps only that status (e.g. proposed)
  "valueLinks": (data, el, labelOf) => data.items.filter(it => !el.dataset.status || it.status === el.dataset.status).map(it => `
    <tr>
      <td class="ref-name">${esc(labelOf(it.value))}</td>
      <td>${esc(labelOf(it.recommends))}</td>
      <td class="score mono">${it.strength > 0 ? "+" : "−"}${Math.abs(it.strength)}</td>
      <td>${esc(it.why)}</td>
      <td><span class="badge ${it.status === "accepted" ? "yes" : "var"}">${esc(it.status)}</span></td>
    </tr>
  `).join(""),

  // Platforms (platforms.json) of one format (data-format): name,
  // software (open source or proprietary), protocol, open source and
  // self-hostable (Yes / No / Varies), model. A generic "(any)" row and its
  // named versions are marked, so they read as a group.
  "platforms": (data, el) => {
    const items = data.items.filter(p => p.format === el.dataset.format);
    const yn = (v) => (v === true ? '<span class="badge yes">Yes</span>' : v === false ? '<span class="badge no">No</span>' : v === "varies" ? '<span class="badge var">Varies</span>' : "");
    const hasGeneric = (p) => items.some(q => q.isGeneric && q.platform === p.platform);
    return items.map(p => `
      <tr${p.isGeneric ? ' class="generic"' : hasGeneric(p) ? ' class="named"' : ""}>
        <td><span class="pname">${esc(p.platform)}</span>${p.isGeneric ? " <em>(any)</em>" : ""}</td>
        <td>${p.software && p.software !== "None" ? `<span class="sw ${p.openSource === true ? "oss" : "prop"}">${esc(p.software)}</span>` : ""}</td>
        <td>${p.protocol ? `<span class="proto">${esc(p.protocol)}</span>` : ""}</td>
        <td>${yn(p.openSource)}</td>
        <td>${yn(p.selfHostable)}</td>
        <td><span class="model">${esc(p.structuralModel || "")}</span></td>
      </tr>`).join("");
  },

  // Expected costs (cost_rules.json): a row per platform type, a column per
  // cost category (the table's head names them), each cell its cost value
  "costMatrix": (data) => {
    const cv = { yes: "yes", often: "often", sometimes: "some", rare: "rare", no: "no" };
    const word = (v) => v ? v[0].toUpperCase() + v.slice(1) : "";
    return data.types.map((t, i) => `
      <tr${i % 2 === 0 ? ' class="type-row"' : ""}><td>${esc(t.label)}</td>${data.categories.map(c => `<td>${t.costs[c.id] ? `<span class="cv ${cv[t.costs[c.id]]}">${word(t.costs[c.id])}</span>` : ""}</td>`).join("")}</tr>`).join("");
  },

  // Cost overrides (cost_overrides.json): a row per override, with its
  // value and reason; a client's row is named by its software (e.g. Mastodon).
  // The cost categories' names come from data-labels (cost_rules.json).
  "overrides": (data, el, labelOf) => {
    const cv = { yes: "yes", often: "often", sometimes: "some", rare: "rare", no: "no" };
    const name = (o) => (o.software && !["Proprietary", o.platform].includes(o.software) && /client/i.test(o.platform) ? o.software : o.platform);
    return data.items.flatMap(o => Object.entries(o.overrides).map(([cat, v]) => `
      <tr><td><span class="pname">${esc(name(o))}</span></td><td>${esc(labelOf(cat))}</td>
        <td><span class="cv ${cv[v]}">${esc(v[0].toUpperCase() + v.slice(1))}</span></td><td>${esc(o.reasons?.[cat] || "")}</td></tr>`)).join("");
  },

  // Structural models (platforms.json structuralModels): what each means,
  // with examples: the platforms that use it (a client by its software)
  "models": (data) => data.structuralModels.map(m => {
    const named = data.items.filter(p => !p.isGeneric && p.structuralModel === m.id)
      .map(p => (/client/i.test(p.platform) ? p.software : p.platform));
    const examples = [...new Set(named)];
    return `<tr><td><span class="pname">${esc(m.id)}</span></td><td>${esc(m.description)}</td>
      <td>${esc(examples.slice(0, 5).join(", "))}${examples.length > 5 ? ", …" : ""}</td></tr>`;
  }).join(""),

  // Protocol generics (platforms.json): each generic "(any)" row, its
  // protocol, the named rows of it in the dataset, and other common software
  // (its otherSoftware); the formats' names (data-labels) tell apart
  // generics of the same name
  "protocolGenerics": (data, el, labelOf) => {
    const generics = data.items.filter(p => p.isGeneric);
    const twins = (p) => generics.filter(q => q.platform === p.platform).length > 1;
    return generics.map(g => {
      const named = data.items.filter(p => !p.isGeneric && p.platform === g.platform && p.format === g.format).map(p => p.software);
      return `<tr><td><span class="pname">${esc(g.platform)}</span>${twins(g) ? ` (${esc(labelOf(g.format))})` : ""}</td>
        <td><span class="proto">${esc(g.protocol || "")}</span></td><td>${esc(named.join(", "))}</td><td>${esc((g.otherSoftware || []).join(", "))}</td></tr>`;
    }).join("");
  },

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
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// value_groups.json's rewordings, applied to a value description (the same
// pairs js/data.js rewordFor applies in the editor)
function reword(groups, text) {
  return ((groups && groups.rewordings) || []).reduce((t, [from, to]) => t.split(from).join(to), text);
}

/**
 * The docs' view-mode tables, from js/view-modes.js (what the editor and the
 * server use): each mode's name, what it shows and whether it can be forked
 * (a <tbody>'s rows); and each part of a card and the modes that show it (a
 * whole table's head and body).
 */
export const viewModesBody = ({ MODES }) => MODES.map((m) =>
  `<tr><td class="ref-name">${esc(m.label)}</td><td>${esc(m.description)}</td><td>${m.forkable ? "Yes" : "No"}</td></tr>`).join("");
export function viewFieldsTable({ MODES, FIELDS, FIELD_LABELS, shows }) {
  const row = (name, cells) => `<tr><td class="ref-name">${esc(name)}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  return `<thead><tr><th>Part of the Card</th>${MODES.map((m) => `<th>${esc(m.label)}</th>`).join("")}</tr></thead><tbody>${
    Object.keys(FIELDS).map((f) => row(FIELD_LABELS[f], MODES.map((m) => (shows(f, m.id) ? "Yes" : "–")))).join("")
  }${row("Can be used as a starting point", MODES.map((m) => (m.forkable ? "Yes" : "–")))}</tbody>`;
}

/** The rows' HTML for a table (see the top). */
export async function tableBody(table, load) {
  const renderer = renderers[table.dataset.render || "simple"];
  if (!renderer) throw new Error(`no renderer "${table.dataset.render}"`);
  const names = await Promise.all((table.dataset.labels || "").split(" ").filter(Boolean).map(load));
  const byId = new Map(names.flatMap((n) => n.items || n.tiers || n.categories || []).filter((it) => it.label).map((it) => [it.id, it.label]));
  return renderer(await load(table.dataset.source), table, (id) => byId.get(id) ?? id, names);
}
