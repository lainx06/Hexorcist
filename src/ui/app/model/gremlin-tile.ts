// Read-only gremlin tile texts from GREMLIN_CATALOGUE and the fixture. Pure.
import { findGremlin } from "../../../engine/gremlins/catalogue";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import type { Fixture } from "../../../engine/types";
import { cycles, ms } from "./format";

export interface TileText {
  id: string;
  name: string;
  behaviour: string;
  iconName: string;
  targets: string[];
  ranges: string[];
}

const DISPLAY: Readonly<Record<string, { name: string; behaviour: string }>> = {
  masher: { name: "Masher", behaviour: "Presses the input again and again" },
};

export function gremlinTile(spec: GremlinSpec, fixture: Fixture): TileText | null {
  const def = findGremlin(spec.id);
  const show = DISPLAY[spec.id];
  if (def === undefined || show === undefined) return null;
  const targets: string[] = [];
  for (const t of def.targets) {
    for (const p of fixture.pins) {
      const isAnalog = "kind" in p && p.kind === "analog";
      const isInput = isAnalog || ("direction" in p && p.direction === "input");
      if (!isInput) continue;
      if ((t.kind === "analog") === isAnalog && !targets.includes(p.signal)) targets.push(p.signal);
    }
  }
  const ranges = def.params.map((p) => {
    if (p.shape === "scalar") return `${p.name}: ${cycles(p.default)} ${p.unit}`;
    const { min, max } = p.default;
    if (p.unit === "cycles") {
      return `${p.name}: ${cycles(min)} to ${cycles(max)} cycles (${ms(min)} to ${ms(max)})`;
    }
    return `${p.name}: ${String(min)} to ${String(max)}${p.unit === "ms" ? " ms" : ""}`;
  });
  return { id: spec.id, name: show.name, behaviour: show.behaviour, iconName: def.iconName, targets, ranges };
}