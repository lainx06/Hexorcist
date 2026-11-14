// The Rule_Checker: turns a RuleSetPlan into a Checker. All state lives in the closure of one
// makeRuleChecker call, so two checkers share nothing. It reads observations only: no clock,
// no random source, no network.

import type { Checker, CheckerObservation, CheckerOutcome, CannotCheck } from "../checker";
import type { AppliedInput, OutputEvent } from "../types";
import type { RuleSetPlan } from "./bind";
import { isSignalName } from "./ir";
import { makeMonitor } from "./monitors";
import type { Monitor } from "./monitors";
import { evalCondition, initialState, makeSignalTable, toChanges } from "./trace";
import type { Change, CompiledCondition, SignalValue } from "./trace";

interface LastCall {
  stepIndex: number;
  cycle: number;
  endOfRun: boolean;
}

interface RunState {
  /** Highest Final_Cycle so far, -1 before any. */
  frontier: number;
  /** Settled_State(frontier) for every referenced signal. */
  values: SignalValue[];
  /** Changes above the frontier, kept sorted by (cycle, seq). */
  pending: Change[];
  seq: number;
  floatingSeen: boolean;
  /** Lowest floating diagnostic cycle per signal. */
  cutoff: Map<string, number>;
  /** One per Active_Rule, in Rule_Set order. */
  monitors: Monitor[];
}

function fail(message: string): never {
  throw new Error(`rule checker: ${message}`);
}

const MAX_CYCLE = Number.MAX_SAFE_INTEGER;

export function makeRuleChecker(plan: RuleSetPlan): Checker {
  const table = makeSignalTable(plan.checkerSignals, plan.kinds);
  let last: LastCall | null = null;
  let run: RunState | null = null;

  const startRun = (
    outputEvents: readonly OutputEvent[],
    appliedInputs: readonly AppliedInput[],
  ): { state: RunState; snapshotUsed: ReadonlySet<number> } => {
    const initial = initialState(table, outputEvents, appliedInputs);
    const values = initial.values;
    const truth = (c: CompiledCondition): boolean => evalCondition(c, values);
    const monitors: Monitor[] = [];
    for (const p of plan.plans) {
      if (p.active) monitors.push(makeMonitor(p, table, truth));
    }
    const state: RunState = {
      frontier: -1,
      values,
      pending: [],
      seq: 0,
      floatingSeen: false,
      cutoff: new Map(),
      monitors,
    };
    return { state, snapshotUsed: initial.snapshotUsed };
  };

  /** Drops a monitor's Violation when it is at or above the monitor's cut-off. */
  const applyCutoff = (m: Monitor): void => {
    if (m.found !== null && !m.reported && m.found >= m.cutoff) {
      m.found = null;
      m.dead = true;
    }
  };

  return (observation: CheckerObservation): CheckerOutcome => {
    const { stepIndex, cycle, endOfRun } = observation;

    // Step 1: call-order checks.
    if (!Number.isInteger(cycle) || cycle < 0 || cycle > MAX_CYCLE) {
      fail(`cycle ${String(cycle)} is not an integer from 0 to ${MAX_CYCLE}`);
    }
    if (last === null) {
      if (stepIndex !== 0) fail(`stepIndex ${stepIndex} does not follow stepIndex 0`);
    } else if (stepIndex !== 0) {
      if (last.endOfRun) fail(`stepIndex ${stepIndex} follows the end-of-run call`);
      if (stepIndex !== last.stepIndex + 1) {
        fail(`stepIndex ${stepIndex} does not follow stepIndex ${last.stepIndex}`);
      }
      if (endOfRun ? cycle < last.cycle : cycle <= last.cycle) {
        fail(`cycle ${cycle} does not follow cycle ${last.cycle}`);
      }
    }

    const cannotCheck: CannotCheck[] = [];

    // Step 2: a fresh Run at stepIndex 0.
    let snapshotUsed: ReadonlySet<number> = new Set();
    if (stepIndex === 0) {
      const started = startRun(observation.outputEvents, observation.appliedInputs);
      run = started.state;
      snapshotUsed = started.snapshotUsed;
      for (const p of plan.plans) cannotCheck.push(...p.marks);
    }
    const state = run;
    if (state === null) fail("no run is in progress");
    last = { stepIndex, cycle, endOfRun };

    // Step 3: floating diagnostics, read before any change of this call is settled.
    let firstFloating: string | null = null;
    for (const d of observation.diagnostics) {
      if (d.kind !== "floating-input") continue;
      if (!plan.digitalInputSignals.has(d.signal)) continue;
      if (firstFloating === null) firstFloating = d.signal;
      const prior = state.cutoff.get(d.signal);
      if (prior === undefined || d.cycle < prior) state.cutoff.set(d.signal, d.cycle);
      for (const m of state.monitors) {
        if (!m.plan.signals.includes(d.signal)) continue;
        if (d.cycle < m.cutoff) m.cutoff = d.cycle;
        applyCutoff(m);
      }
    }
    if (firstFloating !== null && !state.floatingSeen) {
      state.floatingSeen = true;
      const reason = isSignalName(firstFloating)
        ? `input ${firstFloating} was read while floating`
        : "an input was read while floating";
      for (const p of plan.plans) {
        if (p.active) cannotCheck.push({ rule: p.sentence, reason });
      }
    }

    // Step 4: new changes.
    const fresh = toChanges(table, observation.outputEvents, observation.appliedInputs, snapshotUsed, state.seq);
    state.seq += fresh.length;
    for (const c of fresh) {
      if (c.cycle <= state.frontier) {
        fail(`a change at cycle ${c.cycle} arrived after cycle ${state.frontier} was final`);
      }
      state.pending.push(c);
    }
    state.pending.sort((a, b) => a.cycle - b.cycle || a.seq - b.seq);

    // Step 5: settle every cycle up to the new frontier.
    const newK = endOfRun ? cycle : cycle - 1;
    if (newK > state.frontier) {
      const truth = (c: CompiledCondition): boolean => evalCondition(c, state.values);
      const needZero = state.frontier === -1 && newK >= 0;
      let i = 0;
      let zeroDone = !needZero;
      for (;;) {
        const nextPending = i < state.pending.length && state.pending[i].cycle <= newK ? state.pending[i].cycle : null;
        let c: number;
        if (!zeroDone && (nextPending === null || nextPending > 0)) {
          c = 0;
          zeroDone = true;
        } else if (nextPending !== null) {
          c = nextPending;
          if (c === 0) zeroDone = true;
        } else {
          break;
        }
        for (const m of state.monitors) m.before(c);
        while (i < state.pending.length && state.pending[i].cycle === c) {
          const ch = state.pending[i++];
          state.values[ch.signal] = ch.value;
        }
        for (const m of state.monitors) m.at(c, truth);
      }
      state.pending.splice(0, i);
      for (const m of state.monitors) m.flush(newK);
      state.frontier = newK;
    }

    // Step 6: choose the lowest unreported Violation.
    let chosen: Monitor | null = null;
    for (const m of state.monitors) {
      if (m.found === null || m.reported) continue;
      if (chosen === null || m.found < (chosen.found as number)) chosen = m;
    }
    if (chosen !== null) chosen.reported = true;

    // Step 7: run end.
    if (endOfRun) {
      for (const p of plan.plans) {
        if (!p.active || p.limit === null) continue;
        if (chosen !== null && chosen.plan === p) continue;
        if (p.limit > cycle) cannotCheck.push({ rule: p.sentence, reason: "run shorter than the rule window" });
      }
    }

    // Step 8: the outcome.
    const violation = chosen === null ? null : { rule: chosen.plan.sentence, cycle: chosen.found as number };
    return cannotCheck.length === 0 ? { violation } : { violation, cannotCheck };
  };
}
