// Move strip: one dot per Gremlin_Event on a track, each label directly under its dot, and the break mark
// at the right end with "+N ms broke" under it. Dots sit by real time from the earliest move to the break;
// when two would be closer than 90 px they are spaced evenly in time order (model/strip.ts stripLayout).
// The labels always keep the real times. In shrink mode the dots show the reducer's progress and a legend.
// At Phone_Width the CSS shows one row per move instead of the track.

import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { brokeLabel, crossed, shrinkDots, stripDots, stripLayout, type ShrinkDot } from "../model/strip";
import { STAGE_TEXT } from "../model/stage-copy";
import type { SignalLabels } from "../model/signal-labels";
import { clear, el, prefersReducedMotion, setChildren } from "./dom";

export interface MoveStrip {
  root: HTMLElement;
  /** Replay mode: dots by cycle up to v, each labelled, with the broke mark. */
  showMoves(list: readonly ReducerEvent[], fixture: Fixture, start: number, v: number, labels?: SignalLabels): void;
  /** Shrink mode: dots of the original list styled from the faded set and, once known, the Reduced_List. */
  showShrink(original: readonly ReducerEvent[], faded: ReadonlySet<number>, reduced: readonly ReducerEvent[] | null): void;
  /** Feed the Cursor; pulses the dots it crossed since the last call (never under Reduced_Motion). */
  setCursor(cycle: number): void;
  /** Cycles of the dots in replay mode, in dot order. */
  cycles(): readonly number[];
  clear(): void;
}

const PAD = 5; // percent kept free at each end of the shrink track
/** Width of the break mark in px; the dots and the mark share the rest of the track. */
const MARK_PX = 24;
/** Gap kept between a label and the next one, in px. */
const LABEL_GAP_PX = 8;
/** Track width used before the track has been measured (it is hidden until a replay shows). */
const FALLBACK_TRACK_PX = 720;

function percent(c: number, lo: number, hi: number): string {
  if (hi <= lo) return "50%";
  return `${String(PAD + ((100 - 2 * PAD) * (c - lo)) / (hi - lo))}%`;
}

function span(cycles: readonly number[]): [number, number] {
  return [Math.min(...cycles), Math.max(...cycles)];
}

export function createMoveStrip(): MoveStrip {
  const track = el("div", { class: "strip-track", "aria-hidden": "true" });
  const rows = el("ol", { class: "strip-rows" });
  const legend = el("div", { class: "strip-legend" });
  const root = el("div", { class: "move-strip" }, [track, rows, legend]);

  let dotEls: HTMLElement[] = [];
  let labelEls: HTMLElement[] = [];
  let labelTexts: { full: string; short: string | undefined }[] = [];
  let markEl: HTMLElement | null = null;
  let markLabel: HTMLElement | null = null;
  let dotCycles: number[] = [];
  let breakCycle = 0;
  let mode: "none" | "moves" | "shrink" = "none";
  let prevCursor: number | null = null;

  function resetDots(n: number): void {
    clear(track);
    dotEls = [];
    labelEls = [];
    markEl = null;
    markLabel = null;
    for (let i = 0; i < n; i++) {
      const d = el("span", { class: "strip-dot" });
      dotEls.push(d);
      track.appendChild(d);
    }
  }

  /** Places the dots, the mark and the labels for the measured track width (replay mode). */
  function layoutMoves(): void {
    if (mode !== "moves" || markEl === null || markLabel === null) return;
    const width = track.clientWidth > 0 ? track.clientWidth : FALLBACK_TRACK_PX;
    const usable = Math.max(0, width - MARK_PX);
    const lay = stripLayout(dotCycles, breakCycle, usable);
    track.classList.toggle("is-even", lay.even);
    const order = lay.dots.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);
    order.forEach((o, k) => {
      const dot = dotEls[o.i] as HTMLElement;
      const label = labelEls[o.i] as HTMLElement;
      dot.style.left = `${String(o.x)}px`;
      label.style.left = `${String(o.x)}px`;
      // A label may run up to the next dot (or to the mark), less a small gap.
      const next = k + 1 < order.length ? (order[k + 1] as { x: number }).x : lay.mark;
      const max = Math.max(48, next - o.x - LABEL_GAP_PX);
      label.style.maxWidth = `${String(max)}px`;
      fitLabel(label, labelTexts[o.i], max);
    });
    markEl.style.left = `${String(lay.mark)}px`;
  }

  /**
   * Upload labels: the full label unless it would take more than two lines in `max` px; then the short label
   * ("+0 ms pressed") shows and the full one moves to the tooltip. Measured when the track is laid out,
   * else estimated at 7.5 px per character.
   */
  function fitLabel(label: HTMLElement, t: { full: string; short: string | undefined } | undefined, max: number): void {
    if (t === undefined || t.short === undefined) return;
    label.textContent = t.full;
    label.removeAttribute("title");
    const lh = parseFloat(getComputedStyle(label).lineHeight);
    const lines = label.offsetHeight > 0 && Number.isFinite(lh) && lh > 0 ? label.offsetHeight / lh : (t.full.length * 7.5) / max;
    if (lines > 2.2) {
      label.textContent = t.short;
      label.setAttribute("title", t.full);
    }
  }

  if (typeof ResizeObserver === "function") new ResizeObserver(() => layoutMoves()).observe(track);

  function legendItem(style: ShrinkDot["style"], text: string): HTMLElement {
    // An icon box of fixed size, then a 6 px gap (CSS), then the text: the "testing now" ring never touches it.
    return el("span", { class: "strip-legend-item" }, [
      el("span", { class: "legend-icon", "aria-hidden": "true" }, [el("span", { class: `strip-dot is-${style}` })]),
      el("span", {}, [text]),
    ]);
  }

  return {
    root,
    showMoves(list, fixture, _start, v, labels) {
      mode = "moves";
      root.classList.remove("is-collapsed", "is-shrinking");
      root.classList.add("is-moves");
      setChildren(legend, []);
      const dots = stripDots(list, fixture, v, labels);
      dotCycles = dots.map((d) => d.cycle);
      breakCycle = v;
      resetDots(dots.length);
      labelTexts = dots.map((d) => ({ full: d.label, short: d.short }));
      labelEls = dots.map((d) => {
        const l = el("span", { class: "strip-label" }, [d.label]);
        track.appendChild(l);
        return l;
      });
      const broke = brokeLabel(list, v);
      markEl = el("span", { class: "strip-break" }, ["\u2715"]);
      markLabel = el("span", { class: "strip-label strip-label--break" }, [broke]);
      track.appendChild(markEl);
      track.appendChild(markLabel);
      dots.forEach((d, i) => (dotEls[i] as HTMLElement).setAttribute("data-label", d.label));
      setChildren(rows, [
        ...dots.map((d) => el("li", { class: "strip-row" }, [el("span", { class: "strip-dot is-needed", "aria-hidden": "true" }), d.label])),
        el("li", { class: "strip-row strip-row--break" }, [el("span", { class: "strip-break", "aria-hidden": "true" }, ["\u2715"]), broke]),
      ]);
      layoutMoves();
      prevCursor = null;
    },
    showShrink(original, faded, reduced) {
      const dots = shrinkDots(original, faded, reduced);
      if (mode !== "shrink" || dotEls.length !== dots.length) {
        mode = "shrink";
        root.classList.remove("is-moves");
        track.classList.remove("is-even");
        resetDots(dots.length);
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
      labelEls = [];
      markEl = null;
      markLabel = null;
      dotCycles = [];
      prevCursor = null;
      for (const n of [track, rows, legend]) clear(n);
      root.classList.remove("is-collapsed", "is-shrinking", "is-moves");
      track.classList.remove("is-even");
    },
  };
}
