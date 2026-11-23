// headless-runner: `npm run check -- <args>` (Requirements 1, 3, 4). main() returns the exit code and
// writes through the io it is given, so tests can call it without a child process.
import type { CheckArgs, LoadResult, TextReader } from "./input-loader";
import { loadInput } from "./input-loader";
import type { CheckInput } from "./input-loader";
import type { CheckOutcome } from "./run-check";
import { exitCodeOf, runCheck, toJson, toSummary } from "./run-check";

export interface Io {
  out(text: string): void;
  err(text: string): void;
  reader: TextReader;
  toolVersion: string;
}

export interface Deps {
  load: (args: CheckArgs, reader: TextReader) => LoadResult;
  check: (input: CheckInput, toolVersion: string) => CheckOutcome;
}

const DEFAULT_DEPS: Deps = { load: loadInput, check: (input, v) => runCheck(input, v) };

export const USAGE = [
  "Usage:",
  "  npm run check -- --example <crosswalk|garage|heartbeat> [--fixed] [options]",
  "  npm run check -- --hex <file.hex> --pins <pins.json> --rules <rules.txt> [options]",
  "Options:",
  "  --gremlins <id,id>   gremlin ids (default: the example's set, or the Masher for your own program)",
  "  --runs <n>           tries (1 to 1000)",
  "  --seed <n>           seed (0 to 4294967295)",
  "  --run-ms <n>         device time per try in ms (1 to 60000)",
  "  --json               print one JSON object instead of the summary",
  "Exit codes: 0 HELD, 1 BROKE, 2 COULDN'T TELL, 3 input or internal error.",
].join("\n");

const VALUE_FLAGS: Record<string, keyof CheckArgs> = {
  "--example": "example",
  "--hex": "hex",
  "--pins": "pins",
  "--rules": "rules",
  "--gremlins": "gremlins",
  "--runs": "runs",
  "--seed": "seed",
  "--run-ms": "runMs",
};

export type Parsed = { ok: true; args: CheckArgs; json: boolean; help: boolean } | { ok: false; reason: string };

export function parseArgv(argv: readonly string[]): Parsed {
  const args: CheckArgs = {};
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--json") json = true;
    else if (a === "--fixed") args.fixed = true;
    else if (a === "--help" || a === "-h") help = true;
    else if (a in VALUE_FLAGS) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { ok: false, reason: `${a} needs a value.` };
      const key = VALUE_FLAGS[a] as keyof CheckArgs;
      if (args[key] !== undefined) return { ok: false, reason: `${a} was given twice.` };
      (args as Record<string, string>)[key] = v;
      i++;
    } else return { ok: false, reason: `Unknown argument "${a}". Run with --help for the options.` };
  }
  return { ok: true, args, json, help };
}

/** One line, no stack trace. */
const oneLine = (s: string): string => s.replace(/\s*\n\s*/g, " ").trim();

export function main(argv: readonly string[], io: Io, deps: Deps = DEFAULT_DEPS): 0 | 1 | 2 | 3 {
  try {
    const parsed = parseArgv(argv);
    if (!parsed.ok) {
      io.err(`${oneLine(parsed.reason)}\n`);
      return 3;
    }
    if (parsed.help) {
      io.out(`${USAGE}\n`);
      return 0;
    }
    const loaded = deps.load(parsed.args, io.reader);
    if (!loaded.ok) {
      io.err(`${oneLine(loaded.reason)}\n`);
      return 3;
    }
    const outcome = deps.check(loaded.input, io.toolVersion);
    if (!outcome.ok) {
      io.err(`The ${outcome.job} job failed (${outcome.error.kind}): ${oneLine(outcome.error.message)}\n`);
      return 3;
    }
    io.out(parsed.json ? toJson(outcome.result) : toSummary(outcome.result));
    return exitCodeOf(outcome);
  } catch (e) {
    io.err(`Internal error: ${oneLine(e instanceof Error ? e.message : String(e))}\n`);
    return 3;
  }
}
