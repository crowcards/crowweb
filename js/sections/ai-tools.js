// The AI Tools module: one block per AI tool or feature the community uses.
// Optional (off until someone selects it). Each block is the same questions,
// in three groups. A choice is one answer, as buttons; Other opens a short
// text box, and External then asks which company. A block folds to its name
// once it has one.
//
//   const form = renderAiTools(container, card.aiTools, {}, { onInput, onCommit, setAside });
//   form.collect()   → { tools: [{ id, name, purpose, … }] }
//   form.setAside()  → Other's text, and the company, when that choice isn't the current one

import { el } from "../dom.js";
import { textField } from "../controls/fields.js";
import { scaleField } from "../controls/choices.js";
import { renderRows } from "../controls/rows.js";
import { showIf } from "../reveal.js";
import { asideOf } from "../set-aside.js";
import { randomId } from "./custom.js";
import {
  AI_PURPOSES, AI_OPERATORS, AI_REVIEWERS, AI_LOCATIONS, AI_PROVIDERS,
} from "../ai-tool-schema.js";

const blankTool = () => ({ id: randomId("ait") });

/**
 * One answer, as buttons, with Other opening a short text box.
 * The box stays in the page when hidden, so its text can be set aside.
 */
function choiceWithOther({ legend, hint, options, value = null, otherValue = null, onInput, onCommit, onChange = () => {} }) {
  const other = textField({
    label: "Other",
    placeholder: "Type your own",
    value: otherValue,
    multiline: false,
    onInput,
    onCommit,
  });
  other.element.classList.add("ai-follow");
  const choice = scaleField({
    legend,
    hint,
    options: [...options, { id: "other", label: "Other" }],
    layout: "buttons",
    value,
    onChange: (v) => {
      showIf(other.element, v === "other");
      onChange(v);
      onCommit();
    },
  });
  other.element.hidden = value !== "other";
  choice.element.append(other.element);
  return { element: choice.element, value: () => choice.value(), other };
}

function renderTool(tool, { onInput, onCommit }, setAside) {
  const id = tool.id || randomId("ait");
  const kept = (key) => setAside.get(`tools:${id}:${key}`);

  const answer = (opts) => textField({ multiline: true, onInput, onCommit, ...opts });
  const name = textField({ label: "AI tool name", multiline: false, value: tool.name, onInput, onCommit });
  const purpose = choiceWithOther({
    legend: "Purpose",
    hint: "What community need does it address?",
    options: AI_PURPOSES,
    value: tool.purpose ?? null,
    otherValue: tool.purpose === "other" ? tool.purposeOther : kept("purposeOther"),
    onInput,
    onCommit,
  });
  const reason = answer({
    label: "Reason for using AI",
    hint: "Why was this approach chosen? What alternatives were considered?",
    value: tool.reason,
  });

  const modelVersion = answer({
    label: "Model version",
    hint: "Which model, and which version?",
    value: tool.modelVersion,
  });
  // built first: where the model runs reveals it when the answer is External
  const company = choiceWithOther({
    legend: "Company",
    hint: "Which company hosts it?",
    options: AI_PROVIDERS,
    value: tool.modelLocation === "external" ? tool.modelProvider ?? null : kept("modelProvider") ?? null,
    otherValue: tool.modelLocation === "external" && tool.modelProvider === "other" ? tool.modelProviderOther : kept("modelProviderOther"),
    onInput,
    onCommit,
  });
  const location = choiceWithOther({
    legend: "Model location",
    hint: "Where does it run?",
    options: AI_LOCATIONS,
    value: tool.modelLocation ?? null,
    otherValue: tool.modelLocation === "other" ? tool.modelLocationOther : kept("modelLocationOther"),
    onInput,
    onCommit,
    onChange: (v) => showIf(company.element, v === "external"),
  });
  company.element.classList.add("ai-follow");
  company.element.hidden = tool.modelLocation !== "external";
  location.element.append(company.element);
  const inputs = answer({
    label: "Inputs",
    hint: "What data enters, and whose?",
    value: tool.inputs,
  });
  const processing = answer({
    label: "Processing",
    hint: "Who receives the data? What happens to the data? Is data retained?",
    value: tool.processing,
  });
  const outputs = answer({
    label: "Outputs",
    hint: "What is produced? Who receives it? What happens next?",
    value: tool.outputs,
  });

  const operation = choiceWithOther({
    legend: "Operation",
    hint: "Who operates it?",
    options: AI_OPERATORS,
    value: tool.operation ?? null,
    otherValue: tool.operation === "other" ? tool.operationOther : kept("operationOther"),
    onInput,
    onCommit,
  });
  const oversight = choiceWithOther({
    legend: "Human oversight",
    hint: "Who reviews outputs?",
    options: AI_REVIEWERS,
    value: tool.oversight ?? null,
    otherValue: tool.oversight === "other" ? tool.oversightOther : kept("oversightOther"),
    onInput,
    onCommit,
  });
  const peopleAffected = answer({
    label: "People affected",
    hint: "Who / what is affected by outputs? What might the impact be?",
    value: tool.peopleAffected,
  });
  const memberChoices = answer({
    label: "Member choices",
    hint: "Is there opt-in/opt-out? How can people raise concerns?",
    value: tool.memberChoices,
  });

  const chosen = (choice) => (choice.value() === "other" ? choice.other.value() : null);
  const collect = () => {
    const place = location.value();
    const provider = place === "external" ? company.value() : null;
    return {
      id,
      name: name.value(),
      purpose: purpose.value(),
      purposeOther: chosen(purpose),
      reason: reason.value(),
      inputs: inputs.value(),
      modelVersion: modelVersion.value(),
      modelLocation: place,
      modelLocationOther: chosen(location),
      modelProvider: provider,
      modelProviderOther: provider === "other" ? company.other.value() : null,
      processing: processing.value(),
      outputs: outputs.value(),
      operation: operation.value(),
      operationOther: chosen(operation),
      oversight: oversight.value(),
      oversightOther: chosen(oversight),
      peopleAffected: peopleAffected.value(),
      memberChoices: memberChoices.value(),
    };
  };

  const groups = [
    ["What you're using and why", [name.element, purpose.element, reason.element]],
    ["How it operates", [modelVersion.element, location.element, inputs.element, processing.element, outputs.element]],
    ["Who is involved", [operation.element, oversight.element, peopleAffected.element, memberChoices.element]],
  ];
  return {
    element: el("div", {}, ...groups.map(([label, fields]) => el("div", { className: "fields" },
      el("p", { className: "mono-u ai-group", textContent: label }),
      ...fields))),
    collect,
    focus: () => name.focus(),
    // set aside: Other's text, and the company, when that isn't the answer now
    setAside: () => ({
      [`tools:${id}:purposeOther`]: purpose.value() === "other" ? null : purpose.other.value(),
      [`tools:${id}:modelLocationOther`]: location.value() === "other" ? null : location.other.value(),
      [`tools:${id}:modelProvider`]: location.value() === "external" ? null : company.value(),
      [`tools:${id}:modelProviderOther`]: location.value() === "external" && company.value() === "other" ? null : company.other.value(),
      [`tools:${id}:operationOther`]: operation.value() === "other" ? null : operation.other.value(),
      [`tools:${id}:oversightOther`]: oversight.value() === "other" ? null : oversight.other.value(),
    }),
  };
}

export function renderAiTools(container, aiTools = {}, _data, { onInput = () => {}, onCommit = () => {}, setAside = asideOf() } = {}) {
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
    renderRow: (tool, rowHooks) => renderTool(tool, rowHooks, setAside),
    onInput,
    onCommit,
  });

  container.replaceChildren(rows.element);
  return {
    collect: () => ({ tools: rows.value() }),
    setAside: () => rows.setAside(),
    focusFirst: () => rows.element.querySelector("input, textarea, button")?.focus(),
  };
}
