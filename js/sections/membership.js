// The Membership module: how people join (first how open joining is — one or
// more tiers — then the ways of joining in those tiers), how membership is
// organised (the community's structure: decision-making approaches), and a note.
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
import { sectionMaker } from "../controls/fold.js";
import { pickList } from "../controls/picklist.js";
import { showIf } from "../reveal.js";
import { loadRecommendations, reasonsFor, suggestedBadge } from "../recommend.js";
import { logChanges, logReviewed } from "../structure.js";

export async function loadMembershipData() {
  const [options, tiers, approaches, recs] = await Promise.all([loadData("membership_options"), loadData("membership_tiers"), loadData("decision_approaches"), loadRecommendations()]);
  return { options: options.items, tiers: tiers.tiers, approaches: approaches.items, recs };
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

  // ── joining: tiers first, then the ways of joining in them ──
  const tiers = renderChoices({
    legend: "How people join",
    hint: "Pick one or more. Many communities mix them, e.g. open to anyone, with approval for some roles.",
    layout: "buttons",   // each tier's description shows on hover
    options: data.tiers,
    selected: membership.joiningTiers || [],
    onChange: () => { refreshJoining(); onCommit(); },
  });
  const closedNote = textField({
    label: "About being closed",
    hint: "For example: why, since when, and whether you might open again.",
    multiline: true,
    value: membership.closedNote,
    onInput,
    onCommit,
  });

  // how people join: hidden until a tier (other than Closed) is picked, then
  // it cascades in. The ways of joining in the chosen tiers are shown; "See
  // more" shows the rest (and the hybrid option, which isn't in any tier).
  // Ticked ones always show, as tags above the list that take a note.
  let showAll = false;
  const seeMore = el("button", { type: "button", className: "link-button" });
  seeMore.addEventListener("click", () => { showAll = !showAll; refreshJoining(); });
  const joiningNotes = membership.joiningNotes || {};
  // under the tiers: a note on what to do, then the tags and the list
  const joiningNote = el("div", { className: "callout callout-small" },
    el("p", {}, "Select the more specific ways someone can become a member. Click a tag to add a note about it.",
      ...(reasonsFor(data.recs.membership, values, data.recs.valueLabel).size ? [" ", ...richText("[[Suggested]] tags come from the Values you selected in Basics.")] : [])));
  const joining = pickList({
    legend: "Ways of joining",
    legendHidden: true,
    tagsHint: false,   // (the note above says it)
    options: data.options,
    items: (membership.registrationJoining || []).map((id) => ({ id, note: joiningNotes[id] ?? null })),
    layout: "described",
    filterLabel: "ways of joining",   // searching looks through every way, not only the chosen tiers
    chosenLegend: null,
    emptyText: "None selected yet.",
    noteHint: "How this works in your community (optional).",
    badge: suggested(data.recs.membership),
    before: [joiningNote],
    after: [el("p", {}, seeMore)],
    onInput,
    onCommit,
  });
  const joiningShown = () => tiers.value().some((t) => t !== "closed") || joining.value().length > 0;
  joining.element.hidden = !joiningShown();
  function refreshJoining() {
    const chosen = tiers.value();
    const inTiers = new Set(data.tiers.filter((t) => chosen.includes(t.id)).flatMap((t) => t.options));
    joining.show((id, checked) => showAll || checked || inTiers.has(id));
    const more = data.options.filter((o) => !inTiers.has(o.id)).length;
    seeMore.textContent = showAll ? "Show fewer" : `See more ways to join (${more})`;
    seeMore.hidden = !showAll && !more;
    showIf(closedNote.element, chosen.includes("closed"));
    // first tier picked: how people join cascades in; all unticked (and nothing joined): it goes
    showIf(joining.element, joiningShown());
  }
  refreshJoining();

  // the structure: picked approaches as tags above the list, each taking a
  // note on how it works for membership (Processes keeps its own notes per
  // kind of work)
  const structureNotes = membership.structureNotes || {};
  const structure = pickList({
    legend: "How membership is organised",
    hint: "How decisions get made among members. Select all that apply; you can adjust these again under Processes.",
    options: data.approaches,
    items: (membership.structure || []).map((id) => ({ id, note: structureNotes[id] ?? null })),
    noteHint: "How it works for membership (optional).",
    chosenLegend: null,
    emptyText: "None selected yet.",
    filterLabel: "approaches",
    badge: suggested(data.recs.decision),
    before: fromValues(data.recs.decision),
    onSelect: (ids) => {
      // changed here: logged, and confirmed (so earlier Processes changes count as kept)
      log = logReviewed(logChanges({ structure: current, structureLog: log }, ids, "membership"));
      current = reviewed = ids;   // changed here, so nothing to flag
    },
    onInput,
    onCommit,   // (after onSelect for a tick; also when a note is changed)
  });

  const note = textField({
    label: "Anything else about membership",
    hint: "For example: who can invite people, how long a trial lasts, or what happens when someone leaves.",
    multiline: true,
    value: membership.generalNote,
    onInput,
    onCommit,
  });

  const section = sectionMaker(stateKey);   // each section folds; closed at first, then as the person left it
  container.replaceChildren(
    section("joining", "Joining", tiers, closedNote, joining),
    section("structure", "Structure", structure),
    el("hr", { className: "pixel-divider" }),
    el("div", { className: "fields" }, note.element),
  );

  return {
    collect: () => ({
      ...membership,
      joiningTiers: tiers.value(),
      closedNote: closedNote.value(),   // kept even if Closed is unticked, so re-ticking brings it back
      registrationJoining: joining.value().map((j) => j.id),
      joiningNotes: Object.fromEntries(joining.value().filter((j) => j.note).map((j) => [j.id, j.note])),
      structure: structure.value().map((s) => s.id),
      structureNotes: Object.fromEntries(structure.value().filter((s) => s.note).map((s) => [s.id, s.note])),
      structureReviewed: reviewed,
      structureLog: log,
      generalNote: note.value(),
    }),
    focusFirst: () => {},
  };
}
