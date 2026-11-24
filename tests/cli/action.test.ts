import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSummary, parseRunJson, report } from "../../cli/action-report";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-action-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const run = (json: string | null, code: string, err?: string) => {
  const jsonPath = path.join(dir, "r.json");
  const errPath = path.join(dir, "r.err");
  const summaryPath = path.join(dir, "summary.md");
  const outputPath = path.join(dir, "out.txt");
  if (json !== null) fs.writeFileSync(jsonPath, json);
  if (err !== undefined) fs.writeFileSync(errPath, err);
  const rc = report({ jsonPath, code, errPath }, { summaryPath, outputPath });
  const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
  return { rc, summary: read(summaryPath), output: read(outputPath) };
};

describe("action-report", () => {
  it("writes verdict, exit code, seed and runs for BROKE", () => {
    const r = run(JSON.stringify({ verdict: "BROKE", seed: 7, runs: 24 }), "1");
    expect(r.rc).toBe(0);
    expect(r.summary).toContain("BROKE");
    expect(r.summary).toContain("Exit code: 1");
    expect(r.summary).toContain("Seed: 7");
    expect(r.summary).toContain("Runs: 24");
    expect(r.output).toBe("verdict=BROKE\nexit-code=1\n");
  });

  it("keeps the ASCII apostrophe for COULDN'T TELL", () => {
    const r = run(JSON.stringify({ verdict: "COULDN'T TELL", seed: 1, runs: 2 }), "2");
    expect(r.output).toBe("verdict=COULDN'T TELL\nexit-code=2\n");
  });

  it("writes HELD with code 0", () => {
    const r = run(JSON.stringify({ verdict: "HELD", seed: 1, runs: 3 }), "0");
    expect(r.output).toBe("verdict=HELD\nexit-code=0\n");
  });

  it("for code 3 gives the stderr reason and an empty verdict", () => {
    const r = run("", "3", "hexes: cannot read file\n");
    expect(r.summary).toContain("Reason: hexes: cannot read file");
    expect(r.output).toBe("verdict=\nexit-code=3\n");
  });

  it("reads an empty or invalid JSON file as no verdict", () => {
    expect(parseRunJson("")).toBeNull();
    expect(parseRunJson("{nope")).toBeNull();
    expect(parseRunJson('{"verdict":"MAYBE"}')).toBeNull();
    const r = run("", "1");
    expect(r.output).toBe("verdict=\nexit-code=1\n");
    expect(buildSummary(null, 1, "")).toContain("no reason was printed");
  });

  it("rejects a non-integer exit code", () => {
    expect(run("{}", "x").rc).toBe(3);
  });
});

describe("action.yml", () => {
  const text = fs.readFileSync(path.join(repoDir, "action.yml"), "utf8");
  const section = (name: string) => {
    const m = new RegExp(`^${name}:\\n((?:  .*\\n|\\n)*)`, "m").exec(text);
    return m ? m[1] : "";
  };
  const keys = (body: string) =>
    [...body.matchAll(/^ {2}([a-z-]+):\s*$/gm)].map((m) => m[1]);

  it("is the hexorcist-gate composite action", () => {
    expect(text).toMatch(/^name: hexorcist-gate$/m);
    expect(text).toMatch(/using: composite/);
  });

  it("has three required and three optional inputs", () => {
    const inputs = section("inputs");
    expect(keys(inputs)).toEqual(["hex", "pins", "rules", "gremlins", "runs", "seed"]);
    const required = (k: string) =>
      new RegExp(`^ {2}${k}:\\n(?: {4}.*\\n)*? {4}required: true`, "m").test(inputs);
    for (const k of ["hex", "pins", "rules"]) expect(required(k)).toBe(true);
    for (const k of ["gremlins", "runs", "seed"]) expect(required(k)).toBe(false);
  });

  it("has the two outputs", () => {
    expect(keys(section("outputs"))).toEqual(["verdict", "exit-code"]);
  });
});
