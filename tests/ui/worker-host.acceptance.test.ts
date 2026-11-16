// Feature: bench-ui-core. Node acceptance test of the Worker_Host functions the Engine_Worker
// calls, for Crosswalk (Requirement 24). No worker, no DOM, no browser. Every host result is
// passed through the Message_Codec as its reply message and checked on the decoded value.
// Passing runs are evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createCampaign, runEventList } from "../../src/engine/campaign";
import { traceFingerprint } from "../../src/engine/reducer/fingerprint";
import { replayEventList } from "../../src/engine/reducer/emulator-run";
import type { ReducerEvent, ReducerResult } from "../../src/engine/reducer/types";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { buildCampaignConfig } from "../../src/engine/rules/config-builder";
import type { Verdict } from "../../src/engine/types";
import { CROSSWALK_TEXTS, loadCrosswalk } from "../../src/ui/app/data/crosswalk";
import { brokeScope } from "../../src/ui/app/model/verdict-text";
import { decodeReply, encodeMessage } from "../../src/ui/app/worker/codec";
import {
  createCountingFactory,
  runCampaignJob,
  runReductionJob,
  runReplayJob,
  SLICE_RUNS,
  STEP_CANDIDATES,
} from "../../src/ui/app/worker/host";
import type { CampaignJobResult, ReductionJobResult, ReplayJobResult } from "../../src/ui/app/worker/host";
import type { CampaignDoneMsg, ReduceDoneMsg, ReplayDoneMsg } from "../../src/ui/app/worker/messages";

const T = 600_000;
const ROOT = resolve(__dirname, "..", "..");

const ex = loadCrosswalk();
if (!ex.ok) throw new Error(`Crosswalk example did not load: ${JSON.stringify(ex)}`);
const X = ex;

function must<T extends { ok: boolean }>(r: T, what: string): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`${what} returned an error: ${JSON.stringify((r as { error?: unknown }).error)}`);
  return r as Extract<T, { ok: true }>;
}

function campaignDone(r: CampaignJobResult): CampaignDoneMsg {
  const ok = must(r, "runCampaignJob");
  const msg: CampaignDoneMsg = {
    kind: "campaign-done",
    jobId: 1,
    runsCompleted: ok.runsCompleted,
    total: ok.total,
    finished: true,
    result: ok.result,
    measure: null,
  };
  const d = decodeReply(encodeMessage(msg));
  if (!d.ok) throw new Error(`codec: ${d.error.path}: ${d.error.message}`);
  return d.message as CampaignDoneMsg;
}

function reduceDone(r: ReductionJobResult): ReduceDoneMsg {
  const ok = must(r, "runReductionJob");
  const d = decodeReply(encodeMessage({ kind: "reduce-done", jobId: 2, result: ok.result, measure: null }));
  if (!d.ok) throw new Error(`codec: ${d.error.path}: ${d.error.message}`);
  return d.message as ReduceDoneMsg;
}

function replayDone(r: ReplayJobResult): ReplayDoneMsg {
  const ok = must(r, "runReplayJob");
  const d = decodeReply(
    encodeMessage({
      kind: "replay-done",
      jobId: 3,
      violation: ok.violation,
      outputEdges: ok.outputEdges,
      reachedEnd: ok.reachedEnd,
      fingerprint: ok.fingerprint,
    }),
  );
  if (!d.ok) throw new Error(`codec: ${d.error.path}: ${d.error.message}`);
  return d.message as ReplayDoneMsg;
}

const campaignInput = (hex: string) => ({
  hex,
  fixture: X.fixture,
  ruleSet: X.ruleSet,
  gremlinSet: X.meta.gremlinSet,
  campaignSeed: X.meta.campaignSeed,
  runs: X.meta.runs,
  runCycles: X.meta.runCycles,
});

let buggy: CampaignDoneMsg;
let reduction: ReducerResult;
let reducedBuggy: ReplayDoneMsg;
let reducedFixed: ReplayDoneMsg;
let fixedCampaign: CampaignDoneMsg;
let progressCount = 0;
let reduceProgressCount = 0;

beforeAll(() => {
  buggy = campaignDone(runCampaignJob(campaignInput(X.buggyHex), { onProgress: () => progressCount++ }));
  const v = buggy.result.verdict;
  if (v.verdict !== "BROKE") throw new Error(`expected BROKE, actual ${v.verdict}`);
  reduction = reduceDone(
    runReductionJob(
      {
        hex: X.buggyHex,
        fixture: X.fixture,
        ruleSet: X.ruleSet,
        originalList: v.trace.eventList,
        violation: v.trace.violation,
        runCycles: X.meta.runCycles,
      },
      { onProgress: () => reduceProgressCount++ },
    ),
  ).result;
  const replay = (hex: string) =>
    replayDone(
      runReplayJob({
        hex,
        fixture: X.fixture,
        ruleSet: X.ruleSet,
        events: reduction.reducedList,
        runCycles: X.meta.runCycles,
      }),
    );
  reducedBuggy = replay(X.buggyHex);
  reducedFixed = replay(X.fixedHex);
  fixedCampaign = campaignDone(runCampaignJob(campaignInput(X.fixedHex)));
}, T);

describe("Worker_Host acceptance values for Crosswalk (Requirement 24)", () => {
  it("uses runSlice(1) and step(1)", () => {
    expect(SLICE_RUNS).toBe(1);
    expect(STEP_CANDIDATES).toBe(1);
    expect(progressCount).toBeGreaterThan(0);
    expect(reduceProgressCount).toBeGreaterThan(0);
  });

  it('the buggy campaign is BROKE, shown as "run 4 of 24", seed 20261101', { timeout: T }, () => {
    const v = buggy.result.verdict;
    expect(v.verdict, `expected BROKE, actual ${v.verdict}`).toBe("BROKE");
    if (v.verdict !== "BROKE") return;
    const scope = brokeScope(v.trace, X.meta.runs, X.meta.campaignSeed);
    expect(scope.runText, `expected "run 4 of 24", actual "${scope.runText}"`).toBe("run 4 of 24");
    expect(X.meta.campaignSeed, `expected seed 20261101, actual ${X.meta.campaignSeed}`).toBe(20261101);
    expect(scope.seedText).toBe("Seed: 20261101");
  });

  it("the reduction gives 8 -> 3", { timeout: T }, () => {
    expect(reduction.originalEventCount, `expected 8, actual ${reduction.originalEventCount}`).toBe(8);
    expect(reduction.reducedEventCount, `expected 3, actual ${reduction.reducedEventCount}`).toBe(3);
  });

  it("the reduced replay on the buggy build has fingerprint 47078989121ebc1d", { timeout: T }, () => {
    expect(reducedBuggy.fingerprint, `expected 47078989121ebc1d, actual ${reducedBuggy.fingerprint}`).toBe(
      "47078989121ebc1d",
    );
  });

  it("the reduced replay does not break the fixed build", { timeout: T }, () => {
    expect(reducedFixed.violation, `expected null, actual ${JSON.stringify(reducedFixed.violation)}`).toBeNull();
  });

  it("the fixed rerun gives the exact HELD text for 24 emulated runs", { timeout: T }, () => {
    const v = fixedCampaign.result.verdict;
    expect(v.verdict).toBe("HELD");
    if (v.verdict !== "HELD") return;
    expect(v.text, `expected the HELD text, actual "${v.text}"`).toBe(
      "No violation found in 24 emulated runs of this gremlin set. Not a proof.",
    );
  });

  it("the counting factory leaves the reduction result unchanged (Requirement 19.12)", { timeout: T }, () => {
    const v = buggy.result.verdict;
    if (v.verdict !== "BROKE") throw new Error("expected BROKE");
    const counting = createCountingFactory();
    const counted = must(
      runReductionJob(
        {
          hex: X.buggyHex,
          fixture: X.fixture,
          ruleSet: X.ruleSet,
          originalList: v.trace.eventList,
          violation: v.trace.violation,
          runCycles: X.meta.runCycles,
        },
        {},
        counting.factory,
      ),
      "runReductionJob (counting)",
    ).result;
    expect(counted.originalEventCount).toBe(reduction.originalEventCount);
    expect(counted.reducedEventCount).toBe(reduction.reducedEventCount);
    expect(counted.candidatesTried).toBe(reduction.candidatesTried);
    expect(counted.reducedList).toEqual(reduction.reducedList);
    expect([counted.originalEventCount, counted.reducedEventCount, counted.candidatesTried]).toEqual([8, 3, 30]);
    expect(counting.totalCycles()).toBeGreaterThan(0);
    expect(counting.keptCount()).toBeGreaterThan(0);
  });
});

describe("Worker_Host equivalence checks (Requirements 2.1, 4.6, 4.7, 4.18, 4.19, 19.4)", () => {
  it("the bundled strings equal the files", () => {
    const read = (p: string) => readFileSync(resolve(ROOT, "examples", "crosswalk", p), "utf8");
    expect(CROSSWALK_TEXTS.buggyHex).toBe(read("buggy/buggy.hex"));
    expect(CROSSWALK_TEXTS.fixedHex).toBe(read("fixed/fixed.hex"));
    expect(CROSSWALK_TEXTS.fixtureText).toBe(read("fixture.json"));
    expect(CROSSWALK_TEXTS.rulesText).toBe(read("rules.txt"));
    expect(CROSSWALK_TEXTS.metaText).toBe(read("meta.json"));
    expect(CROSSWALK_TEXTS.buggySketch).toBe(read("buggy/buggy.ino"));
    expect(CROSSWALK_TEXTS.fixedSketch).toBe(read("fixed/fixed.ino"));
  });

  it("runReplayJob equals replayEventList and runEventList", { timeout: T }, () => {
    const v = buggy.result.verdict;
    if (v.verdict !== "BROKE") throw new Error("expected BROKE");
    const lists: { name: string; hex: string; events: ReducerEvent[] }[] = [
      { name: "original on buggy", hex: X.buggyHex, events: v.trace.eventList },
      { name: "reduced on buggy", hex: X.buggyHex, events: reduction.reducedList },
      { name: "reduced on fixed", hex: X.fixedHex, events: reduction.reducedList },
      ...reduction.reducedList.map((_, i) => ({
        name: `reduced without ${i}`,
        hex: X.buggyHex,
        events: reduction.reducedList.filter((__, j) => j !== i),
      })),
    ];
    for (const l of lists) {
      const input = { hex: l.hex, fixture: X.fixture, ruleSet: X.ruleSet, events: l.events, runCycles: X.meta.runCycles };
      const host = must(runReplayJob(input), `runReplayJob ${l.name}`);
      const ref = replayEventList({ ...input, maxStepCycles: 160_000 });
      if ("kind" in ref) throw new Error(`replayEventList ${l.name}: ${ref.kind}`);
      expect(host.violation, l.name).toEqual(ref.violation);
      expect(host.outputEdges, l.name).toEqual(ref.outputEdges);
      expect(host.fingerprint, l.name).toBe(traceFingerprint(ref.outputEdges));
      const compiled = compileRuleSet(X.ruleSet, X.fixture);
      if (!compiled.ok) throw new Error("rules did not compile");
      const path = runEventList(
        { hex: l.hex, fixture: X.fixture, checker: compiled.compiled.checker, runCycles: X.meta.runCycles, maxStepCycles: 160_000 },
        l.events.map((e) => ({ ...e })),
        0,
      );
      if ("kind" in path) throw new Error(`runEventList ${l.name}: ${path.kind}`);
      expect(host.reachedEnd, l.name).toBe(path.endCycle);
    }
  });

  it("invalid event lists give the same error from both", () => {
    const bad = [{ cycle: -1, signal: "REQUEST", value: 0, gremlinId: "x" }] as unknown as ReducerEvent[];
    const input = { hex: X.buggyHex, fixture: X.fixture, ruleSet: X.ruleSet, events: bad, runCycles: X.meta.runCycles };
    const host = runReplayJob(input);
    const ref = replayEventList({ ...input, maxStepCycles: 160_000 });
    expect(host.ok).toBe(false);
    if (host.ok || !("kind" in ref)) throw new Error("expected errors from both");
    expect(host.error).toEqual({ kind: ref.kind, message: ref.message });
  });

  it("the host campaign verdict equals a direct engine campaign", { timeout: T }, () => {
    const built = buildCampaignConfig(X.ruleSet, X.fixture, {
      hex: X.buggyHex,
      gremlinSet: X.meta.gremlinSet,
      campaignSeed: X.meta.campaignSeed,
      runs: X.meta.runs,
      runCycles: X.meta.runCycles,
    });
    if (!built.ok) throw new Error("config");
    const h = createCampaign(built.config);
    if (!("runSlice" in h)) throw new Error("campaign");
    let verdict: Verdict | null = null;
    let total = 0;
    for (;;) {
      const p = h.runSlice(1);
      if (!("finished" in p)) throw new Error("slice");
      if (p.finished) {
        verdict = p.result?.verdict ?? null;
        total = p.runs.reduce((s, r) => s + r.endCycle, 0);
        break;
      }
    }
    expect(buggy.result.verdict).toEqual(verdict);
    expect(buggy.result.totalCycles).toBe(total);
  });

  it("a bad HEX gives an error with the engine kind and no verdict", () => {
    const r = runCampaignJob(campaignInput("not a hex file"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(typeof r.error.kind).toBe("string");
    expect(r.error.message.length).toBeGreaterThan(0);
    expect("result" in r).toBe(false);
  });
});