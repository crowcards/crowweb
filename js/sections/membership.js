// The Membership module: how people join, plus a note for anything else.
//
//   const data = await loadMembershipData();
//   const form = renderMembership(container, card.membership, data, { onInput, onCommit });
//   form.collect()   → the membership object to save

import { loadData } from "../data.js";
import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderChoices } from "../controls/choices.js";

export async function loadMembershipData() {
  const options = await loadData("membership_options");
  return { options: options.items };
}

export function renderMembership(container, membership = {}, data, { onInput = () => {}, onCommit = () => {} } = {}) {
  const joining = renderChoices({
    legend: "How people join",
    hint: "Tick every way someone can become a member. Many communities combine a few.",
    options: data.options,
    selected: membership.registrationJoining || [],
    onChange: onCommit,
  });

  const note = textField({
    label: "Anything else about membership",
    hint: "For example: who can invite people, how long a trial lasts, or what happens when someone leaves.",
    multiline: true,
    value: membership.generalNote,
    onInput,
    onCommit,
  });

  container.replaceChildren(el("div", { className: "fields" }, joining.element, note.element));

  return {
    collect: () => ({
      ...membership,
      registrationJoining: joining.value(),
      generalNote: note.value(),
    }),
    focusFirst: () => {},
  };
}
