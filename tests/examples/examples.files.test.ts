// File validation tests for examples/: layout, Fixture, rules and meta.
// Reads files only. No emulator runs, no git command, no wall clock.
// Expected values come from requirements.md (Requirements 1, 3-6, 8-12, 17, 22) and design.md sections 1-3.
// Passing tests are evidence, not proof.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { validateFixture } from "../../src/engine/fixture";
import { resolveParams } from "../../src/engine/gremlins/catalogue";
import { isEngineError } from "../../src/engine/errors";
import { analyzeRuleSet } from "../../src/engine/rules/bind";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { readRulesFile } from "../../src/engine/rules/rules-file";
import { render } from "../../src/engine/rules/render";
import type { Fixture } from "../../src/engine/types";
import { BOARD_BRAND_NAMES, EXAMPLES_DIR, exampleIds, loadExample, wholeWordMatches } from "./examples-support";
import type { ExampleId } from "./examples-support";

// ---------------------------------------------------------------------------
// Expected values (spec text only)

const CORE_IDS: string[] = ["crosswalk", "garage", "heartbeat"]; // Requirement 1, criterion 1
const ALL_IDS: string[] = [...CORE_IDS, "heater"]; // Requirement 1, criterion 2

type PinKind = "input" | "output" | "analog";

/** Exact signal set per Example with direction or kind (Requirements 8.1, 9.1, 10.1, 11.1). */
const EXPECTED_SIGNALS: Record<string, Record<string, PinKind>> = {
  crosswalk: {
    REQUEST: "input",
    CAR_GREEN: "output",
    CAR_YELLOW: "output",
    CAR_RED: "output",
    WALK: "output",
    DONT_WALK: "output",
  },
  garage: {
    CLOSE: "input",
    BEAM_CLEAR: "input",
    MOTOR_CLOSE: "output",
    MOTOR_OPEN: "output",
    LAMP: "output",
  },
  heartbeat: { PULSE: "input", HEARTBEAT: "output" },
  heater: { TEMP: "analog", HEATER: "output" },
};

/** Exact rules.txt lines (Requirements 8.2, 9.2, 10.2, 11.2). */
const EXPECTED_LINES: Record<string, string[]> = {
  crosswalk: ["all of (CAR_GREEN is 1, WALK is 1) must never happen."],
  garage: ["Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true."],
  heartbeat: ["HEARTBEAT is 0 must never last 600 ms or longer.", "HEARTBEAT is 1 must never last 600 ms or longer."],
  heater: ["Within 10 ms after TEMP is above 900 becomes true, HEATER is 0 must be true."],
};

/** Per-Example upper bound of `runs` (design.md section 2, "Per-Example upper bound"). */
const RUNS_UPPER_BOUND: Record<string, number> = { crosswalk: 33, garage: 54, heartbeat: 33, heater: 67 };

/** garage texts, design.md section 2 meta.json (Requirement 9, criteria 7, 11, 12). */
const GARAGE_STORY =
  "The door closes by itself after 300 ms open. A cat walks through the beam and its legs break it twice in a few milliseconds. The door keeps closing.";
const GARAGE_TIMING_NOTE =
  "Demo timing: the door closes by itself after 300 ms open and takes 300 ms to close (a real door waits and moves for several seconds).";

const BASE_META_FIELDS = ["campaignSeed", "gremlinSet", "runCycles", "runs", "story", "timingNote", "title"];
const CROSSWALK_WINDOW_FIELDS = ["doublePressWindowEndMs", "doublePressWindowStartMs"];

const RULE_FORMS = ["never", "respond", "count", "hold", "notLongerThan"]; // the five templates (F11)

// F3: which pins each Gremlin targets.
const GREMLIN_TARGET: Record<string, "digital" | "restActive" | "analog"> = {
  masher: "digital",
  bouncer: "digital",
  stuck: "digital",
  dropout: "restActive",
  spike: "analog",
  drifter: "analog",
};

// ---------------------------------------------------------------------------
// Helpers

function idsToCheck(): string[] {
  const present = exampleIds() as string[];
  const set = new Set<string>([...CORE_IDS, ...present.filter((d) => ALL_IDS.includes(d))]);
  return [...set].sort();
}

function fail(id: string, file: string, detail: string): never {
  throw new Error(`examples/${id}/${file}: ${detail}`);
}

function readBytes(id: string, file: string): Buffer {
  try {
    return readFileSync(resolve(EXAMPLES_DIR, id, file));
  } catch (e) {
    return fail(id, file, `cannot read the file (${(e as Error).message})`);
  }
}

function readJson(id: string, file: string): unknown {
  const text = readBytes(id, file).toString("utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    return fail(id, file, `not valid JSON (${(e as Error).message})`);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readFixture(id: string): Fixture {
  const raw = readJson(id, "fixture.json");
  if (!isRecord(raw) || !Array.isArray(raw["pins"])) fail(id, "fixture.json", `must be an object with a "pins" array`);
  return raw as unknown as Fixture;
}

function readRules(id: string) {
  const text = readBytes(id, "rules.txt").toString("utf8");
  const r = readRulesFile(text);
  if (!r.ok) {
    fail(id, "rules.txt", r.reasons.map((reason, i) => `reason ${i + 1}: ${reason}`).join(" | "));
  }
  return r.ruleSet;
}

function readMeta(id: string): Record<string, unknown> {
  const raw = readJson(id, "meta.json");
  if (!isRecord(raw)) fail(id, "meta.json", "must be a JSON object");
  return raw;
}

function intIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function problems(id: string, file: string, list: string[]): void {
  if (list.length > 0) fail(id, file, `${list.length} problem(s): ${list.join("; ")}`);
}

function walkFiles(dir: string, out: string[], dirs: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      dirs.push(p);
      walkFiles(p, out, dirs);
    } else {
      out.push(p);
    }
  }
}

// ---------------------------------------------------------------------------
// Layout (Requirement 1, criteria 1 to 5; D23: no git command)

describe("examples layout", () => {
  const allowedFiles = new Set<string>(["README.md"]);
  for (const id of ALL_IDS) {
    for (const f of ["buggy/buggy.ino", "fixed/fixed.ino", "buggy/buggy.hex", "fixed/fixed.hex", "fixture.json", "rules.txt", "meta.json"]) {
      allowedFiles.add(`${id}/${f}`);
    }
  }

  it("examples/ exists and the three Core_Example directories exist", () => {
    expect(existsSync(EXAMPLES_DIR), "examples/ is missing").toBe(true);
    const present = exampleIds() as string[];
    const missing = CORE_IDS.filter((id) => !present.includes(id));
    expect(missing, `missing Core_Example directories: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no directory directly under examples/ other than the four ids", () => {
    const extra = (exampleIds() as string[]).filter((d) => !ALL_IDS.includes(d));
    expect(extra, `unexpected directories under examples/: ${extra.join(", ")}`).toEqual([]);
  });

  it("holds only allowed files and no build output (filesystem walk)", () => {
    const files: string[] = [];
    const dirs: string[] = [];
    if (existsSync(EXAMPLES_DIR)) walkFiles(EXAMPLES_DIR, files, dirs);
    const rel = (p: string) => relative(EXAMPLES_DIR, p).split("\\").join("/");

    const buildDirs = dirs.map(rel).filter((d) => d.split("/").includes("build"));
    expect(buildDirs, `build folders under examples/: ${buildDirs.join(", ")}`).toEqual([]);

    const compileOutput = files.map(rel).filter((f) => /\.(elf|map|eep)$/i.test(f));
    expect(compileOutput, `compile output under examples/: ${compileOutput.join(", ")}`).toEqual([]);

    const notAllowed = files.map(rel).filter((f) => !allowedFiles.has(f));
    expect(notAllowed, `files under examples/ that are not in the allowed set: ${notAllowed.join(", ")}`).toEqual([]);
  });

  describe.each(idsToCheck())("example %s", (id) => {
    it("has the five data and sketch files", () => {
      const missing = ["buggy/buggy.ino", "fixed/fixed.ino", "fixture.json", "rules.txt", "meta.json"].filter(
        (f) => !existsSync(resolve(EXAMPLES_DIR, id, f)),
      );
      expect(missing, `examples/${id}: missing file(s): ${missing.join(", ")}`).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Per-Example checks

describe.each(idsToCheck())("example %s files", (id) => {
  const expectedSignals = EXPECTED_SIGNALS[id];
  const expectedLines = EXPECTED_LINES[id];

  it("has expectations in this test", () => {
    expect(expectedSignals, `no expected signal set for example ${id}`).toBeDefined();
    expect(expectedLines, `no expected rules lines for example ${id}`).toBeDefined();
  });

  // ---- Fixture (Requirements 4, 3.3, 3.4, 17.1) ---------------------------

  describe("fixture.json", () => {
    it("is valid JSON and validateFixture returns null (17.1, 4.1)", () => {
      const fixture = readFixture(id);
      const err = validateFixture(fixture);
      if (err !== null) fail(id, "fixture.json", `validateFixture returned ${JSON.stringify(err)}`);
    });

    it("maps every Rules signal exactly once and repeats no signal (4.2)", () => {
      const fixture = readFixture(id);
      const ruleSet = readRules(id);
      const plan = analyzeRuleSet(ruleSet, fixture);
      const count = (s: string) => fixture.pins.filter((p) => p.signal === s).length;
      const bad = plan.checkerSignals.filter((s) => count(s) !== 1).map((s) => `${s} mapped ${count(s)} times`);
      const dup = [...new Set(fixture.pins.map((p) => p.signal))].filter((s) => count(s) > 1).map((s) => `${s} repeated`);
      problems(id, "fixture.json", [...bad, ...dup]);
    });

    it("has no clockHz, or clockHz 16,000,000 (4.3)", () => {
      const fixture = readFixture(id);
      const hz = (fixture as { clockHz?: unknown }).clockHz;
      if (hz !== undefined && hz !== 16_000_000) fail(id, "fixture.json", `clockHz is ${String(hz)}`);
    });

    it("holds exactly the expected signals with the expected direction or kind (4.4, 8.1, 9.1, 10.1, 11.1)", () => {
      const fixture = readFixture(id);
      const found: Record<string, string> = {};
      for (const p of fixture.pins as unknown as Record<string, unknown>[]) {
        const kind: string = "kind" in p ? (p["kind"] === "analog" ? "analog" : "bad-kind") : String(p["direction"]);
        found[String(p["signal"])] = kind;
      }
      expect(Object.keys(found).sort(), `examples/${id}/fixture.json: signal set`).toEqual(Object.keys(expectedSignals).sort());
      expect(found, `examples/${id}/fixture.json: direction or kind per signal`).toEqual(expectedSignals);
    });

    it("gives each pin only the keys of its kind (4.5)", () => {
      const fixture = readFixture(id);
      const list: string[] = [];
      (fixture.pins as unknown as Record<string, unknown>[]).forEach((p, i) => {
        const at = `pin ${i} (${String(p["signal"])})`;
        const keys = Object.keys(p);
        if ("kind" in p) {
          // analog pin
          if (p["kind"] !== "analog") list.push(`${at}: kind must be "analog"`);
          if ("direction" in p) list.push(`${at}: analog pin has direction`);
          for (const k of keys) if (!["signal", "kind", "channel", "restLevel"].includes(k)) list.push(`${at}: unknown key ${k}`);
          if (!intIn(p["channel"], 0, 5)) list.push(`${at}: channel must be an integer 0 to 5`);
          if ("restLevel" in p && !intIn(p["restLevel"], 0, 1023)) list.push(`${at}: restLevel must be an integer 0 to 1023`);
        } else {
          for (const k of keys) {
            if (!["signal", "port", "bit", "direction", "activeLevel", "restState"].includes(k)) list.push(`${at}: unknown key ${k}`);
          }
          if (typeof p["signal"] !== "string") list.push(`${at}: signal must be a string`);
          if (!["B", "C", "D"].includes(p["port"] as string)) list.push(`${at}: port must be B, C or D`);
          if (!intIn(p["bit"], 0, 7)) list.push(`${at}: bit must be an integer 0 to 7`);
          if (p["direction"] !== "input" && p["direction"] !== "output") list.push(`${at}: direction must be "input" or "output"`);
          if (p["direction"] !== "input") {
            if ("activeLevel" in p) list.push(`${at}: activeLevel on a non-input`);
            if ("restState" in p) list.push(`${at}: restState on a non-input`);
          }
          if ("activeLevel" in p && p["activeLevel"] !== "low" && p["activeLevel"] !== "high") {
            list.push(`${at}: activeLevel must be "low" or "high"`);
          }
          if ("restState" in p && p["restState"] !== "released" && p["restState"] !== "active") {
            list.push(`${at}: restState must be "released" or "active"`);
          }
        }
      });
      problems(id, "fixture.json", list);
    });

    it("gives no two digital pins the same port and bit (4.6)", () => {
      const fixture = readFixture(id);
      const seen = new Map<string, string>();
      const list: string[] = [];
      for (const p of fixture.pins as unknown as Record<string, unknown>[]) {
        if ("kind" in p) continue;
        const key = `${String(p["port"])}${String(p["bit"])}`;
        const prev = seen.get(key);
        if (prev !== undefined) list.push(`${String(p["signal"])} and ${prev} share P${key}`);
        else seen.set(key, String(p["signal"]));
      }
      problems(id, "fixture.json", list);
    });

    it("uses general I/O pins only: B0-5, C0-5, D0-7 (4.7)", () => {
      const fixture = readFixture(id);
      const list: string[] = [];
      for (const p of fixture.pins as unknown as Record<string, unknown>[]) {
        if ("kind" in p) continue;
        const max = p["port"] === "D" ? 7 : 5;
        if (!["B", "C", "D"].includes(p["port"] as string) || !intIn(p["bit"], 0, max)) {
          list.push(`${String(p["signal"])} on P${String(p["port"])}${String(p["bit"])}`);
        }
      }
      problems(id, "fixture.json", list);
    });

    it("gives every Digital_Input activeLevel low or none, and restState released or none (3.3, 3.4, 9.1, 10.1)", () => {
      const fixture = readFixture(id);
      const list: string[] = [];
      for (const p of fixture.pins as unknown as Record<string, unknown>[]) {
        if ("kind" in p || p["direction"] !== "input") continue;
        if ("activeLevel" in p && p["activeLevel"] !== "low") list.push(`${String(p["signal"])}: activeLevel ${String(p["activeLevel"])}`);
        if ("restState" in p && p["restState"] !== "released") list.push(`${String(p["signal"])}: restState ${String(p["restState"])}`);
      }
      problems(id, "fixture.json", list);
    });

    if (id === "heater") {
      it("heater: TEMP is on ADC channel 0 with no restLevel or one from 0 to 900 (11.1)", () => {
        const fixture = readFixture(id);
        const temp = (fixture.pins as unknown as Record<string, unknown>[]).find((p) => p["signal"] === "TEMP");
        if (temp === undefined) fail(id, "fixture.json", "TEMP is missing");
        if (temp["channel"] !== 0) fail(id, "fixture.json", `TEMP channel is ${String(temp["channel"])}, expected 0`);
        if ("restLevel" in temp && !intIn(temp["restLevel"], 0, 900)) {
          fail(id, "fixture.json", `TEMP restLevel ${String(temp["restLevel"])} is not an integer from 0 to 900`);
        }
      });
    }
  });

  // ---- Rules (Requirement 5, 17.2) ----------------------------------------

  describe("rules.txt", () => {
    it("is UTF-8 with no BOM, LF endings and exactly the expected lines (5.5)", () => {
      const bytes = readBytes(id, "rules.txt");
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail(id, "rules.txt", "starts with a byte-order mark");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return fail(id, "rules.txt", "is not valid UTF-8");
      }
      if (text.includes("\r")) fail(id, "rules.txt", "contains CR; LF line endings only");
      expect(text, `examples/${id}/rules.txt: exact text`).toBe(expectedLines.join("\n") + "\n");
    });

    it("reads with readRulesFile: ok, one Rule per line in order, only the five templates (5.1, 5.7, 17.2)", () => {
      const ruleSet = readRules(id);
      expect(ruleSet.length, `examples/${id}/rules.txt: Rule count`).toBe(expectedLines.length);
      const bad = ruleSet
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => !RULE_FORMS.includes((r as { form: string }).form))
        .map(({ i }) => `Rule ${i}`);
      problems(id, "rules.txt", bad);
    });

    it("renders each Rule back to its line character for character (5.2)", () => {
      const ruleSet = readRules(id);
      const list: string[] = [];
      ruleSet.forEach((rule, i) => {
        const r = render(rule);
        if (!r.ok) list.push(`Rule ${i} (line ${i + 1}): render failed: ${r.reason}`);
        else if (r.sentence !== expectedLines[i]) list.push(`Rule ${i} (line ${i + 1}): rendered "${r.sentence}", expected "${expectedLines[i]}"`);
      });
      problems(id, "rules.txt", list);
    });

    it("compiles with compileRuleSet (5.3)", () => {
      const result = compileRuleSet(readRules(id), readFixture(id));
      if (!result.ok) {
        fail(id, "rules.txt", result.reasons.map((reason, i) => `reason ${i + 1}: ${String(reason)}`).join(" | "));
      }
    });

    it("analyzes with every Rule active and no marks (5.4)", () => {
      const plan = analyzeRuleSet(readRules(id), readFixture(id));
      const list: string[] = [];
      for (const p of plan.plans) {
        if (!p.active) list.push(`Rule ${p.index} (line ${p.index + 1}) is not active`);
        for (const m of p.marks) list.push(`Rule ${p.index} (line ${p.index + 1}): ${m.reason}`);
      }
      problems(id, "rules.txt", list);
    });
  });

  // ---- Meta (Requirements 6, 17.3, 17.4, 17.8, 22) ------------------------

  describe("meta.json", () => {
    it("has exactly the allowed field set (6.1)", () => {
      const meta = readMeta(id);
      const expected = id === "crosswalk" ? [...BASE_META_FIELDS, ...CROSSWALK_WINDOW_FIELDS].sort() : BASE_META_FIELDS;
      expect(Object.keys(meta).sort(), `examples/${id}/meta.json: field set`).toEqual(expected);
    });

    it("has fields of the right type and range (6.1, 6.2, 6.3, 6.5, 6.7)", () => {
      const m = readMeta(id);
      const list: string[] = [];
      const oneLine = (s: string) => !s.includes("\n") && !s.includes("\r");
      if (typeof m["title"] !== "string" || m["title"].length < 1 || m["title"].length > 80 || !oneLine(m["title"])) {
        list.push("title must be a string of 1 to 80 characters with no line break");
      }
      if (typeof m["story"] !== "string" || m["story"].length < 1 || m["story"].length > 300 || !oneLine(m["story"])) {
        list.push("story must be one line of 1 to 300 characters");
      }
      if (typeof m["timingNote"] !== "string") list.push("timingNote must be a string");
      if (!Array.isArray(m["gremlinSet"]) || m["gremlinSet"].length < 1) list.push("gremlinSet must be an array of at least one entry");
      if (!intIn(m["runCycles"], 8_000_000, 16_000_000)) list.push("runCycles must be an integer from 8000000 to 16000000");
      if (!intIn(m["campaignSeed"], 0, 4_294_967_295)) list.push("campaignSeed must be an integer from 0 to 4294967295");
      if (!intIn(m["runs"], 1, RUNS_UPPER_BOUND[id] ?? 0)) list.push(`runs must be an integer from 1 to ${RUNS_UPPER_BOUND[id]}`);
      problems(id, "meta.json", list);
    });

    it("has runCycles at least the largest Window_Cycles of the Rules (6.6)", () => {
      const m = readMeta(id);
      const plan = analyzeRuleSet(readRules(id), readFixture(id));
      let largest = 0;
      for (const p of plan.plans) if (p.windowCycles !== null) largest = Math.max(largest, Number(p.windowCycles));
      if (typeof m["runCycles"] !== "number" || m["runCycles"] < largest) {
        fail(id, "meta.json", `field "runCycles" is ${String(m["runCycles"])}, below the largest Window_Cycles ${largest}`);
      }
    });

    it("has a timingNote that exists, is a string and is not empty after trim (22.1, 22.2, 22.4, 17.8)", () => {
      const m = readMeta(id);
      if (!("timingNote" in m)) fail(id, "meta.json", `field "timingNote" is missing`);
      if (typeof m["timingNote"] !== "string") fail(id, "meta.json", `field "timingNote" is not a string`);
      if (m["timingNote"].trim() === "") fail(id, "meta.json", `field "timingNote" is empty after trim`);
    });

    it("resolves every gremlinSet entry in the catalogue (6.4, 17.3)", () => {
      const m = readMeta(id);
      const set = m["gremlinSet"];
      if (!Array.isArray(set)) return fail(id, "meta.json", `field "gremlinSet" is not an array`);
      const list: string[] = [];
      set.forEach((entry, i) => {
        const r = resolveParams(entry);
        if (isEngineError(r)) list.push(`gremlinSet[${i}] id "${String((entry as { id?: unknown })?.id)}": ${JSON.stringify(r)}`);
      });
      problems(id, "meta.json", list);
    });

    it("gives every Gremlin an eligible pin in the Fixture (12.1)", () => {
      const m = readMeta(id);
      const fixture = readFixture(id);
      const set = m["gremlinSet"] as { id: string }[];
      const pins = fixture.pins as unknown as Record<string, unknown>[];
      const digitalInputs = pins.filter((p) => !("kind" in p) && p["direction"] === "input");
      const eligible = {
        digital: digitalInputs.length,
        restActive: digitalInputs.filter((p) => p["restState"] === "active").length,
        analog: pins.filter((p) => "kind" in p && p["kind"] === "analog").length,
      };
      const list: string[] = [];
      set.forEach((g, i) => {
        const target = GREMLIN_TARGET[g.id];
        if (target === undefined) list.push(`gremlinSet[${i}] id "${g.id}": unknown gremlin`);
        else if (eligible[target] < 1) list.push(`gremlinSet[${i}] id "${g.id}": no eligible ${target} pin`);
      });
      problems(id, "fixture.json", list);
    });

    it("has no Board_Brand_Name and no banned word in title, story or timingNote (6.9, 22.3)", () => {
      const m = readMeta(id);
      const list: string[] = [];
      for (const f of ["title", "story", "timingNote"]) {
        const text = m[f];
        if (typeof text !== "string") continue;
        for (const hit of wholeWordMatches(text, BOARD_BRAND_NAMES)) list.push(`${f}: brand name "${hit.word}" at offset ${hit.offset}`);
        for (const hit of wholeWordMatches(text, BANNED_WORDS)) list.push(`${f}: banned word "${hit.word}" at offset ${hit.offset}`);
      }
      problems(id, "meta.json", list);
    });

    it("loads with loadExample (17.4, 17.7)", () => {
      loadExample(id as ExampleId);
    });

    if (id === "crosswalk") {
      it("crosswalk: Double_Press_Window fields (6.8, 8.3) and a masher entry (8.7)", () => {
        const m = readMeta(id);
        const start = m["doublePressWindowStartMs"];
        const end = m["doublePressWindowEndMs"];
        const list: string[] = [];
        if (!intIn(start, 1, Number.MAX_SAFE_INTEGER)) list.push("doublePressWindowStartMs must be an integer of at least 1");
        if (!intIn(end, 1, Number.MAX_SAFE_INTEGER)) list.push("doublePressWindowEndMs must be an integer");
        if (typeof start === "number" && typeof end === "number") {
          if (!(end > start)) list.push("doublePressWindowEndMs must be greater than doublePressWindowStartMs");
          if (typeof m["runCycles"] === "number" && !(end * 16_000 < m["runCycles"])) list.push("end x 16,000 must be below runCycles");
        }
        // design.md section 2: the window is 60 ms to 240 ms
        if (start !== 60) list.push(`doublePressWindowStartMs is ${String(start)}, design.md gives 60`);
        if (end !== 240) list.push(`doublePressWindowEndMs is ${String(end)}, design.md gives 240`);
        const ids = (m["gremlinSet"] as { id: string }[]).map((g) => g.id);
        if (!ids.includes("masher")) list.push(`gremlinSet ids [${ids.join(", ")}] hold no masher`);
        problems(id, "meta.json", list);
      });
    }

    if (id === "garage") {
      it("garage: gremlinSet is exactly bouncer and masher, no dropout (9.3)", () => {
        const m = readMeta(id);
        const ids = (m["gremlinSet"] as { id: string }[]).map((g) => g.id).sort();
        expect(ids, `examples/${id}/meta.json: gremlinSet ids`).toEqual(["bouncer", "masher"]);
      });

      it("garage: story and timingNote say the door closes by itself after 300 ms open (9.7, 9.11, 9.12)", () => {
        const m = readMeta(id);
        const story = String(m["story"]);
        const note = String(m["timingNote"]);
        const list: string[] = [];
        const words = (t: string, w: string) => wholeWordMatches(t, [w]).length > 0;
        if (!words(story, "cat")) list.push("story lacks the whole word cat");
        if (!words(story, "beam")) list.push("story lacks the whole word beam");
        if (!story.includes("300 ms")) list.push("story lacks 300 ms");
        if (!story.includes("closes by itself after 300 ms open")) list.push("story does not say the door closes by itself after 300 ms open");
        if (!note.includes("300 ms")) list.push("timingNote lacks 300 ms");
        if (!words(note, "demo")) list.push("timingNote lacks the whole word demo");
        if (!note.includes("closes by itself after 300 ms open")) list.push("timingNote does not say the door closes by itself after 300 ms open");
        problems(id, "meta.json", list);
        expect(story, `examples/${id}/meta.json: story text (design.md section 2)`).toBe(GARAGE_STORY);
        expect(note, `examples/${id}/meta.json: timingNote text (design.md section 2)`).toBe(GARAGE_TIMING_NOTE);
      });
    }

    if (id === "heartbeat") {
      it("heartbeat: runCycles 16,000,000, 24 runs and a stuck entry (6.6, 10.4, 10.8)", () => {
        const m = readMeta(id);
        const ids = (m["gremlinSet"] as { id: string }[]).map((g) => g.id);
        const list: string[] = [];
        if (m["runCycles"] !== 16_000_000) list.push(`runCycles is ${String(m["runCycles"])}, expected 16000000`);
        if (m["runs"] !== 24) list.push(`runs is ${String(m["runs"])}, expected 24`);
        if (!ids.includes("stuck")) list.push(`gremlinSet ids [${ids.join(", ")}] hold no stuck`);
        problems(id, "meta.json", list);
      });
    }

    if (id === "heater") {
      it("heater: gremlinSet holds a spike entry (11.3)", () => {
        const m = readMeta(id);
        const ids = (m["gremlinSet"] as { id: string }[]).map((g) => g.id);
        if (!ids.includes("spike")) fail(id, "meta.json", `gremlinSet ids [${ids.join(", ")}] hold no spike`);
      });
    }
  });
});

// ===========================================================================
// Task 10.4: sketch text, sketch-pair diff and repository checks.
// Expected values: requirements.md Requirements 1.13, 2, 3.1, 3.2, 7.1, 9.10, 15.1, 19.12, 20.8, 21.12;
// design.md section 4 (Phase_Constants) and Appendix A.3, A.6, A.9 (A.12 only when heater exists).
// Reads files only. No git command, no emulator.

/** Phase_Constants per Example (design.md section 4). Every one is a file-scope constant of 50 to 300 ms. */
const PHASE_CONSTANTS: Record<string, string[]> = {
  crosswalk: ["YELLOW_MS", "CLEAR_MS", "WALK_MS", "MIN_GREEN_MS"],
  garage: ["CLOSE_MS", "OPEN_MS", "AUTO_CLOSE_MS"],
  heartbeat: ["BEAT_MS"],
  heater: [],
};

/** Debounce and timeout constants that are not Phase_Constants (design.md section 4). */
const NON_PHASE_MS_CONSTANTS: Record<string, string[]> = {
  crosswalk: [],
  garage: ["DEBOUNCE_MS"],
  heartbeat: ["PULSE_TIMEOUT_MS"],
  heater: [],
};

type DiffHunk = { oldStart: number; removed: string[]; added: string[] };

/** Expected line diff buggy to fixed, from design.md Appendix A.3, A.6, A.9 and A.12 (`diff -U0` reading). */
const EXPECTED_DIFF: Record<string, DiffHunk[]> = {
  crosswalk: [
    { oldStart: 1, removed: ["// crosswalk, buggy build"], added: ["// crosswalk, fixed build"] },
    {
      oldStart: 81,
      removed: ["  } else if (pressed && crossing) {", "    walkStart = now;  // a new press restarts the walk countdown"],
      added: [],
    },
  ],
  garage: [
    { oldStart: 1, removed: ["// garage, buggy build"], added: ["// garage, fixed build"] },
    {
      oldStart: 87,
      removed: ["      if (breaks == 1) enter(DOOR_OPENING, now);  // several quick breaks look like noise"],
      added: ["      enter(DOOR_OPENING, now);"],
    },
  ],
  heartbeat: [
    { oldStart: 1, removed: ["// heartbeat, buggy build"], added: ["// heartbeat, fixed build"] },
    {
      oldStart: 41,
      removed: ["    while (digitalRead(PULSE_PIN) == LOW) {  // wait for the pulse to end"],
      added: ["    while (digitalRead(PULSE_PIN) == LOW && millis() - start < PULSE_TIMEOUT_MS) {"],
    },
  ],
  heater: [
    { oldStart: 1, removed: ["// heater, buggy build"], added: ["// heater, fixed build"] },
    { oldStart: 26, removed: [], added: ["  if (index > 9) index = 9;  // 1000..1023 use the last entry"] },
  ],
};

/** Baseline of package.json before task 1 (commit dbd1814^). The spec does not list these entries. */
const BASELINE_DEPENDENCIES: Record<string, string> = { avr8js: "0.21.1" };
const BASELINE_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/node": "20.17.57",
  "fast-check": "4.10.2",
  tsx: "4.19.3",
  typescript: "^5.3.3",
  vite: "5.4.21",
  vitest: "1.6.0",
};

const TESTS_EXAMPLES_DIR = resolve(EXAMPLES_DIR, "..", "tests", "examples");
const REPO_ROOT = resolve(EXAMPLES_DIR, "..");

type SketchVariant = "buggy" | "fixed";
const SKETCH_VARIANTS: SketchVariant[] = ["buggy", "fixed"];

function readSketch(id: string, variant: SketchVariant): string {
  return readBytes(id, `${variant}/${variant}.ino`).toString("utf8");
}

/** Replaces comments with spaces, keeping every offset and line break. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function depthAt(code: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") depth--;
  }
  return depth;
}

/** Range [open, close] of the braces of `void setup() { ... }`, or null. */
function setupBody(code: string): { start: number; end: number } | null {
  const m = /\bvoid\s+setup\s*\(\s*\)\s*\{/.exec(code);
  if (m === null) return null;
  const open = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) return { start: open, end: i };
    }
  }
  return null;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Expected Arduino pin number for a Fixture pin through the map PD0..PD7 = 0..7, PB0..PB5 = 8..13, ADC0..ADC5 = A0..A5 (14..19). */
function mappedPinNumber(p: Record<string, unknown>): number | null {
  if ("kind" in p) return typeof p["channel"] === "number" ? 14 + p["channel"] : null;
  const bit = p["bit"] as number;
  if (p["port"] === "D") return bit;
  if (p["port"] === "B") return 8 + bit;
  return null; // port C digital pins are not in the map
}

/** File-scope `const <type> NAME = <int>;` declarations. */
function fileScopeConsts(code: string): Map<string, { type: string; value: number; offset: number }> {
  const out = new Map<string, { type: string; value: number; offset: number }>();
  const re = /^const\s+([A-Za-z_][A-Za-z0-9_ ]*?)\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (depthAt(code, m.index) !== 0) continue;
    out.set(m[2]!, { type: m[1]!, value: Number(m[3]), offset: m.index });
  }
  return out;
}

/** Line diff by longest common subsequence, reported like `diff -U0`. */
function lineDiff(a: string[], b: string[]): DiffHunk[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const hunks: DiffHunk[] = [];
  let cur: { startI: number; removed: string[]; added: string[] } | null = null;
  const flush = () => {
    if (cur === null) return;
    hunks.push({ oldStart: cur.removed.length === 0 ? cur.startI : cur.startI + 1, removed: cur.removed, added: cur.added });
    cur = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      flush();
      i++;
      j++;
      continue;
    }
    if (cur === null) cur = { startI: i, removed: [], added: [] };
    if (j < m && (i === n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) cur.added.push(b[j++]!);
    else cur.removed.push(a[i++]!);
  }
  flush();
  return hunks;
}

const USART_NAMES =
  /\b(UDR0|UCSR0[ABC]|UBRR0[HL]?|UDRE0|RXC0|TXC0|RXEN0|TXEN0|UCSZ0[012]|U2X0|UPE0|DOR0|RXCIE0|TXCIE0|UDRIE0|USBS0|UMSEL0[01]|UPM0[01]|MPCM0|USART\d?\w*)\b/;

describe.each(idsToCheck())("example %s sketches", (id) => {
  describe.each(SKETCH_VARIANTS)("%s build", (variant) => {
    const file = `${variant}/${variant}.ino`;

    it("has no #include, no Serial and no USART register name (2.1, 2.2)", () => {
      const raw = readSketch(id, variant);
      const code = stripComments(raw);
      const list: string[] = [];
      raw.split("\n").forEach((line, i) => {
        if (/^\s*#\s*include\b/.test(line)) list.push(`line ${i + 1}: #include directive`);
      });
      const serial = /\bSerial\d?\b/.exec(code);
      if (serial !== null) list.push(`line ${lineOf(code, serial.index)}: Serial`);
      const usart = USART_NAMES.exec(code);
      if (usart !== null) list.push(`line ${lineOf(code, usart.index)}: USART name ${usart[0]}`);
      problems(id, file, list);
    });

    it("begins with a // header naming the Example id, one of buggy or fixed, and one line per Fixture signal (2.5)", () => {
      const raw = readSketch(id, variant);
      const lines = raw.split("\n");
      const header: string[] = [];
      for (const line of lines) {
        if (!line.startsWith("//")) break;
        header.push(line);
      }
      const list: string[] = [];
      if (header.length === 0) list.push("the file does not begin with a block of // lines");
      const headerText = header.join("\n");
      if (wholeWordMatches(headerText, [id]).length < 1) list.push(`header lacks the Example id "${id}"`);
      const builds = wholeWordMatches(headerText, ["buggy", "fixed"]);
      if (builds.length !== 1) list.push(`header holds ${builds.length} of the words buggy or fixed, expected exactly 1`);
      else if (builds[0]!.word.toLowerCase() !== variant) list.push(`header says "${builds[0]!.word}", file is the ${variant} build`);
      for (const p of readFixture(id).pins as unknown as Record<string, unknown>[]) {
        const signal = String(p["signal"]);
        const re = new RegExp(`^//\\s+${signal}\\s+(\\S+)\\s+(.*)$`);
        const found = header.map((l) => re.exec(l)).filter((m): m is RegExpExecArray => m !== null);
        if (found.length !== 1) {
          list.push(`${signal}: ${found.length} pin lines in the header, expected 1`);
          continue;
        }
        const [, token, rest] = found[0]!;
        if ("kind" in p) {
          if (token !== `ADC${String(p["channel"])}` && token !== `PC${String(p["channel"])}`) {
            list.push(`${signal}: header gives "${token}", expected ADC${String(p["channel"])}`);
          }
          if (!/\banalog\b/.test(rest!)) list.push(`${signal}: header line does not say analog`);
        } else {
          const expectedToken = `P${String(p["port"])}${String(p["bit"])}`;
          if (token !== expectedToken) list.push(`${signal}: header gives "${token}", expected ${expectedToken}`);
          if (!new RegExp(`^${String(p["direction"])}\\b`).test(rest!)) {
            list.push(`${signal}: header line does not give direction ${String(p["direction"])}`);
          }
        }
      }
      problems(id, file, list);
    });

    it("declares its Phase_Constants at file scope, 50 to 300 ms, and no other timing constant outside design.md section 4 (2.3)", () => {
      const consts = fileScopeConsts(stripComments(readSketch(id, variant)));
      const list: string[] = [];
      for (const name of PHASE_CONSTANTS[id] ?? []) {
        const c = consts.get(name);
        if (c === undefined) list.push(`${name}: not declared as a file-scope constant`);
        else if (c.value < 50 || c.value > 300) list.push(`${name} is ${c.value} ms, outside 50 to 300`);
      }
      const known = new Set([...(PHASE_CONSTANTS[id] ?? []), ...(NON_PHASE_MS_CONSTANTS[id] ?? [])]);
      for (const name of consts.keys()) {
        if (name.endsWith("_MS") && !known.has(name)) list.push(`${name}: file-scope _MS constant not named in design.md section 4`);
      }
      problems(id, file, list);
    });

    it("takes pin numbers only from the Fixture through the pin map (2.4, 2.7)", () => {
      const code = stripComments(readSketch(id, variant));
      const raw = readSketch(id, variant);
      const fixturePins = readFixture(id).pins as unknown as Record<string, unknown>[];
      const list: string[] = [];

      // Declared pin constants: `const uint8_t NAME_PIN = n;  // PXn ...`
      const declared = new Map<string, number>();
      const declRe = /^const\s+uint8_t\s+([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*;[ \t]*(?:\/\/[ \t]*(\S*))?/gm;
      let dm: RegExpExecArray | null;
      const rawDecls: { name: string; value: number; tag: string | undefined }[] = [];
      while ((dm = declRe.exec(raw)) !== null) {
        if (depthAt(code, dm.index) !== 0) continue;
        rawDecls.push({ name: dm[1]!, value: Number(dm[2]), tag: dm[3] });
      }
      const digitalExpected = new Map<string, number>(); // port+bit tag -> number
      for (const p of fixturePins) {
        if ("kind" in p) continue;
        const n = mappedPinNumber(p);
        if (n === null) list.push(`${String(p["signal"])}: P${String(p["port"])}${String(p["bit"])} is not in the pin map`);
        else digitalExpected.set(`P${String(p["port"])}${String(p["bit"])}`, n);
      }
      const seenTags = new Set<string>();
      for (const d of rawDecls) {
        if (!d.name.endsWith("_PIN") || d.name === "NO_PIN") continue;
        const want = d.tag === undefined ? undefined : digitalExpected.get(d.tag);
        if (want === undefined) list.push(`${d.name}: comment tag "${d.tag ?? ""}" names no Fixture pin`);
        else {
          if (d.value !== want) list.push(`${d.name} is ${d.value}, the map gives ${want} for ${d.tag}`);
          if (seenTags.has(d.tag!)) list.push(`${d.name}: ${d.tag} declared twice`);
          seenTags.add(d.tag!);
        }
        declared.set(d.name, d.value);
      }
      for (const tag of digitalExpected.keys()) {
        if (!seenTags.has(tag)) list.push(`Fixture pin ${tag} has no pin constant in the sketch`);
      }

      // Every pinMode, digitalRead and digitalWrite uses a declared constant, an allowed literal or a parameter.
      const allowedNumbers = new Set<number>(digitalExpected.values());
      const callRe = /\b(pinMode|digitalRead|digitalWrite)\s*\(\s*([^,)]+?)\s*[,)]/g;
      let cm: RegExpExecArray | null;
      while ((cm = callRe.exec(code)) !== null) {
        const arg = cm[2]!;
        const at = `line ${lineOf(code, cm.index)}: ${cm[1]}(${arg}...)`;
        if (/^[A-Z][A-Z0-9_]*$/.test(arg)) {
          if (!declared.has(arg)) list.push(`${at}: ${arg} is not a pin constant of this sketch`);
        } else if (/^\d+$/.test(arg)) {
          if (!allowedNumbers.has(Number(arg))) list.push(`${at}: pin ${arg} is not a Fixture pin`);
        } else if (/^A\d$/.test(arg)) {
          list.push(`${at}: analog name used with a digital call`);
        } else if (!/^[a-z][A-Za-z0-9_]*$/.test(arg)) {
          list.push(`${at}: argument form not understood`);
        }
      }

      // Every Fixture digital pin is configured in the Fixture's direction.
      for (const p of fixturePins) {
        if ("kind" in p) continue;
        const name = [...declared.entries()].find(([, v]) => v === mappedPinNumber(p))?.[0];
        if (name === undefined) continue;
        const mode = p["direction"] === "input" ? "INPUT_PULLUP" : "OUTPUT";
        if (!new RegExp(`\\bpinMode\\s*\\(\\s*${name}\\s*,\\s*${mode}\\s*\\)`).test(code)) {
          list.push(`${String(p["signal"])}: no pinMode(${name}, ${mode})`);
        }
      }

      // Analog reads use only the Fixture's ADC channels.
      const channels = new Set<number>(
        fixturePins.filter((p) => "kind" in p).map((p) => p["channel"] as number),
      );
      const readChannels = new Set<number>();
      const aRe = /\banalogRead\s*\(\s*([^)]+?)\s*\)/g;
      let am: RegExpExecArray | null;
      while ((am = aRe.exec(code)) !== null) {
        const arg = am[1]!;
        let ch: number | null = null;
        if (/^A[0-5]$/.test(arg)) ch = Number(arg.slice(1));
        else if (/^\d+$/.test(arg)) ch = Number(arg) >= 14 ? Number(arg) - 14 : Number(arg);
        else if (declared.has(arg)) ch = declared.get(arg)! >= 14 ? declared.get(arg)! - 14 : declared.get(arg)!;
        if (ch === null || !channels.has(ch)) list.push(`line ${lineOf(code, am.index)}: analogRead(${arg}) is not a Fixture ADC channel`);
        else readChannels.add(ch);
      }
      for (const ch of channels) if (!readChannels.has(ch)) list.push(`ADC channel ${ch} is never read`);
      problems(id, file, list);
    });

    it("sets INPUT_PULLUP on every Digital_Input before its earliest read (3.1, 3.2)", () => {
      const code = stripComments(readSketch(id, variant));
      const body = setupBody(code);
      if (body === null) return fail(id, file, "no void setup() found");
      const consts = fileScopeConsts(code);
      const list: string[] = [];
      for (const p of readFixture(id).pins as unknown as Record<string, unknown>[]) {
        if ("kind" in p || p["direction"] !== "input") continue;
        const signal = String(p["signal"]);
        const num = mappedPinNumber(p);
        const name = [...consts.entries()].find(([n, c]) => n.endsWith("_PIN") && c.value === num)?.[0];
        if (name === undefined) {
          list.push(`${signal}: no pin constant`);
          continue;
        }
        const pull = new RegExp(`\\bpinMode\\s*\\(\\s*${name}\\s*,\\s*INPUT_PULLUP\\s*\\)`).exec(code);
        if (pull === null) {
          list.push(`${signal}: no pinMode(${name}, INPUT_PULLUP)`);
          continue;
        }
        if (pull.index < body.start || pull.index > body.end) list.push(`${signal}: INPUT_PULLUP is set outside setup()`);
        const readRe = new RegExp(`\\bdigitalRead\\s*\\(\\s*${name}\\b`, "g");
        let rm: RegExpExecArray | null;
        let reads = 0;
        while ((rm = readRe.exec(code)) !== null) {
          reads++;
          if (depthAt(code, rm.index) === 0) list.push(`${signal}: read at file scope on line ${lineOf(code, rm.index)}`);
          else if (rm.index >= body.start && rm.index <= body.end && rm.index < pull.index) {
            list.push(`${signal}: read on line ${lineOf(code, rm.index)} before INPUT_PULLUP on line ${lineOf(code, pull.index)}`);
          }
        }
        if (reads === 0) list.push(`${signal}: never read`);
      }
      problems(id, file, list);
    });
  });

  it("buggy and fixed declare the same file-scope constants (Phase_Constants, pins) (2.6)", () => {
    const b = fileScopeConsts(stripComments(readSketch(id, "buggy")));
    const f = fileScopeConsts(stripComments(readSketch(id, "fixed")));
    const strip = (m: Map<string, { type: string; value: number }>) =>
      Object.fromEntries([...m.entries()].map(([k, v]) => [k, `${v.type} ${v.value}`]));
    expect(strip(f), `examples/${id}: fixed constants differ from buggy`).toEqual(strip(b));
  });

  it("differs between buggy and fixed only by the lines of design.md Appendix A (20.8, 2.6)", () => {
    const a = readSketch(id, "buggy").split("\n");
    const b = readSketch(id, "fixed").split("\n");
    expect(lineDiff(a, b), `examples/${id}: line diff buggy to fixed`).toEqual(EXPECTED_DIFF[id]);
  });
});

describe("repository checks", () => {
  it("no Core_Example test file mentions heater (1.13)", () => {
    // Core_Example test files: examples.<crosswalk|garage|heartbeat>.test.ts (requirements.md 1.13: "No Core_Example test SHALL read a file under examples/heater/").
    // examples.files.test.ts and examples.brand.test.ts run over the Examples that exist, so they are not Core_Example test files.
    const hits: string[] = [];
    for (const idc of CORE_IDS) {
      const name = `examples.${idc}.test.ts`;
      const text = readFileSync(resolve(TESTS_EXAMPLES_DIR, name), "utf8");
      text.split("\n").forEach((line, i) => {
        if (/heater/i.test(line)) hits.push(`${name}:${i + 1}`);
      });
    }
    expect(hits, `Core_Example test files that mention heater: ${hits.join(", ")}`).toEqual([]);
  });

  it('package.json has the examples:build script and the dependencies it had before task 1 (7.1, 19.12)', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.scripts?.["examples:build"], "package.json scripts.examples:build").toBe("node scripts/build-examples.mjs");
    expect(pkg.dependencies, "package.json dependencies").toEqual(BASELINE_DEPENDENCIES);
    expect(pkg.devDependencies, "package.json devDependencies").toEqual(BASELINE_DEV_DEPENDENCIES);
  });

  it("every example test file that runs an emulator uses TEST_TIMEOUT_MS and no literal timeout (15.1, D25)", () => {
    const emulatorApi = /\b(runExampleCampaign|scriptedRun|replayRun|createCampaign|EmulatorBridge)\b/;
    const files = readdirSync(TESTS_EXAMPLES_DIR).filter((f) => f.endsWith(".test.ts") && f !== "examples.files.test.ts");
    const list: string[] = [];
    let scanned = 0;
    for (const f of files) {
      const code = stripComments(readFileSync(resolve(TESTS_EXAMPLES_DIR, f), "utf8"));
      if (!emulatorApi.test(code)) continue;
      scanned++;
      if (!/\bTEST_TIMEOUT_MS\b/.test(code)) list.push(`${f}: runs an emulator but never names TEST_TIMEOUT_MS`);
      const bad: [RegExp, string][] = [
        [/\btimeout\s*:\s*(?!\s|TEST_TIMEOUT_MS\b)/g, "timeout option that is not TEST_TIMEOUT_MS"],
        [/\btestTimeout\b|\bsetConfig\b/g, "timeout configuration"],
        [/\}\s*,\s*[0-9][0-9_]*\s*\)\s*;?/g, "numeric last argument after a callback"],
        [/^\s*[0-9][0-9_]*,?\s*\)\s*;/gm, "numeric last argument on its own line"],
      ];
      for (const [re, what] of bad) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(code)) !== null) list.push(`${f}:${lineOf(code, m.index)}: ${what}`);
      }
    }
    expect(scanned, "no example test file that runs an emulator was found").toBeGreaterThan(0);
    expect(list, `timeout problems: ${list.join("; ")}`).toEqual([]);
  });
});
