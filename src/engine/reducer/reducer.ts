// createReducer: Input_Checks in the order of Requirement 1.9, private copies, the compile check
// with compileRuleSet, the Target_Rule lookup with render, then the Reducer_Core over the
// Emulator_Oracle. Makes no oracle call and creates no bridge before the first step.

import type { BridgeFactory } from "../campaign";
import type { Violation } from "../checker";
import { compileRuleSet } from "../rules/compile";
import type { RuleSet } from "../rules/ir";
import { render } from "../rules/render";
import type { Fixture } from "../types";
import { createReducerCore } from "./core";
import { makeEmulatorOracle } from "./emulator-run";
import {
  checkEventList,
  copyList,
  DEFAULT_BUDGET,
  DEFAULT_MAX_STEP_CYCLES,
  MAX_RUN_CYCLES,
  UNLIMITED_BUDGET,
} from "./events";
import { invalidInput } from "./reducer-error";
import type { Oracle, ProgressReport, ReducerError, ReducerEvent, ReducerHandle, TargetRule } from "./types";

export interface ReductionInput {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  originalList: ReducerEvent[];
  /** The target Violation (from the BROKE trace). */
  violation: Violation;
  runCycles: number;
  /** Default 160,000. */
  maxStepCycles?: number;
  /** Default 300. */
  budget?: number;
}

export interface ReducerOptions {
  onProgress?: (report: ProgressReport) => void;
  /** Test seam only. */
  bridgeFactory?: BridgeFactory;
}

interface Checked {
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  originalList: ReducerEvent[];
  target: TargetRule;
  runCycles: number;
  maxStepCycles: number;
  budget: number;
}

type Read = { ok: true; value: unknown } | { ok: false };

function read(o: object, name: string): Read {
  try {
    return { ok: true, value: (o as Record<string, unknown>)[name] };
  } catch {
    return { ok: false };
  }
}

function isInt(x: unknown, min: number, max: number): x is number {
  return typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;
}

/** Input_Checks 1 to 11 of the design. */
function checkInput(input: unknown): Checked | ReducerError {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidInput("Field input: must be an object.", { field: "input" });
  }
  const hex = read(input, "hex");
  if (!hex.ok || typeof hex.value !== "string") return invalidInput("Field hex: must be a string.", { field: "hex" });

  const fx = read(input, "fixture");
  let fixture: Fixture;
  try {
    const f = fx.ok ? fx.value : undefined;
    if (typeof f !== "object" || f === null || !Array.isArray((f as Fixture).pins)) throw new Error("bad");
    fixture = structuredClone(f as Fixture);
  } catch {
    return invalidInput("Field fixture: must be an object with a pins array.", { field: "fixture" });
  }

  const rs = read(input, "ruleSet");
  let ruleSet: unknown;
  try {
    if (!rs.ok) throw new Error("bad");
    ruleSet = structuredClone(rs.value);
  } catch {
    return invalidInput("Field ruleSet: the rule set could not be read.", { field: "ruleSet" });
  }

  const ol = read(input, "originalList");
  if (!ol.ok || !Array.isArray(ol.value)) return invalidInput("Field originalList: must be an array.", { field: "originalList" });

  const vi = read(input, "violation");
  let violation: { rule: string; cycle: number };
  try {
    const v = vi.ok ? vi.value : undefined;
    if (typeof v !== "object" || v === null) throw new Error("bad");
    const rule = (v as { rule?: unknown }).rule;
    const cycle = (v as { cycle?: unknown }).cycle;
    if (typeof rule !== "string" || !isInt(cycle, 0, UNLIMITED_BUDGET)) throw new Error("bad");
    violation = { rule, cycle };
  } catch {
    return invalidInput("Field violation: must be an object with a string rule and an integer cycle of at least 0.", {
      field: "violation",
    });
  }

  const rc = read(input, "runCycles");
  if (!rc.ok || !isInt(rc.value, 1, MAX_RUN_CYCLES)) {
    return invalidInput(`Field runCycles: must be an integer from 1 to ${MAX_RUN_CYCLES}.`, { field: "runCycles" });
  }
  const ms = read(input, "maxStepCycles");
  if (!ms.ok || (ms.value !== undefined && !isInt(ms.value, 1, UNLIMITED_BUDGET))) {
    return invalidInput(`Field maxStepCycles: must be an integer from 1 to ${UNLIMITED_BUDGET}.`, { field: "maxStepCycles" });
  }
  const bu = read(input, "budget");
  if (!bu.ok || (bu.value !== undefined && !isInt(bu.value, 1, UNLIMITED_BUDGET))) {
    return invalidInput(`Field budget: must be an integer from 1 to ${UNLIMITED_BUDGET}.`, { field: "budget" });
  }

  const compiled = compileRuleSet(ruleSet, fixture);
  if (!compiled.ok) {
    return invalidInput("Field ruleSet: the rules did not compile.", { field: "ruleSet", reasons: compiled.reasons });
  }

  const bad = checkEventList(ol.value as unknown[], fixture, { runCycles: rc.value as number });
  if (bad !== null) return invalidInput(bad.message, { field: bad.field, index: bad.index });
  const originalList = copyList(ol.value as ReducerEvent[]);

  const rules = ruleSet as RuleSet;
  let index = -1;
  for (let i = 0; i < rules.length; i++) {
    const r = render(rules[i]);
    if (r.ok && r.sentence === violation.rule) {
      index = i;
      break;
    }
  }
  if (index < 0) return invalidInput("Field violation: the Violation names no Rule of the Rule_Set.", { field: "violation" });

  return {
    hex: hex.value,
    fixture,
    ruleSet: rules,
    originalList,
    target: { index, sentence: violation.rule },
    runCycles: rc.value as number,
    maxStepCycles: ms.value === undefined ? DEFAULT_MAX_STEP_CYCLES : (ms.value as number),
    budget: bu.value === undefined ? DEFAULT_BUDGET : (bu.value as number),
  };
}

function checkOptions(
  options: unknown,
): { onProgress?: (r: ProgressReport) => void; bridgeFactory?: BridgeFactory } | ReducerError {
  if (options === undefined) return {};
  if (typeof options !== "object" || options === null) return invalidInput("Field options: must be an object.", { field: "options" });
  const p = read(options, "onProgress");
  if (!p.ok || (p.value !== undefined && typeof p.value !== "function")) {
    return invalidInput("Field onProgress: must be a function.", { field: "onProgress" });
  }
  const b = read(options, "bridgeFactory");
  if (!b.ok || (b.value !== undefined && typeof b.value !== "function")) {
    return invalidInput("Field bridgeFactory: must be a function.", { field: "bridgeFactory" });
  }
  const out: { onProgress?: (r: ProgressReport) => void; bridgeFactory?: BridgeFactory } = {};
  if (p.value !== undefined) out.onProgress = p.value as (r: ProgressReport) => void;
  if (b.value !== undefined) out.bridgeFactory = b.value as BridgeFactory;
  return out;
}

function oracleFor(c: Checked, bridgeFactory: BridgeFactory | undefined): Oracle {
  return makeEmulatorOracle({
    hex: c.hex,
    fixture: c.fixture,
    ruleSet: c.ruleSet,
    target: c.target,
    runCycles: c.runCycles,
    maxStepCycles: c.maxStepCycles,
    ...(bridgeFactory === undefined ? {} : { bridgeFactory }),
  });
}

/** Builds a Reducer_Handle over the Emulator_Oracle. Never throws. */
export function createReducer(input: unknown, options?: ReducerOptions): ReducerHandle | ReducerError {
  try {
    const c = checkInput(input);
    if ("kind" in c) return c;
    const o = checkOptions(options);
    if ("kind" in o) return o;
    return createReducerCore(
      {
        originalList: c.originalList,
        fixture: c.fixture,
        sentence: c.target.sentence,
        budget: c.budget,
        oracle: oracleFor(c, o.bridgeFactory),
      },
      o.onProgress === undefined ? undefined : { onProgress: o.onProgress },
    );
  } catch {
    return invalidInput("Field input: the input could not be read.", { field: "input" });
  }
}

/** The Emulator_Oracle of a Reduction_Input (Input_Checks 1 to 11). Never throws. */
export function createEmulatorOracle(
  input: unknown,
  options?: { bridgeFactory?: BridgeFactory },
): Oracle | ReducerError {
  try {
    const c = checkInput(input);
    if ("kind" in c) return c;
    const o = checkOptions(options);
    if ("kind" in o) return o;
    return oracleFor(c, o.bridgeFactory);
  } catch {
    return invalidInput("Field input: the input could not be read.", { field: "input" });
  }
}