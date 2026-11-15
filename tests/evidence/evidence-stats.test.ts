// Feature: honest-verdicts, Part 3. Unit tests for the pure evidence-bench helpers.
// Passing tests are evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from 'vitest';
import {
  findForbiddenWords,
  groups,
  medianText,
  minMaxText,
  renderEvidenceDoc,
  sweepStarts,
} from '../../bench/evidence-stats';
import type { EvidenceResults } from '../../bench/evidence-stats';

describe('medianText', () => {
  it('gives none for an empty list', () => expect(medianText([])).toBe('none'));
  it('gives the middle value for an odd count', () => expect(medianText([3])).toBe('3'));
  it('gives one decimal for a non-integer mean', () => expect(medianText([1, 2])).toBe('1.5'));
  it('gives no decimal point for an integer mean', () => expect(medianText([1, 3])).toBe('2'));
  it('sorts before taking the middle', () => expect(medianText([9, 1, 5])).toBe('5'));
  it('leaves its argument unchanged', () => {
    const xs = [4, 2, 8, 6];
    expect(medianText(xs)).toBe('5');
    expect(xs).toStrictEqual([4, 2, 8, 6]);
  });
});

describe('minMaxText', () => {
  it('gives none for an empty list', () => expect(minMaxText([])).toStrictEqual({ min: 'none', max: 'none' }));
  it('gives the extremes', () => expect(minMaxText([7, 2, 11])).toStrictEqual({ min: '2', max: '11' }));
});

describe('sweepStarts with the Single_Input holds', () => {
  const cases: [string, number, number, number, number][] = [
    ['crosswalk', 16_000_000, 800_000, 94, 15_040_000],
    ['garage', 10_000_000, 32_000, 62, 9_920_000],
    ['heartbeat', 16_000_000, 1_600_000, 89, 14_240_000],
  ];
  for (const [name, runCycles, hold, count, last] of cases) {
    it(`${name}: ${count} starts from 160,000 to ${last}`, () => {
      const s = sweepStarts(runCycles, hold);
      expect(s.length).toBe(count);
      expect(s[0]).toBe(160_000);
      expect(s[s.length - 1]).toBe(last);
      for (let i = 0; i < s.length; i++) expect(s[i]).toBe((i + 1) * 160_000);
      expect(s[s.length - 1] + hold).toBeLessThan(runCycles);
      expect(s[s.length - 1] + 160_000 + hold).toBeGreaterThanOrEqual(runCycles);
    });
  }
});

describe('groups', () => {
  it('puts commas between groups of 3 digits', () => {
    expect(groups(0)).toBe('0');
    expect(groups(512)).toBe('512');
    expect(groups(16_000)).toBe('16,000');
    expect(groups(15_647_543)).toBe('15,647,543');
  });
});

describe('renderEvidenceDoc', () => {
  const r: EvidenceResults = {
    machine: { os: 'TestOS 1.0 (x64)', cpu: 'Test CPU', cores: 8, node: 'v20.0.0', avr8js: '0.21.1' },
    date: '2026-11-15',
    seconds: { seedSweep: 12.34, pressSweep: 5.6, total: 18 },
    seedRows: [
      { example: 'crosswalk', build: 'buggy', seeds: [1, 100], runsPerCampaign: 24, broke: 97, held: 3, couldntTell: 0, violatingRunNumbers: [1, 4, 2], heldTexts: ['No violation found in 24 emulated runs of this gremlin set. Not a proof.'] },
      { example: 'crosswalk', build: 'fixed', seeds: [1, 20], runsPerCampaign: 24, broke: 0, held: 20, couldntTell: 0, violatingRunNumbers: [], heldTexts: [] },
    ],
    pressRows: [
      { example: 'crosswalk', build: 'buggy', signal: 'REQUEST', holdCycles: 800_000, runCycles: 16_000_000, starts: 94, lastStart: 15_040_000, violations: [], cannotCheckRuns: 0 },
    ],
  };
  const text = renderEvidenceDoc(r);
  it('holds the counts, the machine block and the chip name', () => {
    expect(text).toContain('| crosswalk | buggy | 1 to 100 | 24 | 97 | 3 | 0 | 1 / 2 / 4 |');
    expect(text).toContain('| crosswalk | fixed | 1 to 20 | 24 | 0 | 20 | 0 | not measured |');
    expect(text).toContain('| crosswalk | buggy | REQUEST | 800,000 | 160,000 to 15,040,000 | 94 | 0 | 0 |');
    expect(text).toContain('| CPU | Test CPU, 8 cores |');
    expect(text).toContain('| Date of run (UTC) | 2026-11-15 |');
    expect(text).toContain('seed sweep 12.3 s, single-press sweep 5.6 s, whole bench 18.0 s');
    expect(text).toContain('ATmega328P');
    expect(text).toContain('not a proof');
    expect(text).toContain('"No violation found in 24 emulated runs of this gremlin set. Not a proof."');
    expect(text).toContain("COULDN'T TELL");
  });
  it('holds no forbidden word', () => expect(findForbiddenWords(text)).toStrictEqual([]));
});

describe('findForbiddenWords', () => {
  it('flags banned words, brands and guard-allow lines, ignoring case', () => {
    expect(findForbiddenWords('built for an Arduino')).toStrictEqual(['line 1: Arduino']);
    expect(findForbiddenWords('a realtime check')).toStrictEqual(['line 1: realtime']);
    expect(findForbiddenWords('the Shortest replay')).toStrictEqual(['line 1: shortest']);
    expect(findForbiddenWords('ok\nskip me guard-allow')).toStrictEqual(['line 2: guard-allow']);
  });
  it('matches whole words only', () => expect(findForbiddenWords('firstly unsafe Unofficial')).toStrictEqual([]));
});