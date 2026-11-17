// Shared HTML frame of the three scenes: the badge rows above and below the art. Labels live in
// HTML, never inside the SVG, so they cannot overlap scene shapes. This file only maps option
// values to attributes and text; the texts come from the model tables.
import type { Ratio } from "../model/pacing";
import { speedBadge } from "../model/pacing";
import { STAGE_TEXT } from "../model/stage-copy";
import { el } from "./dom";

export interface SceneCommonOpts {
  /** Slow_Factor at the Cursor. Null or missing hides the Speed_Badge. */
  speed?: Ratio | null;
  /** The Cursor has reached v: every element except the Target_Rule outputs fades to 40%. */
  atBreak?: boolean;
  /** The Cursor is at v and playback is stopped: shows "Stopped at the break". */
  stopped?: boolean;
}

export interface SceneChrome {
  node: HTMLElement;
  /** Sets the Speed_Badge, the "Stopped at the break" badge and the fade state. */
  apply(opts: SceneCommonOpts): void;
  /** Sets the conflict badge at top left; null hides it. */
  setConflict(text: string | null): void;
}

/** Wraps `parts` (art, label rows, lines) between the top and bottom badge rows. */
export function createChrome(parts: readonly (Node | null)[]): SceneChrome {
  const conflict = el("span", { class: "badge badge--conflict", hidden: true }, [""]);
  const speed = el("span", { class: "badge badge--speed", hidden: true }, [""]);
  const illustrative = el("span", { class: "badge badge--illustrative" }, [STAGE_TEXT.illustrative]);
  const stopped = el("span", { class: "badge badge--broke", hidden: true }, [STAGE_TEXT.stopped]);
  const top = el("div", { class: "scene-badges" }, [
    el("div", { class: "scene-badge-group" }, [conflict, speed]),
    illustrative,
  ]);
  const bottom = el("div", { class: "scene-badges scene-badges--bottom" }, [stopped]);
  const node = el("div", { class: "scene" }, [top, ...parts, bottom]);

  return {
    node,
    apply(opts) {
      const s = opts.speed ?? null;
      speed.textContent = s === null ? "" : speedBadge(s);
      speed.toggleAttribute("hidden", s === null);
      stopped.toggleAttribute("hidden", opts.stopped !== true);
      node.classList.toggle("is-frozen", opts.atBreak === true);
    },
    setConflict(text) {
      conflict.textContent = text ?? "";
      conflict.toggleAttribute("hidden", text === null);
    },
  };
}
