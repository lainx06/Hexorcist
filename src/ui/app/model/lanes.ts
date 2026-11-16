// Per-Example lanes, Lane_Words and release ranges. Pure.
import { pressValue } from "../../../engine/reducer/events";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, FixturePin, OutputEvent } from "../../../engine/types";
import { inputLevelAt, levelAt, type TimelineEvent } from "./timeline";
import { msText } from "../../../engine/reducer/story";

export interface ExampleLane {
  signal: string;
  direction: "input" | "output" | "gremlins";
}

/** Fixture pins in order, then the GREMLINS lane. */
export function exampleLanes(fixture: Fixture): ExampleLane[] {
  const lanes: ExampleLane[] = fixture.pins.map((p) => ({
    signal: p.signal,
    direction: p.kind === "analog" || p.direction === "input" ? "input" : "output",
  }));
  lanes.push({ signal: "GREMLINS", direction: "gremlins" });
  return lanes;
}

export function outputLaneWord(edges: readonly OutputEvent[], signal: string, c: number): "on" | "off" | "not driven" {
  const v = levelAt(edges, signal, c);
  return v === 1 ? "on" : v === 0 ? "off" : "not driven";
}

export function inputLaneWord(events: readonly ReducerEvent[], pin: FixturePin, c: number): "pressed" | "released" {
  const v = inputLevelAt(events, pin.signal, c);
  return v !== undefined && v !== "release" && v === pressValue(pin) ? "pressed" : "released";
}

/** From each "release" event to the next event of that signal, or `end`. */
export function releaseRanges(
  events: readonly ReducerEvent[],
  signal: string,
  end: number,
): { from: number; to: number }[] {
  const own = events
    .filter((e) => e.signal === signal)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
  const out: { from: number; to: number }[] = [];
  own.forEach((e, k) => {
    if ("value" in e && e.value === "release") {
      const next = own[k + 1];
      out.push({ from: e.cycle, to: next === undefined ? end : next.cycle });
    }
  });
  return out;
}

export function plainSelectedText(ev: TimelineEvent, label: string, word: string): string {
  return `${msText(ev.cycle)} \u00b7 ${label} = ${word}`;
}
