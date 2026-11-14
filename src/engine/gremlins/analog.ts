// Generators for the two analog gremlins: spike and drifter.
// Every draw is one bounded draw from the passed generator, in the order the design fixes.
// Skips are decided before the first draw, except the drifter's run-too-short skip,
// which needs the drawn duration. Integer arithmetic only. Time is CPU cycles.

import type { EngineError } from "../errors";
import type { Prng } from "../prng";
import type { AnalogFixturePin } from "../types";
import type {
  GenerateFn,
  GenerateOutcome,
  GenerateParams,
  GeneratedEvent,
} from "./generate-types";
import { floorDiv, msToCycles, restLevelOf, truncDiv } from "./pins";

/** ADC count that a draw of 1 selects for a spike or a drift target. */
const HIGH_COUNT = 1023;

function draw(prng: Prng, min: number, max: number): number | EngineError {
  return prng.nextInt(min, max);
}

function rangeParam(params: GenerateParams, name: string): { min: number; max: number } {
  return params[name] as { min: number; max: number };
}

function scalarParam(params: GenerateParams, name: string): number {
  return params[name] as number;
}

function pick<T>(prng: Prng, list: readonly T[]): T | EngineError {
  const i = draw(prng, 0, list.length - 1);
  if (typeof i !== "number") return i;
  return list[i] as T;
}

function isError(x: unknown): x is EngineError {
  return typeof x === "object" && x !== null && "kind" in x && "message" in x;
}

function analogEvent(
  gremlinId: string,
  pin: AnalogFixturePin,
  analog: number,
  cycle: number,
): GeneratedEvent {
  return { signal: pin.signal, analog, cycle, gremlinId };
}

/**
 * Spike: one analog pin jumps to 0 or 1023, then returns to its Rest_Level after
 * a gap in milliseconds, if that lands inside the run. Draws: pin, value, start, gap.
 */
export const generateSpike: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "spike";
  if (ctx.eligible.analog.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const gapMs = rangeParam(params, "gapMs");

  const pin = pick(prng, ctx.eligible.analog);
  if (isError(pin)) return pin;
  const v = draw(prng, 0, 1);
  if (typeof v !== "number") return v;
  const start = draw(prng, 0, ctx.runCycles - 1);
  if (typeof start !== "number") return start;
  const ms = draw(prng, gapMs.min, gapMs.max);
  if (typeof ms !== "number") return ms;

  const events: GeneratedEvent[] = [analogEvent(id, pin, v === 0 ? 0 : HIGH_COUNT, start)];
  const back = start + msToCycles(ms);
  if (back < ctx.runCycles) events.push(analogEvent(id, pin, restLevelOf(pin), back));
  return { kind: "events", events };
};

/**
 * Drifter steps for resolved values. `durationCycles` is D, `steps` is S, `start`
 * is the first cycle of the drift. Step i (1 to S) lands at
 * `start + floor(D * i / S)` with value `rest + trunc((target - rest) * i / S)`.
 * The last step is the target, and no return-to-rest event follows the drift.
 * Early steps can equal the Rest_Level through truncation, which is legal.
 * Returns `invalid-gremlin-parameter` naming the drifter when D is below S,
 * since two steps would then share a cycle.
 *
 * @internal Exposed so the D below S defence can be tested with resolved values.
 */
export function drifterEvents(
  gremlinId: string,
  pin: AnalogFixturePin,
  target: number,
  durationCycles: number,
  steps: number,
  start: number,
): GeneratedEvent[] | EngineError {
  if (durationCycles < steps) {
    return {
      kind: "invalid-gremlin-parameter",
      gremlinId,
      parameter: "durationMs",
      message: `${gremlinId}.durationMs gives ${durationCycles} cycles, fewer than ${steps} steps`,
    };
  }
  const rest = restLevelOf(pin);
  const events: GeneratedEvent[] = [];
  for (let i = 1; i <= steps; i++) {
    const cycle = start + floorDiv(durationCycles * i, steps);
    const value = rest + truncDiv((target - rest) * i, steps);
    events.push(analogEvent(gremlinId, pin, value, cycle));
  }
  return events;
}

/**
 * Drifter: one analog pin moves in S steps from its Rest_Level to 0 or 1023
 * over D cycles. S is a parameter and is never drawn. Draws: pin, target,
 * duration in ms. Then, if the run cannot hold D cycles after a start of 0, the
 * gremlin skips as run-too-short after those three draws. Otherwise a fourth
 * draw picks the start.
 */
export const generateDrifter: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "drifter";
  if (ctx.eligible.analog.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const durationMs = rangeParam(params, "durationMs");
  const steps = scalarParam(params, "steps");

  const pin = pick(prng, ctx.eligible.analog);
  if (isError(pin)) return pin;
  const t = draw(prng, 0, 1);
  if (typeof t !== "number") return t;
  const ms = draw(prng, durationMs.min, durationMs.max);
  if (typeof ms !== "number") return ms;
  const d = msToCycles(ms);
  if (ctx.runCycles - 1 - d < 0) return { kind: "skipped", reason: "run-too-short" };
  const start = draw(prng, 0, ctx.runCycles - 1 - d);
  if (typeof start !== "number") return start;

  const events = drifterEvents(id, pin, t === 0 ? 0 : HIGH_COUNT, d, steps, start);
  if (!Array.isArray(events)) return events;
  return { kind: "events", events };
};
