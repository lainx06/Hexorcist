// headless-runner: `npm run mcp`. Newline-delimited JSON-RPC 2.0 on stdin and stdout.
// Only responses go to stdout; diagnostics go to stderr. Requests are answered one at a time, in order.
import { createInterface } from "node:readline";
import { nodeReader, toolVersion } from "../cli/node-io";
import { handleLine } from "./server";

const deps = { reader: nodeReader(), toolVersion: toolVersion() };
process.stderr.write(`hexorcist MCP server ${deps.toolVersion} ready on stdio\n`);

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  try {
    const res = handleLine(line, deps);
    if (res !== null) process.stdout.write(`${JSON.stringify(res)}\n`);
  } catch (e) {
    process.stderr.write(`internal error: ${e instanceof Error ? e.message : String(e)}\n`);
  }
});
