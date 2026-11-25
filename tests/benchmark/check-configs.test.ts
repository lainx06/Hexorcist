import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demoDir = path.join(repoDir, "exorcism-demo");

const common = {
  source: "exorcism-demo/sketch/sketch.ino",
  build: ["node", "exorcism-demo/build.mjs"],
  hex: "exorcism-demo/build/sketch.hex",
  seed: 20261101,
  runMs: 1000,
};

const EXPECTED: Record<string, Record<string, unknown>> = {
  "crosswalk-check.json": {
    ...common,
    pins: "examples/crosswalk/fixture.json",
    rules: "examples/crosswalk/rules.txt",
    gremlins: "masher",
    runs: 24,
  },
  "crosswalk-full-check.json": {
    ...common,
    pins: "examples/crosswalk/fixture.json",
    rules: "exorcism-demo/crosswalk-full-rules.txt",
    gremlins: "masher,bouncer",
    runs: 200,
  },
  "motor-check.json": {
    ...common,
    pins: "exorcism-demo/motor/pins.json",
    rules: "exorcism-demo/motor/rules.txt",
    gremlins: "masher,bouncer",
    runs: 200,
  },
};

const KEYS = ["source", "build", "hex", "pins", "rules", "gremlins", "runs", "seed", "runMs"].sort();

describe("Check_Configs equal their expected objects (2.1 to 2.5)", () => {
  for (const [name, expected] of Object.entries(EXPECTED)) {
    it(`${name} equals the expected object with exactly the nine keys`, () => {
      const parsed = JSON.parse(fs.readFileSync(path.join(demoDir, name), "utf8")) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(KEYS);
      expect(parsed).toEqual(expected);
    });
  }
});

describe("files that must stay unchanged (2.6)", () => {
  it("exorcism-demo/loop-check.json equals its expected object", () => {
    const parsed = JSON.parse(fs.readFileSync(path.join(demoDir, "loop-check.json"), "utf8"));
    expect(parsed).toEqual({
      source: "exorcism-demo/sketch/sketch.ino",
      build: ["node", "exorcism-demo/build.mjs"],
      hex: "exorcism-demo/build/sketch.hex",
      pins: "examples/crosswalk/fixture.json",
      rules: "exorcism-demo/crosswalk-full-rules.txt",
      gremlins: "masher,bouncer",
      runs: 24,
      seed: 20261101,
      runMs: 1000,
    });
  });

  it("exorcism-demo/crosswalk-full-rules.txt equals its expected text (LF)", () => {
    const expected =
      "all of (CAR_GREEN is 1, WALK is 1) must never happen.\n" +
      "all of (WALK is 1, DONT_WALK is 1) must never happen.\n" +
      "all of (CAR_GREEN is 1, CAR_YELLOW is 1) must never happen.\n" +
      "all of (CAR_GREEN is 1, CAR_RED is 1) must never happen.\n" +
      "all of (CAR_YELLOW is 1, CAR_RED is 1) must never happen.\n" +
      "CAR_YELLOW is 1 must never last 200 ms or longer.\n" +
      "WALK is 1 must never last 250 ms or longer.\n";
    expect(fs.readFileSync(path.join(demoDir, "crosswalk-full-rules.txt"), "utf8")).toBe(expected);
  });
});
