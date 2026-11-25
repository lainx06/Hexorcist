import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Scans the HELD text in exorcism-demo/benchmark/README.md. N for each results table comes from
// the `runs` field of the config file named in the table's heading. The banned-word and brand scan
// is in guard-scan.test.ts and is not repeated here.

const root = path.resolve(__dirname, "..", "..");
const readme = fs.readFileSync(path.join(root, "exorcism-demo", "benchmark", "README.md"), "utf8");
const lines = readme.split(/\r?\n/);

function heldText(n: number): string {
  const unit = n === 1 ? "1 emulated run" : `${n} emulated runs`;
  return `No violation found in ${unit} of this gremlin set. Not a proof.`;
}

function runsFor(configName: string): number {
  const file = path.join(root, "exorcism-demo", `${configName}.json`);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8")) as { runs: unknown };
  if (typeof cfg.runs !== "number" || !Number.isInteger(cfg.runs) || cfg.runs < 1) {
    throw new Error(`${configName}.json has no usable runs field`);
  }
  return cfg.runs;
}

interface HeldLine {
  lineNo: number;
  text: string;
  table: string | null;
}

function collectHeldLines(): HeldLine[] {
  const out: HeldLine[] = [];
  let table: string | null = null;
  lines.forEach((text, i) => {
    const heading = /^###\s.*,\s*([a-z-]+-check)\s*$/.exec(text);
    if (heading) table = heading[1];
    else if (/^#{1,3}\s/.test(text)) table = null;
    if (/No violation found/.test(text) || /\|\s*HELD\s*\|/.test(text)) {
      out.push({ lineNo: i + 1, text, table });
    }
  });
  return out;
}

describe("README HELD lines", () => {
  const held = collectHeldLines();

  it("finds HELD lines in the results tables for crosswalk-check and motor-check", () => {
    const tables = new Set(held.map((h) => h.table));
    expect(tables.has("crosswalk-check")).toBe(true);
    expect(tables.has("motor-check")).toBe(true);
  });

  it("reads N from the config files", () => {
    expect(runsFor("crosswalk-check")).toBeGreaterThan(0);
    expect(runsFor("motor-check")).toBeGreaterThan(0);
  });

  it("every results-table HELD line uses the exact text with the config's runs", () => {
    const wrong: string[] = [];
    for (const h of held.filter((x) => x.table !== null)) {
      const expected = heldText(runsFor(h.table as string));
      if (!h.text.includes(expected)) wrong.push(`line ${h.lineNo} (${h.table}): expected "${expected}"`);
    }
    expect(wrong).toEqual([]);
  });

  it("every HELD line outside a results table uses the exact text with a literal N", () => {
    const template = "No violation found in N emulated runs of this gremlin set. Not a proof.";
    const wrong = held
      .filter((x) => x.table === null)
      .filter((x) => !x.text.includes(template))
      .map((x) => `line ${x.lineNo}: ${x.text}`);
    expect(wrong).toEqual([]);
  });

  it("uses 1 emulated run when N is 1", () => {
    expect(heldText(1)).toBe("No violation found in 1 emulated run of this gremlin set. Not a proof.");
  });
});
