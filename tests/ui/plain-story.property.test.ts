// Feature: bench-ui-examples. Plain_Story_Builder and Plain_Ms. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { DigitalFixturePin, Fixture } from "../../src/engine/types";
import { PLAIN_STORY_LABELS } from "../../src/ui/app/model/labels";
import { plainMs, plainStory } from "../../src/ui/app/model/plain-story";

const SIGNALS = ["REQUEST", "CLOSE", "BEAM_CLEAR", "PULSE"] as const;
const GREMLINS = ["masher", "bouncer", "stuck", "dropout", "rest"] as const;
const NO_MOVE = "No gremlin move was needed: the program broke the rule on its own.";

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, ",");
const ms = (cycles: number): string => `${commas(Math.floor((cycles + 8000) / 16000))} ms`;

const caseArb = fc
  .record({
    levels: fc.array(fc.constantFrom<"low" | "high">("low", "high"), { minLength: 4, maxLength: 4 }),
    raw: fc.array(
      fc.record({
        gap: fc.integer({ min: 0, max: 400_000 }),
        sig: fc.integer({ min: 0, max: 3 }),
        value: fc.constantFrom<0 | 1 | "release">(0, 1, "release"),
        gremlin: fc.constantFrom(...GREMLINS),
      }),
      { maxLength: 8 },
    ),
    tail: fc.integer({ min: 0, max: 40_000_000 }),
    ending: fc.string({ minLength: 1, maxLength: 30 }),
    spanText: fc.constantFrom("It stayed that way for another <Plain_Ms>.", "Held <Plain_Ms>, twice <Plain_Ms>."),
    span: fc.option(fc.record({ lengthCycles: fc.integer({ min: 0, max: 40_000_000 }), cut: fc.boolean() }), {
      nil: undefined,
    }),
  })
  .map((c) => {
    const pins: DigitalFixturePin[] = SIGNALS.map((signal, i) => ({
      signal,
      port: "D",
      bit: i as 0 | 1 | 2 | 3,
      direction: "input",
      activeLevel: c.levels[i],
    }));
    let cycle = 0;
    const list = c.raw.map((r): ReducerEvent => {
      cycle += r.gap;
      return { cycle, signal: SIGNALS[r.sig], gremlinId: r.gremlin, value: r.value } as ReducerEvent;
    });
    const fixture: Fixture = { pins };
    return { list, fixture, v: cycle + c.tail, ending: c.ending, spanText: c.spanText, span: c.span };
  });

/** Reference written from Requirements 11.3 to 11.10. */
function reference(c: { list: ReducerEvent[]; fixture: Fixture; v: number; ending: string; spanText: string; span?: { lengthCycles: number; cut: boolean } }): string {
  const g = c.list.filter((e) => e.gremlinId !== "rest");
  if (g.length === 0) return NO_MOVE;
  const phrases = g.map((e, i) => {
    const pin = c.fixture.pins.find((p) => p.signal === e.signal) as DigitalFixturePin;
    const press = pin.activeLevel === "high" ? 1 : 0;
    const isPress = "value" in e && e.value === press;
    const released = c.list.slice(c.list.indexOf(e) + 1).some((o) => o.signal === e.signal && "value" in o && o.value === "release");
    const kind = !isPress ? "inactive" : released ? "active" : "held";
    const label = PLAIN_STORY_LABELS[e.signal];
    return (i > 0 && g[i - 1].signal === e.signal ? label.short : label.full)[kind];
  });
  const joined =
    phrases.length === 1 ? phrases[0] : phrases.length === 2 ? `${phrases[0]}, then ${phrases[1]}` : `${phrases.slice(0, -1).join(", ")}, then ${phrases[phrases.length - 1]}`;
  const cycles = g.map((e) => e.cycle);
  const last = Math.max(...cycles);
  const within = g.length >= 2 ? `, all within ${ms(last - Math.min(...cycles))}` : "";
  const parts = [`${g.every((e) => e.gremlinId === g[0].gremlinId) ? "The gremlin" : "The gremlins"} ${joined}${within}.`, `${ms(c.v - last)} later, ${c.ending}`];
  if (c.span) {
    parts.push(
      c.span.cut
        ? `It was still that way ${ms(c.span.lengthCycles)} later, when the replay stopped.`
        : c.spanText.split("<Plain_Ms>").join(ms(c.span.lengthCycles)),
    );
  }
  return parts.join(" ");
}

describe("Plain_Story_Builder", () => {
  it("Property 1: Plain story follows the stated sentence rules", () => {
    // Feature: bench-ui-examples, Property 1: Plain story follows the stated sentence rules
    // **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 22.6**
    fc.assert(
      fc.property(caseArb, (c) => {
        const input = { reducedList: c.list, fixture: c.fixture, v: c.v, storyEnding: c.ending, spanSentence: c.spanText, span: c.span };
        const text = plainStory(input);
        expect(text).toBe(reference(c));
        expect(plainStory(input)).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  it("plainMs at 0, 7,999, 8,000, 16,000 and 16,000,000 cycles", () => {
    expect([0, 7999, 8000, 16000, 16_000_000].map(plainMs)).toEqual(["0 ms", "0 ms", "1 ms", "1 ms", "1,000 ms"]);
  });
});
