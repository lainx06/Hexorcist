// Crosswalk scene: original flat side view, driven only by the shown replay's output edges.
// The car waits at the stop line; nothing collides.
import type { SceneState } from "../model/scene";
import { SCENE_NOTE } from "../model/scene";
import { el, svg } from "./dom";

export interface SceneView {
  node: HTMLElement;
  render(state: SceneState): void;
}

export function createScene(): SceneView {
  const lamp = (cx: number, cy: number) =>
    svg("circle", { cx, cy, r: 14, class: "lamp" });
  const red = lamp(516, 56);
  const yellow = lamp(516, 92);
  const green = lamp(516, 128);
  const figure = svg("g", { class: "walk-figure" }, [
    svg("circle", { cx: 816, cy: 112, r: 6 }),
    svg("line", { x1: 816, y1: 118, x2: 814, y2: 136 }),
    svg("line", { x1: 815, y1: 124, x2: 826, y2: 130 }),
    svg("line", { x1: 815, y1: 124, x2: 805, y2: 132 }),
    svg("line", { x1: 814, y1: 136, x2: 824, y2: 152 }),
    svg("line", { x1: 814, y1: 136, x2: 806, y2: 152 }),
  ]);
  const greenLabel = svg("text", { x: 480, y: 132, "text-anchor": "end", class: "scene-label" }, ["CAR_GREEN = not driven"]);
  const walkLabel = svg("text", { x: 816, y: 84, "text-anchor": "middle", class: "scene-label" }, ["WALK = not driven"]);
  const bracket = svg("path", { d: "M400 116 V20 H816 V66", class: "scene-bracket", visibility: "hidden" });

  const bars = [540, 584, 628, 672, 716].map((x) => svg("rect", { x, y: 314, width: 28, height: 72, class: "crossing-bar" }));

  const art = svg(
    "svg",
    {
      viewBox: "0 0 960 440",
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Crosswalk scene",
    },
    [
      svg("ellipse", { cx: 60, cy: 280, rx: 30, ry: 18, class: "shrub" }),
      svg("ellipse", { cx: 240, cy: 280, rx: 30, ry: 18, class: "shrub" }),
      svg("rect", { x: 0, y: 300, width: 960, height: 100, class: "road" }),
      svg("rect", { x: 0, y: 292, width: 960, height: 8, class: "curb" }),
      ...bars,
      // car, at the stop line
      svg("g", { class: "car" }, [
        svg("polygon", { points: "332,236 364,200 436,200 468,236" }),
        svg("rect", { x: 300, y: 236, width: 192, height: 56, rx: 18 }),
        svg("circle", { cx: 344, cy: 294, r: 16, class: "wheel" }),
        svg("circle", { cx: 448, cy: 294, r: 16, class: "wheel" }),
      ]),
      // traffic light
      svg("rect", { x: 512, y: 150, width: 8, height: 150, class: "pole" }),
      svg("rect", { x: 492, y: 32, width: 48, height: 120, rx: 8, class: "housing" }),
      red,
      yellow,
      green,
      // WALK sign
      svg("rect", { x: 812, y: 160, width: 8, height: 132, class: "pole" }),
      svg("rect", { x: 780, y: 96, width: 72, height: 64, rx: 6, class: "housing" }),
      figure,
      // ghost on the far curb
      svg("g", { class: "ghost" }, [
        svg("path", { d: "M872 286 V250 a28 30 0 0 1 56 0 V286 q-7 -10 -14 0 q-7 10 -14 0 q-7 -10 -14 0 q-7 10 -14 0 z" }),
        svg("circle", { cx: 890, cy: 252, r: 3, class: "ghost-eye" }),
        svg("circle", { cx: 910, cy: 252, r: 3, class: "ghost-eye" }),
      ]),
      greenLabel,
      walkLabel,
      bracket,
    ],
  );
  const summary = el("p", { class: "visually-hidden" }, ["CAR_RED = not driven"]);
  const node = el("div", { class: "scene" }, [art, summary, el("p", { class: "scene-note meta" }, [SCENE_NOTE])]);

  return {
    node,
    render(state: SceneState) {
      red.setAttribute("class", state.lit.CAR_RED ? "lamp lamp--red is-lit" : "lamp");
      yellow.setAttribute("class", state.lit.CAR_YELLOW ? "lamp lamp--yellow is-lit" : "lamp");
      green.setAttribute("class", state.lit.CAR_GREEN ? "lamp lamp--green is-lit" : "lamp");
      figure.setAttribute("class", state.lit.WALK ? "walk-figure is-lit" : "walk-figure");
      greenLabel.textContent = state.labels.carGreen;
      walkLabel.textContent = state.labels.walk;
      bracket.setAttribute("visibility", state.bracket ? "visible" : "hidden");
      summary.textContent = state.summary;
    },
  };
}