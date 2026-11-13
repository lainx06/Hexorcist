/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, OutputEvent } from '../types.js';

// Resolve path to the compiled fixture hex relative to this test file.
// __tests__/ → engine/ → src/ → workspace root → fixtures/
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

describe('EmulatorBridge smoke tests', { timeout: 60_000 }, () => {

  it('Released: 20M cycles, LED starts at input (cycle-0), goes LOW during setup, then toggles ~8M cycles apart', () => {
    // With INPUT_PULLUP, an undriven pin in avr8js reads LOW unless explicitly set HIGH.
    // Pass BUTTON=1 at cycle 0 to simulate the released (pull-up high) state.
    const bridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 1, cycle: 0 },
    ]);
    expect(isBridgeError(bridge)).toBe(false);
    if (isBridgeError(bridge)) return;

    const result = bridge.advance(20_000_000);
    expect(isBridgeError(result)).toBe(false);
    if (isBridgeError(result)) return;

    const ledEvents = result.outputEvents.filter((e: OutputEvent) => e.signal === 'LED');

    // First LED event must be cycle-0 "input" (initial snapshot)
    expect(ledEvents[0]).toMatchObject({ value: 'input', cycle: 0 });

    // LED must go to 0 during setup (driven LOW by firmware)
    const firstLow = ledEvents.find((e: OutputEvent) => e.value === 0);
    expect(firstLow).toBeDefined();

    // Find at least 2 consecutive toggles spaced ~8,000,000 cycles apart within 1%
    const toggleEvents = ledEvents.filter(
      (e: OutputEvent) => e.cycle > 0 && (e.value === 0 || e.value === 1),
    );
    let foundSpacing = false;
    for (let i = 1; i < toggleEvents.length; i++) {
      const gap = toggleEvents[i].cycle - toggleEvents[i - 1].cycle;
      if (gap >= 8_000_000 * 0.99 && gap <= 8_000_000 * 1.01) {
        foundSpacing = true;
        break;
      }
    }
    expect(foundSpacing).toBe(true);
  });

  it('Held: BUTTON=0 at cycle 0, 10M cycles, LED toggles ~1.6M cycles apart', () => {
    const bridge = EmulatorBridge.create(HEX, FIXTURE, [
      { signal: 'BUTTON', value: 0, cycle: 0 },
    ]);
    expect(isBridgeError(bridge)).toBe(false);
    if (isBridgeError(bridge)) return;

    const result = bridge.advance(10_000_000);
    expect(isBridgeError(result)).toBe(false);
    if (isBridgeError(result)) return;

    const ledEvents = result.outputEvents.filter((e: OutputEvent) => e.signal === 'LED');

    // Find at least 2 consecutive toggles spaced ~1,600,000 cycles apart within 1%
    const toggleEvents = ledEvents.filter(
      (e: OutputEvent) => e.cycle > 0 && (e.value === 0 || e.value === 1),
    );
    let foundSpacing = false;
    for (let i = 1; i < toggleEvents.length; i++) {
      const gap = toggleEvents[i].cycle - toggleEvents[i - 1].cycle;
      if (gap >= 1_600_000 * 0.99 && gap <= 1_600_000 * 1.01) {
        foundSpacing = true;
        break;
      }
    }
    expect(foundSpacing).toBe(true);
  });

  it('Replay: two fresh bridges with same HEX, fixture, and inputs produce identical outputEvents', () => {
    const inputs = [{ signal: 'BUTTON', value: 0 as const, cycle: 500_000 }];

    const b1 = EmulatorBridge.create(HEX, FIXTURE, inputs);
    const b2 = EmulatorBridge.create(HEX, FIXTURE, inputs);
    expect(isBridgeError(b1)).toBe(false);
    expect(isBridgeError(b2)).toBe(false);
    if (isBridgeError(b1) || isBridgeError(b2)) return;

    const r1 = b1.advance(5_000_000);
    const r2 = b2.advance(5_000_000);
    expect(isBridgeError(r1)).toBe(false);
    expect(isBridgeError(r2)).toBe(false);
    if (isBridgeError(r1) || isBridgeError(r2)) return;

    expect(r1.outputEvents).toStrictEqual(r2.outputEvents);
  });

});
