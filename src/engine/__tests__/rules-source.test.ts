// Source checks for the Rule_Compiler files (Req 13.6, 15.1 to 15.4).
// Reads the files at test time. The line patterns below are copied from scripts/guard.mjs
// checks "b" and "b2" so this test looks for the same text, comments included.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..", "..", "..");
const engineDir = join(root, "src", "engine");
const rulesDir = join(engineDir, "rules");

const files: string[] = [
  ...readdirSync(rulesDir, { recursive: true })
    .map((n) => join(rulesDir, String(n)))
    .filter((p) => p.endsWith(".ts")),
  join(engineDir, "spike", "led-timeout-monitor.ts"),
].sort();

const rel = (p: string) => relative(root, p).split(sep).join("/");
const read = (p: string) => readFileSync(p, "utf8");
const linesOf = (p: string) => read(p).split(/\r?\n/);

// Guard "b" pattern (copied from scripts/guard.mjs).
const GUARD_B =
  /\b(Date\.now|performance\.now|setTimeout|setInterval|Math\.random)\b|\bnew\s+Date\s*\(/;
// Guard "b2" patterns (copied from scripts/guard.mjs).
const GUARD_B2: RegExp[] = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["'](?:node:)?(?:https|http|net)["']/,
  /\bcrypto\.getRandomValues\b/,
  /\brandomUUID\b/,
  /\brandomBytes\b/,
];
const EXTRA: RegExp[] = [
  /\bprocess\.hrtime\b/,
  /\bsetImmediate\b/,
  /\bqueueMicrotask\b/,
  /(?<!new\s+)\bDate\s*\(/, // bare Date( , not preceded by "new "
];

interface ImportRef {
  statement: string;
  specifier: string;
  line: number;
}

function importRefs(text: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const lineAt = (idx: number) => text.slice(0, idx).split("\n").length;
  const patterns: RegExp[] = [
    /\b(?:import|export)\s+(?:type\s+)?[^;"'`]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      refs.push({ statement: m[0], specifier: m[1]!, line: lineAt(m.index ?? 0) });
    }
  }
  return refs;
}

describe("rule-compiler source files", () => {
  it("covers the expected files", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.map(rel)).toContain("src/engine/rules/compile.ts");
    expect(files.map(rel)).toContain("src/engine/spike/led-timeout-monitor.ts");
  });

  it("imports only relative modules under src/engine/", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const r of importRefs(read(f))) {
        const ok =
          r.specifier.startsWith(".") &&
          (() => {
            const target = resolve(dirname(f), r.specifier);
            return target === engineDir || target.startsWith(engineDir + sep);
          })();
        if (!ok) bad.push(`${rel(f)}:${r.line}: ${r.statement.replace(/\s+/g, " ")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("does not import avr8js, emulator-bridge or prng", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const r of importRefs(read(f))) {
        const base = r.specifier.split("/").pop()!.replace(/\.[cm]?[jt]s$/, "");
        if (/avr8js/.test(r.specifier) || base === "emulator-bridge" || base === "prng") {
          bad.push(`${rel(f)}:${r.line}: ${r.statement.replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("imports campaign only through import type", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const r of importRefs(read(f))) {
        const base = r.specifier.split("/").pop()!.replace(/\.[cm]?[jt]s$/, "");
        if (base === "campaign" && !/^import\s+type\b/.test(r.statement)) {
          bad.push(`${rel(f)}:${r.line}: ${r.statement.replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("has no guard b or b2 pattern and no other clock or network API on any line, comments included", () => {
    const patterns = [GUARD_B, ...GUARD_B2, ...EXTRA];
    const bad: string[] = [];
    for (const f of files) {
      linesOf(f).forEach((text, i) => {
        for (const re of patterns) {
          const m = re.exec(text);
          if (m) bad.push(`${rel(f)}:${i + 1}: ${m[0]} in "${text.trim()}"`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("bare Date( pattern ignores new Date( and finds Date(", () => {
    const re = EXTRA[3]!;
    expect(re.test("x = Date(1)")).toBe(true);
    expect(re.test("x = new Date(1)")).toBe(false);
    expect(re.test("x = new  Date(1)")).toBe(false);
  });

  it("package.json dependencies and devDependencies match the pinned list", () => {
    const pkg = JSON.parse(read(join(root, "package.json"))) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({ avr8js: "0.21.1" });
    expect(pkg.devDependencies).toEqual({
      "@types/node": "20.17.57",
      "fast-check": "4.10.2",
      tsx: "4.19.3",
      typescript: "^5.3.3",
      vite: "5.4.21",
      vitest: "1.6.0",
    });
  });
});
