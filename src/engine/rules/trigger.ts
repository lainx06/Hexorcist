// Trigger_Evaluator: tells whether a Rule's Trigger had room to occur in a Run. Pure: it reads a
// Rule, a Fixture and recorded lists, and never changes them. It never throws.

import { validateFixture } from "../fixture";
import type { Fixture, RunResult } from "../types";
import { analyzeRuleSet } from "./bind";
import type { Edge, Rule, RuleSet } from "./ir";
import { validateRule } from "./ir";
import { compileCondition, evalCondition, initialState, makeSignalTable, toChanges } from "./trace";
import type { CompiledCondition, SignalValue } from "./trace";

export type TriggerRun = Pick<RunResult, "outputEvents" | "appliedInputs" | "endCycle">;

function evaluate(rule: Rule, fixture: Fixture, run: TriggerRun): boolean {
  if (rule.form === "never") return false;
  if (validateRule(rule).length > 0) return false;
  if (validateFixture(fixture) !== null) return false;

  const endCycle = run.endCycle;
  if (!Number.isInteger(endCycle) || endCycle < 0) return false;

  const set = analyzeRuleSet([rule], fixture);
  const plan = set.plans[0];
  if (!plan.active) return false;

  const table = makeSignalTable(set.checkerSignals, set.kinds);
  const initial = initialState(table, run.outputEvents, run.appliedInputs);
  const values: SignalValue[] = initial.values;
  const truth = (c: CompiledCondition): boolean => evalCondition(c, values);

  const changes = toChanges(table, run.outputEvents, run.appliedInputs, initial.snapshotUsed, 0);
  changes.sort((a, b) => a.cycle - b.cycle || a.seq - b.seq);

  const edgeOf = (e: Edge): { rising: boolean; cond: CompiledCondition } => ({
    rising: e.op === "rise",
    cond: compileCondition(e.of, table),
  });

  // Which per-change-point test applies for this form.
  let edge: { rising: boolean; cond: CompiledCondition } | null = null;
  let spanCond: CompiledCondition | null = null;
  switch (rule.form) {
    case "respond":
      edge = edgeOf(rule.trigger);
      break;
    case "hold":
      edge = edgeOf(rule.after);
      break;
    case "count":
      edge = edgeOf(rule.edge);
      break;
    case "notLongerThan":
      spanCond = compileCondition(rule.condition, table);
      break;
  }

  const limit = plan.limit;
  let prev = edge === null ? false : truth(edge.cond);
  let spanStart: number | null = null;

  // Change points: cycle 0 always, then every changed cycle up to endCycle.
  let i = 0;
  let zeroDone = false;
  for (;;) {
    const next = i < changes.length && changes[i].cycle <= endCycle ? changes[i].cycle : null;
    let c: number;
    if (!zeroDone && (next === null || next > 0)) {
      c = 0;
      zeroDone = true;
    } else if (next !== null) {
      c = next;
      if (c === 0) zeroDone = true;
    } else {
      break;
    }
    while (i < changes.length && changes[i].cycle === c) {
      const ch = changes[i++];
      values[ch.signal] = ch.value;
    }

    if (edge !== null) {
      const now = truth(edge.cond);
      const occurs = edge.rising ? !prev && now : prev && !now;
      prev = now;
      if (occurs) {
        switch (rule.form) {
          case "count":
            return true;
          case "respond":
            // The earliest Occurrence decides: if it does not fit, no later one does.
            return limit !== null && c + limit <= endCycle;
          case "hold":
            return limit !== null && c + limit - 1 <= endCycle;
        }
      }
    } else if (spanCond !== null) {
      if (truth(spanCond)) {
        if (spanStart === null) {
          spanStart = c;
          if (limit !== null && spanStart + limit <= endCycle) return true;
        }
      } else if (spanStart !== null) {
        return true; // the span ended in the Run, at a cycle after its start
      }
    }
  }
  return false;
}

/** Req 12.1, 12.2. False for an invalid Rule, a rejected Fixture, a non-Active Rule or a never Rule. */
export function triggerOccurred(rule: Rule, fixture: Fixture, run: TriggerRun): boolean {
  try {
    return evaluate(rule, fixture, run);
  } catch {
    return false;
  }
}

/** Req 12.3, 12.7. Canonical_Sentences in Rule_Set order, once each, for Active non-never Rules never triggered. */
export function untriggeredRules(ruleSet: RuleSet, fixture: Fixture, runs: readonly TriggerRun[]): string[] {
  const out: string[] = [];
  let plans;
  try {
    if (validateFixture(fixture) !== null) return out;
    plans = analyzeRuleSet(ruleSet, fixture).plans;
  } catch {
    return out;
  }
  for (const p of plans) {
    if (!p.active || p.rule.form === "never") continue;
    let triggered = false;
    for (const run of runs) {
      if (triggerOccurred(p.rule, fixture, run)) {
        triggered = true;
        break;
      }
    }
    if (!triggered) out.push(p.sentence);
  }
  return out;
}
