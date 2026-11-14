/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { AdcResult } from '../emulator-bridge.js';
import type { Fixture, FixturePin } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX_PATH = resolve(__dirname, '../../../fixtures/analog_read/build/analog_read.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8');

const LED: FixturePin = { signal: 'LED', port: 'B', bit: 5, direction: 'output' };

const RUN_CYCLES = 200_000;

/** Run the analog_read HEX with a single analog pin and no analog events; return every conversion seen. */
function runAtRest(restLevel: number | undefined): AdcResult[] {
  const pot: FixturePin =
    restLevel === undefined
      ? { signal: 'POT', kind: 'analog', channel: 0 }
      : { signal: 'POT', kind: 'analog', channel: 0, restLevel };
  const fixture: Fixture = { pins: [LED, pot] };
  const results: AdcResult[] = [];
  const b = EmulatorBridge.createWithTestHooks(HEX, fixture, [], {
    adcResultListener: r => results.push(r),
  });
  if (isBridgeError(b)) throw new Error(b.message);
  const r = b.advance(RUN_CYCLES);
  if (isBridgeError(r)) throw new Error(r.message);
  expect(r.appliedAnalogInputs).toHaveLength(0);
  return results;
}

/** Decode a count from the result registers using the ADLAR bit of the recorded ADMUX. */
function decode(r: AdcResult): number {
  const adlar = (r.admux & 0x20) !== 0;
  return adlar ? (r.adch << 2) | (r.adcl >> 6) : (r.adch << 8) | r.adcl;
}

describe('ADC through the bridge: smoke and rest level', { timeout: 60_000 }, () => {
  it('honours the own completeADCRead wrapper and records ADMUX at each conversion', () => {
    const results = runAtRest(undefined);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(Number.isInteger(r.cycle)).toBe(true);
      expect(r.cycle).toBeGreaterThan(0);
      // The registers hold the delivered count under the recorded ADLAR setting.
      expect(decode(r)).toBe(r.value);
    }
    // Observations, not assertions: what the Arduino core wrote to ADMUX.
    const seen = new Map<number, number>();
    for (const r of results) seen.set(r.admux, (seen.get(r.admux) ?? 0) + 1);
    const lines = [...seen].map(([admux, n]) => {
      const refs = (admux >> 6) & 0x3;
      const adlar = (admux >> 5) & 1;
      const mux = admux & 0xf;
      return `ADMUX=0x${admux.toString(16).padStart(2, '0')} REFS=${refs.toString(2).padStart(2, '0')} ADLAR=${adlar} MUX=${mux} (${n} conversions)`;
    });
    console.info(`ADC observations (${results.length} conversions in ${RUN_CYCLES} cycles):\n${lines.join('\n')}`);
  });

  it('delivers 512 at rest when the pin has no restLevel', () => {
    const results = runAtRest(undefined);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) expect(r.value).toBe(512);
  });

  it('delivers the restLevel at rest when one is given', () => {
    for (const level of [0, 100, 1023]) {
      const results = runAtRest(level);
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) expect(r.value).toBe(level);
    }
  });
});

// Feature: gremlin-engine, Property 23 (through-bridge half): ADC count round trip.
// Exhaustive over counts 0..1023, no random generator. Evidence, not proof.
describe('ADC through the bridge: exhaustive count round trip', () => {
  it('reads back every applied count 0..1023 (second half of each interval)', { timeout: 60_000 }, () => {
    const SPACING = 8_000;
    const FIRST = SPACING; // event for count c lands at (c + 1) * SPACING
    const RUN = (1024 + 1) * SPACING + 200; // about 8.2 million cycles
    const fixture: Fixture = { pins: [LED, { signal: 'POT', kind: 'analog', channel: 0 }] };
    const events = Array.from({ length: 1024 }, (_, c) => ({
      signal: 'POT',
      analog: c,
      cycle: FIRST + c * SPACING,
    }));
    const results: AdcResult[] = [];
    const b = EmulatorBridge.createWithTestHooks(HEX, fixture, events, {
      adcResultListener: r => results.push(r),
    });
    if (isBridgeError(b)) throw new Error(b.message);
    const r = b.advance(RUN);
    if (isBridgeError(r)) throw new Error(r.message);
    expect(r.appliedAnalogInputs).toHaveLength(1024);

    const checked = new Array<number>(1024).fill(0);
    const failures: string[] = [];
    const refsSeen = new Set<number>();
    for (const res of results) {
      const refs = (res.admux >> 6) & 0x3;
      refsSeen.add(refs);
      if (res.cycle < FIRST) continue;
      const c = Math.floor((res.cycle - FIRST) / SPACING);
      if (c < 0 || c > 1023) continue;
      const intoInterval = (res.cycle - FIRST) - c * SPACING;
      if (intoInterval < SPACING / 2) continue; // only the second half of the interval
      checked[c]++;
      // The test must not pass on a reference it does not model.
      expect([0, 1]).toContain(refs);
      const got = decode(res);
      if (got !== c || res.value !== c) {
        failures.push(
          `count=${c} decoded=${got} value=${res.value} cycle=${res.cycle} ADCL=${res.adcl} ADCH=${res.adch} ADMUX=0x${res.admux.toString(16)}`,
        );
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
    // No vacuous passes: every count was checked at least once.
    const unchecked = checked.map((n, c) => (n === 0 ? c : -1)).filter(c => c >= 0);
    expect(unchecked).toEqual([]);
    console.info(
      `ADC round trip: ${results.length} conversions, ${checked.reduce((a, n) => a + n, 0)} checked, REFS seen: ${[...refsSeen].join(',')}`,
    );
  });
});
