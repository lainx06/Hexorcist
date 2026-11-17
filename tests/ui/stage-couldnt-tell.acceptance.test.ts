// Feature: bench-ui-stage, Requirement 7.4 and 7.6. Node acceptance test: runCampaignJob on
// fixtures/serial_hello gives COULDN'T TELL and passes through the register and cycle of the
// unmodelled-peripheral use of run 0. Passing runs are evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCampaign } from "../../src/engine/campaign";
import { buildCampaignConfig } from "../../src/engine/rules/config-builder";
import { readRulesFile } from "../../src/engine/rules/rules-file";
import type { Fixture } from "../../src/engine/types";
import { runCampaignJob } from "../../src/ui/app/worker/host";

const ROOT = resolve(__dirname, "..", "..");
const hex = readFileSync(resolve(ROOT, "fixtures/serial_hello/build/serial_hello.ino.hex"), "utf-8");
const fixture = JSON.parse(readFileSync(resolve(ROOT, "fixtures/serial_hello/fixture.json"), "utf-8")) as Fixture;

const RULES = "LED is 1 must never last 400 ms or longer.\n";
const SETTINGS = { gremlinSet: [], campaignSeed: 1, runs: 2, runCycles: 8_000_000 };

describe("COULDN'T TELL carries the peripheral uses of run 0 (7.4, 7.6)", () => {
  it("serial_hello: verdict COULDN'T TELL, runIndex 0, uses equal run 0's RunResult.peripheralUses", () => {
    const rs = readRulesFile(RULES);
    if (!rs.ok) throw new Error(rs.reasons.join(" | "));

    const job = runCampaignJob({ hex, fixture, ruleSet: rs.ruleSet, ...SETTINGS });
    if (!job.ok) throw new Error(`runCampaignJob error: ${JSON.stringify(job.error)}`);
    const result = job.result;

    const built = buildCampaignConfig(rs.ruleSet, fixture, { hex, ...SETTINGS });
    if (!built.ok) throw new Error(built.reasons.join(" | "));
    const h = createCampaign(built.config);
    if (!("runSlice" in h)) throw new Error(h.message);
    const p = h.runSlice(SETTINGS.runs);
    if (!("finished" in p)) throw new Error(p.message);
    const run0 = p.runs[0];
    console.log(`serial_hello run 0 peripheralUses ${JSON.stringify(run0.peripheralUses)}`);
    console.log(`serial_hello job peripheralUses ${JSON.stringify(result.peripheralUses)}`);

    expect(result.verdict.verdict).toBe("COULDN'T TELL");
    expect(result.peripheralUses).toBeDefined();
    expect(result.peripheralUses!.runIndex).toBe(0);
    expect(run0.peripheralUses).toBeDefined();
    expect(result.peripheralUses!.uses).toStrictEqual(run0.peripheralUses);

    expect(result.peripheralUses!.uses.length).toBeGreaterThan(0);
    for (const u of result.peripheralUses!.uses) {
      expect(u.peripheral).toBe("USART0");
      expect(typeof u.register).toBe("string");
      expect(u.register.length).toBeGreaterThan(0);
      expect(Number.isInteger(u.cycle)).toBe(true);
    }
  }, 120_000);
});
