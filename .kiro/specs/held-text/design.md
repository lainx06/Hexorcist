# held-text Bugfix Design

## Overview

`heldText(n)` in `src/engine/verdict.ts` (lines 11-12) builds the text of the HELD verdict. It never says the runs are emulated, and for N = 1 it reads "1 runs". The fix changes that one template and nothing else in the engine. N stays the real count of completed runs, written as a plain integer.

The work is ordered so the preservation evidence exists before the fix. A baseline of BROKE and COULDN'T TELL outputs is recorded on unfixed code and committed on its own. The fix, the approved test edits, the README and steering edits and the new property test come after.

## Glossary

- **Bug_Condition (C)**: `computeVerdict(X)` returns HELD. Every such text lacks "emulated", and the N = 1 text also has the wrong plural.
- **Property (P)**: For 1 <= N <= 2^32, `heldText(N)` is exactly `No violation found in <N> emulated <run|runs> of this gremlin set. Not a proof.` ("run" only when N = 1).
- **Preservation**: Every non-HELD result of `computeVerdict` (BROKE with its trace and unchecked list, COULDN'T TELL with its reason text) stays byte-for-byte the same. HELD conditions, the `runs` field, cycles, seeds, traces and run values stay the same.
- **heldText**: exported function in `src/engine/verdict.ts` that formats the HELD text.
- **computeVerdict**: function in `src/engine/verdict.ts` (line 120 calls `heldText(runs.length)`). Not edited.
- **runCountPhrase / triggerReason**: "1 run" / "N runs" helpers for COULDN'T TELL and unchecked reasons. Not edited, not reused for HELD.
- **Baseline**: JSON file of recorded `computeVerdict` inputs and outputs, written once on unfixed code.

## Bug Details

### Bug Condition

The bug shows whenever a campaign finishes with every run complete, no violation, and nothing unchecked. `heldText` interpolates `${n} runs` with no "emulated" and no singular form.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type VerdictInput
  OUTPUT: boolean

  RETURN computeVerdict(X) is HELD    // N = X.runs.length, N >= 1
END FUNCTION
```

### Examples

- N = 3: today "No violation found in 3 runs of this gremlin set. Not a proof."; expected "No violation found in 3 emulated runs of this gremlin set. Not a proof."
- N = 1: today "... in 1 runs ..."; expected "No violation found in 1 emulated run of this gremlin set. Not a proof."
- N = 24 (crosswalk, heartbeat) and N = 40 (garage): expected "24 emulated runs", "40 emulated runs".
- Large N = 4294967296 (2^32): expected "4294967296 emulated runs", no separators, no exponent form.
- Not affected: a violating campaign still returns BROKE; an unmapped signal still returns COULDN'T TELL with the same reason.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- BROKE: same trace, same unchecked list, same ordering and de-duplication.
- COULDN'T TELL: same reason text, same 200-unit truncation, same logic and order of checks.
- HELD is returned under exactly the same conditions, with the same `runs` field.
- Cycles, seeds, traces and run values, including the pinned literals in `tests/examples/`.
- "1 run" / "N runs" in `runCountPhrase` and `triggerReason`, and the `Only X of Y runs completed` reason.
- Brand and banned-word tests over `examples/README.md` and `heldText(n)` keep passing.

**Scope:**
All inputs for which `computeVerdict` does not return HELD are unaffected. The only affected output is the `text` field of HELD.

## Hypothesized Root Cause

1. **Fixed template**: `heldText` is a single template literal with `${n} runs`. It has no singular branch and no "emulated". This is the only cause found, and the code is short enough to confirm by reading.
2. **Copies of the text elsewhere**: one test literal and two README/steering copies repeat the old wording. They are listed in the traceability table, not in the engine.
3. Not a cause: `computeVerdict` passes `runs.length` straight through. N is already the real count.

## Correctness Properties

Property 1: Bug Condition - HELD text says emulated and uses the right plural

_For any_ N with 1 <= N <= 2^32 (the HELD case), the fixed `heldText(N)` SHALL return exactly `"No violation found in " + String(N) + " emulated " + (N = 1 ? "run" : "runs") + " of this gremlin set. Not a proof."`, with N as a plain integer and no thousands separator. For any VerdictInput where `computeVerdict` returns HELD, its `text` SHALL equal `heldText(runs.length)` and its `runs` SHALL equal `runs.length`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - BROKE and COULDN'T TELL are unchanged

_For any_ input where the bug condition does NOT hold (`computeVerdict` does not return HELD), the fixed function SHALL produce the same result as the original function, including the trace, the unchecked list and the reason text.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `src/engine/verdict.ts` (the only engine edit)

**Function**: `heldText`

**Specific Changes**:
1. **Formatting only**: replace the template with
   ```ts
   export const heldText = (n: number): string =>
     `No violation found in ${n} emulated ${n === 1 ? "run" : "runs"} of this gremlin set. Not a proof.`;
   ```
   `${n}` on an integer up to 2^32 prints a plain integer. No `toLocaleString`, no `Intl`.
2. No change to `computeVerdict`, `runCountPhrase`, `triggerReason`, `VerdictInput` or any other file under `src/engine/`.

**Other edits (not engine):**

3. **`examples/README.md` lines 18-20**: all three rows change to "emulated runs": `in 24 emulated runs of this gremlin set` (crosswalk), `in 40 emulated runs` (garage), `in 24 emulated runs` (heartbeat). The existing lowercase table style stays. Nothing else in the README changes. The root `README.md` has no HELD text and is not touched.
4. **`.kiro/steering/verdicts.md` line 6** becomes exactly:
   `- HELD: "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N = 1). N is the real count.`
5. Other specs under `.kiro/specs/` keep their old-text quotes (historical records).

### Traceability of committed-test edits (approved)

| # | File:line | Edit | Kind |
|---|---|---|---|
| T1 | `src/engine/__tests__/campaign.handle.test.ts:234` | HELD literal `'... in 3 runs of ...'` becomes `'No violation found in 3 emulated runs of this gremlin set. Not a proof.'` | Literal only |
| T2 | `src/engine/__tests__/rules-verdict.test.ts:342` | HELD literal becomes `"No violation found in 1 emulated run of this gremlin set. Not a proof."` | Literal only |
| T3 | `src/engine/__tests__/rules-verdict.test.ts:346` | HELD literal becomes `"No violation found in 2 emulated runs of this gremlin set. Not a proof."` | Literal only |
| T4 | `src/engine/__tests__/rules-verdict.test.ts:340` | `describe` title reworded to describe the new wording | Name only |
| T5 | `src/engine/__tests__/rules-verdict.test.ts:341` | test name reworded (it says "still reads 'runs' for one run") | Name only |
| T6 | `src/engine/__tests__/rules-verdict.test.ts:345` | test name reworded (it says "reads '2 runs'") | Name only |

T4 to T6 change no assertion. The new names must not contain the banned words. No other committed test changes. Tests that build text through `heldText()` (copy-rules, rules-verdict.property, rules-verdict:334, verdict.property, and the three `tests/examples/` files) are not edited.

### New files (added by the plan, not committed tests being weakened)

| File | Purpose |
|---|---|
| `src/engine/__tests__/baselines/held-text-preservation.json` | Recorded baseline, written once on unfixed code |
| `src/engine/__tests__/held-text-preservation.test.ts` | Compares `computeVerdict` output with the baseline |
| `src/engine/__tests__/held-text.property.test.ts` | Fix-checking property for `heldText` |
| `scripts/record-held-baseline.ts` | Temporary recorder. Deleted before the task is reported done. |

## Testing Strategy

### Validation Approach

Two phases: record evidence on unfixed code, then check the fix. Passing tests are evidence, not proof. Reports say "pass" and "fail", never a verdict string.

### Exploratory Bug Condition Checking

**Goal**: Show the defect on unfixed code.

**Test Plan**: Call `heldText` and `computeVerdict` on unfixed code and read the text.

**Test Cases**:
1. **N = 1**: text contains "1 runs" (will fail the new property on unfixed code)
2. **N = 2, 24, 40**: text lacks "emulated" (will fail on unfixed code)
3. **N = 2^32**: text has no separator (passes on unfixed and fixed code)

**Expected Counterexamples**:
- `heldText(1)` returns "... in 1 runs ...". The first case of the property test fails on unfixed code with that counterexample.
- Cause confirmed by reading `verdict.ts:11-12`.

### Fix Checking

**Pseudocode:**
```
FOR ALL N IN [1, 2^32] DO
  ASSERT heldText'(N) = "No violation found in " + String(N) + " emulated "
                        + (IF N = 1 THEN "run" ELSE "runs")
                        + " of this gremlin set. Not a proof."
END FOR
```

### Preservation Checking

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT computeVerdict(input) = recorded_baseline(input)
END FOR
```

**Baseline (its own committed file, recorded before any fix edit):**
- File: `src/engine/__tests__/baselines/held-text-preservation.json`, next to the existing baselines (same convention as `input-pullup-preservation.json`).
- Recorder: temporary `scripts/record-held-baseline.ts`, run once on unfixed code (`npx tsx`). It writes inputs and the exact `computeVerdict` output, including every reason string, as JSON. It is deleted before the task is reported done. The test never writes or regenerates the file. A mismatch is reported, not rewritten.
- Content, a fixed list of VerdictInput values plus their outputs, all with a non-HELD result:
  - BROKE: one violating run; several violating runs (lowest `runIndex` wins, not first in list); a violation plus `cannotCheck` entries (de-duplication and order); a violation plus `untriggeredRules` (trigger reason with "1 run" and with "N runs", duplicates).
  - COULDN'T TELL: one case for each reason branch (rule cannot be checked, untriggered rule, unmapped signals, unsupported peripherals, `Only X of Y runs completed`, no gremlin event), a combined case, the empty-reason fallback, and a reason cut at 200 units including a surrogate pair at the boundary.
  - `finished: false` returns null: one case.
  - Generated cases: 100 more from `fc.sample(arbVerdictHonestyInput, { seed })` with a fixed seed written in the file, keeping only inputs whose result is not HELD. The count recorded is the real count kept.
- The baseline also records, for information, the HELD outputs seen during recording. The preservation test does not compare them, because they change by design.
- Guard against a vacuous baseline: the test asserts the file has at least one BROKE and at least one COULDN'T TELL case and that every branch above is present.
- Order: record, run the preservation test on unfixed code (expect pass), then stop so the user commits the baseline. Only then start the fix. After the fix the same test runs unchanged and must pass.

**Test Cases**:
1. **BROKE preservation**: output deep-equals the recorded output.
2. **COULDN'T TELL preservation**: output, including `reason`, equals the recorded text exactly.
3. **Input immutability**: the input is unchanged after the call (matches existing honesty property).

### Unit Tests

- `heldText(1)`, `heldText(2)`, `heldText(24)`, `heldText(40)` exact text (T2 and T3 cover 1 and 2 after their literal edit).
- `computeVerdict` with 1 completed run returns the singular text and `runs: 1` (T1 covers 3 runs).
- Edge: `heldText(4294967296)` has digits only.

### Property-Based Tests

- `held-text.property.test.ts`, fast-check, `numRuns: 200` (at least), fixed `seed` written in the file, N from `fc.integer({ min: 1, max: 4294967296 })`. Asserts the exact format of the Fix Checking pseudocode. Also asserts no comma, space or underscore between digits, by the exact-match comparison itself.
- `fc.pre`-free. Boundary values 1, 2 and 2^32 are added with `examples` so they run on every pass regardless of the draw.
- The existing `rules-verdict.property.test.ts` and `verdict.property.test.ts` keep checking that the HELD `text` equals `heldText(n)`.

### Integration Tests

- Existing `tests/examples/` suites compare against `heldText(24)` and `heldText(40)`. They keep passing with no edit.
- `campaign.handle.test.ts` (T1) checks the HELD text through a full campaign.
- At the end run the full suite, `npm run typecheck`, `npm run guard` and `npm run build`. Confirm no debug script remains. Report results as evidence, not proof.
