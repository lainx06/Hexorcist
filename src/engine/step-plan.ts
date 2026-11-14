/**
 * Step planner. Pure: no emulator import, no clock, no randomness.
 * Time is integer CPU cycles.
 */

export interface PlanInput {
  /** Previous absolute target; 0 before the initial Step. */
  readonly prevTarget: number;
  /** Bridge cycleCount after the previous Step (0 before the initial Step). */
  readonly cycleCount: number;
  /** Cycles of Input_Events not yet applied, ascending. */
  readonly pendingCycles: readonly number[];
  readonly runCycles: number;
  readonly maxStepCycles: number;
}

/**
 * Returns the next absolute target, always greater than cycleCount and never
 * above runCycles (while runCycles is greater than cycleCount).
 *
 * Candidates: the next pending cycle above the previous target, runCycles, and
 * previous target plus maxStepCycles. A target at or below cycleCount was
 * already passed by overshoot: it is skipped and the next one is derived from
 * the skipped target.
 */
export function planTarget(i: PlanInput): number {
  let t = i.prevTarget;
  for (;;) {
    let a = Infinity;
    for (const c of i.pendingCycles) {
      if (c > t) {
        a = c;
        break;
      }
    }
    const target = Math.min(a, i.runCycles, t + i.maxStepCycles);
    if (target > i.cycleCount) return target;
    t = target;
  }
}
