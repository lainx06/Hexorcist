// Crosswalk scene frame at the Cursor. Pure function of the shown replay's output edges, its
// recorded input events and the Cursor (integer cycles). No DOM, no clock, no randomness.
//
// Car motion: one car per green. A green stretch of the car light gives at most one pass. A pass is
// accepted only when the whole pass window has a green or yellow car light, the walk sign off and no
// walker crossing. The car drives from the stop line out of the scene to the right and stays gone while
// the light stays green. While the light is yellow or red (or off), or while a pass has not started,
// a car waits at the stop line.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { FixturePin, OutputEvent } from "../../../engine/types";
import { inputLaneWord } from "./lanes";
import { STAGE_TEXT } from "./stage-copy";
import { levelAt } from "./timeline";

/** Scene geometry, in travel cycles. The scene is CROSSWALK_WIDTH cycles wide. */
export const CROSSWALK_WIDTH = 6_400_000;
export const CROSSWALK_STOP = 2_400_000;
export const CROSSWALK_STRIPES_FROM = 2_560_000;
export const CROSSWALK_STRIPES_TO = 3_520_000;
export const CROSSWALK_CAR_LEN = 960_000;
/** Front of the car when its rear has left the scene on the right. */
export const CROSSWALK_EXIT = CROSSWALK_WIDTH + CROSSWALK_CAR_LEN;
/** Cycles one drive-through lasts (500 ms), so it reads as a drive. */
export const CROSSWALK_PASS = 8_000_000;
/** Cycles one walker crossing lasts. */
export const CROSSWALK_WALK_CROSS = 4_800_000;

export type CarLight = "green" | "yellow" | "red" | "off";
/** "waiting": at the stop line. "driving": on a pass. "gone": the car of this green has left the scene. */
export type CarState = "waiting" | "driving" | "gone";

export interface CrosswalkFrame {
  /** Front of the car along the road. CROSSWALK_STOP while waiting, CROSSWALK_EXIT once gone. */
  carX: number;
  car: CarState;
  /** Cycles walked in the current crossing, 0 to CROSSWALK_WALK_CROSS. 0 while waiting on the top sidewalk. */
  walkerY: number;
  carLight: CarLight;
  walk: "on" | "off";
  conflict: boolean;
  lampLit: boolean;
  carOnStripes: boolean;
  walkerOnStripes: boolean;
}

const REQUEST_PIN: FixturePin = { signal: "REQUEST", port: "D", bit: 2, direction: "input", activeLevel: "low" };

function carLightAt(edges: readonly OutputEvent[], c: number): CarLight {
  if (levelAt(edges, "CAR_GREEN", c) === 1) return "green";
  if (levelAt(edges, "CAR_YELLOW", c) === 1) return "yellow";
  if (levelAt(edges, "CAR_RED", c) === 1) return "red";
  return "off";
}

function walkOn(edges: readonly OutputEvent[], c: number): boolean {
  return levelAt(edges, "WALK", c) === 1;
}

/**
 * Walker crossings with a start at or before `horizon`. Each starts at the earliest cycle at or after
 * the previous end where WALK is 1. Planning more horizon never changes an earlier crossing.
 */
function planCrossings(edges: readonly OutputEvent[], horizon: number): number[] {
  const walkCycles = [
    ...new Set(edges.filter((e) => e.signal === "WALK" && e.value === 1).map((e) => Math.max(0, e.cycle))),
  ].sort((a, b) => a - b);
  const starts: number[] = [];
  let from = 0;
  while (from <= horizon) {
    let s: number | null = null;
    if (walkOn(edges, from)) s = from;
    else s = walkCycles.find((w) => w > from && walkOn(edges, w)) ?? null;
    if (s === null || s > horizon) break;
    starts.push(s);
    from = s + CROSSWALK_WALK_CROSS;
  }
  return starts;
}

/** A green stretch of the car light: it starts at `from` and ends before `to` (Infinity when it never ends). */
export interface GreenStretch {
  from: number;
  to: number;
}

export interface CarPlan {
  /** Start cycle of each accepted pass, with the green stretch it belongs to. Ascending. */
  passes: { start: number; stretch: GreenStretch }[];
  /** Every green stretch that starts at or before the Cursor. */
  stretches: GreenStretch[];
}

/**
 * Passes that start at or before c. Greedy from cycle 0: each green stretch, in order, gets the earliest
 * pass start inside it whose whole window is clear and which does not overlap the pass before it.
 */
function planPasses(edges: readonly OutputEvent[], crossings: readonly number[], c: number): CarPlan {
  const marks = new Set<number>([0]);
  for (const e of edges) {
    if (e.signal === "CAR_GREEN" || e.signal === "CAR_YELLOW" || e.signal === "CAR_RED" || e.signal === "WALK") {
      marks.add(Math.max(0, e.cycle));
    }
  }
  for (const s of crossings) {
    marks.add(s);
    marks.add(s + CROSSWALK_WALK_CROSS);
  }
  const bp = [...marks].sort((a, b) => a - b);
  const crossingAt = (x: number): boolean => crossings.some((s) => s <= x && x < s + CROSSWALK_WALK_CROSS);
  // A segment is clear when the light is green or yellow, WALK is off and no crossing is under way.
  const clear = bp.map((x) => {
    const light = carLightAt(edges, x);
    return (light === "green" || light === "yellow") && !walkOn(edges, x) && !crossingAt(x);
  });
  const green = bp.map((x) => carLightAt(edges, x) === "green");

  const passes: CarPlan["passes"] = [];
  const stretches: GreenStretch[] = [];
  let prevEnd = 0;
  let i = 0;
  while (i < bp.length) {
    if (green[i] !== true) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < bp.length && green[j + 1] === true) j++;
    const stretch: GreenStretch = { from: bp[i] as number, to: j + 1 < bp.length ? (bp[j + 1] as number) : Number.POSITIVE_INFINITY };
    i = j + 1;
    if (stretch.from > c) break;
    stretches.push(stretch);
    const lower = Math.max(stretch.from, prevEnd);
    const candidates = [lower, ...bp.filter((b) => b > lower && b < stretch.to)];
    for (const t of candidates) {
      if (t > c || t >= stretch.to) break;
      let k = 0;
      while (k + 1 < bp.length && (bp[k + 1] as number) <= t) k++;
      let ok = clear[k] === true;
      for (let m = k + 1; ok && m < bp.length && (bp[m] as number) <= t + CROSSWALK_PASS; m++) ok = clear[m] === true;
      if (ok) {
        passes.push({ start: t, stretch });
        prevEnd = t + CROSSWALK_PASS;
        break;
      }
    }
  }
  return { passes, stretches };
}

/** The car plan for the Cursor c: passes and green stretches up to c. Exported for the property tests. */
export function carPlan(edges: readonly OutputEvent[], c: number): CarPlan {
  const crossings = planCrossings(edges, Math.max(0, c) + CROSSWALK_PASS);
  return planPasses(edges, crossings, c);
}

export function crosswalkFrame(
  edges: readonly OutputEvent[],
  events: readonly ReducerEvent[],
  c: number,
): CrosswalkFrame {
  const crossings = planCrossings(edges, Math.max(0, c) + CROSSWALK_PASS);
  const plan = planPasses(edges, crossings, c);
  const carLight = carLightAt(edges, c);

  const driving = plan.passes.find((p) => p.start <= c && c < p.start + CROSSWALK_PASS);
  let car: CarState;
  let carX: number;
  if (driving !== undefined) {
    car = "driving";
    carX = CROSSWALK_STOP + Math.floor(((CROSSWALK_EXIT - CROSSWALK_STOP) * (c - driving.start)) / CROSSWALK_PASS);
  } else {
    // The car of a green has gone once its pass has ended and the light is still in that green stretch.
    const stretch = plan.stretches.find((s) => s.from <= c && c < s.to);
    const left = stretch !== undefined && carLight === "green" && plan.passes.some((p) => p.stretch === stretch && p.start + CROSSWALK_PASS <= c);
    car = left ? "gone" : "waiting";
    carX = left ? CROSSWALK_EXIT : CROSSWALK_STOP;
  }
  const carOnStripes = carX > CROSSWALK_STRIPES_FROM && carX - CROSSWALK_CAR_LEN < CROSSWALK_STRIPES_TO;

  const crossing = crossings.find((s) => s <= c && c < s + CROSSWALK_WALK_CROSS);
  const walkIsOn = walkOn(edges, c);
  return {
    carX,
    car,
    walkerY: crossing === undefined ? 0 : c - crossing,
    carLight,
    walk: walkIsOn ? "on" : "off",
    conflict: carLight === "green" && walkIsOn,
    lampLit: inputLaneWord(events, REQUEST_PIN, c) === "pressed",
    carOnStripes,
    walkerOnStripes: crossing !== undefined,
  };
}

/** HTML label texts for a frame; values match the frame state. */
export function crosswalkLabels(f: CrosswalkFrame): { carLight: string; walk: string; button: string; conflict: string | null } {
  return {
    carLight: `Car light: ${f.carLight}`,
    walk: `Walk sign: ${f.walk}`,
    button: "Walk button",
    conflict: f.conflict ? STAGE_TEXT.bothGreen : null,
  };
}
