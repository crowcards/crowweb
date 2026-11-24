// AI tool choices, and how a tool saved with the first questions (every
// answer was text) becomes the three-section shape. The schema version
// stays 0.3.0. The id is what a card stores; the label is what people see.
// No page code: js/view-modes.js imports this, and so does the server.

export const AI_PURPOSES = [
  { id: "moderation", label: "Moderation" },
  { id: "translation", label: "Translation" },
  { id: "alt_text", label: "Alt-text generation" },
  { id: "search", label: "Search" },
];

/** Who operates the tool. `always` is "Active at all times". */
export const AI_OPERATORS = [
  { id: "user", label: "User" },
  { id: "moderator", label: "Moderator" },
  { id: "administrator", label: "Administrator" },
  { id: "always", label: "Active at all times" },
];

/** Who reviews outputs. `none` is "No human review". */
export const AI_REVIEWERS = [
  { id: "user", label: "User" },
  { id: "moderator", label: "Moderator" },
  { id: "administrator", label: "Administrator" },
  { id: "none", label: "No human review" },
];

export const AI_LOCATIONS = [
  { id: "external", label: "External" },
  { id: "local", label: "Local" },
  { id: "communal", label: "Communal" },
];

/** Which company, when the model location is external. */
export const AI_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "microsoft", label: "Microsoft" },
  { id: "google", label: "Google" },
];

const text = (v) => {
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
};
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Free text from an older card, as one of `options`, or Other with the text kept.
 * A listed id ("moderation") counts too, so a tool already in the new shape
 * isn't rewritten into Other.
 */
export function textAsChoice(value, options) {
  const t = text(value);
  if (!t) return { id: null, other: null };
  const hit = options.find((o) => o.id === t || sameName(o.label, t));
  return hit ? { id: hit.id, other: null } : { id: "other", other: t };
}

/** The words a choice shows: the option's label, or what was typed for Other. */
export function choiceText(options, id, other) {
  if (id == null || String(id).trim() === "") return null;
  if (id === "other") return text(other) || "Other";
  return options.find((o) => o.id === id)?.label || String(id);
}

/** Where the model runs, with the company on the same line when it's external. */
export function modelLocationText(tool = {}) {
  if (!tool.modelLocation) return null;
  if (tool.modelLocation === "external") {
    const company = choiceText(AI_PROVIDERS, tool.modelProvider, tool.modelProviderOther);
    return company ? `External · ${company}` : "External";
  }
  return choiceText(AI_LOCATIONS, tool.modelLocation, tool.modelLocationOther);
}

const filled = (v) => v != null && String(v).trim() !== "";

/** One tool's answers, in card order, the name aside. [{ label, value }] */
export function aiToolRows(tool = {}) {
  const rows = [
    ["Purpose", choiceText(AI_PURPOSES, tool.purpose, tool.purposeOther)],
    ["Reason for using AI", tool.reason],
    ["Model version", tool.modelVersion],
    ["Model location", modelLocationText(tool)],
    ["Inputs", tool.inputs],
    ["Processing", tool.processing],
    ["Outputs", tool.outputs],
    ["Operation", choiceText(AI_OPERATORS, tool.operation, tool.operationOther)],
    ["Human oversight", choiceText(AI_REVIEWERS, tool.oversight, tool.oversightOther)],
    ["People affected", tool.peopleAffected],
    ["Member choices", tool.memberChoices],
  ];
  return rows.filter(([, value]) => filled(value)).map(([label, value]) => ({ label, value: String(value) }));
}

const joinText = (...parts) => {
  const texts = [];
  for (const p of parts) {
    const t = text(p);
    if (t && !texts.some((kept) => kept.includes(t))) texts.push(t);
  }
  return texts.length ? texts.join("\n\n") : null;
};

/** A tool from the first questions: it still has the old text fields, and not modelVersion. */
const LEGACY_TOOL_KEYS = ["model", "activation", "role", "responsibility"];
export const isLegacyAiTool = (tool) =>
  !!tool && typeof tool === "object" && !("modelVersion" in tool) && LEGACY_TOOL_KEYS.some((k) => k in tool);

/**
 * One of those tools, in the three-section shape. Purpose and human oversight
 * become a choice when the old text is that option; otherwise they're kept
 * as Other. The old model answer becomes the model version (where it runs
 * starts empty). The old responsibility answer is kept with member choices.
 * Activation and Role are dropped: no question left to hold them.
 */
export function upgradeAiTool(tool = {}) {
  if (!tool || typeof tool !== "object") return tool;
  const purpose = textAsChoice(tool.purpose, AI_PURPOSES);
  const oversight = textAsChoice(tool.oversight, AI_REVIEWERS);
  return {
    id: tool.id ?? null,
    name: text(tool.name),
    purpose: purpose.id,
    purposeOther: purpose.other,
    reason: text(tool.reason),
    inputs: text(tool.inputs),
    modelVersion: text(tool.model ?? tool.modelVersion),
    modelLocation: tool.modelLocation ?? null,
    modelLocationOther: text(tool.modelLocationOther),
    modelProvider: tool.modelProvider ?? null,
    modelProviderOther: text(tool.modelProviderOther),
    processing: text(tool.processing),
    outputs: text(tool.outputs),
    operation: tool.operation ?? null,
    operationOther: text(tool.operationOther),
    oversight: oversight.id,
    oversightOther: oversight.other,
    peopleAffected: text(tool.peopleAffected),
    memberChoices: joinText(tool.memberChoices, tool.responsibility),
  };
}
