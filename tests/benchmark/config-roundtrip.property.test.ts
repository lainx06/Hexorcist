import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseLoopConfig } from "../../cli/input-loader";
import type { LoopConfig } from "../../cli/input-loader";
// @ts-ignore plain .mjs helper with no type declarations
import { validateConfig } from "../../exorcism-demo/try.mjs";

// Feature: benchmark-tools, Property 8: Check_Config JSON round trip
// Evidence over generated inputs, not a proof.

const KEYS = ["source", "build", "hex", "pins", "rules", "gremlins", "runs", "seed", "runMs"] as const;
const RUNS = { numRuns: 200 };

const configArb: fc.Arbitrary<LoopConfig> = fc.record({
  source: fc.string(),
  build: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
  hex: fc.string(),
  pins: fc.string(),
  rules: fc.string(),
  gremlins: fc.string(),
  runs: fc.integer(),
  seed: fc.integer(),
  runMs: fc.integer(),
});

// Values of the wrong type or shape for any key, including edge cases the two checks might treat differently.
const oddValueArb = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(1.5, -0.5, 1e21, 0, -0),
  fc.string(),
  fc.constant([]),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.array(fc.oneof(fc.string(), fc.integer(), fc.constant(null)), { maxLength: 3 }),
  fc.constant({}),
  fc.record({ a: fc.integer() }),
  fc.integer(),
);

/** A valid config, then zero or more keys removed or replaced by odd values. */
const mutatedArb = fc
  .tuple(
    configArb,
    fc.array(fc.tuple(fc.constantFrom(...KEYS), fc.boolean(), oddValueArb), { maxLength: 3 }),
  )
  .map(([cfg, edits]) => {
    const o: Record<string, unknown> = { ...cfg };
    for (const [key, remove, val] of edits) {
      if (remove) delete o[key];
      else o[key] = val;
    }
    return JSON.stringify(o);
  });

/** Texts that are not a config object at all. */
const nonObjectTextArb = fc.oneof(
  fc.string(),
  fc.constantFrom("", "null", "[]", "[1]", "42", '"x"', "true", "{", "\ufeff", "\ufeff{}"),
  fc.jsonValue().map((v) => JSON.stringify(v)),
);

describe("Feature: benchmark-tools, Property 8: Check_Config JSON round trip", () => {
  it("parseLoopConfig returns the same nine-key object that was stringified", () => {
    fc.assert(
      fc.property(configArb, (cfg) => {
        const r = parseLoopConfig(JSON.stringify(cfg));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.config).toEqual(cfg);
        expect(Object.keys(r.config).sort()).toEqual([...KEYS].sort());
      }),
      RUNS,
    );
  });

  it("a leading byte-order mark does not change the round trip", () => {
    fc.assert(
      fc.property(configArb, (cfg) => {
        const r = parseLoopConfig("\ufeff" + JSON.stringify(cfg));
        expect(r).toEqual({ ok: true, config: cfg });
      }),
      RUNS,
    );
  });

  it("validateConfig in try.mjs gives the same result as parseLoopConfig on valid configs", () => {
    fc.assert(
      fc.property(configArb, (cfg) => {
        const text = JSON.stringify(cfg);
        expect(validateConfig(text)).toEqual(parseLoopConfig(text));
      }),
      RUNS,
    );
  });

  it("validateConfig accepts and rejects exactly what parseLoopConfig does, with the same reason", () => {
    fc.assert(
      fc.property(fc.oneof(mutatedArb, nonObjectTextArb), (text) => {
        const a = parseLoopConfig(text);
        const b = validateConfig(text);
        expect(b.ok).toBe(a.ok);
        expect(b).toEqual(a);
      }),
      { numRuns: 500 },
    );
  });

  it("the mutated generator reaches both accepted and rejected configs", () => {
    const seen = { ok: 0, bad: 0 };
    fc.assert(
      fc.property(mutatedArb, (text) => {
        if (parseLoopConfig(text).ok) seen.ok++;
        else seen.bad++;
      }),
      RUNS,
    );
    expect(seen.ok).toBeGreaterThan(0);
    expect(seen.bad).toBeGreaterThan(0);
  });
});
