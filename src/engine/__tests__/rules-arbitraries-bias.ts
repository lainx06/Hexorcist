// Biased generator for Property 4b (helper, not a test file).
// Reuses the Fixture, trace, Floating_Diagnostics and Step split of arbCheckerCase and replaces the
// Rule_Set with `respond` and `count` Rules that lean toward violations.

import * as fc from "fast-check";
import { render } from "../rules/render";
import type { Condition, Edge, Rule } from "../rules/ir";
import type { FixturePin } from "../types";
import { arbCheckerCase, type CheckerCase } from "./rules-arbitraries";

type Leaf = Extract<Condition, { op: "eq" | "above" | "below" }>;

const EXTREMES = [0, 1, 1022, 1023];

const arbLeafOn = (pin: FixturePin): fc.Arbitrary<Leaf> => {
  if (pin.kind === "analog") {
    return fc.oneof(
      fc.constantFrom(...EXTREMES).map((v): Leaf => ({ op: "above", signal: pin.signal, value: Math.min(v, 1022) })),
      fc.constantFrom(...EXTREMES).map((v): Leaf => ({ op: "below", signal: pin.signal, value: Math.max(v, 1) })),
    );
  }
  return fc.constantFrom(0 as const, 1 as const).map((value): Leaf => ({ op: "eq", signal: pin.signal, value }));
};

const arbLeaf = (pins: readonly FixturePin[]): fc.Arbitrary<Leaf> =>
  fc.constantFrom(...pins).chain((p) => arbLeafOn(p));

/** A condition that is rarely true: an `all` of two or three leaves, or one leaf on one pin. */
const arbRareCondition = (pins: readonly FixturePin[]): fc.Arbitrary<Condition> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.array(arbLeaf(pins), { minLength: 2, maxLength: 3 }).map((of): Condition => ({ op: "all", of })) },
    { weight: 1, arbitrary: arbLeaf(pins) },
  );

/** Edge over a simple leaf, so Occurrences are frequent. */
const arbSimpleEdge = (pins: readonly FixturePin[]): fc.Arbitrary<Edge> =>
  fc.record({ op: fc.constantFrom("rise" as const, "fall" as const), of: arbLeaf(pins) });

/** W / 16,000 is exact in decimal with at most 7 fraction digits. */
const msOf = (w: number): number => w / 16_000;

const arbWindow: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 20 }) },
  { weight: 3, arbitrary: fc.integer({ min: 1, max: 200 }) },
);

const arbBiasedRule = (pins: readonly FixturePin[]): fc.Arbitrary<{ rule: Rule; window: number }> =>
  fc.oneof(
    fc
      .tuple(arbSimpleEdge(pins), arbWindow, arbRareCondition(pins))
      .map(([trigger, w, expectCond]) => ({
        rule: { form: "respond" as const, trigger, withinMs: msOf(w), expect: expectCond },
        window: w,
      })),
    fc
      .tuple(arbSimpleEdge(pins), arbWindow, fc.constantFrom(0, 0, 0, 0, 1, 1, 1, 2))
      .map(([edge, w, max]) => ({
        rule: { form: "count" as const, edge, windowMs: msOf(w), max },
        window: w,
      })),
  );

export const arbBiasedCheckerCase: fc.Arbitrary<CheckerCase> = arbCheckerCase.chain((base) =>
  fc.array(arbBiasedRule(base.fixture.pins), { minLength: 3, maxLength: 6 }).map((drawn): CheckerCase => {
    const seen = new Set<string>();
    const ruleSet: Rule[] = [];
    const windows: number[] = [];
    for (const d of drawn) {
      const out = render(d.rule);
      if (!out.ok || seen.has(out.sentence)) continue;
      seen.add(out.sentence);
      ruleSet.push(d.rule);
      windows.push(d.window);
    }
    return { ...base, ruleSet, windows };
  }),
);
