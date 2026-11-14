// Generators for rules-verdict.property.test.ts. Helper, not a test file.

import * as fc from "fast-check";
import type { CannotCheck, Violation } from "../checker";
import type { GeneratedEvent } from "../gremlins/generate-types";
import type { RunResult } from "../types";
import type { VerdictInput } from "../verdict";

const sentencePool = [
  "Never D13 is 1.",
  "After D2 becomes 0, D13 must become 1 within 300 ms.",
  "After D2 becomes 1, D13 must be 0 for at least 2 ms.",
  "D13 must not be 1 for longer than 5 ms.",
  "After A0 is above 500, D12 must become 1 within 10 ms.",
];

const arbCannotCheck: fc.Arbitrary<CannotCheck> = fc.record({
  rule: fc.constantFrom(...sentencePool),
  reason: fc.constantFrom("signal D2 is not mapped to a pin", "run shorter than the rule window", "an input was read while floating"),
});

const arbViolation: fc.Arbitrary<Violation> = fc.record({
  rule: fc.constantFrom(...sentencePool),
  cycle: fc.integer({ min: 0, max: 100_000 }),
});

const arbEvent: fc.Arbitrary<GeneratedEvent> = fc.record({
  signal: fc.constantFrom("D2", "D3", "A0"),
  value: fc.constantFrom(0 as const, 1 as const, "release" as const),
  cycle: fc.integer({ min: 0, max: 100_000 }),
  gremlinId: fc.constantFrom("rest", "bounce", "glitch"),
});

// Mostly clean runs with a non-rest event so that the clean-run outcome is reachable.
const arbRun = (runIndex: number): fc.Arbitrary<RunResult> =>
  fc.record({
    runIndex: fc.constant(runIndex),
    runSeed: fc.integer({ min: 0, max: 0xffffffff }),
    eventList: fc.oneof(
      { weight: 3, arbitrary: fc.array(arbEvent, { minLength: 1, maxLength: 4 }).map((es): GeneratedEvent[] => [...es, { signal: "D2", value: 1, cycle: 5, gremlinId: "bounce" }]) },
      { weight: 1, arbitrary: fc.array(arbEvent.map((e) => ({ ...e, gremlinId: "rest" })), { maxLength: 3 }) },
    ),
    skipped: fc.constant([]),
    appliedInputs: fc.constant([]),
    outputEvents: fc.array(
      fc.record({
        signal: fc.constantFrom("D13", "D12"),
        value: fc.constantFrom(0 as const, 1 as const),
        cycle: fc.integer({ min: 0, max: 100_000 }),
      }),
      { maxLength: 3 },
    ),
    diagnostics: fc.constant([]),
    cannotCheck: fc.oneof(
      { weight: 6, arbitrary: fc.constant<CannotCheck[]>([]) },
      { weight: 1, arbitrary: fc.array(arbCannotCheck, { minLength: 1, maxLength: 3 }) },
    ),
    violation: fc.oneof(
      { weight: 6, arbitrary: fc.constant<Violation | null>(null) },
      { weight: 1, arbitrary: arbViolation },
    ),
    endCycle: fc.integer({ min: 0, max: 100_000 }),
  });

const arbNames = (pool: readonly string[]): fc.Arbitrary<string[]> =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant<string[]>([]) },
    { weight: 1, arbitrary: fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 3 }) },
  );

// absent, explicit empty array, or non-empty (repeats allowed)
const arbUntriggered: fc.Arbitrary<readonly string[] | undefined> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<readonly string[] | undefined>(undefined) },
  { weight: 2, arbitrary: fc.constant<readonly string[] | undefined>([]) },
  { weight: 1, arbitrary: fc.array(fc.constantFrom(...sentencePool), { minLength: 1, maxLength: 4 }) },
);

/** VerdictInput with finished true, 0 to 8 completed Runs in Run_Index order, requestedRuns 1 to 8. */
export const arbVerdictHonestyInput: fc.Arbitrary<VerdictInput> = fc
  .record({
    requestedRuns: fc.integer({ min: 1, max: 8 }),
    // 0 in most cases so that the completed count equals requestedRuns.
    shortBy: fc.oneof({ weight: 3, arbitrary: fc.constant(0) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 8 }) }),
    unmappedSignals: arbNames(["D2", "A3", "X9"]),
    unsupportedPeripherals: arbNames(["TWI", "SPI"]),
    untriggeredRules: arbUntriggered,
  })
  .chain((r) => {
    const count = Math.max(0, r.requestedRuns - r.shortBy);
    return fc.tuple(...Array.from({ length: count }, (_, i) => arbRun(i))).map((runs): VerdictInput => {
      const input: VerdictInput = {
        requestedRuns: r.requestedRuns,
        runs,
        finished: true,
        unmappedSignals: r.unmappedSignals,
        unsupportedPeripherals: r.unsupportedPeripherals,
      };
      return r.untriggeredRules === undefined ? input : { ...input, untriggeredRules: r.untriggeredRules };
    });
  });
