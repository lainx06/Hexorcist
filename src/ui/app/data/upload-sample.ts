// The Sample: the bundled crosswalk buggy program, its pins, rule and settings. No network, no new raw import.
import { friendlyLabel } from "../model/labels";
import { exportPinMap, importPinMap } from "../model/pin-map-file";
import type { PinRow } from "../model/pin-table";
import type { LoadedProgram } from "../model/upload-hex";
import { CROSSWALK_TEXTS } from "./crosswalk";
import serialHex from "../../../../fixtures/serial_hello/build/serial_hello.ino.hex?raw";

export const SAMPLE_HEX_NAME = "crosswalk-buggy.hex";
export const SAMPLE_PINS_NAME = "crosswalk-pins.json";

export const SAMPLE_FIELDS = { runs: "24", seed: "20261101", runLengthMs: "1000" } as const;

export function sampleProgram(): LoadedProgram {
  const text = CROSSWALK_TEXTS.buggyHex;
  return { name: SAMPLE_HEX_NAME, text, bytes: new TextEncoder().encode(text).length };
}

/** The crosswalk pins in file order, Plain_Names from the Friendly_Label table. Ids start at firstId. */
export function sampleRows(firstId: number): PinRow[] {
  const text = CROSSWALK_TEXTS.fixtureText;
  const r = importPinMap(text, new TextEncoder().encode(text).length, firstId);
  if (!r.ok) throw new Error(`bundled crosswalk fixture.json did not import: ${r.error}`);
  return r.rows.map((row) => {
    const label = friendlyLabel(row.signal);
    return { ...row, plainName: label.known ? label.text : "" };
  });
}

export const sampleRuleText = (): string => CROSSWALK_TEXTS.rulesText;

export interface DownloadFile {
  name: string;
  text: string;
  type: string;
}

/**
 * The two files of "Download the sample": the bundled HEX byte for byte, and the Sample's pin map in the
 * fixture.json format with each plain name in the extra "plainName" field, so importing it restores them.
 */
export function sampleDownloads(): DownloadFile[] {
  return [
    { name: SAMPLE_HEX_NAME, text: CROSSWALK_TEXTS.buggyHex, type: "text/plain" },
    { name: SAMPLE_PINS_NAME, text: exportPinMap(sampleRows(1)), type: "application/json" },
  ];
}
// The COULDN'T TELL sample: fixtures/serial_hello, which uses the serial port the emulator does not model.
// One click shows the third verdict. Pins: its LED plus one input so the Masher has something to press.

export const SERIAL_HEX_NAME = "serial-hello.hex";

const SERIAL_PINS = JSON.stringify({
  pins: [
    { signal: "LED", port: "B", bit: 5, direction: "output" },
    { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
  ],
});

/** Fewer runs: every run of this program waits on the serial port, so 24 runs take about 20 s. */
export const SERIAL_FIELDS = { runs: "8", seed: "20261101", runLengthMs: "1000" } as const;

export const SERIAL_RULE = "LED is 1 must never last 500 ms or longer.";

export function serialProgram(): LoadedProgram {
  return { name: SERIAL_HEX_NAME, text: serialHex, bytes: new TextEncoder().encode(serialHex).length };
}

export function serialRows(firstId: number): PinRow[] {
  const r = importPinMap(SERIAL_PINS, new TextEncoder().encode(SERIAL_PINS).length, firstId);
  if (!r.ok) throw new Error(`bundled serial pin map did not import: ${r.error}`);
  return r.rows.map((row) => {
    const label = friendlyLabel(row.signal);
    return { ...row, plainName: label.known ? label.text : "" };
  });
}
