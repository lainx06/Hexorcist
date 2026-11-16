// Verdict card texts: exact Engine strings plus the card's finding and scope lines. Pure.
import type { CannotCheck } from "../../../engine/checker";
import type { Rule } from "../../../engine/rules/ir";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { BrokeTrace, OutputEvent, Verdict } from "../../../engine/types";
import { inputValueText, levelText, ms } from "./format";
import { ruleSignals } from "./rules";
import { eventValue, levelAt } from "./timeline";

export type BuildLabel = "Buggy build" | "Fixed build";

/** The Engine verdict string, unchanged. */
export function cardTitle(v: Verdict): Verdict["verdict"] {
  return v.verdict;
}

/** "Observed at <Ms_Text of v>: CAR_GREEN = 1, WALK = 1." */
export function observedText(rule: Rule | null, v: number, outputEvents: readonly OutputEvent[]): string {
  const signals = rule === null ? [] : ruleSignals(rule);
  const pairs = signals.map((s) => `${s} = ${levelText(levelAt(outputEvents, s, v))}`);
  return `Observed at ${ms(v)}: ${pairs.join(", ")}.`;
}

/** "run k of N" with k 1-based, and "Seed: <seed>". */
export function brokeScope(trace: BrokeTrace, runCount: number, seed: number): { runText: string; seedText: string } {
  return { runText: `run ${String(trace.runIndex + 1)} of ${String(runCount)}`, seedText: `Seed: ${String(seed)}` };
}

export interface TraceRow {
  time: string;
  signal: string;
  value: string;
  gremlin: string;
}

/** One row per event, Rest_Events included, list order. */
export function traceRows(eventList: readonly ReducerEvent[]): TraceRow[] {
  return eventList.map((e) => ({
    time: ms(e.cycle),
    signal: e.signal,
    value: inputValueText(eventValue(e)),
    gremlin: e.gremlinId,
  }));
}

export const EMPTY_TRACE_TEXT = "This trace holds no input events.";

export function uncheckedRows(unchecked: readonly CannotCheck[]): { rule: string; reason: string }[] {
  return unchecked.map((u) => ({ rule: u.rule, reason: u.reason }));
}

export interface ReasonLine {
  text: string;
  hints: string[];
}

const HINTS: readonly { test: (p: string) => boolean; hint: string }[] = [
  {
    test: (p) => p.includes("trigger never happened"),
    hint: "Next step: adjust the stimulus (other gremlins, more runs or a longer run) so the trigger can happen.",
  },
  { test: (p) => p.includes("floating"), hint: "Next step: review the input configuration." },
  {
    test: (p) => p.startsWith("Signals not mapped to a pin"),
    hint: "Next step: map these signals to pins in the fixture.",
  },
  {
    test: (p) => p.startsWith("Peripherals not supported") || p.includes("which this emulator setup does not model"),
    hint: "Next step: this program uses hardware this emulator does not model; check this part on a board.",
  },
  {
    test: (p) => p.startsWith("Only ") && p.endsWith(" runs completed"),
    hint: "Next step: run the campaign again.",
  },
  {
    test: (p) => p === "No gremlin produced an event in any run",
    hint: "Next step: pick gremlins that target this program's inputs.",
  },
];

/** The reason split on "; ", each part unchanged, with every matching hint in table order. */
export function couldntTellLines(reason: string): ReasonLine[] {
  return reason.split("; ").map((text) => ({ text, hints: HINTS.filter((h) => h.test(text)).map((h) => h.hint) }));
}

export function heldFinding(v: { text: string }): string {
  return v.text;
}

/** The finding text of a card, as announced. */
export function findingText(v: Verdict, rule: Rule | null): string {
  switch (v.verdict) {
    case "BROKE":
      return `${v.trace.violation.rule} ${observedText(rule, v.trace.violation.cycle, v.trace.outputEvents)}`;
    case "HELD":
      return heldFinding(v);
    case "COULDN'T TELL":
      return couldntTellLines(v.reason)
        .map((l) => l.text)
        .join(" ");
  }
}

/** "<build>: <title>. <finding>" */
export function announcement(build: BuildLabel, v: Verdict, finding: string): string {
  return `${build}: ${cardTitle(v)}. ${finding}`;
}