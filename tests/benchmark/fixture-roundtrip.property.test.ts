import fc from "fast-check";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadInput } from "../../cli/input-loader";
import type { LoaderEnv } from "../../cli/input-loader";
import type { FixturePin } from "../../src/engine/types";

// Feature: benchmark-tools, Property 9: Pin fixture signal list is preserved through loading
// Evidence over generated inputs, not a proof.
// Validates: Requirements 10.4

const RUNS = { numRuns: 200 };

const signalArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,11}$/);

const digitalPinArb = (signal: string): fc.Arbitrary<FixturePin> =>
  fc.record({
    signal: fc.constant(signal),
    port: fc.constantFrom("B" as const, "C" as const, "D" as const),
    bit: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const, 4 as const, 5 as const, 6 as const, 7 as const),
    direction: fc.constantFrom("output" as const, "input" as const),
  });

const analogPinArb = (signal: string): fc.Arbitrary<FixturePin> =>
  fc.record({
    signal: fc.constant(signal),
    kind: fc.constant("analog" as const),
    channel: fc.integer({ min: 0, max: 5 }),
    restLevel: fc.integer({ min: 0, max: 1023 }),
  });

/** Pins with unique signal names, mixing digital and analog records. */
const pinsArb: fc.Arbitrary<FixturePin[]> = fc
  .uniqueArray(signalArb, { minLength: 0, maxLength: 8 })
  .chain((names) =>
    fc.tuple(...names.map((n) => fc.oneof(digitalPinArb(n), analogPinArb(n)))) as fc.Arbitrary<FixturePin[]>,
  );

describe("Feature: benchmark-tools, Property 9: Pin fixture signal list is preserved through loading", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-p9-"));
    fs.writeFileSync(path.join(dir, "a.hex"), ":00000001FF\n");
    fs.writeFileSync(path.join(dir, "rules.txt"), "HEARTBEAT is 0 must never last 600 ms or longer.\n");
  });
  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const env = (): LoaderEnv => ({
    readText: (p) => fs.readFileSync(p, "utf8"),
    invocationDir: dir,
    repoDir: process.cwd(),
  });

  it("loadInput returns fixture.pins with the same signal names in the same order", () => {
    fc.assert(
      fc.property(pinsArb, fc.option(fc.constantFrom(8_000_000, 16_000_000), { nil: undefined }), (pins, clockHz) => {
        const fixture = clockHz === undefined ? { pins } : { clockHz, pins };
        fs.writeFileSync(path.join(dir, "pins.json"), JSON.stringify(fixture));
        const r = loadInput(
          { hex: "a.hex", pins: "pins.json", rules: "rules.txt", gremlins: "stuck" },
          env(),
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.input.fixture.pins.map((p) => p.signal)).toEqual(pins.map((p) => p.signal));
      }),
      RUNS,
    );
  });
});
