// Plain-language text tables for signals, story phrases and gremlins. Pure.
import type { StoryLabel } from "../../../engine/reducer/story";
import type { Fixture } from "../../../engine/types";

export const FRIENDLY_LABELS: Readonly<Record<string, string>> = {
  REQUEST: "Walk button",
  CAR_GREEN: "Car light: green",
  CAR_YELLOW: "Car light: yellow",
  CAR_RED: "Car light: red",
  WALK: "Walk sign",
  DONT_WALK: "Don't walk sign",
  CLOSE: "Close button",
  BEAM_CLEAR: "Obstacle beam",
  MOTOR_CLOSE: "Motor: closing",
  MOTOR_OPEN: "Motor: opening",
  LAMP: "Warning lamp",
  PULSE: "Sensor",
  HEARTBEAT: "I'm-alive light",
};

/** The plain name of a signal; an unknown signal keeps its own name with known false. */
export function friendlyLabel(signal: string): { text: string; known: boolean } {
  const text = Object.prototype.hasOwnProperty.call(FRIENDLY_LABELS, signal) ? FRIENDLY_LABELS[signal] : undefined;
  return text === undefined ? { text: signal, known: false } : { text, known: true };
}

export const EXAMPLE_STORY_LABELS: Readonly<Record<string, StoryLabel>> = {
  REQUEST: {
    active: "pressed the walk button",
    inactive: "released the walk button",
    held: "pressed and held the walk button",
  },
  CLOSE: {
    active: "pressed the close button",
    inactive: "released the close button",
    held: "pressed and held the close button",
  },
  BEAM_CLEAR: {
    active: "blocked the beam",
    inactive: "cleared the beam",
    held: "blocked the beam and kept it blocked",
  },
  PULSE: {
    active: "turned the sensor on",
    inactive: "turned the sensor off",
    held: "held the sensor on",
  },
};

/** Only the entries of the fixture's input pins. */
export function storyLabelsFor(fixture: Fixture): Record<string, StoryLabel> {
  const out: Record<string, StoryLabel> = {};
  for (const p of fixture.pins) {
    const isInput = p.kind === "analog" || p.direction === "input";
    if (isInput && Object.prototype.hasOwnProperty.call(EXAMPLE_STORY_LABELS, p.signal)) {
      out[p.signal] = EXAMPLE_STORY_LABELS[p.signal];
    }
  }
  return out;
}

export interface PlainStoryLabel {
  full: StoryLabel;
  short: StoryLabel;
}

const short = (active: string, held: string, inactive: string): StoryLabel => ({ active, held, inactive });
const letGo = short("pressed it", "pressed and held it", "let go");

export const PLAIN_STORY_LABELS: Readonly<Record<string, PlainStoryLabel>> = {
  REQUEST: { full: EXAMPLE_STORY_LABELS.REQUEST, short: letGo },
  CLOSE: { full: EXAMPLE_STORY_LABELS.CLOSE, short: letGo },
  BEAM_CLEAR: {
    full: EXAMPLE_STORY_LABELS.BEAM_CLEAR,
    short: short("blocked it", "blocked it and kept it blocked", "cleared it"),
  },
  PULSE: {
    full: EXAMPLE_STORY_LABELS.PULSE,
    short: short("turned it on again", "held it on", "turned it off"),
  },
};

export const GREMLIN_LEGEND: Readonly<Record<string, string>> = {
  masher: "Masher: a gremlin that presses a button over and over, fast",
  bouncer: "Bouncer: a gremlin that makes a button or sensor flicker on and off for a split second, like a loose wire",
  stuck: "Stuck: a gremlin that holds a button down and never lets go",
  dropout: "Dropout: a gremlin that makes a signal that is normally on cut out for a moment",
  spike: "Spike: a gremlin that makes a dial-type reading (like a temperature sensor) jump suddenly",
  drifter: "Drifter: a gremlin that slowly pushes a dial-type reading up or down",
};
