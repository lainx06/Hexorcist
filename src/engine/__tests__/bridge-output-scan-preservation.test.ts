// Preservation test for the bridge-output-scan speed change.
//
// It reads a baseline recorded once from the unchanged EmulatorBridge (before any edit to
// src/engine/emulator-bridge.ts) and replays every recorded case on a new bridge with the
// stored HEX, Fixture and input event list, stepped like runOne (planTarget, 160,000-cycle
// steps, no checker, no stop at a violation). Every advance() result is compared exactly.
// It never writes or regenerates the baseline: a mismatch is reported, not rewritten.
//
// A pass is evidence that the 41 recorded cases match. It is not proof that every HEX,
// Fixture and input event list gives the same result.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EmulatorBridge, isBridgeError } from "../emulator-bridge";
import { checkPlanInput, planTarget } from "../step-plan";
import type {
  AppliedAnalogInputEvent,
  AppliedInputEvent,
  Diagnostic,
  Fixture,
  OutputEvent,
  ScheduledInput,
} from "../types";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../..");
const BASELINE_PATH = resolve(here, "baselines/bridge-output-scan-preservation.json");
const EXPECTED_CASES = 41;
const MAX_STEP_CYCLES = 160_000;
const PRESERVATION_TIMEOUT_MS = 120_000;

interface BaselineStep {
  cyclesConsumed: number;
  outputEvents: OutputEvent[];
  appliedInputs: AppliedInputEvent[];
  appliedAnalogInputs: AppliedAnalogInputEvent[];
  diagnostics: Diagnostic[];
  cycleCount: number;
}

interface BaselineCase {
  id: string;
  hex: string;
  fixture: Fixture;
  runCycles: number;
  events: ScheduledInput[];
  steps: BaselineStep[];
}

interface Baseline {
  avr8jsVersion: string;
  seed: number;
  maxStepCycles: number;
  cases: BaselineCase[];
}

/** The fields of one step, in the order of Requirement 6.5. */
const STEP_FIELDS = [
  "cyclesConsumed",
  "outputEvents",
  "appliedInputs",
  "appliedAnalogInputs",
  "diagnostics",
  "cycleCount",
] as const;

interface Difference {
  path: string;
  index: number | null;
  expected: unknown;
  actual: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** First difference between two JSON values: lowest list index first, then list length; keys in expected order. */
function firstDifferenceIn(path: string, expected: unknown, actual: unknown): Difference | null {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return { path, index: null, expected, actual };
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
      const d = firstDifferenceIn(`${path}[${i}]`, expected[i], actual[i]);
      if (d) return { ...d, index: d.index ?? i };
    }
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, index: n, expected: expected.length, actual: actual.length };
    }
    return null;
  }
  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) return { path, index: null, expected, actual };
    const ek = Object.keys(expected);
    const ak = Object.keys(actual);
    const missing = ek.filter((k) => !(k in actual));
    const extra = ak.filter((k) => !(k in expected));
    if (missing.length > 0 || extra.length > 0) {
      return { path: `${path} (field set)`, index: null, expected: ek, actual: ak };
    }
    for (const k of ek) {
      const d = firstDifferenceIn(`${path}.${k}`, expected[k], actual[k]);
      if (d) return d;
    }
    return null;
  }
  return Object.is(expected, actual) ? null : { path, index: null, expected, actual };
}

/** Steps compared in call order, each step's fields in Requirement 6.5 order, then the call count. */
function firstStepDifference(expected: BaselineStep[], actual: BaselineStep[]): Difference | null {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    for (const f of STEP_FIELDS) {
      const d = firstDifferenceIn(`steps[${i}].${f}`, expected[i][f], actual[i][f]);
      if (d) return { ...d, index: d.index ?? i };
    }
  }
  if (expected.length !== actual.length) {
    return { path: "advance() call count", index: n, expected: expected.length, actual: actual.length };
  }
  return null;
}

/** Replays one case on a new bridge. Throws with the case, the call, kind and message on a BridgeError. */
function replay(c: BaselineCase, label: string): BaselineStep[] {
  const hex = readFileSync(resolve(REPO_ROOT, c.hex), "utf-8");
  const events: ScheduledInput[] = c.events.map((e) => ({ ...e }));
  const bridge = EmulatorBridge.create(hex, c.fixture, events);
  if (isBridgeError(bridge)) {
    throw new Error(`${label}: create returned BridgeError ${bridge.kind}: ${bridge.message}`);
  }
  const steps: BaselineStep[] = [];
  let prevTarget = 0;
  let applied = 0;
  while (bridge.cycleCount < c.runCycles) {
    const before = bridge.cycleCount;
    const pendingCycles: number[] = [];
    for (let i = applied; i < c.events.length; i++) pendingCycles.push(c.events[i].cycle);
    const plan = { prevTarget, cycleCount: before, pendingCycles, runCycles: c.runCycles, maxStepCycles: MAX_STEP_CYCLES };
    const planErr = checkPlanInput(plan);
    if (planErr) throw new Error(`${label}: step plan rejected at advance #${steps.length}: ${planErr.message}`);
    const target = planTarget(plan);
    const r = bridge.advance(target - before);
    if (isBridgeError(r)) {
      throw new Error(`${label}: advance #${steps.length} returned BridgeError ${r.kind}: ${r.message}`);
    }
    if (bridge.cycleCount <= before) throw new Error(`${label}: bridge did not advance at cycle ${before}`);
    prevTarget = target;
    applied += r.appliedInputs.length + r.appliedAnalogInputs.length;
    // Plain JSON copy, the same form the baseline was stored in.
    steps.push(
      JSON.parse(
        JSON.stringify({
          cyclesConsumed: r.cyclesConsumed,
          outputEvents: r.outputEvents,
          appliedInputs: r.appliedInputs,
          appliedAnalogInputs: r.appliedAnalogInputs,
          diagnostics: r.diagnostics,
          cycleCount: bridge.cycleCount,
        }),
      ) as BaselineStep,
    );
  }
  return steps;
}

type Loaded = { ok: true; baseline: Baseline } | { ok: false; reason: string };

function load(): Loaded {
  let text: string;
  try {
    text = readFileSync(BASELINE_PATH, "utf-8");
  } catch {
    return { ok: false, reason: "baseline missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "baseline not parseable" };
  }
  const cases = isRecord(parsed) && Array.isArray(parsed["cases"]) ? (parsed["cases"] as unknown[]) : null;
  if (cases === null) return { ok: false, reason: "baseline not parseable" };
  if (cases.length !== EXPECTED_CASES) {
    return { ok: false, reason: `baseline holds ${cases.length} cases, expected ${EXPECTED_CASES}` };
  }
  return { ok: true, baseline: parsed as unknown as Baseline };
}

const loaded = load();

describe("bridge-output-scan preservation baseline", () => {
  if (!loaded.ok) {
    const reason = loaded.reason;
    it(reason, () => {
      throw new Error(`${reason} (${BASELINE_PATH})`);
    });
    return;
  }
  const cases = loaded.baseline.cases;
  cases.forEach((c, index) => {
    const label = `case ${index} ${c.id} (${c.hex})`;
    it(
      label,
      () => {
        expect(cases.length).toBe(EXPECTED_CASES);
        const actual = replay(c, label);
        const diff = firstStepDifference(c.steps, actual);
        if (diff !== null) {
          throw new Error(
            `${label}: first difference at ${diff.path}` +
              (diff.index === null ? "" : ` (list index ${diff.index})`) +
              `; expected ${JSON.stringify(diff.expected)}, actual ${JSON.stringify(diff.actual)}`,
          );
        }
        expect(diff).toBeNull();
      },
      PRESERVATION_TIMEOUT_MS,
    );
  });
});