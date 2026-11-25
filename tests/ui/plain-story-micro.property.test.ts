// Feature: upload-samples. The microsecond sentence and plainMs near the 0.5 ms line. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Fixture } from "../../src/engine/types";
import { plainMs, plainStory } from "../../src/ui/app/model/plain-story";

const FIXTURE: Fixture = { pins: [{ signal: "REQUEST", port: "D", bit: 0, direction: "input", activeLevel: "low" }] };
const LIST: ReducerEvent[] = [{ cycle: 100, signal: "REQUEST", gremlinId: "masher", value: 0 } as ReducerEvent];
const ENDING = "it broke.";
const TEMPLATE = "It stayed that way for another <Plain_Ms>.";

/** The sentence plainStory appends for a span (the story's last sentence). */
function spanSentenceOf(lengthCycles: number, cut: boolean): string {
  const text = plainStory({
    reducedList: LIST,
    fixture: FIXTURE,
    v: 200,
    storyEnding: ENDING,
    spanSentence: TEMPLATE,
    span: { lengthCycles, cut },
  });
  const head = plainStory({ reducedList: LIST, fixture: FIXTURE, v: 200, storyEnding: ENDING, spanSentence: TEMPLATE });
  expect(text.startsWith(`${head} `)).toBe(true);
  return text.slice(head.length + 1);
}

/** Reference written from Requirements 4.1 to 4.3: cycles / 16 microseconds, one decimal, rounded half up. */
function refMicroseconds(cycles: number): string {
  const tenths = Math.round((cycles * 10) / 16);
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

describe("Microsecond sentence", () => {
  it("Property 1: Microsecond sentence matches the cycles/16 formula", () => {
    // Feature: upload-samples, Property 1: Microsecond sentence matches the cycles/16 formula
    // **Validates: Requirements 4.1, 4.2, 4.3**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 7999 }), (cycles) => {
        const s = spanSentenceOf(cycles, false);
        expect(s).toBe(`It lasted ${refMicroseconds(cycles)} microseconds, too short to round to a whole millisecond.`);
        expect(s).toMatch(/^It lasted \d+\.\d microseconds, /);
        expect(Math.abs(Number(refMicroseconds(cycles)) - cycles / 16)).toBeLessThanOrEqual(0.05 + 1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it("78 cycles gives 4.9 microseconds", () => {
    // **Validates: Requirements 4.3**
    expect(spanSentenceOf(78, false)).toBe("It lasted 4.9 microseconds, too short to round to a whole millisecond.");
  });
});

describe("plainMs at 8000 cycles or more", () => {
  it("Property 2: plainMs never renders '0 ms' at 8000 cycles or more", () => {
    // Feature: upload-samples, Property 2: plainMs never renders 0 ms at 8000 cycles or more
    // **Validates: Requirements 4.8**
    fc.assert(
      fc.property(fc.integer({ min: 8000, max: 4_000_000_000 }), (cycles) => {
        const s = plainMs(cycles);
        expect(s).not.toBe("0 ms");
        expect(s).toMatch(/^[1-9][\d,]* ms$/);
      }),
      { numRuns: 200 },
    );
    expect(plainMs(8000)).toBe("1 ms");
  });
});
