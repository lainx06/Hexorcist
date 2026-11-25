// Hand-written JSON-RPC 2.0 handling for the MCP server. Pure: no stdin, no stdout, no clock,
// no random source, no network. It imports the Input_Loader and runCheck, never cli/main.ts.
import path from "node:path";
import { GREMLIN_CATALOGUE } from "../src/engine/gremlins/catalogue";
import { UNMODELLED_PERIPHERALS } from "../src/engine/peripherals";
import type { Fixture } from "../src/engine/types";
import { sentencePatterns } from "../src/ui/app/model/rule-box";
import { EXAMPLE_IDS, loadInput } from "../cli/input-loader";
import type { CheckArgs, LoaderEnv, LoadResult } from "../cli/input-loader";
import { runCheck, toJson } from "../cli/run-check";
import type { CheckOutcome } from "../cli/run-check";

export interface ServerDeps {
  env: LoaderEnv;
  /** Tests pass stubs; the default is the real loader and runner. */
  load?: (args: CheckArgs, env: LoaderEnv) => LoadResult;
  run?: (input: Extract<LoadResult, { ok: true }>["input"]) => CheckOutcome;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const SERVER_PROTOCOL = "2024-11-05";
const SUPPORTED_PROTOCOLS = ["2024-11-05", "2025-03-26", "2025-06-18"];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const err = (id: JsonRpcResponse["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});
const ok = (id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, " ");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const CHECK_SCHEMA = {
  type: "object",
  properties: {
    example: { type: "string", enum: [...EXAMPLE_IDS], description: "A bundled example. Do not combine with hex, pins or rules." },
    fixed: { type: "boolean", description: "With example: check the fixed build instead of the buggy one." },
    hex: { type: "string", description: "Path to a precompiled .hex file." },
    pins: { type: "string", description: "Path to a pin fixture .json file." },
    rules: { type: "string", description: "Path to a rules .txt file, one rule sentence per line." },
    gremlins: { type: "string", description: "Comma-separated gremlin ids. See capabilities." },
    runs: { type: "integer", description: "Number of emulated runs." },
    seed: { type: "integer", description: "Campaign seed." },
    runMs: { type: "integer", description: "Length of each run in simulated milliseconds." },
  },
  additionalProperties: false,
};

const TOOLS = [
  {
    name: "check",
    description:
      "Run the gremlin check on a precompiled ATmega328P program. Give either example (with optional fixed) or all three of hex, pins and rules. Returns the Result_Object as JSON text.",
    inputSchema: CHECK_SCHEMA,
  },
  {
    name: "capabilities",
    description: "List the five rule sentence forms, the gremlin ids, and the peripherals the emulator does not model. Call this before check.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const STRING_KEYS = ["example", "hex", "pins", "rules", "gremlins"] as const;
const NUMBER_KEYS = ["runs", "seed", "runMs"] as const;
const ALL_KEYS: readonly string[] = [...STRING_KEYS, ...NUMBER_KEYS, "fixed"];

/** Check the shape of `check` arguments. Values are judged further by the loader. */
export function parseCheckArgs(raw: unknown): { ok: true; args: CheckArgs } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, args: {} };
  if (!isObject(raw)) return { ok: false, reason: "check arguments must be an object." };
  for (const k of Object.keys(raw)) if (!ALL_KEYS.includes(k)) return { ok: false, reason: `check has no argument "${k}".` };
  const args: CheckArgs = {};
  for (const k of STRING_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, reason: `check argument "${k}" must be a string.` };
    args[k] = v;
  }
  for (const k of NUMBER_KEYS) {
    const v = raw[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v)) return { ok: false, reason: `check argument "${k}" must be an integer.` };
    args[k] = v;
  }
  if (raw.fixed !== undefined) {
    if (typeof raw.fixed !== "boolean") return { ok: false, reason: 'check argument "fixed" must be true or false.' };
    args.fixed = raw.fixed;
  }
  return { ok: true, args };
}

const SAMPLE_FIXTURE: Fixture = {
  pins: [
    { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
    { signal: "LED", port: "B", bit: 5, direction: "output" },
  ],
};

function capabilitiesText(): string {
  const body = {
    ruleForms: sentencePatterns(SAMPLE_FIXTURE).map((p) => ({ form: p.form, example: p.sentence })),
    gremlins: GREMLIN_CATALOGUE.map((g) => g.id),
    unmodelledPeripherals: UNMODELLED_PERIPHERALS.map((r) => ({ id: r.id, name: r.plainName })),
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

const toolVersionOf = (env: LoaderEnv): string => {
  const pkg: unknown = JSON.parse(env.readText(path.join(env.repoDir, "package.json")));
  const v = (pkg as { version?: unknown }).version;
  if (typeof v !== "string") throw new Error("package.json has no version string.");
  return v;
};

function callTool(id: JsonRpcResponse["id"], params: unknown, deps: ServerDeps): JsonRpcResponse {
  if (!isObject(params) || typeof params.name !== "string") return err(id, INVALID_PARAMS, "tools/call needs a tool name.");
  if (params.name === "capabilities") {
    return ok(id, { content: [{ type: "text", text: capabilitiesText() }], isError: false });
  }
  if (params.name !== "check") return err(id, INVALID_PARAMS, `Unknown tool "${oneLine(params.name)}".`);
  const parsed = parseCheckArgs(params.arguments);
  if (!parsed.ok) return err(id, INVALID_PARAMS, parsed.reason);
  const loaded = (deps.load ?? loadInput)(parsed.args, deps.env);
  if (!loaded.ok) return err(id, INVALID_PARAMS, oneLine(loaded.reason));
  const outcome = (deps.run ?? runCheck)(loaded.input);
  if (!outcome.ok) {
    const text = `The ${outcome.job} job failed: ${oneLine(outcome.error.message)}`;
    return ok(id, { content: [{ type: "text", text }], isError: true });
  }
  return ok(id, { content: [{ type: "text", text: toJson(loaded.input, outcome, toolVersionOf(deps.env)) }], isError: false });
}

/** One parsed JSON-RPC message in, one response out. Notifications give null. Never throws. */
export function handleMessage(msg: unknown, deps: ServerDeps): JsonRpcResponse | null {
  if (!isObject(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return err(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 request.");
  }
  const hasId = "id" in msg;
  const rawId = msg.id;
  if (hasId && typeof rawId !== "string" && typeof rawId !== "number") {
    return err(null, INVALID_REQUEST, "The request id must be a string or a number.");
  }
  const id = hasId ? (rawId as string | number) : null;
  try {
    if (!hasId) return null; // notification such as notifications/initialized
    switch (msg.method) {
      case "initialize": {
        const asked = isObject(msg.params) ? msg.params.protocolVersion : undefined;
        const version = typeof asked === "string" && SUPPORTED_PROTOCOLS.includes(asked) ? asked : SERVER_PROTOCOL;
        return ok(id, {
          protocolVersion: version,
          capabilities: { tools: {} },
          serverInfo: { name: "hexorcist", version: toolVersionOf(deps.env) },
        });
      }
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call":
        return callTool(id, msg.params, deps);
      default:
        return err(id, METHOD_NOT_FOUND, `Unknown method "${oneLine(msg.method)}".`);
    }
  } catch (e) {
    return err(id, INVALID_PARAMS, oneLine(e instanceof Error ? e.message : String(e)));
  }
}

/** One input line in, one response out (null for a blank line or a notification). */
export function handleLine(line: string, deps: ServerDeps): JsonRpcResponse | null {
  if (line.trim() === "") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return err(null, PARSE_ERROR, "The request is not valid JSON.");
  }
  return handleMessage(msg, deps);
}
