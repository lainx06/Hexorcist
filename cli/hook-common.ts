// headless-runner: shared parts of the two Kiro hook commands (Requirement 7): the check config,
// the state file .hexorcist/last-verdict.json and file hashes. No clock, no random source, no network.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CheckArgs } from "./input-loader";

/** exorcism-demo/check.json and friends. Paths are relative to the repo root. */
export interface HookConfig {
  /** Optional source file (a sketch). When set, its hash decides whether the program changed. */
  source?: string;
  /** Optional build command run before the check when the source changed, e.g. ["node", "exorcism-demo/build.mjs"]. */
  build?: string[];
  hex: string;
  pins: string;
  rules: string;
  gremlins?: string;
  runs?: number | string;
  seed?: number | string;
  runMs?: number | string;
}

/** Fixed key order; no time fields. fingerprint is null unless BROKE. */
export interface HookState {
  verdict: "BROKE" | "HELD" | "COULDN'T TELL";
  exitCode: 0 | 1 | 2;
  /** sha256 of the source file when the config names one, otherwise of the HEX file. */
  programSha256: string;
  fingerprint: string | null;
}

export const STATE_PATH = ".hexorcist/last-verdict.json";
export const DEFAULT_CONFIG = "exorcism-demo/check.json";

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readConfig(root: string, path: string): { ok: true; config: HookConfig } | { ok: false; reason: string } {
  const full = resolve(root, path);
  if (!existsSync(full)) return { ok: false, reason: `${path} is missing.` };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(full, "utf8"));
  } catch {
    return { ok: false, reason: `${path} is not valid JSON.` };
  }
  const c = raw as Record<string, unknown>;
  for (const k of ["hex", "pins", "rules"]) if (typeof c[k] !== "string") return { ok: false, reason: `${path} needs a "${k}" path.` };
  if (c.source !== undefined && typeof c.source !== "string") return { ok: false, reason: `${path}: "source" must be a path.` };
  if (c.build !== undefined && (!Array.isArray(c.build) || c.build.length === 0 || !c.build.every((x) => typeof x === "string"))) {
    return { ok: false, reason: `${path}: "build" must be a list of strings, like ["node", "exorcism-demo/build.mjs"].` };
  }
  return { ok: true, config: c as unknown as HookConfig };
}

export function argsOf(c: HookConfig, root: string): CheckArgs {
  const a: CheckArgs = { hex: resolve(root, c.hex), pins: resolve(root, c.pins), rules: resolve(root, c.rules) };
  if (c.gremlins !== undefined) a.gremlins = String(c.gremlins);
  if (c.runs !== undefined) a.runs = String(c.runs);
  if (c.seed !== undefined) a.seed = String(c.seed);
  if (c.runMs !== undefined) a.runMs = String(c.runMs);
  return a;
}

/** The file whose hash stands for "the program": the source when named, else the HEX. Null if unreadable. */
export function programHash(root: string, c: HookConfig): string | null {
  const p = resolve(root, c.source ?? c.hex);
  try {
    return sha256(readFileSync(p));
  } catch {
    return null;
  }
}

export function readState(root: string): HookState | null {
  try {
    const s = JSON.parse(readFileSync(resolve(root, STATE_PATH), "utf8")) as Partial<HookState>;
    const verdicts = ["BROKE", "HELD", "COULDN'T TELL"];
    if (typeof s.verdict !== "string" || !verdicts.includes(s.verdict) || typeof s.programSha256 !== "string") return null;
    return s as HookState;
  } catch {
    return null;
  }
}

export function writeState(root: string, s: HookState): void {
  const p = resolve(root, STATE_PATH);
  mkdirSync(dirname(p), { recursive: true });
  const ordered: HookState = { verdict: s.verdict, exitCode: s.exitCode, programSha256: s.programSha256, fingerprint: s.fingerprint };
  writeFileSync(p, `${JSON.stringify(ordered, null, 2)}\n`);
}
