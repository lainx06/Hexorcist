// Fix view model: the two Scenes share one Cursor. Pure, integer cycles only.
// No DOM, no clock, no randomness.
import type { OutputEvent } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import type { DiffHunk, DiffLine } from "./diff";
import type { ReplayView } from "./display";
import { levelAt } from "./timeline";

/** Cycles the right Scene runs past the break (500 ms at 16 MHz). */
export const FIX_TAIL_CYCLES = 8_000_000;

/** Left Scene Cursor: follows the shared Cursor, then stays frozen at v. */
export function leftCursor(c: number, v: number): number {
  return c >= v ? v : c;
}

/** Last cycle the right Scene follows: v + 8,000,000, or the end of the fixed replay if that is sooner. */
export function rightCursorEnd(v: number, reachedEnd: number): number {
  return Math.min(v + FIX_TAIL_CYCLES, reachedEnd);
}

function on(edges: readonly OutputEvent[], signal: string, c: number): boolean {
  return levelAt(edges, signal, c) === 1;
}

/** Badge text for the right Scene, built from the output levels at the Cursor. */
export function fixBadge(id: ExampleId, edges: readonly OutputEvent[], c: number): string {
  if (id === "crosswalk") {
    const lit: string[] = [];
    if (on(edges, "CAR_GREEN", c)) lit.push("green");
    if (on(edges, "CAR_YELLOW", c)) lit.push("yellow");
    if (on(edges, "CAR_RED", c)) lit.push("red");
    const colour = lit.length === 0 ? "off" : lit.join(" and ");
    return `Car light: ${colour} \u00b7 Walk sign: ${on(edges, "WALK", c) ? "on" : "off"}`;
  }
  if (id === "garage") {
    const closing = on(edges, "MOTOR_CLOSE", c);
    const opening = on(edges, "MOTOR_OPEN", c);
    const word =
      closing && opening ? "closing and opening" : closing ? "closing" : opening ? "opening" : "stopped";
    return `Door: ${word}`;
  }
  return `I'm-alive light: ${on(edges, "HEARTBEAT", c) ? "on" : "off"}`;
}

/**
 * True when the fixed build's display replay repeats the fixed replay: same violation (both none, or the
 * same rule and cycle) and the same output edges up to the replay's reached end.
 */
export function fixedDisplayAgrees(replay: ReplayView, display: ReplayView): boolean {
  const a = replay.violation;
  const b = display.violation;
  if ((a === null) !== (b === null)) return false;
  if (a !== null && b !== null && (a.rule !== b.rule || a.cycle !== b.cycle)) return false;
  const cut = display.outputEdges.filter((e) => e.cycle <= replay.reachedEnd);
  return (
    cut.length === replay.outputEdges.length &&
    cut.every((e, i) => {
      const r = replay.outputEdges[i] as OutputEvent;
      return e.signal === r.signal && e.value === r.value && e.cycle === r.cycle;
    })
  );
}

function blankOrComment(text: string): boolean {
  const t = text.trim();
  return t === "" || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
}

function changed(l: DiffLine): boolean {
  return l.type !== "context";
}

/** Hunks that change something other than comments or blank lines. */
export function codeHunks(hunks: readonly DiffHunk[]): DiffHunk[] {
  return hunks.filter((h) => h.lines.some((l) => changed(l) && !blankOrComment(l.text)));
}
