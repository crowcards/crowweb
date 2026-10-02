// The auto-save pattern every part of the editor uses.
//
//   const saver = createAutosaver({
//     name: "basics",
//     collect: () => readTheForm(),                 // the part's current data
//     save: (data) => updateCard(id, secret, { basics: data }),
//   });
//   input.addEventListener("input", () => saver.schedule());
//   input.addEventListener("change", () => saver.flush());   // e.g. on leaving a field
//
// - schedule(): something changed; save about a second after the last change
// - flush(): save now (Save button, leaving a field, leaving the page)
// - One save at a time per part. Changes made while a save is in flight are
//   sent right after it, so an older save can never land after a newer one.
// - Network trouble: keep the changes and retry, waiting longer each time.
// - Wrong key, missing card, or the card changed elsewhere: stop saving
//   (retrying can't fix it) until the page sorts it out and calls resume().
// - Every saver's saves go out one at a time, across the whole page, so each
//   one can say which version of the card it's building on.
//
// All savers report into one combined status for the save-status line.

import { errorKind } from "./api.js";

const DELAY = 1000;          // wait this long after the last change
const RETRY_FIRST = 2000;    // first retry after a network error…
const RETRY_MAX = 30000;     // …doubling up to this

const savers = new Set();

// one network save at a time for the whole page
let queue = Promise.resolve();
function oneAtATime(fn) {
  const turn = queue.then(fn);
  queue = turn.catch(() => {});
  return turn;
}
const listeners = new Set();
let lastSavedAt = null;

/**
 * The combined state of every saver, worst first:
 *   "stopped"  — a save was refused; `kind` says why: "no-card", "bad-key"
 *                or "conflict" (changed elsewhere)
 *   "offline"  — the browser says there's no connection; saves wait for it
 *   "retrying" — couldn't reach the server; will try again
 *   "saving"   — a save is in flight
 *   "unsaved"  — changes waiting for their save
 *   "saved"    — everything saved; `at` is when the last save finished
 *   "idle"     — nothing has been changed yet
 */
export function saveStatus() {
  const all = [...savers];
  const stopped = all.find((s) => s.state === "stopped");
  if (stopped) return { state: "stopped", kind: stopped.errorKind };
  if (!navigator.onLine && all.some((s) => s.dirty)) return { state: "offline" };
  if (all.some((s) => s.state === "retrying")) return { state: "retrying" };
  if (all.some((s) => s.state === "saving")) return { state: "saving" };
  if (all.some((s) => s.state === "unsaved")) return { state: "unsaved" };
  return lastSavedAt ? { state: "saved", at: lastSavedAt } : { state: "idle" };
}

/** Call `fn(status)` whenever the combined status changes. */
export function onSaveStatus(fn) {
  listeners.add(fn);
  fn(saveStatus());
  return () => listeners.delete(fn);
}

const notify = () => {
  const status = saveStatus();
  for (const fn of listeners) fn(status);
};

/** Save everything that has unsaved changes, now. Resolves when done. */
export const flushAll = () => Promise.all([...savers].map((s) => s.flush()));

/** True if anything hasn't reached the server yet. */
export const hasUnsaved = () => [...savers].some((s) => s.dirty || s.state === "saving");

/** Forget every saver (e.g. when leaving the editor for another card). */
/** The parts whose saves were refused, e.g. ["basics"]. */
export const stoppedParts = () => [...savers].filter((s) => s.state === "stopped").map((s) => s.name);

/** Start every stopped saver again (see saver.resume). */
export const resumeAll = () => [...savers].forEach((s) => s.resume());

export function resetSavers() {
  for (const s of savers) s.stop();
  savers.clear();
  lastSavedAt = null;
  notify();
}

export function createAutosaver({ name, collect, save, delay = DELAY }) {
  let timer = null;
  let retryWait = RETRY_FIRST;
  let inFlight = null;   // the save currently on its way, if any

  const saver = {
    name,
    state: "idle",
    dirty: false,
    errorKind: null,

    /** Something changed: save shortly, after changes stop for `delay`. */
    schedule() {
      if (saver.state === "stopped") return;
      saver.dirty = true;
      if (saver.state !== "saving" && saver.state !== "retrying") setState("unsaved");
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },

    /** Save now if anything is waiting; resolves once it has gone (or failed). */
    async flush() {
      clearTimeout(timer);
      if (inFlight) await inFlight;     // let the current save finish first
      if (saver.dirty) await run();
    },

    stop() {
      clearTimeout(timer);
      saver.dirty = false;
      setState("idle");
    },

    /** After a refused save has been sorted out: start saving again. */
    resume() {
      if (saver.state !== "stopped") return;
      saver.errorKind = null;
      setState(saver.dirty ? "unsaved" : "saved");
      if (saver.dirty) run();
    },
  };

  function setState(state) {
    saver.state = state;
    notify();
  }

  async function run() {
    clearTimeout(timer);
    if (saver.state === "stopped" || !saver.dirty) return;
    if (inFlight) {
      // a save is already on its way: this one goes right after it
      await inFlight;
      return run();
    }

    saver.dirty = false;
    const data = collect();
    setState("saving");

    inFlight = (async () => {
      try {
        await oneAtATime(() => save(data));
        retryWait = RETRY_FIRST;
        lastSavedAt = new Date();
        setState(saver.dirty ? "unsaved" : "saved");
      } catch (err) {
        console.error(`autosave (${name}):`, err);
        saver.dirty = true;   // nothing reached the server: keep the changes
        const kind = errorKind(err);
        if (kind === "no-card" || kind === "bad-key" || kind === "conflict") {
          saver.errorKind = kind;
          setState("stopped");
        } else {
          setState("retrying");
          timer = setTimeout(run, retryWait);
          retryWait = Math.min(retryWait * 2, RETRY_MAX);
        }
      } finally {
        inFlight = null;
      }
    })();

    await inFlight;
    // changes made during that save: send them now rather than waiting
    if (saver.dirty && saver.state === "unsaved") return run();
  }

  savers.add(saver);
  return saver;
}

// Leaving or hiding the page: send whatever's waiting. (Best effort: the
// browser may not let a save finish once the page is going away, which is
// why the page also warns before closing with unsaved changes.)
addEventListener("pagehide", () => flushAll());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushAll();
});
// The connection dropping or coming back: update the status straight away,
// and on reconnecting save at once instead of waiting for the next retry.
addEventListener("offline", notify);
addEventListener("online", () => {
  notify();
  flushAll();
});
addEventListener("beforeunload", (e) => {
  if (hasUnsaved()) e.preventDefault();
});
