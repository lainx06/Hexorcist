// Feature: bench-ui-core. Timeline model. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import {
  DISPLAY_MARGIN,
  eventValue,
  gremlinMarkers,
  inputLevelAt,
  laneSegments,
  LANES,
  levelAt,
  markersToRemove,
  selectedEventText,
  timelineEvents,
  windowEnd,
} from "../../src/ui/app/model/timeline";
import { edgesArb, eventsArb, refLevel, SIGNALS } from "./arbitraries";

describe("timeline model", () => {
  it("lanes are in fixture order plus GREMLINS", () => {
    expect([...LANES]).toEqual(["REQUEST", "CAR_GREEN", "CAR_YELLOW", "CAR_RED", "WALK", "DONT_WALK", "GREMLINS"]);
    expect(DISPLAY_MARGIN).toBe(32_000);
  });

  it("Property 1: level at a cycle is the latest edge at or before it", () => {
    // Feature: bench-ui-core, Property 1: Level at a cycle is the latest edge at or before it
    fc.assert(
      fc.property(edgesArb, eventsArb, fc.constantFrom(...SIGNALS), fc.integer({ min: 0, max: 220 }), (edges, events, s, c) => {
        expect(levelAt(edges, s, c)).toBe(refLevel(edges, s, c, (e) => e.value));
        expect(inputLevelAt(events, s, c)).toBe(refLevel(events, s, c, (e) => eventValue(e)));
      }),
      { seed: 101, numRuns: 300 },
    );
  });

  it("Property 2: lane segments agree with the level rule inside the window", () => {
    // Feature: bench-ui-core, Property 2: Lane segments agree with the level rule inside the window
    fc.assert(
      fc.property(edgesArb, fc.constantFrom(...SIGNALS), fc.integer({ min: 0, max: 220 }), (edges, s, end) => {
        const pts = edges.filter((e) => e.signal === s);
        const segs = laneSegments(pts, end);
        for (let k = 0; k < segs.length; k++) {
          const seg = segs[k]!;
          expect(seg.from).toBeGreaterThanOrEqual(0);
          expect(seg.to).toBeLessThanOrEqual(end);
          const last = k === segs.length - 1;
          const hi = last ? seg.to : seg.to - 1;
          for (let c = seg.from; c <= hi; c++) expect(seg.level).toBe(refLevel(pts, s, c, (e) => e.value));
        }
        const inWindow = pts.filter((e) => e.cycle <= end);
        if (inWindow.length === 0) expect(segs).toEqual([]);
        else expect(segs[0]!.from).toBe(Math.min(...inWindow.map((e) => e.cycle)));
      }),
      { seed: 102, numRuns: 200 },
    );
  });

  it("Property 3: Timeline_Events are ordered by cycle with inputs before outputs", () => {
    // Feature: bench-ui-core, Property 3: Timeline_Events are ordered by cycle with inputs before outputs
    fc.assert(
      fc.property(eventsArb, edgesArb, (events, edges) => {
        const out = timelineEvents(events, edges, 1_000);
        expect(out).toHaveLength(events.length + edges.length);
        for (let i = 1; i < out.length; i++) {
          const a = out[i - 1]!;
          const b = out[i]!;
          expect(a.cycle).toBeLessThanOrEqual(b.cycle);
          if (a.cycle === b.cycle) {
            if (a.source === b.source) expect(a.index).toBeLessThan(b.index);
            else expect(a.source).toBe("input");
          }
        }
      }),
      { seed: 103, numRuns: 200 },
    );
  });

  it("Property 4: window end and window contents", () => {
    // Feature: bench-ui-core, Property 4: Window end and window contents
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        eventsArb,
        edgesArb,
        (v, extra, events, edges) => {
          const R = v + extra;
          const end = windowEnd(v, R);
          expect(end).toBe(Math.min(v + 32_000, R));
          const scaled = (k: number) => k * 600;
          const ev2: ReducerEvent[] = events.map((e) => ({ ...e, cycle: scaled(e.cycle) }));
          const ed2 = edges.map((e) => ({ ...e, cycle: scaled(e.cycle) }));
          const out = timelineEvents(ev2, ed2, end);
          const want = ev2.filter((e) => e.cycle <= end).length + ed2.filter((e) => e.cycle <= end).length;
          expect(out).toHaveLength(want);
          for (const t of out) expect(t.cycle).toBeLessThanOrEqual(end);
        },
      ),
      { seed: 104, numRuns: 200 },
    );
  });

  it("Property 5: GREMLINS markers track the best list", () => {
    // Feature: bench-ui-core, Property 5: GREMLINS markers track the best list
    fc.assert(
      fc.property(eventsArb, fc.array(fc.boolean(), { maxLength: 20 }), (events, keep) => {
        const markers = gremlinMarkers(events, 1_000);
        expect(markers).toHaveLength(events.filter((e) => e.gremlinId !== "rest").length);
        const best = events.filter((_, i) => keep[i] ?? true);
        const bestCount = best.filter((e) => e.gremlinId !== "rest").length;
        const gone = markersToRemove(markers, bestCount, best);
        if (bestCount >= markers.length) {
          expect(gone).toEqual([]);
        } else {
          expect(markers.length - gone.length).toBe(bestCount);
        }
      }),
      { seed: 105, numRuns: 200 },
    );
  });

  it("selected event text shows cycle, ms, signal and value", () => {
    const [ev] = timelineEvents([], [{ signal: "WALK", value: 1, cycle: 15_647_543 }], 20_000_000);
    expect(selectedEventText(ev!)).toBe("15,647,543 cycles \u00b7 978.0 ms \u00b7 WALK = 1");
  });
});