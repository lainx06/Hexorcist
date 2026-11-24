// Fix view: the original program and the fixed program side by side on one shared Cursor, across the full
// width of the stage. Each Scene sits in its own bordered card (coral for the original, mint for the fixed
// program) with its title chip at top left and one state badge at bottom left. Under the Scenes, the BROKE
// card and the fixed-program card sit side by side at equal height, then the Player, then the "What the
// fix changed" panel with "Show the code change". One Playback (views/playback.ts)
// drives both Scenes. The plan is the Pacing_Plan of the broke replay plus the 4x tail (pacing.withTail),
// so the right Scene follows the Cursor up to its own end and stops. The one speed pill sits in the
// heading; the Scenes and the Player carry no speed badge of their own here.
// This file draws what it is given. Copy comes from model/stage-copy.ts, cursors and badges from
// model/fix-view.ts. It reads no clock and posts nothing to the Engine_Worker.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture, OutputEvent, Verdict } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import type { DiffHunk } from "../model/diff";
import { codeHunks, fixBadge, fixPanelScroll, leftCursor, rightCursorEnd } from "../model/fix-view";
import type { PacingPlan, Ratio } from "../model/pacing";
import { speedBadge, withTail } from "../model/pacing";
import { FORGOT_LINE } from "../model/scenes";
import type { FixOutcome } from "../model/stage-copy";
import {
  FIX_EXPLAIN,
  FIX_TEXT,
  STAGE_TEXT,
  VERDICT_WORD,
  fixBadgeText,
  fixedCampaignText,
  fixedProgressText,
  fixHeading,
  fixReplayText,
} from "../model/stage-copy";
import { el, prefersReducedMotion, setChildren } from "./dom";
import { createPlayerBar } from "./player-bar";
import type { Playback } from "./playback";
import { createCrosswalkScene } from "./scene-crosswalk";
import { createGarageScene } from "./scene-garage";
import { createHeartbeatScene } from "./scene-heartbeat";

/** Id of the "What the fix changed" panel; "The fix" tab points to it. */
export const FIX_PANEL_ID = "fix-change-panel";
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
  /** The plain BROKE sentence of the example (the main BROKE card's). */
  broke: string;
  /** The cause line of the main BROKE card, or null when it shows none. */
  cause: string | null;
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
  /** Opens the code change in the "What the fix changed" panel, scrolls the panel into view and focuses the code. */
  openCode(): void;
  dispose(): void;
}

interface Scene {
  node: HTMLElement;
  frame: HTMLElement;
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

/**
 * The "What the fix changed" panel: the explanation, then "Show the code change ▾". The code change opens
 * inside the panel. This is the only place the code change shows. `open` is the one open path: the button
 * uses it, and so does "The fix" tab (through FixView.openCode).
 */
export function createFixChange(
  id: ExampleId,
  hunks: readonly DiffHunk[],
): { node: HTMLElement; openCode(): void } {
  const diffId = `${FIX_PANEL_ID}-diff`;
  const diff = diffView(hunks);
  diff.id = diffId;
  diff.hidden = true;
  const show = el("button", { type: "button", class: "secondary fix-show-code", "aria-expanded": "false", "aria-controls": diffId }, [
    FIX_TEXT.showCode,
  ]);
  const node = el("section", { class: "fix-change", id: FIX_PANEL_ID, "aria-labelledby": `${FIX_PANEL_ID}-title` }, [
    el("h3", { class: "fix-change-title", id: `${FIX_PANEL_ID}-title` }, [FIX_TEXT.whatChanged]),
    el("p", { class: "fix-explain" }, [FIX_EXPLAIN[id]]),
    el("div", { class: "fix-change-actions" }, [show]),
    diff,
  ]);
  /** Opens the code change, scrolls the panel into view and moves focus to the opened code change. */
  function openCode(): void {
    diff.hidden = false;
    show.setAttribute("aria-expanded", "true");
    node.scrollIntoView({ block: "center", behavior: fixPanelScroll(prefersReducedMotion()) });
    diff.focus({ preventScroll: true });
  }
  show.addEventListener("click", () => {
    if (diff.hidden) openCode();
    else {
      diff.hidden = true;
      show.setAttribute("aria-expanded", "false");
    }
  });
  return { node, openCode };
}

/**
 * What "The fix" tab shows while the Fix_View is open: the explanation, and a "What the fix changed" button
 * that opens the code change in the Fix_View's panel (`onOpen`, FixView.openCode). The code change itself
 * shows in the panel only.
 */
export function createFixTab(id: ExampleId, onOpen: () => void): HTMLElement {
  const go = el("button", { type: "button", class: "secondary fix-tab-go" }, [FIX_TEXT.whatChanged]);
  go.addEventListener("click", () => onOpen());
  return el("section", { class: "fix-tab", "aria-label": FIX_TEXT.whatChanged }, [el("p", { class: "fix-explain" }, [FIX_EXPLAIN[id]]), go]);
}
export function createFixView(playback: Playback, playerNode?: HTMLElement): FixView {
  const heading = el("h2", { class: "fix-heading" }, [""]);
  // The one speed pill of the Fix_View. It sits in the heading row and is as wide as its text.
  const badgeLine = el("span", { class: "fix-badge-line" }, [""]);
  badgeLine.hidden = true;

  const leftHost = el("div", { class: "scene-card fix-scene fix-scene--original" });
  const rightHost = el("div", { class: "scene-card fix-scene fix-scene--fixed" });
  // The BROKE card is there from the start, dimmed, so nothing jumps when the break arrives. At the break it
  // brightens and its "Stopped at the break." line shows (that line keeps its space before then).
  const leftWord = el("p", { class: "fix-left-word" }, [VERDICT_WORD.broke]);
  const leftHead = el("p", { class: "fix-left-text" }, [""]);
  const leftForgot = el("p", { class: "fix-left-forgot", hidden: true }, [FORGOT_LINE]);
  const leftCause = el("p", { class: "fix-left-cause", hidden: true }, [""]);
  const leftStopped = el("p", { class: "fix-left-stopped" }, [`${STAGE_TEXT.stopped}.`]);
  const leftCard = el("div", { class: "card fix-card fix-card--left is-waiting" }, [leftWord, leftHead, leftForgot, leftCause, leftStopped]);
  const replayLine = el("p", { class: "fix-replay" }, [""]);
  const campaignBox = el("div", { class: "fix-campaign" });
  const rightCard = el("div", { class: "card fix-card fix-card--right", "aria-live": "polite" }, [replayLine, campaignBox]);
  replayLine.hidden = true;

  const leftSide = el("div", { class: "fix-side fix-side--original", role: "group", "aria-label": FIX_TEXT.leftTitle }, [leftHost]);
  const rightSide = el("div", { class: "fix-side fix-side--fixed", role: "group", "aria-label": FIX_TEXT.rightTitle }, [rightHost]);
  const player = playerNode ?? createPlayerBar(playback).root;
  const controls = el("div", { class: "replay-panel fix-controls" }, [player]);
  const changeHost = el("div", { class: "fix-change-host" });
  const root = el("section", { class: "fix-view", "aria-label": "Fix view" }, [
    el("div", { class: "fix-heading-row" }, [heading, badgeLine]),
    el("div", { class: "fix-grid" }, [leftSide, rightSide, leftCard, rightCard]),
    controls,
    changeHost,
  ]);

  let info: FixBegin | null = null;
  let ready: FixReady | null = null;
  let leftScene: Scene | null = null;
  let rightScene: Scene | null = null;
  let rightEnd = 0;
  let slow: Ratio | null = null;
  let change: { node: HTMLElement; openCode(): void } | null = null;

  function draw(c: number): void {
    if (info === null || ready === null || leftScene === null || rightScene === null) return;
    const i = info;
    const r = ready;
    const frozen = c >= i.v;
    const lc = leftCursor(c, i.v);
    const rc = Math.min(c, rightEnd);
    const rightOver = c >= rightEnd && !playback.playing();
    // No per-Scene speed badge: the speed pill in the heading says it for both.
    const lo: Record<string, unknown> = {
      layout: "fix",
      title: FIX_TEXT.leftTitle,
      atBreak: frozen,
      stopped: frozen,
      ended: frozen,
      playing: playback.playing(),
      endCursor: i.v,
      msToEnd: playback.msUntil(i.v),
      epoch: playback.epoch(),
    };
    const ro: Record<string, unknown> = {
      layout: "fix",
      title: FIX_TEXT.rightTitle,
      state: fixBadge(i.exampleId, r.fixed.edges, rc),
      atBreak: false,
      stopped: false,
      ended: rightOver,
      playing: playback.playing(),
      endCursor: rightEnd,
      msToEnd: playback.msUntil(rightEnd),
      epoch: playback.epoch(),
    };
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
    leftCard.classList.toggle("is-waiting", !frozen);
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

  function campaignParagraph(text: string, cls: string): HTMLElement {
    return el("p", { class: cls }, [text]);
  }

  function cardTone(tone: "held" | "broke" | "tell" | null): void {
    rightCard.classList.toggle("fix-card--held", tone === "held");
    rightCard.classList.toggle("fix-card--broke", tone === "broke");
    rightCard.classList.toggle("fix-card--tell", tone === "tell");
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
      leftCard.classList.add("is-waiting");
      leftHead.textContent = next.broke;
      // The I'm-alive line sits under the headline, in this card, not between the scenes and the cards.
      leftForgot.hidden = next.exampleId !== "heartbeat";
      leftCause.textContent = next.cause ?? "";
      leftCause.hidden = next.cause === null;
      // Idle frames with the title chips and the free band at the bottom, before the replay is in.
      const idle = { layout: "fix", atBreak: false, stopped: false };
      leftScene.update([], [], 0, { ...idle, title: FIX_TEXT.leftTitle });
      rightScene.update([], [], 0, { ...idle, title: FIX_TEXT.rightTitle });
      replayLine.hidden = true;
      replayLine.textContent = "";
      cardTone(null);
      setChildren(campaignBox, []);
      change = createFixChange(next.exampleId, next.hunks);
      setChildren(changeHost, [change.node]);
    },
    showCampaignProgress(runsCompleted, tries) {
      setChildren(campaignBox, [campaignParagraph(fixedProgressText(runsCompleted, tries), "fix-progress")]);
    },
    showCampaignDone(verdict, tries, violatingRunIndex, plainBroke) {
      const t = fixedCampaignText(verdict, tries, violatingRunIndex, plainBroke);
      cardTone(verdict.verdict === "HELD" ? "held" : verdict.verdict === "BROKE" ? "broke" : "tell");
      // (claude) The verdict word as a headline, like BROKE on the left card; the prefix keeps the rest.
      const sep = t.prefix.indexOf(" \u00b7 ");
      const word = sep > 0 ? t.prefix.slice(0, sep) : null;
      const rest = sep > 0 ? t.prefix.slice(sep + 3) : t.prefix;
      setChildren(campaignBox, [
        ...(word === null ? [] : [campaignParagraph(word, "fix-right-word")]),
        campaignParagraph(rest.charAt(0).toUpperCase() + rest.slice(1), "fix-campaign-prefix"),
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
    openCode() {
      change?.openCode();
    },
    dispose() {
      offCursor();
      offState();
    },
  };
}