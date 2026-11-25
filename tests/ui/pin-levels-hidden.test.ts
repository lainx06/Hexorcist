// Feature: upload-samples, task 8.1. Requirement 7: no stale pin levels while the reducer runs.
// There is no DOM environment in this repo (no jsdom or happy-dom, vitest runs in node), so the stage and
// scene view cannot be mounted. This file tests (a) the pure function the scene view draws from,
// `pinLevelsAt`, with the exact argument `scene-pin-levels.ts` passes for `waiting: true`, and (b) the
// source text of the stage methods that drive the scene, by reading `stage.ts`. Source checks show the call
// order is written as required. They do not run the stage. Evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { OutputEvent } from "../../src/engine/types";
import { pinLevelsAt } from "../../src/ui/app/model/pin-levels";
import type { PinLevelRow, PinLevelsReplay } from "../../src/ui/app/model/pin-levels";

const ROOT = resolve(__dirname, "..", "..");
const STAGE = readFileSync(resolve(ROOT, "src/ui/app/views/stage.ts"), "utf8");
const SCENE = readFileSync(resolve(ROOT, "src/ui/app/views/scene-pin-levels.ts"), "utf8");

/** Text of `function name(...) { ... }` or `name(...) { ... }` by brace matching. */
function body(src: string, header: RegExp): string {
  const m = header.exec(src);
  if (m === null) throw new Error(`header not found: ${String(header)}`);
  const open = m[0].endsWith("{") ? m.index + m[0].length - 1 : src.indexOf("{", src.indexOf(")", m.index + m[0].length - 1));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unbalanced braces");
}

const ROWS: PinLevelRow[] = [
  { signal: "BUTTON", name: "Button", role: "input", pressed: "low" },
  { signal: "LED", name: "LED", role: "output", pressed: "high" },
];

const traceA: PinLevelsReplay = {
  events: [{ cycle: 10, signal: "BUTTON", value: 0, gremlinId: "masher" } as unknown as ReducerEvent],
  outputEdges: [{ cycle: 12, signal: "LED", value: 1 } as unknown as OutputEvent],
  v: 20,
  ringSignals: ["LED"],
};
const traceB: PinLevelsReplay = { events: [], outputEdges: [{ cycle: 5, signal: "LED", value: 0 } as unknown as OutputEvent], v: null, ringSignals: [] };

const blank = (cursor: number) => pinLevelsAt(ROWS, null, cursor);

describe("pin levels hidden while the reducer runs (Requirement 7)", () => {
  it("7.1 the drawn state with no replay shows nothing from a previous trace, at any cursor", () => {
    const shownA = pinLevelsAt(ROWS, traceA, 30);
    expect(shownA.inputs[0]?.state).toBe("pressed");
    expect(shownA.outputs[0]?.lit).toBe(true);
    for (const c of [0, 12, 30, 1_000_000]) {
      const s = blank(c);
      expect(s.waiting).toBe(true);
      expect(s.inputs.every((i) => i.state === "not pressed" && i.gremlinId === null)).toBe(true);
      expect(s.outputs.every((o) => !o.lit && o.notDriven && !o.ring)).toBe(true);
    }
  });

  it("7.1 the scene turns `waiting: true` into a null replay, and look() applies it for every non-live look on Upload", () => {
    expect(SCENE).toMatch(/opts\.waiting === true \? null :/);
    const look = body(STAGE, /function look\(/);
    expect(look).toMatch(/kind !== "live" && exampleId === "upload"\) scene\.update\(\[\], \[\], 0, \{ waiting: true \}\)/);
  });

  it("7.1 showShrinking clears the previous replay and blanks the scene with a dim look", () => {
    const b = body(STAGE, /function showShrinking\(/);
    expect(b).toMatch(/shown = null;/);
    expect(b).toMatch(/look\("dim"\)/);
    expect(b).not.toMatch(/look\("live"\)|drawScene\(/);
  });

  it("7.2 look() blanks the scene before it toggles the dim class (same call, hide first)", () => {
    const look = body(STAGE, /function look\(/);
    const hide = look.indexOf("waiting: true");
    const dim = look.indexOf('toggle("is-dim"');
    expect(hide).toBeGreaterThan(-1);
    expect(dim).toBeGreaterThan(hide);
  });

  it("7.2 showShrinking dims only through look(), so nothing dims without the blank", () => {
    const b = body(STAGE, /function showShrinking\(/);
    expect(b).not.toMatch(/is-dim/);
    expect(STAGE.match(/classList\.toggle\("is-dim"/g)?.length).toBe(1);
  });

  it("7.3 the resulting trace is drawn by showBroke in one synchronous call: live look, then draw from the new replay", () => {
    const b = body(STAGE, /showBroke\(replay\)/);
    expect(b).not.toMatch(/\bawait\b|setTimeout|requestAnimationFrame/);
    const live = b.indexOf('look("live")');
    const draw = b.indexOf("drawScene(");
    expect(b.indexOf("shown = replay")).toBeGreaterThan(-1);
    expect(b.indexOf("shown = replay")).toBeLessThan(live);
    expect(live).toBeGreaterThan(-1);
    expect(draw).toBeGreaterThan(live);
  });

  it("7.3 only the resulting trace shows: levels from trace R never include trace P", () => {
    const r = pinLevelsAt(ROWS, traceB, 30);
    expect(r.inputs[0]?.state).toBe("not pressed");
    expect(r.outputs[0]?.lit).toBe(false);
    expect(r.outputs[0]?.ring).toBe(false);
    expect(pinLevelsAt(ROWS, traceB, 30)).toEqual(pinLevelsAt(ROWS, { ...traceB }, 30));
  });

  it("7.4 when the reducer stops without a result, the scene stays blank and is not dimmed", () => {
    const b = body(STAGE, /showReduceError\(\) \{/);
    expect(b).toMatch(/shown = null;/);
    // Blank: a non-live look on Upload runs the waiting update. Un-dimmed: the look is not "dim".
    expect(b).toMatch(/look\("(?:idle)"\)/);
    expect(b).not.toMatch(/look\("dim"\)|look\("live"\)|drawScene\(/);
  });
});
