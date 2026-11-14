// Builds the ordered event list for one Run from a Campaign_Seed and a Run_Index.
// One generator per Run, passed to every entry in listed order. Integer arithmetic only.
// Reads nothing from any other Run: the inputs are exactly the arguments.

import type { EngineError } from "./errors";
import { analogInputs, digitalInputs, pressValue, restActiveInputs } from "./gremlins/pins";
import type {
  GeneratedEvent,
  GenerateContext,
  SkipReason,
} from "./gremlins/generate-types";
import { resolveParams } from "./gremlins/catalogue";
import type { GremlinSpec, ResolvedGremlin } from "./gremlins/catalogue";
import { createPrng, isPrngError } from "./prng";
import type { Prng } from "./prng";
import { deriveRunSeed, isRunSeedError } from "./run-seed";
import type { Fixture } from "./types";

export type { GeneratedEvent, SkipReason };

export interface GenerateInput {
  fixture: Fixture;
  gremlinSet: readonly GremlinSpec[];
  runCycles: number;
  campaignSeed: number;
  runIndex: number;
}

export interface SkippedEntry {
  gremlinId: string;
  reason: SkipReason;
}

export interface GeneratedRun {
  runSeed: number;
  events: GeneratedEvent[];
  skipped: SkippedEntry[];
}

/** Input of the seam: everything except the seed arguments. */
export interface GenerateWithPrngInput {
  fixture: Fixture;
  gremlinSet: readonly GremlinSpec[];
  runCycles: number;
}

/**
 * Resolve every entry, before any draw. The earliest error in listed order wins.
 */
function resolveAll(gremlinSet: readonly GremlinSpec[]): ResolvedGremlin[] | EngineError {
  const out: ResolvedGremlin[] = [];
  for (const spec of gremlinSet) {
    const r = resolveParams(spec);
    if ("kind" in r) return r;
    out.push(r);
  }
  return out;
}

/**
 * @internal The seam for tests that script raw outputs: the same work as
 * `buildEventList`, but with an already created generator passed in. It does
 * not create or reseed anything, and it returns the events and skips only.
 * Entries are resolved first, so a bad entry draws nothing.
 */
export function generateWithPrng(
  input: GenerateWithPrngInput,
  prng: Prng,
): { events: GeneratedEvent[]; skipped: SkippedEntry[] } | EngineError {
  const { fixture, gremlinSet, runCycles } = input;

  const resolved = resolveAll(gremlinSet);
  if (!Array.isArray(resolved)) return resolved;

  const ctx: GenerateContext = {
    fixture,
    runCycles,
    eligible: {
      digital: digitalInputs(fixture),
      restActive: restActiveInputs(fixture),
      analog: analogInputs(fixture),
    },
  };

  // Generation order is the stable-order key after the cycle. Rest events lead.
  const generated: GeneratedEvent[] = [];
  const skipped: SkippedEntry[] = [];

  for (const pin of ctx.eligible.restActive) {
    generated.push({ signal: pin.signal, value: pressValue(pin), cycle: 0, gremlinId: "rest" });
  }

  for (const entry of resolved) {
    const outcome = entry.definition.generate(ctx, entry.params, prng);
    if (outcome.kind === "skipped") {
      skipped.push({ gremlinId: entry.definition.id, reason: outcome.reason });
    } else if (outcome.kind === "events") {
      for (const ev of outcome.events) generated.push(ev);
    } else {
      return outcome;
    }
  }

  const decorated = generated.map((event, seq) => ({ event, seq }));
  decorated.sort((a, b) => a.event.cycle - b.event.cycle || a.seq - b.seq);
  const events = decorated.map((d) => d.event);

  for (const ev of events) {
    if (!Number.isInteger(ev.cycle) || ev.cycle < 0 || ev.cycle >= runCycles) {
      return {
        kind: "internal-error",
        message: `generated event for ${ev.signal} has cycle ${ev.cycle}, outside 0 to ${runCycles - 1}`,
      };
    }
  }

  return { events, skipped };
}

export function buildEventList(input: GenerateInput): GeneratedRun | EngineError {
  const resolved = resolveAll(input.gremlinSet);
  if (!Array.isArray(resolved)) return resolved;

  const runSeed = deriveRunSeed(input.campaignSeed, input.runIndex);
  if (typeof runSeed !== "number") {
    return isRunSeedError(runSeed) ? runSeed : { kind: "internal-error", message: "bad Run_Seed" };
  }
  const prng = createPrng(runSeed);
  if (isPrngError(prng)) return prng;

  const out = generateWithPrng(
    { fixture: input.fixture, gremlinSet: input.gremlinSet, runCycles: input.runCycles },
    prng,
  );
  if ("kind" in out) return out;
  return { runSeed, events: out.events, skipped: out.skipped };
}
