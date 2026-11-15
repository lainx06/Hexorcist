// Feature: trace-reducer. Properties 1 to 8: the Reducer_Core over Synthetic_Oracles.
// No emulator. Passing runs are evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createReducerCore } from "../reducer/core";
import type { Oracle, OracleOutcome, ProgressReport, ReducerEvent, ReducerHandle, StepReport } from "../reducer/types";
import {
  arbCase,
  arbRandomList,
  arbFixture,
  arbSlices,
  deep,
  drive,
  isErr,
  isEligible,
  isMappedSubsequence,
  makeSyntheticOracle,
  modelSearch,
  OTHER_RULE,
  recording,
  refNoChange,
  refSnap,
  UNLIMITED,
} from "./reducer-arbitraries";
import type { Case, Run } from "./reducer-arbitraries";

function handleFor(c: Case, budget: number, log: ReducerEvent[][], answers: OracleOutcome[], reports: ProgressReport[]): ReducerHandle {
  const oracle = recording(makeSyntheticOracle(c.oracleSpec, c.sentence), log, answers);
  const h = createReducerCore(
    { originalList: deep(c.original), fixture: deep(c.fixture), sentence: c.sentence, budget, oracle },
    { onProgress: (r) => reports.push(deep(r)) },
  );
  if ("kind" in h) throw new Error(`createReducerCore returned ${h.kind}: ${h.message}`);
  return h;
}

function runCase(c: Case, budget: number = c.budget, slices: readonly number[] = [budget]): Run {
  const log: ReducerEvent[][] = [];
  const answers: OracleOutcome[] = [];
  const reports: ProgressReport[] = [];
  const h = handleFor(c, budget, log, answers, reports);
  const final = drive(h, slices);
  return { log, answers, reports, final };
}

const gcount = (l: readonly ReducerEvent[]) => l.filter((e) => e.gremlinId !== "rest").length;

function bestBefore(c: Case, r: Run, i: number): ReducerEvent[] {
  return i === 0 ? c.original : r.reports[i - 1].bestList;
}

function isRemoval(cand: ReducerEvent[], best: ReducerEvent[]): boolean {
  let j = 0;
  for (const e of cand) {
    while (j < best.length && JSON.stringify(best[j]) !== JSON.stringify(e)) {
      if (best[j].gremlinId === "rest") return false;
      j++;
    }
    if (j >= best.length) return false;
    j++;
  }
  for (; j < best.length; j++) if (best[j].gremlinId === "rest") return false;
  return gcount(cand) < gcount(best);
}

function isSnap(cand: ReducerEvent[], best: ReducerEvent[]): boolean {
  if (cand.length !== best.length) return false;
  let changed = 0;
  for (let i = 0; i < best.length; i++) {
    const a = JSON.stringify(cand[i]);
    const b = JSON.stringify(best[i]);
    if (a === b) continue;
    if (!isEligible(best[i])) return false;
    const want = { ...best[i], analog: refSnap((best[i] as { analog: number }).analog) };
    if (JSON.stringify(want) !== a) return false;
    changed++;
  }
  return changed > 0;
}

function latestAccepted(r: Run, upto: number): number {
  for (let i = upto - 1; i >= 0; i--) if (r.reports[i].accepted) return i;
  return -1;
}

describe("trace-reducer Reducer_Core properties", () => {
  // Feature: trace-reducer, Property 1: Every Candidate is the Original_List or one edit of the Best_List
  it("Property 1: every candidate is the original list or one edit of the best list", () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const log: ReducerEvent[][] = [];
        const answers: OracleOutcome[] = [];
        const reports: ProgressReport[] = [];
        const h = handleFor(c, c.budget, log, answers, reports);
        expect(log.length).toBe(0);
        const final = drive(h, [c.budget]);
        const r: Run = { log, answers, reports, final };
        expect(log[0]).toStrictEqual(c.original);
        expect(reports[0].part).toBe("confirm");
        for (let i = 1; i < log.length; i++) {
          const best = bestBefore(c, r, i);
          const part = reports[i].part;
          expect(JSON.stringify(log[i])).not.toBe(JSON.stringify(best));
          if (part === "passC") expect(isSnap(log[i], best)).toBe(true);
          else {
            expect(["ddmin", "passA", "passB"]).toContain(part);
            expect(isRemoval(log[i], best)).toBe(true);
          }
        }
      }),
      { seed: 20261201, numRuns: 250 },
    );
  }, 120_000);

  // Feature: trace-reducer, Property 2: A Reducer_Result is sound
  it("Property 2: a reducer result is sound", () => {
    const n = { stoppedAtBudgetTrue: 0, stoppedAtBudgetFalse: 0, acceptedDdmin: 0, acceptedPassA: 0, acceptedPassB: 0, acceptedPassC: 0, otherRuleAnswer: 0 };
    fc.assert(
      fc.property(arbCase, (c) => {
        const r = runCase(c);
        const res = r.final.result;
        expect(res).toBeDefined();
        if (res === undefined) return;
        const oracle = makeSyntheticOracle(c.oracleSpec, c.sentence);
        const again = oracle(deep(res.reducedList));
        expect(again).toStrictEqual({ kind: "breaks", violation: res.violation });
        expect(res.violation.rule).toBe(c.sentence);
        const la = latestAccepted(r, r.reports.length);
        expect(res.violation).toStrictEqual((r.answers[la] as { violation: unknown }).violation);
        expect(res.originalEventCount).toBe(gcount(c.original));
        expect(res.reducedEventCount).toBe(gcount(res.reducedList));
        expect(res.reducedEventCount).toBeLessThanOrEqual(res.originalEventCount);
        expect(isMappedSubsequence(res.reducedList, c.original)).toBe(true);
        if (la === 0) expect(res.reducedList).toStrictEqual(c.original);
        if (gcount(c.original) === 0) expect(res.candidatesTried).toBe(1);
        expect(res.candidatesTried).toBeGreaterThanOrEqual(1);
        expect(res.candidatesTried).toBeLessThanOrEqual(c.budget);
        expect(res.candidatesTried).toBe(r.log.length);
        expect(JSON.parse(JSON.stringify(res))).toStrictEqual(res);
        if (res.stoppedAtBudget) n.stoppedAtBudgetTrue++;
        else n.stoppedAtBudgetFalse++;
        for (const p of r.reports) {
          if (!p.accepted) continue;
          if (p.part === "ddmin") n.acceptedDdmin++;
          if (p.part === "passA") n.acceptedPassA++;
          if (p.part === "passB") n.acceptedPassB++;
          if (p.part === "passC") n.acceptedPassC++;
        }
        for (const a of r.answers) if (a.kind === "breaks" && a.violation.rule === OTHER_RULE) n.otherRuleAnswer++;
      }),
      { seed: 20261202, numRuns: 250 },
    );
    console.log(`Property 2 counters ${JSON.stringify(n)}`);
    for (const [k, v] of Object.entries(n)) expect(v, k).toBeGreaterThan(0);
  }, 120_000);

  // Feature: trace-reducer, Property 3: An unbudgeted end is 1-minimal
  it("Property 3: an end that is not at the budget is 1-minimal", () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        const r = runCase(c);
        const res = r.final.result;
        if (res === undefined || res.stoppedAtBudget) return;
        const oracle = makeSyntheticOracle(c.oracleSpec, c.sentence);
        const la = latestAccepted(r, r.reports.length);
        const later = new Set(r.log.slice(la + 1).map((l) => JSON.stringify(l)));
        res.reducedList.forEach((e, i) => {
          if (e.gremlinId === "rest") return;
          const one = res.reducedList.filter((_, j) => j !== i);
          const a = oracle(deep(one));
          expect(a.kind === "breaks" && a.violation.rule === c.sentence).toBe(false);
          expect(later.has(JSON.stringify(one))).toBe(true);
        });
      }),
      { seed: 20261203, numRuns: 250 },
    );
  }, 120_000);

  // Feature: trace-reducer, Property 4: Rounds and passes follow the fixed order
  it("Property 4: rounds and passes follow the fixed order", () => {
    const n = { passARun: 0, passBRun: 0, passCRun: 0 };
    fc.assert(
      fc.property(arbCase, (c) => {
        const r = runCase(c);
        const model = modelSearch(c.original, c.fixture, c.sentence, makeSyntheticOracle(c.oracleSpec, c.sentence));
        expect(model).not.toBe("does-not-break");
        if (model === "does-not-break") return;
        const parts = r.reports.map((p) => p.part);
        expect(parts.slice(0, model.log.length)).toStrictEqual(model.log.slice(0, parts.length).map((x) => x.part));
        expect(r.log).toStrictEqual(model.log.slice(0, r.log.length).map((x) => x.list));
        const res = r.final.result;
        if (res !== undefined && !res.stoppedAtBudget) {
          expect(r.log.length).toBe(model.log.length);
          expect(res.reducedList).toStrictEqual(model.best);
        }
        for (let i = 1; i < parts.length; i++) {
          if (parts[i] === parts[i - 1]) continue;
          const best = bestBefore(c, r, i);
          if (parts[i] === "passA") {
            n.passARun++;
            const drop = new Set(refNoChange(best, c.fixture));
            expect(r.log[i]).toStrictEqual(best.filter((_, j) => !drop.has(j)));
          }
          if (parts[i] === "passB") n.passBRun++;
          if (parts[i] === "passC") {
            n.passCRun++;
            expect(r.log[i]).toStrictEqual(best.map((e) => (isEligible(e) ? { ...e, analog: refSnap((e as { analog: number }).analog) } : e)));
          }
        }
      }),
      { seed: 20261204, numRuns: 250 },
    );
    console.log(`Property 4 counters ${JSON.stringify(n)}`);
    for (const [k, v] of Object.entries(n)) expect(v, k).toBeGreaterThan(0);
  }, 120_000);

  // Feature: trace-reducer, Property 5: Determinism and slicing invariance
  it("Property 5: determinism and slicing invariance", () => {
    const invalid: unknown[] = [0, -1, 1.5, Number.NaN, "3", Number.POSITIVE_INFINITY];
    fc.assert(
      fc.property(arbCase, arbSlices, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (c, slicesRaw, interleave) => {
        const slices = slicesRaw.map((k) => Math.min(k, c.budget));
        const a = runCase(c);
        const b = runCase(deep(c));
        expect(b).toStrictEqual(a);

        // Sliced run with invalid k mixed in.
        const log: ReducerEvent[][] = [];
        const answers: OracleOutcome[] = [];
        const reports: ProgressReport[] = [];
        const h = handleFor(c, c.budget, log, answers, reports);
        let final: StepReport | null = null;
        for (let i = 0; final === null; i++) {
          const bad = invalid[i % invalid.length];
          const before = log.length;
          const e = h.step(bad as number);
          expect(isErr(e) && e.kind === "invalid-input" && e.field === "k").toBe(true);
          expect(log.length).toBe(before);
          expect(reports.length).toBe(before);
          const k = slices[i % slices.length];
          const s = h.step(k);
          if (isErr(s)) throw new Error(s.message);
          const made = log.length - before;
          expect(made).toBeLessThanOrEqual(k);
          if (!s.ended) expect(made).toBe(k);
          const last = reports[reports.length - 1];
          expect(s.candidatesTried).toBe(last.candidatesTried);
          expect(s.bestGremlinCount).toBe(last.bestGremlinCount);
          if (s.ended) final = s;
        }
        expect({ log, answers, reports, final }).toStrictEqual(a);

        // Two handles stepped in an interleaving.
        const l1: ReducerEvent[][] = [], a1: OracleOutcome[] = [], r1: ProgressReport[] = [];
        const l2: ReducerEvent[][] = [], a2: OracleOutcome[] = [], r2: ProgressReport[] = [];
        const h1 = handleFor(c, c.budget, l1, a1, r1);
        const h2 = handleFor(c, c.budget, l2, a2, r2);
        let f1: StepReport | null = null;
        let f2: StepReport | null = null;
        for (let i = 0; f1 === null || f2 === null; i++) {
          const k = slices[i % slices.length];
          if (interleave[i % interleave.length] && f1 === null) {
            const s = h1.step(k) as StepReport;
            if (s.ended) f1 = s;
          } else if (f2 === null) {
            const s = h2.step(k) as StepReport;
            if (s.ended) f2 = s;
          } else {
            const s = h1.step(k) as StepReport;
            if (s.ended) f1 = s;
          }
        }
        expect({ log: l1, answers: a1, reports: r1, final: f1 }).toStrictEqual(a);
        expect({ log: l2, answers: a2, reports: r2, final: f2 }).toStrictEqual(a);
      }),
      { seed: 20261205, numRuns: 200 },
    );
  }, 120_000);

  // Feature: trace-reducer, Property 6: A Budget cuts the unbudgeted run at the same point
  it("Property 6: a budget cuts the unbudgeted run at the same point", () => {
    fc.assert(
      fc.property(arbCase, fc.integer({ min: 1, max: 1_000_000 }), (c, pick) => {
        const u = runCase(c, UNLIMITED);
        const ures = u.final.result;
        expect(ures).toBeDefined();
        if (ures === undefined) return;
        expect(ures.stoppedAtBudget).toBe(false);
        const T = ures.candidatesTried;
        for (const b of [T, T + 1]) {
          const r = runCase(c, b);
          expect(r.final.result).toStrictEqual(ures);
        }
        if (T >= 2) {
          for (const b of [T - 1, 1 + (pick % (T - 1))]) {
            const log: ReducerEvent[][] = [];
            const answers: OracleOutcome[] = [];
            const reports: ProgressReport[] = [];
            const h = handleFor(c, b, log, answers, reports);
            const f = drive(h, [b]);
            expect(log).toStrictEqual(u.log.slice(0, b));
            expect(reports).toStrictEqual(u.reports.slice(0, b));
            const res = f.result;
            expect(res).toBeDefined();
            if (res === undefined) return;
            expect(res.candidatesTried).toBe(b);
            expect(res.stoppedAtBudget).toBe(true);
            expect(res.reducedList).toStrictEqual(u.reports[b - 1].bestList);
            const la = latestAccepted(u, b);
            expect(res.violation).toStrictEqual((u.answers[la] as { violation: unknown }).violation);
            const again = h.step(5);
            expect(again).toStrictEqual(f);
            expect(log.length).toBe(b);
          }
        }
      }),
      { seed: 20261206, numRuns: 200 },
    );
  }, 120_000);

  // Feature: trace-reducer, Property 7: Oracle answers are handled as specified
  it("Property 7: oracle answers are handled as specified", () => {
    type A =
      | "same" | "not" | "other" | "throwError" | "throwObj"
      | "null" | "number" | "promise" | "thenable" | "unknownKind" | "badRule" | "negCycle" | "fracCycle" | "bigCycle";
    const arbAnswer = fc.oneof(
      { weight: 6, arbitrary: fc.constantFrom<A>("same", "not", "other") },
      { weight: 1, arbitrary: fc.constantFrom<A>("throwError", "throwObj") },
      { weight: 1, arbitrary: fc.constantFrom<A>("null", "number", "promise", "thenable", "unknownKind", "badRule", "negCycle", "fracCycle", "bigCycle") },
    );
    const n = { endedOriginalDoesNotBreak: 0, endedOracleThrew: 0, endedMalformed: 0, endedCallbackError: 0 };
    const sentence = "OUT is 1 must never happen.";
    fc.assert(
      fc.property(
        arbFixture.chain((f) => fc.tuple(fc.constant(f), arbRandomList(f))),
        fc.oneof({ weight: 3, arbitrary: fc.constant<A>("same") }, { weight: 1, arbitrary: arbAnswer }),
        fc.array(arbAnswer, { maxLength: 30 }),
        fc.option(fc.integer({ min: 1, max: 20 }), { nil: null }),
        fc.integer({ min: 1, max: 40 }),
        ([fixture, original], first, rest, callbackAt, budget) => {
          const script: A[] = [first, ...rest];
          const log: ReducerEvent[][] = [];
          const reports: ProgressReport[] = [];
          let lastReturned: { violation?: { rule: string; cycle: number } } | null = null;
          const oracle: Oracle = (cand) => {
            if (lastReturned !== null && lastReturned.violation !== undefined) lastReturned.violation.rule = "changed later.";
            log.push(deep(cand));
            const a = script[log.length - 1] ?? "not";
            const cyc = 7;
            let out: unknown;
            switch (a) {
              case "same": out = { kind: "breaks", violation: { rule: sentence, cycle: cyc } }; break;
              case "not": out = { kind: "does-not" }; break;
              case "other": out = { kind: "breaks", violation: { rule: OTHER_RULE, cycle: cyc } }; break;
              case "throwError": throw new Error("boom");
              case "throwObj": throw { kind: "bridge-error", message: "fake" };
              case "null": out = null; break;
              case "number": out = 3; break;
              case "promise": out = Promise.resolve({ kind: "does-not" }); break;
              case "thenable": out = { kind: "does-not", then: () => undefined }; break;
              case "unknownKind": out = { kind: "maybe" }; break;
              case "badRule": out = { kind: "breaks", violation: { rule: 5, cycle: 1 } }; break;
              case "negCycle": out = { kind: "breaks", violation: { rule: sentence, cycle: -1 } }; break;
              case "fracCycle": out = { kind: "breaks", violation: { rule: sentence, cycle: 1.5 } }; break;
              case "bigCycle": out = { kind: "breaks", violation: { rule: sentence, cycle: 2 ** 53 } }; break;
            }
            lastReturned = out as { violation?: { rule: string; cycle: number } };
            return out as OracleOutcome;
          };
          const h = createReducerCore(
            { originalList: original, fixture, sentence, budget, oracle },
            {
              onProgress: (r) => {
                reports.push(deep(r));
                if (callbackAt !== null && r.candidatesTried === callbackAt) throw new Error("callback failure");
              },
            },
          );
          if ("kind" in h) throw new Error(h.message);
          const f = drive(h, [3]);
          // Walk the calls and predict the end.
          let best = original;
          let predicted: { kind: string; candidate?: number; how?: string; cause?: boolean } | null = null;
          for (let i = 0; i < log.length; i++) {
            const a = script[i] ?? "not";
            const call = i + 1;
            if (a === "throwError" || a === "throwObj") {
              predicted = { kind: "oracle-error", candidate: call, how: "threw", cause: a === "throwObj" };
              expect(reports.length).toBe(i);
              break;
            }
            if (!["same", "not", "other"].includes(a)) {
              predicted = { kind: "oracle-error", candidate: call, how: "malformed", cause: false };
              expect(reports.length).toBe(i);
              break;
            }
            if (a === "same") best = log[i];
            expect(reports[i].bestList).toStrictEqual(best);
            expect(reports[i].accepted).toBe(a === "same");
            if (callbackAt === call) {
              predicted = { kind: "callback-error", candidate: call };
              break;
            }
            if (call === 1 && a !== "same") {
              predicted = { kind: "original-does-not-break" };
              break;
            }
          }
          if (predicted === null) {
            expect(f.result).toBeDefined();
            expect(f.result?.violation).toStrictEqual({ rule: sentence, cycle: 7 });
            return;
          }
          expect(f.error?.kind).toBe(predicted.kind);
          expect(f.result).toBeUndefined();
          if (predicted.kind === "oracle-error") {
            expect(f.error?.candidate).toBe(predicted.candidate);
            expect(f.error?.how).toBe(predicted.how);
            expect(f.error?.cause !== undefined).toBe(predicted.cause);
            if (predicted.how === "threw") n.endedOracleThrew++;
            else n.endedMalformed++;
          }
          if (predicted.kind === "callback-error") {
            expect(f.error?.candidate).toBe(predicted.candidate);
            expect(f.error?.candidatesTried).toBe(predicted.candidate);
            n.endedCallbackError++;
          }
          if (predicted.kind === "original-does-not-break") {
            expect(f.candidatesTried).toBe(1);
            expect(f.error?.candidatesTried).toBe(1);
            n.endedOriginalDoesNotBreak++;
          }
          const before = log.length;
          expect(h.step(4)).toStrictEqual(f);
          expect(log.length).toBe(before);
        },
      ),
      { seed: 20261207, numRuns: 300 },
    );
    console.log(`Property 7 counters ${JSON.stringify(n)}`);
    for (const [k, v] of Object.entries(n)) expect(v, k).toBeGreaterThan(0);
  }, 120_000);

  // Feature: trace-reducer, Property 8: Caller changes after the fact change nothing
  it("Property 8: caller changes after the fact change nothing", () => {
    fc.assert(
      fc.property(arbCase, (c0) => {
        const c = { ...c0, budget: Math.min(c0.budget, 300) };
        const snapshot = deep(c);
        const plain = runCase(c);
        // Plain-data comparison: fast-check records have a null prototype.
        expect(deep(c)).toStrictEqual(snapshot);

        const passedList = deep(c.original);
        const passedFixture = deep(c.fixture);
        const seen: ReducerEvent[][] = [];
        const log: ReducerEvent[][] = [];
        const answers: OracleOutcome[] = [];
        const reports: ProgressReport[] = [];
        const base = makeSyntheticOracle(c.oracleSpec, c.sentence);
        const oracle: Oracle = (cand) => {
          for (const s of seen) for (const e of s) e.cycle += 1;
          log.push(deep(cand));
          const a = base(cand);
          answers.push(deep(a));
          seen.push(cand);
          for (const e of cand) (e as { signal: string }).signal = "X";
          return a;
        };
        const h = createReducerCore(
          { originalList: passedList, fixture: passedFixture, sentence: c.sentence, budget: c.budget, oracle },
          {
            onProgress: (r) => {
              reports.push(deep(r));
              for (const e of r.bestList) e.cycle = -5;
              r.bestList.length = 0;
            },
          },
        );
        if ("kind" in h) throw new Error(h.message);
        for (const e of passedList) e.cycle = 123456789;
        passedList.length = 0;
        for (const p of passedFixture.pins) (p as { signal: string }).signal = "Z";
        let final: StepReport | null = null;
        while (final === null) {
          const s = h.step(2) as StepReport;
          if (s.ended) final = deep(s);
          (s as { candidatesTried: number }).candidatesTried = -1;
          if (s.result !== undefined) {
            s.result.reducedList.length = 0;
            s.result.violation.rule = "x";
          }
        }
        expect({ log, answers, reports, final }).toStrictEqual(plain);
        expect(h.step(1)).toStrictEqual(final);
      }),
      { seed: 20261208, numRuns: 200 },
    );
  }, 120_000);
});