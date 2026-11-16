// Signal timeline: one lane per mapped signal plus GREMLINS, a shared cursor, playback and keys.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import type { PlayerState, Speed } from "../model/player";
import { DEFAULT_SPEED, home, pause, play, setSpeed, showReplay, stepNext, stepPrev, tick, toEnd } from "../model/player";
import type { Span } from "../model/span";
import type { LaneLevel, Marker, TimelineEvent } from "../model/timeline";
import {
  axisTicks,
  eventValue,
  gremlinMarkers,
  laneSegments,
  LANES,
  markersToRemove,
  selectedEventText,
  timelineEvents,
} from "../model/timeline";
import { ms } from "../model/format";
import { el, prefersReducedMotion, setChildren, svg } from "./dom";
import { nextIcon, pauseIcon, playIcon, prevIcon } from "./icons";

export type RunLabel = "Original run" | "Reduced replay";

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
  setToggle(selected: RunLabel, reducedEnabled: boolean): void;
  onCursor(fn: (cursor: number, view: ReplayView | null) => void): void;
  onToggle(fn: (label: RunLabel) => void): void;
}

const LANE_H = 40;
const AXIS_H = 32;
const MIN_W = 720;
const SIGNAL_LANES = LANES.filter((l) => l !== "GREMLINS");

function yFor(level: LaneLevel, top: number): number | null {
  if (level === 1) return top + 8;
  if (level === 0) return top + 32;
  return null;
}

export function createTimeline(): TimelineView {
  let view: ReplayView | null = null;
  let events: TimelineEvent[] = [];
  let markers: { m: Marker; node: SVGElement }[] = [];
  let state: PlayerState = showReplay(0, 0, DEFAULT_SPEED);
  let width = MIN_W;
  let frame = 0;
  let cursorFn: (c: number, v: ReplayView | null) => void = () => undefined;
  let toggleFn: (l: RunLabel) => void = () => undefined;

  const runLabel = el("p", { class: "run-label region-title" }, ["No replay yet."]);
  const originalBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "true" }, ["Original run"]);
  const reducedBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "false", disabled: true }, [
    "Reduced replay",
  ]);
  originalBtn.addEventListener("click", () => toggleFn("Original run"));
  reducedBtn.addEventListener("click", () => toggleFn("Reduced replay"));

  const labels = el(
    "div",
    { class: "lane-labels mono", "aria-hidden": "true" },
    LANES.map((l) => el("div", { class: "lane-label" }, [l])),
  );
  const plotSvg = svg("svg", { class: "plot-svg", height: LANE_H * LANES.length + AXIS_H, width: MIN_W });
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
  const timeline = el(
    "div",
    {
      class: "timeline",
      tabindex: 0,
      role: "group",
      "aria-label": "Signal timeline. Space plays or pauses, arrows step through events, Home and End jump.",
    },
    [labels, plot],
  );

  const playBtn = el("button", { type: "button", class: "icon-button", "aria-label": "Play" }, [playIcon()]);
  const pauseBtn = el("button", { type: "button", class: "icon-button", "aria-label": "Pause" }, [pauseIcon()]);
  const prevBtn = el("button", { type: "button", class: "icon-button", "aria-label": "Previous event" }, [prevIcon()]);
  const nextBtn = el("button", { type: "button", class: "icon-button", "aria-label": "Next event" }, [nextIcon()]);
  const slowBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "false" }, ["0.1x"]);
  const fastBtn = el("button", { type: "button", class: "toggle", "aria-pressed": "true" }, ["1x"]);
  const selected = el("p", { class: "selected-event mono" }, ["No event selected."]);
  const cursorText = el("p", { class: "cursor-text meta mono" }, [""]);
  const controls = el("div", { class: "timeline-controls" }, [playBtn, pauseBtn, prevBtn, nextBtn, slowBtn, fastBtn]);

  const node = el("section", { class: "panel timeline-region", "aria-label": "Timeline" }, [
    el("div", { class: "timeline-head" }, [runLabel, el("div", { class: "toggle-row" }, [originalBtn, reducedBtn])]),
    timeline,
    controls,
    selected,
    cursorText,
  ]);

  const now = (): number => performance.now();
  const x = (c: number): number => {
    const end = view === null ? 1 : Math.max(1, view.windowEnd);
    return 8 + (c / end) * (width - 16);
  };

  function setButtons(): void {
    const has = view !== null;
    for (const b of [playBtn, pauseBtn, prevBtn, nextBtn, slowBtn, fastBtn]) b.disabled = !has;
    slowBtn.setAttribute("aria-pressed", String(state.speed === "0.1x"));
    fastBtn.setAttribute("aria-pressed", String(state.speed === "1x"));
  }

  function drawStatic(): void {
    setChildren(staticLayer, []);
    setChildren(markerLayer, []);
    markers = [];
    const w = Math.max(MIN_W, plot.clientWidth || MIN_W);
    width = w;
    plotSvg.setAttribute("width", String(w));
    LANES.forEach((_, i) => {
      staticLayer.appendChild(svg("line", { x1: 0, x2: w, y1: (i + 1) * LANE_H, y2: (i + 1) * LANE_H, class: "lane-rule" }));
    });
    const axisTop = LANE_H * LANES.length;
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
    SIGNAL_LANES.forEach((signal, i) => {
      const top = i * LANE_H;
      const points =
        signal === "REQUEST"
          ? v.events.filter((e) => e.signal === signal).map((e) => ({ cycle: e.cycle, value: eventValue(e) }))
          : v.outputEdges.filter((e) => e.signal === signal).map((e) => ({ cycle: e.cycle, value: e.value as LaneLevel }));
      const segs = laneSegments(points, v.windowEnd);
      let prevY: number | null = null;
      for (const s of segs) {
        const y = yFor(s.level, top);
        const x1 = x(s.from);
        const x2 = x(s.to);
        if (y === null) {
          const cls = s.level === "release" ? "lane-released" : "lane-undriven";
          staticLayer.appendChild(svg("line", { x1, x2, y1: top + 20, y2: top + 20, class: cls }));
          prevY = null;
        } else {
          if (prevY !== null && prevY !== y) {
            staticLayer.appendChild(svg("line", { x1, x2: x1, y1: prevY, y2: y, class: "lane-step" }));
          }
          staticLayer.appendChild(svg("line", { x1, x2, y1: y, y2: y, class: "lane-step" }));
          prevY = y;
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
    const gTop = (LANES.length - 1) * LANE_H;
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
    const axisTop = LANE_H * LANES.length;
    if (view !== null) {
      const cx = x(state.cursor);
      dynamicLayer.appendChild(svg("line", { x1: cx, x2: cx, y1: 0, y2: axisTop, class: "cursor-line" }));
      if (state.selected !== null) {
        const ev = events[state.selected];
        if (ev !== undefined) {
          const lane = ev.source === "input" && ev.gremlinId !== "rest" ? LANES.length - 1 : Math.max(0, LANES.indexOf(ev.signal as (typeof LANES)[number]));
          dynamicLayer.appendChild(
            svg("rect", { x: x(ev.cycle) - 11, y: lane * LANE_H + 9, width: 22, height: 22, class: "selected-box" }),
          );
        }
      }
    }
    const ev = state.selected === null ? undefined : events[state.selected];
    selected.textContent = ev === undefined ? "No event selected." : selectedEventText(ev);
    cursorText.textContent = view === null ? "" : `Cursor: ${ms(state.cursor)}`;
    cursorFn(state.cursor, view);
  }

  function loop(): void {
    frame = 0;
    if (!state.playing) return;
    state = tick(state, now());
    drawDynamic();
    if (state.playing) frame = requestAnimationFrame(loop);
    setButtons();
  }

  function update(next: PlayerState): void {
    state = next;
    drawDynamic();
    setButtons();
    if (state.playing && frame === 0) frame = requestAnimationFrame(loop);
    if (!state.playing && frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  playBtn.addEventListener("click", () => update(play(state, now())));
  pauseBtn.addEventListener("click", () => update(pause(state)));
  prevBtn.addEventListener("click", () => update(stepPrev(state, events, now())));
  nextBtn.addEventListener("click", () => update(stepNext(state, events, now())));
  const speed = (s: Speed) => update(setSpeed(state, s, now()));
  slowBtn.addEventListener("click", () => speed("0.1x"));
  fastBtn.addEventListener("click", () => speed("1x"));

  timeline.addEventListener("keydown", (e: KeyboardEvent) => {
    if (view === null) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      update(state.playing ? pause(state) : play(state, now()));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      update(stepPrev(state, events, now()));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      update(stepNext(state, events, now()));
    } else if (e.key === "Home") {
      e.preventDefault();
      update(home(state, now()));
    } else if (e.key === "End") {
      e.preventDefault();
      update(toEnd(state, now()));
    }
  });

  setButtons();
  drawStatic();
  drawDynamic();

  return {
    node,
    show(v) {
      view = v;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      runLabel.textContent = v === null ? "No replay yet." : v.label;
      events = v === null ? [] : timelineEvents(v.events, v.outputEdges, v.windowEnd);
      const vc = v === null || v.violation === null ? 0 : v.violation.cycle;
      state = showReplay(v === null ? 0 : v.windowEnd, vc, state.speed);
      drawStatic();
      drawDynamic();
      setButtons();
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
    setToggle(sel, reducedEnabled) {
      originalBtn.setAttribute("aria-pressed", String(sel === "Original run"));
      reducedBtn.setAttribute("aria-pressed", String(sel === "Reduced replay"));
      reducedBtn.disabled = !reducedEnabled;
    },
    onCursor(fn) {
      cursorFn = fn;
    },
    onToggle(fn) {
      toggleFn = fn;
    },
  };
}