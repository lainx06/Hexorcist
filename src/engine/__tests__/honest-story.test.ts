// Feature: honest-verdicts, Part 2. New Failure_Story wording, Story_Labels and held presses.
// Expected texts are built from requirements.md (Requirements 9 to 12), not copied from output.
// Passing tests are evidence, not proof. No wall clock, no random source outside fast-check's seed.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cycleText, failureStory } from "../reducer/story";
import { arbStoryCase, refStory } from "./reducer-arbitraries";
import type { Fixture } from "../types";

const F: Fixture = {
  pins: [
    { signal: "REQUEST", port: "D", bit: 2, direction: "input", activeLevel: "low" },
    { signal: "UP", port: "D", bit: 3, direction: "input", activeLevel: "high" },
    { signal: "BEAM_CLEAR", port: "D", bit: 4, direction: "input", activeLevel: "low" },
    { signal: "POT", kind: "analog", channel: 0 },
    { signal: "WALK", port: "B", bit: 3, direction: "output" },
  ],
};
const RULE = "all of (CAR_GREEN is 1, WALK is 1) must never happen.";
const BEAM = { BEAM_CLEAR: { active: "blocked the beam", inactive: "cleared the beam" } };
const base = (cycle: number) => ({ reducedList: [], fixture: F, violation: { rule: RULE, cycle }, outputEdges: [] });
const NONE = "In the smallest replay this reducer found, no gremlin event was needed.";

describe("violation and span sentences (Requirements 9, 10)", () => {
  it("writes the cycle with thousands separators", () => {
    expect(failureStory(base(15_647_543))).toBe(`${NONE} At 978.0 ms (cycle 15,647,543), the program broke this rule: ${RULE}`);
    expect(failureStory(base(0))).toBe(`${NONE} At 0.0 ms (cycle 0), the program broke this rule: ${RULE}`);
    expect(failureStory(base(16_000))).toBe(`${NONE} At 1.0 ms (cycle 16,000), the program broke this rule: ${RULE}`);
  });

  it("ends with the span sentence, with at least when the span was cut", () => {
    const v = `${NONE} At 978.0 ms (cycle 15,647,543), the program broke this rule: ${RULE}`;
    expect(failureStory({ ...base(15_647_543), violationSpan: { lengthCycles: 5_440_000, cut: false } })).toBe(`${v} The violation lasted 340.0 ms.`);
    expect(failureStory({ ...base(15_647_543), violationSpan: { lengthCycles: 5_440_000, cut: true } })).toBe(`${v} The violation lasted at least 340.0 ms.`);
  });

  it("cycleText groups digits with ASCII commas", () => {
    expect([0, 512, 1_000, 16_000, 15_647_543, Number.MAX_SAFE_INTEGER].map(cycleText)).toStrictEqual([
      "0", "512", "1,000", "16,000", "15,647,543", "9,007,199,254,740,991",
    ]);
  });
});

describe("labels and held presses (Requirements 11, 12)", () => {
  const beamEvents = [
    { signal: "BEAM_CLEAR", value: 0 as const, cycle: 5_448_000, gremlinId: "bouncer" },
    { signal: "BEAM_CLEAR", value: "release" as const, cycle: 5_476_800, gremlinId: "bouncer" },
    { signal: "BEAM_CLEAR", value: 0 as const, cycle: 5_515_200, gremlinId: "bouncer" },
  ];
  const tail = `At 978.0 ms (cycle 15,648,000), the program broke this rule: ${RULE}`;

  it("uses the labels, and and held for the press that is never released", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: beamEvents, labels: BEAM })).toBe(
      // One sentence would hold 31 words, so the 30-word limit moves the last phrase to a "Then" sentence.
      `In the smallest replay this reducer found, bouncer blocked the beam at 340.5 ms and bouncer cleared the beam at 342.3 ms. Then bouncer blocked the beam and held at 344.7 ms. ${tail}`,
    );
  });

  it("keeps today's verbs without labels, with pressed and held for the unreleased press", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: beamEvents })).toBe(
      `In the smallest replay this reducer found, bouncer pressed BEAM_CLEAR at 340.5 ms, bouncer released BEAM_CLEAR at 342.3 ms, and bouncer pressed and held BEAM_CLEAR at 344.7 ms. ${tail}`,
    );
  });

  it("a held press alone, without labels", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: [{ signal: "REQUEST", value: 0, cycle: 4_734_400, gremlinId: "stuck" }] })).toBe(
      `In the smallest replay this reducer found, stuck pressed and held REQUEST at 295.9 ms. ${tail}`,
    );
  });

  it("drove and set keep their words; a labelled drive to the other level uses inactive", () => {
    const evs = [
      { signal: "REQUEST", value: 1 as const, cycle: 16_000, gremlinId: "g0" },
      { signal: "POT", analog: 1023, cycle: 32_000, gremlinId: "noise" },
    ];
    expect(failureStory({ ...base(15_648_000), reducedList: evs })).toBe(
      `In the smallest replay this reducer found, g0 drove REQUEST to 1 at 1.0 ms and noise set POT to 1023 at 2.0 ms. ${tail}`,
    );
    expect(failureStory({ ...base(15_648_000), reducedList: evs, labels: { REQUEST: { active: "pushed it", inactive: "let it go" }, POT: { active: "x", inactive: "y" } } })).toBe(
      `In the smallest replay this reducer found, g0 let it go at 1.0 ms and noise set POT to 1023 at 2.0 ms. ${tail}`,
    );
  });

  it("ignores labels for signals with no event, and leaves the Summary_Form alone", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: beamEvents, labels: { UP: { active: "a", inactive: "b" } } })).toBe(
      failureStory({ ...base(15_648_000), reducedList: beamEvents }),
    );
    const many = Array.from({ length: 13 }, (_, i) => ({ signal: "REQUEST", value: 0 as const, cycle: (i + 1) * 16_000, gremlinId: "masher" }));
    const plain = failureStory({ ...base(15_648_000), reducedList: many });
    expect(plain).toBe(`In the smallest replay this reducer found, masher acted on REQUEST 13 times from 1.0 ms to 13.0 ms. ${tail}`);
    expect(failureStory({ ...base(15_648_000), reducedList: many, labels: { REQUEST: { active: "pushed it", inactive: "let it go" } } })).toBe(plain);
  });
});

describe("malformed labels (Requirement 11.6, 11.7, 11.10)", () => {
  const ok = { active: "blocked the beam", inactive: "cleared the beam" };
  const bad: [string, unknown][] = [
    ["null", null],
    ["an array", [ok]],
    ["a number", 5],
    ["a string", "labels"],
    ["an entry that is null", { BEAM_CLEAR: null }],
    ["an entry that is an array", { BEAM_CLEAR: ["a", "b"] }],
    ["an entry without active", { BEAM_CLEAR: { inactive: "b" } }],
    ["an entry without inactive", { BEAM_CLEAR: { active: "a" } }],
    ["active not a string", { BEAM_CLEAR: { active: 3, inactive: "b" } }],
    ["active empty", { BEAM_CLEAR: { active: "", inactive: "b" } }],
    ["inactive with a line break", { BEAM_CLEAR: { active: "a", inactive: "b\nc" } }],
    ["active with U+2028", { BEAM_CLEAR: { active: "a\u2028b", inactive: "b" } }],
    ["a leading space", { BEAM_CLEAR: { active: " a", inactive: "b" } }],
    ["a trailing space", { BEAM_CLEAR: { active: "a", inactive: "b " } }],
    ["a banned word in another case", { BEAM_CLEAR: { active: "made it SAFE", inactive: "b" } }],
    ["the word smallest", { BEAM_CLEAR: { active: "a", inactive: "the Smallest push" } }],
    ["a bad entry for a signal with no event", { BEAM_CLEAR: ok, UP: { active: "", inactive: "b" } }],
    ["an object that throws when read", new Proxy({}, { ownKeys: () => { throw new Error("no"); } })],
  ];
  for (const [name, labels] of bad) {
    it(`rejects ${name}`, () => {
      let out: unknown;
      expect(() => { out = failureStory({ ...base(15_648_000), reducedList: [], labels }); }).not.toThrow();
      expect(out).toMatchObject({ kind: "invalid-input", field: "labels" });
    });
  }
  it("accepts an absent or undefined labels field", () => {
    expect(failureStory({ ...base(1), labels: undefined })).toBe(failureStory(base(1)));
  });
});

// Feature: honest-verdicts, Property 7: the story with labels matches the reference renderer.
describe("Property 7: labelled stories match refStory", () => {
  it("matches for generated cases with labels on some digital signals", () => {
    const words = ["blocked the beam", "cleared the beam", "pushed it", "let it go", "tapped"];
    const arb = arbStoryCase.chain((c) => {
      const digital = c.fixture.pins.filter((p) => !("kind" in p && p.kind === "analog")).map((p) => p.signal);
      return fc
        .subarray(digital)
        .chain((sigs) => fc.tuple(...sigs.map(() => fc.record({ active: fc.constantFrom(...words), inactive: fc.constantFrom(...words) }))).map((ls) => ({ sigs, ls })))
        .map(({ sigs, ls }) => ({ ...c, labels: Object.fromEntries(sigs.map((s, i) => [s, ls[i]])) }));
    });
    let labelled = 0;
    fc.assert(
      fc.property(arb, (c) => {
        const ref = refStory(c);
        const out = failureStory(c);
        if (ref === "does-not-fit") {
          expect(out).toMatchObject({ kind: "invalid-input", field: "reducedList" });
          return;
        }
        expect(out).toBe(ref.text);
        if (Object.values(c.labels).some((l) => (out as string).includes(` ${l.active} `) || (out as string).includes(` ${l.inactive} `))) labelled++;
      }),
      { seed: 20261117, numRuns: 300 },
    );
    expect(labelled).toBeGreaterThan(0);
  }, 60_000);
});
describe("labels with a held text", () => {
  const WALK_LABEL = { active: "pressed the walk button", inactive: "let go of the walk button", held: "pressed and held the walk button" };
  const tail = `At 978.0 ms (cycle 15,648,000), the program broke this rule: ${RULE}`;
  const press = (cycle: number) => ({ signal: "REQUEST", value: 0 as const, cycle, gremlinId: "masher" });
  const release = (cycle: number) => ({ signal: "REQUEST", value: "release" as const, cycle, gremlinId: "masher" });

  it("uses the held text for a press with no later release", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: [press(10_544_000)], labels: { REQUEST: WALK_LABEL } })).toBe(
      `In the smallest replay this reducer found, masher pressed and held the walk button at 659.0 ms. ${tail}`,
    );
  });

  it("keeps <active> and held when no held text is given", () => {
    const { held: _h, ...noHeld } = WALK_LABEL;
    expect(failureStory({ ...base(15_648_000), reducedList: [press(10_544_000)], labels: { REQUEST: noHeld } })).toBe(
      `In the smallest replay this reducer found, masher pressed the walk button and held at 659.0 ms. ${tail}`,
    );
  });

  it("uses active, not held, for a press that is released later", () => {
    expect(failureStory({ ...base(15_648_000), reducedList: [press(10_544_000), release(10_560_000)], labels: { REQUEST: WALK_LABEL } })).toBe(
      `In the smallest replay this reducer found, masher pressed the walk button at 659.0 ms and masher let go of the walk button at 660.0 ms. ${tail}`,
    );
  });

  const badHeld: [string, unknown][] = [
    ["a held that is not a string", 7],
    ["an empty held", ""],
    ["a held with a line break", "held\nit"],
    ["a held with a leading space", " held it"],
    ["a held with a trailing space", "held it "],
    ["a held with a banned word", "held it, Guaranteed"],
    ["a held with the word smallest", "the smallest hold"],
  ];
  for (const [name, held] of badHeld) {
    it(`rejects ${name}`, () => {
      let out: unknown;
      const labels = { REQUEST: { active: "pressed it", inactive: "let it go", held } };
      expect(() => { out = failureStory({ ...base(15_648_000), reducedList: [press(10_544_000)], labels }); }).not.toThrow();
      expect(out).toMatchObject({ kind: "invalid-input", field: "labels" });
    });
  }
});