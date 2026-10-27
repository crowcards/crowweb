// The laws page (laws.html?codes=US,EU): the prominent laws for the places
// given, each once, grouped by where they're from, with their categories as pills. Opened from the editor's Infrastructure →
// Locations, in a new tab. The data is data/laws.json.

import { loadData } from "./data.js";
import { el, button, cutWithMore } from "./dom.js";
import { lawsNote, lawsByPlace } from "./laws.js";

const main = document.getElementById("laws");
const codes = (new URLSearchParams(location.search).get("codes") || "").split(",").map((c) => c.trim()).filter(Boolean);

// the note comes first, whatever happens next (when the list was last
// updated is added once it's loaded)
const note = el("p", {}, ...lawsNote());
main.querySelector("h1").after(el("div", { className: "callout" }, note));

/** One law: its title, its categories as pills, summary (cut to three lines, with "…"), key dates, and its status and relevance when they say more than "In force" / "Relevant". */
function law(l, categories) {
  return el("section", { className: "law" },
    el("h3", { textContent: l.name }),
    el("p", { className: "law-cats" }, ...l.categories.map((id) => el("span", { className: `law-cat law-cat-${id}`, textContent: categories[id] }))),
    cutWithMore(el("div", {}, el("p", { textContent: l.summary })), `Read the whole summary of ${l.name}`),
    el("p", {}, el("b", { textContent: "Key dates: " }), l.keyDates),
    /^in force\b/i.test(l.legalStatus) ? null : el("p", {}, el("b", { textContent: "Status: " }), l.legalStatus),
    l.relevance === "Relevant" ? null : el("p", {}, el("b", { textContent: "Relevance: " }), l.relevance),
  );
}

try {
  const [laws, countries] = await Promise.all([loadData("laws"), loadData("countries")]);
  const placeLabel = Object.fromEntries([...countries.countries, ...countries.regions].map((p) => [p.id, p.label]));
  const categories = Object.fromEntries(laws.categories.map((c) => [c.id, c.short]));
  const groups = lawsByPlace(codes, laws.items, countries);
  note.replaceChildren(...lawsNote(laws.updatedAt));

  const where = codes.map((c) => placeLabel[c] || c).join(", ");
  // saving as a PDF uses the browser's print window; the page title becomes
  // the PDF's suggested file name
  if (codes.length) document.title = `Laws to know — ${where} — CROW`;
  const save = button("Download as PDF", "button button-small", () => window.print());

  document.getElementById("laws-loading").replaceWith(
    el("p", {}, codes.length
      ? `For: ${where}.`
      : "No locations given. Add them in the editor, under Infrastructure → Locations, and open this page from there."),
    codes.length ? el("p", { className: "no-print" }, save, el("br"), el("small", { textContent: "In the window that opens, choose “Save as PDF” as the destination." })) : "",
    el("p", { className: "print-only", textContent: `From CROW Cards (crowcards.org), ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.` }),
    ...groups.flatMap((g) => [
      el("h2", { textContent: placeLabel[g.jurisdiction] || g.jurisdiction }),
      ...g.laws.map((l) => law(l, categories)),
    ]),
    codes.length && !groups.length ? el("p", { textContent: "None collated for these locations yet." }) : "",
  );
  // a summary that fits in three lines at this width needn't be cut
  // (measured once the fonts are in)
  await document.fonts.ready;
  for (const box of main.querySelectorAll(".law .is-cut")) {
    const p = box.firstElementChild;
    if (p.scrollHeight <= p.clientHeight) { box.classList.remove("is-cut"); box.querySelector(".more-dots").remove(); }
  }
} catch (e) {
  // (the "Loading…" line may already be gone, if building the page failed)
  main.replaceChildren(...[...main.children].filter((c) => c.matches("h1, .callout")), el("p", { className: "form-error", textContent: "Couldn’t load the list of laws. Please try again later." }));
  console.error(e);
}
