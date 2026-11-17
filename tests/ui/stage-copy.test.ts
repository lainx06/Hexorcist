// Feature: bench-ui-stage, Property 8: Run-data number texts
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  brokeTryLine,
  causeLine,
  cyclesRateText,
  elapsedSeconds,
  fixedProgressText,
  reductionCard,
  runLengthText,
  triesLine,
  tryProgress,
} from "../../src/ui/app/model/stage-copy";
import { stageFlags } from "../../src/ui/app/model/stage";
import type { StagePhase } from "../../src/ui/app/model/stage";
import { reductionCountsArb } from "./stage-arbitraries";

const SEED = 20261201;
const NUM_RUNS = 200;

// References written from the Glossary with BigInt arithmetic. Half-up rounding of a/b is floor((2a + b) / 2b).
function halfUpTenths(num: bigint, den: bigint): bigint {
  return (2n * num + den) / (2n * den);
}
function dec(t: bigint): string {
  return `${String(t / 10n)}.${String(t % 10n)}`;
}
function refElapsed(ms: number): string {
  return `${dec(halfUpTenths(BigInt(ms), 100n))} s`;
}
function refRunLength(cycles: number): string {
  // cycles / 16,000,000 s, in tenths: cycles * 10 / 16,000,000
  const t = halfUpTenths(BigInt(cycles) * 10n, 16_000_000n);
  return t % 10n === 0n ? `${String(t / 10n)} s` : `${dec(t)} s`;
}
function refRate(total: number, ms: number): string {
  // total / (ms / 1000) / 1,000,000 = total / (1000 * ms); in tenths: total * 10 / (1000 * ms)
  return `${dec(halfUpTenths(BigInt(total) * 10n, 1000n * BigInt(ms)))} million chip cycles/s on this computer`;
}

const PHASES: StagePhase[] = ["idle", "running", "shrinking", "broke", "reduce-error", "fix", "held", "couldnt-tell"];

describe("Property 8: Run-data number texts", () => {
  // Feature: bench-ui-stage, Property 8: Run-data number texts
  // **Validates: Requirements 3.2, 10.6**
  it("Try N of M uses N = min(runsCompleted + 1, M), 0 before any message, fill = runsCompleted / M", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.nat(),
        fc.boolean(),
        (m, raw, noMessage) => {
          const completed = raw % (m + 1);
          const p = tryProgress(noMessage ? null : completed, m);
          const n = noMessage ? 0 : Math.min(completed + 1, m);
          expect(p.n).toBe(n);
          expect(p.text).toBe(`Try ${String(n)} of ${String(m)}`);
          expect(p.fill).toBe(noMessage ? 0 : completed / m);
          expect(fixedProgressText(noMessage ? null : completed, m)).toBe(
            `Checking the fixed program: try ${String(n)} of ${String(m)}`,
          );
        },
      ),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 10.6, 18.4**
  it("Elapsed_Seconds equals its integer formula", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (ms) => {
        expect(elapsedSeconds(ms)).toBe(refElapsed(ms));
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 2.6, 18.4**
  it("Run_Length_Text and the tries line equal their formulas, with '1 try' at M = 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 16_000_000 * 120 }),
        fc.integer({ min: 1, max: 5000 }),
        (cycles, m) => {
          expect(runLengthText(cycles)).toBe(refRunLength(cycles));
          const word = m === 1 ? "1 try" : `${String(m)} tries`;
          expect(triesLine(m, cycles)).toBe(`${word} \u00b7 ${refRunLength(cycles)} of device time each`);
        },
      ),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 11.7**
  it("Cycles_Rate_Text equals its formula for ms >= 1 and is absent at 0 ms", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 16_000_000 * 40 * 100 }),
        fc.integer({ min: 1, max: 10_000_000 }),
        (total, ms) => {
          expect(cyclesRateText(total, ms)).toBe(refRate(total, ms));
          expect(cyclesRateText(total, 0)).toBeNull();
        },
      ),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 10.6**
  it("the BROKE line reads 'Broke on try N of M' with N = index + 1 and the Elapsed_Seconds text", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.nat(),
        fc.integer({ min: 0, max: 100_000_000 }),
        (m, raw, ms) => {
          const idx = raw % m;
          expect(brokeTryLine(idx, m, ms)).toBe(
            `Broke on try ${String(idx + 1)} of ${String(m)} \u00b7 found in ${refElapsed(ms)}`,
          );
        },
      ),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });
});

describe("Run-data number texts: stated values", () => {
  it("870 ms gives 0.9 s", () => {
    expect(elapsedSeconds(870)).toBe("0.9 s");
  });
  it("63,788,954 cycles in 870 ms gives 73.3 million chip cycles/s", () => {
    expect(cyclesRateText(63_788_954, 870)).toBe("73.3 million chip cycles/s on this computer");
  });
  it("0 ms gives no rate text", () => {
    expect(cyclesRateText(63_788_954, 0)).toBeNull();
  });
  it("Run_Length_Text reads 1 s and 0.6 s", () => {
    expect(runLengthText(16_000_000)).toBe("1 s");
    expect(runLengthText(9_600_000)).toBe("0.6 s");
  });
  it("one try reads '1 try'", () => {
    expect(triesLine(1, 16_000_000)).toBe("1 try \u00b7 1 s of device time each");
    expect(triesLine(24, 9_600_000)).toBe("24 tries \u00b7 0.6 s of device time each");
  });
  it("Try N of M is 0 before any message and capped at M", () => {
    expect(tryProgress(null, 24).text).toBe("Try 0 of 24");
    expect(tryProgress(24, 24).text).toBe("Try 24 of 24");
    expect(tryProgress(0, 1).text).toBe("Try 1 of 1");
  });
});

describe("Stage phase flags", () => {
  // **Validates: Requirements 2.6, 11.9**
  it("offers the right primary button per phase, and tabsIdle is true until a replay exists", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PHASES), fc.boolean(), (phase, hasReplay) => {
        const f = stageFlags(phase, hasReplay);
        // At most one primary button: the flag holds a single value.
        expect([null, "unleash", "fix"]).toContain(f.primary);
        const expected = phase === "idle" || phase === "running" ? "unleash" : phase === "broke" ? "fix" : null;
        expect(f.primary).toBe(expected);
        expect(f.tabsIdle).toBe(!hasReplay);
        expect(f.setupLocked).toBe(phase === "running" || phase === "shrinking");
        expect(f.hero).toBe(phase === "idle" || phase === "running");
        expect(f.setupExpanded).toBe(f.hero);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });
});

// Expected values written from Contract section 9 (docs/stage-design.md), not from the implementation.
const PINNED = {
  crosswalk: { fp: "47078989121ebc1d", line: "Two quick presses, the second one held, did it." },
  garage: { fp: "616062947f71a1ae", line: "A flickering beam (blocked, cleared, blocked again within 4 ms) did it." },
  heartbeat: { fp: "19827a4e0a7ad440", line: "Holding the sensor on did it." },
} as const;
type PinnedId = keyof typeof PINNED;
const IDS: PinnedId[] = ["crosswalk", "garage", "heartbeat"];
const ALL_PINNED_FPS: string[] = IDS.map((i) => PINNED[i].fp);

const hex16 = fc
  .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 16, maxLength: 16 })
  .map((a) => a.join(""));

describe("Property 9: Cause line gate", () => {
  // Feature: bench-ui-stage, Property 9: Cause line gate
  // **Validates: Requirements 8.1, 8.2, 8.3**
  it("the exact pinned fingerprint gives the Contract line character for character", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IDS), (id) => {
        expect(causeLine(id, PINNED[id].fp)).toBe(PINNED[id].line);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // Feature: bench-ui-stage, Property 9: Cause line gate
  it("any other 16-hex fingerprint, including another example's pinned one, gives null", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IDS), fc.oneof(hex16, fc.constantFrom(...ALL_PINNED_FPS)), (id, fp) => {
        fc.pre(fp !== PINNED[id].fp);
        expect(causeLine(id, fp)).toBeNull();
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // Feature: bench-ui-stage, Property 9: Cause line gate
  it("no result (null fingerprint, reducer running or ended without a result) gives null", () => {
    fc.assert(
      fc.property(fc.constantFrom(...IDS), (id) => {
        expect(causeLine(id, null)).toBeNull();
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });
});

describe("Property 10: Reduction card", () => {
  const SMALLEST = "The smallest replay this reducer found.";
  const LIMIT = "Shrinking stopped at its limit; fewer moves may still break it.";
  const moves = (n: number): string => (n === 1 ? "1 move" : `${String(n)} moves`);

  // Feature: bench-ui-stage, Property 10: Reduction card
  // **Validates: Requirements 9.1, 9.2, 9.3**
  it("shows the counts line, the smallest-replay line, and exactly one of the 1-minimal or limit sentences", () => {
    fc.assert(
      fc.property(reductionCountsArb, ({ x, y, stoppedAtBudget }) => {
        const c = reductionCard({ ok: true, originalEventCount: x, reducedEventCount: y, stoppedAtBudget });
        if ("error" in c) throw new Error("unexpected error card");
        expect(c.summary).toBe(`${moves(x)} \u2192 ${String(y)} needed`);
        expect(c.smallest).toBe(SMALLEST);
        if (stoppedAtBudget) {
          expect(c.note).toBe(LIMIT);
          expect(c.note).not.toContain("Take away");
        } else {
          expect(c.note).toBe(
            y === 1
              ? "Take away this move and this replay no longer breaks the rule."
              : `Take away any one of these ${String(y)} moves and this replay no longer breaks the rule.`,
          );
          expect(c.note).not.toContain("Shrinking stopped");
        }
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // Feature: bench-ui-stage, Property 10: Reduction card
  // **Validates: Requirements 9.5**
  it("an error shows only its message and none of the 9.1 to 9.3 sentences", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (message) => {
        const c = reductionCard({ ok: false, message });
        expect(c).toEqual({ error: message });
        expect(Object.keys(c)).toEqual(["error"]);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 9.1, 9.2**
  it("pins the example rows 8 -> 3, 7 -> 3 and 2 -> 1", () => {
    const row = (x: number, y: number) =>
      reductionCard({ ok: true, originalEventCount: x, reducedEventCount: y, stoppedAtBudget: false });
    expect(row(8, 3)).toEqual({
      summary: "8 moves \u2192 3 needed",
      smallest: SMALLEST,
      note: "Take away any one of these 3 moves and this replay no longer breaks the rule.",
    });
    expect(row(7, 3)).toEqual({
      summary: "7 moves \u2192 3 needed",
      smallest: SMALLEST,
      note: "Take away any one of these 3 moves and this replay no longer breaks the rule.",
    });
    expect(row(2, 1)).toEqual({
      summary: "2 moves \u2192 1 needed",
      smallest: SMALLEST,
      note: "Take away this move and this replay no longer breaks the rule.",
    });
    expect(row(1, 1)).toMatchObject({ summary: "1 move \u2192 1 needed" });
  });
});
