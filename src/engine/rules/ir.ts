// Versioned JSON IR for rules: types, limits and structure checks. Pure. Every Reason is
// built from fixed wording, listed field names, array indexes, JSON type names and numbers;
// no string value and no unlisted field name from the input is ever copied.

import { BANNED_WORDS } from "../copy-rules";
import { isDurationMs } from "./duration";
import { render } from "./render";
import { cutReason, jsonTypeName, pathText, RULE_ROOT_TEXT } from "./reason";
import type { PathStep } from "./reason";

export type Condition =
  | { op: "eq"; signal: string; value: 0 | 1 }
  | { op: "above"; signal: string; value: number } // integer 0..1022
  | { op: "below"; signal: string; value: number } // integer 1..1023
  | { op: "all"; of: Condition[] } // 2..8 members
  | { op: "any"; of: Condition[] }; // 2..8 members

export type Edge = { op: "rise"; of: Condition } | { op: "fall"; of: Condition };

export type Rule =
  | { form: "never"; condition: Condition }
  | { form: "respond"; trigger: Edge; withinMs: number; expect: Condition }
  | { form: "count"; edge: Edge; windowMs: number; max: number } // max integer 0..65535
  | { form: "hold"; after: Edge; durationMs: number; expect: Condition }
  | { form: "notLongerThan"; condition: Condition; ms: number };

export type RuleForm = Rule["form"];
export type RuleSet = Rule[]; // 1..32 Rules
export interface IrDocument {
  version: 1;
  rules: RuleSet;
}

export const IR_VERSION = 1;
export const MAX_RULES = 32;
export const MAX_NESTING_DEPTH = 4;
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 8;
export const MAX_COUNT = 65_535;

export type ReadResult = { ok: true; ruleSet: RuleSet } | { ok: false; reasons: string[] };
export type WriteResult = { ok: true; text: string } | { ok: false; reason: string };

const SIGNAL_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const BANNED_LOWER: readonly string[] = BANNED_WORDS.map((w) => w.toLowerCase());

/** Signal_Name test: pattern, not all or any, not a blocked word in any letter case. */
export function isSignalName(x: unknown): x is string {
  if (typeof x !== "string" || !SIGNAL_PATTERN.test(x)) return false;
  const lower = x.toLowerCase();
  if (lower === "all" || lower === "any") return false;
  if (x === "all" || x === "any") return false;
  return !BANNED_LOWER.includes(lower);
}

// ---------------------------------------------------------------------------
// Structure checks

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** JSON type name for any JavaScript value; values with no JSON type get fixed wording. */
function foundName(v: unknown): string {
  const t = typeof v;
  if (t === "string" || t === "boolean" || t === "number" || t === "object") return jsonTypeName(v);
  return "a value that is not JSON";
}

const CONDITION_OPS = "eq, above, below, all, any";
const SIGNAL_TEXT =
  "must be a signal name: a letter, then up to 31 letters, digits or _, and not all, any or a blocked word.";
const DURATION_TEXT =
  "must be a duration above 0 ms with at most 7 digits before and 7 after the decimal point.";

class Walker {
  readonly out: string[] = [];
  constructor(private readonly rootText: string) {}

  private at(steps: readonly PathStep[]): string {
    return pathText(steps, this.rootText);
  }

  add(steps: readonly PathStep[], text: string): void {
    this.out.push(cutReason(`${this.at(steps)}: ${text}`));
  }

  /** Checks that x is a plain object. Reports its type otherwise. */
  isObject(x: unknown, steps: readonly PathStep[]): x is Record<string, unknown> {
    if (typeof x === "object" && x !== null && !Array.isArray(x)) return true;
    this.add(steps, `must be an object; found ${foundName(x)}.`);
    return false;
  }

  /** One Reason when the object holds a key outside `listed`. The key is never written. */
  unlisted(o: Record<string, unknown>, steps: readonly PathStep[], listed: readonly string[]): void {
    if (Object.keys(o).some((k) => !listed.includes(k))) {
      this.add(steps, "has a field that is not allowed.");
    }
  }

  /** Reads a required field; reports a missing one. */
  field(
    o: Record<string, unknown>,
    name: PathStep & string,
    steps: readonly PathStep[],
  ): { present: boolean; value: unknown } {
    if (!hasOwn(o, name)) {
      this.add([...steps, name], "is missing.");
      return { present: false, value: undefined };
    }
    return { present: true, value: o[name] };
  }

  integer(
    o: Record<string, unknown>,
    name: PathStep & string,
    steps: readonly PathStep[],
    min: number,
    max: number,
  ): void {
    const f = this.field(o, name, steps);
    if (!f.present) return;
    const v = f.value;
    const here = [...steps, name];
    if (typeof v !== "number") {
      this.add(here, `must be a number; found ${foundName(v)}.`);
    } else if (!(Number.isInteger(v) && !Object.is(v, -0) && v >= min && v <= max)) {
      this.add(here, `must be an integer from ${min} to ${max}.`);
    }
  }

  duration(o: Record<string, unknown>, name: PathStep & string, steps: readonly PathStep[]): void {
    const f = this.field(o, name, steps);
    if (!f.present) return;
    const here = [...steps, name];
    if (typeof f.value !== "number") {
      this.add(here, `must be a number; found ${foundName(f.value)}.`);
    } else if (!isDurationMs(f.value)) {
      this.add(here, DURATION_TEXT);
    }
  }

  signal(o: Record<string, unknown>, steps: readonly PathStep[]): void {
    const f = this.field(o, "signal", steps);
    if (!f.present) return;
    const here = [...steps, "signal" as const];
    if (typeof f.value !== "string") {
      this.add(here, `must be a string; found ${foundName(f.value)}.`);
    } else if (!isSignalName(f.value)) {
      this.add(here, SIGNAL_TEXT);
    }
  }

  /** `level` is 1 for the outermost Condition of a Rule or Edge. */
  condition(x: unknown, steps: readonly PathStep[], level: number): void {
    if (!this.isObject(x, steps)) return;
    if (level > MAX_NESTING_DEPTH) {
      this.add(steps, `conditions are nested deeper than ${MAX_NESTING_DEPTH}.`);
      return;
    }
    if (!hasOwn(x, "op")) {
      this.add([...steps, "op"], "is missing.");
      return;
    }
    const op = x.op;
    switch (op) {
      case "eq":
      case "above":
      case "below": {
        this.unlisted(x, steps, ["op", "signal", "value"]);
        this.signal(x, steps);
        if (op === "eq") {
          const f = this.field(x, "value", steps);
          if (f.present) {
            const here = [...steps, "value" as const];
            if (typeof f.value !== "number") {
              this.add(here, `must be a number; found ${foundName(f.value)}.`);
            } else if (!((f.value === 0 && !Object.is(f.value, -0)) || f.value === 1)) {
              this.add(here, "must be 0 or 1.");
            }
          }
        } else if (op === "above") {
          this.integer(x, "value", steps, 0, 1022);
        } else {
          this.integer(x, "value", steps, 1, 1023);
        }
        return;
      }
      case "all":
      case "any": {
        this.unlisted(x, steps, ["op", "of"]);
        const f = this.field(x, "of", steps);
        if (!f.present) return;
        const here = [...steps, "of" as const];
        if (!Array.isArray(f.value)) {
          this.add(here, `must be an array; found ${foundName(f.value)}.`);
          return;
        }
        const members: unknown[] = f.value;
        if (members.length < MIN_MEMBERS || members.length > MAX_MEMBERS) {
          this.add(here, `must hold ${MIN_MEMBERS} to ${MAX_MEMBERS} conditions.`);
        }
        for (let i = 0; i < members.length; i++) {
          this.condition(members[i], [...here, i], level + 1);
        }
        return;
      }
      default:
        this.add([...steps, "op"], `must be one of ${CONDITION_OPS}.`);
    }
  }

  edge(x: unknown, steps: readonly PathStep[]): void {
    if (!this.isObject(x, steps)) return;
    if (!hasOwn(x, "op")) {
      this.add([...steps, "op"], "is missing.");
      return;
    }
    if (x.op !== "rise" && x.op !== "fall") {
      this.add([...steps, "op"], "must be rise or fall.");
      return;
    }
    this.unlisted(x, steps, ["op", "of"]);
    const f = this.field(x, "of", steps);
    if (f.present) this.condition(f.value, [...steps, "of"], 1);
  }

  conditionField(o: Record<string, unknown>, name: PathStep & string, steps: readonly PathStep[]): void {
    const f = this.field(o, name, steps);
    if (f.present) this.condition(f.value, [...steps, name], 1);
  }

  edgeField(o: Record<string, unknown>, name: PathStep & string, steps: readonly PathStep[]): void {
    const f = this.field(o, name, steps);
    if (f.present) this.edge(f.value, [...steps, name]);
  }

  rule(x: unknown, steps: readonly PathStep[]): void {
    if (!this.isObject(x, steps)) return;
    if (!hasOwn(x, "form")) {
      this.add([...steps, "form"], "is missing.");
      return;
    }
    switch (x.form) {
      case "never":
        this.unlisted(x, steps, ["form", "condition"]);
        this.conditionField(x, "condition", steps);
        return;
      case "respond":
        this.unlisted(x, steps, ["form", "trigger", "withinMs", "expect"]);
        this.edgeField(x, "trigger", steps);
        this.duration(x, "withinMs", steps);
        this.conditionField(x, "expect", steps);
        return;
      case "count":
        this.unlisted(x, steps, ["form", "edge", "windowMs", "max"]);
        this.edgeField(x, "edge", steps);
        this.duration(x, "windowMs", steps);
        this.integer(x, "max", steps, 0, MAX_COUNT);
        return;
      case "hold":
        this.unlisted(x, steps, ["form", "after", "durationMs", "expect"]);
        this.edgeField(x, "after", steps);
        this.duration(x, "durationMs", steps);
        this.conditionField(x, "expect", steps);
        return;
      case "notLongerThan":
        this.unlisted(x, steps, ["form", "condition", "ms"]);
        this.conditionField(x, "condition", steps);
        this.duration(x, "ms", steps);
        return;
      default:
        this.add([...steps, "form"], "must be one of never, respond, count, hold, notLongerThan.");
    }
  }
}

const UNREADABLE = "the value could not be read.";

/** Reasons for one Rule value, paths from the Rule root. An empty array means valid. */
export function validateRule(x: unknown): string[] {
  const w = new Walker(RULE_ROOT_TEXT);
  try {
    w.rule(x, []);
  } catch {
    return [cutReason(`${RULE_ROOT_TEXT}: ${UNREADABLE}`)];
  }
  return w.out;
}

/**
 * Reasons for a Rule_Set value (the array that the `rules` field holds), with paths from
 * the document root: `rules`, `rules[2].trigger.of.value`. An empty array means valid.
 */
export function validateRuleSet(x: unknown): string[] {
  const w = new Walker("rules");
  try {
    ruleSetInto(w, x);
  } catch {
    return [cutReason(`rules: ${UNREADABLE}`)];
  }
  return w.out;
}

function ruleSetInto(w: Walker, x: unknown): void {
  if (!Array.isArray(x)) {
    w.add(["rules"], `must be an array; found ${foundName(x)}.`);
    return;
  }
  const rules: unknown[] = x;
  if (rules.length < 1 || rules.length > MAX_RULES) {
    w.out.push(cutReason(`rules: must hold 1 to ${MAX_RULES} rules; found ${rules.length}.`));
  }
  for (let i = 0; i < rules.length; i++) w.rule(rules[i], ["rules", i]);
}

/**
 * Reasons for a whole IR document value: the top-level object, its listed fields and its
 * Rule_Set. The `version` field is checked by the reader before this runs, so it is only
 * allowed here, not judged. An empty array means valid.
 */
export function validateIrDocument(x: unknown): string[] {
  const w = new Walker("rules");
  try {
    if (typeof x !== "object" || x === null || Array.isArray(x)) {
      w.out.push(cutReason(`The document must be a JSON object; found ${foundName(x)}.`));
      return w.out;
    }
    const doc = x as Record<string, unknown>;
    if (Object.keys(doc).some((k) => k !== "version" && k !== "rules")) {
      w.out.push("The top-level object has a field that is not allowed.");
    }
    if (!hasOwn(doc, "rules")) {
      w.add(["rules"], "is missing.");
    } else {
      ruleSetInto(w, doc.rules);
    }
  } catch {
    return [cutReason(`rules: ${UNREADABLE}`)];
  }
  return w.out;
}

// ---------------------------------------------------------------------------
// Repeated sentences, reader and writer

/**
 * Repeated-sentence check. Call only on a Rule_Set that already passed `validateRuleSet`.
 * One Reason per sentence held by two or more Rules, in order of first appearance, with
 * the indexes ascending and before the sentence so they survive the cut.
 */
export function findRepeatedSentences(ruleSet: readonly Rule[]): string[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < ruleSet.length; i++) {
    const r = render(ruleSet[i]);
    if (!r.ok) continue;
    const list = groups.get(r.sentence);
    if (list) list.push(i);
    else groups.set(r.sentence, [i]);
  }
  const out: string[] = [];
  for (const [sentence, indexes] of groups) {
    if (indexes.length < 2) continue;
    out.push(cutReason(`rules ${indexes.join(", ")} repeat the sentence "${sentence}"`));
  }
  return out;
}

function copyCondition(c: Condition): Condition {
  switch (c.op) {
    case "eq":
      return { op: "eq", signal: c.signal, value: c.value };
    case "above":
      return { op: "above", signal: c.signal, value: c.value };
    case "below":
      return { op: "below", signal: c.signal, value: c.value };
    case "all":
      return { op: "all", of: c.of.map(copyCondition) };
    case "any":
      return { op: "any", of: c.of.map(copyCondition) };
  }
}

function copyEdge(e: Edge): Edge {
  return { op: e.op, of: copyCondition(e.of) };
}

function copyRule(r: Rule): Rule {
  switch (r.form) {
    case "never":
      return { form: "never", condition: copyCondition(r.condition) };
    case "respond":
      return {
        form: "respond",
        trigger: copyEdge(r.trigger),
        withinMs: r.withinMs,
        expect: copyCondition(r.expect),
      };
    case "count":
      return { form: "count", edge: copyEdge(r.edge), windowMs: r.windowMs, max: r.max };
    case "hold":
      return {
        form: "hold",
        after: copyEdge(r.after),
        durationMs: r.durationMs,
        expect: copyCondition(r.expect),
      };
    case "notLongerThan":
      return { form: "notLongerThan", condition: copyCondition(r.condition), ms: r.ms };
  }
}

/** IR_Reader: five steps in the order of Req 1.14. Never throws. */
export function readIr(text: string): ReadResult {
  try {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, reasons: ["The text is not valid JSON."] };
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      if (!hasOwn(value, "version")) return { ok: false, reasons: ["version is missing."] };
      const v = (value as Record<string, unknown>).version;
      if (v !== IR_VERSION) {
        return { ok: false, reasons: [cutReason(`version must be the number 1; found ${jsonTypeName(v)}.`)] };
      }
    }
    const structure = validateIrDocument(value);
    if (structure.length > 0) return { ok: false, reasons: structure };
    const rules = (value as { rules: Rule[] }).rules;
    const repeated = findRepeatedSentences(rules);
    if (repeated.length > 0) return { ok: false, reasons: repeated };
    return { ok: true, ruleSet: rules.map(copyRule) };
  } catch {
    return { ok: false, reasons: ["The text could not be read."] };
  }
}

/** IR_Writer. Never throws. Same Rule_Set, same text. */
export function writeIr(ruleSet: unknown): WriteResult {
  try {
    const structure = validateRuleSet(ruleSet);
    if (structure.length > 0) return { ok: false, reason: structure[0] as string };
    const rules = (ruleSet as Rule[]).map(copyRule);
    const repeated = findRepeatedSentences(rules);
    if (repeated.length > 0) return { ok: false, reason: repeated[0] as string };
    const doc: IrDocument = { version: 1, rules };
    return { ok: true, text: JSON.stringify(doc, null, 2) + "\n" };
  } catch {
    return { ok: false, reason: "rules: the value could not be read." };
  }
}
