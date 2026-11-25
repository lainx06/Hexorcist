// Feature: upload-samples, task 2.3. Loaders, failure path, button order and labels, disabled wiring,
// and the two files of "Download the sample".
// There is no DOM environment in this repo (vitest runs in node), so the buttons are checked from the
// source of program-section.ts and the label table, not from a mounted page. Evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as extra from "../../src/ui/app/data/upload-samples-extra";
import {
  CHAT_SKETCH_FIELDS,
  CHAT_SKETCH_HEX_NAME,
  CHAT_SKETCH_RULE_TEXT,
  UNJUDGEABLE_FIELDS,
  UNJUDGEABLE_HEX_NAME,
  UNJUDGEABLE_RULE_TEXT,
} from "../../src/ui/app/data/upload-samples-extra";
import { SAMPLE_HEX_NAME, SAMPLE_PINS_NAME, sampleDownloads, sampleProgram } from "../../src/ui/app/data/upload-sample";
import { UPLOAD_COPY } from "../../src/ui/app/model/upload-copy";
import {
  initialUpload,
  loadChatSketchSample,
  loadSample,
  loadUnjudgeableSample,
} from "../../src/ui/app/model/upload-state";

// Fault injection for the failure tests only. Off by default, so every other test sees the real data.
const fault = vi.hoisted(() => ({ emptyChatHex: false, brokenPins: false }));
vi.mock("../../src/ui/app/data/upload-samples-extra", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/ui/app/data/upload-samples-extra")>();
  return {
    ...real,
    chatSketchProgram: () => {
      const p = real.chatSketchProgram();
      return fault.emptyChatHex ? { ...p, text: "", bytes: 0 } : p;
    },
    unjudgeableRows: (firstId: number) => {
      if (fault.brokenPins) throw new Error("forced pin map failure");
      return real.unjudgeableRows(firstId);
    },
  };
});

const ROOT = resolve(__dirname, "..", "..");
const SECTION = readFileSync(resolve(ROOT, "src/ui/app/views/program-section.ts"), "utf8");

const FIELDS_SHAPE = (f: { runs: string; seed: string; runLengthMs: string }) => ({ runs: f.runs, seed: f.seed, runLengthMs: f.runLengthMs });

describe("sample loaders replace the earlier program, rule text and settings (1.3, 1.4, 2.x, 3.x)", () => {
  const dirty = () => {
    const base = loadSample(initialUpload());
    return { ...base, ruleText: "my own rule", fields: { runs: "3", seed: "7", runLengthMs: "50" } };
  };

  it("loadChatSketchSample replaces program, rows, rule text and fields of an earlier sample", () => {
    const before = dirty();
    const r = loadChatSketchSample(before);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.program?.name).toBe(CHAT_SKETCH_HEX_NAME);
    expect(r.state.program?.name).not.toBe(before.program?.name);
    expect(r.state.ruleText).toBe(CHAT_SKETCH_RULE_TEXT);
    expect(FIELDS_SHAPE(r.state.fields)).toEqual(FIELDS_SHAPE(CHAT_SKETCH_FIELDS));
    expect(r.state.rows.length).toBeGreaterThan(0);
    expect(r.state.selected).toEqual(["masher"]);
    expect(r.state.hexError).toBeNull();
    expect(r.state.importError).toBeNull();
  });

  it("loadUnjudgeableSample replaces program, rows, rule text and fields of an earlier sample", () => {
    const before = dirty();
    const r = loadUnjudgeableSample(before);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.program?.name).toBe(UNJUDGEABLE_HEX_NAME);
    expect(r.state.ruleText).toBe(UNJUDGEABLE_RULE_TEXT);
    expect(FIELDS_SHAPE(r.state.fields)).toEqual(FIELDS_SHAPE(UNJUDGEABLE_FIELDS));
    expect(r.state.rows.map((row) => row.signal)).toEqual(["LED", "BUTTON"]);
    expect(r.state.nextRowId).toBe(before.nextRowId + 2);
  });

  it("loading one extra sample after the other leaves only the second one's data", () => {
    const first = loadChatSketchSample(initialUpload());
    if (!first.ok) throw new Error("chat sketch did not load");
    const second = loadUnjudgeableSample(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.program?.name).toBe(UNJUDGEABLE_HEX_NAME);
    expect(second.state.rows.map((row) => row.signal)).toEqual(["LED", "BUTTON"]);
    expect(second.state.ruleText).toBe(UNJUDGEABLE_RULE_TEXT);
    const back = loadSample(second.state);
    expect(back.program?.name).toBe(SAMPLE_HEX_NAME);
  });
});

describe("a forced failure returns { ok: false } and leaves the original state alone (2.10, 3.10)", () => {
  it("chat sketch: empty bundled HEX gives { ok: false } and the input object is unchanged", () => {
    const original = loadSample(initialUpload());
    const snapshot = structuredClone(original);
    fault.emptyChatHex = true;
    try {
      const r = loadChatSketchSample(original);
      expect(r).toEqual({ ok: false });
    } finally {
      fault.emptyChatHex = false;
    }
    expect(original).toEqual(snapshot);
  });

  it("unjudgeable: a pin map that fails to import gives { ok: false } and the input object is unchanged", () => {
    const original = loadSample(initialUpload());
    const snapshot = structuredClone(original);
    fault.brokenPins = true;
    try {
      const r = loadUnjudgeableSample(original);
      expect(r).toEqual({ ok: false });
    } finally {
      fault.brokenPins = false;
    }
    expect(original).toEqual(snapshot);
  });

  it("the fault switch is off again: both loaders succeed", () => {
    expect(loadChatSketchSample(initialUpload()).ok).toBe(true);
    expect(loadUnjudgeableSample(initialUpload()).ok).toBe(true);
    expect(typeof extra.chatSketchProgram).toBe("function");
  });
});

describe("Program_Section buttons: order and labels (1.1)", () => {
  const row = /el\("div", \{ class: "program-row" \}, \[([^\]]*)\]\)/.exec(SECTION);
  const order = row === null ? [] : (row[1] ?? "").split(",").map((s) => s.trim());

  it("the first program-row lists the five controls in the required order", () => {
    expect(order).toEqual(["hex.node", "sample", "chatSketch", "unjudgeable", "download"]);
  });

  it("each button is built from the required label", () => {
    expect(UPLOAD_COPY.chooseHex).toBe("Choose .hex file");
    expect(UPLOAD_COPY.trySample).toBe("Try the sample");
    expect(UPLOAD_COPY.tryChatSketch).toBe("Try a chat-written sketch");
    expect(UPLOAD_COPY.tryUnjudgeable).toBe("Try one it can't check");
    expect(UPLOAD_COPY.downloadSample).toBe("Download the sample");
    expect(SECTION).toMatch(/const sample = el\("button"[^;]*\[UPLOAD_COPY\.trySample\]\)/);
    expect(SECTION).toMatch(/const chatSketch = el\("button"[^;]*\[UPLOAD_COPY\.tryChatSketch\]\)/);
    expect(SECTION).toMatch(/const unjudgeable = el\("button"[^;]*\[UPLOAD_COPY\.tryUnjudgeable\]\)/);
    expect(SECTION).toMatch(/const download = el\("button"[^;]*\[UPLOAD_COPY\.downloadSample\]\)/);
    expect(SECTION).toMatch(/fileButton\("hex-file", "\.hex", UPLOAD_COPY\.chooseHex/);
  });

  it("each new button calls its own callback", () => {
    expect(SECTION).toMatch(/chatSketch\.addEventListener\("click", \(\) => cb\.onChatSketchSample\(\)\)/);
    expect(SECTION).toMatch(/unjudgeable\.addEventListener\("click", \(\) => cb\.onUnjudgeableSample\(\)\)/);
  });
});

describe("disabled follows busy for all five controls (1.2)", () => {
  const paint = SECTION.slice(SECTION.indexOf("paint(s, d, busy)"));
  it.each([
    ["Choose .hex file (its input)", "hex.input"],
    ["Try the sample", "sample"],
    ["Try a chat-written sketch", "chatSketch"],
    ["Try one it can't check", "unjudgeable"],
    ["Download the sample", "download"],
  ])("%s: %s.disabled = busy inside paint", (_label, name) => {
    expect(paint).toContain(`${name}.disabled = busy;`);
  });
});

describe("sampleDownloads() still returns the same two files (1.6)", () => {
  it("is exactly crosswalk-buggy.hex then crosswalk-pins.json, with the original types and the bundled HEX", () => {
    const files = sampleDownloads();
    expect(files.map((f) => f.name)).toEqual(["crosswalk-buggy.hex", "crosswalk-pins.json"]);
    expect(SAMPLE_HEX_NAME).toBe("crosswalk-buggy.hex");
    expect(SAMPLE_PINS_NAME).toBe("crosswalk-pins.json");
    expect(files.map((f) => f.type)).toEqual(["text/plain", "application/json"]);
    expect(files[0]?.text).toBe(sampleProgram().text);
  });

  it("does not include either new sample's files", () => {
    const names = sampleDownloads().map((f) => f.name);
    expect(names).not.toContain(CHAT_SKETCH_HEX_NAME);
    expect(names).not.toContain(UNJUDGEABLE_HEX_NAME);
    expect(names).toHaveLength(2);
  });
});
