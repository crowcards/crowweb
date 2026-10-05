// Repeatable rows: a list where people add and remove entries, each made of
// a few inputs. Used for custom-module fields, and later custom channels
// (Processes) and additional tools (Infrastructure).
//
//   const rows = renderRows({
//     legend: "Fields",
//     items: module.fields,
//     addLabel: "Add a field",
//     newItem: () => ({ label: "", type: "text", value: "" }),
//     itemName: (item) => item.label || "this field",   // for the × button's label
//     renderRow: (item, { onInput, onCommit }) => ({ element, collect, focus }),
//     onInput, onCommit,
//   });
//   rows.value()   → each row's collect(), in order
//
// Adding or removing a row counts as a finished change (onCommit). Without
// newItem there's no "Add" link (it has a pixel plus); rows can still be added and removed from
// outside with rows.add(item) and rows.remove(match), and onRemove(item, current)
// hears about rows removed with their × (current = what the row held). (js/controls/picklist.js works this
// way.) With reorderable, each row also gets ↑ / ↓ buttons, and value()
// follows the order on screen.
//
// summarize(values) → a one-line summary (or "" if there's nothing to sum up
// yet): each row gets a ✓ that folds it into that line, with Edit to open
// it again. Rows that already have something open folded; new rows open.

import { el, uid } from "../dom.js";

export function renderRows({
  legend,
  legendHidden = false,   // when a heading above already names the list
  hint,
  items = [],
  addLabel = "Add",
  emptyText = "",
  newItem,
  itemName = () => "this entry",
  renderRow,
  reorderable = false,
  summarize,
  onRemove = () => {},
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const list = el("div", { className: "rows" });
  const empty = emptyText ? el("p", { className: "field-hint", textContent: emptyText }) : null;
  const rows = [];   // { element, collect, focus }

  function addRow(item, { focus = false } = {}) {
    const row = renderRow(item, { onInput, onCommit });
    // a pixel × in the row's corner removes it
    const remove = el("button", { type: "button", className: "row-remove" }, el("span"));
    const entry = { ...row, item, wrap: el("div", { className: "row" }, row.element, remove) };
    if (reorderable) entry.wrap.append(moveButtons(entry, itemName(item)));
    if (summarize) addSummary(entry, item, { folded: !focus && Boolean(summarize(row.collect())) });
    remove.addEventListener("click", () => {
      const current = entry.collect();
      drop(entry);
      onRemove(item, current);
      onCommit();
    });
    remove.setAttribute("aria-label", `Remove ${itemName(item)}`);
    rows.push(entry);
    list.append(entry.wrap);
    showEmpty();
    if (focus) row.focus?.();
  }

  /** A ✓ that folds the row into a one-line summary, and Edit to unfold it. */
  function addSummary(entry, item, { folded }) {
    const line = el("span", { className: "row-summary-text" });
    const edit = el("button", { type: "button", className: "link-button", textContent: "Edit" });
    const summary = el("p", { className: "row-summary" }, line, edit);
    const done = el("button", { type: "button", className: "row-done icon-button" }, el("span", { className: "pixel-tick" }));
    done.setAttribute("aria-label", `Done with ${itemName(item)}`);
    const fold = (on) => {
      if (on) line.textContent = summarize(entry.collect()) || itemName(item);
      entry.element.hidden = on;
      summary.hidden = !on;
      done.hidden = on;
      entry.wrap.classList.toggle("is-folded", on);
    };
    done.addEventListener("click", () => { fold(true); edit.focus(); });
    edit.addEventListener("click", () => { fold(false); entry.focus?.(); });
    entry.wrap.prepend(summary);
    entry.wrap.append(done);
    fold(folded);
  }

  /** ↑ / ↓ buttons that move a row one place, keeping focus on the button. */
  function moveButtons(entry, name) {
    const button = (dir) => {   // a pixel arrow, drawn in CSS (make.css .row-move)
      const b = el("button", { type: "button", className: "row-move" });
      b.dataset.dir = dir < 0 ? "up" : "down";
      b.setAttribute("aria-label", `Move ${name} ${dir < 0 ? "up" : "down"}`);
      b.addEventListener("click", () => {
        const i = rows.indexOf(entry);
        const j = i + dir;
        if (j < 0 || j >= rows.length) return;
        [rows[i], rows[j]] = [rows[j], rows[i]];
        if (dir < 0) list.insertBefore(entry.wrap, rows[i].wrap);
        else list.insertBefore(rows[i].wrap, entry.wrap);
        b.focus();
        onCommit();
      });
      return b;
    };
    return el("div", { className: "row-moves" }, button(-1), button(1));
  }

  function drop(entry) {
    rows.splice(rows.indexOf(entry), 1);
    entry.wrap.remove();
    showEmpty();
  }

  const showEmpty = () => { if (empty) empty.hidden = rows.length > 0; };

  const add = newItem ? el("button", { type: "button", className: "link-button" }, el("span", { className: "pixel-plus" }), addLabel) : null;
  add?.addEventListener("click", () => {
    addRow(newItem(), { focus: true });
    onCommit();
  });

  for (const item of items) addRow(item);
  showEmpty();

  const id = uid("rows");
  const element = el("fieldset", { className: "field", id },
    el("legend", { className: legendHidden ? "visually-hidden" : "mono-u", textContent: legend }),
    hint ? el("p", { className: "field-hint", textContent: hint }) : null,
    empty,
    list,
    add ? el("p", { className: "rows-add" }, add) : null,
  );

  return {
    element,
    value: () => rows.map((r) => r.collect()),
    /** Add a row for this item (no onCommit: the caller decides). */
    add: (item) => addRow(item),
    /** Remove the rows whose item matches. */
    remove: (match) => rows.filter((r) => match(r.item)).forEach(drop),
  };
}
