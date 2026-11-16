// Signal timeline: one lane per mapped signal plus GREMLINS, a shared cursor, playback and keys.
import type { Violation } from "../../../engine/checker";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, FixturePin, OutputEvent } from "../../../engine/types";
import { friendlyLabel } from "../model/labels";
import type { ExampleLane } from "../model/lanes";
import { exampleLanes, inputLaneWord, outputLaneWord, plainSelectedText, releaseRanges } from "../model/lanes";
import type { PlayerState, Speed } from "../model/player";
import {
  cycleFromPlotX,
  DEFAULT_SPEED,
  home,
  jumpNext,
  jumpPrev,
  navEvents,
  nudge,
  pause,
  play,
  seek,
  setSpeed,
  showReplay,
  SPEEDS,
  tick,
} from "../model/player";
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
import { cycles, inputValueText, ms } from "../model/format";
import { originalRunNote } from "../model/verdict-plain";
import { plainOnly, signalLabel, techOnly } from "./details";
import { el, prefersReducedMotion, setChildren, svg } from "./dom";
import { nextIcon, pauseIcon, playIcon, prevIcon } from "./icons";
import { UI_COPY } from "./panels";

export type RunLabel = "Original run" | "Reduced replay" | typeof UI_COPY.trialRun;

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
  /** Lanes, labels and Lane_Words for the Current_Example fixture. Call before show(). */
  setFixture(fixture: Fixture): void;
  /** Gremlin_Event counts for the note under the Timeline while "Original run" is selected; null clears it. */
  setRunNote(counts: { original: number; reduced: number } | null): void;
  onCursor(fn: (cursor: number, view: ReplayView | null) => void): void;
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
const DEFAULT_PINS: FixturePin[] = [{ signal: "REQUEST", port: "D", bit: 2, direction: "input", activeLevel: "low" }];

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
  let lanes: ExampleLane[] = DEFAULT_LANES;
  let pins: readonly FixturePin[] = DEFAULT_PINS;
  let selection: RunLabel = "Original run";
  let runCounts: { original: number; reduced: number } | null = null;
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
  const playBtn = el("button", { type: "button", class: "icon-button" }, [playIcon(), UI_COPY.playLabel]);
  const prevBtn = el("button", { type: "button", class: "icon-button" }, [prevIcon(), UI_COPY.prevEvent]);
  const nextBtn = el("button", { type: "button", class: "icon-button" }, [nextIcon(), UI_COPY.nextEvent]);
  const breakBtn = el("button", { type: "button", class: "icon-button", hidden: true }, [UI_COPY.jumpBreak]);
  const startBtn = el("button", { type: "button", class: "icon-button" }, [UI_COPY.backToStart]);
  const speedBtns = SPEEDS.map((s) => el("button", { type: "button", class: "toggle", "aria-pressed": "false" }, [s]));
  const noEvent = "No event selected.";
  const selectedPlain = plainOnly(el("p", { class: "selected-event" }, [noEvent]));
  const selectedTech = techOnly(el("p", { class: "selected-event mono" }, [noEvent]));
  const legend = el("p", { class: "timeline-legend meta" }, [TIMELINE_LEGEND]);
  const runNote = el("p", { class: "run-note meta", hidden: true }, [""]);
  const cursorTech = techOnly(el("p", { class: "cursor-text meta mono" }, [""]));
  const cursorPlain = plainOnly(el("p", { class: "cursor-text meta" }, [""]));
  const scrubRow = el("div", { class: "scrub-row" }, [scrub, cursorPlain, cursorTech]);
  const controls = el("div", { class: "timeline-controls" }, [playBtn, prevBtn, nextBtn, breakBtn, startBtn]);
  const speedRow = el("div", { class: "speed-row" }, [
    el("span", { class: "speed-label meta" }, [UI_COPY.speedLabel]),
    el("div", { class: "toggle-row", role: "group", "aria-label": UI_COPY.speedLabel }, speedBtns),
  ]);

  const node = el("section", { class: "panel timeline-region", "aria-label": "Timeline" }, [
    el("div", { class: "timeline-head" }, [runLabel, el("div", { class: "toggle-row" }, [originalBtn, reducedBtn])]),
    timeline,
    legend,
    runNote,
    scrubRow,
    controls,
    speedRow,
    selectedPlain,
    selectedTech,
  ]);

  function refreshNote(): void {
    const show = view !== null && selection === "Original run" && runCounts !== null;
    runNote.hidden = !show;
    runNote.textContent = show && runCounts !== null ? originalRunNote(runCounts.original, runCounts.reduced) : "";
  }

  const now = (): number => performance.now();
  const x = (c: number): number => {
    const end = view === null ? 1 : Math.max(1, view.windowEnd);
    return 8 + (c / end) * (width - 16);
  };

  function setButtons(): void {
    const has = view !== null;
    for (const b of [playBtn, prevBtn, nextBtn, breakBtn, startBtn, ...speedBtns]) b.disabled = !has;
    scrub.disabled = !has;
    breakBtn.hidden = view === null || view.violation === null;
    const playText = state.playing ? UI_COPY.pauseLabel : UI_COPY.playLabel;
    if (playBtn.textContent !== playText) setChildren(playBtn, [state.playing ? pauseIcon() : playIcon(), playText]);
    speedBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(SPEEDS[i] === state.speed)));
  }

  function drawStatic(): void {
    setChildren(staticLayer, []);
    setChildren(markerLayer, []);
    markers = [];
    const w = Math.max(MIN_W, plot.clientWidth || MIN_W);
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

  function wordFor(v: ReplayView, ev: TimelineEvent): string {
    if (ev.source === "output") return outputLaneWord(v.outputEdges, ev.signal, ev.cycle);
    const pin = pins.find((p) => p.signal === ev.signal);
    return pin === undefined ? inputValueText(ev.value) : inputLaneWord(v.events, pin, ev.cycle);
  }

  function drawDynamic(): void {
    setChildren(dynamicLayer, []);
    const axisTop = LANE_H * lanes.length;
    if (view !== null) {
      const cx = x(state.cursor);
      dynamicLayer.appendChild(svg("line", { x1: cx, x2: cx, y1: 0, y2: axisTop, class: "cursor-line" }));
      if (state.selected !== null) {
        const ev = events[state.selected];
        if (ev !== undefined) {
          const lane =
            ev.source === "input" && ev.gremlinId !== "rest"
              ? lanes.length - 1
              : Math.max(0, lanes.findIndex((l) => l.signal === ev.signal));
          dynamicLayer.appendChild(
            svg("rect", { x: x(ev.cycle) - 11, y: lane * LANE_H + 9, width: 22, height: 22, class: "selected-box" }),
          );
        }
      }
    }
    const ev = state.selected === null ? undefined : events[state.selected];
    selectedTech.textContent = ev === undefined ? noEvent : selectedEventText(ev);
    selectedPlain.textContent = ev === undefined || view === null ? noEvent : plainSelectedText(ev, friendlyLabel(ev.signal).text, wordFor(view, ev));
    scrub.max = String(view === null ? 0 : view.windowEnd);
    scrub.value = String(state.cursor);
    scrub.setAttribute("aria-valuetext", ms(state.cursor));
    cursorPlain.textContent = view === null ? "" : `${UI_COPY.cursorLabel}: ${ms(state.cursor)}`;
    cursorTech.textContent = view === null ? "" : `${UI_COPY.cursorLabel}: ${ms(state.cursor)} \u00b7 ${cycles(state.cursor)} cycles`;
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

  const togglePlay = (): void => update(state.playing ? pause(state) : play(state, now()));
  playBtn.addEventListener("click", togglePlay);
  prevBtn.addEventListener("click", () => update(jumpPrev(state, events, now())));
  nextBtn.addEventListener("click", () => update(jumpNext(state, events, now())));
  breakBtn.addEventListener("click", () => {
    if (view !== null && view.violation !== null) update(seek(state, view.violation.cycle, now()));
  });
  startBtn.addEventListener("click", () => update(home(state, now())));
  const speed = (s: Speed) => update(setSpeed(state, s, now()));
  speedBtns.forEach((b, i) => b.addEventListener("click", () => speed(SPEEDS[i] as Speed)));

  // Scrubber: dragging moves the Cursor; the arrow keys move it by 1 ms, with Shift by 10 ms.
  scrub.addEventListener("input", () => {
    if (view !== null) update(seek(state, Number(scrub.value), now()));
  });
  scrub.addEventListener("keydown", (e: KeyboardEvent) => {
    if (view === null) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      update(nudge(state, e.key === "ArrowLeft" ? -step : step, now()));
    } else if (e.key === "Home") {
      e.preventDefault();
      update(seek(state, 0, now()));
    } else if (e.key === "End") {
      e.preventDefault();
      update(seek(state, state.end, now()));
    }
  });

  // A click anywhere on the plot moves the Cursor there.
  plotSvg.addEventListener("click", (e: MouseEvent) => {
    if (view === null) return;
    const box = plotSvg.getBoundingClientRect();
    const px = (e.clientX - box.left) * (box.width > 0 ? width / box.width : 1);
    update(seek(state, cycleFromPlotX(px, width, view.windowEnd), now()));
  });
  timeline.addEventListener("keydown", (e: KeyboardEvent) => {
    if (view === null) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      update(jumpPrev(state, events, now()));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      update(jumpNext(state, events, now()));
    } else if (e.key === "Home") {
      e.preventDefault();
      update(home(state, now()));
    } else if (e.key === "End") {
      e.preventDefault();
      update(seek(state, view.violation === null ? state.end : view.violation.cycle, now()));
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
      events = v === null ? [] : navEvents(timelineEvents(v.events, v.outputEdges, v.windowEnd));
      const vc = v === null || v.violation === null ? 0 : v.violation.cycle;
      state = showReplay(v === null ? 0 : v.windowEnd, vc, state.speed);
      drawStatic();
      drawDynamic();
      setButtons();
      refreshNote();
    },
    setFixture(fixture) {
      lanes = exampleLanes(fixture);
      pins = fixture.pins;
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
    setToggle(sel, reducedEnabled) {
      originalBtn.setAttribute("aria-pressed", String(sel === "Original run"));
      reducedBtn.setAttribute("aria-pressed", String(sel === "Reduced replay"));
      reducedBtn.disabled = !reducedEnabled;
      selection = sel;
      refreshNote();
    },
    onCursor(fn) {
      cursorFn = fn;
    },
    onToggle(fn) {
      toggleFn = fn;
    },
  };
}