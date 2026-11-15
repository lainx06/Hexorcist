// crosswalk: Buggy_Sketch Example_Campaign, Replay_Run span and Scripted_Run cross-check.
// Passing tests are evidence, not proof.

import { describe, expect, it } from "vitest";
import { compileRuleSet } from "../../src/engine/rules/compile";
import type { OutputEvent, ScheduledInput } from "../../src/engine/types";
import { heldText } from "../../src/engine/verdict";
import {
  TEST_TIMEOUT_MS,
  bothOnAt,
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

const ex = loadExample("crosswalk");

describe("crosswalk Buggy_Sketch campaign and span", () => {
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
      expect(result.violatingRunIndex).toBe(3);
      expect(trace.violation.cycle).toBe(15647543);
      expect(gremlinEventCount(trace)).toBe(8);

      const v = trace.violation.cycle;
      console.log(
        `campaign crosswalk buggy | seed=${ex.meta.campaignSeed} | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ` +
          `violatingRunIndex=${String(result.violatingRunIndex)} | v=${v} | v=${(v / cyclesPerMs).toFixed(3)} ms | ` +
          `gremlin events=${gremlinEventCount(trace)}`,
      );

      // Replay_Run to the Replay_End, prefix check against the trace.
      const M = replayEnd(ex.meta);
      const edges = replayRun(readHex("crosswalk", "buggy"), ex.fixture, trace.eventList, M);
      expect(comparePrefix(trace.outputEvents, edges)).toBeNull();

      const span = violationSpan(ex.ruleSet[0], v, edges, M);
      console.log(spanLine("crosswalk", trace.violation.rule, span));
      console.log(
        `span detail crosswalk | v=${v} cycles | v=${(v / cyclesPerMs).toFixed(3)} ms | span=${span.spanCycles} cycles | ` +
          `${(span.spanCycles / cyclesPerMs).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);

      // Cross-check: Scripted_Run of the trace's event list gives the same first Violation.
      const scripted = scriptedRun(ex, "buggy", trace.eventList, ex.meta.runCycles, { untilEnd: false });
      console.log(
        `cross-check crosswalk | campaign: ${trace.violation.rule} @ ${trace.violation.cycle} | ` +
          `scripted: ${scripted.violations[0]?.rule ?? "none"} @ ${scripted.violations[0]?.cycle ?? "none"}`,
      );
      expect(scripted.violations.length).toBeGreaterThan(0);
      expect(scripted.violations[0]).toEqual({ rule: trace.violation.rule, cycle: trace.violation.cycle });
    },
  );
});

// Requirement 21, criterion 8.
const CONFLICTING_PAIRS: readonly (readonly [string, string])[] = [
  ["CAR_GREEN", "WALK"],
  ["CAR_YELLOW", "WALK"],
  ["WALK", "DONT_WALK"],
  ["CAR_GREEN", "CAR_YELLOW"],
  ["CAR_GREEN", "CAR_RED"],
  ["CAR_YELLOW", "CAR_RED"],
];

describe("crosswalk Fixed_Sketch campaign", () => {
  it(
    "holds, covers masher, reaches REQUEST presses and WALK, and never overlaps Conflicting_Outputs",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      // D21: the wall clock is named only here, never in examples-support.ts or src/engine/.
      const { result, runs, durationMs } = runExampleCampaign(ex, "fixed", () => performance.now());
      console.log(
        `campaign crosswalk fixed | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ${String(durationMs)} ms`,
      );

      expect(result.verdict).toEqual({ verdict: "HELD", text: heldText(24), runs: 24 });
      expect(result.requestedRuns).toBe(24);
      expect(result.runsCompleted).toBe(24);
      expect(runs).toHaveLength(24);
      const n = runs.length;

      // No CannotCheck, no Floating_Diagnostic.
      for (const r of runs) {
        expect(r.cannotCheck, `Run ${r.runIndex}: CannotCheck entries (checked ${n} Run_Results)`).toEqual([]);
      }
      expect(floatingFindings(runs), `Floating_Diagnostic or floating CannotCheck (checked ${n} Run_Results)`).toEqual([]);

      // Gremlin coverage: masher has no skipped entry and an event below runCycles in some Run.
      const coverage = gremlinCoverage(runs, ex.meta.gremlinSet, ex.meta.runCycles);
      const masher = coverage.find((c) => c.id === "masher");
      expect(masher, "masher is in the gremlinSet").toBeDefined();
      expect(masher!.skipped, `masher skipped entries (checked ${n} Run_Results)`).toEqual([]);
      expect(
        masher!.eventsBelowRunCycles,
        `masher has an event below runCycles in some Run (checked ${n} Run_Results)`,
      ).toBeGreaterThan(0);
      const nonRest = runs.reduce((a, r) => a + r.eventList.filter((e) => e.gremlinId !== "rest").length, 0);
      expect(nonRest, `at least one event with gremlinId not "rest" (checked ${n} Run_Results)`).toBeGreaterThan(0);

      // Untriggered_Rules over the 24 Run_Results.
      const compiled = compileRuleSet(ex.ruleSet, ex.fixture);
      if (!compiled.ok) throw new Error(`rules did not compile: ${compiled.reasons.join(" | ")}`);
      const untriggered = compiled.compiled.findUntriggeredRules(runs);
      expect(untriggered, `untriggeredRules (checked ${n} Run_Results)`).toEqual([]);

      // Requirement 8.9: a REQUEST value-0 applied input from a gremlin other than "rest".
      let pressCount = 0;
      for (const r of runs) {
        for (const a of r.appliedInputs) {
          if (a.signal === "REQUEST" && "value" in a && a.value === 0 && a.gremlinId !== "rest") pressCount++;
        }
      }
      expect(
        pressCount,
        `Requirement 8.9: a REQUEST value 0 applied input with gremlinId other than "rest" (checked ${n} Run_Results)`,
      ).toBeGreaterThan(0);

      // Requirement 8.10: a WALK Output_Edge with value 1 above cycle 0.
      const walkRuns = runs.filter((r) => r.outputEvents.some((e) => e.signal === "WALK" && e.value === 1 && e.cycle > 0)).length;
      expect(
        walkRuns,
        `Requirement 8.10: a WALK Output_Edge with value 1 at a cycle above 0 (checked ${n} Run_Results)`,
      ).toBeGreaterThan(0);

      // Requirement 21.8, 21.10: no pair both 1 in any Run_Result.
      const overlaps: string[] = [];
      for (const r of runs) {
        for (const pair of CONFLICTING_PAIRS) {
          const c = bothOnAt(pair, r.outputEvents);
          if (c !== null) overlaps.push(`Run ${r.runIndex}: ${pair[0]} and ${pair[1]} both 1 at cycle ${c}`);
        }
      }
      const overlapResult = overlaps.length === 0 ? "no overlap" : `OVERLAP ${overlaps.join("; ")}`;

      const text = result.verdict.verdict === "HELD" ? result.verdict.text : "";
      console.log(`verdict text | ${text}`);
      console.log(`runs completed | ${result.runsCompleted}`);
      console.log(
        `gremlin events | ${coverage.map((c) => `${c.id}=${c.eventsBelowRunCycles}`).join(", ")} | non-rest events=${nonRest}`,
      );
      console.log(`REQUEST press count | ${pressCount} | runs where WALK reached 1 | ${walkRuns}`);
      console.log(
        `overlap check | ${CONFLICTING_PAIRS.length} pairs x ${n} Run_Results | ${overlapResult}`,
      );
      expect(overlaps, `Conflicting_Outputs overlap (checked ${n} Run_Results, ${CONFLICTING_PAIRS.length} pairs)`).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Scripted_Run tests (task 4.5). Event cycles are from design.md section 4.1 and D29.

const SENTENCE = "all of (CAR_GREEN is 1, WALK is 1) must never happen.";
const MS = cyclesPerMs;

const press = (cycle: number): ScheduledInput => ({ signal: "REQUEST", value: 0, cycle });
const release = (cycle: number): ScheduledInput => ({ signal: "REQUEST", value: "release", cycle });

// Single_Input: Ordinary_Hold 50 ms = 800,000 cycles.
const SINGLE_INPUT: ScheduledInput[] = [press(4_800_000), release(5_600_000)];
// Minimal_Bug_Input: second Press 100 ms after the first (inside 60 to 240 ms).
const MINIMAL_BUG_INPUT: ScheduledInput[] = [
  press(4_800_000),
  release(5_600_000),
  press(6_400_000),
  release(7_200_000),
];
// Requirement 8.4 (D29): second Press at 4,800,000 plus the offset, second Release 800,000 cycles later.
const OFFSET_CASES: readonly { offsetMs: number; events: ScheduledInput[] }[] = [60, 150, 240].map((offsetMs) => {
  const second = 4_800_000 + offsetMs * MS;
  return {
    offsetMs,
    events: [press(4_800_000), release(5_600_000), press(second), release(second + 800_000)],
  };
});

function overlapsIn(edges: readonly OutputEvent[]): string[] {
  const out: string[] = [];
  for (const pair of CONFLICTING_PAIRS) {
    const c = bothOnAt(pair, edges);
    if (c !== null) out.push(`${pair[0]} and ${pair[1]} both 1 at cycle ${c}`);
  }
  return out;
}

describe("crosswalk Scripted_Run tests", () => {
  it("Single_Input on the Buggy_Sketch gives no Violation and no CannotCheck", { timeout: TEST_TIMEOUT_MS }, () => {
    const list = buildScriptedEvents(ex.fixture, SINGLE_INPUT, ex.meta.runCycles);
    const out = scriptedRun(ex, "buggy", list, ex.meta.runCycles, { untilEnd: false });
    console.log(`single input crosswalk buggy | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length}`);
    expect(out.violations).toEqual([]);
    expect(out.cannotCheck).toEqual([]);
    expect(floatingFindings([], [{ name: "single input", outcome: out }])).toEqual([]);
  });

  it(
    "Requirement 14.2: one REQUEST press alone does not break the Buggy_Sketch",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const list = buildScriptedEvents(ex.fixture, SINGLE_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "buggy", list, ex.meta.runCycles, { untilEnd: false });
      console.log(`requirement 14.2 crosswalk buggy | violations=${out.violations.length}`);
      expect(out.violations).toEqual([]);
      expect(floatingFindings([], [{ name: "14.2", outcome: out }])).toEqual([]);
    },
  );

  it(
    "Minimal_Bug_Input breaks the Buggy_Sketch, the span reaches 16,000 cycles, and a fresh bridge repeats it",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const M = replayEnd(ex.meta);
      const list = buildScriptedEvents(ex.fixture, MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      expect(out.violations.length).toBeGreaterThan(0);
      const first = out.violations[0];
      expect(first.rule).toBe(SENTENCE);
      expect(first.cycle).toBeLessThan(ex.meta.runCycles);

      const span = violationSpan(ex.ruleSet[0], first.cycle, out.outputEdges, M);
      console.log(spanLine("crosswalk", first.rule, span));
      console.log(
        `minimal bug input crosswalk buggy | v=${first.cycle} cycles | v=${(first.cycle / MS).toFixed(3)} ms | ` +
          `span=${span.spanCycles} cycles | ${(span.spanCycles / MS).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);
      expect(floatingFindings([], [{ name: "minimal bug input buggy", outcome: out }])).toEqual([]);

      // Fresh bridge, same HEX, Fixture and ordered event list.
      const again = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      console.log(
        `fresh-bridge repeat crosswalk | first: ${first.rule} @ ${first.cycle} | second: ${again.violations[0]?.rule ?? "none"} @ ${again.violations[0]?.cycle ?? "none"}`,
      );
      expect(again.violations[0]).toEqual(first);
    },
  );

  it(
    "Minimal_Bug_Input on the Fixed_Sketch gives no Violation, no CannotCheck and no overlap",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const list = buildScriptedEvents(ex.fixture, MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "fixed", list, ex.meta.runCycles, { untilEnd: false });
      const overlaps = overlapsIn(out.outputEdges);
      console.log(
        `minimal bug input crosswalk fixed | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length} | ` +
          `overlap=${overlaps.length === 0 ? "none" : overlaps.join("; ")}`,
      );
      expect(out.violations).toEqual([]);
      expect(out.cannotCheck).toEqual([]);
      expect(floatingFindings([], [{ name: "minimal bug input fixed", outcome: out }])).toEqual([]);
      expect(overlaps, `Conflicting_Outputs overlap in the Fixed_Sketch Scripted_Run (${CONFLICTING_PAIRS.length} pairs)`).toEqual([]);
    },
  );

  for (const { offsetMs, events } of OFFSET_CASES) {
    it(
      `Requirement 8.4: second press ${offsetMs} ms after the first breaks the Buggy_Sketch`,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const list = buildScriptedEvents(ex.fixture, events, ex.meta.runCycles);
        const out = scriptedRun(ex, "buggy", list, ex.meta.runCycles, { untilEnd: false });
        console.log(
          `requirement 8.4 crosswalk buggy | offset=${offsetMs} ms | events=${events.map((e) => e.cycle).join(",")} | ` +
            `violation=${out.violations[0]?.rule ?? "none"} @ ${out.violations[0]?.cycle ?? "none"}`,
        );
        expect(out.violations.length).toBeGreaterThan(0);
        expect(out.violations[0].rule).toBe(SENTENCE);
        expect(floatingFindings([], [{ name: `offset ${offsetMs} ms`, outcome: out }])).toEqual([]);
      },
    );
  }
});
