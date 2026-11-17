// Pin_Rows, row edits and Pin_Table validation. Pure, no DOM.
import { validateFixture } from "../../../engine/fixture";
import { isSignalName } from "../../../engine/rules/ir";
import type { DigitalFixturePin, Fixture } from "../../../engine/types";
import { ROW_ERROR_TEXT, TABLE_ERROR_TEXT, UPLOAD_COPY, fill } from "./upload-copy";

export const MAX_PINS = 16;
export const PLAIN_NAME_MAX = 40;

export interface DigitalRow {
  kind: "digital";
  /** Row key for the DOM; a counter in UploadState. Not exported, not compared. */
  id: number;
  signal: string;
  plainName: string;
  /** "B" | "C" | "D" from the controls; any string from an import; "" while not chosen. */
  port: string;
  /** 0..7 from the controls; any integer from an import; null while not chosen. */
  bit: number | null;
  direction: "input" | "output";
  /** Kept on outputs too, but only written and compared for inputs. */
  pressed: "low" | "high";
}

/** Every Pin_Row is a DigitalRow. An analog pin is an import error (Requirement 7.13). */
export type PinRow = DigitalRow;

export type RowPatch = Partial<Pick<DigitalRow, "signal" | "plainName" | "port" | "bit" | "direction" | "pressed">>;

export interface PinTableCheck {
  /** One list per row, index-aligned with the rows. */
  rowErrors: string[][];
  tableErrors: string[];
  /** Rows whose pin can go into a Fixture: no error other than the Plain_Name length error. */
  pinValid: boolean[];
  ok: boolean;
}

/** Blank names, no port, no bit, input, pressed level low. */
export function newDigitalRow(id: number): DigitalRow {
  return { kind: "digital", id, signal: "", plainName: "", port: "", bit: null, direction: "input", pressed: "low" };
}

/** Output to input sets the pressed level to low. */
export function setDirection(row: DigitalRow, d: "input" | "output"): DigitalRow {
  if (d === row.direction) return row;
  return d === "input" ? { ...row, direction: d, pressed: "low" } : { ...row, direction: d };
}

/** The Plain_Name unless it is "", else the Signal_Name. */
export function displayName(row: PinRow): string {
  return row.plainName !== "" ? row.plainName : row.signal;
}

/** "Port D, bit 2 (PD2)". */
export function portBitText(port: string, bit: number): string {
  return `Port ${port}, bit ${String(bit)} (P${port}${String(bit)})`;
}

/** The remove button's accessible name: the Display_Name, or the 1-based row number when both names are blank. */
export function removeButtonLabel(row: PinRow, position: number): string {
  const name = displayName(row);
  return name === ""
    ? fill(UPLOAD_COPY.removeRow, { n: String(position) })
    : fill(UPLOAD_COPY.removeNamed, { name });
}

function pinOf(row: PinRow): DigitalFixturePin {
  const pin = {
    signal: row.signal,
    port: row.port,
    bit: row.bit,
    direction: row.direction,
  } as unknown as DigitalFixturePin;
  if (row.direction === "input") pin.activeLevel = row.pressed;
  return pin;
}

/** A Fixture of every row, unchecked, for the picker, the rule patterns and the idle Pin_Levels_View. */
export function previewFixture(rows: readonly PinRow[]): Fixture {
  return { pins: rows.map(pinOf) };
}

const BIT_RANGE = /^Bit index (-?\d+) is out of range; must be 0/;

function groupErrors(rows: readonly PinRow[], key: (r: PinRow) => string | null): Set<number> {
  const seen = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const k = key(r);
    if (k === null) return;
    const list = seen.get(k) ?? [];
    list.push(i);
    seen.set(k, list);
  });
  const out = new Set<number>();
  for (const list of seen.values()) if (list.length > 1) for (const i of list) out.add(i);
  return out;
}

export function checkPinTable(rows: readonly PinRow[]): PinTableCheck {
  const dupSignal = groupErrors(rows, (r) => (r.signal === "" ? null : r.signal));
  const dupPortBit = groupErrors(rows, (r) => (r.port === "" || r.bit === null ? null : `${r.port}:${String(r.bit)}`));
  const rowErrors: string[][] = [];
  const pinValid: boolean[] = [];
  rows.forEach((r, i) => {
    const errs: string[] = [];
    let pinOk = true;
    if (!isSignalName(r.signal)) {
      errs.push(ROW_ERROR_TEXT.signalName);
      pinOk = false;
    }
    if (dupSignal.has(i)) {
      errs.push(ROW_ERROR_TEXT.duplicateSignal(r.signal));
      pinOk = false;
    }
    if (dupPortBit.has(i) && r.bit !== null) {
      errs.push(ROW_ERROR_TEXT.duplicatePortBit(portBitText(r.port, r.bit)));
      pinOk = false;
    }
    if (r.port === "" || r.bit === null) {
      errs.push(ROW_ERROR_TEXT.noPortBit);
      pinOk = false;
    } else {
      const e = validateFixture({ pins: [pinOf(r)] });
      if (e !== null) {
        pinOk = false;
        const bitMatch = BIT_RANGE.exec(e.message);
        if (e.kind === "unsupported-port") errs.push(ROW_ERROR_TEXT.port(e.port));
        else if (e.kind === "invalid-fixture" && bitMatch !== null) errs.push(ROW_ERROR_TEXT.bit(bitMatch[1] as string));
        else errs.push(e.message);
      }
    }
    if ([...r.plainName].length > PLAIN_NAME_MAX) errs.push(ROW_ERROR_TEXT.plainTooLong);
    rowErrors.push(errs);
    pinValid.push(pinOk);
  });
  const tableErrors: string[] = [];
  if (!rows.some((r) => r.direction === "input")) tableErrors.push(TABLE_ERROR_TEXT.noInput);
  if (!rows.some((r) => r.direction === "output")) tableErrors.push(TABLE_ERROR_TEXT.noOutput);
  if (rowErrors.every((e) => e.length === 0)) {
    const whole = validateFixture(previewFixture(rows));
    if (whole !== null) tableErrors.push(whole.message);
  }
  const ok = tableErrors.length === 0 && rowErrors.every((e) => e.length === 0);
  return { rowErrors, tableErrors, pinValid, ok };
}

/** The pins of rows with pinValid true, for the rule compile. */
export function validSubsetFixture(rows: readonly PinRow[], check: PinTableCheck): Fixture {
  return { pins: rows.filter((_, i) => check.pinValid[i] === true).map(pinOf) };
}

/** The Fixture posted to the worker; null unless the table is valid. Never holds plainName. */
export function toUploadFixture(rows: readonly PinRow[]): Fixture | null {
  return checkPinTable(rows).ok ? previewFixture(rows) : null;
}