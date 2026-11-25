// Feature: upload-samples. Acceptance test for the Chat_Sketch_Sample (Requirements 2.7 to 2.9).
// Runs the real host job runners headlessly: no worker, no DOM, no browser.
// The fingerprint is recorded from the run, never written in advance. Passing runs are evidence, not proof.
import { beforeAll, describe, expect, it } from "vitest";
import type { ReducerResult } from "../../src/engine/reducer/types";
import { displayAgrees, displaySpan } from "../../src/ui/app/model/display";
import { OTHER_RULE_KEY, SPAN_SENTENCE, STORY_ENDING } from "../../src/ui/app/model/example-copy";
import { plainStory } from "../../src/ui/app/model/plain-story";
import { ruleBySentence } from "../../src/ui/app/model/rules";
import { brokeTryLine } from "../../src/ui/app/model/stage-copy";
import {
  buildCampaignRequest,
  initialUpload,
  loadChatSketchSample,
  loadUnjudgeableSample,
  uploadLabels,
} from "../../src/ui/app/model/upload-state";
import { decodeReply, encodeMessage } from "../../src/ui/app/worker/codec";
import { runCampaignJob, runDisplayReplayJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";
import type { CampaignDoneMsg, ReduceDoneMsg, ReplayDoneMsg } from "../../src/ui/app/worker/messages";

const T = 600_000;

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

interface Chat {
  tries: number;
  campaign: CampaignDoneMsg;
  reduction: ReducerResult;
  reduced: ReplayDoneMsg;
  fingerprint: string | null;
  spanCycles: number | null;
  story: string;
}

let chat: Chat | undefined;

beforeAll(() => {
  const loaded = loadChatSketchSample(initialUpload());
  if (!loaded.ok) throw new Error("loadChatSketchSample returned ok:false");
  const state = loaded.state;
  const req = buildCampaignRequest(state);
  if (req === null) throw new Error("buildCampaignRequest returned null for the Chat_Sketch_Sample state");

  const c = must(
    runCampaignJob({
      hex: req.hex,
      fixture: req.fixture,
      ruleSet: req.ruleSet,
      gremlinSet: req.gremlinSet,
      campaignSeed: req.campaignSeed,
      runs: req.runs,
      runCycles: req.runCycles,
    }),
    "chat campaign",
  );
  const campaign = decode<CampaignDoneMsg>(
    { kind: "campaign-done", jobId: 1, runsCompleted: c.runsCompleted, total: c.total, finished: true, result: c.result, measure: null },
    "chat campaign",
  );
  const v = campaign.result.verdict;
  if (v.verdict !== "BROKE") {
    chat = undefined;
    // Keep what actually happened for the failing assertion below.
    lastVerdict = v.verdict;
    lastRequest = { runs: req.runs, runCycles: req.runCycles, seed: req.campaignSeed, gremlins: req.gremlinSet.map((g) => g.id) };
    return;
  }
  const red = must(
    runReductionJob({
      hex: req.hex,
      fixture: req.fixture,
      ruleSet: req.ruleSet,
      originalList: v.trace.eventList,
      violation: v.trace.violation,
      runCycles: req.runCycles,
    }),
    "chat reduction",
  );
  const reduction = decode<ReduceDoneMsg>({ kind: "reduce-done", jobId: 2, result: red.result, measure: null }, "chat reduction").result;
  const rj = must(
    runReplayJob({ hex: req.hex, fixture: req.fixture, ruleSet: req.ruleSet, events: reduction.reducedList, runCycles: req.runCycles }),
    "chat reduced replay",
  );
  const reduced = decode<ReplayDoneMsg>(
    { kind: "replay-done", jobId: 3, violation: rj.violation, outputEdges: rj.outputEdges, reachedEnd: rj.reachedEnd, fingerprint: rj.fingerprint },
    "chat reduced replay",
  );
  let spanCycles: number | null = null;
  let story = "";
  let span: { lengthCycles: number; cut: boolean } | null = null;
  const rv = reduced.violation;
  if (rv !== null) {
    const dj = must(
      runDisplayReplayJob({ hex: req.hex, fixture: req.fixture, ruleSet: req.ruleSet, events: reduction.reducedList, violationCycle: rv.cycle }),
      "chat display replay",
    );
    const display = decode<ReplayDoneMsg>(
      { kind: "replay-done", jobId: 4, violation: dj.violation, outputEdges: dj.outputEdges, reachedEnd: dj.reachedEnd, fingerprint: dj.fingerprint },
      "chat display replay",
    );
    const found = ruleBySentence(req.ruleSet, rv.rule);
    if (found !== null && displayAgrees(reduced, display)) {
      const s = displaySpan(found.rule, rv.cycle, display);
      if (s !== null) {
        span = { lengthCycles: s.lengthCycles, cut: s.cut };
        spanCycles = s.lengthCycles;
      }
    }
    story = plainStory({
      reducedList: reduction.reducedList,
      fixture: req.fixture,
      v: rv.cycle,
      storyEnding: STORY_ENDING[OTHER_RULE_KEY] as string,
      spanSentence: SPAN_SENTENCE.custom,
      ...(span !== null ? { span } : {}),
      labels: uploadLabels(state.rows),
    });
  }
  chat = { tries: req.runs, campaign, reduction, reduced, fingerprint: reduced.fingerprint, spanCycles, story };
}, T);

let lastVerdict = "";
let lastRequest: unknown = null;

describe("Chat_Sketch_Sample acceptance (Requirements 2.7 to 2.9)", () => {
  it("is BROKE on try 1 of 24, and records the fingerprint the run produces", { timeout: T }, () => {
    expect(chat, `expected BROKE, actual ${lastVerdict}; request ${JSON.stringify(lastRequest)}`).toBeDefined();
    if (chat === undefined) return;
    const { campaign, reduction, reduced, tries } = chat;
    const verdict = campaign.result.verdict;
    expect(verdict.verdict).toBe("BROKE");
    if (verdict.verdict !== "BROKE") return;

    // The same field the app's brokeTryLine input uses.
    const violatingRunIndex = campaign.result.violatingRunIndex ?? verdict.trace.runIndex;
    const line = brokeTryLine(violatingRunIndex, tries, 0);
    expect(tries).toBe(24);
    expect(violatingRunIndex, `violating run index ${String(violatingRunIndex)}`).toBe(0);
    expect(line.startsWith("Broke on try 1 of 24")).toBe(true);

    // Recorded, never asserted against a value written before the run.
    const fingerprint = reduced.fingerprint;
    const moves = reduction.reducedEventCount;
    const spanCycles = chat.spanCycles;
    const story = chat.story;
    console.log(`CHAT_SKETCH verdict=${verdict.verdict}`);
    console.log(`CHAT_SKETCH try=${line.split(" \u00b7 ")[0] ?? line}`);
    console.log(`CHAT_SKETCH fingerprint=${String(fingerprint)}`);
    console.log(`CHAT_SKETCH reducedMoveCount=${String(moves)} (original ${String(reduction.originalEventCount)})`);
    console.log(`CHAT_SKETCH spanCycles=${String(spanCycles)}`);
    console.log(`CHAT_SKETCH story=${story}`);
  });
});

// Acceptance test for the Unjudgeable_Sample (Requirements 3.8, 3.9, 3.11, 3.12).
// 500 ms rule, 8 runs, seed 20261101, 1000 ms per run, masher only. Real runCampaignJob, no browser.
describe("Unjudgeable_Sample acceptance (Requirements 3.8, 3.9, 3.11, 3.12)", () => {
  it("is COULDN'T TELL with a reason naming the serial port, and never BROKE, HELD or a violation trace", { timeout: T }, () => {
    const loaded = loadUnjudgeableSample(initialUpload());
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const req = buildCampaignRequest(loaded.state);
    expect(req).not.toBeNull();
    if (req === null) return;

    expect(req.ruleSet.length).toBeGreaterThan(0);
    expect(req.runs).toBe(8);
    expect(req.campaignSeed).toBe(20261101);
    expect(req.runCycles).toBe(16_000_000);
    expect(req.gremlinSet.map((g) => g.id)).toEqual(["masher"]);

    const c = must(
      runCampaignJob({
        hex: req.hex,
        fixture: req.fixture,
        ruleSet: req.ruleSet,
        gremlinSet: req.gremlinSet,
        campaignSeed: req.campaignSeed,
        runs: req.runs,
        runCycles: req.runCycles,
      }),
      "unjudgeable campaign",
    );
    const done = decode<CampaignDoneMsg>(
      { kind: "campaign-done", jobId: 1, runsCompleted: c.runsCompleted, total: c.total, finished: true, result: c.result, measure: null },
      "unjudgeable campaign",
    );
    const verdict = done.result.verdict;
    const reason = verdict.verdict === "COULDN'T TELL" ? verdict.reason : "";
    console.log(`UNJUDGEABLE verdict=${verdict.verdict}`);
    console.log(`UNJUDGEABLE reason=${reason}`);

    expect(verdict.verdict).toBe("COULDN'T TELL");
    expect(reason).toContain("serial port");
    expect(verdict.verdict).not.toBe("BROKE");
    expect(verdict.verdict).not.toBe("HELD");
    expect("trace" in verdict).toBe(false);
    expect(done.result.violatingRunIndex).toBeNull();
  });
});
