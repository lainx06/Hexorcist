import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Applies the patterns from scripts/guard.mjs to the files the benchmark-tools spec added under
// exorcism-demo/. guard.mjs runs on import and exits, so its regex literals are read from its
// source text instead of being copied. guard.mjs is not edited.

const root = path.resolve(__dirname, "..", "..");
const demo = path.join(root, "exorcism-demo");

const guardSource = fs.readFileSync(path.join(root, "scripts", "guard.mjs"), "utf8");
const guardRes: RegExp[] = [];
for (const line of guardSource.split(/\r?\n/)) {
  const m = /^\s*(?:\{\s*)?re:\s*\/(.+)\/([a-z]*),?(?:\s*msg:.*)?$/.exec(line);
  if (m) guardRes.push(new RegExp(m[1], m[2]));
}

function guardPattern(label: string, pick: (src: string) => boolean): RegExp[] {
  const found = guardRes.filter((r) => pick(r.source));
  if (found.length === 0) throw new Error(`guard.mjs pattern not found: ${label}`);
  return found;
}

const claimRe = guardPattern("claim words", (s) => s.includes("shortest"))[0];
const brandRes = guardPattern("brand", (s) => s.includes("Arduino"));
const clockRes = guardPattern("clock and random", (s) => s.includes("Math\\.random"));
const networkRes = guardPattern("network", (s) =>
  /fetch|XMLHttpRequest|WebSocket|https\?\|net/.test(s),
);

// Suffixed forms (safely, securely, firstly, uniquely, guarantee, certify, ...), built from the
// words in guard's own claim pattern so the two lists stay together.
const claimWords = /\(([^)]*shortest[^)]*)\)/.exec(claimRe.source)![1].split("|");
const stems = new Set<string>();
for (const w of claimWords) {
  stems.add(w.replace(/(?:ed|e)$/, "").replace(/ifi$/, "if"));
  stems.add(w);
}
const suffixedRe = new RegExp(
  `(?<![\\w-])(?:${[...stems].map((s) => s.replace(/-/g, "-?")).join("|")})[a-z]*`,
  "i",
);

const textFiles = [
  "try.mjs",
  "measure-overlap.ts",
  "crosswalk-check.json",
  "crosswalk-full-check.json",
  "motor-check.json",
  "motor/pins.json",
  "motor/rules.txt",
  "benchmark/README.md",
];
const codeFiles = ["try.mjs", "measure-overlap.ts"];

function hits(file: string, res: RegExp[]): string[] {
  const out: string[] = [];
  fs.readFileSync(path.join(demo, file), "utf8")
    .split(/\r?\n/)
    .forEach((text, i) => {
      for (const re of res) {
        const m = re.exec(text);
        if (m) out.push(`exorcism-demo/${file}:${i + 1}: "${m[0]}" in: ${text.trim()}`);
      }
    });
  return out;
}

describe("guard patterns loaded from scripts/guard.mjs", () => {
  it("finds every pattern it needs", () => {
    expect(claimWords).toContain("unique");
    expect(brandRes.length).toBeGreaterThan(0);
    expect(clockRes.length).toBeGreaterThan(0);
    expect(networkRes.length).toBeGreaterThan(0);
  });

  it("the suffixed-form pattern catches the forms and skips plain words", () => {
    for (const w of ["safely", "securely", "firstly", "uniquely", "guarantee", "guarantees", "certify", "safe"]) {
      expect(suffixedRe.test(w), w).toBe(true);
    }
    expect(suffixedRe.test("unsafe-looking circuit")).toBe(false);
  });
});

describe("benchmark-tools files", () => {
  for (const file of textFiles) {
    it(`${file}: no banned words, whole or suffixed`, () => {
      expect(hits(file, [claimRe, suffixedRe])).toEqual([]);
    });
    it(`${file}: no board brand name`, () => {
      expect(hits(file, brandRes)).toEqual([]);
    });
  }
  for (const file of codeFiles) {
    it(`${file}: no clock, Math.random or network use`, () => {
      expect(hits(file, [...clockRes, ...networkRes])).toEqual([]);
    });
  }
});
