// Header, rule panel, gremlin tiles, campaign controls, reduction counter and story card.
import type { Fixture } from "../../../engine/types";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import { gremlinTile } from "../model/gremlin-tile";
import { candidatesText, elapsedText, progressText, shrinkText } from "../model/format";
import { checkRuns, checkSeed } from "../model/fields";
import { el, setChildren } from "./dom";
import { crossingMotif, gremlinIcon } from "./icons";

export function header(): HTMLElement {
  return el("header", { class: "page-header" }, [
    el("div", { class: "brand-row" }, [
      el("h1", { class: "wordmark" }, ["Hexorcist"]),
      el("p", { class: "chip-line meta mono" }, ["ATmega328P \u00b7 Browser only"]),
    ]),
    el("p", { class: "pitch" }, ["Flashing AI-written firmware? Let the gremlins break it before your board does."]),
    el("div", { class: "gallery" }, [
      el("div", { class: "example-card is-selected" }, [
        crossingMotif(),
        el("div", {}, [el("p", { class: "card-title" }, ["Crosswalk"]), el("p", { class: "meta" }, ["Buggy example"])]),
      ]),
    ]),
  ]);
}

export function rulePanel(sentences: readonly string[]): HTMLElement {
  return el("section", { class: "panel", "aria-labelledby": "rule-title" }, [
    el("h2", { class: "region-title", id: "rule-title" }, ["Rule"]),
    ...sentences.map((s) => el("p", { class: "rule-sentence mono" }, [s])),
  ]);
}

export function gremlinPanel(gremlinSet: readonly GremlinSpec[], fixture: Fixture): HTMLElement {
  const tiles = gremlinSet.map((g) => {
    const t = gremlinTile(g, fixture);
    if (t === null) return el("div", { class: "tile" }, [el("p", { class: "mono" }, [g.id])]);
    return el("div", { class: "tile is-selected" }, [
      el("div", { class: "tile-head" }, [gremlinIcon(t.iconName), el("p", { class: "tile-name" }, [t.name])]),
      el("p", { class: "meta" }, [t.behaviour]),
      el("p", { class: "meta mono" }, [`Target: ${t.targets.join(", ")}`]),
      ...t.ranges.map((r) => el("p", { class: "meta mono" }, [r])),
    ]);
  });
  return el("section", { class: "panel", "aria-labelledby": "gremlins-title" }, [
    el("h2", { class: "region-title", id: "gremlins-title" }, ["Gremlins"]),
    el("div", { class: "tile-grid" }, tiles),
  ]);
}

export interface ControlsView {
  node: HTMLElement;
  unleash: HTMLButtonElement;
  viewResult: HTMLButtonElement;
  values(): { runsOk: boolean; seedOk: boolean; runs: number; seed: number };
  onFieldChange(fn: () => void): void;
  setProgress(k: number, n: number): void;
  startTimer(): void;
  stopTimer(): void;
  showViewResult(show: boolean): void;
}

export function controls(defaultRuns: number, defaultSeed: number): ControlsView {
  const runs = el("input", {
    id: "runs-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: String(defaultRuns),
    "aria-describedby": "runs-msg",
  });
  const seed = el("input", {
    id: "seed-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: String(defaultSeed),
    "aria-describedby": "seed-msg",
  });
  const runsMsg = el("p", { id: "runs-msg", class: "field-msg meta" }, [""]);
  const seedMsg = el("p", { id: "seed-msg", class: "field-msg meta" }, [""]);
  const unleash = el("button", { type: "button", class: "primary" }, ["Unleash gremlins"]);
  const progress = el("p", { class: "progress mono" }, [""]);
  const elapsed = el("p", { class: "elapsed mono meta" }, [""]);
  const viewResult = el("button", { type: "button", class: "secondary view-result", hidden: true }, ["View result"]);
  let listeners: (() => void)[] = [];
  let timer = 0;
  let t0 = 0;

  const check = () => {
    const r = checkRuns(runs.value);
    const s = checkSeed(seed.value);
    runsMsg.textContent = r.ok ? "" : r.message;
    seedMsg.textContent = s.ok ? "" : s.message;
    return { runsOk: r.ok, seedOk: s.ok, runs: r.ok ? r.value : 0, seed: s.ok ? s.value : 0 };
  };
  for (const f of [runs, seed]) f.addEventListener("input", () => listeners.forEach((fn) => fn()));

  const node = el("section", { class: "panel", "aria-labelledby": "campaign-title" }, [
    el("h2", { class: "region-title", id: "campaign-title" }, ["Campaign"]),
    el("div", { class: "field-row" }, [
      el("label", { for: "runs-field" }, ["Runs (N)"]),
      runs,
      runsMsg,
    ]),
    el("div", { class: "field-row" }, [el("label", { for: "seed-field" }, ["Seed"]), seed, seedMsg]),
    unleash,
    progress,
    elapsed,
    viewResult,
  ]);

  return {
    node,
    unleash,
    viewResult,
    values: check,
    onFieldChange(fn) {
      listeners = [...listeners, fn];
    },
    setProgress(k, n) {
      progress.textContent = progressText(k, n);
    },
    startTimer() {
      if (timer !== 0) clearInterval(timer);
      t0 = performance.now();
      elapsed.textContent = elapsedText(0);
      timer = window.setInterval(() => {
        elapsed.textContent = elapsedText(performance.now() - t0);
      }, 250);
    },
    stopTimer() {
      if (timer !== 0) {
        clearInterval(timer);
        timer = 0;
        elapsed.textContent = elapsedText(performance.now() - t0);
      }
    },
    showViewResult(show) {
      viewResult.hidden = !show;
    },
  };
}

export const SHRINK_LABEL = "The smallest replay this reducer found.";
export const MINIMALITY_TOOLTIP = "1-minimal by deletion: removing any one of these events stops this failure.";
export const BUDGET_TEXT = "The reducer stopped at its budget; removing one event may still break the rule.";

export interface CounterView {
  node: HTMLElement;
  activity: HTMLElement;
  reset(): void;
  running(x: number, y: number, k: number): void;
  done(x: number, y: number, k: number, stoppedAtBudget: boolean): void;
}

export function counter(): CounterView {
  const counts = el("span", { class: "counts mono" }, [""]);
  const cand = el("span", { class: "cands mono meta" }, [""]);
  const label = el("span", { class: "shrink-label" }, [""]);
  const tip = el("span", { class: "tooltip", role: "tooltip", id: "minimality-tip" }, [MINIMALITY_TOOLTIP]);
  const note = el("span", { class: "meta budget-note" }, [""]);
  const activity = el("span", { class: "activity meta" }, [""]);
  const node = el("div", { class: "counter" }, [counts, cand, label, note]);
  return {
    node,
    activity,
    reset() {
      counts.textContent = "";
      cand.textContent = "";
      setChildren(label, []);
      label.removeAttribute("tabindex");
      label.removeAttribute("aria-describedby");
      label.classList.remove("has-tip");
      note.textContent = "";
    },
    running(x, y, k) {
      counts.textContent = shrinkText(x, y);
      cand.textContent = candidatesText(k);
    },
    done(x, y, k, stoppedAtBudget) {
      counts.textContent = shrinkText(x, y);
      cand.textContent = candidatesText(k);
      if (stoppedAtBudget) {
        setChildren(label, [SHRINK_LABEL]);
        note.textContent = BUDGET_TEXT;
      } else {
        setChildren(label, [SHRINK_LABEL, tip]);
        label.setAttribute("tabindex", "0");
        label.setAttribute("aria-describedby", "minimality-tip");
        label.classList.add("has-tip");
      }
    },
  };
}

export interface StoryView {
  node: HTMLElement;
  show(text: string | null, isError: boolean): void;
}

export function storyCard(): StoryView {
  const body = el("p", { class: "story-text" }, [""]);
  const node = el("section", { class: "panel story", "aria-labelledby": "story-title", hidden: true }, [
    el("h2", { class: "region-title", id: "story-title" }, ["What happened"]),
    body,
  ]);
  return {
    node,
    show(text, isError) {
      node.hidden = text === null;
      body.textContent = text ?? "";
      body.classList.toggle("error-text", isError);
    },
  };
}