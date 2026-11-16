// Feature: bench-ui-core. Message_Codec round trip, error paths and compact output. Evidence, not proof.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeMessage, decodeReply, decodeRequest, encodeMessage } from "../../src/ui/app/worker/codec";
import type { WorkerMessage } from "../../src/ui/app/worker/messages";
import { WORKER_MESSAGE_KINDS } from "../../src/ui/app/worker/messages";

const nat = fc.integer({ min: 0, max: 2 ** 40 });
const small = fc.integer({ min: 0, max: 1000 });
const str = fc.string({ maxLength: 12 });
const event = fc.oneof(
  fc.record({ cycle: nat, signal: str, gremlinId: str, value: fc.constantFrom(0 as const, 1 as const, "release" as const) }),
  fc.record({ cycle: nat, signal: str, gremlinId: str, analog: fc.integer({ min: 0, max: 1023 }) }),
);
const edge = fc.record({ signal: str, value: fc.constantFrom(0 as const, 1 as const, "input" as const), cycle: nat });
const violation = fc.record({ rule: str, cycle: nat });
const fixture = fc.record({
  pins: fc.array(fc.record({ signal: str, port: fc.constantFrom("B", "C", "D"), bit: fc.integer({ min: 0, max: 7 }), direction: fc.constantFrom("input", "output") }), { maxLength: 3 }),
});
const ruleSet = fc.array(fc.record({ form: fc.constant("never"), condition: fc.record({ op: fc.constant("eq"), signal: str, value: fc.constantFrom(0, 1) }) }), { maxLength: 2 });
const gremlinSet = fc.array(fc.record({ id: str }), { maxLength: 2 });
const verdict = fc.oneof(
  fc.record({
    verdict: fc.constant("BROKE" as const),
    trace: fc.record({ runIndex: small, runSeed: nat, eventList: fc.array(event, { maxLength: 4 }), outputEvents: fc.array(edge, { maxLength: 4 }), violation }),
    unchecked: fc.array(fc.record({ rule: str, reason: str }), { maxLength: 2 }),
  }),
  fc.record({ verdict: fc.constant("HELD" as const), text: str, runs: small }),
  fc.record({ verdict: fc.constant("COULDN'T TELL" as const), reason: str }),
);
const measure = fc.option(fc.record({ totalCycles: nat, seconds: fc.double({ min: 0, max: 1000, noNaN: true }) }), { nil: null });
const jobId = small;

export const messageArb: fc.Arbitrary<WorkerMessage> = fc.oneof(
  fc.record({ kind: fc.constant("campaign" as const), jobId, hex: str, fixture, ruleSet, gremlinSet, campaignSeed: nat, runs: small, runCycles: nat, measure: fc.boolean() }),
  fc.record({ kind: fc.constant("reduce" as const), jobId, hex: str, fixture, ruleSet, originalList: fc.array(event, { maxLength: 4 }), violation, runCycles: nat, measure: fc.boolean() }),
  fc.record({ kind: fc.constant("replay" as const), jobId, hex: str, fixture, ruleSet, events: fc.array(event, { maxLength: 4 }), runCycles: nat }),
  fc.record({ kind: fc.constant("campaign-progress" as const), jobId, runsCompleted: small, total: small, finished: fc.constant(false as const) }),
  fc.record({
    kind: fc.constant("campaign-done" as const),
    jobId,
    runsCompleted: small,
    total: small,
    finished: fc.constant(true as const),
    result: fc.record({
      runsCompleted: small,
      requestedRuns: small,
      violatingRunIndex: fc.option(small, { nil: null }),
      verdict,
      coverage: fc.record({ triggerCounts: fc.array(fc.option(small, { nil: null }), { maxLength: 3 }), gremlinEvents: small }),
      totalCycles: nat,
    }),
    measure,
  }),
  fc.record({ kind: fc.constant("reduce-progress" as const), jobId, candidatesTried: small, bestGremlinCount: small, bestList: fc.array(event, { maxLength: 4 }) }),
  fc.record({
    kind: fc.constant("reduce-done" as const),
    jobId,
    result: fc.record({ originalEventCount: small, reducedEventCount: small, candidatesTried: small, stoppedAtBudget: fc.boolean(), reducedList: fc.array(event, { maxLength: 4 }), violation }),
    measure,
  }),
  fc.record({ kind: fc.constant("replay-done" as const), jobId, violation: fc.option(violation, { nil: null }), outputEdges: fc.array(edge, { maxLength: 4 }), reachedEnd: nat, fingerprint: str }),
  fc.record({ kind: fc.constant("job-error" as const), jobId, job: fc.constantFrom("campaign" as const, "reduce" as const, "replay" as const, "message" as const), error: fc.record({ kind: str, message: str }) }),
) as fc.Arbitrary<WorkerMessage>;

/** Paths of every non-negative integer leaf, in dotted form with bracketed indexes. */
function intPaths(v: unknown, path: string, out: string[]): void {
  if (Array.isArray(v)) v.forEach((x, i) => intPaths(x, `${path}[${i}]`, out));
  else if (typeof v === "object" && v !== null) {
    for (const [k, x] of Object.entries(v)) intPaths(x, path === "" ? k : `${path}.${k}`, out);
  } else if (typeof v === "number" && Number.isInteger(v) && path !== "" && !/(\.|^)(bit|value)$/.test(path) && !path.includes("fixture") && !path.includes("ruleSet")) {
    out.push(path);
  }
}

function setAt(root: unknown, path: string, value: unknown): void {
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let o = root as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]!] as Record<string, unknown>;
  o[keys[keys.length - 1]!] = value;
}

function hasTypedArray(v: unknown): boolean {
  if (ArrayBuffer.isView(v)) return true;
  if (Array.isArray(v)) return v.some(hasTypedArray);
  if (typeof v === "object" && v !== null) return Object.values(v).some(hasTypedArray);
  return false;
}

describe("Message_Codec", () => {
  it("covers all nine kinds", () => {
    expect(WORKER_MESSAGE_KINDS).toHaveLength(9);
  });

  it("Property 15: round trip", () => {
    // Feature: bench-ui-core, Property 15: Message_Codec round trip
    fc.assert(
      fc.property(messageArb, (m) => {
        const before = structuredClone(m);
        const enc = encodeMessage(m);
        expect(m).toEqual(before);
        expect(JSON.parse(JSON.stringify(enc))).toEqual(enc);
        expect(encodeMessage(structuredClone(m))).toEqual(enc);
        const d1 = decodeMessage(enc);
        const d2 = decodeMessage(JSON.parse(JSON.stringify(enc)));
        expect(d1).toEqual({ ok: true, message: m });
        expect(d2).toEqual({ ok: true, message: m });
        const isReq = m.kind === "campaign" || m.kind === "reduce" || m.kind === "replay";
        expect(decodeRequest(enc).ok).toBe(isReq);
        expect(decodeReply(enc).ok).toBe(!isReq);
      }),
      { seed: 1501, numRuns: 200 },
    );
  });

  it("Property 16: reports the field at fault", () => {
    // Feature: bench-ui-core, Property 16: Message_Codec reports the field at fault
    fc.assert(
      fc.property(messageArb, fc.nat(), fc.constantFrom(-1, 1.5, "x"), (m, pick, bad) => {
        const paths: string[] = [];
        intPaths(m, "", paths);
        if (paths.length === 0) return;
        const p = paths[pick % paths.length]!;
        const broken = structuredClone(m) as unknown;
        setAt(broken, p, bad);
        const d = decodeMessage(broken);
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.error.path).toBe(p);
      }),
      { seed: 1601, numRuns: 200 },
    );
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.array(fc.integer())), (v) => {
        const d = decodeMessage(v);
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.error.path).toBe("$");
      }),
      { seed: 1602, numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.string(), (k) => {
        fc.pre(!(WORKER_MESSAGE_KINDS as readonly string[]).includes(k));
        const d = decodeMessage({ kind: k, jobId: 1 });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.error.path).toBe("kind");
      }),
      { seed: 1603, numRuns: 100 },
    );
    const missing = decodeMessage({ kind: "replay-done", jobId: 1, violation: null, outputEdges: [], fingerprint: "x" });
    expect(missing).toEqual({ ok: false, error: { path: "reachedEnd", message: "Field reachedEnd: is missing." } });
  });

  it("Property 17: encoded messages are compact", () => {
    // Feature: bench-ui-core, Property 17: Encoded messages are compact
    fc.assert(
      fc.property(messageArb, (m) => {
        const loaded = structuredClone(m) as unknown as Record<string, unknown>;
        // A campaign request has its own integer runs field; every other kind gets a RunResult-like list.
        if (m.kind !== "campaign") loaded.runs = [{ runIndex: 0, appliedInputs: [], diagnostics: [] }];
        loaded.extra = new Uint8Array(4);
        if (typeof loaded.result === "object" && loaded.result !== null) {
          (loaded.result as Record<string, unknown>).runs = [{ runIndex: 0 }];
        }
        const enc = encodeMessage(loaded as unknown as WorkerMessage) as Record<string, unknown>;
        expect(hasTypedArray(enc)).toBe(false);
        if (m.kind !== "campaign") expect("runs" in enc).toBe(false);
        if (typeof enc.result === "object" && enc.result !== null) expect("runs" in (enc.result as object)).toBe(false);
        expect(enc).toEqual(encodeMessage(m));
      }),
      { seed: 1701, numRuns: 200 },
    );
  });
});