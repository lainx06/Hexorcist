import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexSha256, parseRecord, serializeRecord } from "../../cli/verdict-record";
import type { VerdictRecord } from "../../cli/verdict-record";

const hex64 = fc.stringMatching(/^[0-9a-f]{64}$/);

const recordArb: fc.Arbitrary<VerdictRecord> = fc.record({
  verdict: fc.constantFrom("BROKE" as const, "HELD" as const, "COULDN'T TELL" as const),
  exitCode: fc.integer({ min: 0, max: 3 }),
  hexSha256: hex64,
  fingerprint: fc.option(fc.stringMatching(/^[0-9a-f]{16}$/), { nil: null }),
});

describe("verdict record", () => {
  // Feature: headless-runner, Property 12: Verdict_Record round trip
  // **Validates: Requirements 7.5, 7.12**
  it("Property 12: round trip, key order, single trailing LF, hash shape", () => {
    fc.assert(
      fc.property(recordArb, (r) => {
        const text = serializeRecord(r);
        expect(parseRecord(text)).toEqual(r);
        expect(Object.keys(JSON.parse(text))).toEqual(["verdict", "exitCode", "hexSha256", "fingerprint"]);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
        expect(text.includes("\r")).toBe(false);
        expect(r.hexSha256).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 12: hexSha256 of any bytes is 64 lowercase hex characters", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (b) => {
        expect(hexSha256(b)).toMatch(/^[0-9a-f]{64}$/);
      }),
      { numRuns: 100 },
    );
  });

  it("Property 12: non-record text parses to null", () => {
    const good = serializeRecord({ verdict: "HELD", exitCode: 0, hexSha256: "a".repeat(64), fingerprint: null });
    const bad = [
      "",
      "not json",
      "null",
      "[]",
      "42",
      "{}",
      good.replace('"HELD"', '"MAYBE"'),
      good.replace('"exitCode": 0', '"exitCode": "0"'),
      good.replace('"exitCode": 0', '"exitCode": 0.5'),
      good.replace("a".repeat(64), "A".repeat(64)),
      good.replace("a".repeat(64), "a".repeat(63)),
      good.replace("null", "7"),
      good.slice(0, -5),
    ];
    for (const t of bad) expect(parseRecord(t)).toBeNull();
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(parseRecord(s)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it("matches the documented example text and a known SHA-256", () => {
    const r: VerdictRecord = { verdict: "BROKE", exitCode: 1, hexSha256: "0".repeat(64), fingerprint: "47078989121ebc1d" };
    expect(serializeRecord(r)).toBe(
      `{\n  "verdict": "BROKE",\n  "exitCode": 1,\n  "hexSha256": "${"0".repeat(64)}",\n  "fingerprint": "47078989121ebc1d"\n}\n`,
    );
    expect(hexSha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
