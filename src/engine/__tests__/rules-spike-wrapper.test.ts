// Wrapper examples for checkLedTimeout (Req 14.2, 14.5, 14.6, 14.7).
// Expectations come from the requirements and the design text, not from observed behaviour.
// Task 8.3 appends a second describe (Property S1) to this file.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkLedTimeout } from '../spike/led-timeout-monitor';
import { compileRuleSet } from '../rules/compile';
import { render } from '../rules/render';
import type { Rule } from '../rules/ir';
import type { OutputEvent, PinValue } from '../types';

const MAX_SAFE_TEXT = '9007199254740991';
const SIGNAL_PREFIX = 'signal must be a signal name';
const BROKE = (violationCycle: number) => ({ verdict: 'BROKE', violationCycle });
const CLEAN = { verdict: 'no violation in this run' };

function ev(cycle: number, value: PinValue, signal = 'LED'): OutputEvent {
  return { signal, value, cycle };
}

function thrown(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected the call to throw');
}

describe('checkLedTimeout wrapper examples', () => {
  describe('compiled Rule (Req 14.2)', () => {
    it('defaults give the Rule with the 300 ms sentence, and the wrapper agrees with that compiled Rule', () => {
      const SENTENCE = 'LED is 1 must never last 300 ms or longer.';
      // 4_800_000 cycles / 16_000 cycles per ms = 300 ms
      const rule: Rule = {
        form: 'notLongerThan',
        condition: { op: 'eq', signal: 'LED', value: 1 },
        ms: 4_800_000 / 16_000,
      };
      const rendered = render(rule);
      expect(rendered.ok).toBe(true);
      if (!rendered.ok) return;
      expect(rendered.sentence).toBe(SENTENCE);

      const compiled = compileRuleSet([rule], {
        clockHz: 16_000_000,
        pins: [{ signal: 'LED', port: 'B', bit: 5, direction: 'output' }],
      });
      expect(compiled.ok).toBe(true);
      if (!compiled.ok) return;
      const out = compiled.compiled.checker({
        runIndex: 0,
        stepIndex: 0,
        endOfRun: false,
        cycle: 10_000_000,
        outputEvents: [ev(100, 1)],
        appliedInputs: [],
        diagnostics: [],
      });
      expect(out.violation?.rule).toBe(SENTENCE);
      expect(out.violation?.cycle).toBe(4_800_100);

      expect(checkLedTimeout([ev(100, 1)], 10_000_000)).toEqual(BROKE(4_800_100));
    });
  });

  describe('maxOnCycles range (Req 14.7)', () => {
    it('accepts 1', () => {
      expect(checkLedTimeout([ev(5, 1)], 6, 'LED', 1)).toEqual(BROKE(6));
      expect(checkLedTimeout([], 0, 'LED', 1)).toEqual(CLEAN);
    });

    it('accepts 159,999,999,999 and uses it as the window', () => {
      const max = 159_999_999_999;
      expect(checkLedTimeout([], 0, 'LED', max)).toEqual(CLEAN);
      expect(checkLedTimeout([ev(0, 1)], max - 1, 'LED', max)).toEqual(CLEAN);
      expect(checkLedTimeout([ev(0, 1)], max, 'LED', max)).toEqual(BROKE(max));
    });

    it.each([0, 160_000_000_000, -1, 1.5, NaN, Infinity])('rejects %s with the exact Reason', (bad) => {
      expect(thrown(() => checkLedTimeout([], 0, 'LED', bad))).toBe(
        'maxOnCycles must be an integer from 1 to 159999999999',
      );
    });
  });

  describe('signal argument (Req 14.7)', () => {
    const cases: Array<[string, string]> = [
      ['starts with a digit', '9bad_MARKER_TEXT'],
      ['contains a space', 'a b MARKER_TEXT'],
      ['is empty', ''],
      ['is 33 characters', 'S'.repeat(33)],
      ['has a punctuation mark', 'LED-MARKER_TEXT!'],
    ];
    it.each(cases)('rejects a signal that %s: prefix kept, 1 to 200 characters, argument not copied', (_name, bad) => {
      const msg = thrown(() => checkLedTimeout([], 0, bad));
      expect(msg.startsWith(SIGNAL_PREFIX)).toBe(true);
      expect(msg.length).toBeGreaterThanOrEqual(1);
      expect(msg.length).toBeLessThanOrEqual(200);
      if (bad.length > 0) expect(msg.includes(bad)).toBe(false);
      expect(msg.includes('MARKER_TEXT')).toBe(false);
    });

    it.each(['all', 'any'])('rejects the reserved word %s', (bad) => {
      const msg = thrown(() => checkLedTimeout([], 0, bad));
      expect(msg.startsWith(SIGNAL_PREFIX)).toBe(true);
      expect(msg.length).toBeLessThanOrEqual(200);
    });

    it('accepts a signal other than LED', () => {
      expect(checkLedTimeout([ev(0, 1, 'Pump_2')], 10, 'Pump_2', 10)).toEqual(BROKE(10));
    });
  });

  describe('runEndCycle (Req 14.7)', () => {
    it.each([-1, 1.5, NaN, Infinity, -Infinity])('rejects %s as not a non-negative integer', (bad) => {
      expect(thrown(() => checkLedTimeout([], bad))).toBe('runEndCycle must be a non-negative integer');
    });

    it.each([2 ** 53, 2 ** 53 + 2, 1e300])('rejects the integer %s above 9007199254740991 exactly', (bad) => {
      expect(thrown(() => checkLedTimeout([], bad))).toBe('runEndCycle must be at most ' + MAX_SAFE_TEXT);
    });

    it('accepts 0 and 9007199254740991', () => {
      expect(checkLedTimeout([], 0)).toEqual(CLEAN);
      expect(checkLedTimeout([ev(Number.MAX_SAFE_INTEGER, 1)], Number.MAX_SAFE_INTEGER)).toEqual(CLEAN);
    });
  });

  describe('argument check order (design)', () => {
    it('reports signal before maxOnCycles, maxOnCycles before runEndCycle', () => {
      expect(thrown(() => checkLedTimeout([], -1, '9x', 0)).startsWith(SIGNAL_PREFIX)).toBe(true);
      expect(thrown(() => checkLedTimeout([], -1, 'LED', 0))).toBe(
        'maxOnCycles must be an integer from 1 to 159999999999',
      );
    });

    it('reports a runEndCycle fault before an events fault', () => {
      expect(thrown(() => checkLedTimeout([ev(1.5, 1)], -1))).toBe('runEndCycle must be a non-negative integer');
      expect(thrown(() => checkLedTimeout([ev(1.5, 1)], 2 ** 53))).toBe('runEndCycle must be at most ' + MAX_SAFE_TEXT);
    });
  });

  describe('events elements (Req 14.7)', () => {
    it('names the original index of a non-integer cycle, counting elements of other signals', () => {
      const events = [ev(0, 1, 'OTHER'), ev(3, 0, 'OTHER'), ev(1.5, 1)];
      expect(thrown(() => checkLedTimeout(events, 100))).toBe('events[2].cycle must be an integer');
      expect(thrown(() => checkLedTimeout([ev(NaN, 1)], 100))).toBe('events[0].cycle must be an integer');
      expect(thrown(() => checkLedTimeout([ev(0, 1), ev(Infinity, 0)], 100))).toBe('events[1].cycle must be an integer');
    });

    it('names a cycle above runEndCycle', () => {
      expect(thrown(() => checkLedTimeout([ev(0, 1), ev(101, 0)], 100))).toBe(
        'events[1].cycle is above runEndCycle',
      );
    });

    it('names a cycle below the previous element of the signal', () => {
      const events = [ev(10, 1), ev(2, 0, 'OTHER'), ev(5, 0)];
      expect(thrown(() => checkLedTimeout(events, 100))).toBe(
        'events[2].cycle is below the cycle of the previous element for the signal',
      );
    });

    it('names an integer cycle above 9007199254740991 exactly, replacing the above-runEndCycle Reason', () => {
      expect(thrown(() => checkLedTimeout([ev(2 ** 53, 1)], 100))).toBe(
        'events[0].cycle must be at most ' + MAX_SAFE_TEXT,
      );
      const events = [ev(0, 1, 'OTHER'), ev(1, 1), ev(2 ** 53 + 2, 0)];
      expect(thrown(() => checkLedTimeout(events, 100))).toBe('events[2].cycle must be at most ' + MAX_SAFE_TEXT);
      expect(thrown(() => checkLedTimeout([ev(2 ** 53, 1)], Number.MAX_SAFE_INTEGER))).toBe(
        'events[0].cycle must be at most ' + MAX_SAFE_TEXT,
      );
    });

    it('does not check elements of other signals and does not pass them on', () => {
      const others = [
        ev(NaN, 1, 'OTHER'),
        ev(2 ** 60, 1, 'OTHER'),
        ev(-5, 1, 'OTHER'),
        ev(1_000, 0, 'OTHER'),
        ev(3, 1, 'OTHER'),
        ev(1.5, 'input', 'OTHER'),
      ];
      const mine = [ev(10, 1), ev(500, 0)];
      const mixed = [others[0], mine[0], others[1], others[2], others[3], others[4], mine[1], others[5]];
      expect(checkLedTimeout(mixed, 600, 'LED', 100)).toEqual(checkLedTimeout(mine, 600, 'LED', 100) as object);
      expect(checkLedTimeout(mixed, 600, 'LED', 100)).toEqual(BROKE(110));
      expect(checkLedTimeout(others, 600, 'LED', 100)).toEqual(CLEAN);
    });

    it('does not let an element of another signal turn the LED off', () => {
      expect(checkLedTimeout([ev(0, 1), ev(50, 0, 'OTHER')], 100, 'LED', 100)).toEqual(BROKE(100));
    });
  });

  describe('no rule checker text in any thrown message', () => {
    it('never shows the text in the rejection cases', () => {
      const calls: Array<() => unknown> = [
        () => checkLedTimeout([], 0, '9x'),
        () => checkLedTimeout([], 0, 'LED', 0),
        () => checkLedTimeout([], 0, 'LED', 160_000_000_000),
        () => checkLedTimeout([], -1),
        () => checkLedTimeout([], 2 ** 53),
        () => checkLedTimeout([], 2 ** 60),
        () => checkLedTimeout([ev(1.5, 1)], 100),
        () => checkLedTimeout([ev(2 ** 53, 1)], 100),
        () => checkLedTimeout([ev(2 ** 53, 1)], Number.MAX_SAFE_INTEGER),
        () => checkLedTimeout([ev(2 ** 60, 1)], 2 ** 60),
        () => checkLedTimeout([ev(101, 1)], 100),
        () => checkLedTimeout([ev(5, 1), ev(4, 0)], 100),
      ];
      for (const call of calls) {
        const msg = thrown(call);
        expect(msg.includes('rule checker:')).toBe(false);
        expect(msg.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('spike semantics (Req 14.6)', () => {
    const MAX = 100;

    it('an LED turned off at onCycle + max is reported at onCycle + max', () => {
      expect(checkLedTimeout([ev(10, 1), ev(10 + MAX, 0)], 10 + MAX + 50, 'LED', MAX)).toEqual(BROKE(10 + MAX));
    });

    it('an LED turned off at onCycle + max - 1 is not reported', () => {
      expect(checkLedTimeout([ev(10, 1), ev(10 + MAX - 1, 0)], 10 + MAX + 50, 'LED', MAX)).toEqual(CLEAN);
    });

    it('the value "input" ends an on-span like 0', () => {
      expect(checkLedTimeout([ev(10, 1), ev(10 + MAX - 1, 'input')], 500, 'LED', MAX)).toEqual(CLEAN);
      expect(checkLedTimeout([ev(10, 1), ev(10 + MAX, 'input')], 500, 'LED', MAX)).toEqual(BROKE(10 + MAX));
    });

    it('a first element with value 1 starts a span (previous value is "input")', () => {
      expect(checkLedTimeout([ev(0, 1)], 200, 'LED', MAX)).toEqual(BROKE(MAX));
    });

    it('a repeated 1 does not start a new span; the lowest onCycle is reported', () => {
      expect(checkLedTimeout([ev(0, 1), ev(10, 1)], 500, 'LED', MAX)).toEqual(BROKE(MAX));
    });

    it('the lowest onCycle among several qualifying spans is reported', () => {
      const events = [ev(0, 1), ev(MAX + 5, 0), ev(300, 1), ev(300 + MAX + 5, 0)];
      expect(checkLedTimeout(events, 1_000, 'LED', MAX)).toEqual(BROKE(MAX));
    });

    it('a short span before a long one does not hide the long one', () => {
      const events = [ev(0, 1), ev(10, 0), ev(50, 1)];
      expect(checkLedTimeout(events, 1_000, 'LED', MAX)).toEqual(BROKE(50 + MAX));
    });

    it('an element at runEndCycle counts: off at runEndCycle with onCycle + max = runEndCycle', () => {
      expect(checkLedTimeout([ev(0, 1), ev(MAX, 0)], MAX, 'LED', MAX)).toEqual(BROKE(MAX));
    });

    it('an element at runEndCycle counts: turning on at runEndCycle starts no reportable span', () => {
      expect(checkLedTimeout([ev(MAX, 1)], MAX, 'LED', MAX)).toEqual(CLEAN);
    });

    it('a span with onCycle + max equal to runEndCycle is reported (end-of-run call)', () => {
      expect(checkLedTimeout([ev(40, 1)], 40 + MAX, 'LED', MAX)).toEqual(BROKE(40 + MAX));
    });

    it('a span with onCycle + max one above runEndCycle is not reported', () => {
      expect(checkLedTimeout([ev(40, 1)], 40 + MAX - 1, 'LED', MAX)).toEqual(CLEAN);
    });

    it('an empty event list is clean', () => {
      expect(checkLedTimeout([], 1_000, 'LED', MAX)).toEqual(CLEAN);
    });
  });
});

// Feature: rule-compiler, Property S1: Spike wrapper equals the spike algorithm
// The reference below is written from the Req 14.6 text only.
type SpanValue = 0 | 1 | 'input';
interface RefEvent {
  cycle: number;
  value: SpanValue;
}
interface RefOutcome {
  result: { verdict: string; violationCycle?: number };
  spans: Array<{ onCycle: number; endCycle: number | null; endsAtLimit: boolean; endsBeforeLimit: boolean }>;
}

function referenceSpike(events: RefEvent[], runEndCycle: number, maxOnCycles: number): RefOutcome {
  const spans: RefOutcome['spans'] = [];
  let previous: SpanValue = 'input';
  let open: { onCycle: number } | null = null;
  const close = (endCycle: number | null) => {
    if (open === null) return;
    const limit = open.onCycle + maxOnCycles;
    spans.push({
      onCycle: open.onCycle,
      endCycle,
      endsAtLimit: endCycle !== null && endCycle === limit,
      endsBeforeLimit: endCycle !== null && endCycle <= limit - 1,
    });
    open = null;
  };
  for (const e of events) {
    if (e.value === 1) {
      if (previous !== 1) open = { onCycle: e.cycle };
    } else {
      close(e.cycle);
    }
    previous = e.value;
  }
  close(null);

  let best: number | null = null;
  for (const s of spans) {
    const stillOn = s.endCycle === null || s.endCycle > s.onCycle + maxOnCycles - 1;
    if (stillOn && s.onCycle + maxOnCycles <= runEndCycle && (best === null || s.onCycle < best)) {
      best = s.onCycle;
    }
  }
  const result =
    best === null
      ? { verdict: 'no violation in this run' }
      : { verdict: 'BROKE', violationCycle: best + maxOnCycles };
  return { result, spans };
}

interface SpikeCase {
  runEndCycle: number;
  maxOnCycles: number;
  events: RefEvent[];
}

const arbStep = fc.record({
  value: fc.constantFrom<SpanValue>(0, 1, 'input', 1, 0),
  mode: fc.constantFrom('small', 'small', 'toLimit', 'toLimitMinus1', 'anywhere'),
  small: fc.integer({ min: 1, max: 60 }),
  anywhere: fc.integer({ min: 0, max: 1_000_000 }),
});

const arbSpikeCase: fc.Arbitrary<SpikeCase> = fc
  .record({
    runEndCycle: fc.oneof(fc.integer({ min: 0, max: 50_000 }), fc.constant(0), fc.integer({ min: 40_000, max: 50_000 })),
    maxOnCycles: fc.oneof(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 300 })),
    firstCycle: fc.integer({ min: 0, max: 100 }),
    steps: fc.array(arbStep, { minLength: 0, maxLength: 12 }),
  })
  .map(({ runEndCycle, maxOnCycles, firstCycle, steps }) => {
    const events: RefEvent[] = [];
    let spanStart = -1;
    let prevValue: SpanValue = 'input';
    let prevCycle = -1;
    for (const st of steps) {
      let cycle: number;
      if (events.length === 0) {
        cycle = Math.min(firstCycle, runEndCycle);
      } else {
        let target = prevCycle + st.small;
        if (st.mode === 'toLimit' && spanStart >= 0) target = spanStart + maxOnCycles;
        else if (st.mode === 'toLimitMinus1' && spanStart >= 0) target = spanStart + maxOnCycles - 1;
        else if (st.mode === 'anywhere') target = prevCycle + 1 + (st.anywhere % (runEndCycle + 1));
        cycle = target > prevCycle ? target : prevCycle + st.small;
      }
      if (cycle > runEndCycle || cycle <= prevCycle) break;
      events.push({ cycle, value: st.value });
      if (st.value === 1 && prevValue !== 1) spanStart = cycle;
      prevValue = st.value;
      prevCycle = cycle;
    }
    return { runEndCycle, maxOnCycles, events };
  });

describe('Property S1: spike wrapper equals the spike algorithm', () => {
  it('checkLedTimeout returns the same result as the Req 14.6 reference', () => {
    const seed = 672426038;
    const numRuns = 200;
    let broke = 0;
    let clean = 0;
    let offAtLimit = 0;
    let offBeforeLimit = 0;
    fc.assert(
      fc.property(arbSpikeCase, (c) => {
        const ref = referenceSpike(c.events, c.runEndCycle, c.maxOnCycles);
        const actual = checkLedTimeout(
          c.events.map((e) => ev(e.cycle, e.value)),
          c.runEndCycle,
          'LED',
          c.maxOnCycles,
        );
        if (ref.result.verdict === 'BROKE') broke++;
        else clean++;
        if (ref.spans.some((s) => s.endsAtLimit)) offAtLimit++;
        if (ref.spans.some((s) => s.endsBeforeLimit)) offBeforeLimit++;
        expect(actual).toEqual(ref.result);
      }),
      { seed, numRuns },
    );
    console.log(
      `Property S1: seed=${seed} numRuns=${numRuns} broke=${broke} clean=${clean} offAtLimit=${offAtLimit} offBeforeLimit=${offBeforeLimit}`,
    );
    const counts = `broke=${broke} clean=${clean} offAtLimit=${offAtLimit} offBeforeLimit=${offBeforeLimit}`;
    expect(broke, `no reported span was seen; ${counts}`).toBeGreaterThan(0);
    expect(clean, `no clean run was seen; ${counts}`).toBeGreaterThan(0);
    expect(offAtLimit, `no span turned off at onCycle + maxOnCycles was seen; ${counts}`).toBeGreaterThan(0);
    expect(offBeforeLimit, `no span turned off before the limit was seen; ${counts}`).toBeGreaterThan(0);
  });
});
