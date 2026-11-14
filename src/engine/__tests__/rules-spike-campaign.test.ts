/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createCampaign } from '../campaign.js';
import { parse } from '../rules/parse.js';
import { writeIr, readIr } from '../rules/ir.js';
import { compileRuleSet } from '../rules/compile.js';
import { checkLedTimeout } from '../spike/led-timeout-monitor.js';
import type { Fixture } from '../types.js';

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

const SENTENCE = 'LED is 1 must never last 300 ms or longer.';
const MAX_ON_CYCLES = 4_800_000; // 300 ms at 16 MHz
const CAMPAIGN_SEED = 20261030; // recorded literal (D12)

describe('Rule_Compiler spike IR campaign (Req 14.4)', () => {
  it('IR round trip, compile, campaign: violation matches the spike monitor', { timeout: 120_000 }, () => {
    const parsed = parse(SENTENCE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const written = writeIr([parsed.rule]);
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const read = readIr(written.text);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.ruleSet).toEqual([parsed.rule]);
    const ruleSet = read.ruleSet;

    const compiledResult = compileRuleSet(ruleSet, FIXTURE);
    expect(compiledResult.ok).toBe(true);
    if (!compiledResult.ok) return;
    const { checker, checkerSignals } = compiledResult.compiled;

    const handle = createCampaign({
      hex: HEX,
      fixture: FIXTURE,
      gremlinSet: [],
      campaignSeed: CAMPAIGN_SEED,
      checker,
      checkerSignals,
      runs: 1,
      runCycles: 20_000_000,
    });
    expect('runSlice' in handle).toBe(true);
    if (!('runSlice' in handle)) return;

    const progress = handle.runSlice(1);
    expect('kind' in progress).toBe(false);
    if ('kind' in progress) return;
    expect(progress.finished).toBe(true);
    const result = progress.result;
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.violatingRunIndex).not.toBeNull();

    const run = progress.runs.find((r) => r.runIndex === result.violatingRunIndex);
    expect(run).toBeDefined();
    if (run === undefined) return;

    expect(result.verdict.verdict).toBe('BROKE');
    expect(run.violation).not.toBeNull();
    if (run.violation === null) return;
    expect(run.violation.rule).toBe(SENTENCE);

    const limit = run.violation.cycle - MAX_ON_CYCLES;
    let onCycle = -1;
    let prev: 0 | 1 | 'input' | null = null;
    for (const ev of run.outputEvents) {
      if (ev.signal !== 'LED') continue;
      if (ev.cycle <= limit && ev.value === 1 && prev !== 1) onCycle = ev.cycle;
      prev = ev.value as 0 | 1 | 'input';
    }

    const spike = checkLedTimeout(run.outputEvents, run.endCycle);
    const spikeCycle = spike.verdict === 'BROKE' ? spike.violationCycle : null;

    console.log(
      `rules-spike-campaign: onCycle=${onCycle} violation.cycle=${run.violation.cycle} ` +
        `checkLedTimeout.violationCycle=${spikeCycle} endCycle=${run.endCycle}`,
    );

    expect(onCycle).toBeGreaterThanOrEqual(0);
    expect(run.violation.cycle).toBe(onCycle + MAX_ON_CYCLES);
    expect(spike.verdict).toBe('BROKE');
    expect(run.violation.cycle).toBe(spikeCycle);
  });
});
