/// <reference types="node" />
// Campaign runner examples (task 22.2). Task 24.2 appends campaign-level examples below.
// Uses the blink_button HEX on the real bridge. Time is bridge cycleCount only.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { runOne } from '../campaign.js';
import type { BridgeFactory, RunConfig } from '../campaign.js';
import type { Checker, CheckerObservation } from '../checker.js';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import { generateWithPrng } from '../event-list.js';
import { isEngineError } from '../errors.js';
import type { Prng } from '../prng.js';
import type {
  AppliedInput,
  Fixture,
  OutputEvent,
  RunResult,
  ScheduledInput,
} from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEX_PATH = resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const RUN_CYCLES = 200_000;
const MAX_STEP = 50_000;

function config(checker: Checker, extra: Partial<RunConfig> = {}): RunConfig {
  return {
    hex: HEX,
    fixture: FIXTURE,
    gremlinSet: [{ id: 'masher' }],
    campaignSeed: 7,
    checker,
    runCycles: RUN_CYCLES,
    maxStepCycles: MAX_STEP,
    ...extra,
  };
}

const quiet: Checker = () => ({ violation: null });

function asRun(r: ReturnType<typeof runOne>): RunResult {
  if ('kind' in r) throw new Error(`expected a RunResult, got ${r.kind}`);
  return r;
}

describe('runOne examples', { timeout: 60_000 }, () => {
  it('calls the Checker once per Step plus the end-of-run call, with only new data', { timeout: 60_000 }, () => {
    const seen: CheckerObservation[] = [];
    const res = asRun(runOne(config((o) => (seen.push(o), { violation: null })), 3));

    expect(seen.length).toBeGreaterThanOrEqual(2);
    const steps = seen.slice(0, -1);
    const last = seen[seen.length - 1];
    expect(steps.every((o) => !o.endOfRun)).toBe(true);
    expect(last.endOfRun).toBe(true);
    expect(seen.map((o) => o.stepIndex)).toEqual(seen.map((_, i) => i));
    expect(seen.every((o) => o.runIndex === 3)).toBe(true);

    // Concatenated per-call data equals the Run's data: nothing repeated, nothing dropped.
    const outputs: OutputEvent[] = seen.flatMap((o) => [...o.outputEvents]);
    const applied: AppliedInput[] = seen.flatMap((o) => [...o.appliedInputs]);
    expect(outputs).toEqual(res.outputEvents);
    expect(applied).toEqual(res.appliedInputs);
    expect(res.appliedInputs.length).toBeGreaterThan(0);

    // End-of-run call carries no new data.
    expect(last.outputEvents).toEqual([]);
    expect(last.appliedInputs).toEqual([]);
    expect(last.diagnostics).toEqual([]);
    // Step cycles strictly increase.
    for (let i = 1; i < steps.length; i++) expect(steps[i].cycle).toBeGreaterThan(steps[i - 1].cycle);
  });

  it('a scripted Violation stops the Run with no further Checker call', { timeout: 60_000 }, () => {
    let calls = 0;
    const res = asRun(
      runOne(
        config((o) => {
          calls++;
          return o.stepIndex === 1 ? { violation: { rule: 'r1', cycle: o.cycle } } : { violation: null };
        }),
        0,
      ),
    );
    expect(calls).toBe(2);
    expect(res.violation?.rule).toBe('r1');
    expect(res.endCycle).toBeLessThan(RUN_CYCLES);
  });

  it('the end-of-run cycle comes from the bridge cycleCount', { timeout: 60_000 }, () => {
    let finalCount = -1;
    const factory: BridgeFactory = (hex, fixture, events) => {
      const b = EmulatorBridge.create(hex, fixture, events);
      if (isBridgeError(b)) return b;
      return {
        advance: (n) => {
          const r = b.advance(n);
          finalCount = b.cycleCount;
          return r;
        },
        schedule: (e) => b.schedule(e),
        supports: (c) => b.supports(c),
        get clockHz() {
          return b.clockHz;
        },
        get cycleCount() {
          return b.cycleCount;
        },
      };
    };
    let endCycle = -1;
    const res = asRun(
      runOne(config((o) => (o.endOfRun && (endCycle = o.cycle), { violation: null }), { bridgeFactory: factory }), 0),
    );
    expect(endCycle).toBe(finalCount);
    expect(res.endCycle).toBe(finalCount);
    expect(finalCount).toBeGreaterThanOrEqual(RUN_CYCLES);
  });

  it('a failing bridgeFactory gives bridge-error with the Run_Index and no HELD data', () => {
    const factory: BridgeFactory = () => ({ kind: 'invalid-hex', message: 'scripted failure' });
    const out = runOne(config(quiet, { bridgeFactory: factory }), 5);
    expect(out).toMatchObject({ kind: 'bridge-error', runIndex: 5, message: 'scripted failure' });
    expect('violation' in out).toBe(false);
    expect('endCycle' in out).toBe(false);
  });

  it('a throwing Checker gives checker-error with Run_Index and cycle', { timeout: 60_000 }, () => {
    const out = runOne(
      config(() => {
        throw new Error('boom');
      }),
      4,
    );
    expect(isEngineError(out)).toBe(true);
    expect(out).toMatchObject({ kind: 'checker-error', runIndex: 4 });
    const e = out as { cycle: number; message: string };
    expect(Number.isInteger(e.cycle)).toBe(true);
    expect(e.cycle).toBeGreaterThan(0);
    expect(e.message).toContain('boom');
  });

  it.each([
    ['empty rule', (o: CheckerObservation) => ({ violation: { rule: '', cycle: o.cycle } })],
    ['non-integer cycle', (o: CheckerObservation) => ({ violation: { rule: 'r', cycle: o.cycle - 0.5 } })],
    ['cycle above observation.cycle', (o: CheckerObservation) => ({ violation: { rule: 'r', cycle: o.cycle + 1 } })],
  ])('a malformed outcome (%s) gives checker-error with Run_Index and cycle', { timeout: 60_000 }, (_name, make) => {
    let firstCycle = -1;
    const out = runOne(
      config((o) => {
        if (firstCycle < 0) firstCycle = o.cycle;
        return make(o);
      }),
      2,
    );
    expect(out).toMatchObject({ kind: 'checker-error', runIndex: 2, cycle: firstCycle });
  });

  it('collects cannotCheck entries without repeats', { timeout: 60_000 }, () => {
    const res = asRun(
      runOne(
        config((o) => ({
          violation: null,
          cannotCheck: [
            { rule: 'a', reason: 'no pin' },
            ...(o.stepIndex === 1 ? [{ rule: 'b', reason: 'no adc' }] : []),
          ],
        })),
        0,
      ),
    );
    expect(res.cannotCheck).toEqual([
      { rule: 'a', reason: 'no pin' },
      { rule: 'b', reason: 'no adc' },
    ]);
  });
});

// CHECK A: a Rest_Event and a gremlin event on the same signal at the same cycle.
// Fixture: blink_button pin map, BUTTON = PD2 input, activeLevel default "low", with
// restState "active" (allowed by validateFixture). LED = PB5 output.
// A Dropout whose start is drawn as 0 releases BUTTON at cycle 0, the same cycle as the
// Rest_Event that presses it. List order must be kept, so the later event (release) wins.
describe('CHECK A: Rest_Event and Dropout on the same signal at cycle 0', { timeout: 60_000 }, () => {
  const REST_FIXTURE: Fixture = {
    pins: [
      { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input', restState: 'active' },
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    ],
  };
  const RUN = 20_000_000;
  const DROPOUT_GAP = 12_000_000;

  /** Scripted generator: nextInt returns queued values, each checked against its range. */
  function scripted(values: number[]): Prng & { left(): number } {
    const q = values.slice();
    return {
      nextU32: () => {
        throw new Error('nextU32 not expected');
      },
      nextInt: (min, max) => {
        const v = q.shift();
        if (v === undefined) throw new Error('script exhausted');
        if (v < min || v > max) throw new Error(`scripted ${v} outside ${min}..${max}`);
        return v;
      },
      drawCount: 0,
      left: () => q.length,
    };
  }

  // Toggles after the setup() write (cycle ~263) are the loop() toggles.
  function ledToggles(outputs: readonly OutputEvent[]): number[] {
    return outputs.filter((e) => e.signal === 'LED' && e.cycle > 100_000 && (e.value === 0 || e.value === 1)).map((e) => e.cycle);
  }

  function runList(list: ScheduledInput[]) {
    const b = EmulatorBridge.create(HEX, REST_FIXTURE, list);
    if (isBridgeError(b)) throw new Error(`bridge rejected the list: ${b.message}`);
    const r = b.advance(10_000_000);
    if (isBridgeError(r)) throw new Error(`advance failed: ${r.message}`);
    return r;
  }

  it('bridge accepts both events and applies them in list order; the later one wins', () => {
    const prng = scripted([0, 0, DROPOUT_GAP]); // pin index, start, gap
    const gen = generateWithPrng(
      {
        fixture: REST_FIXTURE,
        gremlinSet: [{ id: 'dropout', params: { gapCycles: { min: DROPOUT_GAP, max: DROPOUT_GAP } } }],
        runCycles: RUN,
      },
      prng,
    );
    if ('kind' in gen) throw new Error(`generation failed: ${gen.message}`);
    expect(prng.left()).toBe(0);
    expect(gen.events.map((e) => [e.gremlinId, e.signal, 'value' in e ? e.value : e.analog, e.cycle])).toEqual([
      ['rest', 'BUTTON', 0, 0],
      ['dropout', 'BUTTON', 'release', 0],
      ['dropout', 'BUTTON', 0, DROPOUT_GAP],
    ]);

    const r = runList(gen.events);
    // Only the two cycle-0 events fall inside the 10M-cycle window; the gap press is later.
    expect(r.appliedInputs.map((a) => [a.gremlinId, a.signal, a.value, a.cycle])).toEqual(
      gen.events.filter((e) => e.cycle < 10_000_000).map((e) => [e.gremlinId, e.signal, 'value' in e ? e.value : e.analog, e.cycle]),
    );

    // Pin-state effect: released (the later event) toggles the LED about 8M cycles
    // apart. Pressed from cycle 0 would toggle about 1.6M cycles apart.
    const t = ledToggles(r.outputEvents);
    expect(t.length).toBeGreaterThan(0);
    expect(t[0]).toBeGreaterThan(7_000_000);

    // Control: the same two events in the opposite order leave the pin pressed.
    const rev = runList([gen.events[1], gen.events[0]]);
    expect(rev.appliedInputs.map((a) => a.value)).toEqual(['release', 0]);
    const tr = ledToggles(rev.outputEvents);
    expect(tr.length).toBeGreaterThan(2);
    expect(tr[0]).toBeLessThan(3_000_000);
  });
});
