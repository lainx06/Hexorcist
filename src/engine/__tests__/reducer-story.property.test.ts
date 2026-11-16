// Feature: trace-reducer. Properties 11, 12 and 13: the Failure_Story and Ms_Text.
// Passing runs are evidence, not proof. No wall clock, no random source.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { BANNED_WORDS } from "../copy-rules";
import { failureStory, msText } from "../reducer/story";
import { arbStoryCase, bannedIn, deep, refMsText, refStory } from "./reducer-arbitraries";
import type { StoryCase } from "./reducer-arbitraries";

function sentencesOf(text: string, rule: string): string[] {
  // Replace the rule text with a placeholder so its periods do not split sentences.
  // The placeholder keeps the final period of the rule, which ends its sentence.
  const masked = text.split(rule).join("\u0000RULE\u0000.");
  const parts = masked.split(/(?<=\.) (?=[A-Z])/);
  return parts.map((p) => p.split("\u0000RULE\u0000.").join(rule));
}

describe("trace-reducer failure story properties", () => {
  // Feature: trace-reducer, Property 11: Failure_Story structure
  it("Property 11: the failure story has the fixed structure", () => {
    const n = { detailedForm: 0, summaryForm: 0, zeroEvents: 0, withSpan: 0, cutSpan: 0 };
    fc.assert(
      fc.property(arbStoryCase, (c) => {
        const snap = deep(c);
        const ref = refStory(c);
        const out = failureStory(c);
        if (ref === "does-not-fit") {
          expect(typeof out).toBe("object");
          return;
        }
        expect(typeof out).toBe("string");
        const text = out as string;
        expect(text).toBe(ref.text);
        expect(failureStory(deep(c))).toBe(text);
        expect(deep(c)).toStrictEqual(snap);
        expect(text).not.toMatch(/[\n\r]/);
        const rule = c.violation.rule;
        const ss = sentencesOf(text, rule);
        expect(ss.length).toBeGreaterThanOrEqual(2);
        expect(ss.length).toBeLessThanOrEqual(4);
        expect(ss.join(" ")).toBe(text);
        for (const s of ss) expect(s.endsWith(".")).toBe(true);
        expect(text.startsWith("In the smallest replay this reducer found,")).toBe(true);
        expect(text.split("the smallest replay this reducer found").length - 1).toBe(1);
        expect(text.split(rule).join("").split("smallest").length - 1).toBe(1);
        const gremlins = c.reducedList.filter((e) => e.gremlinId !== "rest");
        for (const g of new Set(gremlins.map((e) => e.gremlinId))) expect(text).toContain(g);
        for (const s of ss) {
          const outside = s.split(rule).join("");
          expect(outside.split(" ").filter((w) => w.length > 0).length).toBeLessThanOrEqual(30);
        }
        const vIdx = c.violationSpan === undefined ? ss.length - 1 : ss.length - 2;
        expect(ss[vIdx]).toContain(msText(c.violation.cycle));
        expect(ss[vIdx].endsWith(rule)).toBe(true);
        if (c.violationSpan !== undefined) {
          n.withSpan++;
          const last = ss[ss.length - 1];
          expect(last).toContain(msText(c.violationSpan.lengthCycles));
          expect(last.includes("at least ")).toBe(c.violationSpan.cut);
          if (c.violationSpan.cut) n.cutSpan++;
        }
        if (gremlins.length === 0) {
          n.zeroEvents++;
          expect(ss[0]).toContain("no gremlin event was needed");
          expect(ss.length).toBe(c.violationSpan === undefined ? 2 : 3);
        }
        if (ref.form === "detailed") n.detailedForm++;
        if (ref.form === "summary") n.summaryForm++;
        // Every number outside the rule and the names is allowed by Requirement 13.9.
        const allowed = new Set<string>();
        const cycles = [...c.reducedList.map((e) => e.cycle), c.violation.cycle, ...c.outputEdges.map((e) => e.cycle)];
        if (c.violationSpan !== undefined) cycles.push(c.violationSpan.lengthCycles);
        for (const cy of cycles) allowed.add(msText(cy).replace(" ms", ""));
        for (const grp of String(c.violation.cycle).replace(/\B(?=(\d{3})+(?!\d))/g, ",").split(",")) allowed.add(grp);
        for (const e of c.reducedList) {
          const a = (e as { analog?: number }).analog;
          if (a !== undefined) allowed.add(String(a));
          const v = (e as { value?: unknown }).value;
          if (v === 0 || v === 1) allowed.add(String(v));
        }
        for (let k = 0; k <= c.reducedList.length; k++) allowed.add(String(k));
        let outside = text.split(rule).join(" ");
        for (const e of c.reducedList) outside = outside.split(e.gremlinId).join(" ").split(e.signal).join(" ");
        for (const m of outside.match(/\d+(\.\d)?/g) ?? []) expect(allowed.has(m), m).toBe(true);
        expect(bannedIn(text)).toStrictEqual([]);
      }),
      { seed: 20261211, numRuns: 300 },
    );
    console.log(`Property 11 counters ${JSON.stringify(n)}`);
    for (const [k, v] of Object.entries(n)) expect(v, k).toBeGreaterThan(0);
  }, 60_000);

  // Feature: trace-reducer, Property 12: Failure_Story rejects bad input without throwing
  it("Property 12: bad story inputs are rejected without throwing", () => {
    type K = "cycle" | "signal" | "value" | "analog" | "gremlinId" | "violation" | "edge" | "span" | "banned" | "long";
    fc.assert(
      fc.property(
        fc.oneof(
          fc.anything().map((x) => ({ kind: "any" as const, x, field: null as string | null })),
          fc
            .tuple(
              arbStoryCase.filter((c) => c.reducedList.some((e) => e.gremlinId !== "rest")),
              fc.constantFrom<K>("cycle", "signal", "value", "analog", "gremlinId", "violation", "edge", "span", "banned", "long"),
              fc.constantFrom(...BANNED_WORDS),
              fc.nat(),
            )
            .map(([c0, what, word, at]) => {
              const c = deep(c0) as StoryCase & Record<string, unknown>;
              const gi = c.reducedList.map((e, i) => (e.gremlinId !== "rest" ? i : -1)).filter((i) => i >= 0);
              const i = gi[at % gi.length];
              const e = c.reducedList[i] as unknown as Record<string, unknown>;
              let field: string | null = what;
              if (what === "cycle") e.cycle = -3;
              if (what === "signal") e.signal = "NOPE_PIN";
              if (what === "gremlinId") e.gremlinId = 42;
              if (what === "value") {
                if ("analog" in e) {
                  delete e.analog;
                  e.value = 1;
                  field = "value";
                } else e.value = 7;
              }
              if (what === "analog") {
                if ("analog" in e) e.analog = 2000;
                else {
                  delete e.value;
                  e.analog = 3;
                }
                field = "analog";
              }
              if (what === "violation") c.violation = { rule: "", cycle: 1 };
              if (what === "edge") {
                c.outputEdges = [...c.outputEdges, { signal: "OUT", value: 9 as unknown as 0, cycle: 1 }];
                field = "outputEdges";
              }
              if (what === "span") {
                c.violationSpan = { lengthCycles: -1, cut: true };
                field = "violationSpan";
              }
              if (what === "banned") {
                e.gremlinId = `g ${word} x`;
                field = "gremlinId";
              }
              if (what === "long") {
                for (const j of gi) (c.reducedList[j] as unknown as Record<string, unknown>).gremlinId = `w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16 w17 w18 w19 w20 w21 w22 w23 w24 n${j}`;
                field = "reducedList";
              }
              return { kind: "corrupt" as const, x: c as unknown, field, what };
            }),
        ),
        (c) => {
          let out: unknown;
          expect(() => {
            out = failureStory(c.x);
          }).not.toThrow();
          if (c.kind === "any") {
            expect(typeof out === "object" && out !== null).toBe(true);
            return;
          }
          const e = out as { kind: string; field?: string; message: string };
          expect(typeof e).toBe("object");
          expect(e.kind).toBe("invalid-input");
          if (c.what === "signal") expect(e.field).toBe("signal");
          else if (c.what === "value" || c.what === "analog") expect(["value", "analog", "signal"]).toContain(e.field);
          else expect(e.field).toBe(c.field);
          if (c.what === "long") expect(e.message).toContain("the story does not fit in 4 sentences of at most 30 words");
          expect(failureStory(deep(c.x))).toStrictEqual(out);
        },
      ),
      { seed: 20261212, numRuns: 300 },
    );
  }, 60_000);

  // Feature: trace-reducer, Property 13: Ms_Text is the 1-decimal millisecond text of cycles / 16,000
  it("Property 13: msText is cycles / 16,000 with 1 decimal", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.maxSafeNat(),
          fc.integer({ min: 0, max: 100_000_000 }),
          fc.tuple(fc.integer({ min: 0, max: 5_000_000 }), fc.integer({ min: -2, max: 2 })).map(([k, d]) => Math.max(0, k * 1600 + 800 + d)),
          fc.tuple(fc.integer({ min: 0, max: 500_000 }), fc.integer({ min: -2, max: 2 })).map(([k, d]) => Math.max(0, k * 16000 + d)),
        ),
        (c) => {
          const s = msText(c);
          expect(s).toMatch(/^\d+\.\d ms$/);
          expect(s).toBe(refMsText(c));
        },
      ),
      { seed: 20261213, numRuns: 500 },
    );
  }, 60_000);
});