// Worker_Message types. Every field is compact data: event lists, output edges, verdicts,
// counts and texts. No RunResult array, no SliceProgress.runs, no typed or per-cycle array.
import type { Violation } from "../../../engine/checker";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import type { RuleSet } from "../../../engine/rules/ir";
import type { ReducerEvent, ReducerResult } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent, Verdict } from "../../../engine/types";
import type { Coverage } from "../model/coverage";

export interface JobError {
  kind: string;
  message: string;
}

export interface Measure {
  totalCycles: number;
  seconds: number;
}

export interface CompactCampaignResult {
  runsCompleted: number;
  requestedRuns: number;
  violatingRunIndex: number | null;
  verdict: Verdict;
  coverage: Coverage;
  /** Sum of RunResult.endCycle over the completed runs. */
  totalCycles: number;
}

export interface CampaignRequest {
  kind: "campaign";
  jobId: number;
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  gremlinSet: GremlinSpec[];
  campaignSeed: number;
  runs: number;
  runCycles: number;
  measure: boolean;
}

export interface ReduceRequest {
  kind: "reduce";
  jobId: number;
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  originalList: ReducerEvent[];
  violation: Violation;
  runCycles: number;
  measure: boolean;
}

export interface ReplayRequest {
  kind: "replay";
  jobId: number;
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  events: ReducerEvent[];
  runCycles: number;
}

/** Not part of REQUEST_KINDS or WORKER_MESSAGE_KINDS. The reply is an ordinary replay-done. */
export const DISPLAY_REPLAY_KIND = "display-replay";

export interface DisplayReplayRequest {
  kind: typeof DISPLAY_REPLAY_KIND;
  jobId: number;
  hex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  events: ReducerEvent[];
  violationCycle: number;
}

export type WorkerRequest = CampaignRequest | ReduceRequest | ReplayRequest;

export interface CampaignProgressMsg {
  kind: "campaign-progress";
  jobId: number;
  runsCompleted: number;
  total: number;
  finished: false;
}

export interface CampaignDoneMsg {
  kind: "campaign-done";
  jobId: number;
  runsCompleted: number;
  total: number;
  finished: true;
  result: CompactCampaignResult;
  measure: Measure | null;
}

export interface ReduceProgressMsg {
  kind: "reduce-progress";
  jobId: number;
  candidatesTried: number;
  bestGremlinCount: number;
  bestList: ReducerEvent[];
}

export interface ReduceDoneMsg {
  kind: "reduce-done";
  jobId: number;
  result: ReducerResult;
  measure: Measure | null;
}

export interface ReplayDoneMsg {
  kind: "replay-done";
  jobId: number;
  violation: Violation | null;
  outputEdges: OutputEvent[];
  reachedEnd: number;
  fingerprint: string;
}

export interface JobErrorMsg {
  kind: "job-error";
  jobId: number;
  job: "campaign" | "reduce" | "replay" | "message";
  error: JobError;
}

export type WorkerReply =
  | CampaignProgressMsg
  | CampaignDoneMsg
  | ReduceProgressMsg
  | ReduceDoneMsg
  | ReplayDoneMsg
  | JobErrorMsg;

export type WorkerMessage = WorkerRequest | WorkerReply;

export const REQUEST_KINDS = ["campaign", "reduce", "replay"] as const;
export const REPLY_KINDS = [
  "campaign-progress",
  "campaign-done",
  "reduce-progress",
  "reduce-done",
  "replay-done",
  "job-error",
] as const;
export const WORKER_MESSAGE_KINDS = [...REQUEST_KINDS, ...REPLY_KINDS] as const;