// Display motion of the crosswalk actors: the car, the walker and the walk button lamp. Pure: the caller
// passes display time in as `nowMs`; nothing here reads a clock, draws a random number or posts to the worker.
//
// crosswalkFrame (crosswalk-scene.ts) says where each actor is for a Cursor. That pose is the truth, but the
// paced replay plays some gaps far faster than a person can follow, so drawing the model pose directly makes
// the car cross the road in a few frames and the walker jump back to its start. Here each actor instead
// moves toward its model pose in display time, at a capped speed:
//   - the car needs at least CAR_CROSS_MS to cross the full scene width,
//   - the walker needs at least WALKER_CROSS_MS to cross the road.
// In a fast-forwarded gap an actor lags behind the model and then catches up smoothly. It never snaps,
// except on a jump (a new plan, Replay, a seek: the caller changes `epoch`), on the opening frame, and under
// reduced motion. The last CATCH_UP_MS before the end of playback are used to arrive exactly: the actor is
// held within reach of the end pose, so the break frame shows what the motion model says.
//
// The car lives on a conveyor: one lap is a car coming in at the left edge, waiting at the stop line, driving
// out at the right edge. `carU` counts laps, so a new car (the next green) is the same actor coming round,
// never a pop-in. The walker lives on a two-way path: it crosses back from where it stands.
// The two never meet in the picture (display rule only; the model, the lights and the badges are untouched):
// the drawn car does not enter, and is not inside, the crossing zone (stop line to the far edge of the stripes)
// while the drawn walker is on the road, and the drawn walker does not step onto the road while the drawn car is
// in the zone. A car that the model sends on holds at the stop line until the walker has cleared the road. A walker
// still on the road once the walk sign is off finishes its crossing at WALKER_CLEAR_LIFT times its normal speed, so
// the car's wait stays short. At the end of playback the model's own poses win (they are never in conflict, except
// the break of the original program, where the car waits at the stop line, outside the zone, and the walker crosses).
// The lamp is a small queue: every real press lights it for at least LAMP_MIN_MS, one flash per press, in order.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import type { CrosswalkFrame } from "./crosswalk-scene";
import {
  CROSSWALK_CAR_LEN,
  CROSSWALK_STOP,
  CROSSWALK_STRIPES_TO,
  CROSSWALK_WALK_CROSS,
  CROSSWALK_WIDTH,
  REQUEST_PIN,
  crosswalkFrame,
} from "./crosswalk-scene";
import { inputLaneWord } from "./lanes";

/** Display ms the car needs at least to cross the full scene width. */
export const CAR_CROSS_MS = 900;
/** Display ms the walker needs at least to cross the road. */
export const WALKER_CROSS_MS = 1_600;
/** The lamp stays lit at least this long (display ms) for each press. */
export const LAMP_MIN_MS = 250;
/** The lamp stays dark at least this long (display ms) between two flashes, so two presses never merge. */
export const LAMP_GAP_MS = 80;
/** The last display ms of playback, in which the actors arrive at the end pose. */
export const CATCH_UP_MS = 400;
/** A walker still on the road after the walk sign went off clears it at this many times its normal speed. */
export const WALKER_CLEAR_LIFT = 3;
/** One step of the actors never covers more display time than this, so a hidden tab does not make them jump. */
export const MAX_STEP_MS = 100;

/** Travel cycles per display ms at the speed caps. */
export const CAR_SPEED = CROSSWALK_WIDTH / CAR_CROSS_MS;
export const WALKER_SPEED = CROSSWALK_WALK_CROSS / WALKER_CROSS_MS;

// Scene geometry in travel cycles, as drawn by views/scene-crosswalk.ts: the view is 830 units wide, road
// travel 0 is at view x 100, 8,000 cycles per unit.
export const VIEW_UNITS = 830;
export const ROAD_X0_UNITS = 100;
export const CYCLES_PER_UNIT = 8_000;
/** Front of a car whose rear is at the left edge of the view: the car is just out of sight, coming in. */
export const CAR_ENTRY = CROSSWALK_CAR_LEN - ROAD_X0_UNITS * CYCLES_PER_UNIT;
/** Front of a car whose rear is at the right edge of the view: the car is just out of sight, gone. */
export const CAR_EXIT = (VIEW_UNITS - ROAD_X0_UNITS) * CYCLES_PER_UNIT + CROSSWALK_CAR_LEN;
/** One lap of the conveyor, in travel cycles. */
export const LAP = CAR_EXIT - CAR_ENTRY;
/** Front of the car when it touches the right edge of the view. */
const RIGHT_EDGE = (VIEW_UNITS - ROAD_X0_UNITS) * CYCLES_PER_UNIT;

/** Car position on the conveyor for a frame: laps done, plus where on the lap. Monotone in the Cursor. */
export function carU(f: Pick<CrosswalkFrame, "car" | "carX" | "passesDone">): number {
  if (f.car === "gone") return f.passesDone * LAP;
  if (f.car === "waiting") return f.passesDone * LAP + (CROSSWALK_STOP - CAR_ENTRY);
  return f.passesDone * LAP + (Math.min(f.carX, CAR_EXIT) - CAR_ENTRY);
}

/** Walker position on its two-way path: crossings done plus the walked part. Monotone in the Cursor. */
export function walkerU(f: Pick<CrosswalkFrame, "walkerY" | "crossingsDone">): number {
  return f.crossingsDone * CROSSWALK_WALK_CROSS + f.walkerY;
}

/** Share of the road crossed (0 at the top sidewalk, 1 at the bottom one) for a walker position. */
export function walkerFrac(u: number): number {
  const k = Math.floor(u / CROSSWALK_WALK_CROSS);
  const r = (u - k * CROSSWALK_WALK_CROSS) / CROSSWALK_WALK_CROSS;
  return k % 2 === 0 ? r : 1 - r;
}

/** Where the car is on its lap when its front is at the stop line, and when its rear has cleared the stripes. */
const STOP_LOCAL = CROSSWALK_STOP - CAR_ENTRY;
const ZONE_END_LOCAL = CROSSWALK_STRIPES_TO + CROSSWALK_CAR_LEN - CAR_ENTRY;

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** The car is inside the crossing zone: past the stop line, and its rear has not cleared the stripes. At the stop line it is outside. */
export function carInZone(u: number): boolean {
  const l = mod(u, LAP);
  return l > STOP_LOCAL && l < ZONE_END_LOCAL;
}

/** The walker is on the road, not on a sidewalk (its position is a whole number of crossings on a sidewalk). */
export function walkerOnRoad(u: number): boolean {
  return mod(u, CROSSWALK_WALK_CROSS) !== 0;
}

/** The furthest conveyor position the car may reach without entering the zone: the stop line of this lap, or of the next. */
function carGateLimit(u: number): number {
  const stop = Math.floor(u / LAP) * LAP + STOP_LOCAL;
  return u <= stop ? stop : stop + LAP;
}

export interface CarDraw {
  /** Travel cycles of the front of the car (as the model's carX). */
  x: number;
  /** Any part of the car is in the view. A car at either end of the lap is just out of sight. */
  visible: boolean;
}

export function carDraw(u: number): CarDraw {
  const local = ((u % LAP) + LAP) % LAP;
  return { x: CAR_ENTRY + local, visible: local > 0 };
}

/** The car cut by the right edge of the view: its front is out, its rear is still in. */
export function carCutByEdge(u: number): boolean {
  const d = carDraw(u);
  return d.visible && d.x > RIGHT_EDGE && d.x - CROSSWALK_CAR_LEN < RIGHT_EDGE;
}

/** The frame's pose as the motion model gives it. The drawn pose equals this at the break. */
export function modelPose(f: CrosswalkFrame): { carX: number; carVisible: boolean; walkerFrac: number } {
  const d = carDraw(carU(f));
  return { carX: d.x, carVisible: d.visible, walkerFrac: walkerFrac(walkerU(f)) };
}

export interface PressInterval {
  /** Cycle of the press. */
  on: number;
  /** Cycle of the release, or Infinity when the button is still held at the end. */
  off: number;
}

/** The real presses of a recorded list: where the walk button goes from released to pressed, and where it lets go. */
export function pressIntervals(events: readonly ReducerEvent[]): PressInterval[] {
  const cycles = [...new Set(events.filter((e) => e.signal === REQUEST_PIN.signal).map((e) => e.cycle))].sort((a, b) => a - b);
  const out: PressInterval[] = [];
  let open: PressInterval | null = null;
  for (const c of cycles) {
    const pressed = inputLaneWord(events, REQUEST_PIN, c) === "pressed";
    if (pressed && open === null) {
      open = { on: c, off: Number.POSITIVE_INFINITY };
    } else if (!pressed && open !== null) {
      open.off = c;
      out.push(open);
      open = null;
    }
  }
  if (open !== null) out.push(open);
  return out;
}

interface LampState {
  /** Index of the next press that has not started its flash. */
  next: number;
  /** The flash that is lit now. */
  active: { i: number; start: number } | null;
  /** Display ms when the last flash ended. */
  lastEnd: number;
}

export interface ActorInput {
  edges: readonly OutputEvent[];
  events: readonly ReducerEvent[];
  /** The Cursor the scene shows. */
  cursor: number;
  /** The Cursor where playback ends for this scene (the break, the end of the plan, the freeze), or null. */
  endCursor: number | null;
  /** Display ms until playback reaches `endCursor`; null while paused, stopped or unknown. */
  msToEnd: number | null;
  /** Playback is over: a car cut by the right edge finishes leaving. */
  ended: boolean;
  /** Changes on a jump (new plan, Replay, seek): the actors are placed with no animation. */
  epoch: number;
  /** Reduced motion: no tween, the actors are always at their model pose. */
  reduced: boolean;
}

export interface ActorPose {
  car: CarDraw;
  /** Unwrapped positions, for the caller that checks speeds. */
  carU: number;
  walkerU: number;
  walkerFrac: number;
  /** The walker is moving (or crossing): the legs swing. */
  walking: boolean;
  /** Legs: 0 stands, 1 and 2 are the two steps. */
  stride: number;
  lampLit: boolean;
  /** A flash started in this step: one pulse ring. */
  pulse: boolean;
  /** Every actor is at rest: nothing moves until the Cursor does. */
  settled: boolean;
  /** The frame of the Cursor, for the labels. */
  frame: CrosswalkFrame;
}

export interface CrosswalkActors {
  step(input: ActorInput, nowMs: number): ActorPose;
}

/** Moves `d` toward `target` by at most speed * dt. Inside the last CATCH_UP_MS it stays within reach of the end pose. */
function approach(d: number, target: number, speed: number, dt: number, endTarget: number | null, msToEnd: number | null): number {
  // Playback is at its end: arrive exactly. (A car that is leaving after the end has another target and keeps moving.)
  if (msToEnd !== null && endTarget !== null && msToEnd <= 0 && target === endTarget) return target;
  const reach = speed * dt;
  let next = d + Math.max(-reach, Math.min(reach, target - d));
  if (msToEnd !== null && endTarget !== null && msToEnd <= CATCH_UP_MS) {
    // Held within what the capped speed can still cover before playback ends, never ahead of the model.
    const floor = endTarget - speed * Math.max(0, msToEnd - dt);
    if (next < floor) next = Math.min(floor, target);
  }
  return next;
}

export function createCrosswalkActors(): CrosswalkActors {
  let car: number | null = null;
  let walker = 0;
  let last: number | null = null;
  let epoch: number | null = null;
  let lamp: LampState = { next: 0, active: null, lastEnd: Number.NEGATIVE_INFINITY };
  let presses: PressInterval[] = [];
  let pressesOf: readonly ReducerEvent[] | null = null;

  function stepLamp(cursor: number, now: number, snap: boolean): { lit: boolean; pulse: boolean; settled: boolean } {
    let pulse = false;
    if (snap) {
      const idx = presses.findIndex((p) => p.on <= cursor && cursor < p.off);
      lamp = {
        next: presses.filter((p) => p.on <= cursor).length,
        active: idx >= 0 ? { i: idx, start: now } : null,
        lastEnd: Number.NEGATIVE_INFINITY,
      };
    } else {
      const a = lamp.active;
      if (a !== null && now - a.start >= LAMP_MIN_MS && cursor >= (presses[a.i] as PressInterval).off) {
        lamp = { ...lamp, active: null, lastEnd: now };
      }
      const nextPress = presses[lamp.next];
      if (lamp.active === null && nextPress !== undefined && nextPress.on <= cursor && now >= lamp.lastEnd + LAMP_GAP_MS) {
        lamp = { next: lamp.next + 1, active: { i: lamp.next, start: now }, lastEnd: lamp.lastEnd };
        pulse = true;
      }
    }
    const a = lamp.active;
    const due = presses[lamp.next] !== undefined && (presses[lamp.next] as PressInterval).on <= cursor;
    // A flash that will end by itself, or a press waiting its turn, keeps the clock running.
    const ending = a !== null && cursor >= (presses[a.i] as PressInterval).off;
    return { lit: a !== null, pulse, settled: !due && !ending };
  }

  return {
    step(input, nowMs) {
      const dt = last === null ? 0 : Math.min(MAX_STEP_MS, Math.max(0, nowMs - last));
      last = nowMs;
      if (pressesOf !== input.events) {
        pressesOf = input.events;
        presses = pressIntervals(input.events);
      }
      const frame = crosswalkFrame(input.edges, input.events, input.cursor);
      const endFrame = input.endCursor === null ? null : crosswalkFrame(input.edges, input.events, input.endCursor);
      const snap = input.reduced || car === null || epoch !== input.epoch;
      epoch = input.epoch;

      let carTarget = carU(frame);
      // A car the end of playback caught on the right edge drives the rest of the way out.
      if (input.ended && carCutByEdge(carTarget)) carTarget = (Math.floor(carTarget / LAP) + 1) * LAP;
      const walkerTarget = walkerU(frame);
      let carHeld = false;
      let walkerHeld = false;
      if (snap || car === null) {
        car = carTarget;
        walker = walkerTarget;
      } else {
        const endCar = endFrame === null ? null : carU(endFrame);
        const endWalker = endFrame === null ? null : walkerU(endFrame);
        const atEnd = input.msToEnd !== null && input.msToEnd <= 0;
        const carFinal = atEnd && endCar !== null && carTarget === endCar;
        const walkerFinal = atEnd && endWalker !== null && walkerTarget === endWalker;
        // The walker is moved before the car. Off the walk sign and still on the road, it clears the road at a lifted speed.
        const lifted = frame.walk === "off" && walkerOnRoad(walker);
        let walkerNext = approach(walker, walkerTarget, WALKER_SPEED * (lifted ? WALKER_CLEAR_LIFT : 1), dt, endWalker, input.msToEnd);
        if (!walkerFinal && !walkerOnRoad(walker) && walkerOnRoad(walkerNext) && carInZone(car)) {
          walkerNext = walker;
          walkerHeld = true;
        }
        // Then the car, which sees where the walker is now.
        let carNext = approach(car, carTarget, CAR_SPEED, dt, endCar, input.msToEnd);
        if (!carFinal && walkerOnRoad(walkerNext) && !carInZone(car)) {
          const limit = carGateLimit(car);
          if (carNext > limit) {
            carNext = limit;
            carHeld = true;
          }
        }
        car = carNext;
        walker = walkerNext;
      }      const l = stepLamp(input.cursor, nowMs, snap);
      const walking = walker !== walkerTarget || frame.walkerOnStripes;
      // A car held for the walker, or a walker held for the car, is at rest until the other one moves.
      const settled = (car === carTarget || carHeld) && (walker === walkerTarget || walkerHeld) && l.settled;
      return {
        car: carDraw(car),
        carU: car,
        walkerU: walker,
        walkerFrac: walkerFrac(walker),
        walking,
        stride: walking ? 1 + (Math.floor(walker / 480_000) % 2) : 0,
        lampLit: l.lit,
        pulse: l.pulse,
        settled,
        frame,
      };
    },
  };
}
