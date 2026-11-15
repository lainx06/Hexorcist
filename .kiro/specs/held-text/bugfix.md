# Bugfix Requirements Document

## Introduction

The text of the HELD verdict, built by `heldText(n)` in `src/engine/verdict.ts` (lines 11-12) and returned by `computeVerdict` (line 120), has two defects. It does not say the runs are emulated, and for N = 1 it reads "1 runs". The text is `No violation found in ${n} runs of this gremlin set. Not a proof.`

This spec changes only the HELD text formatting. Verdict logic, the BROKE and COULDN'T TELL texts, and every cycle, seed, trace and run value stay as they are.

### Bug condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type VerdictInput
  OUTPUT: boolean

  // computeVerdict(X) returns HELD
  RETURN computeVerdict(X) is HELD   // N = X.runs.length, N >= 1
END FUNCTION
```

Every HELD text is affected: all lack "emulated", and the N = 1 text also has the wrong plural.

### Repo search

The search was run over the whole repo, excluding `node_modules`, `dist` and `.git`. It covered the patterns `No violation found`, `violation found in`, `gremlin set. Not a proof`, `runs of this gremlin`, `heldText`, `Not a proof`, `emulated run` and `${...} runs`. These are the real hits outside `.kiro/specs/`.

| # | File:line | What it holds | Action |
|---|---|---|---|
| H1 | `src/engine/verdict.ts:11-12` | `heldText` definition, old template | Fix (the only engine edit) |
| H2 | `src/engine/verdict.ts:120` | `computeVerdict` calls `heldText(runs.length)` | No edit |
| H3 | `src/engine/__tests__/campaign.handle.test.ts:234` | Literal `'No violation found in 3 runs of this gremlin set. Not a proof.'` in test `a quiet Campaign finishes with HELD and the real run count` (lines 231-236) | Literal edit, needs approval |
| H4 | `src/engine/__tests__/rules-verdict.test.ts:342` | Literal `"No violation found in 1 runs of this gremlin set. Not a proof."` in test `heldText(1) still reads 'runs' for one run` (lines 341-343) | Literal edit, needs approval |
| H5 | `src/engine/__tests__/rules-verdict.test.ts:346` | Literal `"No violation found in 2 runs of this gremlin set. Not a proof."` in test `heldText(2) reads '2 runs'` (lines 345-347) | Literal edit, needs approval |
| H6 | `src/engine/__tests__/copy-rules.test.ts:11,60,62` | Imports and calls `heldText(n)` for the banned-word check | No edit (builds through `heldText`) |
| H7 | `src/engine/__tests__/rules-verdict.property.test.ts:6,49` | `expect(v.text).toBe(heldText(n))` | No edit |
| H8 | `src/engine/__tests__/rules-verdict.test.ts:7,334` | `heldText(2)` in the held-outcome test | No edit |
| H9 | `src/engine/__tests__/verdict.property.test.ts:12,156` | `text: heldText(input.runs.length)` | No edit |
| H10 | `tests/examples/examples.crosswalk.test.ts:7,97` | `heldText(24)` | No edit |
| H11 | `tests/examples/examples.garage.test.ts:7,83` | `heldText(40)` | No edit |
| H12 | `tests/examples/examples.heartbeat.test.ts:9,156` | `heldText(24)` | No edit |
| H13 | `examples/README.md:18` | Results table, crosswalk: `no violation found in 24 runs of this gremlin set, not a proof` | Edit |
| H14 | `examples/README.md:19` | Results table, garage: `... in 40 runs ...` | Edit |
| H15 | `examples/README.md:20` | Results table, heartbeat: `... in 24 runs ...` | Edit |
| H16 | `.kiro/steering/verdicts.md:6` | `- HELD: "No violation found in N runs of this gremlin set. Not a proof." N is the real count.` | Edit |

Other "runs" wording found by the search, none of which is the HELD text and none of which changes:

- `src/engine/verdict.ts:33`, `runCountPhrase` ("1 run" / "N runs"), and `verdict.ts:36`, `triggerReason`.
- `src/engine/verdict.ts:109`, `Only ${runs.length} of ${input.requestedRuns} runs completed` (COULDN'T TELL reason).
- `src/engine/campaign.ts:495`, an invalid-campaign message.
- `bench/campaign-bench.ts:90` and `bench/example-campaign-bench.ts:135`, thrown error messages.

The pinned example literals in `tests/examples/` hold no HELD text literal. They use `heldText(N)`, so they need no edit and stay as they are.

Hits under `.kiro/specs/` (other specs):

- `.kiro/specs/gremlin-engine/design.md:842`, `requirements.md:51`, `tasks.md:20,354,369`
- `.kiro/specs/rule-compiler/design.md:526-527`
- `.kiro/specs/input-pullup/tasks.md:15`
- `.kiro/specs/example-firmware/design.md:248-250,2350-2351`

These hold the old text as history or as quoted source. They are listed for the record. This spec does not edit them, because the task limits doc edits to the README and the steering file. Spec text that quotes the old wording will be out of date, and the user decides whether to touch it.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `computeVerdict` returns HELD with N >= 2 completed runs THEN the system returns the text "No violation found in N runs of this gremlin set. Not a proof.", which does not say the runs are emulated

1.2 WHEN `computeVerdict` returns HELD with N = 1 completed run THEN the system returns the text "No violation found in 1 runs of this gremlin set. Not a proof.", which uses the plural "runs" for one run and does not say the run is emulated

### Expected Behavior (Correct)

N is the real count of completed runs, written as a plain integer with no thousands separator, as today.

2.1 WHEN `computeVerdict` returns HELD with N >= 2 completed runs THEN the system SHALL return the text "No violation found in N emulated runs of this gremlin set. Not a proof."

2.2 WHEN `computeVerdict` returns HELD with N = 1 completed run THEN the system SHALL return the text "No violation found in 1 emulated run of this gremlin set. Not a proof."

2.3 WHEN the HELD text is used in `examples/README.md` THEN the system SHALL read "24 emulated runs" (crosswalk), "40 emulated runs" (garage) and "24 emulated runs" (heartbeat) in the results table (lines 18-20), with nothing else in the README changed

2.4 WHEN a reader opens `.kiro/steering/verdicts.md` THEN the HELD line SHALL read exactly:
`- HELD: "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N = 1). N is the real count.`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a campaign has a violating run THEN the system SHALL CONTINUE TO return the BROKE verdict with the same trace and the same unchecked list

3.2 WHEN the rules cannot be checked with the signals, peripherals or run length available THEN the system SHALL CONTINUE TO return the COULDN'T TELL verdict with the same reason text and the same logic

3.3 WHEN any input is given to `computeVerdict` THEN the system SHALL CONTINUE TO return HELD under exactly the same conditions as today (same order of checks, same conditions, same `runs` field)

3.4 WHEN a campaign or a replay runs THEN the system SHALL CONTINUE TO produce the same cycles, seeds, traces and run values, including the pinned example literals in `tests/examples/`

3.5 WHEN a trigger reason or any other non-HELD text is built THEN the system SHALL CONTINUE TO use the "1 run" / "N runs" wording of `runCountPhrase` and `triggerReason`

3.6 WHEN the brand and banned-word tests scan `examples/README.md` and `heldText(n)` THEN the system SHALL CONTINUE TO pass them

### Property specification

```pascal
// Property: Fix Checking
FOR ALL N WHERE 1 <= N <= 2^32 DO
  text <- heldText'(N)
  ASSERT text = "No violation found in " + String(N) + " emulated "
                + (IF N = 1 THEN "run" ELSE "runs")
                + " of this gremlin set. Not a proof."
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT computeVerdict(X) = computeVerdict'(X)   // BROKE and COULDN'T TELL, texts included
END FOR
```

## Plan Constraints

### Rules

- No change to verdict logic or anything else under `src/engine/` except the HELD text formatting (H1).
- No new packages.
- At the end the full suite, typecheck, guard and build run clean.
- Never use the verdict strings (BROKE / HELD / COULDN'T TELL) to describe test results. Say "pass" and "fail".
- Kiro never commits.
- Workspace rules apply:
  - Do not weaken or change acceptance tests without approval.
  - Debug scripts are temporary and are deleted before a task is reported done.
  - Tests are evidence, not proof.
  - UI copy and docs must not use the words safe, secure, guaranteed, certified, real-time, first, unique or shortest.
  - The checker has no AI and no network calls. Randomness comes from a seeded PRNG passed in explicitly, and `Math.random` is not used in engine code.

### Test edits (stop for approval)

The user has approved the edits below (literals at the three lines, plus the three names in the ruling after the table). No other committed test may change. No assertion is weakened or removed.

| Test | File:line | Old literal | New literal |
|---|---|---|---|
| `a quiet Campaign finishes with HELD and the real run count` | `src/engine/__tests__/campaign.handle.test.ts:234` | `'No violation found in 3 runs of this gremlin set. Not a proof.'` | `'No violation found in 3 emulated runs of this gremlin set. Not a proof.'` |
| `heldText(1) still reads 'runs' for one run` | `src/engine/__tests__/rules-verdict.test.ts:342` | `"No violation found in 1 runs of this gremlin set. Not a proof."` | `"No violation found in 1 emulated run of this gremlin set. Not a proof."` |
| `heldText(2) reads '2 runs'` | `src/engine/__tests__/rules-verdict.test.ts:346` | `"No violation found in 2 runs of this gremlin set. Not a proof."` | `"No violation found in 2 emulated runs of this gremlin set. Not a proof."` |

User ruling (approved): the describe title at `rules-verdict.test.ts:340` and the test names at `:341` and `:345` are reworded to describe the new wording. Names only, no assertion changes. No other committed test may change. Old-text quotes in other specs under `.kiro/specs/` stay as they are (historical records).

Tests that build the text through `heldText()` (H6 to H12) need no edit.

### Order of work

1. Write the preservation baseline on the unfixed code, before any fix edit. It covers BROKE and COULDN'T TELL cases (texts and reasons), is stored as its own baseline file, and is checked by a fast-check test. Then STOP, so the user can commit the baseline before the fix.
2. After the user commits the baseline and approves the test edits, make the fix: H1, the three literal edits, H13 to H15 and H16.
3. Add the fix-checking property: fast-check, at least 200 runs, fixed seed, N drawn from 1 to 2^32, asserting the exact expected format.
4. Run the full suite, typecheck, guard and build. Delete any debug script. Report the result as evidence, not proof.
