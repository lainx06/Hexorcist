# Implementation Plan: trace-reducer

## Overview

The plan builds the Trace_Reducer in TypeScript, in the order the design layers it: record the Reference_Run, move the Run_Path out of `runOne` with no behavior change, build the pure Reducer_Core and its property tests, add the Emulator_Oracle, the Replay_Function and `createReducer`, add the Failure_Story and the Trace_Fingerprint, run the Emulator_Property, run the acceptance test on the three Examples with the Pinned_Literal procedure, write the "Reducer speed" note, and finish with the Done_Checks and a report.

Rules for every task:

- Kiro never commits and uses git only through `status`, `diff`, `log`, `show` and `ls-files` (Requirement 19.5).
- No package is added, removed or updated. `package.json` and `package-lock.json` stay byte-identical (Requirement 18.3).
- No change, rename, move or deletion of any Committed_Test_File, Baseline_File, Fixture_File, any file under `examples/`, or `tests/examples/examples-support.ts` (Requirements 19.1, 19.13).
- New engine code goes only in new files under `src/engine/reducer/`. The only committed engine file that changes is `src/engine/campaign.ts`, by the Run_Path move of task 2.2 (Requirement 19.2).
- No file created or changed under `src/engine/` (tests included) contains `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval` or `new Date(` (Requirement 19.15).
- Temporary or debug scripts live only at `scripts/tmp-*.ts` and are deleted before a task is reported done (Requirement 19.4).
- Every property test is one `fc.assert` with integer-literal `seed` and `numRuns` from the design's table and the tag comment `// Feature: trace-reducer, Property N: <title>` (Requirement 15.1).
- A failing test of Requirement 15 or 16 may be fixed only in Kiro's own new non-test code under `src/engine/reducer/` or the Run_Path move. No assertion is removed or loosened, no `numRuns` lowered, no seed changed after a failure, no Branch_Counter check removed, no `skip`, `only` or `todo`, no Pinned_Literal changed (Requirements 15.12, 19.3, 19.11).
- **STOP rule.** When a task below says STOP, write the Requirement 19.12 report (the criterion, what the test or check expects, what happened, the evidence with command, exit code, output lines and file:line, the output of `git status --porcelain --untracked-files=all`, and every `scripts/tmp-*.ts` still present), then change no file and start no further task until the user replies. Do not delete `scripts/tmp-*.ts` files at a STOP.
- Test results are described only as "pass" or "fail" and as evidence, not proof. No verdict string describes a test result (Requirement 18.2).

## Tasks

- [x] 1. Record the Reference_Run before any file change
  - [x] 1.1 Run `npx vitest --run` and `node scripts/guard.mjs` on the untouched tree
    - Confirm with `git status --porcelain --untracked-files=all` that no file has been changed by this spec yet
    - Record each command's exit code and the names of every failing test as the Reference_Run, and keep it for the later STOP checks of Requirement 19.7
    - **STOP** (Requirement 19.6) if `node scripts/guard.mjs` exits with a code other than 0, or if the guard hook `.kiro/hooks/guard-before-task.json` blocks the task
    - _Requirements: 19.6, 19.14_

- [x] 2. Move the Run_Path out of `runOne` into `runEventList`, with no behavior change
  - [x] 2.1 Write the verbatim reference copy `src/engine/__tests__/reducer-run-path.reference.ts` before editing `campaign.ts`
    - Export `referenceRunOne(cfg, runIndex)`, a character-for-character copy of the current `runOne` body (`src/engine/campaign.ts` lines 155 to 265 as quoted in the design), renamed only
    - Copy the module-private helpers it needs (`callChecker`, `checkerError`, `internal`, `defaultBridgeFactory`) verbatim into the same file; import the exported ones (`mergeApplied`, `buildEventList`, `checkPlanInput`, `planTarget`, `isEngineError`, `isBridgeError`, types) from their modules
    - This file is a new test-side file; it is the only second copy of the Step loop and it is never imported by `src/engine/reducer/`
    - _Requirements: 3.5_
  - [x] 2.2 Extract `runEventList` in `src/engine/campaign.ts`
    - Add the exported `RunPathConfig` (a `Pick` of `RunConfig`) and `RunPathResult` types and the exported function `runEventList(cfg, events, runIndex)` holding old lines 166 to 251, with `gen.events` written `events` (old lines 195 and 214) and no other change
    - Shorten `runOne` to `buildEventList`, then `runEventList(cfg, gen.events, runIndex)`, then the result literal with the same keys in the same order, as in the design's "After" block
    - Leave `callChecker`, `mergeApplied`, `RunConfig`, `RunResult`, the Campaign handle and every other line unchanged
    - _Requirements: 3.4, 3.5, 19.2_
  - [x] 2.3 Write the Property 16 test and the `runEventList` error-path examples in `src/engine/__tests__/reducer-run-path.property.test.ts`
    - **Property 16: runOne is unchanged by the Run_Path move**
    - Generate `RunConfig` values on the blink_button HEX (BUTTON, LED, analog POT), a catalogue gremlin set, a campaign seed, Run_Cycles 30,000 to 150,000, Max_Step_Cycles 1,000 to 160,000, a fresh LED level-timeout Checker on each side, Run_Index 0 to 3; assert `runOne(cfg, i)` is `toStrictEqual` to `referenceRunOne(cfg, i)`
    - `seed: 20261216`, `numRuns: 100`, timeout 300,000 ms
    - Example tests with a fake `bridgeFactory`: bridge creation error, `advance` error, a bridge that does not advance (`internal-error`), and a throwing Checker (`checker-error`); each error from `runEventList` equals the one `referenceRunOne` gives for the same events
    - **Validates: Requirements 3.4, 3.5**

- [x] 3. Checkpoint: the Run_Path move changes no committed result
  - Run `npx vitest --run` and `node scripts/guard.mjs`. Every committed test (including `campaign.*.test.ts`, `gremlin-baseline.test.ts`, `bridge-output-scan-preservation.test.ts` and `tests/examples/*`) must pass unchanged, and Property 16 must pass.
  - **STOP** (Requirement 19.7) if a committed test fails and either it failed in the Reference_Run or Kiro cannot name the file and line of its own change that causes it. **STOP** (Requirement 19.6) if the guard exits non-zero.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 3.5, 19.6, 19.7_

- [x] 4. Reducer types, errors and event helpers
  - [x] 4.1 Create `src/engine/reducer/types.ts` and `src/engine/reducer/reducer-error.ts`
    - `types.ts`: type-only definitions from the design's Data Models (`ReducerEvent`, `CandidatePart`, `OracleOutcome`, `Oracle`, `TargetRule`, `ProgressReport`, `ReducerResult`, `StepReport`, `ReducerErrorKind`, `ReducerError`), using `import type` only
    - `reducer-error.ts`: `isReducerError` (true for the five kinds with a string `message`) and `invalidInput(message, extra)`; messages use the design's fixed wording and hold no BANNED_WORDS entry
    - No file under `src/engine/reducer/` holds the letters h-a-s-h in any case
    - _Requirements: 2.5, 5.2, 10.9, 11.4, 12.2, 14.6_
  - [x] 4.2 Create `src/engine/reducer/events.ts` with no runtime imports
    - Constants `REST_ID`, `UNLIMITED_BUDGET`, `DEFAULT_BUDGET` (300), `DEFAULT_MAX_STEP_CYCLES` (160,000), `MAX_RUN_CYCLES` (2^32), repeated, not imported (choice D9)
    - `isRest`, `gremlinCount`, `copyEvent`, `copyList`
    - `checkEventList(list, fixture, { runCycles })`: the per-index checks of the design in order, stopping at the lowest failing index, rejecting unknown own keys (choice D6), never throwing on holes, `null` or throwing reads
    - `presentedValues`, `noChangeIndexes`, `findBursts`, `snapValue`, `isSnapEligible` as defined in the design
    - _Requirements: 1.5, 2.8, 3.11, 6.1, 6.4, 6.6, 7.1, 8.4, 13.19_
  - [x] 4.3 Create the shared test helpers `src/engine/__tests__/reducer-arbitraries.ts`
    - Fixture generator (1 to 4 inputs plus output `OUT`, digital pins with `activeLevel` and `restState` variants, analog pins with `restLevel` variants)
    - Original_List generator (Rest_Events first as fact F5, 0 to 40 Gremlin_Events with count from `oneof(0..3, 0..12, 0..40)`, sorted cycles, the value pools of the design) and the structured families (same-value burst, alternating burst, analog band)
    - Synthetic_Oracle data `{ required, bands, parity, other, cycleRule }` turned into a pure function of the Candidate's contents that always breaks the Original_List
    - Budget generator `oneof(integer 1..300, constant 2^53 − 1)` and slice-size generator
    - Oracle_Log recorder (deep copies at call time) and Progress_Report recorder
    - Reference Presented_Value, No_Change_Event and Burst functions written directly from the glossary
    - No `Math.random` and no clock reads
    - _Requirements: 15.10, 15.11_
  - [x] 4.4 Write the Property 9 test in `src/engine/__tests__/reducer-events.property.test.ts`
    - **Property 9: Event helpers match their definitions**
    - Compare `presentedValues`, `noChangeIndexes` and `findBursts` with the reference functions of 4.3; check `snapValue(x)` exhaustively for every x from 0 to 1023 in the same test (256 gives 512)
    - `seed: 20261209`, `numRuns: 300`, timeout 60,000 ms
    - **Validates: Requirements 6.1, 6.4, 7.1, 8.4**

- [x] 5. Reducer_Core: passes, search generator and step driver
  - [x] 5.1 Create `src/engine/reducer/passes.ts`
    - Internal `Entry { src, ev }` and the Candidate builders `removeIds` (drops Gremlin_Events only, skips Rest_Events) and `snapIds` (sets `analog` to its Snap_Value), both keeping list order and copying kept events
    - Generator parts `ddmin`, `passA`, `passB`, `passC`, each yielding one Probe per Candidate, reading the Best_List after every `yield`, and returning whether it had an Accepted_Change, exactly as the design's pseudocode states (ddmin from n = 2 with contiguous chunks, complements skipped at n = 2, empty Gremlin list at L = 1; Pass_A remove-all then singles; Pass_B keep-last 1, 2, 4, … per Burst; Pass_C snap-all then singles)
    - Runtime imports: `events.ts` only
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.8, 5.12, 5.13, 6.2, 6.3, 6.5, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.5, 8.6_
  - [x] 5.2 Create `src/engine/reducer/core.ts` with `createReducerCore`
    - Input checks in the design's order (Oracle, sentence, Budget, Fixture, `originalList`, `checkEventList` with no Run_Cycles bound, `onProgress`); any failure gives `invalid-input` naming the field or index, with no Oracle call; then private copies (`copyList`, `structuredClone(fixture)` in a `try`)
    - The `search` generator: Confirmation_Run, then Rounds of ddmin, Pass_A, Pass_B, Pass_C with no short-circuit, ending after a Round with no Accepted_Change
    - The `step(k)` driver: ended handles return a deep copy of the stored final Step_Report for any k (choice D12); invalid k gives `invalid-input` naming `k` with state unchanged; Pending_Candidate computed right after each call (choice D23); Budget check before each call; fresh deep copy per Oracle call; `normalize` treating Promises, `then` functions, unknown kinds, bad Violations and throwing reads as Malformed_Outcomes; Same_Rule_Break by exact string equality; owned copies of the Best_List and the Violation; one progress call per non-error Oracle call; `original-does-not-break`, `oracle-error` (with `cause` only for a thrown `{ kind, message }`), `callback-error` as final errors
    - Runtime imports: `passes.ts`, `events.ts`, `reducer-error.ts` only; no runtime path to `emulator-bridge.ts`, `campaign.ts` or avr8js; no wall clock
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10, 5.11, 6.6, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 11.8, 11.9, 12.1, 12.7_

- [x] 6. Pure property tests of the Reducer_Core in `src/engine/__tests__/reducer-core.property.test.ts`
  - [x] 6.1 Write the Property 1 test
    - **Property 1: Every Candidate is the Original_List or one edit of the Best_List**
    - Check the Oracle_Log against the Best_List at each call (the Original_List, or the latest Progress_Report `bestList`): entry 1 is the Original_List with part `confirm`; later entries are one Removal_Change (`ddmin`, `passA`, `passB`) or one Snap_Change (`passC`); no entry after the Confirmation_Run equals the Best_List; no Oracle call before the earliest `step`
    - `seed: 20261201`, `numRuns: 250`, timeout 120,000 ms
    - **Validates: Requirements 1.10, 2.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.13, 7.2, 8.1, 8.2, 8.6**
  - [x] 6.2 Write the Property 2 test with its Branch_Counters
    - **Property 2: A Reducer_Result is sound**
    - Re-call the same Oracle on a copy of the Reduced_List outside the reduction and check a Same_Rule_Break with equal `rule` and `cycle`; check the recorded Violation, both counts, the subsequence mapping of Requirement 11.6, the no-accept case, `candidatesTried` 1 for zero Gremlin_Events, `candidatesTried` from 1 to the Budget and equal to the Oracle_Log length, and the strict JSON round-trip
    - Branch_Counters `stoppedAtBudgetTrue`, `stoppedAtBudgetFalse`, `acceptedDdmin`, `acceptedPassA`, `acceptedPassB`, `acceptedPassC`, `otherRuleAnswer`, each asserted greater than 0 after `fc.assert`
    - `seed: 20261202`, `numRuns: 250`, timeout 120,000 ms
    - **STOP** (Requirements 15.12, 19.11) if a Branch_Counter is 0: record the seed and the counterexample, change nothing in the test
    - **Validates: Requirements 5.6, 5.7, 5.11, 9.2, 9.9, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.2, 15.2, 15.3, 15.4, 15.5**
  - [x] 6.3 Write the Property 3 test
    - **Property 3: An unbudgeted end is 1-minimal**
    - For each Gremlin_Event of a Reduced_List with `stoppedAtBudget` false, call the Oracle on the list with only that event removed and check no Same_Rule_Break; check each such list appears in the Oracle_Log after the last Accepted_Change
    - `seed: 20261203`, `numRuns: 250`, timeout 120,000 ms
    - **Validates: Requirements 5.4, 5.8, 5.9, 5.12, 15.6**
  - [x] 6.4 Add the reference search model to `reducer-arbitraries.ts` and write the Property 4 test
    - Reference model: a test-side reimplementation of Round, ddmin and the three passes from the design text, driven by the same Oracle
    - **Property 4: Rounds and passes follow the fixed order**
    - Check the part pattern (`ddmin`* `passA`* `passB`* `passC`*)+, equality of Oracle_Log, part labels and Reducer_Result with the model, and the direct log checks of the design for each part
    - Branch_Counters `passARun`, `passBRun`, `passCRun`, each asserted greater than 0
    - `seed: 20261204`, `numRuns: 250`, timeout 120,000 ms
    - **STOP** (Requirements 15.12, 19.11) if a Branch_Counter is 0
    - **Validates: Requirements 5.3, 5.5, 6.2, 6.3, 6.5, 7.3, 7.4, 8.3, 8.5**
  - [x] 6.5 Write the Property 5 test
    - **Property 5: Determinism and slicing invariance**
    - Two fresh-handle runs on deep copies give equal Oracle_Logs, Progress_Reports and results; a sliced run with invalid k values (0, −1, 1.5, `NaN`, `"3"`, `Infinity`) mixed in equals one `step(Budget)`; invalid k gives `invalid-input` naming `k` with no calls; each valid `step(k)` makes at most k calls, fewer only when `ended`; Step_Report counts match the latest Progress_Report; two interleaved handles each match their solo run
    - `seed: 20261205`, `numRuns: 200`, timeout 120,000 ms
    - **Validates: Requirements 5.10, 9.8, 10.2, 10.3, 10.4, 10.7, 12.1, 12.7, 15.7**
  - [x] 6.6 Write the Property 6 test
    - **Property 6: A Budget cuts the unbudgeted run at the same point**
    - From an Unlimited_Budget run with T calls: Budgets T and T + 1 give the same result with `stoppedAtBudget` false; for T ≥ 2, Budgets T − 1 and a generated B from 1 to T − 1 give the leading b log entries and Progress_Reports, `candidatesTried` b, `stoppedAtBudget` true and the Best_List and Violation of unlimited report b; later `step` calls on ended handles make no Oracle call
    - `seed: 20261206`, `numRuns: 200`, timeout 120,000 ms
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6, 11.7, 15.8**
  - [x] 6.7 Write the Property 7 test with its Branch_Counters
    - **Property 7: Oracle answers are handled as specified**
    - Scripted answers per call number (Same_Rule_Break, `does-not`, other-rule `breaks`, thrown `Error`, thrown `{ kind, message }`, each Malformed_Outcome of the design) and an optional throwing progress call; check every outcome rule of the design, including the error at the Budget call winning and the recorded Violation surviving later changes to the returned object
    - Branch_Counters `endedOriginalDoesNotBreak`, `endedOracleThrew`, `endedMalformed`, `endedCallbackError`, each asserted greater than 0
    - `seed: 20261207`, `numRuns: 300`, timeout 120,000 ms
    - **STOP** (Requirements 15.12, 19.11) if a Branch_Counter is 0
    - **Validates: Requirements 2.3, 2.4, 2.5, 5.2, 9.2, 9.7, 10.5, 10.6, 10.9, 10.10, 11.9**
  - [x] 6.8 Write the Property 8 test
    - **Property 8: Caller changes after the fact change nothing**
    - Run on `createReducerCore` with a Synthetic_Oracle; change every passed object, every Candidate inside the Oracle during and after the call, every Progress_Report `bestList` and every returned Step_Report and Reducer_Result; compare with an unchanged run; check later `step` results equal the first result and the inputs equal their snapshot
    - `seed: 20261208`, `numRuns: 200`, timeout 120,000 ms
    - **Validates: Requirements 1.6, 2.3, 2.6, 10.8, 11.8**

- [x] 7. Checkpoint: the Reducer_Core properties pass
  - Run `npx vitest --run` and `node scripts/guard.mjs`. Properties 1 to 9 and 16 pass, and every committed test still passes.
  - Confirm every `fc.assert` written so far has an integer-literal `seed` and a `numRuns` of at least 200 (Pure_Properties) as in the design's table.
  - **STOP** (Requirement 19.11) if a property fails and Kiro concludes the test's expectation is wrong, a fix would need a test change, or the cause is outside its new code. **STOP** (Requirement 19.7) on a committed test failure Kiro cannot trace to its own change. **STOP** (Requirement 19.6) if the guard exits non-zero.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 15.1, 15.12, 19.6, 19.7, 19.11_

- [x] 8. Emulator_Oracle, Replay_Function and `createReducer`
  - [x] 8.1 Create `src/engine/reducer/emulator-run.ts`
    - `makeEmulatorOracle(ctx)`: computes `targetMatches` once with `render`; per Candidate calls `compileRuleSet` for a fresh Checker, then `runEventList` with `copyList(candidate)` and Run_Index 0; throws the plain `{ kind, message }` on an `EngineError`; returns `breaks` only for the Target_Rule sentence, else `does-not`; holds no state between calls
    - `replayEventList(input)`: checks in the order of choice D22, then one `runEventList` run; `replay-error` with `cause` and no edges on a Run_Path error; otherwise `{ violation, outputEdges }` as plain copies; an outer `try` so it never throws
    - Imports: `../campaign` (`runEventList`), `../rules/compile`, `../rules/render`, `import type` only for `../emulator-bridge`, `events.ts`, `reducer-error.ts`; no call to `advance(` or `planTarget(`
    - _Requirements: 3.1, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 12.4, 12.5, 12.6, 12.8_
  - [x] 8.2 Create `src/engine/reducer/reducer.ts` with `createReducer` and `createEmulatorOracle`
    - Input_Checks 1 to 12 of the design in order, each field read once inside a `try`; `structuredClone` copies of Fixture and Rule_Set (choice D11); defaults 160,000 and 300 only for missing or `undefined`; compile check with `reasons` copied in order; event checks with the Run_Cycles bound; Target_Rule lookup by `render`; options checked last (choice D10); an outer `try` so it never throws
    - Wire `makeEmulatorOracle` into `createReducerCore`; no Oracle call and no bridge creation before the earliest `step`
    - `createEmulatorOracle(input, options)` runs checks 1 to 11 and returns the Emulator_Oracle for that Reduction_Input (choice D20)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 3.2, 9.1, 10.1_
  - [x] 8.3 Write the Property 10 test in `src/engine/__tests__/reducer-input.property.test.ts`
    - **Property 10: Invalid Reduction_Inputs are rejected in the fixed order, without throwing**
    - Valid base: crosswalk buggy HEX text and a generated `render`-able `never` Rule_Set over the generated Fixture's output pin; corruptions as listed in the design (whole input from `fc.anything()`, bad field, throwing getter, corrupted events at generated indexes, a Violation `rule` of no Rule); check `createReducer` and `createReducerCore` never throw, return the earliest failing check's error naming the field or lowest index, and make no Oracle call; a counting `bridgeFactory` that returns an error stays at 0 creations
    - `seed: 20261210`, `numRuns: 300`, timeout 120,000 ms
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.7, 1.9, 2.8, 3.2, 6.6**
  - [x] 8.4 Write the emulator example tests in `src/engine/__tests__/reducer-emulator.test.ts`
    - Compile failure gives `invalid-input` with every reason in order and no bridge (3.2); one bridge per Candidate (3.3); a breaking Candidate stops after its Step with no end-of-run call (3.6); heartbeat's second Rule maps to `does-not` (3.8); fake-factory bridge, Step and Run_Path errors give `oracle-error` with kind, message and Candidate number (3.9); replay edges include the whole last Step (3.10); replay input errors create no bridge (3.11); replay Run_Path errors give `replay-error` with no edges (3.12); the same Candidate twice with other Candidates between, and the same replay twice, give deep-equal results with no memo (3.13, 12.8)
    - _Requirements: 3.2, 3.3, 3.6, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 12.8_
  - [x] 8.5 Write the unit tests in `src/engine/__tests__/reducer-core.test.ts`
    - Defaults: missing or `undefined` Budget gives 300 and Max_Step_Cycles 160,000; `null` for either is `invalid-input` (1.8, 9.1)
    - One example per Reducer_Error kind with its exact message text and fields (choice D24), and a check that no message built by an error path holds a BANNED_WORDS entry
    - Step_Report shapes: `ended` false mid-run, `result` only on a result, `error` only on an error
    - _Requirements: 1.8, 2.5, 5.2, 9.1, 10.3, 10.7, 10.9, 11.1_

- [x] 9. Trace_Fingerprint and Failure_Story
  - [x] 9.1 Create `src/engine/reducer/fingerprint.ts`
    - `traceFingerprint(edges)`: "the input is not a list" for a non-array; per index in order the object, `cycle`, `signal`, `value` checks naming the lowest index and field; Edge_Lines `JSON.stringify([cycle, signal, value]) + "\n"` encoded with the global `TextEncoder`; never throws
    - `fingerprintBytes(bytes)`: FNV-1a 64-bit with BigInt local to the function, 16 lowercase hex digits
    - Every exported name contains "fingerprint"; no name, comment or text calls it a security measure; runtime imports `reducer-error.ts` only
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_
  - [x] 9.2 Create `src/engine/reducer/story.ts`
    - `msText(c)` with BigInt inside the function: `t = (c + 800) / 1600` truncated, written `t/10.t%10 ms`
    - `failureStory(input)`: input checks in the design's order (including choice D13 name rules and whole-word BANNED_WORDS checks on written ids, signal names and the `rule`); the fixed templates; greedy packing at 30 Story_Words; Detailed_Form, then Summary_Form, then the "does not fit" error; the no-event opening; the violation sentence and the optional span sentence; reads its arguments and never writes them; never throws
    - Runtime imports: `events.ts`, `fingerprint.ts`, `reducer-error.ts`, `../copy-rules`
    - _Requirements: 12.2, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 13.15, 13.16, 13.17, 13.18, 13.19_
  - [x] 9.3 Add the story, Ms_Text and fingerprint references to `reducer-arbitraries.ts`
    - Reference story renderer from the design's templates and packing rules (also deciding Detailed_Form or Summary_Form)
    - Reference Ms_Text with decimal string arithmetic on `c.toString()`
    - Reference FNV-1a 64-bit with two 32-bit halves and `Math.imul`, plus the test's own UTF-8 encoder
    - Story input and Output_Edge generators (0 to 12 Gremlin_Events, digital and analog, Rest_Events, Violation from `render` of a generated Rule, optional span with either cut flag; edge signals with ASCII, non-ASCII, astral characters, commas, quotes and line feeds)
    - _Requirements: 15.9, 15.11_
  - [x] 9.4 Write the Property 14 test in `src/engine/__tests__/reducer-fingerprint.property.test.ts`
    - **Property 14: Trace_Fingerprint is FNV-1a 64-bit over the Edge_Lines**
    - 0 to 60 valid edges, cycles up to 2^53 − 1, extra properties on some edges; 16-character `[0-9a-f]` result equal to the reference; extra properties do not change it; two calls on deep copies are identical; inputs equal their snapshots; no BANNED_WORDS entry in the text
    - `seed: 20261214`, `numRuns: 300`, timeout 60,000 ms
    - **Validates: Requirements 14.1, 14.2, 14.4, 15.9**
  - [x] 9.5 Write the Property 15 test in `src/engine/__tests__/reducer-fingerprint.property.test.ts`
    - **Property 15: Trace_Fingerprint rejects bad input without throwing**
    - Inputs from `fc.anything()`, sparse arrays and corrupted edge arrays; never throws; "not a list" for non-arrays; the lowest corrupted index and earliest failing field in the order `cycle`, `signal`, `value`; no BANNED_WORDS entry in any returned text or message
    - `seed: 20261215`, `numRuns: 300`, timeout 60,000 ms
    - **Validates: Requirements 14.5, 14.7, 14.8**
  - [x] 9.6 Write the fingerprint vector tests in `src/engine/__tests__/reducer-fingerprint.test.ts`
    - `traceFingerprint([])` is `cbf29ce484222325`; `fingerprintBytes(new Uint8Array([0x61]))` is `af63dc4c8601ec8c`; the two Edge_Line examples of the glossary give their exact bytes
    - _Requirements: 14.2, 14.3_
  - [x] 9.7 Write the Property 11 test in `src/engine/__tests__/reducer-story.property.test.ts`
    - **Property 11: Failure_Story structure**
    - All structure checks of the design (one line, 2 to 4 sentences, opening phrase once, "smallest" nowhere else, every `gremlinId`, at most 30 Story_Words outside the rule, violation and span sentence positions, "at least " exactly when cut, no-event case, allowed Story_Numbers, no BANNED_WORDS entry, equality with the reference renderer, identical text on deep copies, arguments unchanged)
    - Branch_Counters `detailedForm`, `summaryForm`, `zeroEvents`, `withSpan`, `cutSpan`, each asserted greater than 0
    - `seed: 20261211`, `numRuns: 300`, timeout 60,000 ms
    - **STOP** (Requirements 15.12, 19.11) if a Branch_Counter is 0
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 13.17, 15.9**
  - [x] 9.8 Write the Property 12 test in `src/engine/__tests__/reducer-story.property.test.ts`
    - **Property 12: Failure_Story rejects bad input without throwing**
    - Inputs from `fc.anything()` and valid inputs with one corruption each (bad event field, unmapped signal, wrong-kind value, bad Violation, bad edge, bad span, a BANNED_WORDS entry inserted as a whole word into a written id, signal or the `rule`, ids too long for both forms); never throws; `invalid-input` naming the corrupted field or index; "does not fit" message for the long ids; deep-equal errors on deep copies
    - `seed: 20261212`, `numRuns: 300`, timeout 60,000 ms
    - **Validates: Requirements 13.15, 13.16, 13.18, 13.19, 15.9**
  - [x] 9.9 Write the Property 13 test in `src/engine/__tests__/reducer-story.property.test.ts`
    - **Property 13: Ms_Text is the 1-decimal millisecond text of cycles / 16,000**
    - c from 0 to 2^53 − 1 with extra weight near multiples of 1,600 and 16,000; matches `^\d+\.\d ms$` and equals the reference
    - `seed: 20261213`, `numRuns: 500`, timeout 60,000 ms
    - **Validates: Requirements 12.2, 13.9**
  - [x] 9.10 Write the exact-text story tests in `src/engine/__tests__/reducer-story.test.ts`
    - One exact expected text per template (press, release, drove, set, summary single and multi, no-event, span cut and not cut), the design's crosswalk-like example, the Summary_Form fallback, and the "does not fit" error; `msText` examples 0, 799, 800, 24,000 and 15,647,543
    - _Requirements: 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.12, 13.17, 13.18_

- [x] 10. Static source checks of the reducer files
  - [x] 10.1 Write `src/engine/__tests__/reducer-source.test.ts`
    - Every import, dynamic import and `require` under `src/engine/reducer/` is relative and resolves under `src/engine/` outside `__tests__`; no file names `avr8js`; no runtime import of `prng`, `run-seed` or `event-list`
    - The runtime import closure of `core.ts` reaches neither `emulator-bridge.ts` nor `campaign.ts`
    - No reducer file holds the letters h-a-s-h in any case, or any API of fact F8
    - `emulator-run.ts` calls `runEventList` and `compileRuleSet`; no reducer file calls `advance(` or `planTarget(`
    - The `events.ts` constants equal `DEFAULT_MAX_STEP_CYCLES` and `MAX_RUN_CYCLES` of `campaign.ts`
    - _Requirements: 2.2, 3.1, 3.4, 12.3, 12.4, 12.5, 12.6, 14.6, 19.15_

- [x] 11. Checkpoint: all pure and emulator example tests pass
  - Run `npx vitest --run` and `node scripts/guard.mjs`. Every new test written so far and every committed test pass, and the guard prints `guard: clean`.
  - Confirm every new `fc.assert` has an integer-literal `seed` and a `numRuns` of at least 200, as in the design's table.
  - **STOP** (Requirements 19.6, 19.7, 19.11) under the same conditions as task 7.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 12.3, 15.1, 19.6, 19.7, 19.11_

- [x] 12. Emulator_Property on the Example_Traces
  - [x] 12.1 Write the Property 17 test in `src/engine/__tests__/reducer-emulator.property.test.ts`
    - **Property 17: Reductions of the Example_Traces are sound on the emulated chip**
    - `beforeAll` computes each Example_Trace once with `runExampleCampaign(ex, "buggy")` and fails with the Example id and verdict when it is not BROKE
    - The Oracle is a test-side memo around `createEmulatorOracle` (choice D17), keyed by key-sorted JSON per Example
    - Example from `crosswalk`, `garage`, `heartbeat`; Budget from `oneof(integer 1..8, integer 1..300)`; apply the checks of Properties 2 and 3 with the Emulator_Oracle, and of Property 5 for two runs and one sliced run
    - Branch_Counters `stoppedAtBudgetTrue`, `stoppedAtBudgetFalse`, `acceptedDdmin`, each asserted greater than 0
    - `seed: 20261217`, `numRuns: 20`, timeout 1,200,000 ms
    - **STOP** (Requirements 15.12, 19.11) if a Branch_Counter is 0 or a counterexample is found and the fix is outside Kiro's new non-test code
    - **Validates: Requirements 3.7, 3.8, 3.13, 12.8, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.11**

- [x] 13. Acceptance test on crosswalk, garage and heartbeat
  - [x] 13.1 Write `src/engine/__tests__/reducer-examples.test.ts` with every Pinned_Literal entry `null`
    - One `it` per Example, timeout 600,000 ms each, using `loadExample`, `readHex` and `runExampleCampaign` from `tests/examples/examples-support.ts` unchanged
    - Steps 1 to 8 of the design: BROKE check with message `<id>: campaign verdict was <verdict>, expected BROKE` and no reduction otherwise; Reduction_Input with default Max_Step_Cycles and Budget; `createReducer` then `step(300)`; error message `<id>: <function> returned <kind>: <message>`; buggy replay check (non-null, Target_Rule sentence, same cycle); fixed replay check (`null`, printed when not); 1-minimality with `createEmulatorOracle` when `stoppedAtBudget` is false, otherwise print `<id> 1-minimality not checked: the Budget was reached`; the printed lines of Requirement 16.2 (story with no Violation_Span, fingerprint of the buggy replay edges)
    - `const PINNED: Record<"crosswalk" | "garage" | "heartbeat", Pinned | null>` with all entries `null`; while `null`, print `<id> PIN originalEventCount=<a> reducedEventCount=<b> candidatesTried=<c> fingerprint=<f>`; when set, exact-equality checks failing with `<id> <field>: pinned <x>, printed <y>`
    - No memo in this file
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.7, 16.8, 16.9, 16.10_
  - [x] 13.2 Run the acceptance file to get the First_Green_Run
    - Run `npx vitest --run src/engine/__tests__/reducer-examples.test.ts` and keep the full printed output
    - **STOP** (Requirements 16.8, 19.12) if an Example's campaign verdict is not BROKE
    - **STOP** (Requirement 19.8) if a buggy replay of a Reduced_List reports no Violation or another Rule
    - **STOP** (Requirement 19.9) if a fixed-build replay reports any Violation
    - **STOP** (Requirement 19.10) if a 1-minimality check finds a Same_Rule_Break
    - **STOP** (Requirement 19.11) if a test case fails for any other reason that Kiro cannot fix in its own new non-test code without a test change
    - A run counts as the First_Green_Run only when all three test cases pass criteria 1 to 5, 8 and 9
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.8, 16.9, 19.8, 19.9, 19.10_
  - [x] 13.3 Copy the Pinned_Literals into `PINNED` exactly, then rerun
    - Copy each Example's `originalEventCount`, `reducedEventCount`, `candidatesTried` and fingerprint character for character from the First_Green_Run's `PIN` lines; no rounding, no tuning
    - Change no Budget, Max_Step_Cycles, Run_Cycles, `meta.json` value or reducer code to move a printed value
    - Rerun the file; all three cases pass the exact-equality checks
    - **STOP** (Requirements 16.10, 19.16) if a printed value differs from its literal; leave the literal unchanged
    - _Requirements: 16.6, 16.10, 19.3, 19.16_

- [x] 14. "Reducer speed" note in `SPIKE.md`
  - [x] 14.1 Write and run the Temporary_Script `scripts/tmp-reducer-speed.ts`
    - Build each Example's Reduction_Input exactly as acceptance step 2, outside the timed span
    - Time with `performance.now()` (allowed in `scripts/` only) from just before `createReducer` until the Step_Report of one `step(300)` call has `ended` true; 3 runs per Example in one process, none dropped
    - Check each run against the Pinned_Literals (`candidatesTried`, `originalEventCount`, `reducedEventCount`) and for no Reducer_Error
    - Print the Node version, `os.type()`, `os.release()`, `os.arch()`, CPU model and logical core count, the date, the 3 times in seconds with 3 decimals, the median, and the Per_Candidate_Time in milliseconds with 1 decimal
    - Run once with `npx tsx scripts/tmp-reducer-speed.ts`
    - **STOP** (Requirements 17.7, 19.12) on a Reducer_Error or a count mismatch; write no section and keep the script for the report
    - _Requirements: 17.3, 17.6, 17.7_
  - [x] 14.2 Append the "Reducer speed" section to `SPIKE.md`
    - Exactly one section after the last existing one; every other line of `SPIKE.md` unchanged
    - Per Example: `candidatesTried`, the 3 Reduction_Wall_Times in run order, the median and the Per_Candidate_Time; once: Node version, OS, CPU model and core count, the date, and the Method_Text (timed span, 3 repeats, median, slice size 300, deleted Temporary_Script under `npx tsx`)
    - State that all figures were measured on one machine, standalone under `tsx`, with no browser measurement
    - Refer to the reduced list only as "the smallest replay this reducer found"; no BANNED_WORDS entry
    - _Requirements: 17.1, 17.2, 17.5, 17.8_
  - [x] 14.3 Delete `scripts/tmp-reducer-speed.ts` and every other `scripts/tmp-*.ts`
    - Confirm that no file matches `scripts/tmp-*.ts` and that `git status --porcelain --untracked-files=all` lists no `scripts/tmp-*` path
    - _Requirements: 17.4, 19.4_

- [x] 15. Done_Checks on the Final_Tree and final report
  - [x] 15.1 Check the tree before the Done_Checks
    - `git status --porcelain --untracked-files=all` lists only `src/engine/campaign.ts`, `SPIKE.md`, the new files under `src/engine/reducer/`, the new test files under `src/engine/__tests__/`, and the spec files under `.kiro/specs/trace-reducer/` (including task status marks in `tasks.md`)
    - `git diff --exit-code package.json package-lock.json` shows no change; no committed test, baseline, fixture or `examples/` file appears in `git status`
    - No `scripts/tmp-*` file is present
    - No git subcommand other than `status`, `diff`, `log`, `show` and `ls-files` was run during the spec
    - _Requirements: 18.3, 19.1, 19.2, 19.4, 19.5, 19.13_
  - [x] 15.2 Run the four Done_Checks once each with no extra arguments
    - `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`, after the last file change
    - Each must give a Clean_Result: exit 0; Vitest with 0 failed tests and files and no skip other than committed skip or todo marks; the guard prints `guard: clean`
    - If one fails because of Kiro's new code: fix only that code (within Requirement 19.1 to 19.3), then run all four again on the new Final_Tree
    - **STOP** (Requirements 18.4, 19.6, 19.7, 19.12) if a Done_Check fails for a cause outside Kiro's new code
    - _Requirements: 18.1, 18.4_
  - [x] 15.3 Write the final report
    - For each Done_Check: the command and its exit code; for `npx vitest --run`: the number of test files, tests, and pass, fail and skip counts
    - The Reference_Run from task 1.1, the Pinned_Literals, and the file list from `git status --porcelain --untracked-files=all`
    - Describe results only as "pass" or "fail" and as evidence, not proof; use no verdict string for a test result; refer to the reduced list only as "the smallest replay this reducer found"
    - _Requirements: 15.13, 18.2, 18.5_

## Notes

- No sub-task is optional. The user asked for every property and acceptance test explicitly, and the unit and example tests are the only evidence for several criteria (for example 3.2, 3.9, 3.11, 3.12, 12.3 to 12.6 and 14.3).
- Each task references specific requirements for traceability. Properties 1 to 17 are the design's Correctness Properties.
- Checkpoint tasks 3, 7 and 11 and the STOP lines inside tasks hold the stop conditions of Requirement 19. At a STOP, Kiro writes the Requirement 19.12 report and waits.
- Requirement 15.12 is covered by the STOP lines in the Branch_Counter tasks: on a counterexample or a zero counter, Kiro records the seed and counterexample and changes nothing in the test.
- Passing tests are evidence, not proof.

## Task Dependency Graph

Every wave waits for the one before it. Waves follow the order of the task list, so checkpoints 3, 7 and 11 fall between waves 3 and 4, 15 and 16, and 22 and 23.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.3", "5.1"] },
    { "id": 7, "tasks": ["4.4", "5.2"] },
    { "id": 8, "tasks": ["6.1"] },
    { "id": 9, "tasks": ["6.2"] },
    { "id": 10, "tasks": ["6.3"] },
    { "id": 11, "tasks": ["6.4"] },
    { "id": 12, "tasks": ["6.5"] },
    { "id": 13, "tasks": ["6.6"] },
    { "id": 14, "tasks": ["6.7"] },
    { "id": 15, "tasks": ["6.8"] },
    { "id": 16, "tasks": ["8.1", "9.1"] },
    { "id": 17, "tasks": ["8.2", "9.2"] },
    { "id": 18, "tasks": ["8.3", "9.3"] },
    { "id": 19, "tasks": ["8.4", "9.4", "9.7"] },
    { "id": 20, "tasks": ["8.5", "9.5", "9.8"] },
    { "id": 21, "tasks": ["9.6", "9.9"] },
    { "id": 22, "tasks": ["9.10", "10.1"] },
    { "id": 23, "tasks": ["12.1"] },
    { "id": 24, "tasks": ["13.1"] },
    { "id": 25, "tasks": ["13.2"] },
    { "id": 26, "tasks": ["13.3"] },
    { "id": 27, "tasks": ["14.1"] },
    { "id": 28, "tasks": ["14.2"] },
    { "id": 29, "tasks": ["14.3"] },
    { "id": 30, "tasks": ["15.1"] },
    { "id": 31, "tasks": ["15.2"] },
    { "id": 32, "tasks": ["15.3"] }
  ]
}
```
