// Feature: rule-compiler, task 4.6. Example tests for compileRuleSet: checkerSignals order, the
// compile-time CannotCheck marks (Req 5.3, 5.4, 5.8, 6.2 to 6.7, 6.10), marked Rules (Req 5.6,
// 6.8, 6.9), rejections (Req 6.11, 13.7) and determinism (Req 15.6). Every expectation is
// written from the requirement text. Passing runs are evidence, not proof.
import { describe, expect, it } from "vitest";
import type { Checker, CheckerObservation, CheckerOutcome } from "../checker";
import { compileRuleSet } from "../rules/compile";
import type { Rule, RuleSet } from "../rules/ir";
import { render } from "../rules/render";
import type { AppliedInput, Fixture, OutputEvent } from "../types";

const FIXTURE: Fixture = {
  clockHz: 16_000_000,
  pins: [
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "OUT2", port: "B", bit: 4, direction: "output" },
    { signal: "BTN", port: "D", bit: 2, direction: "input" },
    { signal: "BEAM", port: "D", bit: 3, direction: "input" },
    { signal: "POT", kind: "analog", channel: 0 },
  ],
};

const eq = (signal: string, value: 0 | 1) => ({ op: "eq", signal, value }) as const;
const above = (signal: string, value: number) => ({ op: "above", signal, value }) as const;

function sentenceOf(rule: Rule): string {
  const r = render(rule);
  if (!r.ok) throw new Error("test rule does not render");
  return r.sentence;
}

function obs(
  stepIndex: number,
  cycle: number,
  endOfRun: boolean,
  outputEvents: OutputEvent[] = [],
  appliedInputs: AppliedInput[] = [],
): CheckerObservation {
  return { runIndex: 0, stepIndex, endOfRun, cycle, outputEvents, appliedInputs, diagnostics: [] };
}

/** The same three-call sequence for every checker: stepIndex 0, stepIndex 1, end of run. */
function runThree(checker: Checker, events: OutputEvent[]): CheckerOutcome[] {
  return [
    checker(obs(0, 50, false)),
    checker(obs(1, 150, false, events)),
    checker(obs(2, 300, true)),
  ];
}

function compileOk(ruleSet: unknown, fixture: Fixture = FIXTURE) {
  const r = compileRuleSet(ruleSet, fixture);
  if (!r.ok) throw new Error(`compile failed: ${r.reasons.join(" | ")}`);
  return r.compiled;
}

describe("checkerSignals (Req 6.1)", () => {
  it("lists signals in Rule_Set order, sentence order within a Rule, once each, marked Rules included", () => {
    const ruleSet: RuleSet = [
      // sentence order: BTN (edge), then LED, BEAM (expect)
      { form: "respond", trigger: { op: "rise", of: eq("BTN", 0) }, withinMs: 1, expect: { op: "all", of: [eq("LED", 1), eq("BEAM", 1)] } },
      // OUT2 first appearance, LED already listed
      { form: "never", condition: { op: "any", of: [eq("OUT2", 1), eq("LED", 0)] } },
      // marked Rule (unmapped signal) still contributes its signals
      { form: "never", condition: eq("GHOST", 1) },
      // POT comes from the Edge, then the expect Condition names LED and ZED again
      { form: "hold", after: { op: "fall", of: above("POT", 10) }, durationMs: 1, expect: { op: "all", of: [eq("ZED", 1), eq("LED", 1)] } },
    ];
    expect(compileOk(ruleSet).checkerSignals).toEqual(["BTN", "LED", "BEAM", "OUT2", "GHOST", "POT", "ZED"]);
  });
});

describe("compile-time marks at stepIndex 0 (Req 5.3, 5.4, 6.2 to 6.7, 6.10)", () => {
  it("returns Req 6.2 to 6.5 and Req 5 reasons in the order of Req 6.7, per Rule in Rule_Set order", () => {
    const first: Rule = {
      form: "respond",
      trigger: { op: "rise", of: eq("GHOST", 1) },
      withinMs: 0.0001, // 1.6 cycles at 16 MHz
      expect: { op: "all", of: [above("LED", 5), eq("POT", 1)] },
    };
    const second: Rule = { form: "never", condition: { op: "all", of: [eq("NOPE", 1), above("BTN", 3)] } };
    const compiled = compileOk([first, second]);
    const out = compiled.checker(obs(0, 10, false));
    expect(out.violation).toBeNull();
    expect(out.cannotCheck).toEqual([
      { rule: sentenceOf(first), reason: "signal GHOST is not mapped to a pin" },
      { rule: sentenceOf(first), reason: "LED is not an analog input" },
      { rule: sentenceOf(first), reason: "POT is an analog input; use above or below" },
      { rule: sentenceOf(first), reason: "window not a whole number of cycles" },
      { rule: sentenceOf(second), reason: "signal NOPE is not mapped to a pin" },
      { rule: sentenceOf(second), reason: "BTN is not an analog input" },
    ]);
  });

  it("gives one entry per distinct Signal_Name even when a signal appears twice", () => {
    const rule: Rule = { form: "never", condition: { op: "any", of: [eq("GHOST", 0), eq("GHOST", 1), eq("LED", 1)] } };
    const out = compileOk([rule]).checker(obs(0, 10, false));
    expect(out.cannotCheck).toEqual([{ rule: sentenceOf(rule), reason: "signal GHOST is not mapped to a pin" }]);
  });

  it("uses only the 'more than one pin' reason for a signal mapped twice, with no kind check", () => {
    const fixture: Fixture = {
      clockHz: 16_000_000,
      pins: [
        { signal: "DUP", port: "B", bit: 5, direction: "output" },
        { signal: "DUP", port: "B", bit: 4, direction: "output" },
        { signal: "ADUP", kind: "analog", channel: 0 },
        { signal: "ADUP", kind: "analog", channel: 1 },
      ],
    };
    // above on a digital pin and eq on an analog pin would each get a kind reason if mapped once
    const rule: Rule = { form: "never", condition: { op: "all", of: [above("DUP", 3), eq("ADUP", 1)] } };
    const out = compileOk([rule], fixture).checker(obs(0, 10, false));
    expect(out.cannotCheck).toEqual([
      { rule: sentenceOf(rule), reason: "signal DUP is mapped to more than one pin" },
      { rule: sentenceOf(rule), reason: "signal ADUP is mapped to more than one pin" },
    ]);
  });

  it("compares Signal_Names case-sensitively", () => {
    const rule: Rule = { form: "never", condition: eq("led", 1) };
    const out = compileOk([rule]).checker(obs(0, 10, false));
    expect(out.cannotCheck).toEqual([{ rule: sentenceOf(rule), reason: "signal led is not mapped to a pin" }]);
  });

  it("returns no mark for eq on a digital input or an output pin, and above/below on an analog pin", () => {
    const rules: RuleSet = [
      { form: "never", condition: eq("BTN", 1) },
      { form: "never", condition: eq("LED", 0) },
      { form: "never", condition: { op: "below", signal: "POT", value: 100 } },
    ];
    const out = compileOk(rules).checker(obs(0, 10, false));
    expect(out.cannotCheck ?? []).toEqual([]);
  });

  it("gives a never Rule no Req 5 mark at a Clock_Rate that is not a whole number of hertz", () => {
    for (const clockHz of [16_000_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = compileOk([{ form: "never", condition: eq("LED", 1) }], { ...FIXTURE, clockHz }).checker(obs(0, 10, false));
      expect(out.cannotCheck ?? [], String(clockHz)).toEqual([]);
    }
  });

  it("marks every timed Rule once with the clock reason and never also with the whole-cycles reason", () => {
    const rules: RuleSet = [
      { form: "respond", trigger: { op: "rise", of: eq("BTN", 0) }, withinMs: 1, expect: eq("LED", 1) },
      { form: "count", edge: { op: "rise", of: eq("BTN", 0) }, windowMs: 0.0001, max: 1 },
      { form: "hold", after: { op: "fall", of: eq("LED", 0) }, durationMs: 2.5, expect: eq("LED", 1) },
      { form: "notLongerThan", condition: eq("LED", 1), ms: 300 },
      { form: "never", condition: eq("OUT2", 1) },
    ];
    for (const clockHz of [16_000_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = compileOk(rules, { ...FIXTURE, clockHz }).checker(obs(0, 10, false));
      const entries = out.cannotCheck ?? [];
      expect(entries.map((e) => e.reason), String(clockHz)).toEqual(Array(4).fill("clock rate is not a whole number of hertz"));
      expect(entries.map((e) => e.rule)).toEqual(rules.slice(0, 4).map(sentenceOf));
    }
  });

  it("gives at most one Req 5 entry per Rule at the default 16 MHz clock", () => {
    const rules: RuleSet = [
      { form: "notLongerThan", condition: eq("LED", 1), ms: 0.0000001 },
      { form: "count", edge: { op: "rise", of: eq("BTN", 0) }, windowMs: 9_999_999.9999999, max: 3 },
      { form: "notLongerThan", condition: eq("OUT2", 1), ms: 9_999_999 }, // 159,999,984,000 cycles: no mark
    ];
    const out = compileOk(rules).checker(obs(0, 10, false));
    expect(out.cannotCheck).toEqual([
      { rule: sentenceOf(rules[0]), reason: "window not a whole number of cycles" },
      { rule: sentenceOf(rules[1]), reason: "window not a whole number of cycles" },
    ]);
  });

  it("treats clockHz undefined as 16,000,000 (Req 5.2)", () => {
    const rule: Rule = { form: "notLongerThan", condition: eq("LED", 1), ms: 0.0000625 };
    const noClock: Fixture = { pins: FIXTURE.pins };
    expect(compileOk([rule], noClock).checker(obs(0, 10, false)).cannotCheck ?? []).toEqual([]);
    const half: Rule = { form: "notLongerThan", condition: eq("LED", 1), ms: 0.0001 };
    expect(compileOk([half], noClock).checker(obs(0, 10, false)).cannotCheck).toEqual([
      { rule: sentenceOf(half), reason: "window not a whole number of cycles" },
    ]);
  });

  it("returns the marks at stepIndex 0 only, never at stepIndex above 0 (Req 6.10)", () => {
    const rules: RuleSet = [
      { form: "never", condition: eq("GHOST", 1) },
      { form: "never", condition: above("LED", 1) },
      { form: "notLongerThan", condition: eq("BTN", 0), ms: 0.0001 },
    ];
    const checker = compileOk(rules).checker;
    expect((checker(obs(0, 10, false)).cannotCheck ?? []).length).toBe(3);
    expect(checker(obs(1, 20, false)).cannotCheck ?? []).toEqual([]);
    expect(checker(obs(2, 30, true)).cannotCheck ?? []).toEqual([]);
    // a second Run starts again at stepIndex 0 and returns the marks again
    expect((checker(obs(0, 10, false)).cannotCheck ?? []).length).toBe(3);
    expect(checker(obs(1, 20, false)).cannotCheck ?? []).toEqual([]);
  });
});

describe("marked Rules and Active_Rules (Req 5.6, 6.8, 6.9)", () => {
  const LED_ON: OutputEvent[] = [{ signal: "LED", value: 1, cycle: 100 }];

  it("compiles an all-marked Rule_Set without throwing and returns violation null at every call", () => {
    const fixture: Fixture = {
      clockHz: 16_000_000,
      pins: [
        { signal: "DUP", port: "B", bit: 5, direction: "output" },
        { signal: "DUP", port: "B", bit: 4, direction: "output" },
      ],
    };
    const rules: RuleSet = [
      { form: "never", condition: eq("GHOST", 1) },
      { form: "never", condition: eq("DUP", 1) },
    ];
    const compiled = compileOk(rules, fixture);
    const events: OutputEvent[] = [{ signal: "DUP", value: 1, cycle: 10 }];
    const outs = runThree(compiled.checker, events);
    for (const o of outs) expect(o.violation).toBeNull();
    expect((outs[0].cannotCheck ?? []).length).toBe(2);
  });

  it("returns the same violation at every call as a compile of only the Active_Rules", () => {
    const active1: Rule = { form: "never", condition: eq("LED", 1) };
    const active2: Rule = { form: "never", condition: eq("OUT2", 1) };
    const mixed: RuleSet = [
      { form: "never", condition: eq("GHOST", 1) },
      active1,
      { form: "notLongerThan", condition: eq("BTN", 0), ms: 0.0001 },
      active2,
      { form: "never", condition: above("LED", 2) },
    ];
    const events: OutputEvent[] = [...LED_ON, { signal: "OUT2", value: 1, cycle: 120 }];
    const withMarks = runThree(compileOk(mixed).checker, events).map((o) => o.violation);
    const onlyActive = runThree(compileOk([active1, active2]).checker, events).map((o) => o.violation);
    expect(withMarks).toEqual(onlyActive);
    // the comparison is not vacuous: a Violation is reported at a call (the lower cycle first)
    expect(withMarks).toEqual([null, { rule: sentenceOf(active1), cycle: 100 }, { rule: sentenceOf(active2), cycle: 120 }]);
  });
});

describe("rejections (Req 6.11, 13.7)", () => {
  it("returns invalid Rule_Set Reasons with JSON paths and the 'Rule set: ' prefix, and no checker", () => {
    const bad = [
      { form: "never", condition: eq("LED", 1) },
      { form: "never", condition: { op: "eq", signal: "LED", value: 2 }, secretField: "x" },
    ];
    const r = compileRuleSet(bad, FIXTURE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons.length).toBeGreaterThanOrEqual(1);
    for (const reason of r.reasons) {
      expect(reason.startsWith("Rule set: ")).toBe(true);
      expect(reason.length).toBeLessThanOrEqual(200);
      expect(reason).not.toContain("secretField");
    }
    const joined = r.reasons.join("\n");
    expect(joined).toContain("rules[1].condition.value");
    expect(r).not.toHaveProperty("compiled");
  });

  it("rejects values that are not a Rule_Set without throwing", () => {
    for (const bad of [undefined, null, 5, "text", {}, []]) {
      const r = compileRuleSet(bad, FIXTURE);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reasons.length).toBeGreaterThanOrEqual(1);
        for (const reason of r.reasons) expect(reason.startsWith("Rule set: ")).toBe(true);
      }
    }
  });

  it("rejects two Rules with the same Canonical_Sentence, naming the sentence", () => {
    const rule: Rule = { form: "never", condition: eq("LED", 1) };
    const r = compileRuleSet([rule, { ...rule }], FIXTURE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const joined = r.reasons.join("\n");
    expect(joined).toContain(sentenceOf(rule));
    for (const reason of r.reasons) expect(reason.startsWith("Rule set: ")).toBe(true);
  });

  it("gives the one kind-only Reason for clockHz null (decision OQ1) and other rejected Fixtures", () => {
    const ruleSet: RuleSet = [{ form: "never", condition: eq("LED", 1) }];
    const nullClock = { clockHz: null, pins: FIXTURE.pins } as unknown as Fixture;
    const a = compileRuleSet(ruleSet, nullClock);
    expect(a).toEqual({ ok: false, reasons: ["Fixture: rejected with kind invalid-fixture."] });

    const zeroClock: Fixture = { clockHz: 0, pins: FIXTURE.pins };
    expect(compileRuleSet(ruleSet, zeroClock)).toEqual({ ok: false, reasons: ["Fixture: rejected with kind invalid-fixture."] });

    const badPort = { pins: [{ signal: "SecretPin", port: "Z", bit: 1, direction: "output" }] } as unknown as Fixture;
    const b = compileRuleSet(ruleSet, badPort);
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.reasons).toEqual(["Fixture: rejected with kind unsupported-port."]);
      expect(b.reasons.join("")).not.toContain("SecretPin");
    }
  });

  it("does not throw for a Fixture that is not an object", () => {
    const ruleSet: RuleSet = [{ form: "never", condition: eq("LED", 1) }];
    for (const bad of [undefined, null, 5, "text", [], true]) {
      let r: ReturnType<typeof compileRuleSet> | undefined;
      expect(() => {
        r = compileRuleSet(ruleSet, bad as unknown as Fixture);
      }, String(bad)).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r !== undefined && !r.ok) {
        expect(r.reasons.length).toBe(1);
        expect(r.reasons[0].startsWith("Fixture: rejected with kind ")).toBe(true);
      }
    }
  });
});

describe("determinism and private copies (Req 6.9, 15.6)", () => {
  const rules: RuleSet = [
    { form: "never", condition: eq("GHOST", 1) },
    { form: "notLongerThan", condition: eq("LED", 1), ms: 1 },
    { form: "never", condition: eq("OUT2", 1) },
  ];
  const calls = (): CheckerObservation[] => [
    obs(0, 10, false, [{ signal: "LED", value: 1, cycle: 5 }]),
    obs(1, 20_000, false, [{ signal: "OUT2", value: 1, cycle: 17_000 }]),
    obs(2, 30_000, true),
  ];

  it("gives the same checkerSignals and deep-equal outcomes for two compiles, even interleaved", () => {
    const a = compileOk(rules);
    const b = compileOk(rules);
    expect(a.checkerSignals).toEqual(b.checkerSignals);
    const interleavedA: CheckerOutcome[] = [];
    const interleavedB: CheckerOutcome[] = [];
    for (const o of calls()) {
      interleavedA.push(a.checker(o));
      interleavedB.push(b.checker(o));
    }
    const soloChecker = compileOk(rules).checker;
    const solo = calls().map((o) => soloChecker(o));
    expect(interleavedA).toEqual(interleavedB);
    expect(interleavedA).toEqual(solo);
    // not vacuous: a Violation is reported at a later call
    expect(interleavedA.some((o) => o.violation !== null)).toBe(true);
    expect(JSON.parse(JSON.stringify(interleavedA))).toEqual(interleavedA);
  });

  it("is not changed by editing the caller's Rule_Set or Fixture after compile", () => {
    const ruleSet: RuleSet = [
      { form: "never", condition: eq("LED", 1) },
      { form: "notLongerThan", condition: eq("OUT2", 1), ms: 1 },
    ];
    const fixture: Fixture = {
      clockHz: 16_000_000,
      pins: FIXTURE.pins.map((p) => ({ ...p })),
    };
    const evs: OutputEvent[] = [{ signal: "LED", value: 1, cycle: 100 }];
    const control = runThree(compileOk(structuredClone(ruleSet), structuredClone(fixture)).checker, evs);

    const compiled = compileOk(ruleSet, fixture);
    const signalsBefore = compiled.checkerSignals.slice();
    // edit everything the caller still holds
    (ruleSet[0] as Extract<Rule, { form: "never" }>).condition = eq("OUT2", 0);
    ruleSet.push({ form: "never", condition: eq("BTN", 1) });
    fixture.pins.length = 0;
    fixture.clockHz = 1;
    const after = runThree(compiled.checker, evs);

    expect(after).toEqual(control);
    expect(compiled.checkerSignals).toEqual(signalsBefore);
    // not vacuous: the control run reports the Violation of the first Rule
    expect(control[1].violation).toEqual({ rule: "LED is 1 must never happen.", cycle: 100 });
  });
});
