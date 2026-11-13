import type { PrngError } from "./prng";
import type { BridgeError } from "./types";

export type EngineError =
  | PrngError
  | { kind: "invalid-run-index";        message: string }
  | { kind: "unknown-gremlin";          gremlinId: string; message: string }
  | { kind: "invalid-gremlin-parameter"; gremlinId: string; parameter: string; message: string }
  | { kind: "invalid-campaign";         message: string }
  | { kind: "bridge-error";             runIndex: number; error: BridgeError; message: string }
  | { kind: "checker-error";            runIndex: number; cycle: number; message: string }
  | { kind: "internal-error";           message: string };

// A bad HEX or Fixture surfaces as a BridgeError unchanged, before any Run.
export type CampaignError = EngineError | BridgeError;

const ENGINE_ERROR_KINDS: ReadonlySet<string> = new Set([
  "invalid-seed",
  "invalid-range",
  "invalid-run-index",
  "unknown-gremlin",
  "invalid-gremlin-parameter",
  "invalid-campaign",
  "bridge-error",
  "checker-error",
  "internal-error",
]);

export function isEngineError(x: unknown): x is EngineError {
  if (typeof x !== "object" || x === null) return false;
  const o = x as { kind?: unknown; message?: unknown };
  return (
    typeof o.kind === "string" &&
    ENGINE_ERROR_KINDS.has(o.kind) &&
    typeof o.message === "string"
  );
}
