/// <reference types="node" />
// Task 10: LED-timeout monitor on the idle blink_button run (no BUTTON event at all),
// compared with the existing "Released" run where BUTTON is driven to 1 at cycle 0.
// New cases only. spike-monitor.test.ts is untouched. Evidence only, not proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import { checkLedTimeout } from '../spike/led-timeout-monitor.js';
import type { Fixture, InputEvent, OutputEvent } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX = readFileSync(
  resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'),
  'utf-8',
);

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED',    port: 'B', bit: 5, direction: 'output' },
  ],
};

const RUN_CYCLES = 20_000_000;
const RELEASED_GAP = 8_000_000;
const HELD_GAP = 1_600_000;

function within1pct(gap: number, target: number): boolean {
  return gap >= target * 0.99 && gap <= target * 1.01;
}

function run(inputs: InputEvent[]) {
  const bridge = EmulatorBridge.create(HEX, FIXTURE, inputs);
  if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
  const result = bridge.advance(RUN_CYCLES);
  if (isBridgeError(result)) throw new Error(`advance failed: ${JSON.stringify(result)}`);
  return {
    events: result.outputEvents,
    verdict: checkLedTimeout(result.outputEvents, bridge.cycleCount),
  };
}

function toggleGaps(events: OutputEvent[]): number[] {
  const toggles = events.filter(
    (e) => e.signal === 'LED' && e.cycle > 0 && (e.value === 0 || e.value === 1),
  );
  const gaps: number[] = [];
  for (let i = 1; i < toggles.length; i++) gaps.push(toggles[i].cycle - toggles[i - 1].cycle);
  return gaps;
}

describe('Idle blink_button vs Released run, LED-timeout monitor', { timeout: 120_000 }, () => {
  const idle = run([]);
  const released = run([{ signal: 'BUTTON', value: 1, cycle: 0 }]);

  it('idle LED toggle spacing is 8,000,000 cycles within 1%, not 1,600,000', () => {
    const gaps = toggleGaps(idle.events);
    expect(gaps.length, `gaps: ${JSON.stringify(gaps)}`).toBeGreaterThan(0);
    expect(gaps.every((g) => within1pct(g, RELEASED_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(true);
    expect(gaps.some((g) => within1pct(g, HELD_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(false);
  });

  it('idle monitor result equals the Released result', () => {
    expect(idle.verdict).toStrictEqual(released.verdict);
    expect(idle.verdict.verdict).toBe('BROKE');
  });

  it('idle LED events equal the Released LED events', () => {
    const led = (evs: OutputEvent[]) => evs.filter((e) => e.signal === 'LED');
    expect(led(idle.events)).toStrictEqual(led(released.events));
  });
});
