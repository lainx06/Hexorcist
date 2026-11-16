// Header, rule panel, gremlin tiles, campaign controls, reduction counter and story card.
import type { Fixture } from "../../../engine/types";
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import { gremlinTile } from "../model/gremlin-tile";
import { candidatesText, elapsedSecondsText, progressText, shrinkArrowText } from "../model/format";
import { reductionSentence } from "../model/verdict-plain";
import { checkRuns, checkSeed } from "../model/fields";
import { applyDetails, currentDetails, plainOnly, techOnly, writeDetails } from "./details";
import { el, setChildren } from "./dom";
import { gremlinIcon } from "./icons";

export const UI_COPY = {
  switchLabel: "Technical details",
  switchOff: "Off",
  switchOn: "On",
  pitch: "Flashing AI-written firmware? Let the gremlins break it before your board does.",
  plainPitch: "AI wrote your gadget's code? Let gremlins break it here before it breaks for real.",
  campaignHeading: "Campaign",
  plainCampaignHeading: "Tries",
  emptyTech: "Run a campaign to inspect the result.",
  emptyPlain: "Press Unleash gremlins to start.",
  unleash: "Unleash gremlins",
  sendsMany: "Sends {n} gremlin tries at this program.",
  sendsOne: "Sends 1 gremlin try at this program.",
  sendsInvalid: "Fix the number of tries to continue.",
  plainRunning: "Try {n} of {m}",
  plainBroke: "Broke on try {n} of {m}, stopped early.",
  plainBrokeLast: "Broke on try {n} of {m}.",
  plainDone: "All {m} tries done.",
  plainDoneOne: "All 1 try done.",
  plainStopped: "Stopped after {k} of {m} tries.",
  tryHeading: "Events in the reduced replay",
  plainTryHeading: "Try removing a move",
  waiting: "waiting for a run",
  subtitle: "Runs in your browser",
  chip: "ATmega328P \u00b7 Browser only",
  whatHeading: "What is this?",
  whatText:
    "Small devices like traffic lights and garage doors run tiny programs. Hexorcist runs the real compiled program in your browser, sends mischievous gremlins to press its buttons at awkward moments, and checks your rules. If a rule breaks, it shrinks the attack down to the few moves that matter and replays it.",
  steps: [
    "1. Pick a device and a rule.",
    "2. Gremlins attack its inputs.",
    "3. See where it broke, shrunk to the few moves that matter.",
  ],
  runsLabel: "How many tries",
  seedLabel: "Seed (same number, same gremlins)",
  reducing: "Reducing",
  applyFix: "Try the fixed program",
  fixTitle: "What changed in the code",
  fixRegion: "Code changes",
  sketchLine: "buggy \u2192 fixed",
  pickOne: "Pick at least one gremlin.",
} as const;

/** Fills {name} slots of a copy template. */
export function fill(template: string, vars: Readonly<Record<string, number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/** "Sends N gremlin tries at this program." for a valid tries field. */
export function sendsText(n: number): string {
  return n === 1 ? UI_COPY.sendsOne : fill(UI_COPY.sendsMany, { n });
}

function detailsSwitch(): HTMLButtonElement {
  const state = el("span", { class: "switch-state" }, [currentDetails() ? UI_COPY.switchOn : UI_COPY.switchOff]);
  const btn = el("button", { type: "button", class: "switch", role: "switch", "aria-checked": currentDetails() ? "true" : "false" }, [
    el("span", { class: "switch-label" }, [UI_COPY.switchLabel]),
    state,
  ]);
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-checked") !== "true";
    btn.setAttribute("aria-checked", on ? "true" : "false");
    state.textContent = on ? UI_COPY.switchOn : UI_COPY.switchOff;
    applyDetails(btn.closest(".page") ?? document, on);
    writeDetails(on);
  });
  return btn;
}

export function header(): HTMLElement {
  return el("header", { class: "page-header" }, [
    el("div", { class: "brand-row" }, [
      el("h1", { class: "wordmark" }, ["Hexorcist"]),
      plainOnly(el("p", { class: "subtitle" }, [UI_COPY.subtitle])),
      techOnly(el("p", { class: "chip-line meta mono" }, [UI_COPY.chip])),
      detailsSwitch(),
    ]),
    el("p", { class: "pitch" }, [
      techOnly(el("span", {}, [UI_COPY.pitch])),
      plainOnly(el("span", {}, [UI_COPY.plainPitch])),
    ]),
    el("section", { class: "what-is-this", "aria-labelledby": "what-title" }, [
      el("h2", { class: "region-title", id: "what-title" }, [UI_COPY.whatHeading]),
      el("p", { class: "what-text" }, [UI_COPY.whatText]),
    ]),
    el(
      "ul",
      { class: "steps" },
      UI_COPY.steps.map((s) => el("li", { class: "step" }, [s])),
    ),
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
  /** After a campaign: brokeTry is the 1-based try that broke, or null when nothing broke. */
  setFinished(k: number, n: number, brokeTry: number | null): void;
  startTimer(): void;
  stopTimer(): void;
  showViewResult(show: boolean): void;
  /** Sets both fields to an Example's defaults and refreshes their messages. */
  setValues(runs: number, seed: number): void;
  /** Clears the progress and elapsed texts (Current_Example change). */
  clearStatus(): void;
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
  const unleash = el("button", { type: "button", class: "primary" }, [UI_COPY.unleash]);
  const progressTech = techOnly(el("p", { class: "progress mono" }, [""]));
  const progressPlain = plainOnly(el("p", { class: "progress mono" }, [""]));
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
    el("h2", { class: "region-title", id: "campaign-title" }, [
      techOnly(el("span", {}, [UI_COPY.campaignHeading])),
      plainOnly(el("span", {}, [UI_COPY.plainCampaignHeading])),
    ]),
    el("div", { class: "field-row" }, [
      el("label", { for: "runs-field" }, [UI_COPY.runsLabel]),
      runs,
      runsMsg,
    ]),
    techOnly(el("div", { class: "field-row" }, [el("label", { for: "seed-field" }, [UI_COPY.seedLabel]), seed, seedMsg])),
    unleash,
    progressTech,
    progressPlain,
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
      progressTech.textContent = progressText(k, n);
      progressPlain.textContent = fill(UI_COPY.plainRunning, { n: Math.min(k + 1, n), m: n });
    },
    setFinished(k, n, brokeTry) {
      progressTech.textContent = progressText(k, n);
      let text: string;
      if (brokeTry !== null) text = fill(brokeTry < n ? UI_COPY.plainBroke : UI_COPY.plainBrokeLast, { n: brokeTry, m: n });
      else if (k >= n) text = n === 1 ? UI_COPY.plainDoneOne : fill(UI_COPY.plainDone, { m: n });
      else text = fill(UI_COPY.plainStopped, { k, m: n });
      progressPlain.textContent = text;
    },
    startTimer() {
      if (timer !== 0) clearInterval(timer);
      t0 = performance.now();
      elapsed.textContent = elapsedSecondsText(0);
      timer = window.setInterval(() => {
        elapsed.textContent = elapsedSecondsText(performance.now() - t0);
      }, 250);
    },
    stopTimer() {
      if (timer !== 0) {
        clearInterval(timer);
        timer = 0;
        elapsed.textContent = elapsedSecondsText(performance.now() - t0);
      }
    },
    showViewResult(show) {
      viewResult.hidden = !show;
    },
    setValues(r, s) {
      runs.value = String(r);
      seed.value = String(s);
      check();
    },
    clearStatus() {
      if (timer !== 0) {
        clearInterval(timer);
        timer = 0;
      }
      progressTech.textContent = "";
      progressPlain.textContent = "";
      elapsed.textContent = "";
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
  /** A reduction error: the row shows no sentence, no Shrink_Label and no arrow text. */
  fail(): void;
  /** The plain sentence now shown, or "" when none. */
  summary(): string;
}

export function counter(): CounterView {
  const reducing = el("span", { class: "reducing" }, [UI_COPY.reducing]);
  const sentence = el("p", { class: "reduction-sentence" }, [""]);
  const counts = techOnly(el("span", { class: "counts mono" }, [""]));
  const cand = techOnly(el("span", { class: "cands mono meta" }, [""]));
  // Plain copy of the Shrink_Label; the technical copy below carries the Minimality_Tooltip.
  const plainLabel = plainOnly(el("span", { class: "shrink-label" }, [""]));
  const techLabel = techOnly(el("span", { class: "shrink-label" }, [""]));
  const tip = el("span", { class: "tooltip", role: "tooltip", id: "minimality-tip" }, [MINIMALITY_TOOLTIP]);
  const note = techOnly(el("span", { class: "meta budget-note" }, [""]));
  const activity = el("span", { class: "activity meta" }, [""]);
  reducing.hidden = true;
  const node = el("div", { class: "counter" }, [reducing, sentence, counts, cand, plainLabel, techLabel, note]);

  const clearLabels = (): void => {
    setChildren(plainLabel, []);
    setChildren(techLabel, []);
    techLabel.removeAttribute("tabindex");
    techLabel.removeAttribute("aria-describedby");
    techLabel.classList.remove("has-tip");
  };
  const clearAll = (): void => {
    reducing.hidden = true;
    sentence.textContent = "";
    counts.textContent = "";
    cand.textContent = "";
    note.textContent = "";
    clearLabels();
  };
  return {
    node,
    activity,
    reset: clearAll,
    fail: clearAll,
    summary: () => sentence.textContent ?? "",
    running(x, y, k) {
      reducing.hidden = false;
      sentence.textContent = "";
      counts.textContent = shrinkArrowText(x, y);
      cand.textContent = candidatesText(k);
    },
    done(x, y, k, stoppedAtBudget) {
      reducing.hidden = true;
      sentence.textContent = reductionSentence(x, y, stoppedAtBudget);
      counts.textContent = shrinkArrowText(x, y);
      cand.textContent = candidatesText(k);
      setChildren(plainLabel, [SHRINK_LABEL]);
      if (stoppedAtBudget) {
        setChildren(techLabel, [SHRINK_LABEL]);
        note.textContent = BUDGET_TEXT;
      } else {
        setChildren(techLabel, [SHRINK_LABEL, tip]);
        techLabel.setAttribute("tabindex", "0");
        techLabel.setAttribute("aria-describedby", "minimality-tip");
        techLabel.classList.add("has-tip");
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