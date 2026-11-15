// heartbeat: Buggy_Sketch Example_Campaign and Replay_Run span.
// Passing tests are evidence, not proof.

import { describe, expect, it } from "vitest";
import { render } from "../../src/engine/rules/render";
import type { Rule } from "../../src/engine/rules/ir";
import { untriggeredRules } from "../../src/engine/rules/trigger";
import type { OutputEvent, RunResult, ScheduledInput } from "../../src/engine/types";
import { heldText } from "../../src/engine/verdict";
import {
  TEST_TIMEOUT_MS,
  buildScriptedEvents,
  comparePrefix,
  cyclesPerMs,
  floatingFindings,
  gremlinCoverage,
  gremlinEventCount,
  loadExample,
  readHex,
  replayEnd,
  replayRun,
  runExampleCampaign,
  scriptedRun,
  spanLine,
  violationSpan,
} from "./examples-support";

const ex = loadExample("heartbeat");

/** The Rule whose Canonical_Sentence is the one the Violation names (not chosen by index). */
function ruleNamedBy(sentence: string): Rule {
  const hits = ex.ruleSet.filter((r) => {
    const out = render(r);
    return out.ok && out.sentence === sentence;
  });
  if (hits.length !== 1) {
    throw new Error(`cannot tell which Rule the Violation names: "${sentence}" matches ${hits.length} of ${ex.ruleSet.length} Rules`);
  }
  return hits[0];
}

describe("heartbeat Buggy_Sketch campaign and span", () => {
  it(
    "breaks, replays to the Replay_End with a span of at least 16,000 cycles, and a Scripted_Run agrees",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const { result } = runExampleCampaign(ex, "buggy");
      expect(result.verdict.verdict).toBe("BROKE");
      expect(result.violatingRunIndex).not.toBeNull();
      if (result.verdict.verdict !== "BROKE") throw new Error("unreachable: verdict is not BROKE");
      const trace = result.verdict.trace;
      expect(trace.violation).toBeTruthy();

      expect(result.violatingRunIndex).toBe(1);
      expect(trace.violation.cycle).toBe(12811661);
      expect(gremlinEventCount(trace)).toBe(2);

      const v = trace.violation.cycle;
      console.log(
        `campaign heartbeat buggy | seed=${ex.meta.campaignSeed} | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ` +
          `violatingRunIndex=${String(result.violatingRunIndex)} | v=${v} | v=${(v / cyclesPerMs).toFixed(3)} ms | ` +
          `gremlin events=${gremlinEventCount(trace)}`,
      );

      // Replay_Run to the Replay_End, prefix check against the trace.
      const M = replayEnd(ex.meta);
      const edges = replayRun(readHex("heartbeat", "buggy"), ex.fixture, trace.eventList, M);
      expect(comparePrefix(trace.outputEvents, edges)).toBeNull();

      const rule = ruleNamedBy(trace.violation.rule);
      const span = violationSpan(rule, v, edges, M);
      console.log(spanLine("heartbeat", trace.violation.rule, span));
      console.log(
        `span detail heartbeat | v=${v} cycles | v=${(v / cyclesPerMs).toFixed(3)} ms | span=${span.spanCycles} cycles | ` +
          `${(span.spanCycles / cyclesPerMs).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);

      // Cross-check: Scripted_Run of the trace's event list gives the same first Violation.
      const scripted = scriptedRun(ex, "buggy", trace.eventList, ex.meta.runCycles, { untilEnd: false });
      console.log(
        `cross-check heartbeat | campaign: ${trace.violation.rule} @ ${trace.violation.cycle} | ` +
          `scripted: ${scripted.violations[0]?.rule ?? "none"} @ ${scripted.violations[0]?.cycle ?? "none"}`,
      );
      expect(scripted.violations.length).toBeGreaterThan(0);
      expect(scripted.violations[0]).toEqual({ rule: trace.violation.rule, cycle: trace.violation.cycle });
    },
  );
});

// ---------------------------------------------------------------------------
// Fixed_Sketch campaign (task 8.4). Passing tests are evidence, not proof.

interface LevelSpan {
  runIndex: number;
  level: 0 | 1;
  start: number;
  end: number;
  open: boolean;
}

/** Level spans of HEARTBEAT: closed spans between consecutive level changes, plus the open span at runCycles. */
function heartbeatSpans(run: RunResult, runCycles: number): LevelSpan[] {
  const sorted = run.outputEvents
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.cycle - b.e.cycle || a.i - b.i)
    .map((x) => x.e)
    .filter((e: OutputEvent) => e.signal === "HEARTBEAT");
  const changes: OutputEvent[] = [];
  for (const e of sorted) {
    if (changes.length === 0 || changes[changes.length - 1].value !== e.value) changes.push(e);
  }
  const spans: LevelSpan[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.value !== 0 && c.value !== 1) continue;
    const next = changes[i + 1];
    if (next) spans.push({ runIndex: run.runIndex, level: c.value, start: c.cycle, end: next.cycle, open: false });
    else spans.push({ runIndex: run.runIndex, level: c.value, start: c.cycle, end: runCycles, open: true });
  }
  return spans;
}

/** PULSE active intervals [a, b): applied value 0 until the next applied value 1 (or "release"), or the run end. */
function pulseIntervals(run: RunResult, runCycles: number, endOnRelease: boolean): [number, number][] {
  const list = run.appliedInputs
    .filter((a): a is typeof a & { value: 0 | 1 | "release" } => a.signal === "PULSE" && "value" in a)
    .sort((a, b) => a.appliedCycle - b.appliedCycle);
  const out: [number, number][] = [];
  let from: number | null = null;
  for (const a of list) {
    if (a.value === 0) {
      if (from === null) from = a.appliedCycle;
    } else if ((a.value === 1 || endOnRelease) && from !== null) {
      out.push([from, a.appliedCycle]);
      from = null;
    }
  }
  if (from !== null) out.push([from, runCycles]);
  return out;
}

const fmtMs = (c: number): string => (c / cyclesPerMs).toFixed(3);

describe("heartbeat Fixed_Sketch campaign", () => {
  it(
    "holds, triggers both rules under a stuck event, and reports gremlin events and HEARTBEAT spans",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      // D21: the wall clock is named only here, never in examples-support.ts or src/engine/.
      const { result, runs, durationMs } = runExampleCampaign(ex, "fixed", () => performance.now());
      console.log(
        `campaign heartbeat fixed | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ${String(durationMs)} ms`,
      );

      expect(result.verdict).toEqual({ verdict: "HELD", text: heldText(24), runs: 24 });
      expect(result.requestedRuns).toBe(24);
      expect(result.runsCompleted).toBe(24);
      expect(runs).toHaveLength(24);
      const n = runs.length;

      // No CannotCheck (including "run shorter than the rule window"), no Floating_Diagnostic.
      for (const r of runs) {
        expect(r.cannotCheck, `Run ${r.runIndex}: CannotCheck entries (checked ${n} Run_Results)`).toEqual([]);
      }
      expect(floatingFindings(runs), `Floating_Diagnostic or floating CannotCheck (checked ${n} Run_Results)`).toEqual([]);

      // Requirement 12.6, 12.7, 12.8: no skipped entry for stuck and an event below runCycles.
      const coverage = gremlinCoverage(runs, ex.meta.gremlinSet, ex.meta.runCycles);
      for (const spec of ex.meta.gremlinSet) {
        const c = coverage.find((g) => g.id === spec.id);
        expect(c, `${spec.id} is in the gremlinSet`).toBeDefined();
        expect(
          c!.skipped,
          `Requirement 12.6: Example heartbeat, Gremlin ${spec.id}, runsCompleted ${result.runsCompleted}, skipped entries: ${JSON.stringify(c!.skipped)}`,
        ).toEqual([]);
        expect(
          c!.eventsBelowRunCycles,
          `Requirement 12.7: Example heartbeat, Gremlin ${spec.id}, runsCompleted ${result.runsCompleted}, skipped entries: ${JSON.stringify(c!.skipped)}`,
        ).toBeGreaterThan(0);
      }

      // Requirement 12.2: per Rule, one Run_Result with a stuck event below runCycles whose own
      // untriggeredRules does not list that Rule.
      expect(ex.ruleSet).toHaveLength(2);
      const triggerLines: string[] = [];
      for (const rule of ex.ruleSet) {
        const rendered = render(rule);
        if (!rendered.ok) throw new Error("cannot render a heartbeat Rule");
        const sentence = rendered.sentence;
        const matching = runs.filter(
          (r) =>
            r.eventList.some((e) => e.gremlinId === "stuck" && e.cycle < ex.meta.runCycles) &&
            !untriggeredRules(ex.ruleSet, ex.fixture, [r]).includes(sentence),
        );
        triggerLines.push(`"${sentence}": ${matching.length} Run_Results (first Run ${matching[0]?.runIndex ?? "none"})`);
        expect(
          matching.length,
          `Requirement 12.2: Example heartbeat, rule "${sentence}": no Run_Result holds a stuck event below runCycles and the Trigger (checked ${n} Run_Results)`,
        ).toBeGreaterThan(0);
      }
      expect(untriggeredRules(ex.ruleSet, ex.fixture, runs), `untriggeredRules over ${n} Run_Results`).toEqual([]);

      // Information for the CP5 report (console output only).
      const text = result.verdict.verdict === "HELD" ? result.verdict.text : "";
      console.log(`verdict text | ${text}`);
      console.log(`runs completed | ${result.runsCompleted}`);
      console.log(`gremlin events | ${coverage.map((c) => `${c.id}=${c.eventsBelowRunCycles}`).join(", ")}`);
      console.log(`trigger runs | ${triggerLines.join(" | ")}`);

      const all: LevelSpan[] = runs.flatMap((r) => heartbeatSpans(r, ex.meta.runCycles));
      for (const level of [0, 1] as const) {
        const ofLevel = all.filter((s) => s.level === level);
        let best: LevelSpan | null = null;
        for (const s of ofLevel) if (best === null || s.end - s.start > best.end - best.start) best = s;
        console.log(
          best === null
            ? `longest HEARTBEAT ${level} level | none seen`
            : `longest HEARTBEAT ${level} level | Run ${best.runIndex} | ${best.end - best.start} cycles | ${fmtMs(best.end - best.start)} ms | ` +
                `${best.open ? "open" : "closed"} span ${best.start}..${best.end}`,
        );
      }

      for (const endOnRelease of [true, false]) {
        const outside: LevelSpan[] = [];
        for (const r of runs) {
          const intervals = pulseIntervals(r, ex.meta.runCycles, endOnRelease);
          for (const s of heartbeatSpans(r, ex.meta.runCycles)) {
            if (s.open) continue;
            if (intervals.some(([a, b]) => s.start < b && a < s.end)) continue;
            outside.push(s);
          }
        }
        const label = endOnRelease ? "PULSE interval ends at value 1 or release" : "PULSE interval ends at value 1 only";
        if (outside.length === 0) {
          console.log(`closed spans outside PULSE active intervals (${label}) | count=0`);
        } else {
          const lens = outside.map((s) => s.end - s.start);
          const min = Math.min(...lens);
          const max = Math.max(...lens);
          console.log(
            `closed spans outside PULSE active intervals (${label}) | count=${outside.length} | ` +
              `min=${min} cycles ${fmtMs(min)} ms | max=${max} cycles ${fmtMs(max)} ms`,
          );
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Scripted_Run tests (task 8.5). Event cycles are from design.md section 4.3.

const HB_RULE_SENTENCE = "HEARTBEAT is 1 must never last 600 ms or longer.";
const pPress = (cycle: number): ScheduledInput => ({ signal: "PULSE", value: 0, cycle });
const pRelease = (cycle: number): ScheduledInput => ({ signal: "PULSE", value: "release", cycle });

const HEARTBEAT_SINGLE_INPUT: ScheduledInput[] = [pPress(4_000_000), pRelease(5_600_000)];
const HEARTBEAT_MINIMAL_BUG_INPUT: ScheduledInput[] = [pPress(4_000_000)];

describe("heartbeat Scripted_Run tests", () => {
  it("Single_Input on the Buggy_Sketch gives no Violation", { timeout: TEST_TIMEOUT_MS }, () => {
    const list = buildScriptedEvents(ex.fixture, HEARTBEAT_SINGLE_INPUT, ex.meta.runCycles);
    const out = scriptedRun(ex, "buggy", list, ex.meta.runCycles, { untilEnd: false });
    console.log(`single input heartbeat buggy | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length}`);
    expect(out.violations).toEqual([]);
    expect(floatingFindings([], [{ name: "single input", outcome: out }])).toEqual([]);
  });

  it(
    "Minimal_Bug_Input breaks the Buggy_Sketch, the span reaches 16,000 cycles, and a fresh bridge repeats it",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const M = replayEnd(ex.meta);
      const list = buildScriptedEvents(ex.fixture, HEARTBEAT_MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      expect(out.violations.length).toBeGreaterThan(0);
      const first = out.violations[0];
      expect(first.rule).toBe(HB_RULE_SENTENCE);
      expect(first.cycle).toBeLessThan(ex.meta.runCycles);

      const span = violationSpan(ruleNamedBy(first.rule), first.cycle, out.outputEdges, M);
      console.log(spanLine("heartbeat", first.rule, span));
      console.log(
        `minimal bug input heartbeat buggy | v=${first.cycle} cycles | v=${(first.cycle / cyclesPerMs).toFixed(3)} ms | ` +
          `span=${span.spanCycles} cycles | ${(span.spanCycles / cyclesPerMs).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);
      expect(floatingFindings([], [{ name: "minimal bug input buggy", outcome: out }])).toEqual([]);

      // Fresh bridge, same HEX, Fixture and ordered event list.
      const again = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      console.log(
        `fresh-bridge repeat heartbeat | first: ${first.rule} @ ${first.cycle} | second: ${again.violations[0]?.rule ?? "none"} @ ${again.violations[0]?.cycle ?? "none"}`,
      );
      expect(again.violations[0]).toEqual(first);
    },
  );

  it(
    "Minimal_Bug_Input on the Fixed_Sketch gives no Violation and no CannotCheck",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const list = buildScriptedEvents(ex.fixture, HEARTBEAT_MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "fixed", list, ex.meta.runCycles, { untilEnd: false });
      const spans = heartbeatSpans({ runIndex: 0, outputEvents: out.outputEdges } as unknown as RunResult, ex.meta.runCycles);
      const closed = spans.filter((s) => !s.open).map((s) => s.end - s.start);
      const open = spans.filter((s) => s.open).map((s) => s.end - s.start);
      const fmt = (c: number): string => `${c} cycles ${fmtMs(c)} ms`;
      console.log(
        `minimal bug input heartbeat fixed | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length} | ` +
          `HEARTBEAT spans: closed=${closed.length}` +
          (closed.length > 0 ? ` min=${fmt(Math.min(...closed))} max=${fmt(Math.max(...closed))}` : "") +
          ` | longest open=${open.length > 0 ? fmt(Math.max(...open)) : "none"}`,
      );
      expect(out.violations).toEqual([]);
      expect(out.cannotCheck).toEqual([]);
      expect(floatingFindings([], [{ name: "minimal bug input fixed", outcome: out }])).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Behaviour Scripted_Runs (task 8.6). Cycles are from design.md section 4.3 and
// Requirement 10, criteria 3, 6, 7 and 9. Passing tests are evidence, not proof.

const HB_TOGGLE_MIN = 3_184_000; // 199 ms
const HB_TOGGLE_MAX = 3_232_000; // 202 ms
const HB_LEVEL_LIMIT = 9_600_000; // 600 ms
const HB_RELEASE_LIMIT = 3_232_000; // 202 ms after the Release

const HEARTBEAT_HELD_TO_END: ScheduledInput[] = [pPress(4_000_000)];
const HEARTBEAT_HOLD_150_MS: ScheduledInput[] = [pPress(4_000_000), pRelease(6_400_000)];

type HbVariant = "buggy" | "fixed";

function hbRun(variant: HbVariant, input: ScheduledInput[]) {
  const list = buildScriptedEvents(ex.fixture, input, ex.meta.runCycles);
  const out = scriptedRun(ex, variant, list, ex.meta.runCycles, { untilEnd: false });
  const spans = heartbeatSpans({ runIndex: 0, outputEvents: out.outputEdges } as unknown as RunResult, ex.meta.runCycles);
  return { out, spans };
}

const hbFmt = (c: number): string => `${c} cycles ${fmtMs(c)} ms`;

function printSpans(name: string, spans: LevelSpan[]): void {
  const closed = spans.filter((s) => !s.open).map((s) => s.end - s.start);
  const open = spans.filter((s) => s.open);
  console.log(
    `${name} | spans=${spans.length} closed=${closed.length}` +
      (closed.length > 0 ? ` closed min=${hbFmt(Math.min(...closed))} max=${hbFmt(Math.max(...closed))}` : "") +
      ` | open=${open.length > 0 ? open.map((s) => `level ${s.level} ${s.start}..${s.end} ${hbFmt(s.end - s.start)}`).join("; ") : "none"}`,
  );
  console.log(
    `${name} | all spans: ` +
      spans.map((s) => `L${s.level} ${s.start}..${s.end} (${s.end - s.start} cycles, ${fmtMs(s.end - s.start)} ms${s.open ? ", open" : ""})`).join("; "),
  );
}

/** First HEARTBEAT level change strictly after `cycle` (the first event of a new level after it). */
function firstChangeAfter(spans: LevelSpan[], cycle: number): number | null {
  const starts = spans.map((s) => s.start).filter((c) => c > cycle);
  return starts.length > 0 ? Math.min(...starts) : null;
}

describe("heartbeat behaviour Scripted_Runs", () => {
  for (const variant of ["buggy", "fixed"] as const) {
    it(
      `empty event list, ${variant} build: every closed HEARTBEAT span lies from 3,184,000 to 3,232,000 cycles`,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const { out, spans } = hbRun(variant, []);
        printSpans(`empty event list heartbeat ${variant}`, spans);
        const closed = spans.filter((s) => !s.open);
        expect(closed.length, "closed spans seen").toBeGreaterThan(0);
        for (const s of closed) {
          const len = s.end - s.start;
          expect(len, `closed span ${s.start}..${s.end} (level ${s.level})`).toBeGreaterThanOrEqual(HB_TOGGLE_MIN);
          expect(len, `closed span ${s.start}..${s.end} (level ${s.level})`).toBeLessThanOrEqual(HB_TOGGLE_MAX);
        }
        expect(floatingFindings([], [{ name: `empty ${variant}`, outcome: out }])).toEqual([]);
      },
    );
  }

  it(
    "Single_Input on the Buggy_Sketch: every level span is below 9,600,000 cycles",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const { out, spans } = hbRun("buggy", HEARTBEAT_SINGLE_INPUT);
      printSpans("single input heartbeat buggy", spans);
      const lens = spans.map((s) => s.end - s.start);
      const longest = spans.reduce((b, s) => (s.end - s.start > b.end - b.start ? s : b), spans[0]);
      console.log(
        `single-press arithmetic heartbeat buggy | longest level span=${hbFmt(longest.end - longest.start)} | ` +
          `level ${longest.level} ${longest.start}..${longest.end} ${longest.open ? "open" : "closed"} | limit=${HB_LEVEL_LIMIT} cycles`,
      );
      expect(spans.length).toBeGreaterThan(0);
      for (const l of lens) expect(l).toBeLessThan(HB_LEVEL_LIMIT);
      expect(spans.some((s) => s.open), "an open span at runCycles is present").toBe(true);
      expect(floatingFindings([], [{ name: "single input buggy", outcome: out }])).toEqual([]);
    },
  );

  for (const variant of ["buggy", "fixed"] as const) {
    it(
      `${variant} build: HEARTBEAT changes within 3,232,000 cycles after the Release`,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const { out, spans } = hbRun(variant, HEARTBEAT_SINGLE_INPUT);
        const release = 5_600_000;
        const first = firstChangeAfter(spans, release);
        console.log(
          `release delay heartbeat ${variant} | release=${release} | first HEARTBEAT change after release=${first ?? "none"} | ` +
            `delay=${first === null ? "none" : hbFmt(first - release)}`,
        );
        expect(first, "a HEARTBEAT change after the Release").not.toBeNull();
        expect(first! - release).toBeLessThanOrEqual(HB_RELEASE_LIMIT);
        expect(floatingFindings([], [{ name: `release ${variant}`, outcome: out }])).toEqual([]);
      },
    );
  }

  const heldCases: { name: string; input: ScheduledInput[]; pressEnd: number }[] = [
    { name: "PULSE held from 4,000,000 to the run end", input: HEARTBEAT_HELD_TO_END, pressEnd: 16_000_000 },
    { name: "150 ms hold (Release at 6,400,000)", input: HEARTBEAT_HOLD_150_MS, pressEnd: 6_400_000 },
  ];
  for (const c of heldCases) {
    it(
      `Fixed_Sketch, ${c.name}: every level span is below 9,600,000 cycles`,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const { out, spans } = hbRun("fixed", c.input);
        printSpans(`held heartbeat fixed (${c.name})`, spans);
        const while_ = spans.filter((s) => s.start >= 4_000_000 && s.start < c.pressEnd);
        console.log(
          `timeout behaviour heartbeat fixed (${c.name}) | HEARTBEAT changes while PULSE is held (4,000,000..${c.pressEnd}): ` +
            `${while_.length} | spans starting there: ` +
            while_.map((s) => `${s.start}..${s.end} (${fmtMs(s.end - s.start)} ms)`).join("; "),
        );
        expect(spans.length).toBeGreaterThan(0);
        for (const s of spans) {
          expect(s.end - s.start, `span ${s.start}..${s.end} (level ${s.level}${s.open ? ", open" : ""})`).toBeLessThan(HB_LEVEL_LIMIT);
        }
        expect(floatingFindings([], [{ name: `fixed ${c.name}`, outcome: out }])).toEqual([]);
      },
    );
  }
});
