// Test-side file, not a test. A verbatim copy of runOne and its private helpers from
// src/engine/campaign.ts as they were before the trace-reducer Run_Path move. Only the
// name runOne is changed to referenceRunOne. Property 16 compares the two.
// No wall clock and no random source.

import type { Checker, CheckerObservation, CannotCheck, Violation } from "../checker";
import { EmulatorBridge, isBridgeError } from "../emulator-bridge";
import { isEngineError } from "../errors";
import type { EngineError } from "../errors";
import { buildEventList } from "../event-list";
import { checkPlanInput, planTarget } from "../step-plan";
import { mergeApplied } from "../campaign";
import type { BridgeFactory, RunConfig } from "../campaign";
import type { AppliedInput, Diagnostic, OutputEvent, RunResult } from "../types";
const defaultBridgeFactory: BridgeFactory = (hex, fixture, events) =>
  EmulatorBridge.create(hex, fixture, events);

function internal(message: string): EngineError {
  return { kind: "internal-error", message };
}

type CheckResult =
  | { ok: true; violation: Violation | null; cannotCheck: CannotCheck[] }
  | { ok: false; error: EngineError };

function checkerError(runIndex: number, cycle: number, message: string): CheckResult {
  return { ok: false, error: { kind: "checker-error", runIndex, cycle, message } };
}

function callChecker(checker: Checker, obs: CheckerObservation): CheckResult {
  let outcome: unknown;
  try {
    outcome = checker(obs);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    return checkerError(obs.runIndex, obs.cycle, `checker threw: ${text}`);
  }
  if (typeof outcome !== "object" || outcome === null) {
    return checkerError(obs.runIndex, obs.cycle, "checker returned a malformed outcome");
  }
  const o = outcome as { violation?: unknown; cannotCheck?: unknown };
  let violation: Violation | null = null;
  if (o.violation === null) {
    violation = null;
  } else if (typeof o.violation === "object" && o.violation !== undefined) {
    const v = o.violation as { rule?: unknown; cycle?: unknown };
    if (typeof v.rule !== "string" || v.rule.length === 0) {
      return checkerError(obs.runIndex, obs.cycle, "violation has an empty rule");
    }
    if (typeof v.cycle !== "number" || !Number.isInteger(v.cycle) || v.cycle < 0) {
      return checkerError(obs.runIndex, obs.cycle, "violation cycle is not a non-negative integer");
    }
    if (v.cycle > obs.cycle) {
      return checkerError(obs.runIndex, obs.cycle, "violation cycle is above the observation cycle");
    }
    violation = { rule: v.rule, cycle: v.cycle };
  } else {
    return checkerError(obs.runIndex, obs.cycle, "checker returned a malformed outcome");
  }
  const cannotCheck: CannotCheck[] = [];
  if (o.cannotCheck !== undefined) {
    if (!Array.isArray(o.cannotCheck)) {
      return checkerError(obs.runIndex, obs.cycle, "cannotCheck is not an array");
    }
    for (const c of o.cannotCheck as unknown[]) {
      const cc = c as { rule?: unknown; reason?: unknown } | null;
      if (typeof cc !== "object" || cc === null || typeof cc.rule !== "string" || typeof cc.reason !== "string") {
        return checkerError(obs.runIndex, obs.cycle, "cannotCheck entry is malformed");
      }
      cannotCheck.push({ rule: cc.rule, reason: cc.reason });
    }
  }
  return { ok: true, violation, cannotCheck };
}

/** Runs one Run on a fresh bridge. Returns plain data, or an error that stops the Campaign. */
export function referenceRunOne(cfg: RunConfig, runIndex: number): RunResult | EngineError {
  const gen = buildEventList({
    fixture: cfg.fixture,
    gremlinSet: cfg.gremlinSet,
    runCycles: cfg.runCycles,
    campaignSeed: cfg.campaignSeed,
    runIndex,
  });
  if (isEngineError(gen)) return gen;

  const factory = cfg.bridgeFactory ?? defaultBridgeFactory;
  const made = factory(cfg.hex, cfg.fixture, gen.events.slice());
  if (isBridgeError(made)) {
    return { kind: "bridge-error", runIndex, error: made, message: made.message };
  }
  const bridge = made;

  const appliedInputs: AppliedInput[] = [];
  const outputEvents: OutputEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const cannotCheck: CannotCheck[] = [];
  const seen = new Set<string>();
  let violation: Violation | null = null;
  let prevTarget = 0;
  let appliedCount = 0;
  let stepIndex = 0;

  const collect = (list: CannotCheck[]): void => {
    for (const c of list) {
      const key = JSON.stringify([c.rule, c.reason]);
      if (seen.has(key)) continue;
      seen.add(key);
      cannotCheck.push(c);
    }
  };

  while (bridge.cycleCount < cfg.runCycles) {
    const before = bridge.cycleCount;
    const pending: number[] = [];
    for (let i = appliedCount; i < gen.events.length; i++) pending.push(gen.events[i].cycle);
    const planInput = {
      prevTarget,
      cycleCount: before,
      pendingCycles: pending,
      runCycles: cfg.runCycles,
      maxStepCycles: cfg.maxStepCycles,
    };
    const planErr = checkPlanInput(planInput);
    if (planErr) return internal(planErr.message);
    const target = planTarget(planInput);
    const r = bridge.advance(target - before);
    if (isBridgeError(r)) {
      return { kind: "bridge-error", runIndex, error: r, message: r.message };
    }
    if (bridge.cycleCount <= before) {
      return internal(`bridge did not advance at cycle ${before}`);
    }
    prevTarget = target;
    const merged = mergeApplied(gen.events, appliedCount, r);
    if (isEngineError(merged)) return merged;
    appliedCount += merged.length;
    appliedInputs.push(...merged);
    outputEvents.push(...r.outputEvents);
    diagnostics.push(...r.diagnostics);

    const res = callChecker(cfg.checker, {
      runIndex,
      stepIndex: stepIndex++,
      endOfRun: false,
      cycle: bridge.cycleCount,
      outputEvents: Object.freeze(r.outputEvents.slice()),
      appliedInputs: Object.freeze(merged.slice()),
      diagnostics: Object.freeze(r.diagnostics.slice()),
    });
    if (!res.ok) return res.error;
    collect(res.cannotCheck);
    if (res.violation) {
      violation = res.violation;
      break;
    }
  }

  if (violation === null) {
    const res = callChecker(cfg.checker, {
      runIndex,
      stepIndex: stepIndex++,
      endOfRun: true,
      cycle: bridge.cycleCount,
      outputEvents: Object.freeze([]),
      appliedInputs: Object.freeze([]),
      diagnostics: Object.freeze([]),
    });
    if (!res.ok) return res.error;
    collect(res.cannotCheck);
    violation = res.violation;
  }

  return {
    runIndex,
    runSeed: gen.runSeed,
    eventList: gen.events.map((e) => ({ ...e })),
    skipped: gen.skipped.map((s) => ({ ...s })),
    appliedInputs,
    outputEvents,
    diagnostics,
    cannotCheck,
    violation,
    endCycle: bridge.cycleCount,
  };
}
