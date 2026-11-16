// Garage scene: straight-on elevation, original art. Driven only by the shown replay's output
// edges and recorded input events through garageSceneAt. The door position follows the Cursor
// directly, so there is no tween.
import type { GarageScene } from "../model/scenes";
import { DOOR_TRAVEL_CYCLES } from "../model/scenes";
import { SCENE_NOTE } from "../model/scene";
import { el, svg } from "./dom";

export interface GarageSceneView {
  node: HTMLElement;
  render(state: GarageScene): void;
}

export const GARAGE_TEXT = {
  beamBlocked: "Beam blocked",
  doorNote: "Door position is illustrative",
  deadline: "20 ms deadline missed",
} as const;

const DOOR_X = 300;
const DOOR_Y = 60;
const DOOR_W = 360;
const DOOR_H = 280;
const SLATS = 8;
const SLAT_H = DOOR_H / SLATS;
const BEAM_Y = 372;

export function createGarageScene(): GarageSceneView {
  const slats = Array.from({ length: SLATS }, (_, i) =>
    svg("rect", { x: DOOR_X, y: DOOR_Y + i * SLAT_H, width: DOOR_W, height: 0, class: "door-slat" }),
  );
  // Pumpkin on the ground in the beam path. The door may come down onto it; nothing living is under the door.
  const pumpkin = svg("g", { class: "pumpkin", visibility: "hidden" }, [
    svg("ellipse", { cx: 458, cy: 352, rx: 22, ry: 26, class: "pumpkin-body" }),
    svg("ellipse", { cx: 502, cy: 352, rx: 22, ry: 26, class: "pumpkin-body" }),
    svg("ellipse", { cx: 480, cy: 352, rx: 24, ry: 27, class: "pumpkin-body" }),
    svg("path", { d: "M480 325 q2 -12 12 -16", class: "pumpkin-stem" }),
    svg("polygon", { points: "467,349 473,339 479,349", class: "pumpkin-face" }),
    svg("polygon", { points: "481,349 487,339 493,349", class: "pumpkin-face" }),
    svg("path", { d: "M468 360 l6 6 l6 -6 l6 6 l6 -6", class: "pumpkin-mouth" }),
  ]);
  const beamLabel = svg("text", { x: 480, y: 396, "text-anchor": "middle", class: "scene-label", visibility: "hidden" }, [
    GARAGE_TEXT.beamBlocked,
  ]);
  const marker = svg("g", { class: "deadline-marker", visibility: "hidden" }, [
    svg("rect", { x: DOOR_X - 6, y: DOOR_Y - 6, width: DOOR_W + 12, height: DOOR_H + 12, rx: 4, class: "deadline-frame" }),
    svg("text", { x: DOOR_X + DOOR_W / 2, y: DOOR_Y - 14, "text-anchor": "middle", class: "scene-label scene-label--broke" }, [
      GARAGE_TEXT.deadline,
    ]),
  ]);
  const art = svg(
    "svg",
    {
      viewBox: "0 0 960 440",
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Garage door scene",
    },
    [
      svg("rect", { x: 0, y: 400, width: 960, height: 40, class: "road" }),
      // frame: two posts and a lintel
      svg("rect", { x: DOOR_X - 24, y: DOOR_Y - 24, width: 24, height: DOOR_H + 24 + 20, class: "frame" }),
      svg("rect", { x: DOOR_X + DOOR_W, y: DOOR_Y - 24, width: 24, height: DOOR_H + 24 + 20, class: "frame" }),
      svg("rect", { x: DOOR_X - 24, y: DOOR_Y - 24, width: DOOR_W + 48, height: 24, class: "frame" }),
      svg("rect", { x: DOOR_X, y: DOOR_Y, width: DOOR_W, height: DOOR_H, class: "door-opening" }),
      ...slats,
      // emitter and receiver, with the beam between them
      svg("rect", { x: 236, y: BEAM_Y - 16, width: 40, height: 32, rx: 4, class: "beam-block" }),
      svg("rect", { x: 684, y: BEAM_Y - 16, width: 40, height: 32, rx: 4, class: "beam-block" }),
      svg("line", { x1: 276, y1: BEAM_Y, x2: 684, y2: BEAM_Y, class: "beam-line" }),
      pumpkin,
      beamLabel,
      marker,
      svg("text", { x: 480, y: 428, "text-anchor": "middle", class: "scene-label scene-label--note" }, [GARAGE_TEXT.doorNote]),
    ],
  );
  const summary = el("p", { class: "visually-hidden" }, ["Door open, beam clear"]);
  const node = el("div", { class: "scene" }, [art, summary, el("p", { class: "scene-note meta" }, [SCENE_NOTE])]);

  return {
    node,
    render(state) {
      // Whole-pixel heights from the integer travel in cycles.
      const px = Math.floor((state.travel * DOOR_H) / DOOR_TRAVEL_CYCLES);
      slats.forEach((s, i) => {
        const h = Math.min(SLAT_H, Math.max(0, px - i * SLAT_H));
        s.setAttribute("height", String(h));
      });
      pumpkin.setAttribute("visibility", state.beamBlocked ? "visible" : "hidden");
      beamLabel.setAttribute("visibility", state.beamBlocked ? "visible" : "hidden");
      marker.setAttribute("visibility", state.deadlineMissed ? "visible" : "hidden");
      summary.textContent = state.summary;
    },
  };
}
