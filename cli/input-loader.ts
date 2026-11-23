// headless-runner: the one Input_Loader for the CLI and the MCP server (Requirement 1, 8.5).
// Pure apart from the readText function it is given. No clock, no random source, no network.
// It builds the same CampaignJobInput the page builds: example mode as tests/ui/examples-host does,
// upload mode through the page's own pin-map import, pin-table check and gremlin rules.
import { findGremlin, GREMLIN_CATALOGUE } from "../src/engine/gremlins/catalogue";
import type { GremlinSpec } from "../src/engine/gremlins/catalogue";
import { render } from "../src/engine/rules/render";
import { readRulesFile } from "../src/engine/rules/rules-file";
import type { Fixture } from "../src/engine/types";
import { parseExample } from "../src/ui/app/data/example";
import { checkRuns, checkSeed } from "../src/ui/app/model/fields";
import { defaultSelection, isCompatible } from "../src/ui/app/model/gremlin-picker";
import { importPinMap } from "../src/ui/app/model/pin-map-file";
import { checkPinTable, previewFixture } from "../src/ui/app/model/pin-table";
import { UPLOAD_DEFAULTS, checkRunLength, msToCycles } from "../src/ui/app/model/upload-fields";
import type { CampaignJobInput } from "../src/ui/app/worker/host";

export const EXAMPLES = ["crosswalk", "garage", "heartbeat"] as const;
export type ExampleName = (typeof EXAMPLES)[number];

/** Values as typed by the user (strings), so the page's own field checks apply unchanged. */
export interface CheckArgs {
  example?: string;
  fixed?: boolean;
  hex?: string;
  pins?: string;
  rules?: string;
  gremlins?: string;
  runs?: string;
  seed?: string;
  runMs?: string;
}

export interface CheckInput extends CampaignJobInput {
  /** Canonical sentences of the rule set, in file order. */
  ruleSentences: string[];
}

export type LoadResult = { ok: true; input: CheckInput } | { ok: false; reason: string };

/** Reads a text file. `example` paths are relative to the repo root; user paths are as given. */
export interface TextReader {
  user(path: string): string;
  example(relPath: string): string;
}

const fail = (reason: string): LoadResult => ({ ok: false, reason });

/** BOM and CR removed, so a Windows checkout and a Linux checkout give the same text. */
export function normalizeText(text: string): string {
  return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r/g, "");
}

function readWith(read: (p: string) => string, path: string, what: string): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    return { ok: true, text: normalizeText(read(path)) };
  } catch {
    return { ok: false, reason: `Could not read the ${what} file "${path}".` };
  }
}

/** Gremlin ids from "a,b", checked against the catalogue and the pins, in catalogue order. */
function parseGremlins(list: string, fixture: Fixture): { ok: true; set: GremlinSpec[] } | { ok: false; reason: string } {
  const ids = list
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (ids.length === 0) return { ok: false, reason: "--gremlins needs at least one gremlin id." };
  for (const id of ids) {
    const def = findGremlin(id);
    if (def === undefined) {
      return { ok: false, reason: `Unknown gremlin "${id}". Known gremlins: ${GREMLIN_CATALOGUE.map((g) => g.id).join(", ")}.` };
    }
    if (!isCompatible(def, fixture)) return { ok: false, reason: `Gremlin "${id}" has no matching input in these pins.` };
  }
  return { ok: true, set: GREMLIN_CATALOGUE.filter((g) => ids.includes(g.id)).map((g) => ({ id: g.id })) };
}

/** Same limits and messages as the page's fields. */
function numberField(
  given: string | undefined,
  flag: string,
  fallback: number,
  check: (t: string) => { ok: true; value: number } | { ok: false; message: string },
): { ok: true; value: number } | { ok: false; reason: string } {
  if (given === undefined) return { ok: true, value: fallback };
  const r = check(given);
  return r.ok ? { ok: true, value: r.value } : { ok: false, reason: `${flag}: ${r.message}` };
}

function sentencesOf(ruleSet: CheckInput["ruleSet"]): string[] {
  return ruleSet.map((r) => {
    const s = render(r);
    return s.ok ? s.sentence : s.reason;
  });
}

/** Requirement 1.8: the combination is checked before any file is read. */
export function checkCombination(args: CheckArgs): string | null {
  const uploadFlags = [args.hex, args.pins, args.rules].filter((v) => v !== undefined).length;
  if (args.example !== undefined && uploadFlags > 0) return "Use either --example or --hex/--pins/--rules, not both.";
  if (args.fixed === true && args.example === undefined) return "--fixed needs --example.";
  if (args.example !== undefined) {
    if (!(EXAMPLES as readonly string[]).includes(args.example)) {
      return `Unknown example "${args.example}". Examples: ${EXAMPLES.join(", ")}.`;
    }
    return null;
  }
  if (uploadFlags !== 3) return "Give --example <name>, or all three of --hex, --pins and --rules.";
  return null;
}

export function loadInput(args: CheckArgs, reader: TextReader): LoadResult {
  const combo = checkCombination(args);
  if (combo !== null) return fail(combo);
  // Number formats are checked before any file is read too (Requirement 1.7: no run, no file work).
  for (const [v, flag, check] of [
    [args.runs, "--runs", checkRuns],
    [args.seed, "--seed", checkSeed],
    [args.runMs, "--run-ms", checkRunLength],
  ] as const) {
    if (v === undefined) continue;
    const r = check(v);
    if (!r.ok) return fail(`${flag}: ${r.message}`);
  }
  return args.example !== undefined ? loadExampleInput(args, args.example as ExampleName, reader) : loadUploadInput(args, reader);
}

function loadExampleInput(args: CheckArgs, name: ExampleName, reader: TextReader): LoadResult {
  const dir = `examples/${name}`;
  const build = args.fixed === true ? "fixed" : "buggy";
  const hex = readWith(reader.example, `${dir}/${build}/${build}.hex`, "HEX");
  const fixtureText = readWith(reader.example, `${dir}/fixture.json`, "pins");
  const rulesText = readWith(reader.example, `${dir}/rules.txt`, "rules");
  const metaText = readWith(reader.example, `${dir}/meta.json`, "meta");
  if (!hex.ok) return fail(hex.reason);
  if (!fixtureText.ok) return fail(fixtureText.reason);
  if (!rulesText.ok) return fail(rulesText.reason);
  if (!metaText.ok) return fail(metaText.reason);
  const p = parseExample(fixtureText.text, rulesText.text, metaText.text);
  if (!p.ok) return fail(`Example "${name}" did not load: ${[...p.rulesReasons, ...p.jsonErrors.map((e) => e.message)].join("; ")}`);
  let gremlinSet: GremlinSpec[] = p.meta.gremlinSet.map((g) => ({ ...g }));
  if (args.gremlins !== undefined) {
    const g = parseGremlins(args.gremlins, p.fixture);
    if (!g.ok) return fail(g.reason);
    gremlinSet = g.set;
  }
  const runs = numberField(args.runs, "--runs", p.meta.runs, checkRuns);
  const seed = numberField(args.seed, "--seed", p.meta.campaignSeed, checkSeed);
  if (!runs.ok) return fail(runs.reason);
  if (!seed.ok) return fail(seed.reason);
  let runCycles = p.meta.runCycles;
  if (args.runMs !== undefined) {
    const ms = numberField(args.runMs, "--run-ms", 0, checkRunLength);
    if (!ms.ok) return fail(ms.reason);
    runCycles = msToCycles(ms.value);
  }
  return {
    ok: true,
    input: {
      hex: hex.text,
      fixture: p.fixture,
      ruleSet: p.ruleSet,
      gremlinSet,
      campaignSeed: seed.value,
      runs: runs.value,
      runCycles,
      ruleSentences: p.sentences,
    },
  };
}

function loadUploadInput(args: CheckArgs, reader: TextReader): LoadResult {
  const hex = readWith(reader.user, args.hex as string, "HEX");
  if (!hex.ok) return fail(hex.reason);
  const pins = readWith(reader.user, args.pins as string, "pins");
  if (!pins.ok) return fail(pins.reason);
  const rules = readWith(reader.user, args.rules as string, "rules");
  if (!rules.ok) return fail(rules.reason);

  // The page's pin-map import and pin-table check (Plain_Names are display only and not needed here).
  const imported = importPinMap(pins.text, new TextEncoder().encode(pins.text).length, 1);
  if (!imported.ok) return fail(`Pins file: ${imported.error}`);
  const table = checkPinTable(imported.rows);
  if (!table.ok) {
    const problems = [...table.tableErrors, ...table.rowErrors.flat()];
    return fail(`Pins file: ${problems.join(" ") || "the pin table is not valid."}`);
  }
  const fixture = previewFixture(imported.rows);

  const read = readRulesFile(rules.text);
  if (!read.ok) return fail(`Rules file: ${read.reasons.join("; ")}`);

  let gremlinSet: GremlinSpec[];
  if (args.gremlins !== undefined) {
    const g = parseGremlins(args.gremlins, fixture);
    if (!g.ok) return fail(g.reason);
    gremlinSet = g.set;
  } else {
    // The page preselects the Masher when it fits the pins.
    gremlinSet = defaultSelection([{ id: "masher" }], fixture);
    if (gremlinSet.length === 0) return fail("The Masher has no button input in these pins; choose gremlins with --gremlins.");
  }

  const runs = numberField(args.runs, "--runs", UPLOAD_DEFAULTS.runs, checkRuns);
  const seed = numberField(args.seed, "--seed", UPLOAD_DEFAULTS.seed, checkSeed);
  const ms = numberField(args.runMs, "--run-ms", UPLOAD_DEFAULTS.runLengthMs, checkRunLength);
  if (!runs.ok) return fail(runs.reason);
  if (!seed.ok) return fail(seed.reason);
  if (!ms.ok) return fail(ms.reason);

  return {
    ok: true,
    input: {
      hex: hex.text,
      fixture,
      ruleSet: read.ruleSet,
      gremlinSet,
      campaignSeed: seed.value,
      runs: runs.value,
      runCycles: msToCycles(ms.value),
      ruleSentences: sentencesOf(read.ruleSet),
    },
  };
}
