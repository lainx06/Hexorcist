/// <reference types="node" />
// Source-text check of src/ui/main.ts for the input-pullup fix (task 9.5).
// This checks source text only. The repo has no browser harness, so it does
// not exercise the UI at runtime. Evidence only, not proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../ui/main.ts'), 'utf-8');

/** Return the text of a top-level `function name(...) { ... }` by brace matching. */
function functionBody(name: string): string {
  const start = SRC.indexOf(`function ${name}(`);
  expect(start, `function ${name} not found`).toBeGreaterThanOrEqual(0);
  const open = SRC.indexOf('{', SRC.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces in ${name}`);
}

describe('ui input pull-up (source text only)', () => {
  it('initBridge() creates the bridge with no BUTTON event at cycle 0', () => {
    const body = functionBody('initBridge');
    expect(body).toMatch(/EmulatorBridge\.create\(hexData, FIXTURE\)/);
    expect(body).not.toMatch(/signal:\s*'BUTTON'/);
    expect(body).not.toMatch(/cycle:\s*0\b/);
  });

  it('scheduleButtonRelease schedules a release event at the current cycle', () => {
    const body = functionBody('scheduleButtonRelease');
    expect(body).toMatch(/signal:\s*'BUTTON',\s*value:\s*'release',\s*cycle:\s*bridge\.cycleCount/);
    expect(SRC).not.toMatch(/scheduleButtonUp/);
  });

  it('pointerdown and keydown still schedule value 0', () => {
    expect(functionBody('scheduleButtonDown')).toMatch(/value:\s*0\b/);
    expect(SRC).toMatch(/addEventListener\('pointerdown', scheduleButtonDown\)/);
  });

  it('release is bound to pointerup, pointerleave and Space keyup', () => {
    expect(SRC).toMatch(/addEventListener\('pointerup', scheduleButtonRelease\)/);
    expect(SRC).toMatch(/addEventListener\('pointerleave', scheduleButtonRelease\)/);
    expect(SRC).toMatch(
      /addEventListener\('keyup',[^]*?e\.code === 'Space'[^]*?scheduleButtonRelease\(\)/,
    );
  });

  it('keeps the comment saying the bridge models the pull-up', () => {
    expect(SRC).toMatch(/bridge now models the pull-up/);
    expect(SRC).toMatch(/never drives BUTTON = 1/);
  });

  it('main.ts avoids the banned words', () => {
    const banned = /\b(safe|secure|guaranteed|certified|real-time|first|unique|shortest)\b/i;
    expect(SRC).not.toMatch(banned);
  });
});
