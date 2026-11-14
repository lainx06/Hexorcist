// Catalogue tests: defaults and allowed ranges against literal numbers copied from R5 and R6,
// override acceptance and rejection at the bounds, and the order in which overrides are checked.
// The literals are acceptance values. This is evidence, not proof of correctness.
import { describe, expect, it } from "vitest";
import { isEngineError } from "../errors";
import {
  GREMLIN_CATALOGUE,
  findGremlin,
  resolveParams,
  type GremlinSpec,
} from "../gremlins/catalogue";
import { msToCycles } from "../gremlins/pins";

type Row = {
  gremlin: string;
  param: string;
  shape: "range" | "scalar";
  def: number | { min: number; max: number };
  allowed: { min: number; max: number };
};

// Literals from R5, R6 and the design parameter table.
const TABLE: Row[] = [
  { gremlin: "masher", param: "pressCount", shape: "range", def: { min: 1, max: 6 }, allowed: { min: 1, max: 32 } },
  { gremlin: "masher", param: "gapCycles", shape: "range", def: { min: 80_000, max: 2_400_000 }, allowed: { min: 2, max: 160_000_000 } },
  { gremlin: "bouncer", param: "flipCount", shape: "range", def: { min: 2, max: 8 }, allowed: { min: 2, max: 64 } },
  { gremlin: "bouncer", param: "gapCycles", shape: "range", def: { min: 1_600, max: 48_000 }, allowed: { min: 1, max: 1_600_000 } },
  { gremlin: "stuck", param: "minSpanCycles", shape: "scalar", def: 1_600_000, allowed: { min: 1, max: 160_000_000 } },
  { gremlin: "dropout", param: "gapCycles", shape: "range", def: { min: 16_000, max: 800_000 }, allowed: { min: 1, max: 160_000_000 } },
  { gremlin: "spike", param: "gapMs", shape: "range", def: { min: 1, max: 20 }, allowed: { min: 1, max: 1_000 } },
  { gremlin: "drifter", param: "durationMs", shape: "range", def: { min: 50, max: 500 }, allowed: { min: 1, max: 10_000 } },
  { gremlin: "drifter", param: "steps", shape: "scalar", def: 8, allowed: { min: 2, max: 32 } },
];

function resolved(spec: GremlinSpec) {
  const r = resolveParams(spec);
  if (isEngineError(r)) throw new Error(`unexpected error: ${r.message}`);
  return r;
}

function paramErrorOf(spec: GremlinSpec) {
  const r = resolveParams(spec);
  if (!isEngineError(r)) throw new Error("expected an error");
  return r;
}

/** Value for a row with every bound set to `v` (scalar) or both min and max set to `v` (range). */
function valueFor(row: Row, v: number): number | { min: number; max: number } {
  return row.shape === "scalar" ? v : { min: v, max: v };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

describe("catalogue shape", () => {
  it("has exactly six gremlins with the design ids, icon names and targets", () => {
    expect(GREMLIN_CATALOGUE.map((g) => [g.id, g.iconName, g.targets])).toEqual([
      ["masher", "gremlin-masher", [{ kind: "digital" }]],
      ["bouncer", "gremlin-bouncer", [{ kind: "digital" }]],
      ["stuck", "gremlin-stuck", [{ kind: "digital" }]],
      ["dropout", "gremlin-dropout", [{ kind: "digital", restState: "active" }]],
      ["spike", "gremlin-spike", [{ kind: "analog" }]],
      ["drifter", "gremlin-drifter", [{ kind: "analog" }]],
    ]);
  });

  it("lists exactly the parameters of the table, nothing more", () => {
    const listed = GREMLIN_CATALOGUE.flatMap((g) => g.params.map((p) => `${g.id}.${p.name}`));
    expect(listed).toEqual(TABLE.map((r) => `${r.gremlin}.${r.param}`));
  });
});

describe("defaults and allowed ranges equal the literals", () => {
  for (const row of TABLE) {
    it(`${row.gremlin}.${row.param}`, () => {
      const spec = findGremlin(row.gremlin)!.params.find((p) => p.name === row.param)!;
      expect(spec.shape).toBe(row.shape);
      expect(spec.default).toEqual(row.def);
      expect(spec.allowed).toEqual(row.allowed);
      expect(resolved({ id: row.gremlin }).params[row.param]).toEqual(row.def);
    });
  }
});

describe("unit conversion", () => {
  it("msToCycles(1) is 16,000", () => {
    expect(msToCycles(1)).toBe(16_000);
  });

  it("Bouncer minimum gap is the integer constant 1,600 (0.1 ms)", () => {
    const gap = findGremlin("bouncer")!.params.find((p) => p.name === "gapCycles")!;
    expect((gap.default as { min: number }).min).toBe(1_600);
  });

  it("Spike and Drifter ms defaults convert to the cycle figures", () => {
    expect([msToCycles(1), msToCycles(20)]).toEqual([16_000, 320_000]);
    expect([msToCycles(50), msToCycles(500)]).toEqual([800_000, 8_000_000]);
  });
});

describe("overrides at the allowed bounds", () => {
  for (const row of TABLE) {
    const { min, max } = row.allowed;
    const accepted = [min, min + 1, max - 1, max].filter((v) => v >= min && v <= max);
    const rejected = [min - 1, max + 1];
    for (const v of accepted) {
      it(`${row.gremlin}.${row.param} accepts ${v}`, () => {
        const r = resolved({ id: row.gremlin, params: { [row.param]: valueFor(row, v) } });
        expect(r.params[row.param]).toEqual(valueFor(row, v));
      });
    }
    for (const v of rejected) {
      it(`${row.gremlin}.${row.param} rejects ${v}`, () => {
        const e = paramErrorOf({ id: row.gremlin, params: { [row.param]: valueFor(row, v) } });
        expect(e).toMatchObject({
          kind: "invalid-gremlin-parameter",
          gremlinId: row.gremlin,
          parameter: row.param,
        });
      });
    }
    if (row.shape === "range") {
      it(`${row.gremlin}.${row.param} rejects a range with only one bound outside`, () => {
        for (const bad of [{ min: min - 1, max }, { min, max: max + 1 }]) {
          expect(paramErrorOf({ id: row.gremlin, params: { [row.param]: bad } })).toMatchObject({
            kind: "invalid-gremlin-parameter",
            parameter: row.param,
          });
        }
      });
    }
  }
});

describe("other rejections", () => {
  it("unknown gremlin", () => {
    expect(paramErrorOf({ id: "poltergeist" })).toMatchObject({
      kind: "unknown-gremlin",
      gremlinId: "poltergeist",
    });
  });

  it("unknown parameter name names the gremlin and the parameter", () => {
    expect(paramErrorOf({ id: "masher", params: { nope: 1 } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      gremlinId: "masher",
      parameter: "nope",
    });
  });

  it("scalar given as a range and the reverse", () => {
    expect(paramErrorOf({ id: "stuck", params: { minSpanCycles: { min: 1, max: 2 } } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      parameter: "minSpanCycles",
    });
    expect(paramErrorOf({ id: "masher", params: { pressCount: 3 } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      parameter: "pressCount",
    });
  });

  it("range with min above max, and non-integer values", () => {
    expect(paramErrorOf({ id: "spike", params: { gapMs: { min: 5, max: 4 } } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      parameter: "gapMs",
    });
    expect(paramErrorOf({ id: "spike", params: { gapMs: { min: 1.5, max: 4 } } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      parameter: "gapMs",
    });
    expect(paramErrorOf({ id: "drifter", params: { steps: 2.5 } })).toMatchObject({
      kind: "invalid-gremlin-parameter",
      parameter: "steps",
    });
  });
});

describe("override check order does not depend on key order", () => {
  // Every override below is invalid, so the first error found decides the result.
  const MULTI: { id: string; bad: Record<string, number | { min: number; max: number }>; first: string }[] = [
    {
      id: "masher",
      bad: { pressCount: { min: 0, max: 6 }, gapCycles: { min: 0, max: 5 } },
      first: "pressCount",
    },
    {
      id: "bouncer",
      bad: { flipCount: { min: 1, max: 8 }, gapCycles: { min: 0, max: 5 } },
      first: "flipCount",
    },
    {
      id: "drifter",
      bad: { durationMs: { min: 0, max: 5 }, steps: 1 },
      first: "durationMs",
    },
  ];

  for (const c of MULTI) {
    it(`${c.id}: every permutation of override keys gives the same first error`, () => {
      const keys = Object.keys(c.bad);
      const perms = permutations(keys);
      expect(perms.length).toBeGreaterThanOrEqual(2);
      for (const order of perms) {
        const params: GremlinSpec["params"] = {};
        for (const k of order) params[k] = c.bad[k];
        expect(Object.keys(params)).toEqual(order);
        expect(paramErrorOf({ id: c.id, params })).toMatchObject({
          kind: "invalid-gremlin-parameter",
          gremlinId: c.id,
          parameter: c.first,
        });
      }
    });
  }

  it("later known parameter is reported when the earlier one is valid, in any key order", () => {
    for (const order of permutations(["pressCount", "gapCycles"])) {
      const all = { pressCount: { min: 2, max: 3 }, gapCycles: { min: 0, max: 9 } } as Record<
        string,
        { min: number; max: number }
      >;
      const params: GremlinSpec["params"] = {};
      for (const k of order) params[k] = all[k];
      expect(paramErrorOf({ id: "masher", params })).toMatchObject({ parameter: "gapCycles" });
    }
  });

  it("known invalid parameters come before unknown names; unknown names are sorted", () => {
    const entries: [string, number | { min: number; max: number }][] = [
      ["zulu", 1],
      ["alpha", 1],
      ["gapCycles", { min: 0, max: 5 }],
      ["pressCount", { min: 0, max: 6 }],
    ];
    const perms = permutations(entries);
    expect(perms.length).toBe(24);
    for (const order of perms) {
      const params: GremlinSpec["params"] = {};
      for (const [k, v] of order) params[k] = v;
      expect(paramErrorOf({ id: "masher", params })).toMatchObject({ parameter: "pressCount" });
    }
  });

  it("with only unknown names, the first in sorted order is reported", () => {
    const names = ["mike", "alpha", "zulu", "bravo"];
    for (const order of permutations(names)) {
      const params: GremlinSpec["params"] = {};
      for (const k of order) params[k] = 1;
      expect(paramErrorOf({ id: "spike", params })).toMatchObject({ parameter: "alpha" });
    }
  });

  it("with valid known parameters, an unknown name is still reported", () => {
    for (const order of permutations(["pressCount", "gapCycles", "extra"])) {
      const params: GremlinSpec["params"] = {};
      for (const k of order) params[k] = k === "extra" ? 1 : { min: 2, max: 3 };
      expect(paramErrorOf({ id: "masher", params })).toMatchObject({ parameter: "extra" });
    }
  });
});
