// Feature: headless-runner. The two hook commands (Requirement 7, Property 6), on the conveyor test
// device: tests/cli/conveyor/{buggy,fixed}.c built with avr-gcc into the committed .hex files
// (buggy reads STOP once per 200 ms, fixed every 1 ms). The engine runs are real. Evidence, not proof.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import type { HookState } from "../../cli/hook-common";
import { readState, sha256, STATE_PATH } from "../../cli/hook-common";
import { decide, guardMain, isTaskDone } from "../../cli/hook-guard";
import { defaultDeps, stopMain } from "../../cli/hook-stop";
import { REPO_ROOT } from "../../cli/node-io";

const T = 600_000;
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A throwaway repo root holding the conveyor device, with the buggy HEX as the program. */
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "hexorcist-hooks-"));
  dirs.push(root);
  mkdirSync(join(root, "demo"));
  copyFileSync(resolve(REPO_ROOT, "exorcism-demo/pins.json"), join(root, "demo/pins.json"));
  copyFileSync(resolve(REPO_ROOT, "exorcism-demo/rules.txt"), join(root, "demo/rules.txt"));
  copyFileSync(resolve(REPO_ROOT, "tests/cli/conveyor/buggy.hex"), join(root, "demo/program.hex"));
  writeFileSync(
    join(root, "demo/check.json"),
    JSON.stringify({ hex: "demo/program.hex", pins: "demo/pins.json", rules: "demo/rules.txt", gremlins: "masher", runs: 24, seed: 20261101, runMs: 1000 }),
  );
  return root;
}

function stop(root: string, args: string[]) {
  let out = "";
  let err = "";
  const code = stopMain(["demo/check.json", ...args], { out: (t) => (out += t), err: (t) => (err += t) }, defaultDeps(root));
  return { code, out, err };
}

// The real payload Kiro sent when marking a spec task done (logged Nov 24, 2026; paths shortened).
const DONE_PAYLOAD = {
  session_id: "sess_9b1f9dd4",
  hook_event_name: "PreToolUse",
  cwd: "c:\\w",
  tool_name: "task_update",
  tool_input: { tasksFilePath: "c:\\w\\.kiro\\specs\\exorcism-fix\\tasks.md", taskId: "1. Fix the sketch", status: "completed", error: null },
};

describe("Agent Stop hook", () => {
  it("BROKE blocks (exit 2) and writes the state; no change blocks again; the cap stops blocking; HELD resets", { timeout: T }, () => {
    const root = sandbox();
    const first = stop(root, ["--block", "--max-blocks", "2"]);
    expect(first.code).toBe(2);
    expect(first.out.split("\n")[0]).toBe("Hexorcist: BROKE. Within 50 ms after STOP is 0 becomes true, MOTOR is 0 must be true.");
    expect(first.err).toBe(first.out);
    const s = readState(root) as HookState;
    expect(s.verdict).toBe("BROKE");
    expect(s.exitCode).toBe(1);
    expect(s.programSha256).toBe(sha256(readFileSync(join(root, "demo/program.hex"))));
    expect(s.fingerprint).toMatch(/^[0-9a-f]{16}$/);

    const again = stop(root, ["--block", "--max-blocks", "2"]);
    expect(again.code).toBe(2);
    expect(again.out).toContain("has not changed since the last check (BROKE)");
    const capped = stop(root, ["--block", "--max-blocks", "2"]);
    expect(capped.code).toBe(0);
    expect(capped.out).toContain("stopped blocking after 2 tries");

    copyFileSync(resolve(REPO_ROOT, "tests/cli/conveyor/fixed.hex"), join(root, "demo/program.hex"));
    const fixed = stop(root, ["--block", "--max-blocks", "2"]);
    expect(fixed.code).toBe(0);
    expect(fixed.out).toBe("Hexorcist: HELD. No violation found in 24 emulated runs of this gremlin set. Not a proof.\n");
    expect((readState(root) as HookState).verdict).toBe("HELD");
    expect(JSON.parse(readFileSync(join(root, ".hexorcist/stop-blocks.json"), "utf8"))).toEqual({ blocks: 0 });

    // The guard now allows marking the task done, and blocks again once the program changes.
    let err = "";
    expect(guardMain(JSON.stringify(DONE_PAYLOAD), ["demo/check.json"], root, { err: (t) => (err += t) })).toBe(0);
    copyFileSync(resolve(REPO_ROOT, "tests/cli/conveyor/buggy.hex"), join(root, "demo/program.hex"));
    expect(guardMain(JSON.stringify(DONE_PAYLOAD), ["demo/check.json"], root, { err: (t) => (err += t) })).toBe(2);
    expect(err).toContain("changed since the last check");
    expect(existsSync(join(root, ".hexorcist/last-pretooluse.json"))).toBe(true);
  });

  it("without --block it reports and exits 0; a missing config or program runs no check", { timeout: T }, () => {
    const root = sandbox();
    const r = stop(root, []);
    expect(r.code).toBe(0);
    expect(r.out.startsWith("Hexorcist: BROKE.")).toBe(true);
    expect(r.err).toBe("");
    let out = "";
    expect(stopMain(["nope.json", "--block"], { out: (t) => (out += t), err: () => undefined }, defaultDeps(root))).toBe(0);
    expect(out).toBe("Hexorcist: no check ran: nope.json is missing.\n");
    rmSync(join(root, "demo/program.hex"));
    rmSync(join(root, STATE_PATH));
    out = "";
    expect(stopMain(["demo/check.json", "--block"], { out: (t) => (out += t), err: () => undefined }, defaultDeps(root))).toBe(0);
    expect(out).toBe("Hexorcist: no check ran: demo/program.hex is missing.\n");
    for (const w of ["BROKE", "HELD", "COULDN'T TELL"]) expect(out).not.toContain(w);
  });

  it("a failed build runs no check and, with --block, blocks with the compiler output", () => {
    const root = sandbox();
    writeFileSync(join(root, "demo/sketch.c"), "int main(void) { return 0 }\n");
    const cfg = JSON.parse(readFileSync(join(root, "demo/check.json"), "utf8")) as Record<string, unknown>;
    writeFileSync(join(root, "demo/check.json"), JSON.stringify({ ...cfg, source: "demo/sketch.c", build: ["make"] }));
    let out = "";
    const deps = { ...defaultDeps(root), build: () => ({ ok: false, output: "sketch.c:1: error: expected ';'" }) };
    expect(stopMain(["demo/check.json", "--block"], { out: (t) => (out += t), err: () => undefined }, deps)).toBe(2);
    expect(out).toBe("Hexorcist: no check ran: the build failed.\nsketch.c:1: error: expected ';'\n");
  });
});

describe("Pre Tool Use guard", () => {
  it("isTaskDone: status-like fields set to completed or done", () => {
    expect(isTaskDone(DONE_PAYLOAD)).toBe(true);
    expect(isTaskDone({ tool_name: "x", tool_input: { task: { state: "Done" } } })).toBe(true);
    expect(isTaskDone({ tool_name: "x", tool_input: { status: "in_progress" } })).toBe(false);
    expect(isTaskDone({ tool_name: "task_update", tool_input: { taskId: "1", status: "in_progress" } })).toBe(false);
    expect(isTaskDone({ tool_name: "task_update", tool_input: { taskId: "1", status: "not_started" } })).toBe(false);
    expect(isTaskDone({ tool_name: "fsWrite", tool_input: { path: "a.md", text: "status: completed" } })).toBe(false);
    expect(isTaskDone(null)).toBe(false);
  });

  it("Feature: headless-runner, Property 6: The Pre Tool Use guard allows only a current HELD", () => {
    const hash = fc.stringMatching(/^[0-9a-f]{8}$/);
    const state = fc.option(
      fc.record({
        verdict: fc.constantFrom("BROKE" as const, "HELD" as const, "COULDN'T TELL" as const),
        exitCode: fc.constantFrom(0 as const, 1 as const, 2 as const),
        programSha256: hash,
        fingerprint: fc.option(hash, { nil: null }),
      }),
      { nil: null },
    );
    fc.assert(
      fc.property(state, fc.option(hash, { nil: null }), fc.boolean(), fc.boolean(), (s, current, done, sameHash) => {
        const cur = sameHash && s !== null ? s.programSha256 : current;
        const payload = { tool_name: "t", tool_input: done ? { status: "completed" } : { status: "in_progress" } };
        const d = decide(payload, s, cur);
        const want = !done || (s !== null && cur !== null && s.programSha256 === cur && s.verdict === "HELD");
        expect(d.allow).toBe(want);
      }),
      { numRuns: 200, seed: 20261123 },
    );
  });

  it("a malformed state file counts as no verdict recorded", () => {
    const root = sandbox();
    mkdirSync(join(root, ".hexorcist"), { recursive: true });
    writeFileSync(join(root, STATE_PATH), "{ not json");
    let err = "";
    expect(guardMain(JSON.stringify(DONE_PAYLOAD), ["demo/check.json"], root, { err: (t) => (err += t) })).toBe(2);
    expect(err).toContain("no check has run");
    expect(guardMain(JSON.stringify({ tool_name: "fsWrite", tool_input: { path: "x" } }), ["demo/check.json"], root, { err: () => undefined })).toBe(0);
  });
});
