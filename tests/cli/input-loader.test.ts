import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isEntryPoint } from "../../cli/entry";
import {
  EXAMPLE_IDS,
  configToArgs,
  invocationDirOf,
  loadInput,
  parseLoopConfig,
  resolveRepoPath,
  resolveUserPath,
  splitGremlins,
} from "../../cli/input-loader";
import type { CheckArgs, LoaderEnv } from "../../cli/input-loader";
import { GREMLIN_CATALOGUE } from "../../src/engine/gremlins/catalogue";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const realEnv = (invocationDir = repoDir): LoaderEnv => ({
  readText: (p) => fs.readFileSync(p, "utf8"),
  invocationDir,
  repoDir,
});
/** An env that records every read, so "no file read" can be checked. */
const spyEnv = (): { env: LoaderEnv; reads: string[] } => {
  const reads: string[] = [];
  return {
    reads,
    env: {
      readText: (p) => {
        reads.push(p);
        throw new Error("no such file");
      },
      invocationDir: repoDir,
      repoDir,
    },
  };
};

const runs = { numRuns: 100 };
const ids = GREMLIN_CATALOGUE.map((g) => g.id as string);

describe("loadInput examples", () => {
  it("loads each bundled example, buggy and fixed, with meta defaults", () => {
    for (const id of EXAMPLE_IDS) {
      for (const fixed of [false, true]) {
        const r = loadInput({ example: id, fixed }, realEnv());
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        const meta = JSON.parse(fs.readFileSync(path.join(repoDir, "examples", id, "meta.json"), "utf8"));
        expect(r.input.runs).toBe(meta.runs);
        expect(r.input.campaignSeed).toBe(meta.campaignSeed);
        expect(r.input.runCycles).toBe(meta.runCycles);
        expect(r.input.hex).not.toContain("\r");
        expect(r.input.ruleSentences.length).toBe(r.input.ruleSet.length);
      }
    }
  });

  it("applies given values and orders gremlins by catalogue", () => {
    const r = loadInput({ example: "crosswalk", gremlins: "bouncer,masher", runs: 5, seed: 7, runMs: 100 }, realEnv());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.gremlinSet.map((g) => g.id)).toEqual(["masher", "bouncer"]);
    expect([r.input.runs, r.input.campaignSeed, r.input.runCycles]).toEqual([5, 7, 1_600_000]);
  });

  it("loads an upload set with page defaults", () => {
    const d = path.join(repoDir, "examples", "crosswalk");
    const r = loadInput(
      { hex: "buggy/buggy.hex", pins: "fixture.json", rules: "rules.txt" },
      realEnv(d),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.input.runs, r.input.campaignSeed, r.input.runCycles]).toEqual([24, 20261100, 16_000_000]);
    expect(r.input.gremlinSet).toEqual([{ id: "masher" }]);
  });

  it("reports an unreadable file as a one-line reason", () => {
    const r = loadInput({ hex: "nope.hex", pins: "nope.json", rules: "nope.txt" }, realEnv());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toMatch(/[\r\n]/);
  });
});

// Feature: headless-runner, Property 4: Bad input starts no run
describe("Property 4: Bad input starts no run", () => {
  const bad = (args: CheckArgs) => {
    const { env, reads } = spyEnv();
    const r = loadInput(args, env);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toMatch(/[\r\n]/);
    expect(reads).toEqual([]);
  };

  it("unknown gremlin id fails before any read", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }).filter((s) => !ids.includes(s.trim()) && !s.includes(",")),
        fc.constantFrom(...EXAMPLE_IDS),
        (g, example) => bad({ example, gremlins: `masher,${g}` }),
      ),
      runs,
    );
  });

  it("--example mixed with --hex, --pins or --rules fails", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXAMPLE_IDS),
        fc.subarray(["hex", "pins", "rules"] as const, { minLength: 1 }),
        (example, keys) => {
          const args: CheckArgs = { example };
          for (const k of keys) args[k] = "x";
          bad(args);
        },
      ),
      runs,
    );
  });

  it("--fixed without --example, and partial or empty sets, fail", () => {
    bad({ fixed: true, hex: "a", pins: "b", rules: "c" });
    bad({});
    bad({ example: "nope" });
    fc.assert(
      fc.property(fc.subarray(["hex", "pins", "rules"] as const, { maxLength: 2 }), (keys) => {
        const args: CheckArgs = {};
        for (const k of keys) args[k] = "x";
        bad(args);
      }),
      runs,
    );
  });

  it("non-integer or out-of-range numbers fail", () => {
    const nums = fc.oneof(
      fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(NaN, Infinity, -1, 0),
    );
    fc.assert(
      fc.property(nums, fc.constantFrom("runs", "seed", "runMs") as fc.Arbitrary<"runs" | "seed" | "runMs">, (n, key) => {
        // seed 0 is valid, so skip that single case
        fc.pre(!(key === "seed" && n === 0));
        bad({ example: "crosswalk", [key]: n });
      }),
      runs,
    );
  });
});

// Feature: headless-runner, Property 6: Paths resolve against the right folder
describe("Property 6: Paths resolve against the right folder", () => {
  const dirs = fc.constantFrom(path.resolve("a"), path.resolve("b", "c"), path.resolve("/"));
  const rel = fc.array(fc.stringMatching(/^[a-z0-9]{1,6}$/), { minLength: 1, maxLength: 3 }).map((p) => p.join("/"));

  it("user paths follow the invocation folder, repo paths do not", () => {
    fc.assert(
      fc.property(dirs, dirs, rel, (inv1, inv2, p) => {
        const e1 = { invocationDir: inv1, repoDir };
        const e2 = { invocationDir: inv2, repoDir };
        expect(resolveUserPath(e1, p)).toBe(path.resolve(inv1, p));
        expect(resolveRepoPath(e1, p)).toBe(resolveRepoPath(e2, p));
        expect(resolveUserPath(e1, path.resolve(inv2, p))).toBe(path.resolve(inv2, p));
      }),
      runs,
    );
  });

  it("bundled examples load the same whatever the invocation folder", () => {
    const a = loadInput({ example: "heartbeat" }, realEnv(path.resolve(repoDir, "src")));
    const b = loadInput({ example: "heartbeat" }, realEnv(path.resolve(repoDir, "docs")));
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it("invocationDirOf prefers a non-empty INIT_CWD", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), fc.string({ minLength: 1 }), (init, cwd) => {
        const got = invocationDirOf({ INIT_CWD: init }, cwd);
        expect(got).toBe(init !== undefined && init !== "" ? init : cwd);
      }),
      runs,
    );
  });
});

// Feature: headless-runner, Property 7: Entry-point check ignores case and separators
describe("Property 7: Entry-point check ignores case and separators", () => {
  const moduleFile = path.join(repoDir, "cli", "entry.ts");
  const url = new URL(`file:///${moduleFile.replace(/\\/g, "/")}`).href;
  const mixCase = (s: string, flips: boolean[]) =>
    [...s].map((c, i) => (flips[i % flips.length] ? c.toUpperCase() : c.toLowerCase())).join("");

  it("true for case and separator variants", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), fc.boolean(), (flips, back) => {
        let v = mixCase(moduleFile, flips);
        v = back ? v.replace(/[\\/]/g, "\\") : v.replace(/[\\/]/g, "/");
        // On POSIX a backslash is not a separator for path.resolve, so only test it where it is.
        if (back && path.sep !== "\\") return;
        expect(isEntryPoint(url, v)).toBe(true);
      }),
      runs,
    );
  });

  it("false for any other difference", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9]{1,5}$/), (extra) => {
        expect(isEntryPoint(url, moduleFile + extra)).toBe(false);
        expect(isEntryPoint(url, path.join(repoDir, "cli", extra + "x.ts"))).toBe(false);
      }),
      runs,
    );
    expect(isEntryPoint(url, undefined)).toBe(false);
  });
});

// Feature: headless-runner, Property 13: Loop_Config parsing and gremlin lists
describe("Property 13: Loop_Config parsing and gremlin lists", () => {
  const configArb = fc.record({
    source: fc.string(),
    build: fc.array(fc.string(), { minLength: 1, maxLength: 4 }),
    hex: fc.string(),
    pins: fc.string(),
    rules: fc.string(),
    gremlins: fc.subarray(ids, { minLength: 1 }).map((a) => a.join(",")),
    runs: fc.integer({ min: 1, max: 1000 }),
    seed: fc.integer({ min: 0, max: 4294967295 }),
    runMs: fc.integer({ min: 1, max: 60000 }),
  });
  const keys = ["source", "build", "hex", "pins", "rules", "gremlins", "runs", "seed", "runMs"] as const;

  it("valid config parses to the same values", () => {
    fc.assert(
      fc.property(configArb, (c) => {
        const r = parseLoopConfig(JSON.stringify(c));
        expect(r).toEqual({ ok: true, config: c });
      }),
      runs,
    );
  });

  it("a removed or mistyped key fails with a reason naming it", () => {
    fc.assert(
      fc.property(configArb, fc.constantFrom(...keys), fc.boolean(), (c, key, remove) => {
        const o: Record<string, unknown> = { ...c };
        if (remove) delete o[key];
        else o[key] = { wrong: true };
        const r = parseLoopConfig(JSON.stringify(o));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toContain(`"${key}"`);
      }),
      runs,
    );
  });

  it("the committed-style config and --gremlins give the same set", () => {
    fc.assert(
      fc.property(fc.subarray(ids, { minLength: 1 }), (list) => {
        const text = list.join(",");
        const cfg = {
          source: "s", build: ["node"], hex: "examples/crosswalk/buggy/buggy.hex", pins: "examples/crosswalk/fixture.json",
          rules: "examples/crosswalk/rules.txt", gremlins: text, runs: 3, seed: 1, runMs: 10,
        };
        const parsed = parseLoopConfig(JSON.stringify(cfg));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const viaConfig = loadInput(configToArgs(parsed.config, repoDir), realEnv(path.resolve(repoDir, "src")));
        const viaFlag = loadInput(
          { hex: cfg.hex, pins: cfg.pins, rules: cfg.rules, gremlins: text, runs: 3, seed: 1, runMs: 10 },
          realEnv(),
        );
        expect(viaConfig).toEqual(viaFlag);
        expect(splitGremlins(text)).toEqual(list);
      }),
      runs,
    );
  });
});
