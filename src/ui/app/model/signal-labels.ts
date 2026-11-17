// Where signal names come from: the Example tables, or the Pin_Table of an upload. Pure.
import type { StoryLabel } from "../../../engine/reducer/story";
import type { Fixture } from "../../../engine/types";
import { PLAIN_STORY_LABELS, friendlyLabel, storyLabelsFor } from "./labels";
import type { PlainStoryLabel } from "./labels";

export type SignalLabels =
  | { kind: "example" }
  | { kind: "upload"; /** Signal_Name to Plain_Name ("" when blank). */ names: Readonly<Record<string, string>> };

export const EXAMPLE_LABELS: SignalLabels = { kind: "example" };

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Example: friendlyLabel. Upload: the Display_Name, known when a Plain_Name is set; never the Example tables. */
export function labelOf(labels: SignalLabels, signal: string): { text: string; known: boolean } {
  if (labels.kind === "example") return friendlyLabel(signal);
  const plain = own(labels.names, signal) ? (labels.names[signal] as string) : "";
  return plain === "" ? { text: signal, known: false } : { text: plain, known: true };
}

const EMPTY_PLAIN: Readonly<Record<string, PlainStoryLabel>> = Object.freeze({});

/** Example: PLAIN_STORY_LABELS. Upload: no entries, so every move uses the unlabelled wording. */
export function plainStoryTableFor(labels: SignalLabels): Readonly<Record<string, PlainStoryLabel>> {
  return labels.kind === "example" ? PLAIN_STORY_LABELS : EMPTY_PLAIN;
}

/** Example: storyLabelsFor(fixture). Upload: no entries. */
export function exactLabelsFor(labels: SignalLabels, fixture: Fixture): Record<string, StoryLabel> {
  return labels.kind === "example" ? storyLabelsFor(fixture) : {};
}