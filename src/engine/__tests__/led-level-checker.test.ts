/// <reference types="node" />
// Unit cases for the level-timeout test Checker (task 25.2), plus two anchor
// Runs on blink_button through runOne. The anchors are acceptance tests.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { runOne } from '../campaign.js';
import type { Checker, CheckerObservation } from '../checker.js';
import type { Fixture, OutputEvent, PinValue, RunResult } from '../types.js';
import { makeLevelTimeoutChecker } from './led-level-checker.js';

const L = 1000;
const RULE = `LED stays at one level longer than ${L} cycles`;

function ev(cycle: number, value: PinValue): OutputEvent {
  return { signal: 'LED', value, cycle };
}

function obs(
  stepIndex: number,
  cycle: number,
  outputEvents: OutputEvent[],
  endOfRun = false,
): CheckerObservation {
  return {
    runIndex: 0,
    stepIndex,
    endOfRun,
    cycle,
    outputEvents,
    appliedInputs: [],
    diagnostics: [],
  };
}

describe('level-timeout Checker units', () => {
  it('a closed segment of exactly L is not a Violation; L + 1 is, at levelStart + L', () => {
    const exact = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    expect(exact(obs(0, 5000, [ev(0, 0), ev(L, 1)])).violation).toBeNull();

    const over = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    expect(over(obs(0, 5000, [ev(0, 0), ev(L + 1, 1)])).violation).toEqual({
      rule: RULE,
      cycle: L,
    });
  });

  it('end-of-run reports an open level at levelStart + L', () => {
    const c = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    expect(c(obs(0, 500, [ev(0, 0), ev(300, 1)])).violation).toBeNull();
    expect(c(obs(1, 5000, [], true)).violation).toEqual({ rule: RULE, cycle: 300 + L });
  });

  it('end-of-run with an open level of exactly L reports nothing', () => {
    const c = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    c(obs(0, 500, [ev(0, 0), ev(300, 1)]));
    expect(c(obs(1, 300 + L, [], true)).violation).toBeNull();
  });

  it('events split across two calls give the same Violation as one call', () => {
    const events = [ev(0, 0), ev(200, 1), ev(200 + L + 1, 0)];
    const one = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    const whole = one(obs(0, 5000, events)).violation;

    const split = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    expect(split(obs(0, 300, events.slice(0, 2))).violation).toBeNull();
    const second = split(obs(1, 5000, events.slice(2))).violation;

    expect(whole).toEqual({ rule: RULE, cycle: 200 + L });
    expect(second).toEqual(whole);
  });

  it('a repeated value does not move the level start', () => {
    const c = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    // Repeats at 600 and 900 must be ignored: the level still started at 0.
    expect(c(obs(0, 1000, [ev(0, 0), ev(600, 0), ev(900, 0)])).violation).toBeNull();
    expect(c(obs(1, 1500, [ev(L + 1, 1)])).violation).toEqual({ rule: RULE, cycle: L });
  });

  it('a reset at stepIndex 0 forgets the previous Run', () => {
    const c: Checker = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: L });
    // Run A: LED goes high at 5000 and stays open; no end-of-run call is made.
    c(obs(0, 6000, [ev(0, 0), ev(5000, 1)]));
    // Run B: starts fresh. Level begins at 100 and is short, so no Violation.
    expect(c(obs(0, 600, [ev(100, 0)])).violation).toBeNull();
    expect(c(obs(1, 100 + L, [], true)).violation).toBeNull();
    // Run C: after a reported Violation, a new Run reports again.
    expect(c(obs(0, 5000, [ev(0, 0), ev(L + 1, 1)])).violation).toEqual({ rule: RULE, cycle: L });
    expect(c(obs(0, 5000, [ev(0, 0), ev(L + 1, 1)])).violation).toEqual({ rule: RULE, cycle: L });
  });
});

describe('level-timeout Checker anchor Runs on blink_button', { timeout: 60_000 }, () => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const HEX = readFileSync(
    resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'),
    'utf-8',
  );
  const FIXTURE: Fixture = {
    pins: [
      { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    ],
  };
  const RUN_CYCLES = 60_000;

  // Empty gremlin set and seed 0: the Event_List holds no events, so the
  // outcome does not depend on any generator.
  function anchor(limit: number): { result: RunResult; violatingCall: CheckerObservation | null } {
    const inner = makeLevelTimeoutChecker({ signal: 'LED', limitCycles: limit });
    let violatingCall: CheckerObservation | null = null;
    const r = runOne(
      {
        hex: HEX,
        fixture: FIXTURE,
        gremlinSet: [],
        campaignSeed: 0,
        runCycles: RUN_CYCLES,
        maxStepCycles: 15_000,
        checker: (o) => {
          const out = inner(o);
          if (out.violation && !violatingCall) violatingCall = o;
          return out;
        },
      },
      0,
    );
    if ('kind' in r) throw new Error(`expected a RunResult, got ${r.kind}`);
    return { result: r, violatingCall };
  }

  it('Run_Cycles 60,000 with L 20,000 gives a Violation at the end-of-run call', { timeout: 60_000 }, () => {
    const { result, violatingCall } = anchor(20_000);
    expect(result.violation).not.toBeNull();
    expect(result.violation?.rule).toBe('LED stays at one level longer than 20000 cycles');
    expect(violatingCall?.endOfRun).toBe(true);
  });

  it('Run_Cycles 60,000 with L 100,000 gives no Violation', { timeout: 60_000 }, () => {
    const { result } = anchor(100_000);
    expect(result.violation).toBeNull();
  });
});
