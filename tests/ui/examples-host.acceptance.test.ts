// Feature: bench-ui-examples. Node acceptance test of the Worker_Host functions for all three
// Examples (Requirement 21). No worker, no DOM, no browser. Every host result is passed through
// the Message_Codec as its reply message and checked on the decoded value.
// Passing runs are evidence, not proof.
import { beforeAll, describe, expect, it } from "vitest";
import type { ReducerResult } from "../../src/engine/reducer/types";
import { EXAMPLE_IDS, loadExample } from "../../src/ui/app/data/examples";
import type { ExampleBundle, ExampleId } from "../../src/ui/app/data/examples";
import { displayAgrees, displaySpan } from "../../src/ui/app/model/display";
import { spanSentenceFor, storyEndingFor } from "../../src/ui/app/model/example-copy";
import { defaultSelection } from "../../src/ui/app/model/gremlin-picker";
import { plainStory } from "../../src/ui/app/model/plain-story";
import { ruleBySentence } from "../../src/ui/app/model/rules";
import { runOfText } from "../../src/ui/app/model/verdict-plain";
import { decodeReply, encodeMessage } from "../../src/ui/app/worker/codec";
import { runCampaignJob, runDisplayReplayJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";
import type { CampaignJobResult, ReductionJobResult, ReplayJobResult } from "../../src/ui/app/worker/host";
import type { CampaignDoneMsg, ReduceDoneMsg, ReplayDoneMsg } from "../../src/ui/app/worker/messages";
import type { Span } from "../../src/ui/app/model/span";

const T = 600_000;

const WANT: Record<
  ExampleId,
  { runIndex: number; runText: string; seed: number; from: number; to: number; fingerprint: string; heldRuns: number }
> = {
  crosswalk: { runIndex: 3, runText: "run 4 of 24", seed: 20261101, from: 8, to: 3, fingerprint: "47078989121ebc1d", heldRuns: 24 },
  garage: { runIndex: 7, runText: "run 8 of 40", seed: 20261102, from: 7, to: 3, fingerprint: "616062947f71a1ae", heldRuns: 40 },
  heartbeat: { runIndex: 1, runText: "run 2 of 24", seed: 20261103, from: 2, to: 1, fingerprint: "19827a4e0a7ad440", heldRuns: 24 },
};

// Requirements 11.16 to 11.18, each with its span sentence.
const PINNED_STORY: Record<ExampleId, string> = {
  crosswalk:
    "The gremlin pressed the walk button, let go, then pressed and held it, all within 131 ms. " +
    "319 ms later, the light gave cars and walkers a green at the same time. " +
    "It was still that way 1,000 ms later, when the replay stopped.",
  garage:
    "The gremlin blocked the beam, cleared it, then blocked it and kept it blocked, all within 4 ms. " +
    "16 ms later, the door was still closing, 20 ms after the gremlin blocked the beam. " +
    "The door kept closing for another 240 ms.",
  heartbeat:
    "The gremlin held the pulse input on. 505 ms later, the heartbeat light had been stuck on for 600 ms. " +
    "It was still that way 1,000 ms later, when the replay stopped.",
};

// Requirements 9.11 and 9.12: Display_Span of the Reduced_List.
const WANT_CUT: Record<ExampleId, boolean> = { crosswalk: true, garage: false, heartbeat: true };

function reducedSpan(r: Run): Span | null {
  const v = r.displayReduced.violation;
  if (v === null) throw new Error("no violation in the display replay of the Reduced_List");
  const found = ruleBySentence(r.ex.ruleSet, v.rule);
  if (found === null) throw new Error(`rule not found: ${v.rule}`);
  return displaySpan(found.rule, v.cycle, r.displayReduced);
}

function decode<M>(msg: unknown, who: string): M {
  const d = decodeReply(encodeMessage(msg as never));
  if (!d.ok) throw new Error(`${who}: codec: ${d.error.path}: ${d.error.message}`);
  return d.message as M;
}

function must<R extends { ok: boolean }>(r: R, who: string): Extract<R, { ok: true }> {
  if (!r.ok) {
    const e = (r as unknown as { error: { kind: string; message: string } }).error;
    throw new Error(`${who}: error kind "${e.kind}": ${e.message}`);
  }
  return r as Extract<R, { ok: true }>;
}

interface Run {
  ex: ExampleBundle;
  buggy: CampaignDoneMsg;
  reduction: ReducerResult;
  reducedBuggy: ReplayDoneMsg;
  reducedFixed: ReplayDoneMsg;
  displayReduced: ReplayDoneMsg;
  displayOriginal: ReplayDoneMsg;
  fixed: CampaignDoneMsg;
}

const runs = new Map<ExampleId, Run>();

function campaign(ex: ExampleBundle, hex: string, who: string): CampaignDoneMsg {
  const r: CampaignJobResult = runCampaignJob({
    hex,
    fixture: ex.fixture,
    ruleSet: ex.ruleSet,
    gremlinSet: ex.meta.gremlinSet,
    campaignSeed: ex.meta.campaignSeed,
    runs: ex.meta.runs,
    runCycles: ex.meta.runCycles,
  });
  const ok = must(r, who);
  return decode<CampaignDoneMsg>(
    { kind: "campaign-done", jobId: 1, runsCompleted: ok.runsCompleted, total: ok.total, finished: true, result: ok.result, measure: null },
    who,
  );
}

function replayMsg(r: ReplayJobResult, who: string): ReplayDoneMsg {
  const ok = must(r, who);
  return decode<ReplayDoneMsg>(
    {
      kind: "replay-done",
      jobId: 3,
      violation: ok.violation,
      outputEdges: ok.outputEdges,
      reachedEnd: ok.reachedEnd,
      fingerprint: ok.fingerprint,
    },
    who,
  );
}

beforeAll(() => {
  for (const id of EXAMPLE_IDS) {
    const l = loadExample(id);
    if (!l.ok) throw new Error(`${id}: example did not load: ${JSON.stringify(l.problems)}`);
    const ex = l.example;
    const buggy = campaign(ex, ex.buggyHex, `${id} buggy campaign`);
    const v = buggy.result.verdict;
    if (v.verdict !== "BROKE") throw new Error(`${id} buggy campaign: expected BROKE, actual ${v.verdict}`);
    const red: ReductionJobResult = runReductionJob({
      hex: ex.buggyHex,
      fixture: ex.fixture,
      ruleSet: ex.ruleSet,
      originalList: v.trace.eventList,
      violation: v.trace.violation,
      runCycles: ex.meta.runCycles,
    });
    const reduction = decode<ReduceDoneMsg>(
      { kind: "reduce-done", jobId: 2, result: must(red, `${id} reduction`).result, measure: null },
      `${id} reduction`,
    ).result;
    const replay = (hex: string, build: string) =>
      replayMsg(
        runReplayJob({ hex, fixture: ex.fixture, ruleSet: ex.ruleSet, events: reduction.reducedList, runCycles: ex.meta.runCycles }),
        `${id} ${build} replay`,
      );
    const reducedBuggy = replay(ex.buggyHex, "buggy");
    const reducedFixed = replay(ex.fixedHex, "fixed");
    const display = (events: typeof reduction.reducedList, violationCycle: number, who: string) =>
      replayMsg(
        runDisplayReplayJob({ hex: ex.buggyHex, fixture: ex.fixture, ruleSet: ex.ruleSet, events, violationCycle }),
        `${id} ${who}`,
      );
    const rv = reducedBuggy.violation;
    if (rv === null) throw new Error(`${id} buggy reduced replay: expected a violation, actual none`);
    const displayReduced = display(reduction.reducedList, rv.cycle, "buggy display replay of the Reduced_List");
    const displayOriginal = display(v.trace.eventList, v.trace.violation.cycle, "buggy display replay of the violating run");
    const fixed = campaign(ex, ex.fixedHex, `${id} fixed campaign`);
    runs.set(id, { ex, buggy, reduction, reducedBuggy, reducedFixed, displayReduced, displayOriginal, fixed });
  }
}, T);

function get(id: ExampleId): Run {
  const r = runs.get(id);
  if (r === undefined) throw new Error(`${id}: no run`);
  return r;
}

describe.each(EXAMPLE_IDS)("Worker_Host acceptance values for %s (Requirement 21)", (id) => {
  const w = WANT[id];

  it("the buggy campaign is BROKE with the pinned run text and seed", { timeout: T }, () => {
    const { ex, buggy } = get(id);
    const v = buggy.result.verdict;
    expect(v.verdict, `${id} buggy: expected BROKE, actual ${v.verdict}`).toBe("BROKE");
    if (v.verdict !== "BROKE") return;
    expect(v.trace.runIndex, `${id} buggy: violatingRunIndex`).toBe(w.runIndex);
    expect(runOfText(v.trace, ex.meta.runs), `${id} buggy: run text`).toBe(w.runText);
    expect(ex.meta.campaignSeed, `${id}: seed`).toBe(w.seed);
  });

  it("the reduction gives the pinned counts", { timeout: T }, () => {
    const { reduction } = get(id);
    expect(reduction.originalEventCount, `${id}: original count`).toBe(w.from);
    expect(reduction.reducedEventCount, `${id}: reduced count`).toBe(w.to);
  });

  it("the reduced replay on the buggy build has the pinned fingerprint", { timeout: T }, () => {
    const { reducedBuggy } = get(id);
    expect(reducedBuggy.fingerprint, `${id} buggy: fingerprint`).toBe(w.fingerprint);
  });

  it("the reduced replay does not break the fixed build", { timeout: T }, () => {
    const { reducedFixed } = get(id);
    expect(reducedFixed.violation, `${id} fixed: expected null, actual ${JSON.stringify(reducedFixed.violation)}`).toBeNull();
  });

  it("the fixed campaign is HELD with the exact text", { timeout: T }, () => {
    const { fixed } = get(id);
    const v = fixed.result.verdict;
    expect(v.verdict, `${id} fixed: expected HELD, actual ${v.verdict}`).toBe("HELD");
    if (v.verdict !== "HELD") return;
    expect(v.text, `${id} fixed: HELD text`).toBe(
      `No violation found in ${String(w.heldRuns)} emulated runs of this gremlin set. Not a proof.`,
    );
  });

  it("each Display_Replay of the Reduced_List agrees with its Replay", { timeout: T }, () => {
    const { reducedBuggy, displayReduced } = get(id);
    expect(displayAgrees(reducedBuggy, displayReduced), `${id} buggy: displayAgrees`).toBe(true);
  });

  it("the default selection equals the meta.json gremlin set", () => {
    const { ex } = get(id);
    expect(defaultSelection(ex.meta.gremlinSet, ex.fixture)).toEqual(ex.meta.gremlinSet);
  });

  it("the plain story of the Reduced_List is pinned", { timeout: T }, () => {
    const r = get(id);
    const { ex, reduction, reducedBuggy } = r;
    const v = reducedBuggy.violation;
    if (v === null) throw new Error(`${id}: no violation`);
    const span = reducedSpan(r);
    if (span === null) throw new Error(`${id}: no span`);
    const text = plainStory({
      reducedList: reduction.reducedList,
      fixture: ex.fixture,
      v: v.cycle,
      storyEnding: storyEndingFor(v.rule),
      spanSentence: spanSentenceFor(id, false),
      span,
    });
    expect(text, `${id}: plain story`).toBe(PINNED_STORY[id]);
  });
});

describe("Display_Span (Requirements 9.11 and 9.12)", () => {
  const spanOf = (id: ExampleId, which: "displayReduced" | "displayOriginal"): Span | null => {
    const r = get(id);
    const d = r[which];
    const v = d.violation;
    if (v === null) throw new Error(`${id} ${which}: no violation`);
    const found = ruleBySentence(r.ex.ruleSet, v.rule);
    if (found === null) throw new Error(`${id}: rule not found`);
    return displaySpan(found.rule, v.cycle, d);
  };

  const bigAndCut: ReadonlyArray<readonly [ExampleId, "displayOriginal" | "displayReduced"]> = [
    ["crosswalk", "displayOriginal"],
    ["crosswalk", "displayReduced"],
    ["heartbeat", "displayReduced"],
  ];
  for (const [id, which] of bigAndCut) {
    it(`${id} ${which}: lengthCycles > 16,000 and cut true`, { timeout: T }, () => {
      const s = spanOf(id, which);
      expect(s, `${id} ${which}: span`).not.toBeNull();
      if (s === null) return;
      expect(s.lengthCycles, `${id} ${which}: lengthCycles`).toBeGreaterThan(16_000);
      expect(s.cut, `${id} ${which}: cut, lengthCycles ${s.lengthCycles}`).toBe(WANT_CUT[id]);
    });
  }

  it("heartbeat displayOriginal: lengthCycles 1,152,850 and cut false", { timeout: T }, () => {
    const s = spanOf("heartbeat", "displayOriginal");
    expect(s, "heartbeat original: span").not.toBeNull();
    if (s === null) return;
    expect(s.lengthCycles, "heartbeat original: lengthCycles").toBe(1_152_850);
    expect(s.cut, "heartbeat original: cut").toBe(false);
  });

  it("garage displayOriginal: lengthCycles 3,833,643 and cut false", { timeout: T }, () => {
    const s = spanOf("garage", "displayOriginal");
    expect(s, "garage original: span").not.toBeNull();
    if (s === null) return;
    expect(s.lengthCycles, "garage original: lengthCycles").toBe(3_833_643);
    expect(s.cut, "garage original: cut").toBe(false);
  });

  it("garage displayReduced: lengthCycles 3,833,643 and cut false", { timeout: T }, () => {
    const s = spanOf("garage", "displayReduced");
    expect(s, "garage: span").not.toBeNull();
    if (s === null) return;
    expect(s.lengthCycles, "garage: lengthCycles").toBe(3_833_643);
    expect(s.cut, "garage: cut").toBe(WANT_CUT.garage);
  });
});
