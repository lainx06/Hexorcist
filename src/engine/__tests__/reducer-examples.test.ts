// Feature: trace-reducer. Acceptance on the real Examples (Requirement 16): crosswalk, garage and
// heartbeat buggy builds, BROKE trace from the committed seeds. Each reduced list is replayed on a
// fresh bridge: it must break the same rule on the buggy build and break no rule on the fixed build.
// No memo. Passing runs are evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import { failureStory } from "../reducer/story";
import { traceFingerprint } from "../reducer/fingerprint";
import { replayEventList } from "../reducer/emulator-run";
import { createEmulatorOracle, createReducer } from "../reducer/reducer";
import { isReducerError } from "../reducer/reducer-error";
import type { ReducerResult } from "../reducer/types";
import type { ExampleId } from "../../../tests/examples/examples-support";
import { loadExample, readHex, runExampleCampaign } from "../../../tests/examples/examples-support";

interface Pinned {
  originalEventCount: number;
  reducedEventCount: number;
  candidatesTried: number;
  fingerprint: string;
}

// Copied character for character from the First_Green_Run's PIN lines. Never rounded or tuned.
const PINNED: Record<"crosswalk" | "garage" | "heartbeat", Pinned | null> = {
  crosswalk: { originalEventCount: 8, reducedEventCount: 3, candidatesTried: 30, fingerprint: "47078989121ebc1d" },
  garage: { originalEventCount: 7, reducedEventCount: 3, candidatesTried: 30, fingerprint: "616062947f71a1ae" },
  heartbeat: { originalEventCount: 2, reducedEventCount: 1, candidatesTried: 4, fingerprint: "19827a4e0a7ad440" },
};

function fail(id: string, fn: string, e: { kind: string; message: string }): never {
  throw new Error(`${id}: ${fn} returned ${e.kind}: ${e.message}`);
}

function acceptance(id: ExampleId): void {
  const ex = loadExample(id);
  const out = runExampleCampaign(ex, "buggy");
  const verdict = out.result.verdict;
  if (verdict.verdict !== "BROKE") throw new Error(`${id}: campaign verdict was ${verdict.verdict}, expected BROKE`);
  const trace = verdict.trace;
  const hex = readHex(id, "buggy");
  const input = {
    hex,
    fixture: ex.fixture,
    ruleSet: ex.ruleSet,
    originalList: trace.eventList,
    violation: trace.violation,
    runCycles: ex.meta.runCycles,
  };
  const h = createReducer(input);
  if (isReducerError(h)) fail(id, "createReducer", h);
  const s = h.step(300);
  if (isReducerError(s)) fail(id, "step", s);
  if (s.error !== undefined) fail(id, "step", s.error);
  expect(s.ended).toBe(true);
  const res = s.result as ReducerResult;

  // Buggy replay: BROKE of the same rule at the same cycle.
  const buggy = replayEventList({ hex, fixture: ex.fixture, ruleSet: ex.ruleSet, events: res.reducedList, runCycles: ex.meta.runCycles, maxStepCycles: 160_000 });
  if (isReducerError(buggy)) fail(id, "replayEventList (buggy)", buggy);
  expect(buggy.violation, `${id}: the buggy replay reported no violation`).not.toBeNull();
  expect(buggy.violation?.rule).toBe(trace.violation.rule);
  expect(buggy.violation?.cycle).toBe(res.violation.cycle);

  // Fixed replay: no violation of any rule.
  const fixed = replayEventList({ hex: readHex(id, "fixed"), fixture: ex.fixture, ruleSet: ex.ruleSet, events: res.reducedList, runCycles: ex.meta.runCycles, maxStepCycles: 160_000 });
  if (isReducerError(fixed)) fail(id, "replayEventList (fixed)", fixed);
  if (fixed.violation !== null) console.log(`${id} fixed-build violation ${JSON.stringify(fixed.violation)}`);
  expect(fixed.violation).toBeNull();

  // 1-minimality with the Emulator_Oracle of the same input.
  if (!res.stoppedAtBudget) {
    const oracle = createEmulatorOracle(input);
    if (isReducerError(oracle)) fail(id, "createEmulatorOracle", oracle);
    res.reducedList.forEach((e, i) => {
      if (e.gremlinId === "rest") return;
      const a = oracle(res.reducedList.filter((_, j) => j !== i).map((x) => ({ ...x })));
      expect(a, `${id}: removing event ${i} still breaks the rule`).toStrictEqual({ kind: "does-not" });
    });
  } else {
    console.log(`${id} 1-minimality not checked: the Budget was reached`);
  }

  const story = failureStory({ reducedList: res.reducedList, fixture: ex.fixture, violation: res.violation, outputEdges: buggy.outputEdges });
  if (typeof story !== "string") fail(id, "failureStory", story);
  const fp = traceFingerprint(buggy.outputEdges);
  if (typeof fp !== "string") fail(id, "traceFingerprint", fp);

  const lines = [
    `${id} counts ${res.originalEventCount} -> ${res.reducedEventCount}`,
    `${id} candidatesTried ${res.candidatesTried}`,
    `${id} stoppedAtBudget ${res.stoppedAtBudget}`,
    ...res.reducedList.map((e, i) => {
      const v = "analog" in e ? `analog=${(e as { analog: number }).analog}` : `value=${String((e as { value: unknown }).value)}`;
      return `${id} event ${i} cycle=${e.cycle} signal=${e.signal} gremlinId=${e.gremlinId} ${v}`;
    }),
    `${id} story ${story}`,
    `${id} fingerprint ${fp}`,
  ];
  console.log(lines.join("\n"));

  const pin = PINNED[id as keyof typeof PINNED];
  if (pin === null) {
    console.log(`${id} PIN originalEventCount=${res.originalEventCount} reducedEventCount=${res.reducedEventCount} candidatesTried=${res.candidatesTried} fingerprint=${fp}`);
    return;
  }
  const printed: Pinned = { originalEventCount: res.originalEventCount, reducedEventCount: res.reducedEventCount, candidatesTried: res.candidatesTried, fingerprint: fp };
  for (const k of Object.keys(pin) as (keyof Pinned)[]) {
    expect(printed[k], `${id} ${k}: pinned ${pin[k]}, printed ${printed[k]}`).toBe(pin[k]);
  }
}

describe("trace-reducer acceptance on the examples", () => {
  it("crosswalk", () => acceptance("crosswalk"), 600_000);
  it("garage", () => acceptance("garage"), 600_000);
  it("heartbeat", () => acceptance("heartbeat"), 600_000);
});