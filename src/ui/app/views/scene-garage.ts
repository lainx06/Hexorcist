// Garage scene: straight-on view, original art. update() maps the garage model output to SVG attributes
// and HTML labels. The door follows doorTravelAt at every Cursor, with no tween. The beam label sits beside
// the receiver on the right and the flicker text beside the emitter on the left; the deadline badge is the
// scene's break badge at top left, above the frame. No outline is drawn over the door.
//
// The door is a filled slatted panel that comes down from a roller at the top of the opening. Open, its
// bottom slat still shows under the roller, so the frame reads as a garage door and not an empty frame.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent } from "../../../engine/types";
import {
  BEAM_TEXT,
  DOOR_TRAVEL_CYCLES,
  FLICKER_TEXT,
  beamText,
  deadlineBadge,
  doorTravelAt,
  flickers,
  garageSceneAt,
  pumpkinShown,
} from "../model/scenes";
import type { ShownKind } from "../model/scenes";
import { el, svg } from "./dom";
import type { SceneCommonOpts } from "./scene-chrome";
import { createChrome } from "./scene-chrome";

export interface GarageOpts extends SceneCommonOpts {
  /** Fixture of the example; it tells which BEAM_CLEAR level counts as blocked. Null reads as clear. */
  fixture?: Fixture | null;
  /** Which replay is shown; the deadline badge is only for the reduced replay on the buggy build. */
  kind?: ShownKind;
  /** Cycle of the break. */
  v?: number;
  /** The active rule's limit in whole ms. */
  limitMs?: number;
}

export interface GarageSceneView {
  node: HTMLElement;
  frame: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: GarageOpts): void;
}

export const GARAGE_TEXT = {
  beamBlocked: BEAM_TEXT.blocked,
  beamClear: BEAM_TEXT.clear,
  flickers: FLICKER_TEXT,
} as const;

const VIEW_W = 830;
const VIEW_H = 460;
/** The art is drawn in its own units and moved by (DX, DY) into the view. */
const DX = -65;
/** Room above the frame for the deadline badge at top left, down to a 900 px window. */
const DY = 46;
const DOOR_X = 300;
const DOOR_Y = 60;
const DOOR_W = 360;
const DOOR_H = 280;
const SLATS = 8;
const SLAT_H = DOOR_H / SLATS;
/** Panel height that shows under the roller while the door is fully open. */
const ROLLED_H = 22;
const BEAM_Y = 372;
const BEAM_FROM = 276;
const BEAM_TO = 684;
/** Where the beam breaks around the pumpkin. */
const GAP_FROM = 428;
const GAP_TO = 532;

let instance = 0;

export function createGarageScene(): GarageSceneView {
  const clipId = `garage-door-clip-${String(instance++)}`;
  // The panel is drawn closed (DOOR_Y to DOOR_Y + DOOR_H) and moved up; the clip keeps it inside the opening.
  const panel = svg("g", { class: "door-panel" }, [
    ...Array.from({ length: SLATS }, (_, i) =>
      svg("rect", { x: DOOR_X, y: DOOR_Y + i * SLAT_H, width: DOOR_W, height: SLAT_H, class: "door-slat" }),
    ),
    svg("rect", { x: DOOR_X, y: DOOR_Y + DOOR_H - 8, width: DOOR_W, height: 8, class: "door-rail" }),
  ]);
  const pumpkin = svg("g", { class: "pumpkin", visibility: "hidden" }, [
    svg("ellipse", { cx: 458, cy: 352, rx: 22, ry: 26, class: "pumpkin-body" }),
    svg("ellipse", { cx: 502, cy: 352, rx: 22, ry: 26, class: "pumpkin-body" }),
    svg("ellipse", { cx: 480, cy: 352, rx: 24, ry: 27, class: "pumpkin-body" }),
    svg("path", { d: "M480 325 q2 -12 12 -16", class: "pumpkin-stem" }),
    svg("polygon", { points: "467,349 473,339 479,349", class: "pumpkin-face" }),
    svg("polygon", { points: "481,349 487,339 493,349", class: "pumpkin-face" }),
    svg("path", { d: "M468 360 l6 6 l6 -6 l6 6 l6 -6", class: "pumpkin-mouth" }),
  ]);
  const beamLeft = svg("line", { x1: BEAM_FROM, y1: BEAM_Y, x2: BEAM_TO, y2: BEAM_Y, class: "beam-line is-clear" });
  const beamRight = svg("line", { x1: GAP_TO, y1: BEAM_Y, x2: BEAM_TO, y2: BEAM_Y, class: "beam-line", visibility: "hidden" });

  const scenery = svg("g", { class: "scene-dimmable" }, [
    svg("rect", { x: -DX, y: 400, width: VIEW_W, height: 60, class: "road" }),
    svg("rect", { x: DOOR_X, y: DOOR_Y, width: DOOR_W, height: DOOR_H, class: "door-opening" }),
    svg("rect", { x: DOOR_X - 24, y: DOOR_Y - 24, width: 24, height: DOOR_H + 44, class: "frame" }),
    svg("rect", { x: DOOR_X + DOOR_W, y: DOOR_Y - 24, width: 24, height: DOOR_H + 44, class: "frame" }),
    svg("rect", { x: DOOR_X - 24, y: DOOR_Y - 24, width: DOOR_W + 48, height: 24, class: "frame" }),
    svg("rect", { x: 236, y: BEAM_Y - 16, width: 40, height: 32, rx: 4, class: "beam-block" }),
    svg("rect", { x: 684, y: BEAM_Y - 16, width: 40, height: 32, rx: 4, class: "beam-block" }),
  ]);
  // Drawn after the door, so the pumpkin shows in front of a door that comes down onto it.
  const beamGroup = svg("g", { class: "scene-dimmable" }, [beamLeft, beamRight, pumpkin]);
  // The door is the output the rule names, so it stays at full strength at the break.
  const door = svg("g", { class: "door" }, [
    svg("defs", {}, [svg("clipPath", { id: clipId }, [svg("rect", { x: DOOR_X, y: DOOR_Y, width: DOOR_W, height: DOOR_H })])]),
    svg("g", { "clip-path": `url(#${clipId})` }, [panel]),
    // The roller the panel winds onto, across the top of the opening.
    svg("rect", { x: DOOR_X - 4, y: DOOR_Y - 14, width: DOOR_W + 8, height: 18, rx: 9, class: "door-roller" }),
  ]);
  const art = svg(
    "svg",
    {
      viewBox: `0 0 ${String(VIEW_W)} ${String(VIEW_H)}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "scene-svg",
      role: "img",
      "aria-label": "Garage door scene",
    },
    [svg("g", { transform: `translate(${String(DX)} ${String(DY)})` }, [scenery, door, beamGroup])],
  );

  const flicker = el("span", { class: "scene-flag scene-label--big" }, [GARAGE_TEXT.flickers]);
  flicker.toggleAttribute("hidden", true);
  const beamLabel = el("span", { class: "scene-beam-label scene-label--big" }, [GARAGE_TEXT.beamClear]);
  const summary = el("p", { class: "visually-hidden" }, [""]);
  const chrome = createChrome({
    art,
    width: VIEW_W,
    height: VIEW_H,
    labels: [
      // Beside the receiver block on the right (it ends at 724 + DX), just above the beam line, so it stays
      // clear of the "Stopped at the break" badge at bottom right.
      { node: beamLabel, x: 732 + DX, y: BEAM_Y + DY - 46, align: "start", maxWidth: 0.2 },
      // Beside the emitter block on the left (it starts at 236 + DX).
      { node: flicker, x: 228 + DX, y: BEAM_Y + DY, align: "end", anchor: "middle", maxWidth: 0.2 },
    ],
    below: [summary],
  });

  function update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts: GarageOpts = {}): void {
    // Whole-unit height of the panel below the roller, from the integer travel in cycles.
    const travelPx = Math.floor((doorTravelAt(edges, cursor) * (DOOR_H - ROLLED_H)) / DOOR_TRAVEL_CYCLES);
    panel.setAttribute("transform", `translate(0 ${String(ROLLED_H + travelPx - DOOR_H)})`);

    const text = opts.fixture == null ? BEAM_TEXT.clear : beamText(events, opts.fixture, cursor);
    const blocked = text === BEAM_TEXT.blocked;
    pumpkin.setAttribute("visibility", pumpkinShown(events, cursor) ? "visible" : "hidden");
    beamLeft.setAttribute("x2", String(blocked ? GAP_FROM : BEAM_TO));
    beamLeft.setAttribute("class", blocked ? "beam-line" : "beam-line is-clear");
    beamRight.setAttribute("visibility", blocked ? "visible" : "hidden");
    beamLabel.textContent = text;
    const flick = flickers(events, cursor);
    flicker.toggleAttribute("hidden", !flick);

    const badge = deadlineBadge(opts.kind ?? "original-buggy", opts.v ?? Number.POSITIVE_INFINITY, cursor, opts.limitMs ?? 20);
    chrome.setConflict(badge);

    summary.textContent = garageSceneAt({ outputEdges: edges, events, violation: null }, cursor).summary;
    chrome.setLine(flick ? [text, FLICKER_TEXT] : [text]);
    chrome.apply(opts);
  }

  // The idle frame: the door open, rolled up under the roller.
  update([], [], 0);

  return { node: chrome.node, frame: chrome.frame, update };
}
