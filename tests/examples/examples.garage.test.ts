// garage: Buggy_Sketch Example_Campaign and Replay_Run span.
// Passing tests are evidence, not proof.

import { describe, expect, it } from "vitest";
import { untriggeredRules } from "../../src/engine/rules/trigger";
import type { OutputEvent, ScheduledInput } from "../../src/engine/types";
import { heldText } from "../../src/engine/verdict";
import {
  TEST_TIMEOUT_MS,
  bothOnAt,
  buildScriptedEvents,
  comparePrefix,
  cyclesPerMs,
  doorStateChanges,
  floatingFindings,
  gremlinCoverage,
  gremlinEventCount,
  loadExample,
  outputLevelAt,
  readHex,
  replayEnd,
  replayRun,
  runExampleCampaign,
  scriptedRun,
  spanLine,
  violationSpan,
} from "./examples-support";

const ex = loadExample("garage");
const GARAGE_SENTENCE = "Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true.";
const garageSentence = (): string => GARAGE_SENTENCE;

describe("garage Buggy_Sketch campaign and span", () => {
  it(
    "breaks and replays to the Replay_End with a span of at least 16,000 cycles",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const { result } = runExampleCampaign(ex, "buggy");
      expect(result.verdict.verdict).toBe("BROKE");
      expect(result.violatingRunIndex).not.toBeNull();
      if (result.verdict.verdict !== "BROKE") throw new Error("unreachable: verdict is not BROKE");
      const trace = result.verdict.trace;
      expect(trace.violation).toBeTruthy();

      const v = trace.violation.cycle;
      expect(result.violatingRunIndex).toBe(7);
      expect(v).toBe(5_768_101);
      expect(gremlinEventCount(trace)).toBe(7);
      console.log(
        `campaign garage buggy | seed=${ex.meta.campaignSeed} | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ` +
          `violatingRunIndex=${String(result.violatingRunIndex)} | v=${v} | v=${(v / cyclesPerMs).toFixed(3)} ms | ` +
          `gremlin events=${gremlinEventCount(trace)}`,
      );

      // Replay_Run to the Replay_End, prefix check against the trace.
      const M = replayEnd(ex.meta);
      const edges = replayRun(readHex("garage", "buggy"), ex.fixture, trace.eventList, M);
      expect(comparePrefix(trace.outputEvents, edges)).toBeNull();

      const span = violationSpan(ex.ruleSet[0], v, edges, M);
      console.log(spanLine("garage", trace.violation.rule, span));
      console.log(
        `span detail garage | v=${v} cycles | v=${(v / cyclesPerMs).toFixed(3)} ms | span=${span.spanCycles} cycles | ` +
          `${(span.spanCycles / cyclesPerMs).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);
    },
  );
});

describe("garage Fixed_Sketch campaign", () => {
  it(
    "holds, covers bouncer and masher on CLOSE or BEAM_CLEAR, triggers the rule, and never drives both motor outputs",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      // D21: the wall clock is named only here, never in examples-support.ts or src/engine/.
      const { result, runs, durationMs } = runExampleCampaign(ex, "fixed", () => performance.now());
      console.log(
        `campaign garage fixed | N=${ex.meta.runs} | runCycles=${ex.meta.runCycles} | ${String(durationMs)} ms`,
      );

      expect(result.verdict).toEqual({ verdict: "HELD", text: heldText(40), runs: 40 });
      expect(result.requestedRuns).toBe(40);
      expect(result.runsCompleted).toBe(40);
      expect(runs).toHaveLength(40);
      const n = runs.length;

      // No CannotCheck, no Floating_Diagnostic.
      for (const r of runs) {
        expect(r.cannotCheck, `Run ${r.runIndex}: CannotCheck entries (checked ${n} Run_Results)`).toEqual([]);
      }
      expect(floatingFindings(runs), `Floating_Diagnostic or floating CannotCheck (checked ${n} Run_Results)`).toEqual([]);

      // Requirement 12.6, 12.7, 12.8: per GremlinSpec, no skipped entry and an event below runCycles.
      const coverage = gremlinCoverage(runs, ex.meta.gremlinSet, ex.meta.runCycles);
      for (const spec of ex.meta.gremlinSet) {
        const c = coverage.find((g) => g.id === spec.id);
        expect(c, `${spec.id} is in the gremlinSet`).toBeDefined();
        expect(
          c!.skipped,
          `Requirement 12.6: Example garage, Gremlin ${spec.id}, runsCompleted ${result.runsCompleted}, skipped entries: ${JSON.stringify(c!.skipped)}`,
        ).toEqual([]);
        expect(
          c!.eventsBelowRunCycles,
          `Requirement 12.7: Example garage, Gremlin ${spec.id}, runsCompleted ${result.runsCompleted}, skipped entries: ${JSON.stringify(c!.skipped)}`,
        ).toBeGreaterThan(0);
      }
      const nonRest = runs.reduce((a, r) => a + r.eventList.filter((e) => e.gremlinId !== "rest").length, 0);
      expect(nonRest, `at least one event with gremlinId not "rest" (checked ${n} Run_Results)`).toBeGreaterThan(0);

      // Requirement 12.2: per GremlinSpec, one Run_Result with an event on CLOSE or BEAM_CLEAR below runCycles
      // whose own untriggeredRules does not list the garage sentence.
      expect(ex.ruleSet).toHaveLength(1);
      const triggerLines: string[] = [];
      for (const spec of ex.meta.gremlinSet) {
        const matching = runs.filter(
          (r) =>
            r.eventList.some(
              (e) =>
                e.gremlinId === spec.id &&
                e.cycle < ex.meta.runCycles &&
                (e.signal === "CLOSE" || e.signal === "BEAM_CLEAR"),
            ) && !untriggeredRules(ex.ruleSet, ex.fixture, [r]).includes(garageSentence()),
        );
        triggerLines.push(`${spec.id}: ${matching.length} Run_Results (first Run ${matching[0]?.runIndex ?? "none"})`);
        expect(
          matching.length,
          `Requirement 12.2: Example garage, Gremlin ${spec.id}, rule "${garageSentence()}": no Run_Result holds an event on CLOSE or BEAM_CLEAR below runCycles and the Trigger (checked ${n} Run_Results)`,
        ).toBeGreaterThan(0);
      }
      expect(untriggeredRules(ex.ruleSet, ex.fixture, runs), `untriggeredRules over ${n} Run_Results`).toEqual([]);

      // Requirement 21.8, 21.10: (MOTOR_CLOSE, MOTOR_OPEN) never both 1 in any Run_Result.
      const overlaps: string[] = [];
      for (const r of runs) {
        const c = bothOnAt(["MOTOR_CLOSE", "MOTOR_OPEN"], r.outputEvents);
        if (c !== null) overlaps.push(`Run ${r.runIndex}: MOTOR_CLOSE and MOTOR_OPEN both 1 at cycle ${c}`);
      }
      const overlapResult = overlaps.length === 0 ? "no overlap" : `OVERLAP ${overlaps.join("; ")}`;

      const text = result.verdict.verdict === "HELD" ? result.verdict.text : "";
      console.log(`verdict text | ${text}`);
      console.log(`runs completed | ${result.runsCompleted}`);
      console.log(
        `gremlin events | ${coverage.map((c) => `${c.id}=${c.eventsBelowRunCycles}`).join(", ")} | non-rest events=${nonRest}`,
      );
      console.log(`trigger runs | ${triggerLines.join(" | ")}`);
      console.log(`overlap check | 1 pair x ${n} Run_Results | ${overlapResult}`);
      expect(overlaps, `Conflicting_Outputs overlap (checked ${n} Run_Results, 1 pair)`).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Scripted_Run tests (task 6.5). Event cycles are from design.md section 4.2.

const MS = cyclesPerMs;
const DEBOUNCE_CYCLES = 10 * MS; // DEBOUNCE_MS 10 (design.md section 4.2)

const gPress = (signal: string, cycle: number): ScheduledInput => ({ signal, value: 0, cycle });
const gRelease = (signal: string, cycle: number): ScheduledInput => ({ signal, value: "release", cycle });

// Single_Input: BEAM_CLEAR blocked for 2 ms = 32,000 cycles.
const GARAGE_SINGLE_INPUT: ScheduledInput[] = [gPress("BEAM_CLEAR", 6_400_000), gRelease("BEAM_CLEAR", 6_432_000)];
// Minimal_Bug_Input: one CLOSE press, then two 2 ms blocked spans with a 4 ms clear span between.
const GARAGE_MINIMAL_BUG_INPUT: ScheduledInput[] = [
  gPress("CLOSE", 1_600_000),
  gRelease("CLOSE", 2_400_000),
  gPress("BEAM_CLEAR", 3_200_000),
  gRelease("BEAM_CLEAR", 3_232_000),
  gPress("BEAM_CLEAR", 3_296_000),
  gRelease("BEAM_CLEAR", 3_328_000),
];

/** The cycle at which the bridge applied the first BEAM_CLEAR Press: the Trigger cycle c. */
function triggerCycle(applied: readonly { signal: string; appliedCycle: number; value?: unknown }[]): number {
  const hit = applied.find((a) => a.signal === "BEAM_CLEAR" && a.value === 0);
  if (!hit) throw new Error("no BEAM_CLEAR Press was applied, so the Trigger cycle c is unknown");
  return hit.appliedCycle;
}

/** The first rise of MOTOR_CLOSE above cycle 0, or null. */
function firstMotorCloseRise(edges: readonly OutputEvent[]): number | null {
  const rises = edges.filter((e) => e.signal === "MOTOR_CLOSE" && e.value === 1 && e.cycle > 0).map((e) => e.cycle);
  return rises.length === 0 ? null : Math.min(...rises);
}

/** Requirement 9.4: MOTOR_CLOSE is 1 at c, at c + 320,000, and has no falling edge from c through c + 320,000. */
function motorCloseHeldThrough(edges: readonly OutputEvent[], c: number): string | null {
  const end = c + 320_000;
  if (outputLevelAt("MOTOR_CLOSE", c, edges) !== 1) return `MOTOR_CLOSE is not 1 at c=${c}`;
  const fall = edges.find((e) => e.signal === "MOTOR_CLOSE" && e.value === 0 && e.cycle > c && e.cycle <= end);
  if (fall) return `MOTOR_CLOSE falls to 0 at cycle ${fall.cycle}, within c=${c} through c+320,000=${end}`;
  if (outputLevelAt("MOTOR_CLOSE", end, edges) !== 1) return `MOTOR_CLOSE is not 1 at c+320,000=${end}`;
  return null;
}

/** D12: report the Door_State changes of a Fixed_Sketch run and any closed to closing change. */
function d12Check(name: string, edges: readonly OutputEvent[]): string[] {
  const changes = doorStateChanges(edges);
  console.log(
    `door state changes garage fixed ${name} | ${
      changes.length === 0 ? "none" : changes.map((d) => `${d.from}->${d.to}@${d.cycle}`).join(", ")
    }`,
  );
  return changes.filter((d) => d.from === "closed" && d.to === "closing").map((d) => `closed->closing at cycle ${d.cycle}`);
}

describe("garage Scripted_Run tests", () => {
  it("Single_Input on the Buggy_Sketch gives no Violation", { timeout: TEST_TIMEOUT_MS }, () => {
    const list = buildScriptedEvents(ex.fixture, GARAGE_SINGLE_INPUT, ex.meta.runCycles);
    const out = scriptedRun(ex, "buggy", list, ex.meta.runCycles, { untilEnd: false });
    console.log(`single input garage buggy | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length}`);
    expect(out.violations).toEqual([]);
    expect(floatingFindings([], [{ name: "single input", outcome: out }])).toEqual([]);
  });

  it("Minimal_Bug_Input has the shape of Requirement 9.13", () => {
    const list = GARAGE_MINIMAL_BUG_INPUT;
    const closePresses = list.filter((e) => e.signal === "CLOSE" && "value" in e && e.value === 0);
    expect(closePresses).toHaveLength(1);
    const closeCycle = closePresses[0].cycle;
    // Spans after the CLOSE Press: each BEAM_CLEAR Press followed by its Release.
    const beam = list.filter((e) => e.signal === "BEAM_CLEAR" && e.cycle > closeCycle);
    expect(beam.length).toBeGreaterThanOrEqual(4);
    expect(beam.length % 2).toBe(0);
    const blocked: [number, number][] = [];
    for (let i = 0; i < beam.length; i += 2) {
      const p = beam[i];
      const r = beam[i + 1];
      expect("value" in p && p.value).toBe(0);
      expect("value" in r && r.value).toBe("release");
      blocked.push([p.cycle, r.cycle]);
    }
    expect(blocked.length).toBeGreaterThanOrEqual(2);
    for (const [p, r] of blocked) expect(r - p).toBeLessThan(DEBOUNCE_CYCLES);
    for (let i = 1; i < blocked.length; i++) expect(blocked[i][0]).toBeGreaterThan(blocked[i - 1][1]); // a clear span between
    for (const e of list) expect(e.cycle).toBeLessThan(ex.meta.runCycles);
    expect(list.every((e) => (e.gremlinId ?? "script") === "script")).toBe(true); // no Rest_Event
    // c is at least the first BEAM_CLEAR Press cycle; c + 320,000 <= runCycles.
    expect(blocked[0][0] + 320_000).toBeLessThanOrEqual(ex.meta.runCycles);
  });

  for (const variant of ["buggy", "fixed"] as const) {
    it(
      `Minimal_Bug_Input on the ${variant} build raises MOTOR_CLOSE within 16,000 cycles of 1,600,000`,
      { timeout: TEST_TIMEOUT_MS },
      () => {
        const list = buildScriptedEvents(ex.fixture, GARAGE_MINIMAL_BUG_INPUT, ex.meta.runCycles);
        const out = scriptedRun(ex, variant, list, ex.meta.runCycles, { untilEnd: false });
        const rise = firstMotorCloseRise(out.outputEdges);
        console.log(`close response garage ${variant} | first MOTOR_CLOSE rise=${rise ?? "none"}`);
        expect(rise).not.toBeNull();
        expect(rise!).toBeGreaterThanOrEqual(1_600_000);
        expect(rise!).toBeLessThanOrEqual(1_616_000);
        expect(floatingFindings([], [{ name: `close response ${variant}`, outcome: out }])).toEqual([]);
      },
    );
  }

  it(
    "Minimal_Bug_Input breaks the Buggy_Sketch, MOTOR_CLOSE stays 1 for 20 ms, the span reaches 16,000 cycles, and a fresh bridge repeats it",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const M = replayEnd(ex.meta);
      const list = buildScriptedEvents(ex.fixture, GARAGE_MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      expect(out.violations.length).toBeGreaterThan(0);
      const first = out.violations[0];
      expect(first.rule).toBe(GARAGE_SENTENCE);
      expect(first.cycle).toBeLessThan(ex.meta.runCycles);

      const c = triggerCycle(out.appliedInputs);
      console.log(`trigger garage buggy | c=${c} | c+320,000=${c + 320_000}`);
      expect(c + 320_000).toBeLessThanOrEqual(ex.meta.runCycles);
      expect(motorCloseHeldThrough(out.outputEdges, c)).toBeNull();

      const span = violationSpan(ex.ruleSet[0], first.cycle, out.outputEdges, M);
      console.log(spanLine("garage", first.rule, span));
      console.log(
        `minimal bug input garage buggy | v=${first.cycle} cycles | v=${(first.cycle / MS).toFixed(3)} ms | ` +
          `span=${span.spanCycles} cycles | ${(span.spanCycles / MS).toFixed(3)} ms | cut=${span.cutByReplayEnd ? "yes" : "no"}`,
      );
      expect(span.spanCycles).toBeGreaterThanOrEqual(16_000);
      expect(floatingFindings([], [{ name: "minimal bug input buggy", outcome: out }])).toEqual([]);

      // Fresh bridge, same HEX, Fixture and ordered event list.
      const again = scriptedRun(ex, "buggy", list, M, { untilEnd: true });
      console.log(
        `fresh-bridge repeat garage | first: ${first.rule} @ ${first.cycle} | second: ${again.violations[0]?.rule ?? "none"} @ ${again.violations[0]?.cycle ?? "none"}`,
      );
      expect(again.violations[0]).toEqual(first);
    },
  );

  it(
    "Minimal_Bug_Input on the Fixed_Sketch gives no Violation, no CannotCheck, no motor overlap and no closed to closing change",
    { timeout: TEST_TIMEOUT_MS },
    () => {
      const list = buildScriptedEvents(ex.fixture, GARAGE_MINIMAL_BUG_INPUT, ex.meta.runCycles);
      const out = scriptedRun(ex, "fixed", list, ex.meta.runCycles, { untilEnd: false });
      const overlap = bothOnAt(["MOTOR_CLOSE", "MOTOR_OPEN"], out.outputEdges);
      console.log(
        `minimal bug input garage fixed | violations=${out.violations.length} | cannotCheck=${out.cannotCheck.length} | ` +
          `overlap=${overlap === null ? "none" : `at cycle ${overlap}`}`,
      );
      expect(out.violations).toEqual([]);
      expect(out.cannotCheck).toEqual([]);
      expect(floatingFindings([], [{ name: "minimal bug input fixed", outcome: out }])).toEqual([]);
      expect(overlap, "MOTOR_CLOSE and MOTOR_OPEN both 1 in the Fixed_Sketch Scripted_Run").toBeNull();
      expect(d12Check("minimal bug input", out.outputEdges), "D12: closed to closing").toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// Behaviour Scripted_Runs (task 6.6). Event cycles are from design.md section 4.2.

const GARAGE_STEADY_BLOCK: ScheduledInput[] = [gPress("BEAM_CLEAR", 6_400_000), gRelease("BEAM_CLEAR", 6_880_000)];
const GARAGE_CLOSE_OPEN: ScheduledInput[] = [gPress("CLOSE", 1_600_000), gRelease("CLOSE", 2_400_000)];
const GARAGE_CLOSE_CLOSED: ScheduledInput[] = [gPress("CLOSE", 9_700_000)];
const GARAGE_NO_CHANGE: ScheduledInput[] = [
  gPress("BEAM_CLEAR", 80_000),
  gPress("CLOSE", 160_000),
  gRelease("BEAM_CLEAR", 320_000),
  gPress("CLOSE", 640_000),
];
const GARAGE_EMPTY: ScheduledInput[] = [];

/**
 * D12 for any build: report the Door_State change list of a run and any closed to closing change.
 * An unknown edge pattern fails with the run name, cycles and edges.
 */
function doorReport(variant: string, name: string, edges: readonly OutputEvent[]): { changes: string; closedToClosing: string[] } {
  let list: ReturnType<typeof doorStateChanges>;
  try {
    list = doorStateChanges(edges);
  } catch (e) {
    throw new Error(`Run "${name}" (${variant}): ${e instanceof Error ? e.message : String(e)}`);
  }
  const changes = list.length === 0 ? "none" : list.map((d) => `${d.from}->${d.to}@${d.cycle}`).join(", ");
  console.log(`door state changes garage ${variant} ${name} | ${changes}`);
  return {
    changes,
    closedToClosing: list.filter((d) => d.from === "closed" && d.to === "closing").map((d) => `closed->closing at cycle ${d.cycle}`),
  };
}

/** Run a behaviour list to runCycles and apply the checks every 6.6 run shares. */
function behaviourRun(variant: "buggy" | "fixed", name: string, events: ScheduledInput[]) {
  const list = buildScriptedEvents(ex.fixture, events, ex.meta.runCycles);
  const out = scriptedRun(ex, variant, list, ex.meta.runCycles, { untilEnd: false });
  expect(floatingFindings([], [{ name: `${name} ${variant}`, outcome: out }])).toEqual([]);
  const door = doorReport(variant, name, out.outputEdges);
  expect(door.closedToClosing, `D12: ${name} ${variant}`).toEqual([]);
  if (variant === "fixed") {
    const overlap = bothOnAt(["MOTOR_CLOSE", "MOTOR_OPEN"], out.outputEdges);
    expect(overlap, `${name} fixed: MOTOR_CLOSE and MOTOR_OPEN both 1`).toBeNull();
  }
  return out;
}

describe("garage behaviour Scripted_Runs", () => {
  it("steady block on the Buggy_Sketch: MOTOR_CLOSE falls at or before c + 320,000 (9.5)", { timeout: TEST_TIMEOUT_MS }, () => {
    const out = behaviourRun("buggy", "steady block", GARAGE_STEADY_BLOCK);
    const c = triggerCycle(out.appliedInputs);
    const fall = out.outputEdges.find((e) => e.signal === "MOTOR_CLOSE" && e.value === 0 && e.cycle > c);
    console.log(`steady block garage buggy | c=${c} | c+320,000=${c + 320_000} | first MOTOR_CLOSE fall after c=${fall?.cycle ?? "none"}`);
    expect(fall).toBeDefined();
    expect(fall!.cycle).toBeLessThanOrEqual(c + 320_000);
  });

  for (const variant of ["buggy", "fixed"] as const) {
    it(`CLOSE_Press with the door open on the ${variant} build raises MOTOR_CLOSE from 1,600,000 to 1,616,000`, { timeout: TEST_TIMEOUT_MS }, () => {
      const out = behaviourRun(variant, "close press door open", GARAGE_CLOSE_OPEN);
      const rise = firstMotorCloseRise(out.outputEdges);
      console.log(`close press door open garage ${variant} | first MOTOR_CLOSE rise=${rise ?? "none"}`);
      expect(rise).not.toBeNull();
      expect(rise!).toBeGreaterThanOrEqual(1_600_000);
      expect(rise!).toBeLessThanOrEqual(1_616_000);
    });

    it(`CLOSE_Press with the door closed on the ${variant} build gives no motor edge from 9,700,000 to 10,000,000`, { timeout: TEST_TIMEOUT_MS }, () => {
      const out = behaviourRun(variant, "close press door closed", GARAGE_CLOSE_CLOSED);
      const motorEdges = out.outputEdges.filter(
        (e) => (e.signal === "MOTOR_CLOSE" || e.signal === "MOTOR_OPEN") && e.cycle >= 9_700_000 && e.cycle <= 10_000_000,
      );
      console.log(
        `close press door closed garage ${variant} | motor edges 9,700,000..10,000,000: ${
          motorEdges.length === 0 ? "none" : motorEdges.map((e) => `${e.signal}=${String(e.value)}@${e.cycle}`).join(", ")
        }`,
      );
      expect(motorEdges).toEqual([]);
      // D12 branch: the change near 9,600,000 (design.md 4.2: within about 34,000 cycles) is closing to closed.
      const near = doorStateChanges(out.outputEdges).filter((d) => d.cycle >= 9_566_000 && d.cycle <= 9_634_000);
      expect(near.map((d) => `${d.from}->${d.to}`)).toEqual(["closing->closed"]);
    });

    it(`Press with no change of CLOSE on the ${variant} build keeps MOTOR_CLOSE at 0 from 640,000 to 4,700,000 (D13)`, { timeout: TEST_TIMEOUT_MS }, () => {
      const out = behaviourRun(variant, "press with no change", GARAGE_NO_CHANGE);
      const rises = out.outputEdges.filter((e) => e.signal === "MOTOR_CLOSE" && e.value === 1 && e.cycle >= 640_000 && e.cycle <= 4_700_000);
      console.log(
        `press with no change garage ${variant} | MOTOR_CLOSE level at 640,000=${String(outputLevelAt("MOTOR_CLOSE", 640_000, out.outputEdges))} | rises in span=${rises.length}`,
      );
      expect(outputLevelAt("MOTOR_CLOSE", 640_000, out.outputEdges)).toBe(0);
      expect(rises).toEqual([]);
    });

    it(`empty event list on the ${variant} build: the earliest MOTOR_CLOSE rise is from 4,784,000 to 4,832,000 (9.10)`, { timeout: TEST_TIMEOUT_MS }, () => {
      const out = behaviourRun(variant, "empty event list", GARAGE_EMPTY);
      const rise = firstMotorCloseRise(out.outputEdges);
      console.log(`auto-close garage ${variant} | first MOTOR_CLOSE rise=${rise ?? "none"}`);
      expect(rise).not.toBeNull();
      expect(rise!).toBeGreaterThanOrEqual(4_784_000);
      expect(rise!).toBeLessThanOrEqual(4_832_000);
    });
  }
});
