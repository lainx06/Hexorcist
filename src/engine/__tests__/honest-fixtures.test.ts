// Feature: honest-verdicts, Part 1. The new fixtures on the real bridge.
// serial_hello and eeprom_boot use unmodelled peripherals and must give COULDN'T TELL;
// ext_interrupt uses only modelled INT0 and must toggle its LED once per PD2 edge.
// Passing tests are evidence, not proof. Time is bridge cycles only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCampaign, runEventList } from "../campaign";
import { validateFixture } from "../fixture";
import { buildCampaignConfig } from "../rules/config-builder";
import { readRulesFile } from "../rules/rules-file";
import type { Fixture } from "../types";
import type { GeneratedEvent } from "../gremlins/generate-types";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const hexOf = (n: string) => readFileSync(resolve(ROOT, `fixtures/${n}/build/${n}.ino.hex`), "utf-8");
const fixtureOf = (n: string) => JSON.parse(readFileSync(resolve(ROOT, `fixtures/${n}/fixture.json`), "utf-8")) as Fixture;

// Campaign values for the COULDN'T TELL fixtures (Choices: not acceptance values).
// The window (400 ms) fits inside the run (8,000,000 cycles = 500 ms), so the rule is checkable on its own.
const RULES = "LED is 1 must never last 400 ms or longer.\n";
const SETTINGS = { gremlinSet: [], campaignSeed: 1, runs: 2, runCycles: 8_000_000 };

function campaign(name: string) {
  const rs = readRulesFile(RULES);
  if (!rs.ok) throw new Error(rs.reasons.join(" | "));
  const built = buildCampaignConfig(rs.ruleSet, fixtureOf(name), { hex: hexOf(name), ...SETTINGS });
  if (!built.ok) throw new Error(built.reasons.join(" | "));
  const h = createCampaign(built.config);
  if (!("runSlice" in h)) throw new Error(h.message);
  const p = h.runSlice(SETTINGS.runs);
  if (!("finished" in p) || p.result === null) throw new Error("campaign did not finish");
  return p;
}

describe("honest-verdicts fixtures", () => {
  it("the fixture files pass validateFixture", () => {
    for (const n of ["serial_hello", "ext_interrupt", "eeprom_boot"]) expect(validateFixture(fixtureOf(n)), n).toBeNull();
  });

  it("serial_hello gives COULDN'T TELL naming the serial port", () => {
    const p = campaign("serial_hello");
    console.log(`serial_hello verdict ${JSON.stringify(p.result!.verdict)}`);
    console.log(`serial_hello run 0 peripheralUses ${JSON.stringify(p.runs[0].peripheralUses)}`);
    expect(p.result!.verdict).toStrictEqual({
      verdict: "COULDN'T TELL",
      reason:
        "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked.; No gremlin produced an event in any run",
    });
    for (const r of p.runs) {
      expect(r.peripheralUses?.length).toBe(1);
      expect(r.peripheralUses![0].peripheral).toBe("USART0");
    }
  }, 120_000);

  it("eeprom_boot gives COULDN'T TELL naming the EEPROM", () => {
    const p = campaign("eeprom_boot");
    console.log(`eeprom_boot verdict ${JSON.stringify(p.result!.verdict)}`);
    console.log(`eeprom_boot run 0 peripheralUses ${JSON.stringify(p.runs[0].peripheralUses)}`);
    expect(p.result!.verdict).toStrictEqual({
      verdict: "COULDN'T TELL",
      reason:
        "The program uses the data EEPROM (EEPROM), which this emulator setup does not model, so the rule cannot be checked.; No gremlin produced an event in any run",
    });
    for (const r of p.runs) expect(r.peripheralUses?.map((d) => d.peripheral)).toStrictEqual(["EEPROM"]);
  }, 120_000);

  it("ext_interrupt toggles the LED once per scripted PD2 edge and records no peripheral use", () => {
    const edges = [2_000_000, 2_400_000, 2_800_000, 3_200_000];
    const events: GeneratedEvent[] = edges.map((cycle, k) => ({ signal: "TRIGGER", value: k % 2 === 0 ? 0 : "release", cycle, gremlinId: "script" }) as GeneratedEvent);
    const path = runEventList(
      { hex: hexOf("ext_interrupt"), fixture: fixtureOf("ext_interrupt"), checker: () => ({ violation: null }), runCycles: 4_000_000, maxStepCycles: 160_000 },
      events,
      0,
    );
    if ("kind" in path) throw new Error(path.message);
    console.log(`ext_interrupt LED edges ${JSON.stringify(path.outputEvents.filter((e) => e.signal === "LED"))}`);
    expect(path.peripheralUses).toBeUndefined();
    expect(path.appliedInputs.map((a) => a.cycle)).toStrictEqual(edges);
    const led = path.outputEvents.filter((e) => e.signal === "LED" && e.cycle >= edges[0]);
    expect(led.length).toBe(edges.length);
    const before = path.outputEvents.filter((e) => e.signal === "LED" && e.cycle < edges[0]).at(-1)!.value;
    let level = before;
    edges.forEach((c, k) => {
      expect(led[k].cycle).toBeGreaterThan(c);
      expect(led[k].cycle).toBeLessThanOrEqual(c + 2_000);
      expect(led[k].value).toBe(level === 1 ? 0 : 1);
      level = led[k].value;
    });
  }, 120_000);
});