// Generators for Property 5 (step-size invariance on the bridge). Helper file, not a test file.
// Fixtures are fixture data copied from the design. No emulator code and no file reads here.
import fc from 'fast-check';
import { GREMLIN_CATALOGUE } from '../gremlins/catalogue.js';
import type { GremlinSpec } from '../gremlins/catalogue.js';
import type { Condition, Edge, Rule } from '../rules/ir.js';
import { render } from '../rules/render.js';
import type { Fixture } from '../types.js';

export type HexName = 'blink_button' | 'floating_input' | 'analog_read';
export const HEX_NAMES: readonly HexName[] = ['blink_button', 'floating_input', 'analog_read'];

export const CAMPAIGN_FIXTURES: Record<HexName, Fixture> = {
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
  analog_read: {
    pins: [
      { signal: 'POT', kind: 'analog', channel: 0 },
      { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
    ],
  },
};

/** Catalogue ids with a target on the Fixture (a digital input, or an analog pin). No pin has restState active. */
export function gremlinIdsFor(fixture: Fixture): string[] {
  const hasDigitalInput = fixture.pins.some(
    (p) => p.kind !== 'analog' && 'direction' in p && p.direction === 'input',
  );
  const hasAnalog = fixture.pins.some((p) => p.kind === 'analog');
  return GREMLIN_CATALOGUE.filter((g) =>
    g.targets.some(
      (t) =>
        (t.kind === 'digital' && t.restState === undefined && hasDigitalInput) ||
        (t.kind === 'analog' && hasAnalog),
    ),
  ).map((g) => g.id);
}

const CYCLES_PER_MS = 16_000;

/** Duration_Ms for a whole number of cycles at 16 MHz (at most 7 fraction digits). */
export function msOfCycles(cycles: number): number {
  return Number((cycles / CYCLES_PER_MS).toFixed(7));
}

const eq = (signal: string, value: 0 | 1): Condition => ({ op: 'eq', signal, value });
const fall = (of: Condition): Edge => ({ op: 'fall', of });
const rise = (of: Condition): Edge => ({ op: 'rise', of });

const arbWindowMs: fc.Arbitrary<number> = fc.constantFrom(0.1, 1, 5, 20, 50, 300);

/** Further template Rules per HEX: respond, count, hold, never. */
function furtherRules(hex: HexName): fc.Arbitrary<Rule>[] {
  if (hex === 'blink_button') {
    return [
      fc.record({ w: arbWindowMs, v: fc.constantFrom<0 | 1>(0, 1) }).map(({ w, v }): Rule => ({
        form: 'respond', trigger: fall(eq('BUTTON', 1)), withinMs: w, expect: eq('LED', v),
      })),
      fc.record({ w: arbWindowMs, max: fc.integer({ min: 0, max: 3 }) }).map(({ w, max }): Rule => ({
        form: 'count', edge: fall(eq('BUTTON', 1)), windowMs: w, max,
      })),
      fc.record({ d: arbWindowMs, v: fc.constantFrom<0 | 1>(0, 1) }).map(({ d, v }): Rule => ({
        form: 'hold', after: rise(eq('BUTTON', 1)), durationMs: d, expect: eq('LED', v),
      })),
    ];
  }
  if (hex === 'floating_input') {
    return [
      fc.record({ w: arbWindowMs, v: fc.constantFrom<0 | 1>(0, 1) }).map(({ w, v }): Rule => ({
        form: 'respond', trigger: fall(eq('D4_IN', 1)), withinMs: w, expect: eq('LED', v),
      })),
      fc.record({ w: arbWindowMs, max: fc.integer({ min: 0, max: 3 }) }).map(({ w, max }): Rule => ({
        form: 'count', edge: rise(eq('D3_IN', 1)), windowMs: w, max,
      })),
      fc.record({ d: arbWindowMs, v: fc.constantFrom<0 | 1>(0, 1) }).map(({ d, v }): Rule => ({
        form: 'hold', after: rise(eq('D4_IN', 1)), durationMs: d, expect: eq('LED', v),
      })),
    ];
  }
  return [
    fc.record({ w: arbWindowMs, t: fc.integer({ min: 100, max: 900 }) }).map(({ w, t }): Rule => ({
      form: 'respond',
      trigger: rise({ op: 'above', signal: 'POT', value: t }),
      withinMs: w,
      expect: eq('LED', 1),
    })),
    fc.integer({ min: 0, max: 1022 }).map((t): Rule => ({
      form: 'never', condition: { op: 'above', signal: 'POT', value: t },
    })),
    fc.integer({ min: 1, max: 1023 }).map((t): Rule => ({
      form: 'never', condition: { op: 'below', signal: 'POT', value: t },
    })),
  ];
}

export interface CampaignCase {
  hex: HexName;
  runs: number;
  runCycles: number;
  campaignSeed: number;
  gremlinSet: GremlinSpec[];
  aim: 'aimBroke' | 'aimClean';
  ruleSet: Rule[];
}

/** One Property 5 case. Rule_Set is the aim Rule plus 0 to 2 further Rules with distinct sentences. */
export const arbCampaignCase: fc.Arbitrary<CampaignCase> = fc
  .record({
    hex: fc.constantFrom(...HEX_NAMES),
    runs: fc.integer({ min: 1, max: 3 }),
    runCycles: fc.integer({ min: 30_000, max: 400_000 }),
    campaignSeed: fc.integer({ min: 0, max: 0xffffffff }),
    aim: fc.constantFrom<'aimBroke' | 'aimClean'>('aimBroke', 'aimClean'),
  })
  .chain((base) => {
    const ids = gremlinIdsFor(CAMPAIGN_FIXTURES[base.hex]);
    const arbW =
      base.aim === 'aimBroke'
        ? fc.integer({ min: 1_600, max: base.runCycles - 10_000 })
        : fc.integer({ min: base.runCycles + 64, max: base.runCycles + 64 + 100_000 });
    return fc
      .record({
        gremlinSet: fc.array(
          fc.constantFrom(...ids).map((id): GremlinSpec => ({ id })),
          { minLength: 0, maxLength: 3 },
        ),
        w: arbW,
        extra: fc.array(fc.oneof(...furtherRules(base.hex)), { minLength: 0, maxLength: 2 }),
      })
      .map(({ gremlinSet, w, extra }): CampaignCase => {
        const aimRule: Rule = {
          form: 'notLongerThan',
          condition: eq('LED', 0),
          ms: msOfCycles(w),
        };
        const seen = new Set<string>();
        const ruleSet: Rule[] = [];
        for (const r of [aimRule, ...extra]) {
          const s = render(r);
          if (!s.ok || seen.has(s.sentence)) continue;
          seen.add(s.sentence);
          ruleSet.push(r);
        }
        return { ...base, gremlinSet, ruleSet };
      });
  });
