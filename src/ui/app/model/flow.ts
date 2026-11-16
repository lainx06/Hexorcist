// App flow state and button enablement. Pure.

export interface FlowState {
  dataOk: boolean;
  runsOk: boolean;
  seedOk: boolean;
  busy: null | "campaign" | "reduce" | "replay";
  reduction: "none" | "running" | "result" | "error";
  /** A Reduced_List Replay on the Buggy_Build finished without error. */
  reducedReplayOk: boolean;
  fix: "hidden" | "available" | "used";
}

export function initialFlow(dataOk: boolean): FlowState {
  return { dataOk, runsOk: true, seedOk: true, busy: null, reduction: "none", reducedReplayOk: false, fix: "hidden" };
}

export function canUnleash(s: FlowState): boolean {
  return s.dataOk && s.runsOk && s.seedOk && s.busy === null;
}

export function canApplyFix(s: FlowState): boolean {
  return s.busy === null && s.reduction === "result" && s.fix === "available";
}

export function canReplayAgain(s: FlowState): boolean {
  return s.busy === null && s.reducedReplayOk;
}

export function canTryRemoving(s: FlowState): boolean {
  return s.busy === null && s.reduction === "result";
}