// Feature: bench-ui-stage, Property 1: Pacing plan shape
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildPlan, cursorAt, findClusters, friendlyFactor, MIN_DWELL_MS, positionOf, POS_PER_MS, slowFactorAt, speedBadge } from "../../src/ui/app/model/pacing";
import type { PacingPlan } from "../../src/ui/app/model/pacing";
import { reducedListArb } from "./stage-arbitraries";

const SEED = 20261201;

function pieceStarts(plan: PacingPlan): number[] {
  const out: number[] = [];
  let ms = 0;
  for (const p of plan.pieces) {
    out.push(ms * POS_PER_MS);
    ms += p.ms;
  }
  return out;
}

describe("Property 1: Pacing plan shape", () => {
  // Feature: bench-ui-stage, Property 1: Pacing plan shape
  // **Validates: Requirements 5.3, 5.6, 19.1**
  it("cursor is a whole, non-decreasing cycle from S to v, and every piece has Slow_Factor >= 1", () => {
    fc.assert(
      fc.property(reducedListArb, ({ list, v }) => {
        const plan = buildPlan(
          list.map((e) => e.cycle),
          v,
        );
        expect(plan.pieces.length).toBeGreaterThan(0);
        expect(plan.totalMs).toBe(plan.pieces.reduce((a, p) => a + p.ms, 0));
        expect(cursorAt(plan, 0, 0)).toBe(plan.start);
        let prev = plan.start;
        for (let ms = 0; ms <= plan.totalMs; ms++) {
          const c = cursorAt(plan, 0, ms * POS_PER_MS);
          if (!Number.isInteger(c) || c < prev) return false;
          prev = c;
        }
        if (cursorAt(plan, 0, plan.totalMs * POS_PER_MS) !== v) return false;
        for (const p of pieceStarts(plan)) {
          const f = slowFactorAt(plan, 0, p);
          if (f.num < f.den) return false;
        }
        return true;
      }),
      { seed: SEED, numRuns: 100 },
    );
  });
});

// Real reduced replays of the three Examples (cycles read from the Node reduction path).
const ROWS = [
  {
    id: "crosswalk",
    events: [8_449_937, 9_496_850, 10_543_764],
    v: 15_647_515,
    start: 5_249_937,
    d: [2_038, 1_903, 1_903, 2_156],
    badges: [10, 30, 30, 7],
  },
  {
    id: "garage",
    events: [5_448_100, 5_476_645, 5_514_418],
    v: 5_768_101,
    start: 2_248_100,
    d: [1_850, 2_050, 2_050, 2_050],
    badges: [9, 1150, 870, 130],
  },
  {
    id: "heartbeat",
    events: [4_733_733],
    v: 12_811_661,
    start: 1_533_733,
    d: [3_848, 4_152],
    badges: [20, 8],
  },
] as const;

describe.each(ROWS)("worked example: $id", (row) => {
  const plan = buildPlan(row.events, row.v);

  it("has the design start, D values and total", () => {
    expect(plan.start, `${row.id}: S`).toBe(row.start);
    expect(plan.pieces.map((p) => p.ms), `${row.id}: D`).toEqual([...row.d]);
    expect(plan.totalMs, `${row.id}: total`).toBe(8_000);
  });

  it("has the design badges at slider step 0", () => {
    const badges = pieceStarts(plan).map((p) => speedBadge(slowFactorAt(plan, 0, p)));
    expect(badges, `${row.id}: badges`).toEqual(row.badges.map((n) => `Slowed ${n}\u00d7 so you can see it`));
  });

  it("the cursor reaches v at the plan end and stays whole", () => {
    expect(cursorAt(plan, 0, 0), `${row.id}: cursor at 0`).toBe(row.start);
    expect(cursorAt(plan, 0, 8_000 * POS_PER_MS), `${row.id}: cursor at end`).toBe(row.v);
  });

  it("step 10 is real speed on every piece", () => {
    for (const p of pieceStarts(plan)) expect(speedBadge(slowFactorAt(plan, 10, p))).toBe("Real speed");
  });
});

it("crosswalk piece ends fall at 2,038 / 3,941 / 5,844 / 8,000 UI ms", () => {
  const plan = buildPlan(ROWS[0].events, ROWS[0].v);
  let t = 0;
  const ends = plan.pieces.map((p) => (t += p.ms));
  expect(ends, "crosswalk: piece ends").toEqual([2_038, 3_941, 5_844, 8_000]);
});

it("garage's three in-cluster events are held and each gets at least 400 UI ms", () => {
  const plan = buildPlan(ROWS[1].events, ROWS[1].v);
  expect(plan.pieces.map((p) => p.held), "garage: held").toEqual([false, true, true, true]);
  for (const p of plan.pieces.filter((x) => x.held)) expect(p.ms).toBeGreaterThanOrEqual(400);
});

describe("Property 2: Cluster dwell", () => {
  // Feature: bench-ui-stage, Property 2: Cluster dwell
  // **Validates: Requirements 5.4**
  it("each Cluster event gets at least 400 UI ms before the next higher-cycle event or v (slider step 0)", () => {
    fc.assert(
      fc.property(reducedListArb, ({ list, v }) => {
        const cycles = list.map((e) => e.cycle);
        const plan = buildPlan(cycles, v);
        const reach = (c: number): number => {
          const pos = positionOf(plan, 0, c);
          // "Reach" is the earliest position at which Cursor >= c.
          if (cursorAt(plan, 0, pos) < c && c > plan.start) throw new Error(`cursor below ${c} at its reach`);
          if (pos > 0 && cursorAt(plan, 0, pos - 1) >= c) throw new Error(`reach of ${c} is not the earliest`);
          return pos;
        };
        for (const cl of findClusters(cycles)) {
          for (const c of cl.cycles) {
            const next = cycles.filter((x) => x > c).reduce((m, x) => Math.min(m, x), v);
            const dwell = reach(next) - reach(c);
            if (dwell < MIN_DWELL_MS * POS_PER_MS) return false;
          }
        }
        return true;
      }),
      { seed: SEED, numRuns: 200 },
    );
  });
});

// In-bound draws are built, not filtered: events are cut at S + 16,000,000 and v is placed
// between the last kept event + 1 and S + 16,000,000, so v - S <= 16,000,000 always holds.
const SEGMENT_MAX = 16_000_000;
const inBoundArb: fc.Arbitrary<{ cycles: number[]; v: number }> = fc
  .tuple(
    fc.integer({ min: 0, max: 8_000_000 }),
    fc.array(
      fc.oneof(
        { weight: 3, arbitrary: fc.integer({ min: 0, max: 799_999 }), },
        { weight: 2, arbitrary: fc.integer({ min: 800_000, max: 3_000_000 }) },
      ),
      { minLength: 0, maxLength: 20 },
    ),
    fc.integer({ min: 0, max: 1_000 }),
  )
  .map(([e0, gaps, frac]) => {
    const s = Math.max(0, e0 - 3_200_000);
    const limit = s + SEGMENT_MAX;
    const cycles = [e0];
    for (const g of gaps) {
      const next = cycles[cycles.length - 1] + g;
      if (next >= limit) break;
      cycles.push(next);
    }
    const last = cycles[cycles.length - 1];
    const v = last + 1 + Math.floor(((limit - last - 1) * frac) / 1_000);
    return { cycles, v };
  });

describe("Property 3: Plan length", () => {
  // Feature: bench-ui-stage, Property 3: Plan length
  // **Validates: Requirements 5.5**
  it("a Segment of at most 16,000,000 cycles with 400 ms x in-cluster events <= 6,000 ms lasts 7,000 to 9,000 UI ms", () => {
    let clustered = 0;
    let clusterFree = 0;
    fc.assert(
      fc.property(inBoundArb, ({ cycles, v }) => {
        const plan = buildPlan(cycles, v);
        const inCluster = findClusters(cycles).reduce((a, cl) => a + cl.cycles.length, 0);
        if (v - plan.start > SEGMENT_MAX || inCluster * MIN_DWELL_MS > 6_000) {
          throw new Error(`draw is outside the Req 5.5 bound: v-S=${v - plan.start}, in-cluster=${inCluster}`);
        }
        if (inCluster > 0) clustered++;
        else clusterFree++;
        const total = plan.pieces.reduce((a, p) => a + p.ms, 0);
        return total === plan.totalMs && total >= 7_000 && total <= 9_000;
      }),
      { seed: SEED, numRuns: 300 },
    );
    expect(clustered, "draws with a Cluster").toBeGreaterThan(30);
    expect(clusterFree, "draws without a Cluster").toBeGreaterThan(0);
  });
});

// Reference written from the Glossary rule with exact BigInt arithmetic: pick the band from
// f = num/den, then round num/(m*den) to a whole number with halves going up, then scale by m.
function refFriendly(num: number, den: number): number {
  const n = BigInt(num);
  const d = BigInt(den);
  const m = n < 10n * d ? 1n : n < 100n * d ? 5n : 10n;
  const unit = m * d;
  let q = n / unit;
  if (2n * (n - q * unit) >= unit) q += 1n;
  const r = q * m;
  return Number(r < 2n ? 2n : r);
}

// f >= 1 as a ratio: random ratios plus exact band edges and half-way points.
const ratioArb: fc.Arbitrary<{ num: number; den: number }> = fc.oneof(
  fc
    .tuple(fc.integer({ min: 1, max: 1_000 }), fc.integer({ min: 0, max: 5_000_000 }))
    .map(([den, extra]) => ({ den, num: den + Math.floor((den * extra) / 1_000_000) })),
  fc
    .tuple(
      fc.integer({ min: 1, max: 50 }),
      fc.constantFrom(2, 4, 10, 20, 100, 200, 1000),
      fc.integer({ min: 1, max: 40_000 }),
      fc.integer({ min: -1, max: 1 }),
    )
    .map(([k, den, half, off]) => {
      // half / (2 * den) * k-scaled: points like 9.5, 10, 12.5, 97.5, 100, 105 with a +/-1 nudge
      const d = den * 2 * k;
      return { den: d, num: Math.max(d, half * k * den + off) };
    }),
);

describe("Property 5: Friendly_Factor and Speed_Badge", () => {
  // Feature: bench-ui-stage, Property 5: Friendly_Factor and Speed_Badge
  // **Validates: Requirements 5.7, 10.1**
  it("matches the Glossary band rule, is at least 2, and the badge is Real speed exactly when f = 1", () => {
    fc.assert(
      fc.property(ratioArb, (f) => {
        const want = refFriendly(f.num, f.den);
        expect(friendlyFactor(f), `friendlyFactor(${f.num}/${f.den})`).toBe(want);
        expect(want).toBeGreaterThanOrEqual(2);
        const badge = speedBadge(f);
        if (f.num === f.den) expect(badge).toBe("Real speed");
        else expect(badge).toBe(`Slowed ${want}\u00d7 so you can see it`);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it("covers each rounding band, the floor of 2, and Real speed at exactly 1", () => {
    expect(friendlyFactor({ num: 925, den: 100 }), "9.25 -> 9").toBe(9);
    expect(friendlyFactor({ num: 1231, den: 100 }), "12.31 -> 10").toBe(10);
    expect(friendlyFactor({ num: 1293, den: 10 }), "129.3 -> 130").toBe(130);
    expect(friendlyFactor({ num: 12, den: 10 }), "1.2 -> 2").toBe(2);
    expect(friendlyFactor({ num: 95, den: 10 }), "9.5 -> 10 (half-up)").toBe(10);
    expect(friendlyFactor({ num: 125, den: 10 }), "12.5 -> 15 (half-up)").toBe(15);
    expect(friendlyFactor({ num: 105, den: 1 }), "105 -> 110 (half-up)").toBe(110);
    expect(speedBadge({ num: 3, den: 3 }), "f = 1").toBe("Real speed");
    expect(speedBadge({ num: 1231, den: 100 })).toBe("Slowed 10\u00d7 so you can see it");
    expect(speedBadge({ num: 1001, den: 1000 })).toBe("Slowed 2\u00d7 so you can see it");
  });

  // The lower-cased Fix_View badge ("Same moves, same moment · slowed 4× ...") is built by
  // model/fix-view.ts (task 4.7), which does not exist yet, so it is not tested here.
});
