// CROW Cards — Cloud Functions
// All backend logic for creating and editing cards.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

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

/** The empty card shape — schema v0.1.1. */
function makeEmptyCard(cardId) {
  const now = new Date().toISOString();
  return {
    id: cardId,
    schemaVersion: "0.1.1",
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
      communityName: null,
      communityLink: null,
      communityType: null,
      communitySize: null,
      communityKeywords: [],
      values: [],
    },

    infrastructure: {
      platform: {
        type: null,
        platform: null,
        software: null,
        usesProtocol: null,   // true / false / null (not answered); protocol names it when true
        protocol: null,
        openSource: null,
        selfHosted: null,
        structuralModel: null,
      },
      costs: {
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
      additionalSystems: [],
      legalCompliance: {
        serverLocations: [],
        userLocations: [],
        adminTeamLocations: [],
      },
    },

    membership: {
      registrationJoining: [],   // how people join: ids from membership_options.json
      // how membership is organised: ids from decision_approaches.json. One
      // shared list — Processes (moderation, maintenance, institutional
      // change) shows and edits it too.
      structure: [],
      // structure as last seen in Membership, so the editor can flag changes
      // made from Processes ("Keep these changes" / "Undo")
      structureReviewed: [],
      // every change to structure, oldest first: { id, change: "added" | "removed",
      // from: "membership" | "moderation" | "maintenance" | "institutionalChange", at }
      structureLog: [],
      generalNote: null,
    },

    rules: {
      communityRulesLink: null,
      communityRulesText: null,
      covenants: [],
      adaptedFrom: [],
      ruleData: {
        civility:       { checked: {}, qualifiers: {} },
        harassment:     { checked: {}, qualifiers: {} },
        discrimination: { checked: {}, qualifiers: {} },
        authenticity:   { checked: {}, qualifiers: {} },
        spam:           { checked: {}, qualifiers: {} },
        onboarding:     { checked: {}, qualifiers: {} },
        cw:             { checked: {}, qualifiers: {} },
        ai:             { checked: {}, qualifiers: {} },
        nsfw:           { checked: {}, qualifiers: {} },
        illegal:        { checked: {}, qualifiers: {} },
        violence:       { checked: {}, qualifiers: {} },
      },
    },

    processes: {
      // moderation and maintenance each: 1–5 scales, plus a note per
      // structure approach on how it's used for this work ({ "<approach id>": "…" })
      moderation: {
        transparency: null,
        participatory: null,
        approachNotes: {},
        generalNote: null,
      },
      maintenance: {
        transparency: null,
        participatory: null,
        approachNotes: {},
        generalNote: null,
      },
      conflictManagement: {
        approaches: [],
        generalNote: null,
      },
      institutionalChange: {
        approachNotes: {},   // notes on how structure approaches are used to change the rules
        generalNote: null,
      },
      communications: {
        channels: {
          announcementFeed: false,
          feedbackForm: false,
          publicContactInfo: false,
          listserv: false,
          groupChat: false,
          dedicatedAdminAccount: false,
        },
        customChannels: [],
      },
    },

    federation: {
      approach: null,
      responseLadder: [],
      subscriptions: {
        subscribedLists: [],
        customAllowList: [],
        customDenyList: [],
        customBlockList: [],
      },
      bridging: {
        enabled: false,
        protocols: [],
      },
    },

    customModules: [],

    // Ids of editor suggestions ("add the Federation module?") the people
    // editing this card have dismissed. Editor-only: not for public views.
    dismissedSuggestions: [],

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
 * Verify a secret for a given card ID.
 * Returns the card document reference if valid; throws HttpsError if not.
 */
async function verifyAndGetCard(cardId, secret) {
  if (!cardId || typeof cardId !== "string") {
    throw new HttpsError("invalid-argument", "cardId is required");
  }
  if (!secret || typeof secret !== "string") {
    throw new HttpsError("invalid-argument", "secret is required");
  }

  // Card first, so a typo in the ID gets its own message. Card IDs aren't
  // secret (published cards show them), and knowing one exists doesn't help
  // anyone guess its 256-bit secret.
  const cardRef = db.collection("cards").doc(cardId);
  const cardSnap = await cardRef.get();

  if (!cardSnap.exists) {
    throw new HttpsError("not-found", "No card has this ID");
  }

  const secretHash = hashSecret(secret);
  const keyDoc = await db.collection("cardKeys").doc(secretHash).get();

  if (!keyDoc.exists || keyDoc.data().cardId !== cardId) {
    throw new HttpsError("permission-denied", "This secret doesn't match this card");
  }

  // Touch lastUsedAt (fire-and-forget; don't block the main response).
  keyDoc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});

  return { cardRef, cardData: cardSnap.data() };
}

// ─── getCard ─────────────────────────────────────────────

/**
 * Fetch a card by ID. Requires the secret to prove ownership.
 */
exports.getCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret } = request.data || {};
  const { cardData } = await verifyAndGetCard(cardId, secret);
  return { card: cardData };
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
  "dismissedSuggestions",
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
  const { cardId, secret, updates, ifUpdatedAt } = request.data || {};

  if (!updates || typeof updates !== "object") {
    throw new HttpsError("invalid-argument", "updates object is required");
  }

  for (const key of Object.keys(updates)) {
    if (!EDITABLE_PARTS.includes(key)) {
      throw new HttpsError("invalid-argument", `Not an editable part of a card: ${key}`);
    }
  }

  const { cardRef } = await verifyAndGetCard(cardId, secret);

  const updatedAt = await db.runTransaction(async (tx) => {
    const snap = await tx.get(cardRef);
    const current = snap.data();

    if (ifUpdatedAt && current.updatedAt !== ifUpdatedAt) {
      throw new HttpsError(
        "failed-precondition",
        "This card was changed somewhere else since you loaded it",
        { updatedAt: current.updatedAt }
      );
    }

    const now = new Date().toISOString();
    // mergeFields: replace exactly these top-level fields, leave the rest
    tx.set(cardRef, { ...updates, updatedAt: now }, { mergeFields: [...Object.keys(updates), "updatedAt"] });
    return now;
  });

  // Return the fresh card so the frontend sees the result, plus this save's
  // own timestamp: the version the editor should send with its next save
  // (the re-read could already include someone else's later save).
  const updatedSnap = await cardRef.get();
  return { card: updatedSnap.data(), updatedAt };
});
