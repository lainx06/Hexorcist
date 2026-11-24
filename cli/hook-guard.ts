// headless-runner: the Pre Tool Use hook command (Requirement 7.5 to 7.7).
//   npx tsx cli/hook-guard.ts [config.json]   (reads the hook's JSON on stdin)
// Blocks (exit 2, reason on stderr) a tool call that marks a task done unless the last check of the
// current program was HELD. Every other tool call is allowed (exit 0). It runs no emulator and makes no
// network call. Kiro's payload has tool_name and tool_input (kiro.dev/docs/hooks/types). The real "task
// done" call, logged in Kiro on Nov 24, 2026, is tool_name "task_update" with tool_input.status
// "completed" (plus tasksFilePath and taskId); isTaskDone() matches it exactly and keeps a status-field
// fallback for other shapes. Each payload it sees is written to .hexorcist/last-pretooluse.json.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isMain, REPO_ROOT } from "./node-io";
import type { HookState } from "./hook-common";
import { DEFAULT_CONFIG, programHash, readConfig, readState } from "./hook-common";

export const PAYLOAD_LOG = ".hexorcist/last-pretooluse.json";

const DONE = /^(completed?|done|finished)$/i;
const STATUS_KEYS = /^(status|state|taskStatus|task_status|newStatus|new_status)$/i;

/** True when some status-like field anywhere in the tool input says completed or done. */
export function isTaskDone(payload: unknown): boolean {
  const p0 = payload as { tool_name?: unknown; tool_input?: { status?: unknown } } | null;
  if (p0 !== null && typeof p0 === "object" && p0.tool_name === "task_update") {
    const st = p0.tool_input?.status;
    return typeof st === "string" && DONE.test(st.trim());
  }
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > 6 || v === null || typeof v !== "object" || seen.has(v)) return false;
    seen.add(v);
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (STATUS_KEYS.test(k) && typeof x === "string" && DONE.test(x.trim())) return true;
      if (k === "checked" && x === true) return true;
      if (walk(x, depth + 1)) return true;
    }
    return false;
  };
  const p = payload as Record<string, unknown> | null;
  return p !== null && typeof p === "object" && walk(p.tool_input ?? p, 0);
}

export type GuardDecision = { allow: true } | { allow: false; reason: string };

/** Pure decision: allow unless the call marks a task done and the current program is not a recorded HELD. */
export function decide(payload: unknown, state: HookState | null, currentHash: string | null): GuardDecision {
  if (!isTaskDone(payload)) return { allow: true };
  if (state === null) return { allow: false, reason: "Hexorcist: no check has run on this program yet. Finish your turn so the check runs, then mark the task done." };
  if (currentHash === null || state.programSha256 !== currentHash) {
    return { allow: false, reason: "Hexorcist: the program changed since the last check. Finish your turn so the check runs again, then mark the task done." };
  }
  if (state.verdict !== "HELD") {
    return { allow: false, reason: `Hexorcist: the last check said ${state.verdict}. Fix the program until the check says HELD, then mark the task done.` };
  }
  return { allow: true };
}

export function guardMain(stdinText: string, argv: readonly string[], root: string, io: { err(t: string): void }): 0 | 2 {
  let payload: unknown = null;
  try {
    payload = stdinText.trim() === "" ? null : JSON.parse(stdinText);
  } catch {
    payload = null;
  }
  try {
    const p = resolve(root, PAYLOAD_LOG);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, `${JSON.stringify(payload, null, 2)}\n`);
  } catch {
    // Logging is best effort; the decision below does not depend on it.
  }
  const cfg = readConfig(root, argv[0] ?? DEFAULT_CONFIG);
  const hash = cfg.ok ? programHash(root, cfg.config) : null;
  const d = decide(payload, readState(root), hash);
  if (d.allow) return 0;
  io.err(`${d.reason}\n`);
  return 2;
}

const isEntry = isMain(import.meta.url);
if (isEntry) {
  let input = "";
  try {
    input = readFileSync(0, "utf8");
  } catch {
    input = "";
  }
  process.exitCode = guardMain(input, process.argv.slice(2), REPO_ROOT, { err: (t) => process.stderr.write(t) });
}
