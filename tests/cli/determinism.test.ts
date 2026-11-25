// Feature: headless-runner, task 3.2. Determinism of `main --json` and agreement with the page path.
// Passing runs are evidence, not proof.
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

/** The page's path: the same three host jobs the worker calls, fed from the bundled example. */
function pagePath(id: ExampleId): { fingerprint: string; from: number; to: number; tryNo: number } {
  const l = loadExample(id);
  if (!l.ok) throw new Error(`${id}: example did not load`);
  const ex = l.example;
  const c = runCampaignJob({
    hex: ex.buggyHex,
    fixture: ex.fixture,
    ruleSet: ex.ruleSet,
    gremlinSet: ex.meta.gremlinSet,
    campaignSeed: ex.meta.campaignSeed,
    runs: ex.meta.runs,
    runCycles: ex.meta.runCycles,
  });
  if (!c.ok) throw new Error(`${id}: campaign ${c.error.message}`);
  const v = c.result.verdict;
  if (v.verdict !== "BROKE") throw new Error(`${id}: expected BROKE, actual ${v.verdict}`);
  const red = runReductionJob({
    hex: ex.buggyHex,
    fixture: ex.fixture,
    ruleSet: ex.ruleSet,
    originalList: v.trace.eventList,
    violation: v.trace.violation,
    runCycles: ex.meta.runCycles,
  });
  if (!red.ok) throw new Error(`${id}: reduction ${red.error.message}`);
  const rep = runReplayJob({
    hex: ex.buggyHex,
    fixture: ex.fixture,
    ruleSet: ex.ruleSet,
    events: red.result.reducedList,
    runCycles: ex.meta.runCycles,
  });
  if (!rep.ok) throw new Error(`${id}: replay ${rep.error.message}`);
  return {
    fingerprint: rep.fingerprint,
    from: red.result.originalEventCount,
    to: red.result.reducedEventCount,
    tryNo: v.trace.runIndex + 1,
  };
}

describe.each(EXAMPLE_IDS)("CLI determinism for %s", (id) => {
  it("two --json runs are byte-identical and match the page path", { timeout: T }, () => {
    const a = cli(["--example", id, "--json"]);
    const b = cli(["--example", id, "--json"]);
    expect(a.err, `${id}: stderr`).toBe("");
    expect(a.code, `${id}: exit code`).toBe(1);
    expect(b.code).toBe(a.code);
    expect(b.out, `${id}: second run differs from first`).toBe(a.out);

    const obj = JSON.parse(a.out) as Record<string, unknown>;
    const page = pagePath(id);
    expect(obj.fingerprint, `${id}: CLI fingerprint vs page path`).toBe(page.fingerprint);
    expect(obj.movesBefore, `${id}: movesBefore`).toBe(page.from);
    expect(obj.movesAfter, `${id}: movesAfter`).toBe(page.to);
    expect(obj.try, `${id}: try`).toBe(page.tryNo);
  });

  it("output holds no timestamp, absolute path, host name or duration", { timeout: T }, () => {
    const { out } = cli(["--example", id, "--json"]);
    expect(out.includes(repoDir), "repo path").toBe(false);
    expect(out.includes(repoDir.replace(/\\/g, "/")), "repo path (slashes)").toBe(false);
    expect(out.includes(os.homedir()), "home path").toBe(false);
    expect(out.includes(os.hostname()), "host name").toBe(false);
    expect(/[A-Za-z]:[\\/]/.test(out), "drive path").toBe(false);
    expect(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(out), "ISO timestamp").toBe(false);
    const keys = Object.keys(JSON.parse(out) as object);
    expect(keys.filter((k) => /time|date|duration|elapsed|host/i.test(k)), "time-like keys").toEqual([]);
    expect(out.startsWith("\uFEFF"), "BOM").toBe(false);
    expect(out.includes("\r"), "CR").toBe(false);
    expect(out.endsWith("}\n") && !out.endsWith("\n\n"), "one trailing LF").toBe(true);
  });
});

describe("CLI determinism on a fixed build", () => {
  it("two --json runs of heartbeat --fixed are byte-identical", { timeout: T }, () => {
    const a = cli(["--example", "heartbeat", "--fixed", "--json"]);
    const b = cli(["--example", "heartbeat", "--fixed", "--json"]);
    expect(a.code).toBe(0);
    expect(b.out).toBe(a.out);
  });
});
