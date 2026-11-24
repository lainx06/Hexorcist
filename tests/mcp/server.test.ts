import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckArgs, CheckInput, LoaderEnv, LoadResult } from "../../cli/input-loader";
import { main } from "../../cli/main";
import type { CheckOutcome } from "../../cli/run-check";
import { handleLine, handleMessage } from "../../mcp/server";
import type { JsonRpcResponse } from "../../mcp/server";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env: LoaderEnv = { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: repoDir, repoDir };

const stubInput = (a: CheckArgs): CheckInput =>
  ({ ruleSentences: [`rule ${a.hex ?? a.example ?? ""}`], gremlinSet: [{ id: "masher" }], campaignSeed: a.seed ?? 1, runs: a.runs ?? 3 }) as unknown as CheckInput;
const load = (a: CheckArgs): LoadResult => ({ ok: true, input: stubInput(a) });
const run = (input: CheckInput): CheckOutcome => {
  const verdict = { verdict: "HELD", text: `held ${input.runs}`, runs: input.runs } as const;
  return {
    ok: true,
    result: {
      verdict,
      campaign: { runsCompleted: input.runs, requestedRuns: input.runs, violatingRunIndex: null, verdict, coverage: {} as never, totalCycles: 0 },
    },
  };
};
const deps = { env, load, run };

const call = (name: string, args?: unknown, d = deps): JsonRpcResponse =>
  handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, d) as JsonRpcResponse;

describe("mcp server", () => {
  it("Property 3: CLI and MCP agree. check text equals main --json stdout", () => {
    // Feature: headless-runner, Property 3: CLI and MCP agree
    const hexName = fc.stringMatching(/^[a-z]{1,8}$/);
    fc.assert(
      fc.property(hexName, fc.integer({ min: 1, max: 99 }), fc.integer({ min: 0, max: 99999 }), (hex, runs, seed) => {
        let out = "";
        const code = main(["--hex", hex, "--pins", "p", "--rules", "r", "--runs", String(runs), "--seed", String(seed), "--json"], {
          stdout: (t) => void (out += t),
          stderr: () => undefined,
          env,
          load,
          run,
        });
        expect(code).toBe(0);
        const res = call("check", { hex, pins: "p", rules: "r", runs, seed });
        const text = (res.result as { content: { text: string }[] }).content[0]?.text;
        expect(text).toBe(out);
      }),
      { numRuns: 100 },
    );
  });

  it("tools/list returns exactly check and capabilities with descriptions and schemas", () => {
    const res = handleMessage({ jsonrpc: "2.0", id: 7, method: "tools/list" }, deps) as JsonRpcResponse;
    const tools = (res.result as { tools: { name: string; description: string; inputSchema: object }[] }).tools;
    expect(tools.map((t) => t.name)).toStrictEqual(["check", "capabilities"]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeTypeOf("object");
    }
  });

  it("initialize answers with server info and tools capability; notifications get no reply", () => {
    const res = handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, deps) as JsonRpcResponse;
    expect(res.result).toMatchObject({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "hexorcist" } });
    expect(handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
  });

  it("capabilities lists 5 forms, gremlin ids and unmodelled peripherals", () => {
    const res = call("capabilities");
    const body = JSON.parse((res.result as { content: { text: string }[] }).content[0]?.text ?? "");
    expect(body.ruleForms).toHaveLength(5);
    expect(body.gremlins).toContain("masher");
    expect(body.unmodelledPeripherals.map((p: { id: string }) => p.id)).toContain("USART0");
  });

  it("returns the right error code for each kind of bad request", () => {
    expect(handleLine("{not json", deps)?.error?.code).toBe(-32700);
    expect(handleMessage([1], deps)?.error?.code).toBe(-32600);
    expect(handleMessage({ jsonrpc: "2.0", id: 1 }, deps)?.error?.code).toBe(-32600);
    expect(handleMessage({ jsonrpc: "2.0", id: 1, method: "nope" }, deps)?.error?.code).toBe(-32601);
    expect(call("nope").error?.code).toBe(-32602);
    expect(call("check", { runs: "x" }).error?.code).toBe(-32602);
    expect(call("check", { bogus: 1 }).error?.code).toBe(-32602);
    const failing = { env, load: () => ({ ok: false, reason: "no such file" }) as LoadResult, run };
    expect(call("check", {}, failing).error?.message).toContain("no such file");
  });

  it("a job error returns isError true naming the job", () => {
    const failing = { env, load, run: (): CheckOutcome => ({ ok: false, job: "replay", error: { kind: "internal-error", message: "boom" } }) };
    const res = call("check", { example: "heartbeat" }, failing);
    const r = res.result as { isError: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("replay");
  });

  it("keeps answering after a bad request", () => {
    expect(handleLine("garbage", deps)?.error).toBeDefined();
    const res = handleLine(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }), deps);
    expect(res?.result).toStrictEqual({});
  });
});
