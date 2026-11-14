// Feature: gremlin-engine, Property 23 (pure half): ADC count round trip.
// Task 7.3. Validates: Requirements 2.4, 2.5.
// Exhaustive over counts 0 to 1023, so no random generator is used. This is
// evidence for the mapping, not a proof of correctness.
import { describe, expect, it } from "vitest";
import { ADC_FULL_SCALE_VOLTS, analogCountToVolts } from "../adc-scale";

// mirror of adc.js:109-110 (single-ended input, reference voltage 5 V)
function quotedConversion(voltage: number, referenceVoltage: number): number {
  const rawValue = (voltage / referenceVoltage) * 1024;
  return Math.min(Math.max(Math.floor(rawValue), 0), 1023);
}

describe("adc-scale (Property 23, pure half)", () => {
  it("full scale is 5 volts", () => {
    expect(ADC_FULL_SCALE_VOLTS).toBe(5);
  });

  it("round trips every count from 0 to 1023 through the quoted formula", () => {
    const failures: Array<{ count: number; volts: number; got: number }> = [];
    for (let c = 0; c <= 1023; c++) {
      const volts = analogCountToVolts(c);
      const got = quotedConversion(volts, ADC_FULL_SCALE_VOLTS);
      if (got !== c) failures.push({ count: c, volts, got });
    }
    expect(failures).toEqual([]);
  });
});
