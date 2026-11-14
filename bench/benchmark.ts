/**
 * bench/benchmark.ts
 *
 * Standalone Node benchmark for the EmulatorBridge.
 * Runs fixtures/blink_button/build/blink_button.ino.hex for
 * 10 runs x 16,000,000 cycles (BUTTON = 1 at cycle 0) and replaces the text
 * between <!-- bench:raw:start --> and <!-- bench:raw:end --> in SPIKE.md.
 *
 * SPIKE: wall-clock timing ONLY allowed in benchmark; banned everywhere else
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { EmulatorBridge, isBridgeError } from '../src/engine/emulator-bridge.js';
import type { Fixture } from '../src/engine/types.js';
import { spliceSection } from './spike-md.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const HEX_PATH = resolve(__dirname, '../fixtures/blink_button/build/blink_button.ino.hex');
const AVR8JS_PKG_PATH = resolve(__dirname, '../node_modules/avr8js/package.json');
const SPIKE_MD_PATH = resolve(__dirname, '../SPIKE.md');

// Fixture
const FIXTURE: Fixture = {
  pins: [
    { signal: 'BUTTON', port: 'D', bit: 2, direction: 'input' },
    { signal: 'LED', port: 'B', bit: 5, direction: 'output' },
  ],
};

const RUNS = 10;
const CYCLES_PER_RUN = 16_000_000;
const TOTAL_CYCLES = RUNS * CYCLES_PER_RUN;

// Load files
const hex = readFileSync(HEX_PATH, 'utf-8');
const avr8jsPkg = JSON.parse(readFileSync(AVR8JS_PKG_PATH, 'utf-8')) as { version: string };
const avr8jsVersion = avr8jsPkg.version;

// Run benchmark
console.log(`Running ${RUNS} x ${CYCLES_PER_RUN.toLocaleString()} cycles...`);

// SPIKE: wall-clock timing ONLY allowed in benchmark; banned everywhere else
const wallStart = performance.now();
for (let i = 0; i < RUNS; i++) {
  const bridge = EmulatorBridge.create(hex, FIXTURE, [
    { signal: 'BUTTON', value: 1, cycle: 0 },
  ]);
  if (isBridgeError(bridge)) {
    console.error('Bridge creation failed:', bridge);
    process.exit(1);
  }
  const result = bridge.advance(CYCLES_PER_RUN);
  if (isBridgeError(result)) {
    console.error('advance() failed:', result);
    process.exit(1);
  }
  process.stdout.write(`  run ${i + 1}/${RUNS}: ${result.cyclesConsumed.toLocaleString()} cycles consumed\n`);
}
// SPIKE: wall-clock timing ONLY allowed in benchmark; banned everywhere else
const wallEnd = performance.now();
const wallSeconds = (wallEnd - wallStart) / 1000;
const simSeconds = TOTAL_CYCLES / 16_000_000;
const simPerReal = simSeconds / wallSeconds;

// Collect metadata
const nodeVersion = process.version;
const osDesc = `${os.type()} ${os.release()} (${os.arch()})`;
const dateStr = new Date().toISOString().slice(0, 10);

// Write the raw section of SPIKE.md (only the marked text is replaced)
const rawSection = `## S5: Benchmark (Node, avr8js)

- **Node version:** ${nodeVersion}
- **avr8js version:** ${avr8jsVersion}
- **OS:** ${osDesc}
- **Total cycles:** ${TOTAL_CYCLES.toLocaleString()}
- **Wall seconds:** ${wallSeconds.toFixed(3)}
- **Simulated seconds per real second:** ${simPerReal.toFixed(2)}
- **Date:** ${dateStr}`;
spliceSection(SPIKE_MD_PATH, '<!-- bench:raw:start -->', '<!-- bench:raw:end -->', rawSection);

console.log('\n--- Results ---');
console.log(`Node:          ${nodeVersion}`);
console.log(`avr8js:        ${avr8jsVersion}`);
console.log(`OS:            ${osDesc}`);
console.log(`Total cycles:  ${TOTAL_CYCLES.toLocaleString()}`);
console.log(`Wall seconds:  ${wallSeconds.toFixed(3)}`);
console.log(`Sim/real:      ${simPerReal.toFixed(2)}x`);
console.log(`\nSPIKE.md raw section written to ${SPIKE_MD_PATH}`);
