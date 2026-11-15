# Implementation Plan: example-firmware

## Overview

This plan builds the three Core_Examples (`crosswalk`, `garage`, `heartbeat`), the optional `heater`, the build script, the shared test helpers and the example tests described in `design.md`. Each CHECKPOINT task sits directly after the task it checks. The order is: (1) build script and sketches, (2) CP1, (3) shared test helpers, (4) `crosswalk`, (5) CP3, (6) `garage`, (7) CP4, (8) `heartbeat`, (9) CP5, (10) `examples/README.md` with the brand-word, timingNote and file tests, (11) CP6, (12) `heater` (optional, last), (13) CP7, (14) final checkpoint CPF. No file under `src/engine/` changes at all, and no package is added. All new example test and helper files live in `tests/examples/`, outside `src/engine/` (D19).

The CP names (CP1, CP3, CP4, CP5, CP6, CP7, CPF) are historical labels from an earlier numbering. The task numbers are the IDs. The CP label tells which earlier task numbering it came from, not its position.

"Phase F" (Phase_F in `requirements.md`) means this spec's whole implementation, that is, all tasks of this `tasks.md` (D18). The build-script acceptance of Requirement 7.13 is CP1, task 2, and not the end of Phase F.

### Checkpoint map

| Task | Name | Checks |
|---|---|---|
| 2 | CP1 | task 1 (build script, sketches): the user builds |
| 5 | CP3 | task 3 (helpers, tsconfig `include` line, typecheck; tests reported here) and task 4 (`crosswalk`) |
| 7 | CP4 | task 6 (`garage`) |
| 9 | CP5 | task 8 (`heartbeat`) |
| 11 | CP6 | task 10 (README, brand and file tests) |
| 13 | CP7 | task 12 (`heater`) |
| 14 | CPF | everything |

The helpers task (3) has no checkpoint of its own. Its tests run in sub-task 3.10, its typecheck in sub-task 3.11, and both are reported and committed at CP3 (task 5).

### Build checkpoint choice

Task 1 writes the six Core_Example sketch sources (verbatim from `design.md` Appendix A.1, A.2, A.4, A.5, A.7 and A.8) together with the build script. Without them, `npm run examples:build` at CP1 (task 2) finds no Sketch_Directory and exits non-zero by Requirement 7, criterion 8, so "exit 0 with every sketch built" could never hold there. With them, CP1 is a real run: six compiles, `6 passed, 0 failed`, exit code 0, six Build_HEX files. Tasks 4, 6 and 8 keep everything else for their example (data files, tests, Recorded_Acceptance_Values) and change no sketch. The `heater` sketches stay in task 12.

### Rules for every task

- Commands. `npm test` runs `vitest`, which is watch mode. The agent runs the full suite as `npm test -- --run` and the example tests alone as `npx vitest --run tests/examples`, and one file as `npx vitest --run <path>`.
- The agent never runs `npm run examples:build`, `scripts/build-examples.mjs` or `arduino-cli`, never writes a Build_HEX, and never commits (Requirements 1.6, 7.6, 19.3, 19.4).
- Files committed before Phase F, every file under `src/engine/__tests__/baselines/`, every file under `fixtures/` and every file under `src/engine/` stay unchanged, so that nothing under `src/engine/` changes at all, and no package is added (Requirements 15.1, 19.5, 19.12). New files under `tests/examples/` are new files of this spec, outside `src/engine/` (D19). Vitest 1.6.0 collects `tests/examples/*.test.ts` with its default include pattern, the repository has no Vitest config file, and `scripts/guard.mjs` does not scan `tests/`; no config changes.
- The one named exception (D20, Requirements 19.5 and 19.14): sub-task 3.11 adds `"tests"` to the `include` list of `tsconfig.node.json`. That single line is the only permitted change to a committed file. No other line of `tsconfig.node.json` and no other committed file changes. The CP3 report (task 5) names this edit.
- Imports from `tests/examples/` into the engine use `../../src/engine/...`. In the helper file the repository root is `resolve(HERE, "..", "..")`, where `HERE = fileURLToPath(new URL(".", import.meta.url))` is the helper's own folder (D27, replacing `__dirname`), and `examples/` is resolved from it.
- After the D20 edit in 3.11, `npm run typecheck` covers `tests/examples/`. Type errors in a `tests/examples/` file are fixed in that file under the edit rule below (D17); a type error in a file that existed before this spec is S6.
- Edit rule (D17, Requirement 19.5). A file this spec creates may be edited in a later task of Phase F only to add checks or to fix a helper bug. It is never edited to loosen an assertion, a tolerance or an acceptance value (a Recorded_Acceptance_Value included). Each such edit and its reason are named in the checkpoint report (stop condition S9). Helper completeness before CP3 is a goal, not a hard rule.
- Every new test that runs an emulator (Example_Campaign, Scripted_Run or Replay_Run) is declared `it(name, { timeout: TEST_TIMEOUT_MS }, fn)` with `TEST_TIMEOUT_MS = 120_000` (D25, replacing 30,000 ms). Every test that runs the emulator uses the constant, with no literal timeout value. No existing timeout and no Vitest setting changes (Requirement 15.1).
- Dispatch prompts (D26). The orchestrator's prompts to sub-agents introduce no value that is not in the spec. If a value is missing, the agent stops and asks the user.
- The wall clock (`performance.now`) is named only in `tests/examples/examples.*.test.ts` (never under `src/engine/`; Requirement 15.11, D19), and the Fixed_Sketch test files pass it to the helper as a `clock` argument; it is read only around the Fixed_Sketch Example_Campaign, and never feeds a cycle, rule, event or verdict (Requirement 15.11).
- Verdict strings are written exactly: `BROKE`, `HELD`, `COULDN'T TELL`. Every `HELD` text is `heldText(N)` with N the real `runsCompleted` (Requirement 19.10).
- Reports call passing tests evidence, not proof, and never say a test shows a sketch is correct (Requirement 19.9). README, meta and report text avoid the product's banned copy words.
- Temporary debug scripts are deleted before a task is reported done (Requirement 19.8).
- If a spec document must be revised during these tasks, the agent asks before writing or running any code file during that revision (Requirement 19.13).

### Stop-and-report conditions

When one of these happens, the agent stops, reports, changes no file and runs no command until the user replies (Requirement 19.11).

- S1 Seed miss: a Buggy_Sketch Example_Campaign returns anything other than `BROKE`. Report expected and returned verdict and the evidence. No change to `campaignSeed`, `runs`, `runCycles` or any `gremlinSet` parameter, and no re-tuning (Requirements 15.9, 15.16).
- S2 Fixed build not `HELD`: a `CampaignError`, `BROKE`, `COULDN'T TELL` or a text other than `heldText(N)`. Report the trace, the reason text or the error (Requirements 13.6, 15.9).
- S3 Short span: a Violation_Span below 16,000 cycles, `garage` included. Report Example, Rule, v, span in cycles and ms, cut flag, and the trace or event list (Requirement 21.7).
- S4 Campaign time (D24): the time of each Fixed_Sketch campaign is judged on the standalone `npm run bench:examples` run, not on Vitest times. A bench time above 30,000 ms stops the agent (Requirement 15.13). Above 12,000 ms and up to 30,000 ms the agent reports it in the task report and continues (Requirement 15.12). Times measured inside Vitest are printed for information only and never stop a task. Only measured times decide, never the estimates in `design.md` (Requirement 15.17).
- S5 Floating input: any Floating_Diagnostic or a CannotCheck `input <SIGNAL> was read while floating` (Requirement 3.7).
- S6 Disagreement: a test written by the user or given in the spec disagrees with the system; a Recorded_Acceptance_Value differs (Requirement 15.6); the Replay_Run prefix differs from the trace (Requirement 21.5); a gremlin or Trigger coverage check fails (Requirements 8.12, 12.4, 12.8); a Single_Input breaks a Buggy_Sketch (Requirement 14.5); a rules file fails to read, compile or analyze (Requirement 5.6); a brand match is found (Requirement 18.7); a sketch pair differs beyond the `design.md` diff (Requirement 20.8); an Example cannot meet a constraint (Requirements 1.11, 2.8, 19.6). The agent reports what the test expects, what happened and the evidence, and does not change, weaken or delete the test (Requirement 19.7).
- S7 Heater cut: the `heater` Buggy_Sketch reads 0 past the table (Requirements 1.10, 11.10).
- S8 Missing Build_HEX: the test fails naming `examples/<id>/<variant>/<variant>.hex` and `npm run examples:build`; the agent asks the user to build and commit (Requirements 15.7, 16.7, 19.4).
- S9 Edits to earlier files (D17). This is a reporting rule, not a stop by itself. When a task edits a file created earlier in this spec, the edit is allowed only to add checks or to fix a helper bug. The agent names the file, the edit and the reason in that task's checkpoint report, and lists "none" when there is none. The agent stops and reports instead of editing when a change would loosen an assertion, a tolerance or an acceptance value, or would touch a file committed before Phase F, any file under `src/engine/`, a file under `fixtures/` or a baseline (Requirements 19.5, 19.7).

### Checkpoint procedure

At every CHECKPOINT the agent:

1. Runs `npm test -- --run` and reports the number of test files, the number of tests, and how many passed, failed and were skipped. Once task 3.11 is done, every full-suite checkpoint (CP3 and later) also runs `npm run typecheck` once and reports pass or fail. At CP3 the report says explicitly whether `npm run typecheck` passes with `tests/examples/` included.
2. Reports the acceptance values of every example tested so far, in one table per example: `campaignSeed`, N, `runCycles`; Buggy_Sketch verdict, `violatingRunIndex`, v (`trace.violation.cycle`) and the gremlin-event count (entries of `trace.eventList` whose `gremlinId` is not `"rest"`, OI-8); the Replay_Run Violation_Span in cycles and in ms (3 decimals) with its cut flag; the Minimal_Bug_Input Scripted_Run v, span in cycles and ms and cut flag; the Fixed_Sketch verdict and text; the Campaign_Duration from the per-file run and from the full-suite run; and, per GremlinSpec, the number of Fixed_Sketch campaign events with `cycle` below `runCycles` summed over all Run_Results.
3. Lists every edit made in this task to a file created earlier in this spec, with its reason; if none, says none (S9, D17). At CP3 it also names the D20 edit to `tsconfig.node.json` (the one `include` line).
4. Confirms that every temporary debug script is deleted.
5. Reports `git status`: which files are new or changed, and that no file committed before Phase F, no baseline, no `fixtures/` file, no file under `src/engine/` and no package dependency changed. The one exception is the D20 line in `tsconfig.node.json` (from CP3 on). It also reports, from `git ls-files`, whether every file of the allowed committed set under `examples/` is committed. This is a report item only and no test checks it (D23); `examples.files.test.ts` checks only that no disallowed file is listed.
6. Calls the passing tests evidence, not proof.
7. STOPS so the user can commit.

## Tasks

- [x] 1. Build script, `.gitignore` entry and Core_Example sketch sources
  - Start only after the user approves this `tasks.md` (Requirement 19.1).
  - _Requirements: 1.3, 1.5, 1.6, 1.7, 2.1, 7.1, 19.1, 19.12, 19.13_

  - [x] 1.1 Write `scripts/build-examples.mjs` exactly as `design.md` section 8 gives it
    - Plain Node, no dependency. The compile command is `arduino-cli compile -b arduino:avr:uno --output-dir <dir>/build <dir>`, with `<dir>` passed as one argument and no shell.
    - Sketch_Directories in ascending Example id order, `buggy` before `fixed`, over the directories that exist (so it works with or without `examples/heater/`).
    - One `PASS <dir>` or `FAIL <dir>` line after each compile. On a failure: print the compiler output or start error, delete `build/`, keep the old Build_HEX, go on, and at the end print the summary with one `not rebuilt: <id> <variant>` line per failure and exit 1.
    - A passing compile with no `<variant>.ino.hex` counts as failed and prints the missing path. No Sketch_Directory: print the message and exit 1 before any compile. All compiles pass: print the summary and exit 0.
    - On a pass, copy `<dir>/build/<variant>.ino.hex` byte for byte to `<dir>/<variant>.hex`, then delete `<dir>/build/`. Write nothing else.
    - This is the only file of the feature that contains the board text of the compile command. The agent does not run it.
    - _Requirements: 1.6, 1.13, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12_

  - [x] 1.2 Add the `examples:build` npm script to `package.json`
    - Add `"examples:build": "node scripts/build-examples.mjs"` to `scripts`. Change nothing else; `dependencies` and `devDependencies` stay as they are.
    - _Requirements: 7.1, 19.12_

  - [x] 1.3 Add the `.gitignore` entry for example build folders
    - Append the two lines from `design.md` section 8: `# Example build folders (only <variant>.hex is kept)` and `examples/**/build/`. Leave every existing line.
    - _Requirements: 1.5, 1.7_

  - [x] 1.4 Write the six Core_Example sketch sources
    - Create `examples/crosswalk/buggy/buggy.ino`, `examples/crosswalk/fixed/fixed.ino`, `examples/garage/buggy/buggy.ino`, `examples/garage/fixed/fixed.ino`, `examples/heartbeat/buggy/buggy.ino` and `examples/heartbeat/fixed/fixed.ino`, verbatim from `design.md` Appendix A.1, A.2, A.4, A.5, A.7 and A.8. UTF-8, no byte-order mark, LF line endings.
    - Check each pair with `git diff --no-index -U0` against Appendix A.3, A.6 and A.9: only the listed lines differ.
    - Write no data file, no `heater` file and no Build_HEX in this task.
    - If a sketch cannot be written with the wired peripherals and the Fixture pins: S6 (Requirement 2.8).
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 8.4, 8.5, 8.6, 9.4, 9.5, 9.6, 9.8, 9.10, 10.3, 10.5, 10.6, 10.7, 20.8, 21.9, 21.12_

- [x] 2. CHECKPOINT CP1, after task 1: the user builds the Core_Example sketches
  - Agent: follow the checkpoint procedure. No example test exists yet, so step 1 reports the existing suite and step 2 reports no acceptance values. `git status` shows only the build script, the `package.json` script line, the `.gitignore` lines and the six `.ino` files. STOP.
  - User: run `npm run examples:build`. The run passes when it prints six `PASS` lines (crosswalk buggy and fixed, garage buggy and fixed, heartbeat buggy and fixed), the summary `examples:build: 6 passed, 0 failed`, exits with code 0, leaves `buggy/buggy.hex` and `fixed/fixed.hex` in each of the three Examples, and leaves no `build/` folder under `examples/`. Then the user commits.
  - If the run exits non-zero or a Build_HEX is missing, the agent reports the output the user gives, and changes a sketch or the script only after the user decides. The agent starts task 3 only after the user reports a clean run and the commit.
  - _Requirements: 1.4, 1.6, 7.6, 7.13, 19.2, 19.3, 19.4, 19.8, 19.11_

- [x] 3. Shared test helpers
  - All files go in `tests/examples/` (D19; `design.md` section 9 and "Test files"): the helper `tests/examples/examples-support.ts` and the test file `tests/examples/examples.helpers.property.test.ts`. Imports into the engine use `../../src/engine/...`. Their tests run in sub-task 3.10, the typecheck with the D20 `tsconfig.node.json` edit runs in sub-task 3.11, and both are reported and committed at CP3 (task 5). The helpers should cover what `garage`, `heartbeat` and `heater` need, and that is a goal, not a hard rule: under D17 a later task may edit a helper file only to add checks or to fix a helper bug, never to loosen an assertion, a tolerance or an acceptance value, and names each edit and its reason in its checkpoint report (S9). No helper reads a file under `examples/heater/` or treats `heater` specially (Requirement 1.13).
  - _Requirements: 1.13, 15.1, 19.5, 19.14_

  - [x] 3.1 Create `tests/examples/examples-support.ts` with types, loaders and constants
    - The types of `design.md` "Data Models" (`ExampleId`, `Variant`, `ExampleMeta`, `LoadedExample`, `CampaignOutcome`, `ScriptedOutcome`, `SpanResult`, `ScriptedEvents`), with engine imports of the form `../../src/engine/...`.
    - `HERE = fileURLToPath(new URL(".", import.meta.url))` (D27), `ROOT = resolve(HERE, "..", "..")` and `EXAMPLES_DIR = resolve(ROOT, "examples")`; `exampleIds()` returns the Example directories that exist, sorted; `loadExample(id)` parses `fixture.json` and `meta.json` and reads `rules.txt` with `readRulesFile`, with typed errors that name the Example id and the file; a bad meta starts no campaign.
    - `readHex(id, variant)` loads the Build_HEX with `readFileSync` and, if it is missing, throws a message naming `examples/<id>/<variant>/<variant>.hex` and `npm run examples:build`.
    - `TEST_TIMEOUT_MS = 120_000` (D25), `cyclesPerMs = 16_000`, `replayEnd(meta) = meta.runCycles + 32_000`.
    - _Requirements: 1.13, 6.10, 15.1, 15.7, 16.7, 17.5, 17.6, 17.7_

  - [x] 3.2 Add the campaign runner and the campaign timing
    - `runExampleCampaign(ex, variant, clock?: () => number)`: `buildCampaignConfig(ruleSet, fixture, { hex, gremlinSet, campaignSeed, runs, runCycles })`, then `createCampaign(config)`, then one `runSlice(meta.runs)`. Return `{ result: progress.result, runs: progress.runs }`, plus `durationMs` only when `clock` was supplied. Throw, naming the Example, the build and the reasons or error, on `{ ok: false }`, on a `CampaignError` or on a `null` result. Never run a second slice.
    - Fixed build only (D21): `clock` is optional and is supplied only by the Fixed_Sketch Example_Campaign test in each `tests/examples/examples.<id>.test.ts`, which passes `performance.now`. The helper calls the supplied function but never names a wall-clock API (`performance`, `Date` and `process.hrtime` do not appear in `examples-support.ts`), so the wall clock is named only in those test files and never under `src/engine/`. When `clock` is supplied, the helper calls it immediately before `createCampaign` and immediately after `runSlice(N)`, rounds the difference to ms and returns it as `durationMs`. When `clock` is not supplied, the helper calls nothing and returns no `durationMs`. The test prints `campaign <id> fixed | N=<N> | runCycles=<runCycles> | <ms> ms`. The value fails no test and feeds no cycle, rule, event or verdict. (Consistent with `design.md` section 7 and Requirement 15, criteria 10 and 11.)
    - _Requirements: 13.7, 15.4, 15.8, 15.10, 15.11, 15.15, 20.10_

  - [x] 3.3 Add the Scripted_Run, the event-list builder and the Replay_Run
    - `buildScriptedEvents(fixture, events, runCycles)`: Rest_Events (`gremlinId` `"rest"`, cycle 0) for every `restState: "active"` input first, then the hand-written events in their given order; reject any cycle that is not an integer from 0 to `runCycles` − 1 or that breaks non-decreasing order.
    - `scriptedRun(ex, variant, events, endCycle)`: a fresh `EmulatorBridge.create(hex, fixture, events)`, a Rule_Checker from `compileRuleSet(ruleSet, fixture)`, and the `runOne` step loop (`design.md` Q16) rebuilt from `checkPlanInput`, `planTarget` and `mergeApplied` with `maxStepCycles` 160,000, then the end-of-run call. When `endCycle` is the Replay_End it keeps stepping past the earliest Violation and records that earliest one. Returns a `ScriptedOutcome`.
    - `replayRun(hex, fixture, eventList, endCycle)`: a fresh bridge, `advance` in steps of at most 160,000 cycles until `cycleCount >= endCycle`, collecting every Output_Edge; no checker, no snapshot. `comparePrefix(traceOutputEvents, edges)` returns the earliest differing index with both entries, or `null`.
    - _Requirements: 3.6, 14.6, 16.1, 16.2, 16.5, 16.6, 21.2, 21.4, 21.5_

  - [x] 3.4 Add the pure edge-list and coverage helpers
    - `outputLevelAt(signal, t, edges)`; `violationSpan(rule, v, edges, M)` by the exact rule of `design.md` section 7 (span is [v, end), edges at or after M ignored, cut flag when no end test holds before M); `spanLine(...)` printing `span <id> | <Canonical_Sentence> | v=<v> | <span> cycles | <ms, 3 decimals> ms | cut by replay end: <yes|no>`.
    - `bothOnAt(pair, edges)`: the earliest cycle at which both Output_Levels are 1, or `null`.
    - `doorStateChanges(edges)`: the `garage` Door_State reading of `design.md` section 4.2 (reset state `open`, the four edge patterns, the 1,000-cycle window); an edge pattern outside the four is an error that names the cycles and edges.
    - `floatingFindings(...)` for Run_Results and Scripted_Run outcomes (signal, cycle, Run_Index or Scripted_Run name); `gremlinCoverage(runs, gremlinSet, runCycles)` with, per GremlinSpec, the count of events with `cycle` below `runCycles` and every `skipped` entry; `gremlinEventCount(trace)` counting `eventList` entries whose `gremlinId` is not `"rest"`.
    - _Requirements: 3.5, 3.7, 9.8, 9.10, 12.7, 12.8, 15.5, 21.3, 21.6, 21.7, 21.10, 21.11_

  - [x] 3.5 Add the Brand_Matcher
    - `BOARD_BRAND_NAMES` holds exactly `Arduino`, `Genuino`, `Uno`, `Nano`, `Mega`, `Leonardo`, `Duemilanove`, `Diecimila`.
    - `wholeWordMatches(text, words)` returns every `{ word, offset, line }` where a word appears ignoring ASCII letter case and each side is the text edge or a character that is not an ASCII letter or digit; `line` is 1 plus the LF count before the match.
    - _Requirements: 18.3, 18.4, 18.9, 18.10, 21.14_

  - [ ]* 3.6 Write the property test for the Brand_Matcher in `tests/examples/examples.helpers.property.test.ts`
    - **Property 1: Brand matcher agrees with a reference scan**
    - **Validates: Requirements 18.1, 18.4, 18.5, 18.9, 18.10, 21.14**
    - fast-check, at least 100 runs, comment `// Feature: example-firmware, Property 1: ...`.

  - [ ]* 3.7 Write the property test for `violationSpan` in `tests/examples/examples.helpers.property.test.ts`
    - **Property 2: Violation_Span helper agrees with a cycle-by-cycle reference**
    - **Validates: Requirements 21.1, 21.2, 21.3, 21.6**
    - At least 100 runs, M at most 2,000, tag comment.

  - [ ]* 3.8 Write the property test for `bothOnAt` in `tests/examples/examples.helpers.property.test.ts`
    - **Property 3: Overlap helper agrees with a cycle-by-cycle reference**
    - **Validates: Requirements 21.10, 21.11**
    - At least 100 runs, tag comment.

  - [ ]* 3.9 Write the property test for `buildScriptedEvents` in `tests/examples/examples.helpers.property.test.ts`
    - **Property 4: Scripted event lists are well formed**
    - **Validates: Requirements 16.2, 16.5**
    - At least 100 runs, tag comment.

  - [x] 3.10 Write the helper unit tests in `tests/examples/examples.helpers.property.test.ts`
    - Missing Build_HEX message names the path and `npm run examples:build`; missing or broken JSON names the Example id and the file; a broken meta field names the field; a campaign error message names the Example, the build and the reasons; the span-below-16,000 and overlap failure messages hold their fields; `doorStateChanges` on hand-written edge lists for each of the four patterns and for an unknown one; Brand_Matcher cases `ARDUINO_AVR_UNO`, `arduino:avr` (match) and `Unofficial`, `nanoseconds`, `ATmega328P` (no match).
    - Any test here that starts an emulator uses `TEST_TIMEOUT_MS`.
    - Run `npx vitest --run tests/examples`. A failing helper test means the helper is fixed, not the test; if a design property itself looks wrong: S6.
    - _Requirements: 6.10, 9.8, 15.7, 15.8, 16.2, 16.5, 17.5, 17.6, 18.4, 21.3, 21.7, 21.10, 21.11_

  - [x] 3.11 Add `"tests"` to `tsconfig.node.json` (D20) and run `npm run typecheck`
    - Runs after the helper file and its tests (3.1 to 3.10) exist, so that the typecheck covers them.
    - Re-read `tsconfig.node.json`. Confirm the `include` line is `"include": ["scripts", "bench", "src/**/__tests__/**/*.ts", "src/vite-env.d.ts"],`. Change that one line to `"include": ["scripts", "bench", "src/**/__tests__/**/*.ts", "tests", "src/vite-env.d.ts"],`. Change no other line of the file and no other committed file. This is the one approved exception to "committed files stay unchanged" (D20).
    - Run `npm run typecheck` and report pass or fail.
    - If it fails on errors in files under `tests/examples/`: fix those files only, by the edits the edit rule (D17) allows (add checks or fix a helper bug), never by loosening an assertion, a tolerance or an acceptance value, and rerun until it passes.
    - If it fails because of a file that existed before this spec: S6-style stop. Report the file, the error text and the cause, change nothing else, run no further command and wait for the user.
    - Name this edit, and the typecheck result, in the CP3 report (task 5). Delete any debug script.
    - _Requirements: 19.5, 19.14_

- [x] 4. `crosswalk` (hero example)
  - Values from `design.md`: `campaignSeed` 20261101, N = 24, `runCycles` 16,000,000, `gremlinSet` `[{"id":"masher"}]`, Double_Press_Window 60 ms to 240 ms.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_

  - [x] 4.1 Write the `crosswalk` data files
    - `examples/crosswalk/fixture.json`, `rules.txt` (the one line plus one LF) and `meta.json`, exactly as `design.md` section 2 gives them.
    - _Requirements: 1.3, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.5, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 8.1, 8.2, 8.3, 8.7, 12.1, 22.1, 22.2, 22.3, 22.6_

  - [x] 4.2 STOP gate: confirm the `crosswalk` Build_HEX before any emulator test
    - Check that `git ls-files` lists `examples/crosswalk/buggy/buggy.hex` and `examples/crosswalk/fixed/fixed.hex` (built and committed at CP1, task 2), and that `git diff --no-index -U0` of the sketch pair still equals Appendix A.3.
    - If a Build_HEX is missing or a sketch changed since CP1: STOP and ask the user to run `npm run examples:build` and commit; continue only after the user reports exit code 0 (Requirement 19.4). This task changes no sketch; a sketch that needs a change is S6.
    - _Requirements: 1.4, 15.7, 16.7, 19.4, 20.8_

  - [x] 4.3 Write `tests/examples/examples.crosswalk.test.ts`: Buggy_Sketch campaign and span
    - Run the Buggy_Sketch Example_Campaign with `runExampleCampaign`. Expect `BROKE`, a non-null `violatingRunIndex` and a trace holding the Violation. Print `violatingRunIndex`, `trace.violation.cycle` and the gremlin-event count. The three literal assertions are added in 4.6, not here.
    - Replay the trace's `eventList` with `replayRun` to the Replay_End; check the prefix against `trace.outputEvents`; expect `violationSpan` at least 16,000 cycles, also when cut; print the span line.
    - Cross-check: replay the BROKE trace's `eventList` with `scriptedRun(..., endCycle = runCycles, { untilEnd: false })` and assert the same first Violation (rule and cycle) as the campaign trace. If they differ, stop and report.
    - _Requirements: 15.2, 15.4, 15.7, 15.8, 15.9, 15.15, 21.1, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [x] 4.4 Add the Fixed_Sketch campaign tests to `tests/examples/examples.crosswalk.test.ts`
    - Expect `{ verdict: "HELD", text: heldText(24), runs: 24 }`, `requestedRuns` and `runsCompleted` 24 and 24 Run_Results; print the Campaign_Duration line.
    - In every Run_Result: no CannotCheck, no Floating_Diagnostic, no `skipped` entry for `masher`. `untriggeredRules` over the 24 Run_Results is empty. At least one event with `gremlinId` not `"rest"`; `masher` has an event below `runCycles` in some Run.
    - Requirement 8.9: some Run_Result has a REQUEST digital entry with value 0 and a `gremlinId` other than `"rest"` in `appliedInputs`. Requirement 8.10: some Run_Result has a WALK Output_Edge with value 1 at a cycle above 0. Failure messages name the criterion and the number of Run_Results checked.
    - The six Conflicting_Outputs pairs of Requirement 21.8 are never both 1 in any Run_Result.
    - _Requirements: 3.5, 3.7, 8.6, 8.9, 8.10, 8.11, 8.12, 12.2, 12.3, 12.6, 12.7, 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 15.3, 15.10, 15.11, 21.8, 21.9, 21.10, 21.11_

  - [x] 4.5 Add the `crosswalk` Scripted_Run tests to `tests/examples/examples.crosswalk.test.ts`
    - Single_Input on the Buggy_Sketch (REQUEST Press at 4,800,000, Release at 5,600,000) to `runCycles`: no Violation and no CannotCheck. A separate test named for Requirement 14.2 (one press alone) runs the same list and expects no Violation.
    - Minimal_Bug_Input (`design.md` section 4.1) on the Buggy_Sketch to the Replay_End: a Violation of `all of (CAR_GREEN is 1, WALK is 1) must never happen.` with v below `runCycles`; span at least 16,000 cycles; span line printed; a second run on a fresh bridge gives the same Rule and cycle.
    - Minimal_Bug_Input on the Fixed_Sketch to `runCycles`: no Violation, no CannotCheck.
    - Requirement 8.4: second-press offsets of 60, 150 and 240 ms after a Press at 4,800,000 (with one Release between) each give a Violation on the Buggy_Sketch (D29): Press at 4,800,000, Release at 5,600,000, second Press at 5,760,000 / 7,200,000 / 8,640,000, second Release 800,000 cycles after the second Press (6,560,000 / 8,000,000 / 9,440,000). Both presses are 50 ms Ordinary_Holds.
    - Every Scripted_Run: no Floating_Diagnostic. Every Fixed_Sketch Scripted_Run: no cycle with both outputs of a pair at 1.
    - _Requirements: 3.6, 3.7, 8.4, 8.5, 8.8, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 21.2, 21.6, 21.7, 21.10, 21.11_

  - [x] 4.6 Run the `crosswalk` tests and record the acceptance values
    - Run `npx vitest --run tests/examples`. Apply S1 to S6 and S8 (a Core_Example that cannot meet a criterion is kept and reported, Requirement 1.11).
    - When the Buggy_Sketch campaign test passes for the first time, add `violatingRunIndex`, `trace.violation.cycle` and the gremlin-event count to it as literals checked with `toBe`. Change nothing else in the test, then rerun.
    - Report each Campaign_Duration. Vitest times are for information only. The `bench:examples` time decides (D24): above 12,000 ms, report and continue; above 30,000 ms, S4.
    - Note any edit made to a helper file from task 3 (S9) for the CP3 report.
    - Delete any debug script. The stop that Requirement 15.5 asks for is CP3 (task 5).
    - _Requirements: 1.11, 15.5, 15.6, 15.12, 15.13, 15.14, 15.16, 15.17, 19.5, 19.6, 19.7, 19.8, 19.9_

- [x] 5. CHECKPOINT CP3, after task 4 (`crosswalk`; also reports the task 3 helper tests)
  - Follow the checkpoint procedure with the `crosswalk` acceptance values (seed 20261101, Buggy_Sketch verdict, `violatingRunIndex`, v, span in cycles and ms, cut flag, Campaign_Duration, gremlin-event counts) and the result of the task 3 helper tests. Also name the D20 edit to `tsconfig.node.json` (the single `include` line that adds `"tests"`) and confirm that `npm run typecheck` passes with `tests/examples/` included. The user commits the `crosswalk` data files, `tests/examples/examples-support.ts`, `tests/examples/examples.helpers.property.test.ts`, `tests/examples/examples.crosswalk.test.ts` and the `tsconfig.node.json` line; the literals are then fixed acceptance values. STOP.
  - _Requirements: 15.5, 15.14, 19.2, 19.3, 19.5, 19.8, 19.9, 19.10, 19.11, 19.14_

- [x] 6. `garage` example
  - Values from `design.md`: `campaignSeed` 20261102, N = 40, `runCycles` 10,000,000, `gremlinSet` `[{"id":"bouncer"},{"id":"masher"}]`, debounce 10 ms, CLOSE response time 1 ms, auto-close 300 ms, the door-closed-does-nothing branch of Requirement 9.8 (chosen in `design.md` section 12.1).
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13_

  - [x] 6.1 Write the `garage` data files
    - `examples/garage/fixture.json`, `rules.txt` and `meta.json`, exactly as `design.md` section 2 gives them (story with `cat`, `beam` and `300 ms`; timingNote with `300 ms` and `Demo`).
    - _Requirements: 1.3, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.5, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 9.1, 9.2, 9.3, 9.7, 9.11, 9.12, 12.1, 22.1, 22.2, 22.3, 22.6_

  - [x] 6.2 STOP gate: confirm the `garage` Build_HEX before any emulator test
    - Same check as 4.2 for `examples/garage/`, with the sketch pair against Appendix A.6. Missing HEX or a changed sketch: STOP, the user runs `npm run examples:build` and commits.
    - _Requirements: 1.4, 15.7, 16.7, 19.4, 20.8_

  - [x] 6.3 Write `tests/examples/examples.garage.test.ts`: Buggy_Sketch campaign and span
    - As 4.3 for `garage`: expect `BROKE`, non-null `violatingRunIndex`, the trace; print the three values; Replay_Run to the Replay_End, prefix check, span at least 16,000 cycles (S3 applies to `garage` too), span line.
    - _Requirements: 15.2, 15.4, 15.7, 15.8, 15.9, 15.15, 21.1, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [x] 6.4 Add the Fixed_Sketch campaign tests to `tests/examples/examples.garage.test.ts`
    - Expect `HELD` with `heldText(40)`, 40 Runs requested and completed, 40 Run_Results; Campaign_Duration line.
    - No CannotCheck, no Floating_Diagnostic, no `skipped` entry for `bouncer` or `masher`; at least one non-rest event.
    - Requirement 12.2, per GremlinSpec: some Run_Result holds an event of that Gremlin below `runCycles` on CLOSE or BEAM_CLEAR, and `untriggeredRules(ruleSet, fixture, [run])` on that one Run_Result does not list the `garage` sentence. `untriggeredRules` over all 40 is empty. Requirement 12.7 per GremlinSpec, with the 12.8 failure message.
    - The pair (MOTOR_CLOSE, MOTOR_OPEN) is never both 1 in any Run_Result.
    - _Requirements: 3.5, 3.7, 9.6, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 15.3, 15.10, 15.11, 21.8, 21.9, 21.10, 21.11_

  - [x] 6.5 Add the shared `garage` Scripted_Run tests to `tests/examples/examples.garage.test.ts`
    - Single_Input on the Buggy_Sketch (BEAM_CLEAR Press at 6,400,000, Release at 6,432,000): no Violation.
    - Minimal_Bug_Input (`design.md` section 4.2): check its shape against Requirement 9.13 on the constant list; on both builds MOTOR_CLOSE rises within 16,000 cycles of 1,600,000. Buggy_Sketch to the Replay_End: a Violation of the `garage` sentence with v below `runCycles`, MOTOR_CLOSE at 1 from c through c + 320,000, span at least 16,000 cycles, span line, same Rule and cycle on a fresh bridge. Fixed_Sketch to `runCycles`: no Violation, no CannotCheck.
    - Every Scripted_Run: no Floating_Diagnostic.
    - _Requirements: 3.6, 3.7, 9.4, 9.13, 14.1, 14.3, 14.4, 14.5, 14.6, 16.1, 16.2, 16.3, 16.5, 16.6, 21.2, 21.6, 21.7_

  - [x] 6.6 Add the `garage` behaviour Scripted_Runs to `tests/examples/examples.garage.test.ts`
    - Steady block on the Buggy_Sketch (BEAM_CLEAR Press at 6,400,000, Release at 6,880,000): MOTOR_CLOSE falls to 0 at or before c + 320,000 (Requirement 9.5).
    - CLOSE_Press with the door open (Press at 1,600,000, Release at 2,400,000), both builds: MOTOR_CLOSE rises at a cycle from 1,600,000 to 1,616,000.
    - CLOSE_Press with the door closed (one Press at 9,700,000), both builds: no MOTOR_CLOSE or MOTOR_OPEN edge from 9,700,000 to 10,000,000, and `doorStateChanges` reads the change near 9,600,000 as `closing` to `closed` (the D12 branch `design.md` chose; Requirement 9.9).
    - Press with no change of CLOSE (BEAM_CLEAR Press 80,000; CLOSE Press 160,000; BEAM_CLEAR Release 320,000; CLOSE Press 640,000), both builds: MOTOR_CLOSE stays 0 from 640,000 to 4,700,000 (D13).
    - Empty event list, both builds: the earliest MOTOR_CLOSE rise lies from 4,784,000 to 4,832,000 (auto-close, Requirement 9.10).
    - Every Fixed_Sketch Scripted_Run: (MOTOR_CLOSE, MOTOR_OPEN) never both 1. An unknown Door_State edge pattern fails the test with the run name, cycles and edges.
    - _Requirements: 9.5, 9.6, 9.8, 9.9, 9.10, 16.1, 16.5, 21.10, 21.11_

  - [x] 6.7 Run the `garage` tests and record the acceptance values
    - As 4.6 for `garage`: run, apply S1 to S6 and S8, add the three literals on the first pass of the Buggy_Sketch campaign test, rerun, report the Campaign_Duration, note any S9 edit for the CP4 report, delete debug scripts. The stop is CP4 (task 7).
    - _Requirements: 1.11, 15.5, 15.6, 15.12, 15.13, 15.14, 15.16, 15.17, 19.5, 19.6, 19.7, 19.8, 19.9_

  - [x] 6.8 Add the `garage` Fixed_Sketch campaign to the campaign bench (D28)
    - Add the `garage` Fixed_Sketch campaign as a case in `bench/example-campaign-bench.ts`, run `npm run bench:examples`, and report the time against D24 (report above 12,000 ms, S4 above 30,000 ms).
    - _Requirements: 15.10, 15.12, 15.13, 15.14, 15.17_

- [-] 7. CHECKPOINT CP4, after task 6 (`garage`)
  - Follow the checkpoint procedure with the `crosswalk` and `garage` acceptance values (`garage` seed 20261102). A changed `crosswalk` literal is S6. The user commits the `garage` data files and `tests/examples/examples.garage.test.ts`. STOP.
  - _Requirements: 15.5, 15.6, 15.14, 19.2, 19.3, 19.5, 19.8, 19.9, 19.10, 19.11_

- [ ] 8. `heartbeat` example
  - Values from `design.md`: `campaignSeed` 20261103, N = 24, `runCycles` 16,000,000, `gremlinSet` `[{"id":"stuck"}]`, pulse timeout 100 ms. `heartbeat` has one output and no Conflicting_Outputs.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [ ] 8.1 Write the `heartbeat` data files
    - `examples/heartbeat/fixture.json`, `rules.txt` (two lines, each followed by LF) and `meta.json`, exactly as `design.md` section 2 gives them.
    - _Requirements: 1.3, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.5, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 10.1, 10.2, 10.4, 10.8, 12.1, 22.1, 22.2, 22.3, 22.6_

  - [ ] 8.2 STOP gate: confirm the `heartbeat` Build_HEX before any emulator test
    - Same check as 4.2 for `examples/heartbeat/`, with the sketch pair against Appendix A.9. Missing HEX or a changed sketch: STOP, the user runs `npm run examples:build` and commits.
    - _Requirements: 1.4, 15.7, 16.7, 19.4, 20.8_

  - [ ] 8.3 Write `tests/examples/examples.heartbeat.test.ts`: Buggy_Sketch campaign and span
    - As 4.3 for `heartbeat`.
    - _Requirements: 15.2, 15.4, 15.7, 15.8, 15.9, 15.15, 21.1, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [ ] 8.4 Add the Fixed_Sketch campaign tests to `tests/examples/examples.heartbeat.test.ts`
    - Expect `HELD` with `heldText(24)`, 24 Runs requested and completed; Campaign_Duration line; no CannotCheck (including `run shorter than the rule window`), no Floating_Diagnostic, no `skipped` entry for `stuck`; both Rules triggered under Requirement 12.2 by a Run with a `stuck` event below `runCycles`; `untriggeredRules` over all 24 empty; Requirement 12.7 with the 12.8 message.
    - _Requirements: 3.5, 3.7, 10.6, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 15.3, 15.10, 15.11, 21.8_

  - [ ] 8.5 Add the shared `heartbeat` Scripted_Run tests to `tests/examples/examples.heartbeat.test.ts`
    - Single_Input on the Buggy_Sketch (PULSE Press at 4,000,000, Release at 5,600,000): no Violation.
    - Minimal_Bug_Input (PULSE Press at 4,000,000, no Release) on the Buggy_Sketch to the Replay_End: a Violation of `HEARTBEAT is 1 must never last 600 ms or longer.` with v below `runCycles`; span at least 16,000 cycles; span line; same Rule and cycle on a fresh bridge. Fixed_Sketch to `runCycles`: no Violation, no CannotCheck.
    - Every Scripted_Run: no Floating_Diagnostic.
    - _Requirements: 3.6, 3.7, 10.5, 14.1, 14.3, 14.4, 14.5, 14.6, 16.1, 16.2, 16.3, 16.5, 16.6, 21.2, 21.6, 21.7_

  - [ ] 8.6 Add the `heartbeat` behaviour Scripted_Runs to `tests/examples/examples.heartbeat.test.ts`
    - Empty event list, both builds: every HEARTBEAT level span between two consecutive changes lies from 3,184,000 to 3,232,000 cycles; the span from cycle 0 is not checked (Requirement 10.3).
    - Single_Input on the Buggy_Sketch: every level span, the open one at `runCycles` included, is below 9,600,000 cycles (Requirement 10.9). Both builds: HEARTBEAT changes within 3,232,000 cycles after the Release (Requirement 10.7).
    - Fixed_Sketch with PULSE held from 4,000,000 to the run end, and with a 150 ms hold (Release at 6,400,000): every level span, the open one included, is below 9,600,000 cycles (Requirement 10.6).
    - _Requirements: 10.3, 10.6, 10.7, 10.9, 16.1, 16.5_

  - [ ] 8.7 Run the `heartbeat` tests and record the acceptance values
    - As 4.6 for `heartbeat`, noting any S9 edit for the CP5 report. The stop is CP5 (task 9).
    - _Requirements: 1.11, 15.5, 15.6, 15.12, 15.13, 15.14, 15.16, 15.17, 19.5, 19.6, 19.7, 19.8, 19.9_

  - [ ] 8.8 Add the `heartbeat` Fixed_Sketch campaign to the campaign bench (D28)
    - Add the `heartbeat` Fixed_Sketch campaign as a case in `bench/example-campaign-bench.ts`, run `npm run bench:examples`, and report the time against D24 (report above 12,000 ms, S4 above 30,000 ms).
    - _Requirements: 15.10, 15.12, 15.13, 15.14, 15.17_

- [ ] 9. CHECKPOINT CP5, after task 8 (`heartbeat`)
  - Follow the checkpoint procedure with the acceptance values of all three Core_Examples (`heartbeat` seed 20261103). The user commits the `heartbeat` data files and `tests/examples/examples.heartbeat.test.ts`. STOP.
  - _Requirements: 1.12, 15.5, 15.6, 15.14, 19.2, 19.3, 19.5, 19.8, 19.9, 19.10, 19.11_

- [ ] 10. `examples/README.md`, brand-word tests and file validation tests (timingNote included)
  - These tests run over the Examples that exist, so they pass or fail the same way with or without `examples/heater/`. Checks that apply only to `heater` run only when `examples/heater/` exists. They are written in this task so that task 12 needs no change to them. If a later task finds that a check is missing, it may add it under the edit rule (D17, S9), but it never loosens one.
  - _Requirements: 1.13, 17.7, 19.5_

  - [ ] 10.1 Write `examples/README.md`
    - The text of `design.md` section 2 for the three Core_Examples: "Three small ATmega328P programs" and no `heater` row (task 12 adds both). It holds the line `<C> must never last 1 ms or longer.`, no Board_Brand_Name and no banned copy word.
    - _Requirements: 1.5, 21.13_

  - [ ] 10.2 Write `tests/examples/examples.brand.test.ts`
    - The Brand_Check reads every `.ino`, `.json`, `.txt` and `.hex` file under `examples/`, and nothing else, and lists every match with its workspace-relative path and line; it fails with a "no files to scan" message when there are none.
    - `BOARD_BRAND_NAMES` equals the eight words of Requirement 18.3.
    - A separate in-memory test with no file read: string A `Target: ATmega328P at 16 MHz, port B bit 5.` gives zero matches; string B `Mega and ATmega328P, then MEGA.` gives exactly two `Mega` matches, at offsets 0 and 26, both on line 1.
    - The Examples_README test: the file exists, holds `<C> must never last 1 ms or longer.`, and has no Board_Brand_Name and no word of `BANNED_WORDS` as whole words in any case.
    - _Requirements: 7.5, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.8, 18.9, 18.10, 21.13, 21.14_

  - [ ] 10.3 Write `tests/examples/examples.files.test.ts`: layout, Fixture, rules and meta checks
    - Layout: the three Core_Example directories exist; no directory under `examples/` other than the four ids; the five data and sketch files per Example; the test walks `examples/` with the filesystem (no git command) and checks the allowed set on disk only: no `build/` folder, no `.elf`, `.map` or `.eep` file, and every file under `examples/` is one of the allowed names (per Example: `buggy/buggy.ino`, `fixed/fixed.ino`, `buggy/buggy.hex`, `fixed/fixed.hex`, `fixture.json`, `rules.txt`, `meta.json`; plus `examples/README.md`). Build_HEX existence is not required here, but a `.hex` file at an allowed path is accepted. The comparison with `git ls-files` (whether every allowed file is committed, and that no other file is) is a checkpoint report item, not a test (D23), because new files are uncommitted when the tests run.
    - Fixture: valid JSON, `validateFixture` returns `null`, every Rules signal mapped once, no `clockHz` or 16,000,000, exact signal set per Example, allowed keys per pin kind (no `kind` on a digital pin, no `direction` on an analog pin), no shared port and bit, general I/O pins only, `activeLevel` low or absent.
    - Rules: `readRulesFile` ok with one Rule per line in order; `render` round trip; `compileRuleSet` ok; `analyzeRuleSet` all active with no marks; UTF-8, no BOM, LF, the exact lines, only the five templates; failure messages show every Reason with its line or Rule index.
    - Meta: exact field set, types and ranges of Requirement 6, `runCycles` at least the largest Window_Cycles, `heartbeat` 16,000,000 and 24 runs, the `crosswalk` Double_Press_Window fields, `resolveParams` on every entry (message with index, `id` and error), every Gremlin has an eligible pin, the `garage` gremlinSet and story and timingNote texts, `timingNote` present, a string and non-empty after `trim`, no Board_Brand_Name or banned word in `title`, `story` or `timingNote`.
    - `heater` checks (Requirement 11.1 to 11.3) run only when `examples/heater/` exists.
    - A missing or broken file fails that Example with its id and file, and the other Examples are still checked.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.9, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 8.1, 8.2, 8.3, 8.7, 8.8, 9.1, 9.2, 9.3, 9.7, 9.11, 9.12, 10.1, 10.2, 10.4, 10.8, 11.1, 11.2, 11.3, 12.1, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.8, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6_

  - [ ] 10.4 Add the sketch, diff and repository checks to `tests/examples/examples.files.test.ts`
    - Sketch text: no `#include`, no `Serial`, no USART register name; header comment shape (Example id, exactly one of `buggy` or `fixed`, one line per Fixture signal); Phase_Constants (named per `design.md` section 4, including `AUTO_CLOSE_MS`) from 50 to 300 ms at file scope and equal in both builds; pin numbers only from the Fixture through the map PD0..PD7 = 0..7, PB0..PB5 = 8..13, ADC0..ADC5 = A0..A5; `INPUT_PULLUP` on every Digital_Input before its earliest read.
    - The line diff of each Buggy_Sketch and Fixed_Sketch pair equals the lines listed in `design.md` Appendix A (A.12 only when `heater` exists), with every line outside the Bug fix the same in both builds.
    - Repository: no Core_Example test file mentions `heater`; `package.json` has `"examples:build": "node scripts/build-examples.mjs"` and its `dependencies` and `devDependencies` equal the entries present before task 1; every new example test file that runs an emulator uses `TEST_TIMEOUT_MS` (120,000 ms, D25) with no literal timeout value.
    - _Requirements: 1.13, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 7.1, 9.10, 15.1, 19.12, 20.8, 21.12_

  - [ ] 10.5 Run the README, brand and file tests
    - Run `npx vitest --run tests/examples`. A brand match is S6 (Requirement 18.7): report every file and line, change nothing. A file or diff check failure is S6.
    - Note any S9 edit for the CP6 report. Delete any debug script. The stop is CP6 (task 11).
    - _Requirements: 5.6, 18.7, 19.5, 19.6, 19.7, 19.8, 20.8_

- [ ] 11. CHECKPOINT CP6, after task 10 (README, brand and file tests)
  - Follow the checkpoint procedure with the acceptance values of all three Core_Examples and the brand and file test results. The user commits `examples/README.md`, `tests/examples/examples.brand.test.ts` and `tests/examples/examples.files.test.ts`. STOP.
  - _Requirements: 15.6, 19.2, 19.3, 19.5, 19.8, 19.9, 19.10, 19.11_

- [ ] 12. `heater` example (optional, earliest to cut, last)
  - Every sub-task is optional (`*`). No other task, helper, script behaviour or test depends on `heater`: the build script, the Brand_Check and the file validation tests already run over the Examples that exist. Start only after CP6 (task 11). Values from `design.md`: `campaignSeed` 20261104, N = 16, `runCycles` 8,000,000, `gremlinSet` `[{"id":"spike"}]`.
  - _Requirements: 1.9, 1.10, 1.12, 1.13, 11.9_

  - [ ]* 12.1 Write the `heater` sketch sources
    - `examples/heater/buggy/buggy.ino` and `examples/heater/fixed/fixed.ino`, verbatim from Appendix A.10 and A.11.
    - _Requirements: 1.9, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 11.4, 11.5, 11.6, 11.8, 11.9_

  - [ ]* 12.2 Write the `heater` data files
    - `examples/heater/fixture.json`, `rules.txt` and `meta.json`, exactly as `design.md` section 2 gives them.
    - _Requirements: 1.9, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.5, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 11.1, 11.2, 11.3, 12.1, 22.1, 22.2, 22.3, 22.6_

  - [ ]* 12.3 Add `heater` to `examples/README.md`
    - Add the `heater` row from `design.md` section 2 and change "Three" to "Four". Nothing else changes. This is an edit to a file created in task 10, allowed under D17 as an addition, and it is named in the CP7 report (S9).
    - _Requirements: 19.5, 21.13_

  - [ ]* 12.4 STOP: the user runs `npm run examples:build` for all examples
    - The agent stops and asks the user to run `npm run examples:build`. The run passes when it prints eight `PASS` lines, `examples:build: 8 passed, 0 failed`, exits with code 0 and leaves no `build/` folder. The user commits the `heater` sketches and Build_HEX files. Then the agent checks the `heater` pair with `git diff --no-index -U0` against Appendix A.12.
    - _Requirements: 1.4, 1.9, 7.13, 19.4, 20.8_

  - [ ]* 12.5 Write `tests/examples/examples.heater.test.ts`: campaigns, span and shared Scripted_Runs
    - As 4.3, 4.4 and 4.5 for `heater`: Buggy_Sketch `BROKE` with the Replay_Run span; Fixed_Sketch `HELD` with `heldText(16)`, Campaign_Duration line, no CannotCheck, no Floating_Diagnostic, no `spike` skip, Trigger coverage of Requirement 12.2 and 12.7; Single_Input (TEMP 800 at 1,600,000) on the Buggy_Sketch with no Violation; Minimal_Bug_Input (TEMP 1023 at 1,600,000) on the Buggy_Sketch to the Replay_End with a Violation of the `heater` sentence, span, span line and repeat equality; Minimal_Bug_Input on the Fixed_Sketch with no Violation and no CannotCheck.
    - _Requirements: 3.5, 3.6, 12.2, 12.3, 12.6, 12.7, 12.8, 13.1, 13.2, 13.3, 13.4, 13.5, 13.7, 14.1, 14.3, 14.4, 14.6, 15.2, 15.3, 15.4, 15.10, 16.1, 16.3, 16.5, 16.6, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [ ]* 12.6 Add the `heater` behaviour Scripted_Runs to `tests/examples/examples.heater.test.ts`
    - TEMP 901, 950, 999, 1000 and 1023 on the Fixed_Sketch and TEMP 901 and 999 on the Buggy_Sketch: HEATER is 0 within 160,000 cycles of the change.
    - TEMP at rest, both builds: HEATER is 1 from cycle 160,000 onward.
    - _Requirements: 11.4, 11.5, 11.6, 11.7, 11.8_

  - [ ]* 12.7 Run the `heater` tests, apply the cut rule and record the acceptance values
    - Run `npx vitest --run tests/examples`; apply S1 to S6 and S8.
    - Cut rule (S7): if the Buggy_Sketch Minimal_Bug_Input gives no Violation because HEATER goes to 0 at TEMP 1023, the byte read past the table is 0. Stop, report the value and the evidence, and list the files to remove (`examples/heater/`, `tests/examples/examples.heater.test.ts`, the README row). Remove them only after the user confirms.
    - Otherwise, on the first pass of the Buggy_Sketch campaign test, add the three literals, change nothing else, rerun, report the Campaign_Duration, note any S9 edit for the CP7 report, delete debug scripts. The stop is CP7 (task 13).
    - _Requirements: 1.10, 11.10, 15.5, 15.6, 15.12, 15.13, 15.14, 15.16, 15.17, 19.5, 19.6, 19.7, 19.8_

- [ ] 13. CHECKPOINT CP7, after task 12 (`heater`)
  - If task 12 was skipped or `heater` was cut, report that `heater` is not included and go on to the final checkpoint (task 14). Otherwise follow the checkpoint procedure with the acceptance values of all four Examples (`heater` seed 20261104). The user commits the `heater` data files, `tests/examples/examples.heater.test.ts` and the README change. STOP.
  - _Requirements: 1.10, 15.5, 15.14, 19.2, 19.3, 19.5, 19.8, 19.9, 19.10, 19.11_

- [ ] 14. Final CHECKPOINT CPF
  - Run `npm test -- --run` and report the test-file count, the test count and the pass/fail result.
  - Report the acceptance values of every included Example (seed, verdicts, `violatingRunIndex`, v, span in cycles and ms, cut flag, Campaign_Duration, gremlin-event counts) and whether `heater` is included.
  - List every edit made during Phase F to a file created earlier in this spec, with its reason, grouped by checkpoint; say none if there were none (S9, D17).
  - Confirm that no temporary debug script remains.
  - Confirm with `git status` and `git ls-files` that no file committed before Phase F, no file under `src/engine/__tests__/baselines/`, no file at all under `src/engine/`, no file under `fixtures/` and no `package.json` dependency changed, and that the committed files under `examples/` are exactly the allowed set of Requirement 1.5.
  - Confirm that the build-script acceptance of Requirement 7.13 was met: one clean `npm run examples:build` at CP1 (task 2) for the Core_Examples, and at 12.4 for all examples when `heater` is included, each with every Sketch_Directory built and exit code 0, as reported by the user.
  - Call the passing tests evidence, not proof. STOP.
  - _Requirements: 1.5, 1.8, 7.13, 15.1, 19.5, 19.8, 19.9, 19.10, 19.12_

## Notes

- Tasks marked with `*` are optional and can be skipped. Only `heater` (task 12) and the four property tests (3.6 to 3.9) are optional. The Core_Example tests are acceptance tests from `requirements.md` and are not optional.
- The top-level task 12 carries no `*`, because the workflow does not allow it on top-level tasks; its title and every sub-task mark it optional.
- Tasks are numbered 1 to 14 in the order they run. CHECKPOINT tasks are 2, 5, 7, 9, 11, 13 and 14, and they sit directly after the task they check. Their CP names (CP1, CP3, CP4, CP5, CP6, CP7, CPF) are historical labels; the task numbers are the IDs.
- Each task lists the requirement criteria it implements or checks. A few criteria are met by the approved documents themselves (Requirements 9.9, 20.1 to 20.7, 20.9, 20.11) and are listed in the coverage table.
- Checkpoints are user stops, not coding tasks, and do not appear in the dependency graph.
- A failing test is never edited to pass. Tests are evidence, not proof.

## Coverage table

Task numbers below are the new numbers.

| Requirement | Criteria | Tasks |
|---|---|---|
| 1 Example layout | 1.1, 1.2 | 10.3 |
| | 1.3 | 1.4, 4.1, 6.1, 8.1, 10.3 |
| | 1.4 | 2, 4.2, 6.2, 8.2, 12.4 |
| | 1.5 | 1.3, 10.1, 10.3, 14 |
| | 1.6 | 1.1, 2 |
| | 1.7 | 1.3 |
| | 1.8 | 14 |
| | 1.9 | 10.3, 12.1, 12.2, 12.4 |
| | 1.10 | 12.7, 13 |
| | 1.11 | 4.6, 6.7, 8.7 |
| | 1.12 | 9, 12 |
| | 1.13 | 1.1, 3.1, 10.4, task 10, task 12 |
| 2 Sketch source | 2.1 to 2.7 | 1.4, 10.4, 12.1 |
| | 2.8 | 1.4 |
| 3 No floating read | 3.1, 3.2 | 1.4, 10.4 |
| | 3.3, 3.4 | 4.1, 6.1, 8.1, 10.3 |
| | 3.5 | 3.4, 4.4, 6.4, 8.4, 12.5 |
| | 3.6 | 3.3, 4.5, 6.5, 8.5, 12.5 |
| | 3.7 | 3.4, 4.4, 4.5, 6.4, 6.5, 8.4, 8.5 |
| 4 Example Fixture | 4.1 to 4.7 | 4.1, 6.1, 8.1, 10.3, 12.2 |
| 5 Example rules | 5.1, 5.5, 5.7 | 4.1, 6.1, 8.1, 10.3, 12.2 |
| | 5.2, 5.3, 5.4 | 10.3 |
| | 5.6 | 10.3, 10.5 |
| 6 Example Meta | 6.1 to 6.9 | 4.1, 6.1, 8.1, 10.3, 12.2 |
| | 6.10 | 3.1, 3.10, 10.3 |
| 7 Build script | 7.1 | 1.1, 1.2, 10.4 |
| | 7.2 to 7.4, 7.7 to 7.12 | 1.1 |
| | 7.5 | 1.1, 10.2 |
| | 7.6 | 1.1, 2 |
| | 7.13 | 2, 12.4, 14 |
| 8 crosswalk | 8.1, 8.2, 8.3, 8.7 | 4.1, 10.3 |
| | 8.4 | 1.4, 4.5 |
| | 8.5 | 1.4, 4.5 |
| | 8.6 | 1.4, 4.4 |
| | 8.8 | 4.5, 10.3 |
| | 8.9 to 8.12 | 4.4 |
| 9 garage | 9.1, 9.2, 9.3, 9.7, 9.11, 9.12 | 6.1, 10.3 |
| | 9.4 | 1.4, 6.5 |
| | 9.5 | 1.4, 6.6 |
| | 9.6 | 1.4, 6.4, 6.6 |
| | 9.8 | 1.4, 3.4, 3.10, 6.6 |
| | 9.9 | design.md section 12.1 (approved); branch tested in 6.6 |
| | 9.10 | 1.4, 3.4, 6.6, 10.4 |
| | 9.13 | 6.5 |
| 10 heartbeat | 10.1, 10.2, 10.4, 10.8 | 8.1, 10.3 |
| | 10.3, 10.7 | 1.4, 8.6 |
| | 10.5 | 1.4, 8.5 |
| | 10.6 | 1.4, 8.4, 8.6 |
| | 10.9 | 8.6 |
| 11 heater (optional) | 11.1 to 11.3 | 10.3, 12.2 |
| | 11.4 to 11.8 | 12.1, 12.6 |
| | 11.9 | task 12, 12.1 |
| | 11.10 | 12.7 |
| 12 Gremlins reach pins and Triggers | 12.1 | 4.1, 6.1, 8.1, 10.3, 12.2 |
| | 12.2, 12.3, 12.6, 12.7, 12.8 | 3.4, 4.4, 6.4, 8.4, 12.5 |
| | 12.4 | 6.4, 8.4 |
| | 12.5 | 6.4 |
| 13 Fixed builds reach HELD | 13.1 to 13.5, 13.7 | 4.4, 6.4, 8.4, 12.5; 13.7 also 3.2 |
| | 13.6 | stop condition S2, applied in 4.6, 6.7, 8.7, 12.7 |
| 14 Bugs need gremlin search | 14.1, 14.3, 14.4, 14.5, 14.6 | 4.5, 6.5, 8.5, 12.5; 14.6 also 3.3 |
| | 14.2 | 4.5 |
| 15 Campaign acceptance tests | 15.1 | 3.1, 10.4, 14 |
| | 15.2, 15.4, 15.7 to 15.9, 15.15 | 3.1, 3.2, 4.3, 6.3, 8.3, 12.5 |
| | 15.3, 15.10, 15.11 | 3.2, 4.4, 6.4, 8.4, 12.5 |
| | 15.5, 15.6 | 4.6, 6.7, 8.7, 12.7, and the checkpoints 5, 7, 9, 13 |
| | 15.12 to 15.14, 15.16, 15.17 | 4.6, 6.7, 8.7, 12.7 |
| 16 Scripted-run tests | 16.1 to 16.7 | 3.1, 3.3, 4.5, 6.5, 8.5, 12.5; 16.4 in 4.5 |
| 17 File validation tests | 17.1 to 17.8 | 10.3; 17.5 to 17.7 also 3.1, 3.10 |
| 18 Brand check | 18.1 to 18.6, 18.8 to 18.10 | 3.5, 10.2; 18.4 also 3.10 |
| | 18.7 | 10.5 |
| 19 Process constraints | 19.1, 19.13 | 1 |
| | 19.2, 19.3, 19.8 to 19.11 | 2, 5, 7, 9, 11, 13, 14, and the run sub-tasks |
| | 19.4 | 2, 4.2, 6.2, 8.2, 12.4 |
| | 19.5 (frozen files, edit rule D17, D20 exception) | rules for every task, S9, checkpoint procedure steps 3 and 5, task 3, 3.11, 4.6, 5, 6.7, 7, 8.7, 9, 10, 10.5, 11, 12.3, 12.7, 13, 14 |
| | 19.14 (typecheck, D20) | 3.11, 5, and the typecheck report at each full-suite checkpoint (checkpoint procedure step 1) |
| | 19.6, 19.7 | 4.6, 6.7, 8.7, 10.5, 12.7 |
| | 19.12 | 1.2, 10.4, 14 |
| 20 Design document content | 20.1 to 20.7, 20.9, 20.11 | design.md (approved before these tasks) |
| | 20.8 | 1.4, 4.2, 6.2, 8.2, 10.4, 10.5, 12.4 |
| | 20.10 | 3.2 |
| 21 Violations are not glitches | 21.1 to 21.7 | 3.3, 3.4, 4.3, 4.5, 6.3, 6.5, 8.3, 8.5, 12.5 |
| | 21.8 to 21.11 | 3.4, 4.4, 4.5, 6.4, 6.6; 21.8 (none for heartbeat) 8.4 |
| | 21.12 | 1.4, 10.4 |
| | 21.13 | 10.1, 10.2, 12.3 |
| | 21.14 | 3.5, 10.2 |
| 22 Demo timing note | 22.1 to 22.3, 22.6 | 4.1, 6.1, 8.1, 12.2, 10.3 |
| | 22.4, 22.5 | 10.3 |

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3"] },
    { "id": 4, "tasks": ["3.4"] },
    { "id": 5, "tasks": ["3.5"] },
    { "id": 6, "tasks": ["3.6"] },
    { "id": 7, "tasks": ["3.7"] },
    { "id": 8, "tasks": ["3.8"] },
    { "id": 9, "tasks": ["3.9"] },
    { "id": 10, "tasks": ["3.10"] },
    { "id": 11, "tasks": ["3.11"] },
    { "id": 12, "tasks": ["4.1", "4.2"] },
    { "id": 13, "tasks": ["4.3"] },
    { "id": 14, "tasks": ["4.4"] },
    { "id": 15, "tasks": ["4.5"] },
    { "id": 16, "tasks": ["4.6"] },
    { "id": 17, "tasks": ["6.1", "6.2"] },
    { "id": 18, "tasks": ["6.3"] },
    { "id": 19, "tasks": ["6.4"] },
    { "id": 20, "tasks": ["6.5"] },
    { "id": 21, "tasks": ["6.6"] },
    { "id": 22, "tasks": ["6.7"] },
    { "id": 23, "tasks": ["8.1", "8.2"] },
    { "id": 24, "tasks": ["8.3"] },
    { "id": 25, "tasks": ["8.4"] },
    { "id": 26, "tasks": ["8.5"] },
    { "id": 27, "tasks": ["8.6"] },
    { "id": 28, "tasks": ["8.7"] },
    { "id": 29, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 30, "tasks": ["10.4"] },
    { "id": 31, "tasks": ["10.5"] },
    { "id": 32, "tasks": ["12.1", "12.2"] },
    { "id": 33, "tasks": ["12.3"] },
    { "id": 34, "tasks": ["12.4"] },
    { "id": 35, "tasks": ["12.5"] },
    { "id": 36, "tasks": ["12.6"] },
    { "id": 37, "tasks": ["12.7"] }
  ]
}
```
