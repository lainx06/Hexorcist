# Implementation Plan: bridge-output-scan

## Overview

This plan follows the "Order of work" in `requirements.md`, steps 2 to 7. Step 1 (the design with the Path_Inventory) is done and has no task. One developer runs every task in order in one session while the user is away.

Rules for every task:

- **Guard at the start.** Every task, checkpoints included, begins with `node scripts/guard.mjs`, which mirrors the PreTaskExec guard hook. On any non-zero exit, do not start the task: STOP and report the task, the exit code and the full guard output, and make no further file change (Req 8.2).
- **Stop report.** Every STOP below reports the last completed Order of work step, the stop condition that applied, the output of `git status --short`, every file created or changed so far, and every `scripts/tmp-*.ts` file that remains (Req 8.9, 10.9). It also includes the outputs of Req 10.2, 10.3 and 10.4, and Req 10.1 if `BASELINE-HASH.txt` exists by then.
- **No git writes.** Use only read-only git commands (`git status`, `git diff`, `git ls-files`). Every undo is made by editing the file, never with git (Req 8.7). Delete no file that `git ls-files` lists (Req 8.8).
- **No installs.** Leave `package.json` and `package-lock.json` unchanged (Req 8.5).
- **Committed tests stay as they are.** Never edit, weaken, skip or delete a committed test, the Preservation_Test, the Preservation_Baseline or `BASELINE-HASH.txt` to make a check pass (Req 1.9, 3.7, 7.8). If a test and the system disagree, stop and report what the test expects, what happened and the evidence.
- **Missing values.** If a needed value is not stated in the request, choices C1 to C12, the Glossary or a repo file the spec names as its source, STOP and report the task, the missing value and the places checked (Req 8.4).
- **Wording.** Results are reported as pass, fail or not run, with exit codes. Never use the verdict strings for test or check results (Req 10.7). Docs and `SPIKE.md` text avoid the banned product words (Req 9.6). Passing tests are evidence, not proof.

Check_List, always in this order, recording command, exit code and pass, fail or not run for each item (Req 8.1). Before each Check_List run, compare `Get-FileHash -Algorithm SHA256 src/engine/__tests__/baselines/bridge-output-scan-preservation.json` with the hash line of `BASELINE-HASH.txt` (Req 6.9).

1. `npx vitest --run src/engine/__tests__/bridge-output-scan-preservation.test.ts` (41 passed, 0 failed, 0 skipped)
2. `npx vitest --run` (0 failed; 59 files and 1043 tests: the 1002 committed tests in 58 files plus the 41 Preservation_Test cases)
3. `npm run typecheck`
4. `npm run guard`
5. `npm run build`
6. `npm run bench:examples`

At the earliest failing item, run no later item and record each later item as not run.

## Tasks

- [ ] 1. Order of work step 2: PWM_Fixture
  - [ ] 1.1 Write `fixtures/pwm_out/pwm_out.ino`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Follow the outline in design.md "PWM_Fixture": `setup()` sets PD6 (pin 6), PB1 (pin 9) and PB5 (pin 13) to output with `pinMode`, writes PB5 LOW and applies step index 0 (PD6 duty 0, PB1 duty 255)
    - `loop()` moves PD6 through 0, 64, 128, 192, 255 and PB1 through 255, 192, 128, 64, 0 together every 50 ms with `analogWrite`, wrapping from step 4 to step 0, and toggles PB5 with `digitalWrite` every 100 ms, using `next += interval` so the period does not drift
    - Reads no input pin
    - Text contains "ATmega328P" at least once, no "Arduino" in any letter case, no whole word "Uno" in any letter case, and no third-party product or company names; code and comments written new
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 1.2 Write `fixtures/pwm_out/fixture.json`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - `{ "pins": [ ... ] }` with exactly 3 pins in this order: `PWM_A` port D bit 6 output, `PWM_B` port B bit 1 output, `LED` port B bit 5 output
    - Each pin gives only `signal`, `port`, `bit` and `direction` (the JSON in design.md "PWM_Fixture")
    - _Requirements: 5.4_
  - [ ] 1.3 Compile the PWM_Fixture
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Run exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/pwm_out/build fixtures/pwm_out` and record the exit code
    - Non-zero exit, or `arduino-cli` or the `arduino:avr` core not installed: STOP, report the command output and exit code, install nothing, make no further change
    - _Requirements: 5.5, 5.7_
  - [ ] 1.4 Prune `fixtures/pwm_out/build/` to the 5 files
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Delete every file in `fixtures/pwm_out/build/` other than `pwm_out.ino.eep`, `pwm_out.ino.elf`, `pwm_out.ino.hex`, `pwm_out.ino.with_bootloader.bin` and `pwm_out.ino.with_bootloader.hex` (all new, untracked files)
    - List the directory and confirm it holds exactly those 5 files, the same set as `fixtures/analog_read/build/`
    - Confirm `git diff --stat -- fixtures examples` is empty
    - _Requirements: 5.6, 5.8_

- [ ] 2. Order of work step 3: preservation baseline and before numbers on the unchanged bridge
  - [ ] 2.1 Write `scripts/tmp-record-baseline.ts`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Follow design.md "Recorder_Script": takes the output path as its only argument; imports only from `src/engine/` and `tests/examples/examples-support.ts`; no avr8js import, no wall-clock call, no `Math.random`, no network call
    - Stops and writes nothing if `node_modules/avr8js/package.json` `version` is not `0.21.1`, a HEX file is missing, or `create` or any `advance()` returns a BridgeError (prints the case and the error)
    - Builds the 41 cases in stored order: cases 0-23 from `buildEventList` (crosswalk, garage, heartbeat; buggy before fixed; run index 0-3), cases 24-39 from one `createPrng(20261115)` per choices C8 and D8 (blink_button lists 0-7 with the C9 Fixture, then analog_read lists 0-7 with the C1 inline Fixture and no `restLevel`, run length 8,000,000), case 40 pwm_out (no events, run length 16,000,000)
    - Checks `validateFixture` returns `null` for `fixtures/pwm_out/fixture.json` before recording
    - Steps every case with the shared replay loop from design.md (`checkPlanInput`, `planTarget`, `maxStepCycles` 160,000, no stop at a violation) and stores the fields in Req 6.5 order
    - Checks the amended Req 6.5 end clause per case (last `cycleCount >= runCycles`, `cycleCount` before the last call `< runCycles`, 0 when there is one step); if any case fails, writes nothing and prints each failing case with its run length, the `cycleCount` before the last call and the end `cycleCount`
    - Prints the Req 5.10 result (`LED` edge count after the snapshot and every consecutive gap) and the Req 5.9 result (count of consecutive `PWM_A` and `PWM_B` edge pairs under 100,000 cycles apart) for case 40
    - Prints a per-case SHA-256 list so a mismatch in task 2.3 can name the earliest differing case
    - Writes `JSON.stringify(baseline, null, 2)` plus `\n`, UTF-8, LF (D7), with `note`, `avr8jsVersion`, `seed`, `maxStepCycles` and `cases`; no wall-clock value and no absolute path
    - _Requirements: 5.4, 5.9, 5.10, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.12, 8.6_
  - [ ] 2.2 Record the Preservation_Baseline
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Confirm `git diff --stat -- src/engine/emulator-bridge.ts` is empty
    - Run `npx tsx scripts/tmp-record-baseline.ts src/engine/__tests__/baselines/bridge-output-scan-preservation.json`
    - If the script stops (version, missing HEX, BridgeError, or the amended Req 6.5 end clause), STOP and report its output; no baseline and no hash file exist
    - Confirm the file holds 41 cases in the stated order
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.12_
  - [ ] 2.3 Record a second time and compare SHA-256
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Run `npx tsx scripts/tmp-record-baseline.ts scripts/tmp-baseline-repeat.json` on the unchanged bridge
    - Compare `Get-FileHash -Algorithm SHA256` of both files
    - Different hashes: STOP, report both hashes and the earliest differing case from the per-case SHA-256 lists; write no `BASELINE-HASH.txt`; leave `src/engine/emulator-bridge.ts` unchanged
    - _Requirements: 6.10, 6.11_
  - [ ] 2.4 Check Req 5.10, Req 5.9 and the amended Req 6.5 end clause on the recorded baseline
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Req 5.10 on case 40: at least 9 `LED` edges after the cycle-0 snapshot, every consecutive gap between 1,568,000 and 1,632,000 cycles. If not met: STOP before writing `BASELINE-HASH.txt`, report the recorded `LED` edge cycles, make no further change (Req 5.11)
    - Req 5.9 on case 40: at least 10 consecutive edge pairs under 100,000 cycles apart for `PWM_A` and, separately, for `PWM_B`. Record the counts. If either falls short: keep the case, record which signal falls short and that the PWM_Fixture does not exercise the timer-override path, and mark Option_B as skipped for task 6.1; continue (Req 5.12)
    - Amended Req 6.5 end clause on all 41 cases, from the recorder output: record that every case meets it
    - _Requirements: 5.9, 5.10, 5.11, 5.12, 6.5_
  - [ ] 2.5 Write `.kiro/specs/bridge-output-scan/BASELINE-HASH.txt`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Run `Get-FileHash -Algorithm SHA256 src/engine/__tests__/baselines/bridge-output-scan-preservation.json` and `Get-Date -Format o` at the same moment
    - Two lines: `sha256 <64 hex characters as printed>` and `taken <Get-Date -Format o output>`
    - From here on the baseline file is never changed (Req 6.9)
    - _Requirements: 6.7, 6.9_
  - [ ] 2.6 Write the Preservation_Test `src/engine/__tests__/bridge-output-scan-preservation.test.ts`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Follow design.md "Preservation_Test": reads the baseline with `readFileSync` from a path built from `import.meta.url`
    - Load errors register one failing test named `baseline missing`, `baseline not parseable` or `baseline holds N cases, expected 41`, and no case tests
    - One `it` per case named `case <index> <id> (<hex>)`; new bridge per case; HEX read as UTF-8 from the stored repo-relative path; stored Fixture; deep copy of the stored events; same replay loop as the recorder; never calls `createPrng` or `buildEventList`; writes no file
    - A BridgeError fails the case with the case, the call (`create` or `advance #n`), `kind` and `message`
    - Exact comparison in Req 6.5 field order (call count, then per call `cyclesConsumed`, `outputEvents`, `appliedInputs`, `appliedAnalogInputs`, `diagnostics`, `cycleCount`); lowest differing index in a list; field sets and `Object.is` on values; failure message names case index, HEX path, field path, list index, expected and actual
    - `const PRESERVATION_TIMEOUT_MS = 120_000;` passed to every `it`
    - No clock, no randomness, no network, no avr8js import, no `skip`, `only` or `todo`; file header says a pass is evidence that the 41 recorded cases match, not proof
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11_
  - [ ] 2.7 Run the Preservation_Test alone on the unchanged bridge
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Confirm `git diff --stat -- src/engine/emulator-bridge.ts` is empty
    - Run `npx vitest --run src/engine/__tests__/bridge-output-scan-preservation.test.ts`; expect 41 passed, 0 failed, 0 skipped, exit code 0
    - Any failure: STOP and report the failing case, the differing field, expected and actual; change nothing else (baseline, hash file, comparison, timeout and bridge stay as they are)
    - Record the longest per-case duration Vitest reports
    - _Requirements: 7.7, 7.8_
  - [ ] 2.8 Fix the timeout constant if needed, before any bridge edit
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - If 3 times the longest per-case duration from task 2.7 exceeds 120,000 ms, raise `PRESERVATION_TIMEOUT_MS` to the next multiple of 10,000 above 3 times that duration, then rerun the command from task 2.7 and confirm 41 passed, 0 failed, 0 skipped
    - Otherwise leave the constant at 120,000
    - The value stays fixed for the rest of the work
    - _Requirements: 7.5_
  - [ ] 2.9 Delete the recorder and the repeat file
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Delete `scripts/tmp-record-baseline.ts` and `scripts/tmp-baseline-repeat.json` (both untracked, created by this work)
    - _Requirements: 6.8_
  - [ ] 2.10 Write `scripts/tmp-raw-speed.ts`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Follow design.md "Speed scripts" and choice C10: for each of the 4 pairs in Req 9.2 (crosswalk/fixed, heartbeat/fixed, blink_button with the C9 Fixture, pwm_out), 3 runs of a fresh `EmulatorBridge.create(hex, fixture, [])` advanced in 160,000-cycle steps to 16,000,000 cycles, timed with `performance.now()`, then 3 runs of avr8js alone (`CPU` with 2048 bytes of SRAM, ports B/C/D, Timer0/1/2, ADC, `avrInstruction(cpu); cpu.tick();` until `cpu.cycles >= 16_000_000`)
    - Prints JSON with all 3 values and the median per case in whole cycles/s, `process.version` and the OS line in the format `bench:examples` prints; a run that throws or ends below 16,000,000 cycles is reported as failed with its message and gets no figure
    - Run `npm run typecheck` and confirm exit code 0 with this file present
    - This file stays unchanged until task 8.1
    - _Requirements: 8.6, 9.2, 9.5, 9.8_
  - [ ] 2.11 Take the before speed numbers
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Confirm `git diff --stat -- src/engine/emulator-bridge.ts` is empty
    - Run `npx tsx scripts/tmp-raw-speed.ts` and save its stdout to `scripts/tmp-speed-before.json` together with `Get-FileHash -Algorithm SHA256 scripts/tmp-raw-speed.ts`
    - Run `npm run bench:examples` and save stdout to `scripts/tmp-bench-examples-before.txt` with `Out-File -Encoding utf8`
    - Do not run `npm run bench`
    - _Requirements: 9.2, 9.3, 9.7, 9.8_

- [ ] 3. Checkpoint: baseline in place, bridge unchanged
  - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
  - Ensure all tests pass, ask the user if questions arise. The user is away, so a question becomes a STOP with a report per Req 8.4.
  - Run `npx vitest --run` on the unchanged bridge; expect 59 files and 1043 tests passed, 0 failed. A committed test failing here is a STOP per Req 8.3 (report file, test name, expected, actual, vitest output)
  - Confirm the baseline SHA-256 equals `BASELINE-HASH.txt`, `git diff --stat -- src/engine/emulator-bridge.ts` is empty, and `scripts/tmp-raw-speed.ts`, `scripts/tmp-speed-before.json` and `scripts/tmp-bench-examples-before.txt` are the only `scripts/tmp-*` files

- [ ] 4. Order of work step 4: Option_A
  - [ ] 4.1 Edit `src/engine/emulator-bridge.ts` for Option_A
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Before the edit: record `Get-FileHash -Algorithm SHA256 src/engine/emulator-bridge.ts` as the pre-edit hash and keep the pre-edit text in the session for the Req 3.6 restore
    - Add the private `OutPin` interface and `_outPins` field; in `_build` step 9 push `{ idx: i, port, bit: pin.bit, signal: pin.signal }` for each pin passing the existing `isAnalogPin` and `direction` checks, using the `portMap` object; freeze the list and its entries; pass it to the private constructor as one new trailing parameter
    - Replace step 5 of `advance()` with the Option_A loop from design.md: iterates only `_outPins`, reads `o.port.pinState(o.bit)`, updates `shadow[o.idx]`, pushes `{ signal, value, cycle }`; no `isAnalogPin`, no `direction` read, no `_portMap.get`, no `_fixture.pins` inside that loop
    - No change to public names, types, field order, error paths, listeners or hooks; no clock or randomness calls; no other file under `src/` edited
    - _Requirements: 1.8, 1.10, 3.1, 3.2, 3.3, 3.4, 8.6_
  - [ ] 4.2 Run the Check_List on Option_A
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Compare the baseline SHA-256 with `BASELINE-HASH.txt`, then run the 6 Check_List items in order and record command, exit code and result for each; for `npx vitest --run` record files and tests passed and failed
    - Pass only if the Preservation_Test matches all 41 cases, vitest shows 0 failed with 59 files and 1043 tests, and every other item exits 0. No speed-up is a pass condition
    - On any failure: record later items as not run; restore `src/engine/emulator-bridge.ts` to the pre-edit text by editing; confirm its SHA-256 equals the pre-edit hash from task 4.1; keep the baseline, hash file and Preservation_Test unchanged; skip Option_B; STOP and report the failing item, its output, and for a Preservation_Test failure the case and the earliest differing field
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 3.5, 3.6, 3.7, 6.9, 8.1_
  - [ ] 4.3 Record the SHA-256 of the Option_A file text
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Run `Get-FileHash -Algorithm SHA256 src/engine/emulator-bridge.ts` and keep the hash and the full Option_A text in the session for the Req 4.8 fallback
    - _Requirements: 4.8_

- [ ] 5. Checkpoint: Option_A passes the Check_List
  - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
  - Ensure all tests pass, ask the user if questions arise. The user is away, so a question becomes a STOP with a report per Req 8.4.
  - Confirm task 4.2 recorded pass for all 6 items and the baseline SHA-256 still equals `BASELINE-HASH.txt`

- [ ] 6. Order of work step 5: Option_B
  - [ ] 6.1 Check the gate, then edit `src/engine/emulator-bridge.ts` for Option_B
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Gate: design.md states "Does Option_B cover every Pin_State_Path? Yes" (P1-P4 by the Port_Listener, P10-P16 by the per-instruction DDRx compare). Build Option_B only if that statement is unchanged and task 2.4 recorded at least 10 short-gap pairs for both `PWM_A` and `PWM_B` (Req 5.9). If either condition fails, make no edit, record Option_B as skipped with the reason (the uncovered path's file and line from the Path_Inventory, or the signal that fell short), mark task 6.2 not run, and go to task 7
    - Edit on top of the Option_A text: add `_outDirty` (starts `true`, D5), `_watchDdrAddr` and `_watchDdrSeen` for the distinct ports in `_outPins` order (DDR addresses 0x24, 0x27, 0x2A from the port configs)
    - At the end of `_build`: step 11c appends one listener per watched port that sets `_outDirty = true`, after every existing listener (D4); just before `return bridge`, fill `_watchDdrSeen` from `cpu.data`
    - In `advance()` step 1, set `_outDirty = true` after each applied input event, digital or analog (D3)
    - Replace step 5 with the gated scan from design.md: scan when `_outDirty` is set or a watched DDRx byte differs from `_watchDdrSeen`; the scan body is the unchanged Option_A loop; after the scan clear `_outDirty` and record the watched DDRx bytes; otherwise skip the scan
    - No change to public names, types, field order or error paths; no clock or randomness calls
    - _Requirements: 1.8, 1.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 5.12_
  - [ ] 6.2 Run the Check_List on Option_B, with the fallback to Option_A
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Skip this task (record not run) if task 6.1 recorded Option_B as skipped
    - Compare the baseline SHA-256 with `BASELINE-HASH.txt`, then run the 6 Check_List items in order and record command, exit code and result for each; for `npx vitest --run` record files and tests passed and failed
    - On any failure: record later items as not run; record the failing item, or the case and the earliest differing field; restore the Option_A text by editing; confirm its SHA-256 equals the hash from task 4.3; run the Check_List again in order and record the results; continue with Option_A
    - If the Option_A rerun fails any item: restore the pre-edit text by editing, confirm its SHA-256 equals the pre-edit hash from task 4.1, keep the baseline, hash file and Preservation_Test, and STOP and report the failing item and its output
    - _Requirements: 4.7, 4.8, 4.10, 6.9, 8.1_

- [ ] 7. Checkpoint: kept option passes the Check_List
  - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
  - Ensure all tests pass, ask the user if questions arise. The user is away, so a question becomes a STOP with a report per Req 8.4.
  - Record the kept option (Option_B, or Option_A with the reason Option_B was skipped or undone) and confirm its most recent Check_List run recorded pass for all 6 items

- [ ] 8. Order of work step 6: after numbers, SPIKE.md section, cleanup
  - [ ] 8.1 Take the after speed numbers
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Confirm `Get-FileHash -Algorithm SHA256 scripts/tmp-raw-speed.ts` equals the hash stored in `scripts/tmp-speed-before.json`
    - With the kept option in place, run `npx tsx scripts/tmp-raw-speed.ts` and save stdout to `scripts/tmp-speed-after.json`
    - Run `npm run bench:examples` and save stdout to `scripts/tmp-bench-examples-after.txt` with `Out-File -Encoding utf8`
    - Do not run `npm run bench`
    - _Requirements: 9.2, 9.3, 9.7, 9.8_
  - [ ] 8.2 Append `## Output scan fix` to `SPIKE.md`
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Append after the last existing line; leave every existing section and the `bench:raw`, `bench:campaign` and `bench:examples` marker comments byte-for-byte unchanged
    - Req 9.2 table: one row per pair (crosswalk/fixed, heartbeat/fixed, blink_button, pwm_out) with before median and 3 values, after median and 3 values, after/before to 2 decimal places, and avr8js-alone median and 3 values, in whole cycles/s
    - Two `bench:examples` tables copied unchanged, labelled "before" and "after", every row of both repeats, kept separate from the Req 9.2 table with a note that the crosswalk raw cases apply Rest_Events
    - Name the kept option and say if Option_B was skipped or undone; Node version and OS and CPU line per session exactly as printed (both when they differ); run counts (3 runs per Req 9.2 figure with the median shown; 2 repeats per `bench:examples` case, each raw row 3 runs of 16,000,000 cycles, each campaign row the Example's `meta.runs` runs)
    - State that all figures come from one machine, standalone under `tsx`; no claim about other machines, browsers or other HEX files; a failed measurement gets no figure and is named with its HEX, measurement and error
    - Check the new text for the banned product words, then confirm `git diff -- SPIKE.md` shows only added lines after the last existing line
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6, 9.8_
  - [ ] 8.3 Delete every `scripts/tmp-*` file
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Delete `scripts/tmp-raw-speed.ts`, `scripts/tmp-speed-before.json`, `scripts/tmp-bench-examples-before.txt`, `scripts/tmp-speed-after.json`, `scripts/tmp-bench-examples-after.txt` and any other `scripts/tmp-*` file this work created
    - _Requirements: 6.8, 10.3_

- [ ] 9. Order of work step 7: final checks and report
  - [ ] 9.1 Run the final checks
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Run `Get-FileHash -Algorithm SHA256 src/engine/__tests__/baselines/bridge-output-scan-preservation.json`; show the output and the hash line of `BASELINE-HASH.txt`; state whether the two 64-character values are equal ignoring letter case
    - Run `git diff --stat -- src/engine/__tests__ tests fixtures examples` and `git diff --cached --stat -- src/engine/__tests__ tests fixtures examples`; show both outputs and confirm both are empty
    - List `scripts/tmp-*` and confirm zero files; if a file this work created remains, delete it and list again
    - Write the list of every file created or changed, each marked "created" or "changed", and show the full `git status --short`; every path in that output must match the list (a directory entry such as `?? fixtures/pwm_out/` matches the files under it); name any path this work did not make
    - Any unexpected result: report the check with its full output; do not edit the baseline or hash file, revert files, or rerun against changed files to make it pass
    - _Requirements: 1.9, 5.8, 6.9, 8.5, 10.1, 10.2, 10.3, 10.4, 10.8_
  - [ ] 9.2 Write the report
    - Start: `node scripts/guard.mjs`; non-zero exit = STOP (Req 8.2)
    - Name the kept option (Option_A, Option_B, or neither)
    - For each Check_List item of each run: command, exit code, pass or fail (or not run); for `npx vitest --run` the number of test files and tests passed and failed
    - If Option_B was skipped: the uncovered Pin_State_Path or the missing `PWM_A`/`PWM_B` short-gap pairs, and the reason. If Option_B was undone: the case and earliest differing field, or the failing Check_List item, and the Option_A rerun results
    - Include the outputs from task 9.1
    - State that the passing Preservation_Test and Committed_Suite are evidence, not proof: they show only that the 41 recorded cases and the committed tests match, not that every HEX, Fixture and input event list matches
    - Use pass, fail and not run for results; no verdict strings; none of the banned product words
    - _Requirements: 10.5, 10.6, 10.7, 10.9_

## Notes

- No optional test sub-tasks. The design adds no property test file (decision D6 was dropped); Properties 2-5 rest on the Preservation_Test, the committed bridge tests and the Path_Inventory. The only new test file is the Preservation_Test (task 2.6), and it is a required task.
- Deletion order in step 3 follows the request: the recorder and the repeat file are deleted in task 2.9, before `scripts/tmp-raw-speed.ts` is written. The design's step 3 summary lists the deletion after the before numbers; the request's order is used.
- Between task 2.11 and task 8.3, `scripts/tmp-raw-speed.ts`, `scripts/tmp-speed-before.json` and `scripts/tmp-bench-examples-before.txt` are expected to exist. `tsconfig.node.json` includes `scripts/`, so `scripts/tmp-raw-speed.ts` must pass `npm run typecheck` in every Check_List run.
- The after files `scripts/tmp-speed-after.json` and `scripts/tmp-bench-examples-after.txt` are a choice of this plan; the spec does not name where after output is saved. They are deleted in task 8.3.
- Each task references requirement clauses for traceability. Checkpoints confirm state at the end of steps 3, 4 and 5.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["2.4"] },
    { "id": 7, "tasks": ["2.5"] },
    { "id": 8, "tasks": ["2.6"] },
    { "id": 9, "tasks": ["2.7"] },
    { "id": 10, "tasks": ["2.8"] },
    { "id": 11, "tasks": ["2.9"] },
    { "id": 12, "tasks": ["2.10"] },
    { "id": 13, "tasks": ["2.11"] },
    { "id": 14, "tasks": ["4.1"] },
    { "id": 15, "tasks": ["4.2"] },
    { "id": 16, "tasks": ["4.3"] },
    { "id": 17, "tasks": ["6.1"] },
    { "id": 18, "tasks": ["6.2"] },
    { "id": 19, "tasks": ["8.1"] },
    { "id": 20, "tasks": ["8.2"] },
    { "id": 21, "tasks": ["8.3"] },
    { "id": 22, "tasks": ["9.1"] },
    { "id": 23, "tasks": ["9.2"] }
  ]
}
```
