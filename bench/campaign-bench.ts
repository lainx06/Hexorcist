/**
 * bench/campaign-bench.ts
 *
 * Compares raw emulator speed with campaign speed on blink_button.
 * Run with: npm run bench:campaign (tsx, sequential, not under vitest).
 * Wall clock is allowed here and nowhere else.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { EmulatorBridge, isBridgeError } from '../src/engine/emulator-bridge.js';
import { createCampaign } from '../src/engine/campaign.js';
import type { CampaignConfig } from '../src/engine/campaign.js';
import type { Checker } from '../src/engine/checker.js';
import { isEngineError } from '../src/engine/errors.js';
import type { GremlinSpec } from '../src/engine/gremlins/catalogue.js';
import type { Fixture } from '../src/engine/types.js';
import { spliceSection } from './spike-md.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPIKE_MD_PATH = resolve(__dirname, '../SPIKE.md');
const HEX_PATH = resolve(__dirname, '../fixtures/blink_button/build/blink_button.ino.hex');
const hex = readFileSync(HEX_PATH, 'utf-8');

const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const RAW_CYCLES = 160_000_000;
const RUNS = 64;
const RUN_CYCLES = 8_000_000;
const GREMLINS: GremlinSpec[] = ['masher', 'bouncer', 'stuck', 'dropout', 'spike', 'drifter'].map(
  (id) => ({ id }) as GremlinSpec,
);

interface Stat { min: number; avg: number; max: number }
function stat(xs: number[]): Stat {
  return { min: Math.min(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) };
}
const fmt = (n: number, d = 0): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtStat = (s: Stat): string => `${fmt(s.min)} / ${fmt(s.avg, 1)} / ${fmt(s.max)}`;

interface Measure {
  wall: number;
  cycles: number;
  cyclesPerSec: number;
  steps?: Stat;
  events?: Stat;
  runs?: number;
}

function raw(): Measure {
  const bridge = EmulatorBridge.create(hex, FIXTURE, []);
  if (isBridgeError(bridge)) throw new Error(`bridge: ${bridge.message}`);
  const t0 = performance.now();
  const r = bridge.advance(RAW_CYCLES);
  const wall = (performance.now() - t0) / 1000;
  if (isBridgeError(r)) throw new Error(`advance: ${r.message}`);
  const cycles = bridge.cycleCount;
  return { wall, cycles, cyclesPerSec: cycles / wall };
}

function campaign(maxStepCycles?: number): Measure {
  const stepsByRun = new Map<number, number>();
  const neverViolates: Checker = (obs) => {
    if (!obs.endOfRun) stepsByRun.set(obs.runIndex, (stepsByRun.get(obs.runIndex) ?? 0) + 1);
    return { violation: null };
  };
  const config: CampaignConfig = {
    hex,
    fixture: FIXTURE,
    gremlinSet: GREMLINS,
    campaignSeed: 1,
    checker: neverViolates,
    runs: RUNS,
    runCycles: RUN_CYCLES,
    stopOnFirstViolation: true,
    ...(maxStepCycles !== undefined ? { maxStepCycles } : {}),
  };
  const t0 = performance.now();
  const handle = createCampaign(config);
  if (isEngineError(handle) || !('runSlice' in handle)) throw new Error(`create: ${JSON.stringify(handle)}`);
  const p = handle.runSlice(RUNS); // same path runCampaign takes; keeps per-run data
  const wall = (performance.now() - t0) / 1000;
  if (!('runs' in p)) throw new Error(`run: ${JSON.stringify(p)}`);
  if (p.runs.length !== RUNS) throw new Error(`expected ${RUNS} runs, got ${p.runs.length}`);
  const cycles = p.runs.reduce((a, r) => a + r.endCycle, 0);
  return {
    wall,
    cycles,
    cyclesPerSec: cycles / wall,
    runs: p.runs.length,
    steps: stat(p.runs.map((r) => stepsByRun.get(r.runIndex) ?? 0)),
    events: stat(p.runs.map((r) => r.appliedInputs.length)),
  };
}

function show(label: string, m: Measure, rawM?: Measure): void {
  console.log(`\n${label}`);
  console.log(`  wall s:            ${m.wall.toFixed(3)}`);
  console.log(`  emulated cycles:   ${fmt(m.cycles)}`);
  console.log(`  cycles/s:          ${fmt(m.cyclesPerSec)}`);
  if (m.steps) console.log(`  steps/run m/a/M:   ${fmtStat(m.steps)}`);
  if (m.events) console.log(`  events/run m/a/M:  ${fmtStat(m.events)}`);
  if (rawM) console.log(`  ratio campaign/raw (cycles/s): ${(m.cyclesPerSec / rawM.cyclesPerSec).toFixed(3)}`);
}

console.log(`Node ${process.version}`);
const rawM = raw();
show('1. Raw (one advance, no events)', rawM);
const c2 = campaign();
show('2. Campaign (default maxStepCycles 160,000)', c2, rawM);
const c3 = campaign(1_600_000);
show('3. Campaign (maxStepCycles 1,600,000)', c3, rawM);

// Write the campaign section of SPIKE.md (only the marked text is replaced)
const dateStr = new Date().toISOString().slice(0, 10);
const row = (label: string, m: Measure): string =>
  `| ${label} | ${m.wall.toFixed(3)} | ${fmt(m.cycles)} | ${fmt(m.cyclesPerSec)} | ${fmtStat(m.steps!)} | ${fmtStat(m.events!)} | ${(m.cyclesPerSec / rawM.cyclesPerSec).toFixed(3)} |`;
const campaignSection = `## Campaign speed (${dateStr}, Node ${process.version})
Script: \`npm run bench:campaign\` (bench/campaign-bench.ts). blink_button, 6 gremlins at defaults, campaignSeed 1, N 64, Run_Cycles 8,000,000, stopOnFirstViolation true, Checker never reports a violation. Ratio = campaign cycles/s divided by raw cycles/s. Steps and events are min / avg / max per run. Wall time includes the Checker calls and the plain-data copies the campaign makes.

| Case | Wall s | Emulated cycles | Cycles/s | Steps per run (min / avg / max) | Events applied per run (min / avg / max) | Ratio |
|---|---|---|---|---|---|---|
| 1. Raw, one advance(160,000,000) | ${rawM.wall.toFixed(3)} | ${fmt(rawM.cycles)} | ${fmt(rawM.cyclesPerSec)} | n/a | n/a | n/a |
${row('2. Campaign, default maxStepCycles (160,000)', c2)}
${row('3. Campaign, maxStepCycles 1,600,000', c3)}`;
spliceSection(SPIKE_MD_PATH, '<!-- bench:campaign:start -->', '<!-- bench:campaign:end -->', campaignSection);
console.log(`\nSPIKE.md campaign section written to ${SPIKE_MD_PATH}`);
