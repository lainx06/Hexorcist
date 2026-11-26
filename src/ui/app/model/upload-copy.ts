// Every new string of the "Your own program" device, in one place for the copy scan. Pure.

export const UPLOAD_COPY = {
  cardTitle: "Your own program",
  cardLine: "Load a compiled .hex for this chip and map its pins.",
  sectionTitle: "Program and pins",
  chooseHex: "Choose .hex file",
  helpLine:
    "Compile for an ATmega328P at 16 MHz and use the plain .hex, not the one with a bootloader. Other clock speeds give wrong timings.",
  trySample: "Try the sample",
  tryChatSketch: "Try a chat-written sketch",
  tryUnjudgeable: "Try one it can't check",
  sampleLoadError: "This sample slipped away and didn't load. Try loading it again.",
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
  checklist: {
    prefix: "To unleash:",
    hex: "load a .hex for the gremlins to attack",
    pins: "give them an input to poke and an output to watch",
    rule: "write a rule to test",
    gremlin: "pick a gremlin",
  },
} as const;

/** Fill "{key}" holes in a copy string. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(values, k) ? (values[k] as string) : m,
  );
}

export const HEX_ERROR_TEXT = {
  notHex: "Nothing to exorcise here: this isn't a .hex file. Choose the compiled .hex for your program.",
  tooBig: "This file is over 256 KB, too big to haunt this chip. Choose the compiled .hex for your program.",
  empty: "Not even a ghost in here: this file is empty. Choose the compiled .hex for your program.",
  checksum: (n: string): string => `Line ${n} has a wrong checksum. The file may be damaged or cut short. Export the .hex again.`,
  badRecord: (n: string): string => `Line ${n} isn't a valid .hex record. Compile again and choose the new .hex.`,
  bootloader: "This .hex has a bootloader riding along. Choose the plain .hex instead.",
  invalid: "This doesn't read as a .hex file. Choose the compiled .hex for your program.",
  overflow: "This program won't fit: it's bigger than the chip's 32 KB of program memory. Choose a build that fits.",
  unreadable: "This file wouldn't open. Try choosing it again.",
} as const;

export const ROW_ERROR_TEXT = {
  signalName:
    "Signal names start with a letter, then letters, digits or _ (up to 32), and can't be all, any or a blocked word.",
  duplicateSignal: (s: string): string => `Two pins can't share the name ${s}. Give each pin its own signal name.`,
  duplicatePortBit: (portBit: string): string => `${portBit} is already taken. Pick another port or bit.`,
  noPortBit: "This pin needs a port and a bit. Choose both.",
  port: (p: string): string => `Port ${p} isn't on this chip. Use port B, C or D.`,
  bit: (n: string): string => `Bit ${n} is out of range. Use a bit from 0 to 7.`,
  plainTooLong: "Plain name can be at most 40 characters.",
} as const;

export const TABLE_ERROR_TEXT = {
  noInput: "No input for the gremlins to poke. Add at least one input pin.",
  noOutput: "No output to watch. Add at least one output pin.",
} as const;

export const IMPORT_ERROR_TEXT = {
  tooBig: "This pin map is over 256 KB. Choose a pin map file under 256 KB.",
  notJson: "This pin map doesn't read as JSON. Choose a pin map saved as valid JSON.",
  noPins: 'No pins in here, only ghosts. A pin map is an object with a "pins" array.',
  clock: "This pin map is for a clock other than 16 MHz. Hexorcist runs the chip at 16 MHz, so use a 16 MHz pin map.",
  tooMany: "That's a crowd: more than 16 pins. Hexorcist takes up to 16, so trim the list.",
  analog: (n: number): string =>
    `Entry ${String(n)} of the pins list is an analog pin. The pin table doesn't take analog pins, so remove it.`,
  entrySignal: (n: number): string => `Entry ${String(n)} of the pins list needs a signal name in quotes.`,
  entryDigital: (n: number): string =>
    `Entry ${String(n)} of the pins list needs a port letter, a whole-number bit and a direction of "input" or "output".`,
  entryPlainName: (n: number): string => `Entry ${String(n)} of the pins list has a plain name that is not text. Make it text.`,
  entryField: (n: number, signal: string, field: string): string =>
    `Entry ${String(n)} of the pins list (${signal}) has a field Hexorcist can't use here: ${field}. Remove it.`,
} as const;

export const PIN_LEVELS_TEXT = {
  badge: "Pin levels",
  pressed: "pressed",
  notPressed: "not pressed",
  notDriven: "not driven",
  on: "on",
  off: "off",
} as const;

export const UNMAPPED_SIGNAL_TEXT = (s: string): string => `Signal ${s} isn't in the pin table. Add it to the table or change the rule.`;