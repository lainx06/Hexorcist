// Feature: trace-reducer. Property 9: event helpers match their definitions.
// Passing runs are evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { findBursts, noChangeIndexes, presentedValues, snapValue } from "../reducer/events";
import { arbFixture, arbRandomList, refBursts, refNoChange, refPresented, refSnap } from "./reducer-arbitraries";

describe("trace-reducer event helpers", () => {
  // Feature: trace-reducer, Property 9: Event helpers match their definitions
  it("Property 9: presentedValues, noChangeIndexes, findBursts and snapValue match the glossary", () => {
    for (let x = 0; x <= 1023; x++) expect(snapValue(x)).toBe(refSnap(x));
    expect(snapValue(256)).toBe(512);
    fc.assert(
      fc.property(
        arbFixture.chain((f) => fc.tuple(fc.constant(f), arbRandomList(f))),
        ([f, list]) => {
          expect(presentedValues(list, f)).toStrictEqual(refPresented(list, f));
          expect(noChangeIndexes(list, f)).toStrictEqual(refNoChange(list, f));
          expect(findBursts(list)).toStrictEqual(refBursts(list));
        },
      ),
      { seed: 20261209, numRuns: 300 },
    );
  }, 60_000);
});