// Trace_Fingerprint: FNV-1a 64-bit over the ordered output edges, written as 16 lowercase
// hex digits. A fingerprint for telling traces apart, not a security measure.
// Pure: no wall clock, no random source.

import { invalidInput } from "./reducer-error";
import type { ReducerError } from "./types";

const UTF8 = new TextEncoder();

/** The first problem of an output edge list (Requirement 14.5), or null. Never throws. */
export function fingerprintEdgeProblem(
  edges: unknown,
): { index: number | null; field: string; message: string } | null {
  if (!Array.isArray(edges)) return { index: null, field: "edges", message: "the input is not a list" };
  for (let i = 0; i < edges.length; i++) {
    let e: unknown;
    try {
      if (!(i in edges)) return { index: i, field: "edge", message: `Edge ${i}: is not an object.` };
      e = edges[i];
    } catch {
      return { index: i, field: "edge", message: `Edge ${i}: is not an object.` };
    }
    if (typeof e !== "object" || e === null || Array.isArray(e)) {
      return { index: i, field: "edge", message: `Edge ${i}: is not an object.` };
    }
    try {
      const c = (e as { cycle?: unknown }).cycle;
      if (typeof c !== "number" || !Number.isSafeInteger(c) || c < 0) {
        return { index: i, field: "cycle", message: `Edge ${i}: field cycle is not an integer from 0 to 9007199254740991.` };
      }
      if (typeof (e as { signal?: unknown }).signal !== "string") {
        return { index: i, field: "signal", message: `Edge ${i}: field signal is not a string.` };
      }
      const v = (e as { value?: unknown }).value;
      if (v !== 0 && v !== 1 && v !== "input") {
        return { index: i, field: "value", message: `Edge ${i}: field value is not 0, 1 or "input".` };
      }
    } catch {
      return { index: i, field: "edge", message: `Edge ${i}: could not be read.` };
    }
  }
  return null;
}

/** FNV-1a 64-bit over raw bytes, as 16 lowercase hex digits. */
export function fingerprintBytes(bytes: Uint8Array): string {
  const mask = 0xffffffffffffffffn;
  const prime = 0x100000001b3n;
  let h = 0xcbf29ce484222325n;
  for (const b of bytes) h = ((h ^ BigInt(b)) * prime) & mask;
  return h.toString(16).padStart(16, "0");
}

/** Trace_Fingerprint of an ordered list of output edges. Never throws. */
export function traceFingerprint(edges: unknown): string | ReducerError {
  try {
    const bad = fingerprintEdgeProblem(edges);
    if (bad !== null) {
      return invalidInput(
        bad.index === null ? "The input is not a list." : bad.message,
        bad.index === null ? { field: bad.field } : { field: bad.field, index: bad.index },
      );
    }
    let text = "";
    for (const e of edges as { cycle: number; signal: string; value: 0 | 1 | "input" }[]) {
      text += JSON.stringify([e.cycle, e.signal, e.value]) + "\n";
    }
    return fingerprintBytes(UTF8.encode(text));
  } catch {
    return invalidInput("The edge list could not be read.", { field: "edges" });
  }
}