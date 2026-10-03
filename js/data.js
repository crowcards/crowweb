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

/**
 * The protocols named in platforms.json (ActivityPub, AT Protocol, Matrix…),
 * as suggestion items. Shared by Infrastructure's protocol field and
 * Federation's bridged protocols, so both offer the same list.
 */
export async function loadProtocolItems() {
  const { items } = await loadData("platforms");
  const names = [...new Set(items.map((p) => p.protocol).filter((p) => p && p !== "None"))].sort();
  return names.map((name) => ({ id: name, label: name }));
}
