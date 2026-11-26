/**
 * bench/evidence-stats.ts
 *
 * Pure helpers for bench/evidence.ts (honest-verdicts, Part 3): sweep starts, the median text,
 * the Evidence_Doc text and the forbidden-word check. No wall clock and no random source here;
 * bench/evidence.ts is the only file that reads the wall clock.
 */
import { BANNED_WORDS } from '../src/engine/copy-rules.js';
import { BOARD_BRAND_NAMES } from '../tests/examples/examples-support.js';

export const SWEEP_STEP_CYCLES = 160_000; // 10 ms at 16 MHz

export interface SeedSweepRow {
  example: string;
  build: 'buggy' | 'fixed';
  seeds: [number, number];
  runsPerCampaign: number;
  broke: number;
  held: number;
  couldntTell: number;
  /** 1-based Violating_Run_Numbers of the BROKE Campaigns, in seed order. */
  violatingRunNumbers: number[];
  /** Distinct HELD texts seen, in the order they were seen. */
  heldTexts: string[];
}

export interface PressViolation {
  start: number;
  rule: string;
  cycle: number;
}

export interface PressSweepRow {
  example: string;
  build: 'buggy' | 'fixed';
  signal: string;
  holdCycles: number;
  runCycles: number;
  starts: number;
  lastStart: number | null;
  violations: PressViolation[];
  cannotCheckRuns: number;
}

export interface EvidenceResults {
  machine: { os: string; cpu: string; cores: number; node: string; avr8js: string };
  /** YYYY-MM-DD, UTC. */
  date: string;
  seconds: { seedSweep: number; pressSweep: number; total: number };
  seedRows: SeedSweepRow[];
  pressRows: PressSweepRow[];
}

/** Every k * step with k >= 1 and k * step + holdCycles < runCycles, ascending. */
export function sweepStarts(runCycles: number, holdCycles: number, step: number = SWEEP_STEP_CYCLES): number[] {
  const out: number[] = [];
  for (let s = step; s + holdCycles < runCycles; s += step) out.push(s);
  return out;
}

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** "none" for an empty list; the middle value for an odd count; the mean of the two middle values otherwise. */
export function medianText(values: readonly number[]): string {
  if (values.length === 0) return 'none';
  const s = sortedCopy(values);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return String(s[mid]);
  const mean = (s[mid - 1] + s[mid]) / 2;
  return Number.isInteger(mean) ? String(mean) : mean.toFixed(1);
}

/** Min and max as text, "none" for an empty list. */
export function minMaxText(values: readonly number[]): { min: string; max: string } {
  if (values.length === 0) return { min: 'none', max: 'none' };
  const s = sortedCopy(values);
  return { min: String(s[0]), max: String(s[s.length - 1]) };
}

/** Base-10 digits with a comma between groups of 3, counted from the right. */
export function groups(n: number): string {
  const digits = String(n);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return out;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|');

export function renderEvidenceDoc(r: EvidenceResults): string {
  const L: string[] = [];
  L.push('# Evidence numbers', '');
  L.push('These numbers come from emulated runs of the ATmega328P example programs. They are evidence, not a proof.', '');
  L.push('Rerun them with `npm run bench:evidence`. The bench reads the wall clock only for the date and the times in this file.', '');
  L.push('## Machine and run', '');
  L.push('| Item | Value |', '|---|---|');
  L.push(`| OS | ${cell(r.machine.os)} |`);
  L.push(`| CPU | ${cell(r.machine.cpu)}, ${r.machine.cores} cores |`);
  L.push(`| Node | ${cell(r.machine.node)} |`);
  L.push(`| avr8js | ${cell(r.machine.avr8js)} |`);
  L.push(`| Date of run (UTC) | ${r.date} |`);
  L.push('| Seed ranges | campaignSeed 1 to 100 for both buggy and fixed builds |');
  L.push(
    `| Wall-clock time | seed sweep ${r.seconds.seedSweep.toFixed(1)} s, single-press sweep ${r.seconds.pressSweep.toFixed(1)} s, whole bench ${r.seconds.total.toFixed(1)} s |`,
  );
  L.push('');
  L.push('## Seed sweep', '');
  L.push(
    'One Campaign per seed. Each Campaign uses the committed HEX, `fixture.json`, `rules.txt`, `gremlinSet`, `runs` and `runCycles` of the example; only `campaignSeed` changes. The violating run number is the 1-based index of the Run that broke the rule.',
    '',
  );
  L.push(
    "| Example | Build | Seeds | Runs per Campaign | BROKE | HELD | COULDN'T TELL | Violating run number (min / median / max) |",
    '|---|---|---|---|---|---|---|---|',
  );
  for (const row of r.seedRows) {
    const mm = minMaxText(row.violatingRunNumbers);
    const runCol = row.build === 'buggy' ? `${mm.min} / ${medianText(row.violatingRunNumbers)} / ${mm.max}` : 'not measured';
    L.push(
      `| ${row.example} | ${row.build} | ${row.seeds[0]} to ${row.seeds[1]} | ${row.runsPerCampaign} | ${row.broke} | ${row.held} | ${row.couldntTell} | ${runCol} |`,
    );
  }
  L.push('');
  const heldLines = r.seedRows.filter((row) => row.heldTexts.length > 0);
  if (heldLines.length > 0) {
    L.push('HELD texts seen:', '');
    for (const row of heldLines) {
      for (const t of row.heldTexts) L.push(`- ${row.example} ${row.build}: "${t}"`);
    }
    L.push('');
  }
  L.push('## Single-press sweep', '');
  L.push(
    'One Run per start. Each Run holds only the rest events of the fixture and one ordinary press and release of the Single_Input from the example-firmware spec, moved to start every 10 ms (160,000 cycles) from 10 ms up to the last start whose release is still inside the run. No gremlin events. Each Run continues to `runCycles`.',
    '',
  );
  L.push(
    '| Example | Build | Signal | Hold (cycles) | Starts (cycles) | Start count | Runs with a violation | Runs with a CannotCheck |',
    '|---|---|---|---|---|---|---|---|',
  );
  for (const row of r.pressRows) {
    const span = row.lastStart === null ? 'none' : `${groups(SWEEP_STEP_CYCLES)} to ${groups(row.lastStart)}`;
    L.push(
      `| ${row.example} | ${row.build} | ${row.signal} | ${groups(row.holdCycles)} | ${span} | ${row.starts} | ${row.violations.length} | ${row.cannotCheckRuns} |`,
    );
  }
  L.push('');
  const withV = r.pressRows.filter((row) => row.violations.length > 0);
  if (withV.length === 0) {
    L.push('No single-press Run had a violation.', '');
  } else {
    L.push('Single-press Runs with a violation:', '');
    L.push('| Example | Build | Start (cycles) | Violation cycle | Rule |', '|---|---|---|---|---|');
    for (const row of withV) {
      for (const v of row.violations) {
        L.push(`| ${row.example} | ${row.build} | ${groups(v.start)} | ${groups(v.cycle)} | ${cell(v.rule)} |`);
      }
    }
    L.push('');
  }
  return L.join('\n');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FORBIDDEN: readonly string[] = [...BANNED_WORDS, 'realtime', ...BOARD_BRAND_NAMES];

/** Whole-word, case-insensitive matches of the forbidden words, plus any line holding "guard-allow". */
export function findForbiddenWords(text: string): string[] {
  const found: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('guard-allow')) found.push(`line ${i + 1}: guard-allow`);
    for (const w of FORBIDDEN) {
      const re = new RegExp(`(?<![\\w-])${escapeRe(w)}(?![\\w-])`, 'i');
      if (re.test(line)) found.push(`line ${i + 1}: ${w}`);
    }
  });
  return found;
}