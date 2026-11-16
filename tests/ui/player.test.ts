// Feature: bench-ui-core. Playback and previous/next event. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { home, pause, play, RATE, setSpeed, showReplay, stepNext, stepPrev, tick, toEnd } from "../../src/ui/app/model/player";
import { timelineEvents } from "../../src/ui/app/model/timeline";
import { edgesArb, eventsArb } from "./arbitraries";

describe("player", () => {
  it("Property 24: playback keeps the cursor inside the window and follows the rate", () => {
    // Feature: bench-ui-core, Property 24: Playback keeps the Cursor inside the window and follows the rate
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.constantFrom("0.1x" as const, "1x" as const),
        fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 8 }),
        (end, vRaw, speed, steps) => {
          const v = vRaw % (end + 1);
          let s = showReplay(end, v, speed);
          expect(s.cursor).toBe(v);
          expect(s.playing).toBe(false);
          let t = 1000;
          s = play(s, t);
          const c0 = s.cursor;
          let total = 0;
          for (const dt of steps) {
            t += dt;
            total += dt;
            s = tick(s, t);
            expect(s.cursor).toBeGreaterThanOrEqual(0);
            expect(s.cursor).toBeLessThanOrEqual(end);
            if (s.playing) expect(s.cursor).toBe(Math.min(c0 + Math.floor(RATE[speed] * total), end));
            else expect(s.cursor === end || !s.playing).toBe(true);
          }
          const sp = setSpeed(s, speed === "1x" ? "0.1x" : "1x", t);
          expect(sp.cursor).toBe(s.cursor);
          expect(sp.playing).toBe(s.playing);
          expect(pause(s).playing).toBe(false);
        },
      ),
      { seed: 2401, numRuns: 200 },
    );
    expect(RATE["1x"]).toBe(16_000);
    expect(RATE["0.1x"]).toBe(1_600);
    const atEnd = { ...showReplay(100, 100, "1x") };
    expect(play(atEnd, 0).cursor).toBe(0);
  });

  it("Property 25: previous and next event navigation", () => {
    // Feature: bench-ui-core, Property 25: Previous and next event navigation
    fc.assert(
      fc.property(eventsArb, edgesArb, fc.integer({ min: 0, max: 200 }), (events, edges, v) => {
        const list = timelineEvents(events, edges, 200);
        let s = showReplay(200, v, "1x");
        const n = stepNext(s, list, 0);
        const want = list.findIndex((e) => e.cycle > s.cursor);
        if (want < 0) expect(n).toBe(s);
        else {
          expect(n.selected).toBe(want);
          expect(n.cursor).toBe(list[want]!.cycle);
        }
        s = n;
        const p = stepPrev(s, list, 0);
        if (s.selected !== null && s.selected > 0) {
          expect(p.selected).toBe(s.selected - 1);
          expect(p.cursor).toBe(list[s.selected - 1]!.cycle);
        }
        expect(home(s, 0).cursor).toBe(0);
        expect(toEnd(s, 0).cursor).toBe(Math.min(v, 200));
      }),
      { seed: 2501, numRuns: 200 },
    );
  });
});