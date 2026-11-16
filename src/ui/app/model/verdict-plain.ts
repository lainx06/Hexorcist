// Plain-language verdict texts. Pure.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { BrokeTrace } from "../../../engine/types";
import { NEVER_RULE_PART } from "./coverage";

export const VERDICT_PLAIN = {
  logSummary: "Show the full gremlin log",
  heldFixed: "No gremlin broke the fixed program in",
  heldBuggy: "No gremlin broke this program in",
  neverRulePart: "Checked at every cycle of every run (a never rule has no trigger).",
  modelGap: "This program can't be judged here: it uses a part this emulator does not model.",
  otherGap: "This program can't be judged here with these settings.",
  reduceMade: "The gremlins made",
  brokeOnTry: "Broke on try {n} of {m}.",
} as const;

export type HeldBuild = "buggy" | "fixed";

export function runOfText(trace: BrokeTrace, n: number): string {
  return `run ${String(trace.runIndex + 1)} of ${String(n)}`;
}

/** Plain view of the run line: "Broke on try N of M." */
export function plainRunText(trace: BrokeTrace, n: number): string {
  return VERDICT_PLAIN.brokeOnTry.replace("{n}", String(trace.runIndex + 1)).replace("{m}", String(n));
}

/** "Show the full gremlin log (N moves)"; Rest_Events are not counted. */
export function gremlinLogSummary(list: readonly ReducerEvent[]): string {
  const n = list.filter((e) => e.gremlinId !== "rest").length;
  return `${VERDICT_PLAIN.logSummary} (${n === 1 ? "1 move" : `${String(n)} moves`})`;
}

export function heldSentence(build: HeldBuild, n: number): string {
  const lead = build === "fixed" ? VERDICT_PLAIN.heldFixed : VERDICT_PLAIN.heldBuggy;
  return `${lead} ${n === 1 ? "1 try" : `${String(n)} tries`}.`;
}

/** The sentence, then the HELD text unchanged. */
export function heldCardText(build: HeldBuild, verdict: { text: string; runs: number }): [string, string] {
  return [heldSentence(build, verdict.runs), verdict.text];
}

export function plainCoverageParts(line: string): string[] {
  return line.split(" \u00b7 ").map((p) => (p === NEVER_RULE_PART ? VERDICT_PLAIN.neverRulePart : p));
}

export function couldntTellHeadline(reason: string): string {
  const gap = reason
    .split("; ")
    .some((p) => p.includes("which this emulator setup does not model") || p.startsWith("Peripherals not supported"));
  return gap ? VERDICT_PLAIN.modelGap : VERDICT_PLAIN.otherGap;
}

/** Heading of the Story_Card. */
export function storyHeading(): string {
  return "What happened, replaying only the moves that matter";
}

/** Technical note after the heading: Y = reduced count, X = original count. */
export function reducedReplayNote(reduced: number, original: number): string {
  return `(reduced replay, ${String(reduced)} of ${String(original)} events)`;
}

/** Note under the Timeline for the "Original run" selection: X original moves, Y reduced moves. */
export function originalRunNote(original: number, reduced: number): string {
  return `The original run had ${String(original)} gremlin moves; the story above uses only the ${String(reduced)} that matter, so lengths can differ.`;
}

/** "The gremlins made X moves. Only Y are needed to cause the bug." or the budget form. */
export function reductionSentence(x: number, y: number, atBudget: boolean): string {
  const made = `${VERDICT_PLAIN.reduceMade} ${x === 1 ? "1 move" : `${String(x)} moves`}.`;
  if (atBudget) return `${made} ${y === 1 ? "1 of them is" : `${String(y)} of them are`} enough to cause the bug.`;
  return `${made} Only ${y === 1 ? "1 is" : `${String(y)} are`} needed to cause the bug.`;
}
