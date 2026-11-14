// Prefix_Oracle: test helper for Property 9 (not a test file). It answers one question:
// can this text still grow into a Canonical_Sentence of some valid Rule?
//
// Written from Requirement 1 (IR limits) and Requirement 2 (sentence templates) only. It
// shares no code with the parser: the only runtime imports are `render` and BANNED_WORDS.
// It matches the five sentence templates with a small backtracking matcher. Each matcher
// returns every way the text can be read:
//   done    the node was read completely and ends at index `end`
//   partial the text ran out inside the node; `value` is a completion of the node
// When the text runs out, the rest of the sentence is filled with fixed valid values, which
// gives a witness Rule. The caller checks `render(witness).sentence.startsWith(prefix)`.
//
// Signal_Name note: Requirement 1, criterion 7 rejects the names `all` and `any` exactly,
// and BANNED_WORDS entries ignoring case. This file follows that text, so a name such as
// `All` is accepted here.

import { BANNED_WORDS } from "../copy-rules";
import { render } from "../rules/render";
import type { Condition, Edge, Rule } from "../rules/ir";

export type OracleVerdict =
  | { viable: false }
  | {
      viable: true;
      /** A valid Rule filled in after the prefix. */
      witness: Rule;
      /** render(witness).sentence, or null when render refuses the witness. */
      sentence: string | null;
      /** True when the prefix is itself a whole Canonical_Sentence (the end of the text is allowed). */
      complete: boolean;
    };

// ---------------------------------------------------------------------------
// Fixed fill values and name check

const BANNED_LOWER = BANNED_WORDS.map((w) => w.toLowerCase());

function validSignal(name: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) return false;
  if (name === "all" || name === "any") return false;
  return !BANNED_LOWER.includes(name.toLowerCase());
}

const FILL_SIGNAL = "q";
const FILL_COND: Condition = { op: "eq", signal: FILL_SIGNAL, value: 0 };
const FILL_DURATION = 1;

/** A valid signal name that starts with `token` (which may be empty), or null. */
function extendSignal(token: string): string | null {
  const tails = ["", "x", "_", "0", "xx"];
  if (token === "") return FILL_SIGNAL;
  for (const t of tails) {
    if (validSignal(token + t)) return token + t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Outcomes and combinators

type Out<T> = { done: true; end: number; value: T } | { done: false; value: T };

function lit(s: string, i: number, text: string): "full" | "partial" | null {
  const rest = s.slice(i);
  if (rest.length >= text.length) return rest.startsWith(text) ? "full" : null;
  return text.startsWith(rest) ? "partial" : null;
}

/** Read `text` at i, then continue with `next`. If the text ends inside `text`, fill with `fill`. */
function after<B>(
  s: string,
  i: number,
  text: string,
  next: (j: number) => Out<B>[],
  fill: () => B,
): Out<B>[] {
  const m = lit(s, i, text);
  if (m === "full") return next(i + text.length);
  if (m === "partial") return [{ done: false, value: fill() }];
  return [];
}

/** Continue after each reading of A. A partial reading becomes a partial B through `fill`. */
function bind<A, B>(
  outs: Out<A>[],
  f: (a: A, end: number) => Out<B>[],
  fill: (a: A) => B,
): Out<B>[] {
  const result: Out<B>[] = [];
  for (const o of outs) {
    if (o.done) result.push(...f(o.value, o.end));
    else result.push({ done: false, value: fill(o.value) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Numbers

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";

/** Smallest value in [a, b] whose decimal text starts with `token`, or null. */
function extendInteger(token: string, a: number, b: number): number | null {
  const base = Number(token);
  const maxExtra = token === "0" ? 0 : 5;
  for (let k = 0; k <= maxExtra; k++) {
    const scale = 10 ** k;
    const lo = Math.max(base * scale, a);
    const hi = Math.min(base * scale + scale - 1, b);
    if (lo <= hi) return lo;
  }
  return null;
}

/** Integer token written as "0" or a non-zero digit then digits, with a value from a to b. */
function integer(s: string, i: number, a: number, b: number): Out<number>[] {
  let j = i;
  while (isDigit(s[j])) j++;
  const token = s.slice(i, j);
  if (token === "") return j === s.length ? [{ done: false, value: a }] : [];
  if (token.length > 1 && token[0] === "0") return [];
  if (j === s.length) {
    const w = extendInteger(token, a, b);
    return w === null ? [] : [{ done: false, value: w }];
  }
  const v = Number(token);
  return v >= a && v <= b ? [{ done: true, end: j, value: v }] : [];
}

/**
 * Duration_Ms token: integer part "0" or at most 7 digits, no leading zero; optional "."
 * and up to 7 digits whose last digit is not 0; the value is above 0.
 */
function duration(s: string, i: number): Out<number>[] {
  let j = i;
  while (isDigit(s[j]) || s[j] === ".") j++;
  const token = s.slice(i, j);
  if (j === s.length) {
    if (token === "") return [{ done: false, value: FILL_DURATION }];
    const m = /^(0|[1-9][0-9]{0,6})(?:(\.)([0-9]{0,7}))?$/.exec(token);
    if (m === null) return [];
    const whole = m[1] as string;
    if (m[2] === undefined) {
      return [{ done: false, value: Number(whole === "0" ? token + ".1" : token) }];
    }
    const frac = m[3] as string;
    if (frac === "") return [{ done: false, value: Number(token + "1") }];
    if (!frac.endsWith("0")) return [{ done: false, value: Number(token) }];
    if (frac.length < 7) return [{ done: false, value: Number(token + "1") }];
    return [];
  }
  const m = /^(0|[1-9][0-9]{0,6})(?:\.([0-9]{0,6}[1-9]))?$/.exec(token);
  if (m === null) return [];
  if (m[1] === "0" && m[2] === undefined) return [];
  return [{ done: true, end: j, value: Number(token) }];
}

// ---------------------------------------------------------------------------
// Conditions and Edges

const eq = (signal: string, value: 0 | 1): Condition => ({ op: "eq", signal, value });

/** `S is 0|1|above n|below n`, after the signal and " is " have been read. */
function leafValue(s: string, i: number, signal: string): Out<Condition>[] {
  const result: Out<Condition>[] = [];
  for (const v of [0, 1] as const) {
    result.push(
      ...after<Condition>(
        s,
        i,
        String(v),
        (j) => [{ done: true, end: j, value: eq(signal, v) }],
        () => eq(signal, v),
      ),
    );
  }
  result.push(
    ...after<Condition>(
      s,
      i,
      "above ",
      (j) =>
        bind(
          integer(s, j, 0, 1022),
          (n, e) => [{ done: true, end: e, value: { op: "above", signal, value: n } as Condition }],
          (n) => ({ op: "above", signal, value: n }),
        ),
      () => ({ op: "above", signal, value: 0 }),
    ),
  );
  result.push(
    ...after<Condition>(
      s,
      i,
      "below ",
      (j) =>
        bind(
          integer(s, j, 1, 1023),
          (n, e) => [{ done: true, end: e, value: { op: "below", signal, value: n } as Condition }],
          (n) => ({ op: "below", signal, value: n }),
        ),
      () => ({ op: "below", signal, value: 1 }),
    ),
  );
  return result;
}

function leaf(s: string, i: number): Out<Condition>[] {
  let j = i;
  while (j < s.length && /[A-Za-z0-9_]/.test(s[j] as string)) j++;
  const token = s.slice(i, j);
  if (j === s.length) {
    const name = extendSignal(token);
    return name === null ? [] : [{ done: false, value: eq(name, 0) }];
  }
  if (!validSignal(token)) return [];
  return after<Condition>(
    s,
    j,
    " is ",
    (k) => leafValue(s, k, token),
    () => eq(token, 0),
  );
}

/** Members of an all/any list after "(": at least 2, at most 8, closed by ")". */
function members(s: string, i: number, budget: number, acc: Condition[]): Out<Condition[]>[] {
  return bind<Condition, Condition[]>(
    condition(s, i, budget),
    (c, e) => {
      const next = [...acc, c];
      const result: Out<Condition[]>[] = [];
      if (next.length < 8) {
        result.push(
          ...after<Condition[]>(
            s,
            e,
            ", ",
            (j) => members(s, j, budget, next),
            () => [...next, FILL_COND],
          ),
        );
      }
      if (next.length >= 2) {
        result.push(
          ...after<Condition[]>(
            s,
            e,
            ")",
            (j) => [{ done: true, end: j, value: next }],
            () => next,
          ),
        );
      }
      return result;
    },
    (c) => {
      const next = [...acc, c];
      while (next.length < 2) next.push(FILL_COND);
      return next;
    },
  );
}

/** A Condition with nesting budget `budget` (a leaf costs 1; all/any need at least 2). */
function condition(s: string, i: number, budget: number): Out<Condition>[] {
  const result: Out<Condition>[] = [];
  if (budget >= 2) {
    for (const op of ["all", "any"] as const) {
      result.push(
        ...after<Condition>(
          s,
          i,
          `${op} of (`,
          (j) =>
            bind<Condition[], Condition>(
              members(s, j, budget - 1, []),
              (list, e) => [{ done: true, end: e, value: { op, of: list } }],
              (list) => ({ op, of: list }),
            ),
          () => ({ op, of: [FILL_COND, FILL_COND] }),
        ),
      );
    }
  }
  result.push(...leaf(s, i));
  return result;
}

const MAX_DEPTH = 4;

function edge(s: string, i: number): Out<Edge>[] {
  return bind<Condition, Edge>(
    condition(s, i, MAX_DEPTH),
    (c, e) =>
      after<Edge>(
        s,
        e,
        " becomes ",
        (j) => [
          ...after<Edge>(
            s,
            j,
            "true",
            (k) => [{ done: true, end: k, value: { op: "rise", of: c } }],
            () => ({ op: "rise", of: c }),
          ),
          ...after<Edge>(
            s,
            j,
            "false",
            (k) => [{ done: true, end: k, value: { op: "fall", of: c } }],
            () => ({ op: "fall", of: c }),
          ),
        ],
        () => ({ op: "rise", of: c }),
      ),
    (c) => ({ op: "rise", of: c }),
  );
}

// ---------------------------------------------------------------------------
// Sentences

const FILL_EDGE: Edge = { op: "rise", of: FILL_COND };

function sentences(s: string): Out<Rule>[] {
  const result: Out<Rule>[] = [];
  const finish = (text: string, rule: Rule) => (e: number): Out<Rule>[] =>
    after<Rule>(
      s,
      e,
      text,
      (j) => [{ done: true, end: j, value: rule }],
      () => rule,
    );

  // Within d ms after E, C must be true.
  result.push(
    ...after<Rule>(
      s,
      0,
      "Within ",
      (i) =>
        bind<number, Rule>(
          duration(s, i),
          (d, e1) =>
            after<Rule>(
              s,
              e1,
              " ms after ",
              (i2) =>
                bind<Edge, Rule>(
                  edge(s, i2),
                  (ed, e2) =>
                    after<Rule>(
                      s,
                      e2,
                      ", ",
                      (i3) =>
                        bind<Condition, Rule>(
                          condition(s, i3, MAX_DEPTH),
                          (c, e3) =>
                            finish(" must be true.", {
                              form: "respond",
                              trigger: ed,
                              withinMs: d,
                              expect: c,
                            })(e3),
                          (c) => ({ form: "respond", trigger: ed, withinMs: d, expect: c }),
                        ),
                      () => ({ form: "respond", trigger: ed, withinMs: d, expect: FILL_COND }),
                    ),
                  (ed) => ({ form: "respond", trigger: ed, withinMs: d, expect: FILL_COND }),
                ),
              () => ({ form: "respond", trigger: FILL_EDGE, withinMs: d, expect: FILL_COND }),
            ),
          (d) => ({ form: "respond", trigger: FILL_EDGE, withinMs: d, expect: FILL_COND }),
        ),
      () => ({ form: "respond", trigger: FILL_EDGE, withinMs: FILL_DURATION, expect: FILL_COND }),
    ),
  );

  // After E, C must stay true for d ms.
  result.push(
    ...after<Rule>(
      s,
      0,
      "After ",
      (i) =>
        bind<Edge, Rule>(
          edge(s, i),
          (ed, e1) =>
            after<Rule>(
              s,
              e1,
              ", ",
              (i2) =>
                bind<Condition, Rule>(
                  condition(s, i2, MAX_DEPTH),
                  (c, e2) =>
                    after<Rule>(
                      s,
                      e2,
                      " must stay true for ",
                      (i3) =>
                        bind<number, Rule>(
                          duration(s, i3),
                          (d, e3) =>
                            finish(" ms.", { form: "hold", after: ed, durationMs: d, expect: c })(e3),
                          (d) => ({ form: "hold", after: ed, durationMs: d, expect: c }),
                        ),
                      () => ({ form: "hold", after: ed, durationMs: FILL_DURATION, expect: c }),
                    ),
                  (c) => ({ form: "hold", after: ed, durationMs: FILL_DURATION, expect: c }),
                ),
              () => ({ form: "hold", after: ed, durationMs: FILL_DURATION, expect: FILL_COND }),
            ),
          (ed) => ({ form: "hold", after: ed, durationMs: FILL_DURATION, expect: FILL_COND }),
        ),
      () => ({ form: "hold", after: FILL_EDGE, durationMs: FILL_DURATION, expect: FILL_COND }),
    ),
  );

  // C must never happen.  |  C must never last d ms or longer.
  result.push(
    ...bind<Condition, Rule>(
      condition(s, 0, MAX_DEPTH),
      (c, e1) =>
        after<Rule>(
          s,
          e1,
          " must never ",
          (i) => [
            ...finish("happen.", { form: "never", condition: c })(i),
            ...after<Rule>(
              s,
              i,
              "last ",
              (i2) =>
                bind<number, Rule>(
                  duration(s, i2),
                  (d, e2) =>
                    finish(" ms or longer.", { form: "notLongerThan", condition: c, ms: d })(e2),
                  (d) => ({ form: "notLongerThan", condition: c, ms: d }),
                ),
              () => ({ form: "notLongerThan", condition: c, ms: FILL_DURATION }),
            ),
          ],
          () => ({ form: "never", condition: c }),
        ),
      (c) => ({ form: "never", condition: c }),
    ),
  );

  // E may happen at most k time|times in any d ms.
  result.push(
    ...bind<Edge, Rule>(
      edge(s, 0),
      (ed, e1) =>
        after<Rule>(
          s,
          e1,
          " may happen at most ",
          (i) =>
            bind<number, Rule>(
              integer(s, i, 0, 65_535),
              (k, e2) =>
                after<Rule>(
                  s,
                  e2,
                  ` ${k === 1 ? "time" : "times"} in any `,
                  (i2) =>
                    bind<number, Rule>(
                      duration(s, i2),
                      (d, e3) =>
                        finish(" ms.", { form: "count", edge: ed, windowMs: d, max: k })(e3),
                      (d) => ({ form: "count", edge: ed, windowMs: d, max: k }),
                    ),
                  () => ({ form: "count", edge: ed, windowMs: FILL_DURATION, max: k }),
                ),
              (k) => ({ form: "count", edge: ed, windowMs: FILL_DURATION, max: k }),
            ),
          () => ({ form: "count", edge: ed, windowMs: FILL_DURATION, max: 0 }),
        ),
      (ed) => ({ form: "count", edge: ed, windowMs: FILL_DURATION, max: 0 }),
    ),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Public answers

/**
 * Is `prefix` the start of some Canonical_Sentence? When it is, the verdict carries a
 * witness Rule built by filling every missing part with a fixed valid value.
 */
export function oraclePrefix(prefix: string): OracleVerdict {
  let partial: Rule | null = null;
  for (const o of sentences(prefix)) {
    if (o.done) {
      if (o.end === prefix.length) return verdict(o.value, true);
    } else if (partial === null) {
      partial = o.value;
    }
  }
  return partial === null ? { viable: false } : verdict(partial, false);
}

function verdict(witness: Rule, complete: boolean): OracleVerdict {
  const r = render(witness);
  return { viable: true, witness, sentence: r.ok ? r.sentence : null, complete };
}

/** Is `ch` an allowed next character after `prefix`? */
export function oracleAllowsChar(prefix: string, ch: string): OracleVerdict {
  return oraclePrefix(prefix + ch);
}

/** Is the end of the text allowed after `prefix`, that is, is `prefix` a whole sentence? */
export function oracleAllowsEnd(prefix: string): boolean {
  const v = oraclePrefix(prefix);
  return v.viable && v.complete;
}
