// Reducer_Core: a pure search over an oracle, driven in slices by step(k).
// It never creates an emulator and has no runtime path to emulator-bridge.ts or campaign.ts.
// Progress is counted only in candidates tried. No wall clock, no random source.

import type { Violation } from "../checker";
import type { Fixture } from "../types";
import { checkEventList, copyEvent, copyList, gremlinCount, UNLIMITED_BUDGET } from "./events";
import { search } from "./passes";
import type { Entry, Probe, SearchState } from "./passes";
import { copyError, invalidInput } from "./reducer-error";
import type {
  CandidatePart,
  Oracle,
  OracleOutcome,
  ProgressReport,
  ReducerError,
  ReducerEvent,
  ReducerHandle,
  ReducerResult,
  StepReport,
} from "./types";

export interface CoreInput {
  originalList: readonly ReducerEvent[];
  fixture: Fixture;
  /** The target rule's Canonical_Sentence. */
  sentence: string;
  /** 1 to 2^53 - 1. */
  budget: number;
  oracle: Oracle;
}

export interface CoreOptions {
  onProgress?: (report: ProgressReport) => void;
}

function isBudget(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x >= 1 && x <= UNLIMITED_BUDGET;
}

function readField(o: object, name: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (o as Record<string, unknown>)[name] };
  } catch {
    return { ok: false };
  }
}

/** The Oracle_Outcome, or null for a Malformed_Outcome. A throwing read is malformed. */
function normalize(raw: unknown): OracleOutcome | null {
  try {
    if (typeof raw !== "object" || raw === null) return null;
    const o = raw as { then?: unknown; kind?: unknown; violation?: unknown };
    if (typeof o.then === "function") return null;
    const kind = o.kind;
    if (kind === "does-not") return { kind: "does-not" };
    if (kind !== "breaks") return null;
    const v = o.violation;
    if (typeof v !== "object" || v === null) return null;
    const rule = (v as { rule?: unknown }).rule;
    const cycle = (v as { cycle?: unknown }).cycle;
    if (typeof rule !== "string") return null;
    if (typeof cycle !== "number" || !Number.isSafeInteger(cycle) || cycle < 0) return null;
    return { kind: "breaks", violation: { rule, cycle: cycle === 0 ? 0 : cycle } };
  } catch {
    return null;
  }
}

function thrownCause(e: unknown): { kind: string; message: string } | null {
  try {
    if (typeof e === "object" && e !== null && !(e instanceof Error)) {
      const k = (e as { kind?: unknown }).kind;
      const m = (e as { message?: unknown }).message;
      if (typeof k === "string" && typeof m === "string") return { kind: k, message: m };
    }
  } catch {
    return null;
  }
  return null;
}

function thrownText(e: unknown): string | null {
  try {
    if (e instanceof Error && typeof e.message === "string" && e.message.length > 0) return e.message;
  } catch {
    return null;
  }
  return null;
}

function copyReport(r: StepReport): StepReport {
  const c: StepReport = { ended: r.ended, candidatesTried: r.candidatesTried, bestGremlinCount: r.bestGremlinCount };
  if (r.result !== undefined) {
    c.result = {
      originalEventCount: r.result.originalEventCount,
      reducedEventCount: r.result.reducedEventCount,
      candidatesTried: r.result.candidatesTried,
      stoppedAtBudget: r.result.stoppedAtBudget,
      reducedList: copyList(r.result.reducedList),
      violation: { rule: r.result.violation.rule, cycle: r.result.violation.cycle },
    };
  }
  if (r.error !== undefined) c.error = copyError(r.error);
  return c;
}

function toEvents(entries: readonly Entry[]): ReducerEvent[] {
  return entries.map((x) => copyEvent(x.ev));
}

/** Creates a Reducer_Handle. Makes no oracle call; the confirmation run is the first call of the first step. */
export function createReducerCore(input: CoreInput, options?: CoreOptions): ReducerHandle | ReducerError {
  try {
    if (typeof input !== "object" || input === null) return invalidInput("Field input: must be an object.", { field: "input" });
    const oracle = readField(input, "oracle");
    if (!oracle.ok || typeof oracle.value !== "function") {
      return invalidInput("Field oracle: must be a function.", { field: "oracle" });
    }
    const sentence = readField(input, "sentence");
    if (!sentence.ok || typeof sentence.value !== "string" || sentence.value.length === 0) {
      return invalidInput("Field sentence: must be a non-empty string.", { field: "sentence" });
    }
    const budget = readField(input, "budget");
    if (!budget.ok || !isBudget(budget.value)) {
      return invalidInput(`Field budget: must be an integer from 1 to ${UNLIMITED_BUDGET}.`, { field: "budget" });
    }
    const fixture = readField(input, "fixture");
    let fixtureCopy: Fixture;
    try {
      const f = fixture.ok ? fixture.value : undefined;
      if (typeof f !== "object" || f === null || !Array.isArray((f as Fixture).pins)) throw new Error("bad");
      fixtureCopy = structuredClone(f as Fixture);
    } catch {
      return invalidInput("Field fixture: must be an object with a pins array.", { field: "fixture" });
    }
    const list = readField(input, "originalList");
    if (!list.ok || !Array.isArray(list.value)) {
      return invalidInput("Field originalList: must be an array.", { field: "originalList" });
    }
    const bad = checkEventList(list.value as unknown[], fixtureCopy, { runCycles: null });
    if (bad !== null) return invalidInput(bad.message, { field: bad.field, index: bad.index });
    let onProgress: ((r: ProgressReport) => void) | undefined;
    if (options !== undefined) {
      if (typeof options !== "object" || options === null) {
        return invalidInput("Field options: must be an object.", { field: "options" });
      }
      const p = readField(options, "onProgress");
      if (!p.ok || (p.value !== undefined && typeof p.value !== "function")) {
        return invalidInput("Field onProgress: must be a function.", { field: "onProgress" });
      }
      onProgress = p.value as ((r: ProgressReport) => void) | undefined;
    }
    const original = copyList(list.value as ReducerEvent[]);
    return makeHandle(
      original,
      fixtureCopy,
      sentence.value as string,
      budget.value as number,
      oracle.value as Oracle,
      onProgress,
    );
  } catch {
    return invalidInput("Field input: the input could not be read.", { field: "input" });
  }
}

function makeHandle(
  original: ReducerEvent[],
  fixture: Fixture,
  sentence: string,
  budget: number,
  oracle: Oracle,
  onProgress: ((r: ProgressReport) => void) | undefined,
): ReducerHandle {
  const st: SearchState = {
    fixture,
    best: original.map((ev, src) => ({ src, ev: copyEvent(ev) })),
  };
  const originalEventCount = gremlinCount(original);
  let tried = 0;
  let bestViolation: Violation | null = null;
  const gen = search(st);
  let pending: IteratorResult<Probe, void> | null = null;
  let lastAnswer = false;
  let final: StepReport | null = null;

  const bestCount = (): number => gremlinCount(toEvents(st.best));

  const end = (r: { result?: ReducerResult; error?: ReducerError }): StepReport => {
    final = { ended: true, candidatesTried: tried, bestGremlinCount: bestCount() };
    if (r.result !== undefined) final.result = r.result;
    if (r.error !== undefined) final.error = r.error;
    return copyReport(final);
  };

  const result = (stoppedAtBudget: boolean): ReducerResult => {
    const reducedList = toEvents(st.best);
    const v = bestViolation as Violation;
    return {
      originalEventCount,
      reducedEventCount: gremlinCount(reducedList),
      candidatesTried: tried,
      stoppedAtBudget,
      reducedList,
      violation: { rule: v.rule, cycle: v.cycle },
    };
  };

  return {
    step(k: number): StepReport | ReducerError {
      if (final !== null) return copyReport(final);
      if (typeof k !== "number" || !Number.isSafeInteger(k) || k < 1) {
        return invalidInput(`Field k: must be an integer from 1 to ${UNLIMITED_BUDGET}.`, { field: "k" });
      }
      let calls = 0;
      for (;;) {
        if (pending === null) pending = gen.next(lastAnswer);
        if (pending.done === true) return end({ result: result(false) });
        if (tried >= budget) return end({ result: result(true) });
        if (calls === k) return { ended: false, candidatesTried: tried, bestGremlinCount: bestCount() };

        const probe: Probe = pending.value;
        const part: CandidatePart = probe.part;
        const candidate = toEvents(probe.entries);
        tried++;
        calls++;
        let raw: unknown;
        try {
          raw = oracle(candidate);
        } catch (e) {
          const cause = thrownCause(e);
          const text = thrownText(e);
          const err: ReducerError = {
            kind: "oracle-error",
            message:
              cause !== null
                ? `Candidate ${tried}: the oracle threw (${cause.kind}: ${cause.message}).`
                : text !== null
                  ? `Candidate ${tried}: the oracle threw (${text}).`
                  : `Candidate ${tried}: the oracle threw.`,
            candidate: tried,
            how: "threw",
          };
          if (cause !== null) err.cause = cause;
          return end({ error: err });
        }
        const out = normalize(raw);
        if (out === null) {
          return end({
            error: {
              kind: "oracle-error",
              message: `Candidate ${tried}: the oracle returned a malformed outcome.`,
              candidate: tried,
              how: "malformed",
            },
          });
        }
        const accepted = out.kind === "breaks" && out.violation.rule === sentence;
        if (accepted && out.kind === "breaks") {
          st.best = probe.entries.map((x) => ({ src: x.src, ev: copyEvent(x.ev) }));
          bestViolation = { rule: out.violation.rule, cycle: out.violation.cycle };
        }
        if (onProgress !== undefined) {
          const report: ProgressReport = {
            candidatesTried: tried,
            bestGremlinCount: bestCount(),
            bestList: toEvents(st.best),
            part,
            accepted,
          };
          try {
            onProgress(report);
          } catch {
            return end({
              error: {
                kind: "callback-error",
                message: `Candidate ${tried}: the progress callback threw.`,
                candidate: tried,
                candidatesTried: tried,
              },
            });
          }
        }
        if (part === "confirm" && !accepted) {
          return end({
            error: {
              kind: "original-does-not-break",
              message: "The original list does not break the target rule.",
              candidatesTried: tried,
            },
          });
        }
        lastAnswer = accepted;
        pending = null;
      }
    },
  };
}