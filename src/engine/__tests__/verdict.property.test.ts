// Property test for the verdict function (task 23.2).
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CannotCheck, Violation } from "../checker";
import type { GeneratedEvent } from "../gremlins/generate-types";
import type { RunResult } from "../types";
import {
  VERDICT_BROKE,
  VERDICT_COULDNT_TELL,
  computeVerdict,
  heldText,
  type VerdictInput,
} from "../verdict";

const arbText = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.string({ unit: "binary", maxLength: 20 }),
  // Long text, with astral characters, to push reasons past 200 units.
  fc.string({ unit: "binary", minLength: 150, maxLength: 400 }),
  fc.constant("\u{1F47B}".repeat(120)),
);

const arbCannotCheck: fc.Arbitrary<CannotCheck> = fc.record({
  rule: fc.oneof(fc.constantFrom("r1", "r2", "r3"), arbText),
  reason: fc.oneof(fc.constantFrom("x", "y"), arbText),
});

const arbViolation: fc.Arbitrary<Violation> = fc.record({
  rule: fc.constantFrom("r1", "r2", "r3"),
  cycle: fc.integer({ min: 0, max: 100000 }),
});

const arbEvent: fc.Arbitrary<GeneratedEvent> = fc.record({
  signal: fc.constantFrom("D2", "D3", "A0"),
  value: fc.constantFrom(0 as const, 1 as const, "release" as const),
  cycle: fc.integer({ min: 0, max: 100000 }),
  gremlinId: fc.constantFrom("rest", "bounce", "glitch"),
});

const arbRun = (runIndex: number): fc.Arbitrary<RunResult> =>
  fc.record({
    runIndex: fc.constant(runIndex),
    runSeed: fc.integer({ min: 0, max: 0xffffffff }),
    eventList: fc.array(arbEvent, { maxLength: 4 }),
    skipped: fc.constant([]),
    appliedInputs: fc.constant([]),
    outputEvents: fc.array(
      fc.record({
        signal: fc.constantFrom("D13", "D12"),
        value: fc.constantFrom(0 as const, 1 as const),
        cycle: fc.integer({ min: 0, max: 100000 }),
      }),
      { maxLength: 3 },
    ),
    diagnostics: fc.constant([]),
    // Mostly empty so that HELD is reachable.
    cannotCheck: fc.oneof(
      { weight: 4, arbitrary: fc.constant<CannotCheck[]>([]) },
      { weight: 1, arbitrary: fc.array(arbCannotCheck, { maxLength: 3 }) },
    ),
    violation: fc.oneof(
      { weight: 3, arbitrary: fc.constant<Violation | null>(null) },
      { weight: 1, arbitrary: arbViolation },
    ),
    endCycle: fc.integer({ min: 0, max: 100000 }),
  });

const arbNames = fc.oneof(
  { weight: 3, arbitrary: fc.constant([] as string[]) },
  { weight: 1, arbitrary: fc.array(fc.constantFrom("D2", "A3", "X9", "TWI", "SPI"), { maxLength: 3 }) },
);

const arbInput: fc.Arbitrary<VerdictInput> = fc
  .record({
    requestedRuns: fc.integer({ min: 1, max: 6 }),
    shortBy: fc.oneof({ weight: 3, arbitrary: fc.constant(0) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 5 }) }),
    // Distinct Run_Indexes in arbitrary order.
    indexes: fc.uniqueArray(fc.integer({ min: 0, max: 50 }), { minLength: 6, maxLength: 6 }),
    finished: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    unmappedSignals: arbNames,
    unsupportedPeripherals: arbNames,
  })
  .chain((r) => {
    const count = Math.max(0, r.requestedRuns - r.shortBy);
    return fc.tuple(...r.indexes.slice(0, count).map(arbRun)).map(
      (runs): VerdictInput => ({
        requestedRuns: r.requestedRuns,
        runs,
        finished: r.finished,
        unmappedSignals: r.unmappedSignals,
        unsupportedPeripherals: r.unsupportedPeripherals,
      }),
    );
  });

const clone = <T>(v: T): T => structuredClone(v);

describe("Verdict function", () => {
  // Feature: gremlin-engine, Property 22: Verdict function
  // Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12
  it("Property 22: pure, null when unfinished, one verdict, priority, lowest violating run, reason length, no early HELD", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const before = clone(input);
        const a = computeVerdict(input);
        const b = computeVerdict(input);
        // Pure: input untouched, same output for the same input.
        expect(input).toEqual(before);
        expect(b).toEqual(a);

        if (!input.finished) {
          expect(a).toBeNull();
          return;
        }
        expect(a).not.toBeNull();
        if (a === null) return;

        const violating = input.runs.filter((r) => r.violation !== null);
        const anyCannotCheck = input.runs.some((r) => r.cannotCheck.length > 0);
        const anyEvent = input.runs.some((r) => r.eventList.some((e) => e.gremlinId !== "rest"));
        const couldntTell =
          anyCannotCheck ||
          input.unmappedSignals.length > 0 ||
          input.unsupportedPeripherals.length > 0 ||
          input.runs.length !== input.requestedRuns ||
          !anyEvent;

        if (violating.length > 0) {
          // BROKE wins over everything else, with the lowest violating Run_Index.
          expect(a.verdict).toBe(VERDICT_BROKE);
          if (a.verdict !== VERDICT_BROKE) return;
          const lowest = violating.reduce((m, r) => (r.runIndex < m.runIndex ? r : m));
          expect(a.trace.runIndex).toBe(lowest.runIndex);
          expect(a.trace.runSeed).toBe(lowest.runSeed);
          expect(a.trace.violation).toEqual(lowest.violation);
          expect(a.trace.eventList).toEqual(lowest.eventList);
          expect(a.trace.outputEvents).toEqual(lowest.outputEvents);

          // Unchecked rules and unmapped or unsupported names never change BROKE.
          const stripped: VerdictInput = {
            ...input,
            runs: input.runs.map((r) => ({ ...r, cannotCheck: [] })),
            unmappedSignals: [],
            unsupportedPeripherals: [],
          };
          const plain = computeVerdict(stripped);
          expect(plain?.verdict).toBe(VERDICT_BROKE);
          if (plain?.verdict === VERDICT_BROKE) expect(plain.trace).toEqual(a.trace);
        } else if (couldntTell) {
          expect(a.verdict).toBe(VERDICT_COULDNT_TELL);
          if (a.verdict !== VERDICT_COULDNT_TELL) return;
          expect(a.reason.length).toBeGreaterThanOrEqual(1);
          expect(a.reason.length).toBeLessThanOrEqual(200);
        } else {
          expect(a).toEqual({ verdict: "HELD", text: heldText(input.runs.length), runs: input.runs.length });
          expect(input.runs.length).toBe(input.requestedRuns);
        }

        // HELD never appears while completed runs are below N.
        if (input.runs.length < input.requestedRuns) expect(a.verdict).not.toBe("HELD");
        // Exactly one of the three verdict names.
        expect([VERDICT_BROKE, VERDICT_COULDNT_TELL, "HELD"]).toContain(a.verdict);
      }),
      { numRuns: 200, seed: 2704042722 },
    );
  });
});
