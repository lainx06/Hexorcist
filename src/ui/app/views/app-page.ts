// App controller: setup, stage, tabs, and the job sequence behind them. One job at a time.
//
// Phase flow (model/stage.ts):
//   idle -> running -> shrinking -> broke -> fix        (buggy Campaign BROKE)
//                   -> held | couldnt-tell              (no reduction, no fix button)
//                   held: the replay of one try where the rule held, played once, paced, no break marker
//                   shrinking -> reduce-error           (reducer failed)
// Job order after BROKE: reduce, then the reduced replay and its Display_Replay, then the original
// replay and its Display_Replay. "See the fix work" runs the reduced replay on the fixed build, its
// Display_Replay (violationCycle = the buggy break cycle), then the Fixed_Campaign.
// Every Display_Replay is its own worker job, so each one starts on a fresh EmulatorBridge.
// Nothing the UI clock, the Slow_Factor or the speed slider produce is put in a worker message.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import { isEngineError } from "../../../engine/errors";
import { buildEventList } from "../../../engine/event-list";
import { failureStory } from "../../../engine/reducer/story";
import type { ReducerEvent, ReducerResult } from "../../../engine/reducer/types";
import type { RuleSet } from "../../../engine/rules/ir";
import type { BuildLabel } from "../model/verdict-text";
import { EXAMPLE_IDS, loadExample } from "../data/examples";
import type { ExampleBundle, ExampleId, LoadedExample } from "../data/examples";
import { diffHunks } from "../model/diff";
import { displayAgrees, displaySpan, displayWindowEnd } from "../model/display";
import { CUSTOM_COPY, copyFor, isCustomRuleSet, spanSentenceFor, storyEndingFor } from "../model/example-copy";
import type { FlowState } from "../model/flow";
import { chooseHeldRun, heldPlan } from "../model/held-replay";
import { canApplyFix, canReplayAgain, canTryRemoving, canUnleash, initialFlow } from "../model/flow";
import { fixedDisplayAgrees } from "../model/fix-view";
import { fixedReplayText, tryRemovingText, withoutEvent } from "../model/fix-text";
import { inputValueText, ms } from "../model/format";
import { PICKER_TEXT, defaultSelection } from "../model/gremlin-picker";
import { buildPlan } from "../model/pacing";
import type { PacingPlan } from "../model/pacing";
import { plainStory } from "../model/plain-story";
import { limitMsOf, presetFor, presetHeadline, presetRuleText } from "../model/presets";
import { checkRuleBox, sentencePatterns } from "../model/rule-box";
import type { RuleError } from "../model/rule-box";
import { ruleBySentence } from "../model/rules";
import { spanFor } from "../model/span";
import type { Span } from "../model/span";
import { stageFlags } from "../model/stage";
import type { StagePhase } from "../model/stage";
import { STAGE_TEXT, causeLine, cyclesRateText, heldTryLabel, reductionCard } from "../model/stage-copy";
import type { FixOutcome, ReductionInput } from "../model/stage-copy";
import { exampleStoryInput } from "../model/story-input";
import { eventValue, windowEnd } from "../model/timeline";
import { announcement, findingText } from "../model/verdict-text";
import type { CampaignDoneMsg, ReplayDoneMsg } from "../worker/messages";
import { el, prefersReducedMotion, setChildren } from "./dom";
import type { FixView } from "./fix-view";
import { createFixView } from "./fix-view";
import { createHero } from "./hero";
import { createLiveRegion } from "./live";
import { controls, UI_COPY } from "./panels";
import { createPlayback } from "./playback";
import { createSetup } from "./setup";
import { createStage } from "./stage";
import { createTabs, REPLAY_AGAIN } from "./tabs";
import type { ReplayView, RunLabel } from "./timeline";
import { createTimeline } from "./timeline";
import type { StageCardInput, StoryState } from "./verdict-card";
import { stageVerdictCard, violatedRule } from "./verdict-card";
import type { JobOutcome } from "./worker-client";
import { createEngineClient } from "./worker-client";

/** The Shrink_View collapse lasts this long (UI milliseconds); the replay auto-plays after it. */
const COLLAPSE_MS = 400;

const REDUCED_NO_BREAK = "The reduced replay did not reach the break.";

interface CampaignRecord {
  build: BuildLabel;
  hex: string;
  runs: number;
  seed: number;
  done: CampaignDoneMsg | null;
  /** UI_Clock milliseconds from the Campaign request to its `campaign-done` message (Elapsed_Seconds). */
  elapsedMs: number;
}

/** What the running Campaign and every job after it use; a snapshot taken when a run starts. */
interface RunContext {
  example: ExampleBundle;
  ruleSet: RuleSet;
  /** Canonical_Sentence of each rule of the rule set. */
  sentences: string[];
  custom: boolean;
  gremlinSet: GremlinSpec[];
  /** The time limit of the rule set in whole ms (garage, I'm-alive light); null for the crosswalk. */
  limitMs: number | null;
}

interface ReplayResult {
  replay: ReplayDoneMsg;
  display: ReplayDoneMsg | null;
}

/** Plain_Story and Exact_Story of the Reduced_List. */
interface CardStory {
  plain: string;
  exact: string | null;
}

/** What the Stage and the Fix_View share about the broke replay. */
interface ShownBroke {
  edges: ReplayDoneMsg["outputEdges"];
  v: number;
  plan: PacingPlan;
}

const PATTERN_LABELS: Readonly<Record<string, string>> = {
  never: "Must never happen",
  notLongerThan: "Must never last too long",
  respond: "Must answer in time",
  count: "At most so many times",
  hold: "Must stay true for a while",
};

function outcomeError(o: JobOutcome): string | null {
  switch (o.kind) {
    case "done":
      return null;
    case "job-error":
      return `${o.error.kind}: ${o.error.message}`;
    case "codec-error":
      return `Message from the engine worker could not be read: ${o.error.path}: ${o.error.message}`;
    case "worker-stopped":
      return `The engine worker stopped: ${o.message}`;
  }
}

/** Defaults in meta.json order, then manually added gremlins in catalogue order. */
function orderedSelection(ids: readonly string[], example: ExampleBundle): GremlinSpec[] {
  const base = example.meta.gremlinSet.filter((g) => ids.includes(g.id));
  const added = GREMLIN_CATALOGUE.filter((d) => ids.includes(d.id) && !base.some((b) => b.id === d.id)).map((d) => ({ id: d.id }));
  return [...base, ...added];
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountApp(root: HTMLElement): void {
  const live = createLiveRegion();
  const errors = el("div", { class: "errors" }, []);
  const showError = (text: string) => errors.appendChild(el("p", { class: "error-text" }, [text]));
  const client = createEngineClient();
  const playback = createPlayback();

  // Example state.
  let currentId: ExampleId = EXAMPLE_IDS[0];
  let loadedOk = false;
  let current: ExampleBundle | null = null;
  let activeRuleSet: RuleSet = [];
  let activeSentences: string[] = [];
  let ruleErrors: RuleError[] = [];
  let selectedIds: string[] = [];

  // Run state.
  let flow: FlowState = initialFlow(false);
  let phase: StagePhase = "idle";
  let hasReplay = false;
  /** True from the press of "Unleash gremlins" (or "See the fix work") to the end of its last job. */
  let working = false;
  let setupCollapsed = false;
  let ctx: RunContext | null = null;
  let buggy: CampaignRecord | null = null;
  let fixed: CampaignRecord | null = null;
  let reduction: ReducerResult | null = null;
  let cardStory: CardStory | null = null;
  let original: ReplayView | null = null;
  let reduced: ReplayView | null = null;
  let fixedView: ReplayView | null = null;
  let shownBroke: ShownBroke | null = null;
  let targetRule: string | null = null;
  let previousFingerprint: string | null = null;
  let shown: RunLabel = "Original run";
  let fixView: FixView | null = null;
  let cardInput: StageCardInput | null = null;
  let cardShown = false;
  let reductionInput: ReductionInput | null = null;
  const removeButtons: HTMLButtonElement[] = [];

  const ctl = controls(24, 0);
  const timeline = createTimeline();
  // The Signals tab shares the stage cursor: its scrubber moves the stage Playback, and the Playback
  // moves the waveform cursor while the stage plays.
  timeline.onSeek((cycle) => playback.seek(cycle));
  playback.onCursor((cycle) => {
    const p = playback.plan();
    timeline.setCursor(cycle, p === null ? null : { min: p.start, max: p.end });
  });
  const tabs = createTabs(timeline);
  tabs.setFields(ctl.node);
  const heroView = createHero();
  const setup = createSetup({
    onDevice: (id) => selectExample(id),
    onToggleGremlin: (id) => toggleGremlin(id),
    onRuleText: (t) => applyRuleText(t),
    onUnleash: () => void unleash(),
    onExpandChange: () => paintPrimary(),
  });
  const stage = createStage(playback, currentId);
  stage.aside.onSeeFix(() => void seeFix());

  const lockedNow = (): boolean => flow.busy !== null || working;

  const canSeeFix = (): boolean =>
    buggy !== null &&
    buggy.done !== null &&
    buggy.done.result.verdict.verdict === "BROKE" &&
    reduction !== null &&
    reduced !== null &&
    shownBroke !== null &&
    canApplyFix(flow) &&
    !working;

  /** "See the fix work →" shows only for the broke phase, and never while the setup is re-expanded. */
  const paintPrimary = (): void => {
    const btn = stage.aside.fixButton();
    const show = stageFlags(phase, hasReplay).primary === "fix" && !setup.expanded();
    if (btn !== null) {
      btn.hidden = !show;
      btn.disabled = !canSeeFix();
    }
    stage.aside.actions.hidden = btn === null || !show;
  };

  const refresh = (): void => {
    const vals = ctl.values();
    flow = { ...flow, dataOk: loadedOk, runsOk: vals.runsOk, seedOk: vals.seedOk };
    const unleashOff = !(canUnleash(flow) && !working && ruleErrors.length === 0 && selectedIds.length > 0);
    setup.setUnleashEnabled(!unleashOff);
    setup.setTries(vals.runsOk ? vals.runs : null, current === null ? 0 : current.meta.runCycles);
    tabs.setReplayAgainEnabled(canReplayAgain(flow) && !working);
    const removable = canTryRemoving(flow) && !working;
    for (const b of removeButtons) b.disabled = !removable;
    paintPrimary();
  };
  ctl.onFieldChange(refresh);

  const paintLocks = (): void => {
    const locked = lockedNow() || !loadedOk;
    setup.setBusy(lockedNow());
    setup.rules.setBusy(locked);
    setup.gremlins.setBusy(locked);
  };

  const setBusy = (busy: FlowState["busy"]): void => {
    flow = { ...flow, busy };
    paintLocks();
    refresh();
  };

  const setWorking = (on: boolean): void => {
    working = on;
    paintLocks();
    refresh();
  };

  const gremlinNames = (): string[] =>
    ctx === null ? [] : ctx.gremlinSet.map((g) => PICKER_TEXT[g.id]?.name ?? g.id);

  /** Applies a phase: the hero and the setup follow it (the setup is re-collapsed only when the phase asks). */
  const setPhase = (p: StagePhase): void => {
    phase = p;
    const f = stageFlags(p, hasReplay);
    heroView.setCollapsed(!f.hero);
    const collapse = !f.setupExpanded;
    if (collapse !== setupCollapsed) {
      setupCollapsed = collapse;
      setup.setCollapsed(collapse, collapse ? gremlinNames() : []);
    }
    paintPrimary();
  };

  const renderAside = (): void => {
    let card: HTMLElement | null = null;
    if (cardInput !== null) {
      card = stageVerdictCard(cardInput);
      // A card that is rebuilt with more text (story, cause line) must not fade in a second time.
      if (cardShown) card.style.animation = "none";
      cardShown = true;
    } else cardShown = false;
    stage.aside.render({ card, reduction: reductionInput, fixBusy: !canSeeFix() });
    paintPrimary();
  };

  const paintToggle = (): void => timeline.setToggle(shown, reduced !== null, fixedView !== null);

  timeline.onToggle((label) => {
    const view = label === "Original run" ? original : label === "Reduced replay" ? reduced : label === "Fixed program" ? fixedView : null;
    if (view === null) return;
    shown = label;
    paintToggle();
    timeline.show(view);
  });

  /** The view of a Replay; with a Display_Replay that agrees (`d` not null) it uses the display edges, span and window. */
  const viewOf = (label: RunLabel, events: ReducerEvent[], r: ReplayDoneMsg, d: ReplayDoneMsg | null): ReplayView => {
    const c = ctx as RunContext;
    const v = r.violation;
    const src = d ?? r;
    let span: Span | null = null;
    let end = src.reachedEnd;
    if (v !== null) {
      const found = ruleBySentence(c.ruleSet, v.rule);
      if (found !== null) span = d !== null ? displaySpan(found.rule, v.cycle, d) : spanFor(found.rule, v.cycle, r.outputEdges, r.reachedEnd);
      end = d !== null ? displayWindowEnd(span, v.cycle, d.reachedEnd) : windowEnd(v.cycle, r.reachedEnd);
    }
    return { label, events, outputEdges: src.outputEdges, violation: v, reachedEnd: src.reachedEnd, windowEnd: end, span };
  };

  const replayJob = async (hex: string, events: ReducerEvent[]): Promise<ReplayDoneMsg | string> => {
    const c = ctx as RunContext;
    const o = await client.run({
      kind: "replay",
      hex,
      fixture: c.example.fixture,
      ruleSet: c.ruleSet,
      events,
      runCycles: c.example.meta.runCycles,
    });
    const err = outcomeError(o);
    return err !== null ? err : (o as { message: ReplayDoneMsg }).message;
  };

  const displayJob = async (hex: string, events: ReducerEvent[], violationCycle: number): Promise<ReplayDoneMsg | string> => {
    const c = ctx as RunContext;
    const o = await client.runDisplay({ hex, fixture: c.example.fixture, ruleSet: c.ruleSet, events, violationCycle });
    const err = outcomeError(o);
    return err !== null ? err : (o as { message: ReplayDoneMsg }).message;
  };

  /** One Replay, then, when it has a violation, one Display_Replay of the same list on a fresh bridge. */
  const doReplay = async (hex: string, events: ReducerEvent[]): Promise<ReplayResult | string> => {
    setBusy("replay");
    try {
      const replay = await replayJob(hex, events);
      if (typeof replay === "string") return replay;
      if (replay.violation === null) return { replay, display: null };
      const display = await displayJob(hex, events, replay.violation.cycle);
      if (typeof display === "string") {
        showError(display);
        return { replay, display: null };
      }
      return { replay, display: displayAgrees(replay, display) ? display : null };
    } finally {
      setBusy(null);
    }
  };

  /** The reduced replay on the fixed build and its Display_Replay, whose violationCycle is the buggy break cycle. */
  const doFixedReplay = async (hex: string, events: ReducerEvent[], v: number): Promise<ReplayResult | string> => {
    setBusy("replay");
    try {
      const replay = await replayJob(hex, events);
      if (typeof replay === "string") return replay;
      const display = await displayJob(hex, events, v);
      if (typeof display === "string") {
        showError(display);
        return { replay, display: null };
      }
      return { replay, display: fixedDisplayAgrees(replay, display) ? display : null };
    } finally {
      setBusy(null);
    }
  };

  /** Plain_Story and Exact_Story of the Reduced_List, from the shown reduced view. */
  const buildCardStory = (res: ReducerResult, view: ReplayView): CardStory | null => {
    const c = ctx as RunContext;
    const v = view.violation;
    if (v === null) return null;
    const exact = failureStory(
      exampleStoryInput({
        reducedList: res.reducedList,
        fixture: c.example.fixture,
        violation: v,
        outputEdges: view.outputEdges,
        span: view.span,
      }),
    );
    const plain = plainStory({
      reducedList: res.reducedList,
      fixture: c.example.fixture,
      v: v.cycle,
      storyEnding: storyEndingFor(v.rule),
      spanSentence: spanSentenceFor(c.example.id, c.custom),
      ...(view.span !== null ? { span: { lengthCycles: view.span.lengthCycles, cut: view.span.cut } } : {}),
    });
    return { plain, exact: typeof exact === "string" ? exact : null };
  };

  const runCampaign = async (
    rec: CampaignRecord,
    onProgress: (runsCompleted: number) => void,
    onError: (message: string) => void,
  ): Promise<CampaignDoneMsg | null> => {
    const c = ctx as RunContext;
    live.announce(`${rec.build}: campaign of ${String(rec.runs)} ${rec.runs === 1 ? "try" : "tries"} started.`);
    setBusy("campaign");
    const t0 = performance.now();
    const o = await client.run(
      {
        kind: "campaign",
        hex: rec.hex,
        fixture: c.example.fixture,
        ruleSet: c.ruleSet,
        gremlinSet: c.gremlinSet,
        campaignSeed: rec.seed,
        runs: rec.runs,
        runCycles: c.example.meta.runCycles,
        measure: false,
      },
      (m) => {
        if (m.kind === "campaign-progress") onProgress(m.runsCompleted);
      },
    );
    rec.elapsedMs = Math.round(performance.now() - t0);
    setBusy(null);
    const err = outcomeError(o);
    if (err !== null) {
      onError(err);
      return null;
    }
    const done = (o as { message: CampaignDoneMsg }).message;
    rec.done = done;
    const v = done.result.verdict;
    live.announce(announcement(rec.build, v, findingText(v, violatedRule(c.ruleSet, v))));
    return done;
  };

  const renderTryRemoving = (list: ReducerEvent[], target: string): void => {
    const c = ctx as RunContext;
    removeButtons.length = 0;
    const rows = list.map((e, i) => {
      const result = el("span", { class: "try-result meta" }, [""]);
      const cells: (HTMLElement | string)[] = [
        el("span", { class: "mono" }, [`${ms(e.cycle)} \u00b7 ${e.signal} = ${inputValueText(eventValue(e))}`]),
      ];
      if (e.gremlinId === "rest") {
        cells.push(el("span", { class: "meta" }, ["rest state"]));
      } else {
        const b = el("button", { type: "button", class: "secondary" }, ["Try removing"]);
        removeButtons.push(b);
        b.addEventListener("click", () => {
          void (async () => {
            const without = withoutEvent(list, i);
            const r = await doReplay(c.example.buggyHex, without);
            if (typeof r === "string") {
              result.textContent = r;
              result.classList.add("error-text");
              return;
            }
            result.classList.remove("error-text");
            result.textContent = tryRemovingText(target, r.replay.violation);
            shown = UI_COPY.trialRun;
            paintToggle();
            timeline.show(viewOf(UI_COPY.trialRun, without, r.replay, r.display));
          })();
        });
        cells.push(b);
      }
      cells.push(result);
      return el("li", { class: "try-row" }, cells);
    });
    tabs.setTryRemoving(
      el("section", { class: "try-removing", "aria-labelledby": "try-title" }, [
        el("h3", { class: "region-title", id: "try-title" }, [UI_COPY.plainTryHeading]),
        el("ul", { class: "try-list" }, rows),
      ]),
    );
    refresh();
  };

  const replayAgain = async (): Promise<void> => {
    if (reduction === null || ctx === null) return;
    const out = tabs.replayAgain.out;
    const r = await doReplay(ctx.example.buggyHex, reduction.reducedList);
    if (typeof r === "string") {
      out.textContent = r;
      return;
    }
    const same = previousFingerprint !== null && r.replay.fingerprint === previousFingerprint;
    out.textContent = REPLAY_AGAIN.line(r.replay.fingerprint, same);
    previousFingerprint = r.replay.fingerprint;
    reduced = viewOf("Reduced replay", reduction.reducedList, r.replay, r.display);
    if (shown === "Reduced replay") timeline.show(reduced);
  };
  tabs.replayAgain.button.addEventListener("click", () => void replayAgain());

  /** Closes the Fix_View: the one Player goes back under the Move_Strip. */
  const leaveFix = (): void => {
    if (fixView === null) return;
    fixView.dispose();
    fixView = null;
    stage.setFixMode(false);
  };

  /** Clears verdicts, the reduction, stories, replays, the Scene and the Timeline. */
  const clearOutputs = (): void => {
    setChildren(errors, []);
    playback.pause();
    buggy = null;
    fixed = null;
    reduction = null;
    cardStory = null;
    original = null;
    reduced = null;
    fixedView = null;
    shownBroke = null;
    targetRule = null;
    previousFingerprint = null;
    cardInput = null;
    reductionInput = null;
    hasReplay = false;
    flow = { ...flow, reduction: "none", reducedReplayOk: false, fix: "hidden" };
    removeButtons.length = 0;
    tabs.setReplay(null);
    tabs.setPending(false);
    tabs.setFixChange(null);
    tabs.setTryRemoving(null);
    tabs.setCyclesRate(null);
    tabs.replayAgain.out.textContent = "";
    shown = "Original run";
    timeline.setRunNote(null);
    timeline.show(null);
    paintToggle();
    renderAside();
  };

  /** The stage goes back to idle (Requirement 3.1) and the setup opens. */
  const resetToIdle = (): void => {
    if (phase === "idle" && buggy === null) return;
    leaveFix();
    clearOutputs();
    ctx = null;
    setPhase("idle");
    stage.showIdle();
    refresh();
  };

  const brokeCard = (fingerprint: string | null, story: StoryState): StageCardInput => {
    const c = ctx as RunContext;
    const rec = buggy as CampaignRecord;
    const v = (rec.done as CampaignDoneMsg).result.verdict;
    return {
      kind: "BROKE",
      exampleId: c.example.id,
      plainBroke: copyFor(c.example.id, c.custom).broke,
      violatingRunIndex: (rec.done as CampaignDoneMsg).result.violatingRunIndex ?? (v.verdict === "BROKE" ? v.trace.runIndex : 0),
      tries: rec.runs,
      elapsedMs: rec.elapsedMs,
      fingerprint,
      story,
    };
  };

  /** After a BROKE verdict: reduce, then the reduced replay, then the original replay. */
  const brokeFlow = async (c: RunContext): Promise<void> => {
    const rec = buggy as CampaignRecord;
    const verdict = (rec.done as CampaignDoneMsg).result.verdict;
    if (verdict.verdict !== "BROKE") return;
    const example = c.example;
    const originalList = verdict.trace.eventList;
    targetRule = verdict.trace.violation.rule;

    // The BROKE card and the Shrink_View appear in the same step, before any reduce-progress message.
    cardInput = brokeCard(null, { kind: "pending" });
    // The tabs say "Working out what happened…" too, until the replay is ready.
    tabs.setPending(true);
    setPhase("shrinking");
    let faded: ReadonlySet<number> = new Set<number>();
    stage.showShrinking(originalList, null, faded);
    renderAside();

    flow = { ...flow, reduction: "running" };
    setBusy("reduce");
    const o = await client.run(
      {
        kind: "reduce",
        hex: example.buggyHex,
        fixture: example.fixture,
        ruleSet: c.ruleSet,
        originalList,
        violation: verdict.trace.violation,
        runCycles: example.meta.runCycles,
        measure: false,
      },
      (m) => {
        if (m.kind !== "reduce-progress") return;
        faded = stage.reduceProgress(originalList, m.candidatesTried, m.bestList, faded);
      },
    );
    setBusy(null);
    const err = outcomeError(o);
    if (err !== null) {
      flow = { ...flow, reduction: "error" };
      tabs.setPending(false);
      setPhase("reduce-error");
      stage.showReduceError();
      cardInput = brokeCard(null, { kind: "none" });
      reductionInput = { ok: false, message: err };
      renderAside();
      showError(`Reduction error: ${err}`);
      live.announce(`Reduction error: ${err}`);
      return;
    }
    const res = (o as { message: { kind: "reduce-done"; result: ReducerResult } }).message.result;
    reduction = res;
    flow = { ...flow, reduction: "result", fix: "available" };

    // Collapse the dots (400 ms), show the Reduction_Card and the fix button.
    stage.showShrinking(originalList, res.candidatesTried, faded, res.reducedList);
    const collapsedAt = performance.now();
    setPhase("broke");
    reductionInput = {
      ok: true,
      originalEventCount: res.originalEventCount,
      reducedEventCount: res.reducedEventCount,
      stoppedAtBudget: res.stoppedAtBudget,
    };
    cardInput = brokeCard(null, { kind: "pending" });
    renderAside();
    timeline.setRunNote({
      original: originalList.filter((e) => e.gremlinId !== "rest").length,
      reduced: res.reducedList.filter((e) => e.gremlinId !== "rest").length,
    });
    const card = reductionCard(reductionInput);
    if (!("error" in card)) live.announce(`${card.summary} ${card.smallest}`);

    // Reduced replay and its Display_Replay on the buggy build.
    const red = await doReplay(example.buggyHex, res.reducedList);
    const rv = typeof red === "string" ? null : red.replay.violation;
    if (typeof red === "string" || rv === null) {
      showError(typeof red === "string" ? red : REDUCED_NO_BREAK);
      tabs.setPending(false);
      stage.showReduceError();
      cardInput = brokeCard(null, { kind: "none" });
      renderAside();
      return;
    }
    const view = viewOf("Reduced replay", res.reducedList, red.replay, red.display);
    reduced = view;
    previousFingerprint = red.replay.fingerprint;
    flow = { ...flow, reducedReplayOk: true };
    cardStory = buildCardStory(res, view);
    cardInput = brokeCard(
      red.replay.fingerprint,
      cardStory === null ? { kind: "none" } : { kind: "ready", text: cardStory.plain },
    );
    hasReplay = true;
    tabs.setPending(false);
    tabs.setReplay({
      story: cardStory === null ? null : cardStory.plain,
      list: res.reducedList,
      fixture: example.fixture,
      exactStory: cardStory === null ? null : cardStory.exact,
      canonical: c.sentences,
    });
    shown = "Reduced replay";
    paintToggle();
    timeline.show(view);
    renderAside();
    renderTryRemoving(res.reducedList, verdict.trace.violation.rule);

    // The collapse finishes before the auto-play starts.
    if (!prefersReducedMotion()) {
      const wait = COLLAPSE_MS - (performance.now() - collapsedAt);
      if (wait > 0) await sleep(wait);
    }
    const cycles = res.reducedList.filter((e) => e.gremlinId !== "rest").map((e) => e.cycle);
    const plan = buildPlan(cycles, rv.cycle);
    const edges = (red.display ?? red.replay).outputEdges;
    shownBroke = { edges, v: rv.cycle, plan };
    stage.showBroke({
      edges,
      events: res.reducedList,
      fixture: example.fixture,
      start: plan.start,
      v: rv.cycle,
      ...(c.limitMs === null ? {} : { limitMs: c.limitMs }),
      imAliveRuleBroke: true,
    });
    // Under Reduced_Motion the Playback shows the frame at v and does not play.
    playback.load(plan, true);
    renderAside();

    // The original replay, for the Signals tab.
    const orig = await doReplay(example.buggyHex, originalList);
    if (typeof orig === "string") showError(orig);
    else {
      original = viewOf("Original run", originalList, orig.replay, orig.display);
      paintToggle();
    }
  };

  /**
   * After a HELD verdict on the buggy build: replay one try where the rule held, once, paced. The campaign
   * result holds counts of triggers per rule but not the run indexes, so the try is run 0 (chooseHeldRun).
   * The event list of that run is rebuilt from the campaign seed, as the engine does for every run.
   */
  const heldFlow = async (c: RunContext, rec: CampaignRecord, tries: number): Promise<void> => {
    const example = c.example;
    const choice = chooseHeldRun(undefined);
    const gen = buildEventList({
      fixture: example.fixture,
      gremlinSet: c.gremlinSet,
      runCycles: example.meta.runCycles,
      campaignSeed: rec.seed,
      runIndex: choice.runIndex,
    });
    if (isEngineError(gen)) {
      showError(`${gen.kind}: ${gen.message}`);
      stage.showNote(STAGE_TEXT.heldFailed, true);
      return;
    }
    const events = gen.events;
    const r = await doReplay(example.buggyHex, events);
    if (typeof r === "string" || r.replay.violation !== null) {
      showError(typeof r === "string" ? r : "The replay of this try broke the rule, which the campaign did not see.");
      stage.showNote(STAGE_TEXT.heldFailed, true);
      return;
    }
    const plan = heldPlan(events, r.replay.reachedEnd);
    stage.showHeld(
      {
        edges: r.replay.outputEdges,
        events,
        fixture: example.fixture,
        start: plan.start,
        // No break: the Cursor never reaches v, so there is no break marker and no "Stopped at the break".
        v: Number.POSITIVE_INFINITY,
        ...(c.limitMs === null ? {} : { limitMs: c.limitMs }),
        imAliveRuleBroke: false,
        kind: "original-buggy",
      },
      heldTryLabel(choice.runIndex, tries),
    );
    // Auto-plays once; under Reduced_Motion it does not play.
    playback.load(plan, !prefersReducedMotion());
  };
  const unleash = async (): Promise<void> => {
    const vals = ctl.values();
    if (flow.busy !== null || working) return;
    if (current === null || !loadedOk || !vals.runsOk || !vals.seedOk || ruleErrors.length > 0 || selectedIds.length === 0) return;
    if (setup.limitInvalid()) return;
    const example = current;
    leaveFix();
    clearOutputs();
    ctx = {
      example,
      ruleSet: activeRuleSet,
      sentences: [...activeSentences],
      custom: isCustomRuleSet(activeSentences, example.sentences),
      gremlinSet: orderedSelection(selectedIds, example),
      limitMs: limitMsOf(example.id, activeRuleSet),
    };
    const c = ctx;
    setWorking(true);
    try {
      setPhase("running");
      stage.showRunning(null, vals.runs);
      const rec: CampaignRecord = { build: "Buggy build", hex: example.buggyHex, runs: vals.runs, seed: vals.seed, done: null, elapsedMs: 0 };
      buggy = rec;
      const done = await runCampaign(rec, (n) => stage.showRunning(n, rec.runs), showError);
      if (done === null) {
        setPhase("idle");
        stage.showIdle();
        return;
      }
      tabs.setCyclesRate(cyclesRateText(done.result.totalCycles, rec.elapsedMs));
      const v = done.result.verdict;
      if (v.verdict === "HELD") {
        cardInput = { kind: "HELD", text: v.text, tries: v.runs };
        setPhase("held");
        stage.showNote(STAGE_TEXT.heldPending, false);
        renderAside();
        await heldFlow(c, rec, v.runs);
      } else if (v.verdict === "COULDN'T TELL") {
        const uses = done.result.peripheralUses;
        cardInput = { kind: "COULDN'T TELL", reason: v.reason, ...(uses === undefined ? {} : { peripheralUses: uses }) };
        setPhase("couldnt-tell");
        stage.showNote(STAGE_TEXT.couldntTell, true);
        renderAside();
      } else {
        await brokeFlow(c);
      }
    } finally {
      setWorking(false);
      renderAside();
    }
  };

  const seeFix = async (): Promise<void> => {
    if (!canSeeFix()) return;
    const c = ctx as RunContext;
    const b = buggy as CampaignRecord;
    const res = reduction as ReducerResult;
    const sb = shownBroke as ShownBroke;
    const target = targetRule as string;
    setWorking(true);
    try {
      flow = { ...flow, fix: "used" };
      setPhase("fix");
      const hunks = diffHunks(c.example.buggySketch, c.example.fixedSketch);
      const fv = createFixView(playback, stage.playerNode);
      fixView = fv;
      stage.setFixMode(true, fv.root);
      fv.begin({
        exampleId: c.example.id,
        fixture: c.example.fixture,
        k: res.reducedEventCount,
        v: sb.v,
        ...(c.limitMs === null ? {} : { limitMs: c.limitMs }),
        hunks,
        broke: copyFor(c.example.id, c.custom).broke,
        cause: causeLine(c.example.id, previousFingerprint),
      });
      tabs.setFixChange(c.example.id, () => fv.openCode());
      renderAside();

      const fr = await doFixedReplay(c.example.fixedHex, res.reducedList, sb.v);
      if (typeof fr === "string") showError(fr);
      else {
        const src = fr.display ?? fr.replay;
        fixedView = viewOf("Fixed program", res.reducedList, fr.replay, fr.display);
        paintToggle();
        const outcome: FixOutcome = fr.replay.violation === null ? "none" : fr.replay.violation.rule === target ? "target" : "other";
        fv.ready({
          plan: sb.plan,
          original: { edges: sb.edges, events: res.reducedList },
          fixed: { edges: src.outputEdges, events: res.reducedList, reachedEnd: src.reachedEnd },
          outcome,
          autoPlay: true,
        });
        live.announce(fixedReplayText(target, fr.replay.violation));
      }

      const rec: CampaignRecord = { build: "Fixed build", hex: c.example.fixedHex, runs: b.runs, seed: b.seed, done: null, elapsedMs: 0 };
      fixed = rec;
      fv.showCampaignProgress(null, rec.runs);
      const done = await runCampaign(rec, (n) => fv.showCampaignProgress(n, rec.runs), (m) => fv.showCampaignError(m));
      if (done === null) fixed = null;
      else {
        const v = done.result.verdict;
        fv.showCampaignDone(v, rec.runs, done.result.violatingRunIndex, copyFor(c.example.id, c.custom).broke);
      }
    } finally {
      setWorking(false);
      renderAside();
    }
  };

  // Rule_Box: check before the next render; the Active_Rule_Set changes only when the check passes.
  /** The Rule_Headline of the active rule set: the preset text with its limit, or "Custom rule". */
  /** True when the rule text differs from the example's and is not just a preset number change. */
  const ruleIsCustom = (ex: ExampleBundle): boolean => {
    const limit = limitMsOf(ex.id, activeRuleSet);
    if (limit === null) return isCustomRuleSet(activeSentences, ex.sentences);
    const def = presetFor(ex.id).limitDefault;
    const expected = limit === def ? ex.sentences : presetRuleText(ex, limit).split("\n").filter((s) => s !== "");
    return isCustomRuleSet(activeSentences, expected);
  };
  const headlineFor = (ex: ExampleBundle): string => {
    const limit = limitMsOf(ex.id, activeRuleSet);
    if (limit === null) return copyFor(ex.id, ruleIsCustom(ex)).headline;
    return ruleIsCustom(ex) ? CUSTOM_COPY.headline : presetHeadline(ex.id, limit);
  };
  const paintRule = (): void => {
    if (current === null) return;
    setup.setHeadline(headlineFor(current));
    setup.setCustomRule(ruleIsCustom(current), activeSentences);
    setup.rules.setSentences(activeSentences);
    setup.rules.setErrors(ruleErrors);
  };
  const applyRuleText = (text: string): void => {
    if (current === null) return;
    const r = checkRuleBox(text, current.fixture);
    if (r.ok) {
      const changed = !sameList(activeSentences, r.sentences);
      activeRuleSet = r.ruleSet;
      activeSentences = r.sentences;
      ruleErrors = [];
      if (changed) resetToIdle();
    } else {
      ruleErrors = r.errors;
    }
    paintRule();
    refresh();
  };

  const toggleGremlin = (id: string): void => {
    if (lockedNow() || !loadedOk) return;
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id];
    setup.gremlins.setSelected(selectedIds);
    resetToIdle();
    refresh();
  };

  // Example selection: ignored while busy and for the Current_Example.
  const applyExample = (id: ExampleId, loaded: LoadedExample): void => {
    currentId = id;
    leaveFix();
    clearOutputs();
    ctx = null;
    stage.setExample(id);
    setup.setSelectedDevice(id);
    setPhase("idle");
    stage.showIdle();
    if (!loaded.ok) {
      loadedOk = false;
      current = null;
      setup.setExample(null);
      setup.setProblems(loaded.problems);
      setup.setHeadline("");
      setup.rules.setSentences([]);
      setup.rules.setText("");
      setup.rules.setErrors([]);
      setup.rules.setPatterns([]);
      selectedIds = [];
      setup.gremlins.setSelected([]);
      paintLocks();
      refresh();
      return;
    }
    const ex = loaded.example;
    loadedOk = true;
    current = ex;
    setup.setProblems([]);
    setup.setExample(ex);
    activeRuleSet = ex.ruleSet;
    activeSentences = [...ex.sentences];
    ruleErrors = [];
    setup.rules.setText(ex.rulesText);
    setup.rules.setPatterns(
      sentencePatterns(ex.fixture).map((p) => ({ label: PATTERN_LABELS[p.form] ?? p.form, sentence: p.sentence })),
    );
    paintRule();
    selectedIds = defaultSelection(ex.meta.gremlinSet, ex.fixture).map((g) => g.id);
    setup.gremlins.setFixture(ex.fixture, selectedIds);
    ctl.setValues(ex.meta.runs, ex.meta.campaignSeed);
    timeline.setFixture(ex.fixture);
    paintLocks();
    refresh();
  };
  const selectExample = (id: ExampleId): void => {
    if (lockedNow() || id === currentId) return;
    applyExample(id, loadExample(id));
  };

  setChildren(root, [
    el("div", { class: "page" }, [heroView.header, heroView.hero, setup.node, errors, stage.root, tabs.root, live.node]),
  ]);
  // The crosswalk Example is selected on load; no Campaign starts.
  applyExample(currentId, loadExample(currentId));
}
