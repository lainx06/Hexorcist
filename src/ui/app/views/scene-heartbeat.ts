// I'm-alive scene: a sensor, a "Program" box and a light with a ring. update() maps heartbeatSceneAt,
// ringAt, stuckHoldsPulse and forgotLine output to SVG attributes and HTML labels. Names sit in an HTML
// row under the art, in three columns that line up with the three drawn parts.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import { friendlyLabel } from "../model/labels";
import { FORGOT_LINE, RING_TEXT, forgotLine, heartbeatSceneAt, ringAt, stuckHoldsPulse } from "../model/scenes";
import { markDetail } from "./details";
import { el, svg } from "./dom";
import { gremlinIcon } from "./icons";
import type { SceneCommonOpts } from "./scene-chrome";
import { createChrome } from "./scene-chrome";

export interface HeartbeatOpts extends SceneCommonOpts {
  /** The rule limit in whole ms (600 by default). */
  limitMs?: number;
  /** An I'm-alive rule broke on the shown run. */
  imAliveRuleBroke?: boolean;
  /** Which build the shown run is. The line under the scene is for the buggy build only. */
  build?: "buggy" | "fixed";
}

export interface HeartbeatSceneView {
  node: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: HeartbeatOpts): void;
}

export const HEARTBEAT_TEXT = {
  program: "Program",
  sensor: friendlyLabel("PULSE").text,
  light: friendlyLabel("HEARTBEAT").text,
  blinking: RING_TEXT.blinking,
  forgot: FORGOT_LINE,
} as const;

/** Caption under the light: what the ring measures, and the limit of the rule. */
export function ringCaption(limitMs: number): string {
  return `Ring: time since the last blink (limit ${String(limitMs)} ms)`;
}

/** The viewBox is 960 wide; the three parts sit at 1/6, 3/6 and 5/6 of it. */
const SENSOR_X = 160;
const PROGRAM_X = 480;
const LIGHT_X = 800;
const LIGHT_Y = 190;
const RING_R = 62;

export function createHeartbeatScene(): HeartbeatSceneView {
  const lever = svg("line", { x1: SENSOR_X + 20, y1: 220, x2: SENSOR_X - 10, y2: 242, class: "switch-lever" });
  const stuckIcon = gremlinIcon("gremlin-stuck", { className: "sensor-stuck" }) as SVGElement;
  stuckIcon.setAttribute("x", String(SENSOR_X - 40));
  stuckIcon.setAttribute("y", "140");
  stuckIcon.setAttribute("width", "80");
  stuckIcon.setAttribute("height", "80");
  stuckIcon.setAttribute("visibility", "hidden");

  const lampGlow = svg("circle", { cx: LIGHT_X, cy: LIGHT_Y, r: 52, class: "lamp-glow" });
  const lamp = svg("circle", { cx: LIGHT_X, cy: LIGHT_Y, r: 40, class: "status-lamp" });
  // pathLength 1000 makes the dash length the ring fill in thousandths.
  const ringFill = svg("circle", {
    cx: LIGHT_X,
    cy: LIGHT_Y,
    r: RING_R,
    class: "ring-fill",
    pathLength: 1000,
    "stroke-dasharray": "0 1000",
    transform: `rotate(-90 ${String(LIGHT_X)} ${String(LIGHT_Y)})`,
  });

  const scenery = svg("g", { class: "scene-dimmable" }, [
    svg("rect", { x: 0, y: 330, width: 960, height: 30, class: "road" }),
    svg("rect", { x: SENSOR_X - 60, y: 220, width: 120, height: 56, rx: 8, class: "housing" }),
    svg("circle", { cx: SENSOR_X + 20, cy: 220, r: 8, class: "switch-pivot" }),
    lever,
    svg("line", { x1: SENSOR_X + 60, y1: 248, x2: PROGRAM_X - 80, y2: 248, class: "wire" }),
    svg("rect", { x: PROGRAM_X - 80, y: 170, width: 160, height: 156, rx: 10, class: "chip-body" }),
    svg("line", { x1: PROGRAM_X + 80, y1: LIGHT_Y, x2: LIGHT_X - RING_R, y2: LIGHT_Y, class: "wire" }),
    stuckIcon,
  ]);
  // The ring fills clockwise from the top, so it is full at the top again: the tick sits there, at the limit.
  const limitTick = svg("line", {
    x1: LIGHT_X,
    y1: LIGHT_Y - RING_R - 14,
    x2: LIGHT_X,
    y2: LIGHT_Y - RING_R + 14,
    class: "ring-limit-tick",
  });
  const light = svg("g", { class: "scene-light" }, [
    svg("circle", { cx: LIGHT_X, cy: LIGHT_Y, r: RING_R, class: "ring-track" }),
    ringFill,
    limitTick,
    lampGlow,
    lamp,
  ]);
  const art = svg(
    "svg",
    {
      viewBox: "0 0 960 360",
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "I'm-alive light scene",
    },
    [scenery, light],
  );

  const column = (name: string, techName: string, extra: HTMLElement | null, caption: HTMLElement | null = null): HTMLElement =>
    el("div", { class: "scene-column" }, [
      el("span", {}, [name]),
      markDetail(el("span", { class: "signal-name" }, [techName]), "tech"),
      extra,
      caption,
    ]);
  const ringLabel = el("span", { class: "scene-ring-label" }, [HEARTBEAT_TEXT.blinking]);
  const ringNote = el("span", { class: "scene-ring-caption" }, [ringCaption(600)]);
  const labelRow = el("div", { class: "scene-label-row scene-label-row--three" }, [
    column(HEARTBEAT_TEXT.sensor, "PULSE", null),
    el("div", { class: "scene-column" }, [el("span", {}, [HEARTBEAT_TEXT.program])]),
    column(HEARTBEAT_TEXT.light, "HEARTBEAT", ringLabel, ringNote),
  ]);
  const line = el("p", { class: "scene-line", hidden: true }, [HEARTBEAT_TEXT.forgot]);
  const summary = el("p", { class: "visually-hidden" }, [""]);
  const chrome = createChrome([art, labelRow, line, summary]);

  return {
    node: chrome.node,
    update(edges, events, cursor, opts = {}) {
      const state = heartbeatSceneAt({ outputEdges: edges, events, violation: null }, null, cursor);
      const limit = opts.limitMs ?? 600;
      const ring = ringAt(edges, cursor, limit);
      ringNote.textContent = ringCaption(limit);

      lamp.setAttribute("class", state.lampLit ? "status-lamp is-lit" : "status-lamp");
      lampGlow.setAttribute("class", state.lampLit ? "lamp-glow is-lit" : "lamp-glow");
      lever.setAttribute("class", state.pulseOn ? "switch-lever is-on" : "switch-lever");
      lever.setAttribute("y2", state.pulseOn ? "196" : "242");
      stuckIcon.setAttribute("visibility", stuckHoldsPulse(events, cursor) ? "visible" : "hidden");

      ringFill.setAttribute("stroke-dasharray", `${((1000 * ring.num) / ring.den).toFixed(1)} 1000`);
      ringFill.setAttribute("class", ring.stuck === null ? "ring-fill" : "ring-fill is-stuck");
      ringLabel.textContent = ring.label;
      ringLabel.classList.toggle("scene-flag", ring.stuck !== null);

      const forgot = forgotLine(opts.imAliveRuleBroke === true, opts.build ?? "buggy");
      line.textContent = forgot ?? "";
      line.toggleAttribute("hidden", forgot === null);

      summary.textContent = state.summary;
      chrome.apply(opts);
    },
  };
}
