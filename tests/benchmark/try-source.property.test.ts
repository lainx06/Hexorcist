import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Feature: benchmark-tools, Property 5: The Try_Script never mutates its sketch source
// Validates: Requirements 1.10, 5.1
// Evidence over generated inputs, not a proof. The Try_Script runs from a temp fake repo with a stub
// build and a stub CLI, and the generated sketch lives in a temp folder, never in exorcism-demo/benchmark/.

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const realTry = path.join(repoDir, "exorcism-demo", "try.mjs");

let tmp: string;
let tryCopy: string;
let sketchFile: string;
let configFile: string;

const CONFIG = {
  source: "exorcism-demo/sketch/sketch.ino",
  build: ["node", "exorcism-demo/build.mjs"],
  hex: "exorcism-demo/build/sketch.hex",
  pins: "pins.json",
  rules: "rules.txt",
  gremlins: "masher",
  runs: 1,
  seed: 1,
  runMs: 10,
};

function runTry(buildExit: number) {
  return spawnSync(process.execPath, [tryCopy, sketchFile, configFile], {
    encoding: "utf8",
    cwd: tmp,
    env: { ...process.env, STUB_BUILD_EXIT: String(buildExit), STUB_CLI_EXIT: "0" },
  });
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-source-prop-"));
  const fakeRepo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(fakeRepo, "exorcism-demo", "sketch"), { recursive: true });
  fs.mkdirSync(path.join(fakeRepo, "node_modules", "tsx", "dist"), { recursive: true });
  tryCopy = path.join(fakeRepo, "exorcism-demo", "try.mjs");
  fs.copyFileSync(realTry, tryCopy);
  fs.writeFileSync(path.join(fakeRepo, "exorcism-demo", "sketch", "sketch.ino"), "// work sketch\n");
  fs.writeFileSync(
    path.join(fakeRepo, "exorcism-demo", "build.mjs"),
    'process.exitCode = Number(process.env.STUB_BUILD_EXIT ?? "0");\n',
  );
  fs.writeFileSync(
    path.join(fakeRepo, "node_modules", "tsx", "dist", "cli.mjs"),
    'process.exitCode = Number(process.env.STUB_CLI_EXIT ?? "0");\n',
  );
  const srcDir = path.join(tmp, "src");
  fs.mkdirSync(srcDir);
  sketchFile = path.join(srcDir, "user.ino");
  configFile = path.join(tmp, "config.json");
  fs.writeFileSync(configFile, JSON.stringify(CONFIG));
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("Feature: benchmark-tools, Property 5: The Try_Script never mutates its sketch source", () => {
  it("leaves the sketch bytes unchanged whether the build passes or fails", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), fc.boolean(), (bytes, buildPasses) => {
        fs.writeFileSync(sketchFile, bytes);
        const r = runTry(buildPasses ? 0 : 1);
        // Sanity: the Try_Script really ran and took the branch under test.
        if (r.status !== (buildPasses ? 0 : 3)) return false;
        const after = fs.readFileSync(sketchFile);
        return Buffer.compare(after, Buffer.from(bytes)) === 0;
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  it("leaves the sketch bytes unchanged for both build outcomes on the same content", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
        fs.writeFileSync(sketchFile, bytes);
        for (const code of [0, 1]) {
          runTry(code);
          if (Buffer.compare(fs.readFileSync(sketchFile), Buffer.from(bytes)) !== 0) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  }, 300_000);

  it("example: empty file stays empty", () => {
    fs.writeFileSync(sketchFile, new Uint8Array());
    runTry(0);
    expect(fs.readFileSync(sketchFile).length).toBe(0);
  });
});
