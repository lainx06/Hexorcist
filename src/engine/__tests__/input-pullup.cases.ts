/// <reference types="node" />
// Shared support for the input-pullup preservation tests (not a test file).
// The 25 baseline cases come from this generator and this fixed seed. The baseline JSON
// was recorded once on unfixed code; nothing here writes it.
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, InputEvent, AdvanceResult } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
export const HEX_PATH = resolve(here, '../../../fixtures/blink_button/build/blink_button.ino.hex');
export const BASELINE_PATH = resolve(here, 'baselines/input-pullup-preservation.json');
export const HEX = readFileSync(HEX_PATH, 'utf-8');

export const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

export const CASE_SEED = 20261030;
export const CASE_COUNT = 25;
export const CASE_RUN_CYCLES = 4_000_000;

/** Event list over 0 and 1 on BUTTON. The first event is always a cycle-0 drive. */
export const eventListArb: fc.Arbitrary<InputEvent[]> = fc
  .tuple(
    fc.constantFrom<0 | 1>(0, 1),
    fc.array(
      fc.record({
        value: fc.constantFrom<0 | 1>(0, 1),
        cycle: fc.integer({ min: 1, max: 3_500_000 }),
      }),
      { minLength: 0, maxLength: 4 },
    ),
  )
  .map(([first, rest]) => [
    { signal: 'BUTTON', value: first, cycle: 0 },
    ...rest.map((r) => ({ signal: 'BUTTON', value: r.value, cycle: r.cycle })),
  ]);

export function generateCases(): InputEvent[][] {
  return fc.sample(eventListArb, { seed: CASE_SEED, numRuns: CASE_COUNT });
}

export function run(events: InputEvent[], cycles: number = CASE_RUN_CYCLES): AdvanceResult {
  const bridge = EmulatorBridge.create(HEX, FIXTURE, events);
  if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
  const result = bridge.advance(cycles);
  if (isBridgeError(result)) throw new Error(`advance failed: ${JSON.stringify(result)}`);
  return result;
}

export interface BaselineCase {
  events: InputEvent[];
  outputEvents: AdvanceResult['outputEvents'];
  appliedInputs: AdvanceResult['appliedInputs'];
  cyclesConsumed: number;
}
