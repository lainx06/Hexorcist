// Pin_Levels_View state: a pure function of the Pin_Table rows, the shown replay and the Cursor.
// Integer CPU cycles only; it reads no clock, no random source and no emulator.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import { displayName } from "./pin-table";
import type { PinRow } from "./pin-table";
import { PIN_LEVELS_TEXT } from "./upload-copy";

export interface PinLevelRow {
  signal: string;
  /** Display_Name. */
  name: string;
  role: "input" | "output";
  /** Inputs only; ignored for outputs. */
  pressed: "low" | "high";
}

export interface PinLevelsReplay {
  events: readonly ReducerEvent[];
  outputEdges: readonly OutputEvent[];
  /** Break cycle; null when the replay holds no violation (HELD). */
  v: number | null;
  /** Outputs named by the Target_Rule. */
  ringSignals: readonly string[];
}

export interface PinLevelsState {
  waiting: boolean;
  inputs: { signal: string; name: string; state: "pressed" | "not pressed"; gremlinId: string | null }[];
  outputs: { signal: string; name: string; lit: boolean; notDriven: boolean; ring: boolean }[];
  /** Plain text for assistive technology and the phone line. */
  summary: string;
}

export function pinLevelRows(rows: readonly PinRow[]): PinLevelRow[] {
  return rows.map((r) => ({ signal: r.signal, name: displayName(r), role: r.direction, pressed: r.pressed }));
}

/** The latest entry of `signal` at or before `cursor`: highest cycle, and on equal cycles the later entry. */
function latest<T extends { signal: string; cycle: number }>(list: readonly T[], signal: string, cursor: number): T | null {
  let best: T | null = null;
  for (const e of list) {
    if (e.signal !== signal || e.cycle > cursor) continue;
    if (best === null || e.cycle >= best.cycle) best = e;
  }
  return best;
}

export function pinLevelsAt(rows: readonly PinLevelRow[], replay: PinLevelsReplay | null, cursor: number): PinLevelsState {
  const inputs: PinLevelsState["inputs"] = [];
  const outputs: PinLevelsState["outputs"] = [];
  for (const r of rows) {
    if (r.role === "input") {
      const e = replay === null ? null : latest(replay.events, r.signal, cursor);
      const value = e !== null && "value" in e ? e.value : null;
      const level = r.pressed === "low" ? 0 : 1;
      const pressed = value === level;
      const gremlinId = e !== null && value !== "release" && e.gremlinId !== "rest" ? e.gremlinId : null;
      inputs.push({ signal: r.signal, name: r.name, state: pressed ? "pressed" : "not pressed", gremlinId });
    } else {
      const edge = replay === null ? null : latest(replay.outputEdges, r.signal, cursor);
      const lit = edge !== null && edge.value === 1;
      const notDriven = edge === null || edge.value === "input";
      const ring = replay !== null && replay.v !== null && cursor >= replay.v && replay.ringSignals.includes(r.signal);
      outputs.push({ signal: r.signal, name: r.name, lit, notDriven, ring });
    }
  }
  const T = PIN_LEVELS_TEXT;
  const parts = [
    ...inputs.map((i) => `${i.name}: ${i.state === "pressed" ? T.pressed : T.notPressed}`),
    ...outputs.map((o) => `${o.name}: ${o.notDriven ? T.notDriven : o.lit ? T.on : T.off}`),
  ];
  return { waiting: replay === null, inputs, outputs, summary: parts.join(" \u00b7 ") };
}