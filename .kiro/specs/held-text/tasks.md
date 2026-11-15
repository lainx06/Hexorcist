# Implementation Plan

Rules for every task: Kiro never commits. Reports say "pass" or "fail" for tests, never a verdict string. Tests are evidence, not proof. No other committed test may change, and no assertion is weakened or removed. Nothing under `src/engine/` changes except the HELD text in `src/engine/verdict.ts`.

- [x] 1. Write the preservation baseline on UNFIXED code, then STOP for the user to commit it
  - **Property 2: Preservation** - BROKE and COULDN'T TELL results are unchanged
  - **IMPORTANT**: Follow observation-first methodology. No fix edit may precede this task. `src/engine/verdict.ts` must be untouched while this task runs.
  - Confirm `git status` shows no edit to `src/engine/verdict.ts` before starting
  - [x] 1.1 Write the temporary recording script `scripts/record-held-baseline.ts`
    - Run once with `npx tsx scripts/record-held-baseline.ts` on unfixed code
    - Build a fixed list of VerdictInput values whose result is not HELD, and record the exact `computeVerdict` output for each, including every reason string
    - BROKE cases: one violating run; several violating runs (lowest `runIndex` wins, not first in list); a violation plus `cannotCheck` entries (de-duplication and order); a violation plus `untriggeredRules` (trigger reason with "1 run" and with "N runs", duplicates)
    - COULDN'T TELL cases: one per reason branch (rule cannot be checked, untriggered rule, unmapped signals, unsupported peripherals, `Only X of Y runs completed`, no gremlin event), a combined case, the empty-reason fallback, and a reason cut at 200 units with a surrogate pair at the boundary
    - One `finished: false` case that returns null
    - 100 generated cases from `fc.sample(arbVerdictHonestyInput, { seed })` with a fixed seed written in the script, keeping only inputs whose result is not HELD. Record the real count kept.
    - Also record, for information only, the HELD outputs seen during recording (the test does not compare them)
    - Write to `src/engine/__tests__/baselines/held-text-preservation.json`, next to `input-pullup-preservation.json`
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [x] 1.2 Write the preservation test `src/engine/__tests__/held-text-preservation.test.ts`
    - Reads the baseline JSON and compares `computeVerdict` output with the recorded output (deep equal, reason text exact)
    - Never writes or regenerates the baseline. A mismatch is reported, not rewritten.
    - Asserts the file holds at least one BROKE case and at least one COULDN'T TELL case, and that every branch listed in 1.1 is present (guard against a vacuous baseline)
    - Asserts the input is unchanged after each call
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_
  - [x] 1.3 Run the preservation test on UNFIXED code
    - **EXPECTED OUTCOME**: the test passes. Record the number of cases in the baseline.
    - If it fails, stop and report. Do not edit the test or the baseline to make it pass.
  - [x] 1.4 Delete the temporary script
    - Delete `scripts/record-held-baseline.ts`
    - Confirm with `git status` that the only new files are the baseline JSON and the preservation test, and that no other file changed
  - [x] 1.5 **STOP. User commits the baseline on its own.**
    - The user commits `src/engine/__tests__/baselines/held-text-preservation.json` and `src/engine/__tests__/held-text-preservation.test.ts` as a separate commit, before any fix edit
    - Kiro does not commit, does not start task 2, and does not touch `src/engine/verdict.ts` until the user confirms the baseline commit
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

- [x] 2. Fix the HELD text (NOT to start until the user confirms the baseline commit)

  - [x] 2.1 Edit `heldText` in `src/engine/verdict.ts` (lines 11-12), HELD text only
    - Replace the template with:
      ```ts
      export const heldText = (n: number): string =>
        `No violation found in ${n} emulated ${n === 1 ? "run" : "runs"} of this gremlin set. Not a proof.`;
      ```
    - No `toLocaleString`, no `Intl`. No change to `computeVerdict`, `runCountPhrase`, `triggerReason`, `VerdictInput` or any other file under `src/engine/`.
    - _Bug_Condition: isBugCondition(X) where computeVerdict(X) is HELD_
    - _Expected_Behavior: heldText(N) = "No violation found in " + String(N) + " emulated " + (N = 1 ? "run" : "runs") + " of this gremlin set. Not a proof."_
    - _Preservation: BROKE and COULDN'T TELL results unchanged (Property 2)_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Edit the approved committed-test literals (T1 to T3). Literal only, no other change on these lines.
    - [x] 2.2.1 T1: `src/engine/__tests__/campaign.handle.test.ts:234`
      - Change `'No violation found in 3 runs of this gremlin set. Not a proof.'` to `'No violation found in 3 emulated runs of this gremlin set. Not a proof.'`
      - _Requirements: 2.1_
    - [x] 2.2.2 T2: `src/engine/__tests__/rules-verdict.test.ts:342`
      - Change `"No violation found in 1 runs of this gremlin set. Not a proof."` to `"No violation found in 1 emulated run of this gremlin set. Not a proof."`
      - _Requirements: 2.2_
    - [x] 2.2.3 T3: `src/engine/__tests__/rules-verdict.test.ts:346`
      - Change `"No violation found in 2 runs of this gremlin set. Not a proof."` to `"No violation found in 2 emulated runs of this gremlin set. Not a proof."`
      - _Requirements: 2.1_

  - [x] 2.3 Edit the approved committed-test names (T4 to T6). Names only, no assertion changes.
    - [x] 2.3.1 T4: `src/engine/__tests__/rules-verdict.test.ts:340`, the `describe` title
      - Reword to describe the new wording (emulated runs, singular for one run)
      - _Requirements: 2.1, 2.2_
    - [x] 2.3.2 T5: `src/engine/__tests__/rules-verdict.test.ts:341`, test name
      - The old name is `heldText(1) still reads 'runs' for one run`. Reword to say it reads "1 emulated run".
      - _Requirements: 2.2_
    - [x] 2.3.3 T6: `src/engine/__tests__/rules-verdict.test.ts:345`, test name
      - The old name is `heldText(2) reads '2 runs'`. Reword to say it reads "2 emulated runs".
      - _Requirements: 2.1_
    - New names must not contain the words safe, secure, guaranteed, certified, real-time, first, unique or shortest
    - Diff check: the only changed lines in `rules-verdict.test.ts` are 340, 341, 342, 345 and 346, and in `campaign.handle.test.ts` only line 234

  - [x] 2.4 Add the fix-checking property test `src/engine/__tests__/held-text.property.test.ts`
    - **Property 1: Bug Condition** - HELD text says emulated and uses the right plural
    - fast-check with `numRuns: 200` or more and a fixed `seed` written in the file
    - N drawn from `fc.integer({ min: 1, max: 4294967296 })`
    - Asserts `heldText(N)` equals exactly `"No violation found in " + String(N) + " emulated " + (N === 1 ? "run" : "runs") + " of this gremlin set. Not a proof."` (exact match, so no separator, exponent form or extra space can pass)
    - `examples` entries for 1, 2 and 4294967296 so the boundaries run on every pass
    - No `fc.pre`. No `Math.random`, no clock.
    - Also a check that `computeVerdict` for a HELD input returns `text` equal to `heldText(runs.length)` and `runs` equal to `runs.length`
    - Before task 2.1 this test would fail on N = 1 with "1 runs". The recorded fail is not required, because the fix is made first by plan order.
    - _Requirements: 2.1, 2.2_

  - [x] 2.5 Edit `examples/README.md` lines 18-20, all three rows
    - Line 18, crosswalk: `in 24 emulated runs of this gremlin set`
    - Line 19, garage: `in 40 emulated runs of this gremlin set`
    - Line 20, heartbeat: `in 24 emulated runs of this gremlin set`
    - Keep the existing lowercase table style. Nothing else in the README changes. The root `README.md` is not touched.
    - Do not add the words safe, secure, guaranteed, certified, real-time, first, unique or shortest
    - _Requirements: 2.3, 3.6_

  - [x] 2.6 Edit `.kiro/steering/verdicts.md` line 6, the HELD line, to read exactly
    - `- HELD: "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N = 1). N is the real count.`
    - No other line in the file changes. Old-text quotes in other specs under `.kiro/specs/` stay as they are.
    - _Requirements: 2.4_

  - [x] 2.7 Verify the preservation test from task 1 still passes
    - **Property 2: Preservation** - BROKE and COULDN'T TELL results are unchanged
    - **IMPORTANT**: Re-run the SAME test and the SAME baseline file from task 1. Do not edit either.
    - **EXPECTED OUTCOME**: the test passes. If it fails, stop and report the expected text, the actual text and the case, and wait for the user's decision.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.8 Verify the fix-checking property passes
    - **Property 1: Expected Behavior** - HELD text says emulated and uses the right plural
    - Re-run `src/engine/__tests__/held-text.property.test.ts` from 2.4
    - **EXPECTED OUTCOME**: the test passes
    - _Requirements: 2.1, 2.2_

- [x] 3. Final checks
  - [x] 3.1 Run the full suite once (`npx vitest --run`, or the project's test script with `--run`). Report pass and fail counts as evidence, not proof.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  - [x] 3.2 Run `npm run typecheck`
  - [x] 3.3 Run `npm run guard`
  - [x] 3.4 Run `npm run build`
  - [x] 3.5 Confirm no debug scripts remain
    - `scripts/record-held-baseline.ts` is gone
    - `git status` lists only these changes: `src/engine/verdict.ts`, `campaign.handle.test.ts`, `rules-verdict.test.ts`, `held-text.property.test.ts`, `examples/README.md`, `.kiro/steering/verdicts.md` (and the baseline files, already committed by the user)
    - No other committed test changed
  - [x] 3.6 Checkpoint - Ensure all tests pass
    - Report the results to the user. Kiro does not commit. The user commits the fix.
    - Ask the user if questions arise.

## Task Dependency Graph

Every wave waits for the one before it. Wave 3 starts only after the user confirms the baseline commit.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2.1", "2.2.2", "2.2.3", "2.3.1", "2.3.2", "2.3.3"] },
    { "id": 5, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 6, "tasks": ["2.7", "2.8"] },
    { "id": 7, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 8, "tasks": ["3.5", "3.6"] }
  ]
}
```
