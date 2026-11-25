import fc from "fast-check";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { longestOverlap, measureEventList, pickCampaignMax } from "../../exorcism-demo/measure-overlap";
import type { GeneratedEvent } from "../../src/engine/event-list";
import type { Fixture, OutputEvent, PinValue } from "../../src/engine/types";

const A = "SIG_A";
const B = "SIG_B";

// Events for A, B and an unrelated signal, with 0, 1 and "input" values, in any order.
const eventArb: fc.Arbitrary<OutputEvent> = fc.record({
  cycle: fc.integer({ min: 0, max: 40 }),
  signal: fc.constantFrom(A, B, "OTHER"),
  value: fc.constantFrom<PinValue>(0, 1, "input"),
});

const caseArb = fc
  .tuple(fc.array(eventArb, { maxLength: 24 }), fc.integer({ min: 0, max: 20 }))
  .map(([events, extra]) => ({
    events,
    endCycle: events.reduce((m, e) => Math.max(m, e.cycle), 0) + extra,
  }));

/** Cycle-by-cycle reference: state at t is the last value applied at or before t (stable order). */
function reference(events: readonly OutputEvent[], endCycle: number): number {
  let best = 0;
  let run = 0;
  for (let t = 0; t < endCycle; t++) {
    let a = false;
    let b = false;
    const upto = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.cycle <= t)
      .sort((x, y) => x.e.cycle - y.e.cycle || x.i - y.i);
    for (const { e } of upto) {
      if (e.signal === A) a = e.value === 1;
      if (e.signal === B) b = e.value === 1;
    }
    run = a && b ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

describe("longestOverlap math", () => {
  // Feature: benchmark-tools, Property 1: Overlap result shape and microsecond formula
  // **Validates: Requirements 4.1, 4.2, 4.5**
  it("Property 1: integer in [0, endCycle], microsecond formula, and agreement with a cycle-by-cycle reference", () => {
    fc.assert(
      fc.property(caseArb, ({ events, endCycle }) => {
        const r = longestOverlap(events, A, B, endCycle);
        expect(Number.isInteger(r.cycles)).toBe(true);
        expect(r.cycles).toBeGreaterThanOrEqual(0);
        expect(r.cycles).toBeLessThanOrEqual(endCycle);
        expect(r.microseconds).toBe((r.cycles / 16).toFixed(2));
        expect(r.cycles).toBe(reference(events, endCycle));
      }),
      { numRuns: 300 },
    );
  });

  // Feature: benchmark-tools, Property 1: never both 1 gives 0 and "0.00"
  it("Property 1: signals never both 1 give 0 cycles and \"0.00\"", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 40 }), fc.constantFrom<PinValue>(0, "input")), { maxLength: 12 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 40 }), fc.constantFrom<PinValue>(0, 1, "input")), { maxLength: 12 }),
        fc.integer({ min: 0, max: 20 }),
        (aList, bList, extra) => {
          // A is never 1, so the pair is never both 1.
          const events: OutputEvent[] = [
            ...aList.map(([cycle, value]) => ({ cycle, signal: A, value })),
            ...bList.map(([cycle, value]) => ({ cycle, signal: B, value })),
          ];
          const endCycle = events.reduce((m, e) => Math.max(m, e.cycle), 0) + extra;
          const r = longestOverlap(events, A, B, endCycle);
          expect(r.cycles).toBe(0);
          expect(r.microseconds).toBe("0.00");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("a stretch still open at endCycle ends there", () => {
    const events: OutputEvent[] = [
      { cycle: 5, signal: A, value: 1 },
      { cycle: 7, signal: B, value: 1 },
    ];
    expect(longestOverlap(events, A, B, 20)).toEqual({ cycles: 13, microseconds: "0.81" });
  });

  it("\"input\" ends a stretch and a gap separates stretches", () => {
    const events: OutputEvent[] = [
      { cycle: 0, signal: A, value: 1 },
      { cycle: 0, signal: B, value: 1 },
      { cycle: 4, signal: B, value: "input" },
      { cycle: 6, signal: B, value: 1 },
      { cycle: 7, signal: A, value: 0 },
    ];
    expect(longestOverlap(events, A, B, 30).cycles).toBe(4);
  });
});

describe("pickCampaignMax", () => {
  // Small value range so ties and all-zero lists are common.
  const resultsArb = fc.array(
    fc.record({ cycles: fc.integer({ min: 0, max: 6 }) }),
    { minLength: 1, maxLength: 30 },
  );

  // Feature: benchmark-tools, Property 6: Campaign overlap selection is the maximum, with a consistent try number
  // **Validates: Requirements 4.10, 4.11**
  it("Property 6: reports the maximum, an index holding it, and 0 / \"0.00\" when all are zero", () => {
    fc.assert(
      fc.property(resultsArb, (results) => {
        const picked = pickCampaignMax(results);
        expect(picked).not.toBeNull();
        const best = picked!;
        const max = Math.max(...results.map((r) => r.cycles));
        expect(best.result.cycles).toBe(max);
        expect(best.result.microseconds).toBe((max / 16).toFixed(2));
        expect(Number.isInteger(best.tryIndex)).toBe(true);
        expect(best.tryIndex).toBeGreaterThanOrEqual(0);
        expect(best.tryIndex).toBeLessThan(results.length);
        expect(results[best.tryIndex]!.cycles).toBe(max);
        expect(best.noOverlap).toBe(max === 0);
        if (results.every((r) => r.cycles === 0)) {
          expect(best.result).toEqual({ cycles: 0, microseconds: "0.00" });
          expect(best.noOverlap).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("an empty list gives null", () => {
    expect(pickCampaignMax([])).toBeNull();
  });
});

describe("repeat determinism", () => {
  const dir = path.resolve(__dirname, "../../examples/crosswalk");
  const hex = fs.readFileSync(path.join(dir, "buggy/buggy.hex"), "utf8").replace(/\r/g, "");
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, "fixture.json"), "utf8")) as Fixture;
  const RUN_CYCLES = 320_000; // 20 ms of simulated time, short on purpose

  // REQUEST presses and releases at generated cycles, sorted by cycle. The empty list is allowed.
  const eventsArb: fc.Arbitrary<GeneratedEvent[]> = fc
    .array(
      fc.record({
        cycle: fc.integer({ min: 0, max: RUN_CYCLES - 1 }),
        value: fc.constantFrom<0 | "release">(0, "release"),
      }),
      { maxLength: 8 },
    )
    .map((list) =>
      [...list]
        .sort((a, b) => a.cycle - b.cycle)
        .map((e) => ({ signal: "REQUEST", value: e.value, cycle: e.cycle, gremlinId: "test" }) as GeneratedEvent),
    );

  const pairArb = fc.constantFrom(
    ["CAR_GREEN", "DONT_WALK"],
    ["CAR_GREEN", "CAR_GREEN"],
    ["WALK", "DONT_WALK"],
  );

  // Feature: benchmark-tools, Property 7: Repeated measurement of the same inputs is identical
  // **Validates: Requirements 4.4**
  it("Property 7: two fresh-emulator measurements of the same HEX, fixture and event list are equal", () => {
    fc.assert(
      fc.property(eventsArb, pairArb, (events, [a, b]) => {
        const loaded = { hex, fixture };
        const first = measureEventList(loaded, events, a!, b!, RUN_CYCLES);
        const second = measureEventList(loaded, events, a!, b!, RUN_CYCLES);
        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (first.ok && second.ok) {
          expect(second.result.cycles).toBe(first.result.cycles);
          expect(second.result.microseconds).toBe(first.result.microseconds);
        }
      }),
      { numRuns: 100 },
    );
  });
});
