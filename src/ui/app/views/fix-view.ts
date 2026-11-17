// Fix view: the original program and the fixed program side by side on one shared Cursor.
// One Playback (views/playback.ts) drives both Scenes. The plan is the Pacing_Plan of the broke replay
// plus the 4x tail (pacing.withTail), so the right Scene follows the Cursor up to its own end and stops.
// This file draws what it is given. Copy comes from model/stage-copy.ts, cursors and badges from
// model/fix-view.ts. It reads no clock and posts nothing to the Engine_Worker.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent, Verdict } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import type { DiffHunk } from "../model/diff";
import { codeHunks, fixBadge, leftCursor, rightCursorEnd } from "../model/fix-view";
import type { PacingPlan, Ratio } from "../model/pacing";
import { speedBadge, withTail } from "../model/pacing";
import type { FixOutcome } from "../model/stage-copy";
import {
  FIX_EXPLAIN,
  FIX_TEXT,
  fixBadgeText,
  fixedCampaignText,
  fixedProgressText,
  fixHeading,
  fixReplayText,
} from "../model/stage-copy";
import { el, setChildren } from "./dom";
import { createPlayerBar } from "./player-bar";
import type { Playback } from "./playback";
import { createCrosswalkScene } from "./scene-crosswalk";
import { createGarageScene } from "./scene-garage";
import { createHeartbeatScene } from "./scene-heartbeat";

/** What is known when the Fix_View opens: the same for both sides. */
export interface FixBegin {
  exampleId: ExampleId;
  fixture: Fixture;
  /** `reducedEventCount`. */
  k: number;
  /** Break cycle of the reduced replay on the buggy build. */
  v: number;
  /** Active rule limit in whole ms, for the garage deadline badge and the I'm-alive ring. */
  limitMs?: number;
  /** Diff hunks of buggy to fixed source. */
  hunks: readonly DiffHunk[];
}

/** The reduced replay on the fixed build, once it and its display replay are in. */
export interface FixReady {
  /** Pacing_Plan of the broke replay (buildPlan of the Reduced_List cycles and v). */
  plan: PacingPlan;
  original: { edges: readonly OutputEvent[]; events: readonly ReducerEvent[] };
  fixed: { edges: readonly OutputEvent[]; events: readonly ReducerEvent[]; reachedEnd: number };
  outcome: FixOutcome;
  /** Start the shared auto-play (the Playback itself honours Reduced_Motion). */
  autoPlay: boolean;
}

export interface FixView {
  root: HTMLElement;
  /** Shows the heading, the side titles, the explanation and the code change. Does not start playback. */
  begin(info: FixBegin): void;
  /** Right card line while the Fixed_Campaign runs: "Checking the fixed program: try N of M". */
  showCampaignProgress(runsCompleted: number | null, tries: number): void;
  /** Right card after the Fixed_Campaign ends. `violatingRunIndex` is the BROKE run index, else null. */
  showCampaignDone(verdict: Verdict, tries: number, violatingRunIndex: number | null, plainBroke: string): void;
  /** Right card when the Fixed_Campaign failed: the replay sentence stays, the message is added. */
  showCampaignError(message: string): void;
  /** Both Scenes, the shared plan and the replay sentence. Loads the Playback. */
  ready(data: FixReady): void;
  dispose(): void;
}

interface Scene {
  node: HTMLElement;
  update(edges: readonly OutputEvent[], events: readonly ReducerEvent[], cursor: number, opts?: Record<string, unknown>): void;
}

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

function sign(l: { type: string }): string {
  return l.type === "removed" ? "- " : l.type === "added" ? "+ " : "  ";
}

/** The diff of the hunks that change code (comment-only hunks are left out). */
export function diffView(hunks: readonly DiffHunk[]): HTMLElement {
  return el(
    "div",
    { class: "diff mono", tabindex: 0, role: "region", "aria-label": FIX_TEXT.showCode },
    codeHunks(hunks).map((h) =>
      el("div", { class: "hunk" }, [
        el("p", { class: "hunk-head meta" }, [`@@ -${String(h.oldStart)},${String(h.oldCount)} +${String(h.newStart)},${String(h.newCount)} @@`]),
        ...h.lines.map((l) => el("p", { class: `diff-line diff-line--${l.type}` }, [`${sign(l)}${l.text}`])),
      ]),
    ),
  );
}

/** "What the fix changed", the explanation and the collapsed "Show the code change" disclosure. */
export function createFixChange(id: ExampleId, hunks: readonly DiffHunk[]): HTMLElement {
  return el("section", { class: "fix-change", "aria-label": FIX_TEXT.whatChanged }, [
    el("h3", { class: "region-title" }, [FIX_TEXT.whatChanged]),
    el("p", { class: "fix-explain" }, [FIX_EXPLAIN[id]]),
    el("details", { class: "code-change" }, [el("summary", {}, [FIX_TEXT.showCode]), diffView(hunks)]),
  ]);
}

export function createFixView(playback: Playback, playerNode?: HTMLElement): FixView {
  const heading = el("h2", { class: "fix-heading" }, [""]);
  const badgeLine = el("p", { class: "fix-badge-line badge" }, [""]);
  badgeLine.hidden = true;

  const leftHost = el("div", { class: "scene-card" });
  const rightHost = el("div", { class: "scene-card" });
  const fixState = el("p", { class: "badge fix-state" }, [""]);
  fixState.hidden = true;
  const leftCard = el("div", { class: "card fix-card fix-card--left", hidden: true }, [
    el("p", { class: "fix-left-text" }, [FIX_TEXT.leftCard]),
  ]);
  const replayLine = el("p", { class: "fix-replay" }, [""]);
  const campaignBox = el("div", { class: "fix-campaign" });
  const rightCard = el("div", { class: "card fix-card fix-card--right", "aria-live": "polite" }, [replayLine, campaignBox]);
  replayLine.hidden = true;

  const leftSide = el("div", { class: "fix-side fix-side--original" }, [
    el("h3", { class: "fix-side-title" }, [FIX_TEXT.leftTitle]),
    leftHost,
    leftCard,
  ]);
  const rightSide = el("div", { class: "fix-side fix-side--fixed" }, [
    el("h3", { class: "fix-side-title" }, [FIX_TEXT.rightTitle]),
    rightHost,
    fixState,
    rightCard,
  ]);
  const replayBoth = el("button", { type: "button", class: "secondary fix-replay-both" }, [FIX_TEXT.replayBoth]);
  const player = playerNode ?? createPlayerBar(playback).root;
  const changeHost = el("div", { class: "fix-change-host" });
  const root = el("section", { class: "fix-view", "aria-label": "Fix view" }, [
    heading,
    badgeLine,
    el("div", { class: "fix-grid" }, [leftSide, rightSide]),
    el("div", { class: "fix-controls" }, [player, replayBoth]),
    changeHost,
  ]);

  let info: FixBegin | null = null;
  let ready: FixReady | null = null;
  let leftScene: Scene | null = null;
  let rightScene: Scene | null = null;
  let rightEnd = 0;
  let slow: Ratio | null = null;

  function draw(c: number): void {
    if (info === null || ready === null || leftScene === null || rightScene === null) return;
    const i = info;
    const r = ready;
    const frozen = c >= i.v;
    const lc = leftCursor(c, i.v);
    const rc = Math.min(c, rightEnd);
    const left = { speed: frozen ? null : slow, atBreak: frozen, stopped: frozen };
    const right = { speed: slow, atBreak: false, stopped: false };
    const lo: Record<string, unknown> = { ...left };
    const ro: Record<string, unknown> = { ...right };
    if (i.exampleId === "garage") {
      Object.assign(lo, { fixture: i.fixture, kind: "reduced-buggy", v: i.v, limitMs: i.limitMs });
      Object.assign(ro, { fixture: i.fixture, kind: "reduced-fixed", v: i.v, limitMs: i.limitMs });
    } else if (i.exampleId === "heartbeat") {
      Object.assign(lo, { limitMs: i.limitMs, imAliveRuleBroke: true, build: "buggy" });
      Object.assign(ro, { limitMs: i.limitMs, imAliveRuleBroke: false, build: "fixed" });
    }
    leftScene.update(r.original.edges, r.original.events, lc, lo);
    rightScene.update(r.fixed.edges, r.fixed.events, rc, ro);
    leftSide.classList.toggle("is-frozen", frozen);
    leftHost.classList.toggle("is-broke", frozen);
    leftCard.hidden = !frozen;
    fixState.textContent = fixBadge(i.exampleId, r.fixed.edges, rc);
    fixState.hidden = false;
    if (slow !== null) {
      badgeLine.textContent = fixBadgeText(speedBadge(slow));
      badgeLine.hidden = false;
    }
  }

  const offCursor = playback.onCursor((c, f) => {
    slow = f;
    draw(c);
  });
  const offState = playback.onState(() => draw(playback.cursor()));
  replayBoth.addEventListener("click", () => playback.replay());

  function campaignParagraph(text: string, cls: string): HTMLElement {
    return el("p", { class: cls }, [text]);
  }

  return {
    root,
    begin(next) {
      info = next;
      ready = null;
      slow = null;
      heading.textContent = fixHeading(next.k);
      badgeLine.hidden = true;
      leftScene = makeScene(next.exampleId);
      rightScene = makeScene(next.exampleId);
      setChildren(leftHost, [leftScene.node]);
      setChildren(rightHost, [rightScene.node]);
      leftHost.classList.add("is-dim");
      rightHost.classList.add("is-dim");
      leftCard.hidden = true;
      fixState.hidden = true;
      replayLine.hidden = true;
      replayLine.textContent = "";
      setChildren(campaignBox, []);
      setChildren(changeHost, [createFixChange(next.exampleId, next.hunks)]);
    },
    showCampaignProgress(runsCompleted, tries) {
      setChildren(campaignBox, [campaignParagraph(fixedProgressText(runsCompleted, tries), "fix-progress")]);
    },
    showCampaignDone(verdict, tries, violatingRunIndex, plainBroke) {
      const t = fixedCampaignText(verdict, tries, violatingRunIndex, plainBroke);
      setChildren(campaignBox, [
        campaignParagraph(t.prefix, "fix-campaign-prefix"),
        ...t.lines.map((l) => campaignParagraph(l, "fix-campaign-line")),
      ]);
    },
    showCampaignError(message) {
      setChildren(campaignBox, [el("p", { class: "fix-campaign-error error-text", role: "alert" }, [message])]);
    },
    ready(data) {
      if (info === null) return;
      ready = data;
      rightEnd = rightCursorEnd(info.v, data.fixed.reachedEnd);
      leftHost.classList.remove("is-dim");
      rightHost.classList.remove("is-dim");
      replayLine.textContent = fixReplayText(info.k, data.outcome);
      replayLine.hidden = false;
      playback.load(withTail(data.plan, rightEnd), data.autoPlay);
    },
    dispose() {
      offCursor();
      offState();
    },
  };
}
