// Reason helpers for the Rule_Compiler. Pure. No Reason built here copies a string value
// or a field name from its input.

/** Longest Reason, in UTF-16 code units. Same limit as the verdict reasons. */
export const REASON_LIMIT = 200;

/** Cut at 200 UTF-16 units, never leaving half of a surrogate pair. */
export function cutReason(text: string): string {
  if (text.length <= REASON_LIMIT) return text;
  let end = REASON_LIMIT;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/**
 * Names the JSON type of a value in fixed words. A number is written with
 * Number-to-String; no string value is ever copied.
 */
export function jsonTypeName(v: unknown): string {
  if (typeof v === "string") return "a string";
  if (typeof v === "boolean") return "a boolean";
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  if (typeof v === "number") return `the number ${String(v)}`;
  return "an object";
}

/** The only field names a path may contain (Req 1.1 to 1.5). */
export type FieldName =
  | "version"
  | "rules"
  | "form"
  | "condition"
  | "trigger"
  | "withinMs"
  | "expect"
  | "edge"
  | "windowMs"
  | "max"
  | "after"
  | "durationMs"
  | "ms"
  | "op"
  | "of"
  | "signal"
  | "value";

/** One step of a path: a listed field name or a zero-based array index. */
export type PathStep = FieldName | number;

/** Path text for the root of a Rule value. */
export const RULE_ROOT_TEXT = "the rule";

/**
 * Builds path text such as `rules[2].trigger.of.value`. A field name follows its
 * parent after a dot (no dot at the start), an index is written `[i]`.
 * An empty path gives `rootText`, which is `the rule` unless the caller says otherwise.
 */
export function pathText(steps: readonly PathStep[], rootText: string = RULE_ROOT_TEXT): string {
  if (steps.length === 0) return rootText;
  let out = "";
  for (const step of steps) {
    if (typeof step === "number") out += `[${step}]`;
    else out += out === "" ? step : `.${step}`;
  }
  return out;
}
