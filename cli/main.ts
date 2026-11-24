// main(argv, io): parse flags, load input, run the check, print, return the exit code.
// Every thrown error becomes one stderr line and exit code 3. No clock, no random source, no network.
import path from "node:path";
import { loadInput } from "./input-loader";
import type { CheckArgs, LoaderEnv, LoadResult } from "./input-loader";
import { exitCodeOf, runCheck, toJson, toSummary } from "./run-check";
import type { CheckOutcome } from "./run-check";

export interface MainIo {
  stdout(text: string): void;
  stderr(text: string): void;
  env: LoaderEnv;
  /** Tests pass stubs; the default is the real loader and runner. */
  load?: (args: CheckArgs, env: LoaderEnv) => LoadResult;
  run?: (input: Extract<LoadResult, { ok: true }>["input"]) => CheckOutcome;
}

const VALUE_FLAGS: Record<string, "example" | "hex" | "pins" | "rules" | "gremlins"> = {
  "--example": "example",
  "--hex": "hex",
  "--pins": "pins",
  "--rules": "rules",
  "--gremlins": "gremlins",
};
const NUMBER_FLAGS: Record<string, "runs" | "seed" | "runMs"> = {
  "--runs": "runs",
  "--seed": "seed",
  "--run-ms": "runMs",
};

type Parsed = { ok: true; args: CheckArgs; json: boolean } | { ok: false; reason: string };

/** A number flag that is not a plain integer becomes NaN, which the loader rejects. */
const toNumber = (text: string): number => (/^-?\d+$/.test(text) ? Number(text) : Number.NaN);

export function parseArgs(argv: readonly string[]): Parsed {
  const args: CheckArgs = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--fixed") {
      args.fixed = true;
      continue;
    }
    const valueKey = VALUE_FLAGS[flag];
    const numberKey = NUMBER_FLAGS[flag];
    if (valueKey === undefined && numberKey === undefined) return { ok: false, reason: `Unknown argument "${flag}".` };
    const value = argv[i + 1];
    if (value === undefined) return { ok: false, reason: `${flag} needs a value.` };
    i++;
    if (valueKey !== undefined) args[valueKey] = value;
    else if (numberKey !== undefined) args[numberKey] = toNumber(value);
  }
  return { ok: true, args, json };
}

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ");

/** The `version` field of package.json in the repo folder. */
const toolVersionOf = (env: LoaderEnv): string => {
  const pkg: unknown = JSON.parse(env.readText(path.join(env.repoDir, "package.json")));
  const v = (pkg as { version?: unknown }).version;
  if (typeof v !== "string") throw new Error("package.json has no version string.");
  return v;
};

export function main(argv: readonly string[], io: MainIo): number {
  try {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
      io.stderr(`${oneLine(parsed.reason)}\n`);
      return 3;
    }
    const loaded = (io.load ?? loadInput)(parsed.args, io.env);
    if (!loaded.ok) {
      io.stderr(`${oneLine(loaded.reason)}\n`);
      return 3;
    }
    const outcome = (io.run ?? runCheck)(loaded.input);
    if (!outcome.ok) {
      io.stderr(`The ${outcome.job} job failed: ${oneLine(outcome.error.message)}\n`);
      return 3;
    }
    if (parsed.json) io.stdout(toJson(loaded.input, outcome, toolVersionOf(io.env)));
    else io.stdout(toSummary(loaded.input, outcome));
    return exitCodeOf(outcome);
  } catch (e) {
    io.stderr(`${oneLine(e instanceof Error ? e.message : String(e))}\n`);
    return 3;
  }
}
