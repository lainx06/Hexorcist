// Feature: bench-ui-core. Story_Labels pass through to failureStory. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Rule, RuleSet } from "../../src/engine/rules/ir";
import { render } from "../../src/engine/rules/render";
import type { Fixture } from "../../src/engine/types";
import { spanFor } from "../../src/ui/app/model/span";
import { buildStoryInput, STORY_LABELS } from "../../src/ui/app/model/story-input";
import { edgesArb, eventsArb } from "./arbitraries";

const FIXTURE: Fixture = { pins: [{ signal: "A", port: "B", bit: 0, direction: "output" }] };
const eqA = { op: "eq" as const, signal: "A", value: 1 as const };
const RULES: Record<Rule["form"], Rule> = {
  never: { form: "never", condition: eqA },
  notLongerThan: { form: "notLongerThan", condition: eqA, ms: 5 },
  respond: { form: "respond", trigger: { op: "rise", of: eqA }, withinMs: 5, expect: eqA },
  count: { form: "count", edge: { op: "rise", of: eqA }, windowMs: 5, max: 1 },
  hold: { form: "hold", after: { op: "rise", of: eqA }, durationMs: 5, expect: eqA },
};

describe("Story_Labels", () => {
  it("passes the three exact REQUEST texts and nothing else", () => {
    const input = buildStoryInput({
      reducedList: [],
      fixture: FIXTURE,
      ruleSet: [RULES.never],
      violation: { rule: "x", cycle: 0 },
      outputEdges: [],
      reachedEnd: 10,
    });
    expect(input.labels).toEqual({
      REQUEST: {
        active: "pressed the walk button",
        inactive: "released the walk button",
        held: "pressed and held the walk button",
      },
    });
    expect(STORY_LABELS).toBe(input.labels);
  });

  it("Property 14: story input carries labels always and a span only for span forms", () => {
    // Feature: bench-ui-core, Property 14: Story input carries labels always and a span only for span forms
    fc.assert(
      fc.property(
        fc.constantFrom<Rule["form"]>("never", "notLongerThan", "respond", "count", "hold"),
        eventsArb,
        edgesArb,
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 100 }),
        (form, list, edges, v, extra) => {
          const rule = RULES[form];
          const r = render(rule);
          if (!r.ok) throw new Error(r.reason);
          const ruleSet: RuleSet = [rule];
          const input = buildStoryInput({
            reducedList: list,
            fixture: FIXTURE,
            ruleSet,
            violation: { rule: r.sentence, cycle: v },
            outputEdges: edges,
            reachedEnd: v + extra,
          });
          expect(input.labels).toEqual(STORY_LABELS);
          expect(input.reducedList).toBe(list);
          if (form === "count" || form === "hold") {
            expect("violationSpan" in input).toBe(false);
          } else {
            const s = spanFor(rule, v, edges, v + extra)!;
            expect(input.violationSpan).toEqual({ lengthCycles: s.lengthCycles, cut: s.cut });
          }
        },
      ),
      { seed: 1401, numRuns: 200 },
    );
  });
});