// Which modules a card uses. The built-in list and the starting defaults
// live in data/module_defaults.json; this file reads it and works out a
// card's starting set.

import { loadData } from "./data.js";

/** data/module_defaults.json. */
export const loadModuleDefaults = () => loadData("module_defaults");

/**
 * The starting modules for a card, most specific first: the platform's
 * structural model (e.g. "Federation / Relay"), then the community type,
 * then the default. Returned in the built-in sidebar order.
 */
export function startingModules(defaults, { communityType, structuralModel } = {}) {
  const set = new Set(defaults.byCommunityType[communityType] || defaults.default);

  if (structuralModel) {
    // a mixed model like "Centralized / Federation" applies each part;
    // removals go first so that, where the parts disagree, adding wins
    const rules = String(structuralModel).split("/").map((p) => defaults.byStructuralModel[p.trim()]).filter(Boolean);
    for (const r of rules) for (const id of r.remove || []) set.delete(id);
    for (const r of rules) for (const id of r.add || []) set.add(id);
  }

  return defaults.modules.map((m) => m.id).filter((id) => set.has(id));
}

/**
 * Sidebar entries for a card: Basics first (always on), then each module in
 * card.modules — built-in ones labelled from the defaults file, custom ones
 * from card.customModules.
 */
export function moduleEntries(defaults, card) {
  const builtIn = new Map(defaults.modules.map((m) => [m.id, m]));
  const custom = new Map((card.customModules || []).map((m) => [m.id, m]));
  const entries = [{ id: "basics", label: "Basics", description: "Who your community is: name, type, size, and values." }];
  for (const id of card.modules || []) {
    const m = builtIn.get(id) || custom.get(id);
    if (m) entries.push({ id, label: m.label || m.name, description: m.description, custom: custom.has(id) });
  }
  return entries;
}

/** Same modules, same order? */
export const sameModules = (a = [], b = []) => a.length === b.length && a.every((id, i) => id === b[i]);

let pickerUid = 0;

/**
 * Checkboxes for the built-in modules. `selected` is the card's modules list;
 * custom module ids in it are kept, after the built-in ones. onChange(list)
 * fires with the new list whenever a box is ticked or unticked.
 */
export function renderModulePicker(container, defaults, selected = [], { onChange = () => {} } = {}) {
  const n = pickerUid++;
  const builtInIds = new Set(defaults.modules.map((m) => m.id));
  const custom = selected.filter((id) => !builtInIds.has(id));

  const fieldset = document.createElement("fieldset");
  fieldset.className = "module-picker";
  // the heading above already says "Modules"; the legend is for screen readers
  fieldset.innerHTML = `<legend class="visually-hidden">Modules</legend>`;
  for (const m of defaults.modules) {
    const id = `module-pick-${m.id}-${n}`;
    const row = document.createElement("div");
    row.className = "choice";
    row.innerHTML = `
      <input type="checkbox" id="${id}" value="${m.id}" />
      <label for="${id}"><span class="choice-name"></span><span class="choice-desc"></span></label>
    `;
    row.querySelector(".choice-name").textContent = m.label;
    row.querySelector(".choice-desc").textContent = m.description;
    row.querySelector("input").checked = selected.includes(m.id);
    fieldset.append(row);
  }

  const boxes = [...fieldset.querySelectorAll('input[type="checkbox"]')];
  const value = () => [...boxes.filter((b) => b.checked).map((b) => b.value), ...custom];
  for (const b of boxes) b.addEventListener("change", () => onChange(value()));

  container.replaceChildren(fieldset);
  return {
    value,
    /** Tick exactly these (used when new defaults apply). */
    set(list) {
      for (const b of boxes) b.checked = list.includes(b.value);
    },
  };
}

/**
 * What changing the community type suggests for the modules list.
 *   untouched — the list still matches the old type's defaults, so the new
 *               defaults can simply replace it
 *   next      — the new type's defaults (custom modules kept, at the end)
 *   add / remove — how `next` differs from `current`
 */
export function moduleSuggestion(defaults, current = [], { fromType, toType }) {
  const builtInIds = new Set(defaults.modules.map((m) => m.id));
  const currentBuiltIn = current.filter((id) => builtInIds.has(id));
  const custom = current.filter((id) => !builtInIds.has(id));
  const before = startingModules(defaults, { communityType: fromType });
  const after = startingModules(defaults, { communityType: toType });
  return {
    untouched: sameModules(currentBuiltIn, before),
    next: [...after, ...custom],
    add: after.filter((id) => !current.includes(id)),
    remove: currentBuiltIn.filter((id) => !after.includes(id)),
  };
}
