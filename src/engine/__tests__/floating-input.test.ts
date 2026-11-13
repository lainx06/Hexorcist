/// <reference types="node" />
// Floating-input diagnostics on the user-compiled floating_input sketch.
// Property 1 in .kiro/specs/input-pullup. Expected to FAIL on unfixed code
// (`diagnostics` is not returned by advance()). Evidence only, not proof.
//
// Limit: diagnostics are per PIN register read, not per bit. With several
// released inputs on one port, a diagnostic can be recorded for a pin the
// firmware did not mean to read (D3 and D4 share PIND).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, InputEvent, OutputEvent } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEX_PATH = resolve(__dirname, '../../../fixtures/floating_input/build/floating_input.ino.hex');
const HEX = readFileSync(HEX_PATH, 'utf-8'); // throws if missing: no fallback HEX

// Pin maps are fixture data. Pin index order: LED, D3_IN, D4_IN.
const FIXTURE: Fixture = {
  pins: [
    { signal: 'LED',   port: 'B', bit: 5, direction: 'output' },
    { signal: 'D3_IN', port: 'D', bit: 3, direction: 'input' },
    { signal: 'D4_IN', port: 'D', bit: 4, direction: 'input' },
  ],
};
const SIGNAL_ORDER = ['D3_IN', 'D4_IN'];

const FIRST_RUN = 4_000_000; // well past the ~100 ms (1,600,000 cycle) pull-up switch
const SECOND_RUN = 2_000_000;

// `diagnostics` does not exist in the type yet; read it through a narrow cast.
interface Diag { kind: string; signal: string; cycle: number; register: string }
type WithDiag = { diagnostics?: Diag[] };

function makeBridge(inputs: InputEvent[] = []): EmulatorBridge {
  const bridge = EmulatorBridge.create(HEX, FIXTURE, inputs);
  if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
  return bridge;
}

function advance(bridge: EmulatorBridge, cycles: number) {
  const r = bridge.advance(cycles);
  if (isBridgeError(r)) throw new Error(`advance failed: ${JSON.stringify(r)}`);
  return r;
}

const diagsOf = (r: unknown): Diag[] => (r as WithDiag).diagnostics as Diag[];

describe('Property 1: released plain input presents LOW and records one diagnostic', { timeout: 60_000 }, () => {
  it('records exactly one D3_IN diagnostic with PIND and an integer cycle', () => {
    const diags = diagsOf(advance(makeBridge(), FIRST_RUN));
    const d3 = diags.filter((d) => d.signal === 'D3_IN');
    expect(d3).toHaveLength(1);
    expect(d3[0]).toEqual({ kind: 'floating-input', signal: 'D3_IN', cycle: d3[0].cycle, register: 'PIND' });
    expect(Number.isInteger(d3[0].cycle)).toBe(true);
  });

  it('D4_IN reads LOW before the pull-up, with one diagnostic earlier than the pull-up', () => {
    const r = advance(makeBridge(), FIRST_RUN);
    const diags = diagsOf(r);
    const led = r.outputEvents.filter((e: OutputEvent) => e.signal === 'LED' && e.cycle > 0);
    // The LED mirrors D4_IN. It turns on only once D4_IN is presented HIGH (after the pull-up).
    const onEvent = led.find((e: OutputEvent) => e.value === 1);
    expect(onEvent, `LED events: ${JSON.stringify(led)}`).toBeDefined();
    const pullUpPresentedAt = onEvent!.cycle;
    // Before that cycle the LED never turned on, so D4_IN was presented LOW.
    expect(led.filter((e: OutputEvent) => e.cycle < pullUpPresentedAt && e.value === 1)).toHaveLength(0);

    const d4 = diags.filter((d) => d.signal === 'D4_IN');
    expect(d4).toHaveLength(1);
    expect(d4[0]).toEqual({ kind: 'floating-input', signal: 'D4_IN', cycle: d4[0].cycle, register: 'PIND' });
    expect(Number.isInteger(d4[0].cycle)).toBe(true);
    // Not tied to a specific read: it may come from a read aimed at D3 (shared PIND).
    expect(d4[0].cycle).toBeLessThan(pullUpPresentedAt);
  });

  it('D4_IN reads HIGH after the pull-up and adds no new D4_IN diagnostic', () => {
    const bridge = makeBridge();
    const first = advance(bridge, FIRST_RUN);
    const ledOn = first.outputEvents.filter((e: OutputEvent) => e.signal === 'LED' && e.value === 1 && e.cycle > 0);
    expect(ledOn.length).toBeGreaterThan(0);
    const d4Before = diagsOf(first).filter((d) => d.signal === 'D4_IN');

    const second = advance(bridge, SECOND_RUN);
    const later = diagsOf(second);
    expect(later.filter((d) => d.signal === 'D4_IN')).toHaveLength(0);
    // The earliest entry stands: later reads neither add nor move entries.
    expect(later).toHaveLength(0);
    expect(d4Before).toHaveLength(1);
    // LED does not turn off again after the pull-up.
    expect(second.outputEvents.filter((e: OutputEvent) => e.signal === 'LED' && e.value !== 1)).toHaveLength(0);
  });

  it('every diagnostic has the exact shape, one per signal, same-cycle order by pin index', () => {
    const diags = diagsOf(advance(makeBridge(), FIRST_RUN));
    expect(diags.length).toBeGreaterThan(0);
    for (const d of diags) {
      expect(Object.keys(d).sort()).toEqual(['cycle', 'kind', 'register', 'signal']);
      expect(d.kind).toBe('floating-input');
      expect(d.register).toBe('PIND');
      expect(Number.isInteger(d.cycle)).toBe(true);
      expect(SIGNAL_ORDER).toContain(d.signal);
    }
    const signals = diags.map((d) => d.signal);
    expect(new Set(signals).size).toBe(signals.length);
    for (let i = 1; i < diags.length; i++) {
      if (diags[i].cycle === diags[i - 1].cycle) {
        expect(SIGNAL_ORDER.indexOf(diags[i].signal)).toBeGreaterThan(SIGNAL_ORDER.indexOf(diags[i - 1].signal));
      }
    }
  });

  it.each([
    [0, 0], [0, 1], [1, 0], [1, 1],
  ] as const)('driven D3_IN=%i, D4_IN=%i at cycle 0 gives no diagnostic', (v3, v4) => {
    const inputs: InputEvent[] = [
      { signal: 'D3_IN', value: v3, cycle: 0 },
      { signal: 'D4_IN', value: v4, cycle: 0 },
    ];
    const r = advance(makeBridge(inputs), FIRST_RUN);
    // Guarded so this case is not the reason the file fails on unfixed code.
    expect((r as WithDiag).diagnostics ?? []).toEqual([]);
  });

  it('advance(0) returns an empty diagnostics array', () => {
    const r = advance(makeBridge(), 0);
    expect((r as WithDiag).diagnostics).toEqual([]);
  });
});

// Task 6: late pull-up. D4_IN is a plain input for the earliest 100 ms, then the
// firmware switches it to INPUT_PULLUP. The LED mirrors D4_IN, so LED events are
// the only view of the presented D4_IN level. Evidence only, not proof.
describe('Property 1: presented level tracks a pull-up enabled after the run starts', { timeout: 60_000 }, () => {
  const ledEvents = (r: { outputEvents: OutputEvent[] }) =>
    r.outputEvents.filter((e: OutputEvent) => e.signal === 'LED' && e.cycle > 0);

  it('before the pull-up D4_IN reads LOW (LED off) with one D4_IN diagnostic; after it D4_IN reads HIGH (LED on) with no second one', () => {
    const bridge = makeBridge();
    const first = advance(bridge, FIRST_RUN);
    const led = ledEvents(first);
    const onEvent = led.find((e: OutputEvent) => e.value === 1);
    expect(onEvent, `LED events: ${JSON.stringify(led)}`).toBeDefined();
    // Never on before the pull-up was presented.
    expect(led.filter((e) => e.cycle < onEvent!.cycle && e.value === 1)).toHaveLength(0);
    // The pull-up switch is at about 100 ms (1,600,000 cycles); LED on cannot precede it.
    expect(onEvent!.cycle).toBeGreaterThanOrEqual(1_600_000);

    const d4 = diagsOf(first).filter((d) => d.signal === 'D4_IN');
    expect(d4).toHaveLength(1);
    expect(d4[0].cycle).toBeLessThan(onEvent!.cycle);

    const second = advance(bridge, SECOND_RUN);
    expect(diagsOf(second).filter((d) => d.signal === 'D4_IN')).toHaveLength(0);
    expect(ledEvents(second).filter((e) => e.value !== 1)).toHaveLength(0);
  });

  it('D4_IN driven to 0 at cycle 0 keeps the LED off after the pull-up; a later "release" turns it on', () => {
    const drive: InputEvent[] = [{ signal: 'D4_IN', value: 0, cycle: 0 }];
    const bridge = makeBridge(drive);
    const first = advance(bridge, FIRST_RUN); // well past the pull-up switch
    expect(ledEvents(first).filter((e) => e.value === 1), 'LED must stay off while D4_IN is driven LOW').toHaveLength(0);

    // "release" is not in InputEvent yet; cast it through unknown.
    const release = { signal: 'D4_IN', value: 'release', cycle: first.cyclesConsumed + 100 } as unknown as InputEvent;
    const added = bridge.schedule(release);
    expect(added === undefined, `schedule: ${JSON.stringify(added)}`).toBe(true);

    const second = advance(bridge, SECOND_RUN);
    const on = ledEvents(second).filter((e) => e.value === 1);
    expect(on.length, `LED events after release: ${JSON.stringify(ledEvents(second))}`).toBeGreaterThan(0);
  });
});
