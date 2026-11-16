// Campaign runner: one Run at a time.
// Time is integer CPU cycles read from the bridge cycleCount and nowhere else.
// Event_Lists are always regenerated from seeds, never read back from stored results.

import type { Checker, CheckerObservation, CannotCheck, Violation } from "./checker";
import { EmulatorBridge, isBridgeError } from "./emulator-bridge";
import type { EmulatorBridgeInterface } from "./emulator-bridge";
import { isEngineError } from "./errors";
import type { EngineError } from "./errors";
import { buildEventList } from "./event-list";
import type { GeneratedEvent } from "./event-list";
import type { GremlinSpec } from "./gremlins/catalogue";
import { checkPlanInput, planTarget } from "./step-plan";
import { computeVerdict } from "./verdict";
import type {
  AdvanceResult,
  AppliedAnalogInputEvent,
  AppliedInput,
  AppliedInputEvent,
  BridgeError,
  CampaignResult,
  CampaignState,
  Diagnostic,
  Fixture,
  OutputEvent,
  PeripheralDiagnostic,
  RunResult,
  ScheduledInput,
  SliceProgress,
} from "./types";
import type { CampaignError } from "./errors";

export type BridgeFactory = (
  hex: string,
  fixture: Fixture,
  events: ScheduledInput[],
) => EmulatorBridgeInterface | BridgeError;

/** Fully resolved settings for one Run. */
export interface RunConfig {
  hex: string;
  fixture: Fixture;
  gremlinSet: readonly GremlinSpec[];
  campaignSeed: number;
  checker: Checker;
  runCycles: number;
  maxStepCycles: number;
  /** Defaults to EmulatorBridge.create. */
  bridgeFactory?: BridgeFactory;
}

const defaultBridgeFactory: BridgeFactory = (hex, fixture, events) =>
  EmulatorBridge.create(hex, fixture, events);

function internal(message: string): EngineError {
  return { kind: "internal-error", message };
}

/**
 * Rebuilds one ordered AppliedInput list for a Step. The bridge applies events
 * in the order of the list it was given, so the Step's `n` applied entries
 * belong to events[appliedCount .. appliedCount + n). Each event takes the next
 * entry from the analog or digital array. Both arrays must be consumed exactly,
 * otherwise `internal-error`.
 */
export function mergeApplied(
  events: readonly GeneratedEvent[],
  appliedCount: number,
  r: Pick<AdvanceResult, "appliedInputs" | "appliedAnalogInputs">,
): AppliedInput[] | EngineError {
  const digital = r.appliedInputs;
  const analog = r.appliedAnalogInputs;
  const n = digital.length + analog.length;
  if (appliedCount < 0 || appliedCount + n > events.length) {
    return internal(
      `applied-entry merge mismatch: ${n} applied after ${appliedCount} of ${events.length} events`,
    );
  }
  const merged: AppliedInput[] = [];
  let di = 0;
  let ai = 0;
  for (let k = 0; k < n; k++) {
    const ev = events[appliedCount + k];
    if ("analog" in ev) {
      if (ai >= analog.length) return internal("applied-entry merge mismatch: analog entries exhausted");
      const a: AppliedAnalogInputEvent = analog[ai++];
      if (a.signal !== ev.signal) return internal("applied-entry merge mismatch: analog signal differs");
      merged.push(a);
    } else {
      if (di >= digital.length) return internal("applied-entry merge mismatch: digital entries exhausted");
      const d: AppliedInputEvent = digital[di++];
      if (d.signal !== ev.signal) return internal("applied-entry merge mismatch: digital signal differs");
      merged.push(d);
    }
  }
  if (di !== digital.length || ai !== analog.length) {
    return internal("applied-entry merge mismatch: entries left over");
  }
  return merged;
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

/** The RunConfig fields the Run_Path reads. A RunConfig is a RunPathConfig. */
export type RunPathConfig = Pick<
  RunConfig,
  "hex" | "fixture" | "checker" | "runCycles" | "maxStepCycles" | "bridgeFactory"
>;

/** The Run_Path part of a RunResult. */
export interface RunPathResult {
  appliedInputs: AppliedInput[];
  outputEvents: OutputEvent[];
  diagnostics: Diagnostic[];
  cannotCheck: CannotCheck[];
  violation: Violation | null;
  endCycle: number;
  /** Unmodelled-peripheral uses, ascending cycle. Present only when non-empty. */
  peripheralUses?: PeripheralDiagnostic[];
}

/**
 * The Run_Path: one ordered event list on a fresh bridge, stopping at the earliest
 * Violation, with one end-of-run Checker call when none was found. runOne calls this
 * after buildEventList; the trace reducer calls it with a candidate event list.
 */
export function runEventList(
  cfg: RunPathConfig,
  events: readonly GeneratedEvent[],
  runIndex: number,
): RunPathResult | EngineError {
  const factory = cfg.bridgeFactory ?? defaultBridgeFactory;
  const made = factory(cfg.hex, cfg.fixture, events.slice());
  if (isBridgeError(made)) {
    return { kind: "bridge-error", runIndex, error: made, message: made.message };
  }
  const bridge = made;

  const appliedInputs: AppliedInput[] = [];
  const outputEvents: OutputEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const cannotCheck: CannotCheck[] = [];
  const peripheralUses: PeripheralDiagnostic[] = [];
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
    for (let i = appliedCount; i < events.length; i++) pending.push(events[i].cycle);
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
    const merged = mergeApplied(events, appliedCount, r);
    if (isEngineError(merged)) return merged;
    appliedCount += merged.length;
    appliedInputs.push(...merged);
    outputEvents.push(...r.outputEvents);
    diagnostics.push(...r.diagnostics);
    if (r.peripheralUses !== undefined) peripheralUses.push(...r.peripheralUses);

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

  const out: RunPathResult = { appliedInputs, outputEvents, diagnostics, cannotCheck, violation, endCycle: bridge.cycleCount };
  if (peripheralUses.length > 0) out.peripheralUses = peripheralUses;
  return out;
}

/** Runs one Run on a fresh bridge. Returns plain data, or an error that stops the Campaign. */
export function runOne(cfg: RunConfig, runIndex: number): RunResult | EngineError {
  const gen = buildEventList({
    fixture: cfg.fixture,
    gremlinSet: cfg.gremlinSet,
    runCycles: cfg.runCycles,
    campaignSeed: cfg.campaignSeed,
    runIndex,
  });
  if (isEngineError(gen)) return gen;

  const path = runEventList(cfg, gen.events, runIndex);
  if (isEngineError(path)) return path;

  return {
    runIndex,
    runSeed: gen.runSeed,
    eventList: gen.events.map((e) => ({ ...e })),
    skipped: gen.skipped.map((s) => ({ ...s })),
    appliedInputs: path.appliedInputs,
    outputEvents: path.outputEvents,
    diagnostics: path.diagnostics,
    cannotCheck: path.cannotCheck,
    violation: path.violation,
    endCycle: path.endCycle,
    ...(path.peripheralUses === undefined ? {} : { peripheralUses: path.peripheralUses.map((d) => ({ ...d })) }),
  };
}

// ---------------------------------------------------------------------------
// Campaign handle and slices
// ---------------------------------------------------------------------------

export const DEFAULT_RUNS = 64;
export const DEFAULT_RUN_CYCLES = 8_000_000;
export const DEFAULT_MAX_STEP_CYCLES = 160_000;
/** Largest valid Run_Cycles (2^32), inclusive. */
export const MAX_RUN_CYCLES = 4_294_967_296;

export interface CampaignConfig {
  hex: string;
  fixture: Fixture;
  gremlinSet: readonly GremlinSpec[];
  campaignSeed: number;
  checker: Checker;
  /** N, default 64. */
  runs?: number;
  /** Default: defaultRunCycles, else 8,000,000. */
  runCycles?: number;
  /** The selected example's Run_Cycles. */
  defaultRunCycles?: number;
  /** Default true. */
  stopOnFirstViolation?: boolean;
  /** Default 160,000. */
  maxStepCycles?: number;
  /** Signals the Checker names, for the unmapped-signal verdict. */
  checkerSignals?: readonly string[];
  /** Returns the Canonical_Sentences of Untriggered_Rules for the completed Runs. Called once, when the Campaign finishes. */
  findUntriggeredRules?: (runs: readonly RunResult[]) => readonly string[];
  /** Test seam, default EmulatorBridge.create. */
  bridgeFactory?: BridgeFactory;
}

export interface CampaignHandle {
  runSlice(k: number): SliceProgress | CampaignError;
  /** Plain data copy of { nextRunIndex, runs }. */
  state(): CampaignState;
}

interface ResolvedCampaign {
  n: number;
  runCycles: number;
  maxStepCycles: number;
  stopOnFirstViolation: boolean;
}

function invalidCampaign(message: string): EngineError {
  return { kind: "invalid-campaign", message };
}

function isPositiveInteger(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 1;
}

/** Validates the settings and fills defaults. No generator or bridge is touched. */
function resolveSettings(config: CampaignConfig): ResolvedCampaign | EngineError {
  const n = config.runs ?? DEFAULT_RUNS;
  if (!isPositiveInteger(n)) return invalidCampaign(`runs must be a positive integer, got ${String(n)}`);

  const runCycles = config.runCycles ?? config.defaultRunCycles ?? DEFAULT_RUN_CYCLES;
  if (typeof runCycles !== "number" || !Number.isInteger(runCycles) || runCycles < 1 || runCycles > MAX_RUN_CYCLES) {
    return invalidCampaign(
      `runCycles must be an integer from 1 to ${MAX_RUN_CYCLES}, got ${String(runCycles)}`,
    );
  }

  const maxStepCycles = config.maxStepCycles ?? DEFAULT_MAX_STEP_CYCLES;
  if (!isPositiveInteger(maxStepCycles)) {
    return invalidCampaign(`maxStepCycles must be a positive integer, got ${String(maxStepCycles)}`);
  }

  const stop = config.stopOnFirstViolation ?? true;
  if (typeof stop !== "boolean") {
    return invalidCampaign("stopOnFirstViolation must be a boolean");
  }
  return { n, runCycles, maxStepCycles, stopOnFirstViolation: stop };
}

/** Builds one bridge from the HEX and Fixture with no events, then drops it. */
function probeBridge(config: CampaignConfig): BridgeError | null {
  const factory = config.bridgeFactory ?? defaultBridgeFactory;
  const made = factory(config.hex, config.fixture, []);
  return isBridgeError(made) ? made : null;
}

function unmappedSignals(config: CampaignConfig): string[] {
  const known = new Set(config.fixture.pins.map((p) => p.signal));
  const out: string[] = [];
  for (const s of config.checkerSignals ?? []) {
    if (!known.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function earliestViolation(runs: readonly RunResult[]): number | null {
  let best: number | null = null;
  for (const r of runs) {
    if (r.violation !== null && (best === null || r.runIndex < best)) best = r.runIndex;
  }
  return best;
}

function makeHandle(
  config: CampaignConfig,
  settings: ResolvedCampaign,
  initial: CampaignState,
): CampaignHandle {
  const runs: RunResult[] = initial.runs.map((r) => structuredClone(r));
  let failure: EngineError | null = null;
  const unmapped = unmappedSignals(config);

  const isFinished = (): boolean =>
    runs.length >= settings.n || (settings.stopOnFirstViolation && earliestViolation(runs) !== null);

  // Memo of the Untriggered_Rule list, kept once per handle.
  let untriggered: readonly string[] | undefined = undefined;

  const resolveUntriggered = (): readonly string[] | undefined | EngineError => {
    const find = config.findUntriggeredRules;
    if (find === undefined) return undefined;
    if (untriggered !== undefined) return untriggered;
    let out: unknown;
    try {
      out = find(structuredClone(runs));
    } catch {
      return internal("untriggered-rule function failed: it threw");
    }
    if (!Array.isArray(out) || out.some((s) => typeof s !== "string")) {
      return internal(
        "untriggered-rule function failed: it returned a value that is not an array of strings",
      );
    }
    untriggered = (out as string[]).slice();
    return untriggered;
  };

  const progress = (): SliceProgress | EngineError => {
    const finished = isFinished();
    let result: CampaignResult | null = null;
    if (finished) {
      const u = resolveUntriggered();
      if (u !== undefined && isEngineError(u)) {
        failure = u;
        return u;
      }
      const verdict = computeVerdict({
        requestedRuns: settings.n,
        runs,
        finished: true,
        unmappedSignals: unmapped,
        unsupportedPeripherals: [],
        ...(u === undefined ? {} : { untriggeredRules: u as readonly string[] }),
      });
      if (verdict !== null) {
        result = {
          runsCompleted: runs.length,
          requestedRuns: settings.n,
          violatingRunIndex: earliestViolation(runs),
          verdict,
        };
      }
    }
    return {
      runsCompleted: runs.length,
      total: settings.n,
      finished,
      nextRunIndex: runs.length,
      runs: structuredClone(runs),
      result,
    };
  };

  const runCfg: RunConfig = {
    hex: config.hex,
    fixture: config.fixture,
    gremlinSet: config.gremlinSet,
    campaignSeed: config.campaignSeed,
    checker: config.checker,
    runCycles: settings.runCycles,
    maxStepCycles: settings.maxStepCycles,
    bridgeFactory: config.bridgeFactory,
  };

  return {
    runSlice(k: number): SliceProgress | CampaignError {
      if (!isPositiveInteger(k)) {
        return invalidCampaign(`slice size must be a positive integer, got ${String(k)}`);
      }
      if (failure !== null) return failure;
      if (isFinished()) return progress();

      const count = Math.min(k, settings.n - runs.length);
      for (let j = 0; j < count; j++) {
        const out = runOne(runCfg, runs.length);
        if (isEngineError(out)) {
          failure = out;
          return out;
        }
        runs.push(out);
        if (settings.stopOnFirstViolation && out.violation !== null) break;
      }
      return progress();
    },
    state(): CampaignState {
      return { nextRunIndex: runs.length, runs: structuredClone(runs) };
    },
  };
}

export function createCampaign(config: CampaignConfig): CampaignHandle | CampaignError {
  const settings = resolveSettings(config);
  if (isEngineError(settings)) return settings;
  const bad = probeBridge(config);
  if (bad !== null) return bad;
  return makeHandle(config, settings, { nextRunIndex: 0, runs: [] });
}

export function resumeCampaign(config: CampaignConfig, state: CampaignState): CampaignHandle | CampaignError {
  const settings = resolveSettings(config);
  if (isEngineError(settings)) return settings;

  const runs = (state as { runs?: unknown } | null)?.runs;
  if (!Array.isArray(runs)) return invalidCampaign("resume state has no runs list");
  if (state.nextRunIndex !== runs.length) {
    return invalidCampaign(`resume nextRunIndex ${String(state.nextRunIndex)} does not equal ${runs.length} stored runs`);
  }
  if (runs.length > settings.n) {
    return invalidCampaign(`resume state holds ${runs.length} runs, more than the requested ${settings.n}`);
  }
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i] as RunResult | null;
    if (typeof r !== "object" || r === null || r.runIndex !== i) {
      return invalidCampaign(`resume run at position ${i} does not carry runIndex ${i}`);
    }
    if (settings.stopOnFirstViolation && r.violation !== null && i !== runs.length - 1) {
      return invalidCampaign(`resume run ${i} has a violation but later runs are stored`);
    }
  }

  const bad = probeBridge(config);
  if (bad !== null) return bad;
  return makeHandle(config, settings, state);
}

/** createCampaign, then one slice of N. Returns the final result. */
export function runCampaign(config: CampaignConfig): CampaignResult | CampaignError {
  const handle = createCampaign(config);
  if ("runSlice" in handle) {
    const n = resolveSettings(config) as ResolvedCampaign;
    const p = handle.runSlice(n.n);
    if ("runsCompleted" in p) {
      return p.result ?? internal("campaign did not finish after a slice of N runs");
    }
    return p;
  }
  return handle;
}
