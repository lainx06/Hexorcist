// Feature: rule-compiler, task 8.6. Copy-rule scan of the Rule_Compiler's user-visible text
// (Req 15.8, 15.9). The matcher is the one in copy-rules.test.ts, copied here: whole words,
// ignoring case, not preceded or followed by a letter, digit, `_` or `-`.
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CampaignConfigRest } from "../rules/config-builder";
import { BANNED_WORDS } from "../copy-rules";
import type { Checker, CheckerObservation, CheckerOutcome } from "../checker";
import { buildCampaignConfig } from "../rules/config-builder";
import { compileRuleSet } from "../rules/compile";
import { readIr, writeIr } from "../rules/ir";
import type { Rule } from "../rules/ir";
import { parse } from "../rules/parse";
import { render } from "../rules/render";
import { readRulesFile } from "../rules/rules-file";
import { checkLedTimeout } from "../spike/led-timeout-monitor";
import type { Diagnostic, Fixture, OutputEvent, RunResult } from "../types";
import { computeVerdict, runCountPhrase, triggerReason } from "../verdict";
import { arbRule } from "./rules-arbitraries";

const escape = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Banned words found in `text` as whole words, ignoring case. */
function bannedIn(text: string): string[] {
  return BANNED_WORDS.filter((w) =>
    new RegExp(`(?<![A-Za-z0-9_-])${escape(w)}(?![A-Za-z0-9_-])`, "i").test(text),
  );
}

function expectClean(texts: readonly string[], label: string): void {
  expect(texts.length, `${label}: nothing was scanned`).toBeGreaterThan(0);
  for (const t of texts) expect(bannedIn(t), `${label}: ${t}`).toEqual([]);
}

/** Letter-case variants of each banned word that fit the Signal_Name pattern. */
function bannedSignalVariants(): string[] {
  const out: string[] = [];
  for (const w of BANNED_WORDS) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(w)) continue;
    const alt = [...w].map((c, i) => (i % 2 === 0 ? c.toLowerCase() : c.toUpperCase())).join("");
    out.push(w, w.toUpperCase(), w[0].toUpperCase() + w.slice(1), alt);
  }
  return out;
}

const FIXTURE: Fixture = {
  clockHz: 16_000_000,
  pins: [
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "BTN", port: "D", bit: 2, direction: "input" },
    { signal: "POT", kind: "analog", channel: 0 },
  ],
};

const eq = (signal: string, value: 0 | 1) => ({ op: "eq", signal, value }) as const;
const above = (signal: string, value: number) => ({ op: "above", signal, value }) as const;

const sentenceOf = (rule: Rule): string => {
  const r = render(rule);
  if (!r.ok) throw new Error("test rule does not render");
  return r.sentence;
};

const doc = (rule: unknown): string => JSON.stringify({ version: 1, rules: [rule] });

describe("copy rules for the Rule_Compiler (Req 15.8, 15.9)", () => {
  it("the fixed Reason texts of the design Error Handling tables avoid the banned words", () => {
    const fixed = [
      "The text is not valid JSON.",
      "version is missing.",
      "version must be the number 1; found a string.",
      "The document must be a JSON object; found an array.",
      "rules[0].condition: is missing.",
      "The top-level object has a field that is not allowed.",
      "the rule: has a field that is not allowed.",
      "rules[1].trigger: must be an object; found null.",
      "rules[0].k: must be an integer from 0 to 65535.",
      "rules[0].condition.value: must be 0 or 1.",
      "rules[0].ms: must be a duration above 0 ms with at most 7 digits before and 7 after the decimal point.",
      "rules[0].condition.signal: must be a signal name: a letter, then up to 31 letters, digits or _, and not all, any or a blocked word.",
      "rules[0].condition.of: must hold 2 to 8 conditions.",
      "rules[0].condition: conditions are nested deeper than 4.",
      "rules: must hold 1 to 32 rules; found 0.",
      "rules[0].form: must be one of never, respond, count, hold, notLongerThan.",
      "rules[0].condition.op: must be one of eq, above, below, all, any.",
      "rules[0].trigger.op: must be rise or fall.",
      'rules 0, 1 repeat the sentence "LED is 1 must never."',
      "Not a valid rule: the rule: is missing.",
      "No rule template matches at position 0 (counting from 0); allowed there: a-z.",
      "The text is longer than 65536 UTF-16 code units.",
      "Line 3: No rule template matches at position 0 (counting from 0); allowed there: A-Z.",
      "Found 0 rules; a rules file needs 1 to 32.",
      'Lines 1, 2 repeat the sentence "LED is 1 must never."',
      "Rule set: rules: must hold 1 to 32 rules; found 0.",
      "Fixture: rejected with kind invalid-fixture.",
      "signal must be a signal name: a letter, then up to 31 letters, digits or underscores",
      "maxOnCycles must be an integer from 1 to 159999999999",
      "runEndCycle must be a non-negative integer",
      "runEndCycle must be at most 9007199254740991",
      "events[0].cycle must be an integer",
      "events[0].cycle must be at most 9007199254740991",
      "events[0].cycle is above runEndCycle",
      "events[0].cycle is below the cycle of the previous element for the signal",
      "rule checker: call out of order",
      "untriggered-rule function failed: threw",
      "the monitor rule could not be compiled",
      "Rule set: the rules and the fixture could not be compiled.",
      "Rule set: the campaign settings could not be read.",
    ];
    expectClean(fixed, "fixed Reason texts");
  });

  it("every CannotCheck reason with a neutral signal name avoids the banned words", () => {
    const collected: string[] = [];
    const call = (checker: Checker, o: Partial<CheckerObservation> & { stepIndex: number; cycle: number }): CheckerOutcome =>
      checker({
        runIndex: 0,
        endOfRun: false,
        outputEvents: [],
        appliedInputs: [],
        diagnostics: [],
        ...o,
      });
    const floating = (signal: string): Diagnostic => ({ kind: "floating-input", signal, cycle: 3, register: "PIND" });
    const take = (o: CheckerOutcome): void => {
      for (const c of o.cannotCheck ?? []) collected.push(c.reason);
    };
    const compile = (rules: Rule[], fixture: Fixture = FIXTURE): Checker => {
      const r = compileRuleSet(rules, fixture);
      if (!r.ok) throw new Error(`compile failed: ${r.reasons.join(" | ")}`);
      return r.compiled.checker;
    };

    // Req 5 and 6 reasons at stepIndex 0.
    const marked: Rule[] = [
      { form: "never", condition: eq("GHOST", 1) },
      { form: "never", condition: eq("POT", 1) },
      { form: "never", condition: above("LED", 5) },
      { form: "respond", trigger: { op: "rise", of: eq("BTN", 1) }, withinMs: 0.0001, expect: eq("LED", 1) },
      { form: "notLongerThan", condition: eq("LED", 1), ms: 5 },
    ];
    take(call(compile(marked), { stepIndex: 0, cycle: 10 }));
    // Mapped twice.
    const twice: Fixture = {
      clockHz: 16_000_000,
      pins: [
        { signal: "DUP", port: "B", bit: 5, direction: "output" },
        { signal: "DUP", port: "B", bit: 4, direction: "output" },
      ],
    };
    take(call(compile([{ form: "never", condition: eq("DUP", 1) }], twice), { stepIndex: 0, cycle: 10 }));
    // Clock rate not whole.
    const odd: Fixture = { ...FIXTURE, clockHz: 16_000_000.5 };
    take(call(compile([{ form: "notLongerThan", condition: eq("LED", 1), ms: 5 }], odd), { stepIndex: 0, cycle: 10 }));

    // Req 11: floating (named and fallback) and run-shorter.
    const live: Rule[] = [{ form: "notLongerThan", condition: eq("LED", 1), ms: 300 }];
    const named = compile(live);
    take(call(named, { stepIndex: 0, cycle: 5 }));
    take(call(named, { stepIndex: 1, cycle: 50, diagnostics: [floating("BTN")] }));
    take(call(named, { stepIndex: 2, cycle: 100, endOfRun: true }));
    // The fallback text needs a Fixture input whose name is not a valid Signal_Name.
    const oddName: Fixture = { ...FIXTURE, pins: [...FIXTURE.pins, { signal: "1 bad", port: "D", bit: 7, direction: "input" }] };
    const fallback = compile(live, oddName);
    take(call(fallback, { stepIndex: 0, cycle: 5 }));
    take(call(fallback, { stepIndex: 1, cycle: 50, diagnostics: [floating("1 bad")] }));
    take(call(fallback, { stepIndex: 2, cycle: 100, endOfRun: true }));

    for (const expected of [
      "signal GHOST is not mapped to a pin",
      "POT is an analog input; use above or below",
      "LED is not an analog input",
      "window not a whole number of cycles",
      "signal DUP is mapped to more than one pin",
      "clock rate is not a whole number of hertz",
      "input BTN was read while floating",
      "an input was read while floating",
      "run shorter than the rule window",
    ]) {
      expect(collected, `reason never produced: ${expected}`).toContain(expected);
    }
    expectClean(collected, "CannotCheck reasons");
  });

  it("the trigger reason for 0, 1 and 2 runs avoids the banned words", () => {
    expect(triggerReason(1)).toBe("trigger never happened in 1 run");
    const texts: string[] = [];
    const sentence = sentenceOf({ form: "never", condition: eq("LED", 1) });
    const run = (runIndex: number): RunResult => ({
      runIndex,
      runSeed: runIndex,
      eventList: [{ signal: "BTN", value: 1, cycle: 10, gremlinId: "bounce" }],
      skipped: [],
      appliedInputs: [],
      outputEvents: [],
      diagnostics: [],
      cannotCheck: [],
      violation: null,
      endCycle: 100,
    });
    for (const n of [0, 1, 2]) {
      texts.push(triggerReason(n), runCountPhrase(n));
      const runs = Array.from({ length: n }, (_, i) => run(i));
      const v = computeVerdict({
        requestedRuns: n,
        runs,
        finished: true,
        unmappedSignals: [],
        unsupportedPeripherals: [],
        untriggeredRules: [sentence],
      });
      if (v !== null && v.verdict === "COULDN'T TELL") texts.push(v.reason);
    }
    // BROKE with an untriggered Rule gives an unchecked entry.
    const broke = computeVerdict({
      requestedRuns: 2,
      runs: [run(0), { ...run(1), violation: { rule: "r", cycle: 5 } }],
      finished: true,
      unmappedSignals: [],
      unsupportedPeripherals: [],
      untriggeredRules: [sentence],
    });
    if (broke !== null && broke.verdict === "BROKE") for (const u of broke.unchecked) texts.push(u.reason);
    expect(texts).toContain("trigger never happened in 0 runs");
    expect(texts).toContain("trigger never happened in 2 runs");
    expectClean(texts, "trigger reasons");
  });

  it("Reasons from readIr and writeIr rejections avoid the banned words and do not echo a banned signal", () => {
    const reasons: string[] = [];
    const take = (text: string): void => {
      const r = readIr(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) reasons.push(...r.reasons);
    };
    const never = { form: "never", condition: eq("LED", 1) };
    take("{not json");
    take("[]");
    take("null");
    take(JSON.stringify({ rules: [never] }));
    take(JSON.stringify({ version: "SAFE", rules: [never] }));
    take(JSON.stringify({ version: 2, rules: [never] }));
    take(JSON.stringify({ version: 1 }));
    take(JSON.stringify({ version: 1, rules: [] }));
    take(JSON.stringify({ version: 1, rules: Array.from({ length: 33 }, (_, i) => ({ form: "never", condition: eq("LED", (i % 2) as 0 | 1), extra: 1 })) }));
    take(JSON.stringify({ version: 1, rules: [never], secure: 1 }));
    take(doc({ ...never, unique: "first" }));
    take(doc({ form: "bogus", condition: eq("LED", 1) }));
    take(doc({ form: "never", condition: { op: "bogus", signal: "LED", value: 1 } }));
    take(doc({ form: "never", condition: eq("LED", 2 as 0 | 1) }));
    take(doc({ form: "never", condition: above("POT", 1023) }));
    take(doc({ form: "never", condition: { op: "all", of: [eq("LED", 1)] } }));
    take(doc({ form: "never", condition: { op: "all", of: Array.from({ length: 9 }, () => eq("LED", 1)) } }));
    take(doc({ form: "never", condition: { op: "all", of: [eq("LED", 1), { op: "any", of: [eq("LED", 1), { op: "all", of: [eq("LED", 1), { op: "any", of: [eq("LED", 1), { op: "all", of: [eq("LED", 1), eq("BTN", 1)] }] }] }] }] } }));
    take(doc({ form: "respond", trigger: { op: "sink", of: eq("BTN", 1) }, withinMs: 0, expect: eq("LED", 1) }));
    take(doc({ form: "respond", trigger: { op: "rise", of: eq("BTN", 1) }, withinMs: -1, expect: eq("LED", 1) }));
    take(doc({ form: "count", trigger: { op: "rise", of: eq("BTN", 1) }, k: 1.5, withinMs: 5, expect: eq("LED", 1) }));
    take(doc({ form: "never", condition: eq("1x", 1) }));
    take(JSON.stringify({ version: 1, rules: [never, never] }));
    take(JSON.stringify({ version: 1, rules: [never, { form: "never", condition: eq("LED", 0) }, never] }));
    take(JSON.stringify({ version: 1, rules: [{ form: "never", condition: eq("A".repeat(40), 1) }] }));

    // A banned word used as a Signal_Name is rejected and never echoed.
    const variants = bannedSignalVariants();
    expect(variants.length).toBeGreaterThan(0);
    for (const v of variants) {
      const text = doc({ form: "never", condition: eq(v, 1) });
      const r = readIr(text);
      expect(r.ok, v).toBe(false);
      if (!r.ok) {
        for (const reason of r.reasons) expect(reason.includes(v), `echoed ${v}: ${reason}`).toBe(false);
        reasons.push(...r.reasons);
      }
      const w = writeIr([{ form: "never", condition: eq(v, 1) }]);
      expect(w.ok, v).toBe(false);
      if (!w.ok) {
        expect(w.reason.includes(v), `echoed ${v}: ${w.reason}`).toBe(false);
        reasons.push(w.reason);
      }
    }
    expectClean(reasons, "readIr and writeIr Reasons");
  });

  it("Reasons from render and parse rejections avoid the banned words and do not echo a banned signal", () => {
    const reasons: string[] = [];
    const bad: unknown[] = [
      null,
      undefined,
      [],
      42,
      "SAFE",
      {},
      { form: "never" },
      { form: "never", condition: eq("LED", 1), secure: 1 },
      { form: "never", condition: { op: "eq", signal: "LED", value: 2 } },
      { form: "notLongerThan", condition: eq("LED", 1), ms: 0 },
      { form: "notLongerThan", condition: eq("LED", 1), ms: Number.NaN },
      { form: "notLongerThan", condition: eq("LED", 1), ms: 0.30000000000000004 },
      { form: "bogus" },
    ];
    for (const b of bad) {
      const r = render(b);
      expect(r.ok).toBe(false);
      if (!r.ok) reasons.push(r.reason);
    }
    const variants = bannedSignalVariants();
    for (const v of variants) {
      const r = render({ form: "never", condition: eq(v, 1) });
      expect(r.ok, v).toBe(false);
      if (!r.ok) {
        expect(r.reason.includes(v), `echoed ${v}: ${r.reason}`).toBe(false);
        reasons.push(r.reason);
      }
    }

    const good = sentenceOf({ form: "never", condition: eq("Zq", 1) });
    const inputs: string[] = [
      "",
      " ",
      "LED",
      good.slice(0, 5),
      good.slice(0, -1),
      good + " ",
      good.replace("Zq", "A".repeat(33)),
      good.replace("Zq", "all"),
      good.replace("Zq", "any"),
      good.replace("is 1", "is 2"),
      good.toLowerCase(),
      "SAFE is 1 must never.",
      "\tZq is 1 must never.",
      "Zq is 1 must never\u00a0.",
      "Zq is 1 must never last 0300 ms or longer.",
      "Zq is 1 must never last 3e2 ms or longer.",
      "Zq is 1 must never last -1 ms or longer.",
    ];
    for (const v of variants) inputs.push(good.replace("Zq", v));
    for (const s of inputs) {
      const r = parse(s);
      if (r.ok) continue;
      reasons.push(r.reason);
    }
    for (const v of variants) {
      const r = parse(good.replace("Zq", v));
      expect(r.ok, v).toBe(false);
      if (!r.ok) expect(r.reason.includes(v), `echoed ${v}: ${r.reason}`).toBe(false);
    }
    expectClean(reasons, "render and parse Reasons");
  });

  it("Reasons from readRulesFile rejections avoid the banned words and do not echo a banned signal", () => {
    const reasons: string[] = [];
    const good = sentenceOf({ form: "never", condition: eq("Zq", 1) });
    const other = sentenceOf({ form: "never", condition: eq("Zq", 0) });
    const texts: string[] = [
      "",
      "   \n\n",
      "x".repeat(65_537),
      "\uFEFF" + "x".repeat(65_537),
      `${good}\nnot a rule\n${other}\n???`,
      `${good}\n${good}\n${good}`,
      Array.from({ length: 33 }, (_, i) => sentenceOf({ form: "never", condition: eq("Zq", 1) }).replace("Zq", `S${i}`)).join("\n"),
      `${good}\n${good}\n${"y".repeat(500)}`,
      "# only a comment",
      " # not a comment",
      "{ not json",
      '{"version":1,"rules":[]}',
      "\uFEFF\uFEFF" + good,
    ];
    for (const t of texts) {
      const r = readRulesFile(t);
      expect(r.ok, t.slice(0, 20)).toBe(false);
      if (!r.ok) reasons.push(...r.reasons);
    }
    for (const v of bannedSignalVariants()) {
      const r = readRulesFile(good.replace("Zq", v));
      expect(r.ok, v).toBe(false);
      if (!r.ok) {
        for (const reason of r.reasons) expect(reason.includes(v), `echoed ${v}: ${reason}`).toBe(false);
        reasons.push(...r.reasons);
      }
      const j = readRulesFile(doc({ form: "never", condition: eq(v, 1) }));
      expect(j.ok, v).toBe(false);
      if (!j.ok) {
        for (const reason of j.reasons) expect(reason.includes(v), `echoed ${v}: ${reason}`).toBe(false);
        reasons.push(...j.reasons);
      }
    }
    expectClean(reasons, "readRulesFile Reasons");
  });

  it("Reasons from compileRuleSet and buildCampaignConfig rejections avoid the banned words", () => {
    const reasons: string[] = [];
    const rest = { hex: ":00000001FF", gremlinSet: [], campaignSeed: 1, runs: 1, runCycles: 1000 } as unknown as CampaignConfigRest;
    const never: Rule = { form: "never", condition: eq("LED", 1) };
    const badFixtures: Fixture[] = [
      { ...FIXTURE, clockHz: 0 },
      { pins: [{ signal: "LED", port: "X" as never, bit: 5, direction: "output" }] },
      { pins: [{ signal: "LED", port: "B", bit: 9 as never, direction: "output" }] },
      { pins: [{ signal: "LED", kind: "analog", channel: 9 }] },
    ];
    const badSets: unknown[] = [[], null, "x", [{ form: "never" }], [never, never], [{ ...never, secure: 1 }]];
    for (const v of bannedSignalVariants()) badSets.push([{ form: "never", condition: eq(v, 1) }]);

    for (const s of badSets) {
      const c = compileRuleSet(s, FIXTURE);
      expect(c.ok).toBe(false);
      if (!c.ok) reasons.push(...c.reasons);
      const b = buildCampaignConfig(s, FIXTURE, rest);
      expect(b.ok).toBe(false);
      if (!b.ok) reasons.push(...b.reasons);
    }
    let fixtureRejected = 0;
    for (const f of badFixtures) {
      const c = compileRuleSet([never], f);
      if (!c.ok) {
        fixtureRejected++;
        reasons.push(...c.reasons);
      }
      const b = buildCampaignConfig([never], f, rest);
      if (!b.ok) reasons.push(...b.reasons);
    }
    expect(fixtureRejected, "no bad Fixture was rejected").toBeGreaterThan(0);
    expect(reasons.some((r) => r.startsWith("Fixture: rejected with kind "))).toBe(true);
    // A banned signal name in the Fixture must not be echoed either.
    for (const v of bannedSignalVariants()) {
      const c = compileRuleSet([never], { pins: [{ signal: v, port: "B", bit: 99 as never, direction: "output" }] });
      if (!c.ok) {
        for (const reason of c.reasons) expect(reason.includes(v), `echoed ${v}: ${reason}`).toBe(false);
        reasons.push(...c.reasons);
      }
    }
    expectClean(reasons, "compileRuleSet and buildCampaignConfig Reasons");
  });

  it("checkLedTimeout rejection messages avoid the banned words and do not echo a banned signal", () => {
    const messages: string[] = [];
    const ev = (cycle: number, value: 0 | 1 = 1): OutputEvent => ({ signal: "LED", value, cycle });
    const attempts: Array<() => unknown> = [
      () => checkLedTimeout([], 10, "1bad"),
      () => checkLedTimeout([], 10, ""),
      () => checkLedTimeout([], 10, "all"),
      () => checkLedTimeout([], 10, "LED", 0),
      () => checkLedTimeout([], 10, "LED", 160_000_000_000),
      () => checkLedTimeout([], 10, "LED", 1.5),
      () => checkLedTimeout([], -1),
      () => checkLedTimeout([], 1.5),
      () => checkLedTimeout([], Number.MAX_SAFE_INTEGER + 2),
      () => checkLedTimeout([ev(1.5)], 10),
      () => checkLedTimeout([ev(Number.MAX_SAFE_INTEGER + 2)], Number.MAX_SAFE_INTEGER),
      () => checkLedTimeout([ev(20)], 10),
      () => checkLedTimeout([ev(8), ev(3, 0)], 10),
    ];
    for (const v of bannedSignalVariants()) attempts.push(() => checkLedTimeout([], 10, v));
    const seenMessages = new Set<string>();
    for (const [i, a] of attempts.entries()) {
      let thrown: unknown;
      try {
        a();
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `attempt ${i} did not throw`).toBeInstanceOf(Error);
      const msg = (thrown as Error).message;
      messages.push(msg);
      seenMessages.add(msg);
    }
    for (const v of bannedSignalVariants()) {
      let msg = "";
      try {
        checkLedTimeout([], 10, v);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg.length).toBeGreaterThan(0);
      expect(msg.includes(v), `echoed ${v}: ${msg}`).toBe(false);
    }
    expect(seenMessages.size).toBeGreaterThanOrEqual(8);
    expectClean(messages, "checkLedTimeout messages");
  });

  it("rendered sentences of generated Rules avoid the banned words", () => {
    const SEED = 20261111;
    let scanned = 0;
    let withBannedLike = 0;
    fc.assert(
      fc.property(arbRule, (rule) => {
        const r = render(rule);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        scanned++;
        if (/safe|secure|first|unique|guaranteed|certified|shortest|real-time/i.test(r.sentence)) withBannedLike++;
        expect(bannedIn(r.sentence), r.sentence).toEqual([]);
      }),
      { seed: SEED, numRuns: 200 },
    );
    expect(scanned, `scanned ${scanned}, substring look-alikes ${withBannedLike}`).toBeGreaterThanOrEqual(100);
  });
});
