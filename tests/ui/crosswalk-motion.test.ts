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
  WALKER_CLEAR_LIFT,
  LAMP_MIN_MS,
  LAP,
  WALKER_CROSS_MS,
  WALKER_SPEED,
  carCutByEdge,
  carDraw,
  carInZone,
  carU,
  createCrosswalkActors,
  modelPose,
  pressIntervals,
  walkerFrac,
  walkerOnRoad,
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
import { SLIDER_MAX, buildPlan, withTail } from "../../src/ui/app/model/pacing";
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
  /** Display ms until playback ends for this scene (null while not playing). */
  msToEnd: number | null;
  pose: ActorPose;
}

const STEPS = Array.from({ length: SLIDER_MAX + 1 }, (_, i) => i);

const memo = new Map<string, Sample[]>();
/** One simulation per scenario and slider step, shared by the tests. */
function sim(s: Scenario, step: number): Sample[] {
  const key = `${s.name}/${String(step)}`;
  let v = memo.get(key);
  if (v === undefined) {
    v = simulate(s, step);
    memo.set(key, v);
  }
  return v;
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
    const msToEnd = pb.msUntil(s.end);
    const pose = actors.step(
      {
        edges: s.edges,
        events: s.events,
        cursor,
        endCursor: s.end,
        msToEnd,
        ended: !pb.playing() && s.over(pb.cursor()),
        epoch: pb.epoch(),
        reduced: false,
      },
      now,
    );
    samples.push({ now, cursor, playing: pb.playing(), msToEnd, pose });
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

/** Drawn poses equal to the model's at the end of this scene: the break frame. */
function atModelEnd(s: Scenario, x: Sample): boolean {
  const model = modelPose(crosswalkFrame(s.edges, s.events, s.end));
  const p = x.pose;
  return (
    x.cursor >= s.end &&
    p.car.visible === model.carVisible &&
    (!model.carVisible || p.car.x === model.carX) &&
    p.walkerFrac === model.walkerFrac
  );
}

describe("crosswalk motion: the real replays, at every slider step, 16 display ms per frame", () => {
  it("builds the four scenarios", () => {
    expect(scenarios.map((s) => s.name)).toEqual(["reduced replay", "HELD replay", "fix view, original", "fix view, fixed"]);
    expect(pressIntervals(REDUCED)).toHaveLength(2);
    expect(STEPS).toHaveLength(11);
  });

  for (const name of ["reduced replay", "HELD replay", "fix view, original", "fix view, fixed"]) {
    describe(name, () => {
      const scenario = (): Scenario => scenarios.find((x) => x.name === name) as Scenario;

      it("the car and the walker never move faster than their display caps (the walker at most 3x while it clears the road), and never snap, before the last 400 ms", () => {
        const s = scenario();
        let moved = 0;
        for (const step of STEPS) {
          const samples = sim(s, step);
          expect(samples.length).toBeGreaterThan(50);
          for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1] as Sample;
            const b = samples[i] as Sample;
            // The last CATCH_UP_MS of playback are the one place the actors may be sped up, to arrive at the break pose.
            if (b.msToEnd !== null && b.msToEnd <= CATCH_UP_MS) continue;
            const dt = b.now - a.now;
            const car = Math.abs(b.pose.carU - a.pose.carU);
            const walker = Math.abs(b.pose.walkerU - a.pose.walkerU);
            if (car > 0 || walker > 0) moved++;
            expect(car).toBeLessThanOrEqual(CAR_SPEED * dt + 1e-6);
            expect(walker).toBeLessThanOrEqual(WALKER_SPEED * WALKER_CLEAR_LIFT * dt + 1e-6);
          }
        }
        expect(moved).toBeGreaterThan(100);
      });

      it("at the break (the end of playback for this scene) the car and the walker are at the model's pose", () => {
        const s = scenario();
        const model = modelPose(crosswalkFrame(s.edges, s.events, s.end));
        for (const step of STEPS) {
          const at = sim(s, step).find((x) => x.cursor >= s.end);
          expect(at, `step ${String(step)}`).toBeDefined();
          const p = (at as Sample).pose;
          expect(p.car.visible, `step ${String(step)}`).toBe(model.carVisible);
          if (model.carVisible) expect(p.car.x, `step ${String(step)}`).toBe(model.carX);
          expect(p.walkerFrac, `step ${String(step)}`).toBe(model.walkerFrac);
        }
      });

      it("the drawn car is never inside the crossing zone while the drawn walker is on the road (except at the break, where the model itself has them there)", () => {
        const s = scenario();
        const modelEnd = crosswalkFrame(s.edges, s.events, s.end);
        const modelConflict = carInZone(carU(modelEnd)) && walkerOnRoad(walkerU(modelEnd));
        let walkerOnRoadSamples = 0;
        for (const step of STEPS) {
          for (const x of sim(s, step)) {
            const inZone = carInZone(x.pose.carU);
            const onRoad = walkerOnRoad(x.pose.walkerU);
            if (onRoad) walkerOnRoadSamples++;
            if (modelConflict && atModelEnd(s, x)) continue;
            expect(inZone && onRoad, `step ${String(step)} at ${String(x.now)} ms`).toBe(false);
          }
        }
        // The walker really is on the road in these replays, so the check is not empty.
        expect(walkerOnRoadSamples).toBeGreaterThan(0);
      });

      it("every real press lights the lamp once, in order, for at least 250 display ms", () => {
        const s = scenario();
        const presses = pressIntervals(s.events).filter((p) => p.on >= s.plan.start && p.on <= s.end);
        for (const step of STEPS) {
          const samples = sim(s, step);
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
          expect(flashes, `step ${String(step)}`).toHaveLength(presses.length);
          expect(pulses, `step ${String(step)}`).toBe(presses.length);
          for (const f of flashes) expect(f.end - f.start, `step ${String(step)}`).toBeGreaterThanOrEqual(LAMP_MIN_MS);
          flashes.forEach((f, i) => {
            if (i > 0) expect(f.start).toBeGreaterThan((flashes[i - 1] as { end: number }).end);
          });
        }
      });
    });
  }

  it("the reduced replay has 2 lamp-on intervals (press, release, press and hold), the last one still lit", () => {
    const s = scenarios[0] as Scenario;
    const samples = sim(s, 0);
    let on = 0;
    let prev = false;
    for (const x of samples) {
      if (x.pose.lampLit && !prev) on++;
      prev = x.pose.lampLit;
    }
    expect(on).toBe(2);
    expect((samples[samples.length - 1] as Sample).pose.lampLit).toBe(true);
  });

  it("the walker still on the road after the walk sign went off clears it faster than its normal cap, and the car waits for it", () => {
    // The fixed-program scene at the fastest step is where the drawn walker lags the most.
    const s = scenarios.find((x) => x.name === "fix view, fixed") as Scenario;
    let lifted = 0;
    let carHeld = 0;
    for (const step of STEPS) {
      const samples = sim(s, step);
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1] as Sample;
        const b = samples[i] as Sample;
        if (b.msToEnd !== null && b.msToEnd <= CATCH_UP_MS) continue;
        if (Math.abs(b.pose.walkerU - a.pose.walkerU) > WALKER_SPEED * (b.now - a.now) + 1e-6) lifted++;
        // The car is at the stop line (or before it) with its model asking for more, while the walker is on the road.
        const model = carU(b.pose.frame);
        if (walkerOnRoad(b.pose.walkerU) && b.pose.carU < model && !carInZone(b.pose.carU)) carHeld++;
      }
    }
    expect(lifted + carHeld).toBeGreaterThan(0);
  });

  it("the old risk is gone: with the cap alone a lagging walker and a free-running car would meet; the gate keeps them apart", () => {
    // A direct check of the gate on a made-up frame: the model sends the car on (green, sign off, walker crossing done),
    // but the drawn walker is still mid-road. The car holds at the stop line until the walker reaches a sidewalk.
    const edges: OutputEvent[] = [
      { signal: "CAR_GREEN", value: 1, cycle: 0 },
      { signal: "CAR_YELLOW", value: 0, cycle: 0 },
      { signal: "CAR_RED", value: 0, cycle: 0 },
      { signal: "WALK", value: 1, cycle: 1_000_000 },
      { signal: "WALK", value: 0, cycle: 2_000_000 },
    ];
    const actors = createCrosswalkActors();
    const at = (cursor: number, now: number, epoch = 0): ActorPose =>
      actors.step({ edges, events: [], cursor, endCursor: null, msToEnd: null, ended: false, epoch, reduced: false }, now);
    // Placed at cursor 3,000,000: the model walker is half way down the road, the car waits (the crossing is not over).
    const start = at(3_000_000, 0);
    expect(walkerOnRoad(start.walkerU)).toBe(true);
    // Far later: the model walker has crossed and the car has driven off.
    let prev = start;
    let now = 0;
    let held = 0;
    for (let i = 0; i < 400; i++) {
      now += STEP_MS;
      const p = at(40_000_000, now);
      expect(carInZone(p.carU) && walkerOnRoad(p.walkerU)).toBe(false);
      if (walkerOnRoad(p.walkerU) && p.carU === prev.carU) held++;
      prev = p;
    }
    expect(held).toBeGreaterThan(0);
    expect(walkerOnRoad(prev.walkerU)).toBe(false);
    expect(prev.settled).toBe(true);
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
