// Crosswalk scene: original top-down art. update() maps crosswalkFrame and crosswalkLabels output to
// SVG attributes and HTML labels. It holds no scene logic. The car never overlaps the stripes while the
// walker is on them; that holds in the model, so the view only draws the frame it is given.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import type { CarLight } from "../model/crosswalk-scene";
import { crosswalkFrame, crosswalkLabels } from "../model/crosswalk-scene";
import { crossed } from "../model/strip";
import { el, svg } from "./dom";
import { masherIcon } from "./icons";
import type { SceneCommonOpts } from "./scene-chrome";
import { createChrome } from "./scene-chrome";

export type CrosswalkOpts = SceneCommonOpts;

export interface CrosswalkSceneView {
  node: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: CrosswalkOpts): void;
}

/** Cycles per scene unit: the 6,400,000-cycle loop spans 800 units. */
const CYCLES_PER_UNIT = 8_000;
/** Cycles per unit of walker travel: 4,800,000 cycles span 300 units. */
const WALK_CYCLES_PER_UNIT = 16_000;
const WALKER_X = 380;
const WALKER_TOP = 60;
const BUTTON_X = 473;
const BUTTON_Y = 34;

const num = (n: number): string => n.toFixed(2);

export function createCrosswalkScene(): CrosswalkSceneView {
  const stripes = Array.from({ length: 6 }, (_, i) => svg("rect", { x: 320 + i * 20, y: 100, width: 12, height: 240, class: "stripe" }));

  // The car faces right; its front sits at x = 0 of its own group.
  const car = svg("g", { class: "car-top" }, [
    svg("rect", { x: -100, y: 244, width: 20, height: 8, rx: 2, class: "car-wheel" }),
    svg("rect", { x: -34, y: 244, width: 20, height: 8, rx: 2, class: "car-wheel" }),
    svg("rect", { x: -100, y: 308, width: 20, height: 8, rx: 2, class: "car-wheel" }),
    svg("rect", { x: -34, y: 308, width: 20, height: 8, rx: 2, class: "car-wheel" }),
    svg("rect", { x: -120, y: 250, width: 120, height: 60, rx: 16, class: "car-body" }),
    svg("rect", { x: -40, y: 254, width: 38, height: 52, rx: 10, class: "car-hood" }),
    svg("rect", { x: -64, y: 258, width: 20, height: 44, rx: 4, class: "car-glass" }),
    svg("rect", { x: -104, y: 262, width: 36, height: 36, rx: 6, class: "car-roof" }),
    svg("circle", { cx: -5, cy: 262, r: 6, class: "car-headlight" }),
    svg("circle", { cx: -5, cy: 298, r: 6, class: "car-headlight" }),
  ]);

  const walker = svg("g", { class: "walker" }, [
    svg("ellipse", { cx: 0, cy: 4, rx: 16, ry: 9, class: "walker-body" }),
    svg("circle", { cx: 0, cy: 0, r: 8, class: "walker-head" }),
  ]);

  const lamp = (cy: number, color: string) => svg("circle", { cx: 288, cy, r: 11, class: `lamp lamp--${color}` });
  const red = lamp(380, "red");
  const yellow = lamp(410, "yellow");
  const green = lamp(440, "green");
  const carRing = svg("rect", { x: 260, y: 346, width: 56, height: 124, rx: 12, class: "conflict-ring", visibility: "hidden" });

  const walkFigure = svg("g", { class: "walk-figure" }, [
    svg("circle", { cx: 492, cy: 366, r: 6 }),
    svg("line", { x1: 492, y1: 373, x2: 492, y2: 392 }),
    svg("line", { x1: 492, y1: 379, x2: 481, y2: 387 }),
    svg("line", { x1: 492, y1: 379, x2: 503, y2: 387 }),
    svg("line", { x1: 492, y1: 392, x2: 484, y2: 406 }),
    svg("line", { x1: 492, y1: 392, x2: 500, y2: 406 }),
  ]);
  const walkRing = svg("rect", { x: 452, y: 348, width: 80, height: 80, rx: 12, class: "conflict-ring", visibility: "hidden" });

  const buttonLamp = svg("circle", { cx: BUTTON_X, cy: BUTTON_Y, r: 12, class: "button-lamp" });
  const burst = svg("circle", { cx: BUTTON_X, cy: BUTTON_Y, r: 12, class: "press-burst" });
  const masher = masherIcon({ className: "post-masher" });
  masher.setAttribute("x", "500");
  masher.setAttribute("y", "10");
  masher.setAttribute("width", "56");
  masher.setAttribute("height", "56");

  const scenery = svg("g", { class: "scene-dimmable" }, [
    svg("rect", { x: 0, y: 0, width: 800, height: 100, class: "sidewalk" }),
    svg("rect", { x: 0, y: 340, width: 800, height: 140, class: "sidewalk" }),
    svg("rect", { x: 0, y: 100, width: 800, height: 240, class: "road" }),
    svg("line", { x1: 0, y1: 220, x2: 800, y2: 220, class: "lane-mark" }),
    ...stripes,
    svg("rect", { x: 302, y: 226, width: 6, height: 108, class: "stop-line" }),
    // walk-button post on the top sidewalk
    svg("rect", { x: BUTTON_X - 5, y: 46, width: 10, height: 44, class: "pole" }),
    svg("rect", { x: BUTTON_X - 18, y: BUTTON_Y - 18, width: 36, height: 36, rx: 8, class: "housing" }),
    buttonLamp,
    burst,
    masher,
    walker,
    car,
  ]);
  const signals = svg("g", { class: "scene-signals" }, [
    // car signal: a vertical three-light head at the stop line
    svg("rect", { x: 284, y: 344, width: 8, height: 12, class: "pole" }),
    svg("rect", { x: 266, y: 352, width: 44, height: 108, rx: 8, class: "housing" }),
    red,
    yellow,
    green,
    carRing,
    // walk signal box at the crossing
    svg("rect", { x: 460, y: 356, width: 64, height: 64, rx: 8, class: "housing" }),
    walkFigure,
    walkRing,
  ]);

  const art = svg(
    "svg",
    {
      viewBox: "0 0 800 480",
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Crosswalk scene",
    },
    [scenery, signals],
  );

  const carLabel = el("span", {}, [""]);
  const walkLabel = el("span", {}, [""]);
  const buttonLabel = el("span", {}, [""]);
  const labelRow = el("div", { class: "scene-label-row" }, [carLabel, walkLabel, buttonLabel]);
  const summary = el("p", { class: "visually-hidden" }, [""]);
  const chrome = createChrome([art, labelRow, summary]);

  let prevCursor: number | null = null;

  const lampClass = (color: CarLight, mine: "red" | "yellow" | "green"): string =>
    color === mine ? `lamp lamp--${mine} is-lit` : `lamp lamp--${mine}`;

  return {
    node: chrome.node,
    update(edges, events, cursor, opts = {}) {
      const f = crosswalkFrame(edges, events, cursor);
      const labels = crosswalkLabels(f);

      car.setAttribute("transform", `translate(${num(f.carX / CYCLES_PER_UNIT)} 0)`);
      walker.setAttribute("transform", `translate(${String(WALKER_X)} ${num(WALKER_TOP + f.walkerY / WALK_CYCLES_PER_UNIT)})`);
      red.setAttribute("class", lampClass(f.carLight, "red"));
      yellow.setAttribute("class", lampClass(f.carLight, "yellow"));
      green.setAttribute("class", lampClass(f.carLight, "green"));
      walkFigure.setAttribute("class", f.walk === "on" ? "walk-figure is-lit" : "walk-figure");
      carRing.setAttribute("visibility", f.conflict ? "visible" : "hidden");
      walkRing.setAttribute("visibility", f.conflict ? "visible" : "hidden");
      buttonLamp.setAttribute("class", f.lampLit ? "button-lamp is-lit" : "button-lamp");

      // Press burst: when the Cursor moves forward over a REQUEST Gremlin_Event.
      const requests = events.filter((e) => e.signal === "REQUEST" && e.gremlinId !== "rest").map((e) => e.cycle);
      if (prevCursor !== null && crossed(prevCursor, cursor, requests).length > 0) {
        burst.classList.remove("is-burst");
        void burst.getBoundingClientRect();
        burst.classList.add("is-burst");
      }
      prevCursor = cursor;

      carLabel.textContent = labels.carLight;
      walkLabel.textContent = labels.walk;
      buttonLabel.textContent = labels.button;
      summary.textContent = `${labels.carLight}, ${labels.walk}`;
      chrome.setConflict(labels.conflict);
      chrome.apply(opts);
    },
  };
}
