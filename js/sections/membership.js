// The Membership module: how people join, how membership is organised
// (the community's structure: decision-making approaches), and a note.
//
//   const data = await loadMembershipData();
//   const form = renderMembership(container, card.membership, data, { onInput, onCommit, stateKey });
//   form.collect()   → the membership object to save
//
// Structure is one shared list: Processes (moderation, maintenance,
// institutional change) shows and edits it too. structureReviewed remembers
// it as last changed here, so changes made from Processes can be flagged.

import { loadData } from "../data.js";
import { el, richText } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";
import { foldSection } from "../controls/fold.js";
import { loadRecommendations, reasonsFor, suggestedBadge } from "../recommend.js";
import { logChanges, logReviewed } from "../structure.js";

export async function loadMembershipData() {
  const [options, approaches, recs] = await Promise.all([loadData("membership_options"), loadData("decision_approaches"), loadRecommendations()]);
  return { options: options.items, approaches: approaches.items, recs };
}

export function renderMembership(container, membership = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "membership", getPart = () => ({}) } = {}) {
  // options the card's values recommend get a "Suggested" chip, and the
  // list says where those come from
  const values = getPart("basics").values || [];
  const suggested = (list) => suggestedBadge(reasonsFor(list, values, data.recs.valueLabel));
  const fromValues = (list) => (reasonsFor(list, values, data.recs.valueLabel).size
    ? [el("div", { className: "callout callout-small" }, el("p", {}, ...richText("[[Suggested]] tags come from the Values you selected in Basics.")))]
    : []);
  let reviewed = membership.structureReviewed || membership.structure || [];
  let log = membership.structureLog || [];
  let current = membership.structure || [];

  const joining = renderChoices({
    legend: "How people join",
    hint: "Tick every way someone can become a member. Many communities combine a few.",
    options: data.options,
    selected: membership.registrationJoining || [],
    badge: suggested(data.recs.membership),
    before: fromValues(data.recs.membership),
    onChange: onCommit,
  });

  const structure = renderChoices({
    legend: "How membership is organised",
    hint: "How decisions get made among members. Tick all that apply; you can adjust these again under Processes.",
    options: data.approaches,
    selected: membership.structure || [],
    layout: "compact",
    filterable: true,
    filterLabel: "approaches",
    listClass: "scroll-list",
    badge: suggested(data.recs.decision),
    before: fromValues(data.recs.decision),
    onChange: (ids) => {
      // changed here: logged, and confirmed (so earlier Processes changes count as kept)
      log = logReviewed(logChanges({ structure: current, structureLog: log }, ids, "membership"));
      current = reviewed = ids;   // changed here, so nothing to flag
      onCommit();
    },
  });

  const note = textField({
    label: "Anything else about membership",
    hint: "For example: who can invite people, how long a trial lasts, or what happens when someone leaves.",
    multiline: true,
    value: membership.generalNote,
    onInput,
    onCommit,
  });

  const section = (name, title, field) => foldSection({
    title,
    key: `${stateKey}:${name}`,
    children: [el("div", { className: "fields" }, field.element)],
  });
  container.replaceChildren(
    section("joining", "Joining", joining),
    section("structure", "Structure", structure),
    el("div", { className: "fields" }, note.element),
  );

  return {
    collect: () => ({
      ...membership,
      registrationJoining: joining.value(),
      structure: structure.value(),
      structureReviewed: reviewed,
      structureLog: log,
      generalNote: note.value(),
    }),
    focusFirst: () => {},
  };
}
