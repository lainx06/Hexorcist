// The reduced moves list: one "<time>: <phrase>" line per Gremlin_Event of the Reduced_List. Pure.
import { msText } from "../../../engine/reducer/story";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { EXAMPLE_LABELS, labelOf, plainStoryTableFor } from "./signal-labels";
import type { SignalLabels } from "./signal-labels";

export type MoveKind = "active" | "held" | "inactive";

/** Kind of a Gremlin_Event: active for a press with a later release, held for a press without one, else inactive. */
export function moveKind(list: readonly ReducerEvent[], index: number, fixture: Fixture): MoveKind {
  const e = list[index] as ReducerEvent;
  const pin = fixture.pins.find((p) => p.signal === e.signal);
  const press = pin !== undefined && pin.kind !== "analog" && pin.activeLevel === "high" ? 1 : 0;
  let kind: MoveKind = "inactive";
  if ("value" in e && e.value === press) {
    kind = list.some((o, j) => j > index && o.signal === e.signal && "value" in o && o.value === "release")
      ? "active"
      : "held";
  }
  return kind;
}

/** Full phrase of a Gremlin_Event, chosen by its `moveKind`. */
export function movePhrase(
  list: readonly ReducerEvent[],
  index: number,
  fixture: Fixture,
  labels: SignalLabels = EXAMPLE_LABELS,
): string {
  const table = plainStoryTableFor(labels);
  const e = list[index] as ReducerEvent;
  const kind = moveKind(list, index, fixture);
  const label = Object.prototype.hasOwnProperty.call(table, e.signal) ? table[e.signal] : undefined;
  if (label === undefined) return `changed ${labelOf(labels, e.signal).text}`;
  return label.full[kind] ?? label.full.active;
}

/** One line per Gremlin_Event in list order; Rest_Events are skipped. */
export function reducedMoveLines(list: readonly ReducerEvent[], fixture: Fixture, labels: SignalLabels = EXAMPLE_LABELS): string[] {
  const out: string[] = [];
  list.forEach((e, i) => {
    if (e.gremlinId !== "rest") out.push(`${msText(e.cycle)}: ${movePhrase(list, i, fixture, labels)}`);
  });
  return out;
}

/** Distinct gremlin ids of the Gremlin_Events, in order of appearance. */
export function distinctGremlinIds(list: readonly ReducerEvent[]): string[] {
  const out: string[] = [];
  for (const e of list) if (e.gremlinId !== "rest" && !out.includes(e.gremlinId)) out.push(e.gremlinId);
  return out;
}
