// App controller: opening state, campaign, reduction, replays, apply fix. One job at a time.
import { failureStory } from "../../../engine/reducer/story";
import type { ReducerEvent, ReducerResult } from "../../../engine/reducer/types";
import type { Verdict } from "../../../engine/types";
import { loadCrosswalk } from "../data/crosswalk";
import type { LoadedCrosswalk } from "../data/crosswalk";
import { diffHunks, sketchName } from "../model/diff";
import { fixedReplayText, tryRemovingText, withoutEvent } from "../model/fix-text";
import type { FlowState } from "../model/flow";
import { canApplyFix, canReplayAgain, canTryRemoving, canUnleash, initialFlow } from "../model/flow";
import { inputValueText, ms, runCountText } from "../model/format";
import { sceneAt } from "../model/scene";
import { ruleBySentence } from "../model/rules";
import { spanFor } from "../model/span";
import type { Span } from "../model/span";
import { buildStoryInput } from "../model/story-input";
import { eventValue, windowEnd } from "../model/timeline";
import type { BuildLabel } from "../model/verdict-text";
import { announcement, findingText } from "../model/verdict-text";
import type { CampaignDoneMsg, JobError, ReplayDoneMsg } from "../worker/messages";
import { el, setChildren } from "./dom";
import { createLiveRegion } from "./live";
import { controls, counter, gremlinPanel, header, rulePanel, storyCard, SHRINK_LABEL } from "./panels";
import { createScene } from "./scene";
import type { ReplayView, RunLabel } from "./timeline";
import { createTimeline } from "./timeline";
import { verdictCard, violatedRule } from "./verdict-card";
import type { JobOutcome } from "./worker-client";
import { createEngineClient } from "./worker-client";

type Ready = Extract<LoadedCrosswalk, { ok: true }>;

interface CampaignRecord {
  build: BuildLabel;
  hex: string;
  runs: number;
  seed: number;
  done: CampaignDoneMsg | null;
}

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

export function mountApp(root: HTMLElement): void {
  const data = loadCrosswalk();
  const live = createLiveRegion();
  const errors = el("div", { class: "errors" }, []);
  const showError = (text: string) => errors.appendChild(el("p", { class: "error-text" }, [text]));

  if (!data.ok) {
    const lines = [...data.rulesReasons, ...data.jsonErrors.map((j) => `${j.file}: ${j.message}`)];
    const blocked = el("button", { type: "button", class: "primary", disabled: true }, ["Unleash gremlins"]);
    setChildren(root, [
      el("div", { class: "page" }, [
        header(),
        el("main", { class: "panel" }, [...lines.map((l) => el("p", { class: "error-text" }, [l])), blocked]),
        live.node,
      ]),
    ]);
    return;
  }
  mountReady(root, data, live, errors, showError);
}

function mountReady(
  root: HTMLElement,
  data: Ready,
  live: ReturnType<typeof createLiveRegion>,
  errors: HTMLElement,
  showError: (t: string) => void,
): void {
  const client = createEngineClient();
  const ctl = controls(data.meta.runs, data.meta.campaignSeed);
  const count = counter();
  const story = storyCard();
  const scene = createScene();
  const timeline = createTimeline();
  const verdictArea = el("div", { class: "verdict-area", "aria-label": "Verdict" }, [
    el("p", { class: "placeholder meta" }, ["Run a campaign to inspect the result."]),
  ]);
  const fixPanel = el("section", { class: "panel fix", hidden: true, "aria-labelledby": "fix-title" }, []);
  const removeList = el("section", { class: "panel try-removing", hidden: true, "aria-labelledby": "try-title" }, []);
  const replayAgainBtn = el("button", { type: "button", class: "secondary" }, ["Replay again"]);
  const replayAgainOut = el("p", { class: "mono meta replay-again-out" }, [""]);
  const replayAgainRow = el("div", { class: "replay-again", hidden: true }, [replayAgainBtn, replayAgainOut]);

  let flow: FlowState = initialFlow(true);
  let buggy: CampaignRecord | null = null;
  let fixed: CampaignRecord | null = null;
  let reduction: ReducerResult | null = null;
  let original: ReplayView | null = null;
  let reduced: ReplayView | null = null;
  let previousFingerprint: string | null = null;
  let shown: RunLabel = "Original run";
  let applyFixBtn: HTMLButtonElement | null = null;
  const removeButtons: HTMLButtonElement[] = [];

  const refresh = (): void => {
    const vals = ctl.values();
    flow = { ...flow, runsOk: vals.runsOk, seedOk: vals.seedOk };
    ctl.unleash.disabled = !canUnleash(flow);
    if (applyFixBtn !== null) applyFixBtn.disabled = !canApplyFix(flow);
    replayAgainBtn.disabled = !canReplayAgain(flow);
    for (const b of removeButtons) b.disabled = !canTryRemoving(flow);
  };
  ctl.onFieldChange(refresh);

  const setBusy = (busy: FlowState["busy"]): void => {
    flow = { ...flow, busy };
    count.activity.textContent = busy === "replay" ? "Replaying" : busy === "reduce" ? "Reducing" : "";
    refresh();
  };

  timeline.onCursor((c, view) => {
    scene.render(sceneAt(view === null ? null : { outputEdges: view.outputEdges, violation: view.violation }, c));
  });
  timeline.onToggle((label) => {
    if (label === "Reduced replay" && reduced === null) return;
    shown = label;
    timeline.setToggle(shown, reduced !== null);
    timeline.show(label === "Reduced replay" ? reduced : original);
  });

  const toView = (label: RunLabel, events: ReducerEvent[], r: ReplayDoneMsg): ReplayView => {
    const v = r.violation;
    const end = v === null ? r.reachedEnd : windowEnd(v.cycle, r.reachedEnd);
    let span: Span | null = null;
    if (v !== null) {
      const found = ruleBySentence(data.ruleSet, v.rule);
      if (found !== null) span = spanFor(found.rule, v.cycle, r.outputEdges, r.reachedEnd);
    }
    return { label, events, outputEdges: r.outputEdges, violation: v, reachedEnd: r.reachedEnd, windowEnd: end, span };
  };

  const replay = async (hex: string, events: ReducerEvent[]): Promise<ReplayDoneMsg | string> => {
    setBusy("replay");
    const o = await client.run({ kind: "replay", hex, fixture: data.fixture, ruleSet: data.ruleSet, events, runCycles: data.meta.runCycles });
    setBusy(null);
    const err = outcomeError(o);
    if (err !== null) return err;
    return (o as { message: ReplayDoneMsg }).message;
  };

  const renderCards = (): void => {
    const cards: HTMLElement[] = [];
    const both = fixed !== null && fixed.done !== null;
    for (const rec of [buggy, fixed]) {
      if (rec === null || rec.done === null) continue;
      const actions: HTMLElement[] = [];
      if (rec.build === "Buggy build" && rec.done.result.verdict.verdict === "BROKE" && flow.fix !== "hidden") {
        applyFixBtn = el("button", { type: "button", class: "secondary" }, ["Load this example's bundled fixed .hex"]);
        applyFixBtn.addEventListener("click", () => void applyFix());
        actions.push(applyFixBtn);
      }
      cards.push(
        verdictCard({
          build: rec.build,
          verdict: rec.done.result.verdict,
          ruleSet: data.ruleSet,
          runCount: rec.runs,
          seed: rec.seed,
          runCycles: data.meta.runCycles,
          coverage: rec.done.result.coverage,
          showBuildLabel: both,
          actions,
        }),
      );
    }
    setChildren(verdictArea, cards.length === 0 ? [el("p", { class: "placeholder meta" }, ["Run a campaign to inspect the result."])] : cards);
    verdictArea.classList.toggle("has-two", cards.length > 1);
    refresh();
  };

  const runCampaign = async (rec: CampaignRecord): Promise<CampaignDoneMsg | null> => {
    live.announce(`${rec.build}: campaign of ${runCountText(rec.runs)} started.`);
    ctl.setProgress(0, rec.runs);
    ctl.startTimer();
    setBusy("campaign");
    const o = await client.run(
      {
        kind: "campaign",
        hex: rec.hex,
        fixture: data.fixture,
        ruleSet: data.ruleSet,
        gremlinSet: data.meta.gremlinSet,
        campaignSeed: rec.seed,
        runs: rec.runs,
        runCycles: data.meta.runCycles,
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
    ctl.setProgress(done.runsCompleted, rec.runs);
    rec.done = done;
    const v: Verdict = done.result.verdict;
    live.announce(announcement(rec.build, v, findingText(v, violatedRule(data.ruleSet, v))));
    ctl.showViewResult(true);
    return done;
  };

  const renderTryRemoving = (list: ReducerEvent[], target: string): void => {
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
            const r = await replay(data.buggyHex, withoutEvent(list, i));
            result.textContent = typeof r === "string" ? r : tryRemovingText(target, r.violation);
            result.classList.toggle("error-text", typeof r === "string");
          })();
        });
        cells.push(b);
      }
      cells.push(result);
      return el("li", { class: "try-row" }, cells);
    });
    setChildren(removeList, [
      el("h2", { class: "region-title", id: "try-title" }, ["Events in the reduced replay"]),
      el("ul", { class: "try-list" }, rows),
    ]);
    removeList.hidden = false;
    refresh();
  };

  const applyFix = async (): Promise<void> => {
    if (buggy === null || reduction === null || buggy.done === null) return;
    const v = buggy.done.result.verdict;
    if (v.verdict !== "BROKE") return;
    flow = { ...flow, fix: "used" };
    const hunks = diffHunks(data.buggySketch, data.fixedSketch);
    const replayText = el("p", { class: "fix-replay" }, [""]);
    setChildren(fixPanel, [
      el("h2", { class: "region-title", id: "fix-title" }, ["Sketch source"]),
      el("p", { class: "meta mono" }, [`${sketchName("buggy")} -> ${sketchName("fixed")}`]),
      el(
        "div",
        { class: "diff mono", tabindex: 0, role: "region", "aria-label": "Sketch source changes" },
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
    const r = await replay(data.fixedHex, reduction.reducedList);
    if (typeof r === "string") {
      replayText.textContent = r;
      replayText.classList.add("error-text");
      return;
    }
    replayText.textContent = fixedReplayText(v.trace.violation.rule, r.violation);
    fixed = { build: "Fixed build", hex: data.fixedHex, runs: buggy.runs, seed: buggy.seed, done: null };
    const done = await runCampaign(fixed);
    if (done === null) fixed = null;
    renderCards();
  };

  const replayAgain = async (): Promise<void> => {
    if (reduction === null) return;
    const r = await replay(data.buggyHex, reduction.reducedList);
    if (typeof r === "string") {
      replayAgainOut.textContent = r;
      return;
    }
    const same = previousFingerprint !== null && r.fingerprint === previousFingerprint;
    replayAgainOut.textContent = `Fingerprint ${r.fingerprint} \u00b7 ${same ? "matches" : "differs"}`;
    previousFingerprint = r.fingerprint;
  };
  replayAgainBtn.addEventListener("click", () => void replayAgain());

  const unleash = async (): Promise<void> => {
    const vals = ctl.values();
    if (!vals.runsOk || !vals.seedOk) return;
    // reset
    setChildren(errors, []);
    buggy = { build: "Buggy build", hex: data.buggyHex, runs: vals.runs, seed: vals.seed, done: null };
    fixed = null;
    reduction = null;
    original = null;
    reduced = null;
    previousFingerprint = null;
    applyFixBtn = null;
    flow = { ...flow, reduction: "none", reducedReplayOk: false, fix: "hidden" };
    count.reset();
    story.show(null, false);
    fixPanel.hidden = true;
    removeList.hidden = true;
    replayAgainRow.hidden = true;
    replayAgainOut.textContent = "";
    ctl.showViewResult(false);
    shown = "Original run";
    timeline.setToggle(shown, false);
    timeline.show(null);
    setChildren(verdictArea, [el("p", { class: "placeholder meta" }, ["Run a campaign to inspect the result."])]);

    const done = await runCampaign(buggy);
    renderCards();
    if (done === null) return;
    const v = done.result.verdict;
    if (v.verdict !== "BROKE") return;

    // Original run on the scene and timeline while the reducer works.
    const orig = await replay(data.buggyHex, v.trace.eventList);
    if (typeof orig === "string") showError(orig);
    else {
      original = toView("Original run", v.trace.eventList, orig);
      timeline.show(original);
    }

    const x = v.trace.eventList.filter((e) => e.gremlinId !== "rest").length;
    count.running(x, x, 0);
    flow = { ...flow, reduction: "running" };
    setBusy("reduce");
    const o = await client.run(
      {
        kind: "reduce",
        hex: data.buggyHex,
        fixture: data.fixture,
        ruleSet: data.ruleSet,
        originalList: v.trace.eventList,
        violation: v.trace.violation,
        runCycles: data.meta.runCycles,
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
      showError(`Reduction error: ${err}`);
      live.announce(`Reduction error: ${err}`);
      refresh();
      return;
    }
    const res = (o as { message: { kind: "reduce-done"; result: ReducerResult } }).message.result;
    reduction = res;
    flow = { ...flow, reduction: "result", fix: "available" };
    count.done(res.originalEventCount, res.reducedEventCount, res.candidatesTried, res.stoppedAtBudget);
    live.announce(`${count.node.querySelector(".counts")?.textContent ?? ""}. ${SHRINK_LABEL}`);
    renderCards();

    const red = await replay(data.buggyHex, res.reducedList);
    if (typeof red === "string") {
      showError(red);
    } else {
      reduced = toView("Reduced replay", res.reducedList, red);
      previousFingerprint = red.fingerprint;
      flow = { ...flow, reducedReplayOk: true };
      shown = "Reduced replay";
      timeline.setToggle(shown, true);
      timeline.show(reduced);
      if (red.violation !== null) {
        const s = failureStory(
          buildStoryInput({
            reducedList: res.reducedList,
            fixture: data.fixture,
            ruleSet: data.ruleSet,
            violation: red.violation,
            outputEdges: red.outputEdges,
            reachedEnd: red.reachedEnd,
          }),
        );
        if (typeof s === "string") story.show(s, false);
        else story.show(s.message, true);
      }
      replayAgainRow.hidden = false;
    }
    renderTryRemoving(res.reducedList, v.trace.violation.rule);
    refresh();
  };
  ctl.unleash.addEventListener("click", () => void unleash());

  ctl.viewResult.addEventListener("click", () => {
    const cards = verdictArea.querySelectorAll<HTMLElement>(".verdict");
    const last = cards.item(cards.length - 1) as HTMLElement | null;
    if (last === null) return;
    last.querySelector(".verdict-heading")?.scrollIntoView({ block: "start" });
    last.focus();
  });

  const sceneRegion = el("section", { class: "panel scene-region", "aria-label": "Scene" }, [
    scene.node,
    el("div", { class: "activity-row" }, [count.activity]),
  ]);
  const counterRow = el("div", { class: "counter-row" }, [count.node, replayAgainRow]);

  setChildren(root, [
    el("div", { class: "page" }, [
      header(),
      el("main", { class: "workspace" }, [
        el("div", { class: "config" }, [rulePanel(data.sentences), gremlinPanel(data.meta.gremlinSet, data.fixture), ctl.node]),
        el("div", { class: "evidence" }, [
          verdictArea,
          errors,
          story.node,
          sceneRegion,
          counterRow,
          timeline.node,
          removeList,
          fixPanel,
        ]),
      ]),
      live.node,
    ]),
  ]);
  scene.render(sceneAt(null, 0));
  refresh();
}