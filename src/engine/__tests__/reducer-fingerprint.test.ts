// Feature: trace-reducer. Trace_Fingerprint vectors. Evidence, not proof.
import { describe, expect, it } from "vitest";
import { fingerprintBytes, traceFingerprint } from "../reducer/fingerprint";

describe("trace-reducer fingerprint vectors", () => {
  it("the empty list gives the FNV-1a 64-bit offset basis", () => {
    expect(traceFingerprint([])).toBe("cbf29ce484222325");
    expect(fingerprintBytes(new Uint8Array())).toBe("cbf29ce484222325");
  });
  it("the single byte of a gives af63dc4c8601ec8c", () => {
    expect(fingerprintBytes(new Uint8Array([0x61]))).toBe("af63dc4c8601ec8c");
  });
  it("the glossary edge lines give the fingerprint of their exact bytes", () => {
    const enc = new TextEncoder();
    expect(traceFingerprint([{ cycle: 0, signal: "LED", value: "input" }])).toBe(fingerprintBytes(enc.encode('[0,"LED","input"]\n')));
    expect(traceFingerprint([{ cycle: 24000, signal: "LED", value: 1 }])).toBe(fingerprintBytes(enc.encode('[24000,"LED",1]\n')));
    expect(
      traceFingerprint([
        { cycle: 0, signal: "LED", value: "input" },
        { cycle: 24000, signal: "LED", value: 1 },
      ]),
    ).toBe(fingerprintBytes(enc.encode('[0,"LED","input"]\n[24000,"LED",1]\n')));
  });
  it("a non-list gives invalid-input", () => {
    expect(traceFingerprint(null)).toStrictEqual({ kind: "invalid-input", message: "The input is not a list.", field: "edges" });
  });
});