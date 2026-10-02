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

/** Hash a secret with SHA-256. Returned as hex. */
function hashSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** The empty card shape — schema v0.1. */
function makeEmptyCard(cardId) {
  const now = new Date().toISOString();
  return {
    id: cardId,
    schemaVersion: "0.1",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    visibility: "private",
    forkedFrom: null,

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
      registrationJoining: [],
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
      moderationMaintenance: {
        transparency: null,
        participatory: null,
        approaches: [],
        generalNote: null,
      },
      conflictManagement: {
        approaches: [],
        generalNote: null,
      },
      institutionalChange: {
        approaches: [],
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
      applicable: false,
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
  const cardId = "crd_" + randomId(9);           // e.g. "crd_aB7xK9mPq"
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

  const secretHash = hashSecret(secret);
  const keyDoc = await db.collection("cardKeys").doc(secretHash).get();

  if (!keyDoc.exists || keyDoc.data().cardId !== cardId) {
    // Same error for "wrong secret" and "wrong card ID" to avoid leaking info.
    throw new HttpsError("permission-denied", "Invalid card ID or secret");
  }

  // Touch lastUsedAt (fire-and-forget; don't block the main response).
  keyDoc.ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {});

  const cardRef = db.collection("cards").doc(cardId);
  const cardSnap = await cardRef.get();

  if (!cardSnap.exists) {
    throw new HttpsError("not-found", "Card not found");
  }

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
 * Merge updates into an existing card. Requires the secret.
 * Updates are applied field-by-field (shallow merge of the top-level sections,
 * then deep-merged within each section via Firestore's set-with-merge).
 */
exports.updateCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret, updates } = request.data || {};

  if (!updates || typeof updates !== "object") {
    throw new HttpsError("invalid-argument", "updates object is required");
  }

  // Protect fields the client should never touch.
  const PROTECTED = ["id", "schemaVersion", "createdAt", "forkedFrom"];
  for (const key of PROTECTED) {
    if (key in updates) {
      throw new HttpsError(
        "invalid-argument",
        `Cannot modify protected field: ${key}`
      );
    }
  }

  const { cardRef } = await verifyAndGetCard(cardId, secret);

  const updatesWithTimestamp = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await cardRef.set(updatesWithTimestamp, { merge: true });

  // Return the fresh card so the frontend sees the result.
  const updatedSnap = await cardRef.get();
  return { card: updatedSnap.data() };
});