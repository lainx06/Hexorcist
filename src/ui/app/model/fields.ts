// Run_Count and Campaign_Seed field checks. Pure.

export const RUNS_MESSAGE = "Runs must be a whole number from 1 to 1000.";
export const SEED_MESSAGE = "Seed must be a whole number from 0 to 4294967295.";

export type FieldCheck = { ok: true; value: number } | { ok: false; message: string };

function check(text: string, min: bigint, max: bigint, message: string): FieldCheck {
  if (!/^[0-9]+$/.test(text)) return { ok: false, message };
  const v = BigInt(text);
  if (v < min || v > max) return { ok: false, message };
  return { ok: true, value: Number(v) };
}

export function checkRuns(text: string): FieldCheck {
  return check(text, 1n, 1000n, RUNS_MESSAGE);
}

export function checkSeed(text: string): FieldCheck {
  return check(text, 0n, 4294967295n, SEED_MESSAGE);
}