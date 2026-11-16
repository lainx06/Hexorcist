// Creates the Engine_Worker, decodes every reply and routes it to the job that waits for it.
import type { CodecError } from "../worker/codec";
import { decodeReply, encodeDisplayRequest, encodeMessage } from "../worker/codec";
import { DISPLAY_REPLAY_KIND } from "../worker/messages";
import type {
  CampaignDoneMsg,
  CampaignProgressMsg,
  DisplayReplayRequest,
  JobError,
  ReduceDoneMsg,
  ReduceProgressMsg,
  ReplayDoneMsg,
  WorkerRequest,
} from "../worker/messages";

export type ProgressMsg = CampaignProgressMsg | ReduceProgressMsg;

export type JobOutcome =
  | { kind: "done"; message: CampaignDoneMsg | ReduceDoneMsg | ReplayDoneMsg }
  | { kind: "job-error"; error: JobError }
  | { kind: "codec-error"; error: CodecError }
  | { kind: "worker-stopped"; message: string };

type Request = { [K in WorkerRequest["kind"]]: Omit<Extract<WorkerRequest, { kind: K }>, "jobId"> }[WorkerRequest["kind"]];

export interface EngineClient {
  run(req: Request, onProgress?: (m: ProgressMsg) => void): Promise<JobOutcome>;
  runDisplay(req: Omit<DisplayReplayRequest, "jobId" | "kind">): Promise<JobOutcome>;
}

interface Waiting {
  jobId: number;
  onProgress: ((m: ProgressMsg) => void) | undefined;
  settle: (o: JobOutcome) => void;
}

export function createEngineClient(): EngineClient {
  let nextId = 1;
  let waiting: Waiting | null = null;
  let worker: Worker | null = null;

  const settle = (o: JobOutcome): void => {
    const w = waiting;
    waiting = null;
    if (w !== null) w.settle(o);
  };

  const start = (): Worker => {
    const wk = new Worker(new URL("../worker/engine.worker.ts", import.meta.url), { type: "module" });
    wk.addEventListener("message", (ev: MessageEvent) => {
      const d = decodeReply(ev.data);
      if (!d.ok) {
        settle({ kind: "codec-error", error: d.error });
        return;
      }
      const m = d.message;
      if (waiting === null || m.jobId !== waiting.jobId) return;
      switch (m.kind) {
        case "campaign-progress":
        case "reduce-progress":
          waiting.onProgress?.(m);
          return;
        case "job-error":
          settle({ kind: "job-error", error: m.error });
          return;
        default:
          settle({ kind: "done", message: m });
      }
    });
    wk.addEventListener("messageerror", () => {
      settle({ kind: "codec-error", error: { path: "$", message: "Message: could not be read." } });
    });
    wk.addEventListener("error", (ev: ErrorEvent) => {
      ev.preventDefault();
      wk.terminate();
      if (worker === wk) worker = null;
      settle({ kind: "worker-stopped", message: ev.message || "unknown error" });
    });
    return wk;
  };

  const send = (onProgress: ((m: ProgressMsg) => void) | undefined, encode: (jobId: number) => unknown): Promise<JobOutcome> =>
    new Promise<JobOutcome>((resolve) => {
      const jobId = nextId++;
      waiting = { jobId, onProgress, settle: resolve };
      if (worker === null) worker = start();
      try {
        worker.postMessage(encode(jobId));
      } catch (e) {
        settle({ kind: "codec-error", error: { path: "$", message: e instanceof Error ? e.message : String(e) } });
      }
    });

  return {
    run: (req, onProgress) => send(onProgress, (jobId) => encodeMessage({ ...req, jobId } as WorkerRequest)),
    runDisplay: (req) =>
      send(undefined, (jobId) => encodeDisplayRequest({ ...req, kind: DISPLAY_REPLAY_KIND, jobId })),
  };
}