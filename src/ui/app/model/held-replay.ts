// The replay shown after a HELD verdict on the buggy build: which try to show and which part of it plays.
// Pure, integer cycles only. No DOM, no clock, no randomness.
import type { ReducerEvent } from "../../../engine/reducer/types";
import { buildPlan, PRE_ROLL } from "./pacing";
import type { PacingPlan } from "./pacing";

/** The segment ends this long after the latest gremlin event (500 ms at 16 MHz). */
export const HELD_POST_ROLL = 8_000_000;
/** A try with no gremlin events plays from its start for this long (1 s at 16 MHz). */
export const HELD_QUIET_SPAN = 16_000_000;

export interface HeldRunChoice {
  /** Zero-based run index of the try to show. */
  runIndex: number;
  /** "trigger": the lowest run index whose rule trigger occurred. "run-0": the campaign result has no such data. */
  source: "trigger" | "run-0";
}

/**
 * The try to show: the lowest run index whose rule trigger occurred, when the campaign result lists
 * those run indexes; otherwise run 0.
 */
export function chooseHeldRun(triggeredRunIndexes?: readonly number[]): HeldRunChoice {
  if (triggeredRunIndexes === undefined || triggeredRunIndexes.length === 0) return { runIndex: 0, source: "run-0" };
  return { runIndex: Math.min(...triggeredRunIndexes), source: "trigger" };
}

/** Cycles of the gremlin events of a list (rest-state events are not gremlin events). */
export function gremlinCycles(events: readonly ReducerEvent[]): number[] {
  return events.filter((e) => e.gremlinId !== "rest").map((e) => e.cycle);
}

export interface HeldSegment {
  start: number;
  end: number;
}

/**
 * The part of a held try that plays. With gremlin events: from 200 ms before the earliest one (not below 0)
 * to 500 ms after the latest one (not past the end of the run). Without: from 0 to 1 s (not past the end).
 */
export function heldSegment(events: readonly ReducerEvent[], runEnd: number): HeldSegment {
  const cycles = gremlinCycles(events);
  if (cycles.length === 0) return { start: 0, end: Math.min(HELD_QUIET_SPAN, runEnd) };
  let lo = cycles[0] as number;
  let hi = lo;
  for (const c of cycles) {
    if (c < lo) lo = c;
    if (c > hi) hi = c;
  }
  return { start: Math.max(0, lo - PRE_ROLL), end: Math.min(hi + HELD_POST_ROLL, runEnd) };
}

/** The paced plan of the segment, from the existing buildPlan: it starts at the segment start and ends at its end. */
export function heldPlan(events: readonly ReducerEvent[], runEnd: number): PacingPlan {
  const seg = heldSegment(events, runEnd);
  // A run that ends before the segment would start has nothing to play.
  if (seg.end <= seg.start) return { start: seg.start, end: seg.start, pieces: [], totalMs: 0 };
  return buildPlan(gremlinCycles(events), seg.end);
}
