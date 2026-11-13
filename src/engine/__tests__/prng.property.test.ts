// Property tests for the PCG32 generator (task 4.4; task 4.5 adds to this file).
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createPrng, isPrngError, type Prng } from "../prng";

// Inline stand-in for the shared arbSeed helper that arrives in task 9.1:
// full range, biased toward 0, 1 and 4294967295.
const arbSeed = fc.oneof(
  fc.constantFrom(0, 1, 4294967295),
  fc.integer({ min: 0, max: 4294967295 }),
);

const TWO_POW_32 = 4294967296;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// Width from 1 to 2^32, biased toward the edges.
const arbWidth = fc.oneof(
  fc.constantFrom(1, 2, TWO_POW_32 - 1, TWO_POW_32),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: TWO_POW_32 }),
);

// Lower bound: non-negative, negative and mixed-sign starts, kept so that
// min + width - 1 stays a safe integer.
const arbMin = fc.oneof(
  fc.constantFrom(0, -1, 1),
  fc.integer({ min: -100, max: 100 }),
  fc.integer({ min: -TWO_POW_32, max: TWO_POW_32 }),
  fc.integer({ min: -MAX_SAFE, max: MAX_SAFE - TWO_POW_32 }),
);

const arbBounds = fc
  .tuple(arbMin, arbWidth)
  .map(([min, width]) => ({ min, max: min + width - 1, width }));

function make(seed: number): Prng {
  const p = createPrng(seed);
  if (isPrngError(p)) throw new Error(`createPrng failed: ${p.message}`);
  return p;
}

describe("PRNG properties", () => {
  // Feature: gremlin-engine, Property 13: Range draw bounds
  // Validates: Requirements 1.3, 11.13
  it("Property 13: nextInt returns an integer within [min, max]", () => {
    fc.assert(
      fc.property(arbSeed, arbBounds, fc.integer({ min: 1, max: 5 }), (seed, b, draws) => {
        const p = make(seed);
        for (let i = 0; i < draws; i++) {
          const r = p.nextInt(b.min, b.max);
          expect(typeof r).toBe("number");
          const n = r as number;
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(b.min);
          expect(n).toBeLessThanOrEqual(b.max);
        }
      }),
      { numRuns: 200, seed: 1304041301 },
    );
  });

  // Feature: gremlin-engine, Property 13: Range draw bounds
  // Validates: Requirements 1.3, 11.13
  it("Property 13: the full range [0, 4294967295] stays within bounds", () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const p = make(seed);
        const r = p.nextInt(0, 4294967295);
        expect(typeof r).toBe("number");
        const n = r as number;
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(4294967295);
      }),
      { numRuns: 200, seed: 1304041302 },
    );
  });
});

// Invalid ranges: min above max, non-integer bounds, width above 2^32.
const arbInvalidRange: fc.Arbitrary<{ min: number; max: number }> = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }).chain((min) =>
    fc.integer({ min: 1, max: 1000 }).map((d) => ({ min, max: min - d })),
  ),
  fc
    .tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 1000 }))
    .map(([min, d]) => ({ min: min + 0.5, max: min + d + 1 })),
  fc
    .tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 0, max: 1000 }))
    .map(([min, d]) => ({ min, max: min + d + 0.25 })),
  fc.constantFrom(
    { min: Number.NaN, max: 5 },
    { min: 0, max: Number.NaN },
    { min: 0, max: Number.POSITIVE_INFINITY },
    { min: Number.NEGATIVE_INFINITY, max: 0 },
  ),
  fc
    .tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: 1, max: 1000 }))
    .map(([min, extra]) => ({ min, max: min + TWO_POW_32 + extra - 1 })),
);

// Invalid seeds: non-integer, negative, or at or above 2^32.
const arbInvalidSeed = fc.oneof(
  fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true, min: 0, max: 4294967295 }),
  fc.integer({ min: -MAX_SAFE, max: -1 }),
  fc.integer({ min: TWO_POW_32, max: MAX_SAFE }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.5, 4294967296),
);

describe("PRNG determinism and error handling", () => {
  // Feature: gremlin-engine, Property 14: PRNG determinism and error handling
  // Validates: Requirements 1.2, 1.6
  it("Property 14: same seed agrees over 1,000 nextU32 and 1,000 nextInt calls", () => {
    fc.assert(
      fc.property(arbSeed, arbBounds, (seed, b) => {
        const a = make(seed);
        const c = make(seed);
        for (let i = 0; i < 1000; i++) {
          expect(a.nextU32()).toBe(c.nextU32());
        }
        for (let i = 0; i < 1000; i++) {
          expect(a.nextInt(b.min, b.max)).toBe(c.nextInt(b.min, b.max));
        }
        expect(a.drawCount).toBe(c.drawCount);
      }),
      { numRuns: 200, seed: 1404041401 },
    );
  });

  // Feature: gremlin-engine, Property 14: PRNG determinism and error handling
  // Validates: Requirements 1.5
  it("Property 14: invalid range leaves next outputs and drawCount equal to an untouched twin", () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 0, max: 20 }), arbInvalidRange, (seed, warm, r) => {
        const a = make(seed);
        const twin = make(seed);
        for (let i = 0; i < warm; i++) {
          a.nextU32();
          twin.nextU32();
        }
        const res = a.nextInt(r.min, r.max);
        expect(isPrngError(res)).toBe(true);
        expect((res as { kind: string }).kind).toBe("invalid-range");
        expect(a.drawCount).toBe(twin.drawCount);
        for (let i = 0; i < 50; i++) {
          expect(a.nextU32()).toBe(twin.nextU32());
        }
        expect(a.drawCount).toBe(twin.drawCount);
      }),
      { numRuns: 200, seed: 1404041402 },
    );
  });

  // Feature: gremlin-engine, Property 14: PRNG determinism and error handling
  // Validates: Requirements 1.8
  it("Property 14: non-integer or out-of-range seeds give invalid-seed", () => {
    fc.assert(
      fc.property(arbInvalidSeed, (seed) => {
        const p = createPrng(seed);
        expect(isPrngError(p)).toBe(true);
        expect((p as { kind: string }).kind).toBe("invalid-seed");
      }),
      { numRuns: 200, seed: 1404041403 },
    );
  });
});
