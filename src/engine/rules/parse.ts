// Sentence_Parser: turns one Canonical_Sentence into a Rule. Pure.
//
// Method (design D2): a character-level matcher keeps a list of live states over the fixed
// grammar. Every live state can still be completed into the Canonical_Sentence of a valid
// Rule, so the position P of a rejection is the number of characters read while a state was
// live. A Rule is returned only when the Renderer gives back the input text (design D3).
// No trimming, case folding or other normalization happens anywhere.

import { MAX_MEMBERS, MIN_MEMBERS, isSignalName } from "./ir";
import type { Condition, Edge, Rule } from "./ir";
import { render } from "./render";
import { cutReason } from "./reason";

/** One named item of a parser Reason: an inclusive character range, or the end of the text. */
export type AllowedItem = { from: string; to: string } | { end: true };

export type ParseResult =
  | { ok: true; rule: Rule }
  | { ok: false; reason: string; position: number; allowed: AllowedItem[] };

const MAX_NAMED_ITEMS = 6;
const MAX_SIGNAL_LENGTH = 32;
const MAX_DEPTH = 4;
const MAX_INTEGER_DIGITS = 7;
const MAX_FRACTION_DIGITS = 7;

// ---------- Grammar symbols and states ----------

type FormName = "never" | "nlt" | "respond" | "hold";

type Ev =
  | { t: "sig"; name: string }
  | { t: "eq"; v: 0 | 1 }
  | { t: "above" }
  | { t: "below" }
  | { t: "num"; v: number }
  | { t: "dur"; v: number }
  | { t: "open"; op: "all" | "any" }
  | { t: "close" }
  | { t: "edge"; op: "rise" | "fall" }
  | { t: "form"; f: FormName };

type Sym =
  | { k: "lit"; s: string }
  | { k: "emit"; ev: Ev }
  | { k: "alt"; opts: Sym[][] }
  | { k: "cond"; h: number }
  | { k: "list"; m: number; n: number }
  | { k: "sig0" }
  | { k: "sig"; name: string }
  | { k: "num"; lo: number; hi: number; d: string; count: boolean }
  | { k: "dur"; i: string; dot: boolean; f: string };

type L<T> = { head: T; tail: L<T> } | null;

interface State {
  stack: L<Sym>;
  ev: L<Ev>;
}

function cons<T>(head: T, tail: L<T>): L<T> {
  return { head, tail };
}

/** Pushes `syms` so that syms[0] is the top of the stack. */
function pushAll(stack: L<Sym>, syms: readonly Sym[]): L<Sym> {
  let out = stack;
  for (let i = syms.length - 1; i >= 0; i--) out = cons(syms[i] as Sym, out);
  return out;
}

const lit = (s: string): Sym => ({ k: "lit", s });
const emit = (ev: Ev): Sym => ({ k: "emit", ev });
const cond = (h: number): Sym => ({ k: "cond", h });
const num = (lo: number, hi: number, count = false): Sym => ({ k: "num", lo, hi, d: "", count });
const dur = (): Sym => ({ k: "dur", i: "", dot: false, f: "" });

const EDGE: Sym = {
  k: "alt",
  opts: [
    [lit("true"), emit({ t: "edge", op: "rise" })],
    [lit("false"), emit({ t: "edge", op: "fall" })],
  ],
};

const SENTENCE: Sym = {
  k: "alt",
  opts: [
    [cond(MAX_DEPTH), emit({ t: "form", f: "never" }), lit(" must never happen.")],
    [cond(MAX_DEPTH), emit({ t: "form", f: "nlt" }), lit(" must never last "), dur(), lit(" ms or longer.")],
    [
      cond(MAX_DEPTH),
      lit(" becomes "),
      EDGE,
      lit(" may happen at most "),
      num(0, 65_535, true),
      dur(),
      lit(" ms."),
    ],
    [
      emit({ t: "form", f: "respond" }),
      lit("Within "),
      dur(),
      lit(" ms after "),
      cond(MAX_DEPTH),
      lit(" becomes "),
      EDGE,
      lit(", "),
      cond(MAX_DEPTH),
      lit(" must be true."),
    ],
    [
      emit({ t: "form", f: "hold" }),
      lit("After "),
      cond(MAX_DEPTH),
      lit(" becomes "),
      EDGE,
      lit(", "),
      cond(MAX_DEPTH),
      lit(" must stay true for "),
      dur(),
      lit(" ms."),
    ],
  ],
};

function condOptions(h: number): Sym[][] {
  const opts: Sym[][] = [
    [{ k: "sig0" }, lit("is "), { k: "alt", opts: [
      [lit("0"), emit({ t: "eq", v: 0 })],
      [lit("1"), emit({ t: "eq", v: 1 })],
      [lit("above "), emit({ t: "above" }), num(0, 1022)],
      [lit("below "), emit({ t: "below" }), num(1, 1023)],
    ] }],
  ];
  if (h >= 2) {
    for (const op of ["all", "any"] as const) {
      opts.push([lit(`${op} of (`), emit({ t: "open", op }), cond(h - 1), { k: "list", m: h - 1, n: 1 }]);
    }
  }
  return opts;
}

function listOptions(m: number, n: number): Sym[][] {
  const opts: Sym[][] = [];
  if (n < MAX_MEMBERS) opts.push([lit(", "), cond(m), { k: "list", m, n: n + 1 }]);
  if (n >= MIN_MEMBERS) opts.push([lit(")"), emit({ t: "close" })]);
  return opts;
}

// ---------- Token completeness ----------

function numComplete(s: Extract<Sym, { k: "num" }>): boolean {
  if (s.d === "") return false;
  const v = Number(s.d);
  return v >= s.lo && v <= s.hi;
}

function durComplete(s: Extract<Sym, { k: "dur" }>): boolean {
  if (s.dot) return s.f !== "" && s.f[s.f.length - 1] !== "0";
  return s.i !== "" && s.i !== "0";
}

function durValue(s: Extract<Sym, { k: "dur" }>): number {
  return Number(s.dot ? `${s.i}.${s.f}` : s.i);
}

/** True when some extension of a partial signal name is a valid Signal_Name of 32 units or fewer. */
function nameCanComplete(name: string): boolean {
  const valid = (text: string): boolean => isSignalName(text);
  if (valid(name)) return true;
  for (const c of ["x", "0", "_"]) {
    let n: string = name;
    while (n.length < MAX_SIGNAL_LENGTH) {
      n += c;
      if (valid(n)) return true;
    }
  }
  return false;
}

// ---------- Expansion and stepping ----------

/** Resolves zero-width symbols and choices until each state's top symbol consumes a character, or the stack is empty. */
function expand(state: State, out: State[]): void {
  const top = state.stack;
  if (top === null) {
    out.push(state);
    return;
  }
  const s = top.head;
  switch (s.k) {
    case "emit":
      expand({ stack: top.tail, ev: cons(s.ev, state.ev) }, out);
      return;
    case "alt":
      for (const opt of s.opts) expand({ stack: pushAll(top.tail, opt), ev: state.ev }, out);
      return;
    case "cond":
      for (const opt of condOptions(s.h)) expand({ stack: pushAll(top.tail, opt), ev: state.ev }, out);
      return;
    case "list":
      for (const opt of listOptions(s.m, s.n)) expand({ stack: pushAll(top.tail, opt), ev: state.ev }, out);
      return;
    case "num":
      if (numComplete(s)) {
        const v = Number(s.d);
        const rest = s.count ? cons(lit(v === 1 ? " time in any " : " times in any "), top.tail) : top.tail;
        expand({ stack: rest, ev: cons({ t: "num", v }, state.ev) }, out);
      }
      out.push(state);
      return;
    case "dur":
      if (durComplete(s)) {
        expand({ stack: top.tail, ev: cons({ t: "dur", v: durValue(s) }, state.ev) }, out);
      }
      out.push(state);
      return;
    default:
      out.push(state);
  }
}

function isDigit(ch: string): boolean {
  return ch.length === 1 && ch >= "0" && ch <= "9";
}

/** One character on one state; the results still need `expand`. */
function step(state: State, ch: string): State[] {
  const top = state.stack;
  if (top === null) return [];
  const s = top.head;
  switch (s.k) {
    case "lit": {
      if (s.s[0] !== ch) return [];
      const rest = s.s.slice(1);
      return [{ stack: rest === "" ? top.tail : cons(lit(rest), top.tail), ev: state.ev }];
    }
    case "sig0": {
      if (!/^[A-Za-z]$/.test(ch) || !nameCanComplete(ch)) return [];
      return [{ stack: cons({ k: "sig", name: ch }, top.tail), ev: state.ev }];
    }
    case "sig": {
      if (ch === " ") {
        if (!isSignalName(s.name)) return [];
        return [{ stack: top.tail, ev: cons({ t: "sig", name: s.name }, state.ev) }];
      }
      if (!/^[A-Za-z0-9_]$/.test(ch) || s.name.length >= MAX_SIGNAL_LENGTH) return [];
      const name = s.name + ch;
      if (!nameCanComplete(name)) return [];
      return [{ stack: cons({ k: "sig", name }, top.tail), ev: state.ev }];
    }
    case "num": {
      if (!isDigit(ch) || s.d === "0") return [];
      const d = s.d + ch;
      const viable = d === "0" ? s.lo === 0 : Number(d) <= s.hi;
      if (!viable) return [];
      return [{ stack: cons({ ...s, d }, top.tail), ev: state.ev }];
    }
    case "dur": {
      if (isDigit(ch)) {
        if (!s.dot) {
          if (s.i === "") return [{ stack: cons({ ...s, i: ch }, top.tail), ev: state.ev }];
          if (s.i === "0" || s.i.length >= MAX_INTEGER_DIGITS) return [];
          return [{ stack: cons({ ...s, i: s.i + ch }, top.tail), ev: state.ev }];
        }
        if (s.f.length >= MAX_FRACTION_DIGITS) return [];
        if (s.f.length + 1 === MAX_FRACTION_DIGITS && ch === "0") return [];
        return [{ stack: cons({ ...s, f: s.f + ch }, top.tail), ev: state.ev }];
      }
      if (ch === "." && !s.dot && s.i !== "") {
        return [{ stack: cons({ ...s, dot: true }, top.tail), ev: state.ev }];
      }
      return [];
    }
    default:
      return [];
  }
}

function stepAll(live: readonly State[], ch: string): State[] {
  const out: State[] = [];
  for (const st of live) for (const next of step(st, ch)) expand(next, out);
  return out;
}

function initialStates(): State[] {
  const out: State[] = [];
  expand({ stack: cons(SENTENCE, null), ev: null }, out);
  return out;
}

const isComplete = (st: State): boolean => st.stack === null;

// ---------- Building the Rule from the recorded events ----------

function evList(list: L<Ev>): Ev[] {
  const out: Ev[] = [];
  for (let p = list; p !== null; p = p.tail) out.push(p.head);
  return out.reverse();
}

class Builder {
  private pos = 0;
  constructor(private readonly evs: readonly Ev[]) {}

  private next(): Ev {
    const e = this.evs[this.pos++];
    if (e === undefined) throw new Error("event list ended early");
    return e;
  }

  private peek(): Ev | undefined {
    return this.evs[this.pos];
  }

  private expectT<K extends Ev["t"]>(t: K): Extract<Ev, { t: K }> {
    const e = this.next();
    if (e.t !== t) throw new Error("unexpected event");
    return e as Extract<Ev, { t: K }>;
  }

  done(): boolean {
    return this.pos === this.evs.length;
  }

  condition(): Condition {
    const e = this.next();
    if (e.t === "open") {
      const of: Condition[] = [];
      while (this.peek()?.t !== "close") of.push(this.condition());
      this.next();
      return { op: e.op, of };
    }
    if (e.t !== "sig") throw new Error("unexpected event");
    const k = this.next();
    if (k.t === "eq") return { op: "eq", signal: e.name, value: k.v };
    if (k.t === "above" || k.t === "below") {
      return { op: k.t, signal: e.name, value: this.expectT("num").v };
    }
    throw new Error("unexpected event");
  }

  edgeAfter(c: Condition): Edge {
    return { op: this.expectT("edge").op, of: c };
  }

  rule(): Rule {
    const first = this.peek();
    if (first?.t === "form") {
      this.next();
      if (first.f === "respond") {
        const withinMs = this.expectT("dur").v;
        const trigger = this.edgeAfter(this.condition());
        return { form: "respond", trigger, withinMs, expect: this.condition() };
      }
      if (first.f === "hold") {
        const after = this.edgeAfter(this.condition());
        const expect = this.condition();
        return { form: "hold", after, durationMs: this.expectT("dur").v, expect };
      }
      throw new Error("unexpected event");
    }
    const c = this.condition();
    const e = this.next();
    if (e.t === "edge") {
      const max = this.expectT("num").v;
      return { form: "count", edge: { op: e.op, of: c }, windowMs: this.expectT("dur").v, max };
    }
    if (e.t === "form" && e.f === "never") return { form: "never", condition: c };
    if (e.t === "form" && e.f === "nlt") {
      return { form: "notLongerThan", condition: c, ms: this.expectT("dur").v };
    }
    throw new Error("unexpected event");
  }
}

function buildRule(st: State): Rule | null {
  try {
    const b = new Builder(evList(st.ev));
    const rule = b.rule();
    return b.done() ? rule : null;
  } catch {
    return null;
  }
}

// ---------- Allowed items and Reason text ----------

function printableAscii(): string[] {
  const out: string[] = [];
  for (let c = 0x20; c <= 0x7e; c++) out.push(String.fromCharCode(c));
  return out;
}

const PRINTABLE = printableAscii();

function allowedFrom(live: readonly State[]): { chars: string[]; end: boolean } {
  const chars = PRINTABLE.filter((ch) => stepAll(live, ch).length > 0);
  return { chars, end: live.some(isComplete) };
}

function toItems(chars: readonly string[], end: boolean): AllowedItem[] {
  const items: AllowedItem[] = [];
  let from = "";
  let to = "";
  for (const ch of chars) {
    if (from !== "" && ch.charCodeAt(0) === to.charCodeAt(0) + 1) {
      to = ch;
      continue;
    }
    if (from !== "") items.push({ from, to });
    from = ch;
    to = ch;
  }
  if (from !== "") items.push({ from, to });
  if (end) items.push({ end: true });
  return items.slice(0, MAX_NAMED_ITEMS);
}

function charText(ch: string): string {
  return ch === " " ? "a space" : `"${ch}"`;
}

function itemText(item: AllowedItem): string {
  if ("end" in item) return "the end of the text";
  return item.from === item.to ? charText(item.from) : `${charText(item.from)} to ${charText(item.to)}`;
}

function reject(position: number, live: readonly State[]): ParseResult {
  const { chars, end } = allowedFrom(live);
  const allowed = toItems(chars, end);
  const named = allowed.length > 0 ? allowed.map(itemText).join(", ") : "the end of the text";
  const reason = cutReason(
    `No rule template matches at position ${position} (counting from 0); allowed there: ${named}.`,
  );
  return { ok: false, reason, position, allowed: allowed.length > 0 ? allowed : [{ end: true }] };
}

// ---------- Public functions ----------

/** Parses one Canonical_Sentence. Never throws. */
export function parse(sentence: string): ParseResult {
  try {
    let live = initialStates();
    for (let i = 0; i < sentence.length; i++) {
      const next = stepAll(live, sentence[i] as string);
      if (next.length === 0) return reject(i, live);
      live = next;
    }
    for (const st of live) {
      if (!isComplete(st)) continue;
      const rule = buildRule(st);
      if (rule === null) continue;
      const rendered = render(rule);
      if (rendered.ok && rendered.sentence === sentence) return { ok: true, rule };
    }
    return reject(sentence.length, live);
  } catch {
    return {
      ok: false,
      reason: "No rule template matches at position 0 (counting from 0); allowed there: the end of the text.",
      position: 0,
      allowed: [{ end: true }],
    };
  }
}

/**
 * Every printable ASCII character, and whether the end of the text, is allowed after the
 * prefix; null when the prefix is not the start of any Canonical_Sentence.
 */
export function allowedAt(prefix: string): { chars: string[]; end: boolean } | null {
  let live = initialStates();
  for (let i = 0; i < prefix.length; i++) {
    live = stepAll(live, prefix[i] as string);
    if (live.length === 0) return null;
  }
  return allowedFrom(live);
}
