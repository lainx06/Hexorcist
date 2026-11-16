// Garage and heartbeat scene state at the Cursor. Pure, integer cycles.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { FixturePin, OutputEvent } from "../../../engine/types";
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
