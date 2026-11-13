/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import { checkLedTimeout } from '../spike/led-timeout-monitor.js';
import type { Fixture, OutputEvent, InputEvent } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEX_PATH = resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED',    port: 'B', bit: 5, direction: 'output' },
  ],
};

const MAX_ON_CYCLES = 4_800_000; // 300 ms at 16 MHz

describe('LED timeout monitor spike (S3+S4)', { timeout: 120_000 }, () => {

  it('Test 1 — Released: LED eventually stays ON >300 ms, monitor reports BROKE', () => {
    // BUTTON = 1 at cycle 0 simulates the released (pull-up high) state
    const bridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 1, cycle: 0 },
    ]);
    expect(isBridgeError(bridge)).toBe(false);
    if (isBridgeError(bridge)) return;

    const result = bridge.advance(20_000_000);
    expect(isBridgeError(result)).toBe(false);
    if (isBridgeError(result)) return;

    // Find the cycle at which LED first turned ON (transition to 1 from non-1)
    let onCycle = -1;
    let prevLedValue: 0 | 1 | 'input' = 'input';
    for (const ev of result.outputEvents) {
      if (ev.signal !== 'LED') continue;
      if (ev.value === 1 && prevLedValue !== 1) {
        onCycle = ev.cycle;
        break;
      }
      prevLedValue = ev.value as 0 | 1 | 'input';
    }
    expect(onCycle).toBeGreaterThanOrEqual(0);

    const verdict = checkLedTimeout(result.outputEvents, bridge.cycleCount);
    expect(verdict.verdict).toBe('BROKE');
    if (verdict.verdict === 'BROKE') {
      expect(verdict.violationCycle).toBe(onCycle + MAX_ON_CYCLES);
    }
  });

  it('Test 2 — Held: BUTTON = 0 keeps LED toggling fast, no violation', () => {
    // BUTTON = 0 at cycle 0 means button is held; LED blinks ~every 1.6M cycles (< 300 ms)
    const bridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 0, cycle: 0 },
    ]);
    expect(isBridgeError(bridge)).toBe(false);
    if (isBridgeError(bridge)) return;

    const result = bridge.advance(20_000_000);
    expect(isBridgeError(result)).toBe(false);
    if (isBridgeError(result)) return;

    const verdict = checkLedTimeout(result.outputEvents, bridge.cycleCount);
    expect(verdict.verdict).toBe('no violation in this run');
  });

  it('Test 3 — Replay: chunked and single-shot bridges produce same violation cycle as Test 1', () => {
    // ── Step 1: Run the "released" scenario to get the violation and inputs ──
    const refBridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 1, cycle: 0 },
    ]);
    expect(isBridgeError(refBridge)).toBe(false);
    if (isBridgeError(refBridge)) return;

    const refResult = refBridge.advance(20_000_000);
    expect(isBridgeError(refResult)).toBe(false);
    if (isBridgeError(refResult)) return;

    const refVerdict = checkLedTimeout(refResult.outputEvents, refBridge.cycleCount);
    expect(refVerdict.verdict).toBe('BROKE');
    if (refVerdict.verdict !== 'BROKE') return;
    const expectedViolationCycle = refVerdict.violationCycle;

    // Build replay inputs from appliedInputs (use appliedCycle as cycle)
    const replayInputs: InputEvent[] = refResult.appliedInputs.map(ai => ({
      signal: ai.signal,
      value: ai.value,
      cycle: ai.appliedCycle,
    }));

    // ── Helper: run the monitor across a chunked or full advance ──
    function runChunked(chunkSize: number): number {
      const bridge = EmulatorBridge.create(HEX, FIXTURE, replayInputs);
      expect(isBridgeError(bridge)).toBe(false);
      if (isBridgeError(bridge)) throw new Error('bridge creation failed');

      let totalCycles = 0;
      const allEvents: OutputEvent[] = [];
      const target = 20_000_000;

      while (totalCycles < target) {
        const remaining = target - totalCycles;
        const step = Math.min(chunkSize, remaining);
        const result = (bridge as EmulatorBridge).advance(step);
        expect(isBridgeError(result)).toBe(false);
        if (isBridgeError(result)) throw new Error('advance failed');
        allEvents.push(...result.outputEvents);
        totalCycles += result.cyclesConsumed;
      }

      const v = checkLedTimeout(allEvents, (bridge as EmulatorBridge).cycleCount);
      expect(v.verdict).toBe('BROKE');
      if (v.verdict !== 'BROKE') throw new Error('expected BROKE');
      return v.violationCycle;
    }

    // ── Instance A: 1,000-cycle chunks ──
    const violationA = runChunked(1_000);

    // ── Instance B: 160,000-cycle chunks ──
    const violationB = runChunked(160_000);

    // ── Instance C: single advance(20_000_000) ──
    const bridgeC = EmulatorBridge.create(HEX, FIXTURE, replayInputs);
    expect(isBridgeError(bridgeC)).toBe(false);
    if (isBridgeError(bridgeC)) return;
    const resultC = (bridgeC as EmulatorBridge).advance(20_000_000);
    expect(isBridgeError(resultC)).toBe(false);
    if (isBridgeError(resultC)) return;
    const verdictC = checkLedTimeout(resultC.outputEvents, (bridgeC as EmulatorBridge).cycleCount);
    expect(verdictC.verdict).toBe('BROKE');
    if (verdictC.verdict !== 'BROKE') return;
    const violationC = verdictC.violationCycle;

    // ── All three must match the reference run ──
    expect(violationA).toBe(expectedViolationCycle);
    expect(violationB).toBe(expectedViolationCycle);
    expect(violationC).toBe(expectedViolationCycle);
  });

  it('Test 4 — End-of-run check: LED still ON at onCycle + 6M (beyond threshold), fresh bridges at onCycle + 6M and onCycle + 4M', () => {
    // ── Step 1: Get onCycle from full 20M-cycle run ──
    const refBridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 1, cycle: 0 },
    ]);
    expect(isBridgeError(refBridge)).toBe(false);
    if (isBridgeError(refBridge)) return;

    const refResult = refBridge.advance(20_000_000);
    expect(isBridgeError(refResult)).toBe(false);
    if (isBridgeError(refResult)) return;

    // Find onCycle
    let onCycle = -1;
    let prevLedValue: 0 | 1 | 'input' = 'input';
    for (const ev of refResult.outputEvents) {
      if (ev.signal !== 'LED') continue;
      if (ev.value === 1 && prevLedValue !== 1) {
        onCycle = ev.cycle;
        break;
      }
      prevLedValue = ev.value as 0 | 1 | 'input';
    }
    expect(onCycle).toBeGreaterThanOrEqual(0);

    // Build replay inputs
    const replayInputs: InputEvent[] = refResult.appliedInputs.map(ai => ({
      signal: ai.signal,
      value: ai.value,
      cycle: ai.appliedCycle,
    }));

    // ── Part (a): Fresh bridge advanced to onCycle + 6M cycles (LED still on, no later LED event needed) ──
    const bridge_a = EmulatorBridge.create(HEX, FIXTURE, replayInputs);
    expect(isBridgeError(bridge_a)).toBe(false);
    if (isBridgeError(bridge_a)) return;
    const result_a = bridge_a.advance(onCycle + 6_000_000);
    expect(isBridgeError(result_a)).toBe(false);
    if (isBridgeError(result_a)) return;

    const verdict_a = checkLedTimeout(result_a.outputEvents, bridge_a.cycleCount);
    expect(verdict_a.verdict).toBe('BROKE');
    if (verdict_a.verdict === 'BROKE') {
      expect(verdict_a.violationCycle).toBe(onCycle + MAX_ON_CYCLES);
    }

    // ── Part (b): Fresh bridge advanced to onCycle + 4M cycles (before threshold) ──
    const bridge_b = EmulatorBridge.create(HEX, FIXTURE, replayInputs);
    expect(isBridgeError(bridge_b)).toBe(false);
    if (isBridgeError(bridge_b)) return;
    const result_b = bridge_b.advance(onCycle + 4_000_000);
    expect(isBridgeError(result_b)).toBe(false);
    if (isBridgeError(result_b)) return;

    const verdict_b = checkLedTimeout(result_b.outputEvents, bridge_b.cycleCount);
    expect(verdict_b.verdict).toBe('no violation in this run');
  });

});
