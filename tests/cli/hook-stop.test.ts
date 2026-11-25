import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideStop, run } from "../../cli/hook-stop";
import type { BuildResult, StopIo } from "../../cli/hook-stop";
import { parseRecord } from "../../cli/verdict-record";

const REAL_REPO = path.resolve(__dirname, "..", "..");
const VERDICTS = ["BROKE", "HELD", "COULDN'T TELL"] as const;

describe("decideStop", () => {
  // Feature: headless-runner, Property 11: Stop decision and block counter
  // **Validates: Requirements 7.7, 7.8, 7.9**
  it("Property 11: decision table and repeated application", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        fc.boolean(),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        (verdict, block, count, max) => {
          const d = decideStop({ verdict, block, count, max });
          if (verdict === "HELD") {
            expect(d).toEqual({ exitCode: 0, nextCount: 0, limitReached: false });
          } else if (!block) {
            expect(d).toEqual({ exitCode: 0, nextCount: count, limitReached: false });
          } else if (count < max) {
            expect(d).toEqual({ exitCode: 2, nextCount: count + 1, limitReached: false });
          } else {
            expect(d).toEqual({ exitCode: 0, nextCount: count, limitReached: true });
          }
        },
      ),
      { numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.constantFrom("BROKE" as const, "COULDN'T TELL" as const), fc.integer({ min: 0, max: 10 }), (verdict, max) => {
        let count = 0;
        let blocks = 0;
        for (let i = 0; i < max + 3; i++) {
          const d = decideStop({ verdict, block: true, count, max });
          if (d.exitCode === 2) blocks++;
          else expect(d.limitReached).toBe(true);
          count = d.nextCount;
        }
        expect(blocks).toBe(max);
      }),
      { numRuns: 100 },
    );
  });
});

describe("hook-stop run", () => {
  let repo: string;
  let out: string[];
  let err: string[];
  let buildResult: BuildResult;
  let buildCalls: Array<{ command: string; args: string[]; cwd: string }>;

  const copy = (rel: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.copyFileSync(path.join(REAL_REPO, rel), path.join(repo, rel));
  };
  const io = (): StopIo => ({
    stdout: (t) => void out.push(t),
    stderr: (t) => void err.push(t),
    env: { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: repo, repoDir: repo },
    build: (command, args, cwd) => {
      buildCalls.push({ command, args, cwd });
      return buildResult;
    },
  });
  const useHex = (variant: "buggy" | "fixed") => {
    fs.mkdirSync(path.join(repo, "exorcism-demo", "build"), { recursive: true });
    fs.copyFileSync(
      path.join(REAL_REPO, "examples", "crosswalk", variant, `${variant}.hex`),
      path.join(repo, "exorcism-demo", "build", "sketch.hex"),
    );
  };
  const recordFile = () => path.join(repo, ".hexorcist", "last-verdict.json");
  const countFile = () => path.join(repo, ".hexorcist", "stop-blocks.json");

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-stop-"));
    out = [];
    err = [];
    buildCalls = [];
    buildResult = { status: 0, stderr: "" };
    copy("exorcism-demo/loop-check.json");
    copy("exorcism-demo/crosswalk-full-rules.txt");
    copy("examples/crosswalk/fixture.json");
  });
  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("HELD: prints one HELD line, writes the record, resets the counter", () => {
    useHex("fixed");
    fs.mkdirSync(path.join(repo, ".hexorcist"));
    fs.writeFileSync(countFile(), '{"count":2}');
    const code = run(["exorcism-demo/loop-check.json", "--block"], io());
    expect(code).toBe(0);
    const text = out.join("");
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(text).toMatch(/^HELD: No violation found in \d+ emulated runs? of this gremlin set\. Not a proof\.\n$/);
    expect(err).toEqual([]);
    const rec = parseRecord(fs.readFileSync(recordFile(), "utf8"));
    expect(rec?.verdict).toBe("HELD");
    expect(rec?.exitCode).toBe(0);
    expect(rec?.fingerprint).toBeNull();
    expect(JSON.parse(fs.readFileSync(countFile(), "utf8"))).toEqual({ count: 0 });
    expect(buildCalls).toEqual([{ command: "node", args: ["exorcism-demo/build.mjs"], cwd: repo }]);
  });

  it("BROKE with --block: exit 2, line on stderr, counter grows; the fourth stop is allowed", () => {
    useHex("buggy");
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push(run(["exorcism-demo/loop-check.json", "--block"], io()));
    expect(codes).toEqual([2, 2, 2, 0]);
    expect(err).toHaveLength(3);
    expect(err[0]).toMatch(/^BROKE: .*the smallest replay this reducer found\)\..*Fingerprint [0-9a-f]{16}\./);
    expect(out.join("")).toMatch(/Block limit reached/);
    expect(JSON.parse(fs.readFileSync(countFile(), "utf8"))).toEqual({ count: 3 });
    const rec = parseRecord(fs.readFileSync(recordFile(), "utf8"));
    expect(rec?.verdict).toBe("BROKE");
    expect(rec?.exitCode).toBe(1);
    expect(rec?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it("BROKE without --block: exit 0 and the counter is left alone", () => {
    useHex("buggy");
    expect(run(["exorcism-demo/loop-check.json"], io())).toBe(0);
    expect(out.join("")).toMatch(/^BROKE: /);
    expect(fs.existsSync(countFile())).toBe(false);
  });

  it("failed build: one 'No check ran:' line, no verdict string, old record removed", () => {
    useHex("fixed");
    fs.mkdirSync(path.join(repo, ".hexorcist"));
    fs.writeFileSync(recordFile(), "stale");
    buildResult = { status: 1, stderr: "first\nsketch.ino: error: boom\n" };
    const code = run(["exorcism-demo/loop-check.json", "--block"], io());
    expect(code).toBe(0);
    const text = out.join("");
    expect(text).toBe("No check ran: the build exited with code 1: sketch.ino: error: boom\n");
    expect(text).not.toMatch(/BROKE|HELD|COULDN'T TELL/);
    expect(fs.existsSync(recordFile())).toBe(false);
  });

  it("missing HEX and unreadable config are no-check outcomes", () => {
    expect(run(["exorcism-demo/loop-check.json"], io())).toBe(0);
    expect(out.join("")).toMatch(/^No check ran: the HEX file .* is missing\.\n$/);
    out.length = 0;
    expect(run(["nope.json"], io())).toBe(0);
    expect(out.join("")).toMatch(/^No check ran: the loop config "nope\.json" could not be read\.\n$/);
  });
});

describe("existing hook files", () => {
  const FILES = [".kiro/hooks/hexorcist-check-on-stop.json", ".kiro/hooks/hexorcist-done-guard.json"];
  type Hook = { trigger: unknown; matcher: unknown; type: unknown; command: unknown; timeout: unknown };
  const pick = (text: string): Hook => {
    const h = (JSON.parse(text) as { hooks: Array<Record<string, any>> }).hooks[0] as Record<string, any>;
    return {
      trigger: h.trigger,
      matcher: "matcher" in h ? h.matcher : undefined,
      type: h.action?.type,
      command: h.action?.command,
      timeout: "timeout" in h ? h.timeout : h.action?.timeout,
    };
  };

  it.each(FILES)("%s matches the committed trigger, matcher, action type, command and timeout", (file) => {
    const committed = execFileSync("git", ["show", `HEAD:${file}`], { cwd: REAL_REPO, encoding: "utf8" });
    const current = fs.readFileSync(path.join(REAL_REPO, file), "utf8");
    expect(pick(current)).toEqual(pick(committed));
  });

  it("the command lines name the module and arguments this task implements, with --no-deprecation", () => {
    const stop = pick(fs.readFileSync(path.join(REAL_REPO, FILES[0] as string), "utf8"));
    expect(stop.command).toBe("npx tsx --no-deprecation cli/hook-stop.ts exorcism-demo/loop-check.json --block");
    expect(stop.trigger).toBe("Stop");
    expect(fs.existsSync(path.join(REAL_REPO, "cli", "hook-stop.ts"))).toBe(true);
  });
});
