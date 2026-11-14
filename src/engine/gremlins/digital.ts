// Generators for the four digital gremlins: masher, bouncer, stuck, dropout.
// Every draw is one bounded draw from the passed generator, in the order the design fixes.
// Skips are decided before the first draw, so a skipped gremlin consumes nothing.
// Integer arithmetic only. Time is CPU cycles.

import type { EngineError } from "../errors";
import type { Prng } from "../prng";
import type { DigitalFixturePin, InputValue } from "../types";
import type {
  GenerateFn,
  GenerateOutcome,
  GenerateParams,
  GeneratedEvent,
} from "./generate-types";
import { floorDiv, pressValue } from "./pins";

function draw(prng: Prng, min: number, max: number): number | EngineError {
  return prng.nextInt(min, max);
}

function rangeParam(params: GenerateParams, name: string): { min: number; max: number } {
  return params[name] as { min: number; max: number };
}

function scalarParam(params: GenerateParams, name: string): number {
  return params[name] as number;
}

/** One draw over the whole list: index into it, or the error. */
function pick<T>(prng: Prng, list: readonly T[]): T | EngineError {
  const i = draw(prng, 0, list.length - 1);
  if (typeof i !== "number") return i;
  return list[i] as T;
}

function isError(x: unknown): x is EngineError {
  return typeof x === "object" && x !== null && "kind" in x && "message" in x;
}

function event(
  gremlinId: string,
  pin: DigitalFixturePin,
  value: InputValue,
  cycle: number,
): GeneratedEvent {
  return { signal: pin.signal, value, cycle, gremlinId };
}

/**
 * Masher: a burst of Presses, each followed by its Release. Draws: pin, press
 * count, start, then one gap per Press after the first. A Release lands half a
 * gap after its Press, using the last drawn gap for the last Press. A lone
 * Press uses half of the resolved minimum gap. The minimum gap is at least 2
 * cycles, so the half is in [1, gap - 1] and a Release falls strictly between
 * its Press and the next Press. Events from the first one at or past the run
 * end are dropped.
 */
export const generateMasher: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "masher";
  if (ctx.eligible.digital.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const pressCount = rangeParam(params, "pressCount");
  const gap = rangeParam(params, "gapCycles");

  const pin = pick(prng, ctx.eligible.digital);
  if (isError(pin)) return pin;
  const n = draw(prng, pressCount.min, pressCount.max);
  if (typeof n !== "number") return n;
  const start = draw(prng, 0, ctx.runCycles - 1);
  if (typeof start !== "number") return start;
  const gaps: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const g = draw(prng, gap.min, gap.max);
    if (typeof g !== "number") return g;
    gaps.push(g);
  }

  const press = pressValue(pin);
  const all: GeneratedEvent[] = [];
  let at = start;
  for (let j = 0; j < n; j++) {
    const gapForRelease = j < n - 1 ? (gaps[j] as number) : n > 1 ? (gaps[n - 2] as number) : gap.min;
    const delay = floorDiv(gapForRelease, 2);
    all.push(event(id, pin, press, at));
    all.push(event(id, pin, "release", at + delay));
    if (j < n - 1) at += gaps[j] as number;
  }
  return { kind: "events", events: cutAtRunEnd(all, ctx.runCycles) };
};

/**
 * Bouncer: 2 or more flips on one pin. Draws: pin, edge, flip count, start,
 * then one gap per flip after the first. Values alternate backwards from the
 * last flip, which carries the Press value for edge 0 and the Release value
 * for edge 1. Values are assigned over the whole list first, then flips at or
 * past the run end are dropped.
 */
export const generateBouncer: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "bouncer";
  if (ctx.eligible.digital.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const flipCount = rangeParam(params, "flipCount");
  const gap = rangeParam(params, "gapCycles");

  const pin = pick(prng, ctx.eligible.digital);
  if (isError(pin)) return pin;
  const edge = draw(prng, 0, 1);
  if (typeof edge !== "number") return edge;
  const flips = draw(prng, flipCount.min, flipCount.max);
  if (typeof flips !== "number") return flips;
  const start = draw(prng, 0, ctx.runCycles - 1);
  if (typeof start !== "number") return start;
  const cycles: number[] = [start];
  for (let k = 1; k < flips; k++) {
    const g = draw(prng, gap.min, gap.max);
    if (typeof g !== "number") return g;
    cycles.push((cycles[k - 1] as number) + g);
  }

  const press = pressValue(pin);
  const lastValue: InputValue = edge === 0 ? press : "release";
  const otherValue: InputValue = edge === 0 ? "release" : press;
  const all: GeneratedEvent[] = cycles.map((cycle, k) => {
    const fromEnd = flips - 1 - k;
    return event(id, pin, fromEnd % 2 === 0 ? lastValue : otherValue, cycle);
  });
  return { kind: "events", events: cutAtRunEnd(all, ctx.runCycles) };
};

/**
 * Stuck: Press at a start cycle, held for at least the minimum span, released
 * only if the release lands inside the run. Skips for a short run before any
 * draw. Draws: pin, start, span.
 */
export const generateStuck: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "stuck";
  if (ctx.eligible.digital.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const minSpan = scalarParam(params, "minSpanCycles");
  if (ctx.runCycles < minSpan + 1) return { kind: "skipped", reason: "run-too-short" };

  const pin = pick(prng, ctx.eligible.digital);
  if (isError(pin)) return pin;
  const start = draw(prng, 0, ctx.runCycles - minSpan);
  if (typeof start !== "number") return start;
  const span = draw(prng, minSpan, ctx.runCycles - start);
  if (typeof span !== "number") return span;

  const events: GeneratedEvent[] = [event(id, pin, pressValue(pin), start)];
  if (start + span < ctx.runCycles) events.push(event(id, pin, "release", start + span));
  return { kind: "events", events };
};

/**
 * Dropout: an input that rests active is released at a start cycle and pressed
 * again after a gap, if that lands inside the run. Draws: pin from those that
 * rest active, start, gap.
 */
export const generateDropout: GenerateFn = (ctx, params, prng): GenerateOutcome | EngineError => {
  const id = "dropout";
  if (ctx.eligible.restActive.length === 0) return { kind: "skipped", reason: "no-target-pin" };
  const gap = rangeParam(params, "gapCycles");

  const pin = pick(prng, ctx.eligible.restActive);
  if (isError(pin)) return pin;
  const start = draw(prng, 0, ctx.runCycles - 1);
  if (typeof start !== "number") return start;
  const g = draw(prng, gap.min, gap.max);
  if (typeof g !== "number") return g;

  const events: GeneratedEvent[] = [event(id, pin, "release", start)];
  if (start + g < ctx.runCycles) events.push(event(id, pin, pressValue(pin), start + g));
  return { kind: "events", events };
};

/** Keep events up to, not including, the first one at or past the run end. */
function cutAtRunEnd(events: GeneratedEvent[], runCycles: number): GeneratedEvent[] {
  const firstOut = events.findIndex((e) => e.cycle >= runCycles);
  return firstOut === -1 ? events : events.slice(0, firstOut);
}
