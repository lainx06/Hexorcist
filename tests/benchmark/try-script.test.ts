import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const realTry = path.join(repoDir, "exorcism-demo", "try.mjs");

// try.mjs finds its repo folder from its own location. The tests copy it into a temp "repo" that holds a
// stub build.mjs and a stub tsx entry, so the real exorcism-demo/sketch/ and build/ are never touched.
let tmp: string;
let fakeRepo: string;
let tryCopy: string;
let workSketch: string;

const VALID_CONFIG = {
  source: "exorcism-demo/sketch/sketch.ino",
  build: ["node", "exorcism-demo/build.mjs"],
  hex: "exorcism-demo/build/sketch.hex",
  pins: "pins.json",
  rules: "rules.txt",
  gremlins: "masher",
  runs: 3,
  seed: 7,
  runMs: 100,
};

/** Every file under dir with its bytes, so "no file changed" can be compared. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p).toString("base64");
    }
  };
  walk(dir);
  return out;
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [tryCopy, ...args], {
    encoding: "utf8",
    cwd: tmp,
    env: { ...process.env, ...env },
  });
}

const lines = (s: string) => s.split(/\r?\n/).filter((l) => l.length > 0);

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-try-test-"));
  fakeRepo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(fakeRepo, "exorcism-demo", "sketch"), { recursive: true });
  fs.mkdirSync(path.join(fakeRepo, "node_modules", "tsx", "dist"), { recursive: true });
  tryCopy = path.join(fakeRepo, "exorcism-demo", "try.mjs");
  workSketch = path.join(fakeRepo, "exorcism-demo", "sketch", "sketch.ino");
  fs.copyFileSync(realTry, tryCopy);
  fs.writeFileSync(workSketch, "// original work sketch\n");
  // Stub build: prints a line, exits with STUB_BUILD_EXIT (default 0).
  fs.writeFileSync(
    path.join(fakeRepo, "exorcism-demo", "build.mjs"),
    [
      'process.stdout.write("stub build output\\n");',
      'process.stderr.write("stub build error\\n");',
      'process.exitCode = Number(process.env.STUB_BUILD_EXIT ?? "0");',
    ].join("\n"),
  );
  // Stub tsx entry: prints its argument list as JSON plus a fixed line, exits with STUB_CLI_EXIT.
  fs.writeFileSync(
    path.join(fakeRepo, "node_modules", "tsx", "dist", "cli.mjs"),
    [
      'process.stdout.write("CLI-OUT " + JSON.stringify(process.argv.slice(2)) + "\\n");',
      'process.stderr.write("cli-err line\\n");',
      'process.exitCode = Number(process.env.STUB_CLI_EXIT ?? "0");',
    ].join("\n"),
  );
  fs.writeFileSync(path.join(tmp, "sketch.ino"), "void setup(){}\nvoid loop(){}\n");
  fs.writeFileSync(path.join(tmp, "good.json"), JSON.stringify(VALID_CONFIG));
  fs.writeFileSync(path.join(tmp, "bad.json"), "{ not json");
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("Try_Script input errors (1.6)", () => {
  const cases: Array<[string, () => string[]]> = [
    ["no arguments", () => []],
    ["one argument", () => [path.join(tmp, "sketch.ino")]],
    ["unreadable sketch", () => [path.join(tmp, "missing.ino"), path.join(tmp, "good.json")]],
    ["unreadable config", () => [path.join(tmp, "sketch.ino"), path.join(tmp, "missing.json")]],
    ["invalid JSON", () => [path.join(tmp, "sketch.ino"), path.join(tmp, "bad.json")]],
  ];

  for (const [name, args] of cases) {
    it(`${name}: one line on stderr, exit 3, no file changed`, () => {
      const before = snapshot(tmp);
      const r = run(args());
      expect(r.status).toBe(3);
      expect(r.stdout).toBe("");
      expect(lines(r.stderr).length).toBe(1);
      expect(snapshot(tmp)).toEqual(before);
    });
  }

  it("names the cause for invalid JSON", () => {
    const r = run([path.join(tmp, "sketch.ino"), path.join(tmp, "bad.json")]);
    expect(r.stderr).toContain("not valid JSON");
  });
});

describe("Try_Script build failure (1.5)", () => {
  it("prints the build output, no verdict string, exits 3", () => {
    const r = run([path.join(tmp, "sketch.ino"), path.join(tmp, "good.json")], { STUB_BUILD_EXIT: "1" });
    expect(r.status).toBe(3);
    expect(r.stdout).toContain("stub build output");
    expect(r.stderr).toContain("stub build error");
    const all = r.stdout + r.stderr;
    expect(all).not.toMatch(/BROKE|HELD|COULDN'T TELL|No violation found/);
    expect(all).not.toContain("CLI-OUT");
  });
});

describe("Try_Script CLI pass-through (1.4)", () => {
  for (const code of [0, 1, 2, 3]) {
    it(`prints the CLI stdout unchanged and exits ${code}`, () => {
      const r = run([path.join(tmp, "sketch.ino"), path.join(tmp, "good.json")], { STUB_CLI_EXIT: String(code) });
      expect(r.status).toBe(code);
      expect(r.stdout.startsWith("CLI-OUT [")).toBe(true);
      expect(r.stdout.endsWith("]\n")).toBe(true);
      expect(r.stdout).not.toContain("stub build output");
      expect(r.stderr).toContain("cli-err line");
    });
  }

  it("copies the sketch to the work sketch and passes the config values to the CLI", () => {
    const r = run([path.join(tmp, "sketch.ino"), path.join(tmp, "good.json")]);
    expect(fs.readFileSync(workSketch, "utf8")).toBe("void setup(){}\nvoid loop(){}\n");
    const args: string[] = JSON.parse(r.stdout.slice("CLI-OUT ".length));
    expect(args).toContain("cli/bin.ts");
    expect(args[args.indexOf("--gremlins") + 1]).toBe("masher");
    expect(args[args.indexOf("--runs") + 1]).toBe("3");
    expect(args[args.indexOf("--seed") + 1]).toBe("7");
    expect(args[args.indexOf("--run-ms") + 1]).toBe("100");
    expect(args[args.indexOf("--hex") + 1]).toBe(path.join(fakeRepo, "exorcism-demo", "build", "sketch.hex"));
  });
});

describe("Try_Script source text (1.7)", () => {
  const source = fs.readFileSync(realTry, "utf8");
  const code = source
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");

  it("has no shell: true", () => {
    expect(source).not.toMatch(/shell\s*:\s*true/);
  });

  it("starts no npm child process", () => {
    expect(code).not.toMatch(/\bnpm\b/);
    expect(code).not.toMatch(/\b(exec|execSync|execFile|execFileSync|fork)\s*\(/);
  });
});
