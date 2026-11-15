// Feature: trace-reducer. Properties 14 and 15: the Trace_Fingerprint.
// A fingerprint for telling traces apart, not a security measure. Evidence, not proof.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { traceFingerprint } from "../reducer/fingerprint";
import type { OutputEvent } from "../types";
import { arbEdge, bannedIn, deep, refFingerprint } from "./reducer-arbitraries";

describe("trace-reducer fingerprint properties", () => {
  // Feature: trace-reducer, Property 14: Trace_Fingerprint is FNV-1a 64-bit over the Edge_Lines
  it("Property 14: the fingerprint is FNV-1a 64-bit over the edge lines", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbEdge, fc.option(fc.dictionary(fc.constantFrom("x", "note", "appliedCycle"), fc.integer()), { nil: undefined })), {
          maxLength: 60,
        }),
        (pairs) => {
          const plain: OutputEvent[] = pairs.map(([e]) => ({ ...e }));
          const extra = pairs.map(([e, x]) => (x === undefined ? { ...e } : { ...x, ...e }));
          const snap = deep(extra);
          const f = traceFingerprint(extra);
          expect(typeof f).toBe("string");
          expect(f).toMatch(/^[0-9a-f]{16}$/);
          expect(f).toBe(refFingerprint(plain));
          expect(traceFingerprint(plain)).toBe(f);
          expect(traceFingerprint(deep(extra))).toBe(f);
          expect(extra).toStrictEqual(snap);
          expect(bannedIn(f as string)).toStrictEqual([]);
        },
      ),
      { seed: 20261214, numRuns: 300 },
    );
  }, 60_000);

  // Feature: trace-reducer, Property 15: Trace_Fingerprint rejects bad input without throwing
  it("Property 15: bad edge lists are rejected without throwing", () => {
    const badCycle = fc.constantFrom<unknown>(-1, 1.5, Number.NaN, "3", null, 2 ** 53, undefined);
    const badSignal = fc.constantFrom<unknown>(1, null, undefined, {}, ["s"]);
    const badValue = fc.constantFrom<unknown>("0", true, "Input", 2, null, undefined);
    fc.assert(
      fc.property(
        fc.oneof(
          fc.anything().map((x) => ({ kind: "any" as const, x })),
          fc
            .tuple(
              fc.array(arbEdge, { minLength: 1, maxLength: 10 }),
              fc.array(
                fc.tuple(fc.nat(), fc.constantFrom("cycle", "signal", "value", "object", "hole"), badCycle, badSignal, badValue),
                { minLength: 1, maxLength: 3 },
              ),
            )
            .map(([edges, corr]) => {
              const arr: unknown[] = edges.map((e) => ({ ...e }));
              for (const [at, what, c, s, v] of corr) {
                const i = at % arr.length;
                const el = arr[i];
                const isObj = typeof el === "object" && el !== null;
                if (what === "cycle" && isObj) (el as Record<string, unknown>).cycle = c;
                if (what === "signal" && isObj) (el as Record<string, unknown>).signal = s;
                if (what === "value" && isObj) (el as Record<string, unknown>).value = v;
                if (what === "object") arr[i] = 5;
                if (what === "hole") delete arr[i];
              }
              // Reference scan written from Requirement 14.5: lowest index, then object, cycle, signal, value.
              let lowest = -1;
              let field = "";
              for (let i = 0; i < arr.length && lowest < 0; i++) {
                const el = arr[i] as Record<string, unknown> | undefined;
                if (!(i in arr) || typeof el !== "object" || el === null) [lowest, field] = [i, "edge"];
                else if (typeof el.cycle !== "number" || !Number.isSafeInteger(el.cycle) || (el.cycle as number) < 0) [lowest, field] = [i, "cycle"];
                else if (typeof el.signal !== "string") [lowest, field] = [i, "signal"];
                else if (el.value !== 0 && el.value !== 1 && el.value !== "input") [lowest, field] = [i, "value"];
              }
              return { kind: "corrupt" as const, x: arr, lowest, field };
            }),
        ),
        (c) => {
          let out: unknown;
          expect(() => {
            out = traceFingerprint(c.x);
          }).not.toThrow();
          if (typeof out === "string") {
            expect(c.kind).toBe("any");
            expect(Array.isArray(c.x)).toBe(true);
            expect(bannedIn(out)).toStrictEqual([]);
            return;
          }
          const e = out as { kind: string; message: string; index?: number; field?: string };
          expect(e.kind).toBe("invalid-input");
          expect(bannedIn(e.message)).toStrictEqual([]);
          if (!Array.isArray(c.x)) {
            expect(e.message).toBe("The input is not a list.");
            return;
          }
          if (c.kind === "corrupt") {
            expect(c.lowest).toBeGreaterThanOrEqual(0);
            expect(e.index).toBe(c.lowest);
            expect(e.field).toBe(c.field);
          }
        },
      ),
      { seed: 20261215, numRuns: 300 },
    );
  }, 60_000);
});