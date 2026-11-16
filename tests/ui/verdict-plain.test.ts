// Feature: bench-ui-examples. Plain verdict texts, with strings quoted from requirements.md.
// Evidence, not proof.
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import { elapsedSecondsText, shrinkArrowText, shrinkText } from "../../src/ui/app/model/format";
import {
  gremlinLogSummary,
  heldCardText,
  originalRunNote,
  plainCoverageParts,
  reducedReplayNote,
  reductionSentence,
  storyHeading,
} from "../../src/ui/app/model/verdict-plain";

const HELD_24 = "No violation found in 24 emulated runs of this gremlin set. Not a proof.";
const HELD_1 = "No violation found in 1 emulated run of this gremlin set. Not a proof.";
const NEVER_PART = "Rule trigger: none, a never rule has no trigger";

const ev = (gremlinId: string, cycle: number) =>
  ({ cycle, signal: "REQUEST", gremlinId, value: 0 }) as unknown as ReducerEvent;

describe("verdict plain texts", () => {
  it("heldCardText: sentence, then the HELD text unchanged (Req 7.1 to 7.3)", () => {
    expect(heldCardText("fixed", { runs: 24, text: HELD_24 })).toEqual([
      "No gremlin broke the fixed program in 24 tries.",
      HELD_24,
    ]);
    expect(heldCardText("fixed", { runs: 1, text: HELD_1 })).toEqual([
      "No gremlin broke the fixed program in 1 try.",
      HELD_1,
    ]);
    expect(heldCardText("buggy", { runs: 24, text: HELD_24 })).toEqual([
      "No gremlin broke this program in 24 tries.",
      HELD_24,
    ]);
    expect(heldCardText("buggy", { runs: 1, text: HELD_1 })).toEqual([
      "No gremlin broke this program in 1 try.",
      HELD_1,
    ]);
  });

  it("plainCoverageParts replaces only the never-rule part (Req 7.6)", () => {
    const line = `${NEVER_PART} \u00b7 Gremlin events: 5 \u00b7 Run length: 1,000 ms \u00b7 Seed: 20261101`;
    expect(plainCoverageParts(line)).toEqual([
      "Checked at every cycle of every run (a never rule has no trigger).",
      "Gremlin events: 5",
      "Run length: 1,000 ms",
      "Seed: 20261101",
    ]);
    const other = "Rule trigger happened in 3 of 24 runs \u00b7 Seed: 7";
    expect(plainCoverageParts(other)).toEqual(["Rule trigger happened in 3 of 24 runs", "Seed: 7"]);
  });

  it("gremlinLogSummary for 0, 1 and 8 moves (Req 6.7), Rest_Events not counted", () => {
    expect(gremlinLogSummary([])).toBe("Show the full gremlin log (0 moves)");
    expect(gremlinLogSummary([ev("masher", 10)])).toBe("Show the full gremlin log (1 move)");
    const eight = Array.from({ length: 8 }, (_, i) => ev("masher", i));
    expect(gremlinLogSummary([...eight, ev("rest", 99)])).toBe("Show the full gremlin log (8 moves)");
  });

  it("storyHeading, reducedReplayNote and originalRunNote (Req 11.20 to 11.22)", () => {
    expect(storyHeading()).toBe("What happened, replaying only the moves that matter");
    expect(reducedReplayNote(3, 8)).toBe("(reduced replay, 3 of 8 events)");
    expect(originalRunNote(2, 1)).toBe(
      "The original run had 2 gremlin moves; the story above uses only the 1 that matter, so lengths can differ.",
    );
  });

  it("reductionSentence for the three Examples and the budget singulars (Req 13.1, 13.2)", () => {
    expect(reductionSentence(8, 3, false)).toBe("The gremlins made 8 moves. Only 3 are needed to cause the bug.");
    expect(reductionSentence(7, 3, false)).toBe("The gremlins made 7 moves. Only 3 are needed to cause the bug.");
    expect(reductionSentence(2, 1, false)).toBe("The gremlins made 2 moves. Only 1 is needed to cause the bug.");
    expect(reductionSentence(1, 1, false)).toBe("The gremlins made 1 move. Only 1 is needed to cause the bug.");
    expect(reductionSentence(0, 0, false)).toBe("The gremlins made 0 moves. Only 0 are needed to cause the bug.");
    expect(reductionSentence(8, 3, true)).toBe("The gremlins made 8 moves. 3 of them are enough to cause the bug.");
    expect(reductionSentence(2, 1, true)).toBe("The gremlins made 2 moves. 1 of them is enough to cause the bug.");
    expect(reductionSentence(1, 1, true)).toBe("The gremlins made 1 move. 1 of them is enough to cause the bug.");
  });

  it("elapsedSecondsText (Req 12.4)", () => {
    expect(elapsedSecondsText(0)).toBe("Elapsed 0.0 s");
    expect(elapsedSecondsText(99)).toBe("Elapsed 0.0 s");
    expect(elapsedSecondsText(700)).toBe("Elapsed 0.7 s");
    expect(elapsedSecondsText(61250)).toBe("Elapsed 61.2 s");
  });

  it("shrinkArrowText equals shrinkText with the arrow (Req 13.7)", () => {
    expect(shrinkArrowText(8, 3)).toBe("8 events \u2192 3 events");
    expect(shrinkArrowText(1, 1)).toBe("1 event \u2192 1 event");
    expect(shrinkArrowText(8, 3)).toBe(shrinkText(8, 3).replace("->", "\u2192"));
  });
});
