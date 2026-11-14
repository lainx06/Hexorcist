// Generators for the rule-compiler property tests (helper, not a test file).
// All randomness comes from fast-check; nothing here draws its own.

import * as fc from "fast-check";
import { BANNED_WORDS } from "../copy-rules";
import { render } from "../rules/render";
import type { Condition, Edge, Rule, RuleSet } from "../rules/ir";
import type { CheckerObservation } from "../checker";
import type { AppliedInput, Diagnostic, Fixture, FixturePin, OutputEvent, PinValue } from "../types";
import type { ReferenceInput } from "./rules-reference";
import type { RunResult } from "../types";

// ---------------------------------------------------------------------------
// Signal names

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
const NAME_CHARS = [...LETTERS, ..."0123456789_".split("")];
const BANNED_LOWER = BANNED_WORDS.map((w) => w.toLowerCase());

/** Test-side equivalent of isSignalName, written from Req 1 (not imported). */
function validName(s: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(s)) return false;
  const lower = s.toLowerCase();
  return lower !== "all" && lower !== "any" && !BANNED_LOWER.includes(lower);
}

export const TEMPLATE_WORDS: readonly string[] = [
  "is", "above", "below", "of", "becomes", "true", "false", "must", "never", "last", "or", "longer",
  "Within", "After",
];

const arbPatternName: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...LETTERS), fc.array(fc.constantFrom(...NAME_CHARS), { maxLength: 31 }))
  .map(([first, rest]) => first + rest.join(""))
  .filter(validName);

export const arbSignalName: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(...TEMPLATE_WORDS).filter(validName) },
  { weight: 5, arbitrary: arbPatternName },
);

// ---------------------------------------------------------------------------
// Numbers

/** Duration_Ms: integer part 0..9,999,999 and 0..7 fraction digits, last non-zero, value above 0. */
export const arbDurationMs: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 1, max: 9_999_999 }).map((n) => Number(String(n))),
  fc
    .tuple(
      fc.integer({ min: 0, max: 9_999_999 }),
      fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 6 }),
      fc.integer({ min: 1, max: 9 }),
    )
    .map(([whole, mid, last]) => Number(`${whole}.${mid.join("")}${last}`)),
);

const arbMax: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(0) },
  { weight: 2, arbitrary: fc.constant(1) },
  { weight: 2, arbitrary: fc.constant(2) },
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 65_535 }) },
);

// ---------------------------------------------------------------------------
// Conditions: letrec levels c1..c4 carry the depth budget; d2..d4 force a branch one level
// deeper so depth 4 appears.

const arbLeaf: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({ op: fc.constant("eq" as const), signal: arbSignalName, value: fc.constantFrom(0 as const, 1 as const) }),
  fc.record({ op: fc.constant("above" as const), signal: arbSignalName, value: fc.integer({ min: 0, max: 1022 }) }),
  fc.record({ op: fc.constant("below" as const), signal: arbSignalName, value: fc.integer({ min: 1, max: 1023 }) }),
);

const arbListOp = fc.constantFrom("all" as const, "any" as const);

const levels = fc.letrec((tie) => {
  const t = (name: string) => tie(name) as fc.Arbitrary<Condition>;
  const list = (inner: fc.Arbitrary<Condition>): fc.Arbitrary<Condition> =>
    fc
      .tuple(arbListOp, fc.array(inner, { minLength: 2, maxLength: 8 }))
      .map(([op, of]) => ({ op, of }));
  const forced = (deeper: string, shallower: string): fc.Arbitrary<Condition> =>
    fc
      .tuple(arbListOp, t(deeper), fc.array(t(shallower), { minLength: 1, maxLength: 7 }), fc.nat())
      .map(([op, deep, rest, at]) => {
        const of = [...rest];
        of.splice(at % (of.length + 1), 0, deep);
        return { op, of };
      });
  return {
    c1: arbLeaf,
    c2: fc.oneof(arbLeaf, list(t("c1"))),
    c3: fc.oneof(arbLeaf, list(t("c2"))),
    c4: fc.oneof(arbLeaf, list(t("c3"))),
    d2: list(t("c1")),
    d3: forced("d2", "c2"),
    d4: forced("d3", "c3"),
  };
});

/** Condition with depth budget 4; a quarter of the cases force a chain of depth 4. */
export const arbCondition: fc.Arbitrary<Condition> = fc.oneof(
  { weight: 3, arbitrary: levels.c4 as fc.Arbitrary<Condition> },
  { weight: 1, arbitrary: levels.d4 as fc.Arbitrary<Condition> },
);

const arbEdge: fc.Arbitrary<Edge> = fc.record({
  op: fc.constantFrom("rise" as const, "fall" as const),
  of: arbCondition,
});

// ---------------------------------------------------------------------------
// Rules

export const arbRule: fc.Arbitrary<Rule> = fc.oneof(
  fc.record({ form: fc.constant("never" as const), condition: arbCondition }),
  fc.record({
    form: fc.constant("respond" as const),
    trigger: arbEdge,
    withinMs: arbDurationMs,
    expect: arbCondition,
  }),
  fc.record({ form: fc.constant("count" as const), edge: arbEdge, windowMs: arbDurationMs, max: arbMax }),
  fc.record({
    form: fc.constant("hold" as const),
    after: arbEdge,
    durationMs: arbDurationMs,
    expect: arbCondition,
  }),
  fc.record({ form: fc.constant("notLongerThan" as const), condition: arbCondition, ms: arbDurationMs }),
);

const sentenceOf = (r: Rule): string => {
  const out = render(r);
  return out.ok ? out.sentence : "";
};

/** 1 to 32 Rules with distinct Canonical_Sentences; half the cases have exactly one Rule. */
export const arbRuleSet: fc.Arbitrary<RuleSet> = fc.oneof(
  arbRule.map((r): RuleSet => [r]),
  fc.uniqueArray(arbRule, { minLength: 2, maxLength: 32, selector: sentenceOf }),
);

// ---------------------------------------------------------------------------
// Mutated sentences (Property 3)

export interface MutatedSentence {
  /** Canonical_Sentence of the generated Rule the mutations started from. */
  source: string;
  /** The text after one or more mutations. */
  s: string;
}

type MutationKind =
  | "insert"
  | "delete"
  | "replace"
  | "case"
  | "whitespace"
  | "numberForm"
  | "numberOther";

interface Mutation {
  kind: MutationKind;
  at: number;
  pick: number;
  ch: string;
}

const PRINTABLE = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i));
const WHITESPACE_ITEMS = ["\t", "\r", "\n", "\u00a0", "  "];
const OTHER_VALID_NUMBERS = ["0", "1", "2", "5", "7", "100", "300", "1022", "1023"];

const arbMutation: fc.Arbitrary<Mutation> = fc.record({
  kind: fc.constantFrom<MutationKind>(
    "insert", "delete", "replace", "case", "whitespace", "numberForm", "numberOther", "numberOther",
  ),
  at: fc.nat(),
  pick: fc.nat(),
  ch: fc.constantFrom(...PRINTABLE),
});

function applyMutation(text: string, m: Mutation): string {
  const len = text.length;
  switch (m.kind) {
    case "insert": {
      const i = m.at % (len + 1);
      return text.slice(0, i) + m.ch + text.slice(i);
    }
    case "delete": {
      if (len === 0) return text;
      const i = m.at % len;
      return text.slice(0, i) + text.slice(i + 1);
    }
    case "replace": {
      if (len === 0) return text;
      const i = m.at % len;
      return text.slice(0, i) + m.ch + text.slice(i + 1);
    }
    case "case": {
      if (len === 0) return text;
      const i = m.at % len;
      const c = text[i];
      const flipped = c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase();
      return text.slice(0, i) + flipped + text.slice(i + 1);
    }
    case "whitespace": {
      const item = WHITESPACE_ITEMS[m.pick % WHITESPACE_ITEMS.length];
      const where = m.at % 3;
      if (where === 0) return " " + text;
      if (where === 1) return text + " ";
      const i = m.at % (len + 1);
      return text.slice(0, i) + item + text.slice(i);
    }
    case "numberForm":
    case "numberOther": {
      const tokens = [...text.matchAll(/\d+(?:\.\d+)?/g)];
      if (tokens.length === 0) return text;
      const t = tokens[m.at % tokens.length];
      const tok = t[0];
      const start = t.index ?? 0;
      let replacement: string;
      if (m.kind === "numberOther") {
        replacement = OTHER_VALID_NUMBERS[m.pick % OTHER_VALID_NUMBERS.length];
      } else {
        const mid = Math.max(1, Math.floor(tok.length / 2));
        const forms = [
          "0" + tok,
          "+" + tok,
          "-" + tok,
          tok + "e0",
          tok + "e2",
          tok + ".0",
          tok.slice(0, mid) + "," + tok.slice(mid),
          tok.slice(0, mid) + "_" + tok.slice(mid),
          "99999999999",
          "1024",
          "65536",
          "10000000",
        ];
        replacement = forms[m.pick % forms.length];
      }
      return text.slice(0, start) + replacement + text.slice(start + tok.length);
    }
  }
}

/** A generated Rule's sentence with one to three mutations, with the sentence it came from. */
export const arbMutatedPair: fc.Arbitrary<MutatedSentence> = fc
  .tuple(arbRule, fc.array(arbMutation, { minLength: 1, maxLength: 3 }))
  .map(([r, muts]) => {
    const source = sentenceOf(r);
    return { source, s: muts.reduce(applyMutation, source) };
  });

/** Mutated Canonical_Sentences of generated valid Rules (Property 3, source (a)). */
export const arbMutatedSentence: fc.Arbitrary<string> = arbMutatedPair.map((p) => p.s);

// ---------------------------------------------------------------------------
// Checker cases (Property 4): a Fixture, a Rule_Set, a whole trace and its Step split.

export interface CheckerCase extends ReferenceInput {
  /** Strictly ascending Step boundaries X0 < X1 < ... < Xm = endCycle. */
  readonly boundaries: readonly number[];
  /** One observation per boundary, then the end-of-run call. */
  readonly observations: readonly CheckerObservation[];
}

type GenFn = <T>(arb: fc.Arbitrary<T>) => T;
type Leaf = Extract<Condition, { op: "eq" | "above" | "below" }>;

const CASE_POOL = ["LED", "OUT2", "BTN", "BEAM", "POT", "KNOB"] as const;
const ANALOG_POINTS = [0, 1, 100, 300, 511, 512, 513, 700, 1021, 1022, 1023];

const int = (min: number, max: number): fc.Arbitrary<number> => fc.integer({ min, max });

function genEndCycle(g: GenFn): number {
  return g(
    fc.oneof(
      { weight: 2, arbitrary: int(1, 30) },
      { weight: 2, arbitrary: int(1, 1000) },
      { weight: 3, arbitrary: int(1, 20_000) },
    ),
  );
}

function genFixture(g: GenFn): Fixture {
  const signals = g(fc.shuffledSubarray([...CASE_POOL], { minLength: 1, maxLength: 5 }));
  const pins: FixturePin[] = [];
  let digitalCount = 0;
  let analogCount = 0;
  const addPin = (signal: string, kind: "output" | "input" | "analog"): void => {
    if (kind === "analog") {
      const restLevel = g(fc.option(int(0, 1023), { nil: undefined }));
      const pin: FixturePin = { signal, kind: "analog", channel: analogCount++ };
      if (restLevel !== undefined) pin.restLevel = restLevel;
      pins.push(pin);
      return;
    }
    const pin: FixturePin = {
      signal,
      port: "D",
      bit: digitalCount++ as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      direction: kind,
    };
    if (kind === "input") {
      const level = g(fc.constantFrom<"low" | "high" | undefined>(undefined, "low", "high"));
      const rest = g(fc.constantFrom<"active" | undefined>(undefined, undefined, "active"));
      if (level !== undefined) pin.activeLevel = level;
      if (rest !== undefined) pin.restState = rest;
    }
    pins.push(pin);
  };
  const kindOf = new Map<string, "output" | "input" | "analog">();
  for (const s of signals) {
    const natural = s === "LED" || s === "OUT2" ? "output" : s === "BTN" || s === "BEAM" ? "input" : "analog";
    const roll = g(int(0, 4));
    const kind = roll === 0 ? g(fc.constantFrom<"output" | "input" | "analog">("output", "input", "analog")) : natural;
    kindOf.set(s, kind);
    addPin(s, kind);
  }
  // One case in ten: a second pin with an existing signal (same kind), so the signal is mapped twice.
  if (g(int(0, 9)) === 0) {
    const s = signals[g(int(0, signals.length - 1))];
    addPin(s, kindOf.get(s) as "output" | "input" | "analog");
  }
  return { pins };
}

function genLeaf(g: GenFn, pins: readonly FixturePin[]): Leaf {
  const pin = pins[g(int(0, pins.length - 1))];
  if (pin.kind === "analog") {
    const v = g(fc.constantFrom(...ANALOG_POINTS));
    return g(fc.boolean())
      ? { op: "above", signal: pin.signal, value: Math.min(v, 1022) }
      : { op: "below", signal: pin.signal, value: Math.max(v, 1) };
  }
  return { op: "eq", signal: pin.signal, value: g(fc.constantFrom(0 as const, 1 as const)) };
}

function genCondition(g: GenFn, pins: readonly FixturePin[], depth: number): Condition {
  if (depth <= 1) return genLeaf(g, pins);
  const n = g(int(2, 3));
  const forced = g(int(0, n - 1));
  const of: Condition[] = [];
  for (let i = 0; i < n; i++) of.push(genCondition(g, pins, i === forced ? depth - 1 : g(int(1, depth - 1))));
  return { op: g(arbListOp), of };
}

const genCond = (g: GenFn, pins: readonly FixturePin[]): Condition => genCondition(g, pins, g(int(1, 3)));
const genEdge = (g: GenFn, pins: readonly FixturePin[]): Edge => ({
  op: g(fc.constantFrom("rise" as const, "fall" as const)),
  of: genCond(g, pins),
});

function genWindow(g: GenFn, endCycle: number): number {
  return g(
    fc.oneof(
      { weight: 2, arbitrary: int(1, 30) },
      { weight: 3, arbitrary: int(1, Math.min(endCycle, 20_000)) },
      { weight: 1, arbitrary: int(1, 20_000) },
    ),
  );
}

/** Duration_Ms = W / 16,000: exact in decimal with at most 7 fraction digits. */
const msOf = (w: number): number => w / 16_000;

function genRule(g: GenFn, pins: readonly FixturePin[], endCycle: number): { rule: Rule; window: number | null } {
  const form = g(fc.constantFrom("never", "respond", "count", "hold", "notLongerThan"));
  if (form === "never") return { rule: { form, condition: genCond(g, pins) }, window: null };
  const w = genWindow(g, endCycle);
  switch (form) {
    case "respond":
      return {
        rule: { form, trigger: genEdge(g, pins), withinMs: msOf(w), expect: genCond(g, pins) },
        window: w,
      };
    case "count":
      return {
        rule: {
          form,
          edge: genEdge(g, pins),
          windowMs: msOf(w),
          max: g(fc.oneof({ weight: 3, arbitrary: int(0, 2) }, { weight: 1, arbitrary: int(0, 6) })),
        },
        window: w,
      };
    case "hold":
      return {
        rule: { form, after: genEdge(g, pins), durationMs: msOf(w), expect: genCond(g, pins) },
        window: w,
      };
    default:
      return { rule: { form: "notLongerThan", condition: genCond(g, pins), ms: msOf(w) }, window: w };
  }
}

function leavesOfCondition(c: Condition): Leaf[] {
  return c.op === "all" || c.op === "any" ? c.of.flatMap(leavesOfCondition) : [c];
}

function leavesOfRule(rule: Rule): Leaf[] {
  switch (rule.form) {
    case "never":
    case "notLongerThan":
      return leavesOfCondition(rule.condition);
    case "respond":
      return [...leavesOfCondition(rule.trigger.of), ...leavesOfCondition(rule.expect)];
    case "count":
      return leavesOfCondition(rule.edge.of);
    case "hold":
      return [...leavesOfCondition(rule.after.of), ...leavesOfCondition(rule.expect)];
  }
}

/**
 * Differential-check cases: Fixture, 1 to 4 Rules, a whole trace of E cycles and a Step split.
 * Written from design Property 4, generator steps 1 to 4.
 */
export const arbCheckerCase: fc.Arbitrary<CheckerCase> = fc.gen().map((gen): CheckerCase => {
  const g: GenFn = (arb) => gen(() => arb);
  const E = genEndCycle(g);

  // Step 1: Fixture.
  const fixture = genFixture(g);
  const pins = fixture.pins;

  // Step 2: Rules, with distinct Canonical_Sentences.
  const ruleCount = g(int(1, 4));
  const ruleSet: Rule[] = [];
  const windows: (number | null)[] = [];
  const seenSentences = new Set<string>();
  const wrongKindCase = g(int(0, 9)) === 0;
  const wrongKindRule = g(int(0, ruleCount - 1));
  for (let i = 0; i < ruleCount; i++) {
    const { rule, window } = genRule(g, pins, E);
    if (wrongKindCase && i === wrongKindRule) {
      const leaves = leavesOfRule(rule);
      const leaf = leaves[g(int(0, leaves.length - 1))];
      const analog = pins.some((p) => p.signal === leaf.signal && p.kind === "analog");
      const mutable = leaf as { op: string; value: number };
      mutable.op = analog ? "eq" : "above";
      mutable.value = analog ? 0 : 5;
    }
    const out = render(rule);
    const sentence = out.ok ? out.sentence : `invalid:${i}`;
    if (seenSentences.has(sentence)) continue;
    seenSentences.add(sentence);
    ruleSet.push(rule);
    windows.push(window);
  }

  // Step 3: Trace.
  const outputPins = pins.filter((p) => p.kind !== "analog" && p.direction === "output");
  const digitalInputs = pins.filter((p) => p.kind !== "analog" && p.direction === "input");
  const inputPins = pins.filter((p) => p.kind === "analog" || p.direction === "input");

  const snapshot: OutputEvent[] = outputPins.map((p) => ({
    signal: p.signal,
    value: g(fc.constantFrom<PinValue>(0, 0, 1, 1, "input")),
    cycle: 0,
  }));
  const changeCount = outputPins.length === 0 ? 0 : g(fc.oneof(int(0, 6), int(0, 40)));
  const changes: OutputEvent[] = [];
  for (let i = 0; i < changeCount; i++) {
    changes.push({
      signal: outputPins[g(int(0, outputPins.length - 1))].signal,
      value: g(fc.constantFrom<PinValue>(0, 0, 1, 1, "input")),
      cycle: g(int(1, E)),
    });
  }
  const sortedChanges = changes
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e);
  const outputEvents: OutputEvent[] = [...snapshot, ...sortedChanges];

  // Rest_Events first (cycle 0), then applied inputs ascending by appliedCycle; ties keep draw order.
  const applied: AppliedInput[] = [];
  for (const p of digitalInputs) {
    if (p.kind !== "analog" && p.restState === "active") {
      applied.push({
        signal: p.signal,
        value: p.activeLevel === "high" ? 1 : 0,
        cycle: 0,
        gremlinId: "rest",
        appliedCycle: 0,
      });
    }
  }
  const hot = Array.from({ length: g(int(1, 4)) }, () => g(int(0, E - 1)));
  const inputCount = inputPins.length === 0 ? 0 : g(fc.oneof(int(0, 5), int(0, 30)));
  const drawn: { ev: AppliedInput; i: number }[] = [];
  for (let i = 0; i < inputCount; i++) {
    const p = inputPins[g(int(0, inputPins.length - 1))];
    const appliedCycle = g(fc.boolean()) ? hot[g(int(0, hot.length - 1))] : g(int(0, E - 1));
    const cycle = Math.max(0, appliedCycle - g(fc.oneof(int(0, 0), int(0, 50))));
    const gremlinId = `g${g(int(0, 3))}`;
    if (p.kind === "analog") {
      drawn.push({
        ev: { signal: p.signal, analog: g(fc.oneof(fc.constantFrom(...ANALOG_POINTS), int(0, 1023))), cycle, gremlinId, appliedCycle },
        i,
      });
    } else {
      drawn.push({
        ev: { signal: p.signal, value: g(fc.constantFrom(0 as const, 1 as const, "release" as const)), cycle, gremlinId, appliedCycle },
        i,
      });
    }
  }
  drawn.sort((a, b) => a.ev.appliedCycle - b.ev.appliedCycle || a.i - b.i);
  for (const d of drawn) applied.push(d.ev);

  // Floating_Diagnostics: referenced and unreferenced Digital_Inputs, two signals, non-Fixture signals.
  const diagCount = g(fc.oneof({ weight: 3, arbitrary: int(0, 0) }, { weight: 2, arbitrary: int(1, 3) }));
  const diagSignals = [...digitalInputs.map((p) => p.signal), ...(digitalInputs.length === 0 ? ["GHOST"] : [])];
  const diagDrawn: { dg: Diagnostic; i: number }[] = [];
  for (let i = 0; i < diagCount; i++) {
    const ghost = g(int(0, 4)) === 0;
    const signal = ghost ? "GHOST" : diagSignals[g(int(0, diagSignals.length - 1))];
    diagDrawn.push({
      dg: { kind: "floating-input", signal, cycle: g(fc.oneof(int(0, E - 1), int(0, Math.min(E - 1, 20)))), register: "PIND" },
      i,
    });
  }
  diagDrawn.sort((a, b) => a.dg.cycle - b.dg.cycle || a.i - b.i);
  const diagnostics = diagDrawn.map((d) => d.dg);

  // Step 4: Split. Boundaries mix random cycles and appliedCycle values; [E] alone in a fifth of cases.
  const pool = new Set<number>();
  for (let i = 0; i < 6; i++) if (E > 1) pool.add(g(int(1, E - 1)));
  for (const a of applied) if (a.appliedCycle >= 1 && a.appliedCycle <= E - 1) pool.add(a.appliedCycle);
  const poolList = [...pool].sort((a, b) => a - b);
  const oneStep = g(int(0, 4)) === 0;
  const chosen = oneStep || poolList.length === 0 ? [] : g(fc.shuffledSubarray(poolList, { minLength: 0, maxLength: Math.min(8, poolList.length) }));
  const boundaries = [...new Set(chosen)].sort((a, b) => a - b);
  boundaries.push(E);

  const observations: CheckerObservation[] = [];
  let prev = 0;
  boundaries.forEach((X, j) => {
    observations.push({
      runIndex: 0,
      stepIndex: j,
      endOfRun: false,
      cycle: X,
      outputEvents: outputEvents.filter((e) => (j === 0 && e.cycle === 0) || (e.cycle > prev && e.cycle <= X)),
      appliedInputs: applied.filter((a) => a.appliedCycle >= prev && a.appliedCycle <= X - 1),
      diagnostics: diagnostics.filter((d) => d.cycle >= prev && d.cycle <= X - 1),
    });
    prev = X;
  });
  observations.push({
    runIndex: 0,
    stepIndex: boundaries.length,
    endOfRun: true,
    cycle: E,
    outputEvents: [],
    appliedInputs: [],
    diagnostics: [],
  });

  return { fixture, ruleSet, windows, endCycle: E, outputEvents, appliedInputs: applied, diagnostics, boundaries, observations };
});

// ---------------------------------------------------------------------------
// Trigger cases (Properties 7 and 8): a fixed test Fixture, Rules whose Trigger signal is one
// leaf, and synthetic Runs whose Occurrences sit near endCycle - W so window-cut cases appear.

/** The fixed Fixture of the trigger generators: one output, one digital input, one analog input. */
export const TRIGGER_FIXTURE: Fixture = {
  pins: [
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "BTN", port: "D", bit: 2, direction: "input" },
    { signal: "POT", kind: "analog", channel: 0 },
  ],
};

export interface TriggerCase {
  readonly fixture: Fixture;
  readonly rule: Rule;
  /** W, D or L of the rule. */
  readonly window: number;
  readonly run: RunResult;
}

export interface TriggerSetCase {
  readonly fixture: Fixture;
  readonly ruleSet: readonly Rule[];
  /** Window_Cycles per Rule; null for `never`. */
  readonly windows: readonly (number | null)[];
  readonly runs: readonly RunResult[];
}

const TRIGGER_SIGNALS = ["LED", "BTN", "POT"] as const;
type TriggerSignal = (typeof TRIGGER_SIGNALS)[number];
type TriggerMode = "fit" | "cut" | "none" | "mixed";
type SpanMode = "fit" | "spanEnd" | "cut" | "none" | "raw";

function genTriggerLeaf(g: GenFn): Leaf {
  const signal = g(fc.constantFrom<TriggerSignal>(...TRIGGER_SIGNALS));
  if (signal === "POT") {
    return g(fc.boolean())
      ? { op: "above", signal, value: g(fc.oneof(int(0, 1022), int(100, 900))) }
      : { op: "below", signal, value: g(fc.oneof(int(1, 1023), int(100, 900))) };
  }
  return { op: "eq", signal, value: g(fc.constantFrom(0 as const, 1 as const)) };
}

function genTriggerExpect(g: GenFn): Condition {
  if (g(int(0, 2)) > 0) return genTriggerLeaf(g);
  return { op: g(arbListOp), of: [genTriggerLeaf(g), genTriggerLeaf(g)] };
}

/** A value of the leaf's signal that makes the leaf true (wantTrue) or false. */
function valueFor(leaf: Leaf, wantTrue: boolean): number {
  switch (leaf.op) {
    case "eq":
      return wantTrue ? leaf.value : 1 - leaf.value;
    case "above":
      return wantTrue ? leaf.value + 1 : leaf.value;
    case "below":
      return wantTrue ? leaf.value - 1 : leaf.value;
  }
}

function leafTrueFor(leaf: Leaf, value: number): boolean {
  switch (leaf.op) {
    case "eq":
      return value === leaf.value;
    case "above":
      return value > leaf.value;
    case "below":
      return value < leaf.value;
  }
}

/** Sorted distinct times with gaps of at least 2. */
function spaced(times: readonly number[]): number[] {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const out: number[] = [];
  for (const t of sorted) if (out.length === 0 || t - out[out.length - 1] >= 2) out.push(t);
  return out;
}

interface RunDraft {
  ledInitial: number;
  outputs: OutputEvent[];
  inputs: AppliedInput[];
  /** Signals that carry a rule's Trigger events in this Run. */
  used: Set<string>;
}

function emit(draft: RunDraft, signal: string, cycle: number, value: number): void {
  if (signal === "LED") {
    draft.outputs.push({ signal, value: value as 0 | 1, cycle });
  } else if (signal === "BTN") {
    draft.inputs.push({ signal, value: value as 0 | 1, cycle, gremlinId: "g0", appliedCycle: cycle });
  } else {
    draft.inputs.push({ signal, analog: value, cycle, gremlinId: "g0", appliedCycle: cycle });
  }
}

function initialValue(draft: RunDraft, signal: string): number {
  return signal === "LED" ? draft.ledInitial : signal === "BTN" ? 1 : 512;
}

/** Make the leaf false from cycle 0 on, without an event when the start value already does. */
function baselineFalse(draft: RunDraft, leaf: Leaf): void {
  const off = valueFor(leaf, false);
  if (leaf.signal === "LED") {
    draft.ledInitial = off;
  } else if (leafTrueFor(leaf, initialValue(draft, leaf.signal))) {
    emit(draft, leaf.signal, 0, off);
  }
}

function edgeTimes(g: GenFn, mode: TriggerMode, E: number, bound: number): number[] {
  const fit = bound >= 2 ? [2, Math.min(bound, E)] : null;
  const cut = Math.max(2, bound + 1) <= E ? [Math.max(2, bound + 1), E] : null;
  const pick = (range: number[] | null): number[] =>
    range === null ? [] : g(fc.array(int(range[0], range[1]), { minLength: 1, maxLength: 3 }));
  const near = (): number[] =>
    E >= 2 ? [Math.min(E, Math.max(2, bound + g(int(-2, 2))))] : [];
  switch (mode) {
    case "none":
      return [];
    case "fit":
      return spaced([...pick(fit), ...(g(int(0, 2)) === 0 ? near() : [])]);
    case "cut":
      return spaced([...pick(cut), ...(g(int(0, 2)) === 0 ? near() : [])]);
    case "mixed":
      return spaced([...(E >= 2 ? g(fc.array(int(2, E), { minLength: 1, maxLength: 3 })) : []), ...near()]);
  }
}

function addEdgeEvents(g: GenFn, draft: RunDraft, edge: Edge, mode: TriggerMode, E: number, bound: number): void {
  const leaf = edge.of as Leaf;
  draft.used.add(leaf.signal);
  for (const t of edgeTimes(g, mode, E, bound)) {
    const rise = edge.op === "rise";
    emit(draft, leaf.signal, t - 1, valueFor(leaf, !rise));
    emit(draft, leaf.signal, t, valueFor(leaf, rise));
  }
}

function addSpanEvents(g: GenFn, draft: RunDraft, leaf: Leaf, mode: SpanMode, E: number, L: number): void {
  draft.used.add(leaf.signal);
  if (mode === "raw") {
    const n = g(int(0, 4));
    const cycles = g(fc.array(int(0, E), { minLength: n, maxLength: n })).sort((a, b) => a - b);
    cycles.forEach((c, i) => emit(draft, leaf.signal, c, valueFor(leaf, i % 2 === 0)));
    return;
  }
  baselineFalse(draft, leaf);
  const startAt = (s: number): void => {
    emit(draft, leaf.signal, s - 1, valueFor(leaf, false));
    emit(draft, leaf.signal, s, valueFor(leaf, true));
  };
  if (mode === "fit" && E - L >= 2) {
    startAt(g(int(2, E - L)));
  } else if (mode === "spanEnd" && E >= 3) {
    const s = g(int(2, E - 1));
    startAt(s);
    emit(draft, leaf.signal, g(int(s + 1, E)), valueFor(leaf, false));
  } else if (mode === "cut" && Math.max(2, E - L + 1) <= E) {
    startAt(g(int(Math.max(2, E - L + 1), E)));
  }
}

function buildRun(
  g: GenFn,
  ruleSet: readonly Rule[],
  windows: readonly (number | null)[],
  E: number,
  runIndex: number,
): RunResult {
  const draft: RunDraft = { ledInitial: g(int(0, 1)), outputs: [], inputs: [], used: new Set() };
  ruleSet.forEach((rule, i) => {
    const w = windows[i] ?? 0;
    switch (rule.form) {
      case "never":
        return;
      case "respond":
        return addEdgeEvents(g, draft, rule.trigger, g(fc.constantFrom<TriggerMode>("fit", "cut", "none", "mixed")), E, E - w);
      case "hold":
        return addEdgeEvents(g, draft, rule.after, g(fc.constantFrom<TriggerMode>("fit", "cut", "none", "mixed")), E, E - w + 1);
      case "count":
        return addEdgeEvents(g, draft, rule.edge, g(fc.constantFrom<TriggerMode>("fit", "none", "mixed")), E, E);
      case "notLongerThan":
        return addSpanEvents(
          g,
          draft,
          rule.condition as Leaf,
          g(fc.constantFrom<SpanMode>("fit", "spanEnd", "cut", "none", "raw")),
          E,
          w,
        );
    }
  });
  // Noise on signals that carry no Trigger events in this Run.
  for (const signal of TRIGGER_SIGNALS) {
    if (draft.used.has(signal)) continue;
    const n = g(int(0, 3));
    for (let k = 0; k < n; k++) {
      const cycle = g(int(1, E));
      emit(draft, signal, cycle, signal === "POT" ? g(int(0, 1023)) : g(int(0, 1)));
    }
  }
  const byCycle = <T>(items: T[], cycleOf: (t: T) => number): T[] =>
    items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => cycleOf(a.item) - cycleOf(b.item) || a.i - b.i)
      .map((x) => x.item);
  const outputEvents: OutputEvent[] = [
    { signal: "LED", value: draft.ledInitial as 0 | 1, cycle: 0 },
    ...byCycle(draft.outputs, (e) => e.cycle).filter((e) => e.cycle >= 0 && e.cycle <= E),
  ];
  const appliedInputs = byCycle(draft.inputs, (e) => e.appliedCycle).filter((e) => e.appliedCycle >= 0 && e.appliedCycle <= E);
  const violating = g(int(0, 3)) === 0 && ruleSet.length > 0;
  return {
    runIndex,
    runSeed: runIndex,
    eventList: [],
    skipped: [],
    appliedInputs,
    outputEvents,
    diagnostics: [],
    cannotCheck: [],
    violation: violating ? { rule: sentenceOf(ruleSet[g(int(0, ruleSet.length - 1))]), cycle: g(int(0, E)) } : null,
    endCycle: E,
  };
}

function genTriggerRule(g: GenFn, withNever: boolean, w: number): Rule {
  const forms = withNever
    ? (["respond", "count", "hold", "notLongerThan", "never"] as const)
    : (["respond", "count", "hold", "notLongerThan"] as const);
  const form = g(fc.constantFrom(...forms));
  const edge = (): Edge => ({ op: g(fc.constantFrom("rise" as const, "fall" as const)), of: genTriggerLeaf(g) });
  switch (form) {
    case "respond":
      return { form, trigger: edge(), withinMs: msOf(w), expect: genTriggerExpect(g) };
    case "count":
      return { form, edge: edge(), windowMs: msOf(w), max: g(int(0, 2)) };
    case "hold":
      return { form, after: edge(), durationMs: msOf(w), expect: genTriggerExpect(g) };
    case "notLongerThan":
      return { form, condition: genTriggerLeaf(g), ms: msOf(w) };
    case "never":
      return { form, condition: genTriggerExpect(g) };
  }
}

/** One Rule and one Run for Property 8: endCycle 1 to 20,000 and W 1 to 20,000. */
export const arbTriggerCase: fc.Arbitrary<TriggerCase> = fc.gen().map((gen): TriggerCase => {
  const g: GenFn = (arb) => gen(() => arb);
  const E = g(fc.oneof(int(1, 40), int(1, 2000), int(1, 20_000)));
  const W = g(fc.oneof(int(1, 20_000), int(1, Math.min(20_000, E)), int(1, 40)));
  const rule = genTriggerRule(g, false, W);
  return { fixture: TRIGGER_FIXTURE, rule, window: W, run: buildRun(g, [rule], [W], E, 0) };
});

/** A Rule_Set and 1 to 8 Runs for Property 7: endCycle 1 to 5,000 and W 1 to 2,000. */
export const arbTriggerSetCase: fc.Arbitrary<TriggerSetCase> = fc.gen().map((gen): TriggerSetCase => {
  const g: GenFn = (arb) => gen(() => arb);
  const wanted = g(int(1, 4));
  const ruleSet: Rule[] = [];
  const windows: (number | null)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < wanted; i++) {
    const w = g(fc.oneof(int(1, 2000), int(1, 60), int(1, 600)));
    const rule = genTriggerRule(g, true, w);
    const sentence = sentenceOf(rule);
    if (sentence === "" || seen.has(sentence)) continue;
    seen.add(sentence);
    ruleSet.push(rule);
    windows.push(rule.form === "never" ? null : w);
  }
  if (ruleSet.length === 0) {
    const w = g(int(1, 2000));
    ruleSet.push(genTriggerRule(g, false, w));
    windows.push(w);
  }
  const runCount = g(int(1, 8));
  const runs: RunResult[] = [];
  for (let r = 0; r < runCount; r++) {
    const E = g(fc.oneof(int(1, 40), int(1, 1000), int(1, 5000)));
    runs.push(buildRun(g, ruleSet, windows, E, r));
  }
  return { fixture: TRIGGER_FIXTURE, ruleSet, windows, runs };
});
