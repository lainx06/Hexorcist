// Feature: bench-ui-upload. Copy scan of every new upload string (Requirement 16): banned words, board brand
// names, rank words, board pin numbers, and a raw scan of every added or changed file. The word lists are
// imported, never written here. Passing is evidence, not proof.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { CAPABILITY_COPY, capabilityContent, notModelledList } from "../../src/ui/app/model/capability";
import { portBitText, removeButtonLabel } from "../../src/ui/app/model/pin-table";
import type { PinRow } from "../../src/ui/app/model/pin-table";
import { plainStory } from "../../src/ui/app/model/plain-story";
import { stripPhrase } from "../../src/ui/app/model/strip";
import {
  HEX_ERROR_TEXT,
  IMPORT_ERROR_TEXT,
  PIN_LEVELS_TEXT,
  ROW_ERROR_TEXT,
  TABLE_ERROR_TEXT,
  UPLOAD_COPY,
} from "../../src/ui/app/model/upload-copy";
import { RUN_LENGTH_MESSAGE } from "../../src/ui/app/model/upload-fields";
import { hexErrorText, sizeText } from "../../src/ui/app/model/upload-hex";
import { unmappedSignalText } from "../../src/ui/app/model/upload-rule";
import { gremlinOrderLine, uploadLabels } from "../../src/ui/app/model/upload-state";
import { RUN_LENGTH_LABEL } from "../../src/ui/app/views/run-length-field";
import { BOARD_BRAND_NAMES, wholeWordMatches } from "../examples/examples-support";

const ROOT = resolve(__dirname, "..", "..");

const WORDS: readonly string[] = [
  ...BANNED_WORDS,
  ...BANNED_WORDS.filter((w) => w.includes("-")).map((w) => w.replace(/-/g, "")),
  ...BOARD_BRAND_NAMES,
  "safety",
];
const RANK_WORDS = ["shortest", "smallest", "minimal", "minimum", "optimal"] as const;
const SMALLEST_PHRASE = "The smallest replay this reducer found.";
const PIN_NUMBER: readonly RegExp[] = [/(?<![A-Za-z0-9])(D(?:1[0-3]|[0-9])|A[0-7])(?![A-Za-z0-9])/, /\bpin \d+/i];

/** One sample call per function-valued key path, so no text function is left unscanned. */
const SAMPLES: Readonly<Record<string, (f: (...a: never[]) => unknown) => unknown>> = {
  "HEX_ERROR_TEXT.checksum": (f) => (f as (n: string) => string)("12"),
  "HEX_ERROR_TEXT.badRecord": (f) => (f as (n: string) => string)("3"),
  "ROW_ERROR_TEXT.duplicateSignal": (f) => (f as (s: string) => string)("LED"),
  "ROW_ERROR_TEXT.duplicatePortBit": (f) => (f as (s: string) => string)(portBitText("D", 2)),
  "ROW_ERROR_TEXT.port": (f) => (f as (s: string) => string)("E"),
  "ROW_ERROR_TEXT.bit": (f) => (f as (s: string) => string)("9"),
  "IMPORT_ERROR_TEXT.analog": (f) => (f as (n: number) => string)(7),
  "IMPORT_ERROR_TEXT.entrySignal": (f) => (f as (n: number) => string)(2),
  "IMPORT_ERROR_TEXT.entryDigital": (f) => (f as (n: number) => string)(2),
  "IMPORT_ERROR_TEXT.entryPlainName": (f) => (f as (n: number) => string)(2),
  "IMPORT_ERROR_TEXT.entryField": (f) => (f as (n: number, s: string, k: string) => string)(2, "LED", "restLevel"),
  "CAPABILITY_COPY.floatingNamed": (f) => (f as (s: string) => string)("Button"),
};

const TABLES: Readonly<Record<string, unknown>> = {
  UPLOAD_COPY,
  HEX_ERROR_TEXT,
  ROW_ERROR_TEXT,
  TABLE_ERROR_TEXT,
  IMPORT_ERROR_TEXT,
  PIN_LEVELS_TEXT,
  CAPABILITY_COPY,
  RUN_LENGTH_MESSAGE,
  RUN_LENGTH_LABEL,
  notModelledList: notModelledList(),
};

/** Every string at every depth, with its key path; function values are called through SAMPLES. */
function strings(v: unknown, path: string, missing: string[]): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (typeof v === "function") {
    const s = SAMPLES[path];
    if (s === undefined) {
      missing.push(path);
      return [];
    }
    return strings(s(v as (...a: never[]) => unknown), path, missing);
  }
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${String(i)}]`, missing));
  if (typeof v === "object" && v !== null) return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`, missing));
  return [];
}

const row = (signal: string, plainName: string, direction: "input" | "output"): PinRow => ({
  kind: "digital",
  id: 1,
  signal,
  plainName,
  port: "D",
  bit: 2,
  direction,
  pressed: "low",
});

/** Outputs of the new text functions, with neutral user names. */
function functionOutputs(): [string, string][] {
  const rows = [row("BTN", "Front button", "input"), row("LAMP_A", "", "output")];
  const labels = uploadLabels(rows);
  const fixture = { pins: [{ signal: "BTN", port: "D" as const, bit: 2 as const, direction: "input" as const, activeLevel: "low" as const }] };
  const list = [
    { cycle: 1000, signal: "BTN", value: 0 as const, gremlinId: "masher" },
    { cycle: 2000, signal: "BTN", value: "release" as const, gremlinId: "masher" },
  ];
  const content = capabilityContent({
    verdict: { verdict: "COULDN'T TELL", reason: "input BTN was read while floating; an input was read while floating" },
    labels,
  });
  return [
    ["sizeText(500)", sizeText(500)],
    ["sizeText(1280)", sizeText(1280)],
    ["portBitText", portBitText("D", 2)],
    ...["empty HEX string", "checksum mismatch at line 4", "line 2 is too short", "unknown record type 0x04", "unknown record type 0x05", "flash overflow: x", "other"].map(
      (m): [string, string] => [`hexErrorText(${m})`, hexErrorText(m)],
    ),
    ["unmappedSignalText", unmappedSignalText("LAMP_B")],
    ["gremlinOrderLine", gremlinOrderLine(["bouncer", "masher"]) ?? ""],
    ["removeButtonLabel(named)", removeButtonLabel(rows[0] as PinRow, 1)],
    ["removeButtonLabel(blank)", removeButtonLabel(row("", "", "input"), 3)],
    ["plainStory(upload)", plainStory({ reducedList: list, fixture, v: 40_000, storyEnding: "the program broke your rule.", spanSentence: "It stayed that way for another <Plain_Ms>.", labels })],
    ["stripPhrase(upload)", stripPhrase(list, 0, fixture, labels)],
    ...strings(content, "capabilityContent", []),
  ];
}

/** Every file added or changed under src/ui/app by this feature, and index.html. */
const FILES = [
  "src/ui/app/model/upload-copy.ts",
  "src/ui/app/model/upload-hex.ts",
  "src/ui/app/model/pin-table.ts",
  "src/ui/app/model/pin-map-file.ts",
  "src/ui/app/model/upload-rule.ts",
  "src/ui/app/model/upload-fields.ts",
  "src/ui/app/model/upload-state.ts",
  "src/ui/app/model/signal-labels.ts",
  "src/ui/app/model/pin-levels.ts",
  "src/ui/app/model/capability.ts",
  "src/ui/app/model/plain-story.ts",
  "src/ui/app/model/moves.ts",
  "src/ui/app/model/strip.ts",
  "src/ui/app/model/gremlin-picker.ts",
  "src/ui/app/model/story-input.ts",
  "src/ui/app/data/upload-sample.ts",
  "src/ui/app/views/program-section.ts",
  "src/ui/app/views/pin-table.ts",
  "src/ui/app/views/file-io.ts",
  "src/ui/app/views/run-length-field.ts",
  "src/ui/app/views/scene-pin-levels.ts",
  "src/ui/app/views/capability-panel.ts",
  "src/ui/app/views/signal-label.ts",
  "src/ui/app/views/app-page.ts",
  "src/ui/app/views/setup.ts",
  "src/ui/app/views/stage.ts",
  "src/ui/app/views/scene-chrome.ts",
  "src/ui/app/views/aside.ts",
  "src/ui/app/views/verdict-card.ts",
  "src/ui/app/views/tabs.ts",
  "src/ui/app/views/timeline.ts",
  "src/ui/app/views/picker.ts",
  "src/ui/app/views/rule-box.ts",
  "src/ui/app/views/move-strip.ts",
  "src/ui/app/views/panels.ts",
  "src/ui/app/views/icons.ts",
  "src/ui/app/app.css",
  "index.html",
] as const;

describe("upload copy scan (Requirement 16)", () => {
  it("every table exists, holds strings and has a sample for each text function", () => {
    const missing: string[] = [];
    for (const [name, t] of Object.entries(TABLES)) {
      expect(t, `${name} is missing`).toBeDefined();
      expect(strings(t, name, missing).length, `${name} holds no string`).toBeGreaterThan(0);
    }
    expect(missing, `no SAMPLES entry for: ${missing.join(", ")}`).toEqual([]);
  });

  it("no banned word, brand name, rank word or board pin number in the upload strings", () => {
    const all = [...Object.entries(TABLES).flatMap(([n, t]) => strings(t, n, [])), ...functionOutputs()];
    const found: string[] = [];
    for (const [path, s] of all) {
      for (const m of wholeWordMatches(s, WORDS)) found.push(`${path}: ${m.word}`);
      for (const m of wholeWordMatches(s.split(SMALLEST_PHRASE).join(""), RANK_WORDS)) found.push(`${path}: ${m.word}`);
      for (const re of PIN_NUMBER) {
        const m = re.exec(s);
        if (m !== null) found.push(`${path}: board pin number ${m[0]}`);
      }
    }
    expect(all.length).toBeGreaterThan(40);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the added and changed files hold no listed word, write the chip as ATmega328P and hold no guard marker", () => {
    const found: string[] = [];
    for (const f of FILES) {
      const p = join(ROOT, f);
      expect(existsSync(p), `${f} is missing`).toBe(true);
      const text = readFileSync(p, "utf8");
      for (const m of wholeWordMatches(text, WORDS)) found.push(`${f}:${String(m.line)}: ${m.word}`);
      for (const m of text.matchAll(/atmega/gi)) {
        if (text.slice(m.index ?? 0, (m.index ?? 0) + 10) !== "ATmega328P") found.push(`${f}: ${m[0]} is not ATmega328P`);
      }
      if (text.includes("guard-" + "allow")) found.push(`${f}: guard marker`);
    }
    expect(found, found.join("\n")).toEqual([]);
  });
});