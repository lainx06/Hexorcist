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

export interface PlanError {
  readonly kind: "invalid-plan-input";
  readonly message: string;
}

/**
 * Validates a PlanInput. Returns null when planTarget may be called, else a
 * typed error. Rejects non-integer or NaN numbers (including pending cycles),
 * runCycles <= cycleCount, and maxStepCycles < 1.
 */
export function checkPlanInput(input: PlanInput): PlanError | null {
  const bad = (message: string): PlanError => ({ kind: "invalid-plan-input", message });
  const fields: [string, number][] = [
    ["prevTarget", input.prevTarget],
    ["cycleCount", input.cycleCount],
    ["runCycles", input.runCycles],
    ["maxStepCycles", input.maxStepCycles],
  ];
  for (const [name, v] of fields) {
    if (!Number.isInteger(v)) return bad(`${name} must be an integer, got ${String(v)}`);
  }
  for (let k = 0; k < input.pendingCycles.length; k++) {
    if (!Number.isInteger(input.pendingCycles[k])) {
      return bad(`pendingCycles[${k}] must be an integer, got ${String(input.pendingCycles[k])}`);
    }
  }
  if (input.runCycles <= input.cycleCount) {
    return bad(`runCycles ${input.runCycles} must be greater than cycleCount ${input.cycleCount}`);
  }
  if (input.maxStepCycles < 1) return bad(`maxStepCycles must be at least 1, got ${input.maxStepCycles}`);
  return null;
}

/**
 * Precondition: checkPlanInput(input) returned null.
 *
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
