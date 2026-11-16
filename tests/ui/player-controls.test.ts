// Replay player controls: pure logic for the scrubber, speed buttons and event jumps. Evidence, not proof.
import { describe, expect, it } from "vitest";
import {
  clampCursor,
  CYCLES_PER_MS,
  cycleFromPlotX,
  DEFAULT_SPEED,
  home,
  isSpeed,
  jumpNext,
  jumpPrev,
  navEvents,
  nextEventIndex,
  nudge,
  play,
  prevEventIndex,
  RATE,
  seek,
  setSpeed,
  showReplay,
  SPEEDS,
  tick,
} from "../../src/ui/app/model/player";
import type { TimelineEvent } from "../../src/ui/app/model/timeline";
import { VERDICT_PLAIN, plainRunText, runOfText } from "../../src/ui/app/model/verdict-plain";

const input = (cycle: number, gremlinId: string, index = 0): TimelineEvent => ({
  source: "input",
  index,
  cycle,
  signal: "REQUEST",
  value: 0,
  gremlinId,
});
const output = (cycle: number, index = 0): TimelineEvent => ({ source: "output", index, cycle, signal: "WALK", value: 1 });

describe("speed steps", () => {
  it("lists 0.01x, 0.05x, 0.1x, 0.25x, 0.5x and 1x in order, with rates that rise by the same ratio", () => {
    expect([...SPEEDS]).toEqual(["0.01x", "0.05x", "0.1x", "0.25x", "0.5x", "1x"]);
    for (const s of SPEEDS) expect(RATE[s]).toBe(Math.round(parseFloat(s) * CYCLES_PER_MS));
    expect(DEFAULT_SPEED).toBe("0.1x");
    expect(isSpeed("0.25x")).toBe(true);
    expect(isSpeed("2x")).toBe(false);
  });

  it("a speed change keeps the cursor and moves the playback anchor to it", () => {
    let s = play(showReplay(1_000_000, 5000, "1x"), 100);
    s = tick(s, 110);
    const before = s.cursor;
    const next = setSpeed(s, "0.01x", 110);
    expect(next.cursor).toBe(before);
    expect(next.anchor).toEqual({ c0: before, t0: 110 });
    expect(tick(next, 210).cursor).toBe(before + 160 * 100);
  });
});

describe("cursor clamping", () => {
  it("keeps whole cycles inside [0, end]", () => {
    expect(clampCursor(-5, 100)).toBe(0);
    expect(clampCursor(101, 100)).toBe(100);
    expect(clampCursor(42.4, 100)).toBe(42);
    expect(clampCursor(Number.NaN, 100)).toBe(0);
    expect(clampCursor(Number.POSITIVE_INFINITY, 100)).toBe(0);
  });

  it("seek and nudge clamp, and nudge moves 1 ms or 10 ms in cycles", () => {
    const s = showReplay(200_000, 100_000, "0.1x");
    expect(seek(s, 999_999, 0).cursor).toBe(200_000);
    expect(seek(s, -1, 0).cursor).toBe(0);
    expect(nudge(s, 1, 0).cursor).toBe(100_000 + 16_000);
    expect(nudge(s, -10, 0).cursor).toBe(0);
    expect(nudge(s, 10, 0).cursor).toBe(200_000);
    expect(home(s, 0).cursor).toBe(0);
  });

  it("seeking while playing re-anchors playback at the new cursor", () => {
    const playing = play(showReplay(1_000_000, 0, "1x"), 50);
    const moved = seek(playing, 400_000, 60);
    expect(moved.playing).toBe(true);
    expect(moved.anchor).toEqual({ c0: 400_000, t0: 60 });
  });

  it("maps plot x back to a cycle inside the window", () => {
    expect(cycleFromPlotX(8, 1016, 1000)).toBe(0);
    expect(cycleFromPlotX(1008, 1016, 1000)).toBe(1000);
    expect(cycleFromPlotX(508, 1016, 1000)).toBe(500);
    expect(cycleFromPlotX(-50, 1016, 1000)).toBe(0);
    expect(cycleFromPlotX(5000, 1016, 1000)).toBe(1000);
    expect(cycleFromPlotX(100, 10, 1000)).toBe(0);
    expect(cycleFromPlotX(100, 1016, 0)).toBe(0);
  });

  it("playing to the end stops there", () => {
    let s = play(showReplay(1000, 900, "1x"), 0);
    s = tick(s, 10);
    expect(s.cursor).toBe(1000);
    expect(s.playing).toBe(false);
  });
});

describe("previous and next event lookup", () => {
  const list = navEvents([input(100, "masher"), input(150, "rest"), output(200), input(200, "masher", 1), output(300, 1)]);

  it("leaves Rest events out and keeps gremlin events and output changes", () => {
    expect(list.map((e) => e.cycle)).toEqual([100, 200, 200, 300]);
  });

  it("finds the nearest event strictly after or before the cursor", () => {
    expect(nextEventIndex(list, 0)).toBe(0);
    expect(nextEventIndex(list, 100)).toBe(1);
    expect(nextEventIndex(list, 300)).toBe(-1);
    expect(prevEventIndex(list, 300)).toBe(2);
    expect(prevEventIndex(list, 100)).toBe(-1);
    expect(prevEventIndex(list, 101)).toBe(0);
    expect(nextEventIndex([], 0)).toBe(-1);
  });

  it("jumps from the cursor, ignoring any earlier selection", () => {
    let s = showReplay(400, 0, "1x");
    s = jumpNext(s, list, 0);
    expect(s.cursor).toBe(100);
    s = seek(s, 250, 0);
    expect(s.selected).toBeNull();
    expect(jumpNext(s, list, 0).cursor).toBe(300);
    expect(jumpPrev(s, list, 0).cursor).toBe(200);
  });

  it("does nothing past the last or before the first event", () => {
    const end = showReplay(400, 400, "1x");
    expect(jumpNext(end, list, 0)).toBe(end);
    const start = showReplay(400, 0, "1x");
    expect(jumpPrev(start, list, 0)).toBe(start);
  });
});

describe("plain run line", () => {
  it("reads Broke on try N of M. while the technical line keeps run N of M", () => {
    const trace = { runIndex: 6 } as Parameters<typeof runOfText>[0];
    expect(plainRunText(trace, 24)).toBe("Broke on try 7 of 24.");
    expect(runOfText(trace, 24)).toBe("run 7 of 24");
    expect(VERDICT_PLAIN.brokeOnTry).toContain("{n}");
  });
});
