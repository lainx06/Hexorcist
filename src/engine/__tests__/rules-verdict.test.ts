// Task 6.6: computeVerdict with the optional untriggeredRules field (Req 12.4 to 12.11).
// Expectations are written from the requirement text, not from observed output.

import { describe, expect, it } from "vitest";
import {
  computeVerdict,
  heldText,
  REASON_MAX_LENGTH,
  type VerdictInput,
} from "../verdict";
import type { RunResult } from "../types";

const BTN_EVENT = { signal: "BTN", value: 1 as const, cycle: 5, gremlinId: "bounce" };

function makeRun(runIndex: number, over: Partial<RunResult> = {}): RunResult {
  return {
    runIndex,
    runSeed: 1000 + runIndex,
    eventList: [{ ...BTN_EVENT }],
    skipped: [],
    appliedInputs: [],
    outputEvents: [{ signal: "LED", value: 1, cycle: 10 }],
    diagnostics: [],
    cannotCheck: [],
    violation: null,
    endCycle: 100,
    ...over,
  };
}

function makeInput(over: Partial<VerdictInput> = {}): VerdictInput {
  return {
    requestedRuns: 2,
    runs: [makeRun(0), makeRun(1)],
    finished: true,
    unmappedSignals: [],
    unsupportedPeripherals: [],
    ...over,
  };
}

const trig = (s: string, n: string): string =>
  `Rule "${s}" could not be checked: trigger never happened in ${n}`;

describe("computeVerdict untriggeredRules: run count in the trigger reason (Req 12.5, 12.6, 12.10)", () => {
  it("writes '1 run' for one completed Run in the COULDN'T TELL reason", () => {
    const v = computeVerdict(
      makeInput({ requestedRuns: 1, runs: [makeRun(0)], untriggeredRules: ["R"] }),
    );
    expect(v).toEqual({ verdict: "COULDN'T TELL", reason: trig("R", "1 run") });
  });

  it("writes '2 runs' for two completed Runs in the COULDN'T TELL reason", () => {
    const v = computeVerdict(makeInput({ untriggeredRules: ["R"] }));
    expect(v).toEqual({ verdict: "COULDN'T TELL", reason: trig("R", "2 runs") });
  });

  it("takes N from runs.length, not requestedRuns", () => {
    const v = computeVerdict(
      makeInput({ requestedRuns: 5, runs: [makeRun(0), makeRun(1)], untriggeredRules: ["R"] }),
    );
    expect(v).toMatchObject({ verdict: "COULDN'T TELL" });
    const reason = (v as { reason: string }).reason;
    expect(reason).toContain("trigger never happened in 2 runs");
    expect(reason).not.toContain("in 5 runs");
  });

  it("writes '0 runs' for an empty runs list", () => {
    const v = computeVerdict(makeInput({ requestedRuns: 3, runs: [], untriggeredRules: ["R"] }));
    expect(v).toMatchObject({ verdict: "COULDN'T TELL" });
    expect((v as { reason: string }).reason).toContain(trig("R", "0 runs"));
  });

  it("writes '1 run' in the BROKE unchecked list", () => {
    const v = computeVerdict(
      makeInput({
        requestedRuns: 1,
        runs: [makeRun(0, { violation: { rule: "V", cycle: 7 } })],
        untriggeredRules: ["R"],
      }),
    );
    expect(v).toMatchObject({ verdict: "BROKE" });
    expect((v as { unchecked: unknown }).unchecked).toEqual([
      { rule: "R", reason: "trigger never happened in 1 run" },
    ]);
  });

  it("writes '2 runs' in the BROKE unchecked list and ignores requestedRuns", () => {
    const v = computeVerdict(
      makeInput({
        requestedRuns: 9,
        runs: [makeRun(0, { violation: { rule: "V", cycle: 7 } }), makeRun(1)],
        untriggeredRules: ["R"],
      }),
    );
    expect(v).toMatchObject({ verdict: "BROKE" });
    expect((v as { unchecked: unknown }).unchecked).toEqual([
      { rule: "R", reason: "trigger never happened in 2 runs" },
    ]);
  });
});

describe("computeVerdict untriggeredRules: part order and the 200-unit cut (Req 12.5)", () => {
  it("orders Run CannotCheck parts, trigger parts, unmapped-signal, then unsupported-peripheral parts", () => {
    const v = computeVerdict(
      makeInput({
        runs: [makeRun(0, { cannotCheck: [{ rule: "a", reason: "r" }] }), makeRun(1)],
        untriggeredRules: ["b"],
        unmappedSignals: ["s"],
        unsupportedPeripherals: ["p"],
      }),
    );
    const expected = [
      'Rule "a" could not be checked: r',
      trig("b", "2 runs"),
      "Signals not mapped to a pin: s",
      "Peripherals not supported: p",
    ].join("; ");
    expect(expected.length).toBeLessThanOrEqual(REASON_MAX_LENGTH);
    expect(v).toEqual({ verdict: "COULDN'T TELL", reason: expected });
  });

  it("orders trigger parts before unsupported-peripheral, short-run and no-gremlin-event parts", () => {
    const v = computeVerdict(
      makeInput({
        requestedRuns: 2,
        runs: [makeRun(0, { eventList: [] })],
        untriggeredRules: ["b"],
        unsupportedPeripherals: ["p"],
      }),
    );
    const expected = [
      trig("b", "1 run"),
      "Peripherals not supported: p",
      "Only 1 of 2 runs completed",
      "No gremlin produced an event in any run",
    ].join("; ");
    expect(expected.length).toBeLessThanOrEqual(REASON_MAX_LENGTH);
    expect(v).toEqual({ verdict: "COULDN'T TELL", reason: expected });
  });

  it("cuts a long joined reason at 200 UTF-16 units", () => {
    const parts = [
      'Rule "a" could not be checked: r',
      trig("b", "2 runs"),
      "Signals not mapped to a pin: s",
      "Peripherals not supported: p",
      "Only 1 of 2 runs completed",
      "No gremlin produced an event in any run",
    ];
    const joined = parts.join("; ");
    expect(joined.length).toBeGreaterThan(REASON_MAX_LENGTH);
    const v = computeVerdict(
      makeInput({
        requestedRuns: 3,
        runs: [makeRun(0, { cannotCheck: [{ rule: "a", reason: "r" }], eventList: [] }), makeRun(1, { eventList: [] })],
        untriggeredRules: ["b"],
        unmappedSignals: ["s"],
        unsupportedPeripherals: ["p"],
      }),
    );
    // Only 2 of 3 runs completed here, so rebuild the expected short-run part.
    const expected = [...parts.slice(0, 4), "Only 2 of 3 runs completed", parts[5]]
      .join("; ")
      .slice(0, REASON_MAX_LENGTH);
    expect(v).toEqual({ verdict: "COULDN'T TELL", reason: expected });
    expect((v as { reason: string }).reason).toHaveLength(REASON_MAX_LENGTH);
  });

  it("does not leave half of a surrogate pair when the cut falls inside one", () => {
    // The first part has 31 characters of prefix; 168 filler units put the emoji on units 199 and 200.
    const longReason = "x".repeat(168) + "\u{1F600}";
    const v = computeVerdict(
      makeInput({
        runs: [makeRun(0, { cannotCheck: [{ rule: "a", reason: longReason }] }), makeRun(1)],
        untriggeredRules: ["b"],
      }),
    );
    const reason = (v as { reason: string }).reason;
    expect(reason).toHaveLength(199);
    expect(reason.endsWith("x")).toBe(true);
  });
});

describe("computeVerdict untriggeredRules: de-duplication (Req 12.5, 12.6)", () => {
  it("writes one COULDN'T TELL part per distinct sentence, in field order", () => {
    const v = computeVerdict(makeInput({ untriggeredRules: ["b", "a", "b", "a", "b"] }));
    expect(v).toEqual({
      verdict: "COULDN'T TELL",
      reason: [trig("b", "2 runs"), trig("a", "2 runs")].join("; "),
    });
  });

  it("lists a repeated sentence once in BROKE unchecked, in field order after existing entries", () => {
    const v = computeVerdict(
      makeInput({
        runs: [
          makeRun(0, {
            violation: { rule: "V", cycle: 7 },
            cannotCheck: [{ rule: "old", reason: "why" }],
          }),
          makeRun(1),
        ],
        untriggeredRules: ["b", "a", "b"],
      }),
    );
    expect((v as { unchecked: unknown }).unchecked).toEqual([
      { rule: "old", reason: "why" },
      { rule: "b", reason: "trigger never happened in 2 runs" },
      { rule: "a", reason: "trigger never happened in 2 runs" },
    ]);
  });

  it("skips a BROKE entry whose rule and reason already appear in unchecked", () => {
    const v = computeVerdict(
      makeInput({
        runs: [
          makeRun(0, {
            violation: { rule: "V", cycle: 7 },
            cannotCheck: [{ rule: "b", reason: "trigger never happened in 2 runs" }],
          }),
          makeRun(1),
        ],
        untriggeredRules: ["b", "a"],
      }),
    );
    expect((v as { unchecked: unknown }).unchecked).toEqual([
      { rule: "b", reason: "trigger never happened in 2 runs" },
      { rule: "a", reason: "trigger never happened in 2 runs" },
    ]);
  });

  it("keeps an entry with the same rule but a different reason", () => {
    const v = computeVerdict(
      makeInput({
        runs: [
          makeRun(0, {
            violation: { rule: "V", cycle: 7 },
            cannotCheck: [{ rule: "b", reason: "another reason" }],
          }),
          makeRun(1),
        ],
        untriggeredRules: ["b"],
      }),
    );
    expect((v as { unchecked: unknown }).unchecked).toEqual([
      { rule: "b", reason: "another reason" },
      { rule: "b", reason: "trigger never happened in 2 runs" },
    ]);
  });
});

describe("computeVerdict untriggeredRules: BROKE trace and unfinished campaigns (Req 12.6, 12.11)", () => {
  it("returns a BROKE trace deep-equal to the one without the field", () => {
    const runs = [
      makeRun(0),
      makeRun(1, { violation: { rule: "V", cycle: 9 } }),
      makeRun(2, { violation: { rule: "W", cycle: 3 } }),
    ];
    const without = computeVerdict(makeInput({ requestedRuns: 3, runs }));
    const withField = computeVerdict(makeInput({ requestedRuns: 3, runs, untriggeredRules: ["a", "b"] }));
    expect(without).toMatchObject({ verdict: "BROKE" });
    expect(withField).toMatchObject({ verdict: "BROKE" });
    expect((withField as { trace: unknown }).trace).toEqual((without as { trace: unknown }).trace);
    expect((withField as { trace: { runIndex: number } }).trace.runIndex).toBe(1);
  });

  it("does not change its argument", () => {
    const input = makeInput({
      runs: [makeRun(0, { violation: { rule: "V", cycle: 7 } }), makeRun(1)],
      untriggeredRules: ["a"],
    });
    const copy = structuredClone(input);
    computeVerdict(input);
    expect(input).toEqual(copy);
  });

  it("returns null when finished is false, whatever the field holds", () => {
    for (const field of [undefined, [], ["a"], ["a", "b", "a"]]) {
      const input = makeInput({ finished: false });
      if (field !== undefined) input.untriggeredRules = field;
      expect(computeVerdict(input)).toBeNull();
    }
    const withViolation = makeInput({
      finished: false,
      runs: [makeRun(0, { violation: { rule: "V", cycle: 1 } })],
      untriggeredRules: ["a"],
    });
    expect(computeVerdict(withViolation)).toBeNull();
  });
});

describe("computeVerdict untriggeredRules: absent and empty field (Req 12.9)", () => {
  const representative: Record<string, VerdictInput> = {
    broke: makeInput({
      runs: [
        makeRun(0, { cannotCheck: [{ rule: "old", reason: "why" }] }),
        makeRun(1, { violation: { rule: "V", cycle: 7 } }),
      ],
    }),
    couldntTellFromCannotCheck: makeInput({
      runs: [makeRun(0, { cannotCheck: [{ rule: "old", reason: "why" }] }), makeRun(1)],
      unmappedSignals: ["X"],
      unsupportedPeripherals: ["P"],
    }),
    couldntTellShortRunNoEvents: makeInput({
      requestedRuns: 4,
      runs: [makeRun(0, { eventList: [] })],
    }),
    couldntTellEmptyRuns: makeInput({ requestedRuns: 2, runs: [] }),
    held: makeInput(),
    notFinished: makeInput({ finished: false }),
  };

  for (const [name, base] of Object.entries(representative)) {
    it(`gives deep-equal values with the field absent and with []: ${name}`, () => {
      const absent = computeVerdict(base);
      const empty = computeVerdict({ ...base, untriggeredRules: [] });
      expect(empty).toEqual(absent);
    });
  }

  it("covers a BROKE, a COULDN'T TELL, a HELD and a null outcome among the representative inputs", () => {
    const kinds = Object.values(representative).map((i) => computeVerdict(i)?.verdict ?? null);
    expect(kinds).toContain("BROKE");
    expect(kinds).toContain("COULDN'T TELL");
    expect(kinds).toContain("HELD");
    expect(kinds).toContain(null);
  });

  it("returns the held outcome for the quiet inputs with the field absent", () => {
    expect(computeVerdict(representative.held)).toEqual({
      verdict: "HELD",
      text: heldText(2),
      runs: 2,
    });
  });
});

describe("heldText wording: emulated runs, singular 'run' for one run (Req 12.8)", () => {
  it("heldText(1) reads '1 emulated run'", () => {
    expect(heldText(1)).toBe("No violation found in 1 emulated run of this gremlin set. Not a proof.");
  });

  it("heldText(2) reads '2 emulated runs'", () => {
    expect(heldText(2)).toBe("No violation found in 2 emulated runs of this gremlin set. Not a proof.");
  });
});
