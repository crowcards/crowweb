// Laws a community may want to know about, given where its servers, members
// and admins are. Shared by the editor (Infrastructure → Locations) and the
// laws page (laws.html?codes=US,EU), so the note and the matching live here.
//
//   lawsNote()                               → the not-legal-advice note, as nodes
//   lawsNote("2026-10")                      → … with when the list was last updated
//   lawsFor(["DE"], laws.items, countries)   → the EU's laws too (Germany is in the EU)
//   lawsByPlace(["US", "DE"], …)             → [{ jurisdiction: "United States", laws }, { jurisdiction: "EU", laws }, …]
//   lawsPageUrl(["US", "EU"])                → "laws.html?codes=US,EU"

import { el } from "./dom.js";

/** The note shown with the laws, everywhere; updatedAt ("2026-10", laws.json's) adds when the list was last updated. */
export function lawsNote(updatedAt) {
  const when = updatedAt && new Date(`${updatedAt}-15`).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  return [
    el("b", { textContent: "This is not legal advice." }),
    " It’s a list of some prominent laws you may want to be aware of. Look each one up to check whether it applies to your community. The list isn’t complete and isn’t always up to date",
    ...(when ? [": it was last updated in ", el("b", { textContent: when }), "."] : ["."]),
  ];
}

export const lawsPageUrl = (codes) => `/laws?codes=${codes.map(encodeURIComponent).join(",")}`;

/**
 * The laws that apply to any of these places (countries.json codes). A
 * country also matches its regions' laws (Germany → EU), a region also
 * matches its member countries' laws (EU → each member's), and Worldwide
 * matches everything.
 */
export function lawsFor(codes, laws, countries) {
  if (codes.includes("WORLDWIDE")) return laws;
  const places = new Set(codes.flatMap((c) => [...around(c, countries)]));
  return laws.filter((law) => law.appliesTo.some((c) => places.has(c)));
}

/**
 * lawsFor's laws, each once, grouped by where they're from (a law's
 * jurisdiction): the groups in the order of the places given (a group goes
 * where the first place it applies to is; with Worldwide, the rest follow),
 * the laws as they come in laws.json.
 */
export function lawsByPlace(codes, laws, countries) {
  const near = codes.filter((c) => c !== "WORLDWIDE").map((c) => around(c, countries));
  const rank = (law) => {
    const i = near.findIndex((places) => law.appliesTo.some((c) => places.has(c)));
    return i < 0 ? Infinity : i;
  };
  const groups = new Map();
  for (const law of lawsFor(codes, laws, countries)) {
    const g = groups.get(law.jurisdiction) || { jurisdiction: law.jurisdiction, rank: Infinity, laws: [] };
    g.rank = Math.min(g.rank, rank(law));
    g.laws.push(law);
    groups.set(law.jurisdiction, g);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank);   // (ties keep laws.json's order)
}

/** A place's code with what it's part of or made of (Germany → DE, EU; the EU → EU and its members). */
function around(code, countries) {
  const places = new Set([code]);
  for (const r of countries.regions) {
    if (r.id === code) (r.members || []).forEach((m) => places.add(m));
    if ((r.members || []).includes(code)) places.add(r.id);
  }
  return places;
}
