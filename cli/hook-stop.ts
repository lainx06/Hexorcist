// Stop hook command: build, check, write the Verdict_Record, print one verdict line, count blocks.
// No clock, no random source, no network. The build runs with spawnSync and no shell.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "./entry";
import { configToArgs, invocationDirOf, loadInput, parseLoopConfig, resolveUserPath } from "./input-loader";
import type { LoaderEnv } from "./input-loader";
import { exitCodeOf, runCheck } from "./run-check";
import type { CheckRun } from "./run-check";
import { hexSha256, serializeRecord } from "./verdict-record";
import type { RecordVerdict } from "./verdict-record";

export const DEFAULT_MAX_BLOCKS = 3;

export interface StopDecision {
  exitCode: 0 | 2;
  nextCount: number;
  limitReached: boolean;
}

/** Pure. HELD resets the counter; without --block nothing changes; at the limit the hook lets go. */
export function decideStop(p: {
  verdict: RecordVerdict;
  block: boolean;
  count: number;
  max: number;
}): StopDecision {
  if (p.verdict === "HELD") return { exitCode: 0, nextCount: 0, limitReached: false };
  if (!p.block) return { exitCode: 0, nextCount: p.count, limitReached: false };
  if (p.count < p.max) return { exitCode: 2, nextCount: p.count + 1, limitReached: false };
  return { exitCode: 0, nextCount: p.count, limitReached: true };
}

export interface BuildResult {
  status: number | null;
  stderr: string;
  error?: string;
}

export interface StopIo {
  stdout(text: string): void;
  stderr(text: string): void;
  env: LoaderEnv;
  /** Tests pass a stub. The default is spawnSync with no shell. */
  build?: (command: string, args: string[], cwd: string) => BuildResult;
}

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ").trim();

const defaultBuild = (command: string, args: string[], cwd: string): BuildResult => {
  const r = spawnSync(command, args, { cwd, shell: false, encoding: "utf8" });
  return { status: r.status, stderr: r.stderr ?? "", ...(r.error !== undefined ? { error: r.error.message } : {}) };
};

const lastLine = (s: string): string => {
  const lines = s.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.length > 0 ? (lines[lines.length - 1] as string) : "";
};

function parseFlags(rest: readonly string[]): { ok: true; block: boolean; max: number } | { ok: false; reason: string } {
  let block = false;
  let max = DEFAULT_MAX_BLOCKS;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === "--block") block = true;
    else if (a === "--max-blocks") {
      const v = rest[i + 1];
      if (v === undefined || !/^\d+$/.test(v)) return { ok: false, reason: "--max-blocks needs a whole number." };
      max = Number(v);
      i++;
    } else return { ok: false, reason: `Unknown argument "${a}".` };
  }
  return { ok: true, block, max };
}

function readCount(file: string): number {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const c = typeof v === "object" && v !== null ? (v as { count?: unknown }).count : undefined;
    return typeof c === "number" && Number.isInteger(c) && c >= 0 ? c : 0;
  } catch {
    return 0;
  }
}

export function run(argv: readonly string[], io: StopIo): number {
  const stateDir = path.join(io.env.repoDir, ".hexorcist");
  const recordFile = path.join(stateDir, "last-verdict.json");
  const countFile = path.join(stateDir, "stop-blocks.json");

  const noCheck = (cause: string): number => {
    try {
      fs.rmSync(recordFile, { force: true });
    } catch {
      /* nothing more to do; the line below still tells the truth */
    }
    io.stdout(`No check ran: ${oneLine(cause)}\n`);
    return 0;
  };

  try {
    const configArg = argv[0];
    if (configArg === undefined || configArg.startsWith("--")) return noCheck("no loop config path was given.");
    const flags = parseFlags(argv.slice(1));
    if (!flags.ok) return noCheck(flags.reason);

    let configText: string;
    try {
      configText = io.env.readText(resolveUserPath(io.env, configArg));
    } catch {
      return noCheck(`the loop config "${configArg}" could not be read.`);
    }
    const parsed = parseLoopConfig(configText);
    if (!parsed.ok) return noCheck(parsed.reason);
    const config = parsed.config;

    const build = (io.build ?? defaultBuild)(config.build[0] as string, config.build.slice(1), io.env.repoDir);
    if (build.error !== undefined) return noCheck(`the build could not start: ${build.error}`);
    if (build.status !== 0) {
      const why = lastLine(build.stderr);
      return noCheck(`the build exited with code ${String(build.status)}${why !== "" ? `: ${why}` : "."}`);
    }

    const hexPath = path.resolve(io.env.repoDir, config.hex);
    let hexBytes: Uint8Array;
    try {
      hexBytes = fs.readFileSync(hexPath);
    } catch {
      return noCheck(`the HEX file "${config.hex}" is missing.`);
    }

    const loaded = loadInput(configToArgs(config, io.env.repoDir), io.env);
    if (!loaded.ok) return noCheck(loaded.reason);
    const outcome = runCheck(loaded.input);
    if (!outcome.ok) return noCheck(`the ${outcome.job} job failed: ${outcome.error.message}`);

    const run: CheckRun = outcome.result;
    const verdict = run.verdict;
    let line: string;
    if (verdict.verdict === "HELD") {
      line = `HELD: ${verdict.text}`;
    } else if (verdict.verdict === "COULDN'T TELL") {
      line = `COULDN'T TELL: ${verdict.reason}`;
    } else {
      const tryNo = (run.campaign.violatingRunIndex ?? verdict.trace.runIndex) + 1;
      const parts = [
        `BROKE: ${verdict.trace.violation.rule} at cycle ${verdict.trace.violation.cycle}.`,
        `Try ${tryNo} of ${run.campaign.requestedRuns}, seed ${loaded.input.campaignSeed}.`,
      ];
      if (run.reduction !== undefined && run.replay !== undefined) {
        parts.push(
          `Moves ${run.reduction.originalEventCount} to ${run.reduction.reducedEventCount} (the smallest replay this reducer found).`,
          `Fingerprint ${run.replay.fingerprint}.`,
          `Reduced moves: ${JSON.stringify(run.reduction.reducedList)}`,
        );
      }
      line = parts.join(" ");
    }
    line = oneLine(line);

    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      recordFile,
      serializeRecord({
        verdict: verdict.verdict,
        exitCode: exitCodeOf(outcome),
        hexSha256: hexSha256(hexBytes),
        fingerprint: run.replay?.fingerprint ?? null,
      }),
    );

    const decision = decideStop({
      verdict: verdict.verdict,
      block: flags.block,
      count: readCount(countFile),
      max: flags.max,
    });
    if (flags.block && (verdict.verdict === "HELD" || decision.exitCode === 2)) {
      fs.writeFileSync(countFile, `${JSON.stringify({ count: decision.nextCount }, null, 2)}\n`);
    }
    if (decision.exitCode === 2) {
      io.stderr(`${line}\n`);
      return 2;
    }
    io.stdout(`${line}\n`);
    if (decision.limitReached) {
      io.stdout(`Block limit reached after ${flags.max} blocks in a row, so this stop is allowed.\n`);
    }
    return 0;
  } catch (e) {
    return noCheck(e instanceof Error ? e.message : String(e));
  }
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.exitCode = run(process.argv.slice(2), {
    stdout: (t) => void process.stdout.write(t),
    stderr: (t) => void process.stderr.write(t),
    env: {
      readText: (p) => fs.readFileSync(p, "utf8"),
      invocationDir: invocationDirOf(process.env, process.cwd()),
      repoDir,
    },
  });
}
