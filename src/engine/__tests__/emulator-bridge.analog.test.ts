/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { BridgeError, Fixture, FixturePin, ScheduledInput } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX_PATH = resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8');

const BUTTON: FixturePin = { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' };
const LED: FixturePin = { signal: 'LED', port: 'B', bit: 5, direction: 'output' };
const POT: FixturePin = { signal: 'POT', kind: 'analog', channel: 0 };

const FIXTURE: Fixture = { pins: [BUTTON, LED, POT] };

function fixtureOf(...pins: FixturePin[]): Fixture {
  return { pins };
}

/** Create and expect a BridgeError of the given kind. */
function expectError(
  fixture: Fixture,
  events: ScheduledInput[],
  kind: BridgeError['kind'],
): BridgeError {
  const r = EmulatorBridge.create(HEX, fixture, events);
  expect(isBridgeError(r)).toBe(true);
  const err = r as BridgeError;
  expect(err.kind).toBe(kind);
  return err;
}

describe('EmulatorBridge analog and fixture examples', { timeout: 60_000 }, () => {
  describe('fixture acceptance', () => {
    it('accepts an analog pin with and without restLevel', () => {
      expect(isBridgeError(EmulatorBridge.create(HEX, fixtureOf(BUTTON, LED, POT)))).toBe(false);
      const withRest = fixtureOf(BUTTON, LED, { signal: 'POT', kind: 'analog', channel: 3, restLevel: 100 });
      expect(isBridgeError(EmulatorBridge.create(HEX, withRest))).toBe(false);
    });

    it('supports("adc") is true', () => {
      const b = EmulatorBridge.create(HEX, FIXTURE);
      if (isBridgeError(b)) throw new Error(b.message);
      expect(b.supports('adc')).toBe(true);
    });

    it('accepts digital kind, activeLevel and restState on input pins, and defaults', () => {
      const f = fixtureOf(
        { signal: 'A', kind: 'digital', port: 'D', bit: 2, direction: 'input', activeLevel: 'high', restState: 'active' },
        { signal: 'B', port: 'D', bit: 3, direction: 'input', activeLevel: 'low', restState: 'released' },
        { signal: 'C', port: 'D', bit: 4, direction: 'input' },
        LED,
      );
      expect(isBridgeError(EmulatorBridge.create(HEX, f))).toBe(false);
    });

    it('rejects bad activeLevel and restState naming the signal', () => {
      const badLevel = fixtureOf({ ...BUTTON, activeLevel: 'up' } as unknown as FixturePin);
      const e1 = expectError(badLevel, [], 'invalid-fixture');
      expect((e1 as { signal?: string }).signal).toBe('BUTTON');
      expect(e1.message).toContain('BUTTON');

      const badRest = fixtureOf({ ...BUTTON, restState: 'pressed' } as unknown as FixturePin);
      const e2 = expectError(badRest, [], 'invalid-fixture');
      expect((e2 as { signal?: string }).signal).toBe('BUTTON');
      expect(e2.message).toContain('BUTTON');
    });

    it('rejects activeLevel and restState on output pins', () => {
      const e1 = expectError(
        fixtureOf({ ...LED, activeLevel: 'low' } as unknown as FixturePin),
        [],
        'invalid-fixture',
      );
      expect(e1.message).toContain('LED');
      const e2 = expectError(
        fixtureOf({ ...LED, restState: 'active' } as unknown as FixturePin),
        [],
        'invalid-fixture',
      );
      expect(e2.message).toContain('LED');
    });

    it('rejects activeLevel and restState on analog pins', () => {
      const e1 = expectError(
        fixtureOf({ ...POT, activeLevel: 'low' } as unknown as FixturePin),
        [],
        'invalid-fixture',
      );
      expect(e1.message).toContain('POT');
      expect((e1 as { signal?: string }).signal).toBe('POT');
      const e2 = expectError(
        fixtureOf({ ...POT, restState: 'active' } as unknown as FixturePin),
        [],
        'invalid-fixture',
      );
      expect(e2.message).toContain('POT');
    });

    it('rejects duplicate channel, channel out of 0..5, and bad restLevel', () => {
      expectError(
        fixtureOf({ signal: 'P1', kind: 'analog', channel: 1 }, { signal: 'P2', kind: 'analog', channel: 1 }),
        [],
        'invalid-fixture',
      );
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: 6 }), [], 'invalid-fixture');
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: -1 }), [], 'invalid-fixture');
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: 1.5 }), [], 'invalid-fixture');
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: 0, restLevel: 1024 }), [], 'invalid-fixture');
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: 0, restLevel: -1 }), [], 'invalid-fixture');
      expectError(fixtureOf({ signal: 'P', kind: 'analog', channel: 0, restLevel: 2.5 }), [], 'invalid-fixture');
    });
  });

  describe('analog events through the bridge', () => {
    it('applies analog events and records them in appliedAnalogInputs with appliedCycle', () => {
      const b = EmulatorBridge.create(HEX, FIXTURE, [
        { signal: 'POT', analog: 700, cycle: 1_000, gremlinId: 'spike' },
        { signal: 'POT', analog: 0, cycle: 5_000 },
      ]);
      if (isBridgeError(b)) throw new Error(b.message);
      const r = b.advance(20_000);
      if (isBridgeError(r)) throw new Error(r.message);
      expect(r.appliedAnalogInputs).toHaveLength(2);
      expect(r.appliedAnalogInputs[0]).toMatchObject({ signal: 'POT', analog: 700, cycle: 1_000 });
      expect(r.appliedAnalogInputs[0].appliedCycle).toBeGreaterThanOrEqual(1_000);
      expect(r.appliedAnalogInputs[1]).toMatchObject({ signal: 'POT', analog: 0, cycle: 5_000 });
      expect(r.appliedAnalogInputs[1].appliedCycle).toBeGreaterThanOrEqual(5_000);
      expect(r.appliedInputs).toHaveLength(0);
    });

    it('appliedAnalogInputs is present and empty for a Fixture with no analog pin', () => {
      const b = EmulatorBridge.create(HEX, fixtureOf(BUTTON, LED), [
        { signal: 'BUTTON', value: 1, cycle: 0 },
      ]);
      if (isBridgeError(b)) throw new Error(b.message);
      const r = b.advance(10_000);
      if (isBridgeError(r)) throw new Error(r.message);
      expect(r.appliedAnalogInputs).toStrictEqual([]);
      expect(r.appliedInputs).toHaveLength(1);
    });

    it('copies gremlinId unchanged into digital and analog applied entries', () => {
      const b = EmulatorBridge.create(HEX, FIXTURE, [
        { signal: 'BUTTON', value: 0, cycle: 100, gremlinId: 'masher#1' },
        { signal: 'POT', analog: 321, cycle: 200, gremlinId: 'drifter#2' },
      ]);
      if (isBridgeError(b)) throw new Error(b.message);
      const r = b.advance(10_000);
      if (isBridgeError(r)) throw new Error(r.message);
      expect(r.appliedInputs[0].gremlinId).toBe('masher#1');
      expect(r.appliedAnalogInputs[0].gremlinId).toBe('drifter#2');
    });
  });

  describe('rejections before execution', () => {
    it('invalid-analog-value for out-of-range and non-integer values', () => {
      for (const v of [-1, 1024, 1.5, Number.NaN]) {
        const e = expectError(FIXTURE, [{ signal: 'POT', analog: v, cycle: 10 }], 'invalid-analog-value');
        expect((e as { signal: string }).signal).toBe('POT');
      }
    });

    it('pin-kind-mismatch in both directions', () => {
      const e1 = expectError(FIXTURE, [{ signal: 'BUTTON', analog: 5, cycle: 10 }], 'pin-kind-mismatch');
      expect((e1 as { signal: string }).signal).toBe('BUTTON');
      const e2 = expectError(FIXTURE, [{ signal: 'POT', value: 1, cycle: 10 }], 'pin-kind-mismatch');
      expect((e2 as { signal: string }).signal).toBe('POT');
    });

    it('unknown signal gives unmapped-pin for analog and digital events alike', () => {
      const d = expectError(FIXTURE, [{ signal: 'NOPE', value: 1, cycle: 10 }], 'unmapped-pin');
      const a = expectError(FIXTURE, [{ signal: 'NOPE', analog: 1, cycle: 10 }], 'unmapped-pin');
      expect(a.kind).toBe(d.kind);
    });

    it('a bad event later in the list rejects the whole list (no event applied)', () => {
      // create() returns an error, so no bridge exists and nothing can have run.
      expectError(
        FIXTURE,
        [
          { signal: 'POT', analog: 100, cycle: 0 },
          { signal: 'POT', analog: 2000, cycle: 10 },
        ],
        'invalid-analog-value',
      );
    });
  });

  describe('shared physical pin (R2.12)', () => {
    it('rejects analog channel 0 with a digital input on port C bit 0, naming both signals', () => {
      const e = expectError(
        fixtureOf(POT, { signal: 'SW', port: 'C', bit: 0, direction: 'input' }),
        [],
        'invalid-fixture',
      );
      expect(e.message).toContain('POT');
      expect(e.message).toContain('SW');
      expect('signal' in e).toBe(false);
    });

    it('rejects the same with an output pin', () => {
      const e = expectError(
        fixtureOf(POT, { signal: 'OUT', port: 'C', bit: 0, direction: 'output' }),
        [],
        'invalid-fixture',
      );
      expect(e.message).toContain('POT');
      expect(e.message).toContain('OUT');
      expect('signal' in e).toBe(false);
    });

    it('rejects channel 3 with port C bit 3', () => {
      const e = expectError(
        fixtureOf(
          { signal: 'KNOB', kind: 'analog', channel: 3 },
          { signal: 'SW', port: 'C', bit: 3, direction: 'input' },
        ),
        [],
        'invalid-fixture',
      );
      expect(e.message).toContain('KNOB');
      expect(e.message).toContain('SW');
    });

    it('accepts channel 0 with port C bit 1, and with port B bit 0', () => {
      expect(
        isBridgeError(EmulatorBridge.create(HEX, fixtureOf(POT, { signal: 'SW', port: 'C', bit: 1, direction: 'input' }))),
      ).toBe(false);
      expect(
        isBridgeError(EmulatorBridge.create(HEX, fixtureOf(POT, { signal: 'SW', port: 'B', bit: 0, direction: 'input' }))),
      ).toBe(false);
    });

    it('an earlier per-pin error wins over the shared pin error', () => {
      const e = expectError(
        fixtureOf(
          { signal: 'P1', kind: 'analog', channel: 0 },
          { signal: 'P2', kind: 'analog', channel: 0 },
          { signal: 'SW', port: 'C', bit: 0, direction: 'input' },
        ),
        [],
        'invalid-fixture',
      );
      expect(e.message).toContain('P2');
      expect((e as { signal?: string }).signal).toBe('P2');
    });
  });
});
