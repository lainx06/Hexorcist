// Property tests for Run_Seed derivation (task 5.2; task 5.3 adds to this file).
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveRunSeed, isRunSeedError } from "../run-seed";

// Inline stand-in for the shared arbitraries that arrive in task 9.1:
// full uint32 range, biased toward 0, 1 and 4294967295.
const arbU32 = fc.oneof(
  fc.constantFrom(0, 1, 4294967295),
  fc.integer({ min: 0, max: 4294967295 }),
);

const arbPair = fc.tuple(arbU32, arbU32);

function derive(seed: number, index: number): number {
  const r = deriveRunSeed(seed, index);
  if (isRunSeedError(r)) throw new Error(`deriveRunSeed failed: ${r.message}`);
  return r;
}

describe("Run_Seed purity", () => {
  // Feature: gremlin-engine, Property 12: Run_Seed is a pure function
  // Validates: Requirements 1.9, 11.12
  it("Property 12: repeated calls return the same value", () => {
    fc.assert(
      fc.property(arbPair, ([seed, index]) => {
        const first = derive(seed, index);
        const second = derive(seed, index);
        expect(second).toBe(first);
        expect(Number.isInteger(first)).toBe(true);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThanOrEqual(4294967295);
      }),
      { numRuns: 200, seed: 1204041201 },
    );
  });

  // Feature: gremlin-engine, Property 12: Run_Seed is a pure function
  // Validates: Requirements 1.9, 11.12
  it("Property 12: the value does not depend on call order or earlier calls", () => {
    fc.assert(
      fc.property(
        arbPair,
        fc.array(arbPair, { minLength: 0, maxLength: 20 }),
        ([seed, index], others) => {
          // Fresh first call is the reference.
          const reference = derive(seed, index);

          // Interleave other pairs before and after the target call.
          for (const [s, i] of others) derive(s, i);
          const afterOthers = derive(seed, index);
          expect(afterOthers).toBe(reference);

          // Call a whole list, forward then reversed; each result must match
          // a value computed on its own.
          const all: Array<[number, number]> = [[seed, index], ...others];
          const forward = all.map(([s, i]) => derive(s, i));
          const reversed = [...all].reverse().map(([s, i]) => derive(s, i)).reverse();
          expect(reversed).toEqual(forward);
          expect(forward[0]).toBe(reference);
          for (let k = 0; k < all.length; k++) {
            const [s, i] = all[k];
            expect(forward[k]).toBe(derive(s, i));
          }
        },
      ),
      { numRuns: 200, seed: 1204041202 },
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.3: Run_Seed distinctness and validation.
//
// The assurance that distinct Run_Index values give distinct Run_Seed values
// comes from the bijection construction in run-seed.ts (fmix32 is invertible,
// and adding the index modulo 2^32 is a translation). The tests below are
// evidence, not proof.
// ---------------------------------------------------------------------------

import { fmix32 } from "../run-seed";

const MAX_U32 = 4294967295;
const DISTINCT_COUNT = 10000;

function countDistinct(campaignSeed: number): number {
  const seen = new Set<number>();
  for (let i = 0; i < DISTINCT_COUNT; i++) seen.add(derive(campaignSeed, i));
  return seen.size;
}

// Test-side inverse of fmix32, written independently of run-seed.ts.
function unfmix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7ed1b41d);
  h ^= (h >>> 13) ^ (h >>> 26);
  h = Math.imul(h, 0xa5cb9243);
  h ^= h >>> 16;
  return h >>> 0;
}

// Invalid numeric inputs for either parameter.
const arbInvalidNumber = fc.oneof(
  fc.constantFrom(NaN, Infinity, -Infinity, -1, MAX_U32 + 1, 0.5, -0.5, 1.5),
  fc.integer({ min: -2147483648, max: -1 }),
  fc.integer({ min: MAX_U32 + 1, max: MAX_U32 + 1000000 }),
  fc
    .double({ noNaN: true, noDefaultInfinity: true, min: 0, max: MAX_U32 })
    .filter((x) => !Number.isInteger(x)),
);

describe("Run_Seed distinctness and validation", () => {
  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.11
  it("Property 15: Run_Index 0..9,999 gives 10,000 distinct Run_Seed values for fixed Campaign_Seeds", () => {
    for (const campaignSeed of [0, 1, 42, 4294967295]) {
      expect(countDistinct(campaignSeed)).toBe(DISTINCT_COUNT);
    }
  });

  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.11
  it("Property 15: Run_Index 0..9,999 gives 10,000 distinct Run_Seed values for generated Campaign_Seeds", () => {
    fc.assert(
      fc.property(arbU32, (campaignSeed) => {
        expect(countDistinct(campaignSeed)).toBe(DISTINCT_COUNT);
      }),
      { numRuns: 200, seed: 1204041203 },
    );
  });

  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.10
  it("Property 15: an invalid Campaign_Seed gives invalid-seed and no Run_Seed", () => {
    fc.assert(
      fc.property(arbInvalidNumber, arbU32, (badSeed, index) => {
        const r = deriveRunSeed(badSeed, index);
        expect(typeof r).toBe("object");
        expect(isRunSeedError(r)).toBe(true);
        expect((r as { kind: string }).kind).toBe("invalid-seed");
      }),
      { numRuns: 200, seed: 1204041204 },
    );
  });

  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.10
  it("Property 15: an invalid Run_Index gives invalid-run-index and no Run_Seed", () => {
    fc.assert(
      fc.property(arbU32, arbInvalidNumber, (seed, badIndex) => {
        const r = deriveRunSeed(seed, badIndex);
        expect(typeof r).toBe("object");
        expect(isRunSeedError(r)).toBe(true);
        expect((r as { kind: string }).kind).toBe("invalid-run-index");
      }),
      { numRuns: 200, seed: 1204041205 },
    );
  });

  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.10
  it("Property 15: listed invalid values give the matching typed error", () => {
    for (const bad of [NaN, Infinity, -Infinity, -1, 1.5, MAX_U32 + 1]) {
      expect(deriveRunSeed(bad, 0)).toMatchObject({ kind: "invalid-seed" });
      expect(deriveRunSeed(0, bad)).toMatchObject({ kind: "invalid-run-index" });
    }
  });

  // Feature: gremlin-engine, Property 15: Run_Seed distinctness and validation
  // Validates: Requirements 1.11
  it("Property 15: the test-side inverse undoes fmix32 over 100,000 sampled values", () => {
    const samples = fc.sample(arbU32, { numRuns: 100000, seed: 1204041206 });
    expect(samples).toHaveLength(100000);
    for (const x of samples) {
      expect(unfmix32(fmix32(x))).toBe(x);
      expect(fmix32(unfmix32(x))).toBe(x);
    }
  });
});
