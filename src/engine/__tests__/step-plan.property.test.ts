// Property test for the step planner (task 20.2).
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { planTarget, type PlanInput } from "../step-plan";

const MAX_OVERSHOOT = 8;

// Pending cycles: ascending, duplicates allowed, small enough to collide with
// targets often, with a few larger values.
const arbCycles = fc
  .array(
    fc.oneof(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 5000 })),
    { maxLength: 12 },
  )
  .map((a) => a.sort((x, y) => x - y));

const arbMaxStep = fc.oneof(
  fc.integer({ min: 1, max: 5 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100000 }),
);

const arbPlanInput: fc.Arbitrary<PlanInput> = fc
  .record({
    prevTarget: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3000 })),
    overshoot: fc.integer({ min: 0, max: MAX_OVERSHOOT }),
    pendingCycles: arbCycles,
    runGap: fc.oneof(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 6000 })),
    maxStepCycles: arbMaxStep,
  })
  .map((r) => {
    const cycleCount = r.prevTarget + r.overshoot;
    return {
      prevTarget: r.prevTarget,
      cycleCount,
      pendingCycles: r.pendingCycles,
      runCycles: cycleCount + r.runGap,
      maxStepCycles: r.maxStepCycles,
    };
  });

// Reference: walk forward one skipped candidate at a time, picking the
// candidate by sorting the three options (R8.9), and skip any target the
// bridge has already passed (R8.10).
function reference(i: PlanInput): number {
  let t = i.prevTarget;
  for (let guard = 0; guard < 1_000_000; guard++) {
    const options = [i.runCycles, t + i.maxStepCycles];
    const next = i.pendingCycles.filter((c) => c > t).sort((a, b) => a - b)[0];
    if (next !== undefined) options.push(next);
    options.sort((a, b) => a - b);
    const target = options[0];
    if (target > i.cycleCount) return target;
    t = target;
  }
  throw new Error("reference loop did not finish");
}

describe("Step planner", () => {
  // Feature: gremlin-engine, Property 20: Step planner
  // Validates: Requirements 8.9, 8.10
  it("Property 20: result is above cycleCount, at most runCycles, and equals the reference loop", () => {
    fc.assert(
      fc.property(arbPlanInput, (input) => {
        const target = planTarget(input);
        expect(Number.isInteger(target)).toBe(true);
        expect(target).toBeGreaterThan(input.cycleCount);
        expect(target).toBeLessThanOrEqual(input.runCycles);
        expect(target).toBe(reference(input));
      }),
      { numRuns: 200, seed: 2704042720 },
    );
  });

  // Feature: gremlin-engine, Property 20: Step planner
  // Validates: Requirements 8.9, 8.10
  it("Property 20: repeated calls with simulated overshoot give strictly increasing targets ending at runCycles", () => {
    fc.assert(
      fc.property(
        arbCycles,
        fc.integer({ min: 1, max: 3000 }),
        arbMaxStep,
        fc.array(fc.integer({ min: 0, max: MAX_OVERSHOOT }), { minLength: 1, maxLength: 50 }),
        (events, runCycles, maxStepCycles, overshoots) => {
          let prevTarget = 0;
          let cycleCount = 0;
          let calls = 0;
          const targets: number[] = [];
          while (cycleCount < runCycles) {
            const pendingCycles = events.filter((c) => c > cycleCount);
            const target = planTarget({ prevTarget, cycleCount, pendingCycles, runCycles, maxStepCycles });
            expect(target).toBeGreaterThan(cycleCount);
            expect(target).toBeLessThanOrEqual(runCycles);
            if (targets.length > 0) expect(target).toBeGreaterThan(targets[targets.length - 1]);
            targets.push(target);
            prevTarget = target;
            // The bridge stops at or a few cycles after the target. Overshoot
            // never ends the run early: only reaching the target runCycles does.
            const o = overshoots[calls % overshoots.length];
            cycleCount = target === runCycles ? target : Math.min(target + o, runCycles - 1);
            calls++;
            expect(calls).toBeLessThan(100000);
          }
          expect(targets[targets.length - 1]).toBe(runCycles);
        },
      ),
      { numRuns: 200, seed: 2704042721 },
    );
  });
});
