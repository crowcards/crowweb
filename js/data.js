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
 * The values: CommunityRule's list (values.json, which may be refreshed from
 * its API) with the CROW team's additions (value_groups.json): each value's
 * group and cues, and a description where CommunityRule's is a placeholder
 * (descriptionDraft: true); values we hide (hidden: true) are left out.
 * → { all, groups, items }
 */
export async function loadValues() {
  const [values, ours] = await Promise.all([loadData("values"), loadData("value_groups")]);
  const extra = new Map(ours.items.map((it) => [it.id, it]));
  const reword = rewordFor(ours);
  return {
    all: ours.all,   // the All tab's name and description
    groups: ours.groups,
    items: values.items.filter((v) => !extra.get(v.id)?.hidden).map((v) => {
      const x = extra.get(v.id);
      const own = { ...v, description: reword(v.description) };
      if (!x) return { ...own, groups: [], group: null, cues: [] };
      return { ...own, ...(x.label ? { label: x.label } : {}), groups: x.groups || [], group: (x.groups || [])[0] ?? null, cues: x.cues || [], ...(x.description ? { description: reword(x.description), descriptionDraft: true } : {}), status: x.status };
    }),
  };
}

/**
 * value_groups.json's rewordings, as a function: a value description with
 * CommunityRule's wording softened ("To us, this means" → "This may mean").
 * Shared with js/docs-reference.js, which applies the same pairs.
 */
export const rewordFor = (ours) => (text = "") => (ours.rewordings || []).reduce((t, [from, to]) => t.replaceAll(from, to), text);

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
