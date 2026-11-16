// Feature: honest-verdicts, Part 1. Verdict precedence with unmodelled-peripheral uses (Requirement 4).
// Passing tests are evidence, not proof. No wall clock, no random source outside fast-check's seed.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeVerdict } from "../verdict";
import type { VerdictInput } from "../verdict";
import type { PeripheralDiagnostic, RunResult } from "../types";

const RULE = "LED is 1 must never last 2000 ms or longer.";
const SERIAL = "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked.";
const EEPROM = "The program uses the data EEPROM (EEPROM), which this emulator setup does not model, so the rule cannot be checked.";

function run(runIndex: number, violationCycle: number | null, uses: PeripheralDiagnostic[] = []): RunResult {
  const r: RunResult = {
    runIndex,
    runSeed: 1000 + runIndex,
    eventList: [{ signal: "BTN", value: 0, cycle: 5, gremlinId: "masher" }],
    skipped: [],
    appliedInputs: [],
    outputEvents: [{ signal: "LED", value: 1, cycle: 7 }],
    diagnostics: [],
    cannotCheck: [],
    violation: violationCycle === null ? null : { rule: RULE, cycle: violationCycle },
    endCycle: violationCycle ?? 8_000_000,
  };
  if (uses.length > 0) r.peripheralUses = uses;
  return r;
}

const use = (peripheral: string, cycle: number, register = "UCSR0A"): PeripheralDiagnostic => ({ peripheral, register, cycle, access: "write" });

function input(runs: RunResult[], requestedRuns = runs.length): VerdictInput {
  return { requestedRuns, runs, finished: true, unmappedSignals: [], unsupportedPeripherals: [] };
}

function strip(i: VerdictInput): VerdictInput {
  return { ...i, runs: i.runs.map((r) => { const { peripheralUses: _p, ...rest } = r; return rest; }) };
}

describe("verdict precedence with peripheral uses", () => {
  it("(a) a use one cycle after the violation keeps BROKE, deep-equal to the verdict without uses", () => {
    const i = input([run(0, null), run(1, 4_000_000, [use("USART0", 4_000_001)])], 4);
    const v = computeVerdict(i);
    expect(v?.verdict).toBe("BROKE");
    expect(v).toStrictEqual(computeVerdict(strip(i)));
  });

  it("(b) a use in another Run does not change BROKE", () => {
    const i = input([run(0, null, [use("USART0", 300)]), run(1, 4_000_000)], 4);
    const v = computeVerdict(i);
    expect(v?.verdict).toBe("BROKE");
    expect(v).toStrictEqual(computeVerdict(strip(i)));
  });

  it("(c) a use at the violation cycle gives COULDN'T TELL", () => {
    const v = computeVerdict(input([run(0, 4_000_000, [use("USART0", 4_000_000)])], 1));
    expect(v).toStrictEqual({ verdict: "COULDN'T TELL", reason: SERIAL });
  });

  it("(d) with no violation, any use in any Run gives COULDN'T TELL, never HELD", () => {
    const i = input([run(0, null), run(1, null, [use("EEPROM", 900, "EECR")])]);
    expect(computeVerdict(strip(i))?.verdict).toBe("HELD");
    expect(computeVerdict(i)).toStrictEqual({ verdict: "COULDN'T TELL", reason: EEPROM });
  });

  it("orders reasons by earliest use, then table order, and keeps today's parts after them", () => {
    const runs = [run(0, null, [use("EEPROM", 50, "EECR"), use("USART0", 50)]), run(1, null, [use("USART0", 10)])];
    runs[0].cannotCheck = [{ rule: RULE, reason: "input BTN was read while floating" }];
    const v = computeVerdict(input(runs, 3));
    expect(v).toStrictEqual({
      verdict: "COULDN'T TELL",
      reason: `${SERIAL}; ${EEPROM}`.slice(0, 200),
    });
    const one = computeVerdict(input([run(0, null, [use("USART0", 10)])], 3));
    expect(one).toStrictEqual({ verdict: "COULDN'T TELL", reason: `${SERIAL}; Only 1 of 3 runs completed` });
  });

  it("returns null for an unfinished Campaign whatever the uses", () => {
    expect(computeVerdict({ ...input([run(0, null, [use("USART0", 1)])]), finished: false })).toBeNull();
  });

  // Feature: honest-verdicts, Property 4 and 5: peripheral use decides COULDN'T TELL, nothing else changes.
  it("Property 4 and 5: blocking uses give COULDN'T TELL led by their reasons; otherwise the verdict is unchanged", () => {
    const ids = ["USART0", "EEPROM", "SPI", "CLKPR", "NOT_A_ROW"];
    const arbRun = fc.record({
      violation: fc.option(fc.integer({ min: 1, max: 1_000_000 }), { nil: null }),
      uses: fc.array(fc.record({ id: fc.constantFrom(...ids), at: fc.constantFrom("before", "at", "after1", "after", "any") , n: fc.integer({ min: 0, max: 1_000_000 }) }), { maxLength: 3 }),
      floating: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbRun, { minLength: 1, maxLength: 5 }), fc.integer({ min: 0, max: 3 }), (rs, extra) => {
        const runs = rs.map((r, k) => {
          const v = r.violation;
          const uses = r.uses.map((u) => {
            const base = v ?? 500_000;
            const cycle = u.at === "before" ? Math.max(0, base - 1 - (u.n % base)) : u.at === "at" ? base : u.at === "after1" ? base + 1 : u.at === "after" ? base + 1 + u.n : u.n;
            return use(u.id, cycle);
          });
          const out = run(k, v, uses);
          if (r.floating) out.cannotCheck = [{ rule: RULE, reason: "input BTN was read while floating" }];
          return out;
        });
        const i = input(runs, runs.length + extra);
        const snap = structuredClone(i);
        const got = computeVerdict(i);
        expect(i).toStrictEqual(snap);
        expect(computeVerdict(structuredClone(i))).toStrictEqual(got);
        const lowest = runs.find((r) => r.violation !== null);
        const blocking = lowest !== undefined
          ? (lowest.peripheralUses ?? []).filter((d) => d.cycle <= lowest.violation!.cycle)
          : runs.flatMap((r) => r.peripheralUses ?? []);
        if (blocking.length === 0) {
          expect(got).toStrictEqual(computeVerdict(strip(i)));
          return;
        }
        expect(got?.verdict).toBe("COULDN'T TELL");
        const reason = (got as { reason: string }).reason;
        expect(reason.length).toBeLessThanOrEqual(200);
        let leadId = blocking[0].peripheral;
        let leadCycle = blocking[0].cycle;
        const tableRow: Record<string, number> = { USART0: 0, SPI: 1, EEPROM: 3, CLKPR: 11, NOT_A_ROW: 99 };
        for (const d of blocking) {
          const rank = (x: string) => tableRow[x];
          if (d.cycle < leadCycle || (d.cycle === leadCycle && rank(d.peripheral) < rank(leadId))) {
            leadId = d.peripheral;
            leadCycle = d.cycle;
          }
        }
        const plain: Record<string, string> = { USART0: "serial port", EEPROM: "data EEPROM", SPI: "SPI bus", CLKPR: "clock prescaler register", NOT_A_ROW: "NOT_A_ROW" };
        expect(reason.startsWith(`The program uses the ${plain[leadId]} (${leadId}), which this emulator setup does not model, so the rule cannot be checked.`)).toBe(true);
      }),
      { seed: 20261116, numRuns: 400 },
    );
  });
});