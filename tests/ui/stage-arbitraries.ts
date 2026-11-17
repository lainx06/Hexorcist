// fast-check generators for the bench-ui-stage property tests (Properties 1-3, 5, 6, 10, 16-20).
// Integer cycles only; 16,000 cycles = 1 ms. tests/ui/arbitraries.ts is unchanged.
import fc from "fast-check";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { OutputEvent, PinValue } from "../../src/engine/types";

export const CYCLES_PER_MS = 16_000;

/** Check limit in whole ms, 1..60,000 (Property 16, 20). */
export const limitArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: 60_000 });

/** Text that is not a whole number in 1..60,000 once trimmed (empty included). */
export const badLimitTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.string({ maxLength: 8 }),
  fc.integer({ min: 60_001, max: 99_999_999 }).map(String),
  fc.constantFrom("0", "00", "-5", "1.5", "1e3", "abc", "  ", "12 ms"),
).filter((t) => {
  const s = t.trim();
  if (!/^[0-9]+$/.test(s)) return true;
  const n = Number(s);
  return n < 1 || n > 60_000;
});

/** X >= Y >= 0 for the Reduction card (Property 10). */
export const reductionCountsArb: fc.Arbitrary<{ x: number; y: number; stoppedAtBudget: boolean }> = fc
  .tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: 0, max: 500 }), fc.boolean())
  .map(([a, b, stoppedAtBudget]) => ({ x: Math.max(a, b), y: Math.min(a, b), stoppedAtBudget }));

/** Two cursors p <= q in 0..max (Property 6). */
export function cursorPairArb(max: number): fc.Arbitrary<{ p: number; q: number }> {
  return fc
    .tuple(fc.integer({ min: 0, max }), fc.integer({ min: 0, max }))
    .map(([a, b]) => ({ p: Math.min(a, b), q: Math.max(a, b) }));
}

function byCycle<T extends { cycle: number }>(list: T[]): T[] {
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
}

/** Cycles that start at 0 and grow by gaps; small gaps make Clusters. */
function cyclesArb(count: number, startMax: number): fc.Arbitrary<number[]> {
  const gapArb = fc.oneof(
    { weight: 3, arbitrary: fc.integer({ min: 0, max: 16_000 }) },
    { weight: 2, arbitrary: fc.integer({ min: 16_001, max: 2_000_000 }) },
  );
  return fc.tuple(fc.integer({ min: 0, max: startMax }), fc.array(gapArb, { minLength: count, maxLength: count })).map(
    ([start, gaps]) => {
      const out: number[] = [];
      let c = start;
      for (const g of gaps) {
        c += g;
        out.push(c);
      }
      return out;
    },
  );
}

const DIGITAL_VALUES = [0, 1, "release"] as const;

/**
 * A Reduced_List (sorted by cycle, at least one Gremlin_Event, some Rest_Events)
 * and a violation cycle v above every event cycle (Properties 1-3, 6).
 */
export const reducedListArb: fc.Arbitrary<{ list: ReducerEvent[]; v: number }> = fc
  .integer({ min: 1, max: 14 })
  .chain((n) =>
    fc.tuple(
      cyclesArb(n, 8_000_000),
      fc.array(fc.constantFrom("masher", "bouncer", "rest"), { minLength: n, maxLength: n }),
      fc.array(fc.constantFrom("REQUEST", "BEAM_CLEAR", "PULSE"), { minLength: n, maxLength: n }),
      fc.array(fc.constantFrom(...DIGITAL_VALUES), { minLength: n, maxLength: n }),
      fc.integer({ min: 1, max: 4_000_000 }),
    ),
  )
  .map(([cycles, ids, signals, values, tail]) => {
    const events: ReducerEvent[] = cycles.map((cycle, i) => ({
      cycle,
      signal: signals[i] as string,
      value: values[i] as 0 | 1 | "release",
      gremlinId: i === 0 ? "masher" : (ids[i] as string),
    }));
    const list = byCycle(events);
    const last = list.reduce((m, e) => Math.max(m, e.cycle), 0);
    return { list, v: last + tail };
  });

function edgesOf(signals: readonly string[], maxCycle: number, maxLength: number): fc.Arbitrary<OutputEvent[]> {
  const valueArb: fc.Arbitrary<PinValue> = fc.oneof(
    { weight: 8, arbitrary: fc.constantFrom(0 as const, 1 as const) },
    { weight: 1, arbitrary: fc.constant("input" as const) },
  );
  return fc
    .array(
      fc.record({
        signal: fc.constantFrom(...signals),
        value: valueArb,
        cycle: fc.integer({ min: 0, max: maxCycle }),
      }),
      { maxLength },
    )
    .map(byCycle);
}

/** Crosswalk output edges: CAR_GREEN, CAR_YELLOW, CAR_RED, WALK, DONT_WALK, sorted by cycle (Properties 17, 18). */
export const crosswalkEdgesArb: fc.Arbitrary<OutputEvent[]> = edgesOf(
  ["CAR_GREEN", "CAR_YELLOW", "CAR_RED", "WALK", "DONT_WALK"],
  16_000_000,
  40,
);

/** REQUEST input events (press = 0, release), sorted by cycle (Property 18). */
export const requestEventsArb: fc.Arbitrary<ReducerEvent[]> = fc
  .array(
    fc.record({
      cycle: fc.integer({ min: 0, max: 16_000_000 }),
      signal: fc.constant("REQUEST"),
      value: fc.constantFrom(0 as const, "release" as const),
      gremlinId: fc.constantFrom("masher", "bouncer", "rest"),
    }),
    { maxLength: 20 },
  )
  .map(byCycle);

/** BEAM_CLEAR input events (0, 1, release), sorted by cycle (Property 19). */
export const beamClearEventsArb: fc.Arbitrary<ReducerEvent[]> = fc
  .array(
    fc.record({
      cycle: fc.integer({ min: 0, max: 3_000_000 }),
      signal: fc.constant("BEAM_CLEAR"),
      value: fc.constantFrom(...DIGITAL_VALUES),
      gremlinId: fc.constantFrom("masher", "bouncer", "rest"),
    }),
    { maxLength: 12 },
  )
  .map(byCycle);

/** HEARTBEAT edges: values alternate 0/1 at strictly increasing cycles (Property 20). */
export const heartbeatEdgesArb: fc.Arbitrary<OutputEvent[]> = fc
  .tuple(
    fc.constantFrom(0 as const, 1 as const),
    fc.array(fc.integer({ min: 1, max: 4_000_000 }), { maxLength: 20 }),
    fc.integer({ min: 0, max: 1_000_000 }),
  )
  .map(([first, gaps, start]) => {
    const out: OutputEvent[] = [];
    let c = start;
    let level: 0 | 1 = first;
    for (const g of gaps) {
      out.push({ signal: "HEARTBEAT", value: level, cycle: c });
      c += g;
      level = level === 0 ? 1 : 0;
    }
    return out;
  });
