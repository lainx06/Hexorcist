// Feature: bench-ui-core. Field validation and counter texts. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkRuns, checkSeed, RUNS_MESSAGE, SEED_MESSAGE } from "../../src/ui/app/model/fields";
import { candidatesText, elapsedText, eventsText, progressText, shrinkText } from "../../src/ui/app/model/format";

const textArb = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.integer({ min: -5, max: 5_000_000_000 }).map(String),
  fc.integer({ min: 0, max: 2000 }).map((n) => `00${n}`),
  fc.constantFrom("", " 24", "24 ", "1e2", "+5", "-0", "4294967295", "4294967296", "1000", "1001", "0"),
);

describe("Run_Count and Campaign_Seed fields", () => {
  it("Property 21: accepts exactly the digit strings in range", () => {
    // Feature: bench-ui-core, Property 21: Run_Count and Campaign_Seed validation
    fc.assert(
      fc.property(textArb, (s) => {
        const digits = /^[0-9]+$/.test(s);
        const r = checkRuns(s);
        const k = checkSeed(s);
        const runsOk = digits && BigInt(s) >= 1n && BigInt(s) <= 1000n;
        const seedOk = digits && BigInt(s) <= 4294967295n;
        expect(r.ok).toBe(runsOk);
        expect(k.ok).toBe(seedOk);
        if (r.ok) expect(r.value).toBe(Number(BigInt(s)));
        else expect(r.message).toBe(RUNS_MESSAGE);
        if (k.ok) expect(k.value).toBe(Number(BigInt(s)));
        else expect(k.message).toBe(SEED_MESSAGE);
      }),
      { seed: 2101, numRuns: 300 },
    );
  });

  it("uses the exact messages", () => {
    expect(RUNS_MESSAGE).toBe("The gremlins can't do half a run. Enter a whole number of runs from 1 to 1000.");
    expect(SEED_MESSAGE).toBe("The gremlins don't recognise that seed. Use a whole number from 0 to 4294967295.");
    expect(checkRuns("24")).toEqual({ ok: true, value: 24 });
    expect(checkSeed("20261101")).toEqual({ ok: true, value: 20261101 });
    expect(checkRuns("0").ok).toBe(false);
    expect(checkRuns("1001").ok).toBe(false);
    expect(checkSeed("4294967296").ok).toBe(false);
  });
});

describe("progress and count texts", () => {
  it("Property 23: elapsed and count texts follow their patterns", () => {
    // Feature: bench-ui-core, Property 23: Progress and count texts
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 1, max: 1000 }), (msv, k, n) => {
        const s = Math.floor(msv / 1000);
        const m = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, "0");
        expect(elapsedText(msv)).toBe(`Elapsed ${m}:${ss}`);
        expect(progressText(k, n)).toBe(`Completed ${k} / ${n} runs`);
        expect(eventsText(k)).toBe(k === 1 ? "1 event" : `${k} events`);
        expect(candidatesText(k)).toBe(`Candidates tried: ${k}`);
        expect(shrinkText(n, k)).toBe(`${eventsText(n)} -> ${eventsText(k)}`);
      }),
      { seed: 2301, numRuns: 200 },
    );
  });

  it("examples", () => {
    expect(elapsedText(0)).toBe("Elapsed 0:00");
    expect(elapsedText(59_999)).toBe("Elapsed 0:59");
    expect(elapsedText(60_000)).toBe("Elapsed 1:00");
    expect(elapsedText(3_665_000)).toBe("Elapsed 61:05");
    expect(shrinkText(8, 3)).toBe("8 events -> 3 events");
    expect(eventsText(1)).toBe("1 event");
    expect(progressText(17, 64)).toBe("Completed 17 / 64 runs");
  });
});