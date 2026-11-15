// Trace reducer data types. Types only, no runtime code.
// All values are plain JSON data: optional fields are left out, never set to undefined.

import type { Violation } from "../checker";
import type { GeneratedEvent } from "../gremlins/generate-types";

/** An event of an event list: a GeneratedEvent with only the keys cycle, signal, gremlinId, value or analog. */
export type ReducerEvent = GeneratedEvent;

/** The part of the reduction that built a candidate. */
export type CandidatePart = "confirm" | "ddmin" | "passA" | "passB" | "passC";

export type OracleOutcome = { kind: "does-not" } | { kind: "breaks"; violation: Violation };

/** Synchronous. Gets a fresh deep copy of the candidate. */
export type Oracle = (candidate: ReducerEvent[]) => OracleOutcome;

/** The target rule: its 0-based index in the rule set and its Canonical_Sentence. */
export interface TargetRule {
  index: number;
  sentence: string;
}

/** Given to the progress callback after each oracle call that returned an outcome. */
export interface ProgressReport {
  candidatesTried: number;
  bestGremlinCount: number;
  bestList: ReducerEvent[];
  part: CandidatePart;
  accepted: boolean;
}

export interface ReducerResult {
  /** Gremlin events of the original list (rest events not counted). */
  originalEventCount: number;
  /** Gremlin events of the reduced list (rest events not counted). */
  reducedEventCount: number;
  /** Oracle calls made, the confirmation run included. 1 to the budget. */
  candidatesTried: number;
  stoppedAtBudget: boolean;
  /** The smallest replay this reducer found, rest events included. */
  reducedList: ReducerEvent[];
  /** Recorded at the latest accepted candidate, or at the confirmation run. */
  violation: Violation;
}

export interface StepReport {
  ended: boolean;
  candidatesTried: number;
  bestGremlinCount: number;
  /** Present only when the reduction ended with a result. */
  result?: ReducerResult;
  /** Present only when the reduction ended with an error. */
  error?: ReducerError;
}

export type ReducerErrorKind =
  | "invalid-input"
  | "oracle-error"
  | "original-does-not-break"
  | "callback-error"
  | "replay-error";

export interface ReducerError {
  kind: ReducerErrorKind;
  message: string;
  field?: string;
  index?: number;
  reasons?: string[];
  candidate?: number;
  how?: "threw" | "malformed";
  cause?: { kind: string; message: string };
  candidatesTried?: number;
}

export interface ReducerHandle {
  step(k: number): StepReport | ReducerError;
}