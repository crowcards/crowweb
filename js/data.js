// Reads the reference files in /data (community types, values, …), each
// fetched at most once per page.

const cache = new Map();

/** The parsed contents of /data/<name>.json. */
export function loadData(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`/data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`${name}.json: ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(name);
}
