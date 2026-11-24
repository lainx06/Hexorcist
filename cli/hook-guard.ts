// Pre Tool Use hook command: lets a spec task be marked done only when the recorded check is a
// current HELD. Reads files and the hook payload only. No emulator, no clock, no network.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "./entry";
import { hexSha256, parseRecord } from "./verdict-record";
import type { VerdictRecord } from "./verdict-record";

export type PayloadKind = "task-done" | "other";

/** Pure. "task-done" only for task_update with an object tool_input whose status is completed or done. */
export function classifyPayload(text: string): PayloadKind {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return "other";
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "other";
  const o = v as Record<string, unknown>;
  if (o.tool_name !== "task_update") return "other";
  const input = o.tool_input;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return "other";
  const status = (input as Record<string, unknown>).status;
  return status === "completed" || status === "done" ? "task-done" : "other";
}

export type GuardDecision = { exitCode: 0 } | { exitCode: 2; message: string };

/** Pure. currentHash is null when the HEX file cannot be read. */
export function decideGuard(record: VerdictRecord | null, currentHash: string | null): GuardDecision {
  if (record === null) {
    return {
      exitCode: 2,
      message:
        "Blocked: no verdict is recorded. Run the check before marking the task done (the Stop hook does this, or run npm run check), fix anything it finds, then mark the task done.",
    };
  }
  if (record.verdict !== "HELD") {
    return {
      exitCode: 2,
      message: `Blocked: the recorded verdict is ${record.verdict}. Fix the program, run the check again, and mark the task done only after it says HELD.`,
    };
  }
  if (currentHash === null || currentHash !== record.hexSha256) {
    return {
      exitCode: 2,
      message:
        "Blocked: the recorded check is out of date (the HEX file changed or is missing). Build and run the check again before marking the task done.",
    };
  }
  return { exitCode: 0 };
}

export interface GuardIo {
  readStdin(): string;
  stderr(text: string): void;
  /** Folder that holds package.json. State files and Loop_Config paths resolve against it. */
  repoDir: string;
  /** Folder the hook argument resolves against. */
  invocationDir: string;
}

function currentHexHash(configArg: string | undefined, io: GuardIo): string | null {
  if (configArg === undefined) return null;
  try {
    const cfg: unknown = JSON.parse(fs.readFileSync(path.resolve(io.invocationDir, configArg), "utf8"));
    if (typeof cfg !== "object" || cfg === null) return null;
    const hex = (cfg as { hex?: unknown }).hex;
    if (typeof hex !== "string" || hex === "") return null;
    return hexSha256(fs.readFileSync(path.resolve(io.repoDir, hex)));
  } catch {
    return null;
  }
}

export function run(argv: readonly string[], io: GuardIo): number {
  let text: string;
  try {
    text = io.readStdin();
  } catch {
    text = "";
  }
  const stateDir = path.join(io.repoDir, ".hexorcist");
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "last-pretooluse.json"), text);
  } catch (e) {
    io.stderr(`Could not write last-pretooluse.json: ${e instanceof Error ? e.message : String(e)}\n`);
  }

  if (classifyPayload(text) !== "task-done") return 0;

  let record: VerdictRecord | null = null;
  try {
    record = parseRecord(fs.readFileSync(path.join(stateDir, "last-verdict.json"), "utf8"));
  } catch {
    record = null;
  }
  const decision = decideGuard(record, currentHexHash(argv[0], io));
  if (decision.exitCode === 2) {
    io.stderr(`${decision.message}\n`);
    return 2;
  }
  return 0;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const init = process.env.INIT_CWD;
  process.exitCode = run(process.argv.slice(2), {
    readStdin: () => fs.readFileSync(0, "utf8"),
    stderr: (t) => void process.stderr.write(t),
    repoDir,
    invocationDir: init !== undefined && init !== "" ? init : process.cwd(),
  });
}
