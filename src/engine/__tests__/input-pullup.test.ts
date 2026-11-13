/// <reference types="node" />
// Bug condition exploration: an idle (undriven) BUTTON under INPUT_PULLUP must read HIGH.
// Property 1 in .kiro/specs/input-pullup. Expected to FAIL on unfixed code.
// Evidence only, not proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { EmulatorBridge, isBridgeError } from '../emulator-bridge.js';
import type { Fixture, InputEvent, OutputEvent } from '../types.js';

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

const RUN_CYCLES = 20_000_000;
const RELEASED_GAP = 8_000_000;
const HELD_GAP = 1_600_000;

function within1pct(gap: number, target: number): boolean {
  return gap >= target * 0.99 && gap <= target * 1.01;
}

function runLedEvents(inputs: InputEvent[]): OutputEvent[] {
  const bridge = EmulatorBridge.create(HEX, FIXTURE, inputs);
  if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
  const result = bridge.advance(RUN_CYCLES);
  if (isBridgeError(result)) throw new Error(`advance failed: ${JSON.stringify(result)}`);
  return result.outputEvents.filter((e: OutputEvent) => e.signal === 'LED');
}

/** Gaps between consecutive LED toggles after the cycle-0 snapshot. */
function toggleGaps(ledEvents: OutputEvent[]): number[] {
  const toggles = ledEvents.filter(
    (e: OutputEvent) => e.cycle > 0 && (e.value === 0 || e.value === 1),
  );
  const gaps: number[] = [];
  for (let i = 1; i < toggles.length; i++) {
    gaps.push(toggles[i].cycle - toggles[i - 1].cycle);
  }
  return gaps;
}

describe('Property 1: idle blink_button presents BUTTON HIGH under pull-up', { timeout: 60_000 }, () => {
  // No input events at all: BUTTON is released.
  const idle = () => runLedEvents([]);

  it('LED toggle spacing is the released cadence (8,000,000 cycles within 1%)', () => {
    const gaps = toggleGaps(idle());
    expect(gaps.some((g) => within1pct(g, RELEASED_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(true);
  });

  it('LED toggle spacing is NOT the held cadence (1,600,000 cycles within 1%)', () => {
    const gaps = toggleGaps(idle());
    expect(gaps.some((g) => within1pct(g, HELD_GAP)), `gaps: ${JSON.stringify(gaps)}`).toBe(false);
  });

  it('LED event list equals the one with BUTTON driven to 1 at cycle 0', () => {
    const driven = runLedEvents([{ signal: 'BUTTON', value: 1, cycle: 0 }]);
    expect(idle()).toStrictEqual(driven);
  });
});

// ── Task 3: "release" event ─────────────────────────────────────────────────
// Property 1 (release part). "release" is not in the InputEvent type before the fix,
// so events are cast. Expected to FAIL on unfixed code. Evidence only, not proof.

const RELEASE_RUN_CYCLES = 40_000_000;
const C1 = 2_000_000;  // after setup() has enabled the pull-up
const C2 = 8_000_000;

function ev(value: 0 | 1 | 'release', cycle: number): InputEvent {
  return { signal: 'BUTTON', value, cycle } as unknown as InputEvent;
}

function runLed(inputs: InputEvent[], cycles = RELEASE_RUN_CYCLES): OutputEvent[] {
  const bridge = EmulatorBridge.create(HEX, FIXTURE, inputs);
  if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
  const result = bridge.advance(cycles);
  if (isBridgeError(result)) throw new Error(`advance failed: ${JSON.stringify(result)}`);
  return result.outputEvents.filter((e: OutputEvent) => e.signal === 'LED' && e.cycle > 0);
}

function gapsOf(cycles: number[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < cycles.length; i++) gaps.push(cycles[i] - cycles[i - 1]);
  return gaps;
}

describe('Property 1: "release" returns the pin to the level its configuration implies', { timeout: 120_000 }, () => {
  it('held cadence between drive-0 and release, released cadence after release', () => {
    const led = runLed([ev(0, C1), ev('release', C2)]);
    const cycles = led.map((e) => e.cycle);

    const during = cycles.filter((c) => c > C1 && c <= C2);
    const duringGaps = gapsOf(during);
    expect(duringGaps.length, `toggle cycles: ${JSON.stringify(cycles)}`).toBeGreaterThan(0);
    expect(
      duringGaps.every((g) => within1pct(g, HELD_GAP)),
      `held-phase gaps: ${JSON.stringify(duringGaps)}`,
    ).toBe(true);

    const after = cycles.filter((c) => c > C2);
    const afterGaps = gapsOf(after);
    expect(afterGaps.length, `toggle cycles: ${JSON.stringify(cycles)}`).toBeGreaterThan(0);
    expect(
      afterGaps.every((g) => within1pct(g, RELEASED_GAP)),
      `post-release gaps: ${JSON.stringify(afterGaps)}`,
    ).toBe(true);
  });

  it('schedule() accepts "release" and keeps the existing error kinds', () => {
    const bridge = EmulatorBridge.create(HEX, FIXTURE, []);
    if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
    expect(bridge.schedule(ev('release', 5_000))).toBeUndefined();

    const unmapped = bridge.schedule({ signal: 'NOPE', value: 'release', cycle: 5_000 } as unknown as InputEvent);
    expect(isBridgeError(unmapped) && unmapped.kind).toBe('unmapped-pin');

    const adv = bridge.advance(1_000);
    if (isBridgeError(adv)) throw new Error(`advance failed: ${JSON.stringify(adv)}`);
    const past = bridge.schedule(ev('release', 0));
    expect(isBridgeError(past) && past.kind).toBe('input-in-past');
  });

  it('a scheduled "release" is applied at its cycle', () => {
    const bridge = EmulatorBridge.create(HEX, FIXTURE, [ev(0, 1_000), ev('release', 50_000)]);
    if (isBridgeError(bridge)) throw new Error(`create failed: ${JSON.stringify(bridge)}`);
    const adv = bridge.advance(100_000);
    if (isBridgeError(adv)) throw new Error(`advance failed: ${JSON.stringify(adv)}`);
    expect(adv.appliedInputs.map((a) => a.value)).toStrictEqual([0, 'release']);
  });

  it('driven 0 keeps the held cadence and driven 1 keeps the released cadence despite DDR/PORT writes', () => {
    const held = gapsOf(runLed([ev(0, 0)]).map((e) => e.cycle));
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((g) => within1pct(g, HELD_GAP)), `driven-0 gaps: ${JSON.stringify(held)}`).toBe(true);

    const rel = gapsOf(runLed([ev(1, 0)]).map((e) => e.cycle));
    expect(rel.length).toBeGreaterThan(0);
    expect(rel.every((g) => within1pct(g, RELEASED_GAP)), `driven-1 gaps: ${JSON.stringify(rel)}`).toBe(true);
  });
});
