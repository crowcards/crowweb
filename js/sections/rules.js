// The Rules module: where the community's rules live, which shared covenants
// it follows, which kinds of behavior and content its rules cover, and — at
// the bottom — a summary of the ticked rules, where their wording can be
// changed and the community's own rules added.
//
//   const data = await loadRulesData();
//   const form = renderRules(container, card.rules, data, { onInput, onCommit, stateKey });
//   form.collect()   → the rules object to save
//
// The selected rules, by stable rule id (rule_schema.json):
//   selected = [{ id: "<rule id>", qualifier: "<qualifier id>" | null }]   (qualifier: qualifier types only)
// Rewording keeps what the rule originally said, in case the list changes:
//   ruleEdits   = { "<rule id>": { text: "our wording", original: "the list's wording" } }
//   customRules = [{ id, text, typeId, qualifierSet, qualifier }]   (typeId: which kind of rule
//     it is, or null; qualifierSet: "permission" | "requirement" | null, and the chosen qualifier id)
// An unselected rule's qualifier and rewording, and a custom rule's answer on
// the scale it isn't using, are set aside (js/set-aside.js) until they count again.

import { loadData } from "../data.js";
import { el, button } from "../dom.js";
import { textField, selectField } from "../controls/fields.js";
import { renderRows } from "../controls/rows.js";
import { showIf } from "../reveal.js";
import { renderChoices, scaleField } from "../controls/choices.js";
import { suggestField } from "../controls/suggest.js";
import { foldSection } from "../controls/fold.js";
import { asideOf } from "../set-aside.js";

export async function loadRulesData() {
  const [schema, covenants] = await Promise.all([loadData("rule_schema"), loadData("covenants")]);
  return {
    qualifierSets: schema.qualifierSets,
    categories: schema.categories.map((c) => ({ ...c, types: schema.types[c.id] || [] })),
    covenants: covenants.items,
  };
}

/**
 * One rule type, e.g. "Harassment and personal safety": a checklist of its
 * rules. For qualifier types, ticking a rule opens "Allowed / Not allowed / …"
 * underneath it. collect() → [{ id, qualifier }] for this type's selected rules.
 */
/** A qualifier's label (e.g. "Not allowed") from its set ("permission" / "requirement") and id; null if none. */
export const qualifierLabel = (qualifierSets, setId, q) => (q ? (qualifierSets[setId] || []).find((o) => o.id === q)?.label ?? null : null);

/**
 * The card's rules (data: loadRulesData's), by type in the Rules page's order: each type's selected
 * rules (in the community's wording), then the custom rules given that type;
 * custom rules without a type come last, as "Custom rules":
 * [{ id, label, group (the type's name), custom?, qualifier (its label), qualifierId }]
 */
export function cardRules(rules = {}, { categories, qualifierSets = {} }) {
  const ruleTypes = categories.flatMap((c) => c.types);
  const edits = rules.ruleEdits || {};
  const chosen = new Map((rules.selected || []).map((s) => [s.id, s.qualifier ?? null]));
  const own = (rules.customRules || []).filter((r) => r.text);
  const custom = (r, group) => ({ id: r.id, label: r.text, group, custom: true, qualifierId: r.qualifier ?? null, qualifier: qualifierLabel(qualifierSets, r.qualifierSet, r.qualifier) });
  // each type's chosen rules, then the custom rules given that type (custom: true)
  const byType = ruleTypes.flatMap((t) => [
    ...t.rules.filter((r) => chosen.has(r.id)).map((r) => {
      const q = chosen.get(r.id);
      return { id: r.id, label: edits[r.id]?.text || r.label, group: t.name, qualifierId: q, qualifier: qualifierLabel(qualifierSets, r.qualifier || t.qualifier, q) };
    }),
    ...own.filter((r) => r.typeId === t.id).map((r) => custom(r, t.name)),
  ]);
  // custom rules without a type: their own group, last
  const untyped = own.filter((r) => !ruleTypes.some((t) => t.id === r.typeId)).map((r) => custom(r, "Custom rules"));
  return [...byType, ...untyped];
}

// "Select all" picks the strictest answer for rules that take one (unless one's already chosen)
const STRICTEST = { permission: "not_allowed", requirement: "required" };

function ruleType(type, saved, qualifierSets, asideQualifiers, onChange) {
  const mine = saved.filter((s) => type.rules.some((r) => r.id === s.id));
  const takesQualifier = (id) => Boolean(type.qualifier || type.rules.find((r) => r.id === id)?.qualifier);
  const list = renderChoices({
    legend: type.name,
    legendHidden: true,   // the type's heading already says it
    options: type.rules,
    selected: mine.map((s) => s.id),
    // each rule's follow-up uses its own qualifier set, or its type's
    sub: type.qualifier ? {
      options: (rule) => qualifierSets[rule.qualifier || type.qualifier],
      // the saved answers, and those set aside on rules unselected earlier
      values: { ...asideQualifiers, ...Object.fromEntries(mine.filter((s) => s.qualifier).map((s) => [s.id, s.qualifier])) },
      legend: "how your rules treat it",
    } : undefined,
    onChange,
  });
  return {
    element: list.element,
    selectAll: () => {
      const before = new Set(list.value());
      list.set(type.rules.map((r) => r.id));
      for (const r of type.rules) {
        const set = r.qualifier || type.qualifier;
        if (set && (!before.has(r.id) || !list.subValue(r.id))) list.setSub(r.id, STRICTEST[set]);
      }
      onChange();
    },
    clear: () => { list.set([]); onChange(); },
    /** The ticked rules, with the label of the qualifier chosen for each (if any). */
    ticked: () => list.value().map((id) => {
      const rule = type.rules.find((r) => r.id === id);
      return { rule, qualifier: qualifierLabel(qualifierSets, rule.qualifier || type.qualifier, list.subValue(id)) };
    }),
    collect: () => list.value().map((id) => ({ id, qualifier: takesQualifier(id) ? list.subValue(id) || null : null })),
    /** Answers on rules not selected now: { "<rule id>": qualifier }. */
    aside: () => Object.fromEntries(type.rules.filter((r) => takesQualifier(r.id) && !list.value().includes(r.id))
      .map((r) => [r.id, list.subValue(r.id, { evenIfOff: true })]).filter(([, q]) => q)),
  };
}

export function renderRules(container, rules = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "rules", setAside = asideOf() } = {}) {
  const hooks = { onInput, onCommit };
  const selected = rules.selected || [];
  const asideQualifiers = Object.fromEntries(setAside.list("selected:").map((a) => [a.id, a.qualifier]));

  // ── where the rules live ──────────────────────────────────
  const link = textField({
    label: "Link to your rules",
    hint: "Where members can read them, e.g. a rules page or pinned post.",
    type: "url",
    placeholder: "https://",
    value: rules.communityRulesLink,
    ...hooks,
  });
  // ("Your rules, in your words" is set aside for now: it comes back when the
  // app can read rule text and fill in the checklists. Saved text is kept.)

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

  // ── the checklists: a section per category (always open: Behavior,
  // Content), with a fold per rule type inside (closed until opened) ──
  const types = [];
  const categoryFolds = data.categories.map((cat) => foldSection({
    title: cat.label,
    key: `${stateKey}:${cat.id}`,
    foldable: false,
    children: [
      el("p", { className: "field-hint", textContent: cat.description }),
      ...cat.types.map((type) => {
        const t = { id: type.id, type, ...ruleType(type, selected, data.qualifierSets, asideQualifiers, () => { renderSummary(); onCommit(); }) };
        types.push(t);
        return foldSection({
          title: type.name,
          key: `${stateKey}:${type.id}`,
          level: 3,
          actions: [button("Select all", "link-button", t.selectAll), button("Clear", "link-button", t.clear)],
          children: [t.element],
        });
      }),
    ],
  }));

  // ── the summary: what's ticked, in the community's own words ──
  const edits = { ...Object.fromEntries(setAside.list("ruleEdits:").map(({ id, ...edit }) => [id, edit])), ...rules.ruleEdits };   // (rewordings set aside come back with their rule)
  const editing = new Set();   // rules whose wording box is open
  const summaryBody = el("div", { className: "summary" });
  const textOf = (rule) => edits[rule.id]?.text || rule.label;

  function renderSummary() {
    // the community's own rules (those with text): under their type, marked "Custom";
    // those without a type last, as "Custom rules"
    const own = customRules.value().filter((r) => r.text);
    const ownQualifier = (r) => qualifierLabel(data.qualifierSets, r.qualifierSet, r.qualifier);
    const ownItem = (r, marked) => el("li", {},
      el("span", { textContent: r.text }),
      marked ? el("span", { className: "tag tag-soft", textContent: "Custom" }) : null,
      ownQualifier(r) ? el("span", { className: "tag", textContent: ownQualifier(r) }) : null);
    const groups = types.map((t) => ({ type: t.type, ticked: t.ticked(), own: own.filter((r) => r.typeId === t.type.id) }))
      .filter((g) => g.ticked.length || g.own.length);
    const untyped = own.filter((r) => !types.some((t) => t.type.id === r.typeId));
    const count = groups.reduce((n, g) => n + g.ticked.length, 0);
    const reworded = groups.reduce((n, g) => n + g.ticked.filter(({ rule }) => edits[rule.id]).length, 0);
    summaryBody.replaceChildren(
      el("p", { className: "mono-u summary-label", textContent: "Summary" }),
      el("p", { className: "field-hint" }, count || own.length
        ? `${count} ${count === 1 ? "rule" : "rules"} selected${reworded ? `, ${reworded} in your own words` : ""}${own.length ? `, and ${own.length} of your own` : ""}. Change any selected rule’s wording to match how your community says it.`
        : "No rules yet. Select the ones that apply in the lists above, or add your own, and they’ll be listed here."),
      ...groups.flatMap((g) => [
        el("p", { className: "mono-u summary-label rule-summary-type", textContent: g.type.name }),
        el("ul", { className: "rule-summary plain-list" },
          ...g.ticked.map(({ rule, qualifier }) => summaryRule(rule, qualifier)),
          ...g.own.map((r) => ownItem(r, true))),
      ]),
      ...(untyped.length ? [
        el("p", { className: "mono-u summary-label rule-summary-type", textContent: "Custom rules" }),
        el("ul", { className: "rule-summary plain-list" }, ...untyped.map((r) => ownItem(r, false))),
      ] : []),
    );
  }

  /** One ticked rule: its wording and qualifier, or the box to reword it. */
  function summaryRule(rule, qualifier) {
    const li = el("li");
    const reopen = (focus) => {
      li.replaceWith(summaryRule(rule, qualifier));
      if (focus) summaryBody.querySelector(`[data-rule="${rule.id}"] ${focus}`)?.focus();
    };
    li.dataset.rule = rule.id;
    if (editing.has(rule.id)) {
      const wording = textField({
        label: "Your wording",
        hint: `Originally: “${rule.label}”`,
        multiline: true,
        value: textOf(rule),
        onInput: () => {
          const text = wording.value() || "";   // (value() is already trimmed)
          if (text && text !== rule.label) edits[rule.id] = { text, original: rule.label };
          else delete edits[rule.id];
          onInput();
        },
        onCommit,
      });
      li.append(wording.element, el("p", { className: "button-row" },
        button("Done", "button button-small", () => { editing.delete(rule.id); renderSummary(); summaryBody.querySelector(`[data-rule="${rule.id}"] .link-button`)?.focus(); }),
        edits[rule.id] ? button("Back to the original", "link-button", () => { delete edits[rule.id]; editing.delete(rule.id); renderSummary(); onCommit(); }) : null,
      ));
      return li;
    }
    li.append(...[
      el("span", { textContent: textOf(rule) }),
      qualifier ? el("span", { className: "tag", textContent: qualifier }) : null,
      edits[rule.id] ? el("span", { className: "rule-original", textContent: `Originally: “${edits[rule.id].original}”` }) : null,
      button("Change wording", "link-button", () => { editing.add(rule.id); reopen("textarea"); }),
    ].filter(Boolean));
    return li;
  }

  // the community's own rules, each optionally placed with a kind of rule
  const typeOptions = data.categories.flatMap((cat) => cat.types.map((t) => ({ id: t.id, label: `${cat.label}: ${t.name}` })));
  const customRules = renderRows({
    legend: "Custom rules",
    legendHidden: true,   // (the section's heading says it)
    hint: "Rules that aren’t in the lists above.",
    items: rules.customRules || [],
    addLabel: "Add a rule",
    emptyText: "None yet.",
    newItem: () => ({ id: `custom_${Date.now().toString(36)}`, text: "", typeId: null, qualifierSet: null, qualifier: null }),
    itemName: (r) => (r.text ? `“${r.text}”` : "this rule"),
    // folded: the rule, and its qualifier if it has one
    summarize: (r) => (r.text ? [r.text, qualifierLabel(data.qualifierSets, r.qualifierSet, r.qualifier)].filter(Boolean).join(" · ") : ""),
    renderRow: (r, rowHooks) => {
      const ruleText = textField({ label: "Rule", multiline: true, value: r.text, ...rowHooks });
      const kind = selectField({ label: "Kind of rule (optional)", options: typeOptions, value: r.typeId, placeholder: "Not sure / none of these", onChange: rowHooks.onCommit });
      // optional: a qualifier scale, like the listed rules have — pick which
      // scale, then where the rule sits on it (the other scale's answer is set
      // aside, for switching back)
      const asideKey = `customRules:${r.id}`;
      const kept = setAside.get(asideKey) || {};
      const scales = {
        permission: scaleField({ legend: "How your rule treats it", options: data.qualifierSets.permission, value: r.qualifierSet === "permission" ? r.qualifier : kept.permission ?? null, onChange: rowHooks.onCommit }),
        requirement: scaleField({ legend: "How your rule treats it", options: data.qualifierSets.requirement, value: r.qualifierSet === "requirement" ? r.qualifier : kept.requirement ?? null, onChange: rowHooks.onCommit }),
      };
      const showScale = (set) => { for (const [id, f] of Object.entries(scales)) showIf(f.element, id === set); };
      const scaleSet = scaleField({
        legend: "Qualifier (optional)",
        hint: "If your rule allows or requires something, say how.",
        options: [{ id: "permission", label: "Allowed / not allowed" }, { id: "requirement", label: "Required / recommended" }],
        value: r.qualifierSet,
        onChange: (set) => { showScale(set); rowHooks.onCommit(); },
      });
      showScale(r.qualifierSet);
      return {
        element: el("div", {}, ruleText.element, kind.element, scaleSet.element, scales.permission.element, scales.requirement.element),
        collect: () => {
          const set = scaleSet.value();
          return { id: r.id, text: ruleText.value() || "", typeId: kind.value(), qualifierSet: set, qualifier: set ? scales[set].value() : null };
        },
        focus: () => ruleText.focus(),
        setAside: () => {
          const set = scaleSet.value();
          return { [asideKey]: Object.fromEntries(Object.entries(scales).filter(([id]) => id !== set).map(([id, f]) => [id, f.value()])) };
        },
      };
    },
    onInput,   // (the summary catches up when the rule's finished: on commit)
    onCommit: () => { renderSummary(); onCommit(); },
  });

  const summary = foldSection({
    title: "Custom rules",
    key: `${stateKey}:summary`,
    foldable: false,
    children: [el("div", { className: "fields" }, el("div", { className: "rule-summary-own" }, customRules.element), el("hr", { className: "pixel-divider" }), summaryBody)],
  });
  renderSummary();

  // where the rules live comes first and is always shown; the checklists
  // fold; the summary is always open at the bottom
  container.replaceChildren(
    el("div", { className: "fields" }, link.element, covenants.element, adapted.element),
    ...categoryFolds,
    summary,
  );

  // every type is written in full, so unselected rules really go away (rules no longer on the list are kept)
  const selectedNow = () => [
    ...selected.filter((s) => !types.some((t) => t.type.rules.some((r) => r.id === s.id))),
    ...types.flatMap((t) => t.collect()),
  ];
  // rewordings of the selected rules (others are set aside, below)
  const editsFor = (ids, on) => Object.fromEntries(Object.entries(edits).filter(([id]) => ids.has(id) === on));
  return {
    collect: () => {
      const now = selectedNow();
      return {
        ...rules,
        communityRulesLink: link.value(),
        covenants: covenants.value(),
        adaptedFrom: adapted.value(),
        selected: now,
        ruleEdits: editsFor(new Set(now.map((s) => s.id)), true),
        customRules: customRules.value(),
      };
    },
    // set aside: qualifiers and rewordings of rules not selected now (they
    // come back if the rule is selected again), and custom rules' other scale
    setAside: () => ({
      ...Object.fromEntries(types.flatMap((t) => Object.entries(t.aside())).map(([id, qualifier]) => [`selected:${id}`, { qualifier }])),
      ...Object.fromEntries(Object.entries(editsFor(new Set(selectedNow().map((s) => s.id)), false)).map(([id, e]) => [`ruleEdits:${id}`, e])),
      ...customRules.setAside(),
    }),
    focusFirst: () => link.focus(),
  };
}
