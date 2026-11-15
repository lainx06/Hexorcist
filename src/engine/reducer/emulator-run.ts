// Emulator_Oracle and Replay_Function. Every candidate runs on a fresh EmulatorBridge with the same
// HEX, the same Fixture and its ordered events, through the existing Run_Path (runEventList in
// campaign.ts), with a fresh Checker from compileRuleSet. No snapshots, no state between calls.

import { runEventList } from "../campaign";
import type { BridgeFactory } from "../campaign";
import type { Violation } from "../checker";
import { isEngineError } from "../errors";
import { compileRuleSet } from "../rules/compile";
import type { RuleSet } from "../rules/ir";
import { render } from "../rules/render";
import type { Fixture, OutputEvent } from "../types";
import { checkEventList, copyList, MAX_RUN_CYCLES } from "./events";
import { invalidInput } from "./reducer-error";
import type { Oracle, OracleOutcome, ReducerError, ReducerEvent, TargetRule } from "./types";

/** Every candidate run and every replay passes this Run_Index to the Run_Path. */
const RUN_INDEX = 0;

export interface EmulatorOracleContext {
  hex: string;
  /** Private copy. */
  fixture: Fixture;
  /** Private copy, already accepted by compileRuleSet. */
  ruleSet: RuleSet;
  target: TargetRule;
  runCycles: number;
  maxStepCycles: number;
  /** Test seam; default EmulatorBridge.create. */
  bridgeFactory?: BridgeFactory;
}

/** The Emulator_Oracle: "breaks" only for a Violation of the target rule, "does-not" otherwise. */
export function makeEmulatorOracle(ctx: EmulatorOracleContext): Oracle {
  const r = render(ctx.ruleSet[ctx.target.index]);
  const targetMatches = r.ok && r.sentence === ctx.target.sentence;
  return (candidate: ReducerEvent[]): OracleOutcome => {
    const compiled = compileRuleSet(ctx.ruleSet, ctx.fixture);
    if (!compiled.ok) throw { kind: "compile-error", message: compiled.reasons.join(" | ") };
    const path = runEventList(
      {
        hex: ctx.hex,
        fixture: ctx.fixture,
        checker: compiled.compiled.checker,
        runCycles: ctx.runCycles,
        maxStepCycles: ctx.maxStepCycles,
        ...(ctx.bridgeFactory === undefined ? {} : { bridgeFactory: ctx.bridgeFactory }),
      },
      copyList(candidate),
      RUN_INDEX,
    );
    if (isEngineError(path)) throw { kind: path.kind, message: path.message };
    const v = path.violation;
    if (v !== null && targetMatches && v.rule === ctx.target.sentence) {
      return { kind: "breaks", violation: { rule: v.rule, cycle: v.cycle } };
    }
    return { kind: "does-not" };
  };
}

export interface ReplayInput {
  hex: string;
  fixture: Fixture;
  ruleSet: unknown;
  events: readonly ReducerEvent[];
  runCycles: number;
  maxStepCycles: number;
  /** Test seam; default EmulatorBridge.create. */
  bridgeFactory?: BridgeFactory;
}

export interface ReplayResult {
  /** The Run's Violation of any rule, or null. */
  violation: Violation | null;
  /** Every output edge the bridge reported, from the cycle-0 snapshot through the last Step. */
  outputEdges: OutputEvent[];
}

function read(o: object, name: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (o as Record<string, unknown>)[name] };
  } catch {
    return { ok: false };
  }
}

/** Replay_Function: one fresh-bridge run of an event list through the Run_Path. Never throws. */
export function replayEventList(input: unknown): ReplayResult | ReducerError {
  try {
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
    const rc = read(input, "runCycles");
    if (!rc.ok || typeof rc.value !== "number" || !Number.isInteger(rc.value) || rc.value < 1 || rc.value > MAX_RUN_CYCLES) {
      return invalidInput(`Field runCycles: must be an integer from 1 to ${MAX_RUN_CYCLES}.`, { field: "runCycles" });
    }
    const ms = read(input, "maxStepCycles");
    if (!ms.ok || typeof ms.value !== "number" || !Number.isSafeInteger(ms.value) || ms.value < 1) {
      return invalidInput("Field maxStepCycles: must be an integer of at least 1.", { field: "maxStepCycles" });
    }
    const rs = read(input, "ruleSet");
    let ruleSet: unknown;
    try {
      ruleSet = rs.ok ? structuredClone(rs.value) : undefined;
    } catch {
      return invalidInput("Field ruleSet: the rule set could not be copied.", { field: "ruleSet" });
    }
    const compiled = compileRuleSet(ruleSet, fixture);
    if (!compiled.ok) {
      return invalidInput("Field ruleSet: the rules did not compile.", { field: "ruleSet", reasons: compiled.reasons });
    }
    const ev = read(input, "events");
    if (!ev.ok || !Array.isArray(ev.value)) return invalidInput("Field events: must be an array.", { field: "events" });
    const bad = checkEventList(ev.value as unknown[], fixture, { runCycles: rc.value });
    if (bad !== null) return invalidInput(bad.message, { field: bad.field, index: bad.index });
    const bf = read(input, "bridgeFactory");
    if (!bf.ok || (bf.value !== undefined && typeof bf.value !== "function")) {
      return invalidInput("Field bridgeFactory: must be a function.", { field: "bridgeFactory" });
    }
    const path = runEventList(
      {
        hex: hex.value,
        fixture,
        checker: compiled.compiled.checker,
        runCycles: rc.value,
        maxStepCycles: ms.value,
        ...(bf.value === undefined ? {} : { bridgeFactory: bf.value as BridgeFactory }),
      },
      copyList(ev.value as ReducerEvent[]),
      RUN_INDEX,
    );
    if (isEngineError(path)) {
      return {
        kind: "replay-error",
        message: `The replay failed (${path.kind}: ${path.message}).`,
        cause: { kind: path.kind, message: path.message },
      };
    }
    return {
      violation: path.violation === null ? null : { rule: path.violation.rule, cycle: path.violation.cycle },
      outputEdges: path.outputEvents.map((e) => ({ signal: e.signal, value: e.value, cycle: e.cycle })),
    };
  } catch {
    return {
      kind: "replay-error",
      message: "The replay failed (internal-error: an unexpected value was read).",
      cause: { kind: "internal-error", message: "an unexpected value was read" },
    };
  }
}