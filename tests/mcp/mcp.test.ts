// Feature: headless-runner. MCP server tests (Requirement 6, Property 3, acceptance 9.7) and the
// Action's summary and file shape (Requirement 5). Evidence, not proof.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckArgs, CheckInput } from "../../cli/input-loader";
import { loadInput } from "../../cli/input-loader";
import { main } from "../../cli/main";
import { nodeReader, REPO_ROOT } from "../../cli/node-io";
import type { CheckOutcome, ResultObject } from "../../cli/run-check";
import { stepSummary } from "../../cli/step-summary";
import { capabilitiesText, handleLine, handleMessage, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR } from "../../mcp/server";
import type { Response } from "../../mcp/server";

const reader = nodeReader(REPO_ROOT);
const VERSION = "0.0.0";
const deps = { reader, toolVersion: VERSION };

const result = (r: Response | null): Record<string, unknown> => {
  if (r === null || !("result" in r)) throw new Error(`expected a result, got ${JSON.stringify(r)}`);
  return r.result as Record<string, unknown>;
};
const errorCode = (r: Response | null): number => {
  if (r === null || !("error" in r)) throw new Error(`expected an error, got ${JSON.stringify(r)}`);
  return r.error.code;
};
const call = (name: string, args?: unknown, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("MCP server", () => {
  it("initialize, tools/list (exactly check and capabilities) and notifications", () => {
    const init = result(handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, deps));
    expect(init.protocolVersion).toBe("2025-06-18");
    expect(init.serverInfo).toEqual({ name: "hexorcist", version: VERSION });
    expect(handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
    const tools = result(handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps)).tools as { name: string; description: string; inputSchema: unknown }[];
    expect(tools.map((t) => t.name)).toEqual(["check", "capabilities"]);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeTypeOf("object");
    }
  });

  it("capabilities: 5 sentence forms, the gremlin ids and the unmodelled peripherals", () => {
    const r = result(handleMessage(call("capabilities"), deps));
    const text = (r.content as { text: string }[])[0]?.text ?? "";
    expect(text).toBe(capabilitiesText());
    const body = JSON.parse(text) as { ruleForms: unknown[]; gremlins: { id: string }[]; unmodelledPeripherals: { id: string }[] };
    expect(body.ruleForms).toHaveLength(5);
    expect(body.gremlins.map((g) => g.id)).toEqual(["masher", "bouncer", "stuck", "dropout", "spike", "drifter"]);
    expect(body.unmodelledPeripherals.map((p) => p.id)).toContain("USART0");
  });

  it("errors: -32700, -32600, -32601, -32602, and the server keeps answering", () => {
    expect(errorCode(handleLine("{not json", deps))).toBe(PARSE_ERROR);
    expect(errorCode(handleLine("[1,2]", deps))).toBe(INVALID_REQUEST);
    expect(errorCode(handleMessage({ jsonrpc: "1.0", id: 1, method: "x" }, deps))).toBe(INVALID_REQUEST);
    expect(errorCode(handleMessage({ jsonrpc: "2.0", id: 1, method: "nope" }, deps))).toBe(METHOD_NOT_FOUND);
    expect(errorCode(handleMessage(call("nope"), deps))).toBe(INVALID_PARAMS);
    expect(errorCode(handleMessage(call("check", { example: "crosswalk", hex: "x" }), deps))).toBe(INVALID_PARAMS);
    expect(errorCode(handleMessage(call("check", { example: "crosswalk", bogus: 1 }), deps))).toBe(INVALID_PARAMS);
    expect(errorCode(handleMessage(call("check", { example: "crosswalk", runs: 1.5 }), deps))).toBe(INVALID_PARAMS);
    expect(result(handleMessage({ jsonrpc: "2.0", id: 9, method: "ping" }, deps))).toEqual({});
  });

  it("a job error is a tool result with isError true, not a crash", () => {
    const r = result(
      handleMessage(call("check", { example: "crosswalk" }), {
        ...deps,
        check: () => ({ ok: false, job: "reduction", error: { kind: "x", message: "boom" } }),
      }),
    );
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]?.text).toContain("reduction");
  });

  it("Feature: headless-runner, Property 3: CLI and MCP agree", () => {
    const outcome = fc.oneof(
      fc.record({ verdict: fc.constant("HELD" as const), n: fc.integer({ min: 1, max: 1000 }), text: fc.string() }),
      fc.record({ verdict: fc.constant("COULDN'T TELL" as const), reason: fc.string(), reasonTruncated: fc.boolean(), peripherals: fc.array(fc.constantFrom("USART0", "SPI"), { maxLength: 2 }) }),
    );
    const argsArb = fc.record(
      {
        example: fc.constantFrom("crosswalk", "garage", "heartbeat"),
        fixed: fc.boolean(),
        runs: fc.integer({ min: 1, max: 1000 }),
        seed: fc.integer({ min: 0, max: 4294967295 }),
      },
      { requiredKeys: ["example"] },
    );
    fc.assert(
      fc.property(argsArb, outcome, (a, o) => {
        const stub = (input: CheckInput): CheckOutcome => ({
          ok: true,
          result: { toolVersion: VERSION, seed: input.campaignSeed, runs: input.runs, gremlins: input.gremlinSet.map((g) => g.id), rules: input.ruleSentences, ...o } as ResultObject,
        });
        const argv = ["--example", a.example, "--json"];
        if (a.fixed === true) argv.push("--fixed");
        if (a.runs !== undefined) argv.push("--runs", String(a.runs));
        if (a.seed !== undefined) argv.push("--seed", String(a.seed));
        let stdout = "";
        const code = main(argv, { out: (t) => (stdout += t), err: () => undefined, reader, toolVersion: VERSION }, { load: (x, r) => loadVia(x, r), check: stub });
        expect(code).toBeLessThan(3);
        const r = result(handleMessage(call("check", a), { ...deps, check: stub }));
        expect((r.content as { text: string }[])[0]?.text).toBe(stdout);
        expect(r.isError).toBe(false);
      }),
      { numRuns: 100, seed: 20261123 },
    );
  });

  it("9.7 a scripted stdio session returns the same JSON as the CLI", { timeout: 600_000 }, async () => {
    let cli = "";
    expect(main(["--example", "crosswalk", "--json"], { out: (t) => (cli += t), err: () => undefined, reader, toolVersion: version() })).toBe(1);
    const lines = await session([
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      call("check", { example: "crosswalk" }, 3),
    ]);
    expect(lines).toHaveLength(3);
    const byId = new Map(lines.map((l) => [l.id, l]));
    expect((byId.get(2)?.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["check", "capabilities"]);
    const r = byId.get(3)?.result as { content: { text: string }[]; isError: boolean };
    expect(r.isError).toBe(false);
    expect(r.content[0]?.text).toBe(cli);
  });
});

describe("GitHub Action", () => {
  it("action.yml: composite hexorcist-gate with hex, pins, rules required and gremlins, runs, seed optional", () => {
    const y = readFileSync(resolve(REPO_ROOT, "action.yml"), "utf8");
    expect(y).toMatch(/^name: hexorcist-gate$/m);
    expect(y).toMatch(/using: composite/);
    for (const k of ["hex", "pins", "rules"]) expect(y).toMatch(new RegExp(`\\n  ${k}:\\n(?:    .*\\n)*?    required: true`));
    for (const k of ["gremlins", "runs", "seed"]) expect(y).toMatch(new RegExp(`\\n  ${k}:\\n(?:    .*\\n)*?    required: false`));
  });

  it("step summary: verdict, exit code, seed and tries; no verdict on an error", () => {
    const held = stepSummary(JSON.stringify({ verdict: "HELD", seed: 7, runs: 24, gremlins: ["masher"], text: "No violation found in 24 emulated runs of this gremlin set. Not a proof." }), 0, "");
    expect(held).toContain("**HELD**");
    expect(held).toContain("| Exit code | 0 |");
    expect(held).toContain("| Seed | 7 |");
    expect(held).toContain("| Tries | 24 |");
    expect(held).toContain("Not a proof.");
    const broke = stepSummary(JSON.stringify({ verdict: "BROKE", seed: 1, runs: 24, gremlins: ["masher"], try: 4, movesBefore: 8, movesAfter: 3, fingerprint: "ab", violation: { rule: "r" } }), 1, "");
    expect(broke).toContain("**BROKE**");
    expect(broke).toContain("| Try | 4 of 24 |");
    const failed = stepSummary("", 3, "Unknown gremlin \"zz\".");
    expect(failed).toContain("No verdict (exit code 3).");
    for (const w of ["BROKE", "HELD", "COULDN'T TELL"]) expect(failed).not.toContain(`**${w}`);
  });
});

function loadVia(a: CheckArgs, r: typeof reader) {
  return loadInput(a, r);
}

function version(): string {
  return (JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;
}

/** Spawns `tsx mcp/bin.ts`, writes the messages, and collects one response per request id. */
function session(messages: unknown[]): Promise<{ id: unknown; result?: unknown; error?: unknown }[]> {
  const want = messages.filter((m) => typeof m === "object" && m !== null && "id" in m).length;
  return new Promise((done, failed) => {
    const tsx = resolve(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [tsx, "mcp/bin.ts"], { cwd: REPO_ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    const got: { id: unknown }[] = [];
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim() !== "") got.push(JSON.parse(line) as { id: unknown });
        if (got.length === want) {
          child.kill();
          done(got);
        }
      }
    });
    child.on("error", failed);
    child.on("exit", (code) => {
      if (got.length < want) failed(new Error(`server exited (${String(code)}) after ${got.length} of ${want} responses`));
    });
    for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
  });
}
