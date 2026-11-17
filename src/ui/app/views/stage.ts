// Stage view: the Scene_Area (scene, status text, Move_Strip, Player) and the Aside.
// States: idle, running, shrinking, broke, reduce-error. The page controller (app-page.ts) calls one
// show* method per phase; this file draws what it is given and holds no rule or timing logic.
// Copy comes from model/stage-copy.ts. Playback comes from a Playback the caller owns.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import type { Ratio } from "../model/pacing";
import { STAGE_TEXT, shorterText, tryProgress } from "../model/stage-copy";
import { fadeShrinkDots } from "../model/strip";
import type { AsideView } from "./aside";
import { createAside } from "./aside";
import { el, setChildren } from "./dom";
import type { MoveStrip } from "./move-strip";
import { createMoveStrip } from "./move-strip";
import { createPlayerBar } from "./player-bar";
import type { PlayerBar } from "./player-bar";
import type { Playback } from "./playback";
import { createCrosswalkScene } from "./scene-crosswalk";
import { createGarageScene } from "./scene-garage";
import { createHeartbeatScene } from "./scene-heartbeat";

/** What the Scene needs to draw the broke replay. */
export interface ShownReplay {
  edges: readonly OutputEvent[];
  /** Recorded input events of the shown replay (the Reduced_List). */
  events: readonly ReducerEvent[];
  fixture: Fixture;
  /** Cycle where the strip starts (S) and the break cycle (v). */
  start: number;
  v: number;
  /** Active rule limit in whole ms, for the garage deadline badge and the I'm-alive ring. */
  limitMs?: number;
  /** An I'm-alive rule broke on the shown run. */
  imAliveRuleBroke?: boolean;
}

export interface StageView {
  root: HTMLElement;
  aside: AsideView;
  strip: MoveStrip;
  /** Chooses the Scene of the example. Does not change the phase. */
  setExample(id: ExampleId): void;
  /** The one Player. The Fix_View takes this node as its `playerNode`, so a second player is never built. */
  playerNode: HTMLElement;
  /**
   * Fix_View mode. On: the Scene, Move_Strip and status line give way to `fixRoot`. Off: they return, and
   * the Player node goes back under the Move_Strip (it was moved into the Fix_View).
   */
  setFixMode(on: boolean, fixRoot?: HTMLElement): void;
  /** Idle: 60% Scene, two lines, no timeline. */
  showIdle(): void;
  /** Running: "Try N of M" and the slim progress bar. `runsCompleted` is null before any progress message. */
  showRunning(runsCompleted: number | null, tries: number): void;
  /** Shrinking: dimmed Scene, label, counter and the shrink strip. `reduced` is null until `reduce-done`. */
  showShrinking(
    original: readonly ReducerEvent[],
    candidatesTried: number | null,
    faded: ReadonlySet<number>,
    reduced?: readonly ReducerEvent[] | null,
  ): void;
  /** One `reduce-progress` message: fades dots with `fadeShrinkDots`, redraws, and returns the new faded set. */
  reduceProgress(
    original: readonly ReducerEvent[],
    candidatesTried: number,
    bestList: readonly ReducerEvent[],
    faded: ReadonlySet<number>,
  ): Set<number>;
  /** Broke: Scene, strip with labels and Player. The caller loads the Playback plan. */
  showBroke(replay: ShownReplay): void;
  /** Reduce error: dimmed Scene, no strip and no Player. The message goes in the Aside's Reduction_Card. */
  showReduceError(): void;
  dispose(): void;
}

type Scene = {
  node: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: Record<string, unknown>): void;
};

function makeScene(id: ExampleId): Scene {
  // The three scene views share the call shape of `update`; each reads only the options it knows.
  switch (id) {
    case "garage":
      return createGarageScene() as unknown as Scene;
    case "heartbeat":
      return createHeartbeatScene() as unknown as Scene;
    default:
      return createCrosswalkScene() as unknown as Scene;
  }
}

export function createStage(playback: Playback, initial: ExampleId = "crosswalk"): StageView {
  const aside = createAside();
  const strip = createMoveStrip();
  const playerBar: PlayerBar = createPlayerBar(playback);
  const sceneCard = el("div", { class: "scene-card is-idle" });
  const status = el("div", { class: "stage-status", "aria-live": "polite" });
  const sceneArea = el("div", { class: "scene-area" }, [sceneCard, status]);
  const fixSlot = el("div", { class: "stage-fix", hidden: true });
  const main = el("div", { class: "stage-main" }, [sceneArea, strip.root, playerBar.root, fixSlot]);
  const side = el("div", { class: "stage-aside" }, [aside.root, aside.actions]);
  const root = el("section", { class: "stage", "aria-label": "Stage" }, [main, side]);

  let exampleId: ExampleId = initial;
  let scene: Scene = makeScene(initial);
  let shown: ShownReplay | null = null;

  function mountScene(): void {
    setChildren(sceneCard, [scene.node]);
  }

  /** Scene look: "idle" 60%, "dim" for the Shrink_View and errors, "live" for the replay. */
  function look(kind: "idle" | "dim" | "live"): void {
    sceneCard.classList.toggle("is-idle", kind === "idle");
    sceneCard.classList.toggle("is-dim", kind === "dim");
    sceneCard.classList.toggle("is-broke", false);
  }

  function drawScene(cursor: number, slow: Ratio | null): void {
    if (shown === null) return;
    const s = shown;
    const atBreak = cursor >= s.v;
    const common = { speed: slow, atBreak, stopped: atBreak && !playback.playing() };
    let opts: Record<string, unknown> = common;
    if (exampleId === "garage") {
      opts = { ...common, fixture: s.fixture, kind: "reduced-buggy", v: s.v, limitMs: s.limitMs };
    } else if (exampleId === "heartbeat") {
      opts = { ...common, limitMs: s.limitMs, imAliveRuleBroke: s.imAliveRuleBroke === true, build: "buggy" };
    }
    scene.update(s.edges, s.events, cursor, opts);
    sceneCard.classList.toggle("is-broke", atBreak);
    strip.setCursor(cursor);
  }

  const offCursor = playback.onCursor((c, f) => drawScene(c, f));
  const offState = playback.onState(() => {
    if (shown !== null) drawScene(playback.cursor(), null);
  });

  function text(title: string | null, lines: readonly (string | HTMLElement)[], cls: string): void {
    setChildren(status, [
      el("div", { class: cls }, [title === null ? null : el("p", { class: "stage-title" }, [title]), ...lines.map((l) => (typeof l === "string" ? el("p", { class: "stage-note" }, [l]) : l))]),
    ]);
  }

  function hidePlayer(hidden: boolean): void {
    playerBar.root.hidden = hidden;
  }

  function showShrinking(
    original: readonly ReducerEvent[],
    candidatesTried: number | null,
    faded: ReadonlySet<number>,
    reduced: readonly ReducerEvent[] | null = null,
  ): void {
    shown = null;
    look("dim");
    hidePlayer(true);
    strip.showShrink(original, faded, reduced);
    text(
      reduced === null ? STAGE_TEXT.shrinkTitle : null,
      reduced === null ? [el("p", { class: "stage-note shrink-count" }, [shorterText(candidatesTried === null ? 0 : candidatesTried)])] : [],
      "stage-shrink",
    );
  }

  mountScene();
  hidePlayer(true);

  return {
    root,
    aside,
    strip,
    playerNode: playerBar.root,
    setFixMode(on, fixRoot) {
      sceneArea.hidden = on;
      strip.root.hidden = on;
      fixSlot.hidden = !on;
      if (on) {
        shown = null;
        setChildren(fixSlot, fixRoot === undefined ? [] : [fixRoot]);
      } else {
        setChildren(fixSlot, []);
        // The Fix_View held the Player; put it back before the slot.
        main.insertBefore(playerBar.root, fixSlot);
      }
    },
    setExample(id) {
      if (id === exampleId) return;
      exampleId = id;
      scene = makeScene(id);
      shown = null;
      mountScene();
    },
    showIdle() {
      shown = null;
      look("idle");
      strip.clear();
      hidePlayer(true);
      text(STAGE_TEXT.idleTitle, [STAGE_TEXT.idleLine], "stage-idle");
    },
    showRunning(runsCompleted, tries) {
      shown = null;
      look("idle");
      strip.clear();
      hidePlayer(true);
      const p = tryProgress(runsCompleted, tries);
      const fillNode = el("span", { class: "progress-fill" });
      fillNode.style.width = `${String(p.fill * 100)}%`;
      const bar = el(
        "div",
        { class: "progress-bar", role: "progressbar", "aria-label": p.text, "aria-valuemin": 0, "aria-valuemax": tries, "aria-valuenow": Math.round(p.fill * tries) },
        [fillNode],
      );
      text(null, [el("p", { class: "stage-note" }, [p.text]), bar], "stage-running");
    },
    showShrinking,
    reduceProgress(original, candidatesTried, bestList, faded) {
      const next = fadeShrinkDots(original, bestList, faded);
      showShrinking(original, candidatesTried, next, null);
      return next;
    },
    showBroke(replay) {
      shown = replay;
      look("live");
      setChildren(status, []);
      strip.showMoves(replay.events, replay.fixture, replay.start, replay.v);
      hidePlayer(false);
      drawScene(playback.cursor(), null);
    },
    showReduceError() {
      shown = null;
      look("dim");
      strip.clear();
      hidePlayer(true);
      setChildren(status, []);
    },
    dispose() {
      offCursor();
      offState();
      playerBar.dispose();
    },
  };
}
