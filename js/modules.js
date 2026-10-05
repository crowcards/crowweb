// Which modules a card uses. The built-in list and the starting defaults
// live in data/module_defaults.json; this file reads it and works out a
// card's starting set.

import { loadData } from "./data.js";
import { renderChoices } from "./controls/choices.js";
import { el } from "./dom.js";

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

/**
 * Does a part of the card hold anything the person entered? Empty cards are
 * all nulls, empty lists, falses and empty objects, so anything else counts.
 */
export function hasSavedContent(value) {
  if (value == null || value === false || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.values(value).some(hasSavedContent);
  return true;
}

/** Same modules, same order? */
export const sameModules = (a = [], b = []) => a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * Checkboxes for the card's modules: the built-in ones, then any custom ones
 * (`custom`, the card's customModules). `selected` is the card's modules list.
 * onChange(list) fires with the new list whenever a box is ticked or unticked.
 *
 * hasContent(id), if given, says whether a module holds saved answers; an
 * unticked module that does gets a "has saved content" note, so nobody
 * forgets that unticking hides a module's answers rather than deleting them.
 * onAdd, if given, adds an "Add your own module" link (with a pixel plus) under the list.
 */
export function renderModulePicker(container, defaults, selected = [], { custom = [], onChange = () => {}, hasContent = () => false, onAdd } = {}) {
  const options = [
    ...defaults.modules,
    ...custom.map((m) => ({ id: m.id, label: m.name, description: m.description || "Your own module." })),
  ];
  const add = onAdd ? el("button", { type: "button", className: "link-button" }, el("span", { className: "pixel-plus" }), "Add your own module") : null;
  add?.addEventListener("click", () => onAdd());

  const choices = renderChoices({
    legend: "Modules",
    legendHidden: true,   // the heading above already says it
    options,
    selected,
    listClass: "module-picker",
    flag: { text: "Has saved content", show: (id, checked) => !checked && hasContent(id) },
    onChange: (list) => onChange(list),
  });

  container.replaceChildren(choices.element, add ? el("p", {}, add) : "");
  return {
    value: () => choices.value(),
    /** Tick exactly these (used when new defaults apply). */
    set: (list) => choices.set(list),
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
