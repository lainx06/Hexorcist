// Texts for the fixed-build replay and "Try removing". Pure.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";

export function fixedReplayText(target: string, v: Violation | null): string {
  if (v === null) return "The reduced replay does not break the rule on the fixed build.";
  if (v.rule === target) return "The reduced replay still breaks the rule on the fixed build.";
  return `The reduced replay breaks a different rule on the fixed build: ${v.rule}`;
}

/** The list without entry `index`; every other entry copied, order kept. */
export function withoutEvent(list: readonly ReducerEvent[], index: number): ReducerEvent[] {
  return list.filter((_, i) => i !== index).map((e) => ({ ...e }));
}

export function tryRemovingText(target: string, v: Violation | null): string {
  return v !== null && v.rule === target
    ? "Without this event the rule still breaks."
    : "Without this event the rule does not break.";
}