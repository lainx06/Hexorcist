# Implementation Plan: Benchmark Tools

## Overview

Add the Try_Script (`exorcism-demo/try.mjs`), three Check_Configs, the Motor_Pins fixture and Motor_Rules, the Overlap_Script (`exorcism-demo/measure-overlap.ts`), tests under `tests/benchmark/`, then run the benchmark one sketch at a time through the Try_Script and write the Results_README only after every result matches the expected results. Languages: plain `.mjs` for the Try_Script (as the user named it), TypeScript for everything else. Nothing is added under `cli/`, `mcp/`, `src/`, or `power/`, and `package.json` is not edited.

Rules for every task:

- Never edit a `.ino` file, a test, a config, or a rule file to make a result match. If a result differs from what a test or Requirement 7 expects, stop and report what was expected, what happened, and the evidence, then wait for the user's decision.
- Any throwaway script or record file used while running the benchmark is deleted before the work is reported done.
- Passing tests are evidence, not proof.

## Tasks

- [x] 1. Add the fixed config, fixture, and rule files
  - [x] 1.1 Create the three Check_Configs
    - Create `exorcism-demo/crosswalk-check.json`, `exorcism-demo/crosswalk-full-check.json`, and `exorcism-demo/motor-check.json` with exactly the values in the design (nine keys each, seed 20261101, runMs 1000, build `["node","exorcism-demo/build.mjs"]`)
    - Do not touch `exorcism-demo/loop-check.json` or `exorcism-demo/crosswalk-full-rules.txt`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.2 Create the Motor_Pins fixture and Motor_Rules
    - Create `exorcism-demo/motor/pins.json` (FWD_BUTTON PD2, REV_BUTTON PD3, STOP_BUTTON PD4 as inputs active low; FORWARD PB0, REVERSE PB1 as outputs)
    - Create `exorcism-demo/motor/rules.txt` with exactly the three LF-terminated lines from Requirement 3.3, no blank line
    - If the rule compiler rejects a line, stop and report the line and the compiler message; do not reword the rule
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.3 Write example tests for configs, fixture, and rules (skipped by the owner, not done)
    - `tests/benchmark/check-configs.test.ts`: each Check_Config equals its exact expected object; `loop-check.json` and `crosswalk-full-rules.txt` are byte-for-byte unchanged
    - `tests/benchmark/motor-fixture.test.ts`: pins file equals the expected object; rules file equals the exact three lines; `readRulesFile` returns 3 rules and `compileRuleSet` accepts them against the Motor_Pins fixture
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.4 Write property test for pin fixture signal list (skipped by the owner, not done)
    - **Property 9: Pin fixture signal list is preserved through loading**
    - Generate fixtures with `fc.array` of `FixturePin`-shaped records with unique signal names, write the JSON, load through `loadInput`, compare signal names in order
    - File: `tests/benchmark/fixture-roundtrip.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 9`
    - **Validates: Requirements 10.4**

- [x] 2. Implement the Try_Script
  - [x] 2.1 Write `exorcism-demo/try.mjs`
    - Plain Node ESM using only `node:fs`, `node:path`, `node:child_process`, `node:url`; no new package, no clock, no `Math.random`, no network
    - Export pure helpers `validateConfig`, `resolveConfigPaths(config, repoDir)`, and `buildCliArgs(config, repoDir)`; run `main` only when the file is the entry point, so tests can import the helpers
    - `validateConfig` is an inlined copy of the nine-key check in `parseLoopConfig` (same keys, same types, same message shape); one line naming the key, exit 3, no file written, no build
    - Order: argument and file checks, copy sketch to `exorcism-demo/sketch/sketch.ino`, run `build.mjs` with `process.execPath`, run the CLI as `process.execPath node_modules/tsx/dist/cli.mjs --no-deprecation cli/bin.ts ... --json` with `cwd` set to the repo folder
    - Build failure: print the Build_Script output, no verdict string, exit 3. CLI finished: print its stdout and stderr unchanged, pass its exit code through
    - All `spawnSync` calls use argument arrays, no shell, never `npm`; relative config paths resolve against the repo folder; write only the Work_Sketch and what `build.mjs` writes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 10.1, 10.2, 10.5_

  - [ ]* 2.2 Write example tests for the Try_Script (skipped by the owner, not done)
    - `tests/benchmark/try-script.test.ts`, following the stub `arduino-cli` pattern in `tests/cli/demo-files.test.ts`
    - Cover: fewer than two arguments, unreadable sketch, unreadable config, invalid JSON (each one line, exit 3, no file changed); build failure pass-through with no verdict string; CLI stdout and exit code pass-through using a stub CLI entry; source text contains no `shell: true` and no `npm` child process
    - _Requirements: 1.5, 1.6, 1.7, 1.4_

  - [ ]* 2.3 Write property test for argv pass-through (skipped by the owner, not done)
    - **Property 2: Check_Config values and gremlins string reach the CLI argv unchanged**
    - Generate `LoopConfig`-shaped objects with `fc.record`; assert `--gremlins`, `--runs`, `--seed`, `--run-ms` carry the config values verbatim and `--hex`, `--pins`, `--rules` carry the repo-resolved absolute paths
    - File: `tests/benchmark/try-argv.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 2`
    - **Validates: Requirements 1.3, 10.2**

  - [ ]* 2.4 Write property test for path resolution (skipped by the owner, not done)
    - **Property 3: Check_Config path resolution is independent of the invocation directory**
    - Vary the invocation directory (and `process.cwd()` where the test can) and assert the resolved `hex`, `pins`, `rules` paths are identical; also vary `repoDir` and assert the paths move with it
    - File: `tests/benchmark/try-paths.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 3`
    - **Validates: Requirements 1.8**

  - [ ]* 2.5 Write property test for missing or wrong-typed keys (skipped by the owner, not done)
    - **Property 4: A missing or wrong-typed Check_Config key is named, and no build runs**
    - Start from a valid config, remove one key or give it a wrong-typed value; assert exactly one line naming the key, the build spy never called, exit code 3
    - File: `tests/benchmark/try-validate.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 4`
    - **Validates: Requirements 1.6, 10.5**

  - [ ]* 2.6 Write property test for sketch source left untouched (skipped by the owner, not done)
    - **Property 5: The Try_Script never mutates its sketch source**
    - Write generated bytes as the sketch in a temp folder outside `exorcism-demo/benchmark/`, run the Try_Script with stub build and CLI (build passing and build failing), assert the source bytes are unchanged
    - File: `tests/benchmark/try-source.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 5`
    - **Validates: Requirements 1.10, 5.1**

  - [x]* 2.7 Write property test for the Check_Config JSON round trip
    - **Property 8: Check_Config JSON round trip**
    - Generate `LoopConfig`-shaped objects, `JSON.stringify`, parse with `parseLoopConfig`, assert equal and all nine keys present; also assert the inlined `validateConfig` in `try.mjs` accepts and rejects the same generated configs as `parseLoopConfig`, so the duplicate cannot drift
    - File: `tests/benchmark/config-roundtrip.property.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 8`
    - **Validates: Requirements 10.1, 10.3**

- [x] 3. Checkpoint - Try_Script and fixtures
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the Overlap_Script
  - [x] 4.1 Write `exorcism-demo/measure-overlap.ts` core and single-replay mode
    - Export pure `longestOverlap(events, signalA, signalB, endCycle)` returning `{ cycles, microseconds }` with `microseconds = (cycles / 16).toFixed(2)`; a signal with no event yet never counts as 1
    - Single-replay mode: `<hex> <pins> <signalA> <signalB> --cycles <N>` or `--run-ms <N>` (reuse the existing `CYCLES_PER_MS` constant); read files with `node:fs`; build via `EmulatorBridge.create(hex, fixture, [])` then `advance`; print `<cycles> cycles (<microseconds> us)`
    - Validate that both signals exist in the fixture and are outputs, and that the HEX is readable; on failure print one line naming the cause, print no number, exit non-zero; surface `BridgeError.message` when present
    - No `avr8js` import, no clock, no `Math.random`, no network
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 9.7_

  - [x] 4.2 Add try-replay, reduced-replay, and campaign modes
    - Try-replay: replay an ordered event list given with `--events <reduced-list.json>` (the CLI's `reducedList`) on a fresh bridge, and support selecting a run by gremlin set, seed, and try number by regenerating its event list with the existing `buildEventList` and `deriveRunSeed`
    - Campaign: `--campaign <gremlins> --seed <N> --runs <N>`; measure every try with `buildEventList` and `runEventList` using a trivial no-violation `Checker`; export pure `pickCampaignMax(results)` returning the maximum and a try index whose own value equals it
    - A campaign with no overlap reports `0` cycles, `0.00` microseconds, and the phrase "no overlap found in those tries"
    - _Requirements: 4.8, 4.9, 4.10, 4.11_

  - [ ]* 4.3 Write example tests for the Overlap_Script (skipped by the owner, not done)
    - `tests/benchmark/overlap-script.test.ts`: missing signal, wrong direction, unreadable HEX each print one line and exit non-zero; `--cycles` and `--run-ms` handling; try-replay and campaign wiring against a small known HEX and fixture already used in `src/engine` tests
    - _Requirements: 4.6, 4.8, 4.9, 4.10, 4.11_

  - [x]* 4.4 Write property test for overlap shape and formula
    - **Property 1: Overlap result shape and microsecond formula**
    - Generate sorted change-points for two signals and an end cycle at or after the last one; assert cycles is an integer in `[0, endCycle]`, microseconds equals `(cycles / 16).toFixed(2)`, and the never-both-1 case gives `0` and `"0.00"`
    - File: `tests/benchmark/overlap-math.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 1`
    - **Validates: Requirements 4.1, 4.2, 4.5**

  - [x]* 4.5 Write property test for campaign maximum selection
    - **Property 6: Campaign overlap selection is the maximum, with a consistent try number**
    - Generate non-empty arrays of `{ cycles }`; assert the reported value is the maximum, the reported try index points at an entry with that value, and the all-zero case reports `0`, `"0.00"`, and `noOverlap` true (`noOverlap` is true exactly when the maximum is 0)
    - File: `tests/benchmark/overlap-math.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 6`
    - **Validates: Requirements 4.10, 4.11**

  - [x]* 4.6 Write property test for repeat determinism
    - **Property 7: Repeated measurement of the same inputs is identical**
    - Using an existing small HEX fixture from the engine tests and generated short event lists (including empty), run single-replay measurement twice and assert equal `cycles` and `microseconds`
    - File: `tests/benchmark/overlap-math.test.ts`, at least 100 runs, tagged `Feature: benchmark-tools, Property 7`
    - **Validates: Requirements 4.4**

- [x] 5. Checkpoint - Overlap_Script
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Project-constraint tests
  - [x]* 6.1 Write guard-scan and package tests
    - `tests/benchmark/guard-scan.test.ts`: apply the Banned_Words, determinism, network, and `avr8js`-import regexes from `scripts/guard.mjs` to every file added so far (`try.mjs`, `measure-overlap.ts`, the three configs, `motor/pins.json`, `motor/rules.txt`, and the README once it exists) and assert zero findings; do not edit `scripts/guard.mjs`
    - `tests/benchmark/package-json.test.ts`: `dependencies` and `devDependencies` in `package.json` are unchanged
    - _Requirements: 9.2, 9.6, 9.7, 9.8, 9.3, 9.4, 9.5_

- [x] 7. Checkpoint - Everything built, before the benchmark run
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm `arduino-cli` is available. If it is missing, stop and report; do not start the run.

- [x] 8. Run the benchmark and compare to the expected results (stop at the first difference)
  - Run every check one sketch at a time through `node exorcism-demo/try.mjs <sketch> <config>`. No batch loop that continues past a result. Record each result in a temporary record file outside `exorcism-demo/benchmark/` as soon as that check completes, then compare it to Requirement 7 before starting the next sketch.
  - At the first difference from the expected results (or a build failure, or a missing `arduino-cli`), stop. Report the sketch, the config, the expected result, the actual result, and the trace or output that shows it. Wait for the user's decision. Do not edit any `.ino`, test, config, rule, or expected value to make a result match. The Results_README is not written until every result matches or the user approves a difference.
  - Do not run the Earlier_Sketches or `chatgpt-high-kiro-fixed.ino`. Record sketch name, config name, verdict string, exit code, seed, gremlin set, run count, and for BROKE the try number, moves before and after, and fingerprint.
  - [x] 8.1 Crosswalk_Check, one Round_2_Sketch at a time
    - Order: `chatgpt-fast`, `chatgpt-high`, `claude-fast`, `claude-high`, `deepseek-fast`, `deepseek-high`, `gemini-fast`, `gemini-medium`, with `exorcism-demo/crosswalk-check.json`
    - Expected: all 8 HELD with 24 tries
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.8_

  - [x] 8.2 Crosswalk_Full_Check, one Round_2_Sketch at a time
    - Same order, with `exorcism-demo/crosswalk-full-check.json`
    - Expected: all 8 BROKE on `all of (WALK is 1, DONT_WALK is 1) must never happen.`
    - For each BROKE, save the CLI's `reducedList` and run the Overlap_Script in try-replay mode on it with `WALK` and `DONT_WALK`, `examples/crosswalk/fixture.json`, and the built HEX. Expected: 73 to 78 cycles (4.56 to 4.88 microseconds). Record the result before the next sketch
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.8_

  - [x] 8.3 Motor_Check, one Round_3_Sketch at a time
    - Order as in 8.1, from `exorcism-demo/benchmark/round3/`, with `exorcism-demo/motor-check.json`
    - Expected: 7 HELD with 200 tries; `chatgpt-fast` BROKE on try 159 on a STOP rule
    - For every sketch, run the Overlap_Script in campaign mode with `FORWARD` and `REVERSE` (same gremlin set, seed, and run count). Expected: no overlap in any try
    - For `chatgpt-fast`, compare verdict, try number, and violated rule, then measure the low time of `STOP_BUTTON` on that try's Reduced_Replay. Expected: 0.7 ms
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 7.1, 7.2, 7.3, 7.4, 7.6, 7.8_

  - [x] 8.4 Confirm the 10 ms wait by reading the code
    - Read `exorcism-demo/benchmark/round3/chatgpt-fast.ino` and confirm the 10 ms wait per loop while a direction button is held; record it as "from reading the code", not as a measurement
    - Confirm every Benchmark_Sketch is byte-for-byte unchanged (`git status`/`git diff` shows no change under `exorcism-demo/benchmark/`)
    - Report that the results were confirmed (as evidence for this seed and gremlin set, not proof), or report the stop from the first difference
    - _Requirements: 5.1, 5.2, 7.5, 7.7, 7.8_

- [x] 9. Checkpoint - Gate result
  - Proceed to task 10 only if every result matched or the user approved each difference. Otherwise stop and wait for the user.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Write the Results_README
  - [x] 10.1 Write `exorcism-demo/benchmark/README.md` from the recorded results
    - Contents in order: the two Briefs word for word (labeled round 2 (crossing) and round 3 (motor)); a one-line note that the Earlier_Sketches are kept from an earlier brief and are not in the tables; reproduction commands with config file, seed, gremlin set, and run count; three results tables (crosswalk-check, crosswalk-full-check, motor-check) with columns sketch, verdict, exit code, try number, note; Overlap_Results in cycles and microseconds for each crosswalk sketch BROKE on the WALK and DONT_WALK rule; the exact HELD text with the real N; "the smallest replay this reducer found" for each reduced list; a plain explanation of HELD, BROKE, and COULDN'T TELL, why HELD is not a proof, and why a 73 to 78 cycle overlap is brief but still a violation; a line that results are evidence from this seed and this gremlin set, not proof; a line that the sketch files are the chat tools' unedited answers; the 10 ms note labeled "from reading the code"
    - Use the actual recorded values (including any user-approved difference). No Banned_Words, no logos, no board brand name, only "ATmega328P". Chat tool names only to say which tool and setting wrote which file
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 8.16_

  - [x]* 10.2 Write the README scan test
    - `tests/benchmark/readme-scan.test.ts`, modeled on `tests/cli/readme-scan.test.ts`: both Briefs verbatim, Verdict_Strings, Reduced_Replay_Phrase, "from reading the code", the required explanation and evidence-not-proof lines, no Banned_Words, no board-brand words
    - _Requirements: 8.2, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14_

- [x] 11. Clean up and final checkpoint
  - [x] 11.1 Remove temporary files
    - Delete the temporary record file and any throwaway script or saved reduced-list file used during task 8; confirm nothing is left in the repo except the files this plan adds
    - Confirm `exorcism-demo/benchmark/` holds only the original sketches plus `README.md`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 11.2 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster pass; the benchmark run (task 8) and the README (task 10) are not optional.
- Property tests use `fast-check`, which the project already depends on, and run at least 100 iterations each.
- The design's `try-replay` mode takes the CLI's saved `reducedList` (`--events`). Requirement 4.8 also describes selecting a run by gremlin set, seed, and try number, so task 4.2 covers both.
- `scripts/guard.mjs` does not scan `exorcism-demo/`. Task 6.1 applies its rules to the new files by test rather than editing the guard script.
- Task 8 is a supervised procedure. A mismatch is a stop, not a fix.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "4.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "4.2"] },
    { "id": 2, "tasks": ["4.3", "4.4", "4.5", "4.6"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["8.2"] },
    { "id": 6, "tasks": ["8.3"] },
    { "id": 7, "tasks": ["8.4"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2"] },
    { "id": 10, "tasks": ["11.1"] }
  ]
}
```
