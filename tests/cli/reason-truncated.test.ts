import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckInput } from "../../cli/input-loader";
import { isReasonTruncated, toJson } from "../../cli/run-check";
import type { CheckOutcome } from "../../cli/run-check";
import { REASON_MAX_LENGTH, computeVerdict } from "../../src/engine/verdict";

type Ok = Extract<CheckOutcome, { ok: true }>;

const input = { ruleSentences: [], gremlinSet: [{ id: "masher" }], campaignSeed: 1, runs: 5 } as unknown as CheckInput;

const outcome = (reason: string, uses: { peripheral: string }[] = []): Ok => {
  const verdict = { verdict: "COULDN'T TELL" as const, reason };
  return {
    ok: true,
    result: {
      verdict,
      campaign: {
        runsCompleted: 5,
        requestedRuns: 5,
        violatingRunIndex: null,
        verdict,
        coverage: {} as never,
        totalCycles: 0,
        ...(uses.length > 0 ? { peripheralUses: { runIndex: 0, uses: uses as never } } : {}),
      },
    },
  };
};

const PREFIX = "Signals not mapped to a pin: ";
const SUFFIX = "; No gremlin produced an event in any run";

/** The text the engine builds before cutting, for one unmapped signal name and no runs. */
const fullText = (name: string): string => `${PREFIX}${name}${SUFFIX}`;

/** Engine reason for one unmapped signal name, with no runs (so the "no gremlin event" part is added). */
function engineReason(name: string): string {
  const v = computeVerdict({ requestedRuns: 0, runs: [], finished: true, unmappedSignals: [name], unsupportedPeripherals: [] });
  if (v === null || v.verdict !== "COULDN'T TELL") throw new Error("expected COULDN'T TELL");
  return v.reason;
}

/** A name that makes the full engine text exactly `total` UTF-16 units long. */
const nameForTotal = (total: number): string => "a".repeat(total - PREFIX.length - SUFFIX.length);

const jsonOf = (reason: string): Record<string, unknown> => JSON.parse(toJson(input, outcome(reason), "0.0.0")) as Record<string, unknown>;

describe("reasonTruncated", () => {
  it("Feature: headless-runner, Property 8: reasonTruncated reports the engine's cut", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9_]{1,260}$/),
        (name) => {
          const full = fullText(name);
          fc.pre(full.length !== REASON_MAX_LENGTH);
          const reason = engineReason(name);
          const parsed = jsonOf(reason);
          expect(parsed.reason).toBe(reason);
          expect(reason.length).toBeLessThanOrEqual(REASON_MAX_LENGTH);
          expect(parsed.reasonTruncated).toBe(full.length > REASON_MAX_LENGTH);
          expect(Object.keys(parsed).slice(-3)).toEqual(["reason", "reasonTruncated", "peripherals"]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("199 units: not cut, reads false", () => {
    const reason = engineReason(nameForTotal(199));
    expect(reason.length).toBe(199);
    expect(isReasonTruncated(reason)).toBe(false);
    expect(jsonOf(reason).reasonTruncated).toBe(false);
  });

  it("200 units, not cut: documented blind spot, reads true", () => {
    const name = nameForTotal(200);
    expect(fullText(name).length).toBe(200);
    const reason = engineReason(name);
    expect(reason).toBe(fullText(name));
    expect(isReasonTruncated(reason)).toBe(true);
    expect(jsonOf(reason).reasonTruncated).toBe(true);
  });

  it("201 units: cut to 200, reads true", () => {
    const name = nameForTotal(201);
    const reason = engineReason(name);
    expect(reason.length).toBe(200);
    expect(reason).toBe(fullText(name).slice(0, 200));
    expect(isReasonTruncated(reason)).toBe(true);
    expect(jsonOf(reason).reasonTruncated).toBe(true);
  });

  it("surrogate pair cut back to 199 units: documented blind spot, reads false although the engine cut", () => {
    // The high surrogate lands on index 199, so the engine backs off one unit.
    const name = `${"a".repeat(DEFAULT_PAD)}\u{1F600}`;
    const full = fullText(name);
    expect(full.length).toBeGreaterThan(REASON_MAX_LENGTH);
    expect(full.charCodeAt(199)).toBeGreaterThanOrEqual(0xd800);
    const reason = engineReason(name);
    expect(reason.length).toBe(199);
    expect(isReasonTruncated(reason)).toBe(false);
    expect(jsonOf(reason).reasonTruncated).toBe(false);
  });

  it("lists peripheral ids from the campaign in order, without repeats, and [] when none", () => {
    const withUses = JSON.parse(toJson(input, outcome("r", [{ peripheral: "USART0" }, { peripheral: "EEPROM" }, { peripheral: "USART0" }]), "0.0.0")) as Record<string, unknown>;
    expect(withUses.peripherals).toEqual(["USART0", "EEPROM"]);
    expect(jsonOf("r").peripherals).toEqual([]);
  });
});

const DEFAULT_PAD = 199 - PREFIX.length;
