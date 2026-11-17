// Every new string of the "Your own program" device, in one place for the copy scan. Pure.

export const UPLOAD_COPY = {
  cardTitle: "Your own program",
  cardLine: "Load a compiled .hex for this chip and map its pins.",
  sectionTitle: "Program and pins",
  chooseHex: "Choose .hex file",
  helpLine:
    "Compile for an ATmega328P at 16 MHz and use the plain .hex, not the one with a bootloader. Other clock speeds give wrong timings.",
  trySample: "Try the sample",
  downloadSample: "Download the sample",
  loadedPrefix: "Loaded: ",
  addPin: "Add pin",
  importPins: "Import pin map",
  exportPins: "Export pin map",
  columns: {
    signal: "Signal name",
    plain: "Plain name",
    port: "Port",
    bit: "Bit",
    direction: "Direction",
    pressed: "Pressed level",
  },
  directions: { input: "Input", output: "Output" },
  pressedLevels: { low: "Low (button to ground)", high: "High" },
  removeNamed: "Remove {name}",
  removeRow: "Remove row {n}",
  noFix: "Your own program has no fixed version to compare.",
  exportFileName: "pin-map.json",
  gremlinOrder: "Gremlin order: {names}",
} as const;

/** Fill "{key}" holes in a copy string. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? (values[k] as string) : m,
  );
}

export const HEX_ERROR_TEXT = {
  notHex: "This is not a .hex file. Choose the compiled .hex file for your program.",
  tooBig: "This file is larger than 256 KB, too big to be a program for this chip.",
  empty: "This file is empty.",
  checksum: (n: string): string => `Line ${n} has a wrong checksum. The file may be damaged or cut short.`,
  badRecord: (n: string): string => `Line ${n} is not a valid .hex record.`,
  bootloader: "This looks like the .hex with a bootloader. Use the plain .hex instead.",
  invalid: "This file is not a valid .hex file.",
  overflow: "This program is bigger than the chip's 32 KB of program memory.",
  unreadable: "This file could not be read. Try choosing it again.",
} as const;

export const ROW_ERROR_TEXT = {
  signalName:
    "Signal name must start with a letter and use only letters, digits and _ (at most 32), and cannot be all, any or a blocked word.",
  duplicateSignal: (s: string): string => `Another pin already uses the signal name ${s}.`,
  duplicatePortBit: (portBit: string): string => `Another pin already uses ${portBit}.`,
  noPortBit: "Choose a port and a bit for this pin.",
  port: (p: string): string => `Port ${p} is not on this chip's list. Use port B, C or D.`,
  bit: (n: string): string => `Bit ${n} is out of range. Use a bit from 0 to 7.`,
  plainTooLong: "Plain name can be at most 40 characters.",
} as const;

export const TABLE_ERROR_TEXT = {
  noInput: "Add at least one input pin.",
  noOutput: "Add at least one output pin.",
} as const;

export const IMPORT_ERROR_TEXT = {
  tooBig: "This pin map file is larger than 256 KB.",
  notJson: "This file is not valid JSON.",
  noPins: 'This file has no pins list. A pin map is an object with a "pins" array.',
  clock: "This pin map is for a clock other than 16 MHz. Hexorcist runs the chip at 16 MHz.",
  tooMany: "This pin map has more than 16 pins. Hexorcist takes up to 16.",
  analog: (n: number): string =>
    `Entry ${String(n)} of the pins list is an analog pin. Analog pins are not supported in the pin table.`,
  entrySignal: (n: number): string => `Entry ${String(n)} of the pins list needs a signal name in quotes.`,
  entryDigital: (n: number): string =>
    `Entry ${String(n)} of the pins list needs a port letter, a whole-number bit and a direction of "input" or "output".`,
  entryPlainName: (n: number): string => `Entry ${String(n)} of the pins list has a plain name that is not text.`,
  entryField: (n: number, signal: string, field: string): string =>
    `Entry ${String(n)} of the pins list (${signal}) has a field Hexorcist can't use here: ${field}.`,
} as const;

export const PIN_LEVELS_TEXT = {
  badge: "Pin levels",
  pressed: "pressed",
  notPressed: "not pressed",
  notDriven: "not driven",
  on: "on",
  off: "off",
} as const;

export const UNMAPPED_SIGNAL_TEXT = (s: string): string => `Signal ${s} is not in the pin table.`;