// Feature: bench-ui-core. Scene state from the shown replay's levels. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { OutputEvent } from "../../src/engine/types";
import { SCENE_NOTE, SCENE_SIGNALS, sceneAt } from "../../src/ui/app/model/scene";
import { refLevel } from "./arbitraries";

const edgeArb: fc.Arbitrary<OutputEvent> = fc.record({
  signal: fc.constantFrom("CAR_RED", "CAR_YELLOW", "CAR_GREEN", "WALK", "DONT_WALK"),
  value: fc.constantFrom(0 as const, 1 as const, "input" as const),
  cycle: fc.integer({ min: 0, max: 100 }),
});

describe("scene model", () => {
  it("Property 6: scene state follows the shown replay's levels", () => {
    // Feature: bench-ui-core, Property 6: Scene state follows the shown Replay's levels
    fc.assert(
      fc.property(fc.array(edgeArb, { maxLength: 25 }), fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }), fc.integer({ min: 0, max: 110 }), (edges, v, c) => {
        const s = sceneAt({ outputEdges: edges, violation: v === null ? null : { rule: "r", cycle: v } }, c);
        for (const sig of SCENE_SIGNALS) {
          const l = refLevel(edges, sig, c, (e) => e.value);
          const word = l === 0 ? "0" : l === 1 ? "1" : "not driven";
          expect(s.levels[sig]).toBe(word);
          expect(s.lit[sig]).toBe(word === "1");
        }
        expect(s.labels.carGreen).toBe(`CAR_GREEN = ${s.levels.CAR_GREEN}`);
        expect(s.labels.walk).toBe(`WALK = ${s.levels.WALK}`);
        expect(s.bracket).toBe(v !== null && c >= v && s.lit.CAR_GREEN && s.lit.WALK);
      }),
      { seed: 601, numRuns: 200 },
    );
  });

  it("with no replay every level is not driven and there is no bracket", () => {
    const s = sceneAt(null, 0);
    expect(Object.values(s.levels)).toEqual(["not driven", "not driven", "not driven", "not driven"]);
    expect(s.bracket).toBe(false);
    expect(SCENE_NOTE).toBe("Illustrative scene \u00b7 firmware outputs shown");
  });
});