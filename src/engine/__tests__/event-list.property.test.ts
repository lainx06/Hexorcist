// Property tests for the event-list builder (task 17.2; tasks 17.3 to 17.9 append to this file).
// Append new describe blocks at the end. Shared helpers live in the section below.
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildEventList, generateWithPrng } from "../event-list";
import type { GenerateInput, GeneratedRun } from "../event-list";
import { isEngineError } from "../errors";
import { resolveParams } from "../gremlins/catalogue";
import type { GenerateContext } from "../gremlins/generate-types";
import { analogInputs, digitalInputs, pressValue, restActiveInputs } from "../gremlins/pins";
import type { GremlinSpec } from "../gremlins/catalogue";
import { createPrng, isPrngError } from "../prng";
import type { Prng } from "../prng";
import type { Fixture } from "../types";
import { arbFixture, arbGremlinSet, arbRunCycles, arbRunIndex, arbSeed } from "./arbitraries";

// ---- Shared helpers for the event-list properties (17.2 to 17.9) ----

/** Every input of `buildEventList`, drawn from the shared arbitraries. */
export const arbEventListInput: fc.Arbitrary<GenerateInput> = fc.record({
  fixture: arbFixture,
  gremlinSet: arbGremlinSet,
  runCycles: arbRunCycles,
  campaignSeed: arbSeed,
  runIndex: arbRunIndex,
});

/** Build an Event_List and fail the test on any engine error (generated inputs are valid). */
export function buildOk(input: GenerateInput): GeneratedRun {
  const r = buildEventList(input);
  if (isEngineError(r)) throw new Error(`buildEventList failed: ${JSON.stringify(r)}`);
  return r;
}

// ---- Property 1 ----

describe("Event list determinism", () => {
  // Feature: gremlin-engine, Property 1: Event list determinism
  // Validates: Requirements 7.4, 4.14, 11.1
  it("Property 1: two calls give identical event lists and Skipped_Lists", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        const first = buildOk(input);
        const second = buildOk(input);
        expect(second.events.length).toBe(first.events.length);
        first.events.forEach((ev, i) => {
          // Field by field: cycle, signal, value or analog, gremlinId.
          expect(second.events[i]).toStrictEqual(ev);
        });
        expect(second.skipped).toStrictEqual(first.skipped);
        expect(second.runSeed).toBe(first.runSeed);
      }),
      { numRuns: 200, seed: 1704021701 },
    );
  });
});

// ---- Property 2 ----

type Ev = GeneratedRun["events"][number];

/** Check targets, kinds, cycle range and the leading Rest_Events of one built Run. */
function checkTargetsKindsRange(input: GenerateInput, events: readonly Ev[]): void {
  const pins = input.fixture.pins;
  const restActive = pins.filter(
    (p) => p.kind !== "analog" && p.direction === "input" && p.restState === "active",
  );
  const byId = new Map(pins.map((p) => [p.signal, p]));

  // Leading Rest_Events: one per active-rest input, Fixture order, cycle 0, none elsewhere.
  restActive.forEach((pin, i) => {
    const ev = events[i];
    expect(ev?.gremlinId).toBe("rest");
    expect(ev?.signal).toBe(pin.signal);
    expect(ev?.cycle).toBe(0);
    expect("analog" in (ev as Ev)).toBe(false);
  });
  expect(events.filter((e) => e.gremlinId === "rest").length).toBe(restActive.length);

  for (const ev of events) {
    // Cycles are integers in [0, Run_Cycles).
    expect(Number.isInteger(ev.cycle)).toBe(true);
    expect(ev.cycle).toBeGreaterThanOrEqual(0);
    expect(ev.cycle).toBeLessThan(input.runCycles);

    const pin = byId.get(ev.signal);
    expect(pin).toBeDefined();
    if (pin === undefined) continue;
    const isAnalogEvent = "analog" in ev;

    switch (ev.gremlinId) {
      case "spike":
      case "drifter":
        expect(pin.kind).toBe("analog");
        expect(isAnalogEvent).toBe(true);
        break;
      case "masher":
      case "bouncer":
      case "stuck":
      case "rest":
      case "dropout":
        expect(pin.kind).not.toBe("analog");
        expect(isAnalogEvent).toBe(false);
        if (pin.kind !== "analog") expect(pin.direction).toBe("input");
        // Dropout, and the Rest_Event, only on active-rest pins.
        if (ev.gremlinId === "dropout" || ev.gremlinId === "rest") {
          if (pin.kind !== "analog") expect(pin.restState).toBe("active");
        }
        break;
      default:
        throw new Error(`unexpected gremlinId ${ev.gremlinId}`);
    }
  }
}

describe("Targets, kinds and cycle range", () => {
  // Feature: gremlin-engine, Property 2: Targets, kinds and cycle range
  // Validates: Requirements 4.1, 4.4, 4.13, 5.9, 11.2
  it("Property 2: targets match the Gremlin's kinds and cycles lie in [0, Run_Cycles)", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        checkTargetsKindsRange(input, buildOk(input).events);
      }),
      { numRuns: 200, seed: 1704021702 },
    );
  });

  // Feature: gremlin-engine, Property 2: Targets, kinds and cycle range (Run_Cycles 1)
  // Validates: Requirements 4.1, 4.4, 4.13, 5.9, 11.2
  it("Property 2: Run_Cycles 1 still leads with one Rest_Event per active-rest input", () => {
    fc.assert(
      fc.property(arbEventListInput, (generated) => {
        const input = { ...generated, runCycles: 1 };
        checkTargetsKindsRange(input, buildOk(input).events);
      }),
      { numRuns: 200, seed: 1704021703 },
    );
  });
});

// ---- Property 3 ----

describe("Analog values in range", () => {
  // Feature: gremlin-engine, Property 3: Analog values in range
  // Validates: Requirements 6.12, 11.3
  it("Property 3: every analog value is an integer from 0 to 1023", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        for (const ev of buildOk(input).events) {
          if (!("analog" in ev)) continue;
          expect(Number.isInteger(ev.analog)).toBe(true);
          expect(ev.analog).toBeGreaterThanOrEqual(0);
          expect(ev.analog).toBeLessThanOrEqual(1023);
        }
      }),
      { numRuns: 200, seed: 1704021704 },
    );
  });
});

// ---- Property 4 ----

/**
 * The unsorted generation order, built without `generateWithPrng`: Rest_Events first, then each
 * entry's own `generate` call in listed order, all drawing from one fresh real PRNG made from the
 * same Run_Seed. No sorting happens here.
 */
function unsortedGenerationOrder(input: GenerateInput, runSeed: number): Ev[] {
  const prng = createPrng(runSeed);
  if (isPrngError(prng)) throw new Error(`createPrng failed: ${JSON.stringify(prng)}`);
  const ctx: GenerateContext = {
    fixture: input.fixture,
    runCycles: input.runCycles,
    eligible: {
      digital: digitalInputs(input.fixture),
      restActive: restActiveInputs(input.fixture),
      analog: analogInputs(input.fixture),
    },
  };
  const order: Ev[] = ctx.eligible.restActive.map((pin) => ({
    signal: pin.signal,
    value: pressValue(pin),
    cycle: 0,
    gremlinId: "rest",
  }));
  for (const spec of input.gremlinSet) {
    const resolved = resolveParams(spec);
    if ("kind" in resolved) throw new Error(`resolveParams failed: ${JSON.stringify(resolved)}`);
    const outcome = resolved.definition.generate(ctx, resolved.params, prng);
    if (outcome.kind === "events") order.push(...outcome.events);
    else if (outcome.kind !== "skipped") throw new Error(`generate failed: ${JSON.stringify(outcome)}`);
  }
  return order;
}

describe("Sorted and stable", () => {
  // Feature: gremlin-engine, Property 4: Sorted and stable
  // Validates: Requirements 7.3, 11.4
  it("Property 4: cycles never decrease and equal cycles keep generation order", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        const run = buildOk(input);
        const events = run.events;

        for (let i = 1; i < events.length; i++) {
          expect(events[i]!.cycle).toBeGreaterThanOrEqual(events[i - 1]!.cycle);
        }

        // Expected order: bucket the unsorted generation order by cycle, keeping order inside a bucket.
        const buckets = new Map<number, Ev[]>();
        for (const ev of unsortedGenerationOrder(input, run.runSeed)) {
          const bucket = buckets.get(ev.cycle);
          if (bucket === undefined) buckets.set(ev.cycle, [ev]);
          else bucket.push(ev);
        }
        const expected = [...buckets.keys()].sort((a, b) => a - b).flatMap((c) => buckets.get(c)!);
        expect(events).toStrictEqual(expected);

        // Rest_Events come ahead of every Gremlin event at the same cycle.
        const firstGremlin = events.findIndex((e) => e.gremlinId !== "rest");
        if (firstGremlin !== -1) {
          expect(events.slice(firstGremlin).some((e) => e.gremlinId === "rest")).toBe(false);
        }
      }),
      { numRuns: 200, seed: 1704021705 },
    );
  });
});

// ---- Property 5 ----

describe("Digital values", () => {
  // Feature: gremlin-engine, Property 5: Digital values
  // Validates: Requirements 3.5, 3.6, 3.7, 11.5
  it("Property 5: each digital value is the pin's Active_Level value or \"release\"", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        const byId = new Map(input.fixture.pins.map((p) => [p.signal, p]));
        for (const ev of buildOk(input).events) {
          if (!("value" in ev)) continue;
          const pin = byId.get(ev.signal);
          expect(pin).toBeDefined();
          if (pin === undefined || pin.kind === "analog") throw new Error("digital event on non-digital pin");
          // Low (or absent) drives 0, high drives 1. Never a driven inactive level.
          const activeValue = pin.activeLevel === "high" ? 1 : 0;
          expect([activeValue, "release"]).toContain(ev.value);
        }
      }),
      { numRuns: 200, seed: 1704021706 },
    );
  });
});

// ---- Property 6 ----

describe("Gremlin ids", () => {
  // Feature: gremlin-engine, Property 6: Gremlin ids
  // Validates: Requirements 4.3, 11.6
  it("Property 6: every gremlinId is an id in the set, or \"rest\" for Rest_Events only", () => {
    fc.assert(
      fc.property(arbEventListInput, (input) => {
        const ids = new Set(input.gremlinSet.map((g) => g.id));
        const restActiveSignals = new Set(restActiveInputs(input.fixture).map((p) => p.signal));
        for (const ev of buildOk(input).events) {
          expect(typeof ev.gremlinId).toBe("string");
          if (ev.gremlinId === "rest") {
            // A Rest_Event: leading cycle 0 on an active-rest input, never carrying a Gremlin id.
            expect(restActiveSignals.has(ev.signal)).toBe(true);
            expect(ev.cycle).toBe(0);
          } else {
            // A Gremlin event carries the id of an entry in the set, never "rest".
            expect(ids.has(ev.gremlinId as string)).toBe(true);
          }
        }
      }),
      { numRuns: 200, seed: 1704021707 },
    );
  });
});

// ---- Property 16 ----

/** A real PRNG stream wrapped so every `nextInt` call is counted (the scripted PRNG of this property). */
function countingPrng(seed: number): { prng: Prng; calls: () => number } {
  const inner = createPrng(seed);
  if (isPrngError(inner)) throw new Error(`createPrng failed: ${JSON.stringify(inner)}`);
  let nextIntCalls = 0;
  const prng: Prng = {
    nextU32: () => inner.nextU32(),
    nextInt: (min, max) => {
      nextIntCalls += 1;
      return inner.nextInt(min, max);
    },
    get drawCount() {
      return inner.drawCount;
    },
  };
  return { prng, calls: () => nextIntCalls };
}

interface CountedRun {
  events: GeneratedRun["events"];
  skipped: GeneratedRun["skipped"];
  calls: number;
  draws: number;
}

/** Run the seam on a fresh counting PRNG made from `seed`. */
function runCounted(
  fixture: Fixture,
  gremlinSet: readonly GremlinSpec[],
  runCycles: number,
  seed: number,
): CountedRun {
  const { prng, calls } = countingPrng(seed);
  const out = generateWithPrng({ fixture, gremlinSet, runCycles }, prng);
  if (isEngineError(out)) throw new Error(`generateWithPrng failed: ${JSON.stringify(out)}`);
  return { events: out.events, skipped: out.skipped, calls: calls(), draws: prng.drawCount };
}

/**
 * Check the zero-draw skip rule for every entry of one set. An entry counts as a zero-draw skip when
 * it skips alone as `no-target-pin`, or as Stuck `run-too-short`. Those are decided from the Fixture
 * and Run_Cycles only, so alone and in the set they behave the same. For each one: it makes zero
 * `nextInt` calls, and the whole set behaves exactly as the same set without it, same PRNG seed.
 * Returns how many zero-draw skips were checked.
 */
function checkZeroDrawSkips(
  fixture: Fixture,
  gremlinSet: readonly GremlinSpec[],
  runCycles: number,
  seed: number,
): number {
  const full = runCounted(fixture, gremlinSet, runCycles, seed);
  let checked = 0;
  gremlinSet.forEach((spec, i) => {
    const alone = runCounted(fixture, [spec], runCycles, seed);
    const only = alone.skipped[0];
    if (only === undefined) return;
    const zeroDraw =
      only.reason === "no-target-pin" || (spec.id === "stuck" && only.reason === "run-too-short");
    if (!zeroDraw) return;
    checked += 1;

    expect(alone.calls).toBe(0);
    expect(alone.draws).toBe(0);

    const without = gremlinSet.filter((_, j) => j !== i);
    const removed = runCounted(fixture, without, runCycles, seed);
    expect(full.events).toStrictEqual(removed.events);
    expect(full.calls).toBe(removed.calls);
    expect(full.draws).toBe(removed.draws);
    // The only difference in the skip list is the one skipped entry itself.
    expect(full.skipped.length).toBe(removed.skipped.length + 1);
    const hasPosition = full.skipped.some(
      (_, j) =>
        JSON.stringify(full.skipped.filter((__, k) => k !== j)) === JSON.stringify(removed.skipped),
    );
    expect(hasPosition).toBe(true);
  });
  return checked;
}

const P16_DIGITAL: Fixture["pins"] = [
  { signal: "BTN", port: "D", bit: 2, direction: "input" },
  { signal: "SENSE", port: "D", bit: 3, direction: "input", restState: "active" },
];
const P16_ANALOG: Fixture["pins"] = [{ signal: "POT", kind: "analog", channel: 0 }];

/** Small fixtures that leave out one kind of pin on purpose, so no-target-pin skips are common. */
const arbP16Fixture: fc.Arbitrary<Fixture> = fc.constantFrom<Fixture>(
  { pins: [] },
  { pins: P16_DIGITAL },
  { pins: P16_ANALOG },
  { pins: [...P16_DIGITAL, ...P16_ANALOG] },
);

describe("Skips draw nothing", () => {
  // Feature: gremlin-engine, Property 16: Skips draw nothing (with one named exception)
  // Validates: Requirements 4.10, 4.12, 5.6, 5.11, 6.11, 7.2, 7.7
  it("Property 16: zero-draw skips leave later entries as if the entry were removed (generated Fixtures)", () => {
    fc.assert(
      fc.property(arbEventListInput, arbSeed, (input, seed) => {
        checkZeroDrawSkips(input.fixture, input.gremlinSet, input.runCycles, seed);
      }),
      { numRuns: 200, seed: 1704021716 },
    );
  });

  // Feature: gremlin-engine, Property 16: Skips draw nothing (with one named exception)
  // Validates: Requirements 4.10, 4.12, 5.6, 5.11, 6.11, 7.2, 7.7
  it("Property 16: same rule with pin kinds left out and short runs, so both skip reasons occur", () => {
    let checkedTotal = 0;
    fc.assert(
      fc.property(
        arbP16Fixture,
        arbGremlinSet,
        fc.integer({ min: 1, max: 2_000_000 }),
        arbSeed,
        (fixture, gremlinSet, runCycles, seed) => {
          checkedTotal += checkZeroDrawSkips(fixture, gremlinSet, runCycles, seed);
        },
      ),
      { numRuns: 200, seed: 1704021717 },
    );
    // Guards against a vacuous run: some zero-draw skips must have been checked.
    expect(checkedTotal).toBeGreaterThan(0);
  });

  // Feature: gremlin-engine, Property 16: Skips draw nothing (with one named exception)
  // Validates: Requirements 7.2
  it("Property 16: an empty Gremlin_Set draws zero values", () => {
    fc.assert(
      fc.property(arbFixture, arbRunCycles, arbSeed, (fixture, runCycles, seed) => {
        const run = runCounted(fixture, [], runCycles, seed);
        expect(run.calls).toBe(0);
        expect(run.draws).toBe(0);
        expect(run.skipped).toStrictEqual([]);
        // Only Rest_Events can be present.
        expect(run.events.every((e) => e.gremlinId === "rest")).toBe(true);
      }),
      { numRuns: 200, seed: 1704021718 },
    );
  });

  // Feature: gremlin-engine, Property 16: Skips draw nothing (with one named exception)
  // Validates: Requirements 6.11, 7.7
  it("Property 16: a Drifter skipped as run-too-short makes exactly three nextInt calls", () => {
    // Run_Cycles never exceeds the cycles of the shortest possible duration, so the skip always happens.
    const arbCase = fc
      .record({
        minMs: fc.integer({ min: 1, max: 10_000 }),
        extraMs: fc.integer({ min: 0, max: 10_000 }),
        steps: fc.integer({ min: 2, max: 32 }),
        fixture: fc.constantFrom<Fixture>(
          { pins: P16_ANALOG },
          { pins: [...P16_DIGITAL, ...P16_ANALOG] },
        ),
        seed: arbSeed,
      })
      .chain((c) =>
        fc.integer({ min: 1, max: 16_000 * c.minMs }).map((runCycles) => ({ ...c, runCycles })),
      );
    fc.assert(
      fc.property(arbCase, ({ minMs, extraMs, steps, fixture, seed, runCycles }) => {
        const maxMs = Math.min(10_000, minMs + extraMs);
        const spec: GremlinSpec = {
          id: "drifter",
          params: { durationMs: { min: minMs, max: maxMs }, steps },
        };
        const run = runCounted(fixture, [spec], runCycles, seed);
        expect(run.skipped).toStrictEqual([{ gremlinId: "drifter", reason: "run-too-short" }]);
        expect(run.events.every((e) => e.gremlinId === "rest")).toBe(true);
        // Counted on the counting PRNG: pin, target, duration, and no start draw.
        expect(run.calls).toBe(3);
        expect(run.draws).toBeGreaterThanOrEqual(3);
      }),
      { numRuns: 200, seed: 1704021719 },
    );
  });
});

// ---- Property 17 ----

describe("Run independence", () => {
  // Feature: gremlin-engine, Property 17: Run independence
  // Validates: Requirements 7.5
  it("Property 17: a Run_Index builds the same result alone, after other indices, or in any order", () => {
    fc.assert(
      fc.property(
        arbEventListInput,
        fc.array(arbRunIndex, { minLength: 1, maxLength: 6 }),
        fc.infiniteStream(fc.nat()),
        (base, others, picks) => {
          const indices = [...new Set([base.runIndex, ...others])];
          const withIndex = (runIndex: number): GenerateInput => ({ ...base, runIndex });

          // Reference: each index built alone, in a call with nothing built before it.
          const alone = new Map(indices.map((i) => [i, JSON.stringify(buildOk(withIndex(i)))]));

          // A seeded-by-fast-check shuffle (no Math.random): pick from the remaining indices.
          const remaining = [...indices];
          const shuffled: number[] = [];
          const pickIter = picks[Symbol.iterator]();
          while (remaining.length > 0) {
            const n = pickIter.next().value as number;
            shuffled.push(remaining.splice(n % remaining.length, 1)[0]!);
          }

          const orders: number[][] = [
            [...indices],
            [...indices].reverse(),
            shuffled,
            // Other indices first, then the index under test.
            [...indices.filter((i) => i !== base.runIndex), base.runIndex],
          ];
          for (const order of orders) {
            for (const i of order) {
              expect(JSON.stringify(buildOk(withIndex(i)))).toBe(alone.get(i));
            }
          }
        },
      ),
      { numRuns: 200, seed: 1704021720 },
    );
  });
});

// ---- Examples (task 17.10) ----

/** A scripted PRNG: `nextInt` returns the queued values in order and records each requested range. */
function scriptedPrng(values: readonly number[]): {
  prng: Prng;
  ranges: Array<[number, number]>;
  remaining: () => number;
} {
  const queue = [...values];
  const ranges: Array<[number, number]> = [];
  let draws = 0;
  const prng: Prng = {
    nextU32: () => {
      throw new Error("scripted PRNG: nextU32 is not scripted");
    },
    nextInt: (min, max) => {
      ranges.push([min, max]);
      const v = queue.shift();
      if (v === undefined) throw new Error(`scripted PRNG ran out at call ${ranges.length}`);
      if (v < min || v > max) throw new Error(`scripted value ${v} is outside ${min}..${max}`);
      draws += 1;
      return v;
    },
    get drawCount() {
      return draws;
    },
  };
  return { prng, ranges, remaining: () => queue.length };
}

function seamOk(
  fixture: Fixture,
  gremlinSet: readonly GremlinSpec[],
  runCycles: number,
  prng: Prng,
): { events: GeneratedRun["events"]; skipped: GeneratedRun["skipped"] } {
  const out = generateWithPrng({ fixture, gremlinSet, runCycles }, prng);
  if (isEngineError(out)) throw new Error(`generateWithPrng failed: ${JSON.stringify(out)}`);
  return out;
}

const EX_TWO_BUTTONS: Fixture = {
  pins: [
    { signal: "BTN_A", port: "D", bit: 2, direction: "input" },
    { signal: "BTN_B", port: "D", bit: 3, direction: "input" },
  ],
};

const EX_BUTTON_AND_SENSE: Fixture = {
  pins: [
    { signal: "BTN", port: "D", bit: 2, direction: "input" },
    { signal: "SENSE", port: "D", bit: 3, direction: "input", restState: "active" },
  ],
};

describe("Event list examples", () => {
  // Validates: Requirements 4.9
  it("repeated Gremlin ids run as separate instances in listed order, each with its own overrides", () => {
    const set: GremlinSpec[] = [
      { id: "masher", params: { pressCount: { min: 1, max: 1 } } },
      { id: "masher", params: { pressCount: { min: 2, max: 2 }, gapCycles: { min: 1000, max: 1000 } } },
    ];
    // First: pin, count, start. Second: pin, count, start, one gap.
    const { prng, ranges, remaining } = scriptedPrng([0, 1, 100, 1, 2, 500, 1000]);
    const run = seamOk(EX_TWO_BUTTONS, set, 1_000_000, prng);

    // Each instance asked for its own override ranges, in listed order.
    expect(ranges).toStrictEqual([
      [0, 1],
      [1, 1],
      [0, 999_999],
      [0, 1],
      [2, 2],
      [0, 999_999],
      [1000, 1000],
    ]);
    expect(remaining()).toBe(0);
    // First instance: lone Press, Release after half the default minimum gap (80,000 / 2).
    // Second instance: two Presses 1000 apart, Releases half a gap later.
    expect(run.events).toStrictEqual([
      { signal: "BTN_A", value: 0, cycle: 100, gremlinId: "masher" },
      { signal: "BTN_B", value: 0, cycle: 500, gremlinId: "masher" },
      { signal: "BTN_B", value: "release", cycle: 1000, gremlinId: "masher" },
      { signal: "BTN_B", value: 0, cycle: 1500, gremlinId: "masher" },
      { signal: "BTN_B", value: "release", cycle: 2000, gremlinId: "masher" },
      { signal: "BTN_A", value: "release", cycle: 40_100, gremlinId: "masher" },
    ]);
    expect(run.skipped).toStrictEqual([]);
  });

  // Validates: Requirements 4.9
  it("repeated Gremlin ids that skip are listed once per instance, in listed order", () => {
    const { prng, ranges } = scriptedPrng([]);
    const run = seamOk({ pins: [] }, [{ id: "masher" }, { id: "stuck" }, { id: "masher" }], 1_000_000, prng);
    expect(run.events).toStrictEqual([]);
    expect(run.skipped).toStrictEqual([
      { gremlinId: "masher", reason: "no-target-pin" },
      { gremlinId: "stuck", reason: "no-target-pin" },
      { gremlinId: "masher", reason: "no-target-pin" },
    ]);
    expect(ranges).toStrictEqual([]);
  });

  // Validates: Requirements 7.1
  it("one PRNG instance is passed to every entry in set order (scripted)", () => {
    const set: GremlinSpec[] = [
      { id: "stuck", params: { minSpanCycles: 1_000_000 } },
      { id: "dropout", params: { gapCycles: { min: 5000, max: 5000 } } },
      { id: "masher", params: { pressCount: { min: 1, max: 1 } } },
    ];
    // stuck: pin, start, span. dropout: pin, start, gap. masher: pin, count, start.
    const { prng, ranges, remaining } = scriptedPrng([0, 2_000_000, 3_000_000, 0, 700, 5000, 1, 1, 100]);
    const run = seamOk(EX_BUTTON_AND_SENSE, set, 10_000_000, prng);

    expect(ranges).toStrictEqual([
      [0, 1],
      [0, 9_000_000],
      [1_000_000, 8_000_000],
      [0, 0],
      [0, 9_999_999],
      [5000, 5000],
      [0, 1],
      [1, 1],
      [0, 9_999_999],
    ]);
    // One stream, fully consumed, nothing left over and nothing reseeded.
    expect(remaining()).toBe(0);
    expect(prng.drawCount).toBe(9);
    expect(run.events).toStrictEqual([
      { signal: "SENSE", value: 0, cycle: 0, gremlinId: "rest" },
      { signal: "SENSE", value: 0, cycle: 100, gremlinId: "masher" },
      { signal: "SENSE", value: "release", cycle: 700, gremlinId: "dropout" },
      { signal: "SENSE", value: 0, cycle: 5700, gremlinId: "dropout" },
      { signal: "SENSE", value: "release", cycle: 40_100, gremlinId: "masher" },
      { signal: "BTN", value: 0, cycle: 2_000_000, gremlinId: "stuck" },
      { signal: "BTN", value: "release", cycle: 5_000_000, gremlinId: "stuck" },
    ]);
  });

  // Validates: Requirements 7.3
  it("Rest_Events come ahead of Gremlin events at equal cycles", () => {
    const set: GremlinSpec[] = [
      { id: "dropout", params: { gapCycles: { min: 5000, max: 5000 } } },
      { id: "masher", params: { pressCount: { min: 1, max: 1 } } },
    ];
    // dropout: pin, start 0, gap. masher: pin BTN, count, start 0.
    const { prng } = scriptedPrng([0, 0, 5000, 0, 1, 0]);
    const run = seamOk(EX_BUTTON_AND_SENSE, set, 1_000_000, prng);
    expect(run.events.slice(0, 3)).toStrictEqual([
      { signal: "SENSE", value: 0, cycle: 0, gremlinId: "rest" },
      { signal: "SENSE", value: "release", cycle: 0, gremlinId: "dropout" },
      { signal: "BTN", value: 0, cycle: 0, gremlinId: "masher" },
    ]);
  });

  // Validates: Requirements 4.8, 7.2
  it("an unknown Gremlin id gives an unknown-gremlin error and generates no events or draws", () => {
    const set: GremlinSpec[] = [{ id: "masher" }, { id: "nope" }];
    const { prng, ranges } = scriptedPrng([]);
    const seam = generateWithPrng({ fixture: EX_TWO_BUTTONS, gremlinSet: set, runCycles: 1_000_000 }, prng);
    expect(seam).toMatchObject({ kind: "unknown-gremlin", gremlinId: "nope" });
    expect("events" in seam).toBe(false);
    expect(ranges).toStrictEqual([]);
    expect(prng.drawCount).toBe(0);

    const built = buildEventList({
      fixture: EX_TWO_BUTTONS,
      gremlinSet: set,
      runCycles: 1_000_000,
      campaignSeed: 1,
      runIndex: 0,
    });
    expect(built).toMatchObject({ kind: "unknown-gremlin", gremlinId: "nope" });
    expect("events" in built).toBe(false);
  });

  // Validates: Requirements 4.8, 7.2
  it("a bad parameter gives an invalid-gremlin-parameter error and generates no events or draws", () => {
    const set: GremlinSpec[] = [{ id: "masher" }, { id: "masher", params: { pressCount: { min: 0, max: 3 } } }];
    const { prng, ranges } = scriptedPrng([]);
    const seam = generateWithPrng({ fixture: EX_TWO_BUTTONS, gremlinSet: set, runCycles: 1_000_000 }, prng);
    expect(seam).toMatchObject({
      kind: "invalid-gremlin-parameter",
      gremlinId: "masher",
      parameter: "pressCount",
    });
    expect("events" in seam).toBe(false);
    expect(ranges).toStrictEqual([]);
    expect(prng.drawCount).toBe(0);

    const built = buildEventList({
      fixture: EX_TWO_BUTTONS,
      gremlinSet: set,
      runCycles: 1_000_000,
      campaignSeed: 1,
      runIndex: 0,
    });
    expect(built).toMatchObject({ kind: "invalid-gremlin-parameter", parameter: "pressCount" });
    expect("events" in built).toBe(false);
  });
});
