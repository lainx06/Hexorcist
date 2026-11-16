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
  PULSE: "Pulse input",
  HEARTBEAT: "Heartbeat light",
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
    active: "started a pulse",
    inactive: "ended the pulse",
    held: "held the pulse input on",
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
    short: short("started another pulse", "held it on", "ended it"),
  },
};

export const GREMLIN_LEGEND: Readonly<Record<string, string>> = {
  masher: "masher: a gremlin that presses buttons over and over",
  bouncer: "bouncer: a gremlin that makes a contact flicker on and off very fast",
  stuck: "stuck: a gremlin that holds an input on and does not let go",
  dropout: "dropout: a gremlin that briefly cuts an input that is normally on",
  spike: "spike: a gremlin that makes one sudden jump on an analog input",
  drifter: "drifter: a gremlin that slowly ramps an analog input up or down",
};
