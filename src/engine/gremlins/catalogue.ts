// The six gremlins: ids, icon names, targets, parameter tables and parameter resolution.
// Generators arrive in later tasks; this module holds data and validation only.

import type { EngineError } from "../errors";
import { generateDrifter, generateSpike } from "./analog";
import { generateBouncer, generateDropout, generateMasher, generateStuck } from "./digital";
import type { GenerateFn } from "./generate-types";
import { DEFAULT_CLOCK_HZ, msToCycles } from "./pins";

export type GremlinId = "masher" | "bouncer" | "stuck" | "dropout" | "spike" | "drifter";

export interface RangeParamSpec {
  name: string;
  shape: "range";
  /** Unit of both min and max. */
  unit: "count" | "cycles" | "ms";
  default: { min: number; max: number };
  /** Both bounds inclusive. */
  allowed: { min: number; max: number };
}

export interface ScalarParamSpec {
  name: string;
  shape: "scalar";
  unit: "cycles" | "steps";
  default: number;
  allowed: { min: number; max: number };
}

export type ParamSpec = RangeParamSpec | ScalarParamSpec;

export interface GremlinDefinition {
  id: GremlinId;
  /** Name of the icon art, which is a UI task. */
  iconName: string;
  targets: ReadonlyArray<{ kind: "digital" | "analog"; restState?: "active" }>;
  params: readonly ParamSpec[];
  /** Event generator. */
  generate: GenerateFn;
}

/** The caller's request for one gremlin. */
export interface GremlinSpec {
  id: string;
  params?: Record<string, number | { min: number; max: number }>;
}

export type ResolvedParam = number | { min: number; max: number };
export type ResolvedParams = Record<string, ResolvedParam>;

export interface ResolvedGremlin {
  definition: GremlinDefinition;
  params: ResolvedParams;
}

const MAX_GAP_CYCLES = 160_000_000;

function range(
  name: string,
  unit: RangeParamSpec["unit"],
  def: [number, number],
  allowed: [number, number],
): RangeParamSpec {
  return {
    name,
    shape: "range",
    unit,
    default: { min: def[0], max: def[1] },
    allowed: { min: allowed[0], max: allowed[1] },
  };
}

function scalar(
  name: string,
  unit: ScalarParamSpec["unit"],
  def: number,
  allowed: [number, number],
): ScalarParamSpec {
  return { name, shape: "scalar", unit, default: def, allowed: { min: allowed[0], max: allowed[1] } };
}

export const GREMLIN_CATALOGUE: readonly GremlinDefinition[] = [
  {
    id: "masher",
    iconName: "gremlin-masher",
    targets: [{ kind: "digital" }],
    params: [
      range("pressCount", "count", [1, 6], [1, 32]),
      range("gapCycles", "cycles", [80_000, 2_400_000], [2, MAX_GAP_CYCLES]),
    ],
    generate: generateMasher,
  },
  {
    id: "bouncer",
    iconName: "gremlin-bouncer",
    targets: [{ kind: "digital" }],
    params: [
      range("flipCount", "count", [2, 8], [2, 64]),
      range("gapCycles", "cycles", [1_600, 48_000], [1, 1_600_000]),
    ],
    generate: generateBouncer,
  },
  {
    id: "stuck",
    iconName: "gremlin-stuck",
    targets: [{ kind: "digital" }],
    params: [scalar("minSpanCycles", "cycles", 1_600_000, [1, MAX_GAP_CYCLES])],
    generate: generateStuck,
  },
  {
    id: "dropout",
    iconName: "gremlin-dropout",
    targets: [{ kind: "digital", restState: "active" }],
    params: [range("gapCycles", "cycles", [16_000, 800_000], [1, MAX_GAP_CYCLES])],
    generate: generateDropout,
  },
  {
    id: "spike",
    iconName: "gremlin-spike",
    targets: [{ kind: "analog" }],
    params: [range("gapMs", "ms", [1, 20], [1, 1_000])],
    generate: generateSpike,
  },
  {
    id: "drifter",
    iconName: "gremlin-drifter",
    targets: [{ kind: "analog" }],
    params: [
      range("durationMs", "ms", [50, 500], [1, 10_000]),
      scalar("steps", "steps", 8, [2, 32]),
    ],
    generate: generateDrifter,
  },
];

export function findGremlin(id: string): GremlinDefinition | undefined {
  return GREMLIN_CATALOGUE.find((g) => g.id === id);
}

function paramError(gremlinId: string, parameter: string, message: string): EngineError {
  return { kind: "invalid-gremlin-parameter", gremlinId, parameter, message };
}

function isRangeValue(v: unknown): v is { min: number; max: number } {
  return typeof v === "object" && v !== null && "min" in v && "max" in v;
}

function checkOne(
  def: GremlinDefinition,
  spec: ParamSpec,
  value: unknown,
): ResolvedParam | EngineError {
  const { min: lo, max: hi } = spec.allowed;
  const where = `${def.id}.${spec.name}`;
  if (spec.shape === "scalar") {
    if (typeof value !== "number") {
      return paramError(def.id, spec.name, `${where} takes one whole number, not a range`);
    }
    if (!Number.isInteger(value)) {
      return paramError(def.id, spec.name, `${where} must be a whole number`);
    }
    if (value < lo || value > hi) {
      return paramError(def.id, spec.name, `${where} must be from ${lo} to ${hi}`);
    }
    return value;
  }
  if (!isRangeValue(value)) {
    return paramError(def.id, spec.name, `${where} takes a range with min and max, not one number`);
  }
  const { min, max } = value;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return paramError(def.id, spec.name, `${where} min and max must be whole numbers`);
  }
  if (min < lo || min > hi || max < lo || max > hi) {
    return paramError(def.id, spec.name, `${where} min and max must be from ${lo} to ${hi}`);
  }
  if (min > max) {
    return paramError(def.id, spec.name, `${where} min must not be above max`);
  }
  return { min, max };
}

/**
 * Resolve one entry. Errors in order: unknown gremlin; then the override names
 * in catalogue order (the parameter table order for that gremlin), with unknown
 * names after the known ones in sorted string order, so the first error does
 * not depend on the caller's key order; then the drifter's own duration check.
 * Nothing is drawn here.
 */
export function resolveParams(spec: GremlinSpec): ResolvedGremlin | EngineError {
  const def = findGremlin(spec.id);
  if (def === undefined) {
    return {
      kind: "unknown-gremlin",
      gremlinId: spec.id,
      message: `unknown gremlin "${spec.id}"`,
    };
  }
  const resolved: ResolvedParams = {};
  for (const p of def.params) {
    resolved[p.name] = p.shape === "scalar" ? p.default : { ...p.default };
  }
  const given = spec.params ?? {};
  const known = def.params.map((p) => p.name).filter((n) => Object.prototype.hasOwnProperty.call(given, n));
  const unknown = Object.keys(given)
    .filter((n) => !def.params.some((p) => p.name === n))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const name of [...known, ...unknown]) {
    const ps = def.params.find((p) => p.name === name);
    if (ps === undefined) {
      return paramError(def.id, name, `${def.id} has no parameter "${name}"`);
    }
    const r = checkOne(def, ps, given[name]);
    if (typeof r === "object" && "kind" in r) return r;
    resolved[name] = r;
  }
  if (def.id === "drifter") {
    const dur = resolved["durationMs"] as { min: number; max: number };
    const steps = resolved["steps"] as number;
    // Defensive: the allowed ranges already keep this from firing.
    if (msToCycles(dur.min, DEFAULT_CLOCK_HZ) < steps) {
      return paramError(
        def.id,
        "durationMs",
        `drifter.durationMs min is shorter than ${steps} steps of one cycle each`,
      );
    }
  }
  return { definition: def, params: resolved };
}
