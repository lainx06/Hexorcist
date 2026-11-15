// Feature: trace-reducer. Property 10: invalid Reduction_Inputs are rejected in the fixed order.
// Creates no bridge: the bridgeFactory seam counts creations. Evidence, not proof.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BridgeFactory } from "../campaign";
import { createReducerCore } from "../reducer/core";
import { createReducer } from "../reducer/reducer";
import type { ReducerError } from "../reducer/types";
import type { RuleSet } from "../rules/ir";
import { arbFixture, arbRandomList } from "./reducer-arbitraries";

const HERE = dirname(fileURLToPath(import.meta.url));
const HEX = readFileSync(resolve(HERE, "../../../examples/crosswalk/buggy/buggy.hex"), "utf-8");
const RULES: RuleSet = [
  { form: "never", condition: { op: "eq", signal: "OUT", value: 1 } },
  { form: "never", condition: { op: "eq", signal: "OUT", value: 0 } },
] as RuleSet;
const SENTENCE = "OUT is 1 must never happen.";

type Field = "hex" | "fixture" | "ruleSet" | "originalList" | "violation" | "runCycles" | "maxStepCycles" | "budget";
const ORDER: Field[] = ["hex", "fixture", "ruleSet", "originalList", "violation", "runCycles", "maxStepCycles", "budget"];
const BAD: Record<Field, unknown> = {
  hex: 5,
  fixture: null,
  ruleSet: () => 1, // structuredClone of a function throws
  originalList: {},
  violation: { rule: 5, cycle: 1 },
  runCycles: 0,
  maxStepCycles: null,
  budget: 1.5,
};

describe("trace-reducer input checks", () => {
  // Feature: trace-reducer, Property 10: Invalid Reduction_Inputs are rejected in the fixed order, without throwing
  it("Property 10: invalid inputs give the earliest failing check, no oracle call and no bridge", () => {
    let created = 0;
    const factory: BridgeFactory = () => {
      created++;
      return { kind: "invalid-hex", message: "counting factory" };
    };
    fc.assert(
      fc.property(
        arbFixture.chain((f) => fc.tuple(fc.constant(f), arbRandomList(f))),
        fc.oneof(
          fc.anything().map((x) => ({ whole: x as unknown })),
          fc.record({
            bad: fc.subarray(ORDER),
            getters: fc.subarray(ORDER, { maxLength: 2 }),
            noCompile: fc.boolean(),
            events: fc.array(fc.tuple(fc.nat(), fc.constantFrom("cycle", "signal", "value", "key")), { maxLength: 3 }),
            noRule: fc.boolean(),
          }),
        ),
        ([fixture, list], plan) => {
          const before = created;
          if ("whole" in plan) {
            let out: unknown;
            expect(() => {
              out = createReducer(plan.whole, { bridgeFactory: factory });
            }).not.toThrow();
            expect(created).toBe(before);
            if (typeof out === "object" && out !== null && "step" in out) return; // a valid input by chance
            expect((out as ReducerError).kind).toBe("invalid-input");
            return;
          }
          const input: Record<string, unknown> = {
            hex: HEX,
            fixture,
            ruleSet: plan.noCompile ? [] : RULES,
            originalList: list.map((e) => ({ ...e })),
            violation: { rule: plan.noRule ? "IN is 1 must never happen." : SENTENCE, cycle: 3 },
            runCycles: 3_000_000,
          };
          const evs = input.originalList as Record<string, unknown>[];
          let lowestEvent = Infinity;
          for (const [at, what] of plan.events) {
            if (evs.length === 0) break;
            const i = at % evs.length;
            if (what === "cycle") evs[i].cycle = -1;
            if (what === "signal") evs[i].signal = "OUT";
            if (what === "value") {
              if ("analog" in evs[i]) evs[i].analog = 4000;
              else evs[i].value = 9;
            }
            if (what === "key") evs[i].extra = 1;
            lowestEvent = Math.min(lowestEvent, i);
          }
          for (const f of plan.bad) input[f] = BAD[f];
          for (const f of plan.getters) {
            Object.defineProperty(input, f, {
              enumerable: true,
              get() {
                throw new Error("throwing getter");
              },
            });
          }
          // Expected: the earliest failing check of Requirement 1.9.
          const failing = ORDER.filter((f) => plan.bad.includes(f) || plan.getters.includes(f));
          let want: { field: string; index?: number } | null = null;
          if (failing.length > 0) want = { field: failing[0] };
          else if (plan.noCompile) want = { field: "ruleSet" };
          else if (lowestEvent !== Infinity) want = { field: "*", index: lowestEvent };
          else if (plan.noRule) want = { field: "violation" };

          let out: unknown;
          expect(() => {
            out = createReducer(input, { bridgeFactory: factory });
          }).not.toThrow();
          expect(created).toBe(before);
          if (want === null) {
            expect(typeof out === "object" && out !== null && "step" in out).toBe(true);
            return;
          }
          const e = out as ReducerError;
          expect(e.kind).toBe("invalid-input");
          if (want.field !== "*") expect(e.field).toBe(want.field);
          if (want.index !== undefined) expect(e.index).toBe(want.index);
          if (want.field === "ruleSet" && plan.noCompile && failing.length === 0) expect((e.reasons ?? []).length).toBeGreaterThan(0);

          // The same corruptions at the core: oracle, sentence, budget, fixture, originalList, events.
          let calls = 0;
          const core = createReducerCore({
            originalList: evs as never,
            fixture,
            sentence: SENTENCE,
            budget: 10,
            oracle: () => {
              calls++;
              return { kind: "does-not" };
            },
          });
          if (lowestEvent !== Infinity) {
            expect((core as ReducerError).kind).toBe("invalid-input");
            expect((core as ReducerError).index).toBe(lowestEvent);
          }
          expect(calls).toBe(0);
        },
      ),
      { seed: 20261210, numRuns: 300 },
    );
  }, 120_000);
});