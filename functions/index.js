// CROW Cards — Cloud Functions
// All backend logic for creating and editing cards.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

// A ceiling on how many copies of each function can run at once, so a flood
// of requests can't run up costs (App Check, before launch, does the rest).
setGlobalOptions({ maxInstances: 10 });

// Firestore refuses documents over 1 MiB; refuse a little earlier, with our
// own message, so the editor can say what happened.
const MAX_CARD_BYTES = 900 * 1024;

// ─── helpers ─────────────────────────────────────────────

/** Generate a URL-safe random ID of a given length. */
function randomId(bytes = 9) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Generate a letters-and-digits-only ID (no "-" or "_"), so double-clicking
 * selects the whole thing. Each character is picked uniformly at random.
 */
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function randomAlnum(length = 12) {
  let out = "";
  for (let i = 0; i < length; i++) out += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return out;
}

/** Hash a secret with SHA-256. Returned as hex. */
function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** The empty card shape — schema v0.1.0. */
function makeEmptyCard(cardId) {
  const now = new Date().toISOString();
  return {
    id: cardId,
    schemaVersion: "0.1.0",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    visibility: "private",
    forkedFrom: null,

    // Modules this card uses, in sidebar order: built-in ids from
    // data/module_defaults.json plus customModules ids. Basics is always on
    // and not listed. null until the person picks them while setting up the
    // card (null = not set up yet; [] = chose none).
    modules: null,

    basics: {
      name: null,
      link: null,
      type: null,       // community_types.json id
      size: null,       // enums.json communitySize id
      keywords: [],
      values: [],       // values.json ids
    },

    // Conventions: a choice that's listed or typed in is stored as the
    // listed item's id, or the typed text. A yes / no answer is "yes", "no"
    // (sometimes "varies") or null for not answered. A list a module owns,
    // with notes, is [{ id, note }]; notes on something another module owns
    // are a map { "<id>": "note" }.

    infrastructure: {
      platform: {
        type: null,             // cost_rules.json platform type id
        platform: null,         // platforms.json id, or typed text
        software: null,
        usesProtocol: null,     // "yes" | "no" | null; protocol names it when "yes"
        protocol: null,
        openSource: null,       // "yes" | "no" | "varies" | null
        selfHosted: null,       // "yes" | "no" | "varies" | null
        structuralModel: null,
      },
      costs: {                  // each: an enums.json costValues id, or null
        hostingServers: null,
        mediaStorage: null,
        domain: null,
        emailDelivery: null,
        paidSoftware: null,
        managedHostingServices: null,
        backupsDisasterRecovery: null,
        adminModLabor: null,
        thirdPartyTrustSafetyTools: null,
        legalCompliance: null,
        inPersonEvents: null,
      },
      tools: [],                // [{ tool, category, usedFor }]: tool = tools.json id or typed name; category = a tools.json category id
      locations: {              // countries.json codes (countries and regions)
        servers: [],
        members: [],
        adminTeam: [],
      },
    },

    membership: {
      joining: {
        tiers: [],              // membership_tiers.json ids: how open joining is
        ways: [],               // [{ id, note }]: membership_options.json ids
        closedNote: null,       // when "closed" is one of the tiers: why, since when, …
      },
      // how decisions get made: [{ id, note }], decision_approaches.json ids.
      // One shared list: Processes shows and edits it too (with its own notes).
      structure: [],
      generalNote: null,
    },

    rules: {
      communityRulesLink: null,
      communityRulesText: null,
      covenants: [],            // covenants.json ids, or typed names
      adaptedFrom: [],          // the same
      selected: [],             // [{ id, qualifier }]: rule_schema.json rule ids; qualifier = a qualifier id, or null
      ruleEdits: {},            // { "<rule id>": { text, original } }: selected rules reworded (an unselected one's is set aside)
      customRules: [],          // [{ id, text, typeId, qualifierSet, qualifier }]: the community's own rules
    },

    processes: {
      // each: notes on how the structure's approaches are used for this work
      // ({ "<approach id>": "note" }, as the structure is Membership's), and a general note
      institutionalChange: { approachNotes: {}, generalNote: null },   // the "Change" tab
      maintenance: { approachNotes: {}, generalNote: null },
      moderation: { approachNotes: {}, generalNote: null },
      conflictManagement: {
        approaches: [],         // [{ id, note, stage, primary }]: conflict_management.json ids; steps in order; several on one step = in parallel
        generalNote: null,
      },
      communications: {
        channels: [],           // enums.json communicationChannels ids
        customChannels: [],     // [{ name, description }]
      },
    },

    federation: {
      approach: null,           // enums.json federationApproach id
      allowlistPolicy: null,    // with an allowlist: how servers get added, and how to ask
      responseLadder: [],       // [{ id, note, stage }]: enums.json federationResponseLadder ids; steps in order; several on one step = in parallel
      subscriptions: {
        subscribedLists: [],    // federation_subscription_lists.json ids, or typed names
        sharesBlocklist: null,  // "yes" | "no" | null
        blocklistLink: null,    // only while sharesBlocklist is "yes" (set aside otherwise)
        decisionTools: [],      // federation_subscription_lists.json tool / service ids, or typed names
      },
      relevantRules: [],        // ids of the card's rules (or custom rules) that guide federation decisions
      ruleNotes: {},            // { "<rule id>": "note" }: how a rule guides federation decisions
      bridging: {
        bridges: null,          // "yes" | "no" | null
        protocols: [],          // protocol names (from platforms.json, or typed); only while bridges is "yes"
      },
    },

    // [{ id, name, description, fields: [{ id, label, type: "text" | "checkbox" | "radio" | "scale", value, options?, low?, high? }] }]
    customModules: [],

    // Editor-only state: helps the editor, never shown publicly or exported.
    editor: {
      costsPrefill: null,       // what Infrastructure's costs were pre-filled from: { platformName, typeId, costs }
      structureReviewed: [],    // the structure's ids as last confirmed in Membership (to flag changes from Processes)
      structureLog: [],         // every change to the structure, oldest first: { id, change: "added" | "removed" | "reviewed", from, at }
      dismissedSuggestions: [], // ids of editor suggestions dismissed
      // answers set aside: entered, then switched away from (an item
      // unselected, Yes changed to No, a field's kind changed), kept here so
      // they come back if the person switches back; the modules above hold
      // only what's true now. { "<part>.<key>": value }, e.g.
      // "membership.joining.closedNote", "membership.joining.ways:<id>": { note }
      // (see js/set-aside.js)
      setAside: {},
    },

    attribution: {
      contributorName: null,
      contributorEmail: null,
      organization: null,
    },
  };
}

// ─── createCard ──────────────────────────────────────────

/**
 * Create a brand-new empty card.
 * Returns { cardId, secret } — the secret is shown ONCE to the user.
 */
exports.createCard = onCall({ cors: true }, async (request) => {
  const cardId = "crd_" + randomAlnum(12);       // e.g. "crd_aB7xK9mPq2Zt"
  const secret = randomId(32);                    // ~43 chars
  const secretHash = hashSecret(secret);

  const card = makeEmptyCard(cardId);

  // Write the card and the key hash in one atomic batch.
  const batch = db.batch();
  batch.set(db.collection("cards").doc(cardId), card);
  batch.set(db.collection("cardKeys").doc(secretHash), {
    cardId,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return { cardId, secret };
});

// ─── auth helper ─────────────────────────────────────────

/**
 * Check a secret against a card ID: the key (one read) must exist and belong
 * to this card. Only when it doesn't is the card itself looked up, so a typo
 * in the ID ("not-found") gets a different message from a wrong secret
 * ("permission-denied"). Card IDs aren't secret (published cards show them),
 * and knowing one exists doesn't help anyone guess its 256-bit secret.
 * Returns the card's document reference.
 */
async function verifyKey(cardId, secret) {
  if (!cardId || typeof cardId !== "string") {
    throw new HttpsError("invalid-argument", "cardId is required");
  }
  if (!secret || typeof secret !== "string") {
    throw new HttpsError("invalid-argument", "secret is required");
  }

  const cardRef = db.collection("cards").doc(cardId);
  const keyDoc = await db.collection("cardKeys").doc(hashSecret(secret)).get();

  if (!keyDoc.exists || keyDoc.data().cardId !== cardId) {
    if (!(await cardRef.get()).exists) throw new HttpsError("not-found", "No card has this ID");
    throw new HttpsError("permission-denied", "This secret doesn't match this card");
  }

  // Note when the key was last used (at most once a day; fire-and-forget).
  const lastUsed = keyDoc.data().lastUsedAt?.toMillis?.() ?? 0;
  if (Date.now() - lastUsed > 24 * 60 * 60 * 1000) {
    keyDoc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});
  }

  return cardRef;
}

// ─── getCard ─────────────────────────────────────────────

/**
 * Fetch a card by ID. Requires the secret to prove ownership.
 */
exports.getCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret } = request.data || {};
  const snap = await (await verifyKey(cardId, secret)).get();
  if (!snap.exists) throw new HttpsError("not-found", "No card has this ID");
  return { card: snap.data() };
});

// ─── updateCard ──────────────────────────────────────────

/**
 * The parts of a card the editor may write. Each update sends whole parts,
 * and each part sent replaces what was stored (so unticking a rule, or
 * removing a key from any nested object, really removes it). Everything else
 * (id, schemaVersion, createdAt, updatedAt, forkedFrom, and for now status
 * and visibility, which publishing will handle) can't be written this way.
 */
const EDITABLE_PARTS = [
  "modules",
  "basics",
  "infrastructure",
  "membership",
  "rules",
  "processes",
  "federation",
  "customModules",
  "attribution",
  "editor",
];

/**
 * Update parts of an existing card, e.g. { basics: {...} }. Requires the
 * secret. Each part given replaces that part entirely; parts not given are
 * left alone.
 *
 * Optional `ifUpdatedAt`: the card's `updatedAt` as the editor last saw it.
 * If the card has changed since (another tab, device or person saved), the
 * update is refused with "failed-precondition" instead of overwriting their
 * work. The check and the write happen in one transaction, so two saves
 * can't both pass the check.
 */
exports.updateCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret, ifUpdatedAt } = request.data || {};
  const reset = request.data?.reset ?? [];   // (null when not given, from the browser)
  let { updates } = request.data || {};

  // reset: parts to put back as they are on a new, empty card (the editor's
  // Reset). They're defined here, by makeEmptyCard, so "empty" means one thing.
  if (!Array.isArray(reset) || reset.some((p) => !EDITABLE_PARTS.includes(p))) {
    throw new HttpsError("invalid-argument", "reset must be a list of editable parts");
  }
  if (reset.length) {
    const empty = makeEmptyCard(cardId);
    updates = { ...(updates || {}), ...Object.fromEntries(reset.map((p) => [p, empty[p]])) };
  }

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new HttpsError("invalid-argument", "updates object is required");
  }

  // each part: an editable one, of the same kind as on a new card (a list
  // stays a list, an object an object; modules can also be null)
  const empty = makeEmptyCard(cardId);
  const kind = (v) => (v === null ? "null" : Array.isArray(v) ? "list" : typeof v);
  for (const [key, value] of Object.entries(updates)) {
    if (!EDITABLE_PARTS.includes(key)) {
      throw new HttpsError("invalid-argument", `Not an editable part of a card: ${key}`);
    }
    const expected = key === "modules" ? ["list", "null"] : [kind(empty[key])];
    if (!expected.includes(kind(value))) {
      const named = { list: "a list", object: "an object", null: "null" };
      throw new HttpsError("invalid-argument", `${key} must be ${expected.map((k) => named[k]).join(" or ")}`);
    }
  }

  const cardRef = await verifyKey(cardId, secret);

  const { card, updatedAt } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists) throw new HttpsError("not-found", "No card has this ID");
    const current = snap.data();

    if (ifUpdatedAt && current.updatedAt !== ifUpdatedAt) {
      throw new HttpsError(
        "failed-precondition",
        "This card was changed somewhere else since you loaded it",
        { updatedAt: current.updatedAt }
      );
    }

    const now = new Date().toISOString();
    const next = { ...current, ...updates, updatedAt: now };
    if (Buffer.byteLength(JSON.stringify(next)) > MAX_CARD_BYTES) {
      throw new HttpsError("resource-exhausted", "This card is too big to save");
    }
    // mergeFields: replace exactly these top-level fields, leave the rest
    tx.set(cardRef, { ...updates, updatedAt: now }, { mergeFields: [...Object.keys(updates), "updatedAt"] });
    return { card: next, updatedAt: now };
  });

  // This save's timestamp: the version the editor sends with its next save.
  // The whole card comes back only after a reset (the editor redraws from
  // it); an ordinary save already has it.
  return reset.length ? { card, updatedAt } : { updatedAt };
});
