// Shared test helpers for the example firmware tests (types, loaders, constants).
// Reads files only. No wall clock, no randomness.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AppliedInput,
  CampaignResult,
  Fixture,
  OutputEvent,
  PinValue,
  RunResult,
  ScheduledInput,
} from "../../src/engine/types";
import type { SkippedEntry } from "../../src/engine/event-list";
import type { GremlinSpec } from "../../src/engine/gremlins/catalogue";
import type { GeneratedEvent } from "../../src/engine/gremlins/generate-types";
import type { Condition, Rule, RuleSet } from "../../src/engine/rules/ir";
import { readRulesFile } from "../../src/engine/rules/rules-file";
import { buildCampaignConfig } from "../../src/engine/rules/config-builder";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { createCampaign, mergeApplied } from "../../src/engine/campaign";
import type { CannotCheck, Violation } from "../../src/engine/checker";
import { EmulatorBridge, isBridgeError } from "../../src/engine/emulator-bridge";
import { isEngineError } from "../../src/engine/errors";
import { checkPlanInput, planTarget } from "../../src/engine/step-plan";

export type ExampleId = "crosswalk" | "garage" | "heartbeat" | "heater";
export type Variant = "buggy" | "fixed";

export interface ExampleMeta {
  title: string;
  story: string;
  timingNote: string;
  gremlinSet: GremlinSpec[];
  runCycles: number;
  campaignSeed: number;
  runs: number;
  /** crosswalk only */
  doublePressWindowStartMs?: number;
  /** crosswalk only */
  doublePressWindowEndMs?: number;
}

export interface LoadedExample {
  id: ExampleId;
  fixture: Fixture;
  rulesText: string;
  ruleSet: RuleSet;
  lines: string[];
  meta: ExampleMeta;
}

export interface CampaignOutcome {
  result: CampaignResult; // SliceProgress.result, the shape runCampaign returns
  runs: RunResult[]; // SliceProgress.runs
  durationMs?: number; // set only when the caller passed a clock function; test output only
}

export interface ScriptedOutcome {
  violations: { rule: string; cycle: number }[]; // in report order; [0] is the earliest
  cannotCheck: { rule: string; reason: string }[];
  outputEdges: OutputEvent[];
  diagnostics: { kind: string; signal: string; cycle: number }[];
  endCycle: number;
  /** Applied inputs in application order (added in 3.3; the design text says the run returns them). */
  appliedInputs: AppliedInput[];
}

export interface SpanResult {
  v: number;
  end: number;
  spanCycles: number;
  cutByReplayEnd: boolean;
}

/** Hand-written inputs; gremlinId is "script". */
export type ScriptedEvents = ScheduledInput[];

// ---------------------------------------------------------------------------
// Constants

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const EXAMPLES_DIR = resolve(ROOT, "examples");

export const TEST_TIMEOUT_MS = 120_000;
export const cyclesPerMs = 16_000;

/** Replay_End: 2 ms (32,000 cycles) past the campaign's run end. */
export function replayEnd(meta: ExampleMeta): number {
  return meta.runCycles + 32_000;
}

// ---------------------------------------------------------------------------
// Typed errors

/** Bad or missing Example data. Names the Example id and the file. */
export class ExampleDataError extends Error {
  readonly exampleId: string;
  readonly file: string;
  readonly detail: string;
  constructor(exampleId: string, file: string, detail: string) {
    super(`examples/${exampleId}/${file}: ${detail}`);
    this.name = "ExampleDataError";
    this.exampleId = exampleId;
    this.file = file;
    this.detail = detail;
  }
}

/** The Build_HEX is missing. */
export class MissingHexError extends Error {
  readonly exampleId: string;
  readonly variant: Variant;
  constructor(exampleId: string, variant: Variant) {
    super(
      `Missing Build_HEX examples/${exampleId}/${variant}/${variant}.hex. Run \`npm run examples:build\` and commit the result.`,
    );
    this.name = "MissingHexError";
    this.exampleId = exampleId;
    this.variant = variant;
  }
}

// ---------------------------------------------------------------------------
// Loaders

/** The Example directories that exist under `root` (default: examples/), sorted. */
export function exampleIds(root: string = EXAMPLES_DIR): ExampleId[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort() as ExampleId[];
}

function readText(root: string, id: string, file: string): string {
  const path = resolve(root, id, file);
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    throw new ExampleDataError(id, file, `cannot read the file (${(e as Error).message})`);
  }
}

function parseJson(root: string, id: string, file: string): unknown {
  const text = readText(root, id, file);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ExampleDataError(id, file, `not valid JSON (${(e as Error).message})`);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function metaString(id: string, m: Record<string, unknown>, field: string): string {
  const v = m[field];
  if (typeof v !== "string") throw new ExampleDataError(id, "meta.json", `field "${field}" must be a string`);
  return v;
}

function metaInt(id: string, m: Record<string, unknown>, field: string, min: number): number {
  const v = m[field];
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
    throw new ExampleDataError(id, "meta.json", `field "${field}" must be an integer of at least ${min}`);
  }
  return v;
}

function metaOptionalNumber(id: string, m: Record<string, unknown>, field: string): number | undefined {
  const v = m[field];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ExampleDataError(id, "meta.json", `field "${field}" must be a number`);
  }
  return v;
}

function parseMeta(id: string, raw: unknown): ExampleMeta {
  if (!isRecord(raw)) throw new ExampleDataError(id, "meta.json", "must be a JSON object");
  const title = metaString(id, raw, "title");
  const story = metaString(id, raw, "story");
  const timingNote = metaString(id, raw, "timingNote");
  const gs = raw["gremlinSet"];
  if (!Array.isArray(gs) || gs.length === 0) {
    throw new ExampleDataError(id, "meta.json", `field "gremlinSet" must be a non-empty array`);
  }
  for (const g of gs) {
    if (!isRecord(g) || typeof g["id"] !== "string") {
      throw new ExampleDataError(id, "meta.json", `field "gremlinSet" entries must be objects with a string "id"`);
    }
  }
  const meta: ExampleMeta = {
    title,
    story,
    timingNote,
    gremlinSet: gs as GremlinSpec[],
    runCycles: metaInt(id, raw, "runCycles", 1),
    campaignSeed: metaInt(id, raw, "campaignSeed", 0),
    runs: metaInt(id, raw, "runs", 1),
  };
  const start = metaOptionalNumber(id, raw, "doublePressWindowStartMs");
  const end = metaOptionalNumber(id, raw, "doublePressWindowEndMs");
  if (start !== undefined) meta.doublePressWindowStartMs = start;
  if (end !== undefined) meta.doublePressWindowEndMs = end;
  return meta;
}

/** Rule lines as readRulesFile sees them: split on LF, drop a trailing CR, skip blank and `#` lines. */
function ruleLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (/^[ \t]*$/.test(line) || line.startsWith("#")) continue;
    out.push(line);
  }
  return out;
}

/**
 * Parses fixture.json and meta.json and reads rules.txt with readRulesFile.
 * Throws ExampleDataError (naming the Example id and the file) on any problem,
 * so a bad meta never reaches a campaign. `root` (default: examples/) lets a test point at a temp folder.
 * The Fixture is not validated here: buildCampaignConfig and scriptedRun both go through compileRuleSet,
 * which calls validateFixture.
 */
export function loadExample(id: ExampleId, root: string = EXAMPLES_DIR): LoadedExample {
  const rawFixture = parseJson(root, id, "fixture.json");
  if (!isRecord(rawFixture) || !Array.isArray(rawFixture["pins"])) {
    throw new ExampleDataError(id, "fixture.json", `must be an object with a "pins" array`);
  }
  const fixture = rawFixture as unknown as Fixture;

  const meta = parseMeta(id, parseJson(root, id, "meta.json"));

  const rulesText = readText(root, id, "rules.txt");
  const read = readRulesFile(rulesText);
  if (!read.ok) {
    throw new ExampleDataError(id, "rules.txt", `cannot be read as rules: ${read.reasons.join(" | ")}`);
  }

  return { id, fixture, rulesText, ruleSet: read.ruleSet, lines: ruleLines(rulesText), meta };
}

/**
 * Loads the Build_HEX text exactly as it is on disk. Line endings are not changed
 * (a Windows working copy may hold CRLF where git stores LF).
 */
export function readHex(id: ExampleId, variant: Variant): string {
  const path = resolve(EXAMPLES_DIR, id, variant, `${variant}.hex`);
  if (!existsSync(path)) throw new MissingHexError(id, variant);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new MissingHexError(id, variant);
  }
}

// ---------------------------------------------------------------------------
// Campaign runner

function describeCampaignError(e: unknown): string {
  if (typeof e === "object" && e !== null) {
    const o = e as { kind?: unknown; message?: unknown };
    if (typeof o.message === "string") return typeof o.kind === "string" ? `${o.kind}: ${o.message}` : o.message;
  }
  return String(e);
}

/**
 * Runs one Example_Campaign: buildCampaignConfig, createCampaign, then exactly one runSlice(meta.runs).
 * Throws, naming the Example and the build, when the config cannot be built, the engine returns a
 * CampaignError, or the result is null. Never runs a second slice.
 *
 * `clock` is optional. Only the Fixed_Sketch campaign test passes one. When given, it is called
 * immediately before createCampaign and immediately after runSlice, and the rounded difference is
 * returned as durationMs. When not given, nothing is called and no durationMs is returned.
 */
export function runExampleCampaign(ex: LoadedExample, variant: Variant, clock?: () => number): CampaignOutcome {
  const where = `Example ${ex.id}, ${variant} build`;
  const hex = readHex(ex.id, variant);
  const built = buildCampaignConfig(ex.ruleSet, ex.fixture, {
    hex,
    gremlinSet: ex.meta.gremlinSet,
    campaignSeed: ex.meta.campaignSeed,
    runs: ex.meta.runs,
    runCycles: ex.meta.runCycles,
  });
  if (!built.ok) {
    throw new Error(`${where}: the campaign config could not be built. Reasons: ${built.reasons.join(" | ")}`);
  }

  const t0 = clock !== undefined ? clock() : undefined;
  const handle = createCampaign(built.config);
  if (!("runSlice" in handle)) {
    throw new Error(`${where}: createCampaign returned an error. ${describeCampaignError(handle)}`);
  }
  const progress = handle.runSlice(ex.meta.runs);
  const t1 = clock !== undefined ? clock() : undefined;
  if (!("finished" in progress)) {
    throw new Error(`${where}: runSlice returned an error. ${describeCampaignError(progress)}`);
  }
  if (progress.result === null) {
    throw new Error(
      `${where}: runSlice(${ex.meta.runs}) finished no campaign (runsCompleted ${progress.runsCompleted} of ${progress.total}); the result is null.`,
    );
  }

  const outcome: CampaignOutcome = { result: progress.result, runs: progress.runs };
  if (t0 !== undefined && t1 !== undefined) outcome.durationMs = Math.round(t1 - t0);
  return outcome;
}

// ---------------------------------------------------------------------------
// Scripted_Run, event-list builder, Replay_Run

/** The step size of the engine's runOne loop (DEFAULT_MAX_STEP_CYCLES). */
const MAX_STEP_CYCLES = 160_000;

function describeBridgeError(e: unknown): string {
  return describeCampaignError(e);
}

/**
 * Builds a scripted event list: Rest_Events (gremlinId "rest", cycle 0) for every digital input
 * with restState "active" first, in Fixture order, then the hand-written events in the given
 * order with gremlinId "script" (a gremlinId already set is kept). Rejects any hand-written cycle
 * that is not an integer from 0 to runCycles - 1, and any cycle that is lower than the one before it.
 */
export function buildScriptedEvents(
  fixture: Fixture,
  events: ScriptedEvents,
  runCycles: number,
): GeneratedEvent[] {
  const out: GeneratedEvent[] = [];
  for (const pin of fixture.pins) {
    if (pin.kind === "analog" || pin.direction !== "input" || pin.restState !== "active") continue;
    out.push({ signal: pin.signal, value: pin.activeLevel === "high" ? 1 : 0, cycle: 0, gremlinId: "rest" });
  }
  let prev = 0;
  events.forEach((e, i) => {
    if (!Number.isInteger(e.cycle) || e.cycle < 0 || e.cycle >= runCycles) {
      throw new Error(
        `scripted event ${i} (${e.signal}): cycle ${String(e.cycle)} is not an integer from 0 to ${runCycles - 1}`,
      );
    }
    if (e.cycle < prev) {
      throw new Error(
        `scripted event ${i} (${e.signal}): cycle ${e.cycle} is lower than the cycle ${prev} before it`,
      );
    }
    prev = e.cycle;
    out.push({ ...e, gremlinId: e.gremlinId ?? "script" });
  });
  return out;
}

/**
 * One Scripted_Run: a fresh bridge and a fresh Rule_Checker, stepped like the engine's runOne.
 * `events` is the list from buildScriptedEvents. `opts.untilEnd` false: the run stops at the first
 * Violation, as runOne does. `opts.untilEnd` true: it keeps stepping to endCycle and collects every
 * Violation in report order, so violations[0] is the earliest.
 */
export function scriptedRun(
  ex: LoadedExample,
  variant: Variant,
  events: readonly ScheduledInput[],
  endCycle: number,
  opts: { untilEnd: boolean },
): ScriptedOutcome {
  const where = `Example ${ex.id}, ${variant} build, Scripted_Run`;
  const hex = readHex(ex.id, variant);
  const compiled = compileRuleSet(ex.ruleSet, ex.fixture);
  if (!compiled.ok) throw new Error(`${where}: the rules did not compile. Reasons: ${compiled.reasons.join(" | ")}`);
  const checker = compiled.compiled.checker;

  const list: GeneratedEvent[] = events.map((e) => ({ ...e, gremlinId: e.gremlinId ?? "script" }));
  const bridge = EmulatorBridge.create(hex, ex.fixture, list.map((e) => ({ ...e })));
  if (isBridgeError(bridge)) throw new Error(`${where}: the bridge could not start. ${describeBridgeError(bridge)}`);

  const keepGoing = opts.untilEnd;
  const violations: { rule: string; cycle: number }[] = [];
  const cannotCheck: CannotCheck[] = [];
  const seenCannot = new Set<string>();
  const outputEdges: OutputEvent[] = [];
  const diagnostics: { kind: string; signal: string; cycle: number }[] = [];
  const appliedInputs: AppliedInput[] = [];
  let prevTarget = 0;
  let appliedCount = 0;
  let stepIndex = 0;
  let stopped = false;

  const take = (res: { violation: Violation | null; cannotCheck?: readonly CannotCheck[] }): boolean => {
    for (const c of res.cannotCheck ?? []) {
      const key = JSON.stringify([c.rule, c.reason]);
      if (seenCannot.has(key)) continue;
      seenCannot.add(key);
      cannotCheck.push({ rule: c.rule, reason: c.reason });
    }
    if (res.violation === null) return false;
    violations.push({ rule: res.violation.rule, cycle: res.violation.cycle });
    return true;
  };

  while (bridge.cycleCount < endCycle) {
    const before = bridge.cycleCount;
    const pending: number[] = [];
    for (let i = appliedCount; i < list.length; i++) pending.push(list[i].cycle);
    const planInput = {
      prevTarget,
      cycleCount: before,
      pendingCycles: pending,
      runCycles: endCycle,
      maxStepCycles: MAX_STEP_CYCLES,
    };
    const planErr = checkPlanInput(planInput);
    if (planErr) throw new Error(`${where}: ${planErr.message}`);
    const target = planTarget(planInput);
    const r = bridge.advance(target - before);
    if (isBridgeError(r)) throw new Error(`${where}: advance failed. ${describeBridgeError(r)}`);
    if (bridge.cycleCount <= before) throw new Error(`${where}: bridge did not advance at cycle ${before}`);
    prevTarget = target;
    const merged = mergeApplied(list, appliedCount, r);
    if (isEngineError(merged)) throw new Error(`${where}: ${merged.message}`);
    appliedCount += merged.length;
    appliedInputs.push(...merged);
    outputEdges.push(...r.outputEvents);
    for (const d of r.diagnostics) diagnostics.push({ kind: d.kind, signal: d.signal, cycle: d.cycle });

    const res = checker({
      runIndex: 0,
      stepIndex: stepIndex++,
      endOfRun: false,
      cycle: bridge.cycleCount,
      outputEvents: Object.freeze(r.outputEvents.slice()),
      appliedInputs: Object.freeze(merged.slice()),
      diagnostics: Object.freeze(r.diagnostics.slice()),
    });
    if (take(res) && !keepGoing) {
      stopped = true;
      break;
    }
  }

  if (!stopped) {
    const res = checker({
      runIndex: 0,
      stepIndex: stepIndex++,
      endOfRun: true,
      cycle: bridge.cycleCount,
      outputEvents: Object.freeze([]),
      appliedInputs: Object.freeze([]),
      diagnostics: Object.freeze([]),
    });
    take(res);
  }

  return { violations, cannotCheck, outputEdges, diagnostics, endCycle: bridge.cycleCount, appliedInputs };
}

/**
 * Replay_Run: a fresh bridge with the same HEX, Fixture and ordered event list, advanced in steps
 * of at most 160,000 cycles until cycleCount >= endCycle. Returns every Output_Edge. No checker,
 * no snapshot.
 */
export function replayRun(
  hex: string,
  fixture: Fixture,
  eventList: readonly ScheduledInput[],
  endCycle: number,
): OutputEvent[] {
  const bridge = EmulatorBridge.create(hex, fixture, eventList.map((e) => ({ ...e })));
  if (isBridgeError(bridge)) throw new Error(`Replay_Run: the bridge could not start. ${describeBridgeError(bridge)}`);
  const edges: OutputEvent[] = [];
  while (bridge.cycleCount < endCycle) {
    const before = bridge.cycleCount;
    const r = bridge.advance(Math.min(MAX_STEP_CYCLES, endCycle - before));
    if (isBridgeError(r)) throw new Error(`Replay_Run: advance failed. ${describeBridgeError(r)}`);
    if (bridge.cycleCount <= before) throw new Error(`Replay_Run: bridge did not advance at cycle ${before}`);
    edges.push(...r.outputEvents);
  }
  return edges;
}

export interface PrefixMismatch {
  index: number;
  /** The entry of the trace; undefined cannot happen for an index inside the trace. */
  expected: OutputEvent;
  /** The Replay_Run entry at that index; undefined when the replay is shorter. */
  actual: OutputEvent | undefined;
}

/**
 * Compares the leading traceOutputEvents.length entries of `edges` with the trace entry for entry.
 * Returns the earliest differing index with both entries, or null.
 */
export function comparePrefix(
  traceOutputEvents: readonly OutputEvent[],
  edges: readonly OutputEvent[],
): PrefixMismatch | null {
  for (let i = 0; i < traceOutputEvents.length; i++) {
    const t = traceOutputEvents[i];
    const a = edges[i];
    if (a === undefined || a.signal !== t.signal || a.value !== t.value || a.cycle !== t.cycle) {
      return { index: i, expected: t, actual: a };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pure edge-list helpers (Output_Levels, Violation_Span, overlap, Door_State)

type Levels = Map<string, PinValue>;

/** Output_Edges in cycle order. The sort is stable, so edges at one cycle keep their list order. */
function sortedByCycle(edges: readonly OutputEvent[]): OutputEvent[] {
  return edges.map((e, i) => ({ e, i })).sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i).map((x) => x.e);
}

/**
 * Output_Level(s, t): the value of the last Output_Edge of `signal` with cycle <= t, with every edge
 * at cycle t applied in list order. undefined when the signal has no such edge. Values are 0, 1 or
 * "input"; "input" is neither 0 nor 1.
 */
export function outputLevelAt(signal: string, t: number, edges: readonly OutputEvent[]): PinValue | undefined {
  let best: OutputEvent | undefined;
  for (const e of edges) {
    if (e.signal !== signal || e.cycle > t) continue;
    if (best === undefined || e.cycle >= best.cycle) best = e;
  }
  return best?.value;
}

/** Condition on Output_Levels, with the meaning of evalCondition in src/engine/rules/trace.ts. */
function holds(c: Condition, levels: Levels): boolean {
  switch (c.op) {
    case "eq":
      return levels.get(c.signal) === c.value;
    case "above":
    case "below":
      return false; // outputs never hold a number
    case "all":
      return c.of.every((m) => holds(m, levels));
    case "any":
      return c.of.some((m) => holds(m, levels));
  }
}

/**
 * Violation_Span by the rule of design.md section 7. E is the set of edge cycles e with v < e < M.
 * The end is the smallest e in E at which the end test holds on Output_Levels at e; otherwise the end
 * is M and the span is cut by the Replay_End. The span is [v, end). Edges at or after M are ignored.
 * End tests: never and notLongerThan: the Condition is false. respond: the expect Condition is true.
 */
export function violationSpan(rule: Rule, v: number, edges: readonly OutputEvent[], M: number): SpanResult {
  let endTest: (levels: Levels) => boolean;
  switch (rule.form) {
    case "never":
    case "notLongerThan":
      endTest = (l) => !holds(rule.condition, l);
      break;
    case "respond":
      endTest = (l) => holds(rule.expect, l);
      break;
    default:
      throw new Error(`violationSpan: the rule form "${rule.form}" has no end test in design.md section 7`);
  }
  const sorted = sortedByCycle(edges);
  const levels: Levels = new Map();
  let i = 0;
  while (i < sorted.length && sorted[i].cycle <= v) {
    levels.set(sorted[i].signal, sorted[i].value);
    i++;
  }
  while (i < sorted.length && sorted[i].cycle < M) {
    const c = sorted[i].cycle;
    while (i < sorted.length && sorted[i].cycle === c) {
      levels.set(sorted[i].signal, sorted[i].value);
      i++;
    }
    if (endTest(levels)) return { v, end: c, spanCycles: c - v, cutByReplayEnd: false };
  }
  return { v, end: M, spanCycles: M - v, cutByReplayEnd: true };
}

/** `span <id> | <Canonical_Sentence> | v=<v> | <span> cycles | <ms> ms | cut by replay end: <yes|no>` */
export function spanLine(id: string, sentence: string, span: SpanResult): string {
  const ms = (span.spanCycles / cyclesPerMs).toFixed(3);
  return `span ${id} | ${sentence} | v=${span.v} | ${span.spanCycles} cycles | ${ms} ms | cut by replay end: ${span.cutByReplayEnd ? "yes" : "no"}`;
}

/** The earliest cycle at which both Output_Levels of `pair` are 1 (edges at one cycle applied together), or null. */
export function bothOnAt(pair: readonly [string, string], edges: readonly OutputEvent[]): number | null {
  const sorted = sortedByCycle(edges);
  const levels: Levels = new Map();
  let i = 0;
  while (i < sorted.length) {
    const c = sorted[i].cycle;
    while (i < sorted.length && sorted[i].cycle === c) {
      levels.set(sorted[i].signal, sorted[i].value);
      i++;
    }
    if (levels.get(pair[0]) === 1 && levels.get(pair[1]) === 1) return c;
  }
  return null;
}

export type DoorState = "open" | "closing" | "opening" | "closed";

export interface DoorStateChange {
  cycle: number;
  from: DoorState;
  to: DoorState;
}

/** An edge pattern outside the four of design.md section 4.2. Names the cycles and edges. */
export class DoorPatternError extends Error {
  readonly cycles: number[];
  constructor(reason: string, edges: readonly OutputEvent[]) {
    const cycles = edges.map((e) => e.cycle);
    super(
      `garage Door_State: ${reason}. Cycles ${cycles.join(", ")}; edges ${edges
        .map((e) => `${e.signal}=${String(e.value)}@${e.cycle}`)
        .join(", ")}`,
    );
    this.name = "DoorPatternError";
    this.cycles = cycles;
  }
}

const DOOR_WINDOW_CYCLES = 1_000;

/**
 * The garage Door_State reading of design.md section 4.2. The reset state is `open`. A change is one
 * of four edge patterns, each within a 1,000-cycle window of its first edge:
 *   open or closed to closing:  MOTOR_CLOSE rises, LAMP rises
 *   opening to closing:         MOTOR_OPEN falls, MOTOR_CLOSE rises (LAMP stays 1)
 *   closing to opening:         MOTOR_CLOSE falls, MOTOR_OPEN rises (LAMP stays 1)
 *   closing to closed:          MOTOR_CLOSE falls, LAMP falls
 *   opening to open:            MOTOR_OPEN falls, LAMP falls
 * Edges that do not change a level (the first level of a pin, or "input" to 0) are not a pattern.
 * Any other change throws DoorPatternError.
 */
export function doorStateChanges(edges: readonly OutputEvent[]): DoorStateChange[] {
  const list = sortedByCycle(edges);
  const used = new Array<boolean>(list.length).fill(false);
  const levels: Levels = new Map();
  const out: DoorStateChange[] = [];
  let state = "open" as DoorState;

  /** Index of the next unused edge after `from` within the window of `startCycle`, or -1. */
  const find = (from: number, startCycle: number, signal: string, value: 0 | 1): number => {
    for (let j = from + 1; j < list.length && list[j].cycle - startCycle <= DOOR_WINDOW_CYCLES; j++) {
      if (!used[j] && list[j].signal === signal && (value === 1 ? list[j].value === 1 : list[j].value !== 1)) return j;
    }
    return -1;
  };

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const prev = levels.get(e.signal);
    levels.set(e.signal, e.value);
    if (used[i]) continue;
    const isMonitored = e.signal === "MOTOR_CLOSE" || e.signal === "MOTOR_OPEN" || e.signal === "LAMP";
    if (!isMonitored) continue;
    const rose = e.value === 1 && prev !== 1;
    const fell = prev === 1 && e.value !== 1;
    if (!rose && !fell) continue;
    used[i] = true;
    const take = (j: number): OutputEvent => {
      used[j] = true;
      levels.set(list[j].signal, list[j].value);
      return list[j];
    };
    const change = (to: DoorState): void => {
      out.push({ cycle: e.cycle, from: state, to });
      state = to;
    };

    if (e.signal === "MOTOR_CLOSE" && rose) {
      const lamp = find(i, e.cycle, "LAMP", 1);
      if ((state === "open" || state === "closed") && lamp >= 0) {
        take(lamp);
        change("closing");
        continue;
      }
      throw new DoorPatternError(`MOTOR_CLOSE rose in state ${state} without the pattern of the four`, [e]);
    }
    if (e.signal === "MOTOR_CLOSE" && fell && state === "closing") {
      const open = find(i, e.cycle, "MOTOR_OPEN", 1);
      if (open >= 0) {
        take(open);
        change("opening");
        continue;
      }
      const lamp = find(i, e.cycle, "LAMP", 0);
      if (lamp >= 0) {
        take(lamp);
        change("closed");
        continue;
      }
      throw new DoorPatternError("MOTOR_CLOSE fell with neither a MOTOR_OPEN rise nor a LAMP fall in 1,000 cycles", [e]);
    }
    if (e.signal === "MOTOR_OPEN" && fell && state === "opening") {
      const close = find(i, e.cycle, "MOTOR_CLOSE", 1);
      if (close >= 0) {
        take(close);
        change("closing");
        continue;
      }
      const lamp = find(i, e.cycle, "LAMP", 0);
      if (lamp >= 0) {
        take(lamp);
        change("open");
        continue;
      }
      throw new DoorPatternError("MOTOR_OPEN fell with neither a MOTOR_CLOSE rise nor a LAMP fall in 1,000 cycles", [e]);
    }
    throw new DoorPatternError(`${e.signal} ${rose ? "rose" : "fell"} in state ${state}, outside the four patterns`, [e]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Findings and coverage

export interface FloatingFinding {
  /** `Run <index>` for a Run_Result, `Scripted_Run <name>` for a Scripted_Run. */
  where: string;
  kind: "diagnostic" | "cannotCheck";
  /** The signal, or null when a CannotCheck reason does not name one. */
  signal: string | null;
  /** The cycle of a Floating_Diagnostic; null for a CannotCheck. */
  cycle: number | null;
  detail: string;
}

const FLOATING_REASON = /^input (\S+) was read while floating$/;

function floatingIn(
  where: string,
  diagnostics: readonly { kind: string; signal: string; cycle: number }[],
  cannotCheck: readonly { reason: string }[],
): FloatingFinding[] {
  const found: FloatingFinding[] = [];
  for (const d of diagnostics) {
    if (d.kind !== "floating-input") continue;
    found.push({ where, kind: "diagnostic", signal: d.signal, cycle: d.cycle, detail: `${d.signal} read while floating at cycle ${d.cycle}` });
  }
  for (const c of cannotCheck) {
    const m = FLOATING_REASON.exec(c.reason);
    if (m === null && !c.reason.includes("floating")) continue;
    found.push({ where, kind: "cannotCheck", signal: m === null ? null : m[1], cycle: null, detail: c.reason });
  }
  return found;
}

/**
 * Every Floating_Diagnostic and every floating CannotCheck in the Run_Results and in the Scripted_Run
 * outcomes, with the signal, the cycle and the Run_Index or Scripted_Run name. Empty means none.
 */
export function floatingFindings(
  runs: readonly RunResult[],
  scripted: readonly { name: string; outcome: ScriptedOutcome }[] = [],
): FloatingFinding[] {
  const out: FloatingFinding[] = [];
  for (const r of runs) out.push(...floatingIn(`Run ${r.runIndex}`, r.diagnostics, r.cannotCheck));
  for (const s of scripted) {
    out.push(...floatingIn(`Scripted_Run ${s.name}`, s.outcome.diagnostics, s.outcome.cannotCheck));
  }
  return out;
}

export interface GremlinCoverage {
  id: string;
  /** Events of this gremlin with cycle below runCycles, over all Run_Results. */
  eventsBelowRunCycles: number;
  /** Every skipped entry of this gremlin, with its Run_Index. */
  skipped: { runIndex: number; entry: SkippedEntry }[];
}

/** Per GremlinSpec: the count of events with `cycle` below `runCycles` and every `skipped` entry. */
export function gremlinCoverage(
  runs: readonly RunResult[],
  gremlinSet: readonly GremlinSpec[],
  runCycles: number,
): GremlinCoverage[] {
  return gremlinSet.map((spec) => {
    let events = 0;
    const skipped: GremlinCoverage["skipped"] = [];
    for (const r of runs) {
      for (const e of r.eventList) if (e.gremlinId === spec.id && e.cycle < runCycles) events++;
      for (const s of r.skipped) if (s.gremlinId === spec.id) skipped.push({ runIndex: r.runIndex, entry: s });
    }
    return { id: spec.id, eventsBelowRunCycles: events, skipped };
  });
}

/** The entries of `trace.eventList` whose gremlinId is not "rest". */
export function gremlinEventCount(trace: { eventList: readonly { gremlinId?: string }[] }): number {
  return trace.eventList.filter((e) => e.gremlinId !== "rest").length;
}

// ---------------------------------------------------------------------------
// Brand_Matcher

/** The eight Board_Brand_Names of Requirement 18, criterion 3. */
export const BOARD_BRAND_NAMES: readonly string[] = [
  "Arduino",
  "Genuino",
  "Uno",
  "Nano",
  "Mega",
  "Leonardo",
  "Duemilanove",
  "Diecimila",
];

export interface BrandMatch {
  /** The word from the list, as given (not the casing found in the text). */
  word: string;
  /** Index of the first character of the match in the text. */
  offset: number;
  /** 1 plus the count of LF characters before the match. */
  line: number;
}

function isAsciiLetterOrDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/** Lowercases ASCII letters only, so the string length never changes. */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (m) => String.fromCharCode(m.charCodeAt(0) + 32));
}

/**
 * Every whole-word match of `words` in `text`, ignoring ASCII letter case. Each side of a match is the
 * text edge or a character that is not an ASCII letter or digit. Results are in offset order, and in
 * list order at one offset.
 */
export function wholeWordMatches(text: string, words: readonly string[]): BrandMatch[] {
  const hay = asciiLower(text);
  const found: BrandMatch[] = [];
  let line = 1;
  for (let i = 0; i < hay.length; i++) {
    if (i > 0 && text[i - 1] === "\n") line++;
    if (i > 0 && isAsciiLetterOrDigit(text[i - 1])) continue;
    for (const word of words) {
      if (word.length === 0 || !hay.startsWith(asciiLower(word), i)) continue;
      const after = i + word.length;
      if (after < text.length && isAsciiLetterOrDigit(text[after])) continue;
      found.push({ word, offset: i, line });
    }
  }
  return found;
}
