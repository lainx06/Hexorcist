// Brand_Check for the examples (Requirement 18, 21.13, 21.14; D15).
// Reads files under examples/ with the extensions .ino, .json, .txt and .hex, and nothing else.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { BOARD_BRAND_NAMES, EXAMPLES_DIR, ROOT, wholeWordMatches } from "./examples-support";

const SCAN_EXTENSIONS = [".ino", ".json", ".txt", ".hex"];

interface ScannedFile {
  rel: string; // workspace-relative, forward slashes
  ext: string;
  text: string;
}

function rel(path: string): string {
  return relative(ROOT, path).split("\\").join("/");
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && SCAN_EXTENSIONS.includes(extname(entry.name))) out.push(full);
  }
}

function filesToScan(): ScannedFile[] {
  if (!existsSync(EXAMPLES_DIR)) return [];
  const paths: string[] = [];
  walk(EXAMPLES_DIR, paths);
  return paths
    .sort()
    .map((p) => ({ rel: rel(p), ext: extname(p), text: readFileSync(p, "utf8") }));
}

describe("Brand_Check", () => {
  it("BOARD_BRAND_NAMES is the eight words of Requirement 18.3", () => {
    expect([...BOARD_BRAND_NAMES]).toEqual([
      "Arduino",
      "Genuino",
      "Uno",
      "Nano",
      "Mega",
      "Leonardo",
      "Duemilanove",
      "Diecimila",
    ]);
  });

  it("finds no Board_Brand_Name in any .ino, .json, .txt or .hex file under examples/", () => {
    const files = filesToScan();
    expect(files.length, "no files to scan under examples/ (.ino, .json, .txt, .hex)").toBeGreaterThan(0);

    const counts: Record<string, number> = {};
    for (const f of files) counts[f.ext] = (counts[f.ext] ?? 0) + 1;
    const grouped = Object.keys(counts)
      .sort()
      .map((e) => `${e}=${counts[e]}`)
      .join(" ");

    const brandHits: string[] = [];
    for (const f of files) {
      for (const m of wholeWordMatches(f.text, BOARD_BRAND_NAMES)) {
        brandHits.push(`${f.rel}:${m.line} ${m.word}`);
      }
    }

    // Banned words over the .ino, .json and .txt files (D31: asserted to be 0, and printed below).
    const bannedFiles = files.filter((f) => f.ext !== ".hex");
    const bannedHits: string[] = [];
    for (const f of bannedFiles) {
      for (const m of wholeWordMatches(f.text, BANNED_WORDS)) {
        bannedHits.push(`${f.rel}:${m.line} ${m.word}`);
      }
    }

    console.log(
      `[brand-scan] files scanned: ${files.length} (${grouped}); brand matches: ${brandHits.length}\n` +
        files.map((f) => `[brand-scan]   ${f.rel}`).join("\n"),
    );
    console.log(
      `[banned-scan] files scanned (.ino/.json/.txt): ${bannedFiles.length}; banned-word matches: ${bannedHits.length}` +
        (bannedHits.length ? `\n[banned-scan]   ${bannedHits.join("\n[banned-scan]   ")}` : ""),
    );

    expect(brandHits, `Board_Brand_Name matches:\n${brandHits.join("\n")}`).toEqual([]);
    expect(bannedHits, `banned-word matches:\n${bannedHits.join("\n")}`).toEqual([]);
  });
});

describe("Brand_Matcher (in memory, no file read)", () => {
  it("string A, with ATmega328P, gives zero matches", () => {
    expect(wholeWordMatches("Target: ATmega328P at 16 MHz, port B bit 5.", BOARD_BRAND_NAMES)).toEqual([]);
  });

  it("string B gives exactly two Mega matches, at offsets 0 and 26, on line 1", () => {
    const matches = wholeWordMatches("Mega and ATmega328P, then MEGA.", BOARD_BRAND_NAMES);
    expect(matches).toEqual([
      { word: "Mega", offset: 0, line: 1 },
      { word: "Mega", offset: 26, line: 1 },
    ]);
  });
});

describe("Examples_README", () => {
  const readmePath = join(EXAMPLES_DIR, "README.md");

  it("exists, holds the 1 ms line, and has no brand name or banned word as a whole word", () => {
    expect(existsSync(readmePath), "examples/README.md is missing").toBe(true);
    const text = readFileSync(readmePath, "utf8");
    expect(text).toContain("<C> must never last 1 ms or longer.");

    const brand = wholeWordMatches(text, BOARD_BRAND_NAMES);
    const banned = wholeWordMatches(text, BANNED_WORDS);
    console.log(`[readme-scan] examples/README.md: brand matches: ${brand.length}; banned matches: ${banned.length}`);

    expect(brand, `brand matches in examples/README.md: ${JSON.stringify(brand)}`).toEqual([]);
    expect(banned, `banned matches in examples/README.md: ${JSON.stringify(banned)}`).toEqual([]);
  });
});
