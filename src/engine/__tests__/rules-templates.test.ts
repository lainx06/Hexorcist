import { describe, expect, it } from "vitest";
import { render } from "../rules/render";
import { parse } from "../rules/parse";
import type { AllowedItem } from "../rules/parse";
import { BANNED_WORDS } from "../copy-rules";

const eq = (signal: string, value: 0 | 1) => ({ op: "eq", signal, value }) as const;
const sentenceOf = (rule: unknown): string => {
  const r = render(rule);
  if (!r.ok) throw new Error(`expected a sentence, got reason: ${r.reason}`);
  return r.sentence;
};
const reasonOf = (rule: unknown): string => {
  const r = render(rule);
  if (r.ok) throw new Error(`expected a reason, got sentence: ${r.sentence}`);
  expect(r.reason.length).toBeGreaterThanOrEqual(1);
  expect(r.reason.length).toBeLessThanOrEqual(200);
  return r.reason;
};

describe("Renderer acceptance literals (Req 2.8 to 2.11)", () => {
  it("Req 2.8: notLongerThan", () => {
    expect(
      sentenceOf({ form: "notLongerThan", condition: eq("LED", 1), ms: 300 }),
    ).toBe("LED is 1 must never last 300 ms or longer.");
  });

  it("Req 2.9: never with nested all and any", () => {
    const rule = {
      form: "never",
      condition: {
        op: "all",
        of: [
          eq("A", 1),
          { op: "any", of: [{ op: "above", signal: "P", value: 100 }, eq("B", 0)] },
        ],
      },
    };
    expect(sentenceOf(rule)).toBe(
      "all of (A is 1, any of (P is above 100, B is 0)) must never happen.",
    );
  });

  it("Req 2.10: count with max 1 and max 0", () => {
    const edge = { op: "rise", of: eq("BUTTON", 0) };
    expect(sentenceOf({ form: "count", edge, windowMs: 1000, max: 1 })).toBe(
      "BUTTON is 0 becomes true may happen at most 1 time in any 1000 ms.",
    );
    expect(sentenceOf({ form: "count", edge, windowMs: 1000, max: 0 })).toBe(
      "BUTTON is 0 becomes true may happen at most 0 times in any 1000 ms.",
    );
  });

  it("Req 2.11: respond with 0.0000005 ms and hold with 2.5 ms", () => {
    expect(
      sentenceOf({
        form: "respond",
        trigger: { op: "rise", of: eq("BUTTON", 0) },
        withinMs: 0.0000005,
        expect: eq("LED", 1),
      }),
    ).toBe("Within 0.0000005 ms after BUTTON is 0 becomes true, LED is 1 must be true.");
    expect(
      sentenceOf({
        form: "hold",
        after: { op: "fall", of: eq("LED", 0) },
        durationMs: 2.5,
        expect: eq("LED", 1),
      }),
    ).toBe("After LED is 0 becomes false, LED is 1 must stay true for 2.5 ms.");
  });
});

describe("Renderer templates", () => {
  it("renders one example per Rule_Form and each Condition op", () => {
    expect(sentenceOf({ form: "never", condition: { op: "below", signal: "Pot", value: 5 } })).toBe(
      "Pot is below 5 must never happen.",
    );
    expect(
      sentenceOf({
        form: "respond",
        trigger: { op: "fall", of: { op: "above", signal: "A0", value: 0 } },
        withinMs: 10,
        expect: { op: "any", of: [eq("X", 0), eq("Y", 1)] },
      }),
    ).toBe("Within 10 ms after A0 is above 0 becomes false, any of (X is 0, Y is 1) must be true.");
    expect(
      sentenceOf({
        form: "count",
        edge: { op: "fall", of: eq("B", 1) },
        windowMs: 5,
        max: 65535,
      }),
    ).toBe("B is 1 becomes false may happen at most 65535 times in any 5 ms.");
    expect(
      sentenceOf({
        form: "hold",
        after: { op: "rise", of: eq("B", 1) },
        durationMs: 100,
        expect: eq("LED", 0),
      }),
    ).toBe("After B is 1 becomes true, LED is 0 must stay true for 100 ms.");
  });

  it("uses time for max 1 and times for max 0 and 2", () => {
    const edge = { op: "rise", of: eq("B", 1) };
    const s = (max: number) => sentenceOf({ form: "count", edge, windowMs: 7, max });
    expect(s(0)).toContain(" at most 0 times in ");
    expect(s(1)).toContain(" at most 1 time in ");
    expect(s(2)).toContain(" at most 2 times in ");
  });

  it("formats durations 300, 0.1, 0.0000005 and 2.5, and writes ms after 1", () => {
    const n = (ms: number) => sentenceOf({ form: "notLongerThan", condition: eq("L", 1), ms });
    expect(n(300)).toBe("L is 1 must never last 300 ms or longer.");
    expect(n(0.1)).toBe("L is 1 must never last 0.1 ms or longer.");
    expect(n(0.0000005)).toBe("L is 1 must never last 0.0000005 ms or longer.");
    expect(n(2.5)).toBe("L is 1 must never last 2.5 ms or longer.");
    expect(n(1)).toBe("L is 1 must never last 1 ms or longer.");
  });

  it("gives the same sentence for reversed key order and does not modify its argument", () => {
    const rule = { form: "notLongerThan", condition: eq("LED", 1), ms: 300 };
    const reversed = { ms: 300, condition: { value: 1, signal: "LED", op: "eq" }, form: "notLongerThan" };
    const before = JSON.stringify(rule);
    expect(sentenceOf(reversed)).toBe(sentenceOf(rule));
    expect(JSON.stringify(rule)).toBe(before);
  });
});

describe("Renderer invalid values", () => {
  const good = { form: "never", condition: eq("LED", 1) };

  it("rejects null, undefined and an array with a reason naming the Rule root", () => {
    expect(reasonOf(null)).toContain("the rule");
    expect(reasonOf(undefined)).toContain("the rule");
    expect(reasonOf([])).toContain("the rule");
  });

  it("names the path of a missing field", () => {
    expect(reasonOf({ form: "never" })).toContain("condition");
    expect(reasonOf({ form: "never", condition: { op: "eq", signal: "A" } })).toContain(
      "condition.value",
    );
  });

  it("does not copy an extra field name", () => {
    const marker = "ZQXMARKERFIELD";
    const reason = reasonOf({ ...good, [marker]: 1 });
    expect(reason).not.toContain(marker);
    expect(reason).toContain("the rule");
  });

  it("does not copy a string value", () => {
    const marker = "ZQXMARKERVALUE";
    const reason = reasonOf({ form: "never", condition: { op: "eq", signal: "A", value: marker } });
    expect(reason).not.toContain(marker);
    expect(reason).toContain("condition.value");
  });

  it("rejects bad Duration_Ms values with the path", () => {
    for (const ms of [0, -1, NaN, Infinity, 0.30000000000000004]) {
      expect(reasonOf({ form: "notLongerThan", condition: eq("L", 1), ms })).toContain("ms");
    }
  });

  it("rejects a Condition at depth 5 with its path", () => {
    const d5 = {
      op: "all",
      of: [{ op: "all", of: [{ op: "all", of: [{ op: "all", of: [eq("A", 1), eq("B", 1)] }, eq("C", 1)] }, eq("D", 1)] }, eq("E", 1)],
    };
    const reason = reasonOf({ form: "never", condition: d5 });
    expect(reason).toContain("condition.of[0].of[0].of[0].of[0]");
  });

  it("accepts depth 4", () => {
    const d4 = {
      op: "all",
      of: [{ op: "all", of: [{ op: "all", of: [eq("A", 1), eq("B", 1)] }, eq("C", 1)] }, eq("D", 1)],
    };
    expect(render({ form: "never", condition: d4 }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sentence_Parser examples (Req 3)
// ---------------------------------------------------------------------------

type Rejected = { reason: string; position: number; allowed: AllowedItem[] };

const rejected = (s: string): Rejected => {
  const r = parse(s);
  if (r.ok) throw new Error(`expected a rejection of ${JSON.stringify(s)}, got a rule`);
  expect((r as Record<string, unknown>).rule).toBeUndefined();
  expect(r.reason.length).toBeGreaterThanOrEqual(1);
  expect(r.reason.length).toBeLessThanOrEqual(200);
  return r;
};

const itemText = (item: AllowedItem): string[] => {
  if ("end" in item) return ["the end of the text"];
  const one = (c: string) => (c === " " ? "a space" : `"${c}"`);
  return [one(item.from), one(item.to)];
};

const withNumber = {
  above: (n: string) => `A is above ${n} must never happen.`,
  count: (n: string) => `A is 1 becomes true may happen at most ${n} times in any 5 ms.`,
  duration: (n: string) => `A is 1 must never last ${n} ms or longer.`,
};

describe("Sentence_Parser rejections", () => {
  it("rejects every number form Req 3.7 lists, in an integer slot and a Duration slot", () => {
    const forms = ["0300", "+5", "-1", "3e2", "300.0", ".5", "5.", "4,800", "4_800"];
    for (const f of forms) {
      rejected(withNumber.above(f));
      rejected(withNumber.count(f));
      rejected(withNumber.duration(f));
    }
  });

  it("rejects singular and plural mismatches", () => {
    rejected("A is 1 becomes true may happen at most 1 times in any 5 ms.");
    rejected("A is 1 becomes true may happen at most 2 time in any 5 ms.");
    expect(parse("A is 1 becomes true may happen at most 1 time in any 5 ms.").ok).toBe(true);
    expect(parse("A is 1 becomes true may happen at most 2 times in any 5 ms.").ok).toBe(true);
  });

  it("rejects a tab, CR, LF, non-breaking space, curly quote and non-ASCII digit", () => {
    const base = "A is 1 must never happen.";
    expect(parse(base).ok).toBe(true);
    rejected(base.replace("A is", "A\tis"));
    rejected(base.replace("A is", "A\ris"));
    rejected(base.replace("A is", "A\nis"));
    rejected(base.replace("A is", "A\u00a0is"));
    rejected(base.replace("A is", "A\u2019is"));
    rejected("A is above \u0663 must never happen.");
    rejected(base + "\n");
    rejected(" " + base);
    rejected(base + " ");
  });

  it("rejects the empty string at position 0", () => {
    const r = rejected("");
    expect(r.position).toBe(0);
  });

  it("rejects out-of-range eq, above, below, count and Duration values", () => {
    rejected("A is 2 must never happen.");
    rejected("A is above 1023 must never happen.");
    rejected("A is below 0 must never happen.");
    rejected("A is below 1024 must never happen.");
    rejected(withNumber.count("65536"));
    rejected(withNumber.duration("0"));
    rejected(withNumber.duration("0.0"));
    rejected(withNumber.duration("10000000"));
    rejected(withNumber.duration("0.00000001"));
    rejected(withNumber.duration("0.30000000000000004"));
    expect(parse(withNumber.above("1022")).ok).toBe(true);
    expect(parse("A is below 1023 must never happen.").ok).toBe(true);
    expect(parse(withNumber.count("65535")).ok).toBe(true);
    expect(parse(withNumber.duration("9999999")).ok).toBe(true);
    expect(parse(withNumber.duration("0.0000001")).ok).toBe(true);
  });

  it("rejects a 33-character signal and accepts 32", () => {
    rejected(`${"A".repeat(33)} is 1 must never happen.`);
    expect(parse(`${"A".repeat(32)} is 1 must never happen.`).ok).toBe(true);
  });

  it("rejects all and any as signal names", () => {
    rejected("all is 1 must never happen.");
    rejected("any is 1 must never happen.");
  });

  it("rejects every BANNED_WORDS entry as a signal in several letter cases", () => {
    expect(BANNED_WORDS.length).toBeGreaterThan(0);
    for (const word of BANNED_WORDS) {
      const cased = [
        word,
        word.toLowerCase(),
        word.toUpperCase(),
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        word
          .split("")
          .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
          .join(""),
      ];
      for (const name of cased) {
        rejected(`${name} is 1 must never happen.`);
        rejected(`all of (A is 1, ${name} is 0) must never happen.`);
      }
    }
  });

  it("rejects 1 and 9 members and accepts 2 and 8", () => {
    const list = (n: number, op: "all" | "any") =>
      `${op} of (${Array.from({ length: n }, (_, i) => `S${i} is 1`).join(", ")}) must never happen.`;
    for (const op of ["all", "any"] as const) {
      rejected(list(1, op));
      rejected(list(9, op));
      expect(parse(list(2, op)).ok).toBe(true);
      expect(parse(list(8, op)).ok).toBe(true);
    }
  });

  it("rejects depth 5 and accepts depth 4", () => {
    const wrap = (inner: string) => `all of (${inner}, B is 1)`;
    const d1 = "A is 1";
    const d4 = wrap(wrap(wrap(d1)));
    const d5 = wrap(d4);
    expect(parse(`${d4} must never happen.`).ok).toBe(true);
    rejected(`${d5} must never happen.`);
  });
});

describe("Sentence_Parser accepted signal names", () => {
  const words = ["is", "above", "below", "of", "becomes", "true", "false", "must", "never", "last", "or", "longer", "Within", "After"];

  it("accepts each template word as a signal name, with no Fixture consulted", () => {
    for (const w of words) {
      const r = parse(`${w} is 1 must never happen.`);
      expect(r.ok, w).toBe(true);
      if (r.ok) expect(r.rule).toEqual({ form: "never", condition: eq(w, 1) });
      const r2 = parse(`Within 5 ms after ${w} is 0 becomes true, ${w} is above 3 must be true.`);
      expect(r2.ok, w).toBe(true);
      const r3 = parse(`all of (${w} is 1, ${w}x is 0) must never happen.`);
      expect(r3.ok, w).toBe(true);
    }
  });
});

describe("Sentence_Parser reasons", () => {
  const cases: { input: string; marker?: string }[] = [
    { input: "ZQXMARK is 2 must never happen.", marker: "ZQXMARK" },
    { input: "A is 1 must never happen", marker: undefined },
    { input: "A is 1 must never" },
    { input: "A is 1 must nevar happen.", marker: "nevar" },
    { input: "Within 0300 ms after A is 1 becomes true, B is 1 must be true." },
    { input: "A is 1 becomes true may happen at most 1 times in any 5 ms." },
    { input: "ZQXMARK" },
    { input: "A is above 5 must never happen.QQQMARK", marker: "QQQMARK" },
    { input: "all of (A is 1) must never happen." },
  ];

  it("names the same position and items in the text and in the data fields", () => {
    for (const { input, marker } of cases) {
      const r = rejected(input);
      expect(Number.isInteger(r.position), input).toBe(true);
      expect(r.position).toBeGreaterThanOrEqual(0);
      expect(r.position).toBeLessThanOrEqual(input.length);
      expect(r.reason, input).toContain(`position ${r.position} `);
      expect(r.allowed.length, input).toBeGreaterThanOrEqual(1);
      expect(r.allowed.length).toBeLessThanOrEqual(6);
      for (const item of r.allowed) {
        for (const t of itemText(item)) expect(r.reason, input).toContain(t);
      }
      if (marker !== undefined) expect(r.reason, input).not.toContain(marker);
    }
  });

  it("reports the input length as the position for a truncated sentence", () => {
    const full = "Within 10 ms after A is 1 becomes true, B is 1 must be true.";
    expect(parse(full).ok).toBe(true);
    for (const n of [0, 1, 6, 17, 30, full.length - 1]) {
      const r = rejected(full.slice(0, n));
      expect(r.position, `prefix length ${n}`).toBe(n);
    }
  });

  it("names the end of the text when a complete sentence is followed by extra text", () => {
    const s = "A is 1 must never happen.";
    const r = rejected(s + "x");
    expect(r.position).toBe(s.length);
    expect(r.allowed).toEqual([{ end: true }]);
    expect(r.reason).toContain("the end of the text");
  });
});
