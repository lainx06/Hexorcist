// MCP stdio entry. Newline-delimited JSON-RPC on stdin and stdout; diagnostics go to stderr.
// Runs only when this file is the script Node was started with.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "../cli/entry";
import { invocationDirOf } from "../cli/input-loader";
import { handleLine } from "./server";

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const deps = {
    env: {
      readText: (p: string) => fs.readFileSync(p, "utf8"),
      invocationDir: invocationDirOf(process.env, process.cwd()),
      repoDir,
    },
  };
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    try {
      const res = handleLine(line, deps);
      if (res !== null) process.stdout.write(`${JSON.stringify(res)}\n`);
    } catch (e) {
      process.stderr.write(`hexorcist mcp: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  });
}
