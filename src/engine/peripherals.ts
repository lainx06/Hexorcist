// Unmodelled ATmega328P peripherals (honest-verdicts Part 1, design.md Peripheral_Table rows U1-U16).
// Pure data and pure functions. No avr8js import, no clock, no random source.
// Rule D2: every read of a listed register is a use. A write only keeps the peripheral off when
// the register has a disable mask and the written byte has every mask bit clear; any other write
// is a use. INT0/INT1 and the pin-change interrupts are modelled by avr8js and are not listed.

import type { PeripheralDiagnostic } from "./types";

export interface PeripheralRegister {
  readonly name: string;
  /** Data-space address. */
  readonly addr: number;
  /** Enable bits. A write with all of them clear only keeps the peripheral off. */
  readonly disableMask?: number;
}

export interface PeripheralRow {
  /** Peripheral_ID; the register name for single-register rows. */
  readonly id: string;
  readonly plainName: string;
  readonly registers: readonly PeripheralRegister[];
}

function row(id: string, plainName: string, registers: PeripheralRegister[]): PeripheralRow {
  return Object.freeze({ id, plainName, registers: Object.freeze(registers.map((r) => Object.freeze({ ...r }))) });
}

/** Table order is the tie order of the Reason. Addresses and masks: design.md, from iom328p.h. */
export const UNMODELLED_PERIPHERALS: readonly PeripheralRow[] = Object.freeze([
  row("USART0", "serial port", [
    { name: "UCSR0A", addr: 0xc0 },
    { name: "UCSR0B", addr: 0xc1, disableMask: 0xf8 },
    { name: "UCSR0C", addr: 0xc2 },
    { name: "UBRR0L", addr: 0xc4 },
    { name: "UBRR0H", addr: 0xc5 },
    { name: "UDR0", addr: 0xc6 },
  ]),
  row("SPI", "SPI bus", [
    { name: "SPCR", addr: 0x4c, disableMask: 0xc0 },
    { name: "SPSR", addr: 0x4d },
    { name: "SPDR", addr: 0x4e },
  ]),
  row("TWI", "two-wire bus", [
    { name: "TWBR", addr: 0xb8 },
    { name: "TWSR", addr: 0xb9 },
    { name: "TWAR", addr: 0xba },
    { name: "TWDR", addr: 0xbb },
    { name: "TWCR", addr: 0xbc, disableMask: 0x05 },
    { name: "TWAMR", addr: 0xbd },
  ]),
  row("EEPROM", "data EEPROM", [
    { name: "EECR", addr: 0x3f, disableMask: 0x0f },
    { name: "EEDR", addr: 0x40 },
    { name: "EEARL", addr: 0x41 },
    { name: "EEARH", addr: 0x42 },
  ]),
  row("WDT", "watchdog timer", [{ name: "WDTCSR", addr: 0x60, disableMask: 0x48 }]),
  row("AC", "analog comparator", [
    { name: "ACSR", addr: 0x50, disableMask: 0x0c },
    { name: "DIDR1", addr: 0x7f, disableMask: 0x03 },
  ]),
  row("DIDR0", "digital input disable register", [{ name: "DIDR0", addr: 0x7e, disableMask: 0x3f }]),
  row("ASSR", "timer 2 asynchronous status register", [{ name: "ASSR", addr: 0xb6, disableMask: 0x60 }]),
  row("GTCCR", "timer prescaler control register", [{ name: "GTCCR", addr: 0x43, disableMask: 0x83 }]),
  row("PRR", "power reduction register", [{ name: "PRR", addr: 0x64, disableMask: 0xef }]),
  row("SMCR", "sleep mode control register", [{ name: "SMCR", addr: 0x53, disableMask: 0x01 }]),
  row("CLKPR", "clock prescaler register", [{ name: "CLKPR", addr: 0x61, disableMask: 0x0f }]),
  row("MCUCR", "chip control register", [{ name: "MCUCR", addr: 0x55, disableMask: 0x52 }]),
  row("MCUSR", "reset status register", [{ name: "MCUSR", addr: 0x54 }]),
  row("SPMCSR", "flash self-programming register", [{ name: "SPMCSR", addr: 0x57 }]),
  row("OSCCAL", "oscillator calibration register", [{ name: "OSCCAL", addr: 0x66 }]),
]);

interface Located {
  readonly rowIndex: number;
  readonly row: PeripheralRow;
  readonly reg: PeripheralRegister;
}

const BY_ADDR: ReadonlyMap<number, Located> = new Map(
  UNMODELLED_PERIPHERALS.flatMap((r, rowIndex) => r.registers.map((reg) => [reg.addr, { rowIndex, row: r, reg }] as const)),
);

const ROW_INDEX: ReadonlyMap<string, number> = new Map(UNMODELLED_PERIPHERALS.map((r, i) => [r.id, i]));

/** Every listed register, in table order. */
export function unmodelledRegisters(): PeripheralRegister[] {
  return UNMODELLED_PERIPHERALS.flatMap((r) => r.registers.slice());
}

/** Table row index of a Peripheral_ID, or undefined. */
export function peripheralRowIndex(id: string): number | undefined {
  return ROW_INDEX.get(id);
}

export function isUseAccess(reg: PeripheralRegister, access: "read" | "write", value: number): boolean {
  if (access === "read") return true;
  return reg.disableMask === undefined || (value & reg.disableMask) !== 0;
}

/** "The program uses the <Plain_Name> (<Peripheral_ID>), which this emulator setup does not model, so the rule cannot be checked." */
export function peripheralReason(id: string): string {
  const i = ROW_INDEX.get(id);
  const plain = i === undefined ? id : UNMODELLED_PERIPHERALS[i].plainName;
  return `The program uses the ${plain} (${id}), which this emulator setup does not model, so the rule cannot be checked.`;
}

/** Keeps the earliest use per peripheral for one Run. Disable writes and unknown addresses add nothing. */
export class PeripheralRecorder {
  private readonly _seen = new Set<string>();
  private _pending: PeripheralDiagnostic[] = [];

  access(addr: number, access: "read" | "write", value: number, cycle: number): void {
    const loc = BY_ADDR.get(addr);
    if (loc === undefined || this._seen.has(loc.row.id)) return;
    if (!isUseAccess(loc.reg, access, value)) return;
    this._seen.add(loc.row.id);
    this._pending.push({ peripheral: loc.row.id, register: loc.reg.name, cycle, access });
  }

  /** Uses recorded since the last take, in the order they happened (ascending cycle). */
  take(): PeripheralDiagnostic[] {
    const out = this._pending;
    this._pending = [];
    return out;
  }
}