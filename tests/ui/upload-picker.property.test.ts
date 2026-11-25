// Feature: upload-samples, task 5.3. Properties 5 and 6 for the gremlin picker. Passing runs are evidence, not proof.
// Property 5 runs the real `isCompatibleForUpload`. Property 6 cannot mount the picker view: vitest runs in
// node and the repo has no DOM. So the one visibility expression in `views/picker.ts` is read out of the
// source text and evaluated over generated inputs, and the places that set the flags are checked by source
// regex only. Nothing here exercises a click, a render or `setTried` at run time.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GREMLIN_CATALOGUE } from "../../src/engine/gremlins/catalogue";
import type { GremlinDefinition } from "../../src/engine/gremlins/catalogue";
import type { FixturePin } from "../../src/engine/types";
import { isCompatibleForUpload } from "../../src/ui/app/model/gremlin-picker";

const digitalInput = fc.record({
  signal: fc.constant("IN"),
  port: fc.constantFrom<"B" | "C" | "D">("B", "C", "D"),
  bit: fc.constantFrom<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>(0, 1, 2, 3, 4, 5, 6, 7),
  direction: fc.constant<"input">("input"),
  restState: fc.constantFrom<"released" | "active" | undefined>("released", "active", undefined),
});
const digitalOutput = fc.record({
  signal: fc.constant("OUT"),
  port: fc.constantFrom<"B" | "C" | "D">("B", "C", "D"),
  bit: fc.constantFrom<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>(0, 1, 2, 3, 4, 5, 6, 7),
  direction: fc.constant<"output">("output"),
});
const analogPin = fc.record({
  signal: fc.constant("AN"),
  kind: fc.constant<"analog">("analog"),
  channel: fc.integer({ min: 0, max: 5 }),
  direction: fc.constant<"input">("input"),
});
const pinsArb = fc.array(fc.oneof(digitalInput, digitalOutput, analogPin), { maxLength: 8 }) as fc.Arbitrary<FixturePin[]>;

/** A synthetic gremlin with a digital target and an analog target, as the design asks for. */
const MIXED: GremlinDefinition = {
  ...GREMLIN_CATALOGUE[0],
  targets: [{ kind: "digital" }, { kind: "analog" }],
};
const targetListArb = fc.array(
  fc.oneof(
    fc.constant({ kind: "digital" as const }),
    fc.constant({ kind: "digital" as const, restState: "active" as const }),
    fc.constant({ kind: "analog" as const }),
  ),
  { minLength: 1, maxLength: 3 },
);

/** Oracle written from the property text, not from the implementation. */
function oracle(targets: GremlinDefinition["targets"], pins: readonly FixturePin[]): boolean {
  return targets.every((t) => {
    if (t.kind !== "digital") return false;
    return pins.some(
      (p) => p.kind !== "analog" && p.direction === "input" && (t.restState !== "active" || p.restState === "active"),
    );
  });
}

describe("Property 5: Upload_Path gremlin compatibility requires every target to be a digital input", () => {
  // Feature: upload-samples, Property 5: Upload_Path gremlin compatibility requires every target to be a digital input
  // **Validates: Requirements 8.1**
  it("matches the every-target-is-a-digital-input rule for the six catalogue gremlins and the mixed gremlin", () => {
    fc.assert(
      fc.property(pinsArb, (pins) => {
        for (const def of [...GREMLIN_CATALOGUE, MIXED]) {
          expect(isCompatibleForUpload(def, { pins })).toBe(oracle(def.targets, pins));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("never accepts an analog-targeted or mixed gremlin, whatever the pins", () => {
    fc.assert(
      fc.property(pinsArb, (pins) => {
        for (const def of GREMLIN_CATALOGUE) {
          if (def.targets.some((t) => t.kind === "analog")) expect(isCompatibleForUpload(def, { pins })).toBe(false);
        }
        expect(isCompatibleForUpload(MIXED, { pins })).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("matches the oracle for generated target lists", () => {
    fc.assert(
      fc.property(pinsArb, targetListArb, (pins, targets) => {
        const def: GremlinDefinition = { ...GREMLIN_CATALOGUE[0], targets };
        expect(isCompatibleForUpload(def, { pins })).toBe(oracle(targets, pins));
      }),
      { numRuns: 200 },
    );
  });
});

const pickerSource = readFileSync(join(__dirname, "../../src/ui/app/views/picker.ts"), "utf8");

/** The right-hand side of `message.textContent = ...;` in picker.ts, as source text. */
function visibilityExpression(): string {
  const m = pickerSource.match(/message\.textContent\s*=\s*([^;]+);/);
  if (m === null) throw new Error("message.textContent assignment not found in picker.ts");
  return m[1] as string;
}

const PICK_ONE = "Pick at least one gremlin.";

function shown(selectedCount: number, touched: boolean, tried: boolean): boolean {
  const selected = { length: selectedCount };
  const PICKER_COPY = { pickOne: PICK_ONE };
  const fn = new Function("selected", "touched", "tried", "PICKER_COPY", `return ${visibilityExpression()};`) as (
    s: { length: number },
    t: boolean,
    r: boolean,
    c: { pickOne: string },
  ) => string;
  const text = fn(selected, touched, tried, PICKER_COPY);
  expect([PICK_ONE, ""]).toContain(text);
  return text === PICK_ONE;
}

describe("Property 6: Pick-message visibility is a function of selection count, touch, and try state", () => {
  // Feature: upload-samples, Property 6: Pick-message visibility is a function of selection count, touch, and try state
  // **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
  it("the message shows exactly when the count is zero and touched or tried is true (picker.ts expression, evaluated)", () => {
    fc.assert(
      fc.property(fc.nat({ max: 8 }), fc.boolean(), fc.boolean(), (count, touched, tried) => {
        expect(shown(count, touched, tried)).toBe(count === 0 && (touched || tried));
      }),
      { numRuns: 200 },
    );
  });

  it("source level only: touched is set in the chip click handler, tried in setTried, both reset in setFixture", () => {
    expect(pickerSource).toMatch(/btn\.addEventListener\("click",\s*\(\)\s*=>\s*\{[^}]*touched\s*=\s*true;/);
    expect(pickerSource).toMatch(/setTried\(\)\s*\{\s*tried\s*=\s*true;/);
    expect(pickerSource).toMatch(/setFixture\([^)]*\)\s*\{[\s\S]*?touched\s*=\s*false;\s*tried\s*=\s*false;/);
  });
});
