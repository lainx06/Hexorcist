// The reduced moves list: one "<time>: <phrase>" line per Gremlin_Event of the Reduced_List. Pure.
import { msText } from "../../../engine/reducer/story";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { friendlyLabel, PLAIN_STORY_LABELS } from "./labels";

/** Full phrase of a Gremlin_Event: active for a press with a later release, held for a press without one, else inactive. */
export function movePhrase(list: readonly ReducerEvent[], index: number, fixture: Fixture): string {
  const e = list[index] as ReducerEvent;
  const pin = fixture.pins.find((p) => p.signal === e.signal);
  const press = pin !== undefined && pin.kind !== "analog" && pin.activeLevel === "high" ? 1 : 0;
  let kind: "active" | "held" | "inactive" = "inactive";
  if ("value" in e && e.value === press) {
    kind = list.some((o, j) => j > index && o.signal === e.signal && "value" in o && o.value === "release")
      ? "active"
      : "held";
  }
  const label = Object.prototype.hasOwnProperty.call(PLAIN_STORY_LABELS, e.signal) ? PLAIN_STORY_LABELS[e.signal] : undefined;
  if (label === undefined) return `changed ${friendlyLabel(e.signal).text}`;
  return label.full[kind] ?? label.full.active;
}

/** One line per Gremlin_Event in list order; Rest_Events are skipped. */
export function reducedMoveLines(list: readonly ReducerEvent[], fixture: Fixture): string[] {
  const out: string[] = [];
  list.forEach((e, i) => {
    if (e.gremlinId !== "rest") out.push(`${msText(e.cycle)}: ${movePhrase(list, i, fixture)}`);
  });
  return out;
}

/** Distinct gremlin ids of the Gremlin_Events, in order of appearance. */
export function distinctGremlinIds(list: readonly ReducerEvent[]): string[] {
  const out: string[] = [];
  for (const e of list) if (e.gremlinId !== "rest" && !out.includes(e.gremlinId)) out.push(e.gremlinId);
  return out;
}
