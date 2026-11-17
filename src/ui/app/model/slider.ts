// Speed slider value mapping. Pure: no DOM, no clock, no randomness.
//
// The slider runs from 0 at its left end to SLIDER_MAX at its right end. The value is the pacing step of
// model/pacing.ts: step 0 plays the paced plan (slowest) and step SLIDER_MAX plays at real speed (1x), so
// moving the thumb to the right always makes the replay faster, never slower.
import { SLIDER_MAX } from "./pacing";

/** Left end of the slider: the paced replay. */
export const SLIDER_PACED = 0;
/** Right end of the slider: real speed (1x). */
export const SLIDER_REAL = SLIDER_MAX;

/** The pacing step for a slider value: a whole number from 0 to SLIDER_MAX. Anything else clamps; NaN is 0. */
export function sliderToStep(value: number): number {
  if (!Number.isFinite(value)) return SLIDER_PACED;
  return Math.min(SLIDER_REAL, Math.max(SLIDER_PACED, Math.trunc(value)));
}

/** The slider value for a pacing step. The two are the same number, so the thumb and the step never disagree. */
export function stepToSlider(step: number): number {
  return sliderToStep(step);
}
