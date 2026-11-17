// Feature: bench-ui-upload. Acceptance A6: pin map export then import. Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exportPinMap, importPinMap } from "../../src/ui/app/model/pin-map-file";
import { checkPinTable } from "../../src/ui/app/model/pin-table";
import type { PinRow } from "../../src/ui/app/model/pin-table";
import { pinTableArb } from "./upload-arbitraries";

const SEED = 20261204;

/** Row fields that the round trip must keep: everything but the DOM id; Pressed_Level for inputs only. */
const comparable = (rows: readonly PinRow[]) =>
  rows.map((r) => ({
    signal: r.signal,
    plainName: r.plainName,
    port: r.port,
    bit: r.bit,
    direction: r.direction,
    pressed: r.direction === "input" ? r.pressed : null,
  }));

describe("A6", () => {
  // Feature: bench-ui-upload, Property 11: Pin map round trip
  it("Export then import of a pin map round-trips exactly (property test over random valid tables).", () => {
    fc.assert(
      fc.property(pinTableArb, (rows) => {
        expect(checkPinTable(rows).ok, "generated table must be valid").toBe(true);
        const text = exportPinMap(rows);
        const back = importPinMap(text, new TextEncoder().encode(text).length, 100);
        if (!back.ok) throw new Error(`import failed: ${back.error}\n${text}`);
        expect(comparable(back.rows)).toEqual(comparable(rows));
      }),
      { numRuns: 200, seed: SEED, verbose: true },
    );
  });
});