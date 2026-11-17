// Feature: bench-ui-stage, Property 16: Rule preset round-trip and validation
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render } from "../../src/engine/rules/render";
import type { Rule } from "../../src/engine/rules/ir";
import { loadExample } from "../../src/ui/app/data/examples";
import type { ExampleBundle, ExampleId } from "../../src/ui/app/data/examples";
import { EXAMPLE_COPY } from "../../src/ui/app/model/example-copy";
import { checkLimit, LIMIT_REASON, presetFor, presetHeadline, presetRuleText } from "../../src/ui/app/model/presets";
import { checkRuleBox } from "../../src/ui/app/model/rule-box";
import { badLimitTextArb, limitArb } from "./stage-arbitraries";

const SEED = 20261201;
const NUM_RUNS = 200;

function bundle(id: ExampleId): ExampleBundle {
  const r = loadExample(id);
  if (!r.ok) throw new Error(`example ${id} did not load`);
  return r.example;
}

function limitOf(rule: Rule): number | null {
  if (rule.form === "respond") return rule.withinMs;
  if (rule.form === "notLongerThan") return rule.ms;
  return null;
}

function sentencesOf(ruleSet: Rule[]): string[] {
  return ruleSet.map((r) => {
    const out = render(r);
    return out.ok ? out.sentence : "";
  });
}

// Req 12.4 texts, written out here.
const CUSTOM: Record<"garage" | "heartbeat", (n: number) => string> = {
  garage: (n) => `Custom rule: When the beam is blocked, the door must stop closing within ${n} ms.`,
  heartbeat: (n) => `Custom rule: The I'm-alive light must never freeze on or off for ${n} ms.`,
};

const LIMITED = ["garage", "heartbeat"] as const;

describe("Property 16: Rule preset round-trip and validation", () => {
  // Feature: bench-ui-stage, Property 16: Rule preset round-trip and validation
  // **Validates: Requirements 12.2, 12.5**
  for (const id of LIMITED) {
    it(`${id}: render -> parse -> render is stable, the parsed limit equals N, and the Rule_Box_Check accepts it`, () => {
      const ex = bundle(id);
      fc.assert(
        fc.property(fc.oneof(limitArb, fc.constantFrom(1, 60_000)), (n) => {
          const text = presetRuleText(ex, n);
          const checked = checkRuleBox(text, ex.fixture);
          expect(checked.ok).toBe(true);
          if (!checked.ok) return;
          expect(checked.ruleSet.length).toBeGreaterThan(0);
          const limits = checked.ruleSet.map(limitOf).filter((l): l is number => l !== null);
          expect(limits.length).toBeGreaterThan(0);
          for (const l of limits) expect(l).toBe(n);
          const again = sentencesOf(checked.ruleSet).join("\n") + "\n";
          expect(again).toBe(text);
          expect(checked.sentences.join("\n") + "\n").toBe(text);
          const second = checkRuleBox(again, ex.fixture);
          expect(second.ok).toBe(true);
          if (second.ok) expect(second.ruleSet).toEqual(checked.ruleSet);
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
    });
  }

  it("covers every whole N at the edges 1 and 60,000", () => {
    for (const id of LIMITED) {
      const ex = bundle(id);
      for (const n of [1, 60_000]) {
        const r = checkRuleBox(presetRuleText(ex, n), ex.fixture);
        expect(r.ok).toBe(true);
        expect(checkLimit(String(n))).toEqual({ ok: true, n });
      }
    }
  });

  // **Validates: Requirements 12.3**
  it("text that is not a whole number from 1 to 60,000 gets the stated reason", () => {
    fc.assert(
      fc.property(badLimitTextArb, (t) => {
        const r = checkLimit(t);
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.reason).toBe(LIMIT_REASON);
          expect(r.reason).toContain("whole number from 1 to 60,000");
        }
        expect("n" in r).toBe(false);
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
    for (const t of ["", "0", "60001", "-1", "1.5", "abc"]) expect(checkLimit(t).ok).toBe(false);
  });

  it("whole numbers from 1 to 60,000 are accepted by checkLimit", () => {
    fc.assert(
      fc.property(limitArb, (n) => {
        expect(checkLimit(String(n))).toEqual({ ok: true, n });
      }),
      { seed: SEED, numRuns: NUM_RUNS },
    );
  });

  // **Validates: Requirements 12.4**
  for (const id of LIMITED) {
    it(`${id}: headline is the default headline at the default limit and the custom text otherwise`, () => {
      const def = presetFor(id).limitDefault;
      expect(def).toBe(id === "garage" ? 20 : 600);
      expect(presetHeadline(id, def as number)).toBe(EXAMPLE_COPY[id].headline);
      fc.assert(
        fc.property(fc.oneof(limitArb, fc.constantFrom(1, 60_000)), (n) => {
          const h = presetHeadline(id, n);
          if (n === def) expect(h).toBe(EXAMPLE_COPY[id].headline);
          else expect(h).toBe(CUSTOM[id](n));
        }),
        { seed: SEED, numRuns: NUM_RUNS },
      );
    });
  }

  // **Validates: Requirements 12.2, 12.5**
  it("default-limit preset text equals examples/<id>/rules.txt for all three examples", () => {
    for (const id of ["crosswalk", "garage", "heartbeat"] as const) {
      const ex = bundle(id);
      const file = readFileSync(`examples/${id}/rules.txt`, "utf8").replace(/\r\n/g, "\n");
      const def = presetFor(id).limitDefault ?? 1;
      expect(presetRuleText(ex, def)).toBe(file);
    }
  });
});
