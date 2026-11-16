// Span_Helper: the violation span [v, end) of a never, notLongerThan or respond rule. Pure.
// Same rules as violationSpan in tests/examples/examples-support.ts, written separately here.
import type { Condition, Rule } from "../../../engine/rules/ir";
import type { OutputEvent, PinValue } from "../../../engine/types";

export interface Span {
  end: number;
  lengthCycles: number;
  cut: boolean;
}

function holds(c: Condition, levels: ReadonlyMap<string, PinValue>): boolean {
  switch (c.op) {
    case "eq":
      return levels.get(c.signal) === c.value;
    case "above":
    case "below":
      return false; // outputs never hold a number
    case "all":
      return c.of.every((m) => holds(m, levels));
    case "any":
      return c.of.some((m) => holds(m, levels));
  }
}

/** null for count and hold rules, which have no span end test. */
export function spanFor(rule: Rule, v: number, edges: readonly OutputEvent[], M: number): Span | null {
  let endTest: (levels: ReadonlyMap<string, PinValue>) => boolean;
  switch (rule.form) {
    case "never":
    case "notLongerThan": {
      const cond = rule.condition;
      endTest = (l) => !holds(cond, l);
      break;
    }
    case "respond": {
      const expect = rule.expect;
      endTest = (l) => holds(expect, l);
      break;
    }
    default:
      return null;
  }
  const sorted = edges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
  const levels = new Map<string, PinValue>();
  let i = 0;
  while (i < sorted.length && (sorted[i] as OutputEvent).cycle <= v) {
    const e = sorted[i] as OutputEvent;
    levels.set(e.signal, e.value);
    i++;
  }
  while (i < sorted.length && (sorted[i] as OutputEvent).cycle < M) {
    const c = (sorted[i] as OutputEvent).cycle;
    while (i < sorted.length && (sorted[i] as OutputEvent).cycle === c) {
      const e = sorted[i] as OutputEvent;
      levels.set(e.signal, e.value);
      i++;
    }
    if (endTest(levels)) return { end: c, lengthCycles: c - v, cut: false };
  }
  return { end: M, lengthCycles: M - v, cut: true };
}