// Run_Seed derivation from a Campaign_Seed and a Run_Index.
// Pure integer arithmetic: no state, no clock, no shared generator.

import type { EngineError } from "./errors";

export type RunSeedError = Extract<
  EngineError,
  { kind: "invalid-seed" | "invalid-run-index" }
>;

const MAX_U32 = 4294967295;

function isU32(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= MAX_U32;
}

export function isRunSeedError(x: unknown): x is RunSeedError {
  if (typeof x !== "object" || x === null) return false;
  const kind = (x as { kind?: unknown }).kind;
  return kind === "invalid-seed" || kind === "invalid-run-index";
}

/**
 * 32-bit finalizer of MurmurHash3, written from the published description.
 * Input is taken modulo 2^32. Output is an unsigned 32-bit integer.
 */
export function fmix32(h: number): number {
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Run_Seed = fmix32((fmix32(campaignSeed) + runIndex) mod 2^32).
 *
 * Why distinct Run_Index values give distinct Run_Seed values under one
 * Campaign_Seed: fmix32(campaignSeed) is a fixed constant c. Adding a run
 * index to c modulo 2^32 is a translation, which is a bijection on 32-bit
 * values, and Run_Index stays inside 0..2^32-1, so no two indexes collide.
 * fmix32 is also a bijection: each xor-with-right-shift step is invertible,
 * and each multiplier is odd, so it is invertible modulo 2^32. A composition
 * of bijections is a bijection, so distinct indexes map to distinct seeds.
 *
 * Returns a typed error, and no Run_Seed, for an invalid input. The seed is
 * checked first.
 */
export function deriveRunSeed(
  campaignSeed: number,
  runIndex: number,
): number | RunSeedError {
  if (!isU32(campaignSeed)) {
    return {
      kind: "invalid-seed",
      message: "The Campaign_Seed must be an integer from 0 to 4294967295.",
    };
  }
  if (!isU32(runIndex)) {
    return {
      kind: "invalid-run-index",
      message: "The Run_Index must be an integer from 0 to 4294967295.",
    };
  }
  return fmix32((fmix32(campaignSeed) + runIndex) >>> 0);
}
