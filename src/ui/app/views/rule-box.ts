// Rule_Area: Rule_Headline, Canonical_Sentence lines, "Edit rule", Rule_Box, Rule_Errors and
// Sentence_Pattern insert buttons. Callbacks and state setters only.
import type { RuleError } from "../model/rule-box";
import { techOnly } from "./details";
import { el, setChildren } from "./dom";

export const RULE_TEXT = {
  title: "Rule area",
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
  setSentences(sentences: readonly string[]): void;
  setText(text: string): void;
  getText(): string;
  setErrors(errors: readonly RuleError[]): void;
  setPatterns(items: readonly PatternItem[]): void;
  setOpen(open: boolean): void;
  /** While busy the Rule_Box is read-only and its buttons are disabled. */
  setBusy(busy: boolean): void;
}

export interface RuleAreaCallbacks {
  onText(text: string): void;
  onInsert(sentence: string): void;
  onReset(): void;
}

/** Adds the sentence as a new last line, with a line break before it only when the text lacks one. */
export function appendSentence(text: string, sentence: string): string {
  if (text === "" || text.endsWith("\n")) return text + sentence;
  return `${text}\n${sentence}`;
}

export function ruleArea(cb: RuleAreaCallbacks): RuleAreaView {
  const headline = el("p", { class: "rule-headline" });
  const lines = el("div", { class: "rule-lines" });
  const edit = el("button", { type: "button", class: "btn", "aria-expanded": "false", "aria-controls": "rule-editor" }, [
    RULE_TEXT.edit,
  ]);
  const area = el("textarea", { id: "rule-box", class: "rule-box mono", rows: 5, spellcheck: "false", "aria-label": RULE_TEXT.boxLabel });
  const errors = el("ul", { class: "rule-errors", "aria-live": "polite" });
  const patterns = el("ul", { class: "pattern-list", "aria-label": RULE_TEXT.patterns });
  const reset = el("button", { type: "button", class: "btn" }, [RULE_TEXT.reset]);
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

  const node = el("section", { class: "panel", "aria-labelledby": "rule-area-title" }, [
    el("h2", { class: "region-title", id: "rule-area-title" }, [RULE_TEXT.title]),
    headline,
    lines,
    edit,
    editor,
  ]);

  return {
    node,
    setHeadline(text) {
      headline.textContent = text;
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
        list.map((e) => el("li", { class: "rule-error" }, [e.text])),
      );
    },
    setPatterns(items) {
      setChildren(
        patterns,
        items.map((p) => {
          const b = el("button", { type: "button", class: "btn", "aria-label": `${RULE_TEXT.insert}: ${p.label}` }, [RULE_TEXT.insert]);
          b.addEventListener("click", () => {
            if (!busy) cb.onInsert(p.sentence);
          });
          return el("li", { class: "pattern" }, [el("span", { class: "pattern-label" }, [p.label]), el("code", { class: "mono" }, [p.sentence]), b]);
        }),
      );
      paintBusy();
    },
    setOpen,
    setBusy(b) {
      busy = b;
      paintBusy();
    },
  };
}
