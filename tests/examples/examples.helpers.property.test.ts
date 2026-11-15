// Unit tests for the shared example helpers (task 3.10).
// Property tests for the Brand_Matcher, violationSpan, bothOnAt and outputLevelAt are at the end (3.6 to 3.8).
// The buildScriptedEvents property (3.9) is not written.
// No wall clock, no randomness.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexToProgMem } from "../../src/engine/hex-parser";
import type { OutputEvent } from "../../src/engine/types";
import type { Condition, Rule } from "../../src/engine/rules/ir";
import {
  BOARD_BRAND_NAMES,
  DoorPatternError,
  EXAMPLES_DIR,
  ExampleDataError,
  MissingHexError,
  TEST_TIMEOUT_MS,
  bothOnAt,
  buildScriptedEvents,
  doorStateChanges,
  exampleIds,
  loadExample,
  outputLevelAt,
  readHex,
  runExampleCampaign,
  spanLine,
  violationSpan,
  wholeWordMatches,
} from "./examples-support";
import type { ExampleId, LoadedExample, Variant } from "./examples-support";

const asId = (s: string): ExampleId => s as ExampleId;
const edge = (signal: string, value: 0 | 1, cycle: number): OutputEvent => ({ signal, value, cycle });

describe("readHex: missing Build_HEX", () => {
  it("names the path and npm run examples:build", () => {
    let err: unknown;
    try {
      readHex(asId("zz-no-such-example"), "buggy");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingHexError);
    const msg = (err as Error).message;
    expect(msg).toContain("examples/zz-no-such-example/buggy/buggy.hex");
    expect(msg).toContain("npm run examples:build");
  });
});

describe("loadExample: missing or broken data", () => {
  it("a missing fixture.json names the Example id and the file", () => {
    let err: unknown;
    try {
      loadExample(asId("zz-no-such-example"));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ExampleDataError);
    const msg = (err as Error).message;
    expect(msg).toContain("zz-no-such-example");
    expect(msg).toContain("fixture.json");
  });

  // These tests make a throwaway root folder under os.tmpdir() and remove it in a finally block.
  // Nothing is created under examples/.
  function withTempExample(files: Record<string, string>, fn: (id: ExampleId, root: string) => void): void {
    const root = mkdtempSync(join(tmpdir(), "hexorcist-"));
    try {
      const name = "tmp-example";
      const dir = resolve(root, name);
      mkdirSync(dir, { recursive: true });
      for (const [f, text] of Object.entries(files)) writeFileSync(resolve(dir, f), text);
      fn(asId(name), root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function loadError(id: ExampleId, root: string): ExampleDataError {
    try {
      loadExample(id, root);
    } catch (e) {
      expect(e).toBeInstanceOf(ExampleDataError);
      return e as ExampleDataError;
    }
    throw new Error("loadExample did not throw");
  }

  it("a fixture.json that is not JSON names the Example id and the file", () => {
    withTempExample({ "fixture.json": "{ not json" }, (id, root) => {
      const e = loadError(id, root);
      expect(e.message).toContain(id);
      expect(e.message).toContain("fixture.json");
      expect(e.file).toBe("fixture.json");
    });
  });

  it("a meta.json that is not JSON names the Example id and the file", () => {
    withTempExample({ "fixture.json": '{"pins":[]}', "meta.json": "nope" }, (id, root) => {
      const e = loadError(id, root);
      expect(e.message).toContain(id);
      expect(e.message).toContain("meta.json");
    });
  });

  it("a broken meta field names the field", () => {
    const meta = {
      title: "t",
      story: "s",
      timingNote: "n",
      gremlinSet: [{ id: "masher" }],
      runCycles: "many",
      campaignSeed: 1,
      runs: 1,
    };
    withTempExample({ "fixture.json": '{"pins":[]}', "meta.json": JSON.stringify(meta) }, (id, root) => {
      const e = loadError(id, root);
      expect(e.message).toContain("meta.json");
      expect(e.message).toContain("runCycles");
    });
  });
});

describe("runExampleCampaign: error message", () => {
  it("names the Example, the build and the reasons when the config cannot be built", { timeout: TEST_TIMEOUT_MS }, () => {
    const ex: LoadedExample = {
      id: "crosswalk",
      fixture: {
        pins: [
          { signal: "BTN", port: "D", bit: 2, direction: "input" },
          { signal: "LED", port: "B", bit: 5, direction: "output" },
        ],
      },
      rulesText: "",
      ruleSet: [{ form: "never", condition: { op: "eq", signal: "LED", value: 1 } }],
      lines: [],
      meta: { title: "t", story: "s", timingNote: "n", gremlinSet: [{ id: "masher" }], runCycles: 1000, campaignSeed: 1, runs: 0 },
    };
    let err: unknown;
    try {
      runExampleCampaign(ex, "buggy");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toContain("crosswalk");
    expect(msg).toContain("buggy build");
    // runs: 0 passes the config builder and fails in createCampaign with a CampaignError.
    expect(msg).toContain("createCampaign returned an error");
    expect(msg).toContain("runs must be a positive integer, got 0");
  });

  it("names the Example, the build and the reasons when the rule set does not compile", { timeout: TEST_TIMEOUT_MS }, () => {
    const ex: LoadedExample = {
      id: "crosswalk",
      fixture: { pins: [{ signal: "LED", port: "B", bit: 5, direction: "output" }] },
      rulesText: "",
      ruleSet: [],
      lines: [],
      meta: { title: "t", story: "s", timingNote: "n", gremlinSet: [{ id: "masher" }], runCycles: 1000, campaignSeed: 1, runs: 1 },
    };
    let err: unknown;
    try {
      runExampleCampaign(ex, "fixed");
    } catch (e) {
      err = e;
    }
    const msg = (err as Error).message;
    expect(msg).toContain("Example crosswalk, fixed build");
    expect(msg).toContain("could not be built. Reasons:");
    expect(msg).toContain("rules");
  });
});

describe("buildScriptedEvents: rejections", () => {
  const fixture = { pins: [{ signal: "BTN", port: "D" as const, bit: 2 as const, direction: "input" as const }] };
  it("rejects a cycle outside 0 to runCycles - 1 and names the event and the cycle", () => {
    expect(() => buildScriptedEvents(fixture, [{ signal: "BTN", value: 0, cycle: 1000 }], 1000)).toThrow(/event 0 \(BTN\).*1000/);
    expect(() => buildScriptedEvents(fixture, [{ signal: "BTN", value: 0, cycle: -1 }], 1000)).toThrow(/-1/);
    expect(() => buildScriptedEvents(fixture, [{ signal: "BTN", value: 0, cycle: 1.5 }], 1000)).toThrow(/1\.5/);
  });
  it("rejects a decreasing cycle order", () => {
    expect(() =>
      buildScriptedEvents(
        fixture,
        [
          { signal: "BTN", value: 0, cycle: 500 },
          { signal: "BTN", value: "release", cycle: 400 },
        ],
        1000,
      ),
    ).toThrow(/event 1.*400.*500/);
  });
  it("puts Rest_Events first, then the scripted events with gremlinId script", () => {
    const fx = { pins: [{ signal: "BTN", port: "D" as const, bit: 2 as const, direction: "input" as const, restState: "active" as const }] };
    const out = buildScriptedEvents(fx, [{ signal: "BTN", value: "release", cycle: 10 }], 100);
    expect(out.map((e) => e.gremlinId)).toEqual(["rest", "script"]);
    expect(out[0].cycle).toBe(0);
  });
});

describe("span and overlap helpers", () => {
  const rule: Rule = {
    form: "never",
    condition: { op: "all", of: [{ op: "eq", signal: "CAR_GREEN", value: 1 }, { op: "eq", signal: "WALK", value: 1 }] },
  };
  const edges = [edge("CAR_GREEN", 1, 50), edge("WALK", 1, 100), edge("WALK", 0, 5000)];

  it("violationSpan ends at the first edge that breaks the condition", () => {
    expect(violationSpan(rule, 100, edges, 40_000)).toEqual({ v: 100, end: 5000, spanCycles: 4900, cutByReplayEnd: false });
  });
  it("violationSpan is cut by the replay end and ignores edges at or after it", () => {
    expect(violationSpan(rule, 100, edges, 3000)).toEqual({ v: 100, end: 3000, spanCycles: 2900, cutByReplayEnd: true });
    expect(violationSpan(rule, 100, edges, 5000).cutByReplayEnd).toBe(true);
  });
  it("spanLine holds the id, sentence, v, cycles, ms with 3 decimals and the cut flag", () => {
    const line = spanLine("crosswalk buggy", "S.", { v: 100, end: 5000, spanCycles: 4900, cutByReplayEnd: false });
    expect(line).toBe("span crosswalk buggy | S. | v=100 | 4900 cycles | 0.306 ms | cut by replay end: no");
    const cut = spanLine("x", "S.", { v: 1, end: 17_001, spanCycles: 17_000, cutByReplayEnd: true });
    expect(cut).toBe("span x | S. | v=1 | 17000 cycles | 1.063 ms | cut by replay end: yes");
  });
  it("a span below 16,000 cycles is visible in the span result and the line", () => {
    const s = violationSpan(rule, 100, edges, 40_000);
    expect(s.spanCycles).toBeLessThan(16_000);
    expect(spanLine("g", "S.", s)).toContain(`${s.spanCycles} cycles`);
  });
  it("bothOnAt returns the earliest cycle at which both are 1, or null", () => {
    expect(bothOnAt(["CAR_GREEN", "WALK"], edges)).toBe(100);
    expect(bothOnAt(["CAR_GREEN", "WALK"], [edge("CAR_GREEN", 1, 50), edge("CAR_GREEN", 0, 90), edge("WALK", 1, 100)])).toBeNull();
    // edges at one cycle are applied together
    expect(bothOnAt(["A", "B"], [edge("A", 1, 10), edge("B", 1, 10)])).toBe(10);
    expect(bothOnAt(["A", "B"], [edge("A", 1, 10), edge("A", 0, 20), edge("B", 1, 20)])).toBeNull();
  });
});

describe("doorStateChanges", () => {
  it("reads open to closing", () => {
    expect(doorStateChanges([edge("MOTOR_CLOSE", 1, 1000), edge("LAMP", 1, 1000)])).toEqual([
      { cycle: 1000, from: "open", to: "closing" },
    ]);
  });
  it("reads closing to opening, then opening to closing", () => {
    const edges = [
      edge("MOTOR_CLOSE", 1, 1000),
      edge("LAMP", 1, 1000),
      edge("MOTOR_CLOSE", 0, 2000),
      edge("MOTOR_OPEN", 1, 2000),
      edge("MOTOR_OPEN", 0, 3000),
      edge("MOTOR_CLOSE", 1, 3000),
    ];
    expect(doorStateChanges(edges).map((c) => `${c.from}>${c.to}@${c.cycle}`)).toEqual([
      "open>closing@1000",
      "closing>opening@2000",
      "opening>closing@3000",
    ]);
  });
  it("reads closing to closed", () => {
    const edges = [
      edge("MOTOR_CLOSE", 1, 1000),
      edge("LAMP", 1, 1000),
      edge("MOTOR_CLOSE", 0, 4000),
      edge("LAMP", 0, 4000),
    ];
    expect(doorStateChanges(edges).map((c) => `${c.from}>${c.to}`)).toEqual(["open>closing", "closing>closed"]);
  });
  it("reads opening to open", () => {
    const edges = [
      edge("MOTOR_CLOSE", 1, 1000),
      edge("LAMP", 1, 1000),
      edge("MOTOR_CLOSE", 0, 2000),
      edge("MOTOR_OPEN", 1, 2000),
      edge("MOTOR_OPEN", 0, 5000),
      edge("LAMP", 0, 5000),
    ];
    expect(doorStateChanges(edges).map((c) => `${c.from}>${c.to}`)).toEqual([
      "open>closing",
      "closing>opening",
      "opening>open",
    ]);
  });
  it("an unknown pattern throws an error that names the cycles and edges", () => {
    let err: unknown;
    try {
      doorStateChanges([edge("MOTOR_OPEN", 1, 777)]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DoorPatternError);
    expect((err as DoorPatternError).cycles).toEqual([777]);
    expect((err as Error).message).toContain("MOTOR_OPEN=1@777");
  });
});

describe("Brand_Matcher", () => {
  const hits = (text: string): string[] => wholeWordMatches(text, BOARD_BRAND_NAMES).map((m) => m.word);
  it("matches ARDUINO_AVR_UNO (Arduino and Uno, case ignored)", () => {
    expect(hits("ARDUINO_AVR_UNO")).toEqual(["Arduino", "Uno"]);
  });
  it("matches arduino:avr", () => {
    expect(hits("arduino:avr")).toEqual(["Arduino"]);
  });
  it("does not match Unofficial, nanoseconds or ATmega328P", () => {
    expect(hits("Unofficial")).toEqual([]);
    expect(hits("nanoseconds")).toEqual([]);
    expect(hits("ATmega328P")).toEqual([]);
  });
  it("matches Mega as a separate word and not ATmega328P (D15)", () => {
    const m = wholeWordMatches("board: Mega", BOARD_BRAND_NAMES);
    expect(m.map((x) => x.word)).toEqual(["Mega"]);
    expect(m[0].offset).toBe(7);
    expect(wholeWordMatches("ATmega328P", BOARD_BRAND_NAMES)).toEqual([]);
  });
  it("reports the 1-based line", () => {
    expect(wholeWordMatches("a\nb\n uno", BOARD_BRAND_NAMES)[0].line).toBe(3);
  });
});

describe("HEX loader: CRLF and LF forms give the same program bytes", () => {
  const variants: Variant[] = ["buggy", "fixed"];
  const found: { label: string; text: string }[] = [];
  for (const id of exampleIds()) {
    for (const variant of variants) {
      if (!existsSync(resolve(EXAMPLES_DIR, id, variant, `${variant}.hex`))) continue;
      found.push({ label: `${id}/${variant}`, text: readHex(id, variant) });
    }
  }

  const load = (label: string, form: string, text: string): Uint16Array => {
    const r = hexToProgMem(text);
    if (!(r instanceof Uint16Array)) {
      throw new Error(`hexToProgMem rejected ${label} (${form}): kind=${r.kind}, message=${r.message}`);
    }
    return r;
  };

  it("finds at least one Build_HEX", () => {
    expect(found.length).toBeGreaterThan(0);
  });

  for (const { label, text } of found) {
    it(`${label}: disk form and LF form give identical program bytes`, () => {
      const lf = text.replace(/\r\n/g, "\n");
      const diskHasCrlf = text.includes("\r\n");
      // The LF form never holds a CRLF pair; it differs from the disk form exactly when the disk form has one.
      expect(lf.includes("\r\n")).toBe(false);
      expect(lf !== text).toBe(diskHasCrlf);

      const fromDisk = load(label, diskHasCrlf ? "disk (CRLF)" : "disk (LF)", text);
      const fromLf = load(label, "LF", lf);
      expect(fromLf.length).toBe(fromDisk.length);
      expect(Buffer.from(fromLf.buffer).equals(Buffer.from(fromDisk.buffer))).toBe(true);

      // Synthetic CRLF form of the LF text: a distinct input whatever the disk copy holds.
      const crlf = lf.replace(/\n/g, "\r\n");
      expect(crlf).not.toBe(lf);
      const fromCrlf = load(label, "synthetic CRLF", crlf);
      expect(Buffer.from(fromCrlf.buffer).equals(Buffer.from(fromLf.buffer))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Property tests (3.6, 3.7, 3.8 and outputLevelAt). Fixed seeds, 100 to 200 runs each.

type Pin = OutputEvent["value"];
const SIGS = ["A", "B", "C"] as const;
const sigArb = fc.constantFrom(...SIGS);
const levelArb: fc.Arbitrary<Pin> = fc.constantFrom<Pin>(0, 1, "input");

function edgesArb(maxCycle: number): fc.Arbitrary<OutputEvent[]> {
  return fc.array(
    fc.record({ signal: sigArb, value: levelArb, cycle: fc.integer({ min: 0, max: maxCycle }) }),
    { maxLength: 8 },
  );
}

/** Reference Output_Levels at cycle c: apply every edge with cycle <= c in (cycle, list index) order. */
function refLevels(edges: readonly OutputEvent[], c: number): Map<string, Pin> {
  const order = edges.map((e, i) => ({ e, i })).sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i);
  const m = new Map<string, Pin>();
  for (const { e } of order) if (e.cycle <= c) m.set(e.signal, e.value);
  return m;
}

// Feature: example-firmware, Property 1: Brand matcher agrees with a reference scan
describe("Property 1: Brand matcher agrees with a reference scan", () => {
  const pieceArb = fc.oneof(
    fc.string({ unit: fc.constantFrom(..."abcxyzUNOMEGAnano019 _:-.\n/"), maxLength: 6 }),
    fc.constantFrom(...BOARD_BRAND_NAMES, "ATmega328P").chain((w) =>
      fc.array(fc.boolean(), { minLength: w.length, maxLength: w.length }).map((flags) =>
        [...w].map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase())).join(""),
      ),
    ),
  );
  const textArb = fc.array(pieceArb, { maxLength: 10 }).map((p) => p.join(""));

  function reference(text: string) {
    const out: { word: string; offset: number; line: number }[] = [];
    const alnum = /[A-Za-z0-9]/;
    for (let i = 0; i < text.length; i++) {
      for (const word of BOARD_BRAND_NAMES) {
        if (text.slice(i, i + word.length).toLowerCase() !== word.toLowerCase()) continue;
        if (i > 0 && alnum.test(text[i - 1])) continue;
        if (i + word.length < text.length && alnum.test(text[i + word.length])) continue;
        out.push({ word, offset: i, line: text.slice(0, i).split("\n").length });
      }
    }
    return out;
  }

  it("returns the matches of a naive scan, with 1-based lines", () => {
    fc.assert(
      fc.property(textArb, (text) => {
        expect(wholeWordMatches(text, BOARD_BRAND_NAMES)).toEqual(reference(text));
      }),
      { seed: 20261201, numRuns: 200 },
    );
  });
});

// Feature: example-firmware, Property 2: Violation_Span helper agrees with a cycle-by-cycle reference
describe("Property 2: Violation_Span helper agrees with a cycle-by-cycle reference", () => {
  const eqArb: fc.Arbitrary<Condition> = fc.record({
    op: fc.constant("eq" as const),
    signal: sigArb,
    value: fc.constantFrom<0 | 1>(0, 1),
  });
  const condArb: fc.Arbitrary<Condition> = fc.oneof(
    eqArb,
    fc.tuple(eqArb, eqArb).map(([a, b]): Condition => ({ op: "all", of: [a, b] })),
    fc.tuple(eqArb, eqArb).map(([a, b]): Condition => ({ op: "any", of: [a, b] })),
  );
  const ruleArb: fc.Arbitrary<Rule> = fc.oneof(
    condArb.map((condition): Rule => ({ form: "never", condition })),
    condArb.map((condition): Rule => ({ form: "notLongerThan", condition, ms: 1 })),
    condArb.map((expect): Rule => ({ form: "respond", trigger: { op: "rise", of: expect }, withinMs: 1, expect })),
  );

  const evalCond = (c: Condition, l: Map<string, Pin>): boolean => {
    if (c.op === "eq") return l.get(c.signal) === c.value;
    if (c.op === "all") return c.of.every((m) => evalCond(m, l));
    if (c.op === "any") return c.of.some((m) => evalCond(m, l));
    return false;
  };
  const endTest = (r: Rule, l: Map<string, Pin>): boolean =>
    r.form === "respond" ? evalCond(r.expect, l) : !evalCond((r as { condition: Condition }).condition, l);

  it("same end, span and cut flag as a test at every cycle from v + 1 to M - 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 2000 }).chain((M) =>
          fc.tuple(fc.constant(M), fc.integer({ min: 0, max: M - 1 }), edgesArb(M), ruleArb),
        ),
        ([M, v, edges, rule]) => {
          // A Violation at v means the end test does not hold at v (the rule is broken there).
          fc.pre(!endTest(rule, refLevels(edges, v)));
          let end = M;
          let cut = true;
          for (let c = v + 1; c < M; c++) {
            if (endTest(rule, refLevels(edges, c))) {
              end = c;
              cut = false;
              break;
            }
          }
          expect(violationSpan(rule, v, edges, M)).toEqual({ v, end, spanCycles: end - v, cutByReplayEnd: cut });
        },
      ),
      { seed: 20261202, numRuns: 200 },
    );
  });
});

// Feature: example-firmware, Property 3: Overlap helper agrees with a cycle-by-cycle reference
describe("Property 3: Overlap helper agrees with a cycle-by-cycle reference", () => {
  it("bothOnAt returns the earliest cycle with both levels 1, or null", () => {
    fc.assert(
      fc.property(edgesArb(300), fc.tuple(sigArb, sigArb), (edges, pair) => {
        const last = edges.reduce((m, e) => Math.max(m, e.cycle), 0);
        let expected: number | null = null;
        for (let c = 0; c <= last; c++) {
          const l = refLevels(edges, c);
          if (l.get(pair[0]) === 1 && l.get(pair[1]) === 1) {
            expected = c;
            break;
          }
        }
        expect(bothOnAt(pair, edges)).toBe(expected);
      }),
      { seed: 20261203, numRuns: 200 },
    );
  });
});

// Feature: example-firmware, outputLevelAt (no listed property in design.md): agrees with the reference levels
describe("outputLevelAt agrees with a reference scan", () => {
  it("returns the last edge value at or before t, or undefined", () => {
    fc.assert(
      fc.property(edgesArb(300), sigArb, fc.integer({ min: 0, max: 320 }), (edges, signal, t) => {
        expect(outputLevelAt(signal, t, edges)).toBe(refLevels(edges, t).get(signal));
      }),
      { seed: 20261204, numRuns: 200 },
    );
  });
});