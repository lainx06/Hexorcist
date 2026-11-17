// Crosswalk scene frame at the Cursor. Pure function of the shown replay's output edges, its
// recorded input events and the Cursor (integer cycles). No DOM, no clock, no randomness.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { FixturePin, OutputEvent } from "../../../engine/types";
import { inputLaneWord } from "./lanes";
import { STAGE_TEXT } from "./stage-copy";
import { levelAt } from "./timeline";

/** Scene geometry, in travel cycles. */
export const CROSSWALK_LOOP = 6_400_000;
export const CROSSWALK_STOP = 2_400_000;
export const CROSSWALK_STRIPES_FROM = 2_560_000;
export const CROSSWALK_STRIPES_TO = 3_520_000;
export const CROSSWALK_CAR_LEN = 960_000;
/** Cycles one drive-through of the scene lasts. */
export const CROSSWALK_PASS = 2_400_000;
/** Cycles one walker crossing lasts. */
export const CROSSWALK_WALK_CROSS = 4_800_000;

export type CarLight = "green" | "yellow" | "red" | "off";

export interface CrosswalkFrame {
  /** Front of the car along the road, 0 to CROSSWALK_LOOP. Holds at CROSSWALK_STOP while waiting. */
  carX: number;
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

/** Start cycles of the car passes that begin at or before c. Greedy from cycle 0. */
function planPasses(edges: readonly OutputEvent[], crossings: readonly number[], c: number): number[] {
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

  const passes: number[] = [];
  let prevEnd = 0;
  for (;;) {
    const candidates = [prevEnd, ...bp.filter((b) => b > prevEnd)];
    let found: number | null = null;
    for (const t of candidates) {
      if (t > c) break;
      let i = 0;
      while (i + 1 < bp.length && (bp[i + 1] as number) <= t) i++;
      let ok = clear[i] === true;
      for (let j = i + 1; ok && j < bp.length && (bp[j] as number) <= t + CROSSWALK_PASS; j++) ok = clear[j] === true;
      if (ok) {
        found = t;
        break;
      }
    }
    if (found === null) return passes;
    passes.push(found);
    prevEnd = found + CROSSWALK_PASS;
  }
}

export function crosswalkFrame(
  edges: readonly OutputEvent[],
  events: readonly ReducerEvent[],
  c: number,
): CrosswalkFrame {
  const crossings = planCrossings(edges, Math.max(0, c) + CROSSWALK_PASS);
  const passes = planPasses(edges, crossings, c);

  const pass = passes.find((t) => t <= c && c < t + CROSSWALK_PASS);
  const carX =
    pass === undefined
      ? CROSSWALK_STOP
      : (CROSSWALK_STOP + Math.floor((CROSSWALK_LOOP * (c - pass)) / CROSSWALK_PASS)) % CROSSWALK_LOOP;
  const carOnStripes = carX > CROSSWALK_STRIPES_FROM && carX - CROSSWALK_CAR_LEN < CROSSWALK_STRIPES_TO;

  const crossing = crossings.find((s) => s <= c && c < s + CROSSWALK_WALK_CROSS);
  const carLight = carLightAt(edges, c);
  const walkIsOn = walkOn(edges, c);
  return {
    carX,
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
