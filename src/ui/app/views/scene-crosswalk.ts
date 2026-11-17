// Crosswalk scene: original top-down art. update() maps crosswalkFrame and crosswalkLabels output to
// SVG attributes and HTML labels. It holds no scene logic. The car never overlaps the stripes while the
// walker is on them; that holds in the model, so the view only draws the frame it is given.
//
// Layout (viewBox 830 x 460): top sidewalk 0-130 with the walk sign and the walk-button post, road 130-330
// with the stripes and the stop line, bottom sidewalk 330-460 with the car light. Each label sits under
// its object on the sidewalk. Road x = ROAD_X0 + car travel / 8,000, so the stripes and the stop line
// match the model geometry.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { OutputEvent } from "../../../engine/types";
import type { CarLight } from "../model/crosswalk-scene";
import { CROSSWALK_STOP, crosswalkLabels } from "../model/crosswalk-scene";
import { CYCLES_PER_UNIT, ROAD_X0_UNITS, VIEW_UNITS, createCrosswalkActors } from "../model/crosswalk-actors";
import type { ActorPose } from "../model/crosswalk-actors";
import { el, prefersReducedMotion, svg } from "./dom";
import { masherIcon } from "./icons";
import type { SceneCommonOpts } from "./scene-chrome";
import { createChrome } from "./scene-chrome";

/** The actors' inputs (model/crosswalk-actors.ts). All optional: a scene drawn without them is placed at its model pose. */
export interface CrosswalkOpts extends SceneCommonOpts {
  /** Playback is running: it calls update every frame, so the scene runs no frame loop of its own. */
  playing?: boolean;
  /** The Cursor where playback ends for this scene, and the display ms until then. */
  endCursor?: number | null;
  msToEnd?: number | null;
  /** Changes when the Cursor jumps (new plan, Replay, a seek). */
  epoch?: number;
}

export interface CrosswalkSceneView {
  node: HTMLElement;
  frame: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: CrosswalkOpts): void;
}

// The same numbers as model/crosswalk-actors.ts, which decides where a car is in or out of sight.
const VIEW_W = VIEW_UNITS;
const VIEW_H = 460;
/** View x of car travel 0. */
const ROAD_X0 = ROAD_X0_UNITS;

const SIDEWALK_TOP = 130;
const SIDEWALK_BOTTOM = 330;
const LANE_Y = 230;
const STRIPES_X = ROAD_X0 + 320;
const STOP_X = ROAD_X0 + CROSSWALK_STOP / CYCLES_PER_UNIT + 2;
/** The walker waits with its feet at the curb of the top sidewalk, over the middle of the stripes. */
const WALKER_X = STRIPES_X + 56;
const WALKER_TOP = 95;
/** Units the walker walks between the two sidewalks (4,800,000 cycles of crossing at 16,000 per unit). */
const SIDEWALK_RUN = 300;
const WALK_SIGN_X = 350;
const BUTTON_X = 610;
const BUTTON_Y = 33;
const CAR_LIGHT_X = 360;

const num = (n: number): string => n.toFixed(2);
const carViewX = (travel: number): number => ROAD_X0 + travel / CYCLES_PER_UNIT;

export function createCrosswalkScene(): CrosswalkSceneView {
  const stripes = Array.from({ length: 6 }, (_, i) =>
    svg("rect", { x: STRIPES_X + i * 20, y: SIDEWALK_TOP + 6, width: 12, height: SIDEWALK_BOTTOM - SIDEWALK_TOP - 12, class: "stripe" }),
  );

  // The car faces right; its front sits at x = 0 of its own group. Top-down: body, windshield, headlights.
  const car = svg("g", { class: "car-top" }, [
    // Short headlight beams; at the stop line they end before the stripes (front 400, stripes from 420).
    svg("path", { d: "M0 263l14 -6v12zM0 297l14 6v-12z", class: "car-beam" }),
    svg("path", {
      d: "M-120 266a12 12 0 0 1 12 -12h78c14 0 24 11 30 26c-6 15 -16 26 -30 26h-78a12 12 0 0 1 -12 -12z",
      class: "car-body",
    }),
    svg("path", { d: "M-48 260h12c7 4 11 11 12 20c-1 9 -5 16 -12 20h-12z", class: "car-glass" }),
    svg("rect", { x: -104, y: 262, width: 40, height: 36, rx: 6, class: "car-roof" }),
    svg("circle", { cx: -4, cy: 266, r: 3.5, class: "car-headlight" }),
    svg("circle", { cx: -4, cy: 294, r: 3.5, class: "car-headlight" }),
  ]);

  // The walker is a pictogram about 60 units tall (the car is 120 long): head, body, two arms, two legs.
  // A dark halo under each limb keeps it readable on the sidewalk and on the road.
  const limb = (cls: string): SVGElement => svg("line", { class: cls, x1: 0, y1: 0, x2: 0, y2: 0 });
  const arms = [limb("walker-limb"), limb("walker-limb")];
  const legs = [limb("walker-limb"), limb("walker-limb")];
  const haloArms = [limb("walker-halo"), limb("walker-halo")];
  const haloLegs = [limb("walker-halo"), limb("walker-halo")];
  const setLimb = (n: SVGElement, x1: number, y1: number, x2: number, y2: number): void => {
    n.setAttribute("x1", String(x1));
    n.setAttribute("y1", String(y1));
    n.setAttribute("x2", String(x2));
    n.setAttribute("y2", String(y2));
  };
  /** Stride 0 stands; 1 and 2 are the two steps of a walk. Pure function of the walked distance. */
  const pose = (stride: number): void => {
    const swing = stride === 0 ? 0 : stride === 1 ? 6 : -6;
    // Left side (-1) and right side (+1); the two sides swing in opposite directions.
    [-1, 1].forEach((side, i) => {
      const s = side * swing;
      for (const [arm, leg] of [
        [arms[i], legs[i]],
        [haloArms[i], haloLegs[i]],
      ] as const) {
        if (arm === undefined || leg === undefined) continue;
        // Standing, the arms hang down beside the body; walking, they swing.
        setLimb(arm, 0, -6, side * (stride === 0 ? 8 : 13), stride === 0 ? 10 : 6 - s * 0.5);
        setLimb(leg, 0, 8, side * (stride === 0 ? 6 : 9) + s, 29);
      }
    });
  };
  const walker = svg("g", { class: "walker" }, [
    ...haloArms,
    ...haloLegs,
    svg("line", { x1: 0, y1: -13, x2: 0, y2: 8, class: "walker-halo walker-torso" }),
    svg("circle", { cx: 0, cy: -22, r: 10, class: "walker-head-halo" }),
    ...arms,
    ...legs,
    svg("line", { x1: 0, y1: -13, x2: 0, y2: 8, class: "walker-limb walker-torso" }),
    svg("circle", { cx: 0, cy: -22, r: 8, class: "walker-head" }),
  ]);

  // Car light: a vertical three-light head on the bottom sidewalk, just before the stop line.
  const lamp = (cy: number, color: string) => svg("circle", { cx: CAR_LIGHT_X, cy, r: 8, class: `lamp lamp--${color}` });
  const red = lamp(356, "red");
  const yellow = lamp(378, "yellow");
  const green = lamp(400, "green");
  const carRing = svg("rect", { x: CAR_LIGHT_X - 20, y: 336, width: 40, height: 84, rx: 10, class: "conflict-ring", visibility: "hidden" });

  // Walk sign: a box on the top sidewalk at the crossing. On: a mint walking figure. Off: a coral square.
  const walkFigure = svg("g", { class: "walk-figure" }, [
    svg("circle", { cx: WALK_SIGN_X, cy: 23, r: 3.5, class: "walk-figure-head" }),
    svg("path", {
      d: `M${String(WALK_SIGN_X)} 27v9M${String(WALK_SIGN_X)} 30l-5 4M${String(WALK_SIGN_X)} 30l5 -2M${String(WALK_SIGN_X)} 36l-4 8M${String(WALK_SIGN_X)} 36l4 8`,
      class: "walk-figure-body",
    }),
  ]);
  const walkStop = svg("rect", { x: WALK_SIGN_X - 8, y: 26, width: 16, height: 16, rx: 2, class: "walk-stop" });
  const walkRing = svg("rect", { x: WALK_SIGN_X - 26, y: 8, width: 52, height: 52, rx: 10, class: "conflict-ring", visibility: "hidden" });

  const buttonLamp = svg("circle", { cx: BUTTON_X, cy: BUTTON_Y, r: 9, class: "button-lamp" });
  const burst = svg("circle", { cx: BUTTON_X, cy: BUTTON_Y, r: 9, class: "press-burst" });
  const masher = masherIcon({ className: "post-masher" });
  // Left of the post, so the "Illustrative" badge at top right never covers it.
  masher.setAttribute("x", String(BUTTON_X - 70));
  masher.setAttribute("y", "4");
  masher.setAttribute("width", "50");
  masher.setAttribute("height", "50");

  const scenery = svg("g", { class: "scene-dimmable" }, [
    svg("rect", { x: 0, y: 0, width: VIEW_W, height: SIDEWALK_TOP, class: "sidewalk" }),
    svg("rect", { x: 0, y: SIDEWALK_BOTTOM, width: VIEW_W, height: VIEW_H - SIDEWALK_BOTTOM, class: "sidewalk" }),
    svg("rect", { x: 0, y: SIDEWALK_TOP, width: VIEW_W, height: SIDEWALK_BOTTOM - SIDEWALK_TOP, class: "road" }),
    svg("line", { x1: 0, y1: LANE_Y, x2: STOP_X - 6, y2: LANE_Y, class: "lane-mark" }),
    svg("line", { x1: STRIPES_X + 132, y1: LANE_Y, x2: VIEW_W, y2: LANE_Y, class: "lane-mark" }),
    ...stripes,
    svg("rect", { x: STOP_X, y: LANE_Y + 6, width: 6, height: SIDEWALK_BOTTOM - LANE_Y - 12, class: "stop-line" }),
    // walk-button post on the top sidewalk
    svg("rect", { x: BUTTON_X - 2, y: BUTTON_Y + 17, width: 4, height: 18, class: "pole" }),
    svg("rect", { x: BUTTON_X - 17, y: BUTTON_Y - 17, width: 34, height: 34, rx: 7, class: "housing" }),
    buttonLamp,
    burst,
    masher,
    walker,
    car,
  ]);
  const signals = svg("g", { class: "scene-signals" }, [
    svg("rect", { x: CAR_LIGHT_X - 2, y: SIDEWALK_BOTTOM, width: 4, height: 12, class: "pole" }),
    svg("rect", { x: CAR_LIGHT_X - 14, y: 342, width: 28, height: 72, rx: 6, class: "housing" }),
    red,
    yellow,
    green,
    carRing,
    svg("rect", { x: WALK_SIGN_X - 2, y: 54, width: 4, height: 14, class: "pole" }),
    svg("rect", { x: WALK_SIGN_X - 20, y: 14, width: 40, height: 40, rx: 7, class: "housing" }),
    walkFigure,
    walkStop,
    walkRing,
  ]);

  const art = svg(
    "svg",
    {
      viewBox: `0 0 ${String(VIEW_W)} ${String(VIEW_H)}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Crosswalk scene",
    },
    [scenery, signals],
  );

  const carLabel = el("span", {}, [""]);
  const walkLabel = el("span", {}, [""]);
  const buttonLabel = el("span", { class: "scene-label--gremlin" }, [""]);
  const summary = el("p", { class: "visually-hidden" }, [""]);
  const chrome = createChrome({
    art,
    width: VIEW_W,
    height: VIEW_H,
    labels: [
      { node: walkLabel, x: WALK_SIGN_X, y: 72 },
      { node: buttonLabel, x: BUTTON_X, y: 72 },
      { node: carLabel, x: CAR_LIGHT_X, y: 422 },
    ],
    below: [summary],
  });

  const lampClass = (color: CarLight, mine: "red" | "yellow" | "green"): string =>
    color === mine ? `lamp lamp--${mine} is-lit` : `lamp lamp--${mine}`;

  // The actors move in display time (model/crosswalk-actors.ts). The scene keeps the arguments of the last
  // update and, while an actor is still moving and playback is not calling update every frame (paused,
  // stopped), runs a frame loop of its own until everything is at rest.
  const actors = createCrosswalkActors();
  let last: { edges: readonly OutputEvent[]; events: readonly ReducerEvent[]; cursor: number; opts: CrosswalkOpts } | null = null;
  let loop = 0;

  function draw(p: ActorPose): void {
    const f = p.frame;
    const labels = crosswalkLabels(f);
    // The car: a transform attribute, in view units. A car at either end of its lap is out of sight.
    car.setAttribute("transform", `translate(${num(carViewX(p.car.x))} 0)`);
    car.setAttribute("visibility", p.car.visible ? "visible" : "hidden");
    // The walker: along the two-way path, so it stays on the far sidewalk after a crossing.
    pose(p.stride);
    walker.setAttribute("transform", `translate(${String(WALKER_X)} ${num(WALKER_TOP + p.walkerFrac * SIDEWALK_RUN)})`);
    red.setAttribute("class", lampClass(f.carLight, "red"));
    yellow.setAttribute("class", lampClass(f.carLight, "yellow"));
    green.setAttribute("class", lampClass(f.carLight, "green"));
    walkFigure.setAttribute("visibility", f.walk === "on" ? "visible" : "hidden");
    walkStop.setAttribute("visibility", f.walk === "on" ? "hidden" : "visible");
    carRing.setAttribute("visibility", f.conflict ? "visible" : "hidden");
    walkRing.setAttribute("visibility", f.conflict ? "visible" : "hidden");
    // The button lamp: lit for at least 250 ms per press, one pulse ring per press.
    buttonLamp.setAttribute("class", p.lampLit ? "button-lamp is-lit" : "button-lamp");
    if (p.pulse) {
      burst.classList.remove("is-burst");
      void burst.getBoundingClientRect();
      burst.classList.add("is-burst");
    }
    carLabel.textContent = labels.carLight;
    walkLabel.textContent = labels.walk;
    buttonLabel.textContent = labels.button;
    summary.textContent = `${labels.carLight}, ${labels.walk}`;
    chrome.setLine([labels.carLight, labels.walk]);
    chrome.setConflict(labels.conflict);
  }

  function run(): void {
    if (last === null) return;
    const { edges, events, cursor, opts } = last;
    const p = actors.step(
      {
        edges,
        events,
        cursor,
        endCursor: opts.endCursor ?? null,
        msToEnd: opts.msToEnd ?? null,
        ended: opts.ended === true,
        epoch: opts.epoch ?? 0,
        reduced: prefersReducedMotion(),
      },
      performance.now(),
    );
    draw(p);
    if (!p.settled && opts.playing !== true && loop === 0 && typeof requestAnimationFrame === "function") {
      loop = requestAnimationFrame(() => {
        loop = 0;
        // Later frames of the loop see the same Cursor, at rest: the epoch does not change, so nothing snaps.
        run();
      });
    }
  }

  function update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts: CrosswalkOpts = {}): void {
    last = { edges, events, cursor, opts };
    run();
    chrome.apply(opts);
  }
  // The idle frame: no outputs yet, so the car waits at the stop line and the walker on the top sidewalk.
  update([], [], 0);

  return { node: chrome.node, frame: chrome.frame, update };
}
