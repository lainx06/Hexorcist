// Signal timeline: one lane per mapped signal plus GREMLINS, a scrubber and "Jump to the break".
// The Cursor is the stage Playback cursor: the page feeds it in with setCursor and takes scrubber moves
// out with onSeek. The timeline plays nothing itself.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent } from "../../../engine/types";
import type { ExampleLane } from "../model/lanes";
import { exampleLanes, releaseRanges } from "../model/lanes";
import type { Span } from "../model/span";
import type { LaneLevel, Marker } from "../model/timeline";
import { axisTicks, eventValue, gremlinMarkers, laneSegments, LANES, markersToRemove } from "../model/timeline";
import { cycles, ms } from "../model/format";
import { originalRunNote } from "../model/verdict-plain";
import { plainOnly, signalLabel, techOnly } from "./details";
import { el, prefersReducedMotion, setChildren, svg } from "./dom";
import { UI_COPY } from "./panels";

export type RunLabel = "Original run" | "Reduced replay" | "Fixed program" | typeof UI_COPY.trialRun;

export interface ReplayView {
  label: RunLabel;
  events: ReducerEvent[];
  outputEdges: OutputEvent[];
  violation: Violation | null;
  reachedEnd: number;
  windowEnd: number;
  span: Span | null;
}

export interface TimelineView {
  node: HTMLElement;
  show(view: ReplayView | null): void;
  /** Removes GREMLINS markers that a smaller best list no longer holds. */
  dropMarkers(bestGremlinCount: number, bestList: readonly ReducerEvent[]): void;
  setToggle(selected: RunLabel, reducedEnabled: boolean, fixedEnabled?: boolean): void;
  /** Lanes, labels and Lane_Words for the Current_Example fixture. Call before show(). */
  setFixture(fixture: Fixture): void;
  /** Gremlin_Event counts for the note under the Timeline while "Original run" is selected; null clears it. */
  setRunNote(counts: { original: number; reduced: number } | null): void;
  /** The stage Cursor moved (playback or seek). `range` is the span the scrubber covers, or null for the whole window. */
  setCursor(cycle: number, range?: { min: number; max: number } | null): void;
  /** The scrubber moved, or "Jump to the break" was pressed: the page moves the stage Playback there. */
  onSeek(fn: (cycle: number) => void): void;
  onToggle(fn: (label: RunLabel) => void): void;
}

const LANE_H = 40;
const AXIS_H = 32;
const MIN_W = 720;

export const TIMELINE_LEGEND = "Solid line: on or off. Dotted: input released (not driven by a gremlin).";

// Used until setFixture is called: the crosswalk lanes.
const DEFAULT_LANES: ExampleLane[] = LANES.map((signal) => ({
  signal,
  direction: signal === "GREMLINS" ? "gremlins" : signal === "REQUEST" ? "input" : "output",
}));

function yFor(level: LaneLevel, top: number): number | null {
  if (level === 1) return top + 8;
  if (level === 0) return top + 32;
  return null;
}

export function createTimeline(): TimelineView {
  let view: ReplayView | null = null;
  let markers: { m: Marker; node: SVGElement }[] = [];
  let cursor = 0;
  let range: { min: number; max: number } | null = null;
  let width = MIN_W;
  let lanes: ExampleLane[] = DEFAULT_LANES;
  let selection: RunLabel = "Original run";
  let runCounts: { original: number; reduced: number } | null = null;
  let toggleFn: (l: RunLabel) => void = () => undefined;
  let seekFn: (cycle: number) => void = () => undefined;
  const runLabel = el("p", { class: "run-label region-title" }, ["No replay yet."]);
  // "Original run" is a Technical_View control; "Reduced replay" and "Fixed program" show in both views.
  const originalBtn = techOnly(el("button", { type: "button", class: "toggle", "aria-pressed": "true" }, ["Original run"]));
  const reducedBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "false", disabled: true }, [
    "Reduced replay",
  ]);
  const fixedBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "false", disabled: true }, [
    "Fixed program",
  ]);
  originalBtn.addEventListener("click", () => toggleFn("Original run"));
  reducedBtn.addEventListener("click", () => toggleFn("Reduced replay"));
  fixedBtn.addEventListener("click", () => toggleFn("Fixed program"));

  const labels = el("div", { class: "lane-labels", "aria-hidden": "true" }, []);
  const drawLabels = (): void =>
    setChildren(
      labels,
      lanes.map((l) => el("div", { class: "lane-label" }, [signalLabel(l.signal)])),
    );
  drawLabels();
  const plotSvg = svg("svg", { class: "plot-svg", height: LANE_H * lanes.length + AXIS_H, width: MIN_W });
  const staticLayer = svg("g", {});
  const markerLayer = svg("g", {});
  const dynamicLayer = svg("g", {});
  plotSvg.appendChild(
    svg("defs", {}, [
      svg("pattern", { id: "span-hatch", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, [
        svg("line", { x1: 0, y1: 0, x2: 0, y2: 8, class: "hatch-line" }),
      ]),
    ]),
  );
  plotSvg.appendChild(staticLayer);
  plotSvg.appendChild(markerLayer);
  plotSvg.appendChild(dynamicLayer);
  const plot = el("div", { class: "plot-scroll" }, [plotSvg]);
  const timeline = el("div", { class: "timeline", role: "group", "aria-label": "Signal timeline" }, [labels, plot]);

  const scrub = el("input", {
    type: "range",
    class: "scrubber",
    min: 0,
    max: 0,
    step: 1,
    value: 0,
    disabled: true,
    "aria-label": UI_COPY.scrubLabel,
  });
  const breakBtn = el("button", { type: "button", class: "icon-button", hidden: true }, [UI_COPY.jumpBreak]);
  const legend = el("p", { class: "timeline-legend meta" }, [TIMELINE_LEGEND]);
  const runNote = el("p", { class: "run-note meta", hidden: true }, [""]);
  const cursorTech = techOnly(el("p", { class: "cursor-text meta mono" }, [""]));
  const cursorPlain = plainOnly(el("p", { class: "cursor-text meta" }, [""]));
  const scrubRow = el("div", { class: "scrub-row" }, [scrub, breakBtn, cursorPlain, cursorTech]);
  const node = el("section", { class: "panel timeline-region", "aria-label": "Timeline" }, [
    el("div", { class: "timeline-head" }, [runLabel, el("div", { class: "toggle-row" }, [originalBtn, reducedBtn, fixedBtn])]),
    timeline,
    legend,
    runNote,
    scrubRow,
  ]);

  function refreshNote(): void {
    const show = view !== null && selection === "Original run" && runCounts !== null;
    runNote.hidden = !show;
    runNote.textContent = show && runCounts !== null ? originalRunNote(runCounts.original, runCounts.reduced) : "";
  }

  const x = (c: number): number => {
    const end = view === null ? 1 : Math.max(1, view.windowEnd);
    return 8 + (c / end) * (width - 16);
  };

  function setButtons(): void {
    const has = view !== null;
    scrub.disabled = !has;
    breakBtn.disabled = !has;
    breakBtn.hidden = view === null || view.violation === null;
  }
  function drawStatic(): void {
    setChildren(staticLayer, []);
    setChildren(markerLayer, []);
    markers = [];
    // The plot fills the width of its box; a narrow box scrolls at MIN_W.
    const w = Math.max(MIN_W, Math.floor(plot.clientWidth));
    width = w;
    plotSvg.setAttribute("width", String(w));
    plotSvg.setAttribute("height", String(LANE_H * lanes.length + AXIS_H));
    lanes.forEach((_, i) => {
      staticLayer.appendChild(svg("line", { x1: 0, x2: w, y1: (i + 1) * LANE_H, y2: (i + 1) * LANE_H, class: "lane-rule" }));
    });
    const axisTop = LANE_H * lanes.length;
    if (view === null) return;
    const v = view;
    // span (hatched) and violation marker
    if (v.violation !== null && v.span !== null) {
      const to = Math.min(v.violation.cycle + v.span.lengthCycles, v.windowEnd);
      staticLayer.appendChild(
        svg("rect", {
          x: x(v.violation.cycle),
          y: 0,
          width: Math.max(1, x(to) - x(v.violation.cycle)),
          height: axisTop,
          fill: "url(#span-hatch)",
          class: "span-rect",
        }),
      );
    }
    // signal lanes
    lanes.forEach((lane, i) => {
      if (lane.direction === "gremlins") return;
      const signal = lane.signal;
      const top = i * LANE_H;
      const isInput = lane.direction === "input";
      const points = isInput
        ? v.events.filter((e) => e.signal === signal).map((e) => ({ cycle: e.cycle, value: eventValue(e) }))
        : v.outputEdges.filter((e) => e.signal === signal).map((e) => ({ cycle: e.cycle, value: e.value as LaneLevel }));
      const segs = laneSegments(points, v.windowEnd);
      let prevY: number | null = null;
      for (const s of segs) {
        // Released parts of an input are drawn dotted from releaseRanges below.
        if (isInput && s.level === "release") {
          prevY = null;
          continue;
        }
        const y = yFor(s.level, top);
        const x1 = x(s.from);
        const x2 = x(s.to);
        if (y === null) {
          staticLayer.appendChild(svg("line", { x1, x2, y1: top + 20, y2: top + 20, class: "lane-undriven" }));
          prevY = null;
        } else {
          if (prevY !== null && prevY !== y) {
            staticLayer.appendChild(svg("line", { x1, x2: x1, y1: prevY, y2: y, class: "lane-step" }));
          }
          staticLayer.appendChild(svg("line", { x1, x2, y1: y, y2: y, class: "lane-step" }));
          prevY = y;
        }
      }
      if (isInput) {
        for (const r of releaseRanges(v.events, signal, v.windowEnd)) {
          if (r.from > v.windowEnd) continue;
          const to = Math.min(r.to, v.windowEnd);
          staticLayer.appendChild(svg("line", { x1: x(r.from), x2: x(to), y1: top + 20, y2: top + 20, class: "lane-released" }));
        }
      }
    });
    if (v.violation !== null) {
      const vx = x(v.violation.cycle);
      staticLayer.appendChild(svg("line", { x1: vx, x2: vx, y1: 0, y2: axisTop, class: "violation-line" }));
      staticLayer.appendChild(
        svg("path", { d: `M${vx} ${axisTop + 2} l6 7 l-6 7 l-6 -7 z`, class: "violation-mark" }),
      );
    }
    // axis
    for (const t of axisTicks(v.windowEnd, 6)) {
      const tx = x(t.cycle);
      staticLayer.appendChild(svg("line", { x1: tx, x2: tx, y1: axisTop, y2: axisTop + 6, class: "axis-tick" }));
      const anchor = t.cycle === 0 ? "start" : t.cycle >= v.windowEnd ? "end" : "middle";
      staticLayer.appendChild(svg("text", { x: tx, y: axisTop + 26, "text-anchor": anchor, class: "axis-label" }, [t.label]));
    }
    // gremlin markers
    const gTop = (lanes.length - 1) * LANE_H;
    for (const m of gremlinMarkers(v.events, v.windowEnd)) {
      const g = svg("g", { class: "marker" }, [
        svg("circle", { cx: x(m.cycle), cy: gTop + 20, r: 9, class: "marker-dot" }),
        svg("text", { x: x(m.cycle), y: gTop + 24, "text-anchor": "middle", class: "marker-letter" }, [
          m.gremlinId.slice(0, 1).toUpperCase(),
        ]),
      ]);
      markerLayer.appendChild(g);
      markers.push({ m, node: g });
    }
  }

  function drawDynamic(): void {
    setChildren(dynamicLayer, []);
    const axisTop = LANE_H * lanes.length;
    const end = view === null ? 0 : view.windowEnd;
    const shown = Math.max(0, Math.min(cursor, end));
    if (view !== null) {
      const cx = x(shown);
      dynamicLayer.appendChild(svg("line", { x1: cx, x2: cx, y1: 0, y2: axisTop, class: "cursor-line" }));
    }
    const lo = range === null ? 0 : Math.max(0, Math.min(range.min, end));
    const hi = range === null ? end : Math.max(lo, Math.min(range.max, end));
    scrub.min = String(lo);
    scrub.max = String(hi);
    scrub.value = String(Math.max(lo, Math.min(shown, hi)));
    scrub.setAttribute("aria-valuetext", ms(shown));
    cursorPlain.textContent = view === null ? "" : `${UI_COPY.cursorLabel}: ${ms(shown)}`;
    cursorTech.textContent = view === null ? "" : `${UI_COPY.cursorLabel}: ${ms(shown)} \u00b7 ${cycles(shown)} cycles`;
  }

  breakBtn.addEventListener("click", () => {
    if (view !== null && view.violation !== null) seekFn(view.violation.cycle);
  });

  // Scrubber: dragging moves the stage Cursor; the arrow keys move it by 1 ms, with Shift by 10 ms.
  scrub.addEventListener("input", () => {
    if (view !== null) seekFn(Number(scrub.value));
  });
  scrub.addEventListener("keydown", (e: KeyboardEvent) => {
    if (view === null) return;
    const step = (e.shiftKey ? 10 : 1) * 16_000;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      seekFn(Number(scrub.value) + (e.key === "ArrowLeft" ? -step : step));
    } else if (e.key === "Home") {
      e.preventDefault();
      seekFn(Number(scrub.min));
    } else if (e.key === "End") {
      e.preventDefault();
      seekFn(Number(scrub.max));
    }
  });

  // The plot fills its box: redraw when the box gets a new width (a hidden tab has none until it shows).
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      const w = Math.floor(plot.clientWidth);
      if (w > 0 && Math.max(MIN_W, w) !== width) {
        drawStatic();
        drawDynamic();
      }
    }).observe(plot);
  }

  setButtons();
  drawStatic();
  drawDynamic();
  return {
    node,
    show(v) {
      view = v;
      runLabel.textContent = v === null ? "No replay yet." : v.label;
      drawStatic();
      drawDynamic();
      setButtons();
      refreshNote();
    },
    setFixture(fixture) {
      lanes = exampleLanes(fixture);
      drawLabels();
    },
    setRunNote(counts) {
      runCounts = counts;
      refreshNote();
    },
    dropMarkers(bestGremlinCount, bestList) {
      const gone = markersToRemove(
        markers.map((x) => x.m),
        bestGremlinCount,
        bestList,
      );
      for (const g of gone) {
        const idx = markers.findIndex((x) => x.m === g);
        if (idx < 0) continue;
        const entry = markers[idx] as { m: Marker; node: SVGElement };
        markers.splice(idx, 1);
        if (prefersReducedMotion()) {
          entry.node.remove();
        } else {
          entry.node.setAttribute("class", "marker is-leaving");
          const done = () => entry.node.remove();
          entry.node.addEventListener("transitionend", done, { once: true });
          setTimeout(done, 160);
        }
      }
    },
    setToggle(sel, reducedEnabled, fixedEnabled = false) {
      originalBtn.setAttribute("aria-pressed", String(sel === "Original run"));
      reducedBtn.setAttribute("aria-pressed", String(sel === "Reduced replay"));
      fixedBtn.setAttribute("aria-pressed", String(sel === "Fixed program"));
      reducedBtn.disabled = !reducedEnabled;
      fixedBtn.disabled = !fixedEnabled;
      selection = sel;
      refreshNote();
    },
    setCursor(cycle, r = null) {
      cursor = cycle;
      range = r;
      drawDynamic();
    },
    onSeek(fn) {
      seekFn = fn;
    },
    onToggle(fn) {
      toggleFn = fn;
    },
  };
}