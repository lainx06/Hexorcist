// One incremental monitor per Rule_Form. A monitor is told about change points only (cycles at
// which a referenced signal changed, plus cycle 0), never about every cycle, so its work is
// proportional to the number of changes. Pure apart from its own private state.

import type { RulePlan } from "./bind";
import type { Condition, Edge } from "./ir";
import { compileCondition } from "./trace";
import type { CompiledCondition, SignalTable } from "./trace";

export interface Monitor {
  readonly plan: RulePlan;
  /** Lowest Violation cycle found so far; it is at most the frontier of the last flush. */
  found: number | null;
  reported: boolean;
  /** Infinity until a referenced signal floats; a Violation at or above it is dropped. */
  cutoff: number;
  dead: boolean;
  /** Called before the change group at c is applied to the settled values. */
  before(c: number): void;
  /** Called after Settled_State(c) is known; `truth` evaluates a compiled Condition on it. */
  at(c: number, truth: (cond: CompiledCondition) => boolean): void;
  /** Every cycle up to and including k is final. */
  flush(k: number): void;
}

interface CompiledEdge {
  rising: boolean;
  cond: CompiledCondition;
}

function compileEdge(edge: Edge, table: SignalTable): CompiledEdge {
  return { rising: edge.op === "rise", cond: compileCondition(edge.of, table) };
}

/** Tracks the truth value of an Edge's Condition at the previous change point. */
class EdgeTracker {
  private prev: boolean;
  constructor(private readonly edge: CompiledEdge, initialTruth: (cond: CompiledCondition) => boolean) {
    this.prev = initialTruth(edge.cond);
  }
  /** Returns whether the Edge occurs at this change point, and moves the previous value on. */
  step(truth: (cond: CompiledCondition) => boolean): boolean {
    const now = truth(this.edge.cond);
    const occurs = this.edge.rising ? !this.prev && now : this.prev && !now;
    this.prev = now;
    return occurs;
  }
}

function limitOf(plan: RulePlan): number {
  if (plan.limit === null) throw new Error("monitor: a timed rule has no window limit");
  return plan.limit;
}

export function makeMonitor(
  plan: RulePlan,
  table: SignalTable,
  initialTruth: (cond: CompiledCondition) => boolean,
): Monitor {
  const monitor: Monitor = {
    plan,
    found: null,
    reported: false,
    cutoff: Infinity,
    dead: false,
    before: () => {},
    at: () => {},
    flush: () => {},
  };

  const live = (): boolean => monitor.found === null && !monitor.dead;
  const found = (v: number): void => {
    if (v >= monitor.cutoff) monitor.dead = true;
    else monitor.found = v;
  };

  const rule = plan.rule;
  const cond = (c: Condition): CompiledCondition => compileCondition(c, table);

  switch (rule.form) {
    case "never": {
      const c = cond(rule.condition);
      monitor.at = (cycle, truth) => {
        if (live() && truth(c)) found(cycle);
      };
      break;
    }

    case "respond": {
      const w = limitOf(plan);
      const trigger = new EdgeTracker(compileEdge(rule.trigger, table), initialTruth);
      const expect = cond(rule.expect);
      let pendingT: number | null = null;
      monitor.before = (c) => {
        if (live() && pendingT !== null && pendingT + w < c) found(pendingT + w);
      };
      monitor.at = (c, truth) => {
        if (!live()) return;
        const occurs = trigger.step(truth);
        if (truth(expect)) pendingT = null;
        else if (occurs && pendingT === null) pendingT = c;
      };
      monitor.flush = (k) => {
        if (live() && pendingT !== null && pendingT + w <= k) found(pendingT + w);
      };
      break;
    }

    case "count": {
      const w = limitOf(plan);
      const max = rule.max;
      const edge = new EdgeTracker(compileEdge(rule.edge, table), initialTruth);
      const cycles: number[] = [];
      let head = 0;
      monitor.at = (c, truth) => {
        if (!live()) return;
        if (!edge.step(truth)) return;
        const first = c - w + 1;
        while (head < cycles.length && cycles[head] < first) head++;
        if (head > 1024 && head * 2 > cycles.length) {
          cycles.splice(0, head);
          head = 0;
        }
        cycles.push(c);
        if (cycles.length - head > max) found(c);
      };
      break;
    }

    case "hold": {
      const d = limitOf(plan);
      const after = new EdgeTracker(compileEdge(rule.after, table), initialTruth);
      const expect = cond(rule.expect);
      let expectBefore = initialTruth(expect);
      let until = -1;
      monitor.at = (c, truth) => {
        if (!live()) return;
        const occurs = after.step(truth);
        const now = truth(expect);
        if (occurs) {
          if (!now) found(c);
          else until = Math.max(until, c + d - 1);
        } else if (!now && expectBefore && c <= until) {
          found(c);
        }
        expectBefore = now;
      };
      break;
    }

    case "notLongerThan": {
      const l = limitOf(plan);
      const c0 = cond(rule.condition);
      let spanStart: number | null = null;
      monitor.before = (c) => {
        if (live() && spanStart !== null && spanStart + l <= c) found(spanStart + l);
      };
      monitor.at = (c, truth) => {
        if (!live()) return;
        if (truth(c0)) {
          if (spanStart === null) spanStart = c;
        } else {
          spanStart = null;
        }
      };
      monitor.flush = (k) => {
        if (live() && spanStart !== null && spanStart + l <= k) found(spanStart + l);
      };
      break;
    }
  }

  return monitor;
}
