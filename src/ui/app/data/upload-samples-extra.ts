// The two extra Upload samples: a chat-written sketch and a program the checker cannot judge.
// Build-time raw imports only. No network, no run-time file access.
import chatSketchHex from "../../../../exorcism-demo/benchmark/round2/chatgpt-high.hex?raw";
import unjudgeableHex from "../../../../fixtures/serial_hello/build/serial_hello.ino.hex?raw";
import unjudgeablePinsText from "../../../../fixtures/serial_hello/pins.json?raw";
import { friendlyLabel } from "../model/labels";
import { importPinMap } from "../model/pin-map-file";
import type { PinRow } from "../model/pin-table";
import type { LoadedProgram } from "../model/upload-hex";
import { sampleRows } from "./upload-sample";

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export const CHAT_SKETCH_HEX_NAME = "chat-written-crossing.hex";
export const CHAT_SKETCH_RULE_TEXT = "all of (WALK is 1, DONT_WALK is 1) must never happen.";
export const CHAT_SKETCH_FIELDS = { runs: "24", seed: "20261101", runLengthMs: "1000" } as const;

export function chatSketchProgram(): LoadedProgram {
  return { name: CHAT_SKETCH_HEX_NAME, text: chatSketchHex, bytes: byteLength(chatSketchHex) };
}

/** The Crosswalk pin map with plain names. Ids start at firstId. */
export function chatSketchRows(firstId: number): PinRow[] {
  return sampleRows(firstId);
}

export const UNJUDGEABLE_HEX_NAME = "serial_hello.ino.hex";
export const UNJUDGEABLE_RULE_TEXT = "LED is 1 must never last 500 ms or longer.";
export const UNJUDGEABLE_FIELDS = { runs: "8", seed: "20261101", runLengthMs: "1000" } as const;

export function unjudgeableProgram(): LoadedProgram {
  return { name: UNJUDGEABLE_HEX_NAME, text: unjudgeableHex, bytes: byteLength(unjudgeableHex) };
}

/** The serial_hello pins (LED, BUTTON). Throws if the bundled pins.json does not import. */
export function unjudgeableRows(firstId: number): PinRow[] {
  const r = importPinMap(unjudgeablePinsText, byteLength(unjudgeablePinsText), firstId);
  if (!r.ok) throw new Error(`bundled serial_hello pins.json did not import: ${r.error}`);
  return r.rows.map((row) => {
    const label = friendlyLabel(row.signal);
    return { ...row, plainName: label.known ? label.text : "" };
  });
}
