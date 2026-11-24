// runCheck: one campaign job, then reduction and replay only when the verdict is BROKE.
// No clock, no random source, no network. The jobs are the same functions the page's worker calls.
import { REASON_MAX_LENGTH } from "../src/engine/verdict";
import type { ReducerResult } from "../src/engine/reducer/types";
import type { Verdict } from "../src/engine/types";
import * as host from "../src/ui/app/worker/host";
import type { ReplayJobResult } from "../src/ui/app/worker/host";
import type { CompactCampaignResult, JobError } from "../src/ui/app/worker/messages";
import type { CheckInput } from "./input-loader";

export type JobName = "campaign" | "reduction" | "replay";

/** The three job functions. Tests pass stubs. */
export interface Jobs {
  runCampaignJob: typeof host.runCampaignJob;
  runReductionJob: typeof host.runReductionJob;
  runReplayJob: typeof host.runReplayJob;
}

export const hostJobs: Jobs = {
  runCampaignJob: host.runCampaignJob,
  runReductionJob: host.runReductionJob,
  runReplayJob: host.runReplayJob,
};

/** What the three jobs produced. `reduction` and `replay` are present only for BROKE. */
export interface CheckRun {
  verdict: Verdict;
  campaign: CompactCampaignResult;
  reduction?: ReducerResult;
  replay?: Extract<ReplayJobResult, { ok: true }>;
}

export type CheckOutcome = { ok: true; result: CheckRun } | { ok: false; job: JobName; error: JobError };

const thrown = (e: unknown): JobError => ({
  kind: "internal-error",
  message: e instanceof Error ? e.message : String(e),
});

export function runCheck(input: CheckInput, jobs: Jobs = hostJobs): CheckOutcome {
  let campaign: ReturnType<Jobs["runCampaignJob"]>;
  try {
    campaign = jobs.runCampaignJob({
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      gremlinSet: input.gremlinSet,
      campaignSeed: input.campaignSeed,
      runs: input.runs,
      runCycles: input.runCycles,
    });
  } catch (e) {
    return { ok: false, job: "campaign", error: thrown(e) };
  }
  if (!campaign.ok) return { ok: false, job: "campaign", error: campaign.error };
  const verdict = campaign.result.verdict;
  if (verdict.verdict !== "BROKE") return { ok: true, result: { verdict, campaign: campaign.result } };

  let reduction: ReturnType<Jobs["runReductionJob"]>;
  try {
    reduction = jobs.runReductionJob({
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      originalList: verdict.trace.eventList,
      violation: verdict.trace.violation,
      runCycles: input.runCycles,
    });
  } catch (e) {
    return { ok: false, job: "reduction", error: thrown(e) };
  }
  if (!reduction.ok) return { ok: false, job: "reduction", error: reduction.error };

  let replay: ReplayJobResult;
  try {
    replay = jobs.runReplayJob({
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      events: reduction.result.reducedList,
      runCycles: input.runCycles,
    });
  } catch (e) {
    return { ok: false, job: "replay", error: thrown(e) };
  }
  if (!replay.ok) return { ok: false, job: "replay", error: replay.error };

  return { ok: true, result: { verdict, campaign: campaign.result, reduction: reduction.result, replay } };
}

/** A loader failure: the reason goes to stderr, no run starts. */
export type LoadFailure = { ok: false; reason: string };

/** 0 HELD, 1 BROKE, 2 COULDN'T TELL, 3 loader failure or job error. */
export function exitCodeOf(outcome: CheckOutcome | LoadFailure): 0 | 1 | 2 | 3 {
  if (!outcome.ok || !("result" in outcome)) return 3;
  switch (outcome.result.verdict.verdict) {
    case "HELD":
      return 0;
    case "BROKE":
      return 1;
    default:
      return 2;
  }
}

type Ok = Extract<CheckOutcome, { ok: true }>;

/** Unmodelled peripheral ids named by the campaign, in order of appearance, no repeats. */
function peripheralIds(run: CheckRun): string[] {
  const ids: string[] = [];
  for (const u of run.campaign.peripheralUses?.uses ?? []) if (!ids.includes(u.peripheral)) ids.push(u.peripheral);
  return ids;
}

/**
 * The Result_Object as text. Keys are written in the design's fixed order by object literals,
 * so no sorting step is needed. UTF-8 text, LF only, one trailing LF, no time, path, host or duration.
 */
export function toJson(input: CheckInput, outcome: Ok, toolVersion: string): string {
  const { verdict, campaign, reduction, replay } = outcome.result;
  const head = {
    toolVersion,
    verdict: verdict.verdict,
    seed: input.campaignSeed,
    runs: campaign.requestedRuns,
    gremlins: input.gremlinSet.map((g) => g.id),
    rules: input.ruleSentences,
  };
  let obj: object;
  if (verdict.verdict === "BROKE") {
    obj = {
      ...head,
      try: (campaign.violatingRunIndex ?? verdict.trace.runIndex) + 1,
      movesBefore: reduction?.originalEventCount ?? null,
      movesAfter: reduction?.reducedEventCount ?? null,
      fingerprint: replay?.fingerprint ?? null,
      violation: { rule: verdict.trace.violation.rule, cycle: verdict.trace.violation.cycle },
      reducedList: reduction?.reducedList ?? [],
      outputEdges: replay?.outputEdges ?? [],
    };
  } else if (verdict.verdict === "HELD") {
    obj = { ...head, n: verdict.runs, text: verdict.text };
  } else {
    obj = {
      ...head,
      reason: verdict.reason,
      reasonTruncated: isReasonTruncated(verdict.reason),
      peripherals: peripheralIds(outcome.result),
    };
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Plain-text summary. It holds the exact verdict string and the same values as the JSON. */
export function toSummary(input: CheckInput, outcome: Ok): string {
  const { verdict, campaign, reduction, replay } = outcome.result;
  if (verdict.verdict === "HELD") return `HELD\n${verdict.text}\n`;
  if (verdict.verdict === "COULDN'T TELL") return `COULDN'T TELL\nWhat stopped the check: ${verdict.reason}\n`;
  const lines = [
    "BROKE",
    `Rule broken: ${verdict.trace.violation.rule} at cycle ${verdict.trace.violation.cycle}`,
    `Try ${(campaign.violatingRunIndex ?? verdict.trace.runIndex) + 1} of ${campaign.requestedRuns}, seed ${input.campaignSeed}`,
  ];
  if (reduction !== undefined && replay !== undefined) {
    lines.push(
      `Moves: ${reduction.originalEventCount} to ${reduction.reducedEventCount} (the smallest replay this reducer found)`,
      `Fingerprint: ${replay.fingerprint}`,
      "Reduced moves:",
      ...reduction.reducedList.map((e) => `  ${JSON.stringify(e)}`),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** True when the reason reached the engine's cap, so it may have been cut. Blind spots are documented in the design. */
export const isReasonTruncated = (reason: string): boolean => reason.length >= REASON_MAX_LENGTH;
