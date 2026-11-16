// Heartbeat scene: a pulse switch, a small chip block and a status lamp, original art.
// Driven only by the shown replay through heartbeatSceneAt.
import { friendlyLabel } from "../model/labels";
import { SCENE_NOTE } from "../model/scene";
import type { HeartbeatScene } from "../model/scenes";
import { markDetail } from "./details";
import { el, svg } from "./dom";

export interface HeartbeatSceneView {
  node: HTMLElement;
  render(state: HeartbeatScene): void;
}

export const HEARTBEAT_TEXT = { frozen: "frozen" } as const;

export function createHeartbeatScene(): HeartbeatSceneView {
  const lever = svg("line", { x1: 180, y1: 240, x2: 150, y2: 262, class: "switch-lever" });
  const lampGlow = svg("circle", { cx: 780, cy: 220, r: 56, class: "lamp-glow" });
  const lamp = svg("circle", { cx: 780, cy: 220, r: 40, class: "status-lamp" });
  const bracket = svg("g", { class: "frozen-bracket", visibility: "hidden" }, [
    svg("path", { d: "M720 140 V110 H840 V140", class: "scene-bracket" }),
    svg("text", { x: 780, y: 96, "text-anchor": "middle", class: "scene-label scene-label--broke" }, [HEARTBEAT_TEXT.frozen]),
  ]);
  const art = svg(
    "svg",
    {
      viewBox: "0 0 960 440",
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Heartbeat scene",
    },
    [
      svg("rect", { x: 0, y: 360, width: 960, height: 40, class: "road" }),
      // pulse switch
      svg("rect", { x: 100, y: 240, width: 120, height: 56, rx: 8, class: "housing" }),
      svg("circle", { cx: 180, cy: 240, r: 8, class: "switch-pivot" }),
      lever,
      // wires and chip block
      svg("line", { x1: 220, y1: 268, x2: 400, y2: 268, class: "wire" }),
      svg("rect", { x: 400, y: 196, width: 160, height: 144, rx: 10, class: "chip-body" }),
      svg("line", { x1: 560, y1: 268, x2: 740, y2: 268, class: "wire" }),
      lampGlow,
      lamp,
      svg("text", { x: 160, y: 330, "text-anchor": "middle", class: "scene-label" }, [
        friendlyLabel("PULSE").text,
      ]),
      markDetail(svg("text", { x: 160, y: 352, "text-anchor": "middle", class: "scene-label" }, ["PULSE"]), "tech"),
      svg("text", { x: 780, y: 330, "text-anchor": "middle", class: "scene-label" }, [
        friendlyLabel("HEARTBEAT").text,
      ]),
      markDetail(svg("text", { x: 780, y: 352, "text-anchor": "middle", class: "scene-label" }, ["HEARTBEAT"]), "tech"),
      bracket,
    ],
  );
  const summary = el("p", { class: "visually-hidden" }, ["HEARTBEAT lamp off, PULSE released"]);
  const node = el("div", { class: "scene" }, [art, summary, el("p", { class: "scene-note meta" }, [SCENE_NOTE])]);

  return {
    node,
    render(state) {
      lamp.setAttribute("class", state.lampLit ? "status-lamp is-lit" : "status-lamp");
      lampGlow.setAttribute("class", state.lampLit ? "lamp-glow is-lit" : "lamp-glow");
      lever.setAttribute("class", state.pulseOn ? "switch-lever is-on" : "switch-lever");
      // Lever up (on) or down (off).
      lever.setAttribute("y2", state.pulseOn ? "214" : "262");
      bracket.setAttribute("visibility", state.frozen ? "visible" : "hidden");
      summary.textContent = state.summary;
    },
  };
}
