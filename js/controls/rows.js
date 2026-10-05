// Repeatable rows: a list where people add and remove entries, each made of
// a few inputs. Used for custom-module fields, custom channels (Processes)
// and other tools (Infrastructure).
//
//   const rows = renderRows({
//     legend: "Fields",
//     items: module.fields,
//     addLabel: "Add a field",
//     newItem: () => ({ label: "", type: "text", value: "" }),
//     itemName: (item) => item.label || "this field",   // for the buttons' labels (from what the row holds now)
//     renderRow: (item, { onInput, onCommit }) => ({ element, collect, focus, setAside? }),
//     onInput, onCommit,
//   });
//   rows.value()   → each row's collect(), in order
//   rows.setAside() → every row's setAside() (answers it keeps aside: js/set-aside.js), merged
//
// Adding or removing a row counts as a finished change (onCommit). With
// reorderable, each row also gets ↑ / ↓ buttons, and value() follows the
// order on screen.
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
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  const list = el("div", { className: "rows" });
  const empty = emptyText ? el("p", { className: "field-hint", textContent: emptyText }) : null;
  const rows = [];   // { element, collect, focus }

  function addRow(item, { focus = false } = {}) {
    // the buttons are named after what the row holds, so they're named again after each change
    const row = renderRow(item, { onInput, onCommit: () => { relabel(); onCommit(); } });
    // a pixel × in the row's corner removes it
    const remove = el("button", { type: "button", className: "row-remove" }, el("span"));
    const entry = { ...row, labels: [[remove, (name) => `Remove ${name}`]], wrap: el("div", { className: "row" }, row.element, remove) };
    const relabel = () => { const name = itemName(entry.collect()); for (const [b, label] of entry.labels) b.setAttribute("aria-label", label(name)); };
    if (reorderable) entry.wrap.append(moveButtons(entry));
    if (summarize) addSummary(entry, { folded: !focus && Boolean(summarize(row.collect())) });
    remove.addEventListener("click", () => {
      drop(entry);
      onCommit();
    });
    relabel();
    rows.push(entry);
    list.append(entry.wrap);
    showEmpty();
    if (focus) row.focus?.();
  }

  /** A ✓ that folds the row into a one-line summary, and Edit to unfold it. */
  function addSummary(entry, { folded }) {
    const line = el("span", { className: "row-summary-text" });
    const edit = el("button", { type: "button", className: "link-button", textContent: "Edit" });
    const summary = el("p", { className: "row-summary" }, line, edit);
    const done = el("button", { type: "button", className: "row-done icon-button" }, el("span", { className: "pixel-tick" }));
    entry.labels.push([done, (name) => `Done with ${name}`]);
    const fold = (on) => {
      if (on) line.textContent = summarize(entry.collect()) || itemName(entry.collect());
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
  function moveButtons(entry) {
    const button = (dir) => {   // a pixel arrow, drawn in CSS (make.css .row-move)
      const b = el("button", { type: "button", className: "row-move" });
      b.dataset.dir = dir < 0 ? "up" : "down";
      entry.labels.push([b, (name) => `Move ${name} ${dir < 0 ? "up" : "down"}`]);
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
    setAside: () => Object.assign({}, ...rows.map((r) => r.setAside?.() || {})),   // (a removed row's go with it)
  };
}
