// Test helpers for the trace-reducer properties: generators, Synthetic_Oracles, recorders and
// test-side reference models written from the glossary and the design text.
// No wall clock and no random source: all variation comes from fast-check with fixed seeds.

import fc from "fast-check";
import { BANNED_WORDS } from "../copy-rules";
import { render } from "../rules/render";
import type { Rule } from "../rules/ir";
import type { Fixture, FixturePin, InputValue, OutputEvent } from "../types";
import type { Oracle, OracleOutcome, ProgressReport, ReducerEvent, ReducerHandle, ReducerError, StepReport } from "../reducer/types";

export const UNLIMITED = 9007199254740991;
export const OTHER_RULE = "Some other rule must never happen.";

// ---------------------------------------------------------------------------
// Fixtures and event lists

export interface Case {
  fixture: Fixture;
  original: ReducerEvent[];
  sentence: string;
  oracleSpec: OracleSpec;
  budget: number;
}

export const arbDigitalPin = (i: number): fc.Arbitrary<FixturePin> =>
  fc
    .record({
      activeLevel: fc.constantFrom<"low" | "high" | undefined>(undefined, "low", "high"),
      restState: fc.constantFrom<"released" | "active" | undefined>(undefined, "released", "active"),
    })
    .map(({ activeLevel, restState }) => {
      const p: Record<string, unknown> = { signal: `D${i}`, port: "D", bit: 2 + i, direction: "input" };
      if (activeLevel !== undefined) p.activeLevel = activeLevel;
      if (restState !== undefined) p.restState = restState;
      return p as unknown as FixturePin;
    });

export const arbAnalogPin = (i: number): fc.Arbitrary<FixturePin> =>
  fc.option(fc.integer({ min: 0, max: 1023 }), { nil: undefined }).map((restLevel) => {
    const p: Record<string, unknown> = { signal: `A${i}`, kind: "analog", channel: i };
    if (restLevel !== undefined) p.restLevel = restLevel;
    return p as unknown as FixturePin;
  });

/** 1 to 4 inputs (D0 always digital, A0 analog when present) plus the output OUT. */
export const arbFixture: fc.Arbitrary<Fixture> = fc
  .record({ nd: fc.integer({ min: 1, max: 3 }), na: fc.integer({ min: 0, max: 2 }) })
  .filter(({ nd, na }) => nd + na <= 4)
  .chain(({ nd, na }) =>
    fc
      .tuple(
        fc.tuple(...Array.from({ length: nd }, (_, i) => arbDigitalPin(i))),
        na === 0 ? fc.constant([] as FixturePin[]) : fc.tuple(...Array.from({ length: na }, (_, i) => arbAnalogPin(i))),
      )
      .map(([d, a]) => ({
        pins: [...d, ...a, { signal: "OUT", port: "B", bit: 0, direction: "output" } as FixturePin],
      })),
  );

export function inputPins(f: Fixture): FixturePin[] {
  return f.pins.filter((p) => (p as { kind?: string }).kind === "analog" || (p as { direction?: string }).direction === "input");
}

export function isAnalogPinT(p: FixturePin): boolean {
  return (p as { kind?: string }).kind === "analog";
}

export function restLevelOf(p: FixturePin): number {
  const r = (p as { restLevel?: number }).restLevel;
  return typeof r === "number" ? r : 512;
}

export function pressOf(p: FixturePin): 0 | 1 {
  return (p as { activeLevel?: string }).activeLevel === "high" ? 1 : 0;
}

/** Rest_Events at cycle 0 for each digital input with restState "active", in Fixture order (fact F5). */
export function restEvents(f: Fixture): ReducerEvent[] {
  const out: ReducerEvent[] = [];
  for (const p of f.pins) {
    if (isAnalogPinT(p) || (p as { direction?: string }).direction !== "input") continue;
    if ((p as { restState?: string }).restState !== "active") continue;
    out.push({ signal: p.signal, value: pressOf(p), cycle: 0, gremlinId: "rest" });
  }
  return out;
}

function arbValueFor(p: FixturePin): fc.Arbitrary<{ value: InputValue } | { analog: number }> {
  if (isAnalogPinT(p)) {
    const rest = restLevelOf(p);
    return fc
      .oneof(
        fc.constantFrom(0, 512, 1023, rest),
        fc.constantFrom(1, 255, 256, 767, 768, 1022),
        fc.integer({ min: 0, max: 1023 }),
      )
      .map((analog) => ({ analog }));
  }
  return fc.constantFrom<InputValue>(0, 1, "release").map((value) => ({ value }));
}

function sortByCycle(evs: ReducerEvent[]): ReducerEvent[] {
  return evs.map((e, i) => ({ e, i })).sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i).map((x) => x.e);
}

/** Random gremlin events, 0 to 40, on the inputs of the fixture, sorted by cycle. */
export function arbRandomList(f: Fixture): fc.Arbitrary<ReducerEvent[]> {
  const pins = inputPins(f);
  const one = fc
    .record({
      pin: fc.integer({ min: 0, max: pins.length - 1 }),
      cycle: fc.integer({ min: 0, max: 2_000_000 }),
      gremlinId: fc.constantFrom("g0", "g1", "g2"),
    })
    .chain((r) =>
      arbValueFor(pins[r.pin]).map((v) => ({ signal: pins[r.pin].signal, cycle: r.cycle, gremlinId: r.gremlinId, ...v }) as ReducerEvent),
    );
  const count = fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 40 }));
  return count.chain((n) => fc.array(one, { minLength: n, maxLength: n })).map((evs) => [...restEvents(f), ...sortByCycle(evs)]);
}

// ---------------------------------------------------------------------------
// Synthetic_Oracle

export interface RequiredKey {
  cycle: number;
  signal: string;
  gremlinId: string;
  /** Inclusive analog band, for analog keys. */
  band?: [number, number];
}

export interface OracleSpec {
  required: RequiredKey[];
  /** The count of events of this pair keeps the parity it has in the original list. */
  parity: { signal: string; gremlinId: string; parity: number } | null;
  /** Answer breaks of another rule when the required part fails and the candidate holds at most m gremlin events. */
  other: number | null;
  /** The Violation cycle: a fixed integer, or the highest cycle of the matched required events. */
  cycleRule: { fixed: number } | "max";
}

export function keyOf(e: ReducerEvent): string {
  return JSON.stringify([e.cycle, e.signal, e.gremlinId]);
}

function analogOf(e: ReducerEvent): number | undefined {
  return Object.prototype.hasOwnProperty.call(e, "analog") ? (e as { analog: number }).analog : undefined;
}

/** A pure function of the candidate's contents. */
export function makeSyntheticOracle(spec: OracleSpec, sentence: string): Oracle {
  return (candidate: ReducerEvent[]): OracleOutcome => {
    let maxCycle = 0;
    let ok = true;
    for (const k of spec.required) {
      const m = candidate.find(
        (e) =>
          e.cycle === k.cycle &&
          e.signal === k.signal &&
          e.gremlinId === k.gremlinId &&
          (k.band === undefined || ((analogOf(e) as number) >= k.band[0] && (analogOf(e) as number) <= k.band[1])),
      );
      if (m === undefined) {
        ok = false;
        break;
      }
      if (m.cycle > maxCycle) maxCycle = m.cycle;
    }
    if (ok && spec.parity !== null) {
      const p = spec.parity;
      const n = candidate.filter((e) => e.signal === p.signal && e.gremlinId === p.gremlinId).length;
      if (n % 2 !== p.parity) ok = false;
    }
    const cycle = spec.cycleRule === "max" ? maxCycle : spec.cycleRule.fixed;
    if (ok) return { kind: "breaks", violation: { rule: sentence, cycle } };
    if (spec.other !== null && candidate.filter((e) => e.gremlinId !== "rest").length <= spec.other) {
      return { kind: "breaks", violation: { rule: OTHER_RULE, cycle } };
    }
    return { kind: "does-not" };
  };
}

function arbSpecFor(list: ReducerEvent[], f: Fixture): fc.Arbitrary<OracleSpec> {
  const gremlins = list.filter((e) => e.gremlinId !== "rest");
  const pins = new Map(f.pins.map((p) => [p.signal, p] as const));
  const req =
    gremlins.length === 0
      ? fc.constant([] as RequiredKey[])
      : fc.subarray(gremlins, { minLength: 0, maxLength: Math.min(gremlins.length, 6) }).chain((sel) =>
          fc.tuple(
            ...sel.map((e) => {
              const a = analogOf(e);
              if (a === undefined) return fc.constant<RequiredKey>({ cycle: e.cycle, signal: e.signal, gremlinId: e.gremlinId });
              return fc
                .tuple(fc.integer({ min: 0, max: a }), fc.integer({ min: a, max: 1023 }))
                .map(([lo, hi]) => ({ cycle: e.cycle, signal: e.signal, gremlinId: e.gremlinId, band: [lo, hi] as [number, number] }));
            }),
          ),
        );
  const par =
    gremlins.length === 0
      ? fc.constant(null)
      : fc.option(
          fc.constantFrom(...gremlins).map((e) => {
            const n = list.filter((x) => x.signal === e.signal && x.gremlinId === e.gremlinId).length;
            return { signal: e.signal, gremlinId: e.gremlinId, parity: n % 2 };
          }),
          { nil: null },
        );
  void pins;
  return fc.record({
    required: req as fc.Arbitrary<RequiredKey[]>,
    parity: par,
    other: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    cycleRule: fc.oneof(fc.constant<"max">("max"), fc.integer({ min: 0, max: 3_000_000 }).map((fixed) => ({ fixed }))),
  });
}

export const arbBudget: fc.Arbitrary<number> = fc.oneof(fc.integer({ min: 1, max: 300 }), fc.constant(UNLIMITED));

const SENTENCE = "OUT is 1 must never happen.";

/** Random case. */
const arbRandomCase: fc.Arbitrary<Case> = arbFixture.chain((fixture) =>
  arbRandomList(fixture).chain((original) =>
    fc.record({
      fixture: fc.constant(fixture),
      original: fc.constant(original),
      sentence: fc.constant(SENTENCE),
      oracleSpec: arbSpecFor(original, fixture),
      budget: arbBudget,
    }),
  ),
);

/** Fixture for the structured families: D0 (low, released), D1, A0. */
const FAMILY_FIXTURE: Fixture = {
  pins: [
    { signal: "D0", port: "D", bit: 2, direction: "input" },
    { signal: "D1", port: "D", bit: 3, direction: "input", activeLevel: "high" },
    { signal: "A0", kind: "analog", channel: 0 },
    { signal: "OUT", port: "B", bit: 0, direction: "output" },
  ],
};

/** A Burst of odd length k of g0 on D0, interleaved with required g1 events on D1. */
function arbBurstFamily(alternate: boolean): fc.Arbitrary<Case> {
  return fc
    .record({
      k: fc.integer({ min: 1, max: 4 }).map((h) => 2 * h + 1),
      v: fc.constantFrom<InputValue>(0, 1),
      gap: fc.integer({ min: 1_000, max: 50_000 }),
      budget: arbBudget,
    })
    .map(({ k, v, gap, budget }) => {
      const original: ReducerEvent[] = [];
      const required: RequiredKey[] = [];
      let c = 10_000;
      for (let i = 0; i < k; i++) {
        const value: InputValue = alternate ? (i % 2 === 0 ? v : "release") : v;
        original.push({ signal: "D0", value, cycle: c, gremlinId: "g0" });
        c += gap;
        if (i < k - 1) {
          original.push({ signal: "D1", value: i % 2 === 0 ? 1 : "release", cycle: c, gremlinId: "g1" });
          required.push({ cycle: c, signal: "D1", gremlinId: "g1" });
          c += gap;
        }
      }
      // D1 events alternate 1 and release, so none of them is a No_Change_Event.
      return {
        fixture: FAMILY_FIXTURE,
        original,
        sentence: SENTENCE,
        oracleSpec: { required, parity: { signal: "D0", gremlinId: "g0", parity: k % 2 }, other: null, cycleRule: "max" as const },
        budget,
      };
    });
}

/** Required analog events on A0 with values other than 0, 512, 1023; half the bands hold the Snap_Value. */
const arbAnalogFamily: fc.Arbitrary<Case> = fc
  .record({
    vals: fc.array(fc.integer({ min: 1, max: 1022 }).filter((x) => x !== 512), { minLength: 1, maxLength: 4 }),
    wide: fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
    budget: arbBudget,
  })
  .map(({ vals, wide, budget }) => {
    const original: ReducerEvent[] = vals.map((analog, i) => ({ signal: "A0", analog, cycle: 1000 * (i + 1), gremlinId: "g2" }));
    const required: RequiredKey[] = vals.map((a, i) => {
      const s = a <= 255 ? 0 : a <= 767 ? 512 : 1023;
      const band: [number, number] = wide[i] ? [Math.min(a, s), Math.max(a, s)] : [a, a];
      return { cycle: 1000 * (i + 1), signal: "A0", gremlinId: "g2", band };
    });
    return { fixture: FAMILY_FIXTURE, original, sentence: SENTENCE, oracleSpec: { required, parity: null, other: null, cycleRule: "max" as const }, budget };
  });

export const arbCase: fc.Arbitrary<Case> = fc.oneof(
  { weight: 5, arbitrary: arbRandomCase },
  { weight: 1, arbitrary: arbBurstFamily(false) },
  { weight: 1, arbitrary: arbBurstFamily(true) },
  { weight: 1, arbitrary: arbAnalogFamily },
);

export const arbSlices = fc.array(fc.integer({ min: 1, max: 300 }), { minLength: 1, maxLength: 12 });

// ---------------------------------------------------------------------------
// Recorders and drivers

export interface Run {
  log: ReducerEvent[][];
  answers: OracleOutcome[];
  reports: ProgressReport[];
  final: StepReport;
}

export function deep<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Wraps an oracle so every call records a deep copy of its candidate and its answer. */
export function recording(oracle: Oracle, log: ReducerEvent[][], answers: OracleOutcome[]): Oracle {
  return (c) => {
    log.push(deep(c));
    const a = oracle(c);
    answers.push(deep(a));
    return a;
  };
}

export function isErr(x: StepReport | ReducerError): x is ReducerError {
  return "kind" in x;
}

/** Steps with the given slice sizes, cycling, until ended. */
export function drive(h: ReducerHandle, slices: readonly number[]): StepReport {
  for (let i = 0; ; i++) {
    const r = h.step(slices[i % slices.length]);
    if (isErr(r)) throw new Error(`step returned ${r.kind}: ${r.message}`);
    if (r.ended) return r;
  }
}

// ---------------------------------------------------------------------------
// Reference helpers written from the glossary

export function refPresented(list: readonly ReducerEvent[], f: Fixture): (InputValue | number)[] {
  return list.map((e, i) => {
    for (let j = i - 1; j >= 0; j--) {
      if (list[j].signal === e.signal) {
        const a = analogOf(list[j]);
        return a !== undefined ? a : (list[j] as { value: InputValue }).value;
      }
    }
    const pin = f.pins.find((p) => p.signal === e.signal) as FixturePin;
    return isAnalogPinT(pin) ? restLevelOf(pin) : "release";
  });
}

export function valueOf(e: ReducerEvent): InputValue | number {
  const a = analogOf(e);
  return a !== undefined ? a : (e as { value: InputValue }).value;
}

export function refNoChange(list: readonly ReducerEvent[], f: Fixture): number[] {
  const pv = refPresented(list, f);
  return list.flatMap((e, i) => (e.gremlinId !== "rest" && valueOf(e) === pv[i] ? [i] : []));
}

export function refBursts(list: readonly ReducerEvent[]): number[][] {
  const out: number[][] = [];
  const signals = [...new Set(list.map((e) => e.signal))];
  for (const s of signals) {
    const idx = list.flatMap((e, i) => (e.signal === s ? [i] : []));
    let run: number[] = [];
    for (const i of [...idx, -1]) {
      const e = i >= 0 ? list[i] : null;
      const continues = e !== null && e.gremlinId !== "rest" && run.length > 0 && list[run[0]].gremlinId === e.gremlinId;
      if (!continues) {
        if (run.length >= 2) out.push(run);
        run = e !== null && e.gremlinId !== "rest" ? [i] : [];
      } else run.push(i);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function refSnap(x: number): number {
  const c = [0, 512, 1023];
  let best = c[0];
  for (const v of c) {
    const d = Math.abs(v - x);
    const bd = Math.abs(best - x);
    if (d < bd || (d === bd && v === 512)) best = v;
  }
  return best;
}

export function isEligible(e: ReducerEvent): boolean {
  const a = analogOf(e);
  return e.gremlinId !== "rest" && a !== undefined && a !== 0 && a !== 512 && a !== 1023;
}

// ---------------------------------------------------------------------------
// Reference search model (unlimited budget), written from the design text.

export interface ModelRun {
  log: { part: string; list: ReducerEvent[] }[];
  best: ReducerEvent[];
}

export function modelSearch(original: ReducerEvent[], f: Fixture, sentence: string, oracle: Oracle): ModelRun | "does-not-break" {
  type E = { src: number; ev: ReducerEvent };
  const log: { part: string; list: ReducerEvent[] }[] = [];
  let best: E[] = original.map((ev, src) => ({ src, ev: { ...ev } }));
  const evs = (l: E[]) => l.map((x) => ({ ...x.ev }));
  const test = (part: string, cand: E[]): boolean => {
    log.push({ part, list: evs(cand) });
    const a = oracle(evs(cand));
    const ok = a.kind === "breaks" && a.violation.rule === sentence;
    if (ok) best = cand.map((x) => ({ src: x.src, ev: { ...x.ev } }));
    return ok;
  };
  const without = (ids: Set<number>) => best.filter((x) => !(ids.has(x.src) && x.ev.gremlinId !== "rest"));
  const snapped = (ids: Set<number>) =>
    best.map((x) => (ids.has(x.src) && isEligible(x.ev) ? { src: x.src, ev: { ...x.ev, analog: refSnap(analogOf(x.ev) as number) } } : x));
  if (!test("confirm", best)) return "does-not-break";
  for (;;) {
    let changed = false;
    // ddmin
    let n = 2;
    for (;;) {
      const g = best.filter((x) => x.ev.gremlinId !== "rest").map((x) => x.src);
      const L = g.length;
      if (L === 0) break;
      if (n > L) n = L;
      if (n === 1) {
        if (test("ddmin", without(new Set(g)))) {
          changed = true;
          continue;
        }
        break;
      }
      const parts: number[][] = [];
      let at = 0;
      for (let i = 0; i < n; i++) {
        const size = Math.floor(L / n) + (i < L % n ? 1 : 0);
        parts.push(g.slice(at, at + size));
        at += size;
      }
      let acc = false;
      for (let i = 0; i < n && !acc; i++) {
        if (test("ddmin", without(new Set(g.filter((id) => !parts[i].includes(id)))))) {
          acc = true;
          n = 2;
        }
      }
      if (!acc && n >= 3) {
        for (let i = 0; i < n && !acc; i++) {
          if (test("ddmin", without(new Set(parts[i])))) {
            acc = true;
            n = Math.max(n - 1, 2);
          }
        }
      }
      if (acc) {
        changed = true;
        continue;
      }
      if (n < L) {
        n = Math.min(2 * n, L);
        continue;
      }
      break;
    }
    // Pass A
    const nce = refNoChange(evs(best), f).map((i) => best[i].src);
    if (nce.length > 0) {
      if (test("passA", without(new Set(nce)))) changed = true;
      else if (nce.length >= 2) for (const id of nce) if (test("passA", without(new Set([id])))) changed = true;
    }
    // Pass B
    const start = refBursts(evs(best)).map((b) => best[b[b.length - 1]].src);
    for (const lastId of start) {
      for (let m = 1; ; m *= 2) {
        const cur = refBursts(evs(best)).find((b) => best[b[b.length - 1]].src === lastId);
        if (cur === undefined || m >= cur.length) break;
        if (test("passB", without(new Set(cur.slice(0, cur.length - m).map((i) => best[i].src))))) {
          changed = true;
          break;
        }
      }
    }
    // Pass C
    const ids = best.filter((x) => isEligible(x.ev)).map((x) => x.src);
    if (ids.length > 0) {
      if (test("passC", snapped(new Set(ids)))) changed = true;
      else if (ids.length >= 2) for (const id of ids) if (test("passC", snapped(new Set([id])))) changed = true;
    }
    if (!changed) return { log, best: evs(best) };
  }
}

// ---------------------------------------------------------------------------
// Subsequence mapping (Requirement 11.6)

export function isMappedSubsequence(reduced: readonly ReducerEvent[], original: readonly ReducerEvent[]): boolean {
  let j = 0;
  for (const r of reduced) {
    let found = false;
    while (j < original.length) {
      const o = original[j++];
      const sameKind = (analogOf(o) === undefined) === (analogOf(r) === undefined);
      if (!sameKind || o.cycle !== r.cycle || o.signal !== r.signal || o.gremlinId !== r.gremlinId) {
        if (o.gremlinId === "rest") return false;
        continue;
      }
      const oa = analogOf(o);
      if (oa === undefined) {
        if ((o as { value: unknown }).value !== (r as { value: unknown }).value) {
          if (o.gremlinId === "rest") return false;
          continue;
        }
      } else {
        const ra = analogOf(r) as number;
        if (ra !== oa && ra !== refSnap(oa)) continue;
      }
      if (Object.keys(r).sort().join() !== Object.keys(o).sort().join()) return false;
      found = true;
      break;
    }
    if (!found) return false;
  }
  for (; j < original.length; j++) if (original[j].gremlinId === "rest") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Banned words (whole words, ignoring case, as the copy test matches)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function bannedIn(text: string): string[] {
  return BANNED_WORDS.filter((w) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(w)}(?![A-Za-z0-9_-])`, "i").test(text));
}

// ---------------------------------------------------------------------------
// References for Ms_Text, FNV-1a 64-bit and UTF-8

/** floor((c + 800) / 1600) by decimal string arithmetic, written t/10 "." t%10 " ms". */
export function refMsText(c: number): string {
  const digits = c.toString().split("").map(Number);
  // add 800
  let carry = 800;
  for (let i = digits.length - 1; i >= 0 && carry > 0; i--) {
    const s = digits[i] + (carry % 10);
    carry = Math.floor(carry / 10) + Math.floor(s / 10);
    digits[i] = s % 10;
  }
  while (carry > 0) {
    digits.unshift(carry % 10);
    carry = Math.floor(carry / 10);
  }
  // divide by 1600
  const q: number[] = [];
  let rem = 0;
  for (const d of digits) {
    rem = rem * 10 + d;
    q.push(Math.floor(rem / 1600));
    rem = rem % 1600;
  }
  let t = q.join("").replace(/^0+(?=\d)/, "");
  if (t.length < 2) t = t.padStart(2, "0");
  const whole = t.slice(0, -1).replace(/^0+(?=\d)/, "");
  return `${whole}.${t.slice(-1)} ms`;
}

export function refUtf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

const TWO32 = 4294967296;

/** FNV-1a 64-bit with two 32-bit halves. prime = 2^40 + 0x1b3. */
export function refFnv1a64(bytes: readonly number[]): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (const b of bytes) {
    lo = (lo ^ b) >>> 0;
    const loMul = lo * 0x1b3;
    const carry = Math.floor(loMul / TWO32);
    const newLo = loMul % TWO32;
    const newHi = (hi * 0x1b3 + carry + ((lo * 256) % TWO32)) % TWO32;
    hi = newHi;
    lo = newLo;
  }
  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

export function refFingerprint(edges: readonly OutputEvent[]): string {
  let text = "";
  for (const e of edges) text += JSON.stringify([e.cycle, e.signal, e.value]) + "\n";
  return refFnv1a64(refUtf8(text));
}

// ---------------------------------------------------------------------------
// Story inputs and a reference story renderer from the design's templates

export interface StoryCase {
  reducedList: ReducerEvent[];
  fixture: Fixture;
  violation: { rule: string; cycle: number };
  outputEdges: OutputEvent[];
  violationSpan?: { lengthCycles: number; cut: boolean };
}

const RULES: Rule[] = [
  { form: "never", condition: { op: "eq", signal: "OUT", value: 1 } } as Rule,
  { form: "notLongerThan", condition: { op: "eq", signal: "OUT", value: 0 }, ms: 600 } as unknown as Rule,
];

export const ruleSentences: string[] = RULES.map((r) => {
  const s = render(r);
  if (!s.ok) throw new Error(`test rule did not render: ${s.reason}`);
  return s.sentence;
});

export const arbEdge: fc.Arbitrary<OutputEvent> = fc.record({
  signal: fc.oneof(fc.constantFrom("OUT", "LED", "Ünï", "𝄞x", 'a,"b"', "l\nf"), fc.string({ maxLength: 4 })),
  value: fc.constantFrom<0 | 1 | "input">(0, 1, "input"),
  cycle: fc.oneof(fc.integer({ min: 0, max: 20_000_000 }), fc.maxSafeNat(), fc.constant(Number.MAX_SAFE_INTEGER)),
});

const arbGremlinName = fc.constantFrom("masher", "bouncer", "stuck", "g0", "rand_walk");

export const arbStoryCase: fc.Arbitrary<StoryCase> = arbFixture.chain((fixture) => {
  const pins = inputPins(fixture);
  const one = fc
    .record({ pin: fc.integer({ min: 0, max: pins.length - 1 }), cycle: fc.integer({ min: 0, max: 30_000_000 }), g: arbGremlinName })
    .chain((r) => arbValueFor(pins[r.pin]).map((v) => ({ signal: pins[r.pin].signal, cycle: r.cycle, gremlinId: r.g, ...v }) as ReducerEvent));
  return fc.record({
    reducedList: fc
      .oneof(fc.integer({ min: 0, max: 0 }), fc.integer({ min: 1, max: 3 }), fc.integer({ min: 4, max: 12 }))
      .chain((n) => fc.array(one, { minLength: n, maxLength: n }))
      .map((evs) => [...restEvents(fixture), ...sortByCycle(evs)]),
    fixture: fc.constant(fixture),
    violation: fc.record({ rule: fc.constantFrom(...ruleSentences), cycle: fc.integer({ min: 0, max: 40_000_000 }) }),
    outputEdges: fc.array(arbEdge, { maxLength: 6 }),
    violationSpan: fc.option(
      fc.record({ lengthCycles: fc.integer({ min: 0, max: 20_000_000 }), cut: fc.boolean() }),
      { nil: undefined },
    ),
  }).map((c) => {
    if (c.violationSpan === undefined) delete (c as { violationSpan?: unknown }).violationSpan;
    return c as StoryCase;
  });
});

/** Reference renderer from the design's templates and packing rules. */
export function refStory(c: StoryCase): { text: string; form: "detailed" | "summary" | "none" } | "does-not-fit" {
  const ms = refMsText;
  const g = c.reducedList.filter((e) => e.gremlinId !== "rest");
  const lead = "In the smallest replay this reducer found, ";
  const list = (xs: string[]) =>
    xs.length === 1 ? xs[0] : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
  const wc = (s: string) => s.split(" ").length;
  const packAll = (phrases: string[], cont: string): string[] | null => {
    const out: string[] = [];
    let cur: string[] = [];
    const mk = (xs: string[], first: boolean) => (first ? lead : cont) + list(xs) + ".";
    for (const p of phrases) {
      if (cur.length > 0 && wc(mk([...cur, p], out.length === 0)) <= 30) {
        cur.push(p);
        continue;
      }
      if (cur.length > 0) {
        out.push(mk(cur, out.length === 0));
        cur = [];
      }
      if (wc(mk([p], out.length === 0)) > 30) return null;
      cur = [p];
    }
    if (cur.length > 0) out.push(mk(cur, out.length === 0));
    return out;
  };
  const maxEv = c.violationSpan === undefined ? 3 : 2;
  let evSentences: string[];
  let form: "detailed" | "summary" | "none";
  if (g.length === 0) {
    evSentences = ["In the smallest replay this reducer found, no gremlin event was needed."];
    form = "none";
  } else {
    const detailed = g.map((e) => {
      const pin = c.fixture.pins.find((p) => p.signal === e.signal) as FixturePin;
      const a = analogOf(e);
      if (a !== undefined) return `${e.gremlinId} set ${e.signal} to ${a} at ${ms(e.cycle)}`;
      const v = (e as { value: InputValue }).value;
      if (v === "release") return `${e.gremlinId} released ${e.signal} at ${ms(e.cycle)}`;
      if (v === pressOf(pin)) return `${e.gremlinId} pressed ${e.signal} at ${ms(e.cycle)}`;
      return `${e.gremlinId} drove ${e.signal} to ${v} at ${ms(e.cycle)}`;
    });
    const d = packAll(detailed, "Then ");
    if (d !== null && d.length <= maxEv) {
      evSentences = d;
      form = "detailed";
    } else {
      const keys: string[] = [];
      const groups = new Map<string, ReducerEvent[]>();
      for (const e of g) {
        const k = JSON.stringify([e.gremlinId, e.signal]);
        if (!groups.has(k)) {
          groups.set(k, []);
          keys.push(k);
        }
        (groups.get(k) as ReducerEvent[]).push(e);
      }
      const phrases = keys.map((k) => {
        const xs = groups.get(k) as ReducerEvent[];
        return xs.length === 1
          ? `${xs[0].gremlinId} acted on ${xs[0].signal} 1 time at ${ms(xs[0].cycle)}`
          : `${xs[0].gremlinId} acted on ${xs[0].signal} ${xs.length} times from ${ms(xs[0].cycle)} to ${ms(xs[xs.length - 1].cycle)}`;
      });
      const s = packAll(phrases, "Also, ");
      if (s === null || s.length > maxEv) return "does-not-fit";
      evSentences = s;
      form = "summary";
    }
  }
  const parts = [...evSentences, `At ${ms(c.violation.cycle)}, the chip broke this rule: ${c.violation.rule}`];
  if (c.violationSpan !== undefined) parts.push(`The rule stayed broken for ${c.violationSpan.cut ? "at least " : ""}${ms(c.violationSpan.lengthCycles)}.`);
  return { text: parts.join(" "), form };
}