// The Basics form: who the community is. Used in two places: the set-up page
// right after a card is made, and the Basics module in the editor.
//
//   const data = await loadBasicsData();
//   const form = renderBasics(container, card.basics, data, { onInput, onCommit, onTypeChange });
//   form.collect()   → the basics object to save
//   form.focusFirst()
//
// onInput fires while typing (schedule a save); onCommit fires when a field
// is left or a choice is made (save now); onTypeChange(from, to) fires when
// the community type changes (so the module picker can re-suggest).

import { loadData } from "../data.js";

/** The reference data the form is built from. */
export async function loadBasicsData() {
  const [types, enums, values, conflicts] = await Promise.all([
    loadData("community_types"),
    loadData("enums"),
    loadData("values"),
    loadData("value_conflicts"),
  ]);
  return {
    types: types.items,
    sizes: enums.communitySize,
    values: values.items,
    // only pairs a person has checked are shown to card makers
    conflicts: conflicts.items.filter((c) => c.status === "accepted"),
  };
}

// how strongly a pair of values pulls apart (value_conflicts.json conflict_level)
const LEVEL = {
  opposite: {
    title: "close to contradictory",
    advice: "Holding both is possible, but hard. If you do, it helps to say how you decide between them when they clash.",
  },
  strong: {
    title: "values in tension",
    advice: "Many communities hold both; it takes active balancing. You may want to say how you do it, e.g. in your rules or processes.",
  },
  soft: {
    title: "worth keeping in mind",
    advice: "Usually manageable with good practice. Just something to be aware of.",
  },
};

let uid = 0;
const KEYWORD_MAX = 40;   // characters per keyword

export function renderBasics(container, basics = {}, data, handlers = {}) {
  const { onInput = () => {}, onCommit = () => {}, onTypeChange = () => {} } = handlers;
  const n = uid++;
  const id = (name) => `basics-${name}-${n}`;
  const el = (tag, props = {}, ...children) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children);
    return e;
  };

  const state = {
    keywords: [...(basics.communityKeywords || [])],
    values: new Set(basics.values || []),
  };

  const wrap = el("div", { className: "fields" });

  // ── name and link ─────────────────────────────────────────
  wrap.insertAdjacentHTML("beforeend", `
    <div class="field">
      <label class="mono-u" for="${id("name")}">Community name</label>
      <input id="${id("name")}" type="text" name="communityName" autocomplete="off" />
    </div>
    <div class="field">
      <label class="mono-u" for="${id("link")}">Community link</label>
      <p class="field-hint" id="${id("link-hint")}">Where people find your community online, e.g. its website or server.</p>
      <input id="${id("link")}" type="url" name="communityLink" placeholder="https://" autocomplete="off" aria-describedby="${id("link-hint")}" />
    </div>
  `);
  const name = wrap.querySelector('[name="communityName"]');
  const link = wrap.querySelector('[name="communityLink"]');
  name.value = basics.communityName || "";
  link.value = basics.communityLink || "";
  for (const input of [name, link]) {
    input.addEventListener("input", () => onInput());
    input.addEventListener("change", () => onCommit());
  }

  // ── community type ────────────────────────────────────────
  const type = el("select", { id: id("type"), name: "communityType" },
    el("option", { value: "", textContent: "Choose a type…" }),
    ...data.types.map((t) => el("option", { value: t.id, textContent: t.label })),
  );
  type.value = basics.communityType || "";
  const typeHint = el("p", { className: "field-hint", id: id("type-hint") });
  type.setAttribute("aria-describedby", typeHint.id);
  const showTypeHint = () => {
    typeHint.textContent = data.types.find((t) => t.id === type.value)?.description
      || "What kind of space is it? This also suggests which modules your card covers.";
  };
  showTypeHint();
  let lastType = type.value || null;
  type.addEventListener("change", () => {
    showTypeHint();
    const from = lastType;
    lastType = type.value || null;
    onTypeChange(from, lastType);
    onCommit();
  });
  wrap.append(el("div", { className: "field" },
    el("label", { className: "mono-u", htmlFor: type.id, textContent: "Community type" }),
    typeHint,
    type,
  ));

  // ── community size ────────────────────────────────────────
  const size = el("fieldset", { className: "field" },
    el("legend", { className: "mono-u", textContent: "Community size" }),
  );
  const clearSize = el("button", { type: "button", className: "link-button", textContent: "Clear", hidden: !basics.communitySize });
  for (const s of data.sizes) {
    const rid = id(`size-${s.id}`);
    const radio = el("input", { type: "radio", name: id("size"), id: rid, value: s.id, checked: basics.communitySize === s.id });
    radio.addEventListener("change", () => {
      clearSize.hidden = false;
      onCommit();
    });
    size.append(el("div", { className: "choice" },
      radio,
      el("label", { htmlFor: rid },
        el("span", { className: "choice-name", textContent: s.label }),
        el("span", { className: "choice-desc", textContent: s.description }),
      ),
    ));
  }
  clearSize.addEventListener("click", () => {
    for (const r of size.querySelectorAll("input")) r.checked = false;
    clearSize.hidden = true;
    onCommit();
  });
  size.append(clearSize);
  wrap.append(size);

  // ── keywords: type one, press Enter (or a comma) to add it ─
  const kwInput = el("input", { type: "text", id: id("kw"), autocomplete: "off", maxLength: KEYWORD_MAX });
  const kwList = el("ul", { className: "tags" });
  kwList.setAttribute("aria-label", "Keywords");
  const kwHint = el("p", {
    className: "field-hint",
    id: id("kw-hint"),
    textContent: "A few words people might search for, e.g. “gardening”, “open science”. Press Enter or Tab after each one.",
  });
  kwInput.setAttribute("aria-describedby", kwHint.id);

  const renderKeywords = () => {
    kwList.replaceChildren(...state.keywords.map((k, i) => {
      const remove = el("button", { type: "button", className: "tag-remove", textContent: "×" });
      remove.setAttribute("aria-label", `Remove ${k}`);
      remove.addEventListener("click", () => {
        state.keywords.splice(i, 1);
        renderKeywords();
        kwInput.focus();
        onCommit();
      });
      return el("li", { className: "tag" }, el("span", { textContent: k }), remove);
    }));
  };
  const addKeyword = () => {
    const k = kwInput.value.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, KEYWORD_MAX);
    kwInput.value = "";
    if (!k || state.keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return false;
    state.keywords.push(k);
    renderKeywords();
    return true;
  };
  kwInput.addEventListener("keydown", (e) => {
    // Enter, comma, or Tab (when something's typed) adds the keyword; an
    // empty box lets Tab move on to the next field as usual
    if (e.key === "Enter" || e.key === "," || (e.key === "Tab" && !e.shiftKey && kwInput.value.trim())) {
      e.preventDefault();
      if (addKeyword()) onCommit();
    } else if (e.key === "Backspace" && !kwInput.value && state.keywords.length) {
      state.keywords.pop();
      renderKeywords();
      onCommit();
    }
  });
  kwInput.addEventListener("blur", () => {
    if (addKeyword()) onCommit();   // don't lose a half-typed one
  });
  renderKeywords();
  wrap.append(el("div", { className: "field" },
    el("label", { className: "mono-u", htmlFor: kwInput.id, textContent: "Keywords" }),
    kwHint,
    kwList,
    kwInput,
  ));

  // ── values: pick any number; pairs in tension get a note ──
  const valueById = new Map(data.values.map((v) => [v.id, v]));
  const chosenList = el("ul", { className: "tags tags-quiet" });
  chosenList.setAttribute("aria-label", "Chosen values");
  const conflictNotes = el("div", { className: "conflict-notes" });
  conflictNotes.setAttribute("aria-live", "polite");
  const filter = el("input", { type: "search", id: id("vfilter"), placeholder: "Filter values…", autocomplete: "off" });
  const valueList = el("div", { className: "value-list" });
  const boxes = new Map();   // value id → its checkbox

  const setValue = (vid, on) => {
    if (on) state.values.add(vid);
    else state.values.delete(vid);
    boxes.get(vid).checked = on;
    renderChosen();
    onCommit();
  };

  for (const v of data.values) {
    const cid = id(`value-${v.id}`);
    const box = el("input", { type: "checkbox", id: cid, value: v.id, checked: state.values.has(v.id) });
    box.addEventListener("change", () => setValue(v.id, box.checked));
    boxes.set(v.id, box);
    const about = el("div", { className: "value-about", id: id(`about-${v.id}`), hidden: true },
      el("p", { textContent: v.description }),
      ...(v.signals ? [el("p", { className: "field-hint" }, el("em", { textContent: "Example of inconsistency: " }), v.signals)] : []),
    );
    const toggle = el("button", { type: "button", className: "pixel-toggle", title: `About ${v.label}` });
    toggle.setAttribute("aria-label", `About ${v.label}`);
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", about.id);
    toggle.addEventListener("click", () => {
      about.hidden = !about.hidden;
      toggle.setAttribute("aria-expanded", String(!about.hidden));
    });
    const row = el("div", { className: "choice value-row" },
      box,
      el("label", { htmlFor: cid, className: "choice-name", textContent: v.label }),
      toggle,
      about,
    );
    row.dataset.search = `${v.label} ${v.description}`.toLowerCase();
    valueList.append(row);
  }

  filter.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    for (const row of valueList.children) row.hidden = !!q && !row.dataset.search.includes(q);
  });

  function renderChosen() {
    const chosen = data.values.filter((v) => state.values.has(v.id));
    // each chosen value as a tag with an ×, so it can be unticked without
    // scrolling the list to find it
    chosenList.replaceChildren(...chosen.map((v) => {
      const remove = el("button", { type: "button", className: "tag-remove", textContent: "×" });
      remove.setAttribute("aria-label", `Remove ${v.label}`);
      remove.addEventListener("click", () => setValue(v.id, false));
      return el("li", { className: "tag" }, el("span", { textContent: v.label }), remove);
    }));

    const pairs = data.conflicts.filter((c) => c.values.every((x) => state.values.has(x)));
    conflictNotes.replaceChildren(...pairs.map((c) => {
      const [a, b] = c.values.map((x) => valueById.get(x)?.label || x);
      const level = LEVEL[c.conflict_level] || LEVEL.strong;
      return el("div", { className: "callout" },
        el("p", {}, el("b", { className: "mono-u", textContent: `${a} and ${b}: ${level.title}` })),
        el("p", { textContent: c.note }),
        el("p", { className: "field-hint", textContent: level.advice }),
      );
    }));
  }
  renderChosen();

  wrap.append(el("fieldset", { className: "field" },
    el("legend", { className: "mono-u", textContent: "Values" }),
    el("p", { className: "field-hint", textContent: "What your community cares about. Pick as many as fit." }),
    chosenList,
    conflictNotes,
    el("label", { className: "visually-hidden", htmlFor: filter.id, textContent: "Filter values" }),
    filter,
    valueList,
  ));

  container.replaceChildren(wrap);

  // empty text is stored as null, matching the empty card
  const text = (input) => input.value.trim() || null;

  return {
    /** Everything this form edits, merged over what it was given. */
    collect: () => ({
      ...basics,
      communityName: text(name),
      communityLink: text(link),
      communityType: type.value || null,
      communitySize: size.querySelector("input:checked")?.value || null,
      communityKeywords: [...state.keywords],
      values: data.values.filter((v) => state.values.has(v.id)).map((v) => v.id),
    }),
    focusFirst: () => name.focus(),
  };
}
