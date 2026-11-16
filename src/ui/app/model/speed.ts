// Pinned Node values and comparisons for the speed page. Pure.
import type { Verdict } from "../../../engine/types";

export const PINNED_CROSSWALK_FINGERPRINT = "47078989121ebc1d";

export const PINNED_GARAGE_VERDICT = {
  verdict: "HELD",
  text: "No violation found in 40 emulated runs of this gremlin set. Not a proof.",
  runs: 40,
} as const;

export function compareFingerprint(actual: string | null): "matches" | "differs" {
  return actual === PINNED_CROSSWALK_FINGERPRINT ? "matches" : "differs";
}

export function compareGarage(v: Verdict | null): "matches" | "differs" {
  if (v === null || v.verdict !== "HELD") return "differs";
  const keys = Object.keys(v).sort().join(",");
  return keys === "runs,text,verdict" && v.text === PINNED_GARAGE_VERDICT.text && v.runs === PINNED_GARAGE_VERDICT.runs
    ? "matches"
    : "differs";
}

/** Rounded down; null when seconds is 0. */
export function cyclesPerSecond(totalCycles: number, seconds: number): number | null {
  if (!(seconds > 0)) return null;
  return Math.floor(totalCycles / seconds);
}

export function secondsText(seconds: number): string {
  return seconds.toFixed(3);
}