// A light stemmer for matching words in a community's description against
// each value's words and phrases (value_groups.json "cues"): strips common
// English endings so organise / organises / organising / organiser match,
// without merging unrelated words the way heavier stemmers do (Porter turns
// "organisation" into "organ"). British and American spellings are treated
// alike (-ise / -ize). Shared by scripts/make-value-terms.mjs and, once the
// new word lists are in, the editor's matching (js/recommend.js), so both
// always agree.
//
//   stem("organising") → "organiz"      words("We help each other!") → ["we", "help", "each", "other"]

const ENDINGS = [
  ["encies", "ent"], ["ency", "ent"], ["ancies", "ant"], ["ancy", "ant"],
  ["izations", "iz"], ["ization", "iz"], ["ations", "at"], ["ation", "at"], ["nesses", ""], ["ness", ""], ["ments", ""], ["ment", ""],
  ["ingly", ""], ["ings", ""], ["ing", ""], ["edly", ""], ["ers", ""], ["er", ""], ["ies", "y"], ["ied", "y"], ["ed", ""],
  ["ly", ""], ["es", ""], ["s", ""], ["e", ""],
];

/** The stem of one word (lowercase letters; anything shorter than 4 letters is left alone). */
export function stem(word) {
  let w = word.toLowerCase().replace(/['’]s$/, "");
  if (w.length < 4) return w;
  // British spellings to the -ize form, so organise and organize meet
  w = w.replace(/is(ation|ations|e|es|ed|ing|er|ers)$/, "iz$1");
  for (const [end, put] of ENDINGS) {
    if (w.endsWith(end) && w.length - end.length >= 3 && !(end === "s" && /(ss|us|is)$/.test(w)) && !(/^ers?$/.test(end) && /eers?$/.test(w))) {
      w = w.slice(0, -end.length) + put;
      break;
    }
  }
  // planning → plann → plan (but keep -ll, -ss, -zz)
  if (/([^lsz])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/** The words of a text, lowercase (letters, digits and inner hyphens or apostrophes). */
export const words = (text = "") => text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
