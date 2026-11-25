// Feature: upload-samples, task 8.2. Properties 3 and 4 (Requirement 7). Evidence, not proof.
// vitest runs in node here, so the Pin_Levels_View cannot be mounted. These properties run against
// `pinLevelsAt`, the pure function the view draws from. `scene-pin-levels.ts` turns `waiting: true` into a
// `null` replay before calling it; that mapping is only checked at source level (see the last test).
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { OutputEvent } from "../../src/engine/types";
import { pinLevelsAt } from "../../src/ui/app/model/pin-levels";
import type { PinLevelRow, PinLevelsReplay } from "../../src/ui/app/model/pin-levels";
import { MAX_PINS } from "../../src/ui/app/model/pin-table";

const SCENE = readFileSync(resolve(__dirname, "..", "..", "src/ui/app/views/scene-pin-levels.ts"), "utf8");

/** 0 to MAX_PINS rows, unique signals, any mix of inputs and outputs, either pressed level. */
const rowsArb: fc.Arbitrary<PinLevelRow[]> = fc
  .array(fc.record({ role: fc.constantFrom("input", "output"), pressed: fc.constantFrom("low", "high") }), {
    minLength: 0,
    maxLength: MAX_PINS,
  })
  .map((specs) =>
    specs.map((s, i) => ({ signal: `S${String(i)}`, name: `Pin ${String(i)}`, role: s.role, pressed: s.pressed }) as PinLevelRow),
  );

interface RawTrace {
  ev: { cycle: number; k: number; value: 0 | 1 | "release" }[];
  ed: { cycle: number; k: number; value: 0 | 1 | "input" }[];
  v: number | null;
}
const traceArb: fc.Arbitrary<RawTrace> = fc.record({
  ev: fc.array(
    fc.record({ cycle: fc.nat(1000), k: fc.nat(15), value: fc.constantFrom<0 | 1 | "release">(0, 1, "release") }),
    { maxLength: 20 },
  ),
  ed: fc.array(
    fc.record({ cycle: fc.nat(1000), k: fc.nat(15), value: fc.constantFrom<0 | 1 | "input">(0, 1, "input") }),
    { maxLength: 20 },
  ),
  v: fc.option(fc.nat(1000), { nil: null }),
});

/** A trace whose input events all carry `gremlinId`, so a leaked event is recognisable. */
function build(raw: RawTrace, gremlinId: string, ring: readonly string[]): PinLevelsReplay {
  return {
    events: raw.ev.map((e) => ({ cycle: e.cycle, signal: `S${String(e.k)}`, gremlinId, value: e.value }) as unknown as ReducerEvent),
    outputEdges: raw.ed.map((e) => ({ cycle: e.cycle, signal: `S${String(e.k)}`, value: e.value }) as unknown as OutputEvent),
    v: raw.v,
    ringSignals: ring,
  };
}

const cursorArb = fc.integer({ min: 0, max: 2000 });
const RUNS = { numRuns: 200 };

describe("Property 3: No stale pin levels while the reducer runs and the scene is dimmed", () => {
  it("Feature: upload-samples, Property 3: No stale pin levels while the reducer runs and the scene is dimmed", () => {
    fc.assert(
      fc.property(rowsArb, traceArb, traceArb, cursorArb, cursorArb, (rows, a, b, c1, c2) => {
        const ra = build(a, "gA", ["S0", "S1"]);
        const rb = build(b, "gB", ["S0", "S1"]);
        // Trace A was shown, then trace B was computed too; none of that may reach the blank state.
        pinLevelsAt(rows, ra, c1);
        pinLevelsAt(rows, rb, c2);
        for (const cursor of [c1, c2]) {
          const s = pinLevelsAt(rows, null, cursor);
          expect(s.waiting).toBe(true);
          expect(s.inputs).toHaveLength(rows.filter((r) => r.role === "input").length);
          expect(s.outputs).toHaveLength(rows.filter((r) => r.role === "output").length);
          expect(s.inputs.every((i) => i.state === "not pressed" && i.gremlinId === null)).toBe(true);
          expect(s.outputs.every((o) => !o.lit && o.notDriven && !o.ring)).toBe(true);
        }
        // The blank state is the same whichever trace came before it.
        expect(pinLevelsAt(rows, null, c1)).toEqual(pinLevelsAt(rows, null, c2));
      }),
      RUNS,
    );
  });

  it("the scene maps `waiting: true` to a null replay (source check only, the scene is not mounted)", () => {
    expect(SCENE).toMatch(/opts\.waiting === true \? null :/);
  });
});

describe("Property 4: Pin_Levels_View shows only the resulting trace, never a stale one", () => {
  it("Feature: upload-samples, Property 4: Pin_Levels_View shows only the resulting trace, never a stale one", () => {
    fc.assert(
      fc.property(rowsArb, traceArb, traceArb, cursorArb, (rows, p, r, cursor) => {
        fc.pre(JSON.stringify(p) !== JSON.stringify(r));
        const rp = build(p, "gP", ["S0"]);
        const rr = build(r, "gR", ["S0"]);
        const alone = pinLevelsAt(rows, rr, cursor);
        pinLevelsAt(rows, rp, cursor); // P was shown before R
        const after = pinLevelsAt(rows, rr, cursor);
        // Computed from R alone: P having been drawn first changes nothing.
        expect(after).toEqual(alone);
        // No input carries P's gremlin id.
        expect(after.inputs.every((i) => i.gremlinId !== "gP")).toBe(true);
        // Independent reference from R's own lists.
        const latest = <T extends { cycle: number; k: number }>(list: T[], k: number): T | undefined =>
          list.filter((e) => e.k === k && e.cycle <= cursor).reduce<T | undefined>((m, e) => (m === undefined || e.cycle >= m.cycle ? e : m), undefined);
        rows.forEach((row) => {
          const k = Number(row.signal.slice(1));
          if (row.role === "input") {
            const e = latest(r.ev, k);
            const level = row.pressed === "low" ? 0 : 1;
            const want = e !== undefined && e.value === level ? "pressed" : "not pressed";
            expect(after.inputs.find((i) => i.signal === row.signal)?.state).toBe(want);
          } else {
            const e = latest(r.ed, k);
            const o = after.outputs.find((x) => x.signal === row.signal);
            expect(o?.lit).toBe(e !== undefined && e.value === 1);
            expect(o?.notDriven).toBe(e === undefined || e.value === "input");
            expect(o?.ring).toBe(r.v !== null && cursor >= r.v && row.signal === "S0");
          }
        });
      }),
      RUNS,
    );
  });
});
