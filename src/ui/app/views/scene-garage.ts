// Garage scene: straight-on view, original art. update() maps the garage model output to SVG attributes
// and HTML labels. The door follows doorTravelAt at every Cursor, with no tween. Labels sit in HTML rows
// outside the SVG and no outline is drawn over the door.
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
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: GarageOpts): void;
}

export const GARAGE_TEXT = {
  beamBlocked: BEAM_TEXT.blocked,
  beamClear: BEAM_TEXT.clear,
  flickers: FLICKER_TEXT,
} as const;

const DOOR_X = 300;
const DOOR_Y = 60;
const DOOR_W = 360;
const DOOR_H = 280;
const SLATS = 8;
const SLAT_H = DOOR_H / SLATS;
const BEAM_Y = 372;
const BEAM_FROM = 276;
const BEAM_TO = 684;
/** Where the beam breaks around the pumpkin. */
const GAP_FROM = 428;
const GAP_TO = 532;

export function createGarageScene(): GarageSceneView {
  const slats = Array.from({ length: SLATS }, (_, i) =>
    svg("rect", { x: DOOR_X, y: DOOR_Y + i * SLAT_H, width: DOOR_W, height: 0, class: "door-slat" }),
  );
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
    svg("rect", { x: 0, y: 400, width: 960, height: 40, class: "road" }),
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
    svg("rect", { x: DOOR_X, y: DOOR_Y, width: DOOR_W, height: DOOR_H, class: "door-opening" }),
    ...slats,
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
    [scenery, door, beamGroup],
  );

  const deadline = el("span", { class: "badge badge--broke", hidden: true }, [""]);
  const deadlineRow = el("div", { class: "scene-badges scene-badges--center" }, [deadline]);
  const flicker = el("span", { class: "scene-flag" }, [GARAGE_TEXT.flickers]);
  flicker.toggleAttribute("hidden", true);
  const beamLabel = el("span", { class: "scene-beam-label" }, [GARAGE_TEXT.beamClear]);
  const labelRow = el("div", { class: "scene-label-row scene-label-row--between" }, [flicker, beamLabel]);
  const summary = el("p", { class: "visually-hidden" }, [""]);
  const chrome = createChrome([deadlineRow, art, labelRow, summary]);

  return {
    node: chrome.node,
    update(edges, events, cursor, opts = {}) {
      // Whole-pixel heights from the integer travel in cycles.
      const px = Math.floor((doorTravelAt(edges, cursor) * DOOR_H) / DOOR_TRAVEL_CYCLES);
      slats.forEach((s, i) => {
        s.setAttribute("height", String(Math.min(SLAT_H, Math.max(0, px - i * SLAT_H))));
      });

      const text = opts.fixture == null ? BEAM_TEXT.clear : beamText(events, opts.fixture, cursor);
      const blocked = text === BEAM_TEXT.blocked;
      pumpkin.setAttribute("visibility", pumpkinShown(events, cursor) ? "visible" : "hidden");
      beamLeft.setAttribute("x2", String(blocked ? GAP_FROM : BEAM_TO));
      beamLeft.setAttribute("class", blocked ? "beam-line" : "beam-line is-clear");
      beamRight.setAttribute("visibility", blocked ? "visible" : "hidden");
      beamLabel.textContent = text;
      flicker.toggleAttribute("hidden", !flickers(events, cursor));

      const badge = deadlineBadge(opts.kind ?? "original-buggy", opts.v ?? Number.POSITIVE_INFINITY, cursor, opts.limitMs ?? 20);
      deadline.textContent = badge ?? "";
      deadline.toggleAttribute("hidden", badge === null);
      deadlineRow.toggleAttribute("hidden", badge === null);

      summary.textContent = garageSceneAt({ outputEdges: edges, events, violation: null }, cursor).summary;
      chrome.apply(opts);
    },
  };
}
