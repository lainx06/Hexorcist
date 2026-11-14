// Property 4 (rule-compiler): differential check of the compiled Rule_Checker against the
// Reference_Evaluator. Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { CannotCheck, CheckerOutcome, Violation } from "../checker";
import { compileRuleSet } from "../rules/compile";
import { render } from "../rules/render";
import { arbCheckerCase } from "./rules-arbitraries";
import { referenceEvaluate } from "./rules-reference";

const SEED_P4 = 3823641010;
const NUM_RUNS_P4 = 100;

const FLOATING_SUFFIX = "was read while floating";

describe("rule-compiler properties", () => {
  // Feature: rule-compiler, Property 4: Differential check against the Reference_Evaluator
  // Validates: Requirements 7.1-7.11, 8.1-8.9, 9.1-9.9, 10.3-10.10, 11.2-11.6, 5.6, 6.8, 15.6
  it("Property 4: compiled checker agrees with the Reference_Evaluator", () => {
    let neverViolating = 0;
    let neverClean = 0;
    let respondViolating = 0;
    let respondClean = 0;
    let countViolating = 0;
    let countClean = 0;
    let holdViolating = 0;
    let holdClean = 0;
    let notLongerThanViolating = 0;
    let notLongerThanClean = 0;
    let floatingEntry = 0;

    fc.assert(
      fc.property(arbCheckerCase, (c) => {
        const ref = referenceEvaluate(c);

        // Counters come from the Reference_Evaluator's per-Rule result after the cut-off.
        c.ruleSet.forEach((rule, i) => {
          const r = ref.rules[i];
          if (!r.active) return;
          const violating = r.violation !== null;
          switch (rule.form) {
            case "never":
              if (violating) neverViolating++;
              else neverClean++;
              break;
            case "respond":
              if (violating) respondViolating++;
              else respondClean++;
              break;
            case "count":
              if (violating) countViolating++;
              else countClean++;
              break;
            case "hold":
              if (violating) holdViolating++;
              else holdClean++;
              break;
            case "notLongerThan":
              if (violating) notLongerThanViolating++;
              else notLongerThanClean++;
              break;
          }
        });
        if (ref.violation === null && ref.floating.length > 0) floatingEntry++;

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

          // callChecker checks (fact F7).
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
      { seed: SEED_P4, numRuns: NUM_RUNS_P4 },
    );

    const summary =
      `neverViolating=${neverViolating} neverClean=${neverClean} ` +
      `respondViolating=${respondViolating} respondClean=${respondClean} ` +
      `countViolating=${countViolating} countClean=${countClean} ` +
      `holdViolating=${holdViolating} holdClean=${holdClean} ` +
      `notLongerThanViolating=${notLongerThanViolating} notLongerThanClean=${notLongerThanClean} ` +
      `floatingEntry=${floatingEntry}`;
    console.log(`Property 4 seed=${SEED_P4} numRuns=${NUM_RUNS_P4} ${summary}`);

    const counters: [string, number][] = [
      ["neverViolating", neverViolating],
      ["neverClean", neverClean],
      ["respondViolating", respondViolating],
      ["respondClean", respondClean],
      ["countViolating", countViolating],
      ["countClean", countClean],
      ["holdViolating", holdViolating],
      ["holdClean", holdClean],
      ["notLongerThanViolating", notLongerThanViolating],
      ["notLongerThanClean", notLongerThanClean],
      ["floatingEntry", floatingEntry],
    ];
    for (const [name, value] of counters) {
      expect(value, `outcome "${name}" never seen; counters: ${summary}`).toBeGreaterThan(0);
    }
  });
});
