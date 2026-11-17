// Move strip and shrink-view dots. Pure: integer cycles only, no DOM, no clock, no randomness.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { moveKind, type MoveKind } from "./moves";
import { EXAMPLE_LABELS, labelOf } from "./signal-labels";
import type { SignalLabels } from "./signal-labels";

const CYCLES_PER_MS = 16_000;
const HALF_MS = 8_000;

const PRESS_WORDS: Readonly<Record<MoveKind, string>> = {
  active: "pressed",
  held: "pressed and held",
  inactive: "let go",
};
const BEAM_WORDS: Readonly<Record<MoveKind, string>> = { active: "blocked", held: "blocked", inactive: "cleared" };
const SENSOR_WORDS: Readonly<Record<MoveKind, string>> = {
  active: "sensor on",
  held: "sensor held on",
  inactive: "sensor off",
};
const OTHER_WORDS: Readonly<Record<MoveKind, string>> = { active: "on", held: "held on", inactive: "off" };

/** "+<k> ms" with k = floor((cycle - e0 + 8,000) / 16,000). */
export function relativeTime(cycle: number, e0: number): string {
  return `+${Math.floor((cycle - e0 + HALF_MS) / CYCLES_PER_MS)} ms`;
}

/** Short move word of the event at index i, chosen by the active/held/inactive kind of `movePhrase`. */
export function stripPhrase(list: readonly ReducerEvent[], i: number, f: Fixture, labels: SignalLabels = EXAMPLE_LABELS): string {
  const e = list[i] as ReducerEvent;
  // Upload: no Example wording; the move names the pin by its Display_Name (Q8).
  if (labels.kind === "upload") return `changed ${labelOf(labels, e.signal).text}`;
  const kind = moveKind(list, i, f);
  switch (e.signal) {
    case "REQUEST":
    case "CLOSE":
      return PRESS_WORDS[kind];
    case "BEAM_CLEAR":
      return BEAM_WORDS[kind];
    case "PULSE":
      return SENSOR_WORDS[kind];
    default:
      return OTHER_WORDS[kind];
  }
}

function gremlinCycles(list: readonly ReducerEvent[]): number[] {
  return list.filter((e) => e.gremlinId !== "rest").map((e) => e.cycle);
}

export interface StripDot {
  cycle: number;
  label: string;
  gremlinId: string;
}

/** One dot per Gremlin_Event, in list order, labelled "<Relative_Time> <Strip_Phrase>". e0 is the earliest Gremlin_Event cycle. */
export function stripDots(list: readonly ReducerEvent[], fixture: Fixture, _v?: number, labels: SignalLabels = EXAMPLE_LABELS): StripDot[] {
  const e0 = Math.min(...gremlinCycles(list));
  const out: StripDot[] = [];
  list.forEach((e, i) => {
    if (e.gremlinId === "rest") return;
    out.push({ cycle: e.cycle, label: `${relativeTime(e.cycle, e0)} ${stripPhrase(list, i, fixture, labels)}`, gremlinId: e.gremlinId });
  });
  return out;
}

/** The ✕ label "<Relative_Time of v> broke". */
export function brokeLabel(list: readonly ReducerEvent[], v: number): string {
  const cycles = gremlinCycles(list);
  const e0 = cycles.length === 0 ? v : Math.min(...cycles);
  return `${relativeTime(v, e0)} broke`;
}

function sameEvent(a: ReducerEvent, b: ReducerEvent): boolean {
  if (a.cycle !== b.cycle || a.signal !== b.signal || a.gremlinId !== b.gremlinId) return false;
  const av = "value" in a;
  const bv = "value" in b;
  if (av !== bv) return false;
  return !av || (a as { value: unknown }).value === (b as { value: unknown }).value;
}

/** Indexes (into the Gremlin_Event dots of `original`) with no match in `pool`. Each pool entry matches at most one dot. */
function unmatchedDots(original: readonly ReducerEvent[], pool: readonly ReducerEvent[]): Set<number> {
  const events = pool.filter((e) => e.gremlinId !== "rest");
  const used = events.map(() => false);
  const out = new Set<number>();
  let dot = 0;
  for (const o of original) {
    if (o.gremlinId === "rest") continue;
    let hit = -1;
    for (let k = 0; k < events.length; k++) {
      if (!used[k] && sameEvent(o, events[k] as ReducerEvent)) {
        hit = k;
        break;
      }
    }
    if (hit < 0) out.add(dot);
    else used[hit] = true;
    dot++;
  }
  return out;
}

/** Faded dot indexes after a reduce-progress message: every earlier faded dot plus the dots with no match in bestList. */
export function fadeShrinkDots(
  original: readonly ReducerEvent[],
  bestList: readonly ReducerEvent[],
  faded: ReadonlySet<number>,
): Set<number> {
  const out = new Set<number>(faded);
  for (const d of unmatchedDots(original, bestList)) out.add(d);
  return out;
}

export interface ShrinkDot {
  cycle: number;
  style: "testing" | "needed" | "not-needed";
}

/** Dot styles: faded dots are "not-needed"; with a Reduced_List, matched dots are "needed" and the rest "not-needed". */
export function shrinkDots(
  original: readonly ReducerEvent[],
  faded: ReadonlySet<number>,
  reduced: readonly ReducerEvent[] | null,
): ShrinkDot[] {
  const absent = reduced === null ? null : unmatchedDots(original, reduced);
  const out: ShrinkDot[] = [];
  let dot = 0;
  for (const o of original) {
    if (o.gremlinId === "rest") continue;
    let style: ShrinkDot["style"];
    if (absent !== null) style = absent.has(dot) ? "not-needed" : "needed";
    else style = faded.has(dot) ? "not-needed" : "testing";
    out.push({ cycle: o.cycle, style });
    dot++;
  }
  return out;
}

/** Dots on the move strip are never closer than this, in CSS px. */
export const STRIP_MIN_GAP_PX = 90;

export interface StripLayout {
  /** Left offset in px of each dot, in the order of `dotCycles`. */
  dots: number[];
  /** Left offset in px of the break mark: always the right end of the track. */
  mark: number;
  /** True when the dots were spaced evenly because real time would have put two closer than the minimum gap. */
  even: boolean;
}

/**
 * Where the dots and the break mark sit on a track `usable` px wide. By real time, the earliest dot is at 0
 * and the break (cycle v) at `usable`. If any two neighbours (the mark included) would be closer than
 * `minGap`, every dot is placed evenly in time order instead: rank k of n at usable * k / n. Display only;
 * the labels keep the real times.
 */
export function stripLayout(
  dotCycles: readonly number[],
  v: number,
  usable: number,
  minGap: number = STRIP_MIN_GAP_PX,
): StripLayout {
  const n = dotCycles.length;
  const width = Math.max(0, usable);
  if (n === 0) return { dots: [], mark: width, even: false };
  const order = dotCycles.map((c, i) => ({ c, i })).sort((a, b) => a.c - b.c || a.i - b.i);
  const e0 = (order[0] as { c: number }).c;
  const span = Math.max(1, v - e0);
  const real = dotCycles.map((c) => (width * Math.max(0, Math.min(span, c - e0))) / span);
  const sorted = [...order.map((o) => real[o.i] as number), width];
  let bunched = false;
  for (let k = 1; k < sorted.length; k++) if ((sorted[k] as number) - (sorted[k - 1] as number) < minGap) bunched = true;
  if (!bunched) return { dots: real, mark: width, even: false };
  const dots = new Array<number>(n).fill(0);
  order.forEach((o, rank) => {
    dots[o.i] = (width * rank) / n;
  });
  return { dots, mark: width, even: true };
}

/** Indexes of the cycles with prevCursor < cycle <= nextCursor, in input order. */
export function crossed(prevCursor: number, nextCursor: number, cycles: readonly number[]): number[] {
  const out: number[] = [];
  cycles.forEach((c, i) => {
    if (c > prevCursor && c <= nextCursor) out.push(i);
  });
  return out;
}
