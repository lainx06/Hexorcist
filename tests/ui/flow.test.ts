// Feature: bench-ui-core. Button enablement. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canApplyFix, canReplayAgain, canTryRemoving, canUnleash } from "../../src/ui/app/model/flow";
import type { FlowState } from "../../src/ui/app/model/flow";

const flowArb: fc.Arbitrary<FlowState> = fc.record({
  dataOk: fc.boolean(),
  runsOk: fc.boolean(),
  seedOk: fc.boolean(),
  busy: fc.constantFrom(null, "campaign" as const, "reduce" as const, "replay" as const),
  reduction: fc.constantFrom("none" as const, "running" as const, "result" as const, "error" as const),
  reducedReplayOk: fc.boolean(),
  fix: fc.constantFrom("hidden" as const, "available" as const, "used" as const),
});

describe("flow", () => {
  it("Property 22: button enablement follows the flow state", () => {
    // Feature: bench-ui-core, Property 22: Button enablement follows the flow state
    fc.assert(
      fc.property(flowArb, (s) => {
        const idle = s.busy === null;
        expect(canUnleash(s)).toBe(s.dataOk && s.runsOk && s.seedOk && idle);
        expect(canApplyFix(s)).toBe(idle && s.reduction === "result" && s.fix === "available");
        expect(canReplayAgain(s)).toBe(idle && s.reducedReplayOk);
        expect(canTryRemoving(s)).toBe(idle && s.reduction === "result");
        if (!idle) expect([canUnleash(s), canApplyFix(s), canReplayAgain(s), canTryRemoving(s)]).toEqual([false, false, false, false]);
      }),
      { seed: 2201, numRuns: 200 },
    );
  });
});