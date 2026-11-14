/// <reference types="node" />
// Campaign handle examples (task 24.2 plus checks B). Kept apart from campaign.test.ts.
// Real-bridge tests use the blink_button HEX. The default-settings tests use a counting stub
// bridge so 8,000,000-cycle Runs stay cheap. No avr8js import here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign, resumeCampaign, runCampaign } from '../campaign.js';
import type { BridgeFactory, CampaignConfig, CampaignHandle } from '../campaign.js';
import type { Checker } from '../checker.js';
import { isBridgeError } from '../emulator-bridge.js';
import type { EmulatorBridgeInterface } from '../emulator-bridge.js';
import { isEngineError } from '../errors.js';
import type { CampaignState, Fixture, SliceProgress } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEX = readFileSync(resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'), 'utf-8');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const RUN_CYCLES = 60_000;
const MAX_STEP = 30_000;
const quiet: Checker = () => ({ violation: null });

function cfg(extra: Partial<CampaignConfig> = {}): CampaignConfig {
  return {
    hex: HEX,
    fixture: FIXTURE,
    gremlinSet: [{ id: 'masher' }],
    campaignSeed: 11,
    checker: quiet,
    runs: 5,
    runCycles: RUN_CYCLES,
    maxStepCycles: MAX_STEP,
    ...extra,
  };
}

function handleOf(c: CampaignConfig): CampaignHandle {
  const h = createCampaign(c);
  if ('kind' in h) throw new Error(`expected a handle, got ${h.kind}`);
  return h;
}

function progressOf(p: SliceProgress | { kind: string }): SliceProgress {
  if ('kind' in p) throw new Error(`expected progress, got ${p.kind}`);
  return p;
}

/** Counts factory calls and returns a fixed bridge error. */
function failingFactory() {
  const calls: unknown[][] = [];
  const factory: BridgeFactory = (...args) => {
    calls.push(args);
    return { kind: 'invalid-hex', message: 'probe failure' };
  };
  return { factory, calls };
}

/** Stub bridge: cycleCount moves by exactly what advance was asked for. Records requests. */
function stubFactory() {
  const state = { requests: [] as number[], maxCycle: 0, bridges: 0 };
  const factory: BridgeFactory = () => {
    state.bridges++;
    let cycles = 0;
    const b: EmulatorBridgeInterface = {
      advance(n) {
        state.requests.push(n);
        cycles += n;
        state.maxCycle = Math.max(state.maxCycle, cycles);
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
  return { factory, state };
}

describe('campaign defaults', { timeout: 60_000 }, () => {
  it('N 64, Run_Cycles 8,000,000, maxStepCycles 160,000, stopOnFirstViolation true', { timeout: 60_000 }, () => {
    const { factory, state } = stubFactory();
    let violateAt = -1;
    const checker: Checker = (o) => (o.runIndex === violateAt ? { violation: { rule: 'r', cycle: o.cycle } } : { violation: null });
    const base: CampaignConfig = { hex: HEX, fixture: FIXTURE, gremlinSet: [], campaignSeed: 1, checker, bridgeFactory: factory };

    const p = progressOf(handleOf(base).runSlice(1000));
    expect(p.total).toBe(64);
    expect(p.runsCompleted).toBe(64);
    expect(p.finished).toBe(true);
    expect(state.maxCycle).toBe(8_000_000);
    expect(Math.max(...state.requests)).toBe(160_000);

    // Default stopOnFirstViolation true: a violation at Run 3 stops the Slice there.
    violateAt = 3;
    const q = progressOf(handleOf(base).runSlice(1000));
    expect(q.runsCompleted).toBe(4);
    expect(q.result?.verdict.verdict).toBe('BROKE');
  });

  it('defaultRunCycles is used when runCycles is absent, and runCycles wins when both are given', { timeout: 60_000 }, () => {
    const a = stubFactory();
    progressOf(handleOf({ ...cfg({ runs: 1, runCycles: undefined, maxStepCycles: undefined }), defaultRunCycles: 1_000_000, gremlinSet: [], bridgeFactory: a.factory }).runSlice(1));
    expect(a.state.maxCycle).toBe(1_000_000);
    const b = stubFactory();
    progressOf(handleOf({ ...cfg({ runs: 1, maxStepCycles: undefined }), runCycles: 500_000, defaultRunCycles: 1_000_000, gremlinSet: [], bridgeFactory: b.factory }).runSlice(1));
    expect(b.state.maxCycle).toBe(500_000);
  });
});

describe('invalid-campaign settings', { timeout: 60_000 }, () => {
  const BAD_NUMBERS = [0, -1, 1.5, NaN, Infinity, -Infinity];

  it.each(BAD_NUMBERS)('runs %s is invalid-campaign', (v) => {
    const { factory, calls } = failingFactory();
    expect(createCampaign(cfg({ runs: v, bridgeFactory: factory }))).toMatchObject({ kind: 'invalid-campaign' });
    expect(calls.length).toBe(0);
  });

  it.each(BAD_NUMBERS)('maxStepCycles %s is invalid-campaign', (v) => {
    const { factory, calls } = failingFactory();
    expect(createCampaign(cfg({ maxStepCycles: v, bridgeFactory: factory }))).toMatchObject({ kind: 'invalid-campaign' });
    expect(calls.length).toBe(0);
  });

  it.each([['yes'], [1], [0]])('stopOnFirstViolation %j is invalid-campaign', (v) => {
    const { factory, calls } = failingFactory();
    const c = cfg({ bridgeFactory: factory, stopOnFirstViolation: v as unknown as boolean });
    expect(createCampaign(c)).toMatchObject({ kind: 'invalid-campaign' });
    expect(calls.length).toBe(0);
  });

  // CHECK B. createCampaign has no PRNG seam: the PRNG is created inside buildEventList, which only
  // runOne reaches, and runOne only runs from runSlice. So zero draws is shown structurally: an error
  // comes back instead of a handle (no runSlice exists), zero bridges are created, zero Checker calls.
  it.each([0, 1.5, NaN, Infinity, -Infinity, -1, 4_294_967_297])(
    'runCycles %s is rejected before any bridge creation or Run',
    (v) => {
      const { factory, calls } = failingFactory();
      let checkerCalls = 0;
      const out = createCampaign(cfg({ runCycles: v, bridgeFactory: factory, checker: () => (checkerCalls++, { violation: null }) }));
      expect(out).toMatchObject({ kind: 'invalid-campaign' });
      expect('runSlice' in out).toBe(false);
      expect(calls.length).toBe(0);
      expect(checkerCalls).toBe(0);
      // runCampaign and resumeCampaign reject the same way.
      expect(runCampaign(cfg({ runCycles: v, bridgeFactory: factory }))).toMatchObject({ kind: 'invalid-campaign' });
      expect(resumeCampaign(cfg({ runCycles: v, bridgeFactory: factory }), { nextRunIndex: 0, runs: [] })).toMatchObject({
        kind: 'invalid-campaign',
      });
      expect(calls.length).toBe(0);
    },
  );

  // Validation only: the factory answers the probe with a bridge error, so no Run can start.
  it.each([1, 4_294_967_295, 4_294_967_296])('runCycles %s passes validation (probe reached, no Run)', (v) => {
    const { factory, calls } = failingFactory();
    let checkerCalls = 0;
    const out = createCampaign(cfg({ runCycles: v, bridgeFactory: factory, checker: () => (checkerCalls++, { violation: null }) }));
    expect(isBridgeError(out)).toBe(true);
    expect(out).toMatchObject({ kind: 'invalid-hex', message: 'probe failure' });
    expect(calls.length).toBe(1);
    expect((calls[0][2] as unknown[]).length).toBe(0);
    expect(checkerCalls).toBe(0);
  });
});

describe('invalid HEX', { timeout: 60_000 }, () => {
  it('gives a bridge error before any Run and never HELD', { timeout: 60_000 }, () => {
    let checkerCalls = 0;
    const c = cfg({ hex: 'not a hex file', checker: () => (checkerCalls++, { violation: null }) });
    const made = createCampaign(c);
    expect(isBridgeError(made)).toBe(true);
    expect('runSlice' in made).toBe(false);
    const ran = runCampaign(c);
    expect(isBridgeError(ran)).toBe(true);
    expect('verdict' in ran).toBe(false);
    expect(JSON.stringify(ran)).not.toContain('HELD');
    expect(checkerCalls).toBe(0);
  });
});

describe('scripted Checkers', { timeout: 60_000 }, () => {
  it('stopOnFirstViolation true stops at the violating Run even with k above the Runs left', { timeout: 60_000 }, () => {
    const seenRuns = new Set<number>();
    const checker: Checker = (o) => {
      seenRuns.add(o.runIndex);
      return o.runIndex === 2 && o.stepIndex === 0 ? { violation: { rule: 'r2', cycle: o.cycle } } : { violation: null };
    };
    const h = handleOf(cfg({ checker }));
    const p = progressOf(h.runSlice(100));
    expect(p.runsCompleted).toBe(3);
    expect(p.nextRunIndex).toBe(3);
    expect(p.finished).toBe(true);
    expect(p.result).toMatchObject({ violatingRunIndex: 2, requestedRuns: 5, runsCompleted: 3 });
    expect(p.result?.verdict.verdict).toBe('BROKE');
    expect([...seenRuns].sort()).toEqual([0, 1, 2]);

    // A finished handle returns the final progress and runs nothing.
    const again = progressOf(h.runSlice(1));
    expect(again.finished).toBe(true);
    expect(again.runsCompleted).toBe(3);
    expect(again.result).toEqual(p.result);
    expect([...seenRuns].sort()).toEqual([0, 1, 2]);
  });

  it('stopOnFirstViolation false runs all N and records the earliest violating Run_Index', { timeout: 60_000 }, () => {
    const checker: Checker = (o) =>
      (o.runIndex === 1 || o.runIndex === 3) && o.stepIndex === 0 ? { violation: { rule: 'r', cycle: o.cycle } } : { violation: null };
    const p = progressOf(handleOf(cfg({ checker, stopOnFirstViolation: false })).runSlice(100));
    expect(p.runsCompleted).toBe(5);
    expect(p.finished).toBe(true);
    expect(p.runs.map((r) => r.violation !== null)).toEqual([false, true, false, true, false]);
    expect(p.result?.violatingRunIndex).toBe(1);
    expect(p.result?.verdict.verdict).toBe('BROKE');
  });

  it('a quiet Campaign finishes with HELD and the real run count', { timeout: 60_000 }, () => {
    const p = progressOf(handleOf(cfg({ runs: 3 })).runSlice(3));
    expect(p.result?.verdict).toEqual({
      verdict: 'HELD',
      text: 'No violation found in 3 runs of this gremlin set. Not a proof.',
      runs: 3,
    });
  });
});

describe('slice edge cases', { timeout: 60_000 }, () => {
  it.each([0, -1, 1.5, NaN, Infinity, -Infinity])('k = %s is invalid-campaign and leaves state untouched', { timeout: 60_000 }, (k) => {
    let checkerCalls = 0;
    const h = handleOf(cfg({ checker: () => (checkerCalls++, { violation: null }) }));
    progressOf(h.runSlice(2));
    const before = h.state();
    const callsBefore = checkerCalls;
    expect(h.runSlice(k)).toMatchObject({ kind: 'invalid-campaign' });
    expect(h.state()).toEqual(before);
    expect(checkerCalls).toBe(callsBefore);
  });

  it('runs min(k, N - completed) Runs per Slice in ascending order', { timeout: 60_000 }, () => {
    const h = handleOf(cfg());
    const a = progressOf(h.runSlice(2));
    expect([a.runsCompleted, a.finished, a.result]).toEqual([2, false, null]);
    const b = progressOf(h.runSlice(2));
    expect([b.runsCompleted, b.finished]).toEqual([4, false]);
    const c = progressOf(h.runSlice(2));
    expect([c.runsCompleted, c.finished, c.nextRunIndex]).toEqual([5, true, 5]);
    expect(c.runs.map((r) => r.runIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(c.result?.verdict.verdict).toBe('HELD');
  });

  it('a finished handle runs nothing more', { timeout: 60_000 }, () => {
    let checkerCalls = 0;
    const h = handleOf(cfg({ runs: 2, checker: () => (checkerCalls++, { violation: null }) }));
    const done = progressOf(h.runSlice(5));
    const calls = checkerCalls;
    const again = progressOf(h.runSlice(5));
    expect(again).toEqual(done);
    expect(checkerCalls).toBe(calls);
  });
});

describe('state()', { timeout: 60_000 }, () => {
  it('is plain data, JSON round-trips, and mutating it does not touch the handle', { timeout: 60_000 }, () => {
    const h = handleOf(cfg({ runs: 3 }));
    progressOf(h.runSlice(2));
    const s = h.state();
    expect(Object.keys(s).sort()).toEqual(['nextRunIndex', 'runs']);
    expect(s.nextRunIndex).toBe(2);
    expect(s.runs.length).toBe(2);
    expect(Object.getPrototypeOf(s)).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(structuredClone(s)).toEqual(s);

    const snapshot = JSON.stringify(s);
    s.runs.pop();
    s.runs[0].appliedInputs.length = 0;
    s.nextRunIndex = 99;
    expect(JSON.stringify(h.state())).toBe(snapshot);
  });

  it('resume from a state reaches the same result as an uninterrupted Campaign', { timeout: 60_000 }, () => {
    const full = progressOf(handleOf(cfg({ runs: 4 })).runSlice(4));
    const h = handleOf(cfg({ runs: 4 }));
    progressOf(h.runSlice(2));
    const resumed = resumeCampaign(cfg({ runs: 4 }), JSON.parse(JSON.stringify(h.state())) as CampaignState);
    if ('kind' in resumed) throw new Error(resumed.kind);
    expect(progressOf(resumed.runSlice(10))).toEqual(full);
  });
});

describe('resume with inconsistent state', { timeout: 60_000 }, () => {
  function goodState(): CampaignState {
    const h = handleOf(cfg({ runs: 4 }));
    progressOf(h.runSlice(2));
    return h.state();
  }
  const violatingState = (): CampaignState => {
    const h = handleOf(
      cfg({
        runs: 4,
        stopOnFirstViolation: false,
        checker: (o) => (o.runIndex === 0 && o.stepIndex === 0 ? { violation: { rule: 'r', cycle: o.cycle } } : { violation: null }),
      }),
    );
    progressOf(h.runSlice(2));
    return h.state();
  };

  it.each<[string, () => CampaignState, Partial<CampaignConfig>?]>([
    ['nextRunIndex above stored runs', () => ({ ...goodState(), nextRunIndex: 3 })],
    ['nextRunIndex below stored runs', () => ({ ...goodState(), nextRunIndex: 1 })],
    ['runs missing', () => ({ nextRunIndex: 0 }) as unknown as CampaignState],
    ['runs not an array', () => ({ nextRunIndex: 0, runs: {} }) as unknown as CampaignState],
    ['more runs than N', () => goodState(), { runs: 1 }],
    [
      'runIndex out of place',
      () => {
        const s = goodState();
        s.runs[1].runIndex = 7;
        return s;
      },
    ],
    ['violation followed by later runs with stopOnFirstViolation true', violatingState],
  ])('%s gives invalid-campaign', { timeout: 60_000 }, (_name, make, extra) => {
    const out = resumeCampaign(cfg({ runs: 4, ...extra }), make());
    expect(out).toMatchObject({ kind: 'invalid-campaign' });
    expect(isEngineError(out)).toBe(true);
  });

  it('the same violating state is accepted with stopOnFirstViolation false', { timeout: 60_000 }, () => {
    const out = resumeCampaign(cfg({ runs: 4, stopOnFirstViolation: false }), violatingState());
    expect('runSlice' in out).toBe(true);
  });
});
