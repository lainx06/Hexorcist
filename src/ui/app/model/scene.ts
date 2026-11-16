// Scene state at the Cursor, from the shown Replay's output edges only. Pure.
import type { Violation } from "../../../engine/checker";
import type { OutputEvent } from "../../../engine/types";
import { levelText } from "./format";
import { levelAt } from "./timeline";

export const SCENE_SIGNALS = ["CAR_RED", "CAR_YELLOW", "CAR_GREEN", "WALK"] as const;
export type SceneSignal = (typeof SCENE_SIGNALS)[number];

export const SCENE_NOTE = "Illustrative scene \u00b7 firmware outputs shown";

export interface SceneState {
  levels: Record<SceneSignal, "0" | "1" | "not driven">;
  lit: Record<SceneSignal, boolean>;
  labels: { carGreen: string; walk: string };
  bracket: boolean;
  /** True before any replay is shown. */
  waiting: boolean;
  /** Plain text of the four levels, for assistive technology. */
  summary: string;
}

export function sceneAt(
  replay: { outputEdges: readonly OutputEvent[]; violation: Violation | null } | null,
  c: number,
): SceneState {
  const levels = {} as Record<SceneSignal, "0" | "1" | "not driven">;
  const lit = {} as Record<SceneSignal, boolean>;
  for (const s of SCENE_SIGNALS) {
    const l = replay === null ? "not driven" : levelText(levelAt(replay.outputEdges, s, c));
    levels[s] = l;
    lit[s] = l === "1";
  }
  const bracket =
    replay !== null && replay.violation !== null && c >= replay.violation.cycle && lit.CAR_GREEN && lit.WALK;
  return {
    levels,
    lit,
    labels: { carGreen: `CAR_GREEN = ${levels.CAR_GREEN}`, walk: `WALK = ${levels.WALK}` },
    bracket,
    waiting: replay === null,
    summary: SCENE_SIGNALS.map((s) => `${s} = ${levels[s]}`).join(", "),
  };
}