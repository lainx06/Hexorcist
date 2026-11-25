import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CheckInput, LoaderEnv } from "../../cli/input-loader";
import { main } from "../../cli/main";
import { exitCodeOf, toJson, toSummary } from "../../cli/run-check";
import type { CheckOutcome } from "../../cli/run-check";
import type { Verdict } from "../../src/engine/types";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env: LoaderEnv = { readText: (p) => fs.readFileSync(p, "utf8"), invocationDir: repoDir, repoDir };

type Ok = Extract<CheckOutcome, { ok: true }>;

const input = (seed: number, runs: number, rules: string[]): CheckInput =>
  ({ ruleSentences: rules, gremlinSet: [{ id: "masher" }], campaignSeed: seed, runs }) as unknown as CheckInput;

const text = fc.string({ maxLength: 40 });
const okOutcome = (verdict: Verdict, extra: Partial<Ok["result"]> = {}, requestedRuns = 5): Ok => ({
  ok: true,
  result: {
    verdict,
    campaign: { runsCompleted: requestedRuns, requestedRuns, violatingRunIndex: null, verdict, coverage: {} as never, totalCycles: 0 },
    ...extra,
  },
});

const outcomeArb: fc.Arbitrary<Ok> = fc.oneof(
  fc.tuple(fc.nat(50), fc.nat(50), text, fc.nat(1000)).map(([a, b, rule, cycle]) =>
    okOutcome(
      { verdict: "BROKE", trace: { runIndex: 2, runSeed: 1, eventList: [], outputEvents: [], violation: { rule, cycle } as never }, unchecked: [] },
      {
        reduction: { originalEventCount: a + b, reducedEventCount: a, candidatesTried: 1, stoppedAtBudget: false, reducedList: [], violation: {} as never },
        replay: { ok: true, violation: null, outputEdges: [], reachedEnd: 1, fingerprint: "abcd" },
      },
    ),
  ),
  fc.tuple(fc.integer({ min: 1, max: 99 }), text).map(([n, t]) => okOutcome({ verdict: "HELD", text: t, runs: n })),
  text.map((reason) => okOutcome({ verdict: "COULDN'T TELL", reason })),
);

const KEYS: Record<string, string[]> = {
  BROKE: ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "try", "movesBefore", "movesAfter", "fingerprint", "violation", "reducedList", "outputEdges"],
  HELD: ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "n", "text"],
  "COULDN'T TELL": ["toolVersion", "verdict", "seed", "runs", "gremlins", "rules", "reason", "reasonTruncated", "peripherals"],
};

describe("toJson", () => {
  it("Feature: headless-runner, Property 1: Serialization is deterministic and stable", () => {
    fc.assert(
      fc.property(outcomeArb, fc.nat(1e6), fc.array(text, { maxLength: 3 }), (o, seed, rules) => {
        const i = input(seed, 5, rules);
        const a = toJson(i, o, "0.0.0");
        expect(toJson(i, o, "0.0.0")).toBe(a);
        expect(a.charCodeAt(0)).not.toBe(0xfeff);
        expect(a).not.toContain("\r");
        expect(a.endsWith("}\n")).toBe(true);
        expect(a.endsWith("\n\n")).toBe(false);
        const parsed = JSON.parse(a) as Record<string, unknown>;
        expect(Object.keys(parsed)).toEqual(KEYS[o.result.verdict.verdict]);
        expect(a).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
      }),
      { numRuns: 100 },
    );
  });

  it("sets reasonTruncated directly after reason and copies the reason unchanged", () => {
    const short = JSON.parse(toJson(input(1, 5, []), okOutcome({ verdict: "COULDN'T TELL", reason: "x".repeat(199) }), "0.0.0")) as Record<string, unknown>;
    const long = JSON.parse(toJson(input(1, 5, []), okOutcome({ verdict: "COULDN'T TELL", reason: "x".repeat(200) }), "0.0.0")) as Record<string, unknown>;
    expect(short.reasonTruncated).toBe(false);
    expect(long.reasonTruncated).toBe(true);
    expect(long.reason).toBe("x".repeat(200));
  });
});

describe("exitCodeOf and summary", () => {
  it("Feature: headless-runner, Property 2: Exit code follows the verdict", () => {
    fc.assert(
      fc.property(outcomeArb, text, (o, reason) => {
        const want = { BROKE: 1, HELD: 0, "COULDN'T TELL": 2 }[o.result.verdict.verdict];
        expect(exitCodeOf(o)).toBe(want);
        expect(exitCodeOf({ ok: false, job: "replay", error: { kind: "k", message: reason } })).toBe(3);
        expect(exitCodeOf({ ok: false, reason })).toBe(3);
      }),
      { numRuns: 100 },
    );
  });

  it("summary holds the exact verdict string and the reducer wording", () => {
    fc.assert(
      fc.property(outcomeArb, (o) => {
        const s = toSummary(input(7, 5, []), o);
        expect(s.startsWith(o.result.verdict.verdict + "\n")).toBe(true);
        if (o.result.verdict.verdict === "BROKE") expect(s).toContain("the smallest replay this reducer found");
        if (o.result.verdict.verdict === "HELD") expect(s).toContain(o.result.verdict.text);
        if (o.result.verdict.verdict === "COULDN'T TELL") expect(s).toContain(o.result.verdict.reason);
      }),
      { numRuns: 100 },
    );
  });
});

describe("main --json", () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t), env } };
  };

  it("prints exactly one Result_Object on stdout for a real HELD run", () => {
    const t = io();
    expect(main(["--example", "heartbeat", "--fixed", "--json"], t.io)).toBe(0);
    expect(t.out).toHaveLength(1);
    const obj = JSON.parse(t.out[0] as string) as Record<string, unknown>;
    expect(obj.verdict).toBe("HELD");
    expect(Object.keys(obj)).toEqual(KEYS.HELD);
    expect(t.err).toEqual([]);
  });

  it("exit 3 prints no verdict string on stdout, even with --json", () => {
    const t = io();
    expect(main(["--json", "--fixed"], t.io)).toBe(3);
    expect(t.out).toEqual([]);
    expect(t.err).toHaveLength(1);
  });
});
