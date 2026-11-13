/// <reference types="node" />
import { describe, it } from 'vitest';
import { expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import * as fc from 'fast-check';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, FixturePin, InputEvent } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HEX_PATH = resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8');

// ── Generators ───────────────────────────────────────────────────────────────

/**
 * Always includes LED (port B, bit 5, output) and BUTTON (port D, bit 2, input).
 * Optionally adds 0–2 extra pins with distinct port+bit combos.
 */
function arbitraryFixture(): fc.Arbitrary<Fixture> {
  // Fixed base pins
  const basePin_LED: FixturePin   = { signal: 'LED',    port: 'B', bit: 5, direction: 'output' };
  const basePin_BTN: FixturePin   = { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input'  };

  // Candidate extra pins — a small fixed set that never collides with LED or BUTTON
  const extraCandidates: FixturePin[] = [
    { signal: 'EXTRA_0', port: 'B', bit: 0, direction: 'input'  },
    { signal: 'EXTRA_1', port: 'B', bit: 1, direction: 'output' },
    { signal: 'EXTRA_2', port: 'C', bit: 0, direction: 'input'  },
    { signal: 'EXTRA_3', port: 'C', bit: 1, direction: 'output' },
    { signal: 'EXTRA_4', port: 'D', bit: 0, direction: 'input'  },
    { signal: 'EXTRA_5', port: 'D', bit: 3, direction: 'output' },
  ];

  // Pick how many extra pins to add (0–2) and which ones
  return fc
    .tuple(
      fc.integer({ min: 0, max: 2 }),
      fc.shuffledSubarray(extraCandidates, { minLength: 0, maxLength: 2 }),
    )
    .map(([n, shuffled]) => {
      const extras = shuffled.slice(0, n);
      return { pins: [basePin_BTN, basePin_LED, ...extras] };
    });
}

/**
 * Sorted list of InputEvents whose signal names are drawn exclusively from
 * input-direction pins in the fixture.
 */
function arbitraryInputEventList(fixture: Fixture): fc.Arbitrary<InputEvent[]> {
  const inputSignals = fixture.pins
    .filter(p => p.direction === 'input')
    .map(p => p.signal);

  if (inputSignals.length === 0) {
    return fc.constant([]);
  }

  return fc
    .array(
      fc.record({
        signal: fc.constantFrom(...inputSignals),
        value:  fc.integer({ min: 0, max: 1 }) as fc.Arbitrary<0 | 1>,
        cycle:  fc.integer({ min: 0, max: 200_000 }),
      }),
      { minLength: 0, maxLength: 8 },
    )
    .map(events => [...events].sort((a, b) => a.cycle - b.cycle));
}

/**
 * Run length in CPU cycles: 1..200,000.
 */
function arbitraryRunLength(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 200_000 });
}

/**
 * A single InputEvent whose signal name is NOT present in fixture.pins.
 * Uses a fixed prefix that can never appear in the fixture's signal names.
 */
function arbitraryInputEventWithUnmappedSignal(fixture: Fixture): fc.Arbitrary<InputEvent> {
  const knownSignals = new Set(fixture.pins.map(p => p.signal));

  // Generate a name with the "__UNMAPPED__" prefix — guaranteed absent from fixtures
  return fc
    .string({ minLength: 0, maxLength: 16 })
    .map(suffix => `__UNMAPPED__${suffix}`)
    .filter(name => !knownSignals.has(name))
    .chain(signal =>
      fc.record({
        signal: fc.constant(signal),
        value:  fc.integer({ min: 0, max: 1 }) as fc.Arbitrary<0 | 1>,
        cycle:  fc.integer({ min: 0, max: 200_000 }),
      }),
    );
}

// ── Property 12: Unmapped-pin returns typed error ────────────────────────────

describe('Property-Based Tests: EmulatorBridge', { timeout: 300_000 }, () => {

  it(
    // Feature: emulator-bridge, Property 12: Unmapped-pin returns typed error
    'Property 12: EmulatorBridge.create with unmapped signal returns kind="unmapped-pin"',
    () => {
      fc.assert(
        fc.property(
          arbitraryFixture().chain(fixture =>
            fc.tuple(
              fc.constant(fixture),
              arbitraryInputEventWithUnmappedSignal(fixture),
            ),
          ),
          ([fixture, unmappedEvent]) => {
            const result = EmulatorBridge.create(HEX, fixture, [unmappedEvent]);

            // Must be a BridgeError
            expect(isBridgeError(result)).toBe(true);
            if (!isBridgeError(result)) return;

            // Must have the right kind and signal
            expect(result.kind).toBe('unmapped-pin');
            if (result.kind === 'unmapped-pin') {
              expect(result.signal).toBe(unmappedEvent.signal);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  // ── Property 13: Replay determinism ─────────────────────────────────────────

  it(
    // Feature: emulator-bridge, Property 13: Replay determinism
    'Property 13: Two independent bridges with same inputs produce identical outputEvents',
    () => {
      fc.assert(
        fc.property(
          arbitraryFixture().chain(fixture =>
            fc.tuple(
              fc.constant(fixture),
              arbitraryInputEventList(fixture),
              arbitraryRunLength(),
            ),
          ),
          ([fixture, inputEvents, runLength]) => {
            const b1 = EmulatorBridge.create(HEX, fixture, inputEvents);
            const b2 = EmulatorBridge.create(HEX, fixture, inputEvents);

            expect(isBridgeError(b1)).toBe(false);
            expect(isBridgeError(b2)).toBe(false);
            if (isBridgeError(b1) || isBridgeError(b2)) return;

            const r1 = b1.advance(runLength);
            const r2 = b2.advance(runLength);

            expect(isBridgeError(r1)).toBe(false);
            expect(isBridgeError(r2)).toBe(false);
            if (isBridgeError(r1) || isBridgeError(r2)) return;

            // Same number of output events
            expect(r1.outputEvents.length).toBe(r2.outputEvents.length);

            // Each corresponding event must match exactly on all fields
            for (let i = 0; i < r1.outputEvents.length; i++) {
              expect(r1.outputEvents[i]).toStrictEqual(r2.outputEvents[i]);
            }
          },
        ),
        { numRuns: 25 },
      );
    },
  );
});
