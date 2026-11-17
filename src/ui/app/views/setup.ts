// Setup: "1 · PICK A DEVICE", "2 · RULE", "3 · GREMLINS", the primary button and the Setup_Summary.
// DOM builder with callbacks and state setters only; the page owns the state.
import { EXAMPLE_IDS } from "../data/examples";
import type { ExampleBundle, ExampleId, FileProblem } from "../data/examples";
import { EXAMPLE_COPY } from "../model/example-copy";
import { checkLimit, presetFor, presetHeadline, presetRuleText } from "../model/presets";
import { SETUP, WHY, setupSummary, triesLine } from "../model/stage-copy";
import { UI_COPY } from "../model/ui-copy";
import { techOnly } from "./details";
import { el, setChildren } from "./dom";
import { deviceArt } from "./icons";
import { picker } from "./picker";
import type { PickerView } from "./picker";
import { appendSentence, ruleArea } from "./rule-box";
import type { RuleAreaView } from "./rule-box";

export interface SetupCallbacks {
  /** A Device_Card was pressed (not for the Current_Example, not while busy). */
  onDevice(id: ExampleId): void;
  /** A Gremlin_Chip was pressed. */
  onToggleGremlin(id: string): void;
  /** New rules text: a valid Limit_Control value, a Rule_Box edit, an inserted pattern or a reset. */
  onRuleText(text: string): void;
  /** "Unleash gremlins" or "Run again". */
  onUnleash(): void;
  /** The user opened or closed the setup with "Change setup". `expanded` is true while the body shows. */
  onExpandChange?(expanded: boolean): void;
}

export interface SetupView {
  node: HTMLElement;
  /** The Technical_View rule editor (Canonical_Sentence lines, Rule_Box, errors, patterns). */
  rules: RuleAreaView;
  /** The Gremlin_Chips and the "N more need other inputs" list. */
  gremlins: PickerView;
  /** Marks one Device_Card as the Current_Example. */
  setSelectedDevice(id: ExampleId): void;
  /** Lists each failing file with its reasons; an empty list clears the problems. */
  setProblems(problems: readonly FileProblem[]): void;
  /** The Current_Example: its "Why it matters" text, its Limit_Control and its default limit. Null when it did not load. */
  setExample(example: ExampleBundle | null): void;
  /** The Rule_Headline. */
  setHeadline(text: string): void;
  /** The "<M> tries · ..." line; null when the tries field is not valid. */
  setTries(tries: number | null, runCycles: number): void;
  /** False while the page forbids a run (no example, a rule error, no gremlin, a bad field, a running job). */
  setUnleashEnabled(ok: boolean): void;
  /** While a job runs: Device_Cards, "Change rule ▾", the limit field and both start buttons are disabled. */
  setBusy(busy: boolean): void;
  /** After a Campaign: the Setup_Summary replaces the expanded setup. Gremlin names are in Selected_Gremlin_Set order. */
  setCollapsed(collapsed: boolean, gremlinNames: readonly string[]): void;
  /** True while the Limit_Control holds a value that is not a whole number from 1 to 60,000. */
  limitInvalid(): boolean;
  /** True while the setup body shows (before a run, or re-expanded with "Change setup"). */
  expanded(): boolean;
}

/** Splits a heading at its last " · " when it has two or more, so the tail can use the note style. */
function titleParts(text: string): { head: string; note: string } {
  const parts = text.split(" \u00b7 ");
  if (parts.length <= 2) return { head: text, note: "" };
  return { head: parts.slice(0, -1).join(" \u00b7 "), note: ` \u00b7 ${parts[parts.length - 1] as string}` };
}

function sectionTitle(id: string, text: string): HTMLElement {
  const { head, note } = titleParts(text);
  return el("h2", { class: "section-title", id }, [head, note === "" ? null : el("span", { class: "section-note" }, [note])]);
}

export function createSetup(cb: SetupCallbacks): SetupView {
  let selected: ExampleId = EXAMPLE_IDS[0];
  let example: ExampleBundle | null = null;
  let busy = false;
  let enabled = false;
  let collapsed = false;
  let userOpen = false;
  let invalid = false;
  let names: readonly string[] = [];
  let headline = "";

  // Section 1.
  const cards = new Map<ExampleId, HTMLButtonElement>();
  for (const id of EXAMPLE_IDS) {
    const btn = el("button", { type: "button", class: "device-card", "aria-pressed": "false", "data-example": id }, [
      deviceArt(id),
      el("span", { class: "device-title" }, [EXAMPLE_COPY[id].title]),
      el("span", { class: "device-line" }, [EXAMPLE_COPY[id].line]),
    ]);
    btn.addEventListener("click", () => {
      if (id === selected || busy) return;
      cb.onDevice(id);
    });
    cards.set(id, btn);
  }
  const problems = el("div", { class: "file-problems", "aria-live": "polite" });
  const slot = el("div", { class: "device-slot", "aria-hidden": "true" });

  // Section 2.
  const headlineNode = el("p", { class: "rule-headline" });
  const why = el("p", { class: "why-line" });
  const menuBtn = el("button", { type: "button", class: "secondary", "aria-expanded": "false", "aria-controls": "preset-menu" }, [
    SETUP.changeRule,
  ]);
  const presetLine = el("p", { class: "meta preset-line" });
  const limitInput = el("input", {
    id: "limit-field",
    class: "field mono",
    type: "text",
    inputmode: "numeric",
    value: "",
    "aria-describedby": "limit-msg",
    "aria-invalid": "false",
  });
  const limitMsg = el("p", { id: "limit-msg", class: "field-msg meta", "aria-live": "polite" }, [""]);
  const limitControl = el("div", { class: "limit-control" }, [
    el("label", { for: "limit-field" }, [SETUP.limitLabel]),
    limitInput,
    limitMsg,
  ]);
  const menu = el("div", { id: "preset-menu", class: "preset-menu", hidden: true }, [presetLine, limitControl]);
  const rules = ruleArea({
    onText: (t) => cb.onRuleText(t),
    onInsert: (s) => {
      const t = appendSentence(rules.getText(), s);
      rules.setText(t);
      cb.onRuleText(t);
    },
    onReset: () => {
      if (example === null) return;
      resetLimit();
      rules.setText(example.rulesText);
      cb.onRuleText(example.rulesText);
    },
  });

  // Section 3.
  const gremlins = picker((id) => cb.onToggleGremlin(id));

  // Primary button and the tries line.
  const unleash = el("button", { type: "button", class: "primary" }, [UI_COPY.unleash]);
  const triesNode = el("p", { class: "meta tries-line" }, [""]);
  const action = el("div", { class: "setup-action" }, [unleash, triesNode]);
  unleash.addEventListener("click", () => cb.onUnleash());

  // Setup_Summary.
  const summaryText = el("p", { class: "setup-summary-text" }, [""]);
  const changeBtn = el("button", { type: "button", class: "secondary", "aria-expanded": "false", "aria-controls": "setup-body" }, [
    SETUP.changeSetup,
  ]);
  const againBtn = el("button", { type: "button", class: "secondary" }, [SETUP.runAgain]);
  const summary = el("div", { class: "setup-summary", hidden: true }, [
    summaryText,
    el("div", { class: "setup-summary-actions" }, [changeBtn, againBtn]),
  ]);
  againBtn.addEventListener("click", () => cb.onUnleash());
  changeBtn.addEventListener("click", () => {
    userOpen = !userOpen;
    paint();
    cb.onExpandChange?.(!collapsed || userOpen);
  });

  const inner = el("div", { class: "setup-inner" }, [
    el("section", { class: "setup-section", "aria-labelledby": "setup-device-title" }, [
      sectionTitle("setup-device-title", SETUP.deviceHeading),
      el("div", { class: "device-grid" }, [...cards.values(), slot]),
      problems,
    ]),
    el("section", { class: "setup-section", "aria-labelledby": "setup-rule-title" }, [
      sectionTitle("setup-rule-title", SETUP.ruleHeading),
      headlineNode,
      why,
      menuBtn,
      menu,
      techOnly(rules.node),
    ]),
    el("section", { class: "setup-section", "aria-labelledby": "setup-gremlin-title" }, [
      sectionTitle("setup-gremlin-title", SETUP.gremlinHeading),
      gremlins.node,
    ]),
    action,
  ]);
  const body = el("div", { id: "setup-body", class: "setup-body" }, [inner]);
  const node = el("section", { class: "setup" }, [summary, body]);

  function resetLimit(): void {
    const def = example === null ? null : presetFor(example.id).limitDefault;
    limitInput.value = def === null ? "" : String(def);
    limitInput.setAttribute("aria-invalid", "false");
    limitMsg.textContent = "";
    invalid = false;
  }

  function paintSummary(): void {
    summaryText.textContent = setupSummary(EXAMPLE_COPY[selected].title, headline, names);
  }

  function paint(): void {
    const closed = collapsed && !userOpen;
    node.classList.toggle("is-collapsed", closed);
    node.classList.toggle("is-locked", busy);
    // A collapsed body stays in the page for the height transition, so it must not take focus.
    if (closed) inner.setAttribute("inert", "");
    else inner.removeAttribute("inert");
    summary.hidden = !collapsed;
    action.hidden = closed;
    changeBtn.setAttribute("aria-expanded", collapsed && userOpen ? "true" : "false");
    for (const [id, btn] of cards) {
      const on = id === selected;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("is-selected", on);
      btn.disabled = busy;
    }
    const offUnleash = busy || !enabled || invalid;
    unleash.disabled = offUnleash;
    againBtn.disabled = offUnleash;
    menuBtn.disabled = busy;
    limitInput.disabled = busy;
    paintSummary();
  }

  menuBtn.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  limitInput.addEventListener("input", () => {
    if (example === null || busy) return;
    const r = checkLimit(limitInput.value);
    if (!r.ok) {
      // Keep the last valid rule set; show the reason and block the run.
      invalid = true;
      limitInput.setAttribute("aria-invalid", "true");
      limitMsg.textContent = r.reason;
      paint();
      return;
    }
    invalid = false;
    limitInput.setAttribute("aria-invalid", "false");
    limitMsg.textContent = "";
    const text = presetRuleText(example, r.n);
    rules.setText(text);
    cb.onRuleText(text);
    // The preset headline follows the limit, so it is set after the page has painted its own.
    view.setHeadline(presetHeadline(example.id, r.n));
    paint();
  });

  const view: SetupView = {
    node,
    rules,
    gremlins,
    setSelectedDevice(id) {
      selected = id;
      paint();
    },
    setProblems(list) {
      setChildren(
        problems,
        list.map((p) =>
          el("div", { class: "file-problem" }, [
            el("p", { class: "mono file-problem-name" }, [p.file]),
            el(
              "ul",
              {},
              p.reasons.map((r) => el("li", { class: "file-problem-reason" }, [r])),
            ),
          ]),
        ),
      );
    },
    setExample(ex) {
      example = ex;
      resetLimit();
      const def = ex === null ? null : presetFor(ex.id).limitDefault;
      limitControl.hidden = def === null;
      why.textContent = ex === null ? "" : WHY[ex.id];
      presetLine.textContent = ex === null ? "" : EXAMPLE_COPY[ex.id].headline;
      menu.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.hidden = ex === null;
      paint();
    },
    setHeadline(text) {
      headline = text;
      headlineNode.textContent = text;
      paintSummary();
    },
    setTries(tries, runCycles) {
      triesNode.textContent = tries === null ? UI_COPY.sendsInvalid : triesLine(tries, runCycles);
    },
    setUnleashEnabled(ok) {
      enabled = ok;
      paint();
    },
    setBusy(b) {
      busy = b;
      paint();
    },
    setCollapsed(c, gremlinNames) {
      collapsed = c;
      userOpen = false;
      names = gremlinNames;
      paint();
    },
    limitInvalid: () => invalid,
    expanded: () => !collapsed || userOpen,
  };
  paint();
  return view;
}
