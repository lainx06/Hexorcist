// Crosswalk motion (illustrative display only): the car, the walker and the walk button lamp move in display
// time and never jump. Node only; no browser. The scenarios are real replays of the crosswalk example, played
// through the real Playback with a fake frame clock, and the real actors model, stepped at 16 display ms.
// Evidence about the motion model, not proof of what a browser draws.
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { buildEventList } from "../../src/engine/event-list";
import { isEngineError } from "../../src/engine/errors";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { OutputEvent } from "../../src/engine/types";
import { loadExample } from "../../src/ui/app/data/examples";
import type { ExampleBundle } from "../../src/ui/app/data/examples";
import {
  CAR_CROSS_MS,
  CAR_SPEED,
  CATCH_UP_MS,
  LAMP_MIN_MS,
  LAP,
  WALKER_CROSS_MS,
  WALKER_SPEED,
  carCutByEdge,
  carDraw,
  carU,
  createCrosswalkActors,
  modelPose,
  pressIntervals,
  walkerFrac,
  walkerU,
} from "../../src/ui/app/model/crosswalk-actors";
import type { ActorPose } from "../../src/ui/app/model/crosswalk-actors";
import {
  CROSSWALK_CAR_LEN,
  CROSSWALK_STRIPES_FROM,
  CROSSWALK_STRIPES_TO,
  CROSSWALK_WALK_CROSS,
  CROSSWALK_WIDTH,
  crosswalkFrame,
} from "../../src/ui/app/model/crosswalk-scene";
import { leftCursor, rightCursorEnd } from "../../src/ui/app/model/fix-view";
import { heldPlan } from "../../src/ui/app/model/held-replay";
import { buildPlan, withTail } from "../../src/ui/app/model/pacing";
import type { PacingPlan } from "../../src/ui/app/model/pacing";
import { PINNED_CROSSWALK_FINGERPRINT } from "../../src/ui/app/model/speed";
import { createPlayback } from "../../src/ui/app/views/playback";
import { runDisplayReplayJob, runReplayJob } from "../../src/ui/app/worker/host";
import { crosswalkEdgesArb } from "./stage-arbitraries";

const SEED = 20261204;
const STEP_MS = 16;

/** The reduced list of the crosswalk example (engine acceptance run): press, release, press and hold. */
const REDUCED: ReducerEvent[] = [
  { cycle: 8_449_937, signal: "REQUEST", value: 0, gremlinId: "masher" },
  { cycle: 9_496_850, signal: "REQUEST", value: "release", gremlinId: "masher" },
  { cycle: 10_543_764, signal: "REQUEST", value: 0, gremlinId: "masher" },
] as ReducerEvent[];

interface Scenario {
  name: string;
  edges: OutputEvent[];
  events: ReducerEvent[];
  plan: PacingPlan;
  /** The Cursor the scene shows for the playback Cursor. */
  shown(c: number): number;
  /** Where playback ends for this scene. */
  end: number;
  /** The scene has stopped for good at this playback Cursor (the break freeze, the end of the plan). */
  over(c: number): boolean;
}

const scenarios: Scenario[] = [];
let example: ExampleBundle;

function must<T extends { ok: boolean }>(r: T, who: string): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`${who}: ${JSON.stringify((r as unknown as { error: unknown }).error)}`);
  return r as Extract<T, { ok: true }>;
}

beforeAll(() => {
  const l = loadExample("crosswalk");
  if (!l.ok) throw new Error("crosswalk did not load");
  example = l.example;
  const base = { fixture: example.fixture, ruleSet: example.ruleSet, events: REDUCED };
  const buggy = must(runReplayJob({ ...base, hex: example.buggyHex, runCycles: example.meta.runCycles }), "buggy replay");
  if (buggy.violation === null) throw new Error("the reduced list does not break the buggy build");
  expect(buggy.fingerprint).toBe(PINNED_CROSSWALK_FINGERPRINT);
  const v = buggy.violation.cycle;
  const buggyDisplay = must(runDisplayReplayJob({ ...base, hex: example.buggyHex, violationCycle: v }), "buggy display");
  const fixedDisplay = must(runDisplayReplayJob({ ...base, hex: example.fixedHex, violationCycle: v }), "fixed display");
  const cycles = REDUCED.filter((e) => e.gremlinId !== "rest").map((e) => e.cycle);

  // 1. The main replay of the reduced list.
  const mainPlan = buildPlan(cycles, v);
  scenarios.push({ name: "reduced replay", edges: buggyDisplay.outputEdges, events: REDUCED, plan: mainPlan, shown: (c) => c, end: v, over: (c) => c >= v });

  // 2. The HELD replay: run 0 of the campaign on the fixed build, which does not break.
  const gen = buildEventList({
    fixture: example.fixture,
    gremlinSet: example.meta.gremlinSet,
    runCycles: example.meta.runCycles,
    campaignSeed: example.meta.campaignSeed,
    runIndex: 0,
  });
  if (isEngineError(gen)) throw new Error("run 0 events");
  const held = must(runReplayJob({ ...base, events: gen.events, hex: example.fixedHex, runCycles: example.meta.runCycles }), "held replay");
  expect(held.violation).toBeNull();
  const heldP = heldPlan(gen.events, held.reachedEnd);
  scenarios.push({ name: "HELD replay", edges: held.outputEdges, events: gen.events, plan: heldP, shown: (c) => c, end: heldP.end, over: (c) => c >= heldP.end });

  // 3 and 4. The fix view: both scenes on one plan with the 4x tail; the left freezes at v.
  const rightEnd = rightCursorEnd(v, fixedDisplay.reachedEnd);
  const fixPlan = withTail(mainPlan, rightEnd);
  scenarios.push({ name: "fix view, original", edges: buggyDisplay.outputEdges, events: REDUCED, plan: fixPlan, shown: (c) => leftCursor(c, v), end: v, over: (c) => c >= v });
  scenarios.push({ name: "fix view, fixed", edges: fixedDisplay.outputEdges, events: REDUCED, plan: fixPlan, shown: (c) => Math.min(c, rightEnd), end: rightEnd, over: (c) => c >= rightEnd });
}, 300_000);

interface Sample {
  now: number;
  cursor: number;
  playing: boolean;
  pose: ActorPose;
}

/** Plays a scenario through the real Playback at 16 display ms per frame, then keeps stepping like the scene's own loop. */
function simulate(s: Scenario, slider: number, tailMs = 1_500): Sample[] {
  const pending = new Map<number, (ts: number) => void>();
  let ids = 0;
  const pb = createPlayback({
    raf: (cb) => {
      ids++;
      pending.set(ids, cb);
      return ids;
    },
    cancel: (h) => pending.delete(h),
    reducedMotion: () => false,
  });
  const actors = createCrosswalkActors();
  const samples: Sample[] = [];
  let now = 0;
  const observe = (): void => {
    const cursor = s.shown(pb.cursor());
    const pose = actors.step(
      {
        edges: s.edges,
        events: s.events,
        cursor,
        endCursor: s.end,
        msToEnd: pb.msUntil(s.end),
        ended: !pb.playing() && s.over(pb.cursor()),
        epoch: pb.epoch(),
        reduced: false,
      },
      now,
    );
    samples.push({ now, cursor, playing: pb.playing(), pose });
  };
  pb.onCursor(() => observe());
  pb.load(s.plan, true);
  pb.setSlider(slider);
  let after = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    now += STEP_MS;
    const due = [...pending.entries()];
    pending.clear();
    for (const [, cb] of due) cb(now);
    // Not playing: the scene runs its own loop, one step per frame, until everything is at rest (and a while more).
    if (!pb.playing() && due.length === 0) {
      observe();
      const last = samples[samples.length - 1] as Sample;
      if (last.pose.settled) after += STEP_MS;
      if (after >= tailMs) break;
    }
  }
  return samples;
}

describe("crosswalk motion: the real replays, paced, at 16 display ms", () => {
  it("builds the four scenarios", () => {
    expect(scenarios.map((s) => s.name)).toEqual(["reduced replay", "HELD replay", "fix view, original", "fix view, fixed"]);
    expect(pressIntervals(REDUCED)).toHaveLength(2);
  });

  for (const name of ["reduced replay", "HELD replay", "fix view, original", "fix view, fixed"]) {
    describe(name, () => {
      const run = (): { s: Scenario; samples: Sample[] } => {
        const s = scenarios.find((x) => x.name === name) as Scenario;
        return { s, samples: simulate(s, 0) };
      };

      it("the car and the walker never move faster than their display caps, and never snap", () => {
        const { samples } = run();
        expect(samples.length).toBeGreaterThan(100);
        let moved = 0;
        for (let i = 1; i < samples.length; i++) {
          const a = samples[i - 1] as Sample;
          const b = samples[i] as Sample;
          const dt = b.now - a.now;
          const car = Math.abs(b.pose.carU - a.pose.carU);
          const walker = Math.abs(b.pose.walkerU - a.pose.walkerU);
          if (car > 0 || walker > 0) moved++;
          expect(car).toBeLessThanOrEqual(CAR_SPEED * dt + 1e-6);
          expect(walker).toBeLessThanOrEqual(WALKER_SPEED * dt + 1e-6);
          // Drawn: while the car is in sight in both samples, it moves by the same bound.
          if (a.pose.car.visible && b.pose.car.visible) expect(Math.abs(b.pose.car.x - a.pose.car.x)).toBeLessThanOrEqual(CAR_SPEED * dt + 1e-6);
        }
        expect(moved).toBeGreaterThan(0);
      });

      it("at the break (the end of playback for this scene) the car and the walker are at the model's pose", () => {
        const { s, samples } = run();
        const at = samples.find((x) => x.cursor >= s.end);
        expect(at).toBeDefined();
        const model = modelPose(crosswalkFrame(s.edges, s.events, s.end));
        const p = (at as Sample).pose;
        expect(p.car.visible).toBe(model.carVisible);
        if (model.carVisible) expect(p.car.x).toBe(model.carX);
        expect(p.walkerFrac).toBe(model.walkerFrac);
      });

      it("every real press lights the lamp once, in order, for at least 250 display ms", () => {
        const { s, samples } = run();
        const presses = pressIntervals(s.events).filter((p) => p.on >= s.plan.start && p.on <= s.end);
        const flashes: { start: number; end: number }[] = [];
        let open: number | null = null;
        let pulses = 0;
        for (const x of samples) {
          if (x.pose.pulse) pulses++;
          if (x.pose.lampLit && open === null) open = x.now;
          if (!x.pose.lampLit && open !== null) {
            flashes.push({ start: open, end: x.now });
            open = null;
          }
        }
        if (open !== null) flashes.push({ start: open, end: (samples[samples.length - 1] as Sample).now });
        expect(flashes).toHaveLength(presses.length);
        expect(pulses).toBe(presses.length);
        for (const f of flashes) expect(f.end - f.start).toBeGreaterThanOrEqual(LAMP_MIN_MS);
        // In order: each flash starts after the one before it ended.
        flashes.forEach((f, i) => {
          if (i > 0) expect(f.start).toBeGreaterThan((flashes[i - 1] as { end: number }).end);
        });
      });
    });
  }

  it("the reduced replay has 2 lamp-on intervals (press, release, press and hold), the last one still lit", () => {
    const s = scenarios[0] as Scenario;
    const samples = simulate(s, 0);
    let on = 0;
    let prev = false;
    for (const x of samples) {
      if (x.pose.lampLit && !prev) on++;
      prev = x.pose.lampLit;
    }
    expect(on).toBe(2);
    expect((samples[samples.length - 1] as Sample).pose.lampLit).toBe(true);
  });

  it("the display car is never on the stripes while the walk sign is on or the walker is crossing (paced)", () => {
    for (const s of scenarios) {
      for (const x of simulate(s, 0)) {
        const f = x.pose.frame;
        const d = x.pose.car;
        const onStripes = d.visible && d.x > CROSSWALK_STRIPES_FROM && d.x - CROSSWALK_CAR_LEN < CROSSWALK_STRIPES_TO;
        if (onStripes) {
          expect(f.walk).toBe("off");
          expect(f.walkerOnStripes).toBe(false);
        }
      }
    }
  });

  it("at faster slider steps the replay is shorter than the caps allow: the last 400 ms speed the actors up to arrive, and the break pose and the lamp are still exact", () => {
    // The caps are asserted at the paced step (the thumb is at the left end for every new plan). At faster steps the
    // actors may have to cover more than the caps in the last CATCH_UP_MS; they still arrive at the model pose.
    const s = scenarios[0] as Scenario;
    const model = modelPose(crosswalkFrame(s.edges, s.events, s.end));
    for (const step of [3, 5, 10]) {
      const samples = simulate(s, step);
      const at = samples.find((x) => x.cursor >= s.end) as Sample;
      expect(at.pose.car.visible).toBe(model.carVisible);
      if (model.carVisible) expect(at.pose.car.x).toBe(model.carX);
      expect(at.pose.walkerFrac).toBe(model.walkerFrac);
      let flashes = 0;
      let prev = false;
      for (const x of samples) {
        if (x.pose.lampLit && !prev) flashes++;
        prev = x.pose.lampLit;
      }
      expect(flashes).toBe(2);
    }
  });
});
describe("crosswalk motion: jumps place the actors with no animation", () => {
  it("a seek, Replay and a new plan snap to the model pose; reduced motion always does", () => {
    const s = scenarios[0] as Scenario;
    const actors = createCrosswalkActors();
    const at = (cursor: number, epoch: number, now: number, reduced = false): ActorPose =>
      actors.step({ edges: s.edges, events: s.events, cursor, endCursor: s.end, msToEnd: null, ended: false, epoch, reduced }, now);
    const first = at(s.plan.start, 0, 0);
    expect(first.carU).toBe(carU(crosswalkFrame(s.edges, s.events, s.plan.start)));
    // Without a jump the car lags behind a big move of the Cursor.
    const lag = at(s.end, 0, 16);
    expect(lag.carU).toBeLessThanOrEqual(first.carU + CAR_SPEED * 16 + 1e-6);
    // A jump (new epoch) places it exactly.
    const model = carU(crosswalkFrame(s.edges, s.events, s.end));
    expect(at(s.end, 1, 32).carU).toBe(model);
    // Reduced motion: no tween at all.
    at(s.plan.start, 1, 48);
    expect(at(s.end, 1, 64, true).carU).toBe(model);
  });

  it("a car cut by the right edge when the scene stops finishes leaving, smoothly, then is out of sight", () => {
    const green: OutputEvent[] = [
      { signal: "CAR_GREEN", value: 1, cycle: 0 },
      { signal: "CAR_YELLOW", value: 0, cycle: 0 },
      { signal: "CAR_RED", value: 0, cycle: 0 },
      { signal: "WALK", value: 0, cycle: 0 },
    ];
    const cursor = 6_000_000;
    const actors = createCrosswalkActors();
    const input = (now: number, ended: boolean): ActorPose =>
      actors.step({ edges: green, events: [], cursor, endCursor: cursor, msToEnd: ended ? 0 : 500, ended, epoch: 0, reduced: false }, now);
    const placed = input(0, false);
    expect(carCutByEdge(placed.carU)).toBe(true);
    let prev = placed;
    let now = 0;
    for (let i = 0; i < 200 && prev.car.visible; i++) {
      now += STEP_MS;
      const p = input(now, true);
      expect(Math.abs(p.carU - prev.carU)).toBeLessThanOrEqual(CAR_SPEED * STEP_MS + 1e-6);
      prev = p;
    }
    expect(prev.car.visible).toBe(false);
    expect(prev.settled).toBe(true);
    // Under reduced motion it is out at once (a step change).
    const reduced = createCrosswalkActors().step({ edges: green, events: [], cursor, endCursor: cursor, msToEnd: null, ended: true, epoch: 0, reduced: true }, 0);
    expect(reduced.car.visible).toBe(false);
  });

  it("Playback counts a new plan, Replay and a seek as jumps, and play or pause as none", () => {
    const pb = createPlayback({ raf: () => 1, cancel: () => undefined, reducedMotion: () => false });
    const s = scenarios[0] as Scenario;
    const e0 = pb.epoch();
    pb.load(s.plan, false);
    const e1 = pb.epoch();
    expect(e1).toBeGreaterThan(e0);
    pb.play();
    pb.pause();
    expect(pb.epoch()).toBe(e1);
    pb.seek(s.end);
    expect(pb.epoch()).toBeGreaterThan(e1);
    const e2 = pb.epoch();
    pb.replay();
    expect(pb.epoch()).toBeGreaterThan(e2);
  });
});

/** Light and walk edges that make long green stretches and several crossings possible. */
const phasedArb: fc.Arbitrary<OutputEvent[]> = fc
  .array(
    fc.record({
      light: fc.constantFrom("green", "green", "yellow", "red", "off"),
      walk: fc.constantFrom(false, false, true),
      gap: fc.integer({ min: 0, max: 20_000_000 }),
    }),
    { minLength: 1, maxLength: 10 },
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

describe("the car and the walker on their paths (model positions)", () => {
  it("the car's conveyor position and the walker's path position never go backwards as the Cursor advances", () => {
    let samples = 0;
    fc.assert(
      fc.property(fc.oneof(crosswalkEdgesArb, phasedArb), fc.array(fc.integer({ min: 0, max: 100_000_000 }), { minLength: 2, maxLength: 12 }), (edges, raw) => {
        const cursors = [...raw].sort((a, b) => a - b);
        let prevCar = -1;
        let prevWalker = -1;
        for (const c of cursors) {
          const f = crosswalkFrame(edges, [], c);
          const u = carU(f);
          const w = walkerU(f);
          expect(u).toBeGreaterThanOrEqual(prevCar);
          expect(w).toBeGreaterThanOrEqual(prevWalker);
          prevCar = u;
          prevWalker = w;
          samples++;
        }
      }),
      { seed: SEED, numRuns: 300 },
    );
    expect(samples).toBeGreaterThan(1000);
  });

  it("the drawn model car is in sight exactly when the model car is waiting or driving inside the view", () => {
    // Waiting at the stop line is in sight; gone is not; a new car comes in from the left edge.
    const light = (g: 0 | 1): OutputEvent[] => [
      { signal: "CAR_GREEN", value: g, cycle: 0 },
      { signal: "CAR_YELLOW", value: 0, cycle: 0 },
      { signal: "CAR_RED", value: g === 1 ? 0 : 1, cycle: 0 },
    ];
    expect(carDraw(carU(crosswalkFrame(light(0), [], 0))).visible).toBe(true);
    const green = light(1);
    const gone = crosswalkFrame(green, [], 3 * 8_000_000);
    expect(gone.car).toBe("gone");
    expect(carDraw(carU(gone)).visible).toBe(false);
    // The next car (light turns red) is a quarter of a lap on from the gone car: it comes in, it does not pop in.
    const red = [...green, { signal: "CAR_GREEN", value: 0, cycle: 40_000_000 }, { signal: "CAR_RED", value: 1, cycle: 40_000_000 }] as OutputEvent[];
    const next = crosswalkFrame(red, [], 40_000_000);
    expect(next.car).toBe("waiting");
    expect(carU(next)).toBeGreaterThan(carU(gone));
    expect(carU(next) - carU(gone)).toBeLessThan(LAP);
  });

  it("the walker crosses back from where it stands, and rests on the far sidewalk", () => {
    const walk = (value: 0 | 1, cycle: number): OutputEvent => ({ signal: "WALK", value, cycle });
    const edges = [walk(1, 1_000_000), walk(0, 2_000_000), walk(1, 20_000_000), walk(0, 21_000_000)];
    const frac = (c: number): number => walkerFrac(walkerU(crosswalkFrame(edges, [], c)));
    expect(frac(0)).toBe(0); // waits on the top sidewalk
    expect(frac(1_000_000 + CROSSWALK_WALK_CROSS / 2)).toBeCloseTo(0.5, 5); // halfway down
    expect(frac(1_000_000 + CROSSWALK_WALK_CROSS)).toBe(1); // arrived at the bottom
    expect(frac(10_000_000)).toBe(1); // stays there, does not jump back
    expect(frac(20_000_000)).toBe(1); // the next walk sign starts from where it stands
    expect(frac(20_000_000 + CROSSWALK_WALK_CROSS / 2)).toBeCloseTo(0.5, 5); // halfway back up
    expect(frac(20_000_000 + CROSSWALK_WALK_CROSS)).toBe(0); // back at the top
  });

  it("the display caps are as asked: 900 ms across the scene, 1,600 ms across the road", () => {
    expect(CAR_CROSS_MS).toBe(900);
    expect(WALKER_CROSS_MS).toBe(1_600);
    expect(CAR_SPEED * CAR_CROSS_MS).toBe(CROSSWALK_WIDTH);
    expect(WALKER_SPEED * WALKER_CROSS_MS).toBe(CROSSWALK_WALK_CROSS);
    expect(CATCH_UP_MS).toBe(400);
  });
});
