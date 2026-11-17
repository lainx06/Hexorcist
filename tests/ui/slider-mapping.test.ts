// Speed slider value mapping (polish pass 1, item 5): left = slower (paced), right = real speed (1x).
// Node only. The tests are evidence about the mapping, not proof of how the thumb looks.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlan, cursorAt, CYCLES_PER_MS, POS_PER_MS, SLIDER_MAX, totalUnits } from "../../src/ui/app/model/pacing";
import { SLIDER_PACED, SLIDER_REAL, sliderToStep, stepToSlider } from "../../src/ui/app/model/slider";

const SEED = 20261201;

describe("slider value mapping", () => {
  it("the left end is the paced step 0 and the right end is real speed at SLIDER_MAX", () => {
    expect(SLIDER_PACED).toBe(0);
    expect(SLIDER_REAL).toBe(SLIDER_MAX);
    expect(sliderToStep(0)).toBe(0);
    expect(sliderToStep(SLIDER_MAX)).toBe(SLIDER_MAX);
  });

  it("clamps, truncates and maps a non-number to the paced end", () => {
    expect(sliderToStep(-3)).toBe(0);
    expect(sliderToStep(99)).toBe(SLIDER_MAX);
    expect(sliderToStep(4.9)).toBe(4);
    expect(sliderToStep(Number.NaN)).toBe(0);
    expect(sliderToStep(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("value and step are the same number for every slider position", () => {
    for (let v = 0; v <= SLIDER_MAX; v++) {
      expect(sliderToStep(v)).toBe(v);
      expect(stepToSlider(sliderToStep(v))).toBe(v);
    }
  });

  it("moving the thumb right never makes the replay longer: left is slower, right is real speed", () => {
    let plans = 0;
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 16_000_000 }), { minLength: 0, maxLength: 8 }),
        fc.integer({ min: 1, max: 4_000_000 }),
        (cycles, extra) => {
          const v = Math.max(0, ...cycles) + extra;
          const plan = buildPlan(cycles, v);
          if (plan.pieces.length === 0) return;
          plans++;
          let prev = Number.POSITIVE_INFINITY;
          for (let value = 0; value <= SLIDER_MAX; value++) {
            const units = totalUnits(plan, sliderToStep(value));
            expect(units).toBeLessThanOrEqual(prev);
            prev = units;
          }
          // Left end: the paced length. Right end: the segment at real speed (16,000 cycles per ms).
          expect(totalUnits(plan, sliderToStep(0))).toBe(plan.totalMs * POS_PER_MS);
          expect(totalUnits(plan, sliderToStep(SLIDER_MAX))).toBe(((plan.end - plan.start) * POS_PER_MS) / CYCLES_PER_MS);
          // At the same moment the Cursor is never further along at the left end than at the right end.
          for (const p of [0, 1, Math.floor(totalUnits(plan, 0) / 3), Math.floor(totalUnits(plan, 0) / 2), totalUnits(plan, 0)]) {
            expect(cursorAt(plan, sliderToStep(0), p)).toBeLessThanOrEqual(cursorAt(plan, sliderToStep(SLIDER_MAX), p));
          }
        },
      ),
      { seed: SEED, numRuns: 200 },
    );
    expect(plans).toBeGreaterThan(100);
  });
});
