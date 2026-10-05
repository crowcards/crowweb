// Is this page's code still the deployed code? A tab left open across a
// deploy keeps running the old code, which could save cards in an old shape.
// version.json (stamped on every deploy by scripts/stamp-version.mjs) is
// read when the page opens; isStale() reads it again and compares.
//
//   startFreshness();               // when the page opens
//   if (await isStale()) …          // before saving, on coming back to the tab
//
// Locally (no version.json) or offline, a page never counts as out of date.

const CHECK_EVERY = 60 * 1000;   // between checks while saving (coming back to the tab always checks)

let loaded = null;     // the version this page opened with
let lastCheck = 0;
let stale = false;

const fetchVersion = () => fetch("/version.json", { cache: "no-store" })
  .then((r) => (r.ok ? r.json() : null))
  .then((v) => v?.version ?? null)
  .catch(() => null);

export function startFreshness() {
  loaded = fetchVersion();
  lastCheck = Date.now();
}

/** Has a newer version been deployed since this page opened? `force` skips the wait between checks. */
export async function isStale({ force = false } = {}) {
  if (stale) return true;
  if (!loaded || (!force && Date.now() - lastCheck < CHECK_EVERY)) return false;
  lastCheck = Date.now();
  const [then, now] = await Promise.all([loaded, fetchVersion()]);
  stale = Boolean(then && now && then !== now);
  return stale;
}

/** The error a save throws when the page is out of date (errorKind: "stale"). */
export const staleError = () => Object.assign(new Error("The editor was updated since this page opened"), { code: "stale" });
