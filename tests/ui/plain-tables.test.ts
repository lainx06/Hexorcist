// Feature: bench-ui-examples. Plain-text tables, entry by entry, with strings quoted from requirements.md.
// Evidence, not proof.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Fixture } from "../../src/engine/types";
import { EXAMPLE_COPY, SPAN_SENTENCE, STORY_ENDING } from "../../src/ui/app/model/example-copy";
import { PICKER_TEXT } from "../../src/ui/app/model/gremlin-picker";
import {
  EXAMPLE_STORY_LABELS,
  FRIENDLY_LABELS,
  GREMLIN_LEGEND,
  PLAIN_STORY_LABELS,
  storyLabelsFor,
} from "../../src/ui/app/model/labels";

const fixtureOf = (id: string) =>
  JSON.parse(readFileSync(`examples/${id}/fixture.json`, "utf8")) as Fixture;

const exact = (actual: object, expected: object) => expect(actual).toEqual(expected);

describe("plain tables", () => {
  it("EXAMPLE_COPY (Req 4.1 to 4.3)", () => {
    exact(EXAMPLE_COPY, {
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
    });
  });

  it("FRIENDLY_LABELS (Req 5.1) and its keys equal the pin signals of the three fixtures (Req 5.2)", () => {
    exact(FRIENDLY_LABELS, {
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
    });
    const signals = new Set(["crosswalk", "garage", "heartbeat"].flatMap((id) => fixtureOf(id).pins.map((p) => p.signal)));
    expect([...Object.keys(FRIENDLY_LABELS)].sort()).toEqual([...signals].sort());
  });

  it("EXAMPLE_STORY_LABELS (Req 10.1 to 10.4)", () => {
    exact(EXAMPLE_STORY_LABELS, {
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
      PULSE: { active: "started a pulse", inactive: "ended the pulse", held: "held the pulse input on" },
    });
  });

  it("storyLabelsFor gives only the input signals of each fixture (Req 10.5)", () => {
    expect(Object.keys(storyLabelsFor(fixtureOf("crosswalk"))).sort()).toEqual(["REQUEST"]);
    expect(Object.keys(storyLabelsFor(fixtureOf("garage"))).sort()).toEqual(["BEAM_CLEAR", "CLOSE"]);
    expect(Object.keys(storyLabelsFor(fixtureOf("heartbeat"))).sort()).toEqual(["PULSE"]);
  });

  it("PLAIN_STORY_LABELS (Req 11.1)", () => {
    const letGo = { active: "pressed it", held: "pressed and held it", inactive: "let go" };
    exact(PLAIN_STORY_LABELS, {
      REQUEST: { full: EXAMPLE_STORY_LABELS.REQUEST, short: letGo },
      CLOSE: { full: EXAMPLE_STORY_LABELS.CLOSE, short: letGo },
      BEAM_CLEAR: {
        full: EXAMPLE_STORY_LABELS.BEAM_CLEAR,
        short: { active: "blocked it", held: "blocked it and kept it blocked", inactive: "cleared it" },
      },
      PULSE: {
        full: EXAMPLE_STORY_LABELS.PULSE,
        short: { active: "started another pulse", held: "held it on", inactive: "ended it" },
      },
    });
  });

  it("GREMLIN_LEGEND (Req 11.13)", () => {
    exact(GREMLIN_LEGEND, {
      masher: "masher: a gremlin that presses buttons over and over",
      bouncer: "bouncer: a gremlin that makes a contact flicker on and off very fast",
      stuck: "stuck: a gremlin that holds an input on and does not let go",
      dropout: "dropout: a gremlin that briefly cuts an input that is normally on",
      spike: "spike: a gremlin that makes one sudden jump on an analog input",
      drifter: "drifter: a gremlin that slowly ramps an analog input up or down",
    });
  });

  it("PICKER_TEXT (Req 15.1, 15.2)", () => {
    exact(PICKER_TEXT, {
      masher: { name: "Masher", behaviour: "Presses a button again and again." },
      bouncer: { name: "Bouncer", behaviour: "Makes a contact flicker on and off very fast." },
      stuck: { name: "Stuck", behaviour: "Holds an input on and does not let go." },
      dropout: { name: "Dropout", behaviour: "Briefly cuts an input that is normally on." },
      spike: { name: "Spike", behaviour: "Makes one sudden jump on an analog input." },
      drifter: { name: "Drifter", behaviour: "Slowly ramps an analog input up or down." },
    });
  });

  it("STORY_ENDING has 5 entries (Req 11.5)", () => {
    expect(Object.keys(STORY_ENDING)).toHaveLength(5);
    const values = Object.entries(STORY_ENDING).map(([k, v]) => [k, v]);
    expect(values).toEqual(
      expect.arrayContaining([
        ["all of (CAR_GREEN is 1, WALK is 1) must never happen.", "the light gave cars and walkers a green at the same time."],
        [
          "Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true.",
          "the door was still closing, 20 ms after the gremlin blocked the beam.",
        ],
        ["HEARTBEAT is 1 must never last 600 ms or longer.", "the heartbeat light had been stuck on for 600 ms."],
        ["HEARTBEAT is 0 must never last 600 ms or longer.", "the heartbeat light had been stuck off for 600 ms."],
      ]),
    );
    // The fifth entry is the "any other rule" text, whatever its key.
    expect(Object.values(STORY_ENDING)).toContain("the program broke your rule.");
  });

  it("SPAN_SENTENCE has 4 entries (Req 11.6)", () => {
    expect(Object.keys(SPAN_SENTENCE).sort()).toEqual(["crosswalk", "custom", "garage", "heartbeat"]);
    const slot = (s: string) => s.replace("<Plain_Ms>", "<Plain_Ms of lengthCycles>");
    expect(slot(SPAN_SENTENCE.garage)).toBe("The door kept closing for another <Plain_Ms of lengthCycles>.");
    for (const k of ["crosswalk", "heartbeat", "custom"] as const) {
      expect(slot(SPAN_SENTENCE[k])).toBe("It stayed that way for another <Plain_Ms of lengthCycles>.");
    }
  });
});
