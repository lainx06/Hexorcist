// Playback state of the shared Cursor. Pure: the view passes UI_Clock times in as `now`.
import type { TimelineEvent } from "./timeline";

/** Playback speeds, slowest to fastest. The player only changes how fast the Cursor moves, never the data. */
export const SPEEDS = ["0.01x", "0.05x", "0.1x", "0.25x", "0.5x", "1x"] as const;
export type Speed = (typeof SPEEDS)[number];

/** Simulated cycles per millisecond at 16 MHz. */
export const CYCLES_PER_MS = 16_000;

/** Cycles per UI_Clock millisecond. */
export const RATE: Readonly<Record<Speed, number>> = {
  "0.01x": 160,
  "0.05x": 800,
  "0.1x": 1_600,
  "0.25x": 4_000,
  "0.5x": 8_000,
  "1x": 16_000,
};

export const DEFAULT_SPEED: Speed = "0.1x";

export function isSpeed(text: string): text is Speed {
  return (SPEEDS as readonly string[]).includes(text);
}

export interface PlayerState {
  cursor: number;
  end: number;
  violation: number;
  playing: boolean;
  speed: Speed;
  anchor: { c0: number; t0: number } | null;
  selected: number | null;
}

/** A whole cycle inside [0, end]; a non-finite value becomes 0. */
export function clampCursor(c: number, end: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(Math.round(c), end));
}

/** A new Replay: Cursor at the Violation_Cycle, paused. */
export function showReplay(end: number, violation: number, speed: Speed): PlayerState {
  return { cursor: clampCursor(violation, end), end, violation, playing: false, speed, anchor: null, selected: null };
}

export function play(s: PlayerState, now: number): PlayerState {
  const cursor = s.cursor >= s.end ? 0 : s.cursor;
  return { ...s, cursor, playing: true, anchor: { c0: cursor, t0: now } };
}

export function pause(s: PlayerState): PlayerState {
  return { ...s, playing: false, anchor: null };
}

export function tick(s: PlayerState, now: number): PlayerState {
  if (!s.playing || s.anchor === null) return s;
  const elapsed = Math.max(0, now - s.anchor.t0);
  const c = Math.min(s.anchor.c0 + Math.floor(RATE[s.speed] * elapsed), s.end);
  if (c >= s.end) return { ...s, cursor: s.end, playing: false, anchor: null };
  return { ...s, cursor: c, selected: c === s.cursor ? s.selected : null };
}

export function setSpeed(s: PlayerState, speed: Speed, now: number): PlayerState {
  return { ...s, speed, anchor: s.playing ? { c0: s.cursor, t0: now } : null };
}

function moveTo(s: PlayerState, cursor: number, selected: number | null, now: number): PlayerState {
  const c = clampCursor(cursor, s.end);
  return { ...s, cursor: c, selected, anchor: s.playing ? { c0: c, t0: now } : null };
}

export function stepNext(s: PlayerState, events: readonly TimelineEvent[], now: number): PlayerState {
  let idx = -1;
  if (s.selected !== null) {
    if (s.selected + 1 < events.length) idx = s.selected + 1;
  } else {
    idx = events.findIndex((e) => e.cycle > s.cursor);
  }
  if (idx < 0) return s;
  return moveTo(s, (events[idx] as TimelineEvent).cycle, idx, now);
}

export function stepPrev(s: PlayerState, events: readonly TimelineEvent[], now: number): PlayerState {
  let idx = -1;
  if (s.selected !== null) {
    if (s.selected - 1 >= 0 && s.selected - 1 < events.length) idx = s.selected - 1;
  } else {
    for (let i = events.length - 1; i >= 0; i--) {
      if ((events[i] as TimelineEvent).cycle < s.cursor) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return s;
  return moveTo(s, (events[idx] as TimelineEvent).cycle, idx, now);
}

export function home(s: PlayerState, now: number): PlayerState {
  return moveTo(s, 0, null, now);
}

/** End key: the Cursor goes to the Violation_Cycle. */
export function toEnd(s: PlayerState, now: number): PlayerState {
  return moveTo(s, s.violation, null, now);
}
/** Events the player jumps between: gremlin events and output changes. Rest events are left out. */
export function navEvents(events: readonly TimelineEvent[]): TimelineEvent[] {
  return events.filter((e) => e.source === "output" || e.gremlinId !== "rest");
}

/** Index of the nearest event after the Cursor, or -1. `events` is ordered by cycle. */
export function nextEventIndex(events: readonly TimelineEvent[], cursor: number): number {
  return events.findIndex((e) => e.cycle > cursor);
}

/** Index of the nearest event before the Cursor (the last one at that cycle), or -1. */
export function prevEventIndex(events: readonly TimelineEvent[], cursor: number): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if ((events[i] as TimelineEvent).cycle < cursor) return i;
  }
  return -1;
}

/** Moves the Cursor to the nearest event after it; no event there leaves the state as it is. */
export function jumpNext(s: PlayerState, events: readonly TimelineEvent[], now: number): PlayerState {
  const i = nextEventIndex(events, s.cursor);
  return i < 0 ? s : moveTo(s, (events[i] as TimelineEvent).cycle, i, now);
}

/** Moves the Cursor to the nearest event before it; no event there leaves the state as it is. */
export function jumpPrev(s: PlayerState, events: readonly TimelineEvent[], now: number): PlayerState {
  const i = prevEventIndex(events, s.cursor);
  return i < 0 ? s : moveTo(s, (events[i] as TimelineEvent).cycle, i, now);
}

/** Scrubber and plot clicks: the Cursor goes to `cycle`, clamped to the window. */
export function seek(s: PlayerState, cycle: number, now: number): PlayerState {
  return moveTo(s, cycle, null, now);
}

/** Arrow keys on the scrubber: move by whole milliseconds, clamped to the window. */
export function nudge(s: PlayerState, deltaMs: number, now: number): PlayerState {
  return seek(s, s.cursor + deltaMs * CYCLES_PER_MS, now);
}

/** Inverse of the plot x scale: x = 8 + cycle / end * (width - 16). */
export function cycleFromPlotX(px: number, width: number, end: number): number {
  if (!(width > 16) || !(end > 0)) return 0;
  return clampCursor(((px - 8) / (width - 16)) * end, end);
}
