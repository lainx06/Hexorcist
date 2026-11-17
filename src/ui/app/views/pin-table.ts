// The Pin_Table: a table above 600 px, stacked cards at 600 px and below (CSS). DOM builder; the page owns
// the rows. Rows are repainted in place by row id, so the focused control keeps focus while typing.
import { portBitText, removeButtonLabel } from "../model/pin-table";
import type { PinRow, PinTableCheck, RowPatch } from "../model/pin-table";
import { UPLOAD_COPY } from "../model/upload-copy";
import { el, setChildren } from "./dom";

export interface PinTableCallbacks {
  onRemoveRow(id: number): void;
  onEditRow(id: number, patch: RowPatch): void;
}

export interface PinTableView {
  node: HTMLElement;
  paint(rows: readonly PinRow[], check: PinTableCheck, busy: boolean): void;
}

const NOT_CHOSEN = "\u2013";
const PORTS = ["B", "C", "D"] as const;
const BITS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

interface RowDom {
  tr: HTMLTableRowElement;
  errTr: HTMLTableRowElement;
  errList: HTMLUListElement;
  signal: HTMLInputElement;
  plain: HTMLInputElement;
  port: HTMLSelectElement;
  bit: HTMLSelectElement;
  portBit: HTMLSpanElement;
  direction: HTMLSelectElement;
  pressed: HTMLSelectElement;
  pressedCell: HTMLTableCellElement;
  remove: HTMLButtonElement;
}

/** Options of a select: the list, plus the current value when it is outside the list (an imported value). */
function setOptions(sel: HTMLSelectElement, values: readonly { value: string; text: string }[], current: string): void {
  const list = values.some((v) => v.value === current) ? values : [...values, { value: current, text: current }];
  const same =
    sel.options.length === list.length && list.every((v, i) => (sel.options[i] as HTMLOptionElement).value === v.value);
  if (!same) setChildren(sel, list.map((v) => el("option", { value: v.value }, [v.text])));
  if (sel.value !== current) sel.value = current;
}

function cell(id: string, label: string, control: HTMLElement, extra: HTMLElement | null = null): HTMLTableCellElement {
  return el("td", { class: "pin-cell" }, [el("label", { class: "pin-cell-label", for: id }, [label]), control, extra]);
}

export function createPinTable(cb: PinTableCallbacks): PinTableView {
  const C = UPLOAD_COPY.columns;
  const head = el("thead", {}, [
    el("tr", {}, [
      el("th", { scope: "col" }, [C.signal]),
      el("th", { scope: "col" }, [C.plain]),
      el("th", { scope: "col" }, [C.port]),
      el("th", { scope: "col" }, [C.bit]),
      el("th", { scope: "col" }, [C.direction]),
      el("th", { scope: "col" }, [C.pressed]),
      el("th", { scope: "col", class: "pin-remove-col" }, []),
    ]),
  ]);
  const body = el("tbody", {});
  const table = el("table", { class: "pin-table" }, [head, body]);
  const tableErrors = el("ul", { class: "pin-table-errors", "aria-live": "polite" });
  const node = el("div", { class: "pin-table-wrap" }, [table, tableErrors]);
  const doms = new Map<number, RowDom>();

  function build(id: number): RowDom {
    const k = `pin-${String(id)}`;
    const signal = el("input", { id: `${k}-signal`, class: "field mono", type: "text", spellcheck: "false", autocomplete: "off" });
    const plain = el("input", { id: `${k}-plain`, class: "field", type: "text", autocomplete: "off" });
    const port = el("select", { id: `${k}-port`, class: "field" });
    const bit = el("select", { id: `${k}-bit`, class: "field" });
    const portBit = el("span", { class: "port-bit-text meta" }, [""]);
    const direction = el("select", { id: `${k}-direction`, class: "field" }, [
      el("option", { value: "input" }, [UPLOAD_COPY.directions.input]),
      el("option", { value: "output" }, [UPLOAD_COPY.directions.output]),
    ]);
    const pressed = el("select", { id: `${k}-pressed`, class: "field" }, [
      el("option", { value: "low" }, [UPLOAD_COPY.pressedLevels.low]),
      el("option", { value: "high" }, [UPLOAD_COPY.pressedLevels.high]),
    ]);
    const remove = el("button", { type: "button", class: "secondary pin-remove" }, ["\u00d7"]);
    signal.addEventListener("input", () => cb.onEditRow(id, { signal: signal.value }));
    plain.addEventListener("input", () => cb.onEditRow(id, { plainName: plain.value }));
    port.addEventListener("change", () => cb.onEditRow(id, { port: port.value }));
    bit.addEventListener("change", () => cb.onEditRow(id, { bit: bit.value === "" ? null : Number(bit.value) }));
    direction.addEventListener("change", () =>
      cb.onEditRow(id, { direction: direction.value === "output" ? "output" : "input" }),
    );
    pressed.addEventListener("change", () => cb.onEditRow(id, { pressed: pressed.value === "high" ? "high" : "low" }));
    remove.addEventListener("click", () => cb.onRemoveRow(id));
    const pressedCell = cell(`${k}-pressed`, C.pressed, pressed);
    const tr = el("tr", { class: "pin-row" }, [
      cell(`${k}-signal`, C.signal, signal),
      cell(`${k}-plain`, C.plain, plain),
      cell(`${k}-port`, C.port, port),
      cell(`${k}-bit`, C.bit, bit, portBit),
      cell(`${k}-direction`, C.direction, direction),
      pressedCell,
      el("td", { class: "pin-cell pin-remove-cell" }, [remove]),
    ]);
    const errList = el("ul", { class: "pin-row-errors", "aria-live": "polite" });
    const errTr = el("tr", { class: "pin-row-error-row" }, [el("td", { colspan: 7 }, [errList])]);
    return { tr, errTr, errList, signal, plain, port, bit, portBit, direction, pressed, pressedCell, remove };
  }

  return {
    node,
    paint(rows, check, busy) {
      const keep = new Set(rows.map((r) => r.id));
      for (const id of [...doms.keys()]) if (!keep.has(id)) doms.delete(id);
      const order: HTMLElement[] = [];
      rows.forEach((r, i) => {
        let d = doms.get(r.id);
        if (d === undefined) {
          d = build(r.id);
          doms.set(r.id, d);
        }
        if (d.signal.value !== r.signal) d.signal.value = r.signal;
        if (d.plain.value !== r.plainName) d.plain.value = r.plainName;
        setOptions(d.port, [{ value: "", text: NOT_CHOSEN }, ...PORTS.map((p) => ({ value: p, text: p }))], r.port);
        setOptions(
          d.bit,
          [{ value: "", text: NOT_CHOSEN }, ...BITS.map((b) => ({ value: String(b), text: String(b) }))],
          r.bit === null ? "" : String(r.bit),
        );
        d.portBit.textContent = r.port !== "" && r.bit !== null ? portBitText(r.port, r.bit) : "";
        if (d.direction.value !== r.direction) d.direction.value = r.direction;
        if (d.pressed.value !== r.pressed) d.pressed.value = r.pressed;
        d.pressedCell.hidden = r.direction !== "input";
        d.remove.setAttribute("aria-label", removeButtonLabel(r, i + 1));
        const errs = check.rowErrors[i] ?? [];
        setChildren(d.errList, errs.map((e) => el("li", { class: "pin-row-error" }, [e])));
        d.errTr.hidden = errs.length === 0;
        d.tr.classList.toggle("has-error", errs.length > 0);
        for (const c of [d.signal, d.plain]) c.readOnly = busy;
        for (const c of [d.port, d.bit, d.direction, d.pressed, d.remove]) c.disabled = busy;
        order.push(d.tr, d.errTr);
      });
      // Re-append in order; nodes already in place keep focus.
      order.forEach((n, i) => {
        if (body.children[i] !== n) body.insertBefore(n, body.children[i] ?? null);
      });
      while (body.children.length > order.length) body.lastElementChild?.remove();
      table.hidden = rows.length === 0;
      setChildren(tableErrors, check.tableErrors.map((e) => el("li", { class: "pin-table-error" }, [e])));
    },
  };
}