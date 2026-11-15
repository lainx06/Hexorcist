// Feature: trace-reducer. Exact Failure_Story texts. Evidence, not proof.
import { describe, expect, it } from "vitest";
import { failureStory, msText } from "../reducer/story";
import type { Fixture } from "../types";

const F: Fixture = {
  pins: [
    { signal: "REQUEST", port: "D", bit: 2, direction: "input", activeLevel: "low" },
    { signal: "UP", port: "D", bit: 3, direction: "input", activeLevel: "high" },
    { signal: "POT", kind: "analog", channel: 0 },
    { signal: "WALK", port: "B", bit: 3, direction: "output" },
  ],
};
const RULE = "all of (CAR_GREEN is 1, WALK is 1) must never happen.";
const V = { rule: RULE, cycle: 15_648_000 };

describe("trace-reducer failure story texts", () => {
  it("msText examples", () => {
    expect(msText(0)).toBe("0.0 ms");
    expect(msText(799)).toBe("0.0 ms");
    expect(msText(800)).toBe("0.1 ms");
    expect(msText(24_000)).toBe("1.5 ms");
    expect(msText(15_647_543)).toBe("978.0 ms");
  });

  it("press and release (the design's crosswalk-like example)", () => {
    const text = failureStory({
      reducedList: [
        { signal: "REQUEST", value: 0, cycle: 12_262_400, gremlinId: "masher" },
        { signal: "REQUEST", value: "release", cycle: 12_499_200, gremlinId: "masher" },
      ],
      fixture: F,
      violation: { rule: RULE, cycle: 15_648_000 },
      outputEdges: [],
    });
    expect(text).toBe(
      "In the smallest replay this reducer found, masher pressed REQUEST at 766.4 ms and masher released REQUEST at 781.2 ms. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen.",
    );
  });

  it("drove and set", () => {
    const text = failureStory({
      reducedList: [
        { signal: "REQUEST", value: 1, cycle: 16_000, gremlinId: "g0" },
        { signal: "UP", value: 0, cycle: 32_000, gremlinId: "g0" },
        { signal: "POT", analog: 1023, cycle: 48_000, gremlinId: "noise" },
      ],
      fixture: F,
      violation: V,
      outputEdges: [],
    });
    expect(text).toBe(
      "In the smallest replay this reducer found, g0 drove REQUEST to 1 at 1.0 ms and g0 drove UP to 0 at 2.0 ms. Then noise set POT to 1023 at 3.0 ms. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen.",
    );
  });

  it("no gremlin event, with a span that was not cut and one that was", () => {
    const base = { reducedList: [{ signal: "UP", value: 1, cycle: 0, gremlinId: "rest" }], fixture: F, violation: V, outputEdges: [] };
    expect(failureStory({ ...base, violationSpan: { lengthCycles: 9_600_000, cut: false } })).toBe(
      "In the smallest replay this reducer found, no gremlin event was needed. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen. The rule stayed broken for 600.0 ms.",
    );
    expect(failureStory({ ...base, violationSpan: { lengthCycles: 9_600_000, cut: true } })).toBe(
      "In the smallest replay this reducer found, no gremlin event was needed. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen. The rule stayed broken for at least 600.0 ms.",
    );
  });

  it("Detailed_Form over two sentences with Then", () => {
    const evs = [1, 2, 3, 4].map((i) => ({ signal: "REQUEST", value: i % 2 === 1 ? (0 as const) : ("release" as const), cycle: i * 16_000, gremlinId: "m" }));
    expect(failureStory({ reducedList: evs, fixture: F, violation: V, outputEdges: [] })).toBe(
      "In the smallest replay this reducer found, m pressed REQUEST at 1.0 ms, m released REQUEST at 2.0 ms, and m pressed REQUEST at 3.0 ms. Then m released REQUEST at 4.0 ms. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen.",
    );
  });

  it("falls back to the Summary_Form, single and multi", () => {
    const evs = Array.from({ length: 13 }, (_, i) => ({ signal: "REQUEST", value: 0 as const, cycle: (i + 1) * 16_000, gremlinId: "masher" }));
    evs.push({ signal: "UP", value: 1 as unknown as 0, cycle: 400_000, gremlinId: "stuck" });
    expect(failureStory({ reducedList: evs, fixture: F, violation: V, outputEdges: [], violationSpan: { lengthCycles: 16_000, cut: false } })).toBe(
      "In the smallest replay this reducer found, masher acted on REQUEST 13 times from 1.0 ms to 13.0 ms and stuck acted on UP 1 time at 25.0 ms. At 978.0 ms, the chip broke this rule: all of (CAR_GREEN is 1, WALK is 1) must never happen. The rule stayed broken for 1.0 ms.",
    );
  });

  it("returns invalid-input when even the Summary_Form does not fit", () => {
    const long = (n: number) => `${"w ".repeat(24)}n${n}`;
    const evs = [0, 1, 2, 3].map((i) => ({ signal: "REQUEST", value: 0 as const, cycle: i * 100, gremlinId: long(i) }));
    const out = failureStory({ reducedList: evs, fixture: F, violation: V, outputEdges: [] });
    expect(out).toStrictEqual({
      kind: "invalid-input",
      message: "Field reducedList: the story does not fit in 4 sentences of at most 30 words.",
      field: "reducedList",
    });
  });
});