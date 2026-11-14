/// <reference types="node" />
// Property 2 (Preservation) in .kiro/specs/input-pullup: driven 0 / driven 1, outputs,
// errors and the cycle-0 snapshot. Expected to PASS on unfixed code.
// The baseline JSON was recorded once on unfixed code. These tests only read it.
// Evidence only, not proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import fc from 'fast-check';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { OutputEvent } from '../types.js';
import {
  HEX,
  FIXTURE,
  BASELINE_PATH,
  CASE_RUN_CYCLES,
  eventListArb,
  generateCases,
  run,
  type BaselineCase,
} from './input-pullup.cases.js';

const baseline: BaselineCase[] = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));

function within1pct(gap: number, target: number): boolean {
  return gap >= target * 0.99 && gap <= target * 1.01;
}

function toggleGaps(events: OutputEvent[]): number[] {
  const t = events.filter((e) => e.signal === 'LED' && e.cycle > 0 && (e.value === 0 || e.value === 1));
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) gaps.push(t[i].cycle - t[i - 1].cycle);
  return gaps;
}

/** Diagnostics are absent on unfixed code and empty after the fix. */
function diagnosticsOf(r: unknown): unknown[] {
  const d = (r as { diagnostics?: unknown[] }).diagnostics;
  return d ?? [];
}

describe('Property 2: preservation for driven inputs', { timeout: 120_000 }, () => {
  it('baseline holds 25 cases', () => {
    expect(baseline).toHaveLength(25);
  });

  it('replays the 25 seeded cases and matches the recorded baseline', () => {
    const cases = generateCases();
    expect(cases).toHaveLength(baseline.length);
    cases.forEach((events, i) => {
      expect(events, `case ${i} events`).toStrictEqual(baseline[i].events);
      const r = run(events);
      expect(r.outputEvents, `case ${i} outputEvents`).toStrictEqual(baseline[i].outputEvents);
      expect(r.appliedInputs, `case ${i} appliedInputs`).toStrictEqual(baseline[i].appliedInputs);
      expect(r.cyclesConsumed, `case ${i} cyclesConsumed`).toBe(baseline[i].cyclesConsumed);
    });
  });

  it('every baseline case, picked by property, replays to its recorded result', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: baseline.length - 1 }), (i) => {
        const r = run(baseline[i].events);
        expect(r.outputEvents).toStrictEqual(baseline[i].outputEvents);
        expect(r.appliedInputs).toStrictEqual(baseline[i].appliedInputs);
        expect(r.cyclesConsumed).toBe(baseline[i].cyclesConsumed);
      }),
      { seed: 7, numRuns: 8 },
    );
  });

  it('driven 0/1 event lists (cycle-0 drive included) produce no diagnostics', () => {
    fc.assert(
      fc.property(eventListArb, (events) => {
        const r = run(events, 1_500_000);
        expect(diagnosticsOf(r)).toStrictEqual([]);
      }),
      { seed: 11, numRuns: 6 },
    );
  });

  it('driven 0 at cycle 0 gives the held cadence (1,600,000 within 1%)', () => {
    const r = run([{ signal: 'BUTTON', value: 0, cycle: 0 }], 20_000_000);
    const gaps = toggleGaps(r.outputEvents);
    expect(gaps.some((g) => within1pct(g, 1_600_000)), JSON.stringify(gaps)).toBe(true);
    expect(r.appliedInputs).toStrictEqual([{ signal: 'BUTTON', value: 0, cycle: 0, appliedCycle: 0 }]);
    expect(diagnosticsOf(r)).toStrictEqual([]);
    // Recorded on unfixed code.
    expect(r.outputEvents.slice(0, 4)).toStrictEqual([
      { signal: 'LED', value: 'input', cycle: 0 },
      { signal: 'LED', value: 0, cycle: 263 },
      { signal: 'LED', value: 1, cycle: 1606023 },
      { signal: 'LED', value: 0, cycle: 3211631 },
    ]);
    expect(r.cyclesConsumed).toBe(20_000_000);
  });

  it('driven 1 at cycle 0 gives the released cadence (8,000,000 within 1%)', () => {
    const r = run([{ signal: 'BUTTON', value: 1, cycle: 0 }], 20_000_000);
    const gaps = toggleGaps(r.outputEvents);
    expect(gaps.some((g) => within1pct(g, 8_000_000)), JSON.stringify(gaps)).toBe(true);
    expect(r.appliedInputs).toStrictEqual([{ signal: 'BUTTON', value: 1, cycle: 0, appliedCycle: 0 }]);
    expect(diagnosticsOf(r)).toStrictEqual([]);
    // Recorded on unfixed code.
    expect(r.outputEvents).toStrictEqual([
      { signal: 'LED', value: 'input', cycle: 0 },
      { signal: 'LED', value: 0, cycle: 263 },
      { signal: 'LED', value: 1, cycle: 8012192 },
      { signal: 'LED', value: 0, cycle: 16007524 },
    ]);
    expect(r.cyclesConsumed).toBe(20_000_001);
  });
});

describe('Preservation examples: snapshot, schedule, supports, error kinds', () => {
  function make() {
    const b = EmulatorBridge.create(HEX, FIXTURE, []);
    if (isBridgeError(b)) throw new Error(JSON.stringify(b));
    return b;
  }

  it('cycle-0 snapshot is one LED "input" event, advance(0) consumes nothing', () => {
    const r = make().advance(0);
    expect(r).toMatchObject({
      cyclesConsumed: 0,
      outputEvents: [{ signal: 'LED', value: 'input', cycle: 0 }],
      appliedInputs: [],
    });
    expect(diagnosticsOf(r)).toStrictEqual([]);
  });

  it('schedule() accepts values 0 and 1 and returns undefined', () => {
    const b = make();
    expect(b.schedule({ signal: 'BUTTON', value: 0, cycle: 5 })).toBeUndefined();
    expect(b.schedule({ signal: 'BUTTON', value: 1, cycle: 6 })).toBeUndefined();
  });

  it('supports() reports gpio, timer0, adc true and usart, spi unsupported', () => {
    const b = make();
    expect(b.supports('gpio')).toBe(true);
    expect(b.supports('timer0')).toBe(true);
    expect(b.supports('adc')).toBe(true);
    for (const cap of ['usart', 'spi']) {
      expect(b.supports(cap)).toMatchObject({ kind: 'unsupported-capability', capability: cap });
    }
  });

  it('schedule() errors: unmapped-pin, input-in-past', () => {
    const b = make();
    expect(b.schedule({ signal: 'NOPE', value: 0, cycle: 5 })).toMatchObject({ kind: 'unmapped-pin', signal: 'NOPE' });
    b.advance(100);
    expect(b.cycleCount).toBe(100);
    expect(b.schedule({ signal: 'BUTTON', value: 0, cycle: 1 })).toMatchObject({ kind: 'input-in-past' });
  });

  it('create() errors: invalid-hex, unmapped-pin, unsupported-port, invalid-fixture', () => {
    expect(EmulatorBridge.create('garbage', FIXTURE, [])).toMatchObject({ kind: 'invalid-hex' });
    expect(EmulatorBridge.create(HEX, FIXTURE, [{ signal: 'X', value: 0, cycle: 0 }])).toMatchObject({
      kind: 'unmapped-pin',
      signal: 'X',
    });
    expect(
      EmulatorBridge.create(HEX, { pins: [{ signal: 'A', port: 'A' as unknown as 'B', bit: 0, direction: 'input' }] }, []),
    ).toMatchObject({ kind: 'unsupported-port', port: 'A' });
    expect(
      EmulatorBridge.create(HEX, { pins: [{ signal: 'A', port: 'B', bit: 9 as unknown as 0, direction: 'input' }] }, []),
    ).toMatchObject({ kind: 'invalid-fixture' });
    expect(EmulatorBridge.create(HEX, { clockHz: 0, pins: [] }, [])).toMatchObject({ kind: 'invalid-fixture' });
  });

  it('advance() reports cycle-overflow past MAX_SAFE_INTEGER', () => {
    const b = make();
    // Reaches into the private cpu only to place the cycle counter near the limit.
    (b as unknown as { _cpu: { cycles: number } })._cpu.cycles = Number.MAX_SAFE_INTEGER;
    expect(b.advance(10)).toMatchObject({ kind: 'cycle-overflow' });
  });

  it('cases use the documented run length', () => {
    expect(CASE_RUN_CYCLES).toBe(4_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Property 3: replay determinism, diagnostics included (task 8).
// Written before the fix. On unfixed code `diagnostics` is not returned and "release"
// is not in the type, so cases that read either are expected to FAIL. Cases that only
// compare outputEvents / appliedInputs for 0 and 1 may PASS. Evidence only, not proof.
// Randomness comes only from fast-check with explicit seeds. Time is integer cycles.
// ─────────────────────────────────────────────────────────────────────────────

type AnyEvent = Parameters<EmulatorBridge['schedule']>[0];
interface Diag { kind: string; signal: string; cycle: number; register: string }
interface Target {
  name: string;
  hex: string;
  fixture: Parameters<typeof EmulatorBridge.create>[1];
  signals: string[];
  runCycles: number;
}

const FLOATING_HEX = readFileSync(
  new URL('../../../fixtures/floating_input/build/floating_input.ino.hex', import.meta.url),
  'utf-8',
); // throws if missing: no fallback HEX

const TARGETS: Target[] = [
  { name: 'blink_button', hex: HEX, fixture: FIXTURE, signals: ['BUTTON'], runCycles: 1_500_000 },
  {
    name: 'floating_input',
    hex: FLOATING_HEX,
    fixture: {
      pins: [
        { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
        { signal: 'D3_IN', port: 'D', bit: 3, direction: 'input' },
        { signal: 'D4_IN', port: 'D', bit: 4, direction: 'input' },
      ],
    },
    signals: ['D3_IN', 'D4_IN'],
    runCycles: 2_500_000,
  },
];

const releaseAs = (v: 0 | 1 | 'release') => v as unknown as AnyEvent['value'];

function eventsArb(t: Target, values: Array<0 | 1 | 'release'>): fc.Arbitrary<AnyEvent[]> {
  return fc
    .array(
      fc.record({
        signal: fc.constantFrom(...t.signals),
        value: fc.constantFrom(...values),
        cycle: fc.integer({ min: 0, max: t.runCycles - 1 }),
      }),
      { minLength: 0, maxLength: 5 },
    )
    .map((evs) => evs.map((e) => ({ signal: e.signal, value: releaseAs(e.value), cycle: e.cycle })));
}

function build(t: Target, events: AnyEvent[]): EmulatorBridge {
  const b = EmulatorBridge.create(t.hex, t.fixture, events);
  if (isBridgeError(b)) throw new Error(`create failed: ${JSON.stringify(b)}`);
  return b;
}

type Result = ReturnType<EmulatorBridge['advance']> extends infer R ? Exclude<R, { kind: string }> : never;

/** Advance in the given chunks. Returns concatenated results and the final cycle count. */
function runChunks(t: Target, events: AnyEvent[], chunks: number[]) {
  const b = build(t, events);
  const outputEvents: OutputEvent[] = [];
  const appliedInputs: unknown[] = [];
  const diagnostics: Diag[] = [];
  let sawDiagnostics = true;
  for (const c of chunks) {
    const r = b.advance(c);
    if (isBridgeError(r)) throw new Error(`advance failed: ${JSON.stringify(r)}`);
    outputEvents.push(...r.outputEvents);
    appliedInputs.push(...r.appliedInputs);
    const d = (r as unknown as { diagnostics?: Diag[] }).diagnostics;
    if (!Array.isArray(d)) sawDiagnostics = false;
    else diagnostics.push(...d.map((x) => ({ kind: x.kind, signal: x.signal, cycle: x.cycle, register: x.register })));
  }
  return { outputEvents, appliedInputs, diagnostics, sawDiagnostics, endCycle: b.cycleCount };
}

/** Fails on unfixed code, where advance() returns no diagnostics array. */
function requireDiagnostics(r: { sawDiagnostics: boolean }, label: string): void {
  expect(r.sawDiagnostics, `${label}: advance() returned no diagnostics array`).toBe(true);
}

const fastOpts = (seed: number) => ({ seed, numRuns: 4 });

describe('Property 3: replay determinism (outputs only, values 0 and 1)', { timeout: 120_000 }, () => {
  for (const t of TARGETS) {
    it(`${t.name}: two fresh bridges give identical outputEvents and appliedInputs`, () => {
      fc.assert(
        fc.property(eventsArb(t, [0, 1]), (events) => {
          const a = runChunks(t, events, [t.runCycles]);
          const b = runChunks(t, events, [t.runCycles]);
          expect(b.outputEvents).toStrictEqual(a.outputEvents);
          expect(b.appliedInputs).toStrictEqual(a.appliedInputs);
        }),
        fastOpts(301),
      );
    });
  }
});

describe('Property 3: replay determinism including diagnostics and "release"', { timeout: 180_000 }, () => {
  for (const t of TARGETS) {
    it(`${t.name}: two fresh bridges give identical outputs, applied inputs and diagnostics`, () => {
      fc.assert(
        fc.property(eventsArb(t, [0, 1, 'release']), (events) => {
          const a = runChunks(t, events, [t.runCycles]);
          const b = runChunks(t, events, [t.runCycles]);
          requireDiagnostics(a, 'first');
          requireDiagnostics(b, 'second');
          expect(b.outputEvents).toStrictEqual(a.outputEvents);
          expect(b.appliedInputs).toStrictEqual(a.appliedInputs);
          expect(b.diagnostics).toStrictEqual(a.diagnostics);
        }),
        fastOpts(302),
      );
    });

    it(`${t.name}: replay from appliedInputs (fresh bridge, no snapshots) matches`, () => {
      fc.assert(
        fc.property(eventsArb(t, [0, 1, 'release']), (events) => {
          const a = runChunks(t, events, [t.runCycles]);
          requireDiagnostics(a, 'original');
          const recorded = (a.appliedInputs as Array<{ signal: string; value: unknown; cycle: number }>).map(
            (e) => ({ signal: e.signal, value: e.value as AnyEvent['value'], cycle: e.cycle }),
          );
          const b = runChunks(t, recorded, [t.runCycles]);
          requireDiagnostics(b, 'replay');
          expect(b.outputEvents).toStrictEqual(a.outputEvents);
          expect(b.diagnostics).toStrictEqual(a.diagnostics);
        }),
        fastOpts(303),
      );
    });

    it(`${t.name}: at most one diagnostic per signal, integer cycles within the run`, () => {
      fc.assert(
        fc.property(eventsArb(t, [0, 1, 'release']), (events) => {
          const a = runChunks(t, events, [t.runCycles]);
          requireDiagnostics(a, 'run');
          const seen = new Set<string>();
          for (const d of a.diagnostics) {
            expect(seen.has(d.signal), `duplicate diagnostic for ${d.signal}`).toBe(false);
            seen.add(d.signal);
            expect(Number.isInteger(d.cycle)).toBe(true);
            expect(d.cycle).toBeGreaterThanOrEqual(0);
            expect(d.cycle).toBeLessThanOrEqual(a.endCycle);
          }
        }),
        fastOpts(304),
      );
    });

    it(`${t.name}: ordering is the same across different advance() chunkings`, () => {
      const chunkArb = fc.array(fc.integer({ min: 1, max: Math.floor(t.runCycles / 2) }), { minLength: 1, maxLength: 5 });
      fc.assert(
        fc.property(eventsArb(t, [0, 1, 'release']), chunkArb, (events, parts) => {
          const whole = runChunks(t, events, [t.runCycles]);
          // Same total, split differently. advance() stops on an instruction boundary,
          // so compare only what both runs have reached.
          const sum = parts.reduce((s, x) => s + x, 0);
          const chunks = sum >= t.runCycles ? parts : [...parts, t.runCycles - sum];
          const split = runChunks(t, events, chunks);
          requireDiagnostics(whole, 'whole');
          requireDiagnostics(split, 'split');
          const limit = Math.min(whole.endCycle, split.endCycle);
          const upTo = <T extends { cycle: number }>(xs: T[]) => xs.filter((x) => x.cycle <= limit);
          expect(upTo(split.outputEvents)).toStrictEqual(upTo(whole.outputEvents));
          expect(upTo(split.diagnostics)).toStrictEqual(upTo(whole.diagnostics));
        }),
        fastOpts(305),
      );
    });
  }
});
