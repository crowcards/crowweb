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
import { loadRecommendations, suggestionsFrom, FROM_BASICS } from "../recommend.js";
import { logChanges, logReviewed, structureIds } from "../structure.js";
import { asideOf, picksAside } from "../set-aside.js";

export async function loadMembershipData() {
  const [options, tiers, approaches, recs] = await Promise.all([loadData("membership_options"), loadData("membership_tiers"), loadData("decision_approaches"), loadRecommendations()]);
  return { options: options.items, tiers: tiers.tiers, approaches: approaches.items, recs };
}

export function renderMembership(container, membership = {}, data, { onInput = () => {}, onCommit = () => {}, stateKey = "membership", getPart = () => ({}), setPart = () => {}, setAside = asideOf() } = {}) {
  // options the card's values recommend get a "Suggested" chip, and the
  // list says where those come from
  const recs = suggestionsFrom(data.recs, getPart("basics"));
  const fromBasics = (kind) => (recs.any(kind) ? [el("div", { className: "callout callout-small" }, el("p", {}, ...richText(FROM_BASICS)))] : []);
  const joiningSaved = membership.joining || {};
  let current = structureIds(membership);   // the structure's ids as now (for logging changes made here)

  // ── joining: tiers first, then the ways of joining in them ──
  const tiers = renderChoices({
    legend: "How people join",
    hint: "Pick one or more. Many communities mix them, e.g. open to anyone, with approval for some roles.",
    layout: "buttons",   // each tier's description shows on hover
    options: data.tiers,
    selected: joiningSaved.tiers || [],
    onChange: () => { refreshJoining(); onCommit(); },
  });
  const closedNote = textField({
    label: "About being closed",
    hint: "For example: why, since when, and whether you might open again.",
    multiline: true,
    value: joiningSaved.closedNote ?? setAside.get("joining.closedNote"),   // (set aside while Closed was unselected)
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
  // under the tiers: a note on what to do, then the tags and the list
  const joiningNote = el("div", { className: "callout callout-small" },
    el("p", {}, "Select the more specific ways someone can become a member. Click a tag to add a note about it.",
      ...(recs.any("membership") ? [" ", ...richText(FROM_BASICS)] : [])));
  const joining = pickList({
    legend: "Ways of joining",
    legendHidden: true,
    tagsHint: false,   // (the note above says it)
    options: data.options,
    items: joiningSaved.ways || [],
    remembered: setAside.list("joining.ways:"),   // notes on ways unselected earlier: back if they're selected again
    layout: "described",
    filterLabel: "ways of joining",   // searching looks through every way, not only the chosen tiers
    chosenLegend: null,
    emptyText: "None selected yet.",
    noteHint: "How this works in your community (optional).",
    badge: recs.badge("membership"),
    alike: recs.alike("membership"),
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
  const structure = pickList({
    legend: "How membership is organised",
    hint: "How decisions get made among members. Select all that apply; you can adjust these again under Processes.",
    options: data.approaches,
    items: membership.structure || [],
    remembered: setAside.list("structure:"),   // notes on approaches removed earlier (here or in Processes): back if they're selected again
    noteHint: "How it works for membership (optional).",
    chosenLegend: null,
    emptyText: "None selected yet.",
    filterLabel: "approaches",
    badge: recs.badge("decision"),
    alike: recs.alike("decision"),
    before: fromBasics("decision"),
    onSelect: (ids) => {
      // changed here: logged, and confirmed (so earlier Processes changes count as kept,
      // and nothing is flagged) — in the editor-only part of the card
      const ed = getPart("editor");
      setPart("editor", { ...ed, structureLog: logReviewed(logChanges(ed.structureLog, current, ids, "membership")), structureReviewed: ids });
      current = ids;
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

  const closed = () => tiers.value().includes("closed");
  return {
    collect: () => ({
      ...membership,
      joining: {
        tiers: tiers.value(),
        ways: joining.value(),            // [{ id, note }]
        closedNote: closed() ? closedNote.value() : null,
      },
      structure: structure.value(),       // [{ id, note }]
      generalNote: note.value(),
    }),
    // set aside: the closed note while Closed isn't selected, and notes on unselected ways and approaches
    setAside: () => ({
      "joining.closedNote": closed() ? null : closedNote.value(),
      ...picksAside("joining.ways:", joining.remembered()),
      ...picksAside("structure:", structure.remembered()),
    }),
    focusFirst: () => {},
  };
}
