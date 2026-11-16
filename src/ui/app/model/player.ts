// Playback state of the shared Cursor. Pure: the view passes UI_Clock times in as `now`.
import type { TimelineEvent } from "./timeline";

export type Speed = "0.1x" | "1x";

/** Cycles per UI_Clock millisecond. */
export const RATE: Readonly<Record<Speed, number>> = { "1x": 16_000, "0.1x": 1_600 };

export const DEFAULT_SPEED: Speed = "1x";

export interface PlayerState {
  cursor: number;
  end: number;
  violation: number;
  playing: boolean;
  speed: Speed;
  anchor: { c0: number; t0: number } | null;
  selected: number | null;
}

function clamp(c: number, end: number): number {
  return Math.max(0, Math.min(c, end));
}

/** A new Replay: Cursor at the Violation_Cycle, paused. */
export function showReplay(end: number, violation: number, speed: Speed): PlayerState {
  return { cursor: clamp(violation, end), end, violation, playing: false, speed, anchor: null, selected: null };
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
  return { ...s, cursor: c };
}

export function setSpeed(s: PlayerState, speed: Speed, now: number): PlayerState {
  return { ...s, speed, anchor: s.playing ? { c0: s.cursor, t0: now } : null };
}

function moveTo(s: PlayerState, cursor: number, selected: number | null, now: number): PlayerState {
  const c = clamp(cursor, s.end);
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