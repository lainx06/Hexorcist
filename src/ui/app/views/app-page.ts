// App controller: Example gallery, rule box, gremlin picker, campaign, reduction, replays, apply fix.
// One job at a time. Every Technical_Element is toggled with the hidden attribute only.
import { GREMLIN_CATALOGUE } from "../../../engine/gremlins/catalogue";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import { failureStory } from "../../../engine/reducer/story";
import type { ReducerEvent, ReducerResult } from "../../../engine/reducer/types";
import type { RuleSet } from "../../../engine/rules/ir";
import type { Verdict } from "../../../engine/types";
import { EXAMPLE_IDS, loadExample } from "../data/examples";
import type { ExampleBundle, ExampleId, LoadedExample } from "../data/examples";
import { diffHunks } from "../model/diff";
import { displayAgrees, displaySpan, displayWindowEnd } from "../model/display";
import { copyFor, isCustomRuleSet, spanSentenceFor, storyEndingFor } from "../model/example-copy";
import { fixedReplayText, tryRemovingText, withoutEvent } from "../model/fix-text";
import type { FlowState } from "../model/flow";
import { canApplyFix, canReplayAgain, canTryRemoving, canUnleash, initialFlow } from "../model/flow";
import { inputValueText, ms, runCountText } from "../model/format";
import { defaultSelection } from "../model/gremlin-picker";
import { movePhrase } from "../model/moves";
import { plainStory } from "../model/plain-story";
import { checkRuleBox, sentencePatterns } from "../model/rule-box";
import type { RuleError } from "../model/rule-box";
import { ruleBySentence } from "../model/rules";
import { sceneAt } from "../model/scene";
import { garageSceneAt, heartbeatSceneAt } from "../model/scenes";
import { spanFor } from "../model/span";
import type { Span } from "../model/span";
import { exampleStoryInput } from "../model/story-input";
import { eventValue, windowEnd } from "../model/timeline";
import type { BuildLabel } from "../model/verdict-text";
import { announcement, findingText } from "../model/verdict-text";
import type { CampaignDoneMsg, ReplayDoneMsg } from "../worker/messages";
import { el, setChildren } from "./dom";
import { gallery } from "./gallery";
import { plainOnly, techOnly } from "./details";
import { createLiveRegion } from "./live";
import { controls, counter, header, SHRINK_LABEL, sendsText, UI_COPY } from "./panels";
import { picker } from "./picker";
import { appendSentence, ruleArea } from "./rule-box";
import { createScene } from "./scene";
import { createGarageScene } from "./scene-garage";
import { createHeartbeatScene } from "./scene-heartbeat";
import type { ReplayView, RunLabel } from "./timeline";
import { createTimeline } from "./timeline";
import type { CardStory } from "./verdict-card";
import { verdictCard, violatedRule } from "./verdict-card";
import type { JobOutcome } from "./worker-client";
import { createEngineClient } from "./worker-client";

interface CampaignRecord {
  build: BuildLabel;
  hex: string;
  runs: number;
  seed: number;
  done: CampaignDoneMsg | null;
}

/** What the running Campaign and every job after it use; a snapshot taken when "Unleash gremlins" is pressed. */
interface RunContext {
  example: ExampleBundle;
  ruleSet: RuleSet;
  custom: boolean;
  gremlinSet: GremlinSpec[];
}

interface ReplayResult {
  replay: ReplayDoneMsg;
  display: ReplayDoneMsg | null;
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

export function mountApp(root: HTMLElement): void {
  const live = createLiveRegion();
  const errors = el("div", { class: "errors" }, []);
  const showError = (text: string) => errors.appendChild(el("p", { class: "error-text" }, [text]));
  const client = createEngineClient();

  const ctl = controls(24, 0);
  const count = counter();
  const crosswalkScene = createScene();
  const garageScene = createGarageScene();
  const heartbeatScene = createHeartbeatScene();
  const sceneHost = el("div", { class: "scene-host" }, []);
  const timeline = createTimeline();
  const gal = gallery((id) => selectExample(id));
  const rules = ruleArea({
    onText: (t) => applyRuleText(t),
    onInsert: (s) => {
      const t = appendSentence(rules.getText(), s);
      rules.setText(t);
      applyRuleText(t);
    },
    onReset: () => {
      if (current === null) return;
      rules.setText(current.rulesText);
      applyRuleText(current.rulesText);
    },
  });
  const pick = picker((id) => toggleGremlin(id));
  const verdictArea = el("div", { class: "verdict-area", "aria-label": "Verdict" }, []);
  const fixPanel = el("section", { class: "panel fix", hidden: true, "aria-labelledby": "fix-title" }, []);
  const removeList = el("section", { class: "panel try-removing", hidden: true, "aria-labelledby": "try-title" }, []);
  const replayAgainBtn = el("button", { type: "button", class: "secondary" }, ["Replay again"]);
  const replayAgainOut = el("p", { class: "mono meta replay-again-out" }, [""]);
  const replayAgainRow = el("div", { class: "replay-again", hidden: true }, [replayAgainBtn, replayAgainOut]);
  // The result area before any result: a large copy of the sidebar button and the line under it.
  const bigUnleash = el("button", { type: "button", class: "primary primary-large" }, [UI_COPY.unleash]);
  const sendsLine = el("p", { class: "sends-line meta" }, [""]);
  const placeholderNode = el("div", { class: "placeholder" }, [
    techOnly(el("p", { class: "meta" }, [UI_COPY.emptyTech])),
    plainOnly(el("p", { class: "meta" }, [UI_COPY.emptyPlain])),
    bigUnleash,
    sendsLine,
  ]);
  const placeholder = (): HTMLElement => placeholderNode;

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
  let ctx: RunContext | null = null;
  let buggy: CampaignRecord | null = null;
  let fixed: CampaignRecord | null = null;
  let reduction: ReducerResult | null = null;
  let cardStory: CardStory | null = null;
  let original: ReplayView | null = null;
  let reduced: ReplayView | null = null;
  let previousFingerprint: string | null = null;
  let shown: RunLabel = "Original run";
  let applyFixBtn: HTMLButtonElement | null = null;
  const logOpen: Record<BuildLabel, boolean> = { "Buggy build": false, "Fixed build": false };
  const removeButtons: HTMLButtonElement[] = [];

  const refresh = (): void => {
    const vals = ctl.values();
    flow = { ...flow, dataOk: loadedOk, runsOk: vals.runsOk, seedOk: vals.seedOk };
    const unleashOff = !(canUnleash(flow) && ruleErrors.length === 0 && selectedIds.length > 0);
    ctl.unleash.disabled = unleashOff;
    bigUnleash.disabled = unleashOff;
    sendsLine.textContent = vals.runsOk ? sendsText(vals.runs) : UI_COPY.sendsInvalid;
    if (applyFixBtn !== null) applyFixBtn.disabled = !canApplyFix(flow);
    replayAgainBtn.disabled = !canReplayAgain(flow);
    for (const b of removeButtons) b.disabled = !canTryRemoving(flow);
  };
  ctl.onFieldChange(refresh);

  const paintLocks = (): void => {
    const locked = flow.busy !== null || !loadedOk;
    gal.setBusy(flow.busy !== null);
    rules.setBusy(locked);
    pick.setBusy(locked);
  };

  const setBusy = (busy: FlowState["busy"]): void => {
    flow = { ...flow, busy };
    count.activity.textContent = busy === "replay" ? "Replaying" : "";
    paintLocks();
    refresh();
  };

  // Scene of the Current_Example, drawn at the Cursor of the shown replay.
  const renderScene = (c: number, view: ReplayView | null): void => {
    const r = view === null ? null : { outputEdges: view.outputEdges, events: view.events, violation: view.violation };
    if (currentId === "garage") garageScene.render(garageSceneAt(r, c));
    else if (currentId === "heartbeat") heartbeatScene.render(heartbeatSceneAt(r, view === null ? null : view.span, c));
    else crosswalkScene.render(sceneAt(view === null ? null : { outputEdges: view.outputEdges, violation: view.violation }, c));
  };
  timeline.onCursor((c, view) => renderScene(c, view));
  timeline.onToggle((label) => {
    if (label === "Reduced replay" && reduced === null) return;
    shown = label;
    timeline.setToggle(shown, reduced !== null);
    timeline.show(label === "Reduced replay" ? reduced : original);
  });

  /** The view of a Replay; with an agreeing Display_Replay it uses the display edges, span and window. */
  const viewOf = (label: RunLabel, events: ReducerEvent[], r: ReplayDoneMsg, d: ReplayDoneMsg | null): ReplayView => {
    const c = ctx as RunContext;
    const v = r.violation;
    const agrees = d !== null && displayAgrees(r, d);
    const src = agrees ? d : r;
    let span: Span | null = null;
    let end = r.reachedEnd;
    if (v !== null) {
      const found = ruleBySentence(c.ruleSet, v.rule);
      if (found !== null) span = agrees ? displaySpan(found.rule, v.cycle, src) : spanFor(found.rule, v.cycle, r.outputEdges, r.reachedEnd);
      end = agrees ? displayWindowEnd(span, v.cycle, src.reachedEnd) : windowEnd(v.cycle, r.reachedEnd);
    }
    return { label, events, outputEdges: src.outputEdges, violation: v, reachedEnd: src.reachedEnd, windowEnd: end, span };
  };

  /**
   * Puts a replay of `events` on the timeline and scene. The Cursor starts at the violation cycle (or 0
   * when the replay has none), paused. The same callback serves the core view and the later display view.
   */
  const showReplayView = (label: RunLabel, events: ReducerEvent[]) => (r: ReplayDoneMsg, d: ReplayDoneMsg | null): void => {
    const v = viewOf(label, events, r, d);
    if (label === "Reduced replay") reduced = v;
    shown = label;
    timeline.setToggle(shown, reduced !== null);
    timeline.show(v);
  };

  /**
   * One Replay, then, when it has a violation, one Display_Replay of the same list. The Replay result is
   * the one the caller uses for fingerprints and texts; onView gets the core view at once and the display view later.
   */
  const doReplay = async (
    hex: string,
    events: ReducerEvent[],
    onView?: (replay: ReplayDoneMsg, display: ReplayDoneMsg | null) => void,
  ): Promise<ReplayResult | string> => {
    const c = ctx as RunContext;
    setBusy("replay");
    try {
      const o = await client.run({
        kind: "replay",
        hex,
        fixture: c.example.fixture,
        ruleSet: c.ruleSet,
        events,
        runCycles: c.example.meta.runCycles,
      });
      const err = outcomeError(o);
      if (err !== null) return err;
      const replay = (o as { message: ReplayDoneMsg }).message;
      onView?.(replay, null);
      if (replay.violation === null) return { replay, display: null };
      const od = await client.runDisplay({
        hex,
        fixture: c.example.fixture,
        ruleSet: c.ruleSet,
        events,
        violationCycle: replay.violation.cycle,
      });
      const derr = outcomeError(od);
      if (derr !== null) {
        showError(derr);
        return { replay, display: null };
      }
      const display = (od as { message: ReplayDoneMsg }).message;
      if (!displayAgrees(replay, display)) return { replay, display: null };
      onView?.(replay, display);
      return { replay, display };
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
    return {
      plain,
      exact: typeof exact === "string" ? exact : null,
      reducedList: res.reducedList,
      reducedEventCount: res.reducedEventCount,
      originalEventCount: res.originalEventCount,
    };
  };

  const renderCards = (): void => {
    const cards: HTMLElement[] = [];
    const both = fixed !== null && fixed.done !== null;
    for (const rec of [buggy, fixed]) {
      if (rec === null || rec.done === null || ctx === null) continue;
      const c = ctx;
      const isBuggy = rec.build === "Buggy build";
      const actions: HTMLElement[] = [];
      if (isBuggy && rec.done.result.verdict.verdict === "BROKE" && flow.fix !== "hidden") {
        applyFixBtn = el("button", { type: "button", class: "secondary" }, [UI_COPY.applyFix]);
        applyFixBtn.addEventListener("click", () => void applyFix());
        actions.push(applyFixBtn);
      }
      cards.push(
        verdictCard({
          build: rec.build,
          verdict: rec.done.result.verdict,
          ruleSet: c.ruleSet,
          runCount: rec.runs,
          seed: rec.seed,
          runCycles: c.example.meta.runCycles,
          coverage: rec.done.result.coverage,
          showBuildLabel: both,
          actions,
          plainBroke: copyFor(c.example.id, c.custom).broke,
          fixture: c.example.fixture,
          reducedList: isBuggy && reduction !== null ? reduction.reducedList : null,
          story: isBuggy ? cardStory : null,
          logOpen: logOpen[rec.build],
          onLogToggle: (open) => {
            logOpen[rec.build] = open;
          },
        }),
      );
    }
    setChildren(verdictArea, cards.length === 0 ? [placeholder()] : cards);
    verdictArea.classList.toggle("has-two", cards.length > 1);
    refresh();
  };

  const runCampaign = async (rec: CampaignRecord): Promise<CampaignDoneMsg | null> => {
    const c = ctx as RunContext;
    live.announce(`${rec.build}: campaign of ${runCountText(rec.runs)} started.`);
    ctl.setProgress(0, rec.runs);
    ctl.startTimer();
    setBusy("campaign");
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
        if (m.kind === "campaign-progress") ctl.setProgress(m.runsCompleted, rec.runs);
      },
    );
    ctl.stopTimer();
    setBusy(null);
    const err = outcomeError(o);
    if (err !== null) {
      showError(err);
      return null;
    }
    const done = (o as { message: CampaignDoneMsg }).message;
    rec.done = done;
    const v: Verdict = done.result.verdict;
    ctl.setFinished(done.runsCompleted, rec.runs, v.verdict === "BROKE" ? v.trace.runIndex + 1 : null);
    live.announce(announcement(rec.build, v, findingText(v, violatedRule(c.ruleSet, v))));
    ctl.showViewResult(true);
    return done;
  };

  const renderTryRemoving = (list: ReducerEvent[], target: string): void => {
    const c = ctx as RunContext;
    removeButtons.length = 0;
    const rows = list.map((e, i) => {
      const result = el("span", { class: "try-result meta" }, [""]);
      const cells: (HTMLElement | string)[] = [
        techOnly(el("span", { class: "mono" }, [`${ms(e.cycle)} \u00b7 ${e.signal} = ${inputValueText(eventValue(e))}`])),
      ];
      if (e.gremlinId === "rest") {
        cells.push(el("span", { class: "meta" }, ["rest state"]));
      } else {
        cells.push(plainOnly(el("span", {}, [`${ms(e.cycle)}: ${movePhrase(list, i, c.example.fixture)}`])));
        const b = el("button", { type: "button", class: "secondary" }, ["Try removing"]);
        removeButtons.push(b);
        b.addEventListener("click", () => {
          void (async () => {
            const without = withoutEvent(list, i);
            const r = await doReplay(c.example.buggyHex, without, showReplayView(UI_COPY.trialRun, without));
            result.textContent = typeof r === "string" ? r : tryRemovingText(target, r.replay.violation);
            result.classList.toggle("error-text", typeof r === "string");
          })();
        });
        cells.push(b);
      }
      cells.push(result);
      // A rest state is not a gremlin move, so the plain view leaves its row out.
      const row = el("li", { class: "try-row" }, cells);
      return e.gremlinId === "rest" ? techOnly(row) : row;
    });
    setChildren(removeList, [
      el("h2", { class: "region-title", id: "try-title" }, [
        techOnly(el("span", {}, [UI_COPY.tryHeading])),
        plainOnly(el("span", {}, [UI_COPY.plainTryHeading])),
      ]),
      el("ul", { class: "try-list" }, rows),
    ]);
    removeList.hidden = false;
    refresh();
  };

  const applyFix = async (): Promise<void> => {
    if (buggy === null || reduction === null || buggy.done === null || ctx === null) return;
    const c = ctx;
    const v = buggy.done.result.verdict;
    if (v.verdict !== "BROKE") return;
    flow = { ...flow, fix: "used" };
    const hunks = diffHunks(c.example.buggySketch, c.example.fixedSketch);
    const replayText = el("p", { class: "fix-replay" }, [""]);
    setChildren(fixPanel, [
      el("h2", { class: "region-title", id: "fix-title" }, [UI_COPY.fixTitle]),
      el("p", { class: "meta mono" }, [UI_COPY.sketchLine]),
      el(
        "div",
        { class: "diff mono", tabindex: 0, role: "region", "aria-label": UI_COPY.fixRegion },
        hunks.map((h) =>
          el("div", { class: "hunk" }, [
            el("p", { class: "hunk-head meta" }, [
              `@@ -${String(h.oldStart)},${String(h.oldCount)} +${String(h.newStart)},${String(h.newCount)} @@`,
            ]),
            ...h.lines.map((l) =>
              el("p", { class: `diff-line diff-line--${l.type}` }, [
                `${l.type === "removed" ? "- " : l.type === "added" ? "+ " : "  "}${l.text}`,
              ]),
            ),
          ]),
        ),
      ),
      replayText,
    ]);
    fixPanel.hidden = false;
    refresh();
    const r = await doReplay(c.example.fixedHex, reduction.reducedList);
    if (typeof r === "string") {
      replayText.textContent = r;
      replayText.classList.add("error-text");
      return;
    }
    replayText.textContent = fixedReplayText(v.trace.violation.rule, r.replay.violation);
    fixed = { build: "Fixed build", hex: c.example.fixedHex, runs: buggy.runs, seed: buggy.seed, done: null };
    const done = await runCampaign(fixed);
    if (done === null) fixed = null;
    renderCards();
  };

  const replayAgain = async (): Promise<void> => {
    if (reduction === null || ctx === null) return;
    const r = await doReplay(ctx.example.buggyHex, reduction.reducedList, showReplayView("Reduced replay", reduction.reducedList));
    if (typeof r === "string") {
      replayAgainOut.textContent = r;
      return;
    }
    const same = previousFingerprint !== null && r.replay.fingerprint === previousFingerprint;
    replayAgainOut.textContent = `Fingerprint ${r.replay.fingerprint} \u00b7 ${same ? "matches" : "differs"}`;
    previousFingerprint = r.replay.fingerprint;
  };
  replayAgainBtn.addEventListener("click", () => void replayAgain());

  /** Clears verdicts, Reduction_Row, stories, Replay, Scene and Timeline. The elapsed text is left alone. */
  const clearOutputs = (): void => {
    setChildren(errors, []);
    buggy = null;
    fixed = null;
    reduction = null;
    cardStory = null;
    original = null;
    reduced = null;
    previousFingerprint = null;
    applyFixBtn = null;
    logOpen["Buggy build"] = false;
    logOpen["Fixed build"] = false;
    flow = { ...flow, reduction: "none", reducedReplayOk: false, fix: "hidden" };
    count.reset();
    fixPanel.hidden = true;
    removeList.hidden = true;
    removeButtons.length = 0;
    replayAgainRow.hidden = true;
    replayAgainOut.textContent = "";
    ctl.showViewResult(false);
    shown = "Original run";
    timeline.setToggle(shown, false);
    timeline.setRunNote(null);
    timeline.show(null);
    renderScene(0, null);
    setChildren(verdictArea, [placeholder()]);
  };

  const unleash = async (): Promise<void> => {
    const vals = ctl.values();
    if (current === null || !loadedOk || !vals.runsOk || !vals.seedOk || ruleErrors.length > 0 || selectedIds.length === 0) return;
    const example = current;
    ctx = {
      example,
      ruleSet: activeRuleSet,
      custom: isCustomRuleSet(activeSentences, example.sentences),
      gremlinSet: orderedSelection(selectedIds, example),
    };
    const c = ctx;
    clearOutputs();
    buggy = { build: "Buggy build", hex: example.buggyHex, runs: vals.runs, seed: vals.seed, done: null };

    const done = await runCampaign(buggy);
    renderCards();
    if (done === null) return;
    const v = done.result.verdict;
    if (v.verdict !== "BROKE") return;

    // Original run on the scene and timeline while the reducer works.
    const originalList = v.trace.eventList;
    const orig = await doReplay(example.buggyHex, originalList, (r, d) => {
      original = viewOf("Original run", originalList, r, d);
      if (shown === "Original run") timeline.show(original);
    });
    if (typeof orig === "string") showError(orig);

    const x = originalList.filter((e) => e.gremlinId !== "rest").length;
    count.running(x, x, 0);
    flow = { ...flow, reduction: "running" };
    setBusy("reduce");
    const o = await client.run(
      {
        kind: "reduce",
        hex: example.buggyHex,
        fixture: example.fixture,
        ruleSet: c.ruleSet,
        originalList,
        violation: v.trace.violation,
        runCycles: example.meta.runCycles,
        measure: false,
      },
      (m) => {
        if (m.kind !== "reduce-progress") return;
        count.running(x, m.bestGremlinCount, m.candidatesTried);
        if (shown === "Original run") timeline.dropMarkers(m.bestGremlinCount, m.bestList);
      },
    );
    setBusy(null);
    const err = outcomeError(o);
    if (err !== null) {
      flow = { ...flow, reduction: "error" };
      count.fail();
      showError(`Reduction error: ${err}`);
      live.announce(`Reduction error: ${err}`);
      refresh();
      return;
    }
    const res = (o as { message: { kind: "reduce-done"; result: ReducerResult } }).message.result;
    reduction = res;
    flow = { ...flow, reduction: "result", fix: "available" };
    count.done(res.originalEventCount, res.reducedEventCount, res.candidatesTried, res.stoppedAtBudget);
    timeline.setRunNote({
      original: originalList.filter((e) => e.gremlinId !== "rest").length,
      reduced: res.reducedList.filter((e) => e.gremlinId !== "rest").length,
    });
    live.announce(`${count.summary()} ${SHRINK_LABEL}`);
    renderCards();

    const red = await doReplay(example.buggyHex, res.reducedList, (r, d) => {
      reduced = viewOf("Reduced replay", res.reducedList, r, d);
      cardStory = buildCardStory(res, reduced);
      renderCards();
      if (d === null) {
        previousFingerprint = r.fingerprint;
        flow = { ...flow, reducedReplayOk: true };
        shown = "Reduced replay";
      }
      timeline.setToggle(shown, true);
      if (shown === "Reduced replay") timeline.show(reduced);
    });
    if (typeof red === "string") showError(red);
    else replayAgainRow.hidden = false;
    renderTryRemoving(res.reducedList, v.trace.violation.rule);
    refresh();
  };
  ctl.unleash.addEventListener("click", () => void unleash());
  bigUnleash.addEventListener("click", () => void unleash());

  ctl.viewResult.addEventListener("click", () => {
    const cards = verdictArea.querySelectorAll<HTMLElement>(".verdict");
    const last = cards.item(cards.length - 1) as HTMLElement | null;
    if (last === null) return;
    last.querySelector(".verdict-heading")?.scrollIntoView({ block: "start" });
    last.focus();
  });

  // Rule_Box: check before the next render; the Active_Rule_Set changes only when the check passes.
  const paintRule = (): void => {
    if (current === null) return;
    rules.setHeadline(copyFor(currentId, isCustomRuleSet(activeSentences, current.sentences)).headline);
    rules.setSentences(activeSentences);
    rules.setErrors(ruleErrors);
  };
  const applyRuleText = (text: string): void => {
    if (current === null) return;
    const r = checkRuleBox(text, current.fixture);
    if (r.ok) {
      activeRuleSet = r.ruleSet;
      activeSentences = r.sentences;
      ruleErrors = [];
    } else {
      ruleErrors = r.errors;
    }
    paintRule();
    refresh();
  };

  const toggleGremlin = (id: string): void => {
    if (flow.busy !== null || !loadedOk) return;
    selectedIds = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id];
    pick.setSelected(selectedIds);
    refresh();
  };

  // Example selection: ignored while busy and for the Current_Example.
  const applyExample = (id: ExampleId, loaded: LoadedExample): void => {
    currentId = id;
    ctx = null;
    clearOutputs();
    gal.setSelected(id);
    ctl.clearStatus();
    if (!loaded.ok) {
      loadedOk = false;
      current = null;
      gal.setProblems(loaded.problems);
      rules.setHeadline("");
      rules.setSentences([]);
      rules.setText("");
      rules.setErrors([]);
      rules.setPatterns([]);
      selectedIds = [];
      pick.setSelected([]);
      setChildren(sceneHost, [crosswalkScene.node]);
      paintLocks();
      refresh();
      return;
    }
    const ex = loaded.example;
    loadedOk = true;
    current = ex;
    gal.setProblems([]);
    activeRuleSet = ex.ruleSet;
    activeSentences = [...ex.sentences];
    ruleErrors = [];
    rules.setText(ex.rulesText);
    rules.setPatterns(sentencePatterns(ex.fixture).map((p) => ({ label: PATTERN_LABELS[p.form] ?? p.form, sentence: p.sentence })));
    paintRule();
    selectedIds = defaultSelection(ex.meta.gremlinSet, ex.fixture).map((g) => g.id);
    pick.setFixture(ex.fixture, selectedIds);
    ctl.setValues(ex.meta.runs, ex.meta.campaignSeed);
    timeline.setFixture(ex.fixture);
    setChildren(sceneHost, [id === "garage" ? garageScene.node : id === "heartbeat" ? heartbeatScene.node : crosswalkScene.node]);
    renderScene(0, null);
    paintLocks();
    refresh();
  };
  const selectExample = (id: ExampleId): void => {
    if (flow.busy !== null || id === currentId) return;
    applyExample(id, loadExample(id));
  };

  const sceneRegion = el("section", { class: "panel scene-region", "aria-label": "Scene" }, [
    sceneHost,
    el("div", { class: "activity-row" }, [count.activity]),
  ]);
  const counterRow = el("div", { class: "counter-row" }, [count.node, replayAgainRow]);

  setChildren(root, [
    el("div", { class: "page" }, [
      header(),
      gal.node,
      el("main", { class: "workspace" }, [
        el("div", { class: "config" }, [rules.node, ctl.node, pick.node]),
        el("div", { class: "evidence" }, [verdictArea, errors, sceneRegion, counterRow, timeline.node, removeList, fixPanel]),
      ]),
      live.node,
    ]),
  ]);
  // The crosswalk Example is selected on load; no Campaign starts.
  applyExample(currentId, loadExample(currentId));
}
