// Per-Example card, rule headline and BROKE sentence. Pure.
import type { ExampleId } from "../data/examples";

export interface CopyEntry {
  card: string;
  headline: string;
  broke: string;
}

export const EXAMPLE_COPY: Readonly<Record<ExampleId, CopyEntry>> = {
  crosswalk: {
    card: "Crosswalk: a traffic light with a walk button",
    headline: "Cars and walkers must never get a green at the same time.",
    broke: "The light gave cars and walkers a green at the same time.",
  },
  garage: {
    card: "Garage door: a door that must stop when something blocks the beam",
    headline: "When the beam is blocked, the door must stop closing within 20 ms.",
    broke: "After the beam was blocked, the door kept closing for more than 20 ms.",
  },
  heartbeat: {
    card: "Heartbeat: a light that must keep blinking",
    headline: "The heartbeat light must never freeze on or off for 600 ms.",
    broke: "The heartbeat light froze for 600 ms or longer.",
  },
};

export const CUSTOM_COPY = { headline: "Custom rule", broke: "The program broke your rule." } as const;

/** Key of the Story_Ending entry used for any rule that is not one of the four Example rules. */
export const OTHER_RULE_KEY = "any other rule";

/** Ending of sentence 2 of the plain story, keyed by the Target_Rule Canonical_Sentence. */
export const STORY_ENDING: Readonly<Record<string, string>> = {
  "all of (CAR_GREEN is 1, WALK is 1) must never happen.": "the light gave cars and walkers a green at the same time.",
  "Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true.":
    "the door was still closing, 20 ms after the gremlin blocked the beam.",
  "HEARTBEAT is 1 must never last 600 ms or longer.": "the heartbeat light had been stuck on for 600 ms.",
  "HEARTBEAT is 0 must never last 600 ms or longer.": "the heartbeat light had been stuck off for 600 ms.",
  [OTHER_RULE_KEY]: "the program broke your rule.",
};

/** Sentence 3 for a span that ends on its own. "<Plain_Ms>" marks the slot for the length. */
export const SPAN_SENTENCE: Readonly<Record<ExampleId | "custom", string>> = {
  crosswalk: "It stayed that way for another <Plain_Ms>.",
  garage: "The door kept closing for another <Plain_Ms>.",
  heartbeat: "It stayed that way for another <Plain_Ms>.",
  custom: "It stayed that way for another <Plain_Ms>.",
};

export function storyEndingFor(canonicalSentence: string): string {
  return Object.prototype.hasOwnProperty.call(STORY_ENDING, canonicalSentence) && canonicalSentence !== OTHER_RULE_KEY
    ? (STORY_ENDING[canonicalSentence] as string)
    : (STORY_ENDING[OTHER_RULE_KEY] as string);
}

export function spanSentenceFor(id: ExampleId, custom: boolean): string {
  return custom ? SPAN_SENTENCE.custom : SPAN_SENTENCE[id];
}

/** True when the two sentence lists differ, compared in order. */
export function isCustomRuleSet(active: readonly string[], example: readonly string[]): boolean {
  return active.length !== example.length || active.some((s, i) => s !== example[i]);
}

export function copyFor(id: ExampleId, custom: boolean): { headline: string; broke: string } {
  return custom ? CUSTOM_COPY : EXAMPLE_COPY[id];
}
