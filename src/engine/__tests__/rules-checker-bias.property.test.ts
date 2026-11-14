// Property 4b (rule-compiler): biased differential check of the compiled Rule_Checker against the
// Reference_Evaluator, with Rules leaning toward violations. Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { CannotCheck, CheckerOutcome, Violation } from "../checker";
import { compileRuleSet } from "../rules/compile";
import { render } from "../rules/render";
import { arbBiasedCheckerCase } from "./rules-arbitraries-bias";
import { referenceEvaluate } from "./rules-reference";

const SEED_P4B = 1729406853;
const NUM_RUNS_P4B = 100;

const FLOATING_SUFFIX = "was read while floating";

describe("rule-compiler properties (biased)", () => {
  // Feature: rule-compiler, Property 4b: Biased differential check against the Reference_Evaluator
  // Validates: Requirements 9.2, 9.3, 9.5, 9.8, 10.3, 10.4, 10.5, 10.6, 10.9, 16.6
  it("Property 4b: compiled checker agrees with the Reference_Evaluator on violation-biased Rules", () => {
    let respondViolating = 0;
    let respondClean = 0;
    let countViolating = 0;
    let countClean = 0;

    fc.assert(
      fc.property(arbBiasedCheckerCase, (c) => {
        const ref = referenceEvaluate(c);

        // Counters come from the Reference_Evaluator's per-Rule result after the cut-off.
        c.ruleSet.forEach((rule, i) => {
          const r = ref.rules[i];
          if (!r.active) return;
          const violating = r.violation !== null;
          if (rule.form === "respond") {
            if (violating) respondViolating++;
            else respondClean++;
          } else if (rule.form === "count") {
            if (violating) countViolating++;
            else countClean++;
          }
        });

        const a = compileRuleSet(c.ruleSet, c.fixture);
        const b = compileRuleSet(c.ruleSet, c.fixture);
        if (!a.ok || !b.ok) {
          throw new Error(`compileRuleSet rejected a generated case: ${JSON.stringify(a)}`);
        }

        const sentences = new Set(
          c.ruleSet.map((r) => {
            const out = render(r);
            return out.ok ? out.sentence : "";
          }),
        );

        let violation: Violation | null = null;
        const seen = new Set<string>();
        const cannotCheck: CannotCheck[] = [];

        for (const obs of c.observations) {
          const outA = a.compiled.checker(obs);
          const outB = b.compiled.checker(obs);
          expect(outB).toEqual(outA);

          const o: CheckerOutcome = outA;
          expect(typeof o).toBe("object");
          expect(o).not.toBeNull();
          if (o.violation !== null) {
            expect(typeof o.violation.rule).toBe("string");
            expect(o.violation.rule.length).toBeGreaterThan(0);
            expect(Number.isInteger(o.violation.cycle)).toBe(true);
            expect(o.violation.cycle).toBeGreaterThanOrEqual(0);
            expect(o.violation.cycle).toBeLessThanOrEqual(obs.cycle);
            expect(sentences.has(o.violation.rule)).toBe(true);
          }
          if (o.cannotCheck !== undefined) {
            expect(Array.isArray(o.cannotCheck)).toBe(true);
            for (const cc of o.cannotCheck) {
              expect(typeof cc.rule).toBe("string");
              expect(typeof cc.reason).toBe("string");
              expect(cc.reason.length).toBeGreaterThanOrEqual(1);
              expect(cc.reason.length).toBeLessThanOrEqual(200);
              expect(sentences.has(cc.rule)).toBe(true);
              const key = JSON.stringify([cc.rule, cc.reason]);
              if (!seen.has(key)) {
                seen.add(key);
                cannotCheck.push({ rule: cc.rule, reason: cc.reason });
              }
            }
          }
          if (o.violation) {
            violation = o.violation;
            break; // runOne stops at the call that returns a Violation
          }
        }

        if (ref.violation === null) {
          expect(violation).toBeNull();
        } else {
          expect(violation).toEqual({ rule: ref.violation.rule, cycle: ref.violation.cycle });
        }

        if (violation === null) {
          const floating = cannotCheck.filter((x) => x.reason.endsWith(FLOATING_SUFFIX));
          expect(floating).toEqual(ref.floating);
        }
      }),
      { seed: SEED_P4B, numRuns: NUM_RUNS_P4B },
    );

    const summary =
      `respondViolating=${respondViolating} respondClean=${respondClean} ` +
      `countViolating=${countViolating} countClean=${countClean}`;
    console.log(`Property 4b seed=${SEED_P4B} numRuns=${NUM_RUNS_P4B} ${summary}`);

    const counters: [string, number][] = [
      ["respondViolating", respondViolating],
      ["respondClean", respondClean],
      ["countViolating", countViolating],
      ["countClean", countClean],
    ];
    for (const [name, value] of counters) {
      expect(value, `outcome "${name}" never seen; counters: ${summary}`).toBeGreaterThan(0);
    }
    expect(
      respondViolating,
      `respondViolating fell short of 25; counters: ${summary}`,
    ).toBeGreaterThanOrEqual(25);
    expect(
      countViolating,
      `countViolating fell short of 25; counters: ${summary}`,
    ).toBeGreaterThanOrEqual(25);
  });
});
