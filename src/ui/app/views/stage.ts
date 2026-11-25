// Stage view: the Scene_Area (scene, then one panel with the Move_Strip and the Player) and the Aside.
// Idle and running text sits in the right column, where the verdict card goes later. Shrink and note text
// is laid over the dimmed Scene.
// States: idle, running, shrinking, broke, held, couldn't tell, reduce-error. The page controller (app-page.ts) calls one
// show* method per phase; this file draws what it is given and holds no rule or timing logic.
// Copy comes from model/stage-copy.ts. Playback comes from a Playback the caller owns.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent } from "../../../engine/types";
import type { PinLevelRow } from "../model/pin-levels";
import type { SignalLabels } from "../model/signal-labels";
import type { ShownKind } from "../model/scenes";
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
import { createPinLevelsScene } from "./scene-pin-levels";
import type { PinLevelsSceneView } from "./scene-pin-levels";
import type { DeviceId } from "./setup";

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
  /** Which replay this is, for the garage deadline badge. Default "reduced-buggy". */
  kind?: ShownKind;
  /** Upload: the outputs named by the Target_Rule, ringed at the break. */
  ringSignals?: readonly string[];
  /** Where the Move_Strip takes signal names from; default the Example tables. */
  labels?: SignalLabels;
}

export interface StageView {
  root: HTMLElement;
  aside: AsideView;
  strip: MoveStrip;
  /** Chooses the Scene of the device (an Example's scene, or the Pin_Levels_View). Does not change the phase. */
  setDevice(id: DeviceId): void;
  /** Upload: the Pin_Table rows the Pin_Levels_View lists; redraws it with no replay. */
  setPinRows(rows: readonly PinLevelRow[]): void;
  /** The one Player. The Fix_View takes this node as its `playerNode`, so a second player is never built. */
  playerNode: HTMLElement;
  /**
   * Fix_View mode. On: the Scene, Move_Strip and status line give way to `fixRoot`. Off: they return, and
   * the Player node goes back under the Move_Strip (it was moved into the Fix_View).
   */
  setFixMode(on: boolean, fixRoot?: HTMLElement): void;
  /** Idle: 60% Scene, its two lines in the right column, no timeline. */
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
  /**
   * Held: a try where the rule held. Label above the Scene, the Scene and the Player; no strip, no break
   * marker and no "Stopped at the break" (`replay.v` is past the end of the plan). The caller loads the plan.
   */
  showHeld(replay: ShownReplay, label: string): void;
  /**
   * One line of text in place of a replay: no strip and no Player. `dim` dims the Scene (COULDN'T TELL, a replay
   * that could not be shown); without it the Scene looks idle (a replay is being made ready).
   * `solid` makes the note panel fully opaque. No replay controls show in either case.
   */
  showNote(line: string, dim: boolean, opts?: { solid?: boolean }): void;
  /** Reduce error: Scene un-dimmed and, on Upload, still blank; no strip and no Player. The message goes in the Aside's Reduction_Card. */
  showReduceError(): void;
  dispose(): void;
}

type Scene = {
  node: HTMLElement;
  /** The rounded card of the art; the stage lays its shrink and note text over it. */
  frame: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: Record<string, unknown>): void;
};

function makeScene(id: DeviceId): Scene {
  // The scene views share the call shape of `update`; each reads only the options it knows.
  switch (id) {
    case "upload":
      return createPinLevelsScene() as unknown as Scene;
    case "garage":
      return createGarageScene() as unknown as Scene;
    case "heartbeat":
      return createHeartbeatScene() as unknown as Scene;
    default:
      return createCrosswalkScene() as unknown as Scene;
  }
}

export function createStage(playback: Playback, initial: DeviceId = "crosswalk"): StageView {
  const aside = createAside();
  const strip = createMoveStrip();
  const playerBar: PlayerBar = createPlayerBar(playback);
  const sceneCard = el("div", { class: "scene-card is-idle" });
  // Text over the Scene (shrink view, notes) and text in the right column (idle, running).
  const overlay = el("div", { class: "stage-overlay", "aria-live": "polite" });
  const sideStatus = el("div", { class: "stage-status", "aria-live": "polite" });
  const tryLabel = el("p", { class: "scene-try-label", hidden: true });
  const sceneArea = el("div", { class: "scene-area" }, [tryLabel, sceneCard]);
  // The Move_Strip and the Player share one panel under the Scene.
  const replayPanel = el("div", { class: "replay-panel", hidden: true }, [strip.root, playerBar.root]);
  const fixSlot = el("div", { class: "stage-fix", hidden: true });
  const main = el("div", { class: "stage-main" }, [sceneArea, replayPanel, fixSlot]);
  const side = el("div", { class: "stage-aside" }, [sideStatus, aside.root, aside.actions]);
  const root = el("section", { class: "stage", "aria-label": "Stage" }, [main, side]);

  let exampleId: DeviceId = initial;
  let fixMode = false;
  let stripWanted = false;
  let scene: Scene = makeScene(initial);
  let shown: ShownReplay | null = null;

  function mountScene(): void {
    setChildren(sceneCard, [scene.node]);
    scene.frame.appendChild(overlay);
  }

  /** Scene look: "idle" 60%, "dim" for the Shrink_View and errors, "live" for the replay. */
  function look(kind: "idle" | "dim" | "live"): void {
    // The Pin_Levels_View never keeps an old lamp lit: outside a replay it is drawn with no replay.
    if (kind !== "live" && exampleId === "upload") scene.update([], [], 0, { waiting: true });
    sceneCard.classList.toggle("is-idle", kind === "idle");
    sceneCard.classList.toggle("is-dim", kind === "dim");
    sceneCard.classList.toggle("is-broke", false);
    // Every look clears the solid-note hiding; only showNote with `solid` sets it again, after this call.
    sceneCard.classList.toggle("is-levels-hidden", false);
  }

  function drawScene(cursor: number): void {
    if (shown === null) return;
    const s = shown;
    const atBreak = cursor >= s.v;
    const plan = playback.plan();
    const ended = !playback.playing() && plan !== null && cursor >= plan.end;
    // The crosswalk actors move in display time: they need to know when playback ends and when it jumps.
    const common = {
      atBreak,
      stopped: atBreak && !playback.playing(),
      ended,
      playing: playback.playing(),
      endCursor: plan === null ? null : plan.end,
      msToEnd: plan === null ? null : playback.msUntil(plan.end),
      epoch: playback.epoch(),
    };
    let opts: Record<string, unknown> = common;
    if (exampleId === "garage") {
      opts = { ...common, fixture: s.fixture, kind: s.kind ?? "reduced-buggy", v: s.v, limitMs: s.limitMs };
    } else if (exampleId === "upload") {
      opts = { ...common, v: Number.isFinite(s.v) ? s.v : null, ringSignals: s.ringSignals ?? [] };
    } else if (exampleId === "heartbeat") {
      opts = { ...common, limitMs: s.limitMs, imAliveRuleBroke: s.imAliveRuleBroke === true, build: "buggy" };
    }
    scene.update(s.edges, s.events, cursor, opts);
    sceneCard.classList.toggle("is-broke", atBreak);
    strip.setCursor(cursor);
  }

  const offCursor = playback.onCursor((c) => drawScene(c));
  const offState = playback.onState(() => {
    if (shown !== null) drawScene(playback.cursor());
  });

  function block(title: string | null, lines: readonly (string | HTMLElement)[], cls: string): HTMLElement {
    return el("div", { class: cls }, [
      title === null ? null : el("p", { class: "stage-title" }, [title]),
      ...lines.map((l) => (typeof l === "string" ? el("p", { class: "stage-note" }, [l]) : l)),
    ]);
  }

  /** Text in the right column (idle, running); clears the text over the Scene. */
  function sideText(title: string | null, lines: readonly (string | HTMLElement)[], cls: string): void {
    setChildren(overlay, []);
    setChildren(sideStatus, [block(title, lines, cls)]);
    sideStatus.hidden = false;
  }

  /** Text over the dimmed Scene (shrink view, notes); clears the right-column text. */
  function overlayText(title: string | null, lines: readonly (string | HTMLElement)[], cls: string): void {
    clearText();
    if (title === null && lines.length === 0) return;
    setChildren(overlay, [block(title, lines, cls)]);
  }

  function clearText(): void {
    setChildren(overlay, []);
    setChildren(sideStatus, []);
    sideStatus.hidden = true;
  }

  /** The panel shows while the strip or the Player has something to show. */
  function paintPanel(): void {
    replayPanel.hidden = fixMode || (strip.root.hidden && playerBar.root.hidden);
  }

  function hidePlayer(hidden: boolean): void {
    playerBar.root.hidden = hidden;
    paintPanel();
  }

  /** The move strip shows only while it has something to show: never empty, never in the fix view. */
  function stripVisible(on: boolean): void {
    stripWanted = on;
    strip.root.hidden = fixMode || !on;
    paintPanel();
  }

  function showLabel(text: string | null): void {
    tryLabel.textContent = text ?? "";
    tryLabel.hidden = text === null;
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
    showLabel(null);
    stripVisible(true);
    strip.showShrink(original, faded, reduced);
    overlayText(
      reduced === null ? STAGE_TEXT.shrinkTitle : null,
      reduced === null ? [el("p", { class: "stage-note shrink-count" }, [shorterText(candidatesTried === null ? 0 : candidatesTried)])] : [],
      "stage-shrink",
    );
  }

  mountScene();
  hidePlayer(true);
  stripVisible(false);
  clearText();

  return {
    root,
    aside,
    strip,
    playerNode: playerBar.root,
    setFixMode(on, fixRoot) {
      fixMode = on;
      sceneArea.hidden = on;
      side.hidden = on;
      root.classList.toggle("is-fix", on);
      strip.root.hidden = on || !stripWanted;
      fixSlot.hidden = !on;
      if (on) {
        shown = null;
        setChildren(fixSlot, fixRoot === undefined ? [] : [fixRoot]);
      } else {
        setChildren(fixSlot, []);
        // The Fix_View held the Player; put it back in the panel, after the strip.
        replayPanel.appendChild(playerBar.root);
      }
      paintPanel();
    },
    setDevice(id) {
      if (id === exampleId) return;
      exampleId = id;
      scene = makeScene(id);
      shown = null;
      mountScene();
    },
    setPinRows(rows) {
      if (exampleId !== "upload") return;
      (scene as unknown as PinLevelsSceneView).setRows(rows);
      shown = null;
      mountScene();
    },
    showIdle() {
      shown = null;
      look("idle");
      strip.clear();
      stripVisible(false);
      showLabel(null);
      hidePlayer(true);
      sideText(STAGE_TEXT.idleTitle, [STAGE_TEXT.idleLine], "stage-idle");
    },
    showRunning(runsCompleted, tries) {
      shown = null;
      look("idle");
      strip.clear();
      stripVisible(false);
      showLabel(null);
      hidePlayer(true);
      const p = tryProgress(runsCompleted, tries);
      const fillNode = el("span", { class: "progress-fill" });
      fillNode.style.width = `${String(p.fill * 100)}%`;
      const bar = el(
        "div",
        { class: "progress-bar", role: "progressbar", "aria-label": p.text, "aria-valuemin": 0, "aria-valuemax": tries, "aria-valuenow": Math.round(p.fill * tries) },
        [fillNode],
      );
      sideText(null, [el("p", { class: "stage-title" }, [p.text]), bar], "stage-running");
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
      showLabel(null);
      clearText();
      stripVisible(true);
      strip.showMoves(replay.events, replay.fixture, replay.start, replay.v, replay.labels);
      hidePlayer(false);
      drawScene(playback.cursor());
    },
    showHeld(replay, label) {
      shown = replay;
      look("live");
      showLabel(label);
      clearText();
      strip.clear();
      stripVisible(false);
      hidePlayer(false);
      drawScene(playback.cursor());
    },
    showNote(line, dim, opts) {
      shown = null;
      look(dim ? "dim" : "idle");
      strip.clear();
      stripVisible(false);
      showLabel(null);
      hidePlayer(true);
      sceneCard.classList.toggle("is-levels-hidden", opts?.solid === true);
      overlayText(null, [line], opts?.solid === true ? "stage-note-block stage-note-block--solid" : "stage-note-block");
    },
    showReduceError() {
      shown = null;
      look("idle");
      strip.clear();
      stripVisible(false);
      showLabel(null);
      hidePlayer(true);
      clearText();
    },
    dispose() {
      offCursor();
      offState();
      playerBar.dispose();
    },
  };
}