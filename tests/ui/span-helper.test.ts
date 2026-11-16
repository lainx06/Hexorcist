// Feature: bench-ui-core. Span_Helper against the tests/examples reference and the Crosswalk
// value. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Condition, Rule } from "../../src/engine/rules/ir";
import { spanFor } from "../../src/ui/app/model/span";
import {
  loadExample,
  readHex,
  replayEnd,
  replayRun,
  runExampleCampaign,
  violationSpan,
} from "../examples/examples-support";
import { edgesArb, SIGNALS } from "./arbitraries";

const leaf: fc.Arbitrary<Condition> = fc.oneof(
  fc.record({ op: fc.constant("eq" as const), signal: fc.constantFrom(...SIGNALS), value: fc.constantFrom(0 as const, 1 as const) }),
  fc.record({ op: fc.constant("above" as const), signal: fc.constantFrom(...SIGNALS), value: fc.integer({ min: 0, max: 1022 }) }),
);
const cond: fc.Arbitrary<Condition> = fc.oneof(
  { depthSize: "small" },
  leaf,
  fc.record({ op: fc.constantFrom("all" as const, "any" as const), of: fc.array(leaf, { minLength: 2, maxLength: 3 }) }),
);
const ruleArb: fc.Arbitrary<Rule> = fc.oneof(
  fc.record({ form: fc.constant("never" as const), condition: cond }),
  fc.record({ form: fc.constant("notLongerThan" as const), condition: cond, ms: fc.integer({ min: 1, max: 100 }) }),
  fc.record({
    form: fc.constant("respond" as const),
    trigger: fc.record({ op: fc.constantFrom("rise" as const, "fall" as const), of: cond }),
    withinMs: fc.integer({ min: 1, max: 100 }),
    expect: cond,
  }),
);

describe("Span_Helper", () => {
  it("Property 13: equals the tests/examples violationSpan reference", () => {
    // Feature: bench-ui-core, Property 13: Span_Helper equals the tests/examples reference
    fc.assert(
      fc.property(ruleArb, fc.integer({ min: 0, max: 200 }), edgesArb, fc.integer({ min: 0, max: 260 }), (rule, v, edges, extra) => {
        const M = v + extra;
        const ref = violationSpan(rule, v, edges, M);
        const got = spanFor(rule, v, edges, M);
        expect(got).not.toBeNull();
        expect(got!.lengthCycles).toBe(ref.spanCycles);
        expect(got!.cut).toBe(ref.cutByReplayEnd);
        expect(got!.end).toBe(ref.end);
      }),
      { seed: 1301, numRuns: 300 },
    );
  });

  it("gives null for count and hold rules", () => {
    const e = { op: "rise" as const, of: { op: "eq" as const, signal: "A", value: 1 as const } };
    expect(spanFor({ form: "count", edge: e, windowMs: 10, max: 1 }, 0, [], 10)).toBeNull();
    expect(spanFor({ form: "hold", after: e, durationMs: 10, expect: { op: "eq", signal: "A", value: 1 } }, 0, [], 10)).toBeNull();
  });

  it("Crosswalk: v = 15,647,543 and replayRun edges to M = 16,032,000 give 384,457 cycles, cut", { timeout: 600_000 }, () => {
    const ex = loadExample("crosswalk");
    const { result } = runExampleCampaign(ex, "buggy");
    if (result.verdict.verdict !== "BROKE") throw new Error(`expected BROKE, actual ${result.verdict.verdict}`);
    const trace = result.verdict.trace;
    expect(trace.violation.cycle, `expected v 15647543, actual ${trace.violation.cycle}`).toBe(15_647_543);
    const M = replayEnd(ex.meta);
    expect(M).toBe(16_032_000);
    const edges = replayRun(readHex("crosswalk", "buggy"), ex.fixture, trace.eventList, M);
    const span = spanFor(ex.ruleSet[0]!, trace.violation.cycle, edges, M);
    expect(span, "the span helper returned no span").not.toBeNull();
    expect(span!.lengthCycles, `expected 384457, actual ${span!.lengthCycles}`).toBe(384_457);
    expect(span!.cut, `expected cut true, actual ${String(span!.cut)}`).toBe(true);
  });
});