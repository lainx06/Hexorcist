import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const realTry = path.join(repoDir, "exorcism-demo", "try.mjs");

let tmp: string;
let tryCopy: string;
let marker: string;
let workSketch: string;

const VALID_CONFIG: Record<string, unknown> = {
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
const KEYS = Object.keys(VALID_CONFIG);

const stringKeys = ["source", "hex", "pins", "rules", "gremlins"];
const numberKeys = ["runs", "seed", "runMs"];

/** A value of the wrong type for each key. */
function wrongValueFor(key: string): fc.Arbitrary<unknown> {
  if (stringKeys.includes(key)) {
    return fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.string(), { maxLength: 2 }), fc.constant({}));
  }
  if (numberKeys.includes(key)) {
    return fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true, min: -1000, max: 1000 }).filter((d) => !Number.isInteger(d)),
      fc.array(fc.integer(), { maxLength: 2 }),
    );
  }
  // build: needs a non-empty array of strings
  return fc.oneof(
    fc.string(),
    fc.integer(),
    fc.constant(null),
    fc.constant([]),
    fc.array(fc.integer(), { minLength: 1, maxLength: 3 }),
    fc.constant({}),
  );
}

type Mutation = { key: string; kind: "remove" } | { key: string; kind: "wrong"; value: unknown };

const mutationArb: fc.Arbitrary<Mutation> = fc.constantFrom(...KEYS).chain((key) =>
  fc.oneof(
    fc.constant<Mutation>({ key, kind: "remove" }),
    wrongValueFor(key).map<Mutation>((value) => ({ key, kind: "wrong", value })),
  ),
);

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-try-prop4-"));
  const fakeRepo = path.join(tmp, "repo");
  fs.mkdirSync(path.join(fakeRepo, "exorcism-demo", "sketch"), { recursive: true });
  tryCopy = path.join(fakeRepo, "exorcism-demo", "try.mjs");
  workSketch = path.join(fakeRepo, "exorcism-demo", "sketch", "sketch.ino");
  marker = path.join(tmp, "build-ran.marker");
  fs.copyFileSync(realTry, tryCopy);
  fs.writeFileSync(workSketch, "// original work sketch\n");
  // Build spy: writes a marker file if it is ever invoked.
  fs.writeFileSync(
    path.join(fakeRepo, "exorcism-demo", "build.mjs"),
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\n`,
  );
  fs.writeFileSync(path.join(tmp, "sketch.ino"), "void setup(){}\nvoid loop(){}\n");
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("Try_Script config validation", () => {
  // Feature: benchmark-tools, Property 4: A missing or wrong-typed Check_Config key is named, and no build runs
  // **Validates: Requirements 1.6, 10.5**
  it(
    "Feature: benchmark-tools, Property 4: A missing or wrong-typed Check_Config key is named, and no build runs",
    () => {
      fc.assert(
        fc.property(mutationArb, (m) => {
          const config = { ...VALID_CONFIG };
          if (m.kind === "remove") delete config[m.key];
          else config[m.key] = m.value;
          const configPath = path.join(tmp, "config.json");
          fs.writeFileSync(configPath, JSON.stringify(config));
          fs.rmSync(marker, { force: true });

          const r = spawnSync(process.execPath, [tryCopy, path.join(tmp, "sketch.ino"), configPath], {
            encoding: "utf8",
            cwd: tmp,
          });

          expect(r.status).toBe(3);
          expect(r.stdout).toBe("");
          const errLines = r.stderr.split(/\r?\n/).filter((l) => l.length > 0);
          expect(errLines.length).toBe(1);
          expect(errLines[0]).toContain(`"${m.key}"`);
          expect(fs.existsSync(marker)).toBe(false);
          expect(fs.readFileSync(workSketch, "utf8")).toBe("// original work sketch\n");
        }),
        { numRuns: 100 },
      );
    },
    180_000,
  );
});
