/// <reference types="node" />
// Feature: rule-compiler, task 6.11. Campaign wiring of the Rule_Compiler (Req 13).
// Expectations come from Req 13 text. Part A uses a counting stub bridge (no emulator).
// Part B uses the blink_button HEX with short Runs. Evidence, not proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign, resumeCampaign, runCampaign } from '../campaign.js';
import type { BridgeFactory, CampaignConfig, CampaignHandle } from '../campaign.js';
import type { Checker } from '../checker.js';
import type { EmulatorBridgeInterface } from '../emulator-bridge.js';
import { computeVerdict } from '../verdict.js';
import type { CampaignResult, CampaignState, Fixture, RunResult, SliceProgress } from '../types.js';
import { buildCampaignConfig } from '../rules/config-builder.js';
import { compileRuleSet } from '../rules/compile.js';
import { render } from '../rules/render.js';
import type { Rule, RuleSet } from '../rules/ir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX_PATH = resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const quiet: Checker = () => ({ violation: null });

/** Stub bridge: cycleCount moves by exactly what advance was asked for; no events at all. */
const stubFactory: BridgeFactory = () => {
  let cycles = 0;
  const b: EmulatorBridgeInterface = {
    advance(n) {
      cycles += n;
      return { appliedInputs: [], appliedAnalogInputs: [], outputEvents: [], diagnostics: [] } as never;
    },
    schedule: () => undefined,
    supports: () => true,
    clockHz: 16_000_000,
    get cycleCount() {
      return cycles;
    },
  };
  return b;
};

const STUB_RUNS = 5;

function stubCfg(extra: Partial<CampaignConfig> = {}): CampaignConfig {
  return {
    hex: ':00000001FF',
    fixture: FIXTURE,
    gremlinSet: [],
    campaignSeed: 7,
    checker: quiet,
    runs: STUB_RUNS,
    runCycles: 1_000,
    maxStepCycles: 400,
    bridgeFactory: stubFactory,
    ...extra,
  };
}

function handleOf(c: CampaignConfig): CampaignHandle {
  const h = createCampaign(c);
  if ('kind' in h) throw new Error(`expected a handle, got ${h.kind}`);
  return h;
}

function resumedOf(c: CampaignConfig, s: CampaignState): CampaignHandle {
  const h = resumeCampaign(c, s);
  if ('kind' in h) throw new Error(`expected a handle, got ${h.kind}`);
  return h;
}

function progressOf(p: SliceProgress | { kind: string }): SliceProgress {
  if ('kind' in p) throw new Error(`expected progress, got ${p.kind}`);
  return p;
}

function resultOf(p: CampaignResult | { kind: string }): CampaignResult {
  if ('verdict' in p) return p;
  throw new Error(`expected a CampaignResult, got ${(p as { kind: string }).kind}`);
}

// ---------------------------------------------------------------------------
// Part A: Campaign behaviour of the optional function (Req 13.3, 13.8, 13.9)
// ---------------------------------------------------------------------------

describe('Campaign with the Untriggered_Rule field absent (Req 13.3)', () => {
  it('gives RunResults, SliceProgress values and a CampaignResult equal to those of today\'s config', () => {
    // "Today's config": only the fields that existed before this spec, built as a fresh literal.
    const today = (): CampaignConfig => ({
      hex: ':00000001FF',
      fixture: FIXTURE,
      gremlinSet: [],
      campaignSeed: 7,
      checker: quiet,
      runs: STUB_RUNS,
      runCycles: 1_000,
      maxStepCycles: 400,
      checkerSignals: ['LED'],
      bridgeFactory: stubFactory,
    });
    const a = handleOf(today());
    const b = handleOf(stubCfg({ checkerSignals: ['LED'] }));
    const progA: SliceProgress[] = [];
    const progB: SliceProgress[] = [];
    for (let i = 0; i < STUB_RUNS; i++) {
      progA.push(progressOf(a.runSlice(2)));
      progB.push(progressOf(b.runSlice(2)));
    }
    expect(progB).toEqual(progA);
    const last = progA[progA.length - 1];
    expect(last.finished).toBe(true);
    expect(last.runs.length).toBe(STUB_RUNS);
    expect(a.state()).toEqual(b.state());
    expect(Object.keys(a.state()).sort()).toEqual(['nextRunIndex', 'runs']);

    // The verdict is exactly what computeVerdict gives with no Untriggered_Rule field.
    const direct = computeVerdict({
      requestedRuns: STUB_RUNS,
      runs: last.runs,
      finished: true,
      unmappedSignals: [],
      unsupportedPeripherals: [],
    });
    expect(last.result?.verdict).toEqual(direct);

    expect(resultOf(runCampaign(today()))).toEqual(last.result);
  });
});

describe('Campaign with the Untriggered_Rule function set (Req 13.8)', () => {
  function spy(list: readonly string[] = []) {
    const calls: RunResult[][] = [];
    const find = (runs: readonly RunResult[]): readonly string[] => {
      calls.push(structuredClone(runs) as RunResult[]);
      return list;
    };
    return { find, calls };
  }

  it('is called once, with every completed Run in Run_Index order, and not before the Campaign finishes', () => {
    const s = spy();
    const h = handleOf(stubCfg({ findUntriggeredRules: s.find }));
    progressOf(h.runSlice(2));
    progressOf(h.runSlice(2));
    expect(s.calls.length).toBe(0);
    const p = progressOf(h.runSlice(2));
    expect(p.finished).toBe(true);
    expect(s.calls.length).toBe(1);
    expect(s.calls[0].map((r) => r.runIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(s.calls[0]).toEqual(h.state().runs);
  });

  it('includes Runs restored by resumeCampaign, in Run_Index order, still once', () => {
    const first = handleOf(stubCfg());
    progressOf(first.runSlice(2));
    const saved = JSON.parse(JSON.stringify(first.state())) as CampaignState;
    const s = spy();
    const h = resumedOf(stubCfg({ findUntriggeredRules: s.find }), saved);
    expect(s.calls.length).toBe(0);
    progressOf(h.runSlice(1));
    expect(s.calls.length).toBe(0);
    progressOf(h.runSlice(10));
    progressOf(h.runSlice(10));
    expect(s.calls.length).toBe(1);
    expect(s.calls[0].map((r) => r.runIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(s.calls[0].slice(0, 2)).toEqual(saved.runs);
  });

  it('passes the returned list on, and later runSlice calls return the same CampaignResult', () => {
    const s = spy(['Some sentence.']);
    const h = handleOf(stubCfg({ findUntriggeredRules: s.find }));
    const p1 = progressOf(h.runSlice(100));
    expect(p1.result?.verdict).toEqual(
      computeVerdict({
        requestedRuns: STUB_RUNS,
        runs: p1.runs,
        finished: true,
        unmappedSignals: [],
        unsupportedPeripherals: [],
        untriggeredRules: ['Some sentence.'],
      }),
    );
    expect(p1.result?.verdict.verdict).toBe("COULDN'T TELL");
    const p2 = progressOf(h.runSlice(1));
    const p3 = progressOf(h.runSlice(7));
    expect(p2.result).toEqual(p1.result);
    expect(p3.result).toEqual(p1.result);
    expect(s.calls.length).toBe(1);
  });
});

describe('Campaign when the Untriggered_Rule function fails (Req 13.9)', () => {
  const bad: [string, () => unknown][] = [
    [
      'throws',
      () => {
        throw new Error('boom');
      },
    ],
    ['returns a string', () => 'not an array'],
    ['returns an object', () => ({ length: 0 })],
    ['returns an array holding a number', () => ['ok', 3]],
  ];

  it.each(bad)('gives a sticky internal-error when it %s', (_name, fn) => {
    const find = fn as unknown as CampaignConfig['findUntriggeredRules'];
    const h = handleOf(stubCfg({ findUntriggeredRules: find }));
    const first = h.runSlice(100);
    expect(first).toMatchObject({ kind: 'internal-error' });
    expect((first as { message: string }).message).toMatch(/untriggered-rule function failed/);
    expect('result' in first).toBe(false);
    expect('verdict' in first).toBe(false);
    // Every later call gives the same error and no CampaignResult.
    for (const k of [1, 3, 100]) {
      const again = h.runSlice(k);
      expect(again).toEqual(first);
      expect('result' in again).toBe(false);
    }
    // state() still holds every completed Run.
    const st = h.state();
    expect(st.nextRunIndex).toBe(STUB_RUNS);
    expect(st.runs.map((r) => r.runIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('fails on the slice that finishes the Campaign, with the earlier Runs kept', () => {
    const h = handleOf(
      stubCfg({
        findUntriggeredRules: (() => {
          throw new Error('boom');
        }) as CampaignConfig['findUntriggeredRules'],
      }),
    );
    expect(progressOf(h.runSlice(3)).finished).toBe(false);
    expect(h.runSlice(2)).toMatchObject({ kind: 'internal-error' });
    expect(h.state().runs.length).toBe(STUB_RUNS);
  });
});

// ---------------------------------------------------------------------------
// Part B: buildCampaignConfig (Req 13.10, 13.11, 13.12), no emulator
// ---------------------------------------------------------------------------

const LED_ON_TOO_LONG: Rule = { form: 'notLongerThan', condition: { op: 'eq', signal: 'LED', value: 1 }, ms: 1000 };
const BUTTON_RESPOND: Rule = {
  form: 'respond',
  trigger: { op: 'rise', of: { op: 'eq', signal: 'BUTTON', value: 1 } },
  withinMs: 1,
  expect: { op: 'eq', signal: 'LED', value: 1 },
};
const RULE_SET: RuleSet = [LED_ON_TOO_LONG, BUTTON_RESPOND];

describe('buildCampaignConfig (Req 13.10 to 13.12)', () => {
  const rest = {
    hex: ':00000001FF',
    gremlinSet: [{ id: 'masher' as const }],
    campaignSeed: 5,
    runs: 3,
    runCycles: 1_000,
    maxStepCycles: 400,
    stopOnFirstViolation: false,
    bridgeFactory: stubFactory,
  };

  it('returns a config whose fixture is the given value and whose other fields equal rest', () => {
    const given = structuredClone(FIXTURE); // deep-equal to FIXTURE but a different object
    const built = buildCampaignConfig(RULE_SET, given, rest);
    if (!built.ok) throw new Error(`expected ok, got ${JSON.stringify(built.reasons)}`);
    const cfg = built.config;
    expect(cfg.fixture).toBe(given);
    expect(cfg.fixture).not.toBe(FIXTURE);
    for (const key of Object.keys(rest) as (keyof typeof rest)[]) {
      expect(cfg[key]).toBe(rest[key]);
    }
    expect(Object.keys(cfg).sort()).toEqual(
      [...Object.keys(rest), 'fixture', 'checker', 'checkerSignals', 'findUntriggeredRules'].sort(),
    );
    const compiled = compileRuleSet(RULE_SET, given);
    if (!compiled.ok) throw new Error('compile failed');
    expect(cfg.checkerSignals).toEqual(compiled.compiled.checkerSignals);
    expect(cfg.checkerSignals).toEqual(['LED', 'BUTTON']);
    expect(typeof cfg.checker).toBe('function');
    expect(typeof cfg.findUntriggeredRules).toBe('function');
  });

  it('gives the same Runs and result as a config wired by hand from compileRuleSet', () => {
    const built = buildCampaignConfig(RULE_SET, FIXTURE, rest);
    if (!built.ok) throw new Error('build failed');
    const c = compileRuleSet(RULE_SET, FIXTURE);
    if (!c.ok) throw new Error('compile failed');
    const hand: CampaignConfig = {
      ...rest,
      fixture: FIXTURE,
      checker: c.compiled.checker,
      checkerSignals: c.compiled.checkerSignals,
      findUntriggeredRules: c.compiled.findUntriggeredRules,
    };
    const a = handleOf(built.config);
    const b = handleOf(hand);
    const pa = progressOf(a.runSlice(3));
    const pb = progressOf(b.runSlice(3));
    expect(pa).toEqual(pb);
    expect(pa.finished).toBe(true);
  });

  it('returns Reasons and no config for an invalid Rule_Set, without throwing', () => {
    const MARK = 'MARKER_VALUE_XYZ';
    const invalid = [{ form: 'never', condition: { op: 'eq', signal: 'LED', value: 7 }, [MARK]: MARK }];
    let out: ReturnType<typeof buildCampaignConfig> | undefined;
    expect(() => {
      out = buildCampaignConfig(invalid, FIXTURE, rest);
    }).not.toThrow();
    if (out === undefined || out.ok) throw new Error('expected a failure');
    expect('config' in out).toBe(false);
    expect(out.reasons.length).toBeGreaterThan(0);
    for (const r of out.reasons) {
      expect(typeof r).toBe('string');
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.length).toBeLessThanOrEqual(200);
      expect(r).toMatch(/^Rule set: /);
      expect(r).not.toContain(MARK);
    }
    for (const bad of [null, undefined, 5, 'text', [], {}]) {
      expect(() => buildCampaignConfig(bad, FIXTURE, rest)).not.toThrow();
      const r = buildCampaignConfig(bad, FIXTURE, rest);
      expect(r.ok).toBe(false);
      expect('config' in r).toBe(false);
    }
  });

  it('returns a Reason naming the Fixture error kind, and no config, for a rejected Fixture', () => {
    const MARK = 'MARKERSIG';
    const rejected = {
      pins: [{ signal: MARK, port: 'D', bit: 2, direction: 'input', activeLevel: 'sideways' }],
    } as unknown as Fixture;
    let out: ReturnType<typeof buildCampaignConfig> | undefined;
    expect(() => {
      out = buildCampaignConfig(RULE_SET, rejected, rest);
    }).not.toThrow();
    if (out === undefined || out.ok) throw new Error('expected a failure');
    expect('config' in out).toBe(false);
    expect(out.reasons).toEqual(['Fixture: rejected with kind invalid-fixture.']);
    for (const r of out.reasons) {
      expect(r).not.toContain(MARK);
      expect(r).not.toContain('activeLevel');
    }
    expect(() => buildCampaignConfig(RULE_SET, null as unknown as Fixture, rest)).not.toThrow();
    expect(buildCampaignConfig(RULE_SET, null as unknown as Fixture, rest).ok).toBe(false);
  });

  it('never returns a config whose fixture differs from the given one (toBe)', () => {
    const fixtures: Fixture[] = [
      FIXTURE,
      structuredClone(FIXTURE),
      { clockHz: 16_000_000, pins: structuredClone(FIXTURE.pins) },
    ];
    for (const f of fixtures) {
      const built = buildCampaignConfig(RULE_SET, f, rest);
      if (!built.ok) throw new Error('build failed');
      expect(built.config.fixture).toBe(f);
    }
  });

  it('a hand-wired config with a different Fixture runs with no equality check (Req 13.12)', () => {
    // One short Rule (no window), so the 200-unit cut of the reason keeps the unmapped-signal part.
    const c = compileRuleSet([{ form: 'never', condition: { op: 'eq', signal: 'LED', value: 1 } }], FIXTURE);
    if (!c.ok) throw new Error('compile failed');
    // The Campaign runs on a Fixture with no LED pin. The compiled checkerSignals still name LED.
    const other: Fixture = { pins: [{ signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' }] };
    const cfg: CampaignConfig = {
      ...stubCfg({ runs: 2, fixture: other }),
      checker: c.compiled.checker,
      checkerSignals: c.compiled.checkerSignals,
      findUntriggeredRules: c.compiled.findUntriggeredRules,
    };
    const res = runCampaign(cfg);
    expect('kind' in res).toBe(false);
    const r = resultOf(res);
    expect(r.verdict.verdict).toBe("COULDN'T TELL");
    expect((r.verdict as { reason: string }).reason).toContain('Signals not mapped to a pin: LED');
  });
});

// ---------------------------------------------------------------------------
// Part C: blink_button HEX, short Runs (Req 13.1, 13.4, 13.5)
// ---------------------------------------------------------------------------

const HEX = readFileSync(HEX_PATH, 'utf-8');

const EMU = {
  hex: HEX,
  gremlinSet: [{ id: 'masher' as const }],
  campaignSeed: 11,
  runs: 3,
  runCycles: 200_000,
  maxStepCycles: 50_000,
};

describe('blink_button: a Rule on a signal the Fixture lacks (Req 13.4)', () => {
  it('gives the unmapped-signal reason and never a pass verdict', { timeout: 120_000 }, () => {
    const rule: Rule = { form: 'never', condition: { op: 'eq', signal: 'GHOST', value: 1 } };
    const sentence = render(rule);
    expect(sentence.ok).toBe(true);
    const built = buildCampaignConfig([rule], FIXTURE, EMU);
    if (!built.ok) throw new Error(`build failed: ${JSON.stringify(built.reasons)}`);
    expect(built.config.checkerSignals).toEqual(['GHOST']);
    const res = resultOf(runCampaign(built.config));
    expect(res.verdict.verdict).not.toBe('HELD');
    expect(res.verdict.verdict).toBe("COULDN'T TELL");
    const reason = (res.verdict as { reason: string }).reason;
    expect(reason.length).toBeLessThanOrEqual(200);
    expect(reason).toContain('Signals not mapped to a pin: GHOST');
  });
});

describe('blink_button: a compiled Rule_Set through every route (Req 13.1, 13.5)', () => {
  const sets: [string, RuleSet][] = [
    ['LED never on in a short run, plus a respond Rule', [{ form: 'never', condition: { op: 'eq', signal: 'LED', value: 1 } }, BUTTON_RESPOND]],
    ['BUTTON never pressed, plus a hold Rule', [
      { form: 'never', condition: { op: 'eq', signal: 'BUTTON', value: 0 } },
      { form: 'hold', after: { op: 'fall', of: { op: 'eq', signal: 'BUTTON', value: 1 } }, durationMs: 1, expect: { op: 'eq', signal: 'LED', value: 0 } },
    ]],
  ];

  function wired(ruleSet: RuleSet, extra: Partial<CampaignConfig> = {}): CampaignConfig {
    const c = compileRuleSet(ruleSet, FIXTURE);
    if (!c.ok) throw new Error(`compile failed: ${JSON.stringify(c.reasons)}`);
    return {
      ...EMU,
      fixture: FIXTURE,
      checker: c.compiled.checker,
      checkerSignals: c.compiled.checkerSignals,
      findUntriggeredRules: c.compiled.findUntriggeredRules,
      ...extra,
    };
  }

  it.each(sets)(
    'runCampaign, runSlice(k) for k 1..N and resumeCampaign from a JSON round trip agree: %s',
    { timeout: 120_000 },
    (_name, ruleSet) => {
      const n = EMU.runs;
      const whole = resultOf(runCampaign(wired(ruleSet)));

      // Reference Runs from one slice of N.
      const ref = handleOf(wired(ruleSet));
      const refProgress = progressOf(ref.runSlice(n));
      expect(refProgress.result).toEqual(whole);
      const refState = ref.state();
      expect(Object.keys(refState).sort()).toEqual(['nextRunIndex', 'runs']);

      // runSlice(k) for every k from 1 to N.
      for (let k = 1; k <= n; k++) {
        const h = handleOf(wired(ruleSet));
        let p = progressOf(h.runSlice(k));
        let guard = 0;
        while (!p.finished && guard++ < n + 1) p = progressOf(h.runSlice(k));
        expect(p.finished).toBe(true);
        expect(p.result).toEqual(whole);
        expect(h.state()).toEqual(refState);
        expect(Object.keys(h.state()).sort()).toEqual(['nextRunIndex', 'runs']);
      }

      // resumeCampaign from a JSON round-tripped state at each slice boundary, with a fresh compile.
      for (let j = 1; j < n; j++) {
        const first = handleOf(wired(ruleSet));
        progressOf(first.runSlice(j));
        const saved = JSON.parse(JSON.stringify(first.state())) as CampaignState;
        expect(Object.keys(saved).sort()).toEqual(['nextRunIndex', 'runs']);
        const h = resumedOf(wired(ruleSet), saved);
        const p = progressOf(h.runSlice(n));
        expect(p.finished).toBe(true);
        expect(p.result).toEqual(whole);
        expect(h.state()).toEqual(refState);
      }
    },
  );

  it('the same Rule_Set built with buildCampaignConfig gives the same CampaignResult', { timeout: 120_000 }, () => {
    const ruleSet = sets[0][1];
    const built = buildCampaignConfig(ruleSet, FIXTURE, EMU);
    if (!built.ok) throw new Error('build failed');
    expect(resultOf(runCampaign(built.config))).toEqual(resultOf(runCampaign(wired(ruleSet))));
  });
});
