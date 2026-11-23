// headless-runner: the Agent Stop hook command (Requirement 7.3, 7.4).
//   npx tsx cli/hook-stop.ts [config.json] [--block] [--max-blocks N]
// When the program changed since the last check: optional build, then the same check as `npm run check`,
// then one verdict line and the state file. Without --block it always exits 0 (report only).
// With --block it exits 2 on BROKE, COULDN'T TELL or a failed build, with the message on stderr too, so a
// hook runner that treats exit 2 as "keep working" sends the agent back (UNVERIFIED for Kiro). After
// --max-blocks blocks in a row (default 3) it stops blocking and says so; a HELD resets the count.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CheckInput, LoadResult, TextReader } from "./input-loader";
import { loadInput } from "./input-loader";
import { isMain, nodeReader, REPO_ROOT, toolVersion } from "./node-io";
import type { CheckOutcome, ResultObject } from "./run-check";
import { runCheck } from "./run-check";
import type { HookConfig } from "./hook-common";
import { DEFAULT_CONFIG, argsOf, programHash, readConfig, readState, writeState } from "./hook-common";

export const BLOCKS_PATH = ".hexorcist/stop-blocks.json";

export interface StopIo {
  out(t: string): void;
  err(t: string): void;
}

export interface StopDeps {
  root: string;
  reader: TextReader;
  toolVersion: string;
  build: (cmd: string[], root: string) => { ok: boolean; output: string };
  load: (args: Parameters<typeof loadInput>[0], reader: TextReader) => LoadResult;
  check: (input: CheckInput, toolVersion: string) => CheckOutcome;
}

export function defaultDeps(root: string = REPO_ROOT): StopDeps {
  return {
    root,
    reader: nodeReader(root),
    toolVersion: toolVersion(),
    build: (cmd, cwd) => {
      const [exe, ...rest] = cmd as [string, ...string[]];
      const r = spawnSync(exe, rest, { cwd, encoding: "utf8", shell: process.platform === "win32" });
      return { ok: r.error === undefined && r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? r.error.message : ""}` };
    },
    load: loadInput,
    check: (input, v) => runCheck(input, v),
  };
}

const PREFIX = "Hexorcist:";

function lastLines(text: string, n: number): string {
  const lines = text.replace(/\r/g, "").trimEnd().split("\n");
  return lines.slice(-n).join("\n");
}

function ms(cycle: number): string {
  const tenths = Math.round(cycle / 1600);
  return `${Math.floor(tenths / 10)}.${tenths % 10} ms`;
}

/** One verdict line, then the details. */
export function stopReport(r: ResultObject): string {
  if (r.verdict === "HELD") return `${PREFIX} HELD. ${r.text}\n`;
  if (r.verdict === "COULDN'T TELL") return `${PREFIX} COULDN'T TELL. ${r.reason}\n`;
  const moves = r.reducedList.map((e) => {
    const rec = e as unknown as Record<string, unknown>;
    return `  at ${ms(e.cycle)}: ${e.signal} = ${String(rec.value ?? "")}${typeof rec.gremlinId === "string" ? ` (${rec.gremlinId})` : ""}`;
  });
  return [
    `${PREFIX} BROKE. ${r.violation.rule}`,
    `Try ${r.try} of ${r.runs} broke it. The smallest replay this reducer found has ${r.movesAfter} of ${r.movesBefore} moves:`,
    ...moves,
    `Rule broken at ${ms(r.violation.cycle)}. Fingerprint ${r.fingerprint}.`,
    "Fix the program so this rule holds, then finish again to re-check.",
    "",
  ].join("\n");
}

function readBlocks(root: string): number {
  try {
    const n = (JSON.parse(readFileSync(resolve(root, BLOCKS_PATH), "utf8")) as { blocks?: unknown }).blocks;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeBlocks(root: string, blocks: number): void {
  const p = resolve(root, BLOCKS_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify({ blocks }, null, 2)}\n`);
}

export function stopMain(argv: readonly string[], io: StopIo, deps: StopDeps): 0 | 2 {
  let configPath = DEFAULT_CONFIG;
  let block = false;
  let maxBlocks = 3;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--block") block = true;
    else if (a === "--max-blocks") {
      const n = Number(argv[++i]);
      if (Number.isInteger(n) && n >= 0) maxBlocks = n;
    } else configPath = a;
  }

  const root = deps.root;
  const say = (t: string): 0 => {
    io.out(t);
    return 0;
  };
  /** A failing result: block (exit 2) unless the cap is reached. */
  const fail = (t: string): 0 | 2 => {
    io.out(t);
    if (!block) return 0;
    const used = readBlocks(root);
    if (used >= maxBlocks) {
      io.out(`${PREFIX} stopped blocking after ${maxBlocks} tries in a row; the result above stands.\n`);
      return 0;
    }
    writeBlocks(root, used + 1);
    io.err(t);
    return 2;
  };

  const cfg = readConfig(root, configPath);
  if (!cfg.ok) return say(`${PREFIX} no check ran: ${cfg.reason}\n`);
  const c: HookConfig = cfg.config;

  const before = programHash(root, c);
  if (before === null) return say(`${PREFIX} no check ran: ${c.source ?? c.hex} is missing.\n`);
  const last = readState(root);
  if (last !== null && last.programSha256 === before) {
    const msg = `${PREFIX} no check ran: the program has not changed since the last check (${last.verdict}).\n`;
    return last.verdict === "HELD" ? say(msg) : fail(msg);
  }

  if (c.build !== undefined && (c.source !== undefined || !existsSync(resolve(root, c.hex)))) {
    const b = deps.build(c.build, root);
    if (!b.ok) return fail(`${PREFIX} no check ran: the build failed.\n${lastLines(b.output, 20)}\n`);
  }

  const loaded = deps.load(argsOf(c, root), deps.reader);
  if (!loaded.ok) return fail(`${PREFIX} no check ran: ${loaded.reason}\n`);
  const outcome = deps.check(loaded.input, deps.toolVersion);
  if (!outcome.ok) return fail(`${PREFIX} no check ran: the ${outcome.job} job failed: ${outcome.error.message}\n`);

  const r = outcome.result;
  writeState(root, {
    verdict: r.verdict,
    exitCode: r.verdict === "HELD" ? 0 : r.verdict === "BROKE" ? 1 : 2,
    programSha256: before,
    fingerprint: r.verdict === "BROKE" ? r.fingerprint : null,
  });
  if (r.verdict === "HELD") {
    writeBlocks(root, 0);
    return say(stopReport(r));
  }
  return fail(stopReport(r));
}

const isEntry = isMain(import.meta.url);
if (isEntry) {
  process.exitCode = stopMain(process.argv.slice(2), { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, defaultDeps());
}
