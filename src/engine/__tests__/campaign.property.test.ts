/// <reference types="node" />
// Emulator properties for the Campaign runner (task 26). Tasks 26.2 to 26.6 append below.
// Real bridge through the Campaign runner. Time is bridge cycleCount only. No avr8js import.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign, resumeCampaign } from '../campaign.js';
import type { CampaignConfig } from '../campaign.js';
import type { GremlinSpec } from '../gremlins/catalogue.js';
import type { CampaignError } from '../errors.js';
import type { CampaignState, Fixture, RunResult, SliceProgress } from '../types.js';
import type { Checker, CheckerObservation } from '../checker.js';
import { buildEventList } from '../event-list.js';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import { arbSeed, arbGremlinSet } from './arbitraries.js';
import { makeLevelTimeoutChecker } from './led-level-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BLINK_HEX = readFileSync(
  resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'),
  'utf-8',
);

const BLINK_FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

// blink_button plus the analog pin POT on channel 0. The firmware does not read it.
const BLINK_POT_FIXTURE: Fixture = {
  pins: [...BLINK_FIXTURE.pins, { signal: 'POT', kind: 'analog', channel: 0 }],
};

/** Fixed fast-check seed for the emulator properties in this file. */
const PROPERTY_SEED = 20261104;

function isProgress(x: SliceProgress | CampaignError): x is SliceProgress {
  return 'runsCompleted' in x;
}

/** Runs slices of k until finished. Throws on an engine error. */
function drive(
  handle: ReturnType<typeof createCampaign>,
  k: number,
): SliceProgress {
  if (!('runSlice' in handle)) throw new Error(`campaign not created: ${JSON.stringify(handle)}`);
  for (;;) {
    const p = handle.runSlice(k);
    if (!isProgress(p)) throw new Error(`slice failed: ${JSON.stringify(p)}`);
    if (p.finished) return p;
  }
}

function build(config: CampaignConfig, k: number): SliceProgress {
  return drive(createCampaign(config), k);
}

/** First slice of k, then resume from { nextRunIndex, runs } and finish in slices of k. */
function buildResumed(config: CampaignConfig, k: number): SliceProgress {
  const first = createCampaign(config);
  if (!('runSlice' in first)) throw new Error(`campaign not created: ${JSON.stringify(first)}`);
  const p = first.runSlice(k);
  if (!isProgress(p)) throw new Error(`slice failed: ${JSON.stringify(p)}`);
  const state: CampaignState = JSON.parse(JSON.stringify(first.state()));
  return drive(resumeCampaign(config, state), k);
}

// Gremlin sets that target the digital BUTTON pin of blink_button.
const arbBlinkGremlinSet: fc.Arbitrary<GremlinSpec[]> = fc.constantFrom<GremlinSpec[]>(
  [],
  [{ id: 'masher' }],
  [{ id: 'bouncer' }],
  [{ id: 'stuck' }],
  [{ id: 'dropout' }],
  [{ id: 'masher' }, { id: 'bouncer' }],
);

// Violating: L in [20,000, runCycles - 10,000]. Clean: L in [runCycles + 64, 400,000].
const arbSliceCase = fc
  .record({
    branch: fc.constantFrom('violating', 'clean'),
    runCycles: fc.integer({ min: 30_000, max: 150_000 }),
    n: fc.integer({ min: 1, max: 3 }),
    campaignSeed: arbSeed,
    gremlinSet: arbBlinkGremlinSet,
  })
  .chain(base =>
    fc
      .record({
        limit:
          base.branch === 'violating'
            ? fc.integer({ min: 20_000, max: base.runCycles - 10_000 })
            : fc.integer({ min: base.runCycles + 64, max: 400_000 }),
        k: fc.integer({ min: 1, max: base.n }),
      })
      .map(rest => ({ ...base, ...rest })),
  );

describe('Campaign emulator properties', () => {
  // Feature: gremlin-engine, Property 7: Slice invariance
  it(
    'Property 7: one call, Slices and a resumed Campaign give identical results',
    () => {
      let violatingRuns = 0;
      let cleanRuns = 0;

      fc.assert(
        fc.property(arbSliceCase, c => {
          for (const stopOnFirstViolation of [false, true]) {
            const checker = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: c.limit });
            const config: CampaignConfig = {
              hex: BLINK_HEX,
              fixture: BLINK_FIXTURE,
              gremlinSet: c.gremlinSet,
              campaignSeed: c.campaignSeed,
              checker,
              runs: c.n,
              runCycles: c.runCycles,
              stopOnFirstViolation,
            };
            const single = build(config, c.n);
            const sliced = build(config, c.k);
            const resumed = buildResumed(config, c.k);

            expect(sliced).toEqual(single);
            expect(resumed).toEqual(single);
            expect(sliced.result).toEqual(single.result);
            expect(resumed.result).toEqual(single.result);
            for (let i = 0; i < single.runs.length; i++) {
              expect(sliced.runs[i].eventList).toEqual(single.runs[i].eventList);
              expect(resumed.runs[i].eventList).toEqual(single.runs[i].eventList);
            }

            if (!stopOnFirstViolation) {
              for (const r of single.runs) {
                if (r.violation !== null) violatingRuns++;
                else cleanRuns++;
              }
            }
          }
        }),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      expect(
        violatingRuns,
        `branch "violating" was never seen: violatingRuns=${violatingRuns}, cleanRuns=${cleanRuns}`,
      ).toBeGreaterThan(0);
      expect(
        cleanRuns,
        `branch "clean" was never seen: violatingRuns=${violatingRuns}, cleanRuns=${cleanRuns}`,
      ).toBeGreaterThan(0);
    },
    60_000,
  );

  // Feature: gremlin-engine, Property 8: Replay
  it(
    'Property 8: replaying the recorded Event_List on a fresh bridge gives identical results',
    () => {
      let analogApplied = 0;
      let digitalApplied = 0;

      fc.assert(
        fc.property(
          fc.record({
            withAnalog: fc.boolean(),
            runCycles: fc.integer({ min: 10_000, max: 400_000 }),
            campaignSeed: arbSeed,
            gremlinSet: arbGremlinSet,
          }),
          c => {
            const fixture: Fixture = c.withAnalog ? BLINK_POT_FIXTURE : BLINK_FIXTURE;
            const config: CampaignConfig = {
              hex: BLINK_HEX,
              fixture,
              gremlinSet: c.gremlinSet,
              campaignSeed: c.campaignSeed,
              checker: () => ({ violation: null }),
              runs: 1,
              runCycles: c.runCycles,
              stopOnFirstViolation: false,
            };
            const recorded = build(config, 1).runs[0];

            const gen = buildEventList({
              fixture,
              gremlinSet: c.gremlinSet,
              runCycles: c.runCycles,
              campaignSeed: c.campaignSeed,
              runIndex: 0,
            });
            if ('kind' in gen) throw new Error(`buildEventList failed: ${JSON.stringify(gen)}`);
            expect(gen.events).toEqual(recorded.eventList);

            const bridge = EmulatorBridge.create(BLINK_HEX, fixture, gen.events);
            if (isBridgeError(bridge)) throw new Error(`bridge failed: ${JSON.stringify(bridge)}`);
            const r = bridge.advance(recorded.endCycle);
            if (isBridgeError(r)) throw new Error(`advance failed: ${JSON.stringify(r)}`);

            expect(bridge.cycleCount).toBe(recorded.endCycle);
            expect(r.outputEvents).toEqual(recorded.outputEvents);
            expect(r.diagnostics).toEqual(recorded.diagnostics);
            expect(r.appliedInputs).toEqual(recorded.appliedInputs.filter(e => !('analog' in e)));
            expect(r.appliedAnalogInputs).toEqual(recorded.appliedInputs.filter(e => 'analog' in e));

            digitalApplied += r.appliedInputs.length;
            analogApplied += r.appliedAnalogInputs.length;
          },
        ),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      expect(
        analogApplied,
        `no analog input was applied in any case: analogApplied=${analogApplied}, digitalApplied=${digitalApplied}`,
      ).toBeGreaterThan(0);
    },
    60_000,
  );
});

// floating_input HEX: read with no fallback, throws if missing.
const FLOATING_HEX = readFileSync(
  resolve(__dirname, '../../../fixtures/floating_input/build/floating_input.ino.hex'),
  'utf-8',
);

// Pin map copied from floating-input.test.ts (fixture data, read-only there).
const FLOATING_FIXTURE: Fixture = {
  pins: [
    { signal: 'LED',   port: 'B', bit: 5, direction: 'output' },
    { signal: 'D3_IN', port: 'D', bit: 3, direction: 'input' },
    { signal: 'D4_IN', port: 'D', bit: 4, direction: 'input' },
  ],
};

describe('Campaign floating-input property', () => {
  // Feature: gremlin-engine, Property 9: Floating-input rule intact
  it(
    'Property 9: at most one floating-input diagnostic per signal, equal to a replay of the applied events',
    () => {
      let totalDiagnostics = 0;

      fc.assert(
        fc.property(
          fc.record({
            runCycles: fc.integer({ min: 10_000, max: 400_000 }),
            campaignSeed: arbSeed,
            gremlinSet: arbBlinkGremlinSet,
          }),
          c => {
            const config: CampaignConfig = {
              hex: FLOATING_HEX,
              fixture: FLOATING_FIXTURE,
              gremlinSet: c.gremlinSet,
              campaignSeed: c.campaignSeed,
              checker: () => ({ violation: null }),
              runs: 1,
              runCycles: c.runCycles,
              stopOnFirstViolation: false,
            };
            const recorded = build(config, 1).runs[0];

            const floating = recorded.diagnostics.filter(d => d.kind === 'floating-input');
            const signals = floating.map(d => d.signal);
            expect(new Set(signals).size).toBe(signals.length);

            // Replay only what was applied, through the unchanged event path.
            const replayEvents = recorded.appliedInputs.map(e => {
              const { appliedCycle: _applied, ...scheduled } = e;
              return scheduled;
            });
            const bridge = EmulatorBridge.create(FLOATING_HEX, FLOATING_FIXTURE, replayEvents);
            if (isBridgeError(bridge)) throw new Error(`bridge failed: ${JSON.stringify(bridge)}`);
            const r = bridge.advance(recorded.endCycle);
            if (isBridgeError(r)) throw new Error(`advance failed: ${JSON.stringify(r)}`);

            expect(r.diagnostics).toEqual(recorded.diagnostics);
            totalDiagnostics += floating.length;
          },
        ),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      expect(
        totalDiagnostics,
        `no floating-input diagnostic seen in any case: totalDiagnostics=${totalDiagnostics}`,
      ).toBeGreaterThan(0);
    },
    60_000,
  );
});

// Violating: L in [20,000, runCycles - 10,000]. Clean: L in [runCycles + 64, 400,000].
const arbStepSizeCase = fc
  .record({
    branch: fc.constantFrom('violating', 'clean'),
    runCycles: fc.integer({ min: 30_000, max: 399_000 }),
    campaignSeed: arbSeed,
    gremlinSet: arbBlinkGremlinSet,
  })
  .chain(base =>
    fc
      .integer(
        base.branch === 'violating'
          ? { min: 20_000, max: base.runCycles - 10_000 }
          : { min: base.runCycles + 64, max: 400_000 },
      )
      .map(limit => ({ ...base, limit })),
  );

describe('Campaign step size property', () => {
  // Feature: gremlin-engine, Property 10: Step size invariance
  it(
    'Property 10: maxStepCycles 160,000 and 16,000 give the same results up to the Violation',
    () => {
      let violatingRuns = 0;
      let cleanRuns = 0;

      fc.assert(
        fc.property(arbStepSizeCase, c => {
          const make = (maxStepCycles: number): CampaignConfig => ({
            hex: BLINK_HEX,
            fixture: BLINK_FIXTURE,
            gremlinSet: c.gremlinSet,
            campaignSeed: c.campaignSeed,
            checker: makeLevelTimeoutChecker({ signal: 'LED', limitCycles: c.limit }),
            runs: 1,
            runCycles: c.runCycles,
            stopOnFirstViolation: false,
            maxStepCycles,
          });
          const big = build(make(160_000), 1).runs[0];
          const small = build(make(16_000), 1).runs[0];

          if (big.violation !== null) violatingRuns++;
          else cleanRuns++;

          // A Violation in one result and none in the other fails.
          expect(small.violation === null).toBe(big.violation === null);
          expect(small.violation).toEqual(big.violation);

          const v = big.violation;
          if (v === null) {
            expect(small.outputEvents).toEqual(big.outputEvents);
            expect(small.appliedInputs).toEqual(big.appliedInputs);
            expect(small.diagnostics).toEqual(big.diagnostics);
            expect(small.endCycle).toBe(big.endCycle);
          } else {
            const outs = (r: typeof big) => r.outputEvents.filter(e => e.cycle <= v.cycle);
            const inps = (r: typeof big) => r.appliedInputs.filter(e => e.appliedCycle < v.cycle);
            const diags = (r: typeof big) => r.diagnostics.filter(d => d.cycle < v.cycle);
            expect(outs(small)).toEqual(outs(big));
            expect(inps(small)).toEqual(inps(big));
            expect(diags(small)).toEqual(diags(big));
          }
        }),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      expect(
        violatingRuns,
        `branch "violating" was never seen: violatingRuns=${violatingRuns}, cleanRuns=${cleanRuns}`,
      ).toBeGreaterThan(0);
      expect(
        cleanRuns,
        `branch "clean" was never seen: violatingRuns=${violatingRuns}, cleanRuns=${cleanRuns}`,
      ).toBeGreaterThan(0);
    },
    60_000,
  );
});

/** Records every observation handed to the delegate Checker. */
function recordCalls(delegate: Checker): { checker: Checker; calls: CheckerObservation[] } {
  const calls: CheckerObservation[] = [];
  const checker: Checker = obs => {
    calls.push(obs);
    return delegate(obs);
  };
  return { checker, calls };
}

describe('Campaign checker feed property', () => {
  // Feature: gremlin-engine, Property 21: Checker feed
  it(
    'Property 21: the Checker gets every Step once, then one end-of-run call, and nothing after a Violation',
    () => {
      let recordingNoViolation = 0;
      let scriptedViolator = 0;
      let endOfRunViolation = 0;

      fc.assert(
        fc.property(
          fc.record({
            runCycles: fc.integer({ min: 10_000, max: 300_000 }),
            campaignSeed: arbSeed,
            gremlinSet: arbBlinkGremlinSet,
            j: fc.integer({ min: 0, max: 2 }),
            offset: fc.nat({ max: 1_000_000 }),
          }),
          c => {
            const base = (checker: Checker): CampaignConfig => ({
              hex: BLINK_HEX,
              fixture: BLINK_FIXTURE,
              gremlinSet: c.gremlinSet,
              campaignSeed: c.campaignSeed,
              checker,
              runs: 1,
              runCycles: c.runCycles,
              stopOnFirstViolation: false,
            });

            // Shape common to every branch: indices run 0..n-1 and only the last call ends the Run.
            const checkShape = (calls: CheckerObservation[], r: RunResult): void => {
              expect(calls.length).toBeGreaterThan(0);
              calls.forEach((o, i) => {
                expect(o.runIndex).toBe(0);
                expect(o.stepIndex).toBe(i);
                if (i < calls.length - 1) expect(o.endOfRun).toBe(false);
              });
              expect(calls.flatMap(o => [...o.outputEvents])).toEqual(r.outputEvents);
              expect(calls.flatMap(o => [...o.appliedInputs])).toEqual(r.appliedInputs);
              expect(calls.flatMap(o => [...o.diagnostics])).toEqual(r.diagnostics);
              expect(calls[calls.length - 1].cycle).toBe(r.endCycle);
            };

            // (a) recording Checker, no Violation.
            const recA = recordCalls(() => ({ violation: null }));
            const a = build(base(recA.checker), 1).runs[0];
            expect(a.violation).toBeNull();
            checkShape(recA.calls, a);
            const last = recA.calls[recA.calls.length - 1];
            expect(last.endOfRun).toBe(true);
            expect(recA.calls.filter(o => o.endOfRun).length).toBe(1);
            const steps = recA.calls.length - 1;
            recordingNoViolation++;

            // (b) scripted violator at Step j, only when the Run has at least j + 1 Steps.
            if (steps >= c.j + 1) {
              const recB = recordCalls(obs =>
                obs.stepIndex === c.j
                  ? { violation: { rule: 'scripted violator', cycle: obs.cycle } }
                  : { violation: null },
              );
              const b = build(base(recB.checker), 1).runs[0];
              checkShape(recB.calls, b);
              expect(recB.calls.length).toBe(c.j + 1);
              expect(recB.calls.some(o => o.endOfRun)).toBe(false);
              expect(b.violation).toEqual({ rule: 'scripted violator', cycle: recB.calls[c.j].cycle });
              expect(b.endCycle).toBe(recB.calls[c.j].cycle);
              scriptedViolator++;
            }

            // (c) level-timeout Checker with L chosen so only the open level at the end is too long.
            let maxClosed = 0;
            let levelStart = -1;
            let level: string | number = -1;
            for (const e of a.outputEvents) {
              if (e.signal !== 'LED') continue;
              if (levelStart < 0) {
                levelStart = e.cycle;
                level = e.value;
              } else if (e.value !== level) {
                maxClosed = Math.max(maxClosed, e.cycle - levelStart);
                levelStart = e.cycle;
                level = e.value;
              }
            }
            const tail = levelStart < 0 ? 0 : a.endCycle - levelStart;
            if (tail > maxClosed) {
              const limit = maxClosed + (c.offset % (tail - maxClosed));
              const recC = recordCalls(makeLevelTimeoutChecker({ signal: 'LED', limitCycles: limit }));
              const r = build(base(recC.checker), 1).runs[0];
              checkShape(recC.calls, r);
              expect(recC.calls.length).toBe(steps + 1);
              const lastC = recC.calls[recC.calls.length - 1];
              expect(lastC.endOfRun).toBe(true);
              expect(r.violation).toEqual({
                rule: `LED stays at one level longer than ${limit} cycles`,
                cycle: levelStart + limit,
              });
              endOfRunViolation++;
            }
          },
        ),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      const counts = `recordingNoViolation=${recordingNoViolation}, scriptedViolator=${scriptedViolator}, endOfRunViolation=${endOfRunViolation}`;
      expect(recordingNoViolation, `branch "recording Checker, no Violation" was never seen: ${counts}`).toBeGreaterThan(0);
      expect(scriptedViolator, `branch "scripted violator at Step j" was never seen: ${counts}`).toBeGreaterThan(0);
      expect(endOfRunViolation, `branch "level-timeout Violation on the end-of-run call" was never seen: ${counts}`).toBeGreaterThan(0);
    },
    60_000,
  );
});

describe('Campaign Run_Result JSON property', () => {
  // Feature: gremlin-engine, Property 24: Run_Result JSON round trip
  it(
    'Property 24: JSON.parse(JSON.stringify(x)) strictly equals every Run_Result',
    () => {
      let analogApplied = 0;
      let totalRuns = 0;

      fc.assert(
        fc.property(
          fc.record({
            useFloating: fc.boolean(),
            withAnalog: fc.boolean(),
            runCycles: fc.integer({ min: 10_000, max: 100_000 }),
            campaignSeed: arbSeed,
            blinkSet: arbGremlinSet,
            floatingSet: arbBlinkGremlinSet,
          }),
          c => {
            const config: CampaignConfig = c.useFloating
              ? {
                  hex: FLOATING_HEX,
                  fixture: FLOATING_FIXTURE,
                  gremlinSet: c.floatingSet,
                  campaignSeed: c.campaignSeed,
                  checker: () => ({ violation: null }),
                  runs: 1,
                  runCycles: c.runCycles,
                  stopOnFirstViolation: false,
                }
              : {
                  hex: BLINK_HEX,
                  fixture: c.withAnalog ? BLINK_POT_FIXTURE : BLINK_FIXTURE,
                  gremlinSet: c.blinkSet,
                  campaignSeed: c.campaignSeed,
                  checker: () => ({ violation: null }),
                  runs: 1,
                  runCycles: c.runCycles,
                  stopOnFirstViolation: false,
                };
            const results = build(config, 1).runs;
            expect(results.length).toBe(1);
            for (const r of results) {
              // toStrictEqual fails on undefined fields, NaN mismatches and class instances.
              expect(JSON.parse(JSON.stringify(r))).toStrictEqual(r);
              analogApplied += r.appliedInputs.filter(e => 'analog' in e).length;
              totalRuns++;
            }
          },
        ),
        { numRuns: 20, seed: PROPERTY_SEED },
      );

      expect(totalRuns).toBe(20);
      expect(
        analogApplied,
        `no analog applied input was seen in any case: analogApplied=${analogApplied}`,
      ).toBeGreaterThan(0);
    },
    60_000,
  );
});
