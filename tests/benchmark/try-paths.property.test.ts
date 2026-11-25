import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LoopConfig } from "../../cli/input-loader";
// @ts-ignore plain .mjs helper with no type declarations
import { buildCliArgs, resolveConfigPaths } from "../../exorcism-demo/try.mjs";

// Feature: benchmark-tools, Property 3: Check_Config path resolution is independent of the invocation directory
// Validates: Requirements 1.8
// Evidence over generated inputs, not a proof.

const RUNS = { numRuns: 100 };

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

const root = path.parse(process.cwd()).root;
const repoDirArb = fc.array(segment, { minLength: 1, maxLength: 3 }).map((s) => path.resolve(root, ...s));

// vitest workers refuse process.chdir(), so the working folder is varied by spawning Node children instead.
const startCwd = process.cwd();

type Paths = { hex: string; pins: string; rules: string };

describe("Feature: benchmark-tools, Property 3: Check_Config path resolution is independent of the invocation directory", () => {
  it("the same paths come out of a child Node process started in a different folder", () => {
    const tryUrl = pathToFileURL(path.resolve(startCwd, "exorcism-demo", "try.mjs")).href;
    const scratch = mkdtempSync(path.join(os.tmpdir(), "hexorcist-paths-"));
    const script =
      `import(${JSON.stringify(tryUrl)}).then((m) => {` +
      `const [cfg, repoDir] = JSON.parse(process.argv[1]);` +
      `process.stdout.write(JSON.stringify(m.resolveConfigPaths(cfg, repoDir)));});`;
    try {
      fc.assert(
        fc.property(configArb, repoDirArb, fc.constantFrom(scratch, startCwd, path.join(startCwd, "tests"), os.tmpdir()), (cfg, repoDir, childCwd) => {
          const ran = spawnSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify([cfg, repoDir])], {
            cwd: childCwd,
            encoding: "utf8",
          });
          expect(ran.status).toBe(0);
          const fromChild: Paths = JSON.parse(ran.stdout);
          expect(fromChild).toEqual(resolveConfigPaths(cfg, repoDir));
        }),
        { numRuns: 100 },
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 120_000);

  it("the paths move with repoDir", () => {
    fc.assert(
      fc.property(configArb, repoDirArb, repoDirArb, (cfg, repoA, repoB) => {
        const a: Paths = resolveConfigPaths(cfg, repoA);
        const b: Paths = resolveConfigPaths(cfg, repoB);
        for (const key of ["hex", "pins", "rules"] as const) {
          expect(path.relative(repoA, a[key])).toBe(path.relative(repoB, b[key]));
          expect(path.relative(repoA, a[key])).toBe(path.normalize(cfg[key]));
          expect(path.isAbsolute(a[key]) && path.isAbsolute(b[key])).toBe(true);
        }
        if (path.relative(repoA, repoB) !== "") {
          expect(b).not.toEqual(a);
        }
      }),
      RUNS,
    );
  });
});
