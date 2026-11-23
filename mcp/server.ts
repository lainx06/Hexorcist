// headless-runner: the MCP server's message handling (Requirement 6). Hand-written JSON-RPC 2.0,
// no npm package. Pure: handleMessage gets one parsed message and returns the response or null.
// It uses the CLI's Input_Loader and runCheck, never cli/main.ts, so the check text equals `--json`.
import { GREMLIN_CATALOGUE } from "../src/engine/gremlins/catalogue";
import { UNMODELLED_PERIPHERALS } from "../src/engine/peripherals";
import type { Fixture } from "../src/engine/types";
import { PICKER_TEXT } from "../src/ui/app/model/gremlin-picker";
import { sentencePatterns } from "../src/ui/app/model/rule-box";
import type { CheckArgs, CheckInput, LoadResult, TextReader } from "../cli/input-loader";
import { loadInput } from "../cli/input-loader";
import type { CheckOutcome } from "../cli/run-check";
import { runCheck, toJson } from "../cli/run-check";

export const SERVER_NAME = "hexorcist";
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface ServerDeps {
  reader: TextReader;
  toolVersion: string;
  load?: (args: CheckArgs, reader: TextReader) => LoadResult;
  check?: (input: CheckInput, toolVersion: string) => CheckOutcome;
}

type Id = string | number | null;
export type Response =
  | { jsonrpc: "2.0"; id: Id; result: unknown }
  | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string } };

const ok = (id: Id, result: unknown): Response => ({ jsonrpc: "2.0", id, result });
const err = (id: Id, code: number, message: string): Response => ({ jsonrpc: "2.0", id, error: { code, message } });

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

const str = { type: "string" } as const;

export const TOOLS = [
  {
    name: "check",
    description:
      "Runs a compiled ATmega328P program on the emulator, attacks its inputs with seeded scripted gremlins, and checks the rules. " +
      "Returns one JSON object with the verdict BROKE, HELD or COULDN'T TELL (the same object as `npm run check -- --json`). " +
      "HELD means no violation was found in the runs made; it is not a proof.",
    inputSchema: {
      type: "object",
      properties: {
        example: { type: "string", enum: ["crosswalk", "garage", "heartbeat"], description: "A bundled example (instead of hex, pins and rules)." },
        fixed: { type: "boolean", description: "With example: use the fixed build." },
        hex: { ...str, description: "Path to a plain .hex file." },
        pins: { ...str, description: "Path to a pin map JSON file (the page's Export pin map format)." },
        rules: { ...str, description: "Path to a text file with one rule sentence per line." },
        gremlins: { ...str, description: "Comma-separated gremlin ids." },
        runs: { type: ["integer", "string"], description: "Tries, 1 to 1000." },
        seed: { type: ["integer", "string"], description: "Seed, 0 to 4294967295." },
        runMs: { type: ["integer", "string"], description: "Device time per try in ms, 1 to 60000." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "capabilities",
    description: "Lists the 5 rule sentence forms, the gremlins, and the chip parts the emulator does not model (they give COULDN'T TELL).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

const ARG_KEYS = ["example", "fixed", "hex", "pins", "rules", "gremlins", "runs", "seed", "runMs"] as const;

/** MCP arguments to CheckArgs; numbers become the strings the page's field checks expect. */
export function toCheckArgs(raw: unknown): { ok: true; args: CheckArgs } | { ok: false; reason: string } {
  if (raw === undefined) return { ok: true, args: {} };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "arguments must be an object." };
  const rec = raw as Record<string, unknown>;
  const args: CheckArgs = {};
  for (const k of Object.keys(rec)) {
    if (!(ARG_KEYS as readonly string[]).includes(k)) return { ok: false, reason: `Unknown argument "${k}".` };
    const v = rec[k];
    if (k === "fixed") {
      if (typeof v !== "boolean") return { ok: false, reason: '"fixed" must be true or false.' };
      if (v) args.fixed = true;
    } else if (typeof v === "string") {
      (args as Record<string, string>)[k] = v;
    } else if (typeof v === "number" && (k === "runs" || k === "seed" || k === "runMs") && Number.isInteger(v)) {
      (args as Record<string, string>)[k] = String(v);
    } else {
      return { ok: false, reason: `"${k}" has the wrong type.` };
    }
  }
  return { ok: true, args };
}

export function capabilitiesText(): string {
  const example: Fixture = {
    pins: [
      { signal: "LED", port: "B", bit: 5, direction: "output" },
      { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
    ],
  };
  const body = {
    ruleForms: sentencePatterns(example),
    ruleFormsNote: "Examples use an output named LED and an input named BUTTON; use your own pin names.",
    gremlins: GREMLIN_CATALOGUE.map((g) => ({ id: g.id, name: PICKER_TEXT[g.id]?.name ?? g.id, does: PICKER_TEXT[g.id]?.behaviour ?? "" })),
    unmodelledPeripherals: UNMODELLED_PERIPHERALS.map((p) => ({ id: p.id, plainName: p.plainName })),
    verdicts: ["BROKE", "HELD", "COULDN'T TELL"],
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

const textResult = (text: string, isError: boolean) => ({ content: [{ type: "text", text }], isError });

export function handleMessage(msg: unknown, deps: ServerDeps): Response | null {
  if (typeof msg !== "object" || msg === null || Array.isArray(msg)) return err(null, INVALID_REQUEST, "The message is not a JSON-RPC request object.");
  const m = msg as Record<string, unknown>;
  const hasId = "id" in m;
  const id: Id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(id, INVALID_REQUEST, 'A request needs "jsonrpc": "2.0" and a string "method".');
  const method = m.method;
  // Notifications (no id) get no response.
  if (!hasId) return null;
  const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Record<string, unknown>;

  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      const protocolVersion = typeof asked === "string" && (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok(id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: deps.toolVersion } });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = params.name;
      if (name === "capabilities") return ok(id, textResult(capabilitiesText(), false));
      if (name !== "check") return err(id, INVALID_PARAMS, `Unknown tool "${String(name)}". Tools: check, capabilities.`);
      const a = toCheckArgs(params.arguments);
      if (!a.ok) return err(id, INVALID_PARAMS, a.reason);
      const loaded = (deps.load ?? loadInput)(a.args, deps.reader);
      if (!loaded.ok) return err(id, INVALID_PARAMS, loaded.reason);
      try {
        const out = (deps.check ?? runCheck)(loaded.input, deps.toolVersion);
        if (!out.ok) return ok(id, textResult(`The ${out.job} job failed (${out.error.kind}): ${out.error.message}`, true));
        return ok(id, textResult(toJson(out.result), false));
      } catch (e) {
        return ok(id, textResult(`Internal error: ${e instanceof Error ? e.message : String(e)}`, true));
      }
    }
    default:
      return err(id, METHOD_NOT_FOUND, `Unknown method "${method}".`);
  }
}

/** One line of the stdio transport: parse errors become -32700 with id null. */
export function handleLine(line: string, deps: ServerDeps): Response | null {
  if (line.trim() === "") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return err(null, PARSE_ERROR, "The line is not valid JSON.");
  }
  return handleMessage(msg, deps);
}
