/**
 * bench/example-campaign-bench.ts
 *
 * Where does the speed of the fixed crosswalk campaign go? Compares raw emulator speed, the campaign
 * exactly as the example test builds it, and the same campaign with a checker that never reports.
 * Run with: npm run bench:examples (tsx, sequential, not under vitest).
 * Wall clock is allowed here and nowhere else. Prints only; it does not write SPIKE.md.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { EmulatorBridge, isBridgeError } from '../src/engine/emulator-bridge.js';
import { createCampaign } from '../src/engine/campaign.js';
import type { CampaignConfig } from '../src/engine/campaign.js';
import type { Checker } from '../src/engine/checker.js';
import { isEngineError } from '../src/engine/errors.js';
import { buildCampaignConfig } from '../src/engine/rules/config-builder.js';
import type { RunResult, Fixture } from '../src/engine/types.js';
import { buildScriptedEvents, loadExample, readHex, runExampleCampaign } from '../tests/examples/examples-support.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLINK_HEX = readFileSync(resolve(__dirname, '../fixtures/blink_button/build/blink_button.ino.hex'), 'utf-8');
// Same Fixture as bench/campaign-bench.ts (E9b).
const BLINK_FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const REPEATS = 2;
const RAW_STEP = 160_000;
const RAW_TARGET = 16_000_000;
const RAW_RUNS = 3;

interface Stat { min: number; avg: number; max: number }
function stat(xs: number[]): Stat | null {
  if (xs.length === 0) return null;
  return { min: Math.min(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) };
}
const fmt = (n: number, d = 0): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtStat = (s: Stat | null): string => (s === null ? 'n/a' : `${fmt(s.min)} / ${fmt(s.avg, 1)} / ${fmt(s.max)}`);

interface Row {
  label: string;
  repeat: number;
  cycles: number;
  seconds: number;
  runs?: number;
  steps: string;
  edges: string;
  calls: string;
  events: string;
}
const rows: Row[] = [];
const cps = (r: Row): number => r.cycles / r.seconds;

function record(r: Row): void {
  rows.push(r);
  console.log(`\n${r.label} (repeat ${r.repeat})`);
  console.log(`  total cycles:        ${fmt(r.cycles)}`);
  console.log(`  seconds:             ${r.seconds.toFixed(3)}`);
  console.log(`  cycles/s:            ${fmt(cps(r))}`);
  if (r.runs !== undefined) {
    console.log(`  runs:                ${r.runs}`);
    console.log(`  steps/run m/a/M:     ${r.steps}`);
    console.log(`  out edges/run m/a/M: ${r.edges}`);
    console.log(`  checker calls (all): ${r.calls}`);
    console.log(`  events applied/run:  ${r.events}`);
  }
}

/** Raw bridge, stepped in RAW_STEP steps to RAW_TARGET, RAW_RUNS times. */
function rawCase(label: string, repeat: number, hex: string, fixture: Fixture, events: ReturnType<typeof buildScriptedEvents>): void {
  let cycles = 0;
  let seconds = 0;
  for (let i = 0; i < RAW_RUNS; i++) {
    const bridge = EmulatorBridge.create(hex, fixture, events.map((e) => ({ ...e })));
    if (isBridgeError(bridge)) throw new Error(`bridge: ${bridge.message}`);
    const t0 = performance.now();
    while (bridge.cycleCount < RAW_TARGET) {
      const r = bridge.advance(Math.min(RAW_STEP, RAW_TARGET - bridge.cycleCount));
      if (isBridgeError(r)) throw new Error(`advance: ${r.message}`);
    }
    seconds += (performance.now() - t0) / 1000;
    cycles += bridge.cycleCount;
  }
  record({ label, repeat, cycles, seconds, steps: 'n/a', edges: 'n/a', calls: 'n/a', events: 'n/a' });
}

function summarise(label: string, repeat: number, seconds: number, runs: readonly RunResult[], calls: Map<number, number> | null): void {
  const cycles = runs.reduce((a, r) => a + r.endCycle, 0);
  // calls per run include the end-of-run call; Steps = calls - 1 (no violation, so the end call always happens).
  const steps = calls === null ? null : stat(runs.map((r) => (calls.get(r.runIndex) ?? 0) - 1));
  const total = calls === null ? null : [...calls.values()].reduce((a, b) => a + b, 0);
  record({
    label,
    repeat,
    cycles,
    seconds,
    runs: runs.length,
    steps: calls === null ? 'n/a (checker not wrapped in this case)' : fmtStat(steps),
    edges: fmtStat(stat(runs.map((r) => r.outputEvents.length))),
    calls: total === null ? 'n/a (checker not wrapped in this case)' : fmt(total),
    events: fmtStat(stat(runs.map((r) => r.appliedInputs.length))),
  });
}

const ex = loadExample('crosswalk');
const fixedHex = readHex('crosswalk', 'fixed');
const buggyHex = readHex('crosswalk', 'buggy');
const restEvents = buildScriptedEvents(ex.fixture, [], RAW_TARGET); // Rest_Events only, no gremlins

function builtConfig(): CampaignConfig {
  const built = buildCampaignConfig(ex.ruleSet, ex.fixture, {
    hex: fixedHex,
    gremlinSet: ex.meta.gremlinSet,
    campaignSeed: ex.meta.campaignSeed,
    runs: ex.meta.runs,
    runCycles: ex.meta.runCycles,
  });
  if (!built.ok) throw new Error(`config: ${built.reasons.join(' | ')}`);
  return built.config;
}

function runConfig(config: CampaignConfig): { seconds: number; runs: RunResult[] } {
  const t0 = performance.now();
  const handle = createCampaign(config);
  if (isEngineError(handle) || !('runSlice' in handle)) throw new Error(`create: ${JSON.stringify(handle)}`);
  const p = handle.runSlice(ex.meta.runs);
  const seconds = (performance.now() - t0) / 1000;
  if (!('runs' in p)) throw new Error(`run: ${JSON.stringify(p)}`);
  if (p.runs.length !== ex.meta.runs) throw new Error(`expected ${ex.meta.runs} runs, got ${p.runs.length}`);
  return { seconds, runs: p.runs };
}

console.log(`Node ${process.version}, standalone via tsx (not under Vitest)`);
console.log(`${os.type()} ${os.release()} (${os.arch()}), ${os.cpus()[0]?.model ?? 'unknown CPU'} x${os.cpus().length}`);
console.log(`crosswalk meta: N ${ex.meta.runs}, runCycles ${fmt(ex.meta.runCycles)}, seed ${ex.meta.campaignSeed}, gremlins ${ex.meta.gremlinSet.map((g) => g.id).join(', ')}`);

for (let repeat = 1; repeat <= REPEATS; repeat++) {
  rawCase('(a) raw, crosswalk fixed.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps', repeat, fixedHex, ex.fixture, restEvents);
}

for (let repeat = 1; repeat <= REPEATS; repeat++) {
  // (b) exactly as the 4.4 test: runExampleCampaign (compiled Rule_Checker, nothing wrapped).
  const t0 = performance.now();
  const out = runExampleCampaign(ex, 'fixed');
  const seconds = (performance.now() - t0) / 1000; // includes buildCampaignConfig + compile, which the test's own clock leaves out
  summarise('(b) campaign, runExampleCampaign (compiled Rule_Checker); seconds include config build', repeat, seconds, out.runs, null);
}

for (let repeat = 1; repeat <= REPEATS; repeat++) {
  // (b+) same compiled Rule_Checker, wrapped only to count calls. Config built outside the timer.
  const config = builtConfig();
  const inner = config.checker;
  const calls = new Map<number, number>();
  const counting: Checker = (obs) => {
    calls.set(obs.runIndex, (calls.get(obs.runIndex) ?? 0) + 1);
    return inner(obs);
  };
  const { seconds, runs } = runConfig({ ...config, checker: counting });
  summarise('(b+) campaign, compiled Rule_Checker wrapped to count calls', repeat, seconds, runs, calls);
}

for (let repeat = 1; repeat <= REPEATS; repeat++) {
  // (c) checker injected through CampaignConfig.checker: never reports anything. Config otherwise as in (b).
  const config = builtConfig();
  const calls = new Map<number, number>();
  const never: Checker = (obs) => {
    calls.set(obs.runIndex, (calls.get(obs.runIndex) ?? 0) + 1);
    return { violation: null };
  };
  const { seconds, runs } = runConfig({ ...config, checker: never });
  summarise('(c) campaign, checker never reports', repeat, seconds, runs, calls);
}

for (let repeat = 1; repeat <= REPEATS; repeat++) {
  rawCase('(d1) raw, crosswalk buggy.hex, Rest_Events only, 3 x 16,000,000 in 160,000 steps', repeat, buggyHex, ex.fixture, restEvents);
}
for (let repeat = 1; repeat <= REPEATS; repeat++) {
  rawCase('(d2) raw, blink_button HEX (E9b), no events, 3 x 16,000,000 in 160,000 steps', repeat, BLINK_HEX, BLINK_FIXTURE, []);
}

// (e) garage Fixed_Sketch campaign, built the same way as (b): runExampleCampaign on loadExample, fixed build (D28).
const garage = loadExample('garage');
console.log(`garage meta: N ${garage.meta.runs}, runCycles ${fmt(garage.meta.runCycles)}, seed ${garage.meta.campaignSeed}, gremlins ${garage.meta.gremlinSet.map((g) => g.id).join(', ')}`);
for (let repeat = 1; repeat <= REPEATS; repeat++) {
  const t0 = performance.now();
  const out = runExampleCampaign(garage, 'fixed');
  const seconds = (performance.now() - t0) / 1000; // includes buildCampaignConfig + compile, as in (b)
  summarise('(e) campaign, garage fixed, runExampleCampaign (compiled Rule_Checker); seconds include config build', repeat, seconds, out.runs, null);
}

console.log('\n| Case | Repeat | Total cycles | Seconds | Cycles/s | Steps/run (min / avg / max) | Out edges/run (min / avg / max) | Checker calls | Events applied/run (min / avg / max) |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.label} | ${r.repeat} | ${fmt(r.cycles)} | ${r.seconds.toFixed(3)} | ${fmt(cps(r))} | ${r.steps} | ${r.edges} | ${r.calls} | ${r.events} |`);
}
