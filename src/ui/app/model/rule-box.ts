// Rule_Box_Check: Rule_Box text in, rule set or Rule_Errors out. Pure, no DOM.
import { compileRuleSet } from "../../../engine/rules/compile";
import type { RuleForm, RuleSet } from "../../../engine/rules/ir";
import { render } from "../../../engine/rules/render";
import { readRulesFile } from "../../../engine/rules/rules-file";
import type { Fixture } from "../../../engine/types";

export interface RuleError {
  line: number | null;
  position: number | null;
  text: string;
}
export type RuleBoxResult =
  | { ok: true; ruleSet: RuleSet; sentences: string[] }
  | { ok: false; errors: RuleError[] };

const NO_MATCH = /^Line (\d+): No rule template matches at position (\d+) \(counting from 0\); allowed there: (.*)\.$/;

export function ruleErrorFrom(reason: string): RuleError {
  const m = NO_MATCH.exec(reason);
  if (!m) return { line: null, position: null, text: reason };
  const line = Number(m[1]);
  const position = Number(m[2]) + 1;
  return {
    line,
    position,
    text: `Line ${m[1]}, position ${position}: this part does not match any rule pattern. Allowed here: ${m[3]}.`,
  };
}

export function checkRuleBox(text: string, fixture: Fixture): RuleBoxResult {
  if (text === "") return { ok: false, errors: [{ line: null, position: null, text: "Add at least one rule." }] };
  const read = readRulesFile(text);
  if (!read.ok) return { ok: false, errors: read.reasons.map(ruleErrorFrom) };
  const compiled = compileRuleSet(read.ruleSet, fixture);
  if (!compiled.ok) {
    return { ok: false, errors: compiled.reasons.map((text) => ({ line: null, position: null, text })) };
  }
  const sentences = read.ruleSet.map((rule) => {
    const r = render(rule);
    return r.ok ? r.sentence : "";
  });
  return { ok: true, ruleSet: read.ruleSet, sentences };
}

/** The five rule forms filled with leadInput and the leading output, in fixture order. */
export function sentencePatterns(fixture: Fixture): { form: RuleForm; sentence: string }[] {
  const leadInput = fixture.pins.find((p) => p.direction === "input")?.signal;
  const lead = fixture.pins.find((p) => p.direction === "output")?.signal;
  if (leadInput === undefined || lead === undefined) return [];
  return [
    { form: "never", sentence: `${lead} is 1 must never happen.` },
    { form: "notLongerThan", sentence: `${lead} is 1 must never last 500 ms or longer.` },
    { form: "respond", sentence: `Within 50 ms after ${leadInput} is 0 becomes true, ${lead} is 0 must be true.` },
    { form: "count", sentence: `${leadInput} is 0 becomes true may happen at most 5 times in any 1000 ms.` },
    { form: "hold", sentence: `After ${leadInput} is 0 becomes true, ${lead} is 1 must stay true for 100 ms.` },
  ];
}
