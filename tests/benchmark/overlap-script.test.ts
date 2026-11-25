// Example tests for the Overlap_Script (exorcism-demo/measure-overlap.ts).
// Requirements 4.6, 4.8, 4.9, 4.10, 4.11. Evidence, not proof of correctness.
// Small known inputs: the blink_button HEX and a BUTTON/LED fixture, the same pair src/engine tests use.
// main() is driven in-process with an in-memory readText, so no temp files are written.
// One test spawns the real script to check the exit code of a failure.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main, measure, parseArgs, type MeasureEnv } from "../../exorcism-demo/measure-overlap";
import { buildEventList } from "../../src/engine/event-list";
import { measureEventList, longestOverlap } from "../../exorcism-demo/measure-overlap";
import type { Fixture } from "../../src/engine/types";
import { loadInput } from "../../cli/input-loader";
import { DEFAULT_MAX_STEP_CYCLES, runEventList } from "../../src/engine/campaign";
import { isEngineError } from "../../src/engine/errors";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { runReductionJob } from "../../src/ui/app/worker/host";

const REPO = path.resolve(__dirname, "../..");
const HEX_FILE = path.join(REPO, "fixtures/blink_button/build/blink_button.ino.hex");
const HEX = fs.readFileSync(HEX_FILE, "utf8").replace(/\r/g, "");

// BUTTON and LED as in src/engine/__tests__/campaign.test.ts, plus an output the sketch never drives.
const FIXTURE: Fixture = {
  pins: [
    { signal: "BUTTON", port: "D", bit: 2, direction: "input" },
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "QUIET", port: "B", bit: 4, direction: "output" },
  ],
};

const FILES: Record<string, string> = {
  "/w/blink.hex": HEX,
  "/w/pins.json": JSON.stringify(FIXTURE),
};

const env: MeasureEnv = {
  invocationDir: "/w",
  readText: (p) => {
    const key = p.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
    const hit = FILES[key];
    if (hit === undefined) throw new Error("ENOENT");
    return hit;
  },
};

function run(argv: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = main(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t), env });
  return { code, out, err };
}

const base = (a: string, b: string): string[] => ["blink.hex", "pins.json", a, b];
const CYCLES = 3_200_000; // 200 ms: the LED first turns on after about 100 ms
const LINE = /^(\d+) cycles \((\d+\.\d\d) us\)/;

describe("failure cases print one line and exit non-zero (4.6)", () => {
  it("a signal missing from the pin file", () => {
    const r = run([...base("LED", "NOPE"), "--cycles", "1000"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toBe("");
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
    expect(r.err).toContain('"NOPE"');
    expect(r.err).not.toMatch(LINE);
  });

  it("a signal that is an input, not an output", () => {
    const r = run([...base("BUTTON", "LED"), "--cycles", "1000"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toBe("");
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
    expect(r.err).toContain('"BUTTON"');
    expect(r.err).toContain("not an output");
  });

  it("an unreadable HEX file, in process", () => {
    const r = run(["missing.hex", "pins.json", "LED", "QUIET", "--cycles", "1000"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toBe("");
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
    expect(r.err).toContain("missing.hex");
  });

  it("an unreadable HEX file, real script process: one stderr line, nothing on stdout, exit non-zero", () => {
    const tsx = path.join(REPO, "node_modules/tsx/dist/cli.mjs");
    const res = spawnSync(
      process.execPath,
      [
        tsx,
        "--no-deprecation",
        path.join(REPO, "exorcism-demo/measure-overlap.ts"),
        path.join(REPO, "no-such-file.hex"),
        path.join(REPO, "examples/crosswalk/fixture.json"),
        "WALK",
        "DONT_WALK",
        "--cycles",
        "1000",
      ],
      { cwd: REPO, encoding: "utf8" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(res.stderr).toContain("no-such-file.hex");
  }, 60_000);
});

describe("--cycles and --run-ms", () => {
  it("--run-ms N means N times 16000 cycles", () => {
    const p = parseArgs([...base("LED", "LED"), "--run-ms", "10"]);
    expect(p.ok && p.args.cycles).toBe(160_000);
  });

  it("--cycles is taken as given", () => {
    const p = parseArgs([...base("LED", "LED"), "--cycles", "12345"]);
    expect(p.ok && p.args.cycles).toBe(12_345);
  });

  it("--run-ms 5 and --cycles 80000 print the same line", () => {
    const a = run([...base("LED", "LED"), "--run-ms", "5"]);
    const b = run([...base("LED", "LED"), "--cycles", "80000"]);
    expect(a.code).toBe(0);
    expect(a.out).toMatch(LINE);
    expect(a.out).toBe(b.out);
  });

  it("giving both, neither, or a bad number is refused with one line", () => {
    for (const extra of [
      ["--cycles", "10", "--run-ms", "1"],
      [],
      ["--cycles", "0"],
      ["--run-ms", "abc"],
    ]) {
      const r = run([...base("LED", "LED"), ...extra]);
      expect(r.code).not.toBe(0);
      expect(r.out).toBe("");
      expect(r.err.trimEnd().split("\n")).toHaveLength(1);
    }
  });
});

describe("try-replay wiring (4.8)", () => {
  const sel = ["--gremlins", "masher", "--seed", "7", "--try", "3"];

  it("replays the generated list for that try and names the try", () => {
    const r = run([...base("LED", "LED"), "--cycles", String(CYCLES), ...sel]);
    expect(r.code).toBe(0);
    expect(r.out.endsWith(" on try 3\n")).toBe(true);

    const gen = buildEventList({
      fixture: FIXTURE,
      gremlinSet: [{ id: "masher" }],
      runCycles: CYCLES,
      campaignSeed: 7,
      runIndex: 2,
    });
    if ("message" in gen) throw new Error(gen.message);
    const direct = measureEventList({ hex: HEX, fixture: FIXTURE }, gen.events, "LED", "LED", CYCLES, 2);
    if (!direct.ok) throw new Error(direct.reason);
    expect(r.out.startsWith(`${direct.result.cycles} cycles (${direct.result.microseconds} us)`)).toBe(true);
  });

  it("prints identical output for identical inputs", () => {
    const a = run([...base("LED", "LED"), "--cycles", String(CYCLES), ...sel]);
    const b = run([...base("LED", "LED"), "--cycles", String(CYCLES), ...sel]);
    expect(a.out).toBe(b.out);
  });

  it("an unknown gremlin is one error line and non-zero", () => {
    const r = run([...base("LED", "LED"), "--cycles", "1000", "--gremlins", "nope", "--seed", "1", "--try", "1"]);
    expect(r.code).not.toBe(0);
    expect(r.out).toBe("");
    expect(r.err.trimEnd().split("\n")).toHaveLength(1);
  });

  it("--reduced without --rules is refused", () => {
    const p = parseArgs([...base("LED", "LED"), "--cycles", "1000", ...sel, "--reduced"]);
    expect(p.ok).toBe(false);
  });
});

describe("campaign wiring (4.10, 4.11)", () => {
  const RUNS = 3;
  const camp = ["--campaign", "masher", "--seed", "7", "--runs", String(RUNS)];

  it("reports the largest per-try overlap and its try number", () => {
    const r = run([...base("LED", "LED"), "--cycles", String(CYCLES), ...camp]);
    expect(r.code).toBe(0);
    const m = /^(\d+) cycles \((\d+\.\d\d) us\) at try (\d+) of 3\n$/.exec(r.out);
    expect(m).not.toBeNull();
    const [, cycles, , tryNo] = m!;

    const per: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const gen = buildEventList({
        fixture: FIXTURE,
        gremlinSet: [{ id: "masher" }],
        runCycles: CYCLES,
        campaignSeed: 7,
        runIndex: i,
      });
      if ("message" in gen) throw new Error(gen.message);
      const o = measureEventList({ hex: HEX, fixture: FIXTURE }, gen.events, "LED", "LED", CYCLES, i);
      if (!o.ok) throw new Error(o.reason);
      per.push(o.result.cycles);
    }
    expect(Number(cycles)).toBe(Math.max(...per));
    expect(per[Number(tryNo) - 1]).toBe(Number(cycles));
    expect(per.indexOf(Number(cycles))).toBe(Number(tryNo) - 1); // earliest try with the maximum
  });

  it("two outputs that are never on together give 0 cycles, 0.00 us and the no-overlap wording", () => {
    const r = run([...base("LED", "QUIET"), "--cycles", String(CYCLES), ...camp]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("0 cycles (0.00 us), no overlap found in those tries (3 tries)\n");
  });

  it("measure() returns the same numbers as main() prints", () => {
    const p = parseArgs([...base("LED", "QUIET"), "--cycles", String(CYCLES), ...camp]);
    if (!p.ok) throw new Error(p.reason);
    const out = measure(p.args, env);
    expect(out.ok && out.result).toEqual({ cycles: 0, microseconds: "0.00" });
    expect(longestOverlap([], "LED", "QUIET", CYCLES)).toEqual({ cycles: 0, microseconds: "0.00" });
  });

  it("--campaign without --runs is refused", () => {
    const p = parseArgs([...base("LED", "LED"), "--cycles", "1000", "--campaign", "masher", "--seed", "7"]);
    expect(p.ok).toBe(false);
  });
});

describe("--reduced with --rules (4.9)", () => {
  it("prints one line for the reduced list of try 4, matching the direct pipeline", () => {
    const CROSSWALK = path.join(REPO, "examples/crosswalk");
    const hexPath = path.join(CROSSWALK, "buggy/buggy.hex");
    const pinsPath = path.join(CROSSWALK, "fixture.json");
    const rulesPath = path.join(CROSSWALK, "rules.txt");
    const cycles = 16_000_000;
    const seed = 20261101;
    const tryNumber = 4;

    // Direct pipeline, same steps as measure() uses for --reduced.
    const loadedInput = loadInput(
      { hex: hexPath, pins: pinsPath, rules: rulesPath, gremlins: "masher", seed },
      { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: REPO, repoDir: REPO },
    );
    if (!loadedInput.ok) throw new Error(loadedInput.reason);
    const input = loadedInput.input;
    const gen = buildEventList({
      fixture: input.fixture,
      gremlinSet: [{ id: "masher" }],
      runCycles: cycles,
      campaignSeed: seed,
      runIndex: tryNumber - 1,
    });
    if (isEngineError(gen)) throw new Error(gen.message);
    const compiled = compileRuleSet(input.ruleSet, input.fixture);
    if (!compiled.ok) throw new Error("rules did not compile");
    const ran = runEventList(
      {
        hex: input.hex,
        fixture: input.fixture,
        checker: compiled.compiled.checker,
        runCycles: cycles,
        maxStepCycles: DEFAULT_MAX_STEP_CYCLES,
      },
      gen.events,
      tryNumber - 1,
    );
    if (isEngineError(ran)) throw new Error(ran.message);
    if (ran.violation === null) throw new Error("try 4 broke no rule");
    const reduction = runReductionJob({
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      originalList: gen.events,
      violation: ran.violation,
      runCycles: cycles,
    });
    if (!reduction.ok) throw new Error(reduction.error.message);
    const { originalEventCount: n, reducedEventCount: m, reducedList } = reduction.result;
    const direct = measureEventList(
      { hex: input.hex, fixture: input.fixture },
      reducedList,
      "CAR_GREEN",
      "WALK",
      cycles,
      tryNumber - 1,
    );
    if (!direct.ok) throw new Error(direct.reason);
    const expected =
      `${direct.result.cycles} cycles (${(direct.result.cycles / 16).toFixed(2)} us)` +
      ` on the smallest replay this reducer found for try 4 (${n} moves down to ${m})`;

    const tsx = path.join(REPO, "node_modules/tsx/dist/cli.mjs");
    const res = spawnSync(
      process.execPath,
      [
        tsx,
        "--no-deprecation",
        path.join(REPO, "exorcism-demo/measure-overlap.ts"),
        "examples/crosswalk/buggy/buggy.hex",
        "examples/crosswalk/fixture.json",
        "CAR_GREEN",
        "WALK",
        "--cycles",
        "16000000",
        "--gremlins",
        "masher",
        "--seed",
        "20261101",
        "--try",
        "4",
        "--reduced",
        "--rules",
        "examples/crosswalk/rules.txt",
      ],
      { cwd: REPO, encoding: "utf8", env: { ...process.env, INIT_CWD: REPO } },
    );
    expect(res.status).toBe(0);
    const lines = res.stdout.split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(1);
    expect(res.stdout.endsWith("\n")).toBe(true);
    expect(lines[0]).toMatch(
      new RegExp(` on the smallest replay this reducer found for try 4 \\(${n} moves down to ${m}\\)$`),
    );
    expect(lines[0]).toBe(expected);
  }, 240_000);
});
