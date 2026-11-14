// Signal binding and compile-time marks. Pure: reads a valid Rule_Set and a Fixture and
// returns a plan. It never throws for a valid Rule_Set and a Fixture that validateFixture accepts.

import type { CannotCheck } from "../checker";
import { isAnalogPin } from "../fixture";
import { DEFAULT_REST_LEVEL, digitalInputs } from "../gremlins/pins";
import type { Fixture, FixturePin } from "../types";
import { clockRate, cycleLimit, windowCycles } from "./duration";
import type { Condition, Rule, RuleSet } from "./ir";
import { render } from "./render";

export type SignalKind =
  | { kind: "output" }
  | { kind: "digital-input"; inactiveLevel: 0 | 1 }
  | { kind: "analog"; restLevel: number };

export interface RulePlan {
  index: number; // position in the Rule_Set
  rule: Rule;
  sentence: string; // Canonical_Sentence
  signals: string[]; // distinct, in sentence order
  marks: CannotCheck[]; // compile-time entries, in the order of Req 6.7
  active: boolean; // marks.length === 0
  windowCycles: bigint | null; // null for never, or when a Req 5 mark is set
  limit: number | null; // cycleLimit(windowCycles)
}

export interface RuleSetPlan {
  plans: RulePlan[];
  checkerSignals: string[]; // Req 6.1
  kinds: Map<string, SignalKind>; // only signals mapped to exactly one pin
  digitalInputSignals: Set<string>; // signal of every Fixture Digital_Input
}

/** Conditions of a Rule in Canonical_Sentence order (the Edge before expect). */
function ruleConditions(rule: Rule): Condition[] {
  switch (rule.form) {
    case "never":
      return [rule.condition];
    case "respond":
      return [rule.trigger.of, rule.expect];
    case "count":
      return [rule.edge.of];
    case "hold":
      return [rule.after.of, rule.expect];
    case "notLongerThan":
      return [rule.condition];
  }
}

/** Duration_Ms of a Rule, or null for a never Rule. */
function ruleMs(rule: Rule): number | null {
  switch (rule.form) {
    case "never":
      return null;
    case "respond":
      return rule.withinMs;
    case "count":
      return rule.windowMs;
    case "hold":
      return rule.durationMs;
    case "notLongerThan":
      return rule.ms;
  }
}

/** Depth-first walk in sentence order: records signals once, and which ops name them. */
function walk(c: Condition, signals: string[], eqNamed: Set<string>, levelNamed: Set<string>): void {
  if (c.op === "all" || c.op === "any") {
    for (const m of c.of) walk(m, signals, eqNamed, levelNamed);
    return;
  }
  if (!signals.includes(c.signal)) signals.push(c.signal);
  if (c.op === "eq") eqNamed.add(c.signal);
  else levelNamed.add(c.signal);
}

function pinsBySignal(fixture: Fixture): Map<string, FixturePin[]> {
  const map = new Map<string, FixturePin[]>();
  for (const pin of fixture.pins) {
    const list = map.get(pin.signal);
    if (list === undefined) map.set(pin.signal, [pin]);
    else list.push(pin);
  }
  return map;
}

function kindOf(pin: FixturePin): SignalKind {
  if (isAnalogPin(pin)) return { kind: "analog", restLevel: pin.restLevel ?? DEFAULT_REST_LEVEL };
  if (pin.direction === "output") return { kind: "output" };
  return { kind: "digital-input", inactiveLevel: pin.activeLevel === "high" ? 0 : 1 };
}

function planRule(rule: Rule, index: number, fixture: Fixture, bySignal: Map<string, FixturePin[]>): RulePlan {
  const rendered = render(rule);
  if (!rendered.ok) throw new Error("bind: the rule is not valid");
  const sentence = rendered.sentence;

  const signals: string[] = [];
  const eqNamed = new Set<string>();
  const levelNamed = new Set<string>();
  for (const c of ruleConditions(rule)) walk(c, signals, eqNamed, levelNamed);

  const marks: CannotCheck[] = [];
  for (const s of signals) {
    const pins = bySignal.get(s) ?? [];
    if (pins.length === 0) {
      marks.push({ rule: sentence, reason: `signal ${s} is not mapped to a pin` });
    } else if (pins.length > 1) {
      marks.push({ rule: sentence, reason: `signal ${s} is mapped to more than one pin` });
    } else {
      const analog = isAnalogPin(pins[0]);
      if (analog && eqNamed.has(s)) {
        marks.push({ rule: sentence, reason: `${s} is an analog input; use above or below` });
      } else if (!analog && levelNamed.has(s)) {
        marks.push({ rule: sentence, reason: `${s} is not an analog input` });
      }
    }
  }

  let cycles: bigint | null = null;
  const ms = ruleMs(rule);
  if (ms !== null) {
    const w = windowCycles(ms, clockRate(fixture));
    if (w.ok) cycles = w.cycles;
    else marks.push({ rule: sentence, reason: w.reason });
  }

  return {
    index,
    rule,
    sentence,
    signals,
    marks,
    active: marks.length === 0,
    windowCycles: cycles,
    limit: cycles === null ? null : cycleLimit(cycles),
  };
}

/** Requires a valid Rule_Set and a Fixture accepted by validateFixture. */
export function analyzeRuleSet(ruleSet: RuleSet, fixture: Fixture): RuleSetPlan {
  const bySignal = pinsBySignal(fixture);
  const plans = ruleSet.map((rule, i) => planRule(rule, i, fixture, bySignal));

  const checkerSignals: string[] = [];
  const seen = new Set<string>();
  for (const p of plans) {
    for (const s of p.signals) {
      if (seen.has(s)) continue;
      seen.add(s);
      checkerSignals.push(s);
    }
  }

  const kinds = new Map<string, SignalKind>();
  for (const [signal, pins] of bySignal) {
    if (pins.length === 1) kinds.set(signal, kindOf(pins[0]));
  }

  const digitalInputSignals = new Set<string>();
  for (const pin of digitalInputs(fixture)) digitalInputSignals.add(pin.signal);

  return { plans, checkerSignals, kinds, digitalInputSignals };
}

/** Single-Rule form used by the Trigger_Evaluator. */
export function analyzeRule(rule: Rule, fixture: Fixture): RulePlan {
  return planRule(rule, 0, fixture, pinsBySignal(fixture));
}
