import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseLoopConfig } from "../../cli/input-loader";
import { readRulesFile } from "../../src/engine/rules/rules-file";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demoDir = path.join(repoDir, "exorcism-demo");

const EXPECTED_RULES = [
  "all of (CAR_GREEN is 1, WALK is 1) must never happen.",
  "all of (WALK is 1, DONT_WALK is 1) must never happen.",
  "all of (CAR_GREEN is 1, CAR_YELLOW is 1) must never happen.",
  "all of (CAR_GREEN is 1, CAR_RED is 1) must never happen.",
  "all of (CAR_YELLOW is 1, CAR_RED is 1) must never happen.",
  "CAR_YELLOW is 1 must never last 200 ms or longer.",
  "WALK is 1 must never last 250 ms or longer.",
];

describe("demo rules file (13.4)", () => {
  const bytes = fs.readFileSync(path.join(demoDir, "crosswalk-full-rules.txt"));

  it("holds exactly the seven LF-terminated lines", () => {
    expect(bytes.toString("utf8")).toBe(EXPECTED_RULES.join("\n") + "\n");
    expect(bytes.includes(13)).toBe(false);
  });

  it("reads with readRulesFile into seven rules", () => {
    const r = readRulesFile(bytes.toString("utf8"));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ruleSet.length).toBe(7);
  });
});

describe("demo loop config (13.5)", () => {
  const text = fs.readFileSync(path.join(demoDir, "loop-check.json"), "utf8");
  const expected = {
    source: "exorcism-demo/sketch/sketch.ino",
    build: ["node", "exorcism-demo/build.mjs"],
    hex: "exorcism-demo/build/sketch.hex",
    pins: "examples/crosswalk/fixture.json",
    rules: "exorcism-demo/crosswalk-full-rules.txt",
    gremlins: "masher,bouncer",
    runs: 24,
    seed: 20261101,
    runMs: 1000,
  };

  it("has exactly the required values", () => {
    expect(JSON.parse(text)).toEqual(expected);
  });

  it("passes parseLoopConfig with the same values", () => {
    const r = parseLoopConfig(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toEqual(expected);
  });
});

describe(".gitignore (7.17)", () => {
  it("lists .hexorcist/ and exorcism-demo/build/", () => {
    const lines = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf8").split(/\r?\n/);
    expect(lines).toContain(".hexorcist/");
    expect(lines).toContain("exorcism-demo/build/");
  });
});

// build.mjs with a stand-in compiler. The stand-in is a copy of the running Node binary named
// arduino-cli; NODE_OPTIONS preloads a script that plays the compiler and exits before Node reads its arguments.
describe("exorcism-demo/build.mjs exit codes (13.1 to 13.3)", () => {
  let tmp: string;
  let binDir: string;
  const stubJs = () => path.join(tmp, "stub.cjs");

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-build-test-"));
    binDir = path.join(tmp, "bin");
    fs.mkdirSync(binDir);
    const exe = path.join(binDir, process.platform === "win32" ? "arduino-cli.exe" : "arduino-cli");
    if (process.platform === "win32") fs.copyFileSync(process.execPath, exe);
    else fs.symlinkSync(process.execPath, exe);
    fs.writeFileSync(
      stubJs(),
      [
        'const fs = require("fs"), path = require("path");',
        "const a = process.argv.slice(1);",
        'if (path.basename(a[0] || "") !== "compile") return;',
        'if (process.env.STUB_MODE === "fail") { process.stderr.write("stub compiler: syntax error\\n"); process.exit(1); }',
        'const out = a[a.indexOf("--output-dir") + 1];',
        'if (process.env.STUB_MODE !== "nohex") fs.writeFileSync(path.join(out, "sketch.ino.hex"), ":00000001FF\\n");',
        "process.exit(0);",
      ].join("\n"),
    );
  });

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const run = (script: string, mode: string) =>
    spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: binDir + path.delimiter + (process.env.PATH ?? ""),
        NODE_OPTIONS: `--require ${JSON.stringify(stubJs().split(path.sep).join("/"))}`,
        STUB_MODE: mode,
      },
    });

  // A copy of build.mjs in a temp "exorcism-demo" so the real build/ folder is never touched.
  const sandbox = (withSketch: boolean): string => {
    const d = fs.mkdtempSync(path.join(tmp, "demo-"));
    fs.copyFileSync(path.join(demoDir, "build.mjs"), path.join(d, "build.mjs"));
    if (withSketch) {
      fs.mkdirSync(path.join(d, "sketch"));
      fs.writeFileSync(path.join(d, "sketch", "sketch.ino"), "void setup(){}\nvoid loop(){}\n");
    }
    return path.join(d, "build.mjs");
  };

  it("prints one line, exits 0 and writes build/sketch.hex when the compile succeeds", () => {
    const script = sandbox(true);
    const r = run(script, "ok");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trimEnd().split("\n").length).toBe(1);
    expect(fs.readFileSync(path.join(path.dirname(script), "build", "sketch.hex"), "utf8")).toBe(":00000001FF\n");
  });

  it("prints the compiler output and exits 1 when the compile fails", () => {
    const r = run(sandbox(true), "fail");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("stub compiler: syntax error");
  });

  it("exits 1 when the compile passes but no HEX appears", () => {
    expect(run(sandbox(true), "nohex").status).toBe(1);
  });

  it("exits 1 with a message when the sketch file is missing", () => {
    const r = run(sandbox(false), "ok");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("sketch.ino");
  });
});
