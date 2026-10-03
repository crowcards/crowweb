// The Rules module: where the community's rules live, which shared covenants
// it follows, and which kinds of behavior and content its rules cover.
//
//   const data = await loadRulesData();
//   const form = renderRules(container, card.rules, data, { onInput, onCommit, stateKey });
//   form.collect()   → the rules object to save
//
// ruleData is stored by stable rule id (rule_schema.json):
//   ruleData.<type>.checked    = { "<rule id>": true }
//   ruleData.<type>.qualifiers = { "<rule id>": "<qualifier id>" }   (qualifier types only)

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { suggestField } from "../controls/suggest.js";
import { foldSection } from "../controls/fold.js";

export async function loadRulesData() {
  const [schema, covenants] = await Promise.all([loadData("rule_schema"), loadData("covenants")]);
  return {
    qualifiers: schema.qualifierOptions,
    categories: schema.categories.map((c) => ({ ...c, types: schema.types[c.id] || [] })),
    covenants: covenants.items,
  };
}

/**
 * One rule type, e.g. "Harassment and personal safety": a checklist of its
 * rules. For qualifier types, ticking a rule opens "Allowed / Not allowed / …"
 * underneath it. collect() → { checked, qualifiers } for this type.
 */
function ruleType(type, saved = {}, qualifiers, onCommit) {
  const checked = saved.checked || {};
  const list = renderChoices({
    legend: type.name,
    legendHidden: true,   // the type's heading already says it
    options: type.rules,
    selected: type.rules.filter((r) => checked[r.id]).map((r) => r.id),
    sub: type.qualifier ? { options: qualifiers, values: saved.qualifiers || {}, legend: "allowed or not" } : undefined,
    onChange: onCommit,
  });
  return {
    element: list.element,
    collect: () => {
      const on = list.value();
      return {
        checked: Object.fromEntries(on.map((id) => [id, true])),
        qualifiers: Object.fromEntries(on.map((id) => [id, list.subValue(id)]).filter(([, q]) => q)),
      };
    },
  };
}

export function renderRules(container, rules = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "rules" } = {}) {
  const hooks = { onInput, onCommit };
  const ruleData = rules.ruleData || {};

  // ── where the rules live ──────────────────────────────────
  const link = textField({
    label: "Link to your rules",
    hint: "Where members can read them, e.g. a rules page or pinned post.",
    type: "url",
    placeholder: "https://",
    value: rules.communityRulesLink,
    ...hooks,
  });
  const text = textField({
    label: "Your rules, in your words",
    hint: "Paste them here if you like. The checklists below describe what they cover.",
    multiline: true,
    value: rules.communityRulesText,
    ...hooks,
  });

  // ── covenants and sources: known ones by id, others as typed ──
  const covenantField = (label, hint, values) => suggestField({
    label,
    hint,
    items: data.covenants,
    multiple: true,
    allowCustom: true,
    browse: true,
    values: values || [],
    onCommit,
  });
  const covenants = covenantField("Covenants and guidelines you follow", "Shared codes your community has signed on to. Pick from the list or type your own.", rules.covenants);
  const adapted = covenantField("Adapted from", "Rules or guidelines yours are based on.", rules.adaptedFrom);

  // ── the checklists: one fold per category, one per rule type inside ──
  const types = [];
  const categoryFolds = data.categories.map((cat) => foldSection({
    title: cat.label,
    key: `${stateKey}:${cat.id}`,
    children: [
      el("p", { className: "field-hint", textContent: cat.description }),
      ...cat.types.map((type) => {
        const t = { id: type.id, ...ruleType(type, ruleData[type.id], data.qualifiers, onCommit) };
        types.push(t);
        return foldSection({ title: type.name, key: `${stateKey}:${type.id}`, level: 3, children: [t.element] });
      }),
    ],
  }));

  // where the rules live comes first and is always shown; the checklists fold
  container.replaceChildren(
    el("div", { className: "fields" }, link.element, text.element, covenants.element, adapted.element),
    ...categoryFolds,
  );

  return {
    collect: () => ({
      ...rules,
      communityRulesLink: link.value(),
      communityRulesText: text.value(),
      covenants: covenants.value(),
      adaptedFrom: adapted.value(),
      // every type is written in full, so unticked rules really go away
      ruleData: { ...ruleData, ...Object.fromEntries(types.map((t) => [t.id, t.collect()])) },
    }),
    focusFirst: () => link.focus(),
  };
}
