// Feature: rule-compiler, task 4.7. Example tests for the Rule_Monitors and the Rule_Checker
// call contract (Req 7 to 11). Every expected cycle is derived by hand from the Req 9 formulas
// and the Req 7, 8, 10 and 11 text, not from observed behaviour. Passing runs are evidence,
// not proof.
//
// The Fixture clock is 1000 Hz, so a Duration_Ms of N is exactly N cycles (N * 1000 / 1000).
import { describe, expect, it } from "vitest";
import type { Checker, CheckerObservation, CheckerOutcome } from "../checker";
import { compileRuleSet } from "../rules/compile";
import type { Condition, Edge, Rule } from "../rules/ir";
import { render } from "../rules/render";
import type { AppliedInput, Diagnostic, Fixture, OutputEvent, PinValue } from "../types";

const FX: Fixture = {
  clockHz: 1000,
  pins: [
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "OUT2", port: "B", bit: 4, direction: "output" },
    { signal: "BTN", port: "D", bit: 2, direction: "input" },
    { signal: "BTN_L", port: "D", bit: 3, direction: "input", activeLevel: "low" },
    { signal: "BTN_H", port: "D", bit: 4, direction: "input", activeLevel: "high" },
    { signal: "BTN_A", port: "D", bit: 5, direction: "input", restState: "active" },
    { signal: "BEAM", port: "D", bit: 6, direction: "input" },
    { signal: "POT", kind: "analog", channel: 0 },
    { signal: "POT2", kind: "analog", channel: 1, restLevel: 300 },
    // not a valid Signal_Name: used for the Req 11.2 fallback text
    { signal: "1 bad", port: "D", bit: 7, direction: "input" },
  ],
};

const eq = (signal: string, value: 0 | 1): Condition => ({ op: "eq", signal, value });
const above = (signal: string, value: number): Condition => ({ op: "above", signal, value });
const below = (signal: string, value: number): Condition => ({ op: "below", signal, value });
const rise = (of: Condition): Edge => ({ op: "rise", of });
const fall = (of: Condition): Edge => ({ op: "fall", of });
const never = (condition: Condition): Rule => ({ form: "never", condition });
const respond = (trigger: Edge, withinMs: number, expect: Condition): Rule => ({ form: "respond", trigger, withinMs, expect });
const count = (edge: Edge, windowMs: number, max: number): Rule => ({ form: "count", edge, windowMs, max });
const hold = (after: Edge, durationMs: number, expect: Condition): Rule => ({ form: "hold", after, durationMs, expect });
const notLonger = (condition: Condition, ms: number): Rule => ({ form: "notLongerThan", condition, ms });

function sentence(rule: Rule): string {
  const r = render(rule);
  if (!r.ok) throw new Error("test rule does not render");
  return r.sentence;
}

function compile(rules: Rule[], fixture: Fixture = FX): Checker {
  const r = compileRuleSet(rules, fixture);
  if (!r.ok) throw new Error(`compile failed: ${r.reasons.join(" | ")}`);
  return r.compiled.checker;
}

const out = (signal: string, value: PinValue, cycle: number): OutputEvent => ({ signal, value, cycle });
const din = (signal: string, value: 0 | 1 | "release", at: number, gremlinId = "g"): AppliedInput => ({
  signal, value, cycle: at, appliedCycle: at, gremlinId,
});
const ain = (signal: string, analog: number, at: number): AppliedInput => ({
  signal, analog, cycle: at, appliedCycle: at, gremlinId: "g",
});
const floating = (signal: string, cycle: number): Diagnostic => ({ kind: "floating-input", signal, cycle, register: "PIND" });

interface Step {
  cycle: number;
  end?: boolean;
  out?: OutputEvent[];
  inp?: AppliedInput[];
  diag?: Diagnostic[];
}

function observation(i: number, s: Step): CheckerObservation {
  return {
    runIndex: 0,
    stepIndex: i,
    endOfRun: s.end === true,
    cycle: s.cycle,
    outputEvents: s.out ?? [],
    appliedInputs: s.inp ?? [],
    diagnostics: s.diag ?? [],
  };
}

function feed(checker: Checker, steps: Step[]): CheckerOutcome[] {
  return steps.map((s, i) => checker(observation(i, s)));
}

/** Violation of the last outcome that carries one, or null. */
function firstViolation(outcomes: CheckerOutcome[]) {
  return outcomes.find((o) => o.violation !== null)?.violation ?? null;
}

const SNAP_LED0 = out("LED", 0, 0);
const SNAP_OUT0 = out("OUT2", 0, 0);

describe("never (Req 9.1)", () => {
  it("is violated at cycle 0 when the condition is true in Settled_State(0)", () => {
    const r = never(eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 5, out: [out("LED", 1, 0)] }]);
    expect(o[0].violation).toEqual({ rule: sentence(r), cycle: 0 });
  });

  it("is violated at the lowest cycle where the condition becomes true", () => {
    const r = never(eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 40, out: [out("LED", 1, 17), out("LED", 0, 30)] }]);
    expect(o[0].violation).toBeNull();
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 17 });
  });

  it("is violated at cycle 0 by an applied input with appliedCycle 0 that is not a Rest_Event (Req 7.6)", () => {
    const r = never(eq("BTN", 0));
    const o = feed(compile([r]), [{ cycle: 5, inp: [din("BTN", 0, 0)] }]);
    expect(o[0].violation).toEqual({ rule: sentence(r), cycle: 0 });
  });
});

describe("notLongerThan (Req 9.5), L = 10", () => {
  const r = notLonger(eq("LED", 1), 10);
  it("a true span of L cycles is violated at s + L", () => {
    // true at 5..14 (10 cycles), violation at 5 + 10 = 15
    const o = feed(compile([r]), [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 20, out: [out("LED", 1, 5)] }]);
    expect(o[0].violation).toBeNull();
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 15 });
  });

  it("a true span of L - 1 cycles is not violated", () => {
    // true at 5..13 (9 cycles), false from 14
    const o = feed(compile([r]), [
      { cycle: 3, out: [SNAP_LED0] },
      { cycle: 20, out: [out("LED", 1, 5), out("LED", 0, 14)] },
      { cycle: 100, end: true },
    ]);
    expect(firstViolation(o)).toBeNull();
    expect(o[2].cannotCheck).toBeUndefined();
  });

  it("a fall at exactly s + L is still a violation at s + L", () => {
    // true at 5..14 (10 cycles), false at 15: violation at 15
    const o = feed(compile([r]), [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 30, out: [out("LED", 1, 5), out("LED", 0, 15)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 15 });
  });

  it("a span true at cycle 0 starts at s = 0 and is violated at L", () => {
    const o = feed(compile([r]), [{ cycle: 3, out: [out("LED", 1, 0)] }, { cycle: 30 }]);
    expect(o[0].violation).toBeNull();
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 10 });
  });
});

describe("respond (Req 9.2), W = 20, trigger BTN is 0 becomes true at t = 10", () => {
  const r = respond(rise(eq("BTN", 0)), 20, eq("LED", 1));
  const head: Step[] = [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 11, inp: [din("BTN", 0, 10)] }];

  it("is met when the expectation is true at t + W", () => {
    const o = feed(compile([r]), [...head, { cycle: 100, out: [out("LED", 1, 30)] }, { cycle: 100, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("is met when the expectation is true at t", () => {
    // the output event at 10 must arrive in the call with cycle 11, as the bridge delivers it
    const o = feed(compile([r]), [head[0], { cycle: 11, inp: [din("BTN", 0, 10)], out: [out("LED", 1, 10)] }, { cycle: 100, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("is violated at t + W when the expectation first becomes true at t + W + 1", () => {
    const o = feed(compile([r]), [...head, { cycle: 100, out: [out("LED", 1, 31)] }]);
    expect(o[2].violation).toEqual({ rule: sentence(r), cycle: 30 });
  });

  it("is violated at t + W when the expectation never becomes true", () => {
    const o = feed(compile([r]), [...head, { cycle: 100 }]);
    expect(o[2].violation).toEqual({ rule: sentence(r), cycle: 30 });
  });
});

describe("count (Req 9.3)", () => {
  it("k = 0 fails at the earliest Occurrence, whatever the window", () => {
    const r = count(rise(eq("BTN", 0)), 1000, 0);
    const o = feed(compile([r]), [{ cycle: 5 }, { cycle: 40, inp: [din("BTN", 0, 10), din("BTN", 1, 15), din("BTN", 0, 20)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 10 });
  });

  it("k = 1, W = 10: two Occurrences at 10 and 19 share the range 10..19 and fail at 19", () => {
    const r = count(rise(eq("BTN", 0)), 10, 1);
    const inputs = [din("BTN", 0, 10), din("BTN", 1, 12), din("BTN", 0, 19)];
    const o = feed(compile([r]), [{ cycle: 5 }, { cycle: 40, inp: inputs }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 19 });
  });

  it("k = 1, W = 10: Occurrences at 10 and 20 never share a range 11..20 with each other and pass", () => {
    const r = count(rise(eq("BTN", 0)), 10, 1);
    const inputs = [din("BTN", 0, 10), din("BTN", 1, 12), din("BTN", 0, 20)];
    const o = feed(compile([r]), [{ cycle: 5 }, { cycle: 40, inp: inputs }, { cycle: 100, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("a Rest_Event at cycle 0 is not an Occurrence (Req 8.5)", () => {
    const r = count(rise(eq("BTN", 0)), 1000, 0);
    const o = feed(compile([r]), [{ cycle: 5, inp: [din("BTN", 0, 0, "rest")] }, { cycle: 50, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("an applied input at appliedCycle 0 that is not a Rest_Event is an Occurrence at 0 (Req 8.5)", () => {
    const r = count(rise(eq("BTN", 0)), 1000, 0);
    const o = feed(compile([r]), [{ cycle: 5, inp: [din("BTN", 0, 0)] }]);
    expect(o[0].violation).toEqual({ rule: sentence(r), cycle: 0 });
  });
});

describe("hold (Req 9.4), D = 10, trigger BTN is 0 becomes true", () => {
  it("is violated at t when the expectation is false at t", () => {
    const r = hold(rise(eq("BTN", 0)), 10, eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 30, inp: [din("BTN", 0, 10)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 10 });
  });

  it("is violated at the lowest false cycle inside t .. t + D - 1", () => {
    const r = hold(rise(eq("BTN", 0)), 10, eq("LED", 1));
    // range 10..19; LED false from 15
    const steps: Step[] = [{ cycle: 5, out: [out("LED", 1, 0)] }, { cycle: 40, inp: [din("BTN", 0, 10)], out: [out("LED", 0, 15)] }];
    expect(feed(compile([r]), steps)[1].violation).toEqual({ rule: sentence(r), cycle: 15 });
  });

  it("a false cycle at t + D is outside the range and is not a violation", () => {
    const r = hold(rise(eq("BTN", 0)), 10, eq("LED", 1));
    const steps: Step[] = [{ cycle: 5, out: [out("LED", 1, 0)] }, { cycle: 40, inp: [din("BTN", 0, 10)], out: [out("LED", 0, 20)] }, { cycle: 90, end: true }];
    expect(firstViolation(feed(compile([r]), steps))).toBeNull();
  });

  it("a later Occurrence does not shorten an earlier range", () => {
    const r = hold(rise(eq("BTN", 0)), 10, eq("LED", 1));
    // Occurrences at 10 and 15 (ranges 10..19 and 15..24). LED false at 12..13 lies only in the first range.
    const inputs = [din("BTN", 0, 10), din("BTN", 1, 11), din("BTN", 0, 15)];
    const outs = [out("LED", 0, 12), out("LED", 1, 14)];
    const steps: Step[] = [{ cycle: 5, out: [out("LED", 1, 0)] }, { cycle: 60, inp: inputs, out: outs }];
    expect(feed(compile([r]), steps)[1].violation).toEqual({ rule: sentence(r), cycle: 12 });
  });
});

describe("Initial_State (Req 7.1, 7.2, 7.4, 7.5, 7.7, 7.10, 8.3, 8.8)", () => {
  const bothEq = never({ op: "any", of: [eq("LED", 0), eq("LED", 1)] });

  it("a missing snapshot gives \"input\": both eq values are false for the whole run", () => {
    const o = feed(compile([bothEq]), [{ cycle: 5 }, { cycle: 50, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("a snapshot value \"input\" makes both eq values false", () => {
    const o = feed(compile([bothEq]), [{ cycle: 5, out: [out("LED", "input", 0)] }, { cycle: 50, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  it("a snapshot value 0 makes eq(LED, 0) true at cycle 0 (control for the two tests above)", () => {
    const o = feed(compile([bothEq]), [{ cycle: 5, out: [SNAP_LED0] }]);
    expect(o[0].violation).toEqual({ rule: sentence(bothEq), cycle: 0 });
  });

  it("a change from \"input\" to 1 makes eq(LED, 1) true from that cycle", () => {
    const r = never(eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 5 }, { cycle: 30, out: [out("LED", 1, 7)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 7 });
  });

  it("a Digital_Input starts at its Inactive_Level: 1 for activeLevel low, 1 when absent, 0 for high", () => {
    const cases: Array<[string, 0 | 1]> = [["BTN_L", 1], ["BTN", 1], ["BTN_H", 0]];
    for (const [signal, inactive] of cases) {
      const hit = never(eq(signal, inactive));
      const miss = never(eq(signal, inactive === 1 ? 0 : 1));
      expect(feed(compile([hit]), [{ cycle: 5 }])[0].violation, `${signal} at ${inactive}`).toEqual({ rule: sentence(hit), cycle: 0 });
      expect(firstViolation(feed(compile([miss]), [{ cycle: 5 }, { cycle: 20, end: true }])), `${signal} not ${inactive}`).toBeNull();
    }
  });

  it("a Rest_Event sets the initial value", () => {
    const r = never(eq("BTN", 0));
    const o = feed(compile([r]), [{ cycle: 5, inp: [din("BTN", 0, 0, "rest")] }]);
    expect(o[0].violation).toEqual({ rule: sentence(r), cycle: 0 });
  });

  it("restState \"active\" in the Fixture is ignored: without a Rest_Event the pin holds its Inactive_Level", () => {
    const stays = never(eq("BTN_A", 1));
    const notActive = never(eq("BTN_A", 0));
    expect(feed(compile([stays]), [{ cycle: 5 }])[0].violation).toEqual({ rule: sentence(stays), cycle: 0 });
    expect(firstViolation(feed(compile([notActive]), [{ cycle: 5 }, { cycle: 20, end: true }]))).toBeNull();
  });

  it("the firmware-read level is not modelled: a floating diagnostic leaves the held level alone", () => {
    const holds = never(eq("BTN", 1));
    const o = feed(compile([holds]), [{ cycle: 5, diag: [floating("BTN", 3)] }]);
    // Violation at cycle 0 is below the diagnostic cycle 3, so it stands: the pin still reads as 1
    expect(o[0].violation).toEqual({ rule: sentence(holds), cycle: 0 });
    const reads0 = never(eq("BTN", 0));
    const o2 = feed(compile([reads0]), [{ cycle: 5, diag: [floating("BTN", 3)] }, { cycle: 20, end: true }]);
    expect(firstViolation(o2)).toBeNull();
  });

  it("above and below at value 512 (the default analog rest level)", () => {
    // [op, n, true at 512]
    const table: Array<["above" | "below", number, boolean]> = [
      ["above", 511, true], ["above", 512, false], ["above", 513, false],
      ["below", 511, false], ["below", 512, false], ["below", 513, true],
    ];
    for (const [op, n, isTrue] of table) {
      const r = never(op === "above" ? above("POT", n) : below("POT", n));
      const o = feed(compile([r]), [{ cycle: 5 }, { cycle: 20, end: true }]);
      expect(firstViolation(o), `${op}(POT, ${n})`).toEqual(isTrue ? { rule: sentence(r), cycle: 0 } : null);
    }
  });

  it("an Analog_Input starts at its restLevel", () => {
    const hit = never(below("POT2", 301));
    const miss = never(above("POT2", 300));
    expect(feed(compile([hit]), [{ cycle: 5 }])[0].violation).toEqual({ rule: sentence(hit), cycle: 0 });
    expect(firstViolation(feed(compile([miss]), [{ cycle: 5 }, { cycle: 20, end: true }]))).toBeNull();
  });

  it("an applied analog input changes the value at its appliedCycle", () => {
    const r = never(above("POT", 700));
    const o = feed(compile([r]), [{ cycle: 3 }, { cycle: 20, inp: [ain("POT", 800, 4)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(r), cycle: 4 });
  });
});

describe("incremental contract (Req 10)", () => {
  it("a Violation at cycle X waits for the next call (Req 10.3, 10.4)", () => {
    const r = never(eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 10, out: [out("LED", 1, 10)] }, { cycle: 20 }]);
    expect(o[1].violation).toBeNull();
    expect(o[2].violation).toEqual({ rule: sentence(r), cycle: 10 });
  });

  it("end of run with X = t + W reports respond at X; with X = t + W - 1 it reports nothing (Req 9.7, 9.8, 10.5)", () => {
    const r = respond(rise(eq("BTN", 0)), 20, eq("LED", 1));
    const head: Step[] = [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 11, inp: [din("BTN", 0, 10)] }];
    const atLimit = feed(compile([r]), [...head, { cycle: 30, end: true }]);
    expect(atLimit[2].violation).toEqual({ rule: sentence(r), cycle: 30 });
    const open = feed(compile([r]), [...head, { cycle: 29, end: true }]);
    expect(open[2].violation).toBeNull();
    expect(open[2].cannotCheck).toBeUndefined();
  });

  it("end of run with X = s + L reports notLongerThan at X; with X = s + L - 1 it reports nothing", () => {
    const r = notLonger(eq("LED", 1), 10);
    const head: Step[] = [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 10, out: [out("LED", 1, 5)] }];
    const atLimit = feed(compile([r]), [...head, { cycle: 15, end: true }]);
    expect(atLimit[2].violation).toEqual({ rule: sentence(r), cycle: 15 });
    const open = feed(compile([r]), [...head, { cycle: 14, end: true }]);
    expect(open[2].violation).toBeNull();
    expect(open[2].cannotCheck).toBeUndefined();
  });

  it("an open hold range gives nothing, and a false cycle at c <= X inside it is a Violation at c (Req 9.7, 9.8)", () => {
    const r = hold(rise(eq("BTN", 0)), 10, eq("LED", 1));
    const head: Step[] = [{ cycle: 5, out: [out("LED", 1, 0)] }, { cycle: 11, inp: [din("BTN", 0, 10)] }];
    const open = feed(compile([r]), [...head, { cycle: 12, end: true }]);
    expect(open[2].violation).toBeNull();
    expect(open[2].cannotCheck).toBeUndefined();
    // LED false at 11; the range 10..19 is still open at X = 12, but 11 <= X
    const falseIn = feed(compile([r]), [{ cycle: 5, out: [out("LED", 1, 0)] }, { cycle: 11, inp: [din("BTN", 0, 10)], out: [out("LED", 0, 11)] }, { cycle: 12, end: true }]);
    expect(firstViolation(falseIn)).toEqual({ rule: sentence(r), cycle: 11 });
  });

  it("ties on cycle go to the earlier Rule in Rule_Set order", () => {
    const a = never(eq("OUT2", 1));
    const b = never(eq("LED", 1));
    const snaps = [out("LED", 1, 0), out("OUT2", 1, 0)];
    expect(feed(compile([a, b]), [{ cycle: 5, out: snaps }])[0].violation).toEqual({ rule: sentence(a), cycle: 0 });
    expect(feed(compile([b, a]), [{ cycle: 5, out: snaps }])[0].violation).toEqual({ rule: sentence(b), cycle: 0 });
  });

  it("a lower cycle beats an earlier Rule_Set position", () => {
    const first = never(eq("LED", 1)); // violated at 9
    const second = never(eq("OUT2", 1)); // violated at 4
    const o = feed(compile([first, second]), [{ cycle: 3, out: [SNAP_LED0, SNAP_OUT0] }, { cycle: 30, out: [out("LED", 1, 9), out("OUT2", 1, 4)] }]);
    expect(o[1].violation).toEqual({ rule: sentence(second), cycle: 4 });
  });

  it("changes to different signals in one cycle, split across calls, give the same outcome (Req 8.7)", () => {
    const r = never({ op: "all", of: [eq("LED", 1), eq("BTN", 0)] });
    const whole = feed(compile([r]), [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 20, out: [out("LED", 1, 10)], inp: [din("BTN", 0, 10)] }]);
    // applied input at 10 can only arrive in the call after cycle 10
    const split = feed(compile([r]), [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 10, out: [out("LED", 1, 10)] }, { cycle: 20, inp: [din("BTN", 0, 10)] }]);
    expect(whole[1].violation).toEqual({ rule: sentence(r), cycle: 10 });
    expect(split[2].violation).toEqual({ rule: sentence(r), cycle: 10 });
    expect(split[1].violation).toBeNull();
  });

  it("the last change of one signal in one cycle wins (Req 8.9)", () => {
    const r = never(eq("LED", 1));
    const o = feed(compile([r]), [{ cycle: 3, out: [SNAP_LED0] }, { cycle: 20, out: [out("LED", 1, 8), out("LED", 0, 8)] }, { cycle: 40, end: true }]);
    expect(firstViolation(o)).toBeNull();
  });

  describe("call order breaks throw a rule checker Error (Req 10.11)", () => {
    const r = never(eq("LED", 1));
    const bad = (steps: Array<[number, Step]>) => {
      const checker = compile([r]);
      const run = () => { for (const [i, s] of steps) checker(observation(i, s)); };
      return run;
    };
    it("a stepIndex that skips a number", () => {
      expect(bad([[0, { cycle: 5 }], [2, { cycle: 9 }]])).toThrow(/^rule checker: /);
    });
    it("a non-end-of-run cycle that does not rise", () => {
      expect(bad([[0, { cycle: 5 }], [1, { cycle: 5 }]])).toThrow(/^rule checker: /);
    });
    it("an end-of-run cycle below the previous cycle", () => {
      expect(bad([[0, { cycle: 5 }], [1, { cycle: 4, end: true }]])).toThrow(/^rule checker: /);
    });
    it("a stepIndex above 0 after the end-of-run call", () => {
      expect(bad([[0, { cycle: 5 }], [1, { cycle: 6, end: true }], [2, { cycle: 9 }]])).toThrow(/^rule checker: /);
    });
    it("an end-of-run call at the same cycle as the previous call is allowed", () => {
      expect(bad([[0, { cycle: 5 }], [1, { cycle: 5, end: true }]])).not.toThrow();
    });
    it("a cycle that is negative, fractional or NaN", () => {
      for (const cycle of [-1, 1.5, Number.NaN]) {
        expect(bad([[0, { cycle }]]), `cycle ${String(cycle)}`).toThrow(/^rule checker: /);
      }
    });
  });

  it("stepIndex 0 resets all state, including after a Run cut at a Violation (Req 10.2)", () => {
    const r = never(eq("LED", 1));
    const checker = compile([r]);
    // Run 1 stops at its Violation, with no end-of-run call
    expect(checker(observation(0, { cycle: 5, out: [out("LED", 1, 0)] })).violation).toEqual({ rule: sentence(r), cycle: 0 });
    // Run 2 is clean and must not remember Run 1
    const run2 = feed(checker, [{ cycle: 5, out: [SNAP_LED0] }, { cycle: 50, end: true }]);
    expect(firstViolation(run2)).toBeNull();
    // Run 3 repeats Run 1 and reports the same Violation again
    expect(checker(observation(0, { cycle: 5, out: [out("LED", 1, 0)] })).violation).toEqual({ rule: sentence(r), cycle: 0 });
  });
});

describe("run-level reasons (Req 11)", () => {
  const SHORT = "run shorter than the rule window";

  it("adds a run-shorter entry for each timed Active_Rule whose window exceeds the end cycle, not for never", () => {
    const rules = [
      never(eq("OUT2", 1)),
      respond(rise(eq("BTN", 0)), 100, eq("LED", 1)), // 100 > 20
      count(rise(eq("BTN", 0)), 20, 5), // 20 is not > 20
      notLonger(eq("LED", 1), 21), // 21 > 20
      hold(rise(eq("BTN", 0)), 5, eq("LED", 1)),
    ];
    const o = feed(compile(rules), [{ cycle: 5, out: [out("LED", 1, 0), SNAP_OUT0] }, { cycle: 20, end: true }]);
    expect(o[1].cannotCheck).toEqual([
      { rule: sentence(rules[1]), reason: SHORT },
      { rule: sentence(rules[3]), reason: SHORT },
    ]);
  });

  it("adds no run-shorter entry for a Rule whose Violation the end-of-run call returns", () => {
    const holdRule = hold(rise(eq("BTN", 0)), 50, eq("LED", 1)); // 50 > 20, violated at 12
    const respondRule = respond(rise(eq("BTN", 0)), 100, eq("OUT2", 1)); // 100 > 20, still open
    const rules = [holdRule, respondRule];
    // LED goes false at 12 inside the call whose cycle is 12, so cycle 12 is final only at the end call
    const steps: Step[] = [
      { cycle: 5, out: [out("LED", 1, 0), SNAP_OUT0] },
      { cycle: 12, inp: [din("BTN", 0, 10)], out: [out("LED", 0, 12)] },
      { cycle: 20, end: true },
    ];
    const o = feed(compile(rules), steps);
    expect(o[1].violation).toBeNull();
    expect(o[2].violation).toEqual({ rule: sentence(holdRule), cycle: 12 });
    expect(o[2].cannotCheck).toEqual([{ rule: sentence(respondRule), reason: SHORT }]);
    // control: without the Violation, the hold Rule gets its entry too
    const clean = feed(compile(rules), [steps[0], { cycle: 12, inp: [din("BTN", 0, 10)] }, steps[2]]);
    expect(clean[2].violation).toBeNull();
    expect(clean[2].cannotCheck).toEqual([
      { rule: sentence(holdRule), reason: SHORT },
      { rule: sentence(respondRule), reason: SHORT },
    ]);
  });

  it("returns a floating entry for every Active_Rule once per Run, naming the earliest diagnostic's signal", () => {
    const a = never(eq("LED", 1));
    const b = respond(rise(eq("BEAM", 0)), 5, eq("OUT2", 1)); // does not reference BTN
    const marked = never(eq("GHOST", 1));
    const checker = compile([a, marked, b]);
    const o = feed(checker, [
      { cycle: 5, out: [SNAP_LED0, SNAP_OUT0] },
      { cycle: 10, diag: [floating("BTN", 3), floating("BEAM", 4)] },
      { cycle: 15, diag: [floating("BEAM", 12)] },
      { cycle: 30, end: true },
    ]);
    const reason = "input BTN was read while floating";
    expect(o[0].cannotCheck?.map((c) => c.reason)).toEqual(["signal GHOST is not mapped to a pin"]);
    expect(o[1].cannotCheck).toEqual([{ rule: sentence(a), reason }, { rule: sentence(b), reason }]);
    expect(o[2].cannotCheck).toBeUndefined();
    expect(o[3].cannotCheck).toBeUndefined();
  });

  it("returns the floating entries in the same outcome as a Violation", () => {
    const a = never(eq("OUT2", 1));
    const o = feed(compile([a]), [{ cycle: 5, out: [out("OUT2", 1, 0)], diag: [floating("BTN", 3)] }]);
    expect(o[0].violation).toEqual({ rule: sentence(a), cycle: 0 });
    expect(o[0].cannotCheck).toEqual([{ rule: sentence(a), reason: "input BTN was read while floating" }]);
  });

  it("uses the fallback text when the signal is not a valid Signal_Name", () => {
    const a = never(eq("LED", 1));
    const o = feed(compile([a]), [{ cycle: 5, out: [SNAP_LED0], diag: [floating("1 bad", 2)] }]);
    expect(o[0].cannotCheck).toEqual([{ rule: sentence(a), reason: "an input was read while floating" }]);
  });

  it("a floating-input diagnostic for a signal that is not a Fixture Digital_Input changes nothing", () => {
    const rules = [never(eq("LED", 1)), notLonger(eq("OUT2", 1), 10)];
    const base: Step[] = [
      { cycle: 5, out: [SNAP_LED0, SNAP_OUT0] },
      { cycle: 30, out: [out("OUT2", 1, 7), out("LED", 1, 25)] },
      { cycle: 60 },
      { cycle: 70, end: true },
    ];
    const withDiag = base.map((s, i) => (i === 0 ? { ...s, diag: [floating("NOSUCH", 1), floating("LED", 1), floating("POT", 1)] } : { ...s, diag: [floating("OUT2", 2)] }));
    expect(feed(compile(rules), withDiag)).toEqual(feed(compile(rules), base));
  });

  it("the cut-off d drops Violations at or above d for referencing Rules only", () => {
    const a = never(eq("BTN", 0)); // references BTN
    const b = never(eq("LED", 1)); // does not
    const checker = compile([a, b]);
    // a would be violated at 10 and b at 12; the BTN diagnostic is at cycle 5
    const o = feed(checker, [
      { cycle: 2, out: [SNAP_LED0] },
      { cycle: 20, inp: [din("BTN", 0, 10)], out: [out("LED", 1, 12)], diag: [floating("BTN", 5)] },
      { cycle: 30, end: true },
    ]);
    expect(o[1].violation).toEqual({ rule: sentence(b), cycle: 12 });
    // no other Violation of a in the Run
    expect(o[2].violation).toBeNull();
  });

  it("the cut-off is exclusive: a Violation at d is dropped, one below d stands", () => {
    const a = never(eq("BTN", 0));
    const steps = (at: number): Step[] => [{ cycle: 2 }, { cycle: 20, inp: [din("BTN", 0, at)], diag: [floating("BTN", 5)] }, { cycle: 30, end: true }];
    expect(firstViolation(feed(compile([a]), steps(5)))).toBeNull();
    expect(firstViolation(feed(compile([a]), steps(4)))).toEqual({ rule: sentence(a), cycle: 4 });
  });
});
