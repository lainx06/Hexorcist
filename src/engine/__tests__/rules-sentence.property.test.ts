// Feature: rule-compiler, Property 1: Sentence round trip
// Validates: Requirements 3.5, 3.1, 2.5, 2.6, 15.5, 15.7
// Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { render } from "../rules/render";
import { parse } from "../rules/parse";
import type { Condition, Rule } from "../rules/ir";
import { arbMutatedPair, arbRule } from "./rules-arbitraries";

const SEED = 1130261104;
const NUM_RUNS = 200;

/** Deep copy with every object's keys in reversed order. */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function collectOps(c: Condition, seen: Set<string>): void {
  seen.add(c.op);
  if (c.op === "all" || c.op === "any") for (const m of c.of) collectOps(m, seen);
}

function conditionsOf(r: Rule): Condition[] {
  switch (r.form) {
    case "never":
    case "notLongerThan":
      return [r.condition];
    case "respond":
      return [r.trigger.of, r.expect];
    case "count":
      return [r.edge.of];
    case "hold":
      return [r.after.of, r.expect];
  }
}

function durationOf(r: Rule): number | undefined {
  switch (r.form) {
    case "respond":
      return r.withinMs;
    case "count":
      return r.windowMs;
    case "hold":
      return r.durationMs;
    case "notLongerThan":
      return r.ms;
    default:
      return undefined;
  }
}

describe("Property 1: Sentence round trip", () => {
  it("parse(render(r).sentence) equals r, and the sentence has the Req 2.5 shape", () => {
    let never = 0;
    let respond = 0;
    let count = 0;
    let hold = 0;
    let notLongerThan = 0;
    let eq = 0;
    let above = 0;
    let below = 0;
    let all = 0;
    let any = 0;
    let maxIsOne = 0;
    let maxNotOne = 0;
    let durationWhole = 0;
    let durationFraction = 0;

    fc.assert(
      fc.property(arbRule, (r) => {
        const before = structuredClone(r);
        const rendered = render(r);
        expect(rendered.ok).toBe(true);
        if (!rendered.ok) return;
        const s = rendered.sentence;

        const parsed = parse(s);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.rule).toEqual(r);

        // Req 2.5: printable ASCII, single spaces, one final period, other periods only inside numbers.
        expect(/^[\x20-\x7e]+$/.test(s)).toBe(true);
        expect(s.includes("  ")).toBe(false);
        expect(s.startsWith(" ") || s.endsWith(" ")).toBe(false);
        expect(s.endsWith(".")).toBe(true);
        for (let i = 0; i < s.length - 1; i++) {
          if (s[i] === ".") expect(/\d\.\d/.test(s.slice(i - 1, i + 2))).toBe(true);
        }
        expect(s[s.length - 2]).not.toBe(".");

        // Req 2.6: key order does not matter; r was not changed.
        const reversed = render(reverseKeys(r));
        expect(reversed).toEqual(rendered);
        expect(r).toEqual(before);

        // Req 15.7: same arguments, same results.
        expect(render(r)).toEqual(rendered);
        expect(parse(s)).toEqual(parsed);

        // Req 15.5: plain JSON.
        expect(JSON.parse(JSON.stringify(parsed.rule))).toEqual(parsed.rule);

        // Counters come from the observed parse result.
        const got = parsed.rule;
        if (got.form === "never") never++;
        else if (got.form === "respond") respond++;
        else if (got.form === "count") count++;
        else if (got.form === "hold") hold++;
        else if (got.form === "notLongerThan") notLongerThan++;

        const ops = new Set<string>();
        for (const c of conditionsOf(got)) collectOps(c, ops);
        if (ops.has("eq")) eq++;
        if (ops.has("above")) above++;
        if (ops.has("below")) below++;
        if (ops.has("all")) all++;
        if (ops.has("any")) any++;

        if (got.form === "count") {
          if (got.max === 1) maxIsOne++;
          else maxNotOne++;
        }
        const d = durationOf(got);
        if (d !== undefined) {
          if (Number.isInteger(d)) durationWhole++;
          else durationFraction++;
        }
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );

    const summary =
      `never=${never} respond=${respond} count=${count} hold=${hold} notLongerThan=${notLongerThan} ` +
      `eq=${eq} above=${above} below=${below} all=${all} any=${any} ` +
      `maxIsOne=${maxIsOne} maxNotOne=${maxNotOne} durationWhole=${durationWhole} durationFraction=${durationFraction}`;
    console.log(`Property 1 seed=${SEED} numRuns=${NUM_RUNS} ${summary}`);
    const counters: Array<[string, number]> = [
      ["never", never],
      ["respond", respond],
      ["count", count],
      ["hold", hold],
      ["notLongerThan", notLongerThan],
      ["eq", eq],
      ["above", above],
      ["below", below],
      ["all", all],
      ["any", any],
      ["maxIsOne", maxIsOne],
      ["maxNotOne", maxNotOne],
      ["durationWhole", durationWhole],
      ["durationFraction", durationFraction],
    ];
    for (const [name, n] of counters) {
      expect(n, `outcome "${name}" never seen; counters: ${summary}`).toBeGreaterThan(0);
    }
  });
});

// Feature: rule-compiler, Property 3: No silent change
// Validates: Requirements 3.2, 3.6, 3.3, 3.7
// Evidence, not proof.

const SEED_P3 = 2874510963;
const NUM_RUNS_P3 = 200;

describe("Property 3: No silent change", () => {
  it("parse(s) rejects with a short reason or returns a Rule whose sentence is exactly s", () => {
    let rejected = 0;
    let accepted = 0;

    const arbInput: fc.Arbitrary<{ source: string | undefined; s: string }> = fc.oneof(
      arbMutatedPair,
      fc.string({ unit: "binary", maxLength: 300 }).map((s) => ({ source: undefined, s })),
    );

    fc.assert(
      fc.property(arbInput, ({ source, s }) => {
        const result = parse(s);
        if (result.ok) {
          expect("rule" in result).toBe(true);
          expect(render(result.rule)).toEqual({ ok: true, sentence: s });
          if (source !== undefined && s !== source) accepted++;
        } else {
          expect("rule" in result).toBe(false);
          expect(typeof result.reason).toBe("string");
          expect(result.reason.length).toBeGreaterThanOrEqual(1);
          expect(result.reason.length).toBeLessThanOrEqual(200);
          rejected++;
        }
      }),
      { seed: SEED_P3, numRuns: NUM_RUNS_P3 },
    );

    const summary = `rejected=${rejected} accepted=${accepted}`;
    console.log(`Property 3 seed=${SEED_P3} numRuns=${NUM_RUNS_P3} ${summary}`);
    expect(rejected, `outcome "rejected" never seen; counters: ${summary}`).toBeGreaterThan(0);
    expect(accepted, `outcome "accepted" never seen; counters: ${summary}`).toBeGreaterThan(0);
  });
});
