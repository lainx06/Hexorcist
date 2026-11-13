/// <reference types="node" />
// Task 7 in .kiro/specs/input-pullup.
//   Property 5 (chaining): a pre-existing PIN read hook is kept and its value is what the firmware sees.
//   Property 4 (no under-report): every read of PIND while a released signal is a plain input is
//   covered by that signal's diagnostic, at most one entry per signal.
// Expected to FAIL on unfixed code: EmulatorBridge.createWithTestHooks does not exist yet.
// Evidence only, not proof.
//
// Limit: diagnostics are per PIN register read, not per bit. Over-report is allowed and is not asserted.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import fc from 'fast-check';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, InputEvent, OutputEvent, AppliedInputEvent } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLINK_HEX = readFileSync(resolve(__dirname, '../../../fixtures/blink_button/build/blink_button.ino.hex'), 'utf-8');
const FLOAT_HEX = readFileSync(
  resolve(__dirname, '../../../fixtures/floating_input/build/floating_input.ino.hex'),
  'utf-8', // throws if missing: no fallback HEX
);

// Pin maps are fixture data.
const BLINK_FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};
const FLOAT_FIXTURE: Fixture = {
  pins: [
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    { signal: 'D3_IN', port: 'D', bit: 3, direction: 'input' },
    { signal: 'D4_IN', port: 'D', bit: 4, direction: 'input' },
  ],
};

const PIND_ADDR = 0x29; // data-space address of PIND on the ATmega328P
const HELD_GAP = 1_600_000;
const RELEASED_GAP = 8_000_000;

type PinReg = 'PINB' | 'PINC' | 'PIND';
interface TestHooks {
  pinReadStubs?: Partial<Record<PinReg, (addr: number) => number>>;
  portListeners?: Partial<Record<'B' | 'C' | 'D', (value: number, oldValue: number) => void>>;
}
interface Diag { kind: string; signal: string; cycle: number; register: string }

/** The test-only path does not exist before the fix, so reach it through a narrow cast. */
function createWithTestHooks(hex: string, fixture: Fixture, events: InputEvent[], hooks: TestHooks): EmulatorBridge {
  const factory = (EmulatorBridge as unknown as {
    createWithTestHooks?: (h: string, f: Fixture, e: InputEvent[], k: TestHooks) => EmulatorBridge;
  }).createWithTestHooks;
  if (typeof factory !== 'function') {
    throw new Error('EmulatorBridge.createWithTestHooks is not a function (not implemented yet)');
  }
  const b = factory.call(EmulatorBridge, hex, fixture, events, hooks);
  if (isBridgeError(b)) throw new Error(`create failed: ${JSON.stringify(b)}`);
  return b;
}

function advance(bridge: EmulatorBridge, cycles: number) {
  const r = bridge.advance(cycles);
  if (isBridgeError(r)) throw new Error(`advance failed: ${JSON.stringify(r)}`);
  return r;
}

const diagsOf = (r: unknown): Diag[] => (r as { diagnostics?: Diag[] }).diagnostics as Diag[];

const within1pct = (gap: number, target: number) => gap >= target * 0.99 && gap <= target * 1.01;

function ledGaps(events: OutputEvent[]): number[] {
  const t = events.filter((e) => e.signal === 'LED' && e.cycle > 0 && (e.value === 0 || e.value === 1));
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) gaps.push(t[i].cycle - t[i - 1].cycle);
  return gaps;
}

describe('Property 5: chaining keeps a pre-existing PIN read hook', { timeout: 120_000 }, () => {
  it('part A: a PIND stub with bit 2 clear is what the firmware sees (blink_button, BUTTON released)', () => {
    const calls: number[] = [];
    const bridge = createWithTestHooks(BLINK_HEX, BLINK_FIXTURE, [], {
      pinReadStubs: { PIND: (addr) => { calls.push(addr); return 0x00; } },
    });
    const r = advance(bridge, 12_000_000);
    const gaps = ledGaps(r.outputEvents);
    expect(gaps.some((g) => within1pct(g, HELD_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(true);
    expect(gaps.some((g) => within1pct(g, RELEASED_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((a) => a === PIND_ADDR)).toBe(true);
  });

  it('part B: with a PIND stub, the stub value is returned and the D3_IN diagnostic still fires', () => {
    const calls: number[] = [];
    // Bit 4 set: the firmware sees D4 as HIGH, so the LED turns on before the pull-up can exist (< 1,600,000).
    const bridge = createWithTestHooks(FLOAT_HEX, FLOAT_FIXTURE, [], {
      pinReadStubs: { PIND: (addr) => { calls.push(addr); return 0x10; } },
    });
    const r = advance(bridge, 1_000_000);
    const ledOn = r.outputEvents.filter((e) => e.signal === 'LED' && e.cycle > 0 && e.value === 1);
    expect(ledOn.length, `LED events: ${JSON.stringify(r.outputEvents)}`).toBeGreaterThan(0);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((a) => a === PIND_ADDR)).toBe(true);
    const d3 = diagsOf(r).filter((d) => d.signal === 'D3_IN');
    expect(d3).toHaveLength(1);
    expect(d3[0].register).toBe('PIND');
  });

  it('part C: a portListeners.D listener still runs on DDR/PORT writes next to the bridge listener', () => {
    const seen: Array<[number, number]> = [];
    const bridge = createWithTestHooks(BLINK_HEX, BLINK_FIXTURE, [], {
      portListeners: { D: (value, oldValue) => { seen.push([value, oldValue]); } },
    });
    const r = advance(bridge, 20_000_000);
    // setup() enables the pull-up on D2 with a PORTD write, which notifies the listener.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(([v, o]) => Number.isInteger(v) && Number.isInteger(o))).toBe(true);
    // The bridge's own listener still presents the released button as HIGH.
    const gaps = ledGaps(r.outputEvents);
    expect(gaps.some((g) => within1pct(g, RELEASED_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(true);
  });
});

// ── Property 4 ────────────────────────────────────────────────────────────────

const RUN_END = 1_500_000;     // D4 is still a plain input here: the pull-up switch is at >= 100 ms = 1,600,000 cycles
const BOUNDARY_MARGIN = 8;     // reads this close to an event's applied cycle are ambiguous and are skipped
const SEED = 0x7a11ed07;       // explicit fast-check seed

const eventArb = fc.record({
  signal: fc.constantFrom('D3_IN', 'D4_IN'),
  value: fc.constantFrom<0 | 1 | 'release'>(0, 1, 'release'),
  cycle: fc.integer({ min: 0, max: RUN_END - 100_000 }),
});
// Ordered event lists: sorted ascending by cycle (stable).
const eventListArb = fc
  .array(eventArb, { minLength: 0, maxLength: 6 })
  .map((evs) => [...evs].sort((a, b) => a.cycle - b.cycle));
const chunkingArb = fc.array(fc.integer({ min: 1, max: 400_000 }), { minLength: 1, maxLength: 8 });

describe('Property 4: no under-report on PIND reads, at most one diagnostic per signal', { timeout: 300_000 }, () => {
  it('every PIND read while a signal is released and a plain input is covered (seeded)', () => {
    fc.assert(
      fc.property(eventListArb, chunkingArb, (events, chunks) => {
        const reads: number[] = [];
        let bridgeRef: EmulatorBridge | undefined;
        const bridge = createWithTestHooks(
          FLOAT_HEX,
          FLOAT_FIXTURE,
          events as unknown as InputEvent[],
          { pinReadStubs: { PIND: () => { reads.push(bridgeRef!.cycleCount); return 0x00; } } },
        );
        bridgeRef = bridge;

        const diags: Diag[] = [];
        const applied: AppliedInputEvent[] = [];
        let total = 0;
        const step = (n: number) => {
          const r = advance(bridge, n);
          total += r.cyclesConsumed;
          diags.push(...diagsOf(r));
          applied.push(...r.appliedInputs);
        };
        for (const c of chunks) {
          if (total >= RUN_END) break;
          step(Math.min(c, RUN_END - total));
        }
        if (total < RUN_END) step(RUN_END - total);

        expect(reads.length).toBeGreaterThan(0);

        // At most one entry per signal.
        const bySignal = new Map<string, Diag[]>();
        for (const d of diags) bySignal.set(d.signal, [...(bySignal.get(d.signal) ?? []), d]);
        for (const [sig, list] of bySignal) expect(list, `signal ${sig}`).toHaveLength(1);

        // Coverage: released + plain input at the read => a diagnostic at or before the read.
        for (const sig of ['D3_IN', 'D4_IN']) {
          const evs = applied.filter((e) => e.signal === sig);
          for (const r of reads) {
            if (r >= RUN_END) continue;
            if (evs.some((e) => Math.abs(e.appliedCycle - r) <= BOUNDARY_MARGIN)) continue;
            const prior = evs.filter((e) => e.appliedCycle < r);
            const last = prior[prior.length - 1];
            const released = last === undefined || (last.value as unknown) === 'release';
            if (!released) continue;
            const d = bySignal.get(sig)?.[0];
            expect(d, `read at ${r}: no diagnostic for ${sig}`).toBeDefined();
            expect(d!.cycle, `diag for ${sig} must be at or before read ${r}`).toBeLessThanOrEqual(r);
          }
        }
      }),
      { seed: SEED, numRuns: 20 },
    );
  });
});
