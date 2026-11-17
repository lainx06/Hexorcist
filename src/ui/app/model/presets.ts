// Rule_Preset and Limit_Control: the preset rule text for a limit, the limit check and the
// custom headline. Pure: no DOM. Sentences come from the engine render function. The caller
// parses the returned text with the Rule_Box_Check (checkRuleBox in rule-box.ts).
import type { Rule, RuleSet } from "../../../engine/rules/ir";
import { render } from "../../../engine/rules/render";
import type { ExampleBundle, ExampleId } from "../data/examples";
import { EXAMPLE_COPY } from "./example-copy";

export const LIMIT_MIN = 1;
export const LIMIT_MAX = 60_000;
export const LIMIT_REASON = "The value must be a whole number from 1 to 60,000.";

const LIMIT_DEFAULT: Readonly<Record<ExampleId, number | null>> = {
  crosswalk: null,
  garage: 20,
  heartbeat: 600,
};

/** The Limit_Control default of an Example, or null when the Example has no Limit_Control. */
export function presetFor(id: ExampleId): { limitDefault: number | null } {
  return { limitDefault: LIMIT_DEFAULT[id] };
}

/** Whole milliseconds from 1 to 60,000, typed as digits only. Empty text is not valid. */
export function checkLimit(text: string): { ok: true; n: number } | { ok: false; reason: string } {
  if (!/^[0-9]{1,9}$/.test(text)) return { ok: false, reason: LIMIT_REASON };
  const n = Number(text);
  if (!Number.isInteger(n) || n < LIMIT_MIN || n > LIMIT_MAX) return { ok: false, reason: LIMIT_REASON };
  return { ok: true, n };
}

function withLimit(rule: Rule, n: number): Rule {
  switch (rule.form) {
    case "respond":
      return { ...rule, withinMs: n };
    case "notLongerThan":
      return { ...rule, ms: n };
    default:
      return rule;
  }
}

/**
 * The rules text of the Example with every time limit set to n: the Example's rule set with
 * the limit changed, each rule rendered to its Canonical_Sentence, one per line, ending in a
 * line break. With the default limit it equals the Example's committed rules text.
 * Crosswalk has no limit, so its text does not depend on n.
 */
export function presetRuleText(ex: ExampleBundle, n: number): string {
  const limited = presetFor(ex.id).limitDefault !== null;
  const rules: RuleSet = limited ? ex.ruleSet.map((r) => withLimit(r, n)) : ex.ruleSet;
  const lines = rules.map((r) => {
    const out = render(r);
    return out.ok ? out.sentence : out.reason;
  });
  return lines.join("\n") + "\n";
}

/**
 * The time limit in whole ms of the rule set of an Example with a Limit_Control (garage: the response
 * deadline, I'm-alive light: the freeze limit), read from the rules themselves. Null for an Example
 * without a Limit_Control. When the rule set holds no rule of the expected form, the Example default.
 */
export function limitMsOf(id: ExampleId, ruleSet: RuleSet): number | null {
  const def = LIMIT_DEFAULT[id];
  if (def === null) return null;
  for (const r of ruleSet) {
    if (id === "garage" && r.form === "respond") return r.withinMs;
    if (id === "heartbeat" && r.form === "notLongerThan") return r.ms;
  }
  return def;
}

/** The Rule_Headline: the Example's own at its default limit, "Custom rule: ..." otherwise. */
export function presetHeadline(id: ExampleId, n: number): string {
  const def = LIMIT_DEFAULT[id];
  if (def === null || n === def) return EXAMPLE_COPY[id].headline;
  if (id === "garage") return `Custom rule: When the beam is blocked, the door must stop closing within ${n} ms.`;
  return `Custom rule: The I'm-alive light must never freeze on or off for ${n} ms.`;
}
