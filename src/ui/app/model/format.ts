// Text formatting for counters and values. Pure.
import { cycleText, msText } from "../../../engine/reducer/story";
import type { InputValue, PinValue } from "../../../engine/types";

export const ms = msText;
export const cycles = cycleText;

/** "Completed k / N runs", no digit grouping, "runs" for every N. */
export function progressText(k: number, n: number): string {
  return `Completed ${String(k)} / ${String(n)} runs`;
}

/** "Elapsed m:ss" from UI_Clock milliseconds. */
export function elapsedText(elapsedMs: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1000));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `Elapsed ${String(m)}:${ss < 10 ? "0" : ""}${String(ss)}`;
}

export function eventsText(n: number): string {
  return n === 1 ? "1 event" : `${String(n)} events`;
}

/** "X events -> Y events". */
export function shrinkText(x: number, y: number): string {
  return `${eventsText(x)} -> ${eventsText(y)}`;
}

/** "Elapsed 1.2 s" from UI_Clock milliseconds, tenths of a second. */
export function elapsedSecondsText(elapsedMs: number): string {
  const t = Math.max(0, Math.floor(elapsedMs / 100));
  return `Elapsed ${String(Math.floor(t / 10))}.${String(t % 10)} s`;
}

/** "X events → Y events". */
export function shrinkArrowText(x: number, y: number): string {
  return shrinkText(x, y).replace("->", "→");
}

export function candidatesText(k: number): string {
  return `Candidates tried: ${String(k)}`;
}

export function levelText(v: PinValue | undefined): "0" | "1" | "not driven" {
  if (v === 0) return "0";
  if (v === 1) return "1";
  return "not driven";
}

export function inputValueText(v: InputValue | number): string {
  if (v === "release") return "release";
  return String(v);
}

export function edgeValueText(v: PinValue): "0" | "1" | "input" {
  if (v === 0) return "0";
  if (v === 1) return "1";
  return "input";
}