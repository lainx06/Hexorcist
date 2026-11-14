// Property 9 (rule-compiler): rejection position of the Sentence_Parser.
// Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { render } from "../rules/render";
import { parse } from "../rules/parse";
import { arbRule } from "./rules-arbitraries";
import { oracleAllowsChar, oracleAllowsEnd } from "./rules-prefix-oracle";

const SEED_P9 = 3051882277;
const NUM_RUNS_P9 = 200;

const arbPrintable = fc.integer({ min: 0x20, max: 0x7e }).map((c) => String.fromCharCode(c));

type Change = { kind: "insert" | "delete" | "replace"; n: number; ch: string };

const arbChange: fc.Arbitrary<Change> = fc.record({
  kind: fc.constantFrom("insert", "delete", "replace") as fc.Arbitrary<Change["kind"]>,
  n: fc.nat(),
  ch: arbPrintable,
});

function charText(ch: string): string {
  return ch === " " ? "a space" : `"${ch}"`;
}

describe("rule-compiler Property 9: rejection position", () => {
  // Feature: rule-compiler, Property 9: Rejection position
  // Validates: Requirements 3.4, 3.9
  it("Property 9: a rejection names a position and characters the Prefix_Oracle allows", () => {
    let rejected = 0;
    let accepted = 0;

    fc.assert(
      fc.property(arbRule, arbChange, (rule, change) => {
        const r0 = render(rule);
        if (!r0.ok) throw new Error(`generator produced a Rule that render refuses: ${r0.reason}`);
        const s0 = r0.sentence;

        let i: number;
        let s: string;
        if (change.kind === "insert") {
          i = change.n % (s0.length + 1);
          s = s0.slice(0, i) + change.ch + s0.slice(i);
        } else if (change.kind === "delete") {
          i = change.n % s0.length;
          s = s0.slice(0, i) + s0.slice(i + 1);
        } else {
          i = change.n % s0.length;
          const ch = change.ch === s0[i] ? (change.ch === "a" ? "b" : "a") : change.ch;
          s = s0.slice(0, i) + ch + s0.slice(i + 1);
        }

        const r = parse(s);
        if (r.ok) {
          accepted++;
          const back = render(r.rule);
          expect(back.ok, `render refused the parsed Rule for ${JSON.stringify(s)}`).toBe(true);
          if (back.ok) expect(back.sentence).toBe(s);
          return;
        }

        rejected++;
        const P = r.position;
        expect(P, `position ${P} is before the change at ${i} in ${JSON.stringify(s)}`).toBeGreaterThanOrEqual(i);
        expect(P).toBeLessThanOrEqual(s.length);
        const prefix = s.slice(0, P);

        for (const item of r.allowed) {
          if ("end" in item) {
            expect(oracleAllowsEnd(prefix), `end of text not allowed at ${P} of ${JSON.stringify(s)}`).toBe(true);
            continue;
          }
          for (let c = item.from.charCodeAt(0); c <= item.to.charCodeAt(0); c++) {
            const ch = String.fromCharCode(c);
            const v = oracleAllowsChar(prefix, ch);
            expect(v.viable, `${charText(ch)} not allowed at ${P} of ${JSON.stringify(s)}`).toBe(true);
            if (v.viable && v.sentence !== null) {
              expect(v.sentence.startsWith(prefix + ch)).toBe(true);
            }
            if (v.viable && v.complete && v.sentence !== null) {
              expect(v.sentence).toBe(prefix + ch);
            }
          }
          if (item.from === item.to) {
            expect(r.reason).toContain(charText(item.from));
          } else {
            expect(r.reason).toContain(`${charText(item.from)} to ${charText(item.to)}`);
          }
        }

        expect(r.reason).toContain(`position ${P} (counting from 0)`);
        const named = r.allowed
          .map((item) =>
            "end" in item
              ? "the end of the text"
              : item.from === item.to
                ? charText(item.from)
                : `${charText(item.from)} to ${charText(item.to)}`,
          )
          .join(", ");
        expect(r.reason).toBe(`No rule template matches at position ${P} (counting from 0); allowed there: ${named}.`);
      }),
      { seed: SEED_P9, numRuns: NUM_RUNS_P9 },
    );

    const summary = `rejected=${rejected} accepted=${accepted}`;
    console.log(`Property 9 seed=${SEED_P9} numRuns=${NUM_RUNS_P9} ${summary}`);

    expect(rejected, `outcome "rejected" never seen; counters: ${summary}`).toBeGreaterThan(0);
    expect(accepted, `outcome "accepted" never seen; counters: ${summary}`).toBeGreaterThan(0);
  });
});
