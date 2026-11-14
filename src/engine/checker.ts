// Checker contract. Types only.
// The observation holds data and nothing else: no time source, no number
// source and no network handle reach the Checker through it.

import type { AppliedInput, Diagnostic, OutputEvent } from "./types";

export interface CheckerObservation {
  readonly runIndex: number;
  /** 0 on the initial call of a Run; the end-of-run call continues the numbering. */
  readonly stepIndex: number;
  readonly endOfRun: boolean;
  /** Bridge cycleCount after the Step; for endOfRun, the end-of-run cycle. */
  readonly cycle: number;
  /** Only data produced since the previous call in this Run. */
  readonly outputEvents: readonly OutputEvent[];
  /** Digital and analog, in application order. */
  readonly appliedInputs: readonly AppliedInput[];
  readonly diagnostics: readonly Diagnostic[];
}

/** `cycle` is an integer, 0 <= cycle <= observation.cycle. */
export interface Violation {
  rule: string;
  cycle: number;
}

/** `reason` is the Checker's own words. */
export interface CannotCheck {
  rule: string;
  reason: string;
}

export interface CheckerOutcome {
  violation: Violation | null;
  cannotCheck?: readonly CannotCheck[];
}

export type Checker = (observation: CheckerObservation) => CheckerOutcome;
