// Feature: trace-reducer. Emulator_Oracle and Replay_Function examples on the real bridge.
// Evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import { runEventList } from "../campaign";
import type { BridgeFactory } from "../campaign";
import { EmulatorBridge } from "../emulator-bridge";
import type { EmulatorBridgeInterface } from "../emulator-bridge";
import { compileRuleSet } from "../rules/compile";
import { replayEventList } from "../reducer/emulator-run";
import { createEmulatorOracle, createReducer } from "../reducer/reducer";
import type { Oracle, ReducerError, ReducerEvent, StepReport } from "../reducer/types";
import type { RuleSet } from "../rules/ir";
import { loadExample, readHex } from "../../../tests/examples/examples-support";

const hb = loadExample("heartbeat");
const HB_HEX = readHex("heartbeat", "buggy");
// A list in the shape of the heartbeat BROKE trace: one stuck press.
const STUCK: ReducerEvent[] = [{ signal: "PULSE", value: 0, cycle: 4_733_733, gremlinId: "stuck" }];
const RULE1 = "HEARTBEAT is 1 must never last 600 ms or longer.";
const RULE0 = "HEARTBEAT is 0 must never last 600 ms or longer.";
const input = (over: object = {}) => ({
  hex: HB_HEX,
  fixture: hb.fixture,
  ruleSet: hb.ruleSet,
  originalList: STUCK,
  violation: { rule: RULE1, cycle: 1 },
  runCycles: hb.meta.runCycles,
  ...over,
});

function counting(): { factory: BridgeFactory; created: number[]; lastCycle: number[] } {
  const created: number[] = [];
  const lastCycle: number[] = [];
  const factory: BridgeFactory = (hex, fixture, evs) => {
    const b = EmulatorBridge.create(hex, fixture, evs);
    if ("kind" in b) return b;
    created.push(evs.length);
    const i = lastCycle.length;
    lastCycle.push(0);
    const wrapped: EmulatorBridgeInterface = Object.create(b);
    (wrapped as { advance: unknown }).advance = (n: number) => {
      const r = b.advance(n);
      lastCycle[i] = b.cycleCount;
      return r;
    };
    Object.defineProperty(wrapped, "cycleCount", { get: () => b.cycleCount });
    return wrapped;
  };
  return { factory, created, lastCycle };
}

function oracleOf(x: Oracle | ReducerError): Oracle {
  if (typeof x !== "function") throw new Error(x.message);
  return x;
}

describe("trace-reducer Emulator_Oracle", () => {
  it("a rule set that does not compile gives invalid-input with every reason, and no bridge (3.2)", () => {
    const c = counting();
    // Two rules with the same sentence: compileRuleSet rejects the set.
    const bad = [hb.ruleSet[0], hb.ruleSet[0]] as unknown as RuleSet;
    const expected = compileRuleSet(bad, hb.fixture);
    expect(expected.ok).toBe(false);
    const e = createReducer(input({ ruleSet: bad }), { bridgeFactory: c.factory }) as ReducerError;
    expect(e.kind).toBe("invalid-input");
    expect(e.reasons).toStrictEqual((expected as { reasons: string[] }).reasons);
    expect(c.created.length).toBe(0);
  });

  it("creates one fresh bridge per candidate, and a breaking candidate stops before Run_Cycles (3.3, 3.6)", () => {
    const c = counting();
    const h = createReducer(input(), { bridgeFactory: c.factory });
    if ("kind" in h) throw new Error(h.message);
    expect(c.created.length).toBe(0);
    const s = h.step(300) as StepReport;
    expect(s.ended).toBe(true);
    expect(c.created.length).toBe(s.candidatesTried);
    expect(s.result?.violation.rule).toBe(RULE1);
    // The confirmation run breaks, so its Run stopped after the Step with the Violation.
    expect(c.lastCycle[0]).toBeLessThan(hb.meta.runCycles);
    expect(c.lastCycle[0]).toBeGreaterThanOrEqual(s.result?.violation.cycle ?? 0);
  }, 120_000);

  it("a Violation of another rule is does-not (3.8)", () => {
    const o = oracleOf(createEmulatorOracle(input({ violation: { rule: RULE0, cycle: 1 } })));
    expect(o(STUCK.map((e) => ({ ...e })))).toStrictEqual({ kind: "does-not" });
    const t = oracleOf(createEmulatorOracle(input()));
    const a = t(STUCK.map((e) => ({ ...e })));
    expect(a.kind).toBe("breaks");
  }, 120_000);

  it("bridge, Step and Run_Path errors give oracle-error with kind, message and candidate number (3.9)", () => {
    const failCreate: BridgeFactory = () => ({ kind: "invalid-hex", message: "fake creation error" });
    const h1 = createReducer(input(), { bridgeFactory: failCreate });
    if ("kind" in h1) throw new Error(h1.message);
    const s1 = h1.step(5) as StepReport;
    expect(s1.error?.kind).toBe("oracle-error");
    expect(s1.error?.candidate).toBe(1);
    expect(s1.error?.cause).toStrictEqual({ kind: "bridge-error", message: "fake creation error" });

    const stall: BridgeFactory = (hex, fixture, evs) => {
      const b = EmulatorBridge.create(hex, fixture, evs);
      if ("kind" in b) return b;
      return {
        get cycleCount() {
          return 0;
        },
        advance: () => ({ cyclesConsumed: 0, outputEvents: [], appliedInputs: [], appliedAnalogInputs: [], diagnostics: [] }),
      } as unknown as EmulatorBridgeInterface;
    };
    const h2 = createReducer(input(), { bridgeFactory: stall });
    if ("kind" in h2) throw new Error(h2.message);
    const s2 = h2.step(5) as StepReport;
    expect(s2.error?.kind).toBe("oracle-error");
    expect(s2.error?.cause?.kind).toBe("internal-error");
  });

  it("the same candidate twice, with other candidates between, gives deep-equal answers (3.13, 12.8)", () => {
    const o = oracleOf(createEmulatorOracle(input()));
    const a = o(STUCK.map((e) => ({ ...e })));
    o([]);
    o([{ signal: "PULSE", value: 0, cycle: 100, gremlinId: "stuck" }]);
    expect(o(STUCK.map((e) => ({ ...e })))).toStrictEqual(a);
  }, 120_000);
});

describe("trace-reducer Replay_Function", () => {
  const replayIn = (over: object = {}) => ({
    hex: HB_HEX,
    fixture: hb.fixture,
    ruleSet: hb.ruleSet,
    events: STUCK,
    runCycles: hb.meta.runCycles,
    maxStepCycles: 160_000,
    ...over,
  });

  it("returns every output edge of the Run, including the whole last Step (3.10)", () => {
    const r = replayEventList(replayIn());
    if ("kind" in r) throw new Error(r.message);
    const compiled = compileRuleSet(hb.ruleSet, hb.fixture);
    if (!compiled.ok) throw new Error("compile");
    const path = runEventList(
      { hex: HB_HEX, fixture: hb.fixture, checker: compiled.compiled.checker, runCycles: hb.meta.runCycles, maxStepCycles: 160_000 },
      STUCK,
      0,
    );
    if ("kind" in path) throw new Error(path.message);
    expect(r.outputEdges).toStrictEqual(path.outputEvents);
    expect(r.violation).toStrictEqual(path.violation);
    expect(r.outputEdges[0].cycle).toBe(0);
    expect(replayEventList(replayIn())).toStrictEqual(r);
  }, 120_000);

  it("bad replay inputs create no bridge (3.11)", () => {
    const c = counting();
    for (const [over, field] of [
      [{ runCycles: 0 }, "runCycles"],
      [{ maxStepCycles: 0 }, "maxStepCycles"],
      [{ events: [{ signal: "PULSE", value: 0, cycle: -1, gremlinId: "g" }] }, "cycle"],
      [{ events: [{ signal: "NOPE", value: 0, cycle: 1, gremlinId: "g" }] }, "signal"],
    ] as const) {
      const e = replayEventList(replayIn({ ...over, bridgeFactory: c.factory })) as ReducerError;
      expect(e.kind).toBe("invalid-input");
      expect(e.field).toBe(field);
    }
    expect(c.created.length).toBe(0);
  });

  it("a Run_Path error gives replay-error with no edges (3.12)", () => {
    const e = replayEventList(replayIn({ bridgeFactory: () => ({ kind: "invalid-hex", message: "fake" }) }));
    expect(e).toStrictEqual({
      kind: "replay-error",
      message: "The replay failed (bridge-error: fake).",
      cause: { kind: "bridge-error", message: "fake" },
    });
  });
});