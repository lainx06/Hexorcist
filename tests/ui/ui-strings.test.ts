// Feature: bench-ui-core. UI strings scan (Requirement 23): no word of the copy rules list and
// no board brand name in any file under src/ui/app/, in index.html, or in the example texts the
// app shows. The lists are imported, never written here. Evidence, not proof.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { BOARD_BRAND_NAMES, wholeWordMatches } from "../examples/examples-support";

const ROOT = resolve(__dirname, "..", "..");
const APP = join(ROOT, "src", "ui", "app");
const WORDS = [...BANNED_WORDS, ...BANNED_WORDS.filter((w) => w.includes("-")).map((w) => w.replace(/-/g, ""))];
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function hits(label: string, text: string, words: readonly string[]): string[] {
  return wholeWordMatches(text, words).map((m) => `${label}:${m.line} ${m.word}`);
}

describe("UI strings scan", () => {
  it("finds the inputs", () => {
    expect(existsSync(APP), "src/ui/app is missing").toBe(true);
    expect(walk(APP).length).toBeGreaterThan(0);
    expect(existsSync(join(ROOT, "index.html"))).toBe(true);
  });

  it("src/ui/app and index.html hold no listed word, no brand name and no guard marker", () => {
    const files = [...walk(APP), join(ROOT, "index.html")];
    const found: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      found.push(...hits(rel(f), text, WORDS), ...hits(rel(f), text, BOARD_BRAND_NAMES));
      if (f.startsWith(APP)) {
        if (text.includes("guard" + "-allow")) found.push(`${rel(f)} guard marker`);
        const chip = /atmega/gi;
        let m: RegExpExecArray | null;
        while ((m = chip.exec(text)) !== null) {
          if (text.slice(m.index, m.index + 10) !== "ATmega328P") found.push(`${rel(f)} chip name at ${m.index}`);
        }
      }
    }
    console.log(`[ui-strings] files scanned: ${files.length}; matches: ${found.length}`);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the example texts the app shows hold no listed word and no brand name", () => {
    const ex = join(ROOT, "examples", "crosswalk");
    const meta = JSON.parse(readFileSync(join(ex, "meta.json"), "utf8")) as Record<string, unknown>;
    const found: string[] = [];
    for (const field of ["title", "story", "timingNote"]) {
      const v = meta[field];
      expect(typeof v, `meta.json ${field} is not a string`).toBe("string");
      found.push(...hits(`meta.json ${field}`, v as string, WORDS), ...hits(`meta.json ${field}`, v as string, BOARD_BRAND_NAMES));
    }
    for (const p of ["rules.txt", "buggy/buggy.ino", "fixed/fixed.ino"]) {
      const f = join(ex, p);
      expect(existsSync(f), `${p} is missing`).toBe(true);
      const text = readFileSync(f, "utf8");
      found.push(...hits(rel(f), text, WORDS), ...hits(rel(f), text, BOARD_BRAND_NAMES));
    }
    expect(found, found.join("\n")).toEqual([]);
  });
});