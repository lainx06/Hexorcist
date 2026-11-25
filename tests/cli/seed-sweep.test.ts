import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/seed-sweep.mjs");
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

describe("seed-sweep argument parsing", () => {
  it.each([
    [["--seeds", "abc"]],
    [["--seeds", "5"]],
    [["--seeds", "10-2"]],
    [["--seeds"]],
    [["--jobs", "0"]],
    [["--jobs", "x"]],
    [["--jobs", "-2"]],
    [["--bogus"]],
    [["--out"]],
  ])("exits 3 for %j", (args) => {
    const r = run(...args);
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("seed-sweep:");
  });
});
