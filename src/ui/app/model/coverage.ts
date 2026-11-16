// Coverage counts and the Coverage_Line under a HELD verdict. Pure.
import type { RuleSet } from "../../../engine/rules/ir";
import { triggerOccurred } from "../../../engine/rules/trigger";
import type { TriggerRun } from "../../../engine/rules/trigger";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { ms } from "./format";

export interface Coverage {
  /** Per rule: runs in which triggerOccurred was true, or null for a never rule. */
  triggerCounts: (number | null)[];
  /** Gremlin_Events with cycle below Run_Cycles over every run. */
  gremlinEvents: number;
}

export type CoverageRun = TriggerRun & { eventList: readonly ReducerEvent[] };

export const NEVER_RULE_PART = "Rule trigger: none, a never rule has no trigger";

export function coverageCounts(
  ruleSet: RuleSet,
  fixture: Fixture,
  runs: readonly CoverageRun[],
  runCycles: number,
): Coverage {
  const triggerCounts = ruleSet.map((rule) => {
    if (rule.form === "never") return null;
    let n = 0;
    for (const run of runs) if (triggerOccurred(rule, fixture, run)) n++;
    return n;
  });
  let gremlinEvents = 0;
  for (const run of runs) {
    for (const e of run.eventList) if (e.gremlinId !== "rest" && e.cycle < runCycles) gremlinEvents++;
  }
  return { triggerCounts, gremlinEvents };
}

/** Parts joined with " · ": rule parts, gremlin events, run length, seed. */
export function coverageLine(coverage: Coverage, heldRuns: number, runCycles: number, seed: number): string {
  const parts = coverage.triggerCounts.map((r) =>
    r === null ? NEVER_RULE_PART : `Rule trigger happened in ${String(r)} of ${String(heldRuns)} runs`,
  );
  parts.push(`Gremlin events: ${String(coverage.gremlinEvents)}`);
  parts.push(`Run length: ${ms(runCycles)}`);
  parts.push(`Seed: ${String(seed)}`);
  return parts.join(" \u00b7 ");
}