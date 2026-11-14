// Property 8 (rule-compiler): Trigger_Evaluator against the Reference_Evaluator's trigger check.
// Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { triggerOccurred } from "../rules/trigger";
import { arbTriggerCase } from "./rules-arbitraries";
import { referenceTriggerOccurred } from "./rules-reference";

const SEED_P8 = 1907554213;
const NUM_RUNS_P8 = 200;

describe("rule-compiler trigger property", () => {
  // Feature: rule-compiler, Property 8: Trigger_Evaluator against the reference
  // Validates: Requirements 12.1, 12.2, 15.7
  it("Property 8: triggerOccurred agrees with the reference trigger check", () => {
    let occurred = 0;
    let notOccurred = 0;
    let windowCut = 0;

    fc.assert(
      fc.property(arbTriggerCase, (c) => {
        const before = structuredClone(c.run);
        const expected = referenceTriggerOccurred(c.rule, c.fixture, c.window, c.run);
        const actual = triggerOccurred(c.rule, c.fixture, c.run);
        expect(actual).toBe(expected);
        expect(triggerOccurred(c.rule, c.fixture, c.run)).toBe(actual);
        expect(c.run).toEqual(before);

        if (expected) {
          occurred++;
        } else {
          notOccurred++;
          // Window 0 fits every Occurrence or span start, so a true answer there means one exists.
          if (referenceTriggerOccurred(c.rule, c.fixture, 0, c.run)) windowCut++;
        }
      }),
      { seed: SEED_P8, numRuns: NUM_RUNS_P8 },
    );

    const counts = `occurred=${occurred}, notOccurred=${notOccurred}, windowCut=${windowCut}`;
    console.log(`Property 8: seed=${SEED_P8} numRuns=${NUM_RUNS_P8} ${counts}`);
    expect(occurred, `outcome occurred never seen (${counts})`).toBeGreaterThan(0);
    expect(notOccurred, `outcome notOccurred never seen (${counts})`).toBeGreaterThan(0);
    expect(windowCut, `outcome windowCut never seen (${counts})`).toBeGreaterThan(0);
  });
});
