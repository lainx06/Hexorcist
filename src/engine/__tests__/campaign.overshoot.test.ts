/// <reference types="node" />
// CHECK D: the last advance overshoots Run_Cycles. The Run ends cleanly after that step,
// endCycle is the bridge's real cycleCount, and the end-of-run Checker call gets that cycle.
// How: the real bridge (blink_button HEX) is wrapped, and its final advance is asked for
// OVERSHOOT more cycles than the Run asked for. Nothing else is changed. No avr8js import.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign, runOne } from '../campaign.js';
import type { BridgeFactory } from '../campaign.js';
import type { Checker, CheckerObservation } from '../checker.js';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { EmulatorBridgeInterface } from '../emulator-bridge.js';
import type { Fixture, RunResult } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEX = readFileSync(resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'), 'utf-8');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const RUN_CYCLES = 100_000;
const OVERSHOOT = 7;

function overshootFactory(real: { current: EmulatorBridgeInterface | null }): BridgeFactory {
  return (hex, fixture, events) => {
    const b = EmulatorBridge.create(hex, fixture, events);
    if (isBridgeError(b)) return b;
    real.current = b;
    return {
      advance: (n) => b.advance(b.cycleCount + n >= RUN_CYCLES ? n + OVERSHOOT : n),
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
}

describe('Run that overshoots Run_Cycles', { timeout: 60_000 }, () => {
  it('ends cleanly; endCycle and the end-of-run observation use the real cycleCount', { timeout: 60_000 }, () => {
    const real: { current: EmulatorBridgeInterface | null } = { current: null };
    const seen: CheckerObservation[] = [];
    const checker: Checker = (o) => (seen.push(o), { violation: null });
    const out = runOne(
      {
        hex: HEX,
        fixture: FIXTURE,
        gremlinSet: [{ id: 'masher' }],
        campaignSeed: 5,
        checker,
        runCycles: RUN_CYCLES,
        maxStepCycles: 40_000,
        bridgeFactory: overshootFactory(real),
      },
      0,
    );
    expect('kind' in out).toBe(false);
    const res = out as RunResult;
    const actual = real.current!.cycleCount;

    expect(actual).toBeGreaterThan(RUN_CYCLES);
    expect(res.endCycle).toBe(actual);
    expect(res.violation).toBeNull();

    const ends = seen.filter((o) => o.endOfRun);
    expect(ends.length).toBe(1);
    expect(seen[seen.length - 1]).toBe(ends[0]);
    expect(ends[0].cycle).toBe(actual);

    // The step before it also stopped at the overshoot cycle: no extra step ran after it.
    const steps = seen.filter((o) => !o.endOfRun);
    expect(steps[steps.length - 1].cycle).toBe(actual);
    expect(steps.slice(0, -1).every((o) => o.cycle < RUN_CYCLES)).toBe(true);
  });

  it('a Campaign of such Runs records the overshoot cycle as each Run endCycle', { timeout: 60_000 }, () => {
    const real: { current: EmulatorBridgeInterface | null } = { current: null };
    const h = createCampaign({
      hex: HEX,
      fixture: FIXTURE,
      gremlinSet: [{ id: 'masher' }],
      campaignSeed: 5,
      checker: () => ({ violation: null }),
      runs: 2,
      runCycles: RUN_CYCLES,
      maxStepCycles: 40_000,
      bridgeFactory: overshootFactory(real),
    });
    if ('kind' in h) throw new Error(h.kind);
    const p = h.runSlice(2);
    if ('kind' in p) throw new Error(p.kind);
    expect(p.runs.length).toBe(2);
    for (const r of p.runs) expect(r.endCycle).toBeGreaterThan(RUN_CYCLES);
    expect(p.runs[1].endCycle).toBe(real.current!.cycleCount);
  });
});
