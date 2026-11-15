/**
 * bench/evidence.ts
 *
 * Evidence bench (honest-verdicts, Part 3). Run with: npm run bench:evidence (tsx, sequential).
 * - Seed sweep: each buggy example at campaignSeed 1..100, each fixed example at 1..20.
 * - Single-press sweep: the example-firmware Single_Input moved to every 10 ms start that fits.
 * Writes docs/evidence/EVIDENCE-NUMBERS.md. The wall clock is read here and nowhere else in this
 * spec's files, only for the date and the times in the doc; no clock value reaches the engine.
 * Exit codes: 0 doc written; 1 a Campaign or Run error; 3 a fixed build gave BROKE (no doc);
 * 4 the doc text holds a forbidden word (no doc).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import type { ScheduledInput } from '../src/engine/types.js';
import {
  buildScriptedEvents,
  loadExample,
  runExampleCampaign,
  scriptedRun,
} from '../tests/examples/examples-support.js';
import type { ExampleId, LoadedExample, Variant } from '../tests/examples/examples-support.js';
import { findForbiddenWords, renderEvidenceDoc, sweepStarts } from './evidence-stats.js';
import type { EvidenceResults, PressSweepRow, SeedSweepRow } from './evidence-stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DOC_PATH = resolve(ROOT, 'docs/evidence/EVIDENCE-NUMBERS.md');

const EXAMPLES: ExampleId[] = ['crosswalk', 'garage', 'heartbeat'];
const SEEDS: Record<Variant, [number, number]> = { buggy: [1, 100], fixed: [1, 20] };

/** Single_Input of the example-firmware spec (tasks 4.5, 6.5, 8.5): signal and hold in cycles. */
const SINGLE_INPUT: Record<string, { signal: string; holdCycles: number }> = {
  crosswalk: { signal: 'REQUEST', holdCycles: 5_600_000 - 4_800_000 },
  garage: { signal: 'BEAM_CLEAR', holdCycles: 6_432_000 - 6_400_000 },
  heartbeat: { signal: 'PULSE', holdCycles: 5_600_000 - 4_000_000 },
};

function fail(where: string, e: unknown): never {
  console.error(`ERROR ${where}: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}

const t0 = performance.now();
const loaded = new Map<string, LoadedExample>();
for (const id of EXAMPLES) {
  try {
    loaded.set(id, loadExample(id));
  } catch (e) {
    fail(`loading example ${id}`, e);
  }
}

// ---------------------------------------------------------------------------
// Seed sweep

const seedRows: SeedSweepRow[] = [];
const fixedBroke: { example: string; seed: number; trace: unknown }[] = [];
const tSeed0 = performance.now();
for (const id of EXAMPLES) {
  const ex = loaded.get(id)!;
  for (const build of ['buggy', 'fixed'] as const) {
    const [lo, hi] = SEEDS[build];
    const row: SeedSweepRow = {
      example: id,
      build,
      seeds: [lo, hi],
      runsPerCampaign: ex.meta.runs,
      broke: 0,
      held: 0,
      couldntTell: 0,
      violatingRunNumbers: [],
      heldTexts: [],
    };
    for (let seed = lo; seed <= hi; seed++) {
      let outcome;
      try {
        outcome = runExampleCampaign({ ...ex, meta: { ...ex.meta, campaignSeed: seed } }, build);
      } catch (e) {
        fail(`seed sweep, example ${id}, ${build} build, campaignSeed ${seed}`, e);
      }
      const v = outcome.result.verdict;
      if (v.verdict === 'BROKE') {
        row.broke++;
        if (build === 'buggy') {
          const idx = outcome.result.violatingRunIndex;
          if (idx === null) fail(`seed sweep, example ${id}, buggy build, campaignSeed ${seed}`, 'BROKE without a violating Run_Index');
          row.violatingRunNumbers.push(idx + 1);
        } else {
          fixedBroke.push({ example: id, seed, trace: v.trace });
          console.error(`FIXED BUILD BROKE: example ${id}, campaignSeed ${seed}`);
          console.error(JSON.stringify(v.trace));
        }
      } else if (v.verdict === 'HELD') {
        row.held++;
        if (!row.heldTexts.includes(v.text)) row.heldTexts.push(v.text);
      } else {
        row.couldntTell++;
      }
    }
    seedRows.push(row);
    console.log(
      `seed sweep ${id} ${build}: BROKE ${row.broke}, HELD ${row.held}, COULDN'T TELL ${row.couldntTell} (${((performance.now() - tSeed0) / 1000).toFixed(1)} s so far)`,
    );
  }
}
const tSeed1 = performance.now();

// ---------------------------------------------------------------------------
// Single-press sweep

const pressRows: PressSweepRow[] = [];
for (const id of EXAMPLES) {
  const ex = loaded.get(id)!;
  const { signal, holdCycles } = SINGLE_INPUT[id];
  const pin = ex.fixture.pins.find((p) => p.signal === signal);
  if (pin === undefined || pin.kind === 'analog') fail(`single-press sweep, example ${id}`, `no digital pin ${signal}`);
  const pressValue = pin.activeLevel === 'high' ? 1 : 0;
  const starts = sweepStarts(ex.meta.runCycles, holdCycles);
  for (const build of ['buggy', 'fixed'] as const) {
    const row: PressSweepRow = {
      example: id,
      build,
      signal,
      holdCycles,
      runCycles: ex.meta.runCycles,
      starts: starts.length,
      lastStart: starts.length > 0 ? starts[starts.length - 1] : null,
      violations: [],
      cannotCheckRuns: 0,
    };
    for (const s of starts) {
      const script: ScheduledInput[] = [
        { signal, value: pressValue, cycle: s },
        { signal, value: 'release', cycle: s + holdCycles },
      ];
      let out;
      try {
        const events = buildScriptedEvents(ex.fixture, script, ex.meta.runCycles);
        out = scriptedRun(ex, build, events, ex.meta.runCycles, { untilEnd: true });
      } catch (e) {
        fail(`single-press sweep, example ${id}, ${build} build, start ${s}`, e);
      }
      if (out.violations.length > 0) row.violations.push({ start: s, rule: out.violations[0].rule, cycle: out.violations[0].cycle });
      if (out.cannotCheck.length > 0) row.cannotCheckRuns++;
    }
    pressRows.push(row);
    console.log(`single-press sweep ${id} ${build}: ${row.starts} starts, ${row.violations.length} with a violation, ${row.cannotCheckRuns} with a CannotCheck`);
  }
}
const tPress1 = performance.now();

// ---------------------------------------------------------------------------
// Evidence_Doc

if (fixedBroke.length > 0) {
  console.error(`STOP: ${fixedBroke.length} fixed-build Campaign(s) gave BROKE. The doc is not written.`);
  for (const f of fixedBroke) console.error(`  example ${f.example}, campaignSeed ${f.seed}`);
  process.exit(3);
}

const avr8js = (JSON.parse(readFileSync(resolve(ROOT, 'node_modules/avr8js/package.json'), 'utf-8')) as { version: string }).version;
const cpus = os.cpus();
const results: EvidenceResults = {
  machine: {
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: cpus.length > 0 ? cpus[0].model.trim() : 'unknown',
    cores: cpus.length,
    node: process.version,
    avr8js,
  },
  date: new Date().toISOString().slice(0, 10),
  seconds: {
    seedSweep: (tSeed1 - tSeed0) / 1000,
    pressSweep: (tPress1 - tSeed1) / 1000,
    total: (performance.now() - t0) / 1000,
  },
  seedRows,
  pressRows,
};
const text = renderEvidenceDoc(results);
const forbidden = findForbiddenWords(text);
if (forbidden.length > 0) {
  console.error('The doc text holds forbidden words. The doc is not written.');
  for (const f of forbidden) console.error(`  ${f}`);
  process.exit(4);
}
mkdirSync(dirname(DOC_PATH), { recursive: true });
writeFileSync(DOC_PATH, text, 'utf-8');
console.log(`wrote ${DOC_PATH}`);