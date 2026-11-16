// Worker_Entry: decodes requests, runs them through the Worker_Host and posts compact replies.
// The UI_Clock is read here only, to time the speed page. No dynamic import.
import { decodeDisplayRequest, decodeRequest, encodeMessage } from "./codec";
import { createCountingFactory, runCampaignJob, runDisplayReplayJob, runReductionJob, runReplayJob } from "./host";
import { DISPLAY_REPLAY_KIND } from "./messages";
import type { JobErrorMsg, WorkerReply } from "./messages";

interface WorkerScope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;

function post(m: WorkerReply): void {
  scope.postMessage(encodeMessage(m));
}

function requestJobId(data: unknown): number {
  if (typeof data === "object" && data !== null) {
    const id = (data as { jobId?: unknown }).jobId;
    if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return id;
  }
  return 0;
}

const INTERNAL = { kind: "internal-error", message: "The engine worker could not finish this job." };

function handleDisplay(data: unknown): void {
  const d = decodeDisplayRequest(data);
  if (!d.ok) {
    post({
      kind: "job-error",
      jobId: requestJobId(data),
      job: "message",
      error: { kind: "codec-error", message: `${d.error.path}: ${d.error.message}` },
    });
    return;
  }
  const req = d.message;
  try {
    const out = runDisplayReplayJob(req);
    if (out.ok) {
      post({
        kind: "replay-done",
        jobId: req.jobId,
        violation: out.violation,
        outputEdges: out.outputEdges,
        reachedEnd: out.reachedEnd,
        fingerprint: out.fingerprint,
      });
    } else {
      post({ kind: "job-error", jobId: req.jobId, job: "replay", error: out.error });
    }
  } catch {
    post({ kind: "job-error", jobId: req.jobId, job: "replay", error: INTERNAL });
  }
}

scope.onmessage = (ev: MessageEvent) => {
  const raw = ev.data as unknown;
  if (typeof raw === "object" && raw !== null && (raw as { kind?: unknown }).kind === DISPLAY_REPLAY_KIND) {
    handleDisplay(raw);
    return;
  }
  const decoded = decodeRequest(ev.data);
  if (!decoded.ok) {
    const msg: JobErrorMsg = {
      kind: "job-error",
      jobId: requestJobId(ev.data),
      job: "message",
      error: { kind: "codec-error", message: `${decoded.error.path}: ${decoded.error.message}` },
    };
    post(msg);
    return;
  }
  const req = decoded.message;
  try {
    switch (req.kind) {
      case "campaign": {
        let t0 = 0;
        let t1 = 0;
        const out = runCampaignJob(req, {
          beforeCreate: () => {
            t0 = performance.now();
          },
          onProgress: (p) =>
            post({ kind: "campaign-progress", jobId: req.jobId, runsCompleted: p.runsCompleted, total: p.total, finished: false }),
          afterFinish: () => {
            t1 = performance.now();
          },
        });
        if (out.ok) {
          post({
            kind: "campaign-done",
            jobId: req.jobId,
            runsCompleted: out.runsCompleted,
            total: out.total,
            finished: true,
            result: out.result,
            measure: req.measure ? { totalCycles: out.result.totalCycles, seconds: Math.max(0, (t1 - t0) / 1000) } : null,
          });
        } else {
          post({ kind: "job-error", jobId: req.jobId, job: "campaign", error: out.error });
        }
        return;
      }
      case "reduce": {
        let t0 = 0;
        let t1 = 0;
        const counting = req.measure ? createCountingFactory() : null;
        const out = runReductionJob(
          req,
          {
            beforeCreate: () => {
              t0 = performance.now();
            },
            onProgress: (p) =>
              post({
                kind: "reduce-progress",
                jobId: req.jobId,
                candidatesTried: p.candidatesTried,
                bestGremlinCount: p.bestGremlinCount,
                bestList: p.bestList,
              }),
            afterFinish: () => {
              t1 = performance.now();
            },
          },
          counting === null ? undefined : counting.factory,
        );
        if (out.ok) {
          post({
            kind: "reduce-done",
            jobId: req.jobId,
            result: out.result,
            measure:
              counting === null ? null : { totalCycles: counting.totalCycles(), seconds: Math.max(0, (t1 - t0) / 1000) },
          });
        } else {
          post({ kind: "job-error", jobId: req.jobId, job: "reduce", error: out.error });
        }
        return;
      }
      case "replay": {
        const out = runReplayJob(req);
        if (out.ok) {
          post({
            kind: "replay-done",
            jobId: req.jobId,
            violation: out.violation,
            outputEdges: out.outputEdges,
            reachedEnd: out.reachedEnd,
            fingerprint: out.fingerprint,
          });
        } else {
          post({ kind: "job-error", jobId: req.jobId, job: "replay", error: out.error });
        }
        return;
      }
    }
  } catch {
    post({ kind: "job-error", jobId: req.jobId, job: req.kind, error: INTERNAL });
  }
};