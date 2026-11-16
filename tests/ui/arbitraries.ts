// Shared fast-check generators for the bench-ui-core model tests.
import fc from "fast-check";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { OutputEvent } from "../../src/engine/types";

export const SIGNALS = ["A", "B", "C"] as const;

export const cycleArb = fc.integer({ min: 0, max: 200 });

export const edgeArb: fc.Arbitrary<OutputEvent> = fc.record({
  signal: fc.constantFrom(...SIGNALS),
  value: fc.constantFrom(0 as const, 1 as const, "input" as const),
  cycle: cycleArb,
});

export const edgesArb = fc.array(edgeArb, { maxLength: 30 });

export const inputEventArb: fc.Arbitrary<ReducerEvent> = fc.oneof(
  fc.record({
    cycle: cycleArb,
    signal: fc.constantFrom(...SIGNALS),
    value: fc.constantFrom(0 as const, 1 as const, "release" as const),
    gremlinId: fc.constantFrom("masher", "bouncer", "rest"),
  }),
  fc.record({
    cycle: cycleArb,
    signal: fc.constantFrom(...SIGNALS),
    analog: fc.integer({ min: 0, max: 1023 }),
    gremlinId: fc.constantFrom("spike", "rest"),
  }),
);

export const eventsArb = fc.array(inputEventArb, { maxLength: 20 });

/** Reference: the value of the latest entry at or before c, later list entry on equal cycles. */
export function refLevel<T extends { signal: string; cycle: number }, V>(
  list: readonly T[],
  signal: string,
  c: number,
  value: (x: T) => V,
): V | undefined {
  let best: T | undefined;
  for (const e of list) {
    if (e.signal === signal && e.cycle <= c && (best === undefined || e.cycle >= best.cycle)) best = e;
  }
  return best === undefined ? undefined : value(best);
}