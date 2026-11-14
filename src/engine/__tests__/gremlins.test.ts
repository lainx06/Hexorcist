// Gremlin examples. Scripted generators stand in for the seeded one, so each draw returns the
// minimum or the maximum of its range and every call is recorded. Literals are acceptance values.
// This is evidence, not proof of correctness.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { drifterEvents } from "../gremlins/analog";
import { findGremlin, resolveParams } from "../gremlins/catalogue";
import type { GenerateContext } from "../gremlins/generate-types";
import type { Prng } from "../prng";
import type { AnalogFixturePin, DigitalFixturePin } from "../types";

type Mode = "min" | "max";

/** Plain-object Prng. Call i takes `modes[i]`, or `fallback` after the list ends. */
function scripted(modes: Mode[] = [], fallback: Mode = "min") {
  const calls: Array<[number, number]> = [];
  const prng: Prng = {
    nextU32() {
      throw new Error("generators must draw through nextInt");
    },
    nextInt(min: number, max: number) {
      const mode = modes[calls.length] ?? fallback;
      calls.push([min, max]);
      return mode === "min" ? min : max;
    },
    get drawCount() {
      return calls.length;
    },
  };
  return { prng, calls };
}

const A: DigitalFixturePin = { signal: "A", port: "D", bit: 2, direction: "input" };
const B: DigitalFixturePin = { signal: "B", port: "D", bit: 3, direction: "input" };
const A_HIGH: DigitalFixturePin = { ...A, activeLevel: "high" };
const A_ACTIVE: DigitalFixturePin = { ...A, restState: "active" };
const B_ACTIVE: DigitalFixturePin = { ...B, restState: "active" };

function ctx(
  runCycles: number,
  digital: DigitalFixturePin[],
  restActive: DigitalFixturePin[] = [],
): GenerateContext {
  return {
    fixture: { pins: [...digital] },
    runCycles,
    eligible: { digital, restActive, analog: [] },
  };
}

function run(
  id: string,
  context: GenerateContext,
  prng: Prng,
  overrides?: Record<string, number | { min: number; max: number }>,
) {
  const resolved = resolveParams({ id, params: overrides });
  if ("kind" in resolved) throw new Error(`resolve failed: ${resolved.message}`);
  const generate = resolved.definition.generate;
  if (generate === undefined) throw new Error(`no generator for ${id}`);
  return generate(context, resolved.params, prng);
}

function ev(
  gremlinId: string,
  signal: string,
  value: 0 | 1 | "release",
  cycle: number,
): { signal: string; value: 0 | 1 | "release"; cycle: number; gremlinId: string } {
  return { signal, value, cycle, gremlinId };
}

describe("masher", () => {
  it("minimums: one Press, Release at start plus 40,000", () => {
    const { prng, calls } = scripted();
    expect(run("masher", ctx(1_000_000, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("masher", "A", 0, 0), ev("masher", "A", "release", 40_000)],
    });
    expect(calls).toEqual([[0, 0], [1, 6], [0, 999_999]]);
  });

  it("gapCycles min 1,000: single Press releases at start plus 500", () => {
    const { prng, calls } = scripted();
    expect(run("masher", ctx(1_000_000, [A]), prng, { gapCycles: { min: 1_000, max: 2_000 } })).toEqual({
      kind: "events",
      events: [ev("masher", "A", 0, 0), ev("masher", "A", "release", 500)],
    });
    expect(calls).toEqual([[0, 0], [1, 6], [0, 999_999]]);
  });

  it("gapCycles min 2: single Press releases one cycle later, never on the Press", () => {
    const { prng } = scripted();
    expect(run("masher", ctx(1_000_000, [A]), prng, { gapCycles: { min: 2, max: 2 } })).toEqual({
      kind: "events",
      events: [ev("masher", "A", 0, 0), ev("masher", "A", "release", 1)],
    });
  });

  it("gapCycles 2 to 2, two Presses: Presses at s and s+2, Releases at s+1 and s+3", () => {
    const { prng } = scripted();
    expect(
      run("masher", ctx(1_000_000, [A]), prng, {
        pressCount: { min: 2, max: 2 },
        gapCycles: { min: 2, max: 2 },
      }),
    ).toEqual({
      kind: "events",
      events: [
        ev("masher", "A", 0, 0),
        ev("masher", "A", "release", 1),
        ev("masher", "A", 0, 2),
        ev("masher", "A", "release", 3),
      ],
    });
  });

  it("gapCycles min 1 is rejected, naming masher and gapCycles", () => {
    expect(resolveParams({ id: "masher", params: { gapCycles: { min: 1, max: 5 } } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      gremlinId: "masher",
      parameter: "gapCycles",
    });
  });

  it("active-high pin: Press carries 1", () => {
    const { prng } = scripted();
    expect(run("masher", ctx(1_000_000, [A_HIGH]), prng)).toEqual({
      kind: "events",
      events: [ev("masher", "A", 1, 0), ev("masher", "A", "release", 40_000)],
    });
  });

  it("maximums: six Presses, five gap draws, events past the run end are dropped", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("masher", ctx(1_000_000, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("masher", "A", 0, 999_999)],
    });
    expect(calls).toEqual([
      [0, 0],
      [1, 6],
      [0, 999_999],
      ...Array.from({ length: 5 }, () => [80_000, 2_400_000] as [number, number]),
    ]);
  });

  it("two Presses: each Release half a gap later, the last reusing the last gap", () => {
    const { prng, calls } = scripted();
    expect(
      run("masher", ctx(10_000_000, [A]), prng, { pressCount: { min: 2, max: 2 } }),
    ).toEqual({
      kind: "events",
      events: [
        ev("masher", "A", 0, 0),
        ev("masher", "A", "release", 40_000),
        ev("masher", "A", 0, 80_000),
        ev("masher", "A", "release", 120_000),
      ],
    });
    expect(calls).toEqual([[0, 0], [2, 2], [0, 9_999_999], [80_000, 2_400_000]]);
  });

  it("discard at Run_Cycles keeps the earlier events", () => {
    const { prng } = scripted();
    expect(
      run("masher", ctx(100_000, [A]), prng, { pressCount: { min: 2, max: 2 } }),
    ).toEqual({
      kind: "events",
      events: [
        ev("masher", "A", 0, 0),
        ev("masher", "A", "release", 40_000),
        ev("masher", "A", 0, 80_000),
      ],
    });
  });

  it("Run_Cycles 1: start is drawn from 0..0 and the Release is cut", () => {
    const { prng, calls } = scripted();
    expect(run("masher", ctx(1, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("masher", "A", 0, 0)],
    });
    expect(calls).toEqual([[0, 0], [1, 6], [0, 0]]);
  });

  it("target pin is one pick over the eligible list, in Fixture order", () => {
    const first = scripted();
    const second = scripted(["max"]);
    const a = run("masher", ctx(1_000_000, [A, B]), first.prng) as { events: Array<{ signal: string }> };
    const b = run("masher", ctx(1_000_000, [A, B]), second.prng) as { events: Array<{ signal: string }> };
    expect(first.calls[0]).toEqual([0, 1]);
    expect(a.events[0]?.signal).toBe("A");
    expect(b.events[0]?.signal).toBe("B");
  });

  it("no eligible pin: skipped with zero draws", () => {
    const { prng, calls } = scripted();
    expect(run("masher", ctx(1_000_000, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });

  it("generator source holds no literal 80,000", () => {
    const src = readFileSync(fileURLToPath(new URL("../gremlins/digital.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/80[_,]?000/);
  });
});

describe("bouncer", () => {
  it("minimums: edge 0, two flips, last flip is the Press", () => {
    const { prng, calls } = scripted();
    expect(run("bouncer", ctx(1_000_000, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("bouncer", "A", "release", 0), ev("bouncer", "A", 0, 1_600)],
    });
    expect(calls).toEqual([[0, 0], [0, 1], [2, 8], [0, 999_999], [1_600, 48_000]]);
  });

  it("maximums: edge 1, eight flips, seven gap draws, cut leaves the first flip", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("bouncer", ctx(1_000_000, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("bouncer", "A", 0, 999_999)],
    });
    expect(calls).toEqual([
      [0, 0],
      [0, 1],
      [2, 8],
      [0, 999_999],
      ...Array.from({ length: 7 }, () => [1_600, 48_000] as [number, number]),
    ]);
  });

  it("values are assigned over the full flip list before the cut", () => {
    const { prng } = scripted();
    // Three flips at 0, 1,600, 3,200; the last would be the Press. Run_Cycles 3,200 cuts it.
    expect(
      run("bouncer", ctx(3_200, [A]), prng, { flipCount: { min: 3, max: 3 } }),
    ).toEqual({
      kind: "events",
      events: [ev("bouncer", "A", 0, 0), ev("bouncer", "A", "release", 1_600)],
    });
  });

  it("Run_Cycles 1 draws start from 0..0", () => {
    const { prng, calls } = scripted();
    run("bouncer", ctx(1, [A]), prng);
    expect(calls[3]).toEqual([0, 0]);
  });

  it("target pin is one pick in Fixture order", () => {
    const { prng, calls } = scripted(["max"]);
    const out = run("bouncer", ctx(1_000_000, [A, B]), prng) as { events: Array<{ signal: string }> };
    expect(calls[0]).toEqual([0, 1]);
    expect(out.events[0]?.signal).toBe("B");
  });

  it("no eligible pin: skipped with zero draws", () => {
    const { prng, calls } = scripted();
    expect(run("bouncer", ctx(1_000_000, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });
});

describe("stuck", () => {
  it("Run_Cycles 1,600,000: skipped as run-too-short with zero draws", () => {
    const { prng, calls } = scripted();
    expect(run("stuck", ctx(1_600_000, [A]), prng)).toEqual({ kind: "skipped", reason: "run-too-short" });
    expect(calls).toEqual([]);
  });

  it("Run_Cycles 1,600,001, minimums: Press at 0, Release inside the run", () => {
    const { prng, calls } = scripted();
    expect(run("stuck", ctx(1_600_001, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("stuck", "A", 0, 0), ev("stuck", "A", "release", 1_600_000)],
    });
    expect(calls).toEqual([[0, 0], [0, 1], [1_600_000, 1_600_001]]);
  });

  it("Run_Cycles 1,600,001, maximums: Release would land at the run end, so only the Press", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("stuck", ctx(1_600_001, [A]), prng)).toEqual({
      kind: "events",
      events: [ev("stuck", "A", 0, 1)],
    });
    expect(calls).toEqual([[0, 0], [0, 1], [1_600_000, 1_600_000]]);
  });

  it("Run_Cycles 1 is skipped before any draw", () => {
    const { prng, calls } = scripted();
    expect(run("stuck", ctx(1, [A]), prng)).toEqual({ kind: "skipped", reason: "run-too-short" });
    expect(calls).toEqual([]);
  });

  it("no-target-pin wins over run-too-short", () => {
    const { prng, calls } = scripted();
    expect(run("stuck", ctx(1, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });

  it("target pin is one pick in Fixture order", () => {
    const { prng, calls } = scripted(["max"]);
    const out = run("stuck", ctx(1_600_001, [A, B]), prng) as { events: Array<{ signal: string }> };
    expect(calls[0]).toEqual([0, 1]);
    expect(out.events[0]?.signal).toBe("B");
  });
});

describe("dropout", () => {
  it("minimums: Release at 0, Press again after 16,000", () => {
    const { prng, calls } = scripted();
    expect(run("dropout", ctx(1_000_000, [A_ACTIVE], [A_ACTIVE]), prng)).toEqual({
      kind: "events",
      events: [ev("dropout", "A", "release", 0), ev("dropout", "A", 0, 16_000)],
    });
    expect(calls).toEqual([[0, 0], [0, 999_999], [16_000, 800_000]]);
  });

  it("maximums: the Press back would land past the run end, so only the Release", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("dropout", ctx(1_000_000, [A_ACTIVE], [A_ACTIVE]), prng)).toEqual({
      kind: "events",
      events: [ev("dropout", "A", "release", 999_999)],
    });
    expect(calls).toEqual([[0, 0], [0, 999_999], [16_000, 800_000]]);
  });

  it("Run_Cycles 1: Release at 0, the Press back is cut", () => {
    const { prng } = scripted();
    expect(run("dropout", ctx(1, [A_ACTIVE], [A_ACTIVE]), prng)).toEqual({
      kind: "events",
      events: [ev("dropout", "A", "release", 0)],
    });
  });

  it("target pin is one pick over the rest-active inputs, in Fixture order", () => {
    const { prng, calls } = scripted(["max"]);
    const out = run("dropout", ctx(1_000_000, [A_ACTIVE, B_ACTIVE], [A_ACTIVE, B_ACTIVE]), prng) as {
      events: Array<{ signal: string }>;
    };
    expect(calls[0]).toEqual([0, 1]);
    expect(out.events[0]?.signal).toBe("B");
  });

  it("no rest-active input: skipped with zero draws even when digital inputs exist", () => {
    const { prng, calls } = scripted();
    expect(run("dropout", ctx(1_000_000, [A]), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });
});

describe("catalogue wiring", () => {
  it("the four digital gremlins have a generator", () => {
    for (const id of ["masher", "bouncer", "stuck", "dropout"]) {
      expect(findGremlin(id)?.generate).toBeTypeOf("function");
    }
  });
});

// ---- Analog examples (task 16.2) ----

const P: AnalogFixturePin = { signal: "P", kind: "analog", channel: 0 };
const Q: AnalogFixturePin = { signal: "Q", kind: "analog", channel: 1 };
const P_REST_1000: AnalogFixturePin = { ...P, restLevel: 1000 };
const P_REST_HIGH: AnalogFixturePin = { ...P, restLevel: 1023 };

function actx(runCycles: number, analog: AnalogFixturePin[]): GenerateContext {
  return {
    fixture: { pins: [...analog] },
    runCycles,
    eligible: { digital: [], restActive: [], analog },
  };
}

function aev(gremlinId: string, signal: string, analog: number, cycle: number) {
  return { signal, analog, cycle, gremlinId };
}

describe("spike", () => {
  it("minimums: value 0 at the start, Rest_Level 512 after 1 ms (16,000 cycles)", () => {
    const { prng, calls } = scripted();
    expect(run("spike", actx(1_000_000, [P]), prng)).toEqual({
      kind: "events",
      events: [aev("spike", "P", 0, 0), aev("spike", "P", 512, 16_000)],
    });
    expect(calls).toEqual([[0, 0], [0, 1], [0, 999_999], [1, 20]]);
  });

  it("maximums: value 1,023 at the last cycle, the return is cut", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("spike", actx(1_000_000, [P]), prng)).toEqual({
      kind: "events",
      events: [aev("spike", "P", 1_023, 999_999)],
    });
    expect(calls).toEqual([[0, 0], [0, 1], [0, 999_999], [1, 20]]);
  });

  it("maximum gap of 20 ms is 320,000 cycles", () => {
    const { prng } = scripted(["min", "max", "min", "max"]);
    expect(run("spike", actx(1_000_000, [P]), prng)).toEqual({
      kind: "events",
      events: [aev("spike", "P", 1_023, 0), aev("spike", "P", 512, 320_000)],
    });
  });

  it("Rest_Level present: the return carries the pin's restLevel", () => {
    const { prng } = scripted();
    expect(run("spike", actx(1_000_000, [P_REST_1000]), prng)).toEqual({
      kind: "events",
      events: [aev("spike", "P", 0, 0), aev("spike", "P", 1_000, 16_000)],
    });
  });

  it("return landing exactly on Run_Cycles is cut", () => {
    const { prng } = scripted();
    expect(run("spike", actx(16_000, [P]), prng)).toEqual({
      kind: "events",
      events: [aev("spike", "P", 0, 0)],
    });
  });

  it("gapMs override is used for the gap draw", () => {
    const { prng, calls } = scripted();
    run("spike", actx(1_000_000, [P]), prng, { gapMs: { min: 5, max: 6 } });
    expect(calls[3]).toEqual([5, 6]);
  });

  it("target pin is one pick in Fixture order", () => {
    const { prng, calls } = scripted(["max"]);
    const out = run("spike", actx(1_000_000, [P, Q]), prng) as { events: Array<{ signal: string }> };
    expect(calls[0]).toEqual([0, 1]);
    expect(out.events[0]?.signal).toBe("Q");
  });

  it("no analog pin: skipped with zero draws", () => {
    const { prng, calls } = scripted();
    expect(run("spike", actx(1_000_000, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });
});

describe("drifter", () => {
  it("minimums: eight steps from 512 down to 0 over 800,000 cycles", () => {
    const { prng, calls } = scripted();
    expect(run("drifter", actx(1_000_000, [P]), prng)).toEqual({
      kind: "events",
      events: [448, 384, 320, 256, 192, 128, 64, 0].map((v, i) =>
        aev("drifter", "P", v, 100_000 * (i + 1)),
      ),
    });
    expect(calls).toEqual([[0, 0], [0, 1], [50, 500], [0, 199_999]]);
  });

  it("maximums: eight steps from 512 up to 1,023 over 8,000,000 cycles", () => {
    const { prng, calls } = scripted([], "max");
    expect(run("drifter", actx(10_000_000, [P]), prng)).toEqual({
      kind: "events",
      events: [575, 639, 703, 767, 831, 895, 959, 1_023].map((v, i) =>
        aev("drifter", "P", v, 1_999_999 + 1_000_000 * (i + 1)),
      ),
    });
    expect(calls).toEqual([[0, 0], [0, 1], [50, 500], [0, 1_999_999]]);
  });

  it("Run_Cycles 800,000 (smaller than D + 1): three draws, then run-too-short", () => {
    const { prng, calls } = scripted();
    expect(run("drifter", actx(800_000, [P]), prng)).toEqual({ kind: "skipped", reason: "run-too-short" });
    expect(calls).toEqual([[0, 0], [0, 1], [50, 500]]);
  });

  it("Run_Cycles 800,001 (D + 1): not skipped, start drawn from 0..0", () => {
    const { prng, calls } = scripted();
    const out = run("drifter", actx(800_001, [P]), prng) as { kind: string };
    expect(out.kind).toBe("events");
    expect(calls).toEqual([[0, 0], [0, 1], [50, 500], [0, 0]]);
  });

  it("Run_Cycles 1: three draws, then run-too-short", () => {
    const { prng, calls } = scripted();
    expect(run("drifter", actx(1, [P]), prng)).toEqual({ kind: "skipped", reason: "run-too-short" });
    expect(calls.length).toBe(3);
  });

  it("steps is a parameter and is never drawn", () => {
    const { prng, calls } = scripted();
    const out = run("drifter", actx(1_000_000, [P]), prng, { steps: 2 }) as { events: unknown[] };
    expect(out.events.length).toBe(2);
    expect(calls.length).toBe(4);
  });

  it("Rest_Level present: steps start from restLevel 1,000", () => {
    const { prng } = scripted();
    expect(
      run("drifter", actx(1_000_000, [P_REST_1000]), prng, {
        steps: 2,
        durationMs: { min: 50, max: 50 },
      }),
    ).toEqual({
      kind: "events",
      events: [aev("drifter", "P", 500, 400_000), aev("drifter", "P", 0, 800_000)],
    });
  });

  it("Rest_Level absent: steps start from 512", () => {
    const { prng } = scripted();
    expect(
      run("drifter", actx(1_000_000, [P]), prng, { steps: 2, durationMs: { min: 50, max: 50 } }),
    ).toEqual({
      kind: "events",
      events: [aev("drifter", "P", 256, 400_000), aev("drifter", "P", 0, 800_000)],
    });
  });

  it("rest equals target: all steps are still emitted at the target value", () => {
    const { prng } = scripted(["min", "max"]);
    const out = run("drifter", actx(1_000_000, [P_REST_HIGH]), prng, {
      steps: 4,
      durationMs: { min: 50, max: 50 },
    });
    expect(out).toEqual({
      kind: "events",
      events: [200_000, 400_000, 600_000, 800_000].map((c) => aev("drifter", "P", 1_023, c)),
    });
  });

  it("target pin is one pick in Fixture order", () => {
    const { prng, calls } = scripted(["max"]);
    const out = run("drifter", actx(1_000_000, [P, Q]), prng) as { events: Array<{ signal: string }> };
    expect(calls[0]).toEqual([0, 1]);
    expect(out.events[0]?.signal).toBe("Q");
  });

  it("no analog pin: skipped with zero draws", () => {
    const { prng, calls } = scripted();
    expect(run("drifter", actx(1_000_000, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });

  it("no-target-pin wins over run-too-short", () => {
    const { prng, calls } = scripted();
    expect(run("drifter", actx(1, []), prng)).toEqual({ kind: "skipped", reason: "no-target-pin" });
    expect(calls).toEqual([]);
  });
});

describe("drifter D < S defence (internal generator function)", () => {
  it("D 7 with 8 steps: invalid-gremlin-parameter naming drifter", () => {
    const out = drifterEvents("drifter", P, 0, 7, 8, 0);
    expect(out).toMatchObject({
      kind: "invalid-gremlin-parameter",
      gremlinId: "drifter",
      parameter: "durationMs",
    });
    expect(Array.isArray(out)).toBe(false);
  });

  it("D equal to S: one step per cycle, no shared cycles", () => {
    expect(drifterEvents("drifter", P, 0, 8, 8, 10)).toEqual(
      [448, 384, 320, 256, 192, 128, 64, 0].map((v, i) => aev("drifter", "P", v, 11 + i)),
    );
  });
});

describe("analog parameter overrides", () => {
  const bad: Array<[string, string, string, number | { min: number; max: number }]> = [
    ["drifter", "steps", "steps 1", 1],
    ["drifter", "steps", "steps 33", 33],
    ["drifter", "steps", "steps 2.5", 2.5],
    ["drifter", "steps", "steps as a range", { min: 2, max: 3 }],
    ["drifter", "durationMs", "durationMs as one number", 100 as number],
    ["drifter", "durationMs", "durationMs min 0", { min: 0, max: 100 }],
    ["drifter", "durationMs", "durationMs max 10,001", { min: 100, max: 10_001 }],
    ["drifter", "durationMs", "durationMs min above max", { min: 200, max: 100 }],
    ["spike", "gapMs", "gapMs min 0", { min: 0, max: 5 }],
    ["spike", "gapMs", "gapMs max 1,001", { min: 5, max: 1_001 }],
    ["spike", "gapMs", "gapMs min above max", { min: 6, max: 5 }],
    ["spike", "gapMs", "gapMs as one number", 5],
  ];
  for (const [id, parameter, label, value] of bad) {
    it(`${id} ${label}: invalid-gremlin-parameter naming ${id}.${parameter}`, () => {
      expect(resolveParams({ id, params: { [parameter]: value } })).toMatchObject({
        kind: "invalid-gremlin-parameter",
        gremlinId: id,
        parameter,
      });
    });
  }

  it("bounds are accepted: steps 2 and 32, durationMs 1 to 10,000, gapMs 1 to 1,000", () => {
    for (const steps of [2, 32]) {
      expect(resolveParams({ id: "drifter", params: { steps } })).toHaveProperty("definition");
    }
    expect(resolveParams({ id: "drifter", params: { durationMs: { min: 1, max: 10_000 }, steps: 2 } })).toHaveProperty(
      "definition",
    );
    expect(resolveParams({ id: "spike", params: { gapMs: { min: 1, max: 1_000 } } })).toHaveProperty("definition");
  });
});

describe("analog catalogue wiring", () => {
  it("spike and drifter have a generator", () => {
    for (const id of ["spike", "drifter"]) {
      expect(findGremlin(id)?.generate).toBeTypeOf("function");
    }
  });
});

// ---- Drifter arithmetic property (task 16.3) ----

import fc from "fast-check";

// Feature: gremlin-engine, Property 18: Drifter arithmetic
// Validates: Requirements 6.4, 6.5, 6.6, 6.7
describe("Property 18: Drifter arithmetic", () => {
  const arbCase = fc
    .record({
      rest: fc.integer({ min: 0, max: 1023 }),
      target: fc.constantFrom(0, 1023),
      steps: fc.integer({ min: 2, max: 32 }),
      extra: fc.integer({ min: 0, max: 160_000_000 }),
      start: fc.integer({ min: 0, max: 2_000_000_000 }),
    })
    .map((c) => ({ ...c, d: c.steps + c.extra }));

  it("example: rest 1, target 0, S 2, D 2, start 0 gives values [1, 0] at cycles [1, 2]", () => {
    const pin: AnalogFixturePin = { signal: "P", kind: "analog", channel: 0, restLevel: 1 };
    const out = drifterEvents("drifter", pin, 0, 2, 2, 0);
    expect(out).toEqual([aev("drifter", "P", 1, 1), aev("drifter", "P", 0, 2)]);
  });

  // No return-to-rest event follows the drift. Early steps equal to rest through truncation are legal.
  it("matches a BigInt reference, monotone toward the target, S events, last at start + D", () => {
    fc.assert(
      fc.property(arbCase, ({ rest, target, steps, d, start }) => {
        const pin: AnalogFixturePin = { signal: "P", kind: "analog", channel: 0, restLevel: rest };
        const out = drifterEvents("drifter", pin, target, d, steps, start);
        if (!Array.isArray(out)) throw new Error(`unexpected error: ${out.message}`);

        // Reference: BigInt division floors for the non-negative cycle product and truncates toward zero for values.
        const D = BigInt(d);
        const S = BigInt(steps);
        const delta = BigInt(target - rest);
        expect(out.length).toBe(steps);
        for (let i = 1; i <= steps; i++) {
          const I = BigInt(i);
          const cycle = Number(BigInt(start) + (D * I) / S);
          const value = Number(BigInt(rest) + (delta * I) / S);
          expect(out[i - 1]).toEqual({ signal: "P", analog: value, cycle, gremlinId: "drifter" });
        }
        for (let i = 1; i < out.length; i++) {
          expect(out[i]!.cycle).toBeGreaterThan(out[i - 1]!.cycle);
        }
        // Values move monotonically toward the target. Early steps may equal rest through truncation.
        const values = out.map((e) => (e as { analog: number }).analog);
        for (let i = 1; i < values.length; i++) {
          if (target < rest) expect(values[i]!).toBeLessThanOrEqual(values[i - 1]!);
          else if (target > rest) expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
          else expect(values[i]!).toBe(target);
        }
        if (rest === target) expect(values[0]).toBe(target);
        // Exactly S events, the last at start + D with the target value, and no event after it.
        const last = out[out.length - 1]!;
        expect(out.length).toBe(steps);
        expect(last.cycle).toBe(start + d);
        expect((last as { analog: number }).analog).toBe(target);
        expect(out.filter((e) => e.cycle > last.cycle)).toEqual([]);
      }),
      { numRuns: 200, seed: 2704041801 },
    );
  });
});

// ---- Digital and Spike shape property (task 16.4) ----

import { createPrng } from "../prng";
import { msToCycles, pressValue } from "../gremlins/pins";

// Feature: gremlin-engine, Property 19: Digital Gremlin shape
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 6.1, 6.2
describe("Property 19: Digital Gremlin shape", () => {
  type Ov = Record<string, number | { min: number; max: number }>;
  type Ev = { signal: string; value?: 0 | 1 | "release"; analog?: number; cycle: number; gremlinId: string };

  const R_LONG = 2_000_000_000;
  const R_UNCUT = 2 ** 32;

  /** A real seeded generator whose raw bounded draws are written down. */
  function recording(seed: number) {
    const real = createPrng(seed);
    if ("kind" in real) throw new Error(real.message);
    const draws: number[] = [];
    const prng: Prng = {
      nextU32: () => real.nextU32(),
      nextInt(min, max) {
        const v = real.nextInt(min, max);
        if (typeof v === "number") draws.push(v);
        return v;
      },
      get drawCount() {
        return real.drawCount;
      },
    };
    return { prng, draws };
  }

  /** Feeds the recorded draws back, so a longer run sees the same choices. */
  function replay(draws: number[]): Prng {
    let i = 0;
    return {
      nextU32() {
        throw new Error("generators must draw through nextInt");
      },
      nextInt() {
        if (i >= draws.length) throw new Error("replay ran out of draws");
        return draws[i++] as number;
      },
      get drawCount() {
        return i;
      },
    };
  }

  const arbRange = (lo: number, hi: number, spread: number) =>
    fc
      .record({ min: fc.integer({ min: lo, max: hi }), extra: fc.integer({ min: 0, max: spread }) })
      .map(({ min, extra }) => ({ min, max: min + extra }));

  const arbCase = fc.record({
    id: fc.constantFrom("masher", "bouncer", "stuck", "dropout", "spike"),
    seed: fc.integer({ min: 0, max: 0xffffffff }),
    long: fc.boolean(),
    shortRun: fc.integer({ min: 1, max: 3_000_000 }),
    restStates: fc.array(fc.constantFrom<"released" | "active">("released", "active"), {
      minLength: 0,
      maxLength: 2,
    }),
    levels: fc.array(fc.constantFrom<"low" | "high">("low", "high"), { minLength: 3, maxLength: 3 }),
    analogRests: fc.array(fc.option(fc.integer({ min: 0, max: 1023 }), { nil: undefined }), {
      minLength: 1,
      maxLength: 2,
    }),
    // Override source: none, uniform draws, or the smallest allowed value (+0 or +1) in most runs.
    ovMode: fc.constantFrom<"none" | "uniform" | "edge">("none", "uniform", "edge", "edge", "edge", "edge"),
    edgeK: fc.integer({ min: 0, max: 1 }),
    edgeExtra: fc.integer({ min: 0, max: 1 }),
    pressCount: arbRange(1, 4, 4),
    masherGap: arbRange(2, 200_000, 200_000),
    flipCount: arbRange(2, 5, 4),
    bouncerGap: arbRange(1, 100_000, 100_000),
    minSpan: fc.integer({ min: 1, max: 300_000 }),
    dropoutGap: arbRange(1, 400_000, 400_000),
    gapMs: arbRange(1, 100, 100),
  });

  it("each Gremlin keeps its documented shape, and short runs keep a prefix of the uncut list", () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        // First digital pin always rests active, so Dropout always has a target.
        const digital: DigitalFixturePin[] = ["active", ...c.restStates].map((restState, i) => ({
          signal: `D${i}`,
          port: "D",
          bit: (i + 2) as DigitalFixturePin["bit"],
          direction: "input",
          activeLevel: c.levels[i] as "low" | "high",
          restState: restState as "released" | "active",
        }));
        const restActive = digital.filter((p) => p.restState === "active");
        const analog: AnalogFixturePin[] = c.analogRests.map((restLevel, i) => ({
          signal: `P${i}`,
          kind: "analog",
          channel: i,
          ...(restLevel === undefined ? {} : { restLevel }),
        }));
        const context = (runCycles: number): GenerateContext => ({
          fixture: { pins: [...digital, ...analog] },
          runCycles,
          eligible: { digital, restActive, analog },
        });

        const ov: Ov = {};
        if (c.ovMode === "uniform") {
          if (c.id === "masher") Object.assign(ov, { pressCount: c.pressCount, gapCycles: c.masherGap });
          if (c.id === "bouncer") Object.assign(ov, { flipCount: c.flipCount, gapCycles: c.bouncerGap });
          if (c.id === "stuck") Object.assign(ov, { minSpanCycles: c.minSpan });
          if (c.id === "dropout") Object.assign(ov, { gapCycles: c.dropoutGap });
          if (c.id === "spike") Object.assign(ov, { gapMs: c.gapMs });
        } else if (c.ovMode === "edge") {
          // Smallest allowed gap or span (masher 2, others 1) and the next value up.
          const at = (lo: number) => ({ min: lo + c.edgeK, max: lo + c.edgeK + c.edgeExtra });
          if (c.id === "masher") Object.assign(ov, { pressCount: c.pressCount, gapCycles: at(2) });
          if (c.id === "bouncer") Object.assign(ov, { flipCount: c.flipCount, gapCycles: at(1) });
          if (c.id === "stuck") Object.assign(ov, { minSpanCycles: 1 + c.edgeK });
          if (c.id === "dropout") Object.assign(ov, { gapCycles: at(1) });
          if (c.id === "spike") Object.assign(ov, { gapMs: at(1) });
        }
        const range = (name: string, dflt: { min: number; max: number }) =>
          (ov[name] as { min: number; max: number } | undefined) ?? dflt;

        const runCycles = c.long ? R_LONG : c.shortRun;
        const rec = recording(c.seed);
        const out = run(c.id, context(runCycles), rec.prng, ov);
        if (out.kind === "skipped") {
          // Only Stuck can skip here, and only on a run it cannot hold; it draws nothing first.
          const minSpan = (ov.minSpanCycles as number | undefined) ?? 1_600_000;
          expect(c.id).toBe("stuck");
          expect(out.reason).toBe("run-too-short");
          expect(runCycles).toBeLessThan(minSpan + 1);
          expect(rec.draws).toEqual([]);
          return;
        }
        if (out.kind !== "events") throw new Error(`unexpected outcome: ${JSON.stringify(out)}`);

        const kept = out.events as Ev[];
        const uncutOut = run(c.id, context(R_UNCUT), replay(rec.draws), ov);
        if (uncutOut.kind !== "events") throw new Error("uncut run did not produce events");
        const u = uncutOut.events as Ev[];

        // Prefix: every kept event is the matching event of the uncut list.
        expect(kept).toEqual(u.slice(0, kept.length));
        // When the whole uncut list fits inside the run, nothing is cut.
        if (u.every((e) => e.cycle < runCycles)) expect(kept).toEqual(u);

        // No two events of one instance on one pin share a cycle.
        const seen = new Set<string>();
        for (const e of u) {
          const key = `${e.signal}@${e.cycle}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
        for (const e of u) expect(e.gremlinId).toBe(c.id);

        const digitalPin = (signal: string) => digital.find((p) => p.signal === signal) as DigitalFixturePin;

        if (c.id === "masher") {
          const pc = range("pressCount", { min: 1, max: 6 });
          const gap = range("gapCycles", { min: 80_000, max: 2_400_000 });
          const n = u.length / 2;
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(pc.min);
          expect(n).toBeLessThanOrEqual(pc.max);
          const pin = digitalPin(u[0]!.signal);
          const gaps: number[] = [];
          for (let j = 0; j < n - 1; j++) {
            const g = u[2 * (j + 1)]!.cycle - u[2 * j]!.cycle;
            expect(g).toBeGreaterThanOrEqual(gap.min);
            expect(g).toBeLessThanOrEqual(gap.max);
            gaps.push(g);
          }
          for (let j = 0; j < n; j++) {
            const press = u[2 * j]!;
            const release = u[2 * j + 1]!;
            expect(press.signal).toBe(pin.signal);
            expect(release.signal).toBe(pin.signal);
            expect(press.value).toBe(pressValue(pin));
            expect(release.value).toBe("release");
            const basis = j < n - 1 ? gaps[j]! : n > 1 ? gaps[n - 2]! : gap.min;
            expect(release.cycle - press.cycle).toBe(Math.floor(basis / 2));
            if (j < n - 1) expect(release.cycle).toBeLessThan(u[2 * (j + 1)]!.cycle);
          }
        } else if (c.id === "bouncer") {
          const fc2 = range("flipCount", { min: 2, max: 8 });
          const gap = range("gapCycles", { min: 1_600, max: 48_000 });
          expect(u.length).toBeGreaterThanOrEqual(fc2.min);
          expect(u.length).toBeLessThanOrEqual(fc2.max);
          const pin = digitalPin(u[0]!.signal);
          for (let k = 0; k < u.length; k++) {
            expect(u[k]!.signal).toBe(pin.signal);
            if (k > 0) {
              const g = u[k]!.cycle - u[k - 1]!.cycle;
              expect(g).toBeGreaterThanOrEqual(gap.min);
              expect(g).toBeLessThanOrEqual(gap.max);
              expect(u[k]!.value).not.toBe(u[k - 1]!.value);
            }
            expect([pressValue(pin), "release"]).toContain(u[k]!.value);
          }
        } else if (c.id === "stuck") {
          const minSpan = (ov.minSpanCycles as number | undefined) ?? 1_600_000;
          expect(u.length).toBe(2);
          const pin = digitalPin(u[0]!.signal);
          expect(u[0]!.value).toBe(pressValue(pin));
          expect(u[1]!.signal).toBe(pin.signal);
          expect(u[1]!.value).toBe("release");
          expect(u[1]!.cycle - u[0]!.cycle).toBeGreaterThanOrEqual(minSpan);
          // Short run: the Release is kept only when it lands inside the run.
          expect(kept.length).toBe(u[1]!.cycle < runCycles ? 2 : 1);
        } else if (c.id === "dropout") {
          const gap = range("gapCycles", { min: 16_000, max: 800_000 });
          expect(u.length).toBe(2);
          const pin = digitalPin(u[0]!.signal);
          expect(pin.restState).toBe("active");
          expect(u[0]!.value).toBe("release");
          expect(u[1]!.signal).toBe(pin.signal);
          expect(u[1]!.value).toBe(pressValue(pin));
          expect(u[1]!.cycle - u[0]!.cycle).toBeGreaterThanOrEqual(gap.min);
          expect(u[1]!.cycle - u[0]!.cycle).toBeLessThanOrEqual(gap.max);
          expect(kept.length).toBe(u[1]!.cycle < runCycles ? 2 : 1);
        } else {
          const gapMs = range("gapMs", { min: 1, max: 20 });
          expect(u.length).toBe(2);
          const pin = analog.find((p) => p.signal === u[0]!.signal) as AnalogFixturePin;
          expect([0, 1023]).toContain(u[0]!.analog);
          expect(u[1]!.signal).toBe(pin.signal);
          expect(u[1]!.analog).toBe(pin.restLevel ?? 512);
          const delta = u[1]!.cycle - u[0]!.cycle;
          expect(delta).toBeGreaterThanOrEqual(msToCycles(gapMs.min));
          expect(delta).toBeLessThanOrEqual(msToCycles(gapMs.max));
          expect(delta % 16_000).toBe(0);
          expect(kept.length).toBe(u[1]!.cycle < runCycles ? 2 : 1);
        }
      }),
      { numRuns: 200, seed: 1904040419 },
    );
  });
});
