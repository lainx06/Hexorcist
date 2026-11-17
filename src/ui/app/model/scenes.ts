// Garage and heartbeat scene state at the Cursor. Pure, integer cycles.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";
import { pinOf, pressValue } from "../../../engine/reducer/events";
import type { Fixture, FixturePin, OutputEvent } from "../../../engine/types";
import { inputLaneWord } from "./lanes";
import type { Span } from "./span";
import { inputLevelAt, levelAt } from "./timeline";

/** 300 ms at 16 MHz. */
export const DOOR_TRAVEL_CYCLES = 4_800_000;

export interface SceneReplay {
  outputEdges: readonly OutputEvent[];
  events: readonly ReducerEvent[];
  violation: Violation | null;
}

export interface GarageScene {
  travel: number;
  beamBlocked: boolean;
  deadlineMissed: boolean;
  summary: string;
}

export interface HeartbeatScene {
  lampLit: boolean;
  pulseOn: boolean;
  frozen: boolean;
  summary: string;
}

/** Door travel after the cycles below c; 0 is open. Clamped once per fixed-level interval. */
export function doorTravelAt(edges: readonly OutputEvent[], c: number): number {
  const marks = [
    ...new Set(
      edges
        .filter((e) => (e.signal === "MOTOR_CLOSE" || e.signal === "MOTOR_OPEN") && e.cycle < c)
        .map((e) => Math.max(0, e.cycle)),
    ),
  ].sort((a, b) => a - b);
  let travel = 0;
  marks.forEach((a, k) => {
    const b = k + 1 < marks.length ? (marks[k + 1] as number) : c;
    const close = levelAt(edges, "MOTOR_CLOSE", a) === 1;
    const open = levelAt(edges, "MOTOR_OPEN", a) === 1;
    if (close !== open) {
      travel += close ? b - a : a - b;
      travel = Math.min(DOOR_TRAVEL_CYCLES, Math.max(0, travel));
    }
  });
  return travel;
}

export function garageSceneAt(r: SceneReplay | null, c: number): GarageScene {
  if (r === null) return { travel: 0, beamBlocked: false, deadlineMissed: false, summary: "Door open, beam clear" };
  const travel = doorTravelAt(r.outputEdges, c);
  const beamBlocked = inputLevelAt(r.events, "BEAM_CLEAR", c) === 0;
  const deadlineMissed = r.violation !== null && c >= r.violation.cycle;
  return {
    travel,
    beamBlocked,
    deadlineMissed,
    summary: `Door ${String(Math.floor((travel * 100) / DOOR_TRAVEL_CYCLES))}% closed, beam ${beamBlocked ? "blocked" : "clear"}`,
  };
}

const PULSE_PIN: FixturePin = { signal: "PULSE", port: "D", bit: 2, direction: "input", activeLevel: "low" };

export function heartbeatSceneAt(r: SceneReplay | null, span: Span | null, c: number): HeartbeatScene {
  const lampLit = r !== null && levelAt(r.outputEdges, "HEARTBEAT", c) === 1;
  const pulseOn = r !== null && inputLaneWord(r.events, PULSE_PIN, c) === "pressed";
  const frozen = r !== null && span !== null && r.violation !== null && r.violation.cycle <= c && c <= span.end;
  return {
    lampLit,
    pulseOn,
    frozen,
    summary: `HEARTBEAT lamp ${lampLit ? "lit" : "off"}, PULSE ${pulseOn ? "pressed" : "released"}`,
  };
}

/** 10 ms at 16 MHz. */
export const FLICKER_WINDOW_CYCLES = 160_000;
const CYCLES_PER_MS = 16_000;

export const BEAM_TEXT = { blocked: "Beam blocked", clear: "Beam clear" } as const;
export const FLICKER_TEXT = "Sensor reading flickers";
export const RING_TEXT = { blinking: "blinking = program running" } as const;
export const FORGOT_LINE = "While waiting on the sensor, the program forgot to blink.";

/** True at every Cursor at or after the earliest BEAM_CLEAR Gremlin_Event; false when there is none. */
export function pumpkinShown(events: readonly ReducerEvent[], c: number): boolean {
  let earliest: number | null = null;
  for (const e of events) {
    if (e.signal === "BEAM_CLEAR" && e.gremlinId !== "rest" && (earliest === null || e.cycle < earliest)) earliest = e.cycle;
  }
  return earliest !== null && c >= earliest;
}

/** "Beam blocked" while BEAM_CLEAR is at its fixture active level at c, else "Beam clear". */
export function beamText(events: readonly ReducerEvent[], fixture: Fixture, c: number): "Beam blocked" | "Beam clear" {
  const pin = pinOf(fixture, "BEAM_CLEAR");
  if (pin === undefined) return BEAM_TEXT.clear;
  const v = inputLevelAt(events, "BEAM_CLEAR", c);
  const active = v === undefined ? (pin as { restState?: string }).restState === "active" : v !== "release" && v === pressValue(pin);
  return active ? BEAM_TEXT.blocked : BEAM_TEXT.clear;
}

/** True when BEAM_CLEAR changed level more than once at cycles in (c - 160,000, c]. Never looks past c. */
export function flickers(events: readonly ReducerEvent[], c: number): boolean {
  const own = events
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.signal === "BEAM_CLEAR" && x.e.cycle <= c)
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
  // The level is 0, 1 or "release"; the pin is released before any event.
  let level: 0 | 1 | "release" = "release";
  let changes = 0;
  own.forEach((e, k) => {
    const next = k + 1 < own.length ? own[k + 1] : undefined;
    if (next !== undefined && next.cycle === e.cycle) return; // the later event at the same cycle wins
    const now: 0 | 1 | "release" = "value" in e ? e.value : "release";
    if (now !== level && e.cycle > c - FLICKER_WINDOW_CYCLES) changes++;
    level = now;
  });
  return changes > 1;
}

export type ShownKind = "reduced-buggy" | "reduced-fixed" | "original-buggy" | "original-fixed";

/** The coral badge, only for the reduced replay on the buggy build at or past v. */
export function deadlineBadge(kind: ShownKind, v: number, c: number, limitMs: number): string | null {
  if (kind !== "reduced-buggy" || c < v) return null;
  return `${String(Math.floor(limitMs))} ms deadline missed \u00b7 door still closing`;
}

export interface Ring {
  num: number;
  den: number;
  stuck: "on" | "off" | null;
  label: string;
}

/** Ring fill num/den = min(1, cycles since the light last changed / (limit x 16,000)). */
export function ringAt(edges: readonly OutputEvent[], c: number, limitMs: number): Ring {
  const den = limitMs * CYCLES_PER_MS;
  const own = edges
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e.signal === "HEARTBEAT" && x.e.cycle <= c)
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
  let last = 0;
  let level: OutputEvent["value"] | undefined;
  for (const e of own) {
    if (e.value !== level) last = Math.max(0, e.cycle);
    level = e.value;
  }
  const since = Math.max(0, c - last);
  const num = Math.min(since, den);
  if (since < den) return { num, den, stuck: null, label: RING_TEXT.blinking };
  const stuck = level === 1 ? "on" : "off";
  return { num, den, stuck, label: `stuck ${stuck} for ${String(limitMs)} ms` };
}

/** True while a stuck Gremlin_Event holds PULSE active at c. */
export function stuckHoldsPulse(events: readonly ReducerEvent[], c: number): boolean {
  let best: ReducerEvent | undefined;
  for (const e of events) {
    if (e.signal !== "PULSE" || e.cycle > c) continue;
    if (best === undefined || e.cycle >= best.cycle) best = e;
  }
  return best !== undefined && best.gremlinId === "stuck" && "value" in best && best.value === pressValue(PULSE_PIN);
}

/** The 15.5 line, only when an I'm-alive rule broke on the buggy build. */
export function forgotLine(imAliveRuleBroke: boolean, build: "buggy" | "fixed"): string | null {
  return imAliveRuleBroke && build === "buggy" ? FORGOT_LINE : null;
}