// Reducer_Error helpers. Plain data only: no Error objects, no stacks, no functions.

import type { ReducerError, ReducerErrorKind } from "./types";

const KINDS: ReadonlySet<string> = new Set<ReducerErrorKind>([
  "invalid-input",
  "oracle-error",
  "original-does-not-break",
  "callback-error",
  "replay-error",
]);

export function isReducerError(x: unknown): x is ReducerError {
  if (typeof x !== "object" || x === null) return false;
  try {
    const o = x as { kind?: unknown; message?: unknown };
    return typeof o.kind === "string" && KINDS.has(o.kind) && typeof o.message === "string";
  } catch {
    return false;
  }
}

export function invalidInput(
  message: string,
  extra: { field?: string; index?: number; reasons?: string[] } = {},
): ReducerError {
  const e: ReducerError = { kind: "invalid-input", message };
  if (extra.field !== undefined) e.field = extra.field;
  if (extra.index !== undefined) e.index = extra.index;
  if (extra.reasons !== undefined) e.reasons = extra.reasons.slice();
  return e;
}

/** A deep copy of a Reducer_Error, so callers cannot change a stored one. */
export function copyError(e: ReducerError): ReducerError {
  const c: ReducerError = { kind: e.kind, message: e.message };
  if (e.field !== undefined) c.field = e.field;
  if (e.index !== undefined) c.index = e.index;
  if (e.reasons !== undefined) c.reasons = e.reasons.slice();
  if (e.candidate !== undefined) c.candidate = e.candidate;
  if (e.how !== undefined) c.how = e.how;
  if (e.cause !== undefined) c.cause = { kind: e.cause.kind, message: e.cause.message };
  if (e.candidatesTried !== undefined) c.candidatesTried = e.candidatesTried;
  return c;
}