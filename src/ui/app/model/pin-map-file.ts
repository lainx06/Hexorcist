// Pin_Map_File export and import, in the examples' fixture.json format. Pure.
// A Plain_Name travels in the extra field "plainName". The engine never receives it: requests are
// built from toUploadFixture, which writes a fixed field list.
import { IMPORT_ERROR_TEXT } from "./upload-copy";
import { SIZE_LIMIT } from "./upload-hex";
import { MAX_PINS } from "./pin-table";
import type { PinRow } from "./pin-table";

/** The extra field that holds a Plain_Name in a Pin_Map_File. */
export const PLAIN_NAME_FIELD = "plainName";

/** JSON.stringify({ pins }, null, 2) + "\n", fields in a fixed order. */
export function exportPinMap(rows: readonly PinRow[]): string {
  const pins = rows.map((r) => {
    const o: Record<string, unknown> = { signal: r.signal, port: r.port, bit: r.bit, direction: r.direction };
    if (r.direction === "input") o.activeLevel = r.pressed;
    if (r.plainName !== "") o[PLAIN_NAME_FIELD] = r.plainName;
    return o;
  });
  return `${JSON.stringify({ pins }, null, 2)}\n`;
}

export type ImportResult = { ok: true; rows: PinRow[]; nextId: number } | { ok: false; error: string };

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The earliest key of the entry that a Pin_Row cannot hold, or null. */
function unusableField(e: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(e)) {
    switch (k) {
      case "signal":
      case "port":
      case "bit":
      case "direction":
      case PLAIN_NAME_FIELD:
        break;
      case "kind":
        if (v !== "digital") return k;
        break;
      case "activeLevel":
        if ((v !== "low" && v !== "high") || e.direction !== "input") return k;
        break;
      case "restState":
        if (v !== "released") return k;
        break;
      default:
        return k;
    }
  }
  return null;
}

/** The checks of Requirement 7.6 to 7.8 and 7.13 in a fixed order; the earliest failure is the one error. */
export function importPinMap(text: string, bytes: number, firstId: number): ImportResult {
  const fail = (error: string): ImportResult => ({ ok: false, error });
  if (bytes > SIZE_LIMIT) return fail(IMPORT_ERROR_TEXT.tooBig);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(IMPORT_ERROR_TEXT.notJson);
  }
  if (!isObject(data) || !Array.isArray(data.pins)) return fail(IMPORT_ERROR_TEXT.noPins);
  if ("clockHz" in data && data.clockHz !== 16_000_000) return fail(IMPORT_ERROR_TEXT.clock);
  const pins: unknown[] = data.pins;
  if (pins.length > MAX_PINS) return fail(IMPORT_ERROR_TEXT.tooMany);
  const analogAt = pins.findIndex((p) => isObject(p) && p.kind === "analog");
  if (analogAt >= 0) return fail(IMPORT_ERROR_TEXT.analog(analogAt + 1));
  const rows: PinRow[] = [];
  for (let i = 0; i < pins.length; i++) {
    const n = i + 1;
    const e = pins[i];
    if (!isObject(e) || typeof e.signal !== "string") return fail(IMPORT_ERROR_TEXT.entrySignal(n));
    if (
      typeof e.port !== "string" ||
      typeof e.bit !== "number" ||
      !Number.isInteger(e.bit) ||
      (e.direction !== "input" && e.direction !== "output")
    ) {
      return fail(IMPORT_ERROR_TEXT.entryDigital(n));
    }
    const plain = e[PLAIN_NAME_FIELD];
    if (plain !== undefined && typeof plain !== "string") return fail(IMPORT_ERROR_TEXT.entryPlainName(n));
    const bad = unusableField(e);
    if (bad !== null) return fail(IMPORT_ERROR_TEXT.entryField(n, e.signal, bad));
    const direction = e.direction;
    const pressed = direction === "input" && e.activeLevel === "high" ? "high" : "low";
    rows.push({
      kind: "digital",
      id: firstId + i,
      signal: e.signal,
      plainName: typeof plain === "string" ? plain : "",
      port: e.port,
      bit: e.bit,
      direction,
      pressed,
    });
  }
  return { ok: true, rows, nextId: firstId + rows.length };
}