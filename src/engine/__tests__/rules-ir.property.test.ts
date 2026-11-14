// Feature: rule-compiler, Property 2: IR round trip
// Validates: Requirements 1.13, 1.12, 1.15
// Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { readIr, writeIr } from "../rules/ir";
import { arbRuleSet } from "./rules-arbitraries";

const SEED = 20261104;
const NUM_RUNS = 200;

describe("Property 2: IR round trip", () => {
  it("readIr(writeIr(set).text) equals set and writeIr is deterministic", () => {
    let never = 0;
    let respond = 0;
    let count = 0;
    let hold = 0;
    let notLongerThan = 0;
    let setOfOne = 0;
    let setOfMany = 0;

    fc.assert(
      fc.property(arbRuleSet, (set) => {
        const before = structuredClone(set);
        const first = writeIr(set);
        const second = writeIr(set);
        expect(first.ok).toBe(true);
        expect(second).toEqual(first);
        expect(set).toEqual(before);
        if (!first.ok) return;
        const back = readIr(first.text);
        expect(back.ok).toBe(true);
        if (!back.ok) return;
        expect(back.ruleSet).toEqual(set);

        // Counters come from the observed read-back result.
        for (const r of back.ruleSet) {
          if (r.form === "never") never++;
          else if (r.form === "respond") respond++;
          else if (r.form === "count") count++;
          else if (r.form === "hold") hold++;
          else if (r.form === "notLongerThan") notLongerThan++;
        }
        if (back.ruleSet.length === 1) setOfOne++;
        else if (back.ruleSet.length > 1) setOfMany++;
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );

    const all =
      `never=${never} respond=${respond} count=${count} hold=${hold} ` +
      `notLongerThan=${notLongerThan} setOfOne=${setOfOne} setOfMany=${setOfMany}`;
    console.log(`Property 2 seed=${SEED} numRuns=${NUM_RUNS} ${all}`);
    const counters: Array<[string, number]> = [
      ["never", never],
      ["respond", respond],
      ["count", count],
      ["hold", hold],
      ["notLongerThan", notLongerThan],
      ["setOfOne", setOfOne],
      ["setOfMany", setOfMany],
    ];
    for (const [name, n] of counters) {
      expect(n, `outcome "${name}" never seen; counters: ${all}`).toBeGreaterThan(0);
    }
  });
});
