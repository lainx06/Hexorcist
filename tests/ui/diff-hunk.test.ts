// Feature: bench-ui-core. Diff hunks with 3 context lines. Evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyHunks, diffHunks, sketchName } from "../../src/ui/app/model/diff";

const lineArb = fc.constantFrom("a", "b", "c", "d", "", "x\r", "a\r");
const textArb = fc.array(lineArb, { maxLength: 40 }).map((l) => l.join("\n"));

function leading(h: { lines: { type: string }[] }): number {
  let n = 0;
  while (n < h.lines.length && h.lines[n]!.type === "context") n++;
  return n;
}
function trailing(h: { lines: { type: string }[] }): number {
  let n = 0;
  while (n < h.lines.length && h.lines[h.lines.length - 1 - n]!.type === "context") n++;
  return n;
}

describe("diff model", () => {
  it("Property 18: applying the hunks to the old text gives the new text", () => {
    // Feature: bench-ui-core, Property 18: Diff round trip
    fc.assert(
      fc.property(textArb, textArb, (a, b) => {
        expect(applyHunks(a, diffHunks(a, b))).toBe(b);
        if (a === b) expect(diffHunks(a, b)).toEqual([]);
      }),
      { seed: 1801, numRuns: 300 },
    );
  });

  it("Property 19: hunk lines match their ranges", () => {
    // Feature: bench-ui-core, Property 19: Hunk lines match their ranges
    fc.assert(
      fc.property(textArb, textArb, (a, b) => {
        const A = a.split("\n");
        const B = b.split("\n");
        for (const h of diffHunks(a, b)) {
          const oldSide = h.lines.filter((l) => l.type !== "added").map((l) => l.text);
          const newSide = h.lines.filter((l) => l.type !== "removed").map((l) => l.text);
          expect(oldSide).toEqual(h.oldCount === 0 ? [] : A.slice(h.oldStart - 1, h.oldStart - 1 + h.oldCount));
          expect(newSide).toEqual(h.newCount === 0 ? [] : B.slice(h.newStart - 1, h.newStart - 1 + h.newCount));
        }
      }),
      { seed: 1901, numRuns: 300 },
    );
  });

  it("Property 20: hunk shape", () => {
    // Feature: bench-ui-core, Property 20: Hunk shape
    fc.assert(
      fc.property(textArb, textArb, (a, b) => {
        const A = a.split("\n");
        const hunks = diffHunks(a, b);
        let prevOldEnd = -1;
        let prevT = 0;
        for (const h of hunks) {
          expect(h.lines.some((l) => l.type !== "context")).toBe(true);
          const L = leading(h);
          const T = trailing(h);
          expect(L).toBeLessThanOrEqual(3);
          expect(T).toBeLessThanOrEqual(3);
          const start = h.oldStart - 1;
          const end = start + h.oldCount;
          if (L < 3) expect(start).toBe(0);
          if (T < 3) expect(end).toBe(A.length);
          // inside a hunk, runs of context are at most 6 lines
          let run = 0;
          for (const l of h.lines) {
            run = l.type === "context" ? run + 1 : 0;
            expect(run).toBeLessThanOrEqual(6);
          }
          // between hunks, more than 6 unchanged lines
          if (prevOldEnd >= 0) expect(start - prevOldEnd + prevT + L).toBeGreaterThan(6);
          expect(start).toBeGreaterThanOrEqual(prevOldEnd < 0 ? 0 : prevOldEnd);
          prevOldEnd = end;
          prevT = T;
        }
      }),
      { seed: 2001, numRuns: 300 },
    );
  });

  it("Crosswalk sketches: two hunks with the expected ranges and lines", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "..", "..", "examples", "crosswalk", p), "utf8");
    const hunks = diffHunks(read("buggy/buggy.ino"), read("fixed/fixed.ino"));
    expect(hunks).toHaveLength(2);
    const [a, b] = hunks as [(typeof hunks)[0], (typeof hunks)[0]];
    expect([a.oldStart, a.oldStart + a.oldCount - 1, a.newStart, a.newStart + a.newCount - 1]).toEqual([1, 4, 1, 4]);
    expect(leading(a)).toBe(0);
    expect(trailing(a)).toBe(3);
    expect(a.lines.filter((l) => l.type === "removed").map((l) => l.text)).toEqual(["// crosswalk, buggy build"]);
    expect(a.lines.filter((l) => l.type === "added").map((l) => l.text)).toEqual(["// crosswalk, fixed build"]);
    expect([b.oldStart, b.oldStart + b.oldCount - 1, b.newStart, b.newStart + b.newCount - 1]).toEqual([78, 85, 78, 83]);
    expect(leading(b)).toBe(3);
    expect(trailing(b)).toBe(3);
    expect(b.lines.filter((l) => l.type === "removed").map((l) => l.text)).toEqual([
      "  } else if (pressed && crossing) {",
      "    walkStart = now;  // a new press restarts the walk countdown",
    ]);
    expect(b.lines.filter((l) => l.type === "added")).toEqual([]);
    expect(sketchName("buggy")).toBe("buggy");
    expect(sketchName("fixed")).toBe("fixed");
    expect(`${sketchName("buggy")} ${sketchName("fixed")}`).not.toContain(".ino");
  });
});