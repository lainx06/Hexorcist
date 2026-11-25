import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LoopConfig } from "../../cli/input-loader";
// @ts-ignore plain .mjs helper with no type declarations
import { buildCliArgs, resolveConfigPaths } from "../../exorcism-demo/try.mjs";

// Feature: benchmark-tools, Property 2: Check_Config values and gremlins string reach the CLI argv unchanged
// Validates: Requirements 1.3, 10.2
// Evidence over generated inputs, not a proof.

const RUNS = { numRuns: 200 };

const segment = fc.stringMatching(/^[a-z0-9_-]{1,8}$/);
const relPath = fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => s.join("/"));

const configArb: fc.Arbitrary<LoopConfig> = fc.record({
  source: fc.string(),
  build: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
  hex: relPath,
  pins: relPath,
  rules: relPath,
  gremlins: fc.string(),
  runs: fc.integer(),
  seed: fc.integer(),
  runMs: fc.integer(),
});

const repoDirArb = fc
  .array(segment, { minLength: 1, maxLength: 3 })
  .map((s) => path.resolve(path.parse(process.cwd()).root, ...s));

/** The single value that follows `flag`, failing if the flag is missing or repeated. */
function valueOf(args: string[], flag: string): string {
  const at = args.indexOf(flag);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(args.indexOf(flag, at + 1)).toBe(-1);
  return args[at + 1];
}

describe("Feature: benchmark-tools, Property 2: Check_Config values and gremlins string reach the CLI argv unchanged", () => {
  it("--gremlins, --runs, --seed, --run-ms carry the config values verbatim", () => {
    fc.assert(
      fc.property(configArb, repoDirArb, (cfg, repoDir) => {
        const args: string[] = buildCliArgs(cfg, repoDir);
        expect(valueOf(args, "--gremlins")).toBe(cfg.gremlins);
        expect(valueOf(args, "--runs")).toBe(String(cfg.runs));
        expect(valueOf(args, "--seed")).toBe(String(cfg.seed));
        expect(valueOf(args, "--run-ms")).toBe(String(cfg.runMs));
        expect(Number(valueOf(args, "--runs"))).toBe(cfg.runs);
        expect(Number(valueOf(args, "--seed"))).toBe(cfg.seed);
        expect(Number(valueOf(args, "--run-ms"))).toBe(cfg.runMs);
      }),
      RUNS,
    );
  });

  it("--hex, --pins, --rules carry the repo-resolved absolute paths", () => {
    fc.assert(
      fc.property(configArb, repoDirArb, (cfg, repoDir) => {
        const args: string[] = buildCliArgs(cfg, repoDir);
        const resolved = resolveConfigPaths(cfg, repoDir);
        expect(valueOf(args, "--hex")).toBe(resolved.hex);
        expect(valueOf(args, "--pins")).toBe(resolved.pins);
        expect(valueOf(args, "--rules")).toBe(resolved.rules);
        expect(valueOf(args, "--hex")).toBe(path.resolve(repoDir, cfg.hex));
        expect(valueOf(args, "--pins")).toBe(path.resolve(repoDir, cfg.pins));
        expect(valueOf(args, "--rules")).toBe(path.resolve(repoDir, cfg.rules));
        for (const f of ["--hex", "--pins", "--rules"]) expect(path.isAbsolute(valueOf(args, f))).toBe(true);
      }),
      RUNS,
    );
  });

  it("the argument list ends with --json and starts with the tsx entry under repoDir", () => {
    fc.assert(
      fc.property(configArb, repoDirArb, (cfg, repoDir) => {
        const args: string[] = buildCliArgs(cfg, repoDir);
        expect(args[0]).toBe(path.join(repoDir, "node_modules", "tsx", "dist", "cli.mjs"));
        expect(args[args.length - 1]).toBe("--json");
      }),
      RUNS,
    );
  });
});
