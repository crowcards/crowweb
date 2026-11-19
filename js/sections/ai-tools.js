// The AI Tools module: one block per AI tool or feature the community uses.
// Optional (off until someone selects it). Each block is the same open
// questions, in four groups. A block folds to its name once it has one.
//
//   const form = renderAiTools(container, card.aiTools, {}, { onInput, onCommit });
//   form.collect()   → { tools: [{ id, name, purpose, … }] }

import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { renderRows } from "../controls/rows.js";
import { randomId } from "./custom.js";

/** The questions, in order. `group` is the heading above the first of its set. The name is one line; the rest are open text. */
export const AI_TOOL_QUESTIONS = [
  { group: "What you're using and why", id: "name", label: "AI tool or feature", multiline: false },
  { group: "What you're using and why", id: "purpose", label: "Purpose", hint: "What community need does it address?" },
  { group: "What you're using and why", id: "reason", label: "Reason for using AI", hint: "Why was this approach chosen? What alternatives were considered?" },
  { group: "How it operates", id: "activation", label: "Activation", hint: "When does it run? Is it automatic?" },
  { group: "How it operates", id: "role", label: "Role", hint: "What does it produce? What is outside its scope?" },
  { group: "How it operates", id: "peopleAffected", label: "People affected", hint: "Who uses it? Whose content or experience might be affected?" },
  { group: "What happens to the data", id: "inputs", label: "Inputs", hint: "What data enters, and whose?" },
  { group: "What happens to the data", id: "model", label: "Model", hint: "Which model or provider? Where does it run?" },
  { group: "What happens to the data", id: "processing", label: "Processing", hint: "Who receives the data? Is data retained?" },
  { group: "What happens to the data", id: "outputs", label: "Outputs", hint: "What is produced? Who receives it? What happens next?" },
  { group: "What people can control", id: "oversight", label: "Human oversight", hint: "Who reviews outputs?" },
  { group: "What people can control", id: "memberChoices", label: "Member choices", hint: "Can members decline the feature, exclude their data, or avoid its outputs?" },
  { group: "What people can control", id: "responsibility", label: "Responsibility", hint: "Who operates it? How can members raise concerns?" },
];

const blankTool = () => ({ id: randomId("ait"), ...Object.fromEntries(AI_TOOL_QUESTIONS.map((q) => [q.id, null])) });

export function renderAiTools(container, aiTools = {}, _data, { onInput = () => {}, onCommit = () => {} } = {}) {
  const rows = renderRows({
    legend: "AI tools",
    legendHidden: true,
    hint: "One block per AI tool or feature. Add another for each one this community uses.",
    items: aiTools.tools || [],
    addLabel: "Add another tool",
    emptyText: "None yet.",
    newItem: blankTool,
    itemName: (t) => (t.name ? `“${t.name}”` : "this tool"),
    summarize: (t) => t.name || "",
    renderRow: (tool, rowHooks) => {
      const id = tool.id || randomId("ait");
      const inputs = {};
      const groups = [];
      for (const q of AI_TOOL_QUESTIONS) {
        const field = textField({
          label: q.label,
          hint: q.hint,
          multiline: q.multiline !== false,
          value: tool[q.id],
          ...rowHooks,
        });
        inputs[q.id] = field;
        const last = groups.at(-1);
        if (!last || last.label !== q.group) groups.push({ label: q.group, fields: [field] });
        else last.fields.push(field);
      }
      return {
        element: el("div", {}, ...groups.map((g) => el("div", { className: "fields" },
          el("p", { className: "mono-u ai-group", textContent: g.label }),
          ...g.fields.map((f) => f.element)))),
        collect: () => ({ id, ...Object.fromEntries(AI_TOOL_QUESTIONS.map((q) => [q.id, inputs[q.id].value()])) }),
        focus: () => inputs.name.focus(),
      };
    },
    onInput,
    onCommit,
  });

  container.replaceChildren(rows.element);
  return {
    collect: () => ({ tools: rows.value() }),
    focusFirst: () => rows.element.querySelector("input, textarea, button")?.focus(),
  };
}
