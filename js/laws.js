// Laws a community may want to know about, given where its servers, members
// and admins are. Shared by the editor (Infrastructure → Locations) and the
// laws page (laws.html?codes=US,EU), so the note and the matching live here.
//
//   lawsFor(["DE"], laws.items, countries)   → the EU's laws too (Germany is in the EU)
//   lawsPageUrl(["US", "EU"])                → "laws.html?codes=US,EU"

export const LAWS_NOTE = "Note that you may be held responsible to regional/local regulation when operating a platform. Broadly, there are a few kinds of laws to keep in mind: copyright/IP, online safety + content moderation, data privacy & security. Given the locations you’ve selected, we’ve collated some landmark laws that you may want to be aware of. This is strictly an informational resource - you should do your due diligence to check for other responsibilities (including laws that may not fall cleanly under the categories we’ve flagged above)!";

export const lawsPageUrl = (codes) => `laws.html?codes=${codes.map(encodeURIComponent).join(",")}`;

/**
 * The laws that apply to any of these places (countries.json codes). A
 * country also matches its regions' laws (Germany → EU), a region also
 * matches its member countries' laws (EU → each member's), and Worldwide
 * matches everything.
 */
export function lawsFor(codes, laws, countries) {
  if (codes.includes("WORLDWIDE")) return laws;
  const places = new Set(codes);
  for (const r of countries.regions) {
    if (codes.includes(r.id)) (r.members || []).forEach((m) => places.add(m));
    if ((r.members || []).some((m) => codes.includes(m))) places.add(r.id);
  }
  return laws.filter((law) => law.appliesTo.some((c) => places.has(c)));
}
