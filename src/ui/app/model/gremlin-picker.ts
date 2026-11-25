// Gremlin picker texts and compatibility with a fixture. Pure.
import { findGremlin } from "../../../engine/gremlins/catalogue";
import type { GremlinDefinition, GremlinSpec, ParamSpec } from "../../../engine/gremlins/catalogue";
import type { Fixture, FixturePin } from "../../../engine/types";
import { cycles } from "./format";
import { EXAMPLE_LABELS, labelOf } from "./signal-labels";
import type { SignalLabels } from "./signal-labels";

export const PICKER_TEXT: Readonly<Record<string, { name: string; behaviour: string }>> = {
  masher: { name: "Masher", behaviour: "Presses a button again and again." },
  bouncer: { name: "Bouncer", behaviour: "Makes a contact flicker on and off very fast." },
  stuck: { name: "Stuck", behaviour: "Holds an input on and does not let go." },
  dropout: { name: "Dropout", behaviour: "Briefly cuts an input that is normally on." },
  spike: { name: "Spike", behaviour: "Makes one sudden jump on an analog input." },
  drifter: { name: "Drifter", behaviour: "Slowly ramps an analog input up or down." },
};

export interface PickerTile {
  id: string;
  name: string;
  behaviour: string;
  targets: string[];
  ranges: string[];
  compatible: boolean;
  reason: string | null;
}

const isAnalog = (p: FixturePin): boolean => p.kind === "analog";
const isInputPin = (p: FixturePin): boolean => isAnalog(p) || p.direction === "input";
type Target = GremlinDefinition["targets"][number];
const matches = (t: Target, p: FixturePin): boolean =>
  isInputPin(p) && (t.kind === "analog") === isAnalog(p) && (t.restState !== "active" || (!isAnalog(p) && "restState" in p && p.restState === "active"));

export function isCompatible(def: GremlinDefinition, fixture: Fixture): boolean {
  return def.targets.some((t) => fixture.pins.some((p) => matches(t, p)));
}

/** Upload_Path only: every target must be a digital input present in the fixture. Analog never counts. */
export function isCompatibleForUpload(def: GremlinDefinition, fixture: Fixture): boolean {
  return def.targets.every((t) => t.kind !== "analog" && fixture.pins.some((p) => !isAnalog(p) && matches(t, p)));
}

export function incompatibleReason(def: GremlinDefinition): string {
  const t = def.targets[0];
  if (t.kind === "analog") return "Needs a dial-type input, like a temperature sensor";
  return t.restState === "active" ? "Needs an input that is normally on" : "Needs a button or switch input";
}

/** The Compatible entries of the set, in set order, without params. */
export function defaultSelection(gremlinSet: readonly GremlinSpec[], fixture: Fixture): GremlinSpec[] {
  const out: GremlinSpec[] = [];
  for (const g of gremlinSet) {
    const def = findGremlin(g.id);
    if (def !== undefined && isCompatible(def, fixture)) out.push({ id: g.id });
  }
  return out;
}

/** cycles / 16,000 as an exact decimal: 1,600 gives "0.1", 48,000 gives "3". */
function exactMs(c: number): string {
  const whole = Math.floor(c / 16000);
  const frac = String((c % 16000) * 625).padStart(7, "0").replace(/0+$/, "");
  return frac === "" ? String(whole) : `${String(whole)}.${frac}`;
}

function rangeText(p: ParamSpec): string {
  const unit = p.unit === "count" ? "" : ` ${p.unit}`;
  if (p.shape === "scalar") {
    return p.unit === "cycles"
      ? `${p.name}: ${cycles(p.default)} cycles = ${exactMs(p.default)} ms`
      : `${p.name}: ${String(p.default)}${unit}`;
  }
  const { min, max } = p.default;
  if (p.unit === "cycles") {
    return `${p.name}: ${cycles(min)}\u2013${cycles(max)} cycles = ${exactMs(min)}\u2013${exactMs(max)} ms`;
  }
  return `${p.name}: ${String(min)}\u2013${String(max)}${unit}`;
}

export function pickerTile(def: GremlinDefinition, fixture: Fixture, labels: SignalLabels = EXAMPLE_LABELS): PickerTile {
  const text = PICKER_TEXT[def.id];
  const targets = fixture.pins
    .filter((p) => def.targets.some((t) => matches(t, p)))
    .map((p) => labelOf(labels, p.signal).text);
  const compatible = isCompatible(def, fixture);
  return {
    id: def.id,
    name: text.name,
    behaviour: text.behaviour,
    targets,
    ranges: def.params.map(rangeText),
    compatible,
    reason: compatible ? null : incompatibleReason(def),
  };
}
