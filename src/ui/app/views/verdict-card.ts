// The three verdict cards share one structure: title, finding, evidence scope, actions.
import type { Rule, RuleSet } from "../../../engine/rules/ir";
import type { Verdict } from "../../../engine/types";
import { coverageLine } from "../model/coverage";
import type { Coverage } from "../model/coverage";
import { ruleBySentence } from "../model/rules";
import type { BuildLabel } from "../model/verdict-text";
import {
  brokeScope,
  cardTitle,
  couldntTellLines,
  EMPTY_TRACE_TEXT,
  heldFinding,
  observedText,
  traceRows,
  uncheckedRows,
} from "../model/verdict-text";
import type { Child } from "./dom";
import { el } from "./dom";
import { boundedTraceIcon, brokenLinkIcon, openBracketIcon } from "./icons";

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
}

export function violatedRule(ruleSet: RuleSet, v: Verdict): Rule | null {
  if (v.verdict !== "BROKE") return null;
  const found = ruleBySentence(ruleSet, v.trace.violation.rule);
  return found === null ? null : found.rule;
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
      const sc = brokeScope(v.trace, input.runCount, input.seed);
      const rows = traceRows(v.trace.eventList);
      const unchecked = uncheckedRows(v.unchecked);
      finding = [
        el("p", { class: "mono finding-rule" }, [v.trace.violation.rule]),
        el("p", { class: "mono" }, [observedText(rule, v.trace.violation.cycle, v.trace.outputEvents)]),
      ];
      scope = [
        el("p", { class: "meta mono" }, [`${sc.runText} \u00b7 ${sc.seedText}`]),
        el("p", { class: "meta" }, ["The trace that caused this verdict:"]),
        rows.length === 0
          ? el("p", { class: "meta" }, [EMPTY_TRACE_TEXT])
          : el("div", { class: "trace-scroll", tabindex: 0, role: "region", "aria-label": "Trace events" }, [
              el("table", { class: "trace-table mono" }, [
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
              ]),
            ]),
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
      finding = [el("p", { class: "held-text" }, [heldFinding(v)])];
      scope = [
        el("p", { class: "meta mono coverage" }, [coverageLine(input.coverage, v.runs, input.runCycles, input.seed)]),
      ];
      break;
    }
    case "COULDN'T TELL": {
      modifier = "tell";
      iconNode = openBracketIcon();
      finding = [
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