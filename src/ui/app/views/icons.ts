// Original inline SVG icons. Stroke icons use currentColor.
import { svg } from "./dom";

function icon(size: number, children: SVGElement[]): SVGElement {
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
      "aria-hidden": "true",
      focusable: "false",
      class: "icon",
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

/** COULDN'T TELL: an open bracket with a dashed stub. */
export function openBracketIcon(): SVGElement {
  return icon(24, [
    svg("path", { d: "M10 4H6v16h4" }),
    svg("path", { d: "M13 12h7", "stroke-dasharray": "2 3" }),
  ]);
}

/** Masher: a broad low body, two square fists over a button, two eyes, press marks. 32 x 32. */
export function masherIcon(): SVGElement {
  return icon(32, [
    svg("path", { d: "M4 28c0-7 5-11 12-11s12 4 12 11z" }),
    svg("circle", { cx: 12, cy: 22, r: 1.5, fill: "currentColor", stroke: "none" }),
    svg("circle", { cx: 20, cy: 22, r: 1.5, fill: "currentColor", stroke: "none" }),
    svg("rect", { x: 6, y: 8, width: 6, height: 5, rx: 1 }),
    svg("rect", { x: 20, y: 8, width: 6, height: 5, rx: 1 }),
    svg("path", { d: "M9 13v4" }),
    svg("path", { d: "M23 13v4" }),
    svg("rect", { x: 13, y: 12, width: 6, height: 3, rx: 1 }),
    svg("path", { d: "M14 4l1 3" }),
    svg("path", { d: "M18 4l-1 3" }),
  ]);
}

/** A small crossing motif for the example card. */
export function crossingMotif(): SVGElement {
  return icon(32, [
    svg("path", { d: "M2 24h28" }),
    svg("path", { d: "M8 24v-4" }),
    svg("path", { d: "M14 24v-4" }),
    svg("path", { d: "M20 24v-4" }),
    svg("rect", { x: 23, y: 4, width: 6, height: 12, rx: 2 }),
    svg("circle", { cx: 26, cy: 8, r: 1, fill: "currentColor", stroke: "none" }),
    svg("circle", { cx: 26, cy: 12, r: 1, fill: "currentColor", stroke: "none" }),
  ]);
}

export function gremlinIcon(iconName: string): SVGElement | null {
  return iconName === "gremlin-masher" ? masherIcon() : null;
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