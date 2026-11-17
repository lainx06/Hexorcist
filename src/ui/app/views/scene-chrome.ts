// Shared HTML frame of the three scenes. The art fills a rounded card edge to edge; the labels and badges
// are HTML laid over it, each placed next to its object in the art's own units, so they scale with it.
// Labels never sit on top of a scene object: each scene places them on empty ground.
// On a phone the labels would crowd the art, so CSS hides them and shows one line of the same texts
// under the card instead. This file only maps option values to attributes and text; the texts come from
// the model tables.
import type { Ratio } from "../model/pacing";
import { STAGE_TEXT } from "../model/stage-copy";
import { el } from "./dom";

export interface SceneCommonOpts {
  /** Ignored: the speed badge sits in the player row, not on the scene. */
  speed?: Ratio | null;
  /** The Cursor has reached v: every element except the Target_Rule outputs fades to 40%. */
  atBreak?: boolean;
  /** The Cursor is at v and playback is stopped: shows "Stopped at the break". */
  stopped?: boolean;
  /** Playback is over at this frame. A car that is leaving the scene finishes leaving (crosswalk). */
  ended?: boolean;
  /** "fix": a side of the Fix_View. The title chip sits top left and the break badge moves to bottom left. */
  layout?: "stage" | "fix";
  /** Fix_View title chip ("Original program" / "Fixed program"). */
  title?: string | null;
  /** Fix_View state badge at bottom left (mint, filled), for example "Walk sign: off · Car light: green". */
  state?: string | null;
}

/** A label laid over the art. x and y are in the art's viewBox units. */
export interface SceneLabel {
  node: HTMLElement;
  x: number;
  y: number;
  /** Which edge of the label sits at x. Default "center". */
  align?: "start" | "center" | "end";
  /** Which edge of the label sits at y. Default "top". */
  anchor?: "top" | "middle";
  /** Largest width as a share of the scene width (0 to 1). */
  maxWidth?: number;
}

export interface SceneChromeSpec {
  art: SVGElement;
  /** The art's viewBox size. */
  width: number;
  height: number;
  labels: readonly SceneLabel[];
  /** Nodes under the card (a line of text, a visually hidden summary). */
  below?: readonly (Node | null)[];
}

export interface SceneChrome {
  node: HTMLElement;
  /** The rounded card that holds the art and the overlays. The stage lays its own text over it. */
  frame: HTMLElement;
  /** Sets the "Stopped at the break" badge, the fade state and the Fix_View chips. */
  apply(opts: SceneCommonOpts): void;
  /** Sets the break badge (the example's conflict or deadline badge); null hides it. */
  setConflict(text: string | null): void;
  /** The phone line under the card: the label texts of this frame. */
  setLine(parts: readonly string[]): void;
}

const pct = (n: number): string => `${String(Math.round(n * 10000) / 100)}%`;

export function createChrome(spec: SceneChromeSpec): SceneChrome {
  const conflict = el("span", { class: "scene-badge scene-badge--break", hidden: true }, [""]);
  const title = el("span", { class: "scene-badge scene-badge--title", hidden: true }, [""]);
  const state = el("span", { class: "scene-badge scene-badge--state", hidden: true }, [""]);
  const illustrative = el("span", { class: "scene-badge scene-badge--illustrative" }, [STAGE_TEXT.illustrative]);
  const stopped = el("span", { class: "scene-badge scene-badge--stopped", hidden: true }, [STAGE_TEXT.stopped]);
  const topLeft = el("div", { class: "scene-corner scene-corner--tl" }, [title, conflict]);
  const bottomLeft = el("div", { class: "scene-corner scene-corner--bl" }, [state]);
  const topRight = el("div", { class: "scene-corner scene-corner--tr" }, [illustrative]);
  const bottomRight = el("div", { class: "scene-corner scene-corner--br" }, [stopped]);

  const labels = el(
    "div",
    { class: "scene-labels" },
    spec.labels.map((l) => {
      l.node.classList.add("scene-label");
      const s = l.node.style;
      s.left = pct(l.x / spec.width);
      s.top = pct(l.y / spec.height);
      const tx = l.align === "start" ? "0" : l.align === "end" ? "-100%" : "-50%";
      const ty = l.anchor === "middle" ? "-50%" : "0";
      s.transform = `translate(${tx}, ${ty})`;
      if (l.align === "end") s.textAlign = "right";
      else if (l.align === "start") s.textAlign = "left";
      else s.textAlign = "center";
      if (l.maxWidth !== undefined) s.maxWidth = pct(l.maxWidth);
      return l.node;
    }),
  );
  const frame = el("div", { class: "scene-frame" }, [spec.art, labels, topLeft, topRight, bottomLeft, bottomRight]);
  const line = el("p", { class: "scene-phone-line", "aria-hidden": "true" }, [""]);
  const node = el("div", { class: "scene" }, [frame, line, ...(spec.below ?? [])]);
  let layout: "stage" | "fix" = "stage";

  return {
    node,
    frame,
    apply(opts) {
      const next = opts.layout ?? "stage";
      if (next !== layout) {
        layout = next;
        // In the Fix_View the title chip owns the top-left corner, so the break badge goes to bottom left.
        if (layout === "fix") bottomLeft.insertBefore(conflict, state);
        else topLeft.appendChild(conflict);
      }
      const t = opts.title ?? null;
      title.textContent = t ?? "";
      title.toggleAttribute("hidden", t === null);
      const st = opts.state ?? null;
      state.textContent = st ?? "";
      state.toggleAttribute("hidden", st === null);
      stopped.toggleAttribute("hidden", opts.stopped !== true);
      node.classList.toggle("is-frozen", opts.atBreak === true);
    },
    setConflict(text) {
      conflict.textContent = text ?? "";
      conflict.toggleAttribute("hidden", text === null);
    },
    setLine(parts) {
      line.textContent = [...parts, STAGE_TEXT.illustrative].join(" \u00b7 ");
    },
  };
}
