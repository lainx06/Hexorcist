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

/**
 * Upload wording of one input, in the Examples' button words: "pressed <name>", "pressed and held <name>",
 * "released <name>", and for a repeat on the same input "pressed it", "pressed and held it", "let go".
 */
function pressLabel(name: string): PlainStoryLabel {
  return {
    full: { active: `pressed ${name}`, held: `pressed and held ${name}`, inactive: `released ${name}` },
    short: { active: "pressed it", held: "pressed and held it", inactive: "let go" },
  };
}

/** Example: PLAIN_STORY_LABELS. Upload: the press wording for every pin, named by its Display_Name. */
export function plainStoryTableFor(labels: SignalLabels): Readonly<Record<string, PlainStoryLabel>> {
  if (labels.kind === "example") return PLAIN_STORY_LABELS;
  const out: Record<string, PlainStoryLabel> = {};
  for (const signal of Object.keys(labels.names)) out[signal] = pressLabel(labelOf(labels, signal).text);
  return out;
}

/** Example: storyLabelsFor(fixture). Upload: no entries. */
export function exactLabelsFor(labels: SignalLabels, fixture: Fixture): Record<string, StoryLabel> {
  return labels.kind === "example" ? storyLabelsFor(fixture) : {};
}
