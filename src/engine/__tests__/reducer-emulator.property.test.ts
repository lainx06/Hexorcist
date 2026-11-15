// Feature: trace-reducer. Property 17: reductions of the Example_Traces on the emulated chip.
// The Oracle is a test-side memo around the Emulator_Oracle (design choice D17); the memo-free
// answers are checked in reducer-emulator.test.ts. Evidence, not proof. No wall clock, no random source.
import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { createEmulatorOracle } from "../reducer/reducer";
import { createReducerCore } from "../reducer/core";
import type { Oracle, OracleOutcome, ProgressReport, ReducerEvent, StepReport } from "../reducer/types";
import type { ExampleId } from "../../../tests/examples/examples-support";
import { loadExample, readHex, runExampleCampaign } from "../../../tests/examples/examples-support";
import { deep, drive, isMappedSubsequence } from "./reducer-arbitraries";

const IDS: ExampleId[] = ["crosswalk", "garage", "heartbeat"];

interface Prepared {
  fixture: import("../types").Fixture;
  original: ReducerEvent[];
  sentence: string;
  oracle: Oracle;
}

const prepared = new Map<ExampleId, Prepared>();

function keyOf(list: readonly ReducerEvent[]): string {
  return JSON.stringify(list.map((e) => Object.keys(e).sort().map((k) => [k, (e as unknown as Record<string, unknown>)[k]])));
}

beforeAll(() => {
  for (const id of IDS) {
    const ex = loadExample(id);
    const out = runExampleCampaign(ex, "buggy");
    const v = out.result.verdict;
    if (v.verdict !== "BROKE") throw new Error(`${id}: campaign verdict was ${v.verdict}, expected BROKE`);
    const input = {
      hex: readHex(id, "buggy"),
      fixture: ex.fixture,
      ruleSet: ex.ruleSet,
      originalList: v.trace.eventList,
      violation: v.trace.violation,
      runCycles: ex.meta.runCycles,
    };
    const o = createEmulatorOracle(input);
    if (typeof o !== "function") throw new Error(`${id}: createEmulatorOracle returned ${o.kind}: ${o.message}`);
    const memo = new Map<string, OracleOutcome>();
    const oracle: Oracle = (c) => {
      const k = keyOf(c);
      const hit = memo.get(k);
      if (hit !== undefined) return deep(hit);
      const a = o(c);
      memo.set(k, deep(a));
      return a;
    };
    prepared.set(id, { fixture: ex.fixture, original: v.trace.eventList, sentence: v.trace.violation.rule, oracle });
  }
}, 600_000);

function reduce(p: Prepared, budget: number, slices: number[]) {
  const log: ReducerEvent[][] = [];
  const reports: ProgressReport[] = [];
  const h = createReducerCore(
    {
      originalList: deep(p.original),
      fixture: p.fixture,
      sentence: p.sentence,
      budget,
      oracle: (c) => {
        log.push(deep(c));
        return p.oracle(c);
      },
    },
    { onProgress: (r) => reports.push(deep(r)) },
  );
  if ("kind" in h) throw new Error(h.message);
  const final: StepReport = drive(h, slices);
  return { log, reports, final };
}

describe("trace-reducer on the Example_Traces", () => {
  // Feature: trace-reducer, Property 17: Reductions of the Example_Traces are sound on the emulated chip
  it("Property 17: reductions of the example traces are sound on the emulated chip", () => {
    const n = { stoppedAtBudgetTrue: 0, stoppedAtBudgetFalse: 0, acceptedDdmin: 0 };
    fc.assert(
      fc.property(
        fc.constantFrom(...IDS),
        fc.oneof(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 300 })),
        fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 4 }),
        (id, budget, slices) => {
          const p = prepared.get(id) as Prepared;
          const a = reduce(p, budget, [budget]);
          const b = reduce(p, budget, [budget]);
          expect(b).toStrictEqual(a);
          const s = reduce(p, budget, slices);
          expect(s).toStrictEqual(a);
          const res = a.final.result;
          expect(res, `${id}: ${JSON.stringify(a.final.error)}`).toBeDefined();
          if (res === undefined) return;
          const again = p.oracle(deep(res.reducedList));
          expect(again).toStrictEqual({ kind: "breaks", violation: res.violation });
          expect(res.violation.rule).toBe(p.sentence);
          const g = (l: ReducerEvent[]) => l.filter((e) => e.gremlinId !== "rest").length;
          expect(res.originalEventCount).toBe(g(p.original));
          expect(res.reducedEventCount).toBe(g(res.reducedList));
          expect(res.reducedEventCount).toBeLessThanOrEqual(res.originalEventCount);
          expect(isMappedSubsequence(res.reducedList, p.original)).toBe(true);
          expect(res.candidatesTried).toBe(a.log.length);
          if (res.stoppedAtBudget) n.stoppedAtBudgetTrue++;
          else {
            n.stoppedAtBudgetFalse++;
            res.reducedList.forEach((e, i) => {
              if (e.gremlinId === "rest") return;
              const out = p.oracle(deep(res.reducedList.filter((_, j) => j !== i)));
              expect(out.kind === "breaks" && out.violation.rule === p.sentence, `${id}: removing event ${i}`).toBe(false);
            });
          }
          if (a.reports.some((r) => r.part === "ddmin" && r.accepted)) n.acceptedDdmin++;
        },
      ),
      { seed: 20261217, numRuns: 20 },
    );
    console.log(`Property 17 counters ${JSON.stringify(n)}`);
    for (const [k, v] of Object.entries(n)) expect(v, k).toBeGreaterThan(0);
  }, 1_200_000);
});