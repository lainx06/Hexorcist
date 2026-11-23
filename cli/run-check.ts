// headless-runner: runCheck (Requirement 2), the Result_Object, toJson, toSummary and exitCodeOf
// (Requirements 3 and 4). Pure apart from the engine jobs it is given. No clock, no random source.
import type { ReducerEvent } from "../src/engine/reducer/types";
import { runCampaignJob, runReductionJob, runReplayJob } from "../src/ui/app/worker/host";
import type { JobError } from "../src/ui/app/worker/messages";
import type { CheckInput } from "./input-loader";

export interface Jobs {
  campaign: typeof runCampaignJob;
  reduction: typeof runReductionJob;
  replay: typeof runReplayJob;
}

export const HOST_JOBS: Jobs = { campaign: runCampaignJob, reduction: runReductionJob, replay: runReplayJob };

interface Common {
  toolVersion: string;
  seed: number;
  runs: number;
  gremlins: string[];
  rules: string[];
}

export interface BrokeResult extends Common {
  verdict: "BROKE";
  try: number;
  movesBefore: number;
  movesAfter: number;
  fingerprint: string;
  violation: { rule: string; cycle: number };
  reducedList: ReducerEvent[];
}

export interface HeldResult extends Common {
  verdict: "HELD";
  n: number;
  text: string;
}

export interface CouldntTellResult extends Common {
  verdict: "COULDN'T TELL";
  reason: string;
  peripherals: string[];
}

export type ResultObject = BrokeResult | HeldResult | CouldntTellResult;

export type JobName = "campaign" | "reduction" | "replay";

export type CheckOutcome = { ok: true; result: ResultObject } | { ok: false; job: JobName; error: JobError };

const jobFail = (job: JobName, error: JobError): CheckOutcome => ({ ok: false, job, error: { kind: error.kind, message: error.message } });

/** One campaign; on BROKE one reduction and one replay of the reduced list; nothing else. */
export function runCheck(input: CheckInput, toolVersion: string, jobs: Jobs = HOST_JOBS): CheckOutcome {
  const { hex, fixture, ruleSet, gremlinSet, campaignSeed, runs, runCycles } = input;
  const c = jobs.campaign({ hex, fixture, ruleSet, gremlinSet, campaignSeed, runs, runCycles });
  if (!c.ok) return jobFail("campaign", c.error);
  const common: Common = {
    toolVersion,
    seed: campaignSeed,
    runs: c.result.requestedRuns,
    gremlins: gremlinSet.map((g) => g.id),
    rules: [...input.ruleSentences],
  };
  const v = c.result.verdict;
  if (v.verdict === "HELD") {
    return { ok: true, result: { toolVersion, verdict: "HELD", seed: common.seed, runs: common.runs, gremlins: common.gremlins, rules: common.rules, n: v.runs, text: v.text } };
  }
  if (v.verdict === "COULDN'T TELL") {
    const ids: string[] = [];
    for (const u of c.result.peripheralUses?.uses ?? []) if (!ids.includes(u.peripheral)) ids.push(u.peripheral);
    return {
      ok: true,
      result: { toolVersion, verdict: "COULDN'T TELL", seed: common.seed, runs: common.runs, gremlins: common.gremlins, rules: common.rules, reason: v.reason, peripherals: ids },
    };
  }
  const red = jobs.reduction({ hex, fixture, ruleSet, originalList: v.trace.eventList, violation: v.trace.violation, runCycles });
  if (!red.ok) return jobFail("reduction", red.error);
  const rep = jobs.replay({ hex, fixture, ruleSet, events: red.result.reducedList, runCycles });
  if (!rep.ok) return jobFail("replay", rep.error);
  // The page shows the reduced replay's violation; fall back to the campaign's if the replay has none.
  const vio = rep.violation ?? v.trace.violation;
  const tryIndex = c.result.violatingRunIndex ?? v.trace.runIndex;
  return {
    ok: true,
    result: {
      toolVersion,
      verdict: "BROKE",
      seed: common.seed,
      runs: common.runs,
      gremlins: common.gremlins,
      rules: common.rules,
      try: tryIndex + 1,
      movesBefore: red.result.originalEventCount,
      movesAfter: red.result.reducedEventCount,
      fingerprint: rep.fingerprint,
      violation: { rule: vio.rule, cycle: vio.cycle },
      reducedList: red.result.reducedList.map(eventCopy),
    },
  };
}

/** A fixed key order for each event, so the JSON does not depend on how the engine built the object. */
function eventCopy(e: ReducerEvent): ReducerEvent {
  const out: Record<string, unknown> = {};
  for (const k of ["cycle", "signal", "value", "gremlinId"]) if (k in e) out[k] = (e as unknown as Record<string, unknown>)[k];
  for (const k of Object.keys(e).sort()) if (!(k in out)) out[k] = (e as unknown as Record<string, unknown>)[k];
  return out as unknown as ReducerEvent;
}

/** Requirement 3.4: fixed key order (object literal order above), two-space indent, LF, one trailing LF. */
export function toJson(r: ResultObject): string {
  return `${JSON.stringify(r, null, 2)}\n`;
}

export function exitCodeOf(outcome: CheckOutcome | { ok: false; reason: string }): 0 | 1 | 2 | 3 {
  if (!outcome.ok) return 3;
  const v = outcome.result.verdict;
  return v === "HELD" ? 0 : v === "BROKE" ? 1 : 2;
}

/** Cycles at 16 MHz as milliseconds with one decimal (integer arithmetic). */
const ms = (cycle: number): string => {
  const tenths = Math.round(cycle / 1600);
  return `${Math.floor(tenths / 10)}.${tenths % 10} ms`;
};

function moveLine(e: ReducerEvent): string {
  const rec = e as unknown as Record<string, unknown>;
  const parts = Object.keys(rec)
    .filter((k) => k !== "cycle" && k !== "signal" && k !== "gremlinId")
    .map((k) => (k === "value" ? String(rec[k]) : `${k} ${JSON.stringify(rec[k])}`));
  const who = typeof rec.gremlinId === "string" ? ` (${rec.gremlinId})` : "";
  return `  at ${ms(e.cycle)}: ${e.signal} = ${parts.join(", ")}${who}`;
}

/** The plain-text summary (Requirements 3.1, 3.6 to 3.8). Same strings as the JSON, LF line ends. */
export function toSummary(r: ResultObject): string {
  const head = [r.verdict];
  const setup = `Seed ${r.seed}, ${r.runs} tries, gremlins: ${r.gremlins.join(", ") || "none"}.`;
  const rules = r.rules.map((s) => `Rule: ${s}`);
  let body: string[];
  if (r.verdict === "HELD") {
    body = [r.text, setup, ...rules];
  } else if (r.verdict === "COULDN'T TELL") {
    body = [r.reason, ...(r.peripherals.length > 0 ? [`Peripherals used: ${r.peripherals.join(", ")}`] : []), setup, ...rules];
  } else {
    body = [
      `Broken rule: ${r.violation.rule}`,
      `Try ${r.try} of ${r.runs} broke it, at ${ms(r.violation.cycle)} into the replay.`,
      `${setup}`,
      `The smallest replay this reducer found: ${r.movesAfter} of ${r.movesBefore} moves.`,
      ...r.reducedList.map(moveLine),
      `Fingerprint: ${r.fingerprint}`,
    ];
  }
  return `${[...head, ...body].join("\n")}\n`;
}
