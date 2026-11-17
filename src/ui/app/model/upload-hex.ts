// Hex_Check: file name, size and text in, a Loaded_Program or one plain Hex_Error out. Pure.
import { hexToProgMem } from "../../../engine/hex-parser";
import { HEX_ERROR_TEXT } from "./upload-copy";

export const SIZE_LIMIT = 262_144;

export interface LoadedProgram {
  /** File.name exactly, or "crosswalk-buggy.hex" for the Sample. */
  name: string;
  /** The HEX text, as read. */
  text: string;
  /** File.size, or the UTF-8 byte length of the Sample text. */
  bytes: number;
}

export interface HexError {
  /** The plain sentence shown in both views. */
  text: string;
  /** The parser's own message (Technical_View only); null for name, size and read errors. */
  parser: string | null;
}

export type HexCheckResult = { ok: true; program: LoadedProgram } | { ok: false; error: HexError };

const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** The name check, then the size check. The view calls this before it reads the text. */
export function hexPreCheck(name: string, bytes: number): HexError | null {
  if (!asciiLower(name).endsWith(".hex")) return { text: HEX_ERROR_TEXT.notHex, parser: null };
  if (bytes > SIZE_LIMIT) return { text: HEX_ERROR_TEXT.tooBig, parser: null };
  return null;
}

const MAPPING: readonly { re: RegExp; text: (m: RegExpExecArray) => string }[] = [
  { re: /^empty HEX string$/, text: () => HEX_ERROR_TEXT.empty },
  { re: /^checksum mismatch at line (\d+)$/, text: (m) => HEX_ERROR_TEXT.checksum(m[1] as string) },
  { re: /^line (\d+) is too short$/, text: (m) => HEX_ERROR_TEXT.badRecord(m[1] as string) },
  { re: /^line (\d+) is too short for declared byte count$/, text: (m) => HEX_ERROR_TEXT.badRecord(m[1] as string) },
  { re: /^unknown record type 0x04$/, text: () => HEX_ERROR_TEXT.bootloader },
  { re: /^unknown record type 0x/, text: () => HEX_ERROR_TEXT.invalid },
  { re: /^line does not start with ':'$/, text: () => HEX_ERROR_TEXT.invalid },
  { re: /^data after EOF record$/, text: () => HEX_ERROR_TEXT.invalid },
  { re: /^missing EOF record$/, text: () => HEX_ERROR_TEXT.invalid },
  { re: /^flash overflow:/, text: () => HEX_ERROR_TEXT.overflow },
];

/** Every invalid-hex message to one plain sentence; anything not listed is "not a valid .hex file". */
export function hexErrorText(message: string): string {
  for (const row of MAPPING) {
    const m = row.re.exec(message);
    if (m !== null) return row.text(m);
  }
  return HEX_ERROR_TEXT.invalid;
}

/** Name, then size, then hexToProgMem. Exactly one result; never throws. */
export function hexCheck(name: string, bytes: number, text: string): HexCheckResult {
  const pre = hexPreCheck(name, bytes);
  if (pre !== null) return { ok: false, error: pre };
  const parsed = hexToProgMem(text);
  if (!(parsed instanceof Uint16Array)) {
    return { ok: false, error: { text: hexErrorText(parsed.message), parser: parsed.message } };
  }
  return { ok: true, program: { name, text, bytes } };
}

/** "<n> bytes" below 1,024; else "<k> KB" rounded half up to one decimal, integers only. */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  const tenths = Math.floor((bytes * 10 + 512) / 1024);
  return `${String(Math.floor(tenths / 10))}.${String(tenths % 10)} KB`;
}