// Move strip layout (visual match pass, V13): no two dots closer than 90 px at a 1200 px page width.
// Node only: the track width is worked out from the stylesheet numbers below, not measured in a browser.
// Evidence about the layout function, not proof of how the page looks.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STRIP_MIN_GAP_PX, stripLayout } from "../../src/ui/app/model/strip";

const SEED = 20261203;

// Track width at a 1200 px window, from app.css: .page max-width 1200 with 32 px side padding; .stage
// 1 px border and 20 px padding; aside column 300 px with a 20 px gap; .replay-panel 1 px border and
// 16 px side padding. The break mark (24 px) takes the end of the track (move-strip.ts MARK_PX).
const PAGE = 1200 - 2 * 32;
const MAIN = PAGE - 2 * 1 - 2 * 20 - 300 - 20;
const TRACK = MAIN - 2 * 1 - 2 * 16;
const USABLE = TRACK - 24;

/** Gaps between neighbours in place order, the break mark included. */
function gaps(dots: readonly number[], mark: number): number[] {
  const xs = [...dots].sort((a, b) => a - b);
  xs.push(mark);
  return xs.slice(1).map((x, i) => x - (xs[i] as number));
}

// Reduced lists of the three examples (cycles from the engine acceptance run) and their break cycles.
const EXAMPLES = {
  crosswalk: { dots: [8_449_937, 9_496_850, 10_543_764], v: 15_647_515 },
  garage: { dots: [5_448_100, 5_476_645, 5_514_418], v: 5_768_101 },
  heartbeat: { dots: [4_733_733], v: 12_811_661 },
} as const;

describe("stripLayout", () => {
  it("the track is about 716 px wide at a 1200 px window", () => {
    expect(USABLE).toBe(716);
  });

  for (const [id, ex] of Object.entries(EXAMPLES)) {
    it(`${id}: no two dots (or a dot and the break mark) closer than 90 px`, () => {
      const lay = stripLayout(ex.dots, ex.v, USABLE);
      expect(lay.mark).toBe(USABLE);
      for (const g of gaps(lay.dots, lay.mark)) expect(g).toBeGreaterThanOrEqual(STRIP_MIN_GAP_PX);
    });
  }

  it("crosswalk keeps real time; the garage dots, 4 ms apart, are spaced evenly", () => {
    const cw = stripLayout(EXAMPLES.crosswalk.dots, EXAMPLES.crosswalk.v, USABLE);
    expect(cw.even).toBe(false);
    expect(cw.dots[0]).toBe(0);
    const g = stripLayout(EXAMPLES.garage.dots, EXAMPLES.garage.v, USABLE);
    expect(g.even).toBe(true);
    expect(g.dots).toEqual([0, USABLE / 3, (2 * USABLE) / 3]);
  });

  it("any list of up to 7 moves: no two neighbours closer than 90 px, dots in time order, mark at the end", () => {
    let evenCount = 0;
    let realCount = 0;
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 16_000_000 }), { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 1, max: 8_000_000 }),
        (cycles, after) => {
          const v = Math.max(...cycles) + after;
          const lay = stripLayout(cycles, v, USABLE);
          if (lay.even) evenCount++;
          else realCount++;
          expect(lay.mark).toBe(USABLE);
          for (const g of gaps(lay.dots, lay.mark)) expect(g).toBeGreaterThanOrEqual(STRIP_MIN_GAP_PX);
          // Time order is kept: an earlier move is never placed to the right of a later one.
          cycles.forEach((c, i) =>
            cycles.forEach((d, j) => {
              if (c < d) expect(lay.dots[i] as number).toBeLessThan(lay.dots[j] as number);
            }),
          );
          for (const x of lay.dots) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThan(USABLE);
          }
        },
      ),
      { seed: SEED, numRuns: 300 },
    );
    expect(evenCount).toBeGreaterThan(50);
    expect(realCount).toBeGreaterThan(10);
  });
});
