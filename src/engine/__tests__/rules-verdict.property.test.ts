// Property 6 (rule-compiler): Verdict honesty. Task 6.8 adds Property 7 to this file.
// Evidence, not proof.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { computeVerdict, heldText, runCountPhrase, triggerReason } from "../verdict";
import { untriggeredRules } from "../rules/trigger";
import { render } from "../rules/render";
import { arbVerdictHonestyInput } from "./rules-arbitraries-verdict";
import { arbTriggerSetCase } from "./rules-arbitraries";
import { referenceTriggerOccurred } from "./rules-reference";

const SEED_P6 = 3418276059;
const NUM_RUNS_P6 = 200;
const SEED_P7 = 1907435862;
const NUM_RUNS_P7 = 200;

describe("rule-compiler verdict property", () => {
  // Feature: rule-compiler, Property 6: Verdict honesty
  // Validates: Requirements 12.4, 12.5, 12.6, 12.8, 12.9
  it("Property 6: BROKE and HELD are returned only when their conditions hold", () => {
    let broke = 0;
    let held = 0;
    let couldntTell = 0;

    fc.assert(
      fc.property(arbVerdictHonestyInput, (input) => {
        const before = structuredClone(input);
        const v = computeVerdict(input);
        expect(input).toEqual(before);
        expect(v).not.toBeNull();
        if (v === null) return;
        const n = input.runs.length;

        if (v.verdict === "BROKE") {
          broke++;
          const violating = input.runs.filter((r) => r.violation !== null);
          expect(violating.length).toBeGreaterThan(0);
          const lowest = violating.reduce((m, r) => (r.runIndex < m.runIndex ? r : m));
          expect(v.trace.runIndex).toBe(lowest.runIndex);
          expect(v.trace.runSeed).toBe(lowest.runSeed);
          expect(v.trace.violation).toEqual(lowest.violation);
          expect(v.trace.eventList).toEqual(lowest.eventList);
          expect(v.trace.outputEvents).toEqual(lowest.outputEvents);
        } else if (v.verdict === "HELD") {
          held++;
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBe(input.requestedRuns);
          expect(v.text).toBe(heldText(n));
          expect(v.runs).toBe(n);
        } else {
          couldntTell++;
        }

        if (input.untriggeredRules !== undefined && input.untriggeredRules.length === 0) {
          const { untriggeredRules: _omitted, ...without } = input;
          expect(v).toEqual(computeVerdict(without));
        }
      }),
      { seed: SEED_P6, numRuns: NUM_RUNS_P6 },
    );

    const counts = `broke=${broke}, held=${held}, couldntTell=${couldntTell}`;
    console.log(`Property 6: seed=${SEED_P6} numRuns=${NUM_RUNS_P6} ${counts}`);
    expect(broke, `outcome broke never seen (${counts})`).toBeGreaterThan(0);
    expect(held, `outcome held never seen (${counts})`).toBeGreaterThan(0);
    expect(couldntTell, `outcome couldntTell never seen (${counts})`).toBeGreaterThan(0);
  });

  // Feature: rule-compiler, Property 7: Trigger check through the verdict
  // Validates: Requirements 12.1, 12.2, 12.3, 12.5, 12.6, 12.7, 12.10, 11.5
  it("Property 7: a Rule whose Trigger never happened is named by the verdict, and only that Rule", () => {
    let neverSeenClean = 0;
    let neverSeenBroke = 0;
    let seenInAll = 0;
    let seenInSome = 0;
    let oneRun = 0;
    let manyRuns = 0;

    fc.assert(
      fc.property(arbTriggerSetCase, (c) => {
        const before = structuredClone(c);
        const n = c.runs.length;
        const sentences = c.ruleSet.map((r) => {
          const out = render(r);
          if (!out.ok) throw new Error("generated rule does not render");
          return out.sentence;
        });

        // The reference decides each Rule's Trigger per Run.
        const triggeredPerRule = c.ruleSet.map((r, i) =>
          c.runs.map((run) => referenceTriggerOccurred(r, c.fixture, c.windows[i], run)),
        );
        const expectedUntriggered: string[] = [];
        c.ruleSet.forEach((r, i) => {
          if (r.form !== "never" && !triggeredPerRule[i].some((t) => t)) expectedUntriggered.push(sentences[i]);
        });

        const listed = untriggeredRules([...c.ruleSet], c.fixture, c.runs);
        expect(listed).toEqual(expectedUntriggered);
        for (let i = 0; i < c.ruleSet.length; i++) {
          if (c.ruleSet[i].form === "never") expect(listed).not.toContain(sentences[i]);
        }

        const requestedRuns = n + (c.runs.reduce((a, r) => a + r.endCycle, 0) % 2);
        const v = computeVerdict({
          requestedRuns,
          runs: c.runs,
          finished: true,
          unmappedSignals: [],
          unsupportedPeripherals: [],
          untriggeredRules: listed,
        });
        expect(v).not.toBeNull();
        if (v === null) return;
        const anyViolation = c.runs.some((r) => r.violation !== null);
        const reason = triggerReason(n);
        expect(reason).toBe(`trigger never happened in ${runCountPhrase(n)}`);

        const uncheckedOf = (): readonly { rule: string; reason: string }[] =>
          v.verdict === "BROKE" ? v.unchecked : [];
        const couldntTellText = v.verdict === "COULDN'T TELL" ? v.reason : "";

        if (listed.length > 0) {
          expect(v.verdict).not.toBe("HELD");
          if (!anyViolation) {
            expect(v.verdict).toBe("COULDN'T TELL");
          } else {
            expect(v.verdict).toBe("BROKE");
            for (const s of listed) expect(uncheckedOf()).toContainEqual({ rule: s, reason });
          }
        }

        c.ruleSet.forEach((r, i) => {
          if (r.form === "never") return;
          const s = sentences[i];
          const flags = triggeredPerRule[i];
          if (flags.some((t) => t)) {
            expect(uncheckedOf().some((u) => u.rule === s && u.reason === reason)).toBe(false);
            expect(couldntTellText).not.toContain(`Rule "${s}" could not be checked: ${reason}`);
            if (flags.every((t) => t)) seenInAll++;
            else seenInSome++;
          } else if (v.verdict === "COULDN'T TELL") {
            neverSeenClean++;
          } else if (v.verdict === "BROKE") {
            neverSeenBroke++;
          }
        });
        if (n === 1) oneRun++;
        else manyRuns++;
        expect(c).toEqual(before);
      }),
      { seed: SEED_P7, numRuns: NUM_RUNS_P7 },
    );

    const counts =
      `neverSeenClean=${neverSeenClean}, neverSeenBroke=${neverSeenBroke}, seenInAll=${seenInAll}, ` +
      `seenInSome=${seenInSome}, oneRun=${oneRun}, manyRuns=${manyRuns}`;
    console.log(`Property 7: seed=${SEED_P7} numRuns=${NUM_RUNS_P7} ${counts}`);
    expect(neverSeenClean, `outcome neverSeenClean never seen (${counts})`).toBeGreaterThan(0);
    expect(neverSeenBroke, `outcome neverSeenBroke never seen (${counts})`).toBeGreaterThan(0);
    expect(seenInAll, `outcome seenInAll never seen (${counts})`).toBeGreaterThan(0);
    expect(seenInSome, `outcome seenInSome never seen (${counts})`).toBeGreaterThan(0);
    expect(oneRun, `outcome oneRun never seen (${counts})`).toBeGreaterThan(0);
    expect(manyRuns, `outcome manyRuns never seen (${counts})`).toBeGreaterThan(0);
  });
});
