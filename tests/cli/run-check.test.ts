import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadInput } from "../../cli/input-loader";
import type { CheckInput, LoaderEnv } from "../../cli/input-loader";
import { main } from "../../cli/main";
import { runCheck } from "../../cli/run-check";
import type { Jobs } from "../../cli/run-check";
import type { Verdict } from "../../src/engine/types";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env: LoaderEnv = { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: repoDir, repoDir };

const input = (): CheckInput => {
  const r = loadInput({ example: "heartbeat", fixed: true }, env);
  if (!r.ok) throw new Error(r.reason);
  return r.input;
};

const violation = { rule: "r", cycle: 5 } as never;
const verdicts: Verdict[] = [
  {
    verdict: "BROKE",
    trace: { runIndex: 0, runSeed: 1, eventList: [], outputEvents: [], violation },
    unchecked: [],
  },
  { verdict: "HELD", text: "No violation found in 1 emulated run of this gremlin set. Not a proof.", runs: 1 },
  { verdict: "COULDN'T TELL", reason: "because" },
];

function stubs(v: Verdict): { jobs: Jobs; calls: { campaign: number; reduction: number; replay: number } } {
  const calls = { campaign: 0, reduction: 0, replay: 0 };
  const jobs: Jobs = {
    runCampaignJob: () => {
      calls.campaign++;
      return {
        ok: true,
        runsCompleted: 1,
        total: 1,
        result: { runsCompleted: 1, requestedRuns: 1, violatingRunIndex: null, verdict: v, coverage: {} as never, totalCycles: 0 },
      };
    },
    runReductionJob: () => {
      calls.reduction++;
      return {
        ok: true,
        result: {
          originalEventCount: 2,
          reducedEventCount: 1,
          candidatesTried: 1,
          stoppedAtBudget: false,
          reducedList: [],
          violation,
        },
      };
    },
    runReplayJob: () => {
      calls.replay++;
      return { ok: true, violation, outputEdges: [], reachedEnd: 1, fingerprint: "abc" };
    },
  };
  return { jobs, calls };
}

describe("runCheck", () => {
  it("Feature: headless-runner, Property 5: Jobs run only as the verdict needs", () => {
    fc.assert(
      fc.property(fc.constantFrom(0, 1, 2), (i) => {
        const v = verdicts[i] as Verdict;
        const { jobs, calls } = stubs(v);
        const out = runCheck(input(), jobs);
        expect(out.ok).toBe(true);
        const broke = v.verdict === "BROKE";
        expect(calls).toEqual({ campaign: 1, reduction: broke ? 1 : 0, replay: broke ? 1 : 0 });
      }),
      { numRuns: 100 },
    );
  });

  it("returns the job name and error when a job fails or throws, with no verdict", () => {
    const { jobs } = stubs(verdicts[0] as Verdict);
    const failing = runCheck(input(), { ...jobs, runReductionJob: () => ({ ok: false, error: { kind: "k", message: "m" } }) });
    expect(failing).toEqual({ ok: false, job: "reduction", error: { kind: "k", message: "m" } });
    const throwing = runCheck(input(), {
      ...jobs,
      runReplayJob: () => {
        throw new Error("boom");
      },
    });
    expect(throwing).toEqual({ ok: false, job: "replay", error: { kind: "internal-error", message: "boom" } });
    const campaignThrows = runCheck(input(), {
      ...jobs,
      runCampaignJob: () => {
        throw new Error("x");
      },
    });
    expect(campaignThrows.ok).toBe(false);
  });
});

describe("main", () => {
  const io = (extra: object = {}) => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t), env, ...extra } };
  };

  it("Property 4 (main half): loader failure returns 3 and never calls runCheck", () => {
    let called = 0;
    const t = io({ run: () => (called++, { ok: false, job: "campaign", error: { kind: "k", message: "m" } }) });
    expect(main(["--fixed"], t.io)).toBe(3);
    expect(main(["--example", "nope"], t.io)).toBe(3);
    expect(main(["--runs", "1.5", "--example", "heartbeat"], t.io)).toBe(3);
    expect(main(["--bogus"], t.io)).toBe(3);
    expect(called).toBe(0);
    expect(t.out).toEqual([]);
    expect(t.err.length).toBe(4);
  });

  it("returns 3 on a job error and on a thrown error, printing one stderr line", () => {
    const a = io({ run: () => ({ ok: false, job: "replay", error: { kind: "k", message: "bad" } }) });
    expect(main(["--example", "heartbeat"], a.io)).toBe(3);
    expect(a.err).toEqual(["The replay job failed: bad\n"]);
    const b = io({ run: () => { throw new Error("kaboom"); } });
    expect(main(["--example", "heartbeat"], b.io)).toBe(3);
    expect(b.err).toEqual(["kaboom\n"]);
    expect(b.out).toEqual([]);
  });

  it("maps verdicts to exit codes 0, 1, 2 on a real run path via stubs", () => {
    const codes = verdicts.map((v) => {
      const { jobs } = stubs(v);
      const t = io({ run: (i: CheckInput) => runCheck(i, jobs) });
      return main(["--example", "heartbeat"], t.io);
    });
    expect(codes).toEqual([1, 0, 2]);
  });

  it("runs the heartbeat fixed build for real and reports HELD", () => {
    const t = io();
    expect(main(["--example", "heartbeat", "--fixed"], t.io)).toBe(0);
    expect(t.out.join("")).toMatch(/^HELD\nNo violation found in \d+ emulated runs? of this gremlin set\. Not a proof\.\n$/);
  });
});
