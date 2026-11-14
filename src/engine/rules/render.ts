// Renderer: turns one Rule value into its Canonical_Sentence. Pure. Fields are read by
// name, so key order and earlier calls have no effect, and the argument is never written.

import { formatDuration } from "./duration";
import { validateRule } from "./ir";
import type { Condition, Edge, Rule } from "./ir";
import { cutReason } from "./reason";

export type RenderResult = { ok: true; sentence: string } | { ok: false; reason: string };

function condition(c: Condition): string {
  switch (c.op) {
    case "eq":
      return `${c.signal} is ${String(c.value)}`;
    case "above":
      return `${c.signal} is above ${String(c.value)}`;
    case "below":
      return `${c.signal} is below ${String(c.value)}`;
    case "all":
    case "any":
      return `${c.op} of (${c.of.map(condition).join(", ")})`;
  }
}

function edge(e: Edge): string {
  return `${condition(e.of)} becomes ${e.op === "rise" ? "true" : "false"}`;
}

function sentence(rule: Rule): string {
  switch (rule.form) {
    case "never":
      return `${condition(rule.condition)} must never happen.`;
    case "respond":
      return `Within ${formatDuration(rule.withinMs)} ms after ${edge(rule.trigger)}, ${condition(rule.expect)} must be true.`;
    case "count": {
      const unit = rule.max === 1 ? "time" : "times";
      return `${edge(rule.edge)} may happen at most ${String(rule.max)} ${unit} in any ${formatDuration(rule.windowMs)} ms.`;
    }
    case "hold":
      return `After ${edge(rule.after)}, ${condition(rule.expect)} must stay true for ${formatDuration(rule.durationMs)} ms.`;
    case "notLongerThan":
      return `${condition(rule.condition)} must never last ${formatDuration(rule.ms)} ms or longer.`;
  }
}

/** Canonical_Sentence of a valid Rule, or the first Reason that makes the value invalid. */
export function render(rule: unknown): RenderResult {
  try {
    const reasons = validateRule(rule);
    if (reasons.length > 0) {
      return { ok: false, reason: cutReason("Not a valid rule: " + (reasons[0] as string)) };
    }
    return { ok: true, sentence: sentence(rule as Rule) };
  } catch {
    return { ok: false, reason: "Not a valid rule: the rule: the value could not be read." };
  }
}
