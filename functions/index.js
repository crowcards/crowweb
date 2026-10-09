// CROW Cards — Cloud Functions
// All backend logic: creating, editing and publishing cards, and reading
// published ones. The browser never reads or writes Firestore directly.
//
// Firestore:
//   cards/{id}                  the card (the private draft), with its `publishing` part
//   cards/{id}/versions/{n}     each published version, in full (private)
//   cardKeys/{sha256(secret)}   which card a secret opens
//   public/{id}                 the published card, as its view mode shows it (getPublicCard)
//   public/{id}/versions/{n}    each version, as the same view mode shows it
//   reports/{auto id}           a report about a published card (reportCard), for the CROW team

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });   // (a view can leave a part undefined: it's just not written)

// A ceiling on how many copies of each function can run at once, so a flood
// of requests can't run up costs (App Check, before launch, does the rest).
setGlobalOptions({ maxInstances: 10 });

// Firestore refuses documents over 1 MiB; refuse a little earlier, with our
// own message, so the editor can say what happened.
const MAX_CARD_BYTES = 900 * 1024;

// What each view mode shows: the editor's own rules (js/view-modes.js) and
// the data they need, so a published card and the editor's preview can't
// disagree. On the emulator they're read from the repo; deployed, from
// functions/shared/, where the deploy copies them (scripts/copy-shared.mjs).
const REPO = path.join(__dirname, "..");
const SHARED = fs.existsSync(path.join(REPO, "js", "view-modes.js")) ? REPO : path.join(__dirname, "shared");
let shared = null;
function loadShared() {
  shared ??= (async () => {
    const viewModes = await import(pathToFileURL(path.join(SHARED, "js", "view-modes.js")).href);
    const json = (name) => JSON.parse(fs.readFileSync(path.join(SHARED, "data", name), "utf8"));
    return { ...viewModes, ruleSchema: json("rule_schema.json"), scales: json("governance_scales.json") };
  })();
  return shared;
}

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
    forkedFrom: null,   // a fork: { cardId, version, name, mode } of the published card it started from (forkCard)

    // Publishing: written only by the publishing functions below, never by
    // the editor's saves.
    publishing: {
      status: "draft",          // "draft" (never published) | "published" | "unpublished"
      mode: "minimal",          // the view mode readers see (js/view-modes.js MODES)
      listed: false,            // true: in the Library (when it exists); false: only by link
      version: 0,               // the latest published version (numbering carries on after unpublishing)
      publishedAt: null,        // when the latest version was published
      fingerprint: null,        // the latest version's contentFingerprint (js/view-modes.js): another one = edits to publish
      credit: null,             // the credit shown now: { name?, organization? } (from attribution, when published / updated)
      hidden: false,            // taken down by the CROW team: can't be published again
      history: [],              // each published version, oldest first: [{ version, publishedAt, note }] (for the editor)
    },

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
      // what the community is, in its own words (each optional; js/sections/basics.js DESCRIPTION)
      description: { purpose: null, culture: null },
      keywords: [],
      // where the community would like to be on the three governance scales
      // (governance_scales.json), 1–7 each; public only in the Full view
      targetScales: { participatory: null, transparent: null, hierarchical: null },
      values: [],       // values.json ids, at most 5
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
      rulesNote: null,          // how the community's rules shape who it federates with
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
      forkModules: null,        // a fork's modules, ticked at set-up (then no longer used)
    },

    // Who shared the card: never public, except the name and organisation
    // when their "show" box is ticked. The email (required to publish) is
    // only for the CROW team, to get in touch about the card.
    attribution: {
      contributorName: null,
      contributorEmail: null,
      organization: null,
      showName: false,
      showOrganization: false,
    },
  };
}

// ─── createCard ──────────────────────────────────────────

/**
 * Create a brand-new empty card.
 * Returns { cardId, secret } — the secret is shown ONCE to the user.
 */
exports.createCard = onCall({ cors: true }, async () => saveNewCard((cardId) => makeEmptyCard(cardId)));

/**
 * Store a new card, made by make(cardId), with a new key. Returns
 * { cardId, secret }: the only time the secret is ever sent.
 */
async function saveNewCard(make) {
  const cardId = "crd_" + randomAlnum(12);       // e.g. "crd_aB7xK9mPq2Zt"
  const secret = randomId(32);                    // ~43 chars

  // Write the card and the key hash in one atomic batch.
  const batch = db.batch();
  batch.set(db.collection("cards").doc(cardId), make(cardId));
  batch.set(db.collection("cardKeys").doc(hashSecret(secret)), {
    cardId,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return { cardId, secret };
}

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
 * (id, schemaVersion, createdAt, updatedAt, forkedFrom, and publishing,
 * which the publishing functions write) can't be written this way.
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

// ─── publishing ──────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Write a card's public copies afresh, for its current view mode: the latest
 * (public/{id}) and every version (public/{id}/versions/{n}), each made from
 * the private full version; copies of versions no longer kept are removed.
 * Inside a transaction (tx), after its reads.
 */
async function writePublic(tx, cardRef, card, versions) {
  const data = await loadShared();
  const { publicView } = data;
  const { mode, listed, version, publishedAt } = card.publishing;
  const publicRef = db.collection("public").doc(card.id);
  const latest = versions.find((v) => v.version === version);
  tx.set(publicRef, {
    id: card.id,
    listed,
    version,
    publishedAt,
    credit: data.creditOf(card.attribution),
    forkedFrom: card.forkedFrom ?? null,
    versions: versions.map((v) => ({ version: v.version, publishedAt: v.publishedAt, note: v.note })),
    ...publicView(latest.card, mode, data),
  });
  for (const v of versions) {
    tx.set(publicRef.collection("versions").doc(String(v.version)), { version: v.version, publishedAt: v.publishedAt, note: v.note, ...publicView(v.card, mode, data) });
  }
}

/** Remove a card's public copies (inside a transaction, after its reads). */
function deletePublic(tx, cardId, publicVersionRefs) {
  for (const ref of publicVersionRefs) tx.delete(ref);
  tx.delete(db.collection("public").doc(cardId));
}

/** A card's private versions, oldest first: [{ version, publishedAt, note, card }]. */
async function readVersions(tx, cardRef) {
  const snap = await tx.get(cardRef.collection("versions").orderBy("version"));
  return snap.docs.map((d) => d.data());
}

/** Check a view mode / listed value from the editor. */
async function checkSettings({ mode, listed }) {
  const { MODES } = await loadShared();
  if (mode !== undefined && !MODES.some((m) => m.id === mode)) throw new HttpsError("invalid-argument", "Not a view mode");
  if (listed !== undefined && typeof listed !== "boolean") throw new HttpsError("invalid-argument", "listed must be true or false");
}

/**
 * Publish the card as it is now, as a new version (v1, v2, …), with the view
 * mode, listed / unlisted and an optional note on what changed. Needs the
 * card's name and type, and the contributor's email. Returns the card's
 * `publishing` part.
 */
exports.publishCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret, mode, listed, note } = request.data || {};
  await checkSettings({ mode, listed });
  if (note != null && (typeof note !== "string" || note.length > 500)) throw new HttpsError("invalid-argument", "The note must be text, up to 500 characters");
  const cardRef = await verifyKey(cardId, secret);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists) throw new HttpsError("not-found", "No card has this ID");
    const card = snap.data();
    const p = card.publishing || {};
    if (p.hidden) throw new HttpsError("permission-denied", "This card was taken down by the CROW team");
    const missing = [
      !card.basics?.name?.trim() && "a community name",
      !card.basics?.type && "a community type",
      !EMAIL.test(card.attribution?.contributorEmail?.trim() || "") && "a contact email",
    ].filter(Boolean);
    if (missing.length) throw new HttpsError("failed-precondition", `To publish, the card needs ${missing.join(", ")}`, { missing });

    const versions = await readVersions(tx, cardRef);
    const { contentFingerprint, creditOf } = await loadShared();
    const now = new Date().toISOString();
    const { editor, publishing, ...full } = card;   // (the editor's own state is never published)
    const version = { version: (p.version || 0) + 1, publishedAt: now, note: note?.trim() || null, card: full };
    const next = {
      ...p,
      status: "published",
      mode: mode ?? p.mode ?? "minimal",
      listed: listed ?? p.listed ?? false,
      version: version.version,
      publishedAt: now,
      fingerprint: contentFingerprint(card),
      credit: creditOf(card.attribution),
      hidden: false,
      history: [...(p.history || []), { version: version.version, publishedAt: now, note: version.note }],
    };
    tx.set(cardRef.collection("versions").doc(String(version.version)), version);
    tx.update(cardRef, { publishing: next });
    await writePublic(tx, cardRef, { ...card, publishing: next }, [...versions, version]);
    return { publishing: next };
  });
});

/**
 * Change a published card's view mode, listed / unlisted and credit (from
 * its attribution), without a new version: its public copies are made again.
 * Returns the card's `publishing` part.
 */
exports.updatePublishing = onCall({ cors: true }, async (request) => {
  const { cardId, secret, mode, listed } = request.data || {};
  await checkSettings({ mode, listed });
  const cardRef = await verifyKey(cardId, secret);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists) throw new HttpsError("not-found", "No card has this ID");
    const card = snap.data();
    const p = card.publishing || {};
    if (p.status !== "published") throw new HttpsError("failed-precondition", "This card isn't published");
    if (p.hidden) throw new HttpsError("permission-denied", "This card was taken down by the CROW team");
    const versions = await readVersions(tx, cardRef);
    const { creditOf } = await loadShared();
    const next = { ...p, mode: mode ?? p.mode, listed: listed ?? p.listed, credit: creditOf(card.attribution) };
    tx.update(cardRef, { publishing: next });
    await writePublic(tx, cardRef, { ...card, publishing: next }, versions);
    return { publishing: next };
  });
});

/**
 * Unpublish: remove every public copy. The private versions are kept, so
 * publishing again carries on numbering, unless deleteHistory: then they're
 * deleted too, and the next publish is v1. Returns the card's `publishing` part.
 */
exports.unpublishCard = onCall({ cors: true }, async (request) => {
  const { cardId, secret, deleteHistory = false } = request.data || {};
  const cardRef = await verifyKey(cardId, secret);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists) throw new HttpsError("not-found", "No card has this ID");
    const p = snap.data().publishing || {};
    const publicVersions = await tx.get(db.collection("public").doc(cardId).collection("versions"));
    const privateVersions = deleteHistory ? await tx.get(cardRef.collection("versions")) : null;
    deletePublic(tx, cardId, publicVersions.docs.map((d) => d.ref));
    for (const d of privateVersions?.docs || []) tx.delete(d.ref);
    const next = deleteHistory
      ? { ...p, status: "draft", version: 0, publishedAt: null, fingerprint: null, credit: null, history: [] }
      : { ...p, status: p.status === "published" ? "unpublished" : p.status };
    tx.update(cardRef, { publishing: next });
    return { publishing: next };
  });
});

// ─── getPublicCard ───────────────────────────────────────

/**
 * Read a published card: no key needed. Returns its public copy (the latest,
 * or `version`): { id, listed, version, publishedAt, credit, forkedFrom,
 * versions, mode, card, rulesCount, scales }, as its view mode shows it.
 * Unpublished, taken-down and unknown cards all give "not-found".
 */
exports.getPublicCard = onCall({ cors: true }, async (request) => {
  const { cardId, version } = request.data || {};
  if (!cardId || typeof cardId !== "string" || !/^crd_[A-Za-z0-9]{1,40}$/.test(cardId)) {
    throw new HttpsError("not-found", "This card isn't available");
  }
  const publicRef = db.collection("public").doc(cardId);
  const snap = await publicRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "This card isn't available");
  const card = snap.data();
  if (version == null || version === card.version) return card;
  const v = await publicRef.collection("versions").doc(String(version)).get();
  if (!v.exists) throw new HttpsError("not-found", "This version isn't available");
  // a past version, with the card's current details (its versions, credit, …)
  return { ...card, ...v.data() };
});

// ─── forkCard ────────────────────────────────────────────

/**
 * Lay what a view shows over an empty card: each part's fields where the
 * view has them, the empty card's where it doesn't (so the fork has the
 * normal shape). Objects with fields of their own are merged field by field;
 * anything else (lists, maps of notes, answers) is taken whole. Fields the
 * empty card doesn't have (e.g. a view's "channelsSpecified") are left out.
 */
function overlay(empty, shown) {
  if (shown === undefined) return empty;
  const isFields = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0;
  if (!isFields(empty) || !shown || typeof shown !== "object" || Array.isArray(shown)) return shown ?? empty;
  return Object.fromEntries(Object.entries(empty).map(([k, v]) => [k, overlay(v, shown[k])]));
}

/**
 * Start a new card from a published one (forking): no key needed. It's made
 * only from the public copy (the latest, or `version`), so it can't contain
 * anything that view leaves out; the rest starts empty, as do the community's
 * name, link and description, attribution and publishing. Below Full (which shares where
 * they'd like to be on the scales), the targets start at the card's scales. Only Foggy, Misty and Full cards
 * can be forked. The new card records forkedFrom { cardId, version, name, mode },
 * and starts at set-up, with the source's modules ticked (editor.forkModules).
 * Returns { cardId, secret }, like createCard.
 */
exports.forkCard = onCall({ cors: true }, async (request) => {
  const { cardId, version } = request.data || {};
  if (!cardId || typeof cardId !== "string" || !/^crd_[A-Za-z0-9]{1,40}$/.test(cardId)) {
    throw new HttpsError("not-found", "This card isn't available");
  }
  const publicRef = db.collection("public").doc(cardId);
  const latest = await publicRef.get();
  if (!latest.exists) throw new HttpsError("not-found", "This card isn't available");
  let pub = latest.data();
  if (version != null && version !== pub.version) {
    const v = await publicRef.collection("versions").doc(String(version)).get();
    if (!v.exists) throw new HttpsError("not-found", "This version isn't available");
    pub = { ...pub, ...v.data() };
  }
  const { MODES } = await loadShared();
  if (!MODES.find((m) => m.id === pub.mode)?.forkable) {
    throw new HttpsError("failed-precondition", "This card can't be forked in its view");
  }

  const shown = pub.card || {};
  return saveNewCard((newId) => {
    const empty = makeEmptyCard(newId);
    const card = Object.fromEntries(Object.entries(empty).map(([part, v]) =>
      [part, ["basics", "infrastructure", "membership", "rules", "processes", "federation", "customModules"].includes(part) ? overlay(v, shown[part]) : v]));
    card.basics = { ...card.basics, name: null, link: null, description: makeEmptyCard(newId).basics.description };   // the source community's own
    // below Full, the view doesn't share where they'd like to be: start from
    // what the card's choices add up to (its scales, public in every view)
    if (!shown.basics?.targetScales) {
      card.basics.targetScales = Object.fromEntries(Object.keys(card.basics.targetScales).map((sc) => [sc, pub.scales?.[sc]?.score ?? null]));
    }
    card.modules = null;   // (set-up first, with the source's modules ticked)
    card.editor = { ...card.editor, forkModules: shown.modules || [] };
    card.forkedFrom = { cardId, version: pub.version, name: shown.basics?.name || null, mode: pub.mode };
    return card;
  });
});

// ─── reportCard ──────────────────────────────────────────

const MAX_OPEN_REPORTS = 20;   // per card: more are refused until the team has looked (rate limits come before launch)

/**
 * Report a published card to the CROW team: no key needed; a reason, or at
 * least a note on what's wrong. Saves
 * reports/{id}: { cardId, version, mode, reason, details, email, createdAt,
 * status: "new" }, read in the Firebase console (see "For the CROW team" in
 * CLAUDE.md). The email is optional, for following up; never shown publicly.
 */
exports.reportCard = onCall({ cors: true }, async (request) => {
  const { cardId, version, reason, details, email } = request.data || {};
  const { REPORT_REASONS } = await loadShared();
  // a reason, or at least a note on what's wrong
  if (reason != null && !REPORT_REASONS.some((r) => r.id === reason)) throw new HttpsError("invalid-argument", "That isn't one of the reasons");
  if (details != null && (typeof details !== "string" || details.length > 1000)) throw new HttpsError("invalid-argument", "Details can be up to 1,000 characters");
  if (!reason && !details?.trim()) throw new HttpsError("invalid-argument", "Choose a reason, or say what’s wrong");
  if (email && (typeof email !== "string" || email.length > 200 || !EMAIL.test(email.trim()))) throw new HttpsError("invalid-argument", "That email doesn't look right");
  if (!cardId || typeof cardId !== "string" || !/^crd_[A-Za-z0-9]{1,40}$/.test(cardId)) throw new HttpsError("not-found", "This card isn't available");
  const pub = await db.collection("public").doc(cardId).get();
  if (!pub.exists) throw new HttpsError("not-found", "This card isn't available");

  const open = await db.collection("reports").where("cardId", "==", cardId).where("status", "==", "new").count().get();
  if (open.data().count >= MAX_OPEN_REPORTS) throw new HttpsError("resource-exhausted", "This card has already been reported; the CROW team will look at it");

  await db.collection("reports").add({
    cardId,
    version: Number.isInteger(version) ? version : pub.data().version,
    mode: pub.data().mode,
    reason: reason || null,
    details: details?.trim() || null,
    email: email?.trim() || null,
    createdAt: new Date().toISOString(),
    status: "new",
  });
  return { ok: true };
});
