// Feature: trace-reducer. Unit tests: defaults, error kinds and messages, Step_Report shapes.
// Uses the blink_button HEX for the defaults. Evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReducerCore } from "../reducer/core";
import { createReducer } from "../reducer/reducer";
import type { Oracle, ReducerError, ReducerEvent, StepReport } from "../reducer/types";
import type { Fixture } from "../types";
import type { RuleSet } from "../rules/ir";
import { bannedIn } from "./reducer-arbitraries";

const HERE = dirname(fileURLToPath(import.meta.url));
const BLINK_HEX = readFileSync(resolve(HERE, "../../../fixtures/blink_button/build/blink_button.ino.hex"), "utf-8");
const BLINK: Fixture = {
  pins: [
    { signal: "BUTTON", port: "D", bit: 2, direction: "input" },
    { signal: "LED", port: "B", bit: 5, direction: "output" },
  ],
};
const RULES: RuleSet = [{ form: "never", condition: { op: "eq", signal: "LED", value: 1 } }] as RuleSet;
const SENTENCE = "LED is 1 must never happen.";
const LIST: ReducerEvent[] = [
  { signal: "BUTTON", value: "release", cycle: 500, gremlinId: "g" },
  { signal: "BUTTON", value: 0, cycle: 1_000, gremlinId: "g" },
  { signal: "BUTTON", value: 0, cycle: 2_000, gremlinId: "g" },
];
const base = { hex: BLINK_HEX, fixture: BLINK, ruleSet: RULES, originalList: LIST, violation: { rule: SENTENCE, cycle: 1 }, runCycles: 2_400_000 };

const F: Fixture = { pins: [{ signal: "D0", port: "D", bit: 2, direction: "input" }] };
const ev = (cycle: number): ReducerEvent => ({ signal: "D0", value: 0, cycle, gremlinId: "g" });
const breaks: Oracle = () => ({ kind: "breaks", violation: { rule: "X must never happen.", cycle: 1 } });

function finalOf(h: ReturnType<typeof createReducerCore>, k = 100): StepReport {
  if ("kind" in h) throw new Error(h.message);
  for (;;) {
    const r = h.step(k);
    if ("kind" in r) throw new Error(r.message);
    if (r.ended) return r;
  }
}

describe("trace-reducer defaults", () => {
  it("a missing or undefined budget and maxStepCycles act as 300 and 160,000", () => {
    const explicit = createReducer({ ...base, budget: 300, maxStepCycles: 160_000 });
    const omitted = createReducer(base);
    const undef = createReducer({ ...base, budget: undefined, maxStepCycles: undefined });
    const a = finalOf(explicit as never);
    expect(a.result?.violation.rule).toBe(SENTENCE);
    expect(finalOf(omitted as never)).toStrictEqual(a);
    expect(finalOf(undef as never)).toStrictEqual(a);
    expect(a.result?.reducedEventCount).toBe(1);
  }, 120_000);

  it("null budget or maxStepCycles is invalid-input", () => {
    expect((createReducer({ ...base, budget: null }) as ReducerError).field).toBe("budget");
    expect((createReducer({ ...base, maxStepCycles: null }) as ReducerError).field).toBe("maxStepCycles");
  });
});

describe("trace-reducer error kinds", () => {
  const messages: string[] = [];
  const keep = (e: ReducerError | undefined): ReducerError => {
    if (e === undefined) throw new Error("no error");
    messages.push(e.message);
    return e;
  };

  it("original-does-not-break", () => {
    const f = finalOf(createReducerCore({ originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 10, oracle: () => ({ kind: "does-not" }) }));
    expect(keep(f.error)).toStrictEqual({ kind: "original-does-not-break", message: "The original list does not break the target rule.", candidatesTried: 1 });
    expect(f.result).toBeUndefined();
  });

  it("oracle-error, threw with and without a cause, and malformed", () => {
    let n = 0;
    const f1 = finalOf(
      createReducerCore({
        originalList: [ev(1), ev(2)],
        fixture: F,
        sentence: "X must never happen.",
        budget: 10,
        oracle: (c) => {
          n++;
          if (n === 2) throw { kind: "bridge-error", message: "fake" };
          return breaks(c);
        },
      }),
    );
    expect(keep(f1.error)).toStrictEqual({
      kind: "oracle-error",
      message: "Candidate 2: the oracle threw (bridge-error: fake).",
      candidate: 2,
      how: "threw",
      cause: { kind: "bridge-error", message: "fake" },
    });
    const f2 = finalOf(createReducerCore({ originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 10, oracle: () => { throw new Error("boom"); } }));
    expect(keep(f2.error)).toStrictEqual({ kind: "oracle-error", message: "Candidate 1: the oracle threw (boom).", candidate: 1, how: "threw" });
    const f3 = finalOf(createReducerCore({ originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 10, oracle: () => null as never }));
    expect(keep(f3.error)).toStrictEqual({ kind: "oracle-error", message: "Candidate 1: the oracle returned a malformed outcome.", candidate: 1, how: "malformed" });
  });

  it("callback-error", () => {
    const h = createReducerCore(
      { originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 10, oracle: breaks },
      { onProgress: () => { throw new Error("cb"); } },
    );
    const f = finalOf(h);
    expect(keep(f.error)).toStrictEqual({ kind: "callback-error", message: "Candidate 1: the progress callback threw.", candidate: 1, candidatesTried: 1 });
  });

  it("invalid-input messages for core fields and k", () => {
    const good = { originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 10, oracle: breaks };
    for (const [over, field] of [
      [{ oracle: 3 }, "oracle"],
      [{ sentence: "" }, "sentence"],
      [{ budget: 0 }, "budget"],
      [{ fixture: null }, "fixture"],
      [{ originalList: {} }, "originalList"],
      [{ originalList: [ev(5), ev(1)] }, "cycle"],
    ] as const) {
      const e = createReducerCore({ ...good, ...(over as object) } as never) as ReducerError;
      expect(e.kind).toBe("invalid-input");
      expect(e.field).toBe(field);
      keep(e);
    }
    const h = createReducerCore(good);
    if ("kind" in h) throw new Error(h.message);
    const e = h.step(0) as ReducerError;
    expect(keep(e)).toStrictEqual({ kind: "invalid-input", message: "Field k: must be an integer from 1 to 9007199254740991.", field: "k" });
  });

  it("no message built by an error path holds a banned word", () => {
    expect(messages.length).toBeGreaterThan(0);
    for (const m of messages) expect(bannedIn(m)).toStrictEqual([]);
  });
});

describe("trace-reducer Step_Report shapes", () => {
  it("ended false mid-run, result only on a result, error only on an error", () => {
    const h = createReducerCore({ originalList: [ev(1), ev(2), ev(3)], fixture: F, sentence: "X must never happen.", budget: 50, oracle: breaks });
    if ("kind" in h) throw new Error(h.message);
    const mid = h.step(1) as StepReport;
    expect(mid).toStrictEqual({ ended: false, candidatesTried: 1, bestGremlinCount: 3 });
    const end = finalOf(h);
    expect(end.ended).toBe(true);
    expect(end.result).toBeDefined();
    expect("error" in end).toBe(false);
    const bad = finalOf(createReducerCore({ originalList: [ev(1)], fixture: F, sentence: "X must never happen.", budget: 5, oracle: () => ({ kind: "does-not" }) }));
    expect("result" in bad).toBe(false);
    expect(bad.error).toBeDefined();
  });
});