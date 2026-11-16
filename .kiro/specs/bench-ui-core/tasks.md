# Implementation Plan: bench-ui-core

## Overview

The plan builds the Hexorcist web app in TypeScript on the committed engine, following design.md. The order is: routing and the spike route, then the pure model modules and their tests, the Message_Codec, the Worker_Host with the Node acceptance test (a STOP checkpoint), the Worker_Entry, the App views step by step, the Speed_Page, the UI-strings scan, an accessibility and narrow-screen pass, and the global checks.

Rules for every task:

- **Guard:** every task that writes a file under `src/ui/app/` (or `index.html`) keeps that file free of the standalone banned words (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) and the board brand words, in code, comments, identifiers and CSS, in any letter case. `wholeWordMatches` treats `_` and `-` as boundaries, so `is_first`, `:first-child` and `unique-id` also fail. Never write `guard-allow`. Name the chip only as "ATmega328P".
- **Pure modules** (`src/ui/app/model/*`, `worker/host.ts`, `worker/codec.ts`, `worker/messages.ts`) never reference `document`, `window`, `self`, `postMessage`, `navigator`, `fetch`, `performance`, `requestAnimationFrame`, `setTimeout`, `setInterval`, `Date` or `Math.random`. They import only from `src/engine/` and other pure modules (Requirement 25.6).
- **Property tests:** each property is one `fc.assert` with an integer-literal `seed` and an integer-literal `numRuns` of at least 100, tagged `// Feature: bench-ui-core, Property <n>: <title>`. Use fast-check 4.10.2 (already a devDependency).
- **Files that stay unchanged:** `src/engine/**` (source, committed tests, baselines), `fixtures/`, `examples/`, every committed test under `tests/`, `src/ui/main.ts`, `src/ui/style.css`, `package.json` dependencies and devDependencies, and `package-lock.json`. Do not add a `vite.config.*` file or any npm package.
- **Git and scratch files:** never run `git commit`, `push`, `reset`, `checkout` or `stash`, and never delete a tracked file. Name temporary scripts `scripts/tmp-<name>.ts` and delete them before reporting.
- **Tests and reports:** report test results only as "pass" or "fail", with the command, exit code and output lines as evidence. A passing run is evidence, not proof of correctness.

## Tasks

- [x] 1. Routing and coexistence with the spike page
  - [x] 1.1 Edit `index.html`, create `src/ui/app/boot.ts`, and create a minimal `src/ui/app/page-entry.ts` and `src/ui/app/app.css`
    - `index.html`: exactly one `<script type="module" src="/src/ui/app/boot.ts">`, `<title>Hexorcist</title>` and `<div id="app">`, as shown in design.md "Routing".
    - `boot.ts`: compare `location.hash` exactly. Add a `hashchange` listener that calls `location.reload()`. On `#spike`, wait for `DOMContentLoaded` (`{ once: true }`), dynamically import `../main.ts`, then dispatch one `new Event('DOMContentLoaded')`. Every other route dynamically imports `./page-entry.ts`: `#bench` calls `mountSpeedPage(root)` and every other hash calls `mountApp(root)`. Add no static import of `main.ts`, `style.css`, `app.css` or any page module.
    - `page-entry.ts`: the only module that imports `./app.css`. It exports `mountApp(root)` and `mountSpeedPage(root)`, which for now render a plain heading. Tasks 12.7 and 18.4 fill them in.
    - `app.css`: the palette, spacing, radius, motion and font tokens of design.md "Visual system" only.
    - Leave `src/ui/main.ts` and `src/ui/style.css` untouched.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 19.1_

- [x] 2. Format and field-validation model
  - [x] 2.1 Implement `src/ui/app/model/format.ts` and `src/ui/app/model/fields.ts`
    - `format.ts`: `progressText`, `elapsedText`, `eventsText`, `shrinkText`, `candidatesText`, `levelText`, `inputValueText`, `edgeValueText`, plus re-exports of the Engine `msText` and `cycleText` (design.md "model/format.ts").
    - `fields.ts`: `RUNS_MESSAGE`, `SEED_MESSAGE`, `checkRuns` (1 to 1000) and `checkSeed` (0 to 4294967295). Each checks `/^[0-9]+$/` and then compares the value as a `BigInt`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 3.10, 3.11, 3.12, 6.1, 6.3, 11.2, 11.3, 11.5, 14.14, 25.1, 25.6_
  - [x] 2.2 Write the property test for field validation in `tests/ui/fields-format.test.ts`
    - **Property 21: Run_Count and Campaign_Seed validation**
    - **Validates: Requirements 3.10, 3.11, 3.12**
  - [x] 2.3 Write the property test for progress and count texts in `tests/ui/fields-format.test.ts`
    - **Property 23: Progress and count texts**
    - Examples: "Elapsed 0:00", "Elapsed 0:59", "Elapsed 1:00", "Elapsed 61:05", "8 events -> 3 events", "1 event".
    - **Validates: Requirements 6.1, 6.3, 11.2, 11.3**

- [x] 3. Timeline model
  - [x] 3.1 Implement `src/ui/app/model/rules.ts` and `src/ui/app/model/timeline.ts`
    - `rules.ts`: `ruleBySentence` (matches through the Engine `render`) and `ruleSignals` (each signal once, in Canonical_Sentence order; Crosswalk gives `["CAR_GREEN", "WALK"]`).
    - `timeline.ts`: `DISPLAY_MARGIN` (32,000), `LANES`, `levelAt`, `inputLevelAt`, `windowEnd`, `timelineEvents` (sort key: cycle, then inputs before outputs, then source index), `laneSegments`, `gremlinMarkers`, `markersToRemove` (multiset match on `cycle`, `signal` and `gremlinId`), and `axisTicks` with `msText` labels.
    - Also add `selectedEventText(ev)` in `timeline.ts`, which gives "<cycleText> cycles · <msText> · <signal> = <value>".
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 8.3, 11.4, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.10, 14.11, 14.12, 14.13, 14.14, 25.1, 25.6_
  - [x] 3.2 Write the property test for `levelAt` and `inputLevelAt` in `tests/ui/timeline-model.test.ts`
    - **Property 1: Level at a cycle is the latest edge at or before it**
    - Examples in the same file: the `LANES` order (14.1) and `selectedEventText` (14.14).
    - **Validates: Requirements 14.11, 14.4, 8.3, 14.1, 14.14**
  - [x] 3.3 Write the property test for lane segments in `tests/ui/timeline-model.test.ts`
    - **Property 2: Lane segments agree with the level rule inside the window**
    - **Validates: Requirements 14.2, 14.3, 14.7**
  - [x] 3.4 Write the property test for Timeline_Event order in `tests/ui/timeline-model.test.ts`
    - **Property 3: Timeline_Events are ordered by cycle with inputs before outputs**
    - **Validates: Requirements 14.12**
  - [x] 3.5 Write the property test for the window end and window contents in `tests/ui/timeline-model.test.ts`
    - **Property 4: Window end and window contents**
    - **Validates: Requirements 14.13, 14.6, 14.7, 14.10**
  - [x] 3.6 Write the property test for GREMLINS markers in `tests/ui/timeline-model.test.ts`
    - **Property 5: GREMLINS markers track the best list**
    - **Validates: Requirements 14.5, 11.4**

- [x] 4. Verdict text and coverage line model
  - [x] 4.1 Implement `src/ui/app/model/verdict-text.ts`
    - Exports: `cardTitle` (returns `v.verdict` unchanged), `observedText`, `brokeScope` ("run <runIndex + 1> of <N>", "Seed: <seed>"), `traceRows` (Rest_Events included), `EMPTY_TRACE_TEXT`, `uncheckedRows`, `couldntTellLines` (split on "; " and apply the six-row hint table in table order), `heldFinding` and `announcement`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 7.3, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.10, 9.1, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 10.11, 25.1, 25.6_
  - [x] 4.2 Write the property test for observed values in `tests/ui/verdict-text.test.ts`
    - **Property 7: Observed values name each rule signal in order**
    - **Validates: Requirements 8.2, 8.3, 8.4**
  - [x] 4.3 Write the property test for the BROKE scope and trace rows in `tests/ui/verdict-text.test.ts`
    - **Property 8: BROKE scope and trace rows**
    - Examples: `EMPTY_TRACE_TEXT` for an empty list (8.8), and `uncheckedRows` keeps Engine order (8.10).
    - **Validates: Requirements 8.5, 8.6, 8.7, 8.8, 8.10**
  - [x] 4.4 Write the property test for verdict titles and the HELD text in `tests/ui/verdict-text.test.ts`
    - **Property 9: Verdict title and HELD text come from the Engine unchanged**
    - Requirement 25.4 examples: the titles "BROKE", "HELD" and "COULDN'T TELL". For N = 1, the HELD text equals both `heldText(1)` and "No violation found in 1 emulated run of this gremlin set. Not a proof.". For N = 24, it equals both `heldText(24)` and "No violation found in 24 emulated runs of this gremlin set. Not a proof.".
    - **Validates: Requirements 7.3, 9.1, 25.4**
  - [x] 4.5 Write the property test for COULDN'T TELL lines in `tests/ui/verdict-text.test.ts`
    - **Property 10: COULDN'T TELL lines keep each part and add the matching hints**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10, 10.11**
  - [x] 4.6 Implement `src/ui/app/model/coverage.ts`
    - `coverageCounts`: `null` for a `never` rule, otherwise the number of runs where `triggerOccurred` is true. `gremlinEvents` counts entries with `gremlinId !== "rest"` and `cycle < runCycles`.
    - `coverageLine`: the parts joined with " · " in the order of Requirement 9.9.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.11, 9.12, 25.1, 25.6_
  - [x] 4.7 Write the property test for coverage counts in `tests/ui/coverage-line.test.ts`
    - **Property 11: Coverage counts**
    - **Validates: Requirements 9.4, 9.5, 9.6**
  - [x] 4.8 Write the property test for the Coverage_Line text in `tests/ui/coverage-line.test.ts`
    - **Property 12: Coverage_Line text**
    - Example: the Crosswalk line shape "Rule trigger: none, a never rule has no trigger · Gremlin events: <count> · Run length: 1000.0 ms · Seed: 20261101".
    - **Validates: Requirements 9.4, 9.5, 9.7, 9.8, 9.9, 9.11**

- [x] 5. Span_Helper and story input model
  - [x] 5.1 Implement `src/ui/app/model/span.ts` (`spanFor`)
    - Follow the algorithm in design.md "model/span.ts": stable sort, apply edges with cycle ≤ v, then test each distinct cycle c with v < c < M. The result is `{ end, lengthCycles, cut }`, or `null` for `count` and `hold` rules.
    - It is written new here; do not import anything from `tests/`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 12.7, 12.8, 25.1, 25.6_
  - [x] 5.2 Write the model-based property test for the Span_Helper in `tests/ui/span-helper.test.ts`
    - **Property 13: Span_Helper equals the tests/examples reference**
    - Import `violationSpan` from `tests/examples/examples-support.ts` and do not edit that file.
    - **Validates: Requirements 12.7, 12.8, 12.10**
  - [x] 5.3 Write the Crosswalk span example in `tests/ui/span-helper.test.ts`
    - Use the original Crosswalk campaign trace, v = 15,647,543, and the output edges from `replayRun` of `tests/examples/examples-support.ts` up to M = 16,032,000. Expect 384,457 cycles and `cut` true. Set the timeout to 600,000 ms.
    - These are acceptance values. If the observed values differ, STOP and report (Requirement 27.4). Do not change the test.
    - _Requirements: 12.9_
  - [x] 5.4 Implement `src/ui/app/model/story-input.ts`
    - `STORY_LABELS`: only the `REQUEST` key, with the three exact texts.
    - `buildStoryInput`: for a `never`, `notLongerThan` or `respond` rule, call `spanFor` with M = Reached_End and add `violationSpan`. For a `count` or `hold` rule, or when no rule matches, add no span and do not call `spanFor`. Always add `labels`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 12.1, 12.3, 12.4, 12.5, 12.6, 25.1, 25.6_
  - [x] 5.5 Write the Story_Labels example test in `tests/ui/story-labels.test.ts`
    - The `labels` record must be deep-equal to the Story_Labels, with no other signal key and no other text.
    - _Requirements: 25.3, 12.3_
  - [x] 5.6 Write the property test for the story input in `tests/ui/story-labels.test.ts`
    - **Property 14: Story input carries labels always and a span only for span forms**
    - **Validates: Requirements 12.3, 12.4, 12.5, 12.6, 25.3**

- [x] 6. Diff model
  - [x] 6.1 Implement `src/ui/app/model/diff.ts`
    - Exports: `diffHunks` (LCS with 3 context lines; hunks merge when 6 or fewer unchanged lines separate them; removed lines come before added lines), `applyHunks` and `sketchName`.
    - Split only at "\n" and keep each "\r" in its line.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 16.2, 16.3, 16.5, 16.6, 16.7, 16.8, 25.1, 25.6_
  - [x] 6.2 Write the property test for the diff round trip in `tests/ui/diff-hunk.test.ts`
    - **Property 18: Diff round trip**
    - **Validates: Requirements 16.5, 16.8**
  - [x] 6.3 Write the property test for hunk line ranges in `tests/ui/diff-hunk.test.ts`
    - **Property 19: Hunk lines match their ranges**
    - **Validates: Requirements 16.6**
  - [x] 6.4 Write the property test for hunk shape in `tests/ui/diff-hunk.test.ts`
    - **Property 20: Hunk shape**
    - **Validates: Requirements 16.7, 16.8**
  - [x] 6.5 Write the Crosswalk sketch diff example in `tests/ui/diff-hunk.test.ts`
    - Read both sketches with `node:fs`. Write the assertions exactly as Requirement 16.4 states:
      - Hunk A: old 1 to 4, new 1 to 4, 0 context lines before its changed lines, 3 after.
      - Hunk B: old 78 to 85, new 78 to 83, the two removed lines, 3 context lines before and 3 after.
    - Also check that `sketchName` output contains no ".ino" (Requirement 16.3).
    - If the test and the system disagree, STOP and report (Requirement 27.8).
    - _Requirements: 16.3, 16.4_

- [x] 7. Worker message codec
  - [x] 7.1 Implement `src/ui/app/worker/messages.ts` (types only, plus `WORKER_MESSAGE_KINDS`)
    - Define the nine message kinds, `CompactCampaignResult`, `JobError` and `Measure` as written in design.md "Data Models".
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.8, 4.10, 5.8_
  - [x] 7.2 Implement `src/ui/app/worker/codec.ts`
    - Exports: `encodeMessage`, `decodeMessage`, `decodeRequest` and `decodeReply`.
    - Copy field by field from each kind's schema and turn `-0` into `0`.
    - Error paths: `$` for the whole message, `kind` for the kind field, and dotted paths with bracketed indexes for fields.
    - Never throw. Apply the field rules in design.md "Message_Codec".
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 25.1, 25.6_
  - [x] 7.3 Write the property test for the codec round trip in `tests/ui/codec.test.ts`
    - **Property 15: Message_Codec round trip**
    - Write generators for all nine Worker_Message kinds.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  - [x] 7.4 Write the property test for codec error paths in `tests/ui/codec.test.ts`
    - **Property 16: Message_Codec reports the field at fault**
    - **Validates: Requirements 5.5, 5.6, 5.7**
  - [x] 7.5 Write the property test for compact encoding in `tests/ui/codec.test.ts`
    - **Property 17: Encoded messages are compact**
    - **Validates: Requirements 5.8, 4.8**

- [x] 8. Checkpoint: pure model and codec tests
  - Run `npx vitest --run tests/ui` and `npm run typecheck`. Ensure all tests pass, ask the user if questions arise.
  - STOP (Requirements 25.8, 27.4, 27.8): if a test fails and making it pass would need a change to an assertion, an expected value, a `seed`, a `numRuns`, a `skip`, `only` or `todo` marker, or an Engine file, leave the test unchanged and report what it expects, what happened and the evidence (command, exit code, output lines, file:line). Wait for the product owner.
  - STOP (Requirement 27.2): if a requirement can be met only by changing a file under `src/engine/`, report the requirement number, the Engine function and the change needed, then wait.

- [x] 9. Example data, Worker_Host and the Node acceptance test
  - [x] 9.1 Implement `src/ui/app/data/crosswalk.ts` (`loadCrosswalk`)
    - Use `?raw` imports of the seven Crosswalk files.
    - Pass the `rules.txt` text unchanged to `readRulesFile`, and fill `sentences` from `render`.
    - Parse `fixture.json` and `meta.json` inside `try`, recording the file name and the error message for each failure.
    - Read no DOM and no clock.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 9.2 Implement the campaign part of `src/ui/app/worker/host.ts`
    - Export `SLICE_RUNS` = 1, `STEP_CANDIDATES` = 1, `REPLAY_RUN_INDEX` = 0 and `runCampaignJob`.
    - `runCampaignJob` uses `buildCampaignConfig` with `{ hex, gremlinSet, campaignSeed, runs, runCycles }` and no `bridgeFactory`, then `createCampaign`, then a `runSlice(1)` loop that calls the `beforeCreate`, `onProgress` and `afterFinish` hooks.
    - Build the `CompactCampaignResult` with `coverageCounts` and `totalCycles` (the sum of `endCycle`). Drop `p.runs`.
    - Map `CampaignError` and `BridgeError` to `{ kind, message }`. A config failure becomes `invalid-rules`.
    - No clock, random source, network call, DOM or worker global, dynamic `import()` or `avr8js` import.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.1, 4.2, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 4.16, 4.18, 4.19, 19.4, 19.11, 26.8, 26.9_
  - [x] 9.3 Implement the reduction part of `src/ui/app/worker/host.ts`
    - `runReductionJob`: call `createReducer` with `maxStepCycles: DEFAULT_MAX_STEP_CYCLES` and no `budget`. Forward `onProgress` reports (`candidatesTried`, `bestGremlinCount`, `bestList`). Loop `step(1)` until `ended`. Pass `bridgeFactory` only when the caller gives one. Map a `ReducerError` or `s.error` to `{ kind, message }`.
    - `createCountingFactory`: call `EmulatorBridge.create` with the received arguments, return the value unchanged, and keep each value that is not a `BridgeError`. `totalCycles()` sums `cycleCount` over the kept bridges; `keptCount()` counts them.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.3, 4.18, 4.19, 11.1, 11.10, 19.5, 19.10, 19.11_
  - [x] 9.4 Implement the replay part of `src/ui/app/worker/host.ts`
    - `runReplayJob` repeats the five checks of `replayEventList` in the same order and with the same error values: fixture, `runCycles`, `compileRuleSet`, `checkEventList`, then `runEventList` with Run_Index 0, a fresh checker, `DEFAULT_MAX_STEP_CYCLES` and `copyList`.
    - It returns `violation`, `outputEdges` (mapped as in `emulator-run.ts:152`), `reachedEnd` = `endCycle`, and `fingerprint` from `traceFingerprint`.
    - Use no snapshot.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.18, 4.19_
  - [x] 9.5 Write the Node acceptance test core in `tests/ui/worker-host.acceptance.test.ts` (required)
    - Run in Node with no worker, DOM or browser. Import `loadCrosswalk`, the Worker_Host functions and the codec, with no copy or wrapper of host logic.
    - Use `SLICE_RUNS` and `STEP_CANDIDATES` (`runSlice(1)` and `step(1)`). Pass every result through `encodeMessage` and `decodeReply` as its reply message, and run the checks on the decoded value.
    - Do the expensive work in `beforeAll` with a 600,000 ms timeout, and give each `it` `{ timeout: 600_000 }`.
    - Acceptance values, each reported as "expected <x>, actual <y>" on mismatch:
      - The Buggy_Build Campaign (seed 20261101, N 24, Run_Cycles 16,000,000, `[{ id: "masher" }]`) gives BROKE with a trace.
      - `brokeScope(trace, 24, 20261101)` gives "run 4 of 24" and seed 20261101.
      - The reduction gives `originalEventCount` 8 and `reducedEventCount` 3.
      - The reduced Replay on the Buggy_Build gives fingerprint `47078989121ebc1d`.
      - The reduced Replay on the Fixed_Build gives violation `null`.
      - The Fixed_Build Campaign gives HELD with exactly "No violation found in 24 emulated runs of this gremlin set. Not a proof.".
      - The reduction with `createCountingFactory().factory` gives a result deep-equal to the plain reduction (`originalEventCount`, `reducedEventCount`, `reducedList`, `candidatesTried`: 8, 3, 30). Counted total cycles are above 0.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9, 24.10, 24.11, 24.12, 24.14, 16.10, 16.17, 17.6, 19.10, 19.12_
  - [x] 9.6 Add equivalence checks to `tests/ui/worker-host.acceptance.test.ts` (required)
    - The Example_Data strings equal the files read with `node:fs` (2.1).
    - `runReplayJob` and `replayEventList` give deep-equal `violation` and `outputEdges` for: the original `trace.eventList`, the Reduced_List on both builds, and each list with one event removed (4.6).
    - Invalid lists give the same error `kind` and `message` from both (4.6, 4.19).
    - `reachedEnd` equals `runEventList(...).endCycle` called directly (4.7).
    - The host Buggy_Build Campaign gives the same verdict as a direct `buildCampaignConfig` + `createCampaign` + `runSlice(1)` loop (4.18).
    - `totalCycles` equals the sum of `endCycle` (19.4).
    - A bad HEX gives `ok: false` with the Engine `kind` and `message` and no verdict (4.19).
    - _Requirements: 2.1, 4.6, 4.7, 4.18, 4.19, 19.4_

- [x] 10. Checkpoint: Node acceptance values (STOP point)
  - Run `npx vitest --run tests/ui` and `npm run typecheck`. Ensure all tests pass, ask the user if questions arise.
  - STOP (Requirements 24.13, 27.4, 27.6): if any acceptance value differs, stop work on the feature: "run 4 of 24", seed 20261101, 8 -> 3, fingerprint `47078989121ebc1d`, the reduced Replay on the Fixed_Build giving violation `null`, the exact HELD text for 24 runs, the counting-factory result equal to the plain result, or `runEventList` Replay results equal to `replayEventList`. Report the expected value, the actual value and the evidence (test name, command, the output that shows the actual value). Do not change the test or the expected value. Wait for the product owner.
  - STOP (Requirement 27.5): if a check needs an acceptance value that requirements.md does not give, report the missing value and the criterion. Do not choose or estimate one.
  - STOP (Requirements 27.2, 27.3): if passing would need a change under `src/engine/`, to `src/ui/main.ts` or `src/ui/style.css`, or to a committed test, report the file and the reason and wait.

- [x] 11. Worker_Entry and worker client
  - [x] 11.1 Implement `src/ui/app/worker/engine.worker.ts` (Worker_Entry)
    - Use a local `WorkerScope` interface on `self`. Decode with `decodeRequest`; on failure, reply `job-error` with `job: "message"`.
    - Handle the `campaign`, `reduce` and `replay` requests through the host. Post progress and done replies through `encodeMessage`.
    - Read `performance.now()` only to fill `measure`. Pass a Counting_Factory only when a `reduce` request has `measure: true`.
    - Wrap each job in `try`/`catch`, which yields `internal-error` "The engine worker could not finish this job.".
    - No dynamic `import()`.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.1, 4.3, 4.8, 4.16, 19.4, 19.9, 19.10, 19.11_
  - [x] 11.2 Implement `src/ui/app/views/worker-client.ts` (`createEngineClient`)
    - Create the worker with `new Worker(new URL("../worker/engine.worker.ts", import.meta.url), { type: "module" })`.
    - Run every `message` through `decodeReply` before reading any field. Route replies by `jobId`.
    - Outcomes: `done`, `job-error`, `codec-error` and `worker-stopped`. A `messageerror` counts as a codec error with path `$`.
    - On an `error` event, terminate the worker and create a fresh one for the next job.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 4.2, 4.17, 4.21, 5.9, 5.10_

- [x] 12. App shell, styles, opening state, progress and verdict cards
  - [x] 12.1 Implement `src/ui/app/views/dom.ts`, `src/ui/app/views/icons.ts` and `src/ui/app/views/live.ts`
    - `dom.ts`: `el(tag, attrs, children)`, which sets text only through `textContent` and never uses `innerHTML` with data.
    - `icons.ts`: original inline SVG. The BROKE icon is a broken link, HELD a bounded trace and COULDN'T TELL an open bracket (24 × 24, `currentColor`, stroke 2). The Masher icon uses `viewBox="0 0 32 32"`, 2 px strokes and two eyes. Draw no checkmark, shield, seal or triangle.
    - `live.ts`: the single `aria-live="polite"` region, present and empty at load.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 2.5, 7.7, 7.9, 8.12, 9.10, 9.11, 10.9, 10.12, 20.33, 20.34, 20.35, 21.12, 21.15_
  - [x] 12.2 Implement `src/ui/app/model/gremlin-tile.ts` and `src/ui/app/model/flow.ts`
    - `gremlinTile`: one table row for `masher` ("Masher", "Presses the input again and again"). Fill `iconName`, targets and ranges from `GREMLIN_CATALOGUE` and the fixture.
    - `flow.ts`: `FlowState`, `canUnleash`, `canApplyFix`, `canReplayAgain` and `canTryRemoving`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 3.5, 3.6, 3.15, 3.16, 16.21, 17.2, 18.7_
  - [x]* 12.3 Write the property test for button enablement in `tests/ui/flow.test.ts`
    - **Property 22: Button enablement follows the flow state**
    - **Validates: Requirements 3.15, 3.16, 16.21, 17.2, 18.7**
  - [x] 12.4 Write the full `src/ui/app/app.css` visual system
    - Palette tokens only: 8-digit hex alpha variants, `transparent`, `currentColor` and `none`. No `rgb()`, `hsl()` or other named colours. `#6F8777` is never used for text.
    - Fonts: system UI sans-serif and monospace stacks, with no `@font-face`.
    - Type scale: verdict titles 36 px (bold for BROKE and COULDN'T TELL, 400 for HELD), page title 28 px, region titles 18 px at weight 600, body 16 px / 1.5, chips and meta 14 px / 1.4.
    - Margins, paddings and gaps: `0` or a `--s-*` token. Panels: 24 px padding, 10 px radius; controls: 6 px radius.
    - Verdict cards share the `--c-raised` background. BROKE: solid 4 px coral rail. COULDN'T TELL: dashed 4 px lavender rail. HELD: 1 px solid `#6F8777` outline. BROKE emphasis: one 400 ms opacity ramp on the rail, one iteration.
    - Motion: hover transitions 140 ms, disclosure transitions 180 ms, and the `.is-leaving` marker fade 160 ms (opacity only).
    - Wide layout: grid `360px 1fr`, 24 px gap, 32 px page padding, `max-width: 1760px`.
    - Region sizes from design.md "Layout": the scene is the largest region, and the scene and timeline areas keep their full size before any Replay.
    - Error lines use a dashed outline. Disabled controls keep `#A5B5AA` labels and get a dashed border.
    - Later tasks add rules to this file only in 14.3, 15.4, 18.4 and 20.1.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 7.7, 8.11, 8.13, 9.2, 9.10, 10.9, 11.16, 20.1, 20.2, 20.3, 20.6, 20.7, 20.8, 20.9, 20.10, 20.11, 20.12, 20.13, 20.14, 20.15, 20.16, 20.17, 20.18, 20.19, 20.20, 20.22, 20.23, 20.24, 20.25, 20.26, 20.27, 20.28, 20.29, 20.30, 20.31, 20.32, 20.35_
  - [x] 12.5 Implement `src/ui/app/views/header.ts`, `rule-panel.ts`, `gremlin-tiles.ts` and `controls.ts`
    - Header: the wordmark "Hexorcist", the pitch line, "ATmega328P · Browser only", and one Crosswalk card labelled "Buggy example".
    - Rule panel: the Canonical_Sentence as text the user cannot edit, in monospace.
    - Gremlin tiles: in `gremlinSet` order. Activating a tile changes nothing.
    - Controls: the Run_Count and Campaign_Seed fields with their messages, one full-width "Unleash gremlins" button, "Completed k / N runs", and "Elapsed m:ss" from a 250 ms `setInterval` on `performance.now()`. The timer stops and the last texts stay.
    - No upload, paste or compile control. No remaining-time text.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 2.8, 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 6.1, 6.3, 6.4, 6.5, 6.6, 20.4, 20.13, 20.14_
  - [x] 12.6 Implement `src/ui/app/views/verdict-card.ts`
    - Every card has four parts in order: title, finding, evidence scope, actions.
    - BROKE: the Canonical_Sentence, `observedText`, "run k of N", the seed, the trace rows (or `EMPTY_TRACE_TEXT`), the unchecked rows, and the broken-link icon. No warning banner.
    - HELD: the Engine `text` with the Coverage_Line directly under it, the bounded-trace icon, and no "%" or "percent".
    - COULDN'T TELL: one line per reason part, with hint lines under it, and the open-bracket icon.
    - Optional build label: "Buggy build" or "Fixed build".
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 8.1, 8.2, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 16.15_
  - [x] 12.7 Implement `src/ui/app/views/app-page.ts` and wire `mountApp` in `page-entry.ts`
    - Build the page in design.md document order: header, a config column, an evidence column with every region container, and the live region.
    - Call `loadCrosswalk()`. On a data failure, show the reasons and JSON errors as plain text, show no card, and keep the button disabled.
    - Keep the verdict-area placeholder "Run a campaign to inspect the result." at full card size until a Campaign finishes.
    - On "Unleash gremlins", start one Buggy_Build Campaign with the field values as integers and store a `CampaignRecord` (runs, seed). Set `flow.busy`, update the progress texts, and show one Verdict_Card per verdict.
    - Announce the Campaign start and the verdict.
    - Show `job-error`, `codec-error` and `worker-stopped` outcomes as error text outside every card. After `worker-stopped`, enable "Unleash gremlins".
    - Never pass a `bridgeFactory`. Send `measure: false`.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.2, 3.13, 3.14, 3.15, 3.16, 4.2, 4.20, 4.21, 4.22, 5.10, 6.2, 6.4, 6.5, 7.4, 7.5, 7.6, 7.8, 7.9, 19.11, 20.5, 21.15, 21.16, 21.17, 26.8_

- [x] 13. Reduction view, shrink animation and story card
  - [x] 13.1 Implement `src/ui/app/views/counter.ts`
    - Show "X events -> Y events" and "Candidates tried: k" in fixed-width, tabular-numeral boxes.
    - After a result, show the Shrink_Label "The smallest replay this reducer found.".
    - When `stoppedAtBudget` is false, the label is focusable (`tabindex="0"`) and its `aria-describedby` points at the Minimality_Tooltip, which shows on hover and focus.
    - When `stoppedAtBudget` is true, show no tooltip and add the budget sentence.
    - Keep all of this outside the live region.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.12, 20.29, 21.20_
  - [x] 13.2 Create `src/ui/app/views/timeline.ts` with the region skeleton and the GREMLINS marker layer
    - Show the run label and the empty lanes at full size with "No replay yet.". Draw one amber "M" marker per Gremlin_Event in the window and none for a Rest_Event.
    - `dropMarkers` applies `markersToRemove`. It reads `matchMedia("(prefers-reduced-motion: reduce)")` at each removal. Without reduced motion, add `.is-leaving` and remove the marker on `transitionend` or after 160 ms, whichever comes earlier. With reduced motion, remove it at once.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 11.4, 11.15, 11.16, 14.5, 20.28, 21.10_
  - [x] 13.3 Implement `src/ui/app/views/story-card.ts`
    - Call `failureStory(buildStoryInput(...))` once. Show the returned string unchanged, or the `ReducerError` `message` in the card.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.11_
  - [x] 13.4 Wire the BROKE flow into `src/ui/app/views/app-page.ts`
    - A Buggy_Build BROKE runs, in order:
      1. The "Original run" Replay of `trace.eventList` (activity label "Replaying"), shown with "Original run" selected.
      2. The reduction (activity label "Reducing"), with progress updating the counter and `dropMarkers`.
      3. On `reduce-done`: the final counts, the Shrink_Label and an announcement.
      4. The Reduced_List Replay, shown as "Reduced replay", with the story card. Build the `ReplayView` with `windowEnd`, a span with M = `reachedEnd`, and "Reduced replay" disabled until a result exists.
    - On a reduction error: show the error, announce it, show no Shrink_Label, run no reduced Replay, and keep the BROKE card and its trace.
    - A Fixed_Build BROKE starts no reduction.
    - The activity labels sit outside every card, with no rail or icon.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 6.7, 6.8, 6.9, 8.9, 11.1, 11.2, 11.3, 11.4, 11.5, 11.9, 11.10, 11.11, 11.13, 11.14, 11.15, 12.1, 12.4, 15.20, 15.21, 15.22, 15.23, 21.18, 21.19, 21.20_

- [x] 14. Crosswalk scene
  - [x] 14.1 Implement `src/ui/app/model/scene.ts`
    - Exports: `SCENE_SIGNALS`, `SceneState`, `SCENE_NOTE` ("Illustrative scene · firmware outputs shown") and `sceneAt`. Levels come from `levelAt`; "not driven" is used for no edge, `"input"` or no Replay. The bracket follows Requirement 13.6.
    - Also export the geometry constants from the design table: car, crossing bars and ghost.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
  - [x]* 14.2 Write the property test for scene state in `tests/ui/scene-model.test.ts`
    - **Property 6: Scene state follows the shown Replay's levels**
    - Examples: the `SCENE_NOTE` text, and geometry that keeps the car left of the crossing bars and apart from the ghost.
    - **Validates: Requirements 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10**
  - [x] 14.3 Implement `src/ui/app/views/scene.ts` and add the scene rules to `app.css`
    - Original inline SVG with `viewBox="0 0 960 440"`, drawn only from the shapes in design.md "Scene".
    - Lamp colours: lit CAR_RED `#FF8A80`, lit CAR_YELLOW `#F3C982`, lit CAR_GREEN and WALK `#99F5AC`. Unlit lamps use `#1B2923` with a `#6F8777` stroke.
    - The labels "CAR_GREEN = <level>" and "WALK = <level>", plus the coral bracket.
    - `SCENE_NOTE` as HTML text, and a visually hidden line with the levels as HTML text (not a live region).
    - No raster image, external file, collision or third-party art.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 20.33, 21.7_
  - [x] 14.4 Wire the scene into `src/ui/app/views/app-page.ts`
    - Place the scene region with its replay-controls area and activity label between the story card and the counter.
    - Render with no Replay at load. Render at the Cursor (the Violation_Cycle) when a Replay is shown.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 13.3, 13.8, 15.2, 20.5, 20.6, 20.28_

- [x] 15. Timeline view, playback and keyboard
  - [x] 15.1 Implement `src/ui/app/model/player.ts`
    - Exports: `RATE` (1x = 16,000 and 0.1x = 1,600 cycles per ms), `showReplay` (cursor = v, paused), `play` (restarts from 0 at the window end), `pause`, `tick`, `setSpeed`, `stepNext`, `stepPrev`, `home` and `toEnd`.
    - `now` is always passed in. The module reads no clock.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 15.1, 15.3, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12, 15.13, 15.16, 15.17, 15.18, 15.25, 15.26, 21.11_
  - [x]* 15.2 Write the property test for playback in `tests/ui/player.test.ts`
    - **Property 24: Playback keeps the Cursor inside the window and follows the rate**
    - Examples: Home (15.16), End (15.17) and the 1x default (15.25).
    - **Validates: Requirements 15.1, 15.3, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.26**
  - [x]* 15.3 Write the property test for previous and next event in `tests/ui/player.test.ts`
    - **Property 25: Previous and next event navigation**
    - **Validates: Requirements 15.11, 15.12, 15.13**
  - [x] 15.4 Extend `src/ui/app/views/timeline.ts` with lanes, axis, cursor, controls and keyboard, and add the timeline rules to `app.css`
    - Lanes: seven labelled lanes in a fixed 112 px label column, with the plot in `overflow-x: auto`. Output lanes are step lines with a dashed "not driven" state. The REQUEST lane is drawn from the event list, with a dotted "released" state.
    - Markers: a coral diamond and line for the violation, a hatched span up to `min(v + L, windowEnd)`, a 2 px cursor, and an amber square for the selected event. Nothing is drawn past the Reached_End.
    - Axis: six ticks labelled with `msText`, in 14 px monospace with tabular numerals.
    - Controls outside the plot: play, pause, previous, next, 0.1x and 1x (`aria-pressed`, 1x by default), the selected-event text, and the toggle "Original run" / "Reduced replay" with a disabled state and the run label above the lanes.
    - Keyboard on `div.timeline` (`tabindex="0"`): Space toggles play and pause and calls `preventDefault`; Left and Right step events; Home goes to cycle 0; End goes to the Violation_Cycle.
    - Playback: `requestAnimationFrame` calls `tick`.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.14, 15.1, 15.2, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12, 15.13, 15.14, 15.15, 15.16, 15.17, 15.18, 15.19, 15.23, 15.24, 15.25, 15.26, 20.21, 21.7, 21.11, 21.13_
  - [x] 15.5 Wire the timeline to the scene and the toggle in `src/ui/app/views/app-page.ts`
    - Every Cursor change re-renders the scene and the lanes.
    - Showing a Replay or changing the toggle calls `showReplay` (Cursor = v, paused) and clears the selection.
    - When the reduced Replay finishes, select "Reduced replay".
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 11.11, 15.2, 15.3, 15.19, 15.20, 15.21, 15.22, 15.23, 15.24_

- [x] 16. Apply fix, replay again and try removing
  - [x] 16.1 Implement `src/ui/app/model/fix-text.ts`
    - Exports: `fixedReplayText`, `withoutEvent` and `tryRemovingText`.
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 16.10, 16.11, 16.12, 18.4, 18.5, 18.6_
  - [x]* 16.2 Write the property test for removing one event in `tests/ui/fix-text.test.ts`
    - **Property 26: Removing one event keeps every other event**
    - **Validates: Requirements 18.4**
  - [x]* 16.3 Write the property test for replay outcome texts in `tests/ui/fix-text.test.ts`
    - **Property 27: Replay outcome texts**
    - **Validates: Requirements 16.10, 16.11, 16.12, 18.5, 18.6**
  - [x] 16.4 Implement `src/ui/app/views/sketch-diff.ts`
    - The button "Load this example's bundled fixed .hex".
    - The "Sketch source" section shows every hunk with context, removed and added marks, using `sketchName` so ".ino" appears nowhere in the section.
    - Show the Fixed_Build Replay text or error, and the label "Fixed build".
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.10, 16.11, 16.12, 16.19, 16.22, 21.14_
  - [x] 16.5 Implement `src/ui/app/views/replay-again.ts`
    - The "Replay again" button, the full Trace_Fingerprint string, and "matches" or "differs" as text.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 17.1, 17.4, 17.5, 21.14_
  - [x] 16.6 Implement `src/ui/app/views/try-removing.ts`
    - Show the Reduced_List rows in order (Ms_Text, signal, value).
    - Each Gremlin_Event gets one "Try removing" button. Each Rest_Event gets the label "rest state" and no button.
    - Show a result text or error for each row.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 18.1, 18.2, 18.3, 18.5, 18.6, 18.8, 21.14_
  - [x] 16.7 Wire Apply_Fix, Replay again and Try removing into `src/ui/app/views/app-page.ts`
    - Apply_Fix:
      1. Show the diff.
      2. Replay the Reduced_List on the Fixed_Build.
      3. If that Replay ends without error, start the Fixed_Build Campaign with the BROKE Campaign's stored seed and Run_Count, the meta `gremlinSet` and Run_Cycles.
      4. Show the "Fixed build" card right after the BROKE card, now labelled "Buggy build", and leave the BROKE card unchanged.
      5. A Fixed_Build BROKE lists its trace and starts no reduction.
      6. On an error, show it in place of the card and start nothing dependent.
      7. Keep Apply_Fix disabled until the next Buggy_Build Campaign.
    - Replay again: run one Reduced_List Replay on the Buggy_Build. Compare its fingerprint with the previous Reduced_List Buggy_Build Replay. Leave the Timeline, Scene, Cursor and toggle unchanged.
    - Try removing: run one Replay of `withoutEvent(list, i)` and leave the Reduced_List, Shrink_Label, Timeline and Scene unchanged.
    - All buttons follow `model/flow.ts`. A new Buggy_Build Campaign resets these regions.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 3.15, 11.13, 16.1, 16.2, 16.9, 16.13, 16.14, 16.15, 16.16, 16.17, 16.18, 16.19, 16.20, 16.21, 17.2, 17.3, 17.4, 17.5, 17.7, 18.4, 18.7, 18.8, 21.16, 21.17_

- [x] 17. Checkpoint: App flow
  - Run `npx vitest --run`, `npm run typecheck`, `npm run guard` and `npm run build`. Ensure all tests pass, ask the user if questions arise.
  - STOP (Requirement 27.1): if `npm run guard` reports a finding that cannot be removed by changing only files this feature added, without `guard-allow`, report the file, the line and the word or check, and wait.
  - STOP (Requirements 27.2, 27.3, 27.4, 27.8): an Engine change, a change to `main.ts`, `style.css` or a committed test, or a test and system disagreement means stop, report the evidence and wait.

- [x] 18. Speed page
  - [x] 18.1 Implement `src/ui/app/data/garage.ts` (`loadGarage`)
    - Use `?raw` imports of the Garage `fixed/fixed.hex`, `fixture.json`, `rules.txt` and `meta.json`, with the same parsing as `loadCrosswalk`.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 19.2_
  - [x] 18.2 Implement `src/ui/app/model/speed.ts`
    - Exports: `PINNED_CROSSWALK_FINGERPRINT`, `PINNED_GARAGE_VERDICT`, `compareFingerprint`, `compareGarage` and `cyclesPerSecond` (`null` when seconds is 0).
    - Pure module (Requirement 25.6).
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 19.6, 19.7, 19.13_
  - [x]* 18.3 Write example tests for the speed model in `tests/ui/speed-model.test.ts`
    - The pinned values give "matches". A changed fingerprint, text or run count gives "differs". 0 seconds gives `null`.
    - _Requirements: 19.6, 19.7, 19.13_
  - [x] 18.4 Implement `src/ui/app/views/speed-page.ts`, wire `mountSpeedPage` in `page-entry.ts`, and add the speed table rules to `app.css`
    - Run nothing until "Run speed check" is activated.
    - Steps, each with `measure: true` where design.md says so:
      1. The Crosswalk buggy Campaign.
      2. If step 1 ends BROKE, the reduction with a Counting_Factory, through `measure: true`.
      3. If step 2 ends with a result, the Replay, with its fingerprint compared to `47078989121ebc1d`.
      4. The Garage fixed Campaign (seed 20261102, N 40), with its verdict compared to the pinned HELD result. It runs even when a Crosswalk step fails.
    - Show the table rows of design.md "Speed_Page" under "Local performance information". An error or unexpected verdict shows its `kind` and `message` (or the verdict) with "differs", and dependent steps do not run.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.11, 19.13, 21.1, 21.3, 21.14_

- [x] 19. UI strings scan
  - [x] 19.1 Write `tests/ui/ui-strings.test.ts` (required)
    - Import `BANNED_WORDS` from `src/engine/copy-rules.ts`, and `BOARD_BRAND_NAMES` and `wholeWordMatches` from `tests/examples/examples-support.ts`. Add each hyphenated entry without its hyphen. Keep no word list of its own.
    - Recursively read, as UTF-8, every file under `src/ui/app/` and `index.html`, and check for:
      - Banned_Words and Board_Brand_Names through `wholeWordMatches`.
      - The substring `guard-allow`.
      - Any case-insensitive "atmega" that does not begin "ATmega328P".
    - Also check the Crosswalk `meta.json` fields `title`, `story` and `timingNote`, plus `rules.txt`, `buggy.ino` and `fixed.ino`.
    - Report every match as `<path or meta field>:<line>: <word>`. Fail with the input name when an input is missing or a field is not a string.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.10_
  - [x]* 19.2 Write the source-rules smoke test in `tests/ui/source-rules.test.ts`
    - Check the source-text rules listed in design.md "New test files", row `source-rules.test.ts`:
      - `index.html` structure, and no static import of the spike or page modules in `boot.ts`.
      - No `avr8js`, random, network, clock or global in the places that forbid them, and no `import(` in `worker/*`.
      - The Worker constructor pattern.
      - `bridgeFactory` only in `host.ts` and `engine.worker.ts`, and the Engine runners only in `host.ts`.
      - Palette-only colours, no `@font-face`, and spacing tokens only.
      - No image file references, no file input or `textarea`.
      - Integer-literal `seed` and `numRuns` ≥ 100 in every `fc.assert` under `tests/ui/`.
    - _Requirements: 1.1, 1.2, 1.3, 1.8, 2.8, 4.2, 4.12, 4.13, 4.14, 4.15, 4.16, 4.17, 13.2, 19.11, 20.12, 20.15, 20.22, 20.33, 25.6, 25.7, 26.7, 26.9, 26.10_

- [x] 20. Accessibility and narrow-screen pass
  - [x] 20.1 Add the accessibility and narrow-screen rules to `src/ui/app/app.css`
    - Focus: `:focus-visible` gets a 2 px amber outline with a 2 px offset.
    - Targets: `min-width` and `min-height` of 44 px on every control, the toggle options and the Shrink_Label.
    - Reduced motion: under `prefers-reduced-motion: reduce`, all transitions and animations take 0 ms and the BROKE rail animation is removed.
    - At ≤ 430 px:
      - One column in DOM order, with 16 px page and panel padding.
      - The verdict title at 28 px and the page title at 24 px.
      - Gremlin tiles in a `1fr 1fr` grid.
      - The timeline label column stays in place while the plot scrolls, and the previous, next and selected-event controls sit outside the plot.
      - Wide content scrolls inside its own box, so the page has no horizontal scroll.
    - All text keeps a contrast of at least 4.5:1.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 20.16, 20.18, 20.23, 21.4, 21.5, 21.8, 21.9, 21.21, 22.1, 22.2, 22.3, 22.5, 22.6, 22.9_
  - [x] 20.2 Accessibility pass on `views/app-page.ts`, `views/controls.ts`, `views/timeline.ts` and `views/verdict-card.ts`
    - Accessible names: `aria-label` "Play", "Pause", "Previous event" and "Next event" on the icon-only buttons. Every other accessible name contains its visible label.
    - The DOM order matches the Tab order of Requirement 21.2.
    - "View result": a button below the progress text, shown on narrow screens after a verdict. It calls `scrollIntoView` on the latest card title and moves focus to that card (`tabindex="-1"`). No other code scrolls the page or moves focus.
    - Only the live region announces. Progress, elapsed time, candidates and the Cursor stay outside every `aria-live`, `status`, `alert` or `log` element, so one buggy Campaign with its reduction changes the region exactly 3 times.
    - Guard: no standalone banned word (safe, secure, guaranteed, certified, real-time, realtime, first, unique, shortest) or board brand word in code, comments, identifiers or CSS; no guard-allow.
    - _Requirements: 21.1, 21.2, 21.3, 21.6, 21.7, 21.12, 21.13, 21.14, 21.16, 21.17, 21.18, 21.19, 21.20, 22.2, 22.4, 22.7, 22.8_

- [x] 21. Final checkpoint: global checks and unchanged files
  - Run `npx vitest --run`, `npm run typecheck`, `npm run guard` and `npm run build` from the workspace root. Each must exit 0. Ensure all tests pass, ask the user if questions arise.
  - Run `git status --porcelain --untracked-files=all` and `git diff HEAD --name-status`, and confirm all of these:
    - Nothing is added, modified, deleted or renamed under `src/engine/` (including committed engine tests and `src/engine/__tests__/baselines/`), `fixtures/` or `examples/`.
    - No tracked file under `tests/` is modified.
    - The `package.json` dependencies and devDependencies and `package-lock.json` match Start_Commit `05a3c96`.
    - `src/ui/main.ts` and `src/ui/style.css` are unchanged.
    - No `vite.config.*` file was added.
    - No `scripts/tmp-*` file exists.
  - Report each test result only as "pass" or "fail", with the command, exit code and output lines, as evidence and not as proof. List any non-acceptance value picked under Requirement 27.7 under "Choices I made" in the report.
  - STOP (Requirements 27.1 to 27.5, 27.8): a guard finding that cannot be removed without `guard-allow` or outside files this feature added, a needed Engine change, a needed change to `main.ts`, `style.css` or a committed test, an acceptance value mismatch, a missing acceptance value, or a test and system disagreement. In each case, report the file, line, values and evidence, change nothing to work around it, and wait for the product owner.
  - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.11, 27.1, 27.2, 27.3, 27.4, 27.5, 27.8_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. They are the tests design.md added beyond the user's list (flow, scene model, player, fix text, speed model, source rules).
- The tests the user listed are required and have no `*`: the pure model tests (timeline model, verdict text, coverage line, story labels, diff hunks, span helper, field validation and formatting), the codec tests, the UI-strings scan and the Node acceptance test.
- Acceptance values (Requirement 27.6) are the span of 12.9, the pinned comparisons of 19.6 and 19.7, and the values of 24.4 to 24.9. A mismatch on any of them is a STOP, never a test edit.
- `app.css` is written by tasks 1.1, 12.4, 14.3, 15.4, 18.4 and 20.1 only. `app-page.ts` is extended by 12.7, 13.4, 14.4, 15.5, 16.7 and 20.2, in that order.
- DOM rendering, layout, focus order, reduced motion and narrow screens have no DOM test library here. Their behaviour comes from the pure models (tested) plus the source-rules smoke test; the user checks the rest by hand with `npm run dev`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "4.6", "5.2", "6.2"] },
    { "id": 2, "tasks": ["2.3", "3.2", "4.1", "4.7", "5.3", "5.4", "6.3"] },
    { "id": 3, "tasks": ["3.3", "4.2", "4.8", "5.5", "6.4", "7.1"] },
    { "id": 4, "tasks": ["3.4", "4.3", "5.6", "6.5", "7.2"] },
    { "id": 5, "tasks": ["3.5", "4.4", "7.3"] },
    { "id": 6, "tasks": ["3.6", "4.5", "7.4"] },
    { "id": 7, "tasks": ["7.5", "9.1"] },
    { "id": 8, "tasks": ["9.2"] },
    { "id": 9, "tasks": ["9.3"] },
    { "id": 10, "tasks": ["9.4"] },
    { "id": 11, "tasks": ["9.5"] },
    { "id": 12, "tasks": ["9.6"] },
    { "id": 13, "tasks": ["11.1", "11.2", "12.1", "12.2"] },
    { "id": 14, "tasks": ["12.3", "12.4", "12.5", "12.6"] },
    { "id": 15, "tasks": ["12.7"] },
    { "id": 16, "tasks": ["13.1", "13.2", "13.3", "14.1"] },
    { "id": 17, "tasks": ["13.4", "14.2", "14.3", "15.1"] },
    { "id": 18, "tasks": ["14.4", "15.2", "16.1"] },
    { "id": 19, "tasks": ["15.3", "15.4", "16.2", "16.4", "16.5", "16.6"] },
    { "id": 20, "tasks": ["15.5", "16.3"] },
    { "id": 21, "tasks": ["16.7", "18.1", "18.2"] },
    { "id": 22, "tasks": ["18.3", "18.4"] },
    { "id": 23, "tasks": ["19.1", "19.2"] },
    { "id": 24, "tasks": ["20.1", "20.2"] }
  ]
}
```
