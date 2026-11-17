// Property tests for the stage scene models (task 4.2: Property 17, task 4.3: Property 18).
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Fixture, OutputEvent } from "../../src/engine/types";
import {
  BEAM_TEXT,
  FLICKER_TEXT,
  FLICKER_WINDOW_CYCLES,
  beamText,
  FORGOT_LINE,
  RING_TEXT,
  deadlineBadge,
  flickers,
  forgotLine,
  pumpkinShown,
  ringAt,
  stuckHoldsPulse,
  type ShownKind,
} from "../../src/ui/app/model/scenes";
import {
  CROSSWALK_CAR_LEN,
  CROSSWALK_LOOP,
  CROSSWALK_STOP,
  CROSSWALK_STRIPES_FROM,
  CROSSWALK_STRIPES_TO,
  CROSSWALK_WALK_CROSS,
  crosswalkFrame,
  crosswalkLabels,
} from "../../src/ui/app/model/crosswalk-scene";
import {
  beamClearEventsArb,
  crosswalkEdgesArb,
  heartbeatEdgesArb,
  limitArb,
  requestEventsArb,
} from "./stage-arbitraries";

const SEED = 20261117;
const RUNS = 300;
const MAX_CYCLE = 16_000_000;

// Independent level lookup: the latest edge at or before c wins; on equal cycles the later list entry wins.
function level(edges: readonly OutputEvent[], signal: string, c: number): unknown {
  let value: unknown;
  let at = -1;
  for (const e of edges) {
    if (e.signal === signal && e.cycle <= c && e.cycle >= at) {
      value = e.value;
      at = e.cycle;
    }
  }
  return value;
}

function walkOnAt(edges: readonly OutputEvent[], c: number): boolean {
  return level(edges, "WALK", c) === 1;
}

function lightAt(edges: readonly OutputEvent[], c: number): "green" | "yellow" | "red" | "off" {
  if (level(edges, "CAR_GREEN", c) === 1) return "green";
  if (level(edges, "CAR_YELLOW", c) === 1) return "yellow";
  if (level(edges, "CAR_RED", c) === 1) return "red";
  return "off";
}

/** Light-cycle shaped edges: each phase sets all four signals, so red phases are common. */
const phasedEdgesArb: fc.Arbitrary<OutputEvent[]> = fc
  .array(
    fc.record({
      light: fc.constantFrom("green", "yellow", "red", "red", "off"),
      walk: fc.boolean(),
      gap: fc.integer({ min: 0, max: 3_000_000 }),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((phases) => {
    const out: OutputEvent[] = [];
    let c = 0;
    for (const p of phases) {
      c += p.gap;
      out.push({ signal: "CAR_GREEN", value: p.light === "green" ? 1 : 0, cycle: c });
      out.push({ signal: "CAR_YELLOW", value: p.light === "yellow" ? 1 : 0, cycle: c });
      out.push({ signal: "CAR_RED", value: p.light === "red" ? 1 : 0, cycle: c });
      out.push({ signal: "WALK", value: p.walk ? 1 : 0, cycle: c });
    }
    return out;
  });

const edgesAnyArb = fc.oneof(crosswalkEdgesArb, phasedEdgesArb);

const cursorsArb = fc.array(fc.integer({ min: 0, max: MAX_CYCLE }), { minLength: 1, maxLength: 6 });
const nearArb = fc.array(
  fc.record({ pick: fc.nat(), off: fc.constantFrom(-1, 0, 1) }),
  { maxLength: 6 },
);

function nearWalkCursors(edges: readonly OutputEvent[], near: { pick: number; off: number }[]): number[] {
  const walk = edges.filter((e) => e.signal === "WALK");
  if (walk.length === 0) return [];
  return near
    .map((n) => (walk[n.pick % walk.length] as OutputEvent).cycle + n.off)
    .filter((c) => c >= 0);
}

describe("Property 17: Crosswalk car", () => {
  // Feature: bench-ui-stage, Property 17: Crosswalk car
  // **Validates: Requirements 13.2, 13.3**
  it("never overlaps the stripes while WALK is on or the walker is on the stripes", () => {
    fc.assert(
      fc.property(edgesAnyArb, requestEventsArb, cursorsArb, nearArb, (edges, events, raw, near) => {
        for (const c of [...raw, ...nearWalkCursors(edges, near)]) {
          const f = crosswalkFrame(edges, events, c);
          const walkOn = walkOnAt(edges, c);
          const overlaps = f.carX > CROSSWALK_STRIPES_FROM && f.carX - CROSSWALK_CAR_LEN < CROSSWALK_STRIPES_TO;
          expect(f.carOnStripes).toBe(overlaps);
          expect(f.walk).toBe(walkOn ? "on" : "off");
          expect(f.carX).toBeGreaterThanOrEqual(0);
          expect(f.carX).toBeLessThan(CROSSWALK_LOOP);
          if (walkOn || f.walkerOnStripes) expect(overlaps).toBe(false);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  // Feature: bench-ui-stage, Property 17: Crosswalk car
  // **Validates: Requirements 13.2**
  it("is pure: same edges and cursor give the same frame, also after other cursors", () => {
    fc.assert(
      fc.property(edgesAnyArb, requestEventsArb, cursorsArb, nearArb, (edges, events, raw, near) => {
        const cursors = [...raw, ...nearWalkCursors(edges, near)];
        for (const c of cursors) {
          const first = crosswalkFrame(edges, events, c);
          expect(crosswalkFrame(edges, events, c)).toEqual(first);
          for (const other of cursors) crosswalkFrame(edges, events, other);
          expect(crosswalkFrame(edges, events, c)).toEqual(first);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  // Feature: bench-ui-stage, Property 17: Crosswalk car
  // **Validates: Requirements 13.2**
  it("holds at the stop line while the car light is red over a whole interval", () => {
    let checked = 0;
    fc.assert(
      fc.property(
        edgesAnyArb,
        requestEventsArb,
        fc.integer({ min: 0, max: MAX_CYCLE }),
        fc.oneof(fc.integer({ min: 0, max: 64 }), fc.integer({ min: 0, max: 8_000_000 })),
        (edges, events, p, span) => {
          const q = p + span;
          // Red over [p, q]: red at p and at every light edge cycle inside (p, q].
          const marks = [p, ...edges.filter((e) => e.signal.startsWith("CAR_") && e.cycle > p && e.cycle <= q).map((e) => e.cycle)];
          if (!marks.every((m) => lightAt(edges, m) === "red")) return;
          checked++;
          expect(crosswalkFrame(edges, events, p).carX).toBe(CROSSWALK_STOP);
          expect(crosswalkFrame(edges, events, q).carX).toBe(CROSSWALK_STOP);
          expect(crosswalkFrame(edges, events, p + Math.floor(span / 2)).carX).toBe(CROSSWALK_STOP);
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    expect(checked).toBeGreaterThan(20);
  });
});

// Independent REQUEST pressed check: REQUEST is active low, so a latest event value of 0 means pressed.
function requestPressedAt(events: readonly { cycle: number; signal: string; value?: unknown }[], c: number): boolean {
  let value: unknown;
  let at = -1;
  for (const e of events) {
    if (e.signal === "REQUEST" && e.cycle <= c && e.cycle >= at) {
      value = e.value;
      at = e.cycle;
    }
  }
  return value === 0;
}

describe("Property 18: Crosswalk walker, signals and labels", () => {
  const cursors = (edges: readonly OutputEvent[], raw: number[], near: { pick: number; off: number }[]): number[] => [
    ...raw,
    ...nearWalkCursors(edges, near),
  ];

  // Feature: bench-ui-stage, Property 18: Crosswalk walker, signals and labels
  // **Validates: Requirements 13.4**
  it("waits while WALK has stayed off, crosses while WALK is on, and finishes a started crossing", () => {
    let waiting = 0;
    let onCount = 0;
    let continued = 0;
    fc.assert(
      fc.property(
        edgesAnyArb,
        requestEventsArb,
        cursorsArb,
        nearArb,
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 4 }),
        (edges, events, raw, near, fractions) => {
          for (const c of cursors(edges, raw, near)) {
            const f = crosswalkFrame(edges, events, c);
            // WALK off since cycle 0 up to c: off at 0 and at every WALK edge cycle at or before c.
            const walkCycles = edges.filter((e) => e.signal === "WALK" && e.cycle <= c).map((e) => e.cycle);
            const everOn = [0, ...walkCycles, c].some((x) => walkOnAt(edges, x));
            if (!everOn) {
              waiting++;
              expect(f.walkerY).toBe(0);
              expect(f.walkerOnStripes).toBe(false);
            }
            if (walkOnAt(edges, c)) {
              onCount++;
              expect(f.walkerOnStripes).toBe(true);
              expect(f.walkerY).toBeGreaterThanOrEqual(0);
              expect(f.walkerY).toBeLessThan(CROSSWALK_WALK_CROSS);
            }
            if (f.walkerOnStripes) {
              const remaining = CROSSWALK_WALK_CROSS - f.walkerY;
              let prevY = f.walkerY;
              const offsets = [...new Set(fractions.map((x) => Math.floor(x * (remaining - 1))))]
                .filter((d) => d > 0 && d < remaining)
                .sort((a, b) => a - b);
              for (const d of offsets) {
                const g = crosswalkFrame(edges, events, c + d);
                continued++;
                expect(g.walkerOnStripes).toBe(true);
                expect(g.walkerY).toBe(f.walkerY + d);
                expect(g.walkerY).toBeGreaterThan(prevY);
                prevY = g.walkerY;
              }
              const edge = crosswalkFrame(edges, events, c + remaining - 1);
              expect(edge.walkerOnStripes).toBe(true);
              expect(edge.walkerY).toBe(CROSSWALK_WALK_CROSS - 1);
            }
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    expect(waiting).toBeGreaterThan(20);
    expect(onCount).toBeGreaterThan(20);
    expect(continued).toBeGreaterThan(20);
  });

  // Feature: bench-ui-stage, Property 18: Crosswalk walker, signals and labels
  // **Validates: Requirements 13.5**
  it("shows the conflict exactly when the car light is green and WALK is on", () => {
    let conflicts = 0;
    fc.assert(
      fc.property(edgesAnyArb, requestEventsArb, cursorsArb, nearArb, (edges, events, raw, near) => {
        for (const c of cursors(edges, raw, near)) {
          const f = crosswalkFrame(edges, events, c);
          const expected = lightAt(edges, c) === "green" && walkOnAt(edges, c);
          expect(f.conflict).toBe(expected);
          const text = crosswalkLabels(f).conflict;
          if (expected) {
            conflicts++;
            expect(text).toBe("Both have a green!");
          } else {
            expect(text).toBeNull();
          }
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(conflicts).toBeGreaterThan(5);
  });

  // Feature: bench-ui-stage, Property 18: Crosswalk walker, signals and labels
  // **Validates: Requirements 13.6**
  it("lights the lamp exactly when REQUEST is pressed at the Cursor", () => {
    let lit = 0;
    fc.assert(
      fc.property(
        edgesAnyArb,
        requestEventsArb,
        cursorsArb,
        fc.array(fc.record({ pick: fc.nat(), off: fc.constantFrom(-1, 0, 1) }), { maxLength: 6 }),
        (edges, events, raw, near) => {
          const atEvents = near
            .filter(() => events.length > 0)
            .map((n) => (events[n.pick % events.length] as { cycle: number }).cycle + n.off)
            .filter((c) => c >= 0);
          for (const c of [...raw, ...atEvents]) {
            const pressed = requestPressedAt(events, c);
            if (pressed) lit++;
            expect(crosswalkFrame(edges, events, c).lampLit).toBe(pressed);
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    expect(lit).toBeGreaterThan(20);
  });

  // Feature: bench-ui-stage, Property 18: Crosswalk walker, signals and labels
  // **Validates: Requirements 13.8**
  it("labels the car light, walk sign and button from the frame state", () => {
    fc.assert(
      fc.property(edgesAnyArb, requestEventsArb, cursorsArb, nearArb, (edges, events, raw, near) => {
        for (const c of cursors(edges, raw, near)) {
          const f = crosswalkFrame(edges, events, c);
          const labels = crosswalkLabels(f);
          expect(labels.carLight).toBe(`Car light: ${lightAt(edges, c)}`);
          expect(f.carLight).toBe(lightAt(edges, c));
          expect(labels.walk).toBe(walkOnAt(edges, c) ? "Walk sign: on" : "Walk sign: off");
          expect(labels.button).toBe("Walk button");
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Property 19 helpers. The garage fixture is read-only; BEAM_CLEAR is active low, released at rest.
const GARAGE_FIXTURE = JSON.parse(readFileSync("examples/garage/fixture.json", "utf8")) as Fixture;
const BEAM_ACTIVE_VALUE = 0;

type BeamEvent = ReducerEvent & { value: 0 | 1 | "release" };

/** Closely spaced BEAM_CLEAR events, so several level changes can land inside one 10 ms window. */
const clusteredBeamEventsArb: fc.Arbitrary<ReducerEvent[]> = fc
  .tuple(
    fc.integer({ min: 0, max: 2_000_000 }),
    fc.array(
      fc.record({
        gap: fc.integer({ min: 0, max: 90_000 }),
        value: fc.constantFrom(0 as const, 1 as const, "release" as const),
        gremlinId: fc.constantFrom("masher", "bouncer", "rest"),
      }),
      { minLength: 1, maxLength: 10 },
    ),
  )
  .map(([start, steps]) => {
    let cycle = start;
    return steps.map((s) => {
      cycle += s.gap;
      return { cycle, signal: "BEAM_CLEAR", value: s.value, gremlinId: s.gremlinId } as ReducerEvent;
    });
  });

const beamListArb = fc.oneof(beamClearEventsArb, clusteredBeamEventsArb);

/** Latest BEAM_CLEAR value at or before c (later list entry wins on equal cycles); undefined before any. */
function beamValueAt(events: readonly ReducerEvent[], c: number): 0 | 1 | "release" | undefined {
  let value: 0 | 1 | "release" | undefined;
  let at = -1;
  for (const e of events as readonly BeamEvent[]) {
    if (e.signal === "BEAM_CLEAR" && e.cycle <= c && e.cycle >= at) {
      value = e.value;
      at = e.cycle;
    }
  }
  return value;
}

/** Level changes by cycle: the settled value at each distinct event cycle against the settled value before it. */
function beamChangeCycles(events: readonly ReducerEvent[]): number[] {
  const cycles = [...new Set(events.filter((e) => e.signal === "BEAM_CLEAR").map((e) => e.cycle))].sort((a, b) => a - b);
  const out: number[] = [];
  let prev: 0 | 1 | "release" = "release"; // fixture rest state: released
  for (const cy of cycles) {
    const now = beamValueAt(events, cy) as 0 | 1 | "release";
    if (now !== prev) out.push(cy);
    prev = now;
  }
  return out;
}

function expectedFlickers(events: readonly ReducerEvent[], c: number): boolean {
  return beamChangeCycles(events).filter((cy) => cy > c - FLICKER_WINDOW_CYCLES && cy <= c).length > 1;
}

function expectedPumpkin(events: readonly ReducerEvent[], c: number): boolean {
  return events.some((e) => e.signal === "BEAM_CLEAR" && e.gremlinId !== "rest" && e.cycle <= c);
}

function expectedBeam(events: readonly ReducerEvent[], c: number): string {
  return beamValueAt(events, c) === BEAM_ACTIVE_VALUE ? "Beam blocked" : "Beam clear";
}

/** Cursors at random places, at every event cycle (-1, 0, +1), and at each change cycle + 159,999 / + 160,000. */
function beamCursors(events: readonly ReducerEvent[], raw: number[]): number[] {
  const out = [...raw];
  for (const e of events) for (const d of [-1, 0, 1]) out.push(e.cycle + d);
  for (const cy of beamChangeCycles(events)) {
    out.push(cy + FLICKER_WINDOW_CYCLES - 1, cy + FLICKER_WINDOW_CYCLES, cy + FLICKER_WINDOW_CYCLES + 1);
  }
  return out.filter((c) => c >= 0);
}

const rawCursorsArb = fc.array(fc.integer({ min: 0, max: 3_300_000 }), { minLength: 1, maxLength: 4 });

describe("Property 19: Garage pumpkin, beam, flicker and badge", () => {
  it("uses the real garage fixture with an active-low BEAM_CLEAR", () => {
    const pin = GARAGE_FIXTURE.pins.find((p) => p.signal === "BEAM_CLEAR");
    expect(pin?.direction).toBe("input");
    expect((pin as { activeLevel?: string }).activeLevel).toBe("low");
  });

  // Feature: bench-ui-stage, Property 19: Garage pumpkin, beam, flicker and badge
  // **Validates: Requirements 14.2**
  it("shows the pumpkin exactly at or after the earliest non-rest BEAM_CLEAR event", () => {
    let shown = 0;
    let hidden = 0;
    let noGremlin = 0;
    fc.assert(
      fc.property(beamListArb, rawCursorsArb, (events, raw) => {
        if (!events.some((e) => e.gremlinId !== "rest")) noGremlin++;
        for (const c of beamCursors(events, raw)) {
          const expected = expectedPumpkin(events, c);
          expect(pumpkinShown(events, c)).toBe(expected);
          if (expected) shown++;
          else hidden++;
        }
        // Other signals never count.
        const other = events.map((e) => ({ ...e, signal: "CLOSE" }) as ReducerEvent);
        expect(pumpkinShown(other, 3_300_000)).toBe(false);
        expect(pumpkinShown([], 3_300_000)).toBe(false);
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(shown).toBeGreaterThan(50);
    expect(hidden).toBeGreaterThan(50);
    expect(noGremlin).toBeGreaterThan(5);
  });

  // Feature: bench-ui-stage, Property 19: Garage pumpkin, beam, flicker and badge
  // **Validates: Requirements 14.3**
  it("says Beam blocked exactly when BEAM_CLEAR is at its active level at the Cursor", () => {
    let blocked = 0;
    let clear = 0;
    fc.assert(
      fc.property(beamListArb, rawCursorsArb, (events, raw) => {
        for (const c of beamCursors(events, raw)) {
          const expected = expectedBeam(events, c);
          expect(beamText(events, GARAGE_FIXTURE, c)).toBe(expected);
          if (expected === BEAM_TEXT.blocked) blocked++;
          else clear++;
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(blocked).toBeGreaterThan(50);
    expect(clear).toBeGreaterThan(50);
  });

  // Feature: bench-ui-stage, Property 19: Garage pumpkin, beam, flicker and badge
  // **Validates: Requirements 14.4**
  it("flickers exactly when more than one level change lies in (c - 160,000, c]", () => {
    let yes = 0;
    let no = 0;
    let edgeCases = 0;
    fc.assert(
      fc.property(beamListArb, rawCursorsArb, (events, raw) => {
        for (const c of beamCursors(events, raw)) {
          const expected = expectedFlickers(events, c);
          expect(flickers(events, c)).toBe(expected);
          if (expected) yes++;
          else no++;
        }
        // Boundary: a change exactly 160,000 cycles back is outside the window, 159,999 back is inside.
        for (const cy of beamChangeCycles(events)) {
          for (const c of [cy + FLICKER_WINDOW_CYCLES - 1, cy + FLICKER_WINDOW_CYCLES]) {
            edgeCases++;
            expect(flickers(events, c)).toBe(expectedFlickers(events, c));
          }
        }
        expect(FLICKER_TEXT).toBe("Sensor reading flickers");
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(yes).toBeGreaterThan(50);
    expect(no).toBeGreaterThan(50);
    expect(edgeCases).toBeGreaterThan(50);
  });

  // Feature: bench-ui-stage, Property 19: Garage pumpkin, beam, flicker and badge
  // **Validates: Requirements 14.2, 14.3, 14.4**
  it("never looks ahead: events after the Cursor change nothing at the Cursor", () => {
    let checked = 0;
    fc.assert(
      fc.property(
        beamListArb,
        rawCursorsArb,
        fc.array(
          fc.record({
            gap: fc.integer({ min: 1, max: 400_000 }),
            value: fc.constantFrom(0 as const, 1 as const, "release" as const),
            gremlinId: fc.constantFrom("masher", "bouncer", "rest"),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (events, raw, extra) => {
          for (const c of beamCursors(events, raw)) {
            let cycle = c;
            const later = extra.map((x) => {
              cycle += x.gap;
              return { cycle, signal: "BEAM_CLEAR", value: x.value, gremlinId: x.gremlinId } as ReducerEvent;
            });
            const more = [...events, ...later];
            checked++;
            expect(flickers(more, c)).toBe(flickers(events, c));
            expect(beamText(more, GARAGE_FIXTURE, c)).toBe(beamText(events, GARAGE_FIXTURE, c));
            expect(pumpkinShown(more, c)).toBe(pumpkinShown(events, c));
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    expect(checked).toBeGreaterThan(500);
  });

  // Feature: bench-ui-stage, Property 19: Garage pumpkin, beam, flicker and badge
  // **Validates: Requirements 14.5**
  it("shows the badge with the limit only for the reduced buggy replay at or past v", () => {
    const kinds: ShownKind[] = ["reduced-buggy", "reduced-fixed", "original-buggy", "original-fixed"];
    let shown = 0;
    let hidden = 0;
    fc.assert(
      fc.property(
        fc.constantFrom(...kinds),
        fc.integer({ min: 0, max: 16_000_000 }),
        fc.constantFrom(-1, 0, 1, 2),
        fc.integer({ min: 0, max: 16_000_000 }),
        limitArb,
        (kind, v, near, other, limit) => {
          for (const c of [other, v, Math.max(0, v - 1), v + 1, Math.max(0, v + near)]) {
            const got = deadlineBadge(kind, v, c, limit);
            if (kind === "reduced-buggy" && c >= v) {
              shown++;
              expect(got).toBe(`${String(limit)} ms deadline missed \u00b7 door still closing`);
            } else {
              hidden++;
              expect(got).toBeNull();
            }
          }
        },
      ),
      { seed: SEED, numRuns: RUNS },
    );
    expect(shown).toBeGreaterThan(100);
    expect(hidden).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------------------------
// Property 20 helpers. 16,000 cycles = 1 ms.
const PER_MS = 16_000;

/**
 * Independent last-change lookup. The first HEARTBEAT edge counts as a change (the light is first seen at that
 * cycle); a later edge counts only when its value differs from the previous edge. Before any edge: run start, 0.
 */
function lastChange(edges: readonly OutputEvent[], c: number): { at: number; level: unknown } {
  let at = 0;
  let level: unknown;
  let seen = false;
  for (const e of edges.filter((x) => x.signal === "HEARTBEAT" && x.cycle <= c)) {
    if (!seen || e.value !== level) at = e.cycle;
    seen = true;
    level = e.value;
  }
  return { at, level };
}

/** Cursors at random places and at every change cycle -1/0/+1 and change + limit x 16,000 -1/0/+1. */
function ringCursors(edges: readonly OutputEvent[], limit: number, raw: number[]): number[] {
  const out = [...raw];
  for (const e of edges) {
    for (const d of [-1, 0, 1]) out.push(e.cycle + d);
    for (const d of [-1, 0, 1]) out.push(e.cycle + limit * PER_MS + d);
  }
  out.push(limit * PER_MS - 1, limit * PER_MS);
  return out.filter((c) => c >= 0);
}

/** Limits small enough that edges (gaps up to 4,000,000 cycles) often cross the limit. */
const smallLimitArb = fc.integer({ min: 1, max: 400 });
const ringLimitArb = fc.oneof(limitArb, smallLimitArb, smallLimitArb);
const ringRawArb = fc.array(fc.integer({ min: 0, max: 30_000_000 }), { minLength: 1, maxLength: 5 });

describe("Property 20: I'm-alive ring", () => {
  // Feature: bench-ui-stage, Property 20: I'm-alive ring
  // **Validates: Requirements 15.1, 15.2, 15.3**
  it("fills min(1, (c - last change) / (limit x 16,000)) exactly and labels blinking or stuck by level", () => {
    let stuckOn = 0;
    let stuckOff = 0;
    let blinking = 0;
    let boundary = 0;
    let resets = 0;
    fc.assert(
      fc.property(heartbeatEdgesArb, ringLimitArb, ringRawArb, (edges, limit, raw) => {
        const den = limit * PER_MS;
        for (const c of ringCursors(edges, limit, raw)) {
          const { at, level } = lastChange(edges, c);
          const since = c - at;
          const r = ringAt(edges, c, limit);
          expect(r.den).toBe(den);
          expect(r.num).toBe(Math.min(since, den));
          expect(r.num / r.den).toBe(Math.min(1, since / den));
          if (edges.some((e) => e.cycle === c)) {
            // A change cycle resets to 0 (strictly alternating edges: every edge is a change).
            resets++;
            expect(r.num).toBe(0);
          }
          if (since < den) {
            blinking++;
            expect(r.stuck).toBeNull();
            expect(r.label).toBe("blinking = program running");
            expect(r.label).toBe(RING_TEXT.blinking);
          } else {
            const word = level === 1 ? "on" : "off";
            if (word === "on") stuckOn++;
            else stuckOff++;
            expect(r.stuck).toBe(word);
            expect(r.label).toBe(`stuck ${word} for ${String(limit)} ms`);
            expect(r.num).toBe(den);
          }
        }
        // Exact boundary: lastChange + limit x 16,000 - 1 is blinking, + limit x 16,000 is stuck.
        for (const e of edges) {
          const next = edges.find((x) => x.cycle > e.cycle);
          const hit = e.cycle + den;
          if (next !== undefined && next.cycle <= hit) continue;
          boundary++;
          const before = ringAt(edges, hit - 1, limit);
          const at = ringAt(edges, hit, limit);
          expect(before.stuck).toBeNull();
          expect(before.label).toBe("blinking = program running");
          expect(before.num).toBe(den - 1);
          expect(at.stuck).toBe(e.value === 1 ? "on" : "off");
          expect(at.label).toBe(`stuck ${e.value === 1 ? "on" : "off"} for ${String(limit)} ms`);
          expect(at.num).toBe(den);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(stuckOn).toBeGreaterThan(50);
    expect(stuckOff).toBeGreaterThan(50);
    expect(blinking).toBeGreaterThan(50);
    expect(boundary).toBeGreaterThan(50);
    expect(resets).toBeGreaterThan(50);
  });

  it("starts at 0 from run start when there is no HEARTBEAT edge yet, and ignores other signals", () => {
    expect(ringAt([], 0, 600)).toEqual({ num: 0, den: 9_600_000, stuck: null, label: "blinking = program running" });
    expect(ringAt([], 9_600_000, 600)).toEqual({ num: 9_600_000, den: 9_600_000, stuck: "off", label: "stuck off for 600 ms" });
    const other: OutputEvent[] = [{ signal: "WALK", value: 1, cycle: 5 }];
    expect(ringAt(other, 100, 600).num).toBe(100);
  });

  // Feature: bench-ui-stage, Property 20: I'm-alive ring
  // **Validates: Requirements 15.4**
  it("stuckHoldsPulse is true only when the latest PULSE event is the stuck gremlin pressing", () => {
    const ev = (cycle: number, value: 0 | 1 | "release", gremlinId: string): ReducerEvent =>
      ({ cycle, signal: "PULSE", value, gremlinId }) as ReducerEvent;
    const held = [ev(100, 0, "stuck")];
    expect(stuckHoldsPulse(held, 99)).toBe(false);
    expect(stuckHoldsPulse(held, 100)).toBe(true);
    expect(stuckHoldsPulse(held, 5_000_000)).toBe(true);
    const released = [ev(100, 0, "stuck"), ev(200, "release", "stuck")];
    expect(stuckHoldsPulse(released, 199)).toBe(true);
    expect(stuckHoldsPulse(released, 200)).toBe(false);
    const other = [ev(100, 0, "masher")];
    expect(stuckHoldsPulse(other, 150)).toBe(false);
    const rest = [ev(100, 0, "rest")];
    expect(stuckHoldsPulse(rest, 150)).toBe(false);
    const overridden = [ev(100, 0, "stuck"), ev(150, 0, "masher")];
    expect(stuckHoldsPulse(overridden, 160)).toBe(false);
    expect(stuckHoldsPulse([{ cycle: 100, signal: "REQUEST", value: 0, gremlinId: "stuck" } as ReducerEvent], 150)).toBe(false);
    expect(stuckHoldsPulse([], 150)).toBe(false);
  });

  // Feature: bench-ui-stage, Property 20: I'm-alive ring
  // **Validates: Requirements 15.5**
  it("forgotLine shows the line only for a broken rule on the buggy build", () => {
    expect(FORGOT_LINE).toBe("While waiting on the sensor, the program forgot to blink.");
    expect(forgotLine(true, "buggy")).toBe("While waiting on the sensor, the program forgot to blink.");
    expect(forgotLine(true, "fixed")).toBeNull();
    expect(forgotLine(false, "buggy")).toBeNull();
    expect(forgotLine(false, "fixed")).toBeNull();
  });
});
