// Measures how long two output signals were both 1 on the emulated ATmega328P.
// Single replay:  npx tsx --no-deprecation exorcism-demo/measure-overlap.ts <hex> <pins.json> <signalA> <signalB> (--cycles <N> | --run-ms <N>)
// Other modes add one of these to the line above (all need --seed, and --cycles or --run-ms):
//   --events <list.json>                     replay a saved event list (the CLI "reducedList")
//   --gremlins <ids> --seed <N> --try <N>    replay try N of a campaign
//   ... plus --reduced --rules <rules.txt>   replay the reduced list for that try
//   --campaign <ids> --seed <N> --runs <N>   measure every try, report the largest
// Time is integer CPU cycles from the emulator. No clock, no random source, no network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../cli/entry";
import { loadInput, splitGremlins } from "../cli/input-loader";
import { DEFAULT_MAX_STEP_CYCLES, runEventList } from "../src/engine/campaign";
import type { Checker } from "../src/engine/checker";
import { EmulatorBridge, isBridgeError } from "../src/engine/emulator-bridge";
import { isEngineError } from "../src/engine/errors";
import { buildEventList } from "../src/engine/event-list";
import type { GeneratedEvent } from "../src/engine/event-list";
import { GREMLIN_CATALOGUE, findGremlin } from "../src/engine/gremlins/catalogue";
import type { GremlinSpec } from "../src/engine/gremlins/catalogue";
import { compileRuleSet } from "../src/engine/rules/compile";
import type { Fixture, OutputEvent } from "../src/engine/types";
import { CYCLES_PER_MS } from "../src/ui/app/model/upload-fields";
import { runReductionJob } from "../src/ui/app/worker/host";

export interface OverlapResult {
  cycles: number;
  microseconds: string;
}

/** Cycles to microseconds at 16 MHz, two decimal places. */
export function microsecondsOf(cycles: number): string {
  return (cycles / 16).toFixed(2);
}

/**
 * Longest stretch of consecutive cycles in which both signals are 1.
 * A signal with no event yet, or with the value "input", never counts as 1.
 * A stretch still open at endCycle ends there. Events are read in ascending cycle order
 * (stable for equal cycles); all events at one cycle are applied before the state is read.
 */
export function longestOverlap(
  events: readonly OutputEvent[],
  signalA: string,
  signalB: string,
  endCycle: number,
): OverlapResult {
  const sorted = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.signal === signalA || e.signal === signalB)
    .sort((x, y) => x.e.cycle - y.e.cycle || x.i - y.i)
    .map(({ e }) => e);

  let a = false;
  let b = false;
  let start: number | null = null;
  let best = 0;
  let k = 0;
  while (k < sorted.length) {
    const cycle = sorted[k]!.cycle;
    while (k < sorted.length && sorted[k]!.cycle === cycle) {
      const ev = sorted[k]!;
      const on = ev.value === 1;
      if (ev.signal === signalA) a = on;
      if (ev.signal === signalB) b = on;
      k++;
    }
    const both = a && b;
    if (both && start === null) start = cycle;
    if (!both && start !== null) {
      best = Math.max(best, cycle - start);
      start = null;
    }
  }
  if (start !== null) best = Math.max(best, endCycle - start);
  return { cycles: best, microseconds: microsecondsOf(best) };
}

export interface CampaignMax {
  result: OverlapResult;
  /** Zero-based index into the list. The try number printed to the user is tryIndex + 1. */
  tryIndex: number;
  /** True when every try measured 0 cycles. */
  noOverlap: boolean;
}

/** The largest per-try result and the earliest try that has it. Null for an empty list. */
export function pickCampaignMax(results: readonly { cycles: number }[]): CampaignMax | null {
  if (results.length === 0) return null;
  let tryIndex = 0;
  for (let i = 1; i < results.length; i++) {
    if (results[i]!.cycles > results[tryIndex]!.cycles) tryIndex = i;
  }
  const cycles = results[tryIndex]!.cycles;
  return { result: { cycles, microseconds: microsecondsOf(cycles) }, tryIndex, noOverlap: cycles === 0 };
}

export type MeasureOutcome = { ok: true; result: OverlapResult; text?: string } | { ok: false; reason: string };

export interface MeasureEnv {
  readText: (p: string) => string;
  invocationDir: string;
  /** Folder that holds package.json. Needed only for --reduced. */
  repoDir?: string;
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

export interface Loaded {
  hex: string;
  fixture: Fixture;
}

/** Reads the HEX and pin file, and checks that both signals are outputs in the pin file. */
function loadParts(
  a: { hexPath: string; pinsPath: string; signalA: string; signalB: string },
  env: MeasureEnv,
): { ok: true; loaded: Loaded } | { ok: false; reason: string } {
  const read = (given: string, what: string): { ok: true; text: string } | { ok: false; reason: string } => {
    try {
      return { ok: true, text: env.readText(path.resolve(env.invocationDir, given)) };
    } catch {
      return { ok: false, reason: `The ${what} "${given}" could not be read.` };
    }
  };
  const hexFile = read(a.hexPath, "HEX file");
  if (!hexFile.ok) return fail(hexFile.reason);
  const pinsFile = read(a.pinsPath, "pin file");
  if (!pinsFile.ok) return fail(pinsFile.reason);

  let fixture: Fixture;
  try {
    fixture = JSON.parse(pinsFile.text) as Fixture;
  } catch {
    return fail(`The pin file "${a.pinsPath}" is not valid JSON.`);
  }
  if (typeof fixture !== "object" || fixture === null || !Array.isArray(fixture.pins)) {
    return fail(`The pin file "${a.pinsPath}" needs a "pins" list.`);
  }
  for (const name of [a.signalA, a.signalB]) {
    const pin = fixture.pins.find((p) => p.signal === name);
    if (pin === undefined) return fail(`The signal "${name}" is not in the pin file.`);
    if (pin.direction !== "output") return fail(`The signal "${name}" is not an output in the pin file.`);
  }
  const hex = (hexFile.text.charCodeAt(0) === 0xfeff ? hexFile.text.slice(1) : hexFile.text).replace(/\r/g, "");
  return { ok: true, loaded: { hex, fixture } };
}

const checkCycles = (cycles: number): string | null =>
  Number.isSafeInteger(cycles) && cycles >= 1 ? null : "The cycle count must be a whole number of at least 1.";

export interface SingleReplayArgs {
  hexPath: string;
  pinsPath: string;
  signalA: string;
  signalB: string;
  cycles: number;
}

/** Single-replay mode: a fresh emulator, the HEX, the fixture, no input events, `cycles` cycles. */
export function measureSingleReplay(args: SingleReplayArgs, env: MeasureEnv): MeasureOutcome {
  const parts = loadParts(args, env);
  if (!parts.ok) return fail(parts.reason);
  const bad = checkCycles(args.cycles);
  if (bad !== null) return fail(bad);

  const { hex, fixture } = parts.loaded;
  const bridge = EmulatorBridge.create(hex, fixture, []);
  if (isBridgeError(bridge)) return fail(bridge.message);
  const advanced = bridge.advance(args.cycles);
  if (isBridgeError(advanced)) return fail(advanced.message);
  return {
    ok: true,
    result: longestOverlap(advanced.outputEvents, args.signalA, args.signalB, bridge.cycleCount),
  };
}

/** A checker that never reports a violation: these modes measure overlap, not rules. */
const noRuleChecker: Checker = () => ({ violation: null });

/** Replays one ordered event list on a fresh emulator for `runCycles` cycles and measures the overlap. */
export function measureEventList(
  loaded: Loaded,
  events: readonly GeneratedEvent[],
  signalA: string,
  signalB: string,
  runCycles: number,
  runIndex = 0,
): MeasureOutcome {
  const ran = runEventList(
    {
      hex: loaded.hex,
      fixture: loaded.fixture,
      checker: noRuleChecker,
      runCycles,
      maxStepCycles: DEFAULT_MAX_STEP_CYCLES,
    },
    events,
    runIndex,
  );
  if (isEngineError(ran)) return fail(ran.message);
  return { ok: true, result: longestOverlap(ran.outputEvents, signalA, signalB, ran.endCycle) };
}

/** Gremlin ids in catalogue order, the same order the CLI uses. */
export function parseGremlinSet(text: string): { ok: true; set: GremlinSpec[] } | { ok: false; reason: string } {
  const ids = splitGremlins(text);
  for (const id of ids) {
    if (id === "") return fail("The gremlin list has an empty entry.");
    if (findGremlin(id) === undefined) return fail(`Unknown gremlin "${id}".`);
  }
  return { ok: true, set: GREMLIN_CATALOGUE.filter((g) => ids.includes(g.id)).map((g) => ({ id: g.id })) };
}

/** Checks that a parsed JSON value is a list of events the replay can take. */
export function checkEventsShape(value: unknown): GeneratedEvent[] | string {
  if (!Array.isArray(value)) return "The events file must hold a JSON list of events.";
  for (let i = 0; i < value.length; i++) {
    const e = value[i] as Record<string, unknown> | null;
    if (typeof e !== "object" || e === null) return `Event ${i} is not an object.`;
    if (typeof e.signal !== "string") return `Event ${i} has no signal name.`;
    if (typeof e.cycle !== "number" || !Number.isSafeInteger(e.cycle) || e.cycle < 0) {
      return `Event ${i} has no whole-number cycle of 0 or more.`;
    }
  }
  return value as GeneratedEvent[];
}

export interface TrySelect {
  gremlins: string;
  seed: number;
  /** One-based, as the CLI prints it. */
  tryNumber: number;
}

export interface CampaignSelect {
  gremlins: string;
  seed: number;
  runs: number;
}

export type Mode =
  | { kind: "single" }
  | { kind: "events"; eventsPath: string }
  | { kind: "try"; select: TrySelect }
  | { kind: "reduced"; select: TrySelect; rulesPath: string }
  | { kind: "campaign"; select: CampaignSelect };

export interface ParsedArgs extends SingleReplayArgs {
  mode: Mode;
}

const USAGE =
  "Usage: measure-overlap.ts <hex> <pins.json> <signalA> <signalB> (--cycles <N> | --run-ms <N>) " +
  "[--events <file> | --gremlins <ids> --seed <N> --try <N> [--reduced --rules <file>] | --campaign <ids> --seed <N> --runs <N>]";

const MAX_U32 = 4294967295;

/** Reads the arguments. Returns a one-line reason when they are wrong. */
export function parseArgs(argv: readonly string[]): { ok: true; args: ParsedArgs } | { ok: false; reason: string } {
  const positional: string[] = [];
  let cycles: number | undefined;
  let runMs: number | undefined;
  let seed: number | undefined;
  let tryNumber: number | undefined;
  let runs: number | undefined;
  let eventsPath: string | undefined;
  let gremlins: string | undefined;
  let campaign: string | undefined;
  let rulesPath: string | undefined;
  let reduced = false;

  const whole = (flag: string, text: string | undefined, min: number, max: number): number | string => {
    if (text === undefined || !/^\d+$/.test(text)) return `${flag} must be a whole number.`;
    const n = Number(text);
    return Number.isSafeInteger(n) && n >= min && n <= max
      ? n
      : `${flag} must be a whole number from ${min} to ${max}.`;
  };
  const text = (flag: string, value: string | undefined): string | { reason: string } =>
    value === undefined || value.startsWith("--") ? { reason: `${flag} needs a value.` } : value;

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t === "--cycles" || t === "--run-ms" || t === "--seed" || t === "--try" || t === "--runs") {
      const v = whole(t, argv[++i], t === "--seed" ? 0 : 1, t === "--seed" ? MAX_U32 : Number.MAX_SAFE_INTEGER);
      if (typeof v === "string") return { ok: false, reason: v };
      if (t === "--cycles") cycles = v;
      else if (t === "--run-ms") runMs = v;
      else if (t === "--seed") seed = v;
      else if (t === "--try") tryNumber = v;
      else runs = v;
    } else if (t === "--events" || t === "--gremlins" || t === "--campaign" || t === "--rules") {
      const v = text(t, argv[++i]);
      if (typeof v !== "string") return { ok: false, reason: v.reason };
      if (t === "--events") eventsPath = v;
      else if (t === "--gremlins") gremlins = v;
      else if (t === "--campaign") campaign = v;
      else rulesPath = v;
    } else if (t === "--reduced") {
      reduced = true;
    } else if (t.startsWith("--")) {
      return { ok: false, reason: `Unknown option "${t}". ${USAGE}` };
    } else {
      positional.push(t);
    }
  }
  if (positional.length !== 4) return { ok: false, reason: USAGE };
  if (cycles !== undefined && runMs !== undefined) return { ok: false, reason: "Use --cycles or --run-ms, not both." };
  const total = cycles ?? (runMs !== undefined ? runMs * CYCLES_PER_MS : undefined);
  if (total === undefined) return { ok: false, reason: `Give --cycles or --run-ms. ${USAGE}` };

  const picked = [eventsPath !== undefined, tryNumber !== undefined, campaign !== undefined].filter(Boolean).length;
  if (picked > 1) return { ok: false, reason: "Use one of --events, --try or --campaign." };
  if ((reduced || rulesPath !== undefined) && tryNumber === undefined) {
    return { ok: false, reason: "--reduced and --rules go with --try." };
  }
  if (reduced !== (rulesPath !== undefined)) return { ok: false, reason: "--reduced needs --rules, and --rules needs --reduced." };
  if (gremlins !== undefined && tryNumber === undefined) return { ok: false, reason: "--gremlins goes with --try." };
  if (runs !== undefined && campaign === undefined) return { ok: false, reason: "--runs goes with --campaign." };
  if (seed !== undefined && tryNumber === undefined && campaign === undefined) {
    return { ok: false, reason: "--seed goes with --try or --campaign." };
  }

  let mode: Mode = { kind: "single" };
  if (eventsPath !== undefined) {
    mode = { kind: "events", eventsPath };
  } else if (tryNumber !== undefined) {
    if (gremlins === undefined || seed === undefined) return { ok: false, reason: "--try needs --gremlins and --seed." };
    const select = { gremlins, seed, tryNumber };
    mode = reduced ? { kind: "reduced", select, rulesPath: rulesPath! } : { kind: "try", select };
  } else if (campaign !== undefined) {
    if (seed === undefined || runs === undefined) return { ok: false, reason: "--campaign needs --seed and --runs." };
    mode = { kind: "campaign", select: { gremlins: campaign, seed, runs } };
  }
  const [hexPath, pinsPath, signalA, signalB] = positional as [string, string, string, string];
  return { ok: true, args: { hexPath, pinsPath, signalA, signalB, cycles: total, mode } };
}

export function formatResult(r: OverlapResult): string {
  return `${r.cycles} cycles (${r.microseconds} us)`;
}

function runTry(
  args: ParsedArgs,
  select: TrySelect,
  gremlinSet: GremlinSpec[],
  fixture: Fixture,
): { ok: true; events: GeneratedEvent[] } | { ok: false; reason: string } {
  const gen = buildEventList({
    fixture,
    gremlinSet,
    runCycles: args.cycles,
    campaignSeed: select.seed,
    runIndex: select.tryNumber - 1,
  });
  if (isEngineError(gen)) return fail(gen.message);
  return { ok: true, events: gen.events };
}

/** Runs the chosen mode and returns the result and the text to print. */
export function measure(args: ParsedArgs, env: MeasureEnv): MeasureOutcome {
  const mode = args.mode;
  if (mode.kind === "single") {
    const out = measureSingleReplay(args, env);
    return out.ok ? { ok: true, result: out.result, text: formatResult(out.result) } : out;
  }
  const parts = loadParts(args, env);
  if (!parts.ok) return fail(parts.reason);
  const loaded = parts.loaded;
  const bad = checkCycles(args.cycles);
  if (bad !== null) return fail(bad);
  const done = (result: OverlapResult, extra = ""): MeasureOutcome => ({
    ok: true,
    result,
    text: `${formatResult(result)}${extra}`,
  });

  if (mode.kind === "events") {
    let events: GeneratedEvent[] | string;
    try {
      events = checkEventsShape(JSON.parse(env.readText(path.resolve(env.invocationDir, mode.eventsPath))));
    } catch {
      return fail(`The events file "${mode.eventsPath}" could not be read as JSON.`);
    }
    if (typeof events === "string") return fail(events);
    const out = measureEventList(loaded, events, args.signalA, args.signalB, args.cycles);
    return out.ok ? done(out.result) : out;
  }

  if (mode.kind === "try" || mode.kind === "reduced") {
    const g = parseGremlinSet(mode.select.gremlins);
    if (!g.ok) return fail(g.reason);
    const gen = runTry(args, mode.select, g.set, loaded.fixture);
    if (!gen.ok) return gen;
    if (mode.kind === "try") {
      const out = measureEventList(loaded, gen.events, args.signalA, args.signalB, args.cycles, mode.select.tryNumber - 1);
      return out.ok ? done(out.result, ` on try ${mode.select.tryNumber}`) : out;
    }

    // Reduced replay: find the rule violation on this try, reduce it, measure the reduced list.
    const repoDir = env.repoDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const loadedInput = loadInput(
      {
        hex: args.hexPath,
        pins: args.pinsPath,
        rules: mode.rulesPath,
        gremlins: mode.select.gremlins,
        seed: mode.select.seed,
      },
      { readText: env.readText, invocationDir: env.invocationDir, repoDir },
    );
    if (!loadedInput.ok) return fail(loadedInput.reason);
    const input = loadedInput.input;
    const compiled = compileRuleSet(input.ruleSet, input.fixture);
    if (!compiled.ok) return fail("The rules did not compile against the pin file.");
    const run = runEventList(
      {
        hex: input.hex,
        fixture: input.fixture,
        checker: compiled.compiled.checker,
        runCycles: args.cycles,
        maxStepCycles: DEFAULT_MAX_STEP_CYCLES,
      },
      gen.events,
      mode.select.tryNumber - 1,
    );
    if (isEngineError(run)) return fail(run.message);
    if (run.violation === null) return fail(`Try ${mode.select.tryNumber} breaks no rule, so there is nothing to reduce.`);
    const reduction = runReductionJob({
      hex: input.hex,
      fixture: input.fixture,
      ruleSet: input.ruleSet,
      originalList: gen.events,
      violation: run.violation,
      runCycles: args.cycles,
    });
    if (!reduction.ok) return fail(reduction.error.message);
    const r = reduction.result;
    const out = measureEventList(loaded, r.reducedList, args.signalA, args.signalB, args.cycles, mode.select.tryNumber - 1);
    return out.ok
      ? done(
          out.result,
          ` on the smallest replay this reducer found for try ${mode.select.tryNumber} (${r.originalEventCount} moves down to ${r.reducedEventCount})`,
        )
      : out;
  }

  // Campaign: every try, the largest overlap wins.
  const g = parseGremlinSet(mode.select.gremlins);
  if (!g.ok) return fail(g.reason);
  const per: OverlapResult[] = [];
  for (let i = 0; i < mode.select.runs; i++) {
    const gen = runTry(args, { gremlins: mode.select.gremlins, seed: mode.select.seed, tryNumber: i + 1 }, g.set, loaded.fixture);
    if (!gen.ok) return gen;
    const out = measureEventList(loaded, gen.events, args.signalA, args.signalB, args.cycles, i);
    if (!out.ok) return out;
    per.push(out.result);
  }
  const best = pickCampaignMax(per);
  if (best === null) return fail("The campaign has no tries.");
  return best.noOverlap
    ? done(best.result, `, no overlap found in those tries (${per.length} tries)`)
    : done(best.result, ` at try ${best.tryIndex + 1} of ${per.length}`);
}

/** Returns the exit code. Prints one line on success and one line on failure. */
export function main(
  argv: readonly string[],
  io: { stdout: (t: string) => void; stderr: (t: string) => void; env: MeasureEnv },
): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.reason}\n`);
    return 1;
  }
  const out = measure(parsed.args, io.env);
  if (!out.ok) {
    io.stderr(`${out.reason}\n`);
    return 1;
  }
  io.stdout(`${out.text ?? formatResult(out.result)}\n`);
  return 0;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  process.exitCode = main(process.argv.slice(2), {
    stdout: (t) => void process.stdout.write(t),
    stderr: (t) => void process.stderr.write(t),
    env: {
      readText: (p) => fs.readFileSync(p, "utf8"),
      invocationDir: process.env.INIT_CWD ?? process.cwd(),
    },
  });
}
