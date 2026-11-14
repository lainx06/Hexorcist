// Rule_Compiler wiring function. It checks a Rule_Set and a Fixture, then builds the
// Checker and the signal list for a Campaign. Pure: no clock, no random source, no network.
// The third field (the untriggered-rule function) is added by a later task.

import type { Checker } from "../checker";
import { validateFixture } from "../fixture";
import type { Fixture } from "../types";
import { analyzeRuleSet } from "./bind";
import { findRepeatedSentences, validateRuleSet } from "./ir";
import type { RuleSet } from "./ir";
import { cutReason } from "./reason";
import { makeRuleChecker } from "./rule-checker";

export interface CompiledRuleSet {
  checker: Checker;
  checkerSignals: string[];
}

export type CompileResult = { ok: true; compiled: CompiledRuleSet } | { ok: false; reasons: string[] };

const RULE_SET_PREFIX = "Rule set: ";

/** Req 6.1, 6.9, 6.11, 13.7. Never throws. */
export function compileRuleSet(ruleSet: unknown, fixture: Fixture): CompileResult {
  try {
    const structure = validateRuleSet(ruleSet);
    if (structure.length > 0) {
      return { ok: false, reasons: structure.map((r) => cutReason(RULE_SET_PREFIX + r)) };
    }
    const repeated = findRepeatedSentences(ruleSet as RuleSet);
    if (repeated.length > 0) {
      return { ok: false, reasons: repeated.map((r) => cutReason(RULE_SET_PREFIX + r)) };
    }

    let fixtureError: { kind?: unknown } | null;
    try {
      fixtureError = validateFixture(fixture);
    } catch {
      fixtureError = { kind: "invalid-fixture" };
    }
    if (fixtureError !== null) {
      const kind = typeof fixtureError.kind === "string" ? fixtureError.kind : "invalid-fixture";
      return { ok: false, reasons: [cutReason(`Fixture: rejected with kind ${kind}.`)] };
    }

    // Private copies, so later changes by the caller cannot alter the compiled checker.
    const ruleSetCopy = structuredClone(ruleSet as RuleSet);
    const fixtureCopy = structuredClone(fixture);
    const plan = analyzeRuleSet(ruleSetCopy, fixtureCopy);
    const checker = makeRuleChecker(plan);
    return { ok: true, compiled: { checker, checkerSignals: plan.checkerSignals.slice() } };
  } catch {
    return { ok: false, reasons: ["Rule set: the rules and the fixture could not be compiled."] };
  }
}
