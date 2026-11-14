import { describe, expect, it } from "vitest";
import { readIr, writeIr } from "../rules/ir";
import { render } from "../rules/render";

const eq = (signal: string, value: unknown = 1) => ({ op: "eq", signal, value });
const never = (c: unknown) => ({ form: "never", condition: c });
const doc = (rules: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, rules, ...extra });

function reasonsOf(text: string): string[] {
  const r = readIr(text);
  if (r.ok) throw new Error("expected reasons, got a rule set");
  for (const reason of r.reasons) {
    expect(reason.length).toBeGreaterThanOrEqual(1);
    expect(reason.length).toBeLessThanOrEqual(200);
  }
  return r.reasons;
}

function okOf(text: string) {
  const r = readIr(text);
  if (!r.ok) throw new Error(`expected a rule set, got: ${r.reasons.join(" | ")}`);
  return r.ruleSet;
}

describe("readIr integer fields (Req 1.5)", () => {
  it("reads 1.0 and 1e0 as the integer 1", () => {
    const a = okOf(
      '{"version":1,"rules":[{"form":"count","edge":{"op":"rise","of":{"op":"eq","signal":"B","value":1.0}},"windowMs":5,"max":1.0}]}',
    );
    const b = okOf(
      '{"version":1,"rules":[{"form":"count","edge":{"op":"rise","of":{"op":"eq","signal":"B","value":1e0}},"windowMs":5,"max":1e0}]}',
    );
    const want = [
      { form: "count", edge: { op: "rise", of: { op: "eq", signal: "B", value: 1 } }, windowMs: 5, max: 1 },
    ];
    expect(a).toEqual(want);
    expect(b).toEqual(want);
  });

  it("rejects -0 and -0.0 with their JSON path", () => {
    for (const zero of ["-0", "-0.0"]) {
      const maxText = `{"version":1,"rules":[{"form":"count","edge":{"op":"rise","of":{"op":"eq","signal":"B","value":1}},"windowMs":5,"max":${zero}}]}`;
      const r1 = reasonsOf(maxText);
      expect(r1).toHaveLength(1);
      expect(r1[0]).toContain("rules[0].max");

      const aboveText = `{"version":1,"rules":[{"form":"never","condition":{"op":"above","signal":"P","value":${zero}}}]}`;
      const r2 = reasonsOf(aboveText);
      expect(r2).toHaveLength(1);
      expect(r2[0]).toContain("rules[0].condition.value");

      const eqText = `{"version":1,"rules":[{"form":"never","condition":{"op":"eq","signal":"P","value":${zero}}}]}`;
      const r3 = reasonsOf(eqText);
      expect(r3).toHaveLength(1);
      expect(r3[0]).toContain("rules[0].condition.value");
    }
  });
});

describe("readIr Duration_Ms (Req 1.6)", () => {
  const withMs = (msText: string) =>
    `{"version":1,"rules":[{"form":"notLongerThan","condition":{"op":"eq","signal":"LED","value":1},"ms":${msText}}]}`;

  it("300, 300.0 and 3e2 give the same Duration_Ms", () => {
    for (const t of ["300", "300.0", "3e2"]) {
      expect(okOf(withMs(t))).toEqual([
        { form: "notLongerThan", condition: { op: "eq", signal: "LED", value: 1 }, ms: 300 },
      ]);
    }
  });

  it("accepts 0.0000625 and 0.0000001", () => {
    expect(okOf(withMs("0.0000625"))[0]).toMatchObject({ ms: 0.0000625 });
    expect(okOf(withMs("0.0000001"))[0]).toMatchObject({ ms: 0.0000001 });
  });

  it("rejects 0.00000001 and 10000000 with the path of the field", () => {
    for (const t of ["0.00000001", "10000000"]) {
      const r = reasonsOf(withMs(t));
      expect(r).toHaveLength(1);
      expect(r[0]).toContain("rules[0].ms");
    }
  });

  it("rejects 0, negative and a string duration", () => {
    for (const t of ["0", "-5", '"300"']) {
      const r = reasonsOf(withMs(t));
      expect(r).toHaveLength(1);
      expect(r[0]).toContain("rules[0].ms");
    }
  });
});

describe("readIr version (Req 1.8)", () => {
  const cases: Array<[string, string, string]> = [
    ["number", "5", "the number 5"],
    ["fractional number", "1.5", "the number 1.5"],
    ["string", '"MARKERVERSION"', "a string"],
    ["boolean", "true", "a boolean"],
    ["null", "null", "null"],
    ["array", "[1]", "an array"],
    ["object", '{"a":1}', "an object"],
  ];
  for (const [label, jsonText, typeText] of cases) {
    it(`gives exactly one Reason for a ${label} version`, () => {
      const r = reasonsOf(`{"version":${jsonText},"rules":[]}`);
      expect(r).toHaveLength(1);
      expect(r[0]).toContain("version");
      expect(r[0]).toContain(typeText);
      expect(r[0]).not.toContain("MARKERVERSION");
    });
  }

  it("gives exactly one Reason when version is missing", () => {
    const r = reasonsOf('{"rules":[]}');
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("version");
    expect(r[0]).toContain("missing");
  });

  it("checks version before the structure of rules", () => {
    expect(reasonsOf('{"version":2,"rules":"MARKERRULES"}')).toHaveLength(1);
  });
});

describe("readIr JSON and structure Reasons (Req 1.9, 1.10, 1.17)", () => {
  it("returns exactly the fixed text for invalid JSON", () => {
    expect(reasonsOf("{not json")).toEqual(["The text is not valid JSON."]);
    expect(reasonsOf("")).toEqual(["The text is not valid JSON."]);
  });

  it("rejects a top-level non-object without copying its value", () => {
    for (const t of ["[]", "5", '"MARKERTOP"', "null", "true"]) {
      const r = reasonsOf(t);
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.join("\n")).not.toContain("MARKERTOP");
    }
  });

  it("names nested paths such as rules[2].trigger.of.value", () => {
    const good = never(eq("A"));
    const good2 = never(eq("B"));
    const bad = {
      form: "respond",
      trigger: { op: "rise", of: { op: "above", signal: "P", value: 1023 } },
      withinMs: 5,
      expect: eq("LED"),
    };
    const r = reasonsOf(doc([good, good2, bad]));
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("rules[2].trigger.of.value");
  });

  it("names the path of a missing field and a wrong type", () => {
    const r1 = reasonsOf(doc([{ form: "never" }]));
    expect(r1).toHaveLength(1);
    expect(r1[0]).toContain("rules[0].condition");
    const r2 = reasonsOf(doc([never({ op: "eq", signal: 5, value: 1 })]));
    expect(r2).toHaveLength(1);
    expect(r2[0]).toContain("rules[0].condition.signal");
  });

  it("gives one Reason per object that holds an unlisted field, never writing the name", () => {
    const text = JSON.stringify({
      version: 1,
      zzmarkerTop: 1,
      rules: [
        { form: "never", zzmarkerRule: 1, condition: { op: "eq", signal: "A", value: 1, zzmarkerCond: 2 } },
        {
          form: "respond",
          trigger: { op: "rise", zzmarkerEdge: true, of: eq("B") },
          withinMs: 5,
          expect: { op: "all", zzmarkerA: 1, zzmarkerB: 2, of: [eq("C"), eq("D")] },
        },
      ],
    });
    const r = reasonsOf(text);
    // top level, rules[0], rules[0].condition, rules[1].trigger, rules[1].expect
    expect(r).toHaveLength(5);
    expect(r.join("\n")).not.toContain("zzmarker");
    expect(r.some((x) => x.includes("rules[0].condition"))).toBe(true);
    expect(r.some((x) => x.includes("rules[1].trigger"))).toBe(true);
    expect(r.some((x) => x.includes("rules[1].expect"))).toBe(true);
  });

  it("writes no marker string value into any Reason", () => {
    const text = doc([
      { form: "MARKERFORM" },
      never({ op: "MARKEROP" }),
      never({ op: "eq", signal: "MARKER SIGNAL!", value: 1 }),
      never({ op: "eq", signal: "MARKERSIGNAL", value: "MARKERVALUE" }),
    ]);
    const r = reasonsOf(text);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(r.join("\n")).not.toMatch(/MARKER/);
  });

  it("rejects a __proto__ key as a field that is not allowed", () => {
    const text =
      '{"version":1,"rules":[{"form":"never","condition":{"op":"eq","signal":"A","value":1},"__proto__":{"x":1}}]}';
    const r = reasonsOf(text);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("rules[0]");
    expect(r[0]).not.toContain("__proto__");
  });

  it("checks list sizes, depth and Rule count", () => {
    const r1 = reasonsOf(doc([never({ op: "all", of: [eq("A")] })]));
    expect(r1[0]).toContain("rules[0].condition.of");
    const nine = Array.from({ length: 9 }, (_, i) => eq(`S${i}`));
    expect(reasonsOf(doc([never({ op: "any", of: nine })]))[0]).toContain("rules[0].condition.of");
    let deep: unknown = eq("A");
    for (let i = 0; i < 4; i++) deep = { op: "all", of: [deep, eq("B")] };
    const r2 = reasonsOf(doc([never(deep)]));
    // The innermost `all` holds two depth-5 members; each is one offending value.
    expect(r2).toHaveLength(2);
    expect(r2[0]).toContain("rules[0].condition.of[0].of[0].of[0].of[0]");
    expect(r2[1]).toContain("rules[0].condition.of[0].of[0].of[0].of[1]");
    expect(reasonsOf(doc([]))[0]).toContain("rules");
    const many = Array.from({ length: 33 }, (_, i) => never(eq(`S${i}`)));
    expect(reasonsOf(doc(many))[0]).toContain("rules");
  });
});

describe("readIr repeated sentences (Req 1.11)", () => {
  it("names the indexes and the sentence", () => {
    const r = reasonsOf(doc([never(eq("A")), never(eq("B")), never(eq("A")), never(eq("B")), never(eq("A"))]));
    expect(r).toEqual([
      'rules 0, 2, 4 repeat the sentence "A is 1 must never happen."',
      'rules 1, 3 repeat the sentence "B is 1 must never happen."',
    ]);
  });

  it("cuts a long repeated sentence and keeps the indexes", () => {
    const members = Array.from({ length: 8 }, (_, i) => eq(`LONGSIGNALNAME_NUMBER_${String(i).padStart(9, "0")}`));
    const rule = never({ op: "all", of: members });
    const sentence = render(rule);
    expect(sentence.ok && sentence.sentence.length > 200).toBe(true);
    const r = reasonsOf(doc([rule, never(eq("Z")), rule]));
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(200);
    expect(r[0].startsWith("rules 0, 2 repeat the sentence ")).toBe(true);
  });
});

describe("readIr order of checks (Req 1.14) and result (Req 1.15)", () => {
  it("returns only the structure Reasons when a repeat is also present", () => {
    const r = reasonsOf(doc([never(eq("A")), never(eq("A")), { form: "never" }]));
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("rules[2].condition");
    expect(r.join("\n")).not.toContain("repeat");
  });

  it("returns the Rules in array order", () => {
    const rules = [never(eq("C")), never(eq("A")), never(eq("B"))];
    expect(okOf(doc(rules))).toEqual(rules);
  });

  it("does not throw for odd strings", () => {
    for (const t of ["", " ", "{", "[[[", "null", "\u0000", '{"version":1}', '{"version":1,"rules":null}']) {
      expect(() => readIr(t)).not.toThrow();
      expect(readIr(t).ok).toBe(false);
    }
  });
});

describe("writeIr (Req 1.12, 1.16)", () => {
  const set = [
    {
      form: "respond",
      trigger: { op: "rise", of: eq("BTN", 0) },
      withinMs: 5,
      expect: { op: "all", of: [eq("LED"), { op: "above", signal: "P", value: 3 }] },
    },
    { form: "count", edge: { op: "fall", of: eq("BTN") }, windowMs: 1000, max: 2 },
    { form: "hold", after: { op: "rise", of: eq("BTN") }, durationMs: 2.5, expect: eq("LED") },
    { form: "notLongerThan", condition: { op: "below", signal: "P", value: 9 }, ms: 300 },
    never(eq("X")),
  ];

  it("returns a Reason and does not throw for invalid values", () => {
    const values: unknown[] = [
      undefined,
      null,
      5,
      "text",
      {},
      [],
      [null],
      [{ form: "never" }],
      [never(eq("A")), never(eq("A"))],
      [{ form: "never", condition: eq("A"), extra: 1 }],
    ];
    for (const v of values) {
      let r: ReturnType<typeof writeIr> | undefined;
      expect(() => {
        r = writeIr(v);
      }).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r && !r.ok) {
        expect(r.reason.length).toBeGreaterThanOrEqual(1);
        expect(r.reason.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it("does not throw for a getter that throws", () => {
    const hostile = {
      form: "never",
      get condition(): unknown {
        throw new Error("boom");
      },
    };
    expect(() => writeIr([hostile])).not.toThrow();
    expect(writeIr([hostile]).ok).toBe(false);
  });

  it("writes keys in IR order whatever the input key order", () => {
    const reverse = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(reverse);
      if (typeof v === "object" && v !== null) {
        return Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)]));
      }
      return v;
    };
    const w = writeIr(reverse(set));
    if (!w.ok) throw new Error(w.reason);
    const parsed = JSON.parse(w.text) as { version: number; rules: Array<Record<string, unknown>> };
    expect(Object.keys(parsed)).toEqual(["version", "rules"]);
    expect(parsed.version).toBe(1);
    expect(parsed.rules.map((r) => Object.keys(r))).toEqual([
      ["form", "trigger", "withinMs", "expect"],
      ["form", "edge", "windowMs", "max"],
      ["form", "after", "durationMs", "expect"],
      ["form", "condition", "ms"],
      ["form", "condition"],
    ]);
    const resp = parsed.rules[0] as { trigger: object; expect: { of: object[] } };
    expect(Object.keys(resp.trigger)).toEqual(["op", "of"]);
    expect(Object.keys(resp.expect)).toEqual(["op", "of"]);
    expect(Object.keys(resp.expect.of[0] as object)).toEqual(["op", "signal", "value"]);
    expect(w.text.endsWith("}\n")).toBe(true);
    expect(w.text).toBe(JSON.stringify(parsed, null, 2) + "\n");
  });

  it("gives the same text on two calls and reads back to the same set", () => {
    const a = writeIr(set);
    const b = writeIr(set);
    expect(a).toEqual(b);
    if (!a.ok) throw new Error(a.reason);
    expect(okOf(a.text)).toEqual(set);
  });

  it("holds no field other than the listed ones", () => {
    const w = writeIr([never(eq("A"))]);
    if (!w.ok) throw new Error(w.reason);
    expect(Object.keys(JSON.parse(w.text) as object)).toEqual(["version", "rules"]);
  });
});
