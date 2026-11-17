// Run_Length_Field check and the Upload_Defaults. Pure; times are whole CPU cycles.
import type { FieldCheck } from "./fields";

export const CYCLES_PER_MS = 16_000;
export const UPLOAD_DEFAULTS = { runs: 24, runLengthMs: 1000, seed: 20261100 } as const;
export const RUN_LENGTH_MESSAGE = "Run length must be a whole number of milliseconds from 1 to 60000.";

/** ASCII digits only, 1 to 60,000 (compared as a BigInt, as checkRuns does). */
export function checkRunLength(text: string): FieldCheck {
  if (!/^[0-9]+$/.test(text)) return { ok: false, message: RUN_LENGTH_MESSAGE };
  const v = BigInt(text);
  if (v < 1n || v > 60000n) return { ok: false, message: RUN_LENGTH_MESSAGE };
  return { ok: true, value: Number(v) };
}

/** Milliseconds to CPU cycles at 16 MHz: an integer no larger than 960,000,000. */
export function msToCycles(ms: number): number {
  return ms * CYCLES_PER_MS;
}