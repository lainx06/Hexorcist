// Pure event-list helpers for the trace reducer. No runtime imports.
// Time is integer CPU cycles. No wall clock, no random source.

import type { Fixture, FixturePin, InputValue } from "../types";
import type { ReducerEvent } from "./types";

export const REST_ID = "rest";
/** 2^53 - 1, the largest budget. */
export const UNLIMITED_BUDGET = 9007199254740991;
export const DEFAULT_BUDGET = 300;
/** Same value as DEFAULT_MAX_STEP_CYCLES in campaign.ts; repeated so the core never imports campaign.ts. */
export const DEFAULT_MAX_STEP_CYCLES = 160_000;
/** 2^32, same value as MAX_RUN_CYCLES in campaign.ts. */
export const MAX_RUN_CYCLES = 4_294_967_296;

const EVENT_KEYS: ReadonlySet<string> = new Set(["cycle", "signal", "gremlinId", "value", "analog"]);

export function isRest(e: ReducerEvent): boolean {
  return e.gremlinId === REST_ID;
}

export function gremlinCount(list: readonly ReducerEvent[]): number {
  let n = 0;
  for (const e of list) if (!isRest(e)) n++;
  return n;
}

export function isAnalogEvent(e: ReducerEvent): e is ReducerEvent & { analog: number } {
  return Object.prototype.hasOwnProperty.call(e, "analog");
}

/** Every field of an event is a primitive, so a spread is a deep copy. */
export function copyEvent(e: ReducerEvent): ReducerEvent {
  return { ...e };
}

export function copyList(list: readonly ReducerEvent[]): ReducerEvent[] {
  return list.map(copyEvent);
}

function isAnalogPin(p: FixturePin): boolean {
  return (p as { kind?: unknown }).kind === "analog";
}

function isInputPin(p: FixturePin): boolean {
  if (isAnalogPin(p)) return true;
  return (p as { direction?: unknown }).direction === "input";
}

/** The first pin of the Fixture with this signal, or undefined. Never throws. */
export function pinOf(fixture: Fixture, signal: string): FixturePin | undefined {
  try {
    for (const p of fixture.pins) {
      if (typeof p === "object" && p !== null && p.signal === signal) return p;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** The press value of a digital pin: 1 for activeLevel "high", 0 for "low" or absent. */
export function pressValue(pin: FixturePin): 0 | 1 {
  return (pin as { activeLevel?: unknown }).activeLevel === "high" ? 1 : 0;
}

export interface EventProblem {
  index: number;
  field: string;
  message: string;
}

function problem(index: number, field: string, what: string): EventProblem {
  return { index, field, message: `Event ${index}: field ${field} ${what}.` };
}

/**
 * Event checks of Requirements 1.5, 2.8, 3.11 and 13.19, in order, stopping at the lowest
 * failing index. runCycles null means no upper bound on cycle. Never throws.
 */
export function checkEventList(
  list: readonly unknown[],
  fixture: Fixture,
  opts: { runCycles: number | null },
): EventProblem | null {
  let prev = 0;
  for (let j = 0; j < list.length; j++) {
    let e: Record<string, unknown>;
    let keys: string[];
    try {
      const raw = list[j];
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return problem(j, "event", "is not an object");
      e = raw as Record<string, unknown>;
      keys = Object.keys(e);
    } catch {
      return problem(j, "event", "is not an object");
    }
    try {
      for (const k of keys) if (!EVENT_KEYS.has(k)) return problem(j, "event", `has the unknown key ${JSON.stringify(k)}`);
      const cycle = e.cycle;
      if (typeof cycle !== "number" || !Number.isSafeInteger(cycle) || cycle < 0) {
        return problem(j, "cycle", "is not a non-negative integer");
      }
      if (opts.runCycles !== null && cycle >= opts.runCycles) {
        return problem(j, "cycle", `is not below the run length of ${opts.runCycles} cycles`);
      }
      if (j > 0 && cycle < prev) return problem(j, "cycle", "is lower than the cycle of the event before it");
      prev = cycle;
      if (typeof e.gremlinId !== "string") return problem(j, "gremlinId", "is not a string");
      if (typeof e.signal !== "string") return problem(j, "signal", "is not a string");
      const pin = pinOf(fixture, e.signal);
      if (pin === undefined || !isInputPin(pin)) return problem(j, "signal", "names no input pin of the fixture");
      const hasValue = Object.prototype.hasOwnProperty.call(e, "value");
      const hasAnalog = Object.prototype.hasOwnProperty.call(e, "analog");
      if (hasValue === hasAnalog) return problem(j, "event", "must hold exactly one of value and analog");
      if (hasValue) {
        const v = e.value;
        if (v !== 0 && v !== 1 && v !== "release") return problem(j, "value", "is not 0, 1 or \"release\"");
        if (isAnalogPin(pin)) return problem(j, "value", "is a digital value on an analog pin");
      } else {
        const a = e.analog;
        if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a > 1023) {
          return problem(j, "analog", "is not an integer from 0 to 1023");
        }
        if (!isAnalogPin(pin)) return problem(j, "analog", "is an analog value on a digital pin");
      }
    } catch {
      return problem(j, "event", "could not be read");
    }
  }
  return null;
}

/** The value of an event: its digital value or its analog count. */
export function eventValue(e: ReducerEvent): InputValue | number {
  return isAnalogEvent(e) ? e.analog : (e as { value: InputValue }).value;
}

function startValue(fixture: Fixture, signal: string): InputValue | number {
  const pin = pinOf(fixture, signal);
  if (pin !== undefined && isAnalogPin(pin)) {
    const r = (pin as { restLevel?: unknown }).restLevel;
    return typeof r === "number" ? r : 512;
  }
  return "release";
}

/**
 * Presented_Value before each index (Requirement 6.1): the value of the latest earlier event
 * of the same signal, or the start value of the pin ("release" for digital, restLevel or 512 for analog).
 */
export function presentedValues(list: readonly ReducerEvent[], fixture: Fixture): (InputValue | number)[] {
  const last = new Map<string, InputValue | number>();
  const out: (InputValue | number)[] = [];
  for (const e of list) {
    out.push(last.has(e.signal) ? (last.get(e.signal) as InputValue | number) : startValue(fixture, e.signal));
    last.set(e.signal, eventValue(e));
  }
  return out;
}

/** Indexes of No_Change_Events (Requirement 6.4): gremlin events whose value equals the Presented_Value. */
export function noChangeIndexes(list: readonly ReducerEvent[], fixture: Fixture): number[] {
  const pv = presentedValues(list, fixture);
  const out: number[] = [];
  list.forEach((e, i) => {
    if (!isRest(e) && eventValue(e) === pv[i]) out.push(i);
  });
  return out;
}

/**
 * Bursts (Requirement 7.1): for each signal, maximal runs of two or more consecutive events of that
 * signal with the same gremlinId, rest events never included. Ordered by earliest index.
 */
export function findBursts(list: readonly ReducerEvent[]): number[][] {
  const bySignal = new Map<string, number[]>();
  list.forEach((e, i) => {
    const a = bySignal.get(e.signal);
    if (a === undefined) bySignal.set(e.signal, [i]);
    else a.push(i);
  });
  const out: number[][] = [];
  for (const idx of bySignal.values()) {
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 2) out.push(run);
      run = [];
    };
    for (const i of idx) {
      const e = list[i];
      if (isRest(e)) {
        flush();
        continue;
      }
      if (run.length > 0 && list[run[0]].gremlinId !== e.gremlinId) flush();
      run.push(i);
    }
    flush();
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/** Nearest of 0, 512 and 1023; 256 (a tie) gives 512 (Requirement 8.4). */
export function snapValue(x: number): 0 | 512 | 1023 {
  if (x <= 255) return 0;
  if (x <= 767) return 512;
  return 1023;
}

/** An analog gremlin event whose value is not 0, 512 or 1023. */
export function isSnapEligible(e: ReducerEvent): boolean {
  if (isRest(e) || !isAnalogEvent(e)) return false;
  return e.analog !== 0 && e.analog !== 512 && e.analog !== 1023;
}