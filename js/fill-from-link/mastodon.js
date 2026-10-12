// Reads a Mastodon server's public information (what any visitor can see,
// no login) into the summary that js/fill-from-link.js turns into card
// answers. Mastodon lets any website read these, so it runs in the browser.
// Checked 2026-10-12 against mastodon.social, social.coop, hachyderm.io,
// fosstodon.org and mastodon.art (Mastodon 4.5 to 4.8).
//
//   const summary = await read(origin, nodeinfo);
//
// The summary keeps everything read, even what doesn't become an answer yet
// (each rule's longer hint, the long About text), for later steps such as a
// language model suggesting more of the card from it.

/** The platform this reads (nodeinfo's software name), and its row in data/platforms.json. */
export const SOFTWARE = "mastodon";
export const LABEL = "Mastodon";   // (for people: "We can fill in answers from Mastodon servers")
export const PLATFORM_ID = "activitypub_client_mastodon";

const get = async (url) => {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};
const optional = (url) => get(url).catch(() => null);   // (a part the server may keep private: blocked servers)
const text = (html) => (html ? new DOMParser().parseFromString(html, "text/html").body.textContent.trim() : "");

/**
 * {
 *   platformId, software: { name, version }, url, aboutUrl,
 *   title, description, activeUsers, totalUsers,
 *   registrations: "open" | "approval" | "off",   // "off": no sign-up form (often invitations, or "apply"); not necessarily closed
 *   rules: [{ text, hint }],
 *   blocks: [{ domain, severity, comment }] | null,   // null: the server doesn't share them
 *   about: string | null,   // the long About page, as text
 * }
 */
export async function read(origin, nodeinfo) {
  // the newer server info (Mastodon 4), or the older one (3.x: other field names)
  const v2 = await optional(`${origin}/api/v2/instance`);
  const v1 = v2 ? null : await get(`${origin}/api/v1/instance`);
  const [rules, blocks, about] = await Promise.all([
    v2?.rules ? Promise.resolve(v2.rules) : optional(`${origin}/api/v1/instance/rules`),
    optional(`${origin}/api/v1/instance/domain_blocks`),
    optional(`${origin}/api/v1/instance/extended_description`),
  ]);
  const reg = v2?.registrations;
  return {
    platformId: PLATFORM_ID,
    software: nodeinfo.software,
    url: origin,
    aboutUrl: `${origin}/about`,
    title: (v2?.title ?? v1?.title ?? "").trim(),
    description: text(v2?.description ?? v1?.short_description ?? v1?.description).replace(/\s+/g, " "),
    activeUsers: v2?.usage?.users?.active_month ?? nodeinfo.usage?.users?.activeMonth ?? null,
    totalUsers: nodeinfo.usage?.users?.total ?? v1?.stats?.user_count ?? null,
    registrations: (reg ? reg.enabled : v1?.registrations ?? nodeinfo.openRegistrations)
      ? ((reg ? reg.approval_required : v1?.approval_required) ? "approval" : "open")
      : "off",
    rules: (rules || []).map((r) => ({ text: r.text?.trim(), hint: r.hint?.trim() || null })).filter((r) => r.text),
    blocks: Array.isArray(blocks) ? blocks.map(({ domain, severity, comment }) => ({ domain, severity, comment: comment || null })) : null,
    about: text(about?.content) || null,
  };
}
