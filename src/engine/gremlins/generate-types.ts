// Types shared by the gremlin generators and the catalogue. Type-only, no code.
// Kept apart from catalogue.ts so the generator modules do not import the catalogue back.

import type { EngineError } from "../errors";
import type { Prng } from "../prng";
import type {
  AnalogFixturePin,
  AnalogInputEvent,
  DigitalFixturePin,
  Fixture,
  InputEvent,
} from "../types";

/** Eligible pin lists, all in Fixture order. */
export interface EligiblePins {
  digital: DigitalFixturePin[];
  restActive: DigitalFixturePin[];
  analog: AnalogFixturePin[];
}

export interface GenerateContext {
  fixture: Fixture;
  /** Run length in CPU cycles, 1 to 2^32. */
  runCycles: number;
  eligible: EligiblePins;
}

export type SkipReason = "no-target-pin" | "run-too-short";

export type GeneratedEvent = (InputEvent | AnalogInputEvent) & { gremlinId: string };

export type GenerateOutcome =
  | { kind: "events"; events: GeneratedEvent[] }
  | { kind: "skipped"; reason: SkipReason };

/** Resolved parameter values, as produced by `resolveParams`. */
export type GenerateParams = Record<string, number | { min: number; max: number }>;

export type GenerateFn = (
  ctx: GenerateContext,
  params: GenerateParams,
  prng: Prng,
) => GenerateOutcome | EngineError;
