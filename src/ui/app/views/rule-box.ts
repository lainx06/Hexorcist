// Rule_Area: Rule_Headline, Canonical_Sentence lines, "Edit rule", Rule_Box, Rule_Errors and
// Sentence_Pattern insert buttons. Callbacks and state setters only.
import type { RuleError } from "../model/rule-box";
import { plainOnly, techOnly } from "./details";
import { el, setChildren } from "./dom";

export const RULE_TEXT = {
  title: "Rule area",
  /** The technical heading while the rules differ from the example's: the exact sentences. */
  customTitle: "Exact rule",
  plainTitle: "Rule",
  plainError: "this doesn't look like a rule yet. Start from one of the patterns below.",
  edit: "Edit rule",
  close: "Close editor",
  reset: "Reset to the example rule",
  boxLabel: "Rules, one per line",
  patterns: "Rule patterns",
  insert: "Insert",
} as const;

export interface PatternItem {
  label: string;
  sentence: string;
}

export interface RuleAreaView {
  node: HTMLElement;
  setHeadline(text: string): void;
  /** True while the rules are not the example's own: the technical heading reads "Exact rule". */
  setCustom(custom: boolean): void;
  setSentences(sentences: readonly string[]): void;
  setText(text: string): void;
  getText(): string;
  setErrors(errors: readonly RuleError[]): void;
  setPatterns(items: readonly PatternItem[]): void;
  setOpen(open: boolean): void;
  /** Shows or hides "Reset to the example rule" (hidden for the Upload_Device). */
  setResetShown(on: boolean): void;
  /** Shows or hides "Edit rule" (hidden while the editor stays open for the Upload_Device). */
  setEditShown(on: boolean): void;
  /** While busy the Rule_Box is read-only and its buttons are disabled. */
  setBusy(busy: boolean): void;
}

export interface RuleAreaCallbacks {
  onText(text: string): void;
  onInsert(sentence: string): void;
  onReset(): void;
}

/** Plain text of a rule error: the line number and a short hint. Errors without a line number keep their text. */
export function plainRuleError(e: RuleError): string {
  const m = /^Line (\d+)/.exec(e.text);
  return m === null ? e.text : `Line ${m[1] as string}: ${RULE_TEXT.plainError}`;
}

/** Adds the sentence as a new last line, with a line break before it only when the text lacks one. */
export function appendSentence(text: string, sentence: string): string {
  if (text === "" || text.endsWith("\n")) return text + sentence;
  return `${text}\n${sentence}`;
}

export function ruleArea(cb: RuleAreaCallbacks): RuleAreaView {
  const headline = el("p", { class: "rule-headline" });
  const lines = el("div", { class: "rule-lines" });
  const edit = el("button", { type: "button", class: "secondary rule-edit-button", "aria-expanded": "false", "aria-controls": "rule-editor" }, [
    RULE_TEXT.edit,
  ]);
  const area = el("textarea", { id: "rule-box", class: "rule-box mono", rows: 4, spellcheck: "false", "aria-label": RULE_TEXT.boxLabel });
  const errors = el("ul", { class: "rule-errors", "aria-live": "polite" });
  const patterns = el("ul", { class: "pattern-list", "aria-label": RULE_TEXT.patterns });
  const reset = el("button", { type: "button", class: "secondary rule-reset-button" }, [RULE_TEXT.reset]);
  const editor = el("div", { id: "rule-editor", class: "rule-editor" }, [area, errors, patterns, reset]);
  editor.hidden = true;
  let busy = false;

  const insertButtons = (): HTMLButtonElement[] => Array.from(patterns.querySelectorAll("button"));
  const paintBusy = (): void => {
    area.readOnly = busy;
    reset.disabled = busy;
    for (const b of insertButtons()) b.disabled = busy;
  };
  const setOpen = (open: boolean): void => {
    editor.hidden = !open;
    // The rule shows once: the read-only box while closed, the text box while the editor is open.
    lines.hidden = open;
    edit.setAttribute("aria-expanded", open ? "true" : "false");
    edit.textContent = open ? RULE_TEXT.close : RULE_TEXT.edit;
  };

  edit.addEventListener("click", () => setOpen(editor.hidden));
  area.addEventListener("input", () => {
    if (!busy) cb.onText(area.value);
  });
  reset.addEventListener("click", () => {
    if (!busy) cb.onReset();
  });

  const techTitle = el("span", {}, [RULE_TEXT.title]);
  const node = el("section", { class: "panel", "aria-labelledby": "rule-area-title" }, [
    // The one button sits top right, beside the heading: "Edit rule", or "Close editor" while open.
    el("div", { class: "rule-area-head" }, [
      el("h2", { class: "region-title", id: "rule-area-title" }, [
        techOnly(techTitle),
        plainOnly(el("span", {}, [RULE_TEXT.plainTitle])),
      ]),
      edit,
    ]),
    headline,
    lines,
    editor,
  ]);

  return {
    node,
    setHeadline(text) {
      headline.textContent = text;
    },
    setCustom(custom) {
      techTitle.textContent = custom ? RULE_TEXT.customTitle : RULE_TEXT.title;
    },
    setSentences(sentences) {
      setChildren(
        lines,
        sentences.map((s) => techOnly(el("p", { class: "rule-sentence mono" }, [s]))),
      );
    },
    setText(text) {
      area.value = text;
    },
    getText() {
      return area.value;
    },
    setErrors(list) {
      setChildren(
        errors,
        list.map((e) =>
          el("li", { class: "rule-error" }, [
            techOnly(el("span", {}, [e.text])),
            plainOnly(el("span", {}, [plainRuleError(e)])),
          ]),
        ),
      );
    },
    setPatterns(items) {
      setChildren(
        patterns,
        items.map((p) => {
          const b = el("button", { type: "button", class: "secondary", "aria-label": `${RULE_TEXT.insert}: ${p.label}` }, [RULE_TEXT.insert]);
          b.addEventListener("click", () => {
            if (!busy) cb.onInsert(p.sentence);
          });
          return el("li", { class: "pattern" }, [el("span", { class: "pattern-label" }, [p.label]), el("code", { class: "mono" }, [p.sentence]), b]);
        }),
      );
      paintBusy();
    },
    setOpen,
    setResetShown(on) {
      reset.hidden = !on;
    },
    setEditShown(on) {
      edit.hidden = !on;
    },
    setBusy(b) {
      busy = b;
      paintBusy();
    },
  };
}
