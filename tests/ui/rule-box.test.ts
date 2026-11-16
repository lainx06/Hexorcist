// Feature: bench-ui-examples. Rule_Box_Check. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compileRuleSet } from "../../src/engine/rules/compile";
import { readRulesFile } from "../../src/engine/rules/rules-file";
import { EXAMPLE_IDS, loadExample } from "../../src/ui/app/data/examples";
import { checkRuleBox, ruleErrorFrom, sentencePatterns } from "../../src/ui/app/model/rule-box";

const noBreak = fc.string({ maxLength: 120 }).map((s) => s.replace(/[\r\n\u2028\u2029]/g, " "));

describe("Rule_Box reason mapping", () => {
  // Property 2: Rule_Box reason mapping
  // **Validates: Requirements 18.3, 18.4**
  it("maps the no-template reason and passes anything else through", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99_999 }), fc.nat(5000), noBreak, (n, p, x) => {
        const reason = `Line ${n}: No rule template matches at position ${p} (counting from 0); allowed there: ${x}.`;
        expect(ruleErrorFrom(reason)).toEqual({
          line: n,
          position: p + 1,
          text: `Line ${n}, position ${p + 1}: this part does not match any rule pattern. Allowed here: ${x}.`,
        });
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        fc.nat(50),
        fc.string({ minLength: 200, maxLength: 260 }).map((s) => s.replace(/[\r\n\u2028\u2029]/g, " ")),
        fc.string({ maxLength: 80 }),
        (n, p, x, other) => {
          const full = `Line ${n}: No rule template matches at position ${p} (counting from 0); allowed there: ${x}.`;
          const cut = full.slice(0, 200);
          fc.pre(!cut.endsWith("."));
          expect(ruleErrorFrom(cut)).toEqual({ line: null, position: null, text: cut });
          fc.pre(!/^Line \d+: No rule template matches/.test(other));
          expect(ruleErrorFrom(other)).toEqual({ line: null, position: null, text: other });
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("checkRuleBox", () => {
  const crosswalk = loadExample("crosswalk");
  if (!crosswalk.ok) throw new Error("crosswalk did not load");
  const fixture = crosswalk.example.fixture;

  it("maps a real readRulesFile failure end to end", () => {
    const text = "Banana banana banana.";
    const read = readRulesFile(text);
    if (read.ok) throw new Error("expected a parse failure");
    const r = checkRuleBox(text, fixture);
    expect(r).toEqual({ ok: false, errors: read.reasons.map(ruleErrorFrom) });
    if (!r.ok) expect(r.errors[0]?.line).toBe(1);
  });

  it("passes a compileRuleSet reason through unchanged", () => {
    const text = "NO_SUCH_SIGNAL is 1 must never happen.";
    const badFixture = { ...fixture, clockHz: 0 } as typeof fixture;
    const read = readRulesFile(text);
    if (!read.ok) throw new Error("expected a parse success");
    const compiled = compileRuleSet(read.ruleSet, badFixture);
    if (compiled.ok) throw new Error("expected a compile failure");
    expect(checkRuleBox(text, badFixture)).toEqual({
      ok: false,
      errors: compiled.reasons.map((t) => ({ line: null, position: null, text: t })),
    });
  });

  it('gives exactly "Add at least one rule." for empty text', () => {
    expect(checkRuleBox("", fixture)).toEqual({
      ok: false,
      errors: [{ line: null, position: null, text: "Add at least one rule." }],
    });
  });

  for (const id of EXAMPLE_IDS) {
    it(`accepts each Sentence_Pattern alone and appended to ${id} rules.txt`, () => {
      const l = loadExample(id);
      if (!l.ok) throw new Error(`${id} did not load`);
      const { fixture: fx, rulesText } = l.example;
      const patterns = sentencePatterns(fx);
      expect(patterns.map((p) => p.form)).toEqual(["never", "notLongerThan", "respond", "count", "hold"]);
      for (const { sentence } of patterns) {
        const alone = checkRuleBox(sentence, fx);
        expect(alone, sentence).toMatchObject({ ok: true });
        const sep = rulesText === "" || rulesText.endsWith("\n") ? "" : "\n";
        const appended = checkRuleBox(rulesText + sep + sentence, fx);
        expect(appended, sentence).toMatchObject({ ok: true });
      }
    });
  }
});
