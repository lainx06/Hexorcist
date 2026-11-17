// Original inline SVG icons. Stroke icons use currentColor, so CSS sets the colour.
// Decorative icons are aria-hidden. Pass a label to give an icon an accessible name.
import { svg } from "./dom";

export interface IconOptions {
  /** Accessible name. Without it the icon is decorative and hidden from assistive tech. */
  label?: string;
  /** Dimmed variant, used for disabled gremlins. */
  dimmed?: boolean;
  /** Extra class names. */
  className?: string;
}

function icon(size: number, children: SVGElement[], opts: IconOptions = {}, extraClass = ""): SVGElement {
  const classes = ["icon", extraClass, opts.dimmed === true ? "icon-dim" : "", opts.className ?? ""]
    .filter((c) => c !== "")
    .join(" ");
  const named = opts.label !== undefined && opts.label !== "";
  return svg(
    "svg",
    {
      viewBox: `0 0 ${String(size)} ${String(size)}`,
      width: size,
      height: size,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      role: named ? "img" : null,
      "aria-label": named ? opts.label : null,
      "aria-hidden": named ? null : "true",
      focusable: "false",
      class: classes,
    },
    children,
  );
}

/** BROKE: a chain link pulled apart, with two short break marks. */
export function brokenLinkIcon(): SVGElement {
  return icon(24, [
    svg("path", { d: "M10 14l-2.5 2.5a3 3 0 0 1-4.2-4.2L6.5 9a3 3 0 0 1 4.2 0" }),
    svg("path", { d: "M14 10l2.5-2.5a3 3 0 0 1 4.2 4.2L17.5 15a3 3 0 0 1-4.2 0" }),
    svg("path", { d: "M11 3v3" }),
    svg("path", { d: "M3 11h3" }),
    svg("path", { d: "M13 21v-3" }),
    svg("path", { d: "M21 13h-3" }),
  ]);
}

/** HELD: a short step trace between two bounds. */
export function boundedTraceIcon(): SVGElement {
  return icon(24, [
    svg("path", { d: "M3 5v14" }),
    svg("path", { d: "M21 5v14" }),
    svg("path", { d: "M6 15h3V9h4v6h3V9h2" }),
  ]);
}

/** COULDN'T TELL: a circle with a question mark. It takes the colour of its card (currentColor). */
export function questionIcon(): SVGElement {
  return icon(24, [
    svg("circle", { cx: 12, cy: 12, r: 9 }),
    svg("path", { d: "M9.4 9.6a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.2-2.6 4" }),
    svg("circle", { cx: 12, cy: 17.4, r: 0.9, fill: "currentColor", stroke: "none" }),
  ]);
}

/** Ghost mark for the header: a mint-stroke ghost with two eyes and a wavy hem. */
export function ghostMark(opts: IconOptions = {}): SVGElement {
  return icon(
    32,
    [
      svg("path", { d: "M6 28V15a10 10 0 0 1 20 0v13l-3.3-2.6L19.3 28 16 25.4 12.7 28 9.3 25.4z" }),
      svg("circle", { cx: 12.5, cy: 15, r: 1.6, fill: "currentColor", stroke: "none" }),
      svg("circle", { cx: 19.5, cy: 15, r: 1.6, fill: "currentColor", stroke: "none" }),
      svg("path", { d: "M13.5 19.5q2.5 2 5 0" }),
    ],
    opts,
    "icon-ghost",
  );
}

export type GremlinIconName =
  | "gremlin-masher"
  | "gremlin-bouncer"
  | "gremlin-stuck"
  | "gremlin-dropout"
  | "gremlin-spike"
  | "gremlin-drifter";

export const GREMLIN_ICON_NAMES: readonly GremlinIconName[] = [
  "gremlin-masher",
  "gremlin-bouncer",
  "gremlin-stuck",
  "gremlin-dropout",
  "gremlin-spike",
  "gremlin-drifter",
];

const SIZE = 40;

/** Round pumpkin head shared by all six gremlins: body, ridge, stem, two eyes and a small grin. 40 x 40 box. */
function head(): SVGElement[] {
  return [
    svg("ellipse", { cx: 20, cy: 15, rx: 10, ry: 8.5 }),
    svg("path", { d: "M20 6.5c-3 2-3 13 0 17" }),
    svg("path", { d: "M20 6.5c3 2 3 13 0 17" }),
    svg("path", { d: "M20 6.5V4c0-1.4 1-2.4 2.6-2.4" }),
    svg("circle", { cx: 15.5, cy: 14, r: 1.3, fill: "currentColor", stroke: "none" }),
    svg("circle", { cx: 24.5, cy: 14, r: 1.3, fill: "currentColor", stroke: "none" }),
    svg("path", { d: "M17 18.5q3 2 6 0" }),
  ];
}

function accessory(name: GremlinIconName): SVGElement[] {
  switch (name) {
    case "gremlin-masher":
      // A hammer raised in the right hand, a small button below with press marks.
      return [
        svg("path", { d: "M29 20l5-10" }),
        svg("path", { d: "M31 6.5l7 3-2 4.5-7-3z" }),
        svg("rect", { x: 13, y: 31, width: 14, height: 5, rx: 2 }),
        svg("path", { d: "M16 27.5v1.5" }),
        svg("path", { d: "M20 26.5v2.5" }),
        svg("path", { d: "M24 27.5v1.5" }),
      ];
    case "gremlin-bouncer":
      // A spring under the body and jitter marks on both sides.
      return [
        svg("path", { d: "M20 23.5v1.5l-5 2 10 2.5-10 2.5 10 2.5-5 2v1.5" }),
        svg("path", { d: "M4 12l3 2-3 2" }),
        svg("path", { d: "M2 19l3 1.5-3 1.5" }),
        svg("path", { d: "M36 12l-3 2 3 2" }),
        svg("path", { d: "M38 19l-3 1.5 3 1.5" }),
      ];
    case "gremlin-stuck":
      // Sitting on a button that is held down.
      return [
        svg("path", { d: "M13 24.5q7 2.5 14 0" }),
        svg("rect", { x: 9, y: 28, width: 22, height: 5, rx: 2.5 }),
        svg("path", { d: "M6 36.5h28" }),
        svg("path", { d: "M5 31l-2 0" }),
        svg("path", { d: "M35 31l2 0" }),
      ];
    case "gremlin-dropout":
      // A plug pulled out of its socket, with the cord still attached.
      return [
        svg("path", { d: "M10 24c-2 4-1 7 3 8" }),
        svg("rect", { x: 13, y: 29, width: 9, height: 7, rx: 1.5 }),
        svg("path", { d: "M22 31h3" }),
        svg("path", { d: "M22 34h3" }),
        svg("rect", { x: 29, y: 28, width: 8, height: 9, rx: 1.5 }),
        svg("path", { d: "M32 31.5h2" }),
        svg("path", { d: "M32 34h2" }),
      ];
    case "gremlin-spike":
      // A lightning bolt on the right and a sharp peak under the body.
      return [
        svg("path", { d: "M33 3l-6 10h5l-4 10 9-12h-5z" }),
        svg("path", { d: "M3 36l5-10 4 7 4-12 4 15 4-6 4 6" }),
      ];
    case "gremlin-drifter":
      // A slow, wide wave under the body and an arrow to show the push.
      return [
        svg("path", { d: "M2 31c4-5 8-5 12 0s8 5 12 0 8-5 12 0" }),
        svg("path", { d: "M4 37h26" }),
        svg("path", { d: "M26 34l4 3-4 3" }),
      ];
  }
}

/** One of the six gremlin icons by catalogue icon name, or null for an unknown name. */
export function gremlinIcon(iconName: string, opts: IconOptions = {}): SVGElement | null {
  if (!(GREMLIN_ICON_NAMES as readonly string[]).includes(iconName)) return null;
  const name = iconName as GremlinIconName;
  return icon(SIZE, [...head(), ...accessory(name)], opts, "icon-gremlin");
}

/** Masher: pumpkin head with a hammer. */
export function masherIcon(opts: IconOptions = {}): SVGElement {
  return icon(SIZE, [...head(), ...accessory("gremlin-masher")], opts, "icon-gremlin");
}

export function playIcon(): SVGElement {
  return icon(24, [svg("path", { d: "M8 5l11 7-11 7z" })]);
}

export function pauseIcon(): SVGElement {
  return icon(24, [svg("path", { d: "M8 5v14" }), svg("path", { d: "M16 5v14" })]);
}

export function prevIcon(): SVGElement {
  return icon(24, [svg("path", { d: "M6 5v14" }), svg("path", { d: "M18 6l-8 6 8 6z" })]);
}

export function nextIcon(): SVGElement {
  return icon(24, [svg("path", { d: "M18 5v14" }), svg("path", { d: "M6 6l8 6-8 6z" })]);
}

/**
 * The illustration of a Device_Card by example id: a small scene 120 x 64 in its own units, shown 48 px
 * tall across the top of the card. Decorative. Colours come from app.css (.device-art classes).
 */
export function deviceArt(id: string): SVGElement {
  let parts: SVGElement[];
  if (id === "garage") {
    // Frame, a door rolled up at the top, the beam and the pumpkin in the doorway.
    parts = [
      svg("path", { d: "M36 60V6h48v54", class: "art-frame" }),
      svg("rect", { x: 39, y: 8, width: 42, height: 12, class: "art-line" }),
      svg("line", { x1: 30, y1: 56, x2: 90, y2: 56, class: "art-beam" }),
      svg("ellipse", { cx: 60, cy: 50, rx: 7, ry: 6, class: "art-gremlin" }),
    ];
  } else if (id === "heartbeat") {
    // A ring that fills around a lit light.
    parts = [
      svg("circle", { cx: 60, cy: 32, r: 22, class: "art-ring" }),
      svg("path", { d: "M60 10a22 22 0 0 1 19 11", class: "art-ring-fill" }),
      svg("circle", { cx: 60, cy: 32, r: 11, class: "art-lit" }),
    ];
  } else {
    // A road with stripes, a car facing right, a walk light and the walk button.
    parts = [
      svg("rect", { x: 0, y: 18, width: 120, height: 28, class: "art-road" }),
      svg("rect", { x: 66, y: 18, width: 5, height: 28, class: "art-stripe" }),
      svg("rect", { x: 75, y: 18, width: 5, height: 28, class: "art-stripe" }),
      svg("rect", { x: 84, y: 18, width: 5, height: 28, class: "art-stripe" }),
      svg("path", { d: "M24 26h22c4 0 7 3 8 6c-1 3-4 6-8 6H24z", class: "art-line" }),
      svg("circle", { cx: 58, cy: 10, r: 3.5, class: "art-lit" }),
      svg("circle", { cx: 100, cy: 10, r: 3.5, class: "art-gremlin-fill" }),
    ];
  }
  return svg(
    "svg",
    { viewBox: "0 0 120 64", preserveAspectRatio: "xMidYMid meet", class: "device-art", "aria-hidden": "true", focusable: "false" },
    parts,
  );
}
