// Seeded PCG32 (XSH-RR 64/32), written from the published algorithm.
// State is 64 bits held in a BigInt; outputs are unsigned 32-bit numbers.
// Each generator is created per Run and passed explicitly. This module holds
// no shared generator instance.

export type PrngError =
  | { kind: "invalid-seed"; message: string }
  | { kind: "invalid-range"; message: string };

export interface Prng {
  /** Next unsigned 32-bit integer. Increments drawCount by 1. */
  nextU32(): number;
  /** Inclusive range, rejection sampling. Returns an error and leaves state unchanged when invalid. */
  nextInt(min: number, max: number): number | PrngError;
  /** Number of nextU32 steps taken, rejected outputs included. Read-only; used by tests. */
  readonly drawCount: number;
}

const MULTIPLIER = 6364136223846793005n;
/** Stream id 54, so inc = (54 << 1) | 1 = 109. */
const INC = (54n << 1n) | 1n;
const TWO_POW_32 = 4294967296;
const MAX_SAFE = Number.MAX_SAFE_INTEGER; // 2^53 - 1

export function isPrngError(x: unknown): x is PrngError {
  if (typeof x !== "object" || x === null) return false;
  const kind = (x as { kind?: unknown }).kind;
  return kind === "invalid-seed" || kind === "invalid-range";
}

/**
 * Bounded inclusive draw over a raw-output source.
 *
 * Validates first, so an invalid call never pulls from the source. Width 2^32
 * returns one raw output. Otherwise outputs below
 * threshold = (2^32 - width) mod width are dropped and the rest are reduced
 * modulo width, which gives every value the same number of outputs. A width of
 * 1 still consumes one output.
 *
 * @internal Exported so a test can feed scripted raw outputs.
 */
export function boundedDraw(
  nextRaw: () => number,
  min: number,
  max: number,
): number | PrngError {
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    Math.abs(min) > MAX_SAFE ||
    Math.abs(max) > MAX_SAFE
  ) {
    return {
      kind: "invalid-range",
      message: "min and max must be integers within +/-(2^53 - 1).",
    };
  }
  if (min > max) {
    return { kind: "invalid-range", message: "min must not be greater than max." };
  }
  // max - min may round when huge, but then it is far above 2^32 either way.
  const width = max - min + 1;
  if (width > TWO_POW_32) {
    return { kind: "invalid-range", message: "The range is wider than 2^32 values." };
  }
  if (width === TWO_POW_32) return min + nextRaw();

  const threshold = (TWO_POW_32 - width) % width;
  for (;;) {
    const r = nextRaw();
    if (r >= threshold) return min + (r % width);
  }
}

export function createPrng(seed: number): Prng | PrngError {
  if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_POW_32) {
    return {
      kind: "invalid-seed",
      message: "The seed must be an integer from 0 to 4294967295.",
    };
  }

  let state = 0n;
  let draws = 0;

  // One generator step. Returns the output made from the pre-step state.
  const advance = (): number => {
    const old = state;
    state = BigInt.asUintN(64, old * MULTIPLIER + INC);
    const xorshifted = Number(BigInt.asUintN(32, ((old >> 18n) ^ old) >> 27n));
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  };

  // Seeding: step, add the seed to the state, step again. The stream id is
  // fixed, so INC is the constant above.
  advance();
  state = BigInt.asUintN(64, state + BigInt(seed));
  advance();

  const nextU32 = (): number => {
    draws += 1;
    return advance();
  };

  return {
    nextU32,
    nextInt: (min: number, max: number) => boundedDraw(nextU32, min, max),
    get drawCount() {
      return draws;
    },
  };
}
