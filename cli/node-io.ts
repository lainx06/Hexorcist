// headless-runner: the file and package facts the CLI and the MCP server read from disk.
// User paths resolve against the folder the user ran npm from (INIT_CWD), example paths against the repo root.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TextReader } from "./input-loader";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function userDir(): string {
  return process.env.INIT_CWD ?? process.cwd();
}

export function nodeReader(baseDir: string = userDir()): TextReader {
  return {
    user: (p) => readFileSync(isAbsolute(p) ? p : resolve(baseDir, p), "utf8"),
    example: (p) => readFileSync(resolve(REPO_ROOT, p), "utf8"),
  };
}

export function toolVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}

/** True when the module at moduleUrl is the script node was started with (case-insensitive on Windows). */
export function isMain(moduleUrl: string): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const a = resolve(fileURLToPath(moduleUrl));
  const b = resolve(argv1);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
