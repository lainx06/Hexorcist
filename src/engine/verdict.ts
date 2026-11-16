// Verdict selection. Pure: reads only its argument and never changes it.

import type { CannotCheck } from "./checker";
import { peripheralReason, peripheralRowIndex } from "./peripherals";
import type { BrokeTrace, PeripheralDiagnostic, RunResult, Verdict } from "./types";

export type { BrokeTrace, Verdict };

export const VERDICT_BROKE = "BROKE";
export const VERDICT_COULDNT_TELL = "COULDN'T TELL";

export const heldText = (n: number): string =>
  `No violation found in ${n} emulated ${n === 1 ? "run" : "runs"} of this gremlin set. Not a proof.`;

/** Used when a reason would otherwise be empty. */
export const EMPTY_REASON_TEXT = "The rules could not be checked with the signals and run length available.";

export const REASON_MAX_LENGTH = 200;

export interface VerdictInput {
  requestedRuns: number;
  /** Completed Runs in order. */
  runs: readonly RunResult[];
  finished: boolean;
  /** Checker signals that are not in the Fixture. */
  unmappedSignals: readonly string[];
  /** Peripherals the Checker named as unsupported. */
  unsupportedPeripherals: readonly string[];
  /** Canonical_Sentences of Untriggered_Rules, in Rule_Set order. Absent or empty: today's behaviour. */
  untriggeredRules?: readonly string[];
}

/** "1 run" for 1, "N runs" for every other N, 0 included. */
export const runCountPhrase = (n: number): string => (n === 1 ? "1 run" : `${n} runs`);

/** "trigger never happened in <R>". */
export const triggerReason = (n: number): string => `trigger never happened in ${runCountPhrase(n)}`;

/** Cut at 200 UTF-16 units, never leaving half of a surrogate pair. */
function truncateReason(text: string): string {
  if (text.length <= REASON_MAX_LENGTH) return text;
  let end = REASON_MAX_LENGTH;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

function buildReason(parts: readonly string[]): string {
  const joined = parts.join("; ").trim();
  return truncateReason(joined === "" ? EMPTY_REASON_TEXT : joined);
}

/** The lowest violating Run_Index, and every CannotCheck of every Run (deduplicated, in order). */
function collectUnchecked(runs: readonly RunResult[]): { lowest: RunResult | null; unchecked: CannotCheck[]; seen: Set<string> } {
  let lowest: RunResult | null = null;
  const unchecked: CannotCheck[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    if (run.violation !== null && (lowest === null || run.runIndex < lowest.runIndex)) {
      lowest = run;
    }
    for (const c of run.cannotCheck) {
      const key = JSON.stringify([c.rule, c.reason]);
      if (seen.has(key)) continue;
      seen.add(key);
      unchecked.push({ rule: c.rule, reason: c.reason });
    }
  }
  return { lowest, unchecked, seen };
}

/** The COULDN'T TELL reason parts of today's branch 2, in today's order. */
function couldntTellParts(input: VerdictInput, unchecked: readonly CannotCheck[]): string[] {
  const { runs } = input;
  const untriggered = input.untriggeredRules ?? [];
  const parts: string[] = [];
  for (const c of unchecked) {
    parts.push(`Rule "${c.rule}" could not be checked: ${c.reason}`);
  }
  const triggerSeen = new Set<string>();
  for (const s of untriggered) {
    if (triggerSeen.has(s)) continue;
    triggerSeen.add(s);
    parts.push(`Rule "${s}" could not be checked: ${triggerReason(runs.length)}`);
  }
  if (input.unmappedSignals.length > 0) {
    parts.push(`Signals not mapped to a pin: ${input.unmappedSignals.join(", ")}`);
  }
  if (input.unsupportedPeripherals.length > 0) {
    parts.push(`Peripherals not supported: ${input.unsupportedPeripherals.join(", ")}`);
  }
  if (runs.length !== input.requestedRuns) {
    parts.push(`Only ${runs.length} of ${input.requestedRuns} runs completed`);
  }
  const anyEvent = runs.some((r) => r.eventList.some((e) => e.gremlinId !== "rest"));
  if (!anyEvent) {
    parts.push("No gremlin produced an event in any run");
  }
  return parts;
}

/**
 * Unmodelled-peripheral uses that block a verdict (honest-verdicts Requirement 4):
 * with a violating Run, its uses at or before its violation cycle; with no violating Run,
 * every use of every Run.
 */
function blockingUses(runs: readonly RunResult[]): PeripheralDiagnostic[] {
  let lowest: RunResult | null = null;
  for (const run of runs) {
    if (run.violation !== null && (lowest === null || run.runIndex < lowest.runIndex)) lowest = run;
  }
  if (lowest !== null && lowest.violation !== null) {
    const v = lowest.violation.cycle;
    return (lowest.peripheralUses ?? []).filter((d) => d.cycle <= v);
  }
  const out: PeripheralDiagnostic[] = [];
  for (const run of runs) for (const d of run.peripheralUses ?? []) out.push(d);
  return out;
}

/** One Peripheral_Reason per peripheral, by lowest blocking cycle, ties by table row order. */
function peripheralReasons(blocking: readonly PeripheralDiagnostic[]): string[] {
  const lowestCycle = new Map<string, number>();
  for (const d of blocking) {
    const c = lowestCycle.get(d.peripheral);
    if (c === undefined || d.cycle < c) lowestCycle.set(d.peripheral, d.cycle);
  }
  const rank = (id: string): number => peripheralRowIndex(id) ?? Number.MAX_SAFE_INTEGER;
  const ids = [...lowestCycle.keys()].sort((a, b) => {
    const ca = lowestCycle.get(a) as number;
    const cb = lowestCycle.get(b) as number;
    if (ca !== cb) return ca - cb;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return ids.map(peripheralReason);
}

/** Today's verdict selection, unchanged. */
function verdictWithoutPeripherals(input: VerdictInput): Verdict {
  const { runs } = input;

  // 1. BROKE: lowest violating Run_Index, with every unchecked rule listed.
  const { lowest, unchecked, seen } = collectUnchecked(runs);
  const untriggered = input.untriggeredRules ?? [];
  if (lowest !== null && lowest.violation !== null) {
    const reason = triggerReason(runs.length);
    for (const s of untriggered) {
      const key = JSON.stringify([s, reason]);
      if (seen.has(key)) continue;
      seen.add(key);
      unchecked.push({ rule: s, reason });
    }
    const trace: BrokeTrace = {
      runIndex: lowest.runIndex,
      runSeed: lowest.runSeed,
      eventList: lowest.eventList.map((e) => ({ ...e })),
      outputEvents: lowest.outputEvents.map((e) => ({ ...e })),
      violation: { ...lowest.violation },
    };
    return { verdict: VERDICT_BROKE, trace, unchecked };
  }

  // 2. COULDN'T TELL.
  const parts = couldntTellParts(input, unchecked);
  if (parts.length > 0) {
    return { verdict: VERDICT_COULDNT_TELL, reason: buildReason(parts) };
  }

  // 3. HELD.
  return { verdict: "HELD", text: heldText(runs.length), runs: runs.length };
}

export function computeVerdict(input: VerdictInput): Verdict | null {
  if (!input.finished) return null;

  // 0. Unmodelled-peripheral use (honest-verdicts Requirement 4). A use in the violating Run at
  //    or before its violation, or any use when no Run has a violation, gives COULDN'T TELL.
  //    The Peripheral_Reasons lead; today's reason parts follow unchanged.
  const blocking = blockingUses(input.runs);
  if (blocking.length > 0) {
    const { unchecked } = collectUnchecked(input.runs);
    const parts = [...peripheralReasons(blocking), ...couldntTellParts(input, unchecked)];
    return { verdict: VERDICT_COULDNT_TELL, reason: buildReason(parts) };
  }

  return verdictWithoutPeripherals(input);
}