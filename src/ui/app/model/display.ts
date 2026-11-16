// Display model: the longer Display_Replay and its span. Pure, integer cycles only.
import type { Violation } from "../../../engine/checker";
import { MAX_RUN_CYCLES } from "../../../engine/reducer/events";
import type { Rule } from "../../../engine/rules/ir";
import type { OutputEvent } from "../../../engine/types";
import { spanFor } from "./span";
import type { Span } from "./span";
import { DISPLAY_MARGIN } from "./timeline";

export const DISPLAY_LIMIT = 16_000_000;

export function displayRunCycles(v: number): number {
  return Math.min(v + DISPLAY_LIMIT, MAX_RUN_CYCLES);
}

export interface ReplayView {
  violation: Violation | null;
  outputEdges: OutputEvent[];
  reachedEnd: number;
}

export function displayAgrees(replay: ReplayView, display: ReplayView): boolean {
  const a = replay.violation;
  const b = display.violation;
  if (a === null || b === null || a.rule !== b.rule || a.cycle !== b.cycle) return false;
  const cut = display.outputEdges.filter((e) => e.cycle <= replay.reachedEnd);
  return (
    cut.length === replay.outputEdges.length &&
    cut.every((e, i) => {
      const r = replay.outputEdges[i] as OutputEvent;
      return e.signal === r.signal && e.value === r.value && e.cycle === r.cycle;
    })
  );
}

export function displaySpan(rule: Rule, v: number, display: ReplayView): Span | null {
  return spanFor(rule, v, display.outputEdges, Math.min(v + DISPLAY_LIMIT, display.reachedEnd));
}

export function displayWindowEnd(span: Span | null, v: number, displayReachedEnd: number): number {
  return Math.min((span !== null ? span.end : v) + DISPLAY_MARGIN, displayReachedEnd);
}
