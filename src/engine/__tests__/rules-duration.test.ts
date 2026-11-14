import { describe, expect, it } from "vitest";
import {
  clockRate,
  cycleLimit,
  formatDuration,
  isDurationMs,
  windowCycles,
} from "../rules/duration";
import type { Fixture } from "../types";

const HZ = 16_000_000;
const NOT_WHOLE = "window not a whole number of cycles";
const BAD_CLOCK = "clock rate is not a whole number of hertz";

describe("windowCycles at 16,000,000 Hz (acceptance literals of Req 5.5 and 5.7)", () => {
  it("gives exact cycle counts", () => {
    expect(windowCycles(300, HZ)).toEqual({ ok: true, cycles: 4_800_000n });
    expect(windowCycles(0.1, HZ)).toEqual({ ok: true, cycles: 1_600n });
    expect(windowCycles(0.0000625, HZ)).toEqual({ ok: true, cycles: 1n });
    expect(windowCycles(9_999_999, HZ)).toEqual({ ok: true, cycles: 159_999_984_000n });
  });

  it("rejects windows that are not a whole number of cycles", () => {
    for (const ms of [0.0001, 0.0000001, 9_999_999.9999999]) {
      expect(windowCycles(ms, HZ)).toEqual({ ok: false, reason: NOT_WHOLE });
    }
  });
});

describe("windowCycles beyond 2^53 - 1", () => {
  it("is exact as a BigInt and cycleLimit gives Infinity", () => {
    const clock = Number.MAX_SAFE_INTEGER;
    const r = windowCycles(2000, clock);
    expect(r).toEqual({ ok: true, cycles: 2n * BigInt(clock) });
    if (r.ok) {
      expect(r.cycles > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(cycleLimit(r.cycles)).toBe(Infinity);
    }
  });

  it("cycleLimit is exact up to 2^53 - 1", () => {
    expect(cycleLimit(4_800_000n)).toBe(4_800_000);
    expect(cycleLimit(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(cycleLimit(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(Infinity);
  });
});

describe("clockRate and clock validation", () => {
  const base = { clockHz: undefined } as unknown as Fixture;

  it("defaults to 16,000,000 for undefined and null clockHz", () => {
    expect(clockRate(base)).toBe(16_000_000);
    expect(clockRate({ clockHz: null } as unknown as Fixture)).toBe(16_000_000);
  });

  it("gives only the clock reason for a bad clock", () => {
    for (const clock of [0, -1, 16_000_000.5, NaN, Infinity, "16000000"]) {
      expect(windowCycles(300, clock)).toEqual({ ok: false, reason: BAD_CLOCK });
    }
    // The clock check runs first, even when the window is also not whole.
    expect(windowCycles(0.0000001, 0)).toEqual({ ok: false, reason: BAD_CLOCK });
  });
});

describe("isDurationMs", () => {
  it("accepts valid durations", () => {
    for (const x of [300, 300.0, 3e2, 0.0000625, 0.0000001]) {
      expect(isDurationMs(x), String(x)).toBe(true);
    }
  });

  it("rejects invalid durations", () => {
    for (const x of [0.00000001, 10_000_000, 0.30000000000000004, 0, -1, -0.5, NaN, Infinity]) {
      expect(isDurationMs(x), String(x)).toBe(false);
    }
  });
});

describe("formatDuration", () => {
  it("writes plain decimal text", () => {
    expect(formatDuration(300)).toBe("300");
    expect(formatDuration(0.1)).toBe("0.1");
    expect(formatDuration(5e-7)).toBe("0.0000005");
    expect(formatDuration(2.5)).toBe("2.5");
  });
});
