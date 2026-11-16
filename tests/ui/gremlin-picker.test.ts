// Feature: bench-ui-examples. Gremlin compatibility per fixture (Req 15.8, 15.9). Evidence, not proof.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GREMLIN_CATALOGUE } from "../../src/engine/gremlins/catalogue";
import type { Fixture } from "../../src/engine/types";
import { pickerTile } from "../../src/ui/app/model/gremlin-picker";

const tiles = (f: Fixture) =>
  Object.fromEntries(GREMLIN_CATALOGUE.map((d) => [d.id, pickerTile(d, f)] as const));

const DROPOUT_REASON = "Needs an input that is normally on";
const ANALOG_REASON = "Needs an analog input";

describe("gremlin picker compatibility", () => {
  it.each(["crosswalk", "garage", "heartbeat"])("%s fixture", (id) => {
    const f = JSON.parse(readFileSync(`examples/${id}/fixture.json`, "utf8")) as Fixture;
    const t = tiles(f);
    for (const g of ["masher", "bouncer", "stuck"]) {
      expect(t[g].compatible).toBe(true);
      expect(t[g].reason).toBeNull();
    }
    expect(t.dropout.compatible).toBe(false);
    expect(t.dropout.reason).toBe(DROPOUT_REASON);
    for (const g of ["spike", "drifter"]) {
      expect(t[g].compatible).toBe(false);
      expect(t[g].reason).toBe(ANALOG_REASON);
    }
  });

  it("a fixture with an active-rest digital input and an analog input makes all six Compatible", () => {
    const f: Fixture = {
      pins: [
        { signal: "SENSOR", port: "D", bit: 2, direction: "input", restState: "active" },
        { signal: "KNOB", kind: "analog", channel: 0 },
        { signal: "OUT", port: "B", bit: 0, direction: "output" },
      ],
    };
    const t = tiles(f);
    expect(Object.keys(t)).toHaveLength(6);
    for (const tile of Object.values(t)) {
      expect(tile.compatible).toBe(true);
      expect(tile.reason).toBeNull();
    }
  });
});
