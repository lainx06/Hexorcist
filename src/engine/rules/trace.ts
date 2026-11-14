// Settled-state machinery shared by the Rule_Checker and the Trigger_Evaluator. Pure: it reads
// recorded events and returns values and changes. It holds no state between calls.

import type { AppliedInput, OutputEvent } from "../types";
import type { SignalKind } from "./bind";
import type { Condition } from "./ir";

export type SignalValue = 0 | 1 | "input" | number;

export interface Change {
  cycle: number;
  signal: number; // index into SignalTable.names
  value: SignalValue;
  seq: number; // Application_Order number
}

export interface SignalTable {
  names: string[];
  index: Map<string, number>;
  /** undefined for a signal that is not mapped to exactly one pin; such a signal never changes. */
  kinds: (SignalKind | undefined)[];
}

export type CompiledCondition =
  | { op: "eq"; signal: number; value: 0 | 1 }
  | { op: "above" | "below"; signal: number; value: number }
  | { op: "all" | "any"; of: CompiledCondition[] };

export function makeSignalTable(signals: readonly string[], kinds: ReadonlyMap<string, SignalKind>): SignalTable {
  const names: string[] = [];
  const index = new Map<string, number>();
  for (const s of signals) {
    if (index.has(s)) continue;
    index.set(s, names.length);
    names.push(s);
  }
  return { names, index, kinds: names.map((n) => kinds.get(n)) };
}

export function compileCondition(c: Condition, table: SignalTable): CompiledCondition {
  if (c.op === "all" || c.op === "any") {
    return { op: c.op, of: c.of.map((m) => compileCondition(m, table)) };
  }
  const signal = table.index.get(c.signal);
  if (signal === undefined) throw new Error("trace: a condition names a signal that is not in the table");
  if (c.op === "eq") return { op: "eq", signal, value: c.value };
  return { op: c.op, signal, value: c.value };
}

export function evalCondition(c: CompiledCondition, values: readonly SignalValue[]): boolean {
  switch (c.op) {
    case "eq":
      return values[c.signal] === c.value;
    case "above": {
      const v = values[c.signal];
      return typeof v === "number" && v > c.value;
    }
    case "below": {
      const v = values[c.signal];
      return typeof v === "number" && v < c.value;
    }
    case "all": {
      let result = true;
      for (const m of c.of) if (!evalCondition(m, values)) result = false;
      return result;
    }
    case "any": {
      let result = false;
      for (const m of c.of) if (evalCondition(m, values)) result = true;
      return result;
    }
  }
}

const isRest = (a: AppliedInput): boolean => a.gremlinId === "rest";

function inactiveLevelOf(kind: SignalKind | undefined): 0 | 1 {
  return kind !== undefined && kind.kind === "digital-input" ? kind.inactiveLevel : 1;
}

/**
 * Initial_State from the stepIndex 0 lists (or a RunResult's lists). Returns the values and the
 * indexes of the outputEvents consumed as snapshot entries.
 */
export function initialState(
  table: SignalTable,
  outputEvents: readonly OutputEvent[],
  appliedInputs: readonly AppliedInput[],
): { values: SignalValue[]; snapshotUsed: ReadonlySet<number> } {
  const values: SignalValue[] = table.kinds.map((kind) => {
    if (kind === undefined || kind.kind === "output") return "input";
    if (kind.kind === "digital-input") return kind.inactiveLevel;
    return kind.restLevel;
  });

  // Earliest cycle-0 event per referenced output signal.
  const snapshotUsed = new Set<number>();
  const taken = new Set<number>();
  outputEvents.forEach((e, i) => {
    if (e.cycle !== 0) return;
    const s = table.index.get(e.signal);
    if (s === undefined || taken.has(s)) return;
    const kind = table.kinds[s];
    if (kind === undefined || kind.kind !== "output") return;
    taken.add(s);
    snapshotUsed.add(i);
    values[s] = e.value;
  });

  // Rest_Events, in list order, for referenced digital inputs.
  for (const a of appliedInputs) {
    if (!isRest(a) || !("value" in a)) continue;
    const s = table.index.get(a.signal);
    if (s === undefined) continue;
    const kind = table.kinds[s];
    if (kind === undefined || kind.kind !== "digital-input") continue;
    values[s] = a.value === "release" ? kind.inactiveLevel : a.value;
  }

  return { values, snapshotUsed };
}

/** Changes for referenced signals, Rest_Events and snapshot entries left out, in Application_Order, with seq from `nextSeq`. */
export function toChanges(
  table: SignalTable,
  outputEvents: readonly OutputEvent[],
  appliedInputs: readonly AppliedInput[],
  skipOutputs: ReadonlySet<number>,
  nextSeq: number,
): Change[] {
  const changes: Change[] = [];
  let seq = nextSeq;

  outputEvents.forEach((e, i) => {
    if (skipOutputs.has(i)) return;
    const s = table.index.get(e.signal);
    if (s === undefined) return;
    const kind = table.kinds[s];
    if (kind === undefined || kind.kind !== "output") return;
    changes.push({ cycle: e.cycle, signal: s, value: e.value, seq: seq++ });
  });

  for (const a of appliedInputs) {
    if (isRest(a)) continue;
    const s = table.index.get(a.signal);
    if (s === undefined) continue;
    const kind = table.kinds[s];
    if (kind === undefined) continue;
    if ("analog" in a) {
      if (kind.kind !== "analog") continue;
      changes.push({ cycle: a.appliedCycle, signal: s, value: a.analog, seq: seq++ });
    } else {
      if (kind.kind !== "digital-input") continue;
      const value = a.value === "release" ? inactiveLevelOf(kind) : a.value;
      changes.push({ cycle: a.appliedCycle, signal: s, value, seq: seq++ });
    }
  }

  return changes;
}
