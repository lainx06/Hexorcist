import { createHash } from "node:crypto";

export type RecordVerdict = "BROKE" | "HELD" | "COULDN'T TELL";

export interface VerdictRecord {
  verdict: RecordVerdict;
  exitCode: number;
  hexSha256: string;
  fingerprint: string | null;
}

const VERDICTS: readonly string[] = ["BROKE", "HELD", "COULDN'T TELL"];
const HASH_RE = /^[0-9a-f]{64}$/;

/** Lowercase hex SHA-256 of the raw bytes. No BOM or CR normalisation. */
export const hexSha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

/** Keys in fixed order, LF line endings, exactly one trailing LF. */
export function serializeRecord(r: VerdictRecord): string {
  const obj = {
    verdict: r.verdict,
    exitCode: r.exitCode,
    hexSha256: r.hexSha256,
    fingerprint: r.fingerprint,
  };
  return JSON.stringify(obj, null, 2) + "\n";
}

/** Returns the record, or null for anything unreadable, unparseable or mistyped. */
export function parseRecord(text: string): VerdictRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.verdict !== "string" || !VERDICTS.includes(o.verdict)) return null;
  if (typeof o.exitCode !== "number" || !Number.isInteger(o.exitCode)) return null;
  if (typeof o.hexSha256 !== "string" || !HASH_RE.test(o.hexSha256)) return null;
  if (o.fingerprint !== null && typeof o.fingerprint !== "string") return null;
  return {
    verdict: o.verdict as RecordVerdict,
    exitCode: o.exitCode,
    hexSha256: o.hexSha256,
    fingerprint: o.fingerprint,
  };
}
