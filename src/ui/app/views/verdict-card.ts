// The three verdict cards share one structure: title, finding, evidence scope, actions.
// Nothing inside a card scrolls: the opened gremlin log grows the card.
import { cycleText } from "../../../engine/reducer/story";
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Rule, RuleSet } from "../../../engine/rules/ir";
import type { Fixture, Verdict } from "../../../engine/types";
import { coverageLine } from "../model/coverage";
import type { Coverage } from "../model/coverage";
import { EXAMPLE_COPY } from "../model/example-copy";
import { GREMLIN_LEGEND } from "../model/labels";
import { distinctGremlinIds, reducedMoveLines } from "../model/moves";
import { ruleBySentence } from "../model/rules";
import {
  couldntTellHeadline,
  gremlinLogSummary,
  heldCardText,
  plainCoverageParts,
  reducedReplayNote,
  runOfText,
  storyHeading,
} from "../model/verdict-plain";
import type { BuildLabel } from "../model/verdict-text";
import { cardTitle, couldntTellLines, EMPTY_TRACE_TEXT, observedText, traceRows, uncheckedRows } from "../model/verdict-text";
import { techOnly } from "./details";
import type { Child } from "./dom";
import { el } from "./dom";
import { boundedTraceIcon, brokenLinkIcon, openBracketIcon } from "./icons";

export const CARD_COPY = {
  exactHeading: "Exact story",
  movesHeading: "The moves that matter",
} as const;

/** What the Story_Card shows once a reduction result and its replay exist. */
export interface CardStory {
  /** The Plain_Story text. */
  plain: string;
  /** The Exact_Story text, or null when the Engine returned an error (no heading then). */
  exact: string | null;
  /** The Reduced_List, for the Gremlin_Legend lines. */
  reducedList: readonly ReducerEvent[];
  reducedEventCount: number;
  originalEventCount: number;
}

export interface VerdictCardInput {
  build: BuildLabel;
  verdict: Verdict;
  ruleSet: RuleSet;
  runCount: number;
  seed: number;
  runCycles: number;
  coverage: Coverage;
  showBuildLabel: boolean;
  actions: Child[];
  /** Plain_Broke_Sentence of the Current_Example (or the custom one). Defaults to the crosswalk text. */
  plainBroke?: string;
  /** The Current_Example fixture, needed for the reduced moves list. */
  fixture?: Fixture;
  /** The Reduced_List once a reduction result exists; null or absent while reducing. */
  reducedList?: readonly ReducerEvent[] | null;
  /** The Story_Card content; null or absent shows no story. */
  story?: CardStory | null;
  /** Whether the Gremlin_Log is open when the card is made. Collapsed when absent. */
  logOpen?: boolean;
  onLogToggle?: (open: boolean) => void;
}

export function violatedRule(ruleSet: RuleSet, v: Verdict): Rule | null {
  if (v.verdict !== "BROKE") return null;
  const found = ruleBySentence(ruleSet, v.trace.violation.rule);
  return found === null ? null : found.rule;
}

function gremlinLog(eventList: readonly ReducerEvent[], open: boolean, onToggle: ((o: boolean) => void) | undefined): HTMLElement {
  const rows = traceRows(eventList);
  const body =
    rows.length === 0
      ? el("p", { class: "meta" }, [EMPTY_TRACE_TEXT])
      : el("table", { class: "trace-table mono", "aria-label": "Trace events" }, [
          el("thead", {}, [
            el("tr", {}, [
              el("th", { scope: "col" }, ["Time"]),
              el("th", { scope: "col" }, ["Signal"]),
              el("th", { scope: "col" }, ["Value"]),
              el("th", { scope: "col" }, ["Gremlin"]),
            ]),
          ]),
          el(
            "tbody",
            {},
            rows.map((r) =>
              el("tr", {}, [el("td", {}, [r.time]), el("td", {}, [r.signal]), el("td", {}, [r.value]), el("td", {}, [r.gremlin])]),
            ),
          ),
        ]);
  const node = el("details", { class: "gremlin-log", open }, [
    el("summary", { class: "gremlin-log-summary" }, [gremlinLogSummary(eventList)]),
    body,
  ]);
  if (onToggle !== undefined) node.addEventListener("toggle", () => onToggle(node.open));
  return node;
}

function storyCard(s: CardStory): HTMLElement {
  const ids = distinctGremlinIds(s.reducedList);
  return el("section", { class: "card-story", "aria-labelledby": "card-story-title" }, [
    el("h3", { class: "region-title", id: "card-story-title" }, [storyHeading()]),
    techOnly(el("p", { class: "meta mono reduced-note" }, [reducedReplayNote(s.reducedEventCount, s.originalEventCount)])),
    el("p", { class: "story-text" }, [s.plain]),
    ids.length === 0
      ? null
      : el(
          "ul",
          { class: "legend-lines meta" },
          ids.map((id) => el("li", {}, [Object.prototype.hasOwnProperty.call(GREMLIN_LEGEND, id) ? (GREMLIN_LEGEND[id] as string) : id])),
        ),
    s.exact === null
      ? null
      : techOnly(
          el("div", { class: "exact-story" }, [
            el("h4", { class: "region-title" }, [CARD_COPY.exactHeading]),
            el("p", { class: "story-text mono" }, [s.exact]),
          ]),
        ),
  ]);
}

export function verdictCard(input: VerdictCardInput): HTMLElement {
  const v = input.verdict;
  const title = cardTitle(v);
  let modifier: string;
  let iconNode: SVGElement;
  let finding: Child[];
  let scope: Child[];
  switch (v.verdict) {
    case "BROKE": {
      modifier = "broke";
      iconNode = brokenLinkIcon();
      const rule = violatedRule(input.ruleSet, v);
      const unchecked = uncheckedRows(v.unchecked);
      const moves =
        input.reducedList !== undefined && input.reducedList !== null && input.fixture !== undefined
          ? reducedMoveLines(input.reducedList, input.fixture)
          : null;
      finding = [
        el("p", { class: "plain-broke" }, [input.plainBroke ?? EXAMPLE_COPY.crosswalk.broke]),
        el("p", { class: "run-text" }, [runOfText(v.trace, input.runCount)]),
        techOnly(el("p", { class: "mono finding-rule" }, [v.trace.violation.rule])),
        techOnly(el("p", { class: "mono" }, [observedText(rule, v.trace.violation.cycle, v.trace.outputEvents)])),
        techOnly(el("p", { class: "meta mono" }, [`${cycleText(v.trace.violation.cycle)} cycles`])),
        techOnly(el("p", { class: "meta mono" }, [`Seed: ${String(input.seed)}`])),
      ];
      scope = [
        input.story === undefined || input.story === null ? null : storyCard(input.story),
        moves === null
          ? null
          : el("section", { class: "reduced-moves", "aria-labelledby": "reduced-moves-title" }, [
              el("h3", { class: "region-title", id: "reduced-moves-title" }, [CARD_COPY.movesHeading]),
              moves.length === 0
                ? el("p", { class: "meta" }, ["No gremlin move was needed."])
                : el(
                    "ul",
                    { class: "moves-list" },
                    moves.map((m) => el("li", {}, [m])),
                  ),
            ]),
        gremlinLog(v.trace.eventList, input.logOpen === true, input.onLogToggle),
        unchecked.length === 0
          ? null
          : el(
              "ul",
              { class: "meta unchecked" },
              unchecked.map((u) => el("li", {}, [el("span", { class: "mono" }, [u.rule]), ` ${u.reason}`])),
            ),
      ];
      break;
    }
    case "HELD": {
      modifier = "held";
      iconNode = boundedTraceIcon();
      const [sentence, exact] = heldCardText(input.build === "Fixed build" ? "fixed" : "buggy", v);
      finding = [el("p", { class: "held-sentence" }, [sentence]), el("p", { class: "held-text" }, [exact])];
      scope = [
        techOnly(
          el("p", { class: "meta mono coverage" }, [
            plainCoverageParts(coverageLine(input.coverage, v.runs, input.runCycles, input.seed)).join(" \u00b7 "),
          ]),
        ),
      ];
      break;
    }
    case "COULDN'T TELL": {
      modifier = "tell";
      iconNode = openBracketIcon();
      finding = [
        el("p", { class: "tell-headline" }, [couldntTellHeadline(v.reason)]),
        el(
          "ul",
          { class: "reason-lines" },
          couldntTellLines(v.reason).map((l) =>
            el("li", {}, [el("p", {}, [l.text]), ...l.hints.map((h) => el("p", { class: "hint meta" }, [h]))]),
          ),
        ),
      ];
      scope = [];
      break;
    }
  }
  return el("article", { class: `verdict verdict--${modifier}`, tabindex: -1, "aria-label": `${input.build}: ${title}` }, [
    input.showBuildLabel ? el("p", { class: "build-label meta" }, [input.build]) : null,
    el("header", { class: "verdict-title" }, [iconNode, el("h2", { class: "verdict-heading" }, [title])]),
    el("div", { class: "verdict-finding" }, finding),
    el("div", { class: "verdict-scope" }, scope),
    el("div", { class: "verdict-actions" }, input.actions),
  ]);
}
