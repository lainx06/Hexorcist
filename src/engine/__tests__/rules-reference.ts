// Reference_Evaluator for the rule-compiler differential property (test-only helper).
//
// Written from Req 7 to 11 only. It reads the whole trace at once, stores the state of every
// cycle 0..E and checks each rule form with direct loops over cycles. It is slow on purpose.
// It imports types and `render` (for sentences) and nothing that holds monitor logic.

import type { CannotCheck } from "../checker";
import type { Condition, Edge, Rule } from "../rules/ir";
import { render } from "../rules/render";
import type { AppliedInput, Diagnostic, Fixture, FixturePin, OutputEvent } from "../types";

export interface ReferenceInput {
  readonly fixture: Fixture;
  readonly ruleSet: readonly Rule[];
  /** Window_Cycles per Rule (W, D or L); null for `never`. */
  readonly windows: readonly (number | null)[];
  /** End-of-run cycle E. */
  readonly endCycle: number;
  readonly outputEvents: readonly OutputEvent[];
  readonly appliedInputs: readonly AppliedInput[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ReferenceRuleResult {
  readonly sentence: string;
  readonly active: boolean;
  /** Lowest Violation cycle of the rule over cycles 0..E, before the floating cut-off. */
  readonly rawViolation: number | null;
  /** Lowest d of a floating diagnostic on a signal the rule references, or null. */
  readonly cutoff: number | null;
  /** Violation cycle after the floating cut-off (Req 11.6). */
  readonly violation: number | null;
}

export interface ReferenceResult {
  readonly rules: readonly ReferenceRuleResult[];
  /** Lowest (cycle, Rule_Set index) Violation over Active_Rules, or null. */
  readonly violation: { rule: string; cycle: number; index: number } | null;
  /** One entry per Active_Rule when a Fixture Digital_Input had a floating diagnostic. */
  readonly floating: readonly CannotCheck[];
}

type Leaf = Extract<Condition, { op: "eq" | "above" | "below" }>;
type Value = number | "input";

function leavesOf(c: Condition): Leaf[] {
  if (c.op === "all" || c.op === "any") {
    const out: Leaf[] = [];
    for (const m of c.of) out.push(...leavesOf(m));
    return out;
  }
  return [c];
}

/** Top-level Conditions of a Rule in sentence order. */
function conditionsOf(rule: Rule): Condition[] {
  switch (rule.form) {
    case "never":
      return [rule.condition];
    case "respond":
      return [rule.trigger.of, rule.expect];
    case "count":
      return [rule.edge.of];
    case "hold":
      return [rule.after.of, rule.expect];
    case "notLongerThan":
      return [rule.condition];
  }
}

function isAnalog(pin: FixturePin): boolean {
  return pin.kind === "analog";
}

function pinsFor(fixture: Fixture, signal: string): FixturePin[] {
  return fixture.pins.filter((p) => p.signal === signal);
}

/** Req 6 binding, from the text: unmapped, mapped twice and wrong-kind leaves make a Rule inactive. */
function isActive(fixture: Fixture, rule: Rule): boolean {
  for (const c of conditionsOf(rule)) {
    for (const leaf of leavesOf(c)) {
      const pins = pinsFor(fixture, leaf.signal);
      if (pins.length !== 1) return false;
      const analog = isAnalog(pins[0]);
      if (leaf.op === "eq" && analog) return false;
      if (leaf.op !== "eq" && !analog) return false;
    }
  }
  return true;
}

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

export function referenceEvaluate(input: ReferenceInput): ReferenceResult {
  const { fixture, ruleSet, windows, endCycle: E } = input;

  const sentences = ruleSet.map((r) => {
    const out = render(r);
    return out.ok ? out.sentence : "";
  });
  const active = ruleSet.map((r) => isActive(fixture, r));

  // Signals read by Active_Rules.
  const signals: string[] = [];
  ruleSet.forEach((r, i) => {
    if (!active[i]) return;
    for (const c of conditionsOf(r)) {
      for (const leaf of leavesOf(c)) if (!signals.includes(leaf.signal)) signals.push(leaf.signal);
    }
  });
  const indexOf = (s: string): number => signals.indexOf(s);

  // Initial_State (Req 7).
  const initial: Value[] = signals.map((s) => {
    const pin = pinsFor(fixture, s)[0];
    if (isAnalog(pin)) {
      const rl = (pin as { restLevel?: number }).restLevel;
      return rl === undefined ? 512 : rl;
    }
    if (pin.direction === "output") {
      for (const ev of input.outputEvents) {
        if (ev.signal === s && ev.cycle === 0) return ev.value;
      }
      return "input";
    }
    const inactive = (pin as { activeLevel?: string }).activeLevel === "high" ? 0 : 1;
    let v: Value = inactive;
    for (const ev of input.appliedInputs) {
      if (ev.gremlinId !== "rest" || ev.signal !== s || !("value" in ev)) continue;
      v = ev.value === "release" ? inactive : ev.value;
    }
    return v;
  });

  // Changes per cycle, in list order (Req 7.3, 7.6, 7.8, 7.9, 8.9).
  const changes: { idx: number; value: Value }[][] = [];
  for (let c = 0; c <= E; c++) changes.push([]);
  for (const ev of input.outputEvents) {
    const idx = indexOf(ev.signal);
    if (idx < 0 || ev.cycle < 0 || ev.cycle > E) continue;
    changes[ev.cycle].push({ idx, value: ev.value });
  }
  for (const ev of input.appliedInputs) {
    if (ev.gremlinId === "rest") continue;
    const idx = indexOf(ev.signal);
    if (idx < 0 || ev.appliedCycle < 0 || ev.appliedCycle > E) continue;
    if ("analog" in ev) {
      changes[ev.appliedCycle].push({ idx, value: ev.analog });
    } else {
      const pin = pinsFor(fixture, ev.signal)[0];
      const inactive = (pin as { activeLevel?: string }).activeLevel === "high" ? 0 : 1;
      changes[ev.appliedCycle].push({ idx, value: ev.value === "release" ? inactive : ev.value });
    }
  }

  // state[c] for every cycle 0..E.
  const state: Value[][] = [];
  let current = initial.slice();
  for (let c = 0; c <= E; c++) {
    current = current.slice();
    for (const ch of changes[c]) current[ch.idx] = ch.value;
    state.push(current);
  }

  const holdsIn = (cond: Condition, st: readonly Value[]): boolean => {
    switch (cond.op) {
      case "eq":
        return st[indexOf(cond.signal)] === cond.value;
      case "above": {
        const v = st[indexOf(cond.signal)];
        return typeof v === "number" && v > cond.value;
      }
      case "below": {
        const v = st[indexOf(cond.signal)];
        return typeof v === "number" && v < cond.value;
      }
      case "all":
        return cond.of.every((m) => holdsIn(m, st));
      case "any":
        return cond.of.some((m) => holdsIn(m, st));
    }
  };

  const truthOf = (cond: Condition): { init: boolean; at: boolean[] } => ({
    init: holdsIn(cond, initial),
    at: state.map((st) => holdsIn(cond, st)),
  });

  const occurrencesOf = (edge: Edge): number[] => {
    const t = truthOf(edge.of);
    const out: number[] = [];
    for (let c = 0; c <= E; c++) {
      const before = c === 0 ? t.init : t.at[c - 1];
      const now = t.at[c];
      if (edge.op === "rise" ? !before && now : before && !now) out.push(c);
    }
    return out;
  };

  const lowestViolation = (rule: Rule, w: number | null): number | null => {
    switch (rule.form) {
      case "never": {
        const t = truthOf(rule.condition).at;
        for (let c = 0; c <= E; c++) if (t[c]) return c;
        return null;
      }
      case "respond": {
        const W = w as number;
        const occ = occurrencesOf(rule.trigger);
        const t = truthOf(rule.expect).at;
        for (const o of occ) {
          if (o + W > E) continue;
          let met = false;
          for (let c = o; c <= o + W; c++) if (t[c]) met = true;
          if (!met) return o + W; // occ ascends, so the first unmet one is the lowest
        }
        return null;
      }
      case "count": {
        const W = w as number;
        const occ = occurrencesOf(rule.edge);
        for (const e of occ) {
          let n = 0;
          for (const o of occ) if (o >= e - W + 1 && o <= e) n++;
          if (n > rule.max) return e;
        }
        return null;
      }
      case "hold": {
        const D = w as number;
        const occ = occurrencesOf(rule.after);
        const t = truthOf(rule.expect).at;
        let best: number | null = null;
        for (const o of occ) {
          const last = Math.min(o + D - 1, E);
          for (let c = o; c <= last; c++) {
            if (!t[c]) {
              if (best === null || c < best) best = c;
              break;
            }
          }
        }
        return best;
      }
      case "notLongerThan": {
        const L = w as number;
        const tr = truthOf(rule.condition);
        const starts: number[] = [];
        if (tr.at[0]) starts.push(0);
        for (let c = 1; c <= E; c++) if (!tr.at[c - 1] && tr.at[c]) starts.push(c);
        for (const s of starts) {
          if (s + L > E) continue;
          let all = true;
          for (let c = s; c <= s + L - 1; c++) if (!tr.at[c]) all = false;
          if (all) return s + L;
        }
        return null;
      }
    }
  };

  // Floating diagnostics (Req 11.2, 11.3, 11.6): only Fixture Digital_Inputs count.
  const isFixtureDigitalInput = (s: string): boolean =>
    fixture.pins.some((p) => p.signal === s && !isAnalog(p) && p.direction === "input");
  const lowestDiagnostic = (s: string): number | null => {
    let d: number | null = null;
    for (const dg of input.diagnostics) {
      if (dg.kind !== "floating-input" || dg.signal !== s) continue;
      if (d === null || dg.cycle < d) d = dg.cycle;
    }
    return d;
  };

  const rules: ReferenceRuleResult[] = ruleSet.map((rule, i) => {
    if (!active[i]) {
      return { sentence: sentences[i], active: false, rawViolation: null, cutoff: null, violation: null };
    }
    const raw = lowestViolation(rule, windows[i]);
    let cutoff: number | null = null;
    for (const c of conditionsOf(rule)) {
      for (const leaf of leavesOf(c)) {
        if (!isFixtureDigitalInput(leaf.signal)) continue;
        const d = lowestDiagnostic(leaf.signal);
        if (d !== null && (cutoff === null || d < cutoff)) cutoff = d;
      }
    }
    const violation = raw !== null && (cutoff === null || raw < cutoff) ? raw : null;
    return { sentence: sentences[i], active: true, rawViolation: raw, cutoff, violation };
  });

  let violation: ReferenceResult["violation"] = null;
  rules.forEach((r, i) => {
    if (r.violation === null) return;
    if (violation === null || r.violation < violation.cycle) {
      violation = { rule: r.sentence, cycle: r.violation, index: i };
    }
  });

  let firstFloating: string | null = null;
  for (const dg of input.diagnostics) {
    if (dg.kind === "floating-input" && isFixtureDigitalInput(dg.signal)) {
      firstFloating = dg.signal;
      break;
    }
  }
  const floating: CannotCheck[] = [];
  if (firstFloating !== null) {
    const reason =
      NAME.test(firstFloating) && firstFloating !== "all" && firstFloating !== "any"
        ? `input ${firstFloating} was read while floating`
        : "an input was read while floating";
    rules.forEach((r) => {
      if (r.active) floating.push({ rule: r.sentence, reason });
    });
  }

  return { rules, violation, floating };
}
