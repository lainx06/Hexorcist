// Feature: honest-verdicts, Part 1. The Peripheral_Table data, the use/disable rule and the recorder.
// Passing tests are evidence, not proof. No wall clock, no random source outside fast-check's seed.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { BANNED_WORDS } from "../copy-rules";
import { PeripheralRecorder, UNMODELLED_PERIPHERALS, isUseAccess, peripheralReason, unmodelledRegisters } from "../peripherals";

const IDS = ["USART0", "SPI", "TWI", "EEPROM", "WDT", "AC", "DIDR0", "ASSR", "GTCCR", "PRR", "SMCR", "CLKPR", "MCUCR", "MCUSR", "SPMCSR", "OSCCAL"];
// Modelled by avr8js through the GPIO ports: EICRA, EIMSK, EIFR, PCICR, PCIFR, PCMSK0-2.
const MODELLED_INTERRUPT_ADDRS = [0x69, 0x3d, 0x3c, 0x68, 0x3b, 0x6b, 0x6c, 0x6d];

describe("Peripheral_Table", () => {
  it("lists rows U1-U16 in table order with distinct ids and addresses", () => {
    expect(UNMODELLED_PERIPHERALS.map((r) => r.id)).toStrictEqual(IDS);
    const addrs = unmodelledRegisters().map((r) => r.addr);
    expect(new Set(addrs).size).toBe(addrs.length);
    for (const a of MODELLED_INTERRUPT_ADDRS) expect(addrs).not.toContain(a);
  });

  it("classes the start-up write UCSR0B = 0 as keeping the serial port off", () => {
    const ucsr0b = unmodelledRegisters().find((r) => r.name === "UCSR0B")!;
    expect(ucsr0b.addr).toBe(0xc1);
    expect(isUseAccess(ucsr0b, "write", 0x00)).toBe(false);
    expect(isUseAccess(ucsr0b, "write", 0x18)).toBe(true); // RXEN0 | TXEN0
    expect(isUseAccess(ucsr0b, "read", 0x00)).toBe(true);
  });

  it("gives the exact USART0 and EEPROM reasons", () => {
    expect(peripheralReason("USART0")).toBe(
      "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked.",
    );
    expect(peripheralReason("EEPROM")).toBe(
      "The program uses the data EEPROM (EEPROM), which this emulator setup does not model, so the rule cannot be checked.",
    );
    expect(peripheralReason("SMCR")).toBe(
      "The program uses the sleep mode control register (SMCR), which this emulator setup does not model, so the rule cannot be checked.",
    );
  });

  it("keeps every reason within 200 UTF-16 units and free of banned words", () => {
    for (const r of UNMODELLED_PERIPHERALS) {
      const s = peripheralReason(r.id);
      expect(s.length).toBeLessThanOrEqual(200);
      expect(r.plainName).toBe(r.plainName.trim());
      for (const w of BANNED_WORDS) expect(new RegExp(`(?<![\\w-])${w}(?![\\w-])`, "i").test(s), `${r.id}: ${w}`).toBe(false);
    }
  });

  it("names the register in the id of every single-register row", () => {
    for (const r of UNMODELLED_PERIPHERALS.slice(6)) {
      expect(r.registers.length).toBe(1);
      expect(r.id).toBe(r.registers[0].name);
    }
  });
});

describe("PeripheralRecorder", () => {
  it("keeps the earliest use per peripheral and ignores disable writes and other addresses", () => {
    const rec = new PeripheralRecorder();
    rec.access(0xc1, "write", 0x00, 10); // UCSR0B = 0: off
    rec.access(0x25, "write", 0xff, 11); // PORTB: not listed
    rec.access(0x69, "write", 0x01, 12); // EICRA: modelled
    rec.access(0xc0, "write", 0x02, 20); // UCSR0A: use
    rec.access(0xc6, "write", 0x41, 30); // UDR0: same peripheral, later
    rec.access(0x3f, "read", 0x00, 40); // EECR: use
    expect(rec.take()).toStrictEqual([
      { peripheral: "USART0", register: "UCSR0A", cycle: 20, access: "write" },
      { peripheral: "EEPROM", register: "EECR", cycle: 40, access: "read" },
    ]);
    rec.access(0xc6, "read", 0, 50);
    expect(rec.take()).toStrictEqual([]);
  });

  // Feature: honest-verdicts, Property 1 and 2: the classifier and the recorder against a model.
  it("Property 1 and 2: every access is use or disable; the recorder matches a model", () => {
    const regs = unmodelledRegisters();
    const owner = new Map(UNMODELLED_PERIPHERALS.flatMap((r) => r.registers.map((g) => [g.addr, r.id] as const)));
    const arbAccess = fc.record({
      addr: fc.oneof(fc.constantFrom(...regs.map((r) => r.addr)), fc.constantFrom(...MODELLED_INTERRUPT_ADDRS, 0x25, 0x5f)),
      access: fc.constantFrom<"read" | "write">("read", "write"),
      value: fc.integer({ min: 0, max: 255 }),
      dc: fc.integer({ min: 0, max: 1000 }),
      cut: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbAccess, { maxLength: 60 }), (xs) => {
        const rec = new PeripheralRecorder();
        const got: unknown[] = [];
        const want: unknown[] = [];
        const seen = new Set<string>();
        let cycle = 0;
        for (const x of xs) {
          cycle += x.dc;
          rec.access(x.addr, x.access, x.value, cycle);
          if (x.cut) got.push(...rec.take());
          const reg = regs.find((r) => r.addr === x.addr);
          if (reg === undefined) continue;
          const use = x.access === "read" || reg.disableMask === undefined || (x.value & reg.disableMask) !== 0;
          expect(isUseAccess(reg, x.access, x.value)).toBe(use);
          const id = owner.get(x.addr)!;
          if (use && !seen.has(id)) {
            seen.add(id);
            want.push({ peripheral: id, register: reg.name, cycle, access: x.access });
          }
        }
        got.push(...rec.take());
        expect(got).toStrictEqual(want);
      }),
      { seed: 20261115, numRuns: 300 },
    );
  });
});