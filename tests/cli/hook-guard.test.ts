import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyPayload, decideGuard, run } from "../../cli/hook-guard";
import { hexSha256, serializeRecord } from "../../cli/verdict-record";
import type { VerdictRecord } from "../../cli/verdict-record";

const REAL_REPO = path.resolve(__dirname, "..", "..");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("classifyPayload", () => {
  // Feature: headless-runner, Property 9: Guard payload classification
  // **Validates: Requirements 7.10, 7.11**
  it("Property 9: task-done only for task_update with status completed or done", () => {
    const status = fc.oneof(fc.constantFrom("completed", "done", "queued", "in_progress", ""), fc.string(), fc.integer(), fc.constant(null));
    const toolName = fc.oneof(fc.constant("task_update"), fc.string());
    const toolInput = fc.oneof(
      status.map((s) => ({ status: s })),
      fc.constant(null),
      fc.string(),
      fc.array(fc.string()),
      fc.constant({}),
    );
    fc.assert(
      fc.property(toolName, toolInput, (tool_name, tool_input) => {
        const expected =
          tool_name === "task_update" &&
          typeof tool_input === "object" &&
          tool_input !== null &&
          !Array.isArray(tool_input) &&
          ((tool_input as { status?: unknown }).status === "completed" || (tool_input as { status?: unknown }).status === "done");
        expect(classifyPayload(JSON.stringify({ tool_name, tool_input }))).toBe(expected ? "task-done" : "other");
      }),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.string(), (s) => {
        let parsesToTaskDone = false;
        try {
          parsesToTaskDone = classifyPayload(s) === "task-done";
        } catch {
          parsesToTaskDone = true; // must never throw
        }
        if (!s.includes("task_update")) expect(parsesToTaskDone).toBe(false);
      }),
      { numRuns: 100 },
    );
    expect(classifyPayload("not json")).toBe("other");
    expect(classifyPayload("[1,2]")).toBe("other");
    expect(classifyPayload("null")).toBe("other");
  });
});

describe("decideGuard", () => {
  // Feature: headless-runner, Property 10: The guard allows a done task only on a current HELD
  // **Validates: Requirements 7.12, 7.13, 7.14**
  it("Property 10: exit 0 only for HELD with a matching hash", () => {
    const record = fc.oneof(
      fc.constant(null),
      fc.record({
        verdict: fc.constantFrom("BROKE" as const, "HELD" as const, "COULDN'T TELL" as const),
        exitCode: fc.constantFrom(0, 1, 2),
        hexSha256: fc.constantFrom(HASH_A, HASH_B),
        fingerprint: fc.oneof(fc.constant(null), fc.constant("19827a4e0a7ad440")),
      }),
    );
    const hash = fc.constantFrom<string | null>(HASH_A, HASH_B, null);
    fc.assert(
      fc.property(record, hash, (rec, h) => {
        const d = decideGuard(rec, h);
        const allowed = rec !== null && rec.verdict === "HELD" && h !== null && h === rec.hexSha256;
        if (allowed) {
          expect(d).toEqual({ exitCode: 0 });
        } else {
          expect(d.exitCode).toBe(2);
          const message = (d as { message: string }).message;
          if (rec === null) expect(message).toContain("no verdict is recorded");
          else if (rec.verdict !== "HELD") expect(message).toContain(rec.verdict);
          else expect(message).toContain("out of date");
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("hook-guard run", () => {
  let repo: string;
  let err: string[];
  const payload = (status: string) =>
    JSON.stringify({ tool_name: "task_update", tool_input: { tasksFilePath: "x/tasks.md", taskId: "1", status } });
  const go = (stdin: string) =>
    run(["loop.json"], {
      readStdin: () => stdin,
      stderr: (t) => void err.push(t),
      repoDir: repo,
      invocationDir: repo,
    });
  const writeRecord = (r: VerdictRecord) => {
    fs.mkdirSync(path.join(repo, ".hexorcist"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".hexorcist", "last-verdict.json"), serializeRecord(r));
  };
  const heldFor = (bytes: string): VerdictRecord => ({
    verdict: "HELD",
    exitCode: 0,
    hexSha256: hexSha256(Buffer.from(bytes)),
    fingerprint: null,
  });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "hex-guard-"));
    err = [];
    fs.writeFileSync(path.join(repo, "loop.json"), JSON.stringify({ hex: "build/s.hex" }));
    fs.mkdirSync(path.join(repo, "build"));
    fs.writeFileSync(path.join(repo, "build", "s.hex"), ":00000001FF\n");
  });
  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }));

  it("blocks a completed task_update when no record exists", () => {
    expect(go(payload("completed"))).toBe(2);
    expect(err.join("")).toContain("no verdict is recorded");
  });

  it("blocks when the HEX changed since the record", () => {
    writeRecord(heldFor("something else"));
    expect(go(payload("done"))).toBe(2);
    expect(err.join("")).toContain("out of date");
  });

  it("blocks on a recorded BROKE", () => {
    writeRecord({ ...heldFor(":00000001FF\n"), verdict: "BROKE", exitCode: 1 });
    expect(go(payload("completed"))).toBe(2);
    expect(err.join("")).toContain("BROKE");
  });

  it("treats an unreadable loop config as out of date", () => {
    writeRecord(heldFor(":00000001FF\n"));
    fs.writeFileSync(path.join(repo, "loop.json"), "{nope");
    expect(go(payload("completed"))).toBe(2);
    expect(err.join("")).toContain("out of date");
  });

  it("allows a current HELD", () => {
    writeRecord(heldFor(":00000001FF\n"));
    expect(go(payload("completed"))).toBe(0);
    expect(err).toEqual([]);
  });

  it("allows other calls and other statuses, and always writes last-pretooluse.json", () => {
    const file = path.join(repo, ".hexorcist", "last-pretooluse.json");
    for (const text of [payload("queued"), "not json", JSON.stringify({ tool_name: "fs_write", tool_input: {} })]) {
      expect(go(text)).toBe(0);
      expect(fs.readFileSync(file, "utf8")).toBe(text);
    }
    expect(go(payload("completed"))).toBe(2);
    expect(fs.readFileSync(file, "utf8")).toBe(payload("completed"));
  });

  it("module text has no clock, random, network or engine imports", () => {
    const src = fs.readFileSync(path.join(REAL_REPO, "cli", "hook-guard.ts"), "utf8");
    const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(code).not.toMatch(/Date\.now|new Date|performance\.now|setTimeout|setInterval|Math\.random/);
    expect(code).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/);
    expect(code).not.toMatch(/from "(node:)?(http|https|net|dgram|dns)"/);
    expect(code).not.toMatch(/from "\.\.\/src\/|from "\.\/(input-loader|run-check|main)"|avr8js/);
  });

  it("runs as a command: a payload on stdin gives exit 0 for another tool call", () => {
    const tsx = path.join(REAL_REPO, "node_modules", "tsx", "dist", "cli.mjs");
    const r = spawnSync(process.execPath, [tsx, "--no-deprecation", "cli/hook-guard.ts", "exorcism-demo/loop-check.json"], {
      cwd: REAL_REPO,
      input: JSON.stringify({ tool_name: "fs_write", tool_input: {} }),
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("DeprecationWarning");
  });
});
