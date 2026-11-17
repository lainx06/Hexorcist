// Feature: bench-ui-stage, Property 6: Strip labels and pulses
// Passing runs are evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Fixture } from "../../src/engine/types";
import { loadExample } from "../../src/ui/app/data/examples";
import { brokeLabel, crossed, relativeTime, stripDots, stripPhrase } from "../../src/ui/app/model/strip";
import { runCampaignJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";
import { cursorPairArb, reducedListArb } from "./stage-arbitraries";

const SEED = 20261206;
const T = 600_000;

// Independent reference of the Glossary: k = floor((cycle - e0 + 8,000) / 16,000).
function refTime(cycle: number, e0: number): string {
  const k = Math.floor((cycle - e0 + 8_000) / 16_000);
  return `+${k.toString(10)} ms`;
}

// Independent reference of Strip_Phrase (Glossary), from the fixture's active level.
function refPhrase(list: readonly ReducerEvent[], i: number, f: Fixture): string {
  const e = list[i] as ReducerEvent;
  const pin = f.pins.find((p) => p.signal === e.signal);
  const press = pin !== undefined && pin.kind !== "analog" && pin.activeLevel === "high" ? 1 : 0;
  let kind: "active" | "held" | "inactive" = "inactive";
  if ("value" in e && e.value === press) {
    let later = false;
    for (let j = i + 1; j < list.length; j++) {
      const o = list[j] as ReducerEvent;
      if (o.signal === e.signal && "value" in o && o.value === "release") later = true;
    }
    kind = later ? "active" : "held";
  }
  const words: Record<string, [string, string, string]> = {
    REQUEST: ["pressed", "pressed and held", "let go"],
    CLOSE: ["pressed", "pressed and held", "let go"],
    BEAM_CLEAR: ["blocked", "blocked", "cleared"],
    PULSE: ["sensor on", "sensor held on", "sensor off"],
  };
  const w = words[e.signal] ?? ["on", "held on", "off"];
  return kind === "active" ? w[0] : kind === "held" ? w[1] : w[2];
}

function loadCrosswalk() {
  const l = loadExample("crosswalk");
  if (!l.ok) throw new Error(`crosswalk did not load: ${JSON.stringify(l.problems)}`);
  return l.example;
}

describe("Property 6: Strip labels and pulses", () => {
  const { fixture } = loadCrosswalk();

  // Feature: bench-ui-stage, Property 6: Strip labels and pulses
  // **Validates: Requirements 6.1, 6.3**
  it("dot labels, the broke label and pulses match the Glossary formula", () => {
    fc.assert(
      fc.property(
        reducedListArb.chain((r) => cursorPairArb(r.v + 1_000).map((c) => ({ ...r, ...c }))),
        ({ list, v, p, q }) => {
          const g = list.filter((e) => e.gremlinId !== "rest");
          const e0 = Math.min(...g.map((e) => e.cycle));
          const dots = stripDots(list, fixture, v);
          expect(dots.length).toBe(g.length);
          let d = 0;
          list.forEach((e, i) => {
            if (e.gremlinId === "rest") return;
            expect(dots[d]?.label).toBe(`${refTime(e.cycle, e0)} ${refPhrase(list, i, fixture)}`);
            expect(relativeTime(e.cycle, e0)).toBe(refTime(e.cycle, e0));
            expect(stripPhrase(list, i, fixture)).toBe(refPhrase(list, i, fixture));
            d++;
          });
          expect(brokeLabel(list, v)).toBe(`${refTime(v, e0)} broke`);
          const cycles = dots.map((x) => x.cycle);
          const want: number[] = [];
          cycles.forEach((c, i) => {
            if (p < c && c <= q) want.push(i);
          });
          expect(crossed(p, q, cycles)).toEqual(want);
        },
      ),
      { seed: SEED, numRuns: 200 },
    );
  });
});

describe("Crosswalk Move_Strip from the real reduced cycles (Requirement 6.2)", () => {
  it("labels are +0 / +65 / +131 ms and +450 ms broke, with REQUEST phrases", { timeout: T }, () => {
    const ex = loadCrosswalk();
    const camp = runCampaignJob({
      hex: ex.buggyHex,
      fixture: ex.fixture,
      ruleSet: ex.ruleSet,
      gremlinSet: ex.meta.gremlinSet,
      campaignSeed: ex.meta.campaignSeed,
      runs: ex.meta.runs,
      runCycles: ex.meta.runCycles,
    });
    if (!camp.ok) throw new Error(`campaign: ${JSON.stringify(camp.error)}`);
    const verdict = camp.result.verdict;
    if (verdict.verdict !== "BROKE") throw new Error(`campaign: expected BROKE, actual ${verdict.verdict}`);
    const red = runReductionJob({
      hex: ex.buggyHex,
      fixture: ex.fixture,
      ruleSet: ex.ruleSet,
      originalList: verdict.trace.eventList,
      violation: verdict.trace.violation,
      runCycles: ex.meta.runCycles,
    });
    if (!red.ok) throw new Error(`reduction: ${JSON.stringify(red.error)}`);
    const list = red.result.reducedList;
    const rep = runReplayJob({ hex: ex.buggyHex, fixture: ex.fixture, ruleSet: ex.ruleSet, events: list, runCycles: ex.meta.runCycles });
    if (!rep.ok) throw new Error(`replay: ${JSON.stringify(rep.error)}`);
    if (rep.violation === null) throw new Error("replay: expected a violation, actual none");
    const v = rep.violation.cycle;

    const g = list.filter((e) => e.gremlinId !== "rest");
    expect(g.map((e) => e.cycle)).toEqual([8_449_937, 9_496_850, 10_543_764]);
    expect(v).toBe(15_647_515);

    const dots = stripDots(list, ex.fixture, v);
    const labels = dots.map((x) => x.label);
    expect(labels).toEqual(["+0 ms pressed", "+65 ms let go", "+131 ms pressed and held"]);
    expect(brokeLabel(list, v)).toBe("+450 ms broke");
    // The phrases follow the Glossary rule for REQUEST (press, release, press without a later release).
    g.forEach((e, k) => {
      const i = list.indexOf(e);
      expect(dots[k]?.label.endsWith(refPhrase(list, i, ex.fixture))).toBe(true);
    });
  });
});
