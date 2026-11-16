import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Fixture } from "../../src/engine/types";
import { distinctGremlinIds, reducedMoveLines } from "../../src/ui/app/model/moves";

const fixture = {
  pins: [{ signal: "REQUEST", port: "D", bit: 2, direction: "input", activeLevel: "low" }],
} as unknown as Fixture;

const ev = (cycle: number, value: 0 | 1 | "release", gremlinId: string): ReducerEvent =>
  ({ cycle, signal: "REQUEST", value, gremlinId }) as ReducerEvent;

describe("reduced moves list", () => {
  it("writes one line per Gremlin_Event with full phrases and skips Rest_Events", () => {
    const list = [ev(0, 1, "rest"), ev(16_000, 0, "masher"), ev(32_000, "release", "masher"), ev(48_000, 0, "masher")];
    expect(reducedMoveLines(list, fixture)).toEqual([
      "1.0 ms: pressed the walk button",
      "2.0 ms: released the walk button",
      "3.0 ms: pressed and held the walk button",
    ]);
  });

  it("lists distinct gremlin ids in order of appearance", () => {
    const list = [ev(0, 0, "bouncer"), ev(10, "release", "masher"), ev(20, 0, "bouncer"), ev(30, 1, "rest")];
    expect(distinctGremlinIds(list)).toEqual(["bouncer", "masher"]);
  });
});
