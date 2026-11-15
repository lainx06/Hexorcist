// Property test for the HELD text (held-text spec, task 2.4).
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RunResult } from "../types";
import { computeVerdict, heldText, type VerdictInput } from "../verdict";
import { arbVerdictHonestyInput } from "./rules-arbitraries-verdict";

const SEED = 1204202604;

const fallbackRun: RunResult = {
  runIndex: 0,
  runSeed: 1,
  eventList: [{ signal: "D2", value: 1, cycle: 5, gremlinId: "bounce" }],
  skipped: [],
  appliedInputs: [],
  outputEvents: [],
  diagnostics: [],
  cannotCheck: [],
  violation: null,
  endCycle: 100,
};

/** Turns any generated input into one that must reach HELD: clean runs, one gremlin event, nothing unchecked. */
const arbHeldInput: fc.Arbitrary<VerdictInput> = arbVerdictHonestyInput.map((raw): VerdictInput => {
  const base = raw.runs.length > 0 ? raw.runs : [fallbackRun];
  const runs = base.map(
    (r, i): RunResult => ({
      ...r,
      cannotCheck: [],
      violation: null,
      eventList: i === 0 ? [...r.eventList, { signal: "D2", value: 1, cycle: 5, gremlinId: "bounce" }] : r.eventList,
    }),
  );
  return {
    requestedRuns: runs.length,
    runs,
    finished: true,
    unmappedSignals: [],
    unsupportedPeripherals: [],
  };
});

describe("HELD text", () => {
  // Feature: held-text, Property 1: HELD text says emulated and uses the right plural
  // **Validates: Requirements 2.1, 2.2**
  it("Property 1: heldText(N) matches the exact wording for any N", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4294967296 }), (n) => {
        expect(heldText(n)).toBe(
          "No violation found in " + String(n) + " emulated " + (n === 1 ? "run" : "runs") + " of this gremlin set. Not a proof.",
        );
      }),
      { numRuns: 200, seed: SEED, examples: [[1], [2], [4294967296]] },
    );
  });

  // **Validates: Requirements 2.1, 2.2**
  it("computeVerdict for a HELD input returns heldText(runs.length) and runs.length", () => {
    fc.assert(
      fc.property(arbHeldInput, (input) => {
        const v = computeVerdict(input);
        expect(v).not.toBeNull();
        if (v === null || v.verdict !== "HELD") {
          expect(v?.verdict).toBe("HELD");
          return;
        }
        expect(v.text).toBe(heldText(input.runs.length));
        expect(v.runs).toBe(input.runs.length);
      }),
      { numRuns: 200, seed: SEED },
    );
  });
});
