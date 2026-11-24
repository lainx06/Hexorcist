// Feature: headless-runner. Property tests on the pure layer (Properties 1, 2, 4, 5).
// The engine jobs are stubs here; real runs are in cli-acceptance.test.ts. Evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckArgs, CheckInput, TextReader } from "../../cli/input-loader";
import { loadInput } from "../../cli/input-loader";
import { main } from "../../cli/main";
import type { Io } from "../../cli/main";
import type { CheckOutcome, Jobs, ResultObject } from "../../cli/run-check";
import { exitCodeOf, runCheck, toJson } from "../../cli/run-check";

const RUNS = { numRuns: 100, seed: 20261123 };
const ROOT = resolve(__dirname, "../..");
const VERDICT_WORDS = ["BROKE", "HELD", "COULDN'T TELL"];

const noFiles: TextReader = {
  user: () => {
    throw new Error("no file reads expected");
  },
  example: () => {
    throw new Error("no file reads expected");
  },
};

function capture(reader: TextReader = noFiles): Io & { stdout: string; stderr: string } {
  const io = {
    stdout: "",
    stderr: "",
    out(t: string) {
      io.stdout += t;
    },
    err(t: string) {
      io.stderr += t;
    },
    reader,
    toolVersion: "0.0.0",
  };
  return io;
}

const word = fc.stringMatching(/^[a-z]{1,8}$/);
const event = fc.record({ cycle: fc.nat(), signal: fc.constantFrom("REQUEST", "BEAM", "PULSE"), value: fc.constantFrom(0, 1), gremlinId: fc.constantFrom("masher", "bouncer") });
const common = {
  toolVersion: fc.constant("0.0.0"),
  seed: fc.nat({ max: 4294967295 }),
  runs: fc.integer({ min: 1, max: 1000 }),
  gremlins: fc.array(fc.constantFrom("masher", "bouncer", "stuck"), { maxLength: 3 }),
  rules: fc.array(fc.string(), { maxLength: 3 }),
};
const broke = fc.record({
  ...common,
  verdict: fc.constant("BROKE" as const),
  try: fc.integer({ min: 1, max: 1000 }),
  movesBefore: fc.nat(),
  movesAfter: fc.nat(),
  fingerprint: fc.stringMatching(/^[0-9a-f]{16}$/),
  violation: fc.record({ rule: fc.string(), cycle: fc.nat() }),
  reducedList: fc.array(event, { maxLength: 5 }),
});
const held = fc.record({ ...common, verdict: fc.constant("HELD" as const), n: fc.integer({ min: 1, max: 1000 }), text: fc.string() });
const tell = fc.record({ ...common, verdict: fc.constant("COULDN'T TELL" as const), reason: fc.string(), reasonTruncated: fc.boolean(), peripherals: fc.array(word, { maxLength: 3 }) });
const resultArb = fc.oneof(broke, held, tell) as fc.Arbitrary<ResultObject>;

/** Builds the object in the design's key order, as runCheck does. */
function ordered(r: ResultObject): ResultObject {
  const head = { toolVersion: r.toolVersion, verdict: r.verdict, seed: r.seed, runs: r.runs, gremlins: r.gremlins, rules: r.rules };
  if (r.verdict === "HELD") return { ...head, verdict: "HELD", n: r.n, text: r.text };
  if (r.verdict === "COULDN'T TELL") return { ...head, verdict: "COULDN'T TELL", reason: r.reason, reasonTruncated: r.reasonTruncated, peripherals: r.peripherals };
  return { ...head, verdict: "BROKE", try: r.try, movesBefore: r.movesBefore, movesAfter: r.movesAfter, fingerprint: r.fingerprint, violation: r.violation, reducedList: r.reducedList };
}

const KEY_ORDER: Record<ResultObject["verdict"], string[]> = {
  BROKE: ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "try", "movesBefore", "movesAfter", "fingerprint", "violation", "reducedList"],
  HELD: ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "n", "text"],
  "COULDN'T TELL": ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "reason", "reasonTruncated", "peripherals"],
};

describe("headless-runner pure layer", () => {
  it("Feature: headless-runner, Property 1: Serialization is deterministic and stable", () => {
    fc.assert(
      fc.property(resultArb, (raw) => {
        const r = ordered(raw);
        const a = toJson(r);
        expect(toJson(r)).toBe(a);
        expect(a.charCodeAt(0)).not.toBe(0xfeff);
        expect(a.includes("\r")).toBe(false);
        expect(a.endsWith("\n")).toBe(true);
        expect(a.endsWith("\n\n")).toBe(false);
        const back = JSON.parse(a) as Record<string, unknown>;
        expect(Object.keys(back)).toEqual(KEY_ORDER[r.verdict]);
        expect(back).toEqual(JSON.parse(JSON.stringify(r)));
      }),
      RUNS,
    );
  });

  it("Feature: headless-runner, Property 2: Exit code follows the verdict", () => {
    const failure = fc.oneof(
      fc.record({ ok: fc.constant(false as const), reason: fc.string() }),
      fc.record({
        ok: fc.constant(false as const),
        job: fc.constantFrom("campaign" as const, "reduction" as const, "replay" as const),
        error: fc.record({ kind: word, message: fc.string() }),
      }),
    );
    fc.assert(
      fc.property(fc.oneof(resultArb.map((result) => ({ ok: true as const, result })), failure), (o) => {
        const code = exitCodeOf(o as CheckOutcome);
        if (!o.ok) expect(code).toBe(3);
        else expect(code).toBe(o.result.verdict === "HELD" ? 0 : o.result.verdict === "BROKE" ? 1 : 2);
      }),
      RUNS,
    );
    // Exit 3 through main prints none of the verdict words on stdout.
    fc.assert(
      fc.property(
        fc.record({ job: fc.constantFrom("campaign" as const, "reduction" as const, "replay" as const), message: fc.constantFrom(...VERDICT_WORDS, "boom") }),
        ({ job, message }) => {
          const io = capture();
          const code = main(["--example", "crosswalk"], io, {
            load: () => ({ ok: true, input: {} as CheckInput }),
            check: () => ({ ok: false, job, error: { kind: "x", message } }),
          });
          expect(code).toBe(3);
          expect(io.stdout).toBe("");
          expect(io.stderr).toContain(job);
        },
      ),
      RUNS,
    );
  });

  it("Feature: headless-runner, Property 4: Bad input starts no run", () => {
    const num = fc.oneof(fc.constant("1.5"), fc.constant("-3"), fc.constant("abc"), fc.constant("1e3"), fc.constant(""), fc.constant("99999999999"));
    const bad: fc.Arbitrary<{ argv: string[]; args: CheckArgs }> = fc.oneof(
      fc.record({ g: fc.stringMatching(/^[a-z]{3,9}$/).filter((s) => !["masher", "bouncer", "stuck", "dropout", "spike", "drifter"].includes(s)) }).map(({ g }) => ({
        argv: ["--example", "crosswalk", "--gremlins", g],
        args: { example: "crosswalk", gremlins: g },
      })),
      fc.constantFrom("--hex", "--pins", "--rules").map((f) => ({ argv: ["--example", "garage", f, "x"], args: { example: "garage", [f.slice(2)]: "x" } as CheckArgs })),
      fc.constant<{ argv: string[]; args: CheckArgs }>({ argv: ["--fixed", "--hex", "a", "--pins", "b", "--rules", "c"], args: { fixed: true, hex: "a", pins: "b", rules: "c" } }),
      fc.record({ f: fc.constantFrom(["--runs", "runs"], ["--seed", "seed"], ["--run-ms", "runMs"]), v: num }).map(({ f, v }) => ({
        argv: ["--example", "heartbeat", f[0] as string, v],
        args: { example: "heartbeat", [f[1] as string]: v } as CheckArgs,
      })),
    );
    fc.assert(
      fc.property(bad, ({ argv, args }) => {
        // Unknown gremlins need the example files; every other case must fail before any file read.
        const needsFiles = args.gremlins !== undefined;
        if (!needsFiles) expect(loadInput(args, noFiles).ok).toBe(false);
        let checks = 0;
        const io = capture();
        const code = main(argv.filter((a) => a !== ""), io, {
          load: needsFiles ? (a) => loadInput(a, { user: noFiles.user, example: (p) => readFileSync(resolve(ROOT, p), "utf8") }) : (a, r) => loadInput(a, r),
          check: () => {
            checks++;
            throw new Error("no run expected");
          },
        });
        expect(code).toBe(3);
        expect(checks).toBe(0);
        expect(io.stdout).toBe("");
      }),
      RUNS,
    );
  });

  it("Feature: headless-runner, Property 5: Jobs run only as the verdict needs", () => {
    const verdictArb = fc.constantFrom("BROKE", "HELD", "COULDN'T TELL");
    fc.assert(
      fc.property(verdictArb, fc.integer({ min: 1, max: 50 }), (verdict, runs) => {
        const calls = { campaign: 0, reduction: 0, replay: 0 };
        const v =
          verdict === "HELD"
            ? { verdict, text: "held", runs }
            : verdict === "COULDN'T TELL"
              ? { verdict, reason: "why" }
              : { verdict, trace: { runIndex: 0, eventList: [], violation: { rule: "r", cycle: 5 } }, unchecked: [] };
        const jobs = {
          campaign: () => {
            calls.campaign++;
            return { ok: true, runsCompleted: runs, total: runs, result: { runsCompleted: runs, requestedRuns: runs, violatingRunIndex: verdict === "BROKE" ? 0 : null, verdict: v, coverage: {}, totalCycles: 0 } };
          },
          reduction: () => {
            calls.reduction++;
            return { ok: true, result: { originalEventCount: 2, reducedEventCount: 1, reducedList: [] } };
          },
          replay: () => {
            calls.replay++;
            return { ok: true, violation: { rule: "r", cycle: 5 }, outputEdges: [], reachedEnd: 0, fingerprint: "00" };
          },
        } as unknown as Jobs;
        const input = { hex: "", fixture: { pins: [] }, ruleSet: [], gremlinSet: [], campaignSeed: 1, runs, runCycles: 1, ruleSentences: [] } as unknown as CheckInput;
        const out = runCheck(input, "0.0.0", jobs);
        expect(out.ok).toBe(true);
        expect(calls.campaign).toBe(1);
        expect(calls.reduction).toBe(verdict === "BROKE" ? 1 : 0);
        expect(calls.replay).toBe(verdict === "BROKE" ? 1 : 0);
      }),
      RUNS,
    );
  });
});

