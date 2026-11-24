// Feature: headless-runner, task 8 (Requirement 9). Final acceptance tests on the committed HEX files.
// Passing runs are evidence, not proof.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "../../cli/main";
import type { LoaderEnv } from "../../cli/input-loader";
import { EXAMPLE_IDS, loadExample } from "../../src/ui/app/data/examples";
import type { ExampleId } from "../../src/ui/app/data/examples";
import { runCampaignJob, runReductionJob, runReplayJob } from "../../src/ui/app/worker/host";

const T = 600_000;
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env: LoaderEnv = { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: repoDir, repoDir };

function cli(argv: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const code = main(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t), env });
  return { code, out, err };
}

const BUGGY: Record<ExampleId, { fingerprint: string; tryNo: number; of: number; from: number; to: number }> = {
  crosswalk: { fingerprint: "47078989121ebc1d", tryNo: 4, of: 24, from: 8, to: 3 },
  garage: { fingerprint: "616062947f71a1ae", tryNo: 8, of: 40, from: 7, to: 3 },
  heartbeat: { fingerprint: "19827a4e0a7ad440", tryNo: 2, of: 24, from: 2, to: 1 },
};
const HELD_N: Record<ExampleId, number> = { crosswalk: 24, garage: 40, heartbeat: 24 };

const heldText = (n: number): string =>
  `No violation found in ${n === 1 ? "1 emulated run" : `${n} emulated runs`} of this gremlin set. Not a proof.`;

describe("Requirement 9.1 to 9.3: buggy examples", () => {
  it.each(EXAMPLE_IDS)("%s buggy exits 1 with the pinned values", { timeout: T }, (id) => {
    const w = BUGGY[id];
    const r = cli(["--example", id, "--json"]);
    expect(r.err, `${id}: stderr`).toBe("");
    expect(r.code, `${id}: exit code`).toBe(1);
    const o = JSON.parse(r.out) as Record<string, unknown>;
    expect(o.verdict, `${id}: verdict`).toBe("BROKE");
    expect(o.fingerprint, `${id}: fingerprint`).toBe(w.fingerprint);
    expect(o.try, `${id}: try`).toBe(w.tryNo);
    expect(o.runs, `${id}: runs`).toBe(w.of);
    expect(o.movesBefore, `${id}: movesBefore`).toBe(w.from);
    expect(o.movesAfter, `${id}: movesAfter`).toBe(w.to);
  });
});

describe("Requirement 9.4: fixed builds", () => {
  it.each(EXAMPLE_IDS)("%s fixed exits 0 and prints the exact HELD_Text", { timeout: T }, (id) => {
    const r = cli(["--example", id, "--fixed"]);
    expect(r.err, `${id}: stderr`).toBe("");
    expect(r.code, `${id}: exit code`).toBe(0);
    expect(r.out, `${id}: summary`).toContain(heldText(HELD_N[id]));
  });
});

describe("Requirement 9.5: serial_hello", () => {
  it("exits 2 with a reason that names the serial port", { timeout: T }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-acc-"));
    try {
      const pins = path.join(dir, "pins.json");
      const rules = path.join(dir, "rules.txt");
      fs.writeFileSync(
        pins,
        JSON.stringify({
          pins: [
            { signal: "LED", port: "B", bit: 5, direction: "output" },
            { signal: "BUTTON", port: "D", bit: 2, direction: "input", activeLevel: "low" },
          ],
        }),
      );
      fs.writeFileSync(rules, "LED is 1 must never last 500 ms or longer.\n");
      const r = cli([
        "--hex", path.join(repoDir, "fixtures", "serial_hello", "build", "serial_hello.ino.hex"),
        "--pins", pins,
        "--rules", rules,
        "--gremlins", "masher",
        "--json",
      ]);
      expect(r.err, "stderr").toBe("");
      expect(r.code, `exit code; stdout: ${r.out}`).toBe(2);
      const o = JSON.parse(r.out) as { verdict: string; reason: string };
      expect(o.verdict).toBe("COULDN'T TELL");
      expect(o.reason.toLowerCase(), `reason: ${o.reason}`).toContain("serial port");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** The page's path: the same three host jobs the worker calls. */
function pageFingerprint(id: ExampleId): string {
  const l = loadExample(id);
  if (!l.ok) throw new Error(`${id}: example did not load`);
  const ex = l.example;
  const c = runCampaignJob({
    hex: ex.buggyHex, fixture: ex.fixture, ruleSet: ex.ruleSet, gremlinSet: ex.meta.gremlinSet,
    campaignSeed: ex.meta.campaignSeed, runs: ex.meta.runs, runCycles: ex.meta.runCycles,
  });
  if (!c.ok || c.result.verdict.verdict !== "BROKE") throw new Error(`${id}: page campaign not BROKE`);
  const v = c.result.verdict;
  const red = runReductionJob({
    hex: ex.buggyHex, fixture: ex.fixture, ruleSet: ex.ruleSet,
    originalList: v.trace.eventList, violation: v.trace.violation, runCycles: ex.meta.runCycles,
  });
  if (!red.ok) throw new Error(`${id}: page reduction failed`);
  const rep = runReplayJob({
    hex: ex.buggyHex, fixture: ex.fixture, ruleSet: ex.ruleSet,
    events: red.result.reducedList, runCycles: ex.meta.runCycles,
  });
  if (!rep.ok) throw new Error(`${id}: page replay failed`);
  return rep.fingerprint;
}

describe("Requirement 9.6: repeat runs and the page", () => {
  it.each(EXAMPLE_IDS)("%s: two runs print identical JSON and the fingerprint equals the page's", { timeout: T }, (id) => {
    const a = cli(["--example", id, "--json"]);
    const b = cli(["--example", id, "--json"]);
    expect(b.out, `${id}: second run differs`).toBe(a.out);
    expect((JSON.parse(a.out) as { fingerprint: string }).fingerprint, `${id}: vs page`).toBe(pageFingerprint(id));
  });
});

describe("Requirement 9.7: MCP stdio session", () => {
  it("initialize, tools/list, tools/call check returns the CLI's JSON", { timeout: T }, () => {
    const tsx = path.join(repoDir, "node_modules", "tsx", "dist", "cli.mjs");
    const lines = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "acceptance", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "check", arguments: { example: "heartbeat" } } },
    ].map((m) => JSON.stringify(m)).join("\n") + "\n";
    const p = spawnSync(process.execPath, [tsx, "--no-deprecation", "mcp/bin.ts"], {
      cwd: repoDir, input: lines, encoding: "utf8", timeout: T,
    });
    expect(p.status, `exit; stderr: ${p.stderr}`).toBe(0);
    const replies = p.stdout.split("\n").filter((l) => l !== "").map((l) => JSON.parse(l) as { id: number; result?: any; error?: unknown });
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(replies[0]?.result?.serverInfo?.name).toBe("hexorcist");
    expect((replies[1]?.result?.tools as Array<{ name: string }>).map((t) => t.name).sort()).toEqual(["capabilities", "check"]);
    const text = replies[2]?.result?.content?.[0]?.text as string;
    const viaCli = cli(["--example", "heartbeat", "--json"]);
    expect(text).toBe(viaCli.out);
  });
});
