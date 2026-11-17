// Feature: bench-ui-upload. Acceptance A7: the upload, pin table and sample code paths make no network
// call and keep nothing in storage. Reads source text only, so passing is evidence, not proof.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");

/** Upload_Code_Paths (Requirement 17.3), as design "No_Network_Test" lists them. */
const UPLOAD_CODE_PATHS = [
  "src/ui/app/model/upload-copy.ts",
  "src/ui/app/model/upload-hex.ts",
  "src/ui/app/model/pin-table.ts",
  "src/ui/app/model/pin-map-file.ts",
  "src/ui/app/model/upload-rule.ts",
  "src/ui/app/model/upload-fields.ts",
  "src/ui/app/model/upload-state.ts",
  "src/ui/app/model/signal-labels.ts",
  "src/ui/app/model/pin-levels.ts",
  "src/ui/app/model/capability.ts",
  "src/ui/app/data/upload-sample.ts",
  "src/ui/app/views/program-section.ts",
  "src/ui/app/views/pin-table.ts",
  "src/ui/app/views/file-io.ts",
  "src/ui/app/views/run-length-field.ts",
  "src/ui/app/views/scene-pin-levels.ts",
  "src/ui/app/views/capability-panel.ts",
  "src/ui/app/views/signal-label.ts",
  "src/ui/app/views/app-page.ts",
  "src/ui/app/views/setup.ts",
] as const;

/** Upload_Model and Pin_Levels_View files for the clock and randomness scan (Requirements 18.1, 18.2). */
const DETERMINISM_PATHS = UPLOAD_CODE_PATHS.filter(
  (p) => p.includes("/model/") || p.includes("/data/") || p.endsWith("scene-pin-levels.ts"),
);

interface Finding {
  line: number;
  text: string;
}

const lineOf = (text: string, offset: number): number => text.slice(0, offset).split("\n").length;

function scan(text: string, patterns: readonly RegExp[]): Finding[] {
  const out: Finding[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
    for (const m of text.matchAll(re)) out.push({ line: lineOf(text, m.index ?? 0), text: m[0] });
  }
  return out;
}

const NETWORK: readonly RegExp[] = [
  /(?<![A-Za-z0-9_$])fetch(?![A-Za-z0-9_$])/g,
  /(?<![A-Za-z0-9_$])(XMLHttpRequest|WebSocket|EventSource|sendBeacon)(?![A-Za-z0-9_$])/g,
  /\bwindow\.(parent|opener|top)\b/g,
  /\bBroadcastChannel\b/g,
  /\.(submit|requestSubmit)\s*\(/g,
  /<form\b/g,
  /(?<![A-Za-z0-9_$])(localStorage|sessionStorage|indexedDB)(?![A-Za-z0-9_$])/g,
  /document\.cookie/g,
];

const DETERMINISM: readonly RegExp[] = [
  /Date\.now/g,
  /performance\.now/g,
  /\bsetTimeout\b/g,
  /\bsetInterval\b/g,
  /new Date\(/g,
  /Math\.random/g,
  /crypto\.getRandomValues/g,
  /\brandomUUID\b/g,
];

/** Each import( whose argument is not one plain quoted literal, or is a literal naming a URL. */
function importFindings(text: string): Finding[] {
  const out: Finding[] = [];
  for (const m of text.matchAll(/\bimport\s*\(/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    const arg = text.slice(start, i - 1).trim();
    const lit = /^(["'])([^"'\\]*)\1$/.exec(arg);
    const bad = lit === null || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(lit[2] as string) || (lit[2] as string).startsWith("//");
    if (bad) out.push({ line: lineOf(text, m.index ?? 0), text: text.slice(m.index ?? 0, i) });
  }
  return out;
}

const networkFindings = (text: string): Finding[] => [...scan(text, NETWORK), ...importFindings(text)];

const readSrc = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const listed = (p: string, fs: Finding[]): string[] => fs.map((f) => `${p}:${String(f.line)}: ${f.text}`);

describe("A7", () => {
  it("lists upload code paths that all exist (Requirement 17.3)", () => {
    expect(UPLOAD_CODE_PATHS.length).toBeGreaterThan(0);
    const missing = UPLOAD_CODE_PATHS.filter((p) => !existsSync(join(ROOT, p)));
    expect(missing, `missing files:\n${missing.join("\n")}`).toEqual([]);
  });

  it("the matcher flags every forbidden sample and passes a plain relative import (Requirement 17.4)", () => {
    const flagged = [
      'fetch("x")',
      "new XMLHttpRequest()",
      'new WebSocket("x")',
      'new EventSource("x")',
      'navigator.sendBeacon("x")',
      "import(name)",
      "import(`./${n}`)",
      'import("https://x")',
      'import("//x")',
      'localStorage.getItem("k")',
      "window.parent.postMessage(1)",
    ];
    for (const s of flagged) expect(networkFindings(s).length, `not flagged: ${s}`).toBeGreaterThan(0);
    expect(networkFindings('import("./pin-table")')).toEqual([]);
    expect(scan("Date.now()", DETERMINISM).length).toBeGreaterThan(0);
  });

  it("The no-network source test above.", () => {
    const found = UPLOAD_CODE_PATHS.filter((p) => existsSync(join(ROOT, p))).flatMap((p) =>
      listed(p, networkFindings(readSrc(p))),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the Upload_Model and the Pin_Levels_View read no clock and no random source (Requirements 18.1, 18.2)", () => {
    const found = DETERMINISM_PATHS.filter((p) => existsSync(join(ROOT, p))).flatMap((p) =>
      listed(p, scan(readSrc(p), DETERMINISM)),
    );
    expect(found, found.join("\n")).toEqual([]);
  });

  it("files are read with .text() and never fetched (Requirement 17.6)", () => {
    const p = "src/ui/app/views/file-io.ts";
    expect(existsSync(join(ROOT, p)), `${p} is missing`).toBe(true);
    const t = readSrc(p);
    expect(t).toMatch(/\.text\(\)|FileReader/);
    expect(scan(t, [NETWORK[0] as RegExp])).toEqual([]);
  });

  it("the views hold exactly two file inputs, for .hex and .json, in program-section.ts (Requirement 15.6)", () => {
    const views = UPLOAD_CODE_PATHS.filter((p) => p.includes("/views/") && existsSync(join(ROOT, p)));
    const where = views.flatMap((p) => scan(readSrc(p), [/type:\s*"file"/g]).map(() => p));
    expect(where).toEqual(["src/ui/app/views/program-section.ts", "src/ui/app/views/program-section.ts"]);
    const t = readSrc("src/ui/app/views/program-section.ts");
    expect(t).toContain('accept: ".hex"');
    expect(t).toContain('accept: ".json"');
  });
});