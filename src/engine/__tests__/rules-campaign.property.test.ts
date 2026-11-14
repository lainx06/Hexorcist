/// <reference types="node" />
// Feature: rule-compiler, Property 5: Step-size invariance on the bridge
// Real bridge through the Campaign runner. Evidence, not proof.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign } from '../campaign.js';
import type { CampaignConfig } from '../campaign.js';
import { compileRuleSet } from '../rules/compile.js';
import type { CampaignResult } from '../types.js';
import { arbCampaignCase, CAMPAIGN_FIXTURES } from './rules-arbitraries-campaign.js';
import type { HexName } from './rules-arbitraries-campaign.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readHex = (name: HexName): string =>
  readFileSync(resolve(__dirname, `../../../fixtures/${name}/build/${name}.ino.hex`), 'utf-8');

// No fallback: a missing file throws here.
const HEX: Record<HexName, string> = {
  blink_button: readHex('blink_button'),
  floating_input: readHex('floating_input'),
  analog_read: readHex('analog_read'),
};

/** Fixed fast-check seed for Property 5, recorded once. */
const PROPERTY_SEED = 20261118;
const NUM_RUNS = 20;

describe('Rule_Compiler step-size invariance', () => {
  // Feature: rule-compiler, Property 5: Step-size invariance on the bridge
  it(
    'Property 5: maxStepCycles 160,000 and 16,000 give the same verdict, violation rule and cycle, and held text',
    () => {
      let broke = 0;
      let notBroke = 0;
      let blinkButton = 0;
      let floatingInput = 0;
      let analogRead = 0;

      const run = (
        c: { hex: HexName; runs: number; runCycles: number; campaignSeed: number; gremlinSet: CampaignConfig['gremlinSet'] },
        compiled: Extract<ReturnType<typeof compileRuleSet>, { ok: true }>['compiled'],
        maxStepCycles: number,
      ): CampaignResult => {
        const handle = createCampaign({
          hex: HEX[c.hex],
          fixture: CAMPAIGN_FIXTURES[c.hex],
          gremlinSet: c.gremlinSet,
          campaignSeed: c.campaignSeed,
          checker: compiled.checker,
          checkerSignals: compiled.checkerSignals,
          findUntriggeredRules: compiled.findUntriggeredRules,
          runs: c.runs,
          runCycles: c.runCycles,
          maxStepCycles,
        });
        if (!('runSlice' in handle)) throw new Error(`campaign not created: ${JSON.stringify(handle)}`);
        for (;;) {
          const p = handle.runSlice(c.runs);
          if ('kind' in p) throw new Error(`slice failed: ${JSON.stringify(p)}`);
          if (p.finished) {
            if (p.result === null) throw new Error('finished without a result');
            return p.result;
          }
        }
      };

      fc.assert(
        fc.property(arbCampaignCase, (c) => {
          const compiledResult = compileRuleSet(c.ruleSet, CAMPAIGN_FIXTURES[c.hex]);
          if (!compiledResult.ok) {
            throw new Error(`compileRuleSet rejected: ${JSON.stringify(compiledResult.reasons)}`);
          }
          // Each run gets its own compiled Rule_Set so no checker state is shared.
          const big = run(c, compiledResult.compiled, 160_000).verdict;
          const second = compileRuleSet(c.ruleSet, CAMPAIGN_FIXTURES[c.hex]);
          if (!second.ok) throw new Error('second compile rejected');
          const small = run(c, second.compiled, 16_000).verdict;

          if (big.verdict === 'BROKE') broke++;
          else notBroke++;
          if (c.hex === 'blink_button') blinkButton++;
          else if (c.hex === 'floating_input') floatingInput++;
          else analogRead++;

          const detail = `160000: ${JSON.stringify(big)}\n16000: ${JSON.stringify(small)}`;
          expect(small.verdict, detail).toBe(big.verdict);
          if (big.verdict === 'BROKE' && small.verdict === 'BROKE') {
            expect(small.trace.violation.rule, detail).toBe(big.trace.violation.rule);
            expect(small.trace.violation.cycle, detail).toBe(big.trace.violation.cycle);
          }
          if (big.verdict === 'HELD' && small.verdict === 'HELD') {
            expect(small.text, detail).toBe(big.text);
          }
        }),
        { seed: PROPERTY_SEED, numRuns: NUM_RUNS },
      );

      const counts = `broke=${broke}, notBroke=${notBroke}, blinkButton=${blinkButton}, floatingInput=${floatingInput}, analogRead=${analogRead}`;
      console.log(`rules-campaign.property: seed=${PROPERTY_SEED} numRuns=${NUM_RUNS} ${counts}`);
      expect(broke, `outcome "broke" was never seen: ${counts}`).toBeGreaterThan(0);
      expect(notBroke, `outcome "notBroke" was never seen: ${counts}`).toBeGreaterThan(0);
      expect(blinkButton, `HEX blink_button was never run: ${counts}`).toBeGreaterThan(0);
      expect(floatingInput, `HEX floating_input was never run: ${counts}`).toBeGreaterThan(0);
      expect(analogRead, `HEX analog_read was never run: ${counts}`).toBeGreaterThan(0);
    },
    120_000,
  );
});
