// Preservation test for the held-text fix. It reads a baseline recorded once on
// unfixed code and compares computeVerdict output with it. It never writes or
// regenerates the baseline: a mismatch is reported, not rewritten.
// Evidence only, not proof.
//
// Not covered: the empty-reason fallback. The user approved dropping it because
// it is unreachable through computeVerdict.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeVerdict, type VerdictInput } from "../verdict";
import type { Verdict } from "../types";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(here, "baselines/held-text-preservation.json");

interface BaselineCase {
  id: string;
  branch: string;
  input: VerdictInput;
  output: Verdict | null;
}
interface Baseline {
  cases: BaselineCase[];
}

const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
const cases = baseline.cases;

const REQUIRED_BRANCHES = [
  "broke-single",
  "broke-lowest-runindex",
  "broke-cannotcheck",
  "broke-untriggered-1run",
  "broke-untriggered-nruns",
  "broke-untriggered-duplicates",
  "ct-cannot-check",
  "ct-untriggered",
  "ct-unmapped",
  "ct-unsupported",
  "ct-only-x-of-y",
  "ct-no-gremlin-event",
  "ct-combined",
  "ct-truncate-surrogate",
  "unfinished-null",
  "generated",
];

describe("held-text preservation baseline", () => {
  it("holds at least one BROKE case and one COULDN'T TELL case", () => {
    const kinds = cases.map((c) => c.output?.verdict);
    expect(kinds).toContain("BROKE");
    expect(kinds).toContain("COULDN'T TELL");
  });

  it("covers every required branch tag", () => {
    const present = new Set(cases.map((c) => c.branch));
    const missing = REQUIRED_BRANCHES.filter((b) => !present.has(b));
    expect(missing).toEqual([]);
  });

  it("records no case whose output is the HELD kind", () => {
    const held = cases.filter((c) => c.output?.verdict === "HELD").map((c) => c.id);
    expect(held).toEqual([]);
  });
});

describe("held-text preservation: computeVerdict matches the recorded output", () => {
  for (const c of cases) {
    it(`${c.branch} / ${c.id}`, () => {
      const before = structuredClone(c.input);
      const actual = computeVerdict(c.input);
      if (c.output === null) {
        expect(actual).toBeNull();
      } else {
        expect(actual).toEqual(c.output);
      }
      // Input unchanged after the call.
      expect(c.input).toEqual(before);
    });
  }
});
