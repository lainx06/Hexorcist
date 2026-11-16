// Feature: bench-ui-core. Coverage counts and the Coverage_Line. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { msText } from "../../src/engine/reducer/story";
import type { Rule, RuleSet } from "../../src/engine/rules/ir";
import { triggerOccurred } from "../../src/engine/rules/trigger";
import type { AppliedInput, Fixture } from "../../src/engine/types";
import { coverageCounts, coverageLine, NEVER_RULE_PART } from "../../src/ui/app/model/coverage";
import { eventsArb } from "./arbitraries";

const FIXTURE: Fixture = {
  pins: [
    { signal: "A", port: "D", bit: 2, direction: "input" },
    { signal: "B", port: "B", bit: 0, direction: "output" },
  ],
};
const NEVER: Rule = { form: "never", condition: { op: "eq", signal: "B", value: 1 } };
const RESPOND: Rule = {
  form: "respond",
  trigger: { op: "rise", of: { op: "eq", signal: "A", value: 0 } },
  withinMs: 10,
  expect: { op: "eq", signal: "B", value: 1 },
};

const runArb = fc.record({
  eventList: eventsArb,
  endCycle: fc.integer({ min: 1, max: 300 }),
  outputEvents: fc.array(
    fc.record({ signal: fc.constant("B"), value: fc.constantFrom(0 as const, 1 as const), cycle: fc.integer({ min: 0, max: 200 }) }),
    { maxLength: 5 },
  ),
  appliedInputs: fc.constant([] as AppliedInput[]),
});

describe("coverage", () => {
  it("Property 11: coverage counts", () => {
    // Feature: bench-ui-core, Property 11: Coverage counts
    fc.assert(
      fc.property(fc.array(runArb, { maxLength: 6 }), fc.integer({ min: 1, max: 250 }), (runs, runCycles) => {
        const ruleSet: RuleSet = [NEVER, RESPOND];
        const c = coverageCounts(ruleSet, FIXTURE, runs, runCycles);
        expect(c.triggerCounts[0]).toBeNull();
        expect(c.triggerCounts[1]).toBe(runs.filter((r) => triggerOccurred(RESPOND, FIXTURE, r)).length);
        const want = runs.reduce((n, r) => n + r.eventList.filter((e) => e.gremlinId !== "rest" && e.cycle < runCycles).length, 0);
        expect(c.gremlinEvents).toBe(want);
      }),
      { seed: 1101, numRuns: 100 },
    );
  });

  it("Property 12: Coverage_Line text", () => {
    // Feature: bench-ui-core, Property 12: Coverage_Line text
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.integer({ min: 0, max: 99 }), { nil: null }), { minLength: 1, maxLength: 4 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 160_000_000 }),
        fc.integer({ min: 0, max: 4294967295 }),
        (triggerCounts, gremlinEvents, n, runCycles, seed) => {
          const line = coverageLine({ triggerCounts, gremlinEvents }, n, runCycles, seed);
          const parts = line.split(" \u00b7 ");
          expect(parts).toHaveLength(triggerCounts.length + 3);
          triggerCounts.forEach((r, i) => {
            expect(parts[i]).toBe(r === null ? NEVER_RULE_PART : `Rule trigger happened in ${r} of ${n} runs`);
          });
          expect(parts[triggerCounts.length]).toBe(`Gremlin events: ${gremlinEvents}`);
          expect(parts[triggerCounts.length + 1]).toBe(`Run length: ${msText(runCycles)}`);
          expect(parts[triggerCounts.length + 2]).toBe(`Seed: ${seed}`);
          expect(line).not.toMatch(/%|percent/i);
        },
      ),
      { seed: 1201, numRuns: 200 },
    );
  });

  it("Crosswalk line shape", () => {
    expect(coverageLine({ triggerCounts: [null], gremlinEvents: 5 }, 24, 16_000_000, 20261101)).toBe(
      "Rule trigger: none, a never rule has no trigger \u00b7 Gremlin events: 5 \u00b7 Run length: 1000.0 ms \u00b7 Seed: 20261101",
    );
  });
});