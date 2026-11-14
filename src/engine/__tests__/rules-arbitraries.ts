// Generators for the rule-compiler property tests (helper, not a test file).
// All randomness comes from fast-check; nothing here draws its own.

import * as fc from "fast-check";
import { BANNED_WORDS } from "../copy-rules";
import { render } from "../rules/render";
import type { Condition, Edge, Rule, RuleSet } from "../rules/ir";

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
