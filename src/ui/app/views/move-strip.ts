// Move strip: one dot per Gremlin_Event placed by cycle, the broke mark at v, a legend in shrink mode.
// Labels and dot styles come from model/strip.ts; legend text from STAGE_TEXT. At Phone_Width the CSS
// shows one row per move instead of the track.

import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { brokeLabel, crossed, shrinkDots, stripDots, type ShrinkDot } from "../model/strip";
import { STAGE_TEXT } from "../model/stage-copy";
import { clear, el, prefersReducedMotion, setChildren } from "./dom";

export interface MoveStrip {
  root: HTMLElement;
  /** Replay mode: dots by cycle between start (S) and v, labelled, with the broke mark. */
  showMoves(list: readonly ReducerEvent[], fixture: Fixture, start: number, v: number): void;
  /** Shrink mode: dots of the original list styled from the faded set and, once known, the Reduced_List. */
  showShrink(original: readonly ReducerEvent[], faded: ReadonlySet<number>, reduced: readonly ReducerEvent[] | null): void;
  /** Feed the Cursor; pulses the dots it crossed since the last call (never under Reduced_Motion). */
  setCursor(cycle: number): void;
  /** Cycles of the dots in replay mode, in dot order. */
  cycles(): readonly number[];
  clear(): void;
}

const PAD = 5; // percent kept free at each end of the shrink track

function percent(c: number, lo: number, hi: number): string {
  if (hi <= lo) return "50%";
  return `${String(PAD + ((100 - 2 * PAD) * (c - lo)) / (hi - lo))}%`;
}

function span(cycles: readonly number[]): [number, number] {
  return [Math.min(...cycles), Math.max(...cycles)];
}

export function createMoveStrip(): MoveStrip {
  const track = el("div", { class: "strip-track", "aria-hidden": "true" });
  const labels = el("div", { class: "strip-labels" });
  const rows = el("ol", { class: "strip-rows" });
  const legend = el("div", { class: "strip-legend" });
  const root = el("div", { class: "move-strip" }, [track, labels, rows, legend]);

  let dotEls: HTMLElement[] = [];
  let dotCycles: number[] = [];
  let mode: "none" | "moves" | "shrink" = "none";
  let prevCursor: number | null = null;

  function resetDots(n: number): void {
    clear(track);
    dotEls = [];
    for (let i = 0; i < n; i++) {
      const d = el("span", { class: "strip-dot" });
      dotEls.push(d);
      track.appendChild(d);
    }
  }

  function legendItem(style: ShrinkDot["style"], text: string): HTMLElement {
    return el("span", { class: "strip-legend-item" }, [el("span", { class: `strip-dot is-${style}`, "aria-hidden": "true" }), ` ${text}`]);
  }

  return {
    root,
    showMoves(list, fixture, start, v) {
      mode = "moves";
      root.classList.remove("is-collapsed", "is-shrinking");
      setChildren(legend, []);
      const dots = stripDots(list, fixture, v);
      dotCycles = dots.map((d) => d.cycle);
      resetDots(dots.length);
      const total = Math.max(1, v - start);
      const at = (c: number): string => `${String(Math.min(100, Math.max(0, ((c - start) * 100) / total)))}%`;
      dots.forEach((d, i) => {
        const e = dotEls[i] as HTMLElement;
        e.style.left = at(d.cycle);
        e.setAttribute("data-label", d.label);
      });
      const broke = brokeLabel(list, v);
      const mark = el("span", { class: "strip-break" }, ["\u2715"]);
      mark.style.left = at(v);
      mark.setAttribute("data-label", broke);
      track.appendChild(mark);
      setChildren(
        labels,
        [...dots.map((d) => el("span", { class: "strip-label" }, [d.label])), el("span", { class: "strip-label strip-label--break" }, ["\u2715 " + broke])],
      );
      setChildren(rows, [
        ...dots.map((d) => el("li", { class: "strip-row" }, [el("span", { class: "strip-dot is-needed", "aria-hidden": "true" }), d.label])),
        el("li", { class: "strip-row strip-row--break" }, [el("span", { class: "strip-break", "aria-hidden": "true" }, ["\u2715"]), broke]),
      ]);
      prevCursor = null;
    },
    showShrink(original, faded, reduced) {
      const dots = shrinkDots(original, faded, reduced);
      if (mode !== "shrink" || dotEls.length !== dots.length) {
        mode = "shrink";
        resetDots(dots.length);
        setChildren(labels, []);
        setChildren(rows, []);
        setChildren(legend, [
          legendItem("needed", STAGE_TEXT.legendNeeded),
          legendItem("testing", STAGE_TEXT.legendTesting),
          legendItem("not-needed", STAGE_TEXT.legendNotNeeded),
        ]);
      }
      dotCycles = dots.map((d) => d.cycle);
      const [lo, hi] = dots.length === 0 ? [0, 0] : span(dotCycles);
      const keep = dots.filter((d) => d.style === "needed").map((d) => d.cycle);
      const [klo, khi] = keep.length === 0 ? [lo, hi] : span(keep);
      const collapsed = reduced !== null;
      root.classList.add("is-shrinking");
      root.classList.toggle("is-collapsed", collapsed);
      dots.forEach((d, i) => {
        const e = dotEls[i] as HTMLElement;
        e.className = `strip-dot is-${d.style}`;
        // The 400 ms slide is a CSS transition on `left`; Reduced_Motion makes it one step.
        e.style.left = collapsed && d.style === "needed" ? percent(d.cycle, klo, khi) : percent(d.cycle, lo, hi);
      });
      prevCursor = null;
    },
    setCursor(cycle) {
      const prev = prevCursor;
      prevCursor = cycle;
      if (mode !== "moves" || prev === null || cycle <= prev || prefersReducedMotion()) return;
      for (const i of crossed(prev, cycle, dotCycles)) {
        const e = dotEls[i];
        if (e === undefined) continue;
        e.classList.remove("is-pulse");
        void e.offsetWidth; // restart the 150 ms CSS animation
        e.classList.add("is-pulse");
        e.addEventListener("animationend", () => e.classList.remove("is-pulse"), { once: true });
      }
    },
    cycles: () => dotCycles,
    clear() {
      mode = "none";
      dotEls = [];
      dotCycles = [];
      prevCursor = null;
      for (const n of [track, labels, rows, legend]) clear(n);
      root.classList.remove("is-collapsed", "is-shrinking");
    },
  };
}
