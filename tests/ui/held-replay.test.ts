// The replay after a HELD verdict on the buggy build (polish pass 1, item 13): the run choice, the segment,
// the plan and the texts. Pure functions, Node only. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Verdict } from "../../src/engine/types";
import { PRE_ROLL } from "../../src/ui/app/model/pacing";
import {
  HELD_POST_ROLL,
  HELD_QUIET_SPAN,
  chooseHeldRun,
  gremlinCycles,
  heldPlan,
  heldSegment,
} from "../../src/ui/app/model/held-replay";
import { fixedCampaignText, heldPlainText, heldTryLabel } from "../../src/ui/app/model/stage-copy";

const SEED = 20261202;
const ev = (cycle: number, gremlinId = "masher"): ReducerEvent => ({ cycle, signal: "REQUEST", value: 0, gremlinId }) as ReducerEvent;

describe("chooseHeldRun", () => {
  it("takes run 0 when the campaign result lists no triggered runs", () => {
    expect(chooseHeldRun()).toEqual({ runIndex: 0, source: "run-0" });
    expect(chooseHeldRun([])).toEqual({ runIndex: 0, source: "run-0" });
  });

  it("takes the lowest run index whose trigger occurred", () => {
    expect(chooseHeldRun([5])).toEqual({ runIndex: 5, source: "trigger" });
    expect(chooseHeldRun([9, 2, 7])).toEqual({ runIndex: 2, source: "trigger" });
    expect(chooseHeldRun([0, 3])).toEqual({ runIndex: 0, source: "trigger" });
  });
});

describe("heldSegment and heldPlan", () => {
  it("starts 200 ms before the earliest gremlin event and ends 500 ms after the latest", () => {
    const list = [ev(0, "rest"), ev(10_000_000), ev(12_000_000), ev(14_000_000)];
    expect(PRE_ROLL).toBe(3_200_000);
    expect(HELD_POST_ROLL).toBe(8_000_000);
    expect(heldSegment(list, 16_000_000)).toEqual({ start: 6_800_000, end: 16_000_000 });
    expect(heldSegment(list, 40_000_000)).toEqual({ start: 6_800_000, end: 22_000_000 });
  });

  it("never starts below 0 and never ends past the end of the run", () => {
    expect(heldSegment([ev(1_000_000)], 16_000_000)).toEqual({ start: 0, end: 9_000_000 });
    expect(heldSegment([ev(15_000_000)], 16_000_000)).toEqual({ start: 11_800_000, end: 16_000_000 });
    expect(heldSegment([ev(15_000_000)], 15_500_000)).toEqual({ start: 11_800_000, end: 15_500_000 });
  });

  it("rest-state events are not gremlin events", () => {
    const list = [ev(0, "rest"), ev(100, "rest"), ev(9_000_000)];
    expect(gremlinCycles(list)).toEqual([9_000_000]);
    expect(heldSegment(list, 16_000_000).start).toBe(5_800_000);
  });

  it("with no gremlin events plays from 0 to 1 s, or to the end of a shorter run", () => {
    expect(HELD_QUIET_SPAN).toBe(16_000_000);
    expect(heldSegment([], 40_000_000)).toEqual({ start: 0, end: 16_000_000 });
    expect(heldSegment([ev(0, "rest")], 10_000_000)).toEqual({ start: 0, end: 10_000_000 });
  });

  it("the paced plan covers exactly the segment, in order, with no gap", () => {
    let plans = 0;
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 15_900_000 }), { maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 15_900_000 }), { maxLength: 3 }),
        fc.integer({ min: 1_000_000, max: 40_000_000 }),
        (gremlin, rest, runEnd) => {
          const list = [...rest.map((c) => ev(c, "rest")), ...gremlin.map((c) => ev(c))];
          const seg = heldSegment(list, runEnd);
          const plan = heldPlan(list, runEnd);
          expect(plan.start).toBe(seg.start);
          if (seg.end <= seg.start) {
            expect(plan.pieces).toEqual([]);
            return;
          }
          plans++;
          expect(plan.end).toBe(seg.end);
          expect(plan.pieces[0]?.from).toBe(seg.start);
          expect(plan.pieces[plan.pieces.length - 1]?.to).toBe(seg.end);
          plan.pieces.forEach((p, i) => {
            expect(p.to).toBeGreaterThan(p.from);
            if (i > 0) expect(p.from).toBe((plan.pieces[i - 1] as { to: number }).to);
          });
          expect(plan.totalMs).toBeGreaterThanOrEqual(8_000);
        },
      ),
      { seed: SEED, numRuns: 200 },
    );
    expect(plans).toBeGreaterThan(100);
  });
});

describe("held texts", () => {
  it("the plain sentence names the tries, with its own wording for one try", () => {
    expect(heldPlainText(24)).toBe("No gremlin broke it in 24 tries.");
    expect(heldPlainText(40)).toBe("No gremlin broke it in 40 tries.");
    expect(heldPlainText(1)).toBe("No gremlin broke it in its 1 try.");
  });

  it("the label above the scene counts from 1", () => {
    expect(heldTryLabel(0, 24)).toBe("Try 1 of 24, one of the tries where the rule held");
    expect(heldTryLabel(6, 40)).toBe("Try 7 of 40, one of the tries where the rule held");
  });

  it('the fixed campaign line says "its 1 try" at M = 1 and "all M tries" otherwise', () => {
    const held: Verdict = { verdict: "HELD", text: "No violation found in 1 emulated run of this gremlin set. Not a proof.", runs: 1 };
    expect(fixedCampaignText(held, 1, null, "plain").prefix).toBe("HELD \u00b7 fixed program, its 1 try:");
    const many: Verdict = { verdict: "HELD", text: "No violation found in 24 emulated runs of this gremlin set. Not a proof.", runs: 24 };
    expect(fixedCampaignText(many, 24, null, "plain").prefix).toBe("HELD \u00b7 fixed program, all 24 tries:");
    expect(fixedCampaignText(many, 24, null, "plain").lines).toEqual([many.text]);
  });
});
