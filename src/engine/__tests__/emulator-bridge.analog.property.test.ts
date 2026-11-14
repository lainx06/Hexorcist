import { describe, expect, it } from "vitest";
import fc from "fast-check";
/// <reference types="node" />
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validateFixture, validateEvents, isAnalogPin } from "../fixture.js";
import { EmulatorBridge, isBridgeError } from "../emulator-bridge.js";
import type { Fixture, FixturePin, ScheduledInput } from "../types.js";
import { arbFixture, arbSharedPinFixture } from "./arbitraries.js";

describe("Generated fixtures are valid", () => {
  // Feature: gremlin-engine, Property 27: Generated fixtures are valid
  // Validates: Requirements 2.10, 2.12
  it("Property 27: validateFixture accepts every arbFixture output", () => {
    fc.assert(
      fc.property(arbFixture, (fixture) => {
        expect(validateFixture(fixture)).toBeNull();
      }),
      { numRuns: 200, seed: 2704042701 },
    );
  });

  // Feature: gremlin-engine, Property 27: Generated fixtures are valid
  // Validates: Requirements 2.12
  it("Property 27: no analog channel N shares a pin with a digital pin on port C bit N", () => {
    fc.assert(
      fc.property(arbFixture, (fixture) => {
        const channels = new Set<number>();
        for (const pin of fixture.pins) {
          if (isAnalogPin(pin)) channels.add(pin.channel);
        }
        for (const pin of fixture.pins) {
          if (isAnalogPin(pin)) continue;
          if (pin.port === "C") expect(channels.has(pin.bit)).toBe(false);
        }
        // Signals are distinct.
        const signals = fixture.pins.map((p) => p.signal);
        expect(new Set(signals).size).toBe(signals.length);
      }),
      { numRuns: 200, seed: 2704042702 },
    );
  });
});

// ── Property 26: invalid fixtures and events are rejected before execution ──
// No CPU run. validateFixture/validateEvents are checked directly. create() is also
// called with a real HEX: a rejection returns a BridgeError instead of a bridge, so no
// CPU exists, no cycle runs, and no cycleCount can move. The "cycleCount stays 0" clause
// is covered by that: there is no bridge object to advance.

const HEX_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/blink_button/build/blink_button.ino.hex",
);
const HEX = readFileSync(HEX_PATH, "utf-8");

/** create() must return the same error as the validator, and never a bridge. */
function expectCreateRejects(fixture: Fixture, events: ScheduledInput[], kind: string) {
  const result = EmulatorBridge.create(HEX, fixture, events);
  expect(isBridgeError(result)).toBe(true);
  if (isBridgeError(result)) expect(result.kind).toBe(kind);
}

const arbBadChannel = fc.oneof(
  fc.integer({ min: 6, max: 1000 }),
  fc.integer({ min: -1000, max: -1 }),
  fc.constantFrom(0.5, 2.5, NaN, Infinity, -Infinity),
);
const arbBadRestLevel = fc.oneof(
  fc.integer({ min: 1024, max: 100000 }),
  fc.integer({ min: -100000, max: -1 }),
  fc.constantFrom(0.5, 1023.5, NaN, Infinity),
);
const arbBadAnalogValue = fc.oneof(
  fc.integer({ min: 1024, max: 100000 }),
  fc.integer({ min: -100000, max: -1 }),
  fc.constantFrom(0.5, 511.5, NaN, Infinity, -Infinity),
);
const arbBadString = fc
  .string({ maxLength: 8 })
  .filter((s) => s !== "low" && s !== "high" && s !== "released" && s !== "active");

const arbCh = fc.integer({ min: 0, max: 5 });
const arbRest = fc.option(fc.integer({ min: 0, max: 1023 }), { nil: undefined });

describe("Invalid fixtures and events are rejected before execution", () => {
  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 2.7, 2.8
  it("Property 26: duplicate analog channel gives invalid-fixture naming the signal", () => {
    fc.assert(
      fc.property(arbCh, arbRest, (channel, restLevel) => {
        const first: FixturePin = { signal: "FIRST", kind: "analog", channel };
        const second: FixturePin = { signal: "SECOND", kind: "analog", channel, restLevel };
        const fixture: Fixture = { pins: [first, second] };
        const err = validateFixture(fixture);
        expect(err?.kind).toBe("invalid-fixture");
        expect(err && "signal" in err ? err.signal : undefined).toBe("SECOND");
        expect(err?.message).toContain("SECOND");
        expectCreateRejects(fixture, [], "invalid-fixture");
      }),
      { numRuns: 200, seed: 2704042703 },
    );
  });

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 2.7, 2.8
  it("Property 26: out-of-range channel or restLevel gives invalid-fixture naming the signal", () => {
    fc.assert(
      fc.property(arbBadChannel, arbBadRestLevel, arbCh, (badChannel, badRest, goodChannel) => {
        const badCh: Fixture = {
          pins: [{ signal: "BAD_CH", kind: "analog", channel: badChannel }],
        };
        const badRl: Fixture = {
          pins: [{ signal: "BAD_RL", kind: "analog", channel: goodChannel, restLevel: badRest }],
        };
        for (const [fixture, name] of [[badCh, "BAD_CH"], [badRl, "BAD_RL"]] as const) {
          const err = validateFixture(fixture);
          expect(err?.kind).toBe("invalid-fixture");
          expect(err && "signal" in err ? err.signal : undefined).toBe(name);
          expect(err?.message).toContain(name);
          expectCreateRejects(fixture, [], "invalid-fixture");
        }
      }),
      { numRuns: 200, seed: 2704042704 },
    );
  });

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 2.7, 2.9
  it("Property 26: bad activeLevel or restState gives invalid-fixture naming the signal", () => {
    fc.assert(
      fc.property(arbBadString, arbBadString, (badLevel, badRest) => {
        const a: Fixture = {
          pins: [
            {
              signal: "BAD_AL",
              port: "B",
              bit: 0,
              direction: "input",
              activeLevel: badLevel as unknown as "low",
            },
          ],
        };
        const r: Fixture = {
          pins: [
            {
              signal: "BAD_RS",
              port: "B",
              bit: 1,
              direction: "input",
              restState: badRest as unknown as "released",
            },
          ],
        };
        for (const [fixture, name] of [[a, "BAD_AL"], [r, "BAD_RS"]] as const) {
          const err = validateFixture(fixture);
          expect(err?.kind).toBe("invalid-fixture");
          expect(err && "signal" in err ? err.signal : undefined).toBe(name);
          expect(err?.message).toContain(name);
          expectCreateRejects(fixture, [], "invalid-fixture");
        }
      }),
      { numRuns: 200, seed: 2704042705 },
    );
  });

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 2.9
  it("Property 26: activeLevel or restState on an output pin or an analog pin gives invalid-fixture", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("low", "high"),
        fc.constantFrom("released", "active"),
        arbCh,
        (level, rest, channel) => {
          const fixtures: [Fixture, string][] = [
            [
              { pins: [{ signal: "OUT_AL", port: "B", bit: 0, direction: "output", activeLevel: level as "low" }] },
              "OUT_AL",
            ],
            [
              { pins: [{ signal: "OUT_RS", port: "B", bit: 0, direction: "output", restState: rest as "released" }] },
              "OUT_RS",
            ],
            [
              {
                pins: [
                  { signal: "AN_AL", kind: "analog", channel, activeLevel: level } as unknown as FixturePin,
                ],
              },
              "AN_AL",
            ],
            [
              {
                pins: [
                  { signal: "AN_RS", kind: "analog", channel, restState: rest } as unknown as FixturePin,
                ],
              },
              "AN_RS",
            ],
          ];
          for (const [fixture, name] of fixtures) {
            const err = validateFixture(fixture);
            expect(err?.kind).toBe("invalid-fixture");
            expect(err && "signal" in err ? err.signal : undefined).toBe(name);
            expect(err?.message).toContain(name);
            expectCreateRejects(fixture, [], "invalid-fixture");
          }
        },
      ),
      { numRuns: 200, seed: 2704042706 },
    );
  });

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 2.10, 2.12
  it("Property 26: arbSharedPinFixture gives invalid-fixture with both signal names", () => {
    fc.assert(
      fc.property(arbSharedPinFixture, ({ fixture, analogSignal, digitalSignal }) => {
        const err = validateFixture(fixture);
        expect(err?.kind).toBe("invalid-fixture");
        expect(err?.message).toContain(analogSignal);
        expect(err?.message).toContain(digitalSignal);
        expectCreateRejects(fixture, [], "invalid-fixture");
      }),
      { numRuns: 200, seed: 2704042707 },
    );
  });

  const eventFixture: Fixture = {
    pins: [
      { signal: "POT", kind: "analog", channel: 0 },
      { signal: "BTN", port: "B", bit: 0, direction: "input" },
    ],
  };

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 3.4, 3.14
  it("Property 26: bad analog values give invalid-analog-value", () => {
    fc.assert(
      fc.property(arbBadAnalogValue, fc.nat({ max: 1_000_000 }), (analog, cycle) => {
        const events: ScheduledInput[] = [{ signal: "POT", analog, cycle }];
        const err = validateEvents(eventFixture, events);
        expect(err?.kind).toBe("invalid-analog-value");
        expect(err && "signal" in err ? err.signal : undefined).toBe("POT");
        expectCreateRejects(eventFixture, events, "invalid-analog-value");
      }),
      { numRuns: 200, seed: 2704042708 },
    );
  });

  // Feature: gremlin-engine, Property 26: Invalid fixtures and events are rejected before execution
  // Validates: Requirements 3.4, 3.14
  it("Property 26: kind mismatches give pin-kind-mismatch", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1023 }),
        fc.constantFrom<0 | 1 | "release">(0, 1, "release"),
        fc.nat({ max: 1_000_000 }),
        (analog, value, cycle) => {
          const analogOnDigital: ScheduledInput[] = [{ signal: "BTN", analog, cycle }];
          const digitalOnAnalog: ScheduledInput[] = [{ signal: "POT", value, cycle }];
          for (const [events, name] of [[analogOnDigital, "BTN"], [digitalOnAnalog, "POT"]] as const) {
            const err = validateEvents(eventFixture, events);
            expect(err?.kind).toBe("pin-kind-mismatch");
            expect(err && "signal" in err ? err.signal : undefined).toBe(name);
            expectCreateRejects(eventFixture, [...events], "pin-kind-mismatch");
          }
        },
      ),
      { numRuns: 200, seed: 2704042709 },
    );
  });
});

// ── Property 25: bridge ignores gremlinId ──
// Emulator property: each case runs blink_button plus a POT pin twice on the real bridge,
// once with gremlinId on the events and once with it removed.

const GREMLIN_FIXTURE: Fixture = {
  pins: [
    { signal: "BUTTON", port: "D", bit: 2, direction: "input" },
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "POT", kind: "analog", channel: 0 },
  ],
};

const MAX_RUN_CYCLES = 200_000;

const arbTaggedEvent = fc.oneof(
  fc.record({
    signal: fc.constant("BUTTON"),
    value: fc.constantFrom<0 | 1 | "release">(0, 1, "release"),
    cycle: fc.integer({ min: 0, max: MAX_RUN_CYCLES }),
  }),
  fc.record({
    signal: fc.constant("POT"),
    analog: fc.integer({ min: 0, max: 1023 }),
    cycle: fc.integer({ min: 0, max: MAX_RUN_CYCLES }),
  }),
);

const arbGremlinRun = fc.record({
  events: fc.array(arbTaggedEvent, { maxLength: 8 }),
  runCycles: fc.integer({ min: 1, max: MAX_RUN_CYCLES }),
});

describe("Bridge ignores gremlinId", () => {
  // Feature: gremlin-engine, Property 25: Bridge ignores gremlinId
  // Validates: Requirements 3.11
  it(
    "Property 25: same output events and diagnostics with and without gremlinId; applied entries keep the original gremlinId",
    () => {
      fc.assert(
        fc.property(arbGremlinRun, ({ events, runCycles }) => {
          const tagged: ScheduledInput[] = events.map((e, i) => ({ ...e, gremlinId: `g${i}` }));
          const bare: ScheduledInput[] = events.map((e) => ({ ...e }));

          const withBridge = EmulatorBridge.create(HEX, GREMLIN_FIXTURE, tagged);
          const withoutBridge = EmulatorBridge.create(HEX, GREMLIN_FIXTURE, bare);
          if (isBridgeError(withBridge) || isBridgeError(withoutBridge)) {
            throw new Error("create() rejected a valid fixture and event list");
          }
          const a = withBridge.advance(runCycles);
          const b = withoutBridge.advance(runCycles);
          if (isBridgeError(a) || isBridgeError(b)) throw new Error("advance() returned an error");

          expect(a.outputEvents).toEqual(b.outputEvents);
          expect(a.diagnostics).toEqual(b.diagnostics);
          expect(a.cyclesConsumed).toBe(b.cyclesConsumed);
          expect(a.appliedInputs.length).toBe(b.appliedInputs.length);
          expect(a.appliedAnalogInputs.length).toBe(b.appliedAnalogInputs.length);

          // Every applied entry carries the original gremlinId; the bare run carries none.
          const applied = [...a.appliedInputs, ...a.appliedAnalogInputs];
          for (const entry of applied) {
            expect(entry.gremlinId).toMatch(/^g\d+$/);
            const original = tagged[Number(entry.gremlinId!.slice(1))];
            expect(entry.signal).toBe(original.signal);
            expect(entry.cycle).toBe(original.cycle);
          }
          for (const entry of [...b.appliedInputs, ...b.appliedAnalogInputs]) {
            expect("gremlinId" in entry).toBe(false);
          }
        }),
        { numRuns: 20, seed: 2704042710 },
      );
    },
    60_000,
  );
});
