// Feature: trace-reducer. Property 16 and the runEventList error paths.
// Real bridge through runOne and through a verbatim copy of the pre-move runOne.
// Time is bridge cycleCount only. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEventList, runOne } from "../campaign";
import type { BridgeFactory, RunConfig } from "../campaign";
import type { Checker } from "../checker";
import { EmulatorBridge } from "../emulator-bridge";
import type { EmulatorBridgeInterface } from "../emulator-bridge";
import { buildEventList } from "../event-list";
import type { GremlinSpec } from "../gremlins/catalogue";
import type { Fixture, RunResult } from "../types";
import { arbGremlinSet, arbSeed } from "./arbitraries";
import { makeLevelTimeoutChecker } from "./led-level-checker";
import { referenceRunOne } from "./reducer-run-path.reference";

const HERE = dirname(fileURLToPath(import.meta.url));
const BLINK_HEX = readFileSync(resolve(HERE, "../../../fixtures/blink_button/build/blink_button.ino.hex"), "utf-8");
const FIXTURE: Fixture = {
  pins: [
    { signal: "BUTTON", port: "D", bit: 2, direction: "input" },
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "POT", kind: "analog", channel: 0 },
  ],
};

function config(
  c: { campaignSeed: number; gremlinSet: GremlinSpec[]; runCycles: number; maxStepCycles: number; limit: number },
  checker: Checker,
  bridgeFactory?: BridgeFactory,
): RunConfig {
  return {
    hex: BLINK_HEX,
    fixture: FIXTURE,
    gremlinSet: c.gremlinSet,
    campaignSeed: c.campaignSeed,
    checker,
    runCycles: c.runCycles,
    maxStepCycles: c.maxStepCycles,
    ...(bridgeFactory === undefined ? {} : { bridgeFactory }),
  };
}

describe("trace-reducer Run_Path move", () => {
  // Feature: trace-reducer, Property 16: runOne is unchanged by the Run_Path move
  it("Property 16: runOne equals the verbatim pre-move runOne", () => {
    let withViolation = 0;
    let withoutViolation = 0;
    fc.assert(
      fc.property(
        fc.record({
          campaignSeed: arbSeed,
          gremlinSet: arbGremlinSet,
          runCycles: fc.integer({ min: 30_000, max: 150_000 }),
          maxStepCycles: fc.integer({ min: 1_000, max: 160_000 }),
          limit: fc.integer({ min: 5_000, max: 200_000 }),
          runIndex: fc.integer({ min: 0, max: 3 }),
        }),
        (c) => {
          const opts = { signal: "LED", limitCycles: c.limit };
          const now = runOne(config(c, makeLevelTimeoutChecker(opts)), c.runIndex);
          const before = referenceRunOne(config(c, makeLevelTimeoutChecker(opts)), c.runIndex);
          expect(now).toStrictEqual(before);
          if ((now as RunResult).violation) withViolation++;
          else withoutViolation++;
        },
      ),
      { seed: 20261216, numRuns: 100 },
    );
    console.log(`Property 16 counters ${JSON.stringify({ withViolation, withoutViolation })}`);
    expect(withViolation).toBeGreaterThan(0);
    expect(withoutViolation).toBeGreaterThan(0);
  }, 300_000);

  const base = {
    campaignSeed: 7,
    gremlinSet: [{ id: "masher" }] as GremlinSpec[],
    runCycles: 60_000,
    maxStepCycles: 20_000,
    limit: 1_000_000,
  };
  const quiet: Checker = () => ({ violation: null });
  const events = () => {
    const g = buildEventList({ fixture: FIXTURE, gremlinSet: base.gremlinSet, runCycles: base.runCycles, campaignSeed: base.campaignSeed, runIndex: 0 });
    if ("kind" in g) throw new Error("event list failed");
    return g.events;
  };

  function wrap(over: (b: EmulatorBridgeInterface) => EmulatorBridgeInterface): BridgeFactory {
    return (hex, fixture, evs) => {
      const made = EmulatorBridge.create(hex, fixture, evs);
      if ("kind" in made) return made;
      return over(made);
    };
  }

  const cases: { name: string; factory: BridgeFactory; checker: Checker; kind: string }[] = [
    {
      name: "bridge creation error",
      factory: () => ({ kind: "invalid-hex", message: "fake creation error" }),
      checker: quiet,
      kind: "bridge-error",
    },
    {
      name: "advance error",
      factory: wrap((b) => ({
        get cycleCount() { return b.cycleCount; },
        advance: () => ({ kind: "cycle-overflow", cycleCount: b.cycleCount, message: "fake advance error" }),
      }) as unknown as EmulatorBridgeInterface),
      checker: quiet,
      kind: "bridge-error",
    },
    {
      name: "bridge that does not advance",
      factory: wrap((b) => ({
        get cycleCount() { return 0; },
        advance: () => ({ cyclesConsumed: 0, outputEvents: [], appliedInputs: [], appliedAnalogInputs: [], diagnostics: [] }),
      }) as unknown as EmulatorBridgeInterface),
      checker: quiet,
      kind: "internal-error",
    },
    {
      name: "throwing checker",
      factory: (hex, fixture, evs) => EmulatorBridge.create(hex, fixture, evs),
      checker: () => {
        throw new Error("fake checker failure");
      },
      kind: "checker-error",
    },
  ];

  for (const c of cases) {
    it(`runEventList error path: ${c.name} gives the error referenceRunOne gives`, () => {
      const cfg = config(base, c.checker, c.factory);
      const before = referenceRunOne(cfg, 0);
      const path = runEventList(cfg, events(), 0);
      const now = runOne(cfg, 0);
      expect((before as { kind?: string }).kind).toBe(c.kind);
      expect(path).toStrictEqual(before);
      expect(now).toStrictEqual(before);
    });
  }
});