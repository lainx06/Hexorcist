// The one Input_Loader: CLI arguments, MCP arguments and the Loop_Config become a CheckInput.
// No clock, no random source, no network. Files are read through LoaderEnv.
import path from "node:path";
import { GREMLIN_CATALOGUE, findGremlin } from "../src/engine/gremlins/catalogue";
import type { GremlinSpec } from "../src/engine/gremlins/catalogue";
import type { RuleSet } from "../src/engine/rules/ir";
import { render } from "../src/engine/rules/render";
import { readRulesFile } from "../src/engine/rules/rules-file";
import type { Fixture } from "../src/engine/types";
import { parseExample } from "../src/ui/app/data/example";
import { checkRuns, checkSeed } from "../src/ui/app/model/fields";
import { isCompatible } from "../src/ui/app/model/gremlin-picker";
import { UPLOAD_DEFAULTS, checkRunLength, msToCycles } from "../src/ui/app/model/upload-fields";
import type { CampaignJobInput } from "../src/ui/app/worker/host";

export const EXAMPLE_IDS = ["crosswalk", "garage", "heartbeat"] as const;
export type ExampleId = (typeof EXAMPLE_IDS)[number];

export interface LoaderEnv {
  readText(absPath: string): string;
  readBytes?(absPath: string): Uint8Array;
  /** Folder that user-typed relative paths resolve against. */
  invocationDir: string;
  /** Folder that holds package.json, computed from the module location. */
  repoDir: string;
}

export interface CheckArgs {
  example?: string;
  fixed?: boolean;
  hex?: string;
  pins?: string;
  rules?: string;
  gremlins?: string;
  runs?: number;
  seed?: number;
  runMs?: number;
}

export interface CheckInput extends CampaignJobInput {
  ruleSentences: string[];
}

export type LoadResult = { ok: true; input: CheckInput } | { ok: false; reason: string };

export interface LoopConfig {
  source: string;
  build: string[];
  hex: string;
  pins: string;
  rules: string;
  gremlins: string;
  runs: number;
  seed: number;
  runMs: number;
}

export type LoopConfigResult = { ok: true; config: LoopConfig } | { ok: false; reason: string };

// Paths

export const invocationDirOf = (env: Record<string, string | undefined>, cwd: string): string =>
  env.INIT_CWD !== undefined && env.INIT_CWD !== "" ? env.INIT_CWD : cwd;

export const resolveUserPath = (env: Pick<LoaderEnv, "invocationDir">, p: string): string =>
  path.resolve(env.invocationDir, p);

export const resolveRepoPath = (env: Pick<LoaderEnv, "repoDir">, p: string): string => path.resolve(env.repoDir, p);

// Gremlin lists

/** The one comma-separated splitter. Entries are trimmed; an empty entry is kept so it can be rejected. */
export function splitGremlins(text: string): string[] {
  return text.split(",").map((s) => s.trim());
}

// Loop_Config

const LOOP_KEYS: ReadonlyArray<[keyof LoopConfig, "string" | "number" | "array"]> = [
  ["source", "string"],
  ["build", "array"],
  ["hex", "string"],
  ["pins", "string"],
  ["rules", "string"],
  ["gremlins", "string"],
  ["runs", "number"],
  ["seed", "number"],
  ["runMs", "number"],
];

export function parseLoopConfig(text: string): LoopConfigResult {
  let v: unknown;
  try {
    v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, reason: "The loop config is not valid JSON." };
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ok: false, reason: "The loop config must be a JSON object." };
  }
  const o = v as Record<string, unknown>;
  for (const [key, type] of LOOP_KEYS) {
    const x = o[key];
    if (x === undefined) return { ok: false, reason: `The loop config lacks the key "${key}".` };
    const good =
      type === "array"
        ? Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string")
        : type === "number"
          ? typeof x === "number" && Number.isInteger(x)
          : typeof x === "string";
    if (!good) {
      const want = type === "array" ? "a non-empty array of strings" : type === "number" ? "a whole number" : "a string";
      return { ok: false, reason: `The loop config key "${key}" must be ${want}.` };
    }
  }
  return {
    ok: true,
    config: {
      source: o.source as string,
      build: o.build as string[],
      hex: o.hex as string,
      pins: o.pins as string,
      rules: o.rules as string,
      gremlins: o.gremlins as string,
      runs: o.runs as number,
      seed: o.seed as number,
      runMs: o.runMs as number,
    },
  };
}

/** Loop_Config paths are repo-relative; they become absolute so loadInput leaves them alone. */
export function configToArgs(config: LoopConfig, repoDir: string): CheckArgs {
  return {
    hex: path.resolve(repoDir, config.hex),
    pins: path.resolve(repoDir, config.pins),
    rules: path.resolve(repoDir, config.rules),
    gremlins: config.gremlins,
    runs: config.runs,
    seed: config.seed,
    runMs: config.runMs,
  };
}

// Loader

const fail = (reason: string): LoadResult => ({ ok: false, reason: reason.replace(/\s*[\r\n]+\s*/g, " ") });

function readFile(env: LoaderEnv, abs: string, shown: string): { ok: true; text: string } | { ok: false; reason: string } {
  try {
    return { ok: true, text: env.readText(abs) };
  } catch {
    return { ok: false, reason: `Cannot read the file "${shown}".` };
  }
}

const cleanHex = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r/g, "");

function isExampleId(s: string): s is ExampleId {
  return (EXAMPLE_IDS as readonly string[]).includes(s);
}

type Num = { ok: true; value: number | undefined } | { ok: false; reason: string };

function checkNumber(
  name: string,
  value: number | undefined,
  check: (text: string) => { ok: true; value: number } | { ok: false; message: string },
): Num {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return { ok: false, reason: `${name} must be a whole number.` };
  }
  const c = check(String(value));
  return c.ok ? { ok: true, value: c.value } : { ok: false, reason: c.message };
}

function parseGremlinIds(text: string): { ok: true; ids: string[] } | { ok: false; reason: string } {
  const parts = splitGremlins(text);
  for (const id of parts) {
    if (id === "") return { ok: false, reason: "The gremlin list has an empty entry." };
    if (findGremlin(id) === undefined) return { ok: false, reason: `Unknown gremlin "${id}".` };
  }
  return { ok: true, ids: parts };
}

const orderGremlinIds = (ids: readonly string[]): GremlinSpec[] =>
  GREMLIN_CATALOGUE.filter((g) => ids.includes(g.id)).map((g) => ({ id: g.id }));

export function loadInput(args: CheckArgs, env: LoaderEnv): LoadResult {
  // Step 1: bad combinations and bad values, before any file is read.
  const hasUpload = args.hex !== undefined || args.pins !== undefined || args.rules !== undefined;
  const fullUpload = args.hex !== undefined && args.pins !== undefined && args.rules !== undefined;
  if (args.example !== undefined && hasUpload) {
    return fail("Use --example or --hex, --pins and --rules, not both.");
  }
  if (args.fixed === true && args.example === undefined) return fail("--fixed needs --example.");
  if (args.example !== undefined) {
    if (!isExampleId(args.example)) {
      return fail(`Unknown example "${args.example}". Use one of: ${EXAMPLE_IDS.join(", ")}.`);
    }
  } else if (!fullUpload) {
    return fail("Give --example, or all of --hex, --pins and --rules.");
  }

  let gremlinIds: string[] | undefined;
  if (args.gremlins !== undefined) {
    const g = parseGremlinIds(args.gremlins);
    if (!g.ok) return fail(g.reason);
    gremlinIds = g.ids;
  }
  const runs = checkNumber("--runs", args.runs, checkRuns);
  if (!runs.ok) return fail(runs.reason);
  const seed = checkNumber("--seed", args.seed, checkSeed);
  if (!seed.ok) return fail(seed.reason);
  const runMs = checkNumber("--run-ms", args.runMs, checkRunLength);
  if (!runMs.ok) return fail(runMs.reason);

  // Step 2: files.
  if (args.example !== undefined) {
    const dir = `examples/${args.example}`;
    const hexRel = `${dir}/${args.fixed === true ? "fixed/fixed.hex" : "buggy/buggy.hex"}`;
    const files: string[] = [];
    for (const rel of [hexRel, `${dir}/fixture.json`, `${dir}/rules.txt`, `${dir}/meta.json`]) {
      const r = readFile(env, resolveRepoPath(env, rel), rel);
      if (!r.ok) return fail(r.reason);
      files.push(r.text);
    }
    const [hexText, fixtureText, rulesText, metaText] = files as [string, string, string, string];
    const ex = parseExample(fixtureText, rulesText, metaText);
    if (!ex.ok) {
      const why = ex.rulesReasons[0] ?? ex.jsonErrors[0]?.message ?? "unreadable";
      return fail(`The example files could not be read: ${why}`);
    }
    return {
      ok: true,
      input: {
        hex: cleanHex(hexText),
        fixture: ex.fixture,
        ruleSet: ex.ruleSet,
        ruleSentences: ex.sentences,
        gremlinSet: gremlinIds !== undefined ? orderGremlinIds(gremlinIds) : ex.meta.gremlinSet,
        campaignSeed: seed.value ?? ex.meta.campaignSeed,
        runs: runs.value ?? ex.meta.runs,
        runCycles: runMs.value !== undefined ? msToCycles(runMs.value) : ex.meta.runCycles,
      },
    };
  }

  const texts: Record<"hex" | "pins" | "rules", string> = { hex: "", pins: "", rules: "" };
  for (const key of ["hex", "pins", "rules"] as const) {
    const given = args[key] as string;
    const r = readFile(env, resolveUserPath(env, given), given);
    if (!r.ok) return fail(r.reason);
    texts[key] = r.text;
  }
  let fixture: Fixture;
  try {
    fixture = JSON.parse(texts.pins) as Fixture;
  } catch {
    return fail(`The pin file "${args.pins as string}" is not valid JSON.`);
  }
  if (typeof fixture !== "object" || fixture === null || !Array.isArray(fixture.pins)) {
    return fail(`The pin file "${args.pins as string}" needs a "pins" list.`);
  }
  const rules = readRulesFile(texts.rules);
  if (!rules.ok) return fail(`The rules file could not be read: ${rules.reasons[0] ?? "unreadable"}`);
  const ruleSet: RuleSet = rules.ruleSet;
  const ruleSentences = ruleSet.map((r) => {
    const s = render(r);
    return s.ok ? s.sentence : s.reason;
  });
  let gremlinSet: GremlinSpec[];
  if (gremlinIds !== undefined) {
    gremlinSet = orderGremlinIds(gremlinIds);
  } else {
    const masher = GREMLIN_CATALOGUE.find((g) => g.id === "masher");
    if (masher === undefined || !isCompatible(masher, fixture)) {
      return fail("The default gremlin masher does not fit this pin file. Name gremlins with --gremlins.");
    }
    gremlinSet = [{ id: "masher" }];
  }
  return {
    ok: true,
    input: {
      hex: cleanHex(texts.hex),
      fixture,
      ruleSet,
      ruleSentences,
      gremlinSet,
      campaignSeed: seed.value ?? UPLOAD_DEFAULTS.seed,
      runs: runs.value ?? UPLOAD_DEFAULTS.runs,
      runCycles: msToCycles(runMs.value ?? UPLOAD_DEFAULTS.runLengthMs),
    },
  };
}
