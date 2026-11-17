// Stage verdict cards: BROKE, HELD and COULDN'T TELL, as the Aside shows them.
// Nothing inside a card scrolls. Copy comes from model/stage-copy.ts.
import type { Rule, RuleSet } from "../../../engine/rules/ir";
import type { Verdict } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import { ruleBySentence } from "../model/rules";
import type { PeripheralUses } from "../model/stage-copy";
import { STAGE_TEXT, VERDICT_WORD, brokeTryLine, causeLine, couldntTellCard, heldPlainText } from "../model/stage-copy";
import { techOnly } from "./details";
import type { Child } from "./dom";
import { el } from "./dom";
import { boundedTraceIcon, brokenLinkIcon, questionIcon } from "./icons";

// Pinned by tests/ui/copy-scan.test.ts, which scans both strings with the word lists.
export const CARD_COPY = {
  exactHeading: "Exact story",
  movesHeading: "The moves that matter",
} as const;

/** The Rule of a BROKE verdict, found in the rule set by its Canonical_Sentence; null for any other verdict. */
export function violatedRule(ruleSet: RuleSet, v: Verdict): Rule | null {
  if (v.verdict !== "BROKE") return null;
  const found = ruleBySentence(ruleSet, v.trace.violation.rule);
  return found === null ? null : found.rule;
}

/**
 * The story state of the BROKE card. The card never shows the plain story (it lives in the "What happened" tab).
 * While the state is "pending" the card shows a placeholder in place of the cause line.
 */
export type StoryState = { kind: "none" } | { kind: "pending" } | { kind: "ready"; text: string };

export interface StageBrokeInput {
  /** Null for the Upload_Device: no Cause_Line is ever shown. */
  exampleId: ExampleId | null;
  plainBroke: string;
  /** `violatingRunIndex` of the buggy Campaign. */
  violatingRunIndex: number;
  tries: number;
  /** UI_Clock milliseconds from the Campaign request to its `campaign-done` message. */
  elapsedMs: number;
  /** Trace_Fingerprint of the reduced replay on the buggy build, or null while reducing or without a result. */
  fingerprint: string | null;
  story: StoryState;
}

export interface StageHeldInput {
  /** `verdict.text`, passed through unchanged. */
  text: string;
  /** Tries of the buggy campaign (M), for the plain sentence above the text. */
  tries: number;
}

export interface StageCouldntTellInput {
  reason: string;
  peripheralUses?: PeripheralUses;
}

export type StageCardInput =
  | ({ kind: "BROKE" } & StageBrokeInput)
  | ({ kind: "HELD" } & StageHeldInput)
  | ({ kind: "COULDN'T TELL" } & StageCouldntTellInput);

function cardShell(modifier: "broke" | "held" | "tell", word: string, iconNode: SVGElement, body: Child[]): HTMLElement {
  // The fade-in and the coral edge are CSS animations on `.verdict`; Reduced_Motion turns them into one step.
  return el("article", { class: `verdict verdict--${modifier} verdict-card verdict-card--${modifier}`, tabindex: -1, "aria-label": word }, [
    el("header", { class: "verdict-title" }, [iconNode, el("h2", { class: "verdict-heading verdict-word" }, [word])]),
    el("div", { class: "verdict-finding" }, body),
  ]);
}

export function stageBrokeCard(i: StageBrokeInput): HTMLElement {
  const cause = i.exampleId === null ? null : causeLine(i.exampleId, i.fingerprint);
  // The verdict word, the plain BROKE sentence, the cause line and the try line. Until the cause line can be
  // known the placeholder holds its place.
  return cardShell("broke", VERDICT_WORD.broke, brokenLinkIcon(), [
    el("p", { class: "plain-broke" }, [i.plainBroke]),
    cause !== null
      ? el("p", { class: "cause-line" }, [cause])
      : i.story.kind === "pending"
        ? el("p", { class: "story-pending meta" }, [STAGE_TEXT.storyPlaceholder])
        : null,
    el("p", { class: "broke-try meta" }, [brokeTryLine(i.violatingRunIndex, i.tries, i.elapsedMs)]),
  ]);
}

export function stageHeldCard(i: StageHeldInput): HTMLElement {
  return cardShell("held", VERDICT_WORD.held, boundedTraceIcon(), [
    el("p", { class: "held-plain" }, [heldPlainText(i.tries)]),
    el("p", { class: "held-text" }, [i.text]),
  ]);
}
export function stageCouldntTellCard(i: StageCouldntTellInput): HTMLElement {
  // The use lines are built for the Technical_View and wrapped in techOnly, so the Plain_View hides them.
  const c = couldntTellCard(i.reason, true, i.peripheralUses);
  return cardShell("tell", VERDICT_WORD.couldntTell, questionIcon(), [
    el("p", { class: "tell-headline" }, [c.headline]),
    el(
      "ul",
      { class: "reason-lines" },
      c.reasons.map((r) => el("li", {}, [r])),
    ),
    c.uses.length === 0
      ? null
      : techOnly(
          el(
            "ul",
            { class: "peripheral-uses meta mono" },
            c.uses.map((u) => el("li", {}, [u])),
          ),
        ),
    el("p", { class: "tell-footer meta" }, [c.footer]),
  ]);
}

export function stageVerdictCard(i: StageCardInput): HTMLElement {
  switch (i.kind) {
    case "BROKE":
      return stageBrokeCard(i);
    case "HELD":
      return stageHeldCard(i);
    case "COULDN'T TELL":
      return stageCouldntTellCard(i);
  }
}
