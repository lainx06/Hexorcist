import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { readRulesFile } from "../../src/engine/rules/rules-file";
import type { Fixture } from "../../src/engine/types";

const motorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../exorcism-demo/motor");

const EXPECTED_PINS = {
  pins: [
    { signal: "FWD_BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
    { signal: "REV_BUTTON", port: "D", bit: 3, direction: "input", activeLevel: "low" },
    { signal: "STOP_BUTTON", port: "D", bit: 4, direction: "input", activeLevel: "low" },
    { signal: "FORWARD", port: "B", bit: 0, direction: "output" },
    { signal: "REVERSE", port: "B", bit: 1, direction: "output" },
  ],
};

const EXPECTED_RULES = [
  "all of (FORWARD is 1, REVERSE is 1) must never happen.",
  "Within 50 ms after STOP_BUTTON is 0 becomes true, FORWARD is 0 must be true.",
  "Within 50 ms after STOP_BUTTON is 0 becomes true, REVERSE is 0 must be true.",
];

describe("Motor_Pins (3.1, 3.2)", () => {
  it("equals the expected object", () => {
    const parsed = JSON.parse(fs.readFileSync(path.join(motorDir, "pins.json"), "utf8"));
    expect(parsed).toEqual(EXPECTED_PINS);
  });
});

describe("Motor_Rules (3.3, 3.4)", () => {
  const bytes = fs.readFileSync(path.join(motorDir, "rules.txt"));
  const text = bytes.toString("utf8");

  it("holds exactly the three LF-terminated lines", () => {
    expect(text).toBe(EXPECTED_RULES.join("\n") + "\n");
    expect(bytes.includes(13)).toBe(false);
  });

  it("reads with readRulesFile into three rules", () => {
    const r = readRulesFile(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ruleSet.length).toBe(3);
  });

  it("compiles against the Motor_Pins fixture", () => {
    const r = readRulesFile(text);
    if (!r.ok) throw new Error("rules file did not read");
    const fixture = JSON.parse(fs.readFileSync(path.join(motorDir, "pins.json"), "utf8")) as Fixture;
    const c = compileRuleSet(r.ruleSet, fixture);
    expect(c.ok, c.ok ? "" : c.reasons.join(" | ")).toBe(true);
  });
});
