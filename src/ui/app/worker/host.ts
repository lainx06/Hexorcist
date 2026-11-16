// Worker_Host: campaigns, reductions and replays over the Engine. Pure functions: no clock,
// no random source, no network, no DOM or worker global, no dynamic import. Node can call them.
import { createCampaign, DEFAULT_MAX_STEP_CYCLES, runEventList } from "../../../engine/campaign";
import type { BridgeFactory } from "../../../engine/campaign";
import type { Checker, Violation } from "../../../engine/checker";
import { EmulatorBridge, isBridgeError } from "../../../engine/emulator-bridge";
import type { EmulatorBridgeInterface } from "../../../engine/emulator-bridge";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import { checkEventList, copyList, MAX_RUN_CYCLES } from "../../../engine/reducer/events";
import { traceFingerprint } from "../../../engine/reducer/fingerprint";
import { createReducer } from "../../../engine/reducer/reducer";
import type { ReducerOptions } from "../../../engine/reducer/reducer";
import { isReducerError } from "../../../engine/reducer/reducer-error";
import type { ReducerEvent, ReducerResult } from "../../../engine/reducer/types";
import { compileRuleSet } from "../../../engine/rules/compile";
import { buildCampaignConfig } from "../../../engine/rules/config-builder";
import type { RuleSet } from "../../../engine/rules/ir";
import type { Fixture, OutputEvent, ScheduledInput } from "../../../engine/types";
import { coverageCounts } from "../model/coverage";
import { displayRunCycles } from "../model/display";
import type { CompactCampaignResult, JobError } from "./messages";

export const SLICE_RUNS = 1;
export const STEP_CANDIDATES = 1;
export const REPLAY_RUN_INDEX = 0;

function jobError(e: { kind: string; message: string }): JobError {
  return { kind: e.kind, message: e.message };
}

// ---------------------------------------------------------------------------
// Campaign

export interface CampaignJobInput {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  gremlinSet: GremlinSpec[];
  campaignSeed: number;
  runs: number;
  runCycles: number;
}

export interface CampaignHooks {
  beforeCreate?: () => void;
  onProgress?: (p: { runsCompleted: number; total: number }) => void;
  afterFinish?: () => void;
}

export type CampaignJobResult =
  | { ok: true; runsCompleted: number; total: number; result: CompactCampaignResult }
  | { ok: false; error: JobError };

export function runCampaignJob(input: CampaignJobInput, hooks: CampaignHooks = {}): CampaignJobResult {
  const built = buildCampaignConfig(input.ruleSet, input.fixture, {
    hex: input.hex,
    gremlinSet: input.gremlinSet,
    campaignSeed: input.campaignSeed,
    runs: input.runs,
    runCycles: input.runCycles,
  });
  if (!built.ok) return { ok: false, error: { kind: "invalid-rules", message: built.reasons.join("; ") } };
  hooks.beforeCreate?.();
  const handle = createCampaign(built.config);
  if (!("runSlice" in handle)) return { ok: false, error: jobError(handle) };
  for (;;) {
    const p = handle.runSlice(SLICE_RUNS);
    if (!("finished" in p)) return { ok: false, error: jobError(p) };
    if (!p.finished) {
      hooks.onProgress?.({ runsCompleted: p.runsCompleted, total: p.total });
      continue;
    }
    hooks.afterFinish?.();
    if (p.result === null) {
      return { ok: false, error: { kind: "internal-error", message: "The campaign finished with no result." } };
    }
    let totalCycles = 0;
    for (const r of p.runs) totalCycles += r.endCycle;
    const result: CompactCampaignResult = {
      runsCompleted: p.result.runsCompleted,
      requestedRuns: p.result.requestedRuns,
      violatingRunIndex: p.result.violatingRunIndex,
      verdict: p.result.verdict,
      coverage: coverageCounts(input.ruleSet, input.fixture, p.runs, input.runCycles),
      totalCycles,
    };
    return { ok: true, runsCompleted: p.runsCompleted, total: p.total, result };
  }
}

// ---------------------------------------------------------------------------
// Reduction

export interface ReductionJobInput {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  originalList: ReducerEvent[];
  violation: Violation;
  runCycles: number;
}

export interface ReductionHooks {
  beforeCreate?: () => void;
  onProgress?: (p: { candidatesTried: number; bestGremlinCount: number; bestList: ReducerEvent[] }) => void;
  afterFinish?: () => void;
}

export type ReductionJobResult = { ok: true; result: ReducerResult } | { ok: false; error: JobError };

export function runReductionJob(
  input: ReductionJobInput,
  hooks: ReductionHooks = {},
  bridgeFactory?: BridgeFactory,
): ReductionJobResult {
  const options: ReducerOptions = {
    onProgress: (r) => {
      hooks.onProgress?.({
        candidatesTried: r.candidatesTried,
        bestGremlinCount: r.bestGremlinCount,
        bestList: copyList(r.bestList),
      });
    },
  };
  if (bridgeFactory !== undefined) options.bridgeFactory = bridgeFactory;
  hooks.beforeCreate?.();
  const handle = createReducer(
    {
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      originalList: input.originalList,
      violation: input.violation,
      runCycles: input.runCycles,
      maxStepCycles: DEFAULT_MAX_STEP_CYCLES,
    },
    options,
  );
  if (isReducerError(handle)) return { ok: false, error: jobError(handle) };
  for (;;) {
    const s = handle.step(STEP_CANDIDATES);
    if (isReducerError(s)) return { ok: false, error: jobError(s) };
    if (!s.ended) continue;
    hooks.afterFinish?.();
    if (s.error !== undefined) return { ok: false, error: jobError(s.error) };
    if (s.result === undefined) {
      return { ok: false, error: { kind: "internal-error", message: "The reduction ended with no result." } };
    }
    return { ok: true, result: s.result };
  }
}

export interface CountingFactory {
  factory: BridgeFactory;
  /** Sum of cycleCount over every bridge the factory made. */
  totalCycles(): number;
  keptCount(): number;
}

/** A bridge factory that returns EmulatorBridge.create's result unchanged and keeps each bridge. */
export function createCountingFactory(): CountingFactory {
  const kept: EmulatorBridgeInterface[] = [];
  const factory: BridgeFactory = (hex: string, fixture: Fixture, events: ScheduledInput[]) => {
    const made = EmulatorBridge.create(hex, fixture, events);
    if (!isBridgeError(made)) kept.push(made);
    return made;
  };
  return {
    factory,
    totalCycles: () => kept.reduce((sum, b) => sum + b.cycleCount, 0),
    keptCount: () => kept.length,
  };
}

// ---------------------------------------------------------------------------
// Replay

export interface ReplayJobInput {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  events: ReducerEvent[];
  runCycles: number;
}

export type ReplayJobResult =
  | { ok: true; violation: Violation | null; outputEdges: OutputEvent[]; reachedEnd: number; fingerprint: string }
  | { ok: false; error: JobError };

function invalid(message: string): ReplayJobResult {
  return { ok: false, error: { kind: "invalid-input", message } };
}

/**
 * One fresh-bridge replay through the Run_Path. Repeats the input checks of replayEventList
 * in the same order and with the same texts, then calls runEventList once, which also gives
 * the cycle the replay stopped at.
 */
export function runReplayJob(input: ReplayJobInput): ReplayJobResult {
  return replayCore(input, () => input.runCycles, false);
}

export interface WrappedChecker {
  checker: Checker;
  recorded(): Violation | null;
}

/** Records the lowest-cycle violation of `inner` and reports none, so a run never stops early. */
export function wrapChecker(inner: Checker): WrappedChecker {
  let rec: Violation | null = null;
  const checker: Checker = (obs) => {
    const out = inner(obs);
    const v = out.violation;
    if (v !== null && (rec === null || v.cycle < rec.cycle)) rec = { rule: v.rule, cycle: v.cycle };
    return out.cannotCheck === undefined ? { violation: null } : { violation: null, cannotCheck: out.cannotCheck };
  };
  return { checker, recorded: () => rec };
}

export interface DisplayReplayJobInput {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  events: ReducerEvent[];
  violationCycle: number;
}

/** A replay that runs on past the violation, up to displayRunCycles(violationCycle). */
export function runDisplayReplayJob(input: DisplayReplayJobInput): ReplayJobResult {
  return replayCore(
    input,
    () => {
      const v = input.violationCycle;
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
        return "Field violationCycle: must be a whole number of 0 or more.";
      }
      return displayRunCycles(v);
    },
    true,
  );
}

function replayCore(
  input: { hex: string; fixture: Fixture; ruleSet: RuleSet; events: ReducerEvent[] },
  runCyclesOf: () => unknown,
  wrapped: boolean,
): ReplayJobResult {
  try {
    if (typeof input.hex !== "string") return invalid("Field hex: must be a string.");
    let fixture: Fixture;
    try {
      const f = input.fixture as unknown;
      if (typeof f !== "object" || f === null || !Array.isArray((f as Fixture).pins)) throw new Error("bad");
      fixture = structuredClone(f as Fixture);
    } catch {
      return invalid("Field fixture: must be an object with a pins array.");
    }
    const rc = runCyclesOf();
    if (typeof rc === "string") return invalid(rc);
    if (typeof rc !== "number" || !Number.isInteger(rc) || rc < 1 || rc > MAX_RUN_CYCLES) {
      return invalid(`Field runCycles: must be an integer from 1 to ${String(MAX_RUN_CYCLES)}.`);
    }
    let ruleSet: unknown;
    try {
      ruleSet = structuredClone(input.ruleSet);
    } catch {
      return invalid("Field ruleSet: the rule set could not be copied.");
    }
    const compiled = compileRuleSet(ruleSet, fixture);
    if (!compiled.ok) return invalid("Field ruleSet: the rules did not compile.");
    if (!Array.isArray(input.events)) return invalid("Field events: must be an array.");
    const bad = checkEventList(input.events as unknown[], fixture, { runCycles: rc });
    if (bad !== null) return invalid(bad.message);
    const wrap = wrapped ? wrapChecker(compiled.compiled.checker) : null;
    const path = runEventList(
      {
        hex: input.hex,
        fixture,
        checker: wrap === null ? compiled.compiled.checker : wrap.checker,
        runCycles: rc,
        maxStepCycles: DEFAULT_MAX_STEP_CYCLES,
      },
      copyList(input.events),
      REPLAY_RUN_INDEX,
    );
    if ("kind" in path) {
      return {
        ok: false,
        error: { kind: "replay-error", message: `The replay failed (${path.kind}: ${path.message}).` },
      };
    }
    const outputEdges = path.outputEvents.map((e) => ({ signal: e.signal, value: e.value, cycle: e.cycle }));
    const fp = traceFingerprint(outputEdges);
    if (typeof fp !== "string") return { ok: false, error: jobError(fp) };
    return {
      ok: true,
      violation:
        wrap !== null
          ? wrap.recorded()
          : path.violation === null
            ? null
            : { rule: path.violation.rule, cycle: path.violation.cycle },
      outputEdges,
      reachedEnd: path.endCycle,
      fingerprint: fp,
    };
  } catch {
    return {
      ok: false,
      error: { kind: "replay-error", message: "The replay failed (internal-error: an unexpected value was read)." },
    };
  }
}