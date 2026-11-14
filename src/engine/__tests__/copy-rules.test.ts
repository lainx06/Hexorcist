// Copy-rule scan (task 23.3). Scans only user-visible engine strings.
// Passing here is evidence, not proof.
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../copy-rules";
import type { RunResult } from "../types";
import {
  EMPTY_REASON_TEXT,
  VERDICT_BROKE,
  VERDICT_COULDNT_TELL,
  computeVerdict,
  heldText,
  type VerdictInput,
} from "../verdict";

const escape = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Banned words found in `text` as whole words, ignoring case. */
function bannedIn(text: string): string[] {
  return BANNED_WORDS.filter((w) =>
    new RegExp(`(?<![A-Za-z0-9_-])${escape(w)}(?![A-Za-z0-9_-])`, "i").test(text),
  );
}

const run = (runIndex: number, over: Partial<RunResult> = {}): RunResult => ({
  runIndex,
  runSeed: runIndex,
  eventList: [{ signal: "D2", value: 1, cycle: 10, gremlinId: "bounce" }],
  skipped: [],
  appliedInputs: [],
  outputEvents: [],
  diagnostics: [],
  cannotCheck: [],
  violation: null,
  endCycle: 100,
  ...over,
});

const base = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  requestedRuns: 2,
  runs: [run(0), run(1)],
  finished: true,
  unmappedSignals: [],
  unsupportedPeripherals: [],
  ...over,
});

describe("copy rules", () => {
  it("the word matcher catches whole words only, ignoring case", () => {
    expect(bannedIn("This is SAFE")).toEqual(["safe"]);
    expect(bannedIn("a Real-Time loop")).toEqual(["real-time"]);
    expect(bannedIn("unsafe, firsthand, security")).toEqual([]);
  });

  it("exported text constants avoid the banned words", () => {
    for (const text of [VERDICT_BROKE, VERDICT_COULDNT_TELL, EMPTY_REASON_TEXT]) {
      expect(bannedIn(text), text).toEqual([]);
    }
  });

  it("heldText(n) avoids the banned words", () => {
    for (const n of [0, 1, 2, 64, 1000]) {
      expect(bannedIn(heldText(n)), heldText(n)).toEqual([]);
    }
  });

  it("verdict strings on every computeVerdict path avoid the banned words", () => {
    const outputs: string[] = [];
    const collect = (input: VerdictInput): void => {
      const v = computeVerdict(input);
      if (v === null) return;
      outputs.push(v.verdict);
      if (v.verdict === "HELD") outputs.push(v.text);
      if (v.verdict === VERDICT_COULDNT_TELL) outputs.push(v.reason);
    };
    const neutral = { rule: "rule-a", reason: "no data" };

    // BROKE
    collect(base({ runs: [run(0), run(1, { violation: { rule: "rule-a", cycle: 5 } })] }));
    // HELD
    collect(base());
    collect(base({ requestedRuns: 1, runs: [run(0)] }));
    // COULDN'T TELL: each reason path alone
    collect(base({ runs: [run(0, { cannotCheck: [neutral] }), run(1)] }));
    collect(base({ unmappedSignals: ["X9"] }));
    collect(base({ unsupportedPeripherals: ["TWI"] }));
    collect(base({ requestedRuns: 3 }));
    collect(base({ runs: [run(0, { eventList: [] }), run(1, { eventList: [] })] }));
    // All reason paths together
    collect(
      base({
        requestedRuns: 3,
        runs: [run(0, { eventList: [], cannotCheck: [neutral] })],
        unmappedSignals: ["X9"],
        unsupportedPeripherals: ["TWI"],
      }),
    );
    // Not finished gives null
    expect(computeVerdict(base({ finished: false }))).toBeNull();

    expect(outputs.length).toBeGreaterThan(10);
    for (const text of outputs) expect(bannedIn(text), text).toEqual([]);
  });

  it("the fixed sentence for an empty reason is the one used and is clean", () => {
    // computeVerdict always has at least one part when it reaches this path, so
    // the sentence is covered through the exported constant above.
    expect(EMPTY_REASON_TEXT.length).toBeGreaterThan(0);
    expect(bannedIn(EMPTY_REASON_TEXT)).toEqual([]);
  });
});
