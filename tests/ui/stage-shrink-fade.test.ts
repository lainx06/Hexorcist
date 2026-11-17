// Feature: bench-ui-stage, Requirements 4.4, 4.5: Shrink_View fading in Node, one crosswalk reduction.
// Passing runs are evidence, not proof.
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import { loadExample } from "../../src/ui/app/data/examples";
import { fadeShrinkDots, shrinkDots } from "../../src/ui/app/model/strip";
import { runCampaignJob, runReductionJob } from "../../src/ui/app/worker/host";

const T = 600_000;

type Plain = { cycle: number; signal: string; gremlinId: string; value?: unknown };

function plain(e: ReducerEvent): Plain {
  const o = e as unknown as Plain;
  return "value" in o ? { cycle: o.cycle, signal: o.signal, gremlinId: o.gremlinId, value: o.value } : { cycle: o.cycle, signal: o.signal, gremlinId: o.gremlinId };
}

// Independent reference matcher: multiset match on cycle, signal, gremlinId and digital value (analog ignored).
function key(e: ReducerEvent): string {
  const p = plain(e);
  return JSON.stringify([p.cycle, p.signal, p.gremlinId, "value" in p ? p.value : null, "value" in p]);
}

/** Dot indexes (Gremlin_Event dots of `original`) that have a match in `pool`. */
function refMatched(original: readonly ReducerEvent[], pool: readonly ReducerEvent[]): Set<number> {
  const counts = new Map<string, number>();
  for (const e of pool) {
    if (e.gremlinId === "rest") continue;
    counts.set(key(e), (counts.get(key(e)) ?? 0) + 1);
  }
  const matched = new Set<number>();
  let dot = 0;
  for (const o of original) {
    if (o.gremlinId === "rest") continue;
    const left = counts.get(key(o)) ?? 0;
    if (left > 0) {
      counts.set(key(o), left - 1);
      matched.add(dot);
    }
    dot++;
  }
  return matched;
}

describe("Shrink_View fading on the crosswalk reduction (Requirements 4.4, 4.5)", () => {
  it("the faded set only grows, never holds a matched dot, and ends as the dots absent from the Reduced_List", { timeout: T }, () => {
    const l = loadExample("crosswalk");
    if (!l.ok) throw new Error(`crosswalk did not load: ${JSON.stringify(l.problems)}`);
    const ex = l.example;
    expect(ex.meta.campaignSeed).toBe(20261101);
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
    expect(verdict.trace.runIndex).toBe(3);
    expect(ex.meta.runs).toBe(24);

    const original = verdict.trace.eventList;
    const gremlinCount = (l2: readonly ReducerEvent[]) => l2.filter((e) => e.gremlinId !== "rest").length;
    expect(gremlinCount(original)).toBe(8);

    let faded: Set<number> = new Set();
    const sizes: number[] = [];
    const bestCounts: number[] = [];
    let reports = 0;
    let shrunk = 0;
    let fullyDone = false;

    const red = runReductionJob(
      {
        hex: ex.buggyHex,
        fixture: ex.fixture,
        ruleSet: ex.ruleSet,
        originalList: original,
        violation: verdict.trace.violation,
        runCycles: ex.meta.runCycles,
      },
      {
        onProgress: (p) => {
          expect(fullyDone).toBe(false);
          reports++;
          if (gremlinCount(p.bestList) < 8) shrunk++;
          const before = faded;
          faded = fadeShrinkDots(original, p.bestList, before);
          // Only grows.
          for (const d of before) expect(faded.has(d)).toBe(true);
          // Holds no dot matched in the latest bestList (independent matcher).
          const matched = refMatched(original, p.bestList);
          for (const d of faded) expect(matched.has(d), `dot ${d} faded but matched`).toBe(false);
          sizes.push(faded.size);
          bestCounts.push(gremlinCount(p.bestList));
        },
      },
    );
    if (!red.ok) throw new Error(`reduction: ${JSON.stringify(red.error)}`);
    fullyDone = true;
    const reduced = red.result.reducedList;

    expect(gremlinCount(original)).toBe(8);
    expect(gremlinCount(reduced)).toBe(3);
    expect(reports).toBeGreaterThan(0);
    expect(shrunk).toBeGreaterThan(0);

    // Ends with exactly the dots absent from the Reduced_List.
    const keptRef = refMatched(original, reduced);
    expect(keptRef.size).toBe(3);
    const absentRef = new Set<number>();
    for (let d = 0; d < 8; d++) if (!keptRef.has(d)) absentRef.add(d);
    expect([...faded].sort((a, b) => a - b)).toEqual([...absentRef].sort((a, b) => a - b));

    // Final styles.
    const styles = shrinkDots(original, faded, reduced).map((s) => s.style);
    expect(styles.length).toBe(8);
    styles.forEach((s, d) => expect(s).toBe(keptRef.has(d) ? "needed" : "not-needed"));
    expect(styles.filter((s) => s === "needed").length).toBe(3);
    expect(styles.filter((s) => s === "not-needed").length).toBe(5);

    console.log(`shrink-fade: reports=${reports} shrunk=${shrunk} fadedSizes=${JSON.stringify(sizes)} bestCounts=${JSON.stringify(bestCounts)}`);
  });
});
