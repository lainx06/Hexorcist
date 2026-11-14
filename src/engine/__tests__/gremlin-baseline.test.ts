/// <reference types="node" />
// Event_List baseline: regenerates every recorded case with buildEventList and compares it with
// baselines/gremlin-eventlists.json. Catches a silent change of draw order across commits.
// A mismatch is reported, never regenerated. Evidence, not proof. No emulator and no HEX are used.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { buildEventList } from '../event-list.js';
import { validateFixture } from '../fixture.js';
import type { Fixture } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BaselineCase {
  fixture: string;
  campaignSeed: number;
  runIndex: number;
  runSeed: number;
  events: { signal: string; cycle: number; gremlinId: string }[];
  skipped: { gremlinId: string; reason: string }[];
}
interface Baseline {
  runCycles: number;
  campaignSeeds: number[];
  runIndices: number[];
  gremlinSet: { id: string }[];
  fixtures: Record<string, Fixture>;
  cases: BaselineCase[];
}

const BASELINE: Baseline = JSON.parse(
  readFileSync(resolve(__dirname, 'baselines/gremlin-eventlists.json'), 'utf-8'),
);

// Pin maps are fixture data: identical to the existing floating-input and input-pullup tests,
// and the synthetic Fixture of the design "Baseline file policy".
const FIXTURES: Record<string, Fixture> = {
  blink_button: {
    pins: [
      { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    ],
  },
  floating_input: {
    pins: [
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
      { signal: 'D3_IN', port: 'D', bit: 3, direction: 'input' },
      { signal: 'D4_IN', port: 'D', bit: 4, direction: 'input' },
    ],
  },
  synthetic_events: {
    clockHz: 16_000_000,
    pins: [
      { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input', activeLevel: 'low' },
      { signal: 'BEAM', port: 'D', bit: 3, direction: 'input', activeLevel: 'high', restState: 'active' },
      { signal: 'POT', kind: 'analog', channel: 0, restLevel: 300 },
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    ],
  },
};
const NAMES = ['blink_button', 'floating_input', 'synthetic_events'];

describe('gremlin event-list baseline', () => {
  it('records the fixed inputs of the design', () => {
    expect(BASELINE.runCycles).toBe(8_000_000);
    expect(BASELINE.campaignSeeds).toStrictEqual([0, 1, 42, 4294967295]);
    expect(BASELINE.runIndices).toStrictEqual([0, 1, 2]);
    expect(BASELINE.gremlinSet).toStrictEqual(
      ['masher', 'bouncer', 'stuck', 'dropout', 'spike', 'drifter'].map((id) => ({ id })),
    );
    expect(BASELINE.fixtures).toStrictEqual(FIXTURES);
    expect(BASELINE.cases).toHaveLength(NAMES.length * 4 * 3);
  });

  it('the synthetic Fixture passes validation', () => {
    expect(validateFixture(FIXTURES.synthetic_events)).toBeNull();
  });

  it.each(NAMES)('%s: every recorded case regenerates identically', (name) => {
    const cases = BASELINE.cases.filter((c) => c.fixture === name);
    expect(cases).toHaveLength(12);
    for (const rec of cases) {
      const got = buildEventList({
        fixture: FIXTURES[name],
        gremlinSet: BASELINE.gremlinSet,
        runCycles: BASELINE.runCycles,
        campaignSeed: rec.campaignSeed,
        runIndex: rec.runIndex,
      });
      expect('kind' in got, `${name} ${rec.campaignSeed}/${rec.runIndex}: ${JSON.stringify(got)}`).toBe(false);
      if ('kind' in got) continue;
      // Compare through JSON so the file and the live value have the same shape.
      const live = JSON.parse(JSON.stringify(got));
      expect(live, `${name} seed ${rec.campaignSeed} index ${rec.runIndex}`).toStrictEqual({
        runSeed: rec.runSeed,
        events: rec.events,
        skipped: rec.skipped,
      });
    }
  });

  it('synthetic_events records at least one Spike, one Drifter and one Dropout event', () => {
    const events = BASELINE.cases.filter((c) => c.fixture === 'synthetic_events').flatMap((c) => c.events);
    for (const id of ['spike', 'drifter', 'dropout']) {
      expect(events.filter((e) => e.gremlinId === id).length, `no ${id} event recorded`).toBeGreaterThan(0);
    }
  });
});
