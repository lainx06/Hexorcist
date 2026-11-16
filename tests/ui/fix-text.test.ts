// Feature: bench-ui-core. Fixed-build replay texts and "Try removing". Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fixedReplayText, tryRemovingText, withoutEvent } from "../../src/ui/app/model/fix-text";
import { eventsArb } from "./arbitraries";

describe("fix texts", () => {
  it("Property 26: removing one event keeps every other event", () => {
    // Feature: bench-ui-core, Property 26: Removing one event keeps every other event
    fc.assert(
      fc.property(eventsArb, fc.nat(), (list, k) => {
        fc.pre(list.length > 0);
        const i = k % list.length;
        const before = structuredClone(list);
        const out = withoutEvent(list, i);
        expect(out).toEqual(list.filter((_, j) => j !== i));
        expect(list).toEqual(before);
      }),
      { seed: 2601, numRuns: 200 },
    );
  });

  it("Property 27: replay outcome texts", () => {
    // Feature: bench-ui-core, Property 27: Replay outcome texts
    fc.assert(
      fc.property(fc.string(), fc.option(fc.record({ rule: fc.string(), cycle: fc.nat() }), { nil: null }), (target, v) => {
        const f = fixedReplayText(target, v);
        const t = tryRemovingText(target, v);
        if (v === null) {
          expect(f).toBe("The reduced replay does not break the rule on the fixed build.");
          expect(t).toBe("Without this event the rule does not break.");
        } else if (v.rule === target) {
          expect(f).toBe("The reduced replay still breaks the rule on the fixed build.");
          expect(t).toBe("Without this event the rule still breaks.");
        } else {
          expect(f).toBe(`The reduced replay breaks a different rule on the fixed build: ${v.rule}`);
          expect(t).toBe("Without this event the rule does not break.");
        }
      }),
      { seed: 2701, numRuns: 200 },
    );
  });
});