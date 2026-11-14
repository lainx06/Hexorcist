import { describe, expect, it } from "vitest";
import { readRulesFile, MAX_RULES_FILE_UNITS } from "../rules/rules-file";
import { readIr, writeIr } from "../rules/ir";
import type { Rule } from "../rules/ir";

const S1 = "LED is 1 must never last 300 ms or longer.";
const S2 = "BUTTON is 0 must never happen.";
const S3 = "Within 0.0000005 ms after BUTTON is 0 becomes true, LED is 1 must be true.";
const BAD = "A";

const failReasons = (text: string): string[] => {
  const r = readRulesFile(text);
  if (r.ok) throw new Error("expected reasons, got a rule set");
  return r.reasons;
};
const okRules = (text: string): Rule[] => {
  const r = readRulesFile(text);
  if (!r.ok) throw new Error("expected a rule set, got: " + r.reasons.join(" | "));
  return r.ruleSet;
};
// Distinct valid sentences: "S<i> is 1 must never happen." with letter-only names.
const distinct = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => {
    const name = "S" + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
    return `${name} is 1 must never happen.`;
  });

describe("rules file: IR branch (Req 4.1)", () => {
  const doc = writeIr([
    { form: "never", condition: { op: "eq", signal: "LED", value: 1 } },
  ]);
  if (!doc.ok) throw new Error("fixture document did not write");
  const direct = readIr(doc.text);

  for (const [name, lead] of [
    ["spaces", "   "],
    ["tabs", "\t\t"],
    ["CR", "\r"],
    ["LF", "\n\n"],
    ["mixed", " \t\r\n "],
  ] as const) {
    it(`leading ${name} then { goes to readIr with the same result`, () => {
      expect(readRulesFile(lead + doc.text)).toEqual(readIr(lead + doc.text));
      expect(readRulesFile(lead + doc.text)).toEqual(direct);
    });
  }

  it("returns IR Reasons unchanged", () => {
    const text = '  {"version": 2, "rules": []}';
    expect(readRulesFile(text)).toEqual(readIr(text));
    expect(readRulesFile(text).ok).toBe(false);
  });
});

describe("rules file: sentence lines (Req 4.2, 4.3, 4.5)", () => {
  it("skips blank lines, whitespace-only lines and # comments; keeps line order", () => {
    const rules = okRules(`# comment\n\n   \n\t\n${S1}\n#another\n${S2}\n${S3}\n`);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({ form: "notLongerThan", condition: { op: "eq", signal: "LED", value: 1 }, ms: 300 });
    expect(rules[1]).toEqual({ form: "never", condition: { op: "eq", signal: "BUTTON", value: 0 } });
    expect(rules[2]?.form).toBe("respond");
  });

  it("# after a space is parsed, and fails", () => {
    const reasons = failReasons(` # not a comment\n${S1}`);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/^Line 1: /);
  });

  it("a leading or trailing space or tab is parsed, and fails", () => {
    expect(failReasons(` ${S1}`)[0]).toMatch(/^Line 1: /);
    expect(failReasons(`${S1}\t`)[0]).toMatch(/^Line 1: /);
    expect(failReasons(`${S1} `)[0]).toMatch(/^Line 1: /);
  });

  it("removes one CR at the end of each line", () => {
    expect(okRules(`${S1}\r\n${S2}\r\n`)).toHaveLength(2);
  });

  it("a second CR is not removed, so the line fails", () => {
    expect(failReasons(`${S1}\r\r\n${S2}`)[0]).toMatch(/^Line 1: /);
  });

  it("a final line without a line break is read", () => {
    expect(okRules(`${S1}\n${S2}`)).toHaveLength(2);
  });

  it("two failing lines come in ascending order with one-based numbers over skipped lines", () => {
    const reasons = failReasons(`# c\n${S1}\n\n${BAD}\n   \n${BAD}x\n${S2}`);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toMatch(/^Line 4: /);
    expect(reasons[1]).toMatch(/^Line 6: /);
  });

  it("every Reason is 1 to 200 characters and keeps its line number, also at a high line number", () => {
    const text = "\n".repeat(60_000) + BAD;
    const reasons = failReasons(text);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.startsWith("Line 60001: ")).toBe(true);
    expect(reasons[0]!.length).toBeLessThanOrEqual(200);
    for (const r of failReasons(`${BAD}\n${BAD} \nA is\n`)) {
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.length).toBeLessThanOrEqual(200);
    }
  });

  it("failing lines hide any rule set (no ruleSet on failure)", () => {
    const r = readRulesFile(`${S1}\n${BAD}`);
    expect(r.ok).toBe(false);
    expect("ruleSet" in r).toBe(false);
  });
});

describe("rules file: rule count and repeats (Req 4.4, 4.6)", () => {
  it("empty and whitespace-only text give the count Reason", () => {
    for (const t of ["", " \t\r\n ", "# only a comment\n", "\n\n"]) {
      const reasons = failReasons(t);
      expect(reasons).toEqual(["Found 0 rules; a rules file needs 1 to 32."]);
    }
  });

  it("32 rules read, 33 rules give the count Reason", () => {
    expect(okRules(distinct(32).join("\n"))).toHaveLength(32);
    expect(failReasons(distinct(33).join("\n"))).toEqual(["Found 33 rules; a rules file needs 1 to 32."]);
  });

  it("repeated sentences name the sentence and the line numbers", () => {
    const reasons = failReasons(`${S1}\n# c\n${S2}\n${S1}\n${S1}\n${S2}`);
    expect(reasons).toEqual([
      `Lines 1, 4, 5 repeat the sentence "${S1}"`,
      `Lines 3, 6 repeat the sentence "${S2}"`,
    ]);
  });

  it("count and repeat Reasons come together", () => {
    const lines = [...distinct(32), S1, S1];
    // 34 rules: S0..S31 are distinct from S1 text; lines 33 and 34 repeat.
    const reasons = failReasons(lines.join("\n"));
    expect(reasons).toHaveLength(2);
    expect(reasons).toContain("Found 34 rules; a rules file needs 1 to 32.");
    expect(reasons).toContain(`Lines 33, 34 repeat the sentence "${S1}"`);
  });
});

describe("rules file: byte-order mark and length (Req 4.8, 4.9)", () => {
  it("one leading U+FEFF is removed and its line is line 1", () => {
    expect(okRules(`\uFEFF${S1}`)).toHaveLength(1);
    const reasons = failReasons(`\uFEFF${BAD}\n${S1}`);
    expect(reasons[0]).toMatch(/^Line 1: /);
  });

  it("one leading U+FEFF before { goes to readIr without it", () => {
    const doc = writeIr([{ form: "never", condition: { op: "eq", signal: "LED", value: 1 } }]);
    if (!doc.ok) throw new Error("write failed");
    expect(readRulesFile("\uFEFF" + doc.text)).toEqual(readIr(doc.text));
  });

  it("a second U+FEFF stays and the line fails", () => {
    const reasons = failReasons(`\uFEFF\uFEFF${S1}`);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/^Line 1: /);
  });

  it("a U+FEFF after the start stays", () => {
    expect(failReasons(`${S1}\n\uFEFF${S2}`)[0]).toMatch(/^Line 2: /);
  });

  const LIMIT = "The text is longer than 65536 UTF-16 code units.";
  const pad = (n: number) => "#".repeat(n);

  it("exactly 65,536 units is read; 65,537 gives exactly the limit Reason", () => {
    expect(MAX_RULES_FILE_UNITS).toBe(65_536);
    const at = `${S1}\n${pad(MAX_RULES_FILE_UNITS - S1.length - 1)}`;
    expect(at.length).toBe(65_536);
    expect(okRules(at)).toHaveLength(1);
    expect(failReasons(at + "#")).toEqual([LIMIT]);
  });

  it("the limit counts the text left after removing one U+FEFF", () => {
    const body = `${S1}\n${pad(MAX_RULES_FILE_UNITS - S1.length - 1)}`;
    expect(okRules("\uFEFF" + body)).toHaveLength(1); // 65,537 raw, 65,536 left
    expect(failReasons("\uFEFF" + body + "#")).toEqual([LIMIT]); // 65,537 left
  });

  it("an over-long text parses no line and reaches no reader, even when it starts with {", () => {
    expect(failReasons("{" + " ".repeat(MAX_RULES_FILE_UNITS))).toEqual([LIMIT]);
    expect(failReasons(`${BAD}\n` + pad(MAX_RULES_FILE_UNITS))).toEqual([LIMIT]);
  });
});
