// The Sample: the bundled crosswalk buggy program, its pins, rule and settings. No network, no new raw import.
import { friendlyLabel } from "../model/labels";
import { importPinMap } from "../model/pin-map-file";
import type { PinRow } from "../model/pin-table";
import type { LoadedProgram } from "../model/upload-hex";
import { CROSSWALK_TEXTS } from "./crosswalk";

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

/** The two files of "Download the sample", byte for byte the bundled strings. */
export function sampleDownloads(): DownloadFile[] {
  return [
    { name: SAMPLE_HEX_NAME, text: CROSSWALK_TEXTS.buggyHex, type: "text/plain" },
    { name: SAMPLE_PINS_NAME, text: CROSSWALK_TEXTS.fixtureText, type: "application/json" },
  ];
}