import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const current = JSON.parse(fs.readFileSync(path.join(repoDir, "package.json"), "utf8"));

const EXPECTED_SCRIPTS = {
  dev: "vite",
  build: "vite build",
  preview: "vite preview",
  test: "vitest",
  "verify:avr8js": "npx tsx scripts/verify-avr8js.ts",
  bench: "npx tsx bench/benchmark.ts",
  guard: "node scripts/guard.mjs",
  typecheck: "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
  "bench:campaign": "tsx bench/campaign-bench.ts",
  "bench:examples": "tsx bench/example-campaign-bench.ts",
  "bench:evidence": "tsx bench/evidence.ts",
  "examples:build": "node scripts/build-examples.mjs",
};

const EXPECTED_DEPENDENCIES = {
  avr8js: "0.21.1",
};

const EXPECTED_DEV_DEPENDENCIES = {
  "@types/node": "20.17.57",
  "fast-check": "4.10.2",
  tsx: "4.19.3",
  typescript: "^5.3.3",
  vite: "5.4.21",
  vitest: "1.6.0",
};

describe("package.json scripts", () => {
  it("has the exact dependency and devDependency snapshots", () => {
    expect(current.dependencies).toEqual(EXPECTED_DEPENDENCIES);
    expect(current.devDependencies).toEqual(EXPECTED_DEV_DEPENDENCIES);
  });

  it("has check and mcp scripts with --no-deprecation, and all other scripts as listed", () => {
    expect(current.scripts.check).toBe("tsx --no-deprecation cli/bin.ts");
    expect(current.scripts.mcp).toBe("tsx --no-deprecation mcp/bin.ts");
    const { check: _check, mcp: _mcp, ...others } = current.scripts;
    expect(others).toEqual(EXPECTED_SCRIPTS);
  });

  it("npm run check on heartbeat fixed prints no DeprecationWarning (this machine's Node and tsx only)", () => {
    const r = spawnSync("npm run check -- --example heartbeat --fixed", {
      cwd: repoDir,
      encoding: "utf8",
      shell: true,
      timeout: 100_000,
    });
    expect(r.stdout + r.stderr).not.toMatch(/DeprecationWarning/);
    expect(r.status).toBe(0);
  }, 110_000);
});
