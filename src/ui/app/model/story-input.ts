// The failureStory input the App builds: Story_Labels always, a span for span forms. Pure.
import type { Violation } from "../../../engine/checker";
import type { RuleSet } from "../../../engine/rules/ir";
import type { StoryInput, StoryLabel } from "../../../engine/reducer/story";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent } from "../../../engine/types";
import { EXAMPLE_LABELS, exactLabelsFor } from "./signal-labels";
import type { SignalLabels } from "./signal-labels";
import { ruleBySentence } from "./rules";
import { spanFor } from "./span";

export const STORY_LABELS: Readonly<Record<string, StoryLabel>> = {
  REQUEST: {
    active: "pressed the walk button",
    inactive: "released the walk button",
    held: "pressed and held the walk button",
  },
};

/** Story input with the fixture's Story_Labels; the span is passed in, set only when not null. */
export function exampleStoryInput(args: {
  reducedList: readonly ReducerEvent[];
  fixture: Fixture;
  violation: Violation;
  outputEdges: readonly OutputEvent[];
  span: { lengthCycles: number; cut: boolean } | null;
  /** Default the Example tables; an upload gives signal names only. */
  labels?: SignalLabels;
}): StoryInput {
  const input: StoryInput = {
    reducedList: args.reducedList,
    fixture: args.fixture,
    violation: args.violation,
    outputEdges: args.outputEdges,
    labels: exactLabelsFor(args.labels ?? EXAMPLE_LABELS, args.fixture),
  };
  if (args.span !== null) input.violationSpan = { lengthCycles: args.span.lengthCycles, cut: args.span.cut };
  return input;
}

export function buildStoryInput(args: {
  reducedList: readonly ReducerEvent[];
  fixture: Fixture;
  ruleSet: RuleSet;
  violation: Violation;
  outputEdges: readonly OutputEvent[];
  reachedEnd: number;
}): StoryInput {
  const input: StoryInput = {
    reducedList: args.reducedList,
    fixture: args.fixture,
    violation: args.violation,
    outputEdges: args.outputEdges,
    labels: STORY_LABELS,
  };
  const found = ruleBySentence(args.ruleSet, args.violation.rule);
  if (found !== null) {
    const f = found.rule.form;
    if (f === "never" || f === "notLongerThan" || f === "respond") {
      const span = spanFor(found.rule, args.violation.cycle, args.outputEdges, args.reachedEnd);
      if (span !== null) input.violationSpan = { lengthCycles: span.lengthCycles, cut: span.cut };
    }
  }
  return input;
}