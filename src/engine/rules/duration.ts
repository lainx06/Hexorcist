// Duration and Window_Cycles arithmetic for the Rule_Compiler. Pure and exact:
// decimal-digit BigInt scaling (design D1). Time here is integer CPU cycles only.

import { DEFAULT_CLOCK_HZ } from "../gremlins/pins";
import type { Fixture } from "../types";

const NUMBER_TEXT = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/** Longest integer part and fraction of a Duration_Ms, in digits. */
const MAX_INT_DIGITS = 7;
const MAX_FRAC_DIGITS = 7;

/** Largest integer a Number holds exactly. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Number-to-String digits of a finite x > 0 with the exponent expanded: integer part
 * (no leading zero except a lone "0") and fraction (no trailing zero). null for other x.
 */
export function durationDigits(x: number): { int: string; frac: string } | null {
  if (typeof x !== "number" || !Number.isFinite(x) || !(x > 0)) return null;
  const match = NUMBER_TEXT.exec(String(x));
  if (match === null) return null;
  const intText = match[1] as string;
  const fracText = match[2] ?? "";
  const exp = match[3] === undefined ? 0 : Number(match[3]);
  const mantissa = intText + fracText;
  const e = exp - fracText.length;
  let intPart: string;
  let fracPart: string;
  if (e >= 0) {
    intPart = mantissa + "0".repeat(e);
    fracPart = "";
  } else {
    const k = -e;
    const padded = mantissa.length > k ? mantissa : "0".repeat(k + 1 - mantissa.length) + mantissa;
    intPart = padded.slice(0, padded.length - k);
    fracPart = padded.slice(padded.length - k);
  }
  intPart = intPart.replace(/^0+(?=\d)/, "");
  fracPart = fracPart.replace(/0+$/, "");
  return { int: intPart, frac: fracPart };
}

/** Finite number > 0 with an integer part of at most 7 digits and a fraction of at most 7 digits. */
export function isDurationMs(x: unknown): x is number {
  if (typeof x !== "number") return false;
  const d = durationDigits(x);
  if (d === null) return false;
  return d.int.length <= MAX_INT_DIGITS && d.frac.length <= MAX_FRAC_DIGITS;
}

/** Duration text: the integer part, then "." and the fraction when the fraction is not empty. */
export function formatDuration(ms: number): string {
  const d = durationDigits(ms);
  if (d === null) return String(ms);
  return d.frac === "" ? d.int : `${d.int}.${d.frac}`;
}

/** fixture.clockHz when neither undefined nor null, else the default clock. The raw value is returned. */
export function clockRate(fixture: Fixture): unknown {
  const hz: unknown = fixture.clockHz;
  return hz === undefined || hz === null ? DEFAULT_CLOCK_HZ : hz;
}

export type WindowResult =
  | { ok: true; cycles: bigint }
  | {
      ok: false;
      reason: "window not a whole number of cycles" | "clock rate is not a whole number of hertz";
    };

/** Exact whole cycles in `ms` milliseconds at `clock` hertz, or the one reason it is not. */
export function windowCycles(ms: number, clock: unknown): WindowResult {
  if (typeof clock !== "number" || !Number.isInteger(clock) || !(clock > 0)) {
    return { ok: false, reason: "clock rate is not a whole number of hertz" };
  }
  const d = durationDigits(ms);
  if (d === null) return { ok: false, reason: "window not a whole number of cycles" };
  const m = BigInt(d.int + d.frac);
  const k = d.frac.length;
  const numerator = m * BigInt(clock);
  const denominator = 1000n * 10n ** BigInt(k);
  if (numerator % denominator !== 0n) {
    return { ok: false, reason: "window not a whole number of cycles" };
  }
  return { ok: true, cycles: numerator / denominator };
}

/** Number used by monitors: Number(cycles) up to 2^53 - 1, else Infinity. */
export function cycleLimit(cycles: bigint): number {
  return cycles <= MAX_SAFE ? Number(cycles) : Infinity;
}
