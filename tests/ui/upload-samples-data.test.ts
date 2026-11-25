// Feature: upload-samples, task 1.3. Unit tests for the two extra sample data sets.
// Reads files on disk and compares them with the build-time bundled text. Passing is evidence, not proof.
// Not repeated here: "no network call in the data module" is already scanned by
// tests/ui/upload-samples-scan.test.ts ("src/ui/app/data/upload-samples-extra.ts has no network call, clock read, ...").
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_SKETCH_FIELDS,
  CHAT_SKETCH_HEX_NAME,
  CHAT_SKETCH_RULE_TEXT,
  UNJUDGEABLE_FIELDS,
  UNJUDGEABLE_HEX_NAME,
  UNJUDGEABLE_RULE_TEXT,
  chatSketchProgram,
  chatSketchRows,
  unjudgeableProgram,
  unjudgeableRows,
} from "../../src/ui/app/data/upload-samples-extra";
import { sampleRows } from "../../src/ui/app/data/upload-sample";
import { friendlyLabel } from "../../src/ui/app/model/labels";
import { importPinMap } from "../../src/ui/app/model/pin-map-file";

const ROOT = resolve(__dirname, "..", "..");
const CHAT_HEX_PATH = join(ROOT, "exorcism-demo", "benchmark", "round2", "chatgpt-high.hex");
const SERIAL_HEX_PATH = join(ROOT, "fixtures", "serial_hello", "build", "serial_hello.ino.hex");
const SERIAL_PINS_PATH = join(ROOT, "fixtures", "serial_hello", "pins.json");

describe("Chat_Sketch_Sample data (Requirements 2.1, 2.2, 2.3, 2.5, 2.6)", () => {
  it("bundled HEX equals the file on disk byte for byte", () => {
    const disk = readFileSync(CHAT_HEX_PATH);
    const p = chatSketchProgram();
    expect(disk.length).toBeGreaterThan(0);
    expect(Buffer.from(p.text, "utf8").equals(disk)).toBe(true);
    expect(p.bytes).toBe(disk.length);
  });

  it("has the exact file name, rule text and fields", () => {
    expect(chatSketchProgram().name).toBe("chat-written-crossing.hex");
    expect(CHAT_SKETCH_HEX_NAME).toBe("chat-written-crossing.hex");
    expect(CHAT_SKETCH_RULE_TEXT).toBe("all of (WALK is 1, DONT_WALK is 1) must never happen.");
    expect(CHAT_SKETCH_FIELDS).toEqual({ runs: "24", seed: "20261101", runLengthMs: "1000" });
  });

  it("rows are the Crosswalk pin map, with ids starting at firstId", () => {
    expect(chatSketchRows(1)).toEqual(sampleRows(1));
    const rows = chatSketchRows(7);
    expect(rows.map((r) => r.id)).toEqual(sampleRows(7).map((r) => r.id));
    expect(rows[0]?.id).toBe(7);
  });
});

describe("Unjudgeable_Sample data (Requirements 3.1, 3.2, 3.4, 3.6, 3.7)", () => {
  it("bundled HEX equals the file on disk byte for byte", () => {
    const disk = readFileSync(SERIAL_HEX_PATH);
    const p = unjudgeableProgram();
    expect(disk.length).toBeGreaterThan(0);
    expect(Buffer.from(p.text, "utf8").equals(disk)).toBe(true);
    expect(p.bytes).toBe(disk.length);
  });

  it("has the exact file name, rule text and fields", () => {
    expect(unjudgeableProgram().name).toBe("serial_hello.ino.hex");
    expect(UNJUDGEABLE_HEX_NAME).toBe("serial_hello.ino.hex");
    expect(UNJUDGEABLE_RULE_TEXT).toBe("LED is 1 must never last 500 ms or longer.");
    expect(UNJUDGEABLE_FIELDS).toEqual({ runs: "8", seed: "20261101", runLengthMs: "1000" });
  });

  it("pins.json on disk has exactly the two required pins", () => {
    const parsed: unknown = JSON.parse(readFileSync(SERIAL_PINS_PATH, "utf8"));
    expect(parsed).toEqual({
      pins: [
        { signal: "LED", port: "B", bit: 5, direction: "output" },
        { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
      ],
    });
  });

  it("pins.json imports without error and unjudgeableRows matches the import result", () => {
    const text = readFileSync(SERIAL_PINS_PATH, "utf8");
    const r = importPinMap(text, Buffer.byteLength(text, "utf8"), 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(2);
    const expected = r.rows.map((row) => {
      const label = friendlyLabel(row.signal);
      return { ...row, plainName: label.known ? label.text : "" };
    });
    expect(unjudgeableRows(5)).toEqual(expected);
    const rows = unjudgeableRows(5);
    expect(rows.map((x) => x.id)).toEqual([5, 6]);
    expect(rows[0]).toMatchObject({ signal: "LED", port: "B", bit: 5, direction: "output" });
    expect(rows[1]).toMatchObject({ signal: "BUTTON", port: "D", bit: 2, direction: "input", pressed: "low" });
  });
});
