// Rule lookup by Canonical_Sentence and the signals a rule names. Pure.
import { render } from "../../../engine/rules/render";
import type { Condition, Rule } from "../../../engine/rules/ir";

export function ruleBySentence(ruleSet: readonly Rule[], sentence: string): { index: number; rule: Rule } | null {
  for (let i = 0; i < ruleSet.length; i++) {
    const rule = ruleSet[i] as Rule;
    const r = render(rule);
    if (r.ok && r.sentence === sentence) return { index: i, rule };
  }
  return null;
}

function walk(c: Condition, out: string[]): void {
  if (c.op === "all" || c.op === "any") {
    for (const m of c.of) walk(m, out);
    return;
  }
  if (!out.includes(c.signal)) out.push(c.signal);
}

/** Each signal once, in the order the Canonical_Sentence names it. */
export function ruleSignals(rule: Rule): string[] {
  const out: string[] = [];
  switch (rule.form) {
    case "never":
    case "notLongerThan":
      walk(rule.condition, out);
      break;
    case "respond":
      walk(rule.trigger.of, out);
      walk(rule.expect, out);
      break;
    case "count":
      walk(rule.edge.of, out);
      break;
    case "hold":
      walk(rule.after.of, out);
      walk(rule.expect, out);
      break;
  }
  return out;
}