// Timeline model: levels at a cycle, Timeline_Events, window, lane segments, markers. Pure.
import { cycleText, msText } from "../../../engine/reducer/story";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { InputValue, OutputEvent, PinValue } from "../../../engine/types";
import { edgeValueText, inputValueText } from "./format";

/** Cycles shown after the Violation_Cycle (2 ms at 16 MHz). */
export const DISPLAY_MARGIN = 32_000;

export const LANES = ["REQUEST", "CAR_GREEN", "CAR_YELLOW", "CAR_RED", "WALK", "DONT_WALK", "GREMLINS"] as const;
export type LaneName = (typeof LANES)[number];

export type LaneLevel = PinValue | InputValue | number;

export function eventValue(e: ReducerEvent): InputValue | number {
  return "analog" in e ? e.analog : e.value;
}

/** Value of the latest edge of `signal` at or before c; the later list entry wins on equal cycles. */
export function levelAt(edges: readonly OutputEvent[], signal: string, c: number): PinValue | undefined {
  let best: OutputEvent | undefined;
  for (const e of edges) {
    if (e.signal !== signal || e.cycle > c) continue;
    if (best === undefined || e.cycle >= best.cycle) best = e;
  }
  return best === undefined ? undefined : best.value;
}

/** The same rule over event-list entries. */
export function inputLevelAt(events: readonly ReducerEvent[], signal: string, c: number): InputValue | number | undefined {
  let best: ReducerEvent | undefined;
  for (const e of events) {
    if (e.signal !== signal || e.cycle > c) continue;
    if (best === undefined || e.cycle >= best.cycle) best = e;
  }
  return best === undefined ? undefined : eventValue(best);
}

/** End of the Timeline_Window: min(v + 32,000, Reached_End). */
export function windowEnd(v: number, reachedEnd: number): number {
  return Math.min(v + DISPLAY_MARGIN, reachedEnd);
}

export type TimelineEvent =
  | { source: "input"; index: number; cycle: number; signal: string; value: InputValue | number; gremlinId: string }
  | { source: "output"; index: number; cycle: number; signal: string; value: PinValue };

/** Entries with 0 <= cycle <= end, ordered by cycle, inputs before outputs, then list index. */
export function timelineEvents(
  events: readonly ReducerEvent[],
  edges: readonly OutputEvent[],
  end: number,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  events.forEach((e, index) => {
    if (e.cycle >= 0 && e.cycle <= end) {
      out.push({ source: "input", index, cycle: e.cycle, signal: e.signal, value: eventValue(e), gremlinId: e.gremlinId });
    }
  });
  edges.forEach((e, index) => {
    if (e.cycle >= 0 && e.cycle <= end) {
      out.push({ source: "output", index, cycle: e.cycle, signal: e.signal, value: e.value });
    }
  });
  const rank = (t: TimelineEvent): number => (t.source === "input" ? 0 : 1);
  out.sort((a, b) => a.cycle - b.cycle || rank(a) - rank(b) || a.index - b.index);
  return out;
}

export interface Segment {
  from: number;
  /** Exclusive, except for the last segment, which ends at `end` inclusive. */
  to: number;
  level: LaneLevel;
}

/** Steps that change only at point cycles and stop at `end`. Nothing before the earliest point. */
export function laneSegments(points: readonly { cycle: number; value: LaneLevel }[], end: number): Segment[] {
  const sorted = points
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.cycle >= 0 && x.p.cycle <= end)
    .sort((a, b) => a.p.cycle - b.p.cycle || a.i - b.i)
    .map((x) => x.p);
  const segs: Segment[] = [];
  let k = 0;
  while (k < sorted.length) {
    const c = (sorted[k] as { cycle: number }).cycle;
    let level = (sorted[k] as { value: LaneLevel }).value;
    while (k < sorted.length && (sorted[k] as { cycle: number }).cycle === c) {
      level = (sorted[k] as { value: LaneLevel }).value;
      k++;
    }
    const to = k < sorted.length ? (sorted[k] as { cycle: number }).cycle : end;
    segs.push({ from: c, to, level });
  }
  return segs;
}

export interface Marker {
  cycle: number;
  signal: string;
  gremlinId: string;
  /** Index of the event in its list. */
  key: number;
}

/** One marker per Gremlin_Event inside [0, end]; Rest_Events get none. */
export function gremlinMarkers(events: readonly ReducerEvent[], end: number): Marker[] {
  const out: Marker[] = [];
  events.forEach((e, key) => {
    if (e.gremlinId !== "rest" && e.cycle >= 0 && e.cycle <= end) {
      out.push({ cycle: e.cycle, signal: e.signal, gremlinId: e.gremlinId, key });
    }
  });
  return out;
}

/** Markers with no matching Gremlin_Event in bestList (multiset match), when the count went down. */
export function markersToRemove(
  markers: readonly Marker[],
  bestGremlinCount: number,
  bestList: readonly ReducerEvent[],
): Marker[] {
  if (bestGremlinCount >= markers.length) return [];
  const pool = bestList.filter((e) => e.gremlinId !== "rest");
  const used = pool.map(() => false);
  const out: Marker[] = [];
  for (const m of markers) {
    let hit = -1;
    for (let i = 0; i < pool.length; i++) {
      const e = pool[i] as ReducerEvent;
      if (!used[i] && e.cycle === m.cycle && e.signal === m.signal && e.gremlinId === m.gremlinId) {
        hit = i;
        break;
      }
    }
    if (hit < 0) out.push(m);
    else used[hit] = true;
  }
  return out;
}

/** `count` evenly spaced ticks from 0 to end, labelled with Ms_Text. */
export function axisTicks(end: number, count: number): { cycle: number; label: string }[] {
  if (count < 2 || end <= 0) return [{ cycle: 0, label: msText(0) }];
  const out: { cycle: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const cycle = Math.floor((end * i) / (count - 1));
    out.push({ cycle, label: msText(cycle) });
  }
  return out;
}

export function timelineValueText(ev: TimelineEvent): string {
  return ev.source === "input" ? inputValueText(ev.value) : edgeValueText(ev.value);
}

/** "<cycleText> cycles · <msText> · <signal> = <value>". */
export function selectedEventText(ev: TimelineEvent): string {
  return `${cycleText(ev.cycle)} cycles \u00b7 ${msText(ev.cycle)} \u00b7 ${ev.signal} = ${timelineValueText(ev)}`;
}