// The laws page (laws.html?codes=US,EU): the landmark laws for the places
// given, grouped by category. Opened from the editor's Infrastructure →
// Locations, in a new tab. The data is data/laws.json.

import { loadData } from "./data.js";
import { el, button } from "./dom.js";
import { LAWS_NOTE, lawsFor } from "./laws.js";

const main = document.getElementById("laws");
const codes = (new URLSearchParams(location.search).get("codes") || "").split(",").map((c) => c.trim()).filter(Boolean);

try {
  const [laws, countries] = await Promise.all([loadData("laws"), loadData("countries")]);
  const placeLabel = Object.fromEntries([...countries.countries, ...countries.regions].map((p) => [p.id, p.label]));
  const found = lawsFor(codes, laws.items, countries);
  const placeholder = laws.items.some((l) => l.status === "placeholder");

  const where = codes.map((c) => placeLabel[c] || c).join(", ");
  // saving as a PDF uses the browser's print window; the page title becomes
  // the PDF's suggested file name
  if (codes.length) document.title = `Laws to know — ${where} — CROW`;
  const save = button("Download as PDF", "button button-small", () => window.print());

  document.getElementById("laws-loading").remove();
  main.classList.add("print-urls");
  main.append(
    el("p", {}, codes.length
      ? `For: ${where}.`
      : "No locations given. Add them in the editor, under Infrastructure → Locations, and open this page from there."),
    codes.length ? el("p", { className: "no-print" }, save, el("br"), el("small", { textContent: "In the window that opens, choose “Save as PDF” as the destination." })) : null,
    el("p", { className: "print-only", textContent: `From CROW Cards (crowcards.org), ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.` }),
    el("div", { className: "callout" }, el("p", { textContent: LAWS_NOTE })),
    placeholder ? el("div", { className: "callout" }, el("p", {}, el("b", { textContent: "Work in progress: " }), "this is a short placeholder list while we build and review a fuller one.")) : null,
    ...(codes.length ? laws.categories.flatMap((cat) => {
      const inCat = found.filter((l) => l.categories.includes(cat.id));
      return [
        el("h2", { textContent: cat.label }),
        inCat.length
          ? el("table", { className: "table" },
            el("thead", {}, el("tr", {}, ...["Law", "Where", "What it’s about"].map((h) => el("th", { textContent: h })))),
            el("tbody", {}, ...inCat.map((l) => el("tr", {},
              el("td", {}, el("a", { className: "inline", href: l.url, target: "_blank", rel: "noopener", textContent: l.name })),
              el("td", { textContent: placeLabel[l.jurisdiction] || l.jurisdiction }),
              el("td", { textContent: l.summary }),
            ))))
          : el("p", { textContent: "None collated for these locations yet." }),
      ];
    }) : []),
  );
} catch (e) {
  document.getElementById("laws-loading").textContent = "Couldn’t load the list of laws. Please try again later.";
  console.error(e);
}
