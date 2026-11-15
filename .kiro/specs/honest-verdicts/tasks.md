# Implementation Plan: Honest Verdicts

## Overview

The work runs unattended, in this order:

1. Calibration (Requirement 2). Runs now, with every file under `src/` unchanged.
2. Part 3, the Evidence_Bench (Requirements 16 to 19). Runs now. It touches no file under `src/`.
3. Final checks and the final Report for the work that ran (Requirements 20 to 23).
4. Part 1, unmodelled peripheral detection (Requirements 3 to 8). **BLOCKED** by the OI-1 STOP (Requirement 1.7, 23.8).
5. Part 2, failure story wording (Requirements 9 to 15). **BLOCKED** by the OI-2 STOP (Requirement 15.4, 23.9).

Groups 4 and 5 come after the final Report on purpose: a sequential runner reaches the runnable work and the Report first. Nothing in groups 4 and 5 may start until the user's decision is recorded in `requirements.md` (Requirement 23.12).

Rules for every task:

- Kiro never commits.
- No Committed_Test_File, Baseline, committed file under `fixtures/` or `examples/`, or package entry changes, except the Pre_Approved_Edits of group 5 (Requirements 15.1, 20.2, 20.3, 20.4).
- Never change, weaken or delete an acceptance test to make it pass. If a test and the system disagree, STOP and report what the test expects, what happened and the evidence (Requirement 23.7).
- Temporary scripts are named `scripts/tmp-*.ts` and are deleted before a task is reported done (Requirement 21).
- Tests are evidence, not proof. Reports never describe passing tests otherwise (Requirement 20.6).
- Verdicts are written only with the Verdict_Strings: `BROKE`, `COULDN'T TELL`, and the exact HELD text with its real N.
- Findings that the final Report needs are written to `.kiro/specs/honest-verdicts/report-notes.md` as they happen, so that task 3.6 can quote them.

## Tasks

- [ ] 1. Calibration on the committed programs, with `src/` unchanged
  - Runs now. Changes no file under `src/`.
  - A STOP from this group blocks Part 1 (already blocked by OI-1) and nothing in groups 2 and 3 (Requirement 23.11).

  - [ ] 1.1 Inventory the Fixtures and run lengths of the four fixture programs
    - For each of `fixtures/blink_button`, `fixtures/analog_read`, `fixtures/pwm_out` and `fixtures/floating_input`, search every Committed_Test_File (`src/engine/__tests__/`, `tests/`) and every committed `bench/` script for code that reads that program's HEX (for example `bench/campaign-bench.ts`, `bench/example-campaign-bench.ts`, `src/engine/__tests__/rules-arbitraries-campaign.ts` lines 14-30)
    - Record each distinct Fixture literal with its file and line, and the longest run length in cycles made with that HEX
    - Where a property test builds Fixtures from a generator, record the generator's base pin-map literal and say so (design NC-4)
    - Write the inventory into `.kiro/specs/honest-verdicts/report-notes.md` under "Calibration inventory"; task 1.2 hard-codes it as constants
    - _Requirements: 2.3_

  - [ ] 1.2 Write the Calibration_Script `scripts/tmp-calibrate.ts`
    - Follows design component C1, option (c): `EmulatorBridge.create`, then wrap `readHooks` and `writeHooks` of every register of rows U1 to U16 on the bridge's private `_cpu` through a structural `HookCpu` type and a cast. No avr8js import.
    - Read wrapper returns `prevR ? prevR(addr) : cpu.data[addr]`; write wrapper returns `prevW ? prevW(value, old, addr, mask) : false`, so no value or data byte changes (Requirement 2.7)
    - `TABLE_REGISTERS`: name, data-space address and Disable_Mask of every register in the design's Use_Access and Disable_Write table, written as script constants (no new file under `src/`)
    - Log entry per access: register name, address, integer `cpu.cycles`, `"read"` or `"write"`, byte value (Requirement 2.1)
    - Examples: `crosswalk`, `garage`, `heartbeat`, buggy and fixed, Run_Index 0 to 3, through the existing `runOne` with a `bridgeFactory`, the Example's `fixture.json`, `gremlinSet` and committed `campaignSeed`, a checker `() => ({ violation: null })`, to the Example's `runCycles` (Requirement 2.2)
    - Fixture programs: one run per Fixture of the task 1.1 inventory, with the empty event list (design Choices C5), at least the longest run length found (Requirement 2.3)
    - Classify each access by the design rule D2: every read is a Use_Access; a write is a Disable_Write only when the register has a Disable_Mask and `value & mask` is 0; anything else is "other" (Requirement 2.4)
    - Transparency self-check for Requirement 2.7: for each run, also run the same inputs on a bridge without logging and compare `endCycle` and `outputEvents` (deep-equal)
    - Exit codes: 0 clean; 1 load or bridge error (Requirement 2.8); 2 a Use_Access (Requirement 2.5); 3 an "other" access (Requirement 2.6); 4 a transparency mismatch. Each non-zero exit prints program, Run_Index or Fixture, register, cycle, access and value or the error.
    - Prints a per-program table: access, classification, count
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8, 21.1_

  - [ ] 1.3 Run the Calibration_Script and record the results
    - Before running, confirm `git status --porcelain src/` prints nothing (Requirement 2.1)
    - Run `npx tsx scripts/tmp-calibrate.ts`
    - Copy into `report-notes.md` under "Calibration results": per run the Fixture, its file and line, the event list (or its seed and Run_Index), the run length; per program every logged access with its classification
    - Expected from the sources, not a substitute for the run: every program logs one access, the Disable_Write `UCSR0B = 0` from the core start-up code
    - Exit 2: STOP (Requirement 2.5, 23.2). Record program, Run_Index, register, cycle, access and value as a finding that changes the plan.
    - Exit 3: STOP (Requirement 2.6). Record the access as a value not given.
    - Exit 1: STOP (Requirement 2.8). Record program, Run_Index or Fixture and the error. Change no file under `src/`.
    - Exit 4: STOP (Requirement 2.7). Record the run and the first differing field.
    - A STOP here does not block groups 2 and 3
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.8, 22.1, 23.2_

  - [ ] 1.4 Delete the Calibration_Script
    - Delete `scripts/tmp-calibrate.ts`, whatever the result of task 1.3
    - Confirm no `scripts/tmp-*.ts` file remains and `git status --porcelain src/` prints nothing
    - _Requirements: 2.8, 21.2_

- [ ] 2. Part 3: the Evidence_Bench and the Evidence_Doc
  - Runs now. Uses only the existing Campaign and Run code through `tests/examples/examples-support.ts` (design D5). Changes no file under `src/`.

  - [ ] 2.1 Write the pure helpers `bench/evidence-stats.ts`
    - Types `SeedSweepRow`, `PressSweepRow`, `EvidenceResults` as in the design's Part 3 data model
    - `sweepStarts(runCycles, holdCycles, step = 160_000)`: every `k * step` with `k >= 1` and `k * step + holdCycles < runCycles`, ascending (Requirement 18.2)
    - `medianText(values)`: "none" for an empty list; middle value for an odd count; mean of the two middle values for an even count, without a decimal point when it is an integer and with one decimal otherwise (Requirements 17.3, 17.4, 17.5)
    - `minMaxText(values)` (or equivalent): min and max, "none" for an empty list (Requirements 17.2, 17.5)
    - `renderEvidenceDoc(results)`: the layout in design component C8; names "ATmega328P"; says the numbers are evidence from emulated runs and not a proof; writes BROKE and COULDN'T TELL as Verdict_Strings and quotes each HELD text exactly as seen; machine block, seed ranges, date, wall-clock seconds per sweep and in total; column "Violating run number" (Requirements 19.1, 19.2, 19.3, 19.4)
    - `findForbiddenWords(text)`: whole-word, case-insensitive matches of `BANNED_WORDS` (imported from `src/engine/copy-rules.ts`, unchanged), "realtime", every `BOARD_BRAND_NAMES` entry from `tests/examples/examples-support.ts` (includes "Arduino"), plus any line holding `guard-allow` (Requirements 19.4, 19.6)
    - No wall-clock read, no `Math.random` in this file (Requirement 16.3)
    - _Requirements: 16.3, 17.2, 17.3, 17.4, 17.5, 18.2, 19.1, 19.2, 19.3, 19.4, 19.6_

  - [ ] 2.2 Write small unit tests `tests/evidence/evidence-stats.test.ts` (new file)
    - `medianText`: `[]` gives "none"; `[3]` gives "3"; `[1, 2]` gives "1.5"; `[1, 3]` gives "2"; unsorted input is sorted first
    - `sweepStarts` counts with the Single_Input constants: crosswalk (16,000,000, 800,000) gives 94 starts, 160,000 to 15,040,000; garage (10,000,000, 32,000) gives 62, 160,000 to 9,920,000; heartbeat (16,000,000, 1,600,000) gives 89, 160,000 to 14,240,000
    - `renderEvidenceDoc` on a small hand-built `EvidenceResults` holds every count, the machine block, "ATmega328P", "not a proof", and gives an empty `findForbiddenWords` list
    - `findForbiddenWords` flags "Arduino", "realtime", "Shortest" and a `guard-allow` line
    - _Requirements: 17.3, 17.4, 17.5, 18.1, 18.2, 18.4, 19.1, 19.2, 19.4, 19.6_

  - [ ] 2.3 Write the bench `bench/evidence.ts`
    - Imports `loadExample`, `readHex`, `runExampleCampaign`, `buildScriptedEvents`, `scriptedRun` from `tests/examples/examples-support.ts`; copies no engine logic (design D5, Requirement 16.2)
    - Seed_Sweep: Examples in the order `crosswalk`, `garage`, `heartbeat`; buggy build seeds 1 to 100, fixed build seeds 1 to 20, each through `runExampleCampaign({ ...ex, meta: { ...ex.meta, campaignSeed: s } }, variant)`; count BROKE, HELD and COULDN'T TELL; collect `violatingRunIndex + 1` for buggy BROKE Campaigns; collect the distinct HELD texts (Requirements 17.1, 17.2, 17.6)
    - Single_Press_Sweep: constants REQUEST 800,000, BEAM_CLEAR 32,000, PULSE 1,600,000 hold cycles; for each Example, build and `sweepStarts` value s in ascending order, `buildScriptedEvents(ex.fixture, [{ signal, value: pressValue, cycle: s }, { signal, value: "release", cycle: s + hold }], ex.meta.runCycles)` then `scriptedRun(..., { untilEnd: true })`; record start count, Runs with a Violation and their Sweep_Starts, Runs with a CannotCheck (Requirements 18.1 to 18.4, 18.6; design Choices C11)
    - Machine info from `os` and `process.version`; avr8js version from `node_modules/avr8js/package.json`; date from `new Date().toISOString()` (UTC, design Choices C14); wall-clock seconds per sweep and in total. The wall clock is read only in this file (Requirements 16.3, 19.2).
    - Exit codes (design Choices C15): a thrown Campaign or Scripted_Run prints Example, build, seed or Sweep_Start and the error, exits 1, writes no doc (Requirement 17.7); a fixed-build BROKE prints Example, seed and the BROKE trace as JSON, finishes every sweep, exits 3, writes no doc (Requirement 17.8, design Choices C10); a forbidden word in the rendered text prints the words and lines, exits 4, writes no doc (Requirement 19.4)
    - Otherwise creates `docs/evidence/` with `mkdirSync(..., { recursive: true })` and writes `docs/evidence/EVIDENCE-NUMBERS.md` (Requirement 16.4)
    - _Requirements: 16.2, 16.3, 16.4, 17.1, 17.2, 17.6, 17.7, 17.8, 18.1, 18.2, 18.3, 18.4, 18.6, 19.1, 19.2, 19.7_

  - [ ] 2.4 Add the `bench:evidence` script to `package.json`
    - Add `"bench:evidence": "tsx bench/evidence.ts"` to `scripts` only
    - `dependencies`, `devDependencies` and `package-lock.json` stay unchanged
    - _Requirements: 16.1, 20.4_

  - [ ]* 2.5 Write property test for the median text
    - **Property 10: Median text**
    - New file `tests/evidence/evidence-stats.property.test.ts`, tag comment `// Feature: honest-verdicts, Property 10: Median text`, fixed `seed`, `numRuns` at least 100
    - **Validates: Requirements 17.2, 17.3, 17.4, 17.5**

  - [ ]* 2.6 Write property test for sweep starts and their event lists
    - **Property 11: Sweep starts and their event lists**
    - Same file as 2.5; runCycles 1 to 2^32, hold 1 to runCycles; event lists checked through `buildScriptedEvents` for each Example
    - **Validates: Requirements 18.2, 18.6**

  - [ ]* 2.7 Write property test for the Evidence_Doc wording
    - **Property 12: The Evidence_Doc wording**
    - Same file as 2.5
    - **Validates: Requirements 19.3, 19.4, 19.6**

  - [ ] 2.8 Run the bench and record the findings
    - Run `npm run bench:evidence` once, with a timeout of 30 minutes (estimate 10 to 15 minutes; not an acceptance value)
    - Exit 0: confirm `docs/evidence/EVIDENCE-NUMBERS.md` exists and holds only numbers the bench produced (Requirement 19.7). Copy into `report-notes.md` the Seed_Sweep counts and every non-zero Single_Press_Sweep Violation count with its Sweep_Starts, as findings (Requirement 18.5). Continue.
    - Exit 3: STOP (Requirements 17.8, 23.4). Record Example, seed and trace in `report-notes.md`. Change no example, rule, fixture or test. No doc is written. Group 3 still runs.
    - Exit 1: record Example, build, seed or Sweep_Start and the error; STOP and report (Requirement 17.7)
    - Exit 4: if the word comes from the bench's own fixed text, fix that text in `bench/evidence-stats.ts` (never a number) and rerun; if it comes from a machine string, STOP and report the string (Requirement 23.6)
    - _Requirements: 16.4, 17.7, 17.8, 18.5, 19.7, 22.1, 23.4_

  - [ ] 2.9 Check the Evidence_Doc with the Guard
    - Run `npm run guard`. Any finding for `docs/evidence/EVIDENCE-NUMBERS.md` or any other file: STOP and report the Guard output (Requirements 19.5, 23.1)
    - Confirm the doc holds no `guard-allow` text and no board brand (Requirements 19.4, 19.6)
    - _Requirements: 19.4, 19.5, 19.6, 23.1_

- [ ] 3. Final checks and the final Report for the work that ran
  - Covers groups 1 and 2 only. Requirement 20 is not reported as met for Requirements 3 to 15 (Requirement 23.12).

  - [ ] 3.1 Run `npx vitest --run`
    - Report pass and fail counts as evidence, not proof (Requirement 20.6)
    - A failing committed test: STOP and report the test, what it expects, what happened and the evidence (Requirements 23.3, 23.7)
    - _Requirements: 20.1, 20.6, 23.3, 23.7_

  - [ ] 3.2 Run `npm run typecheck`
    - _Requirements: 20.1_

  - [ ] 3.3 Run `npm run guard`
    - A finding: STOP and report the Guard output
    - _Requirements: 20.1, 20.5, 23.1_

  - [ ] 3.4 Run `npm run build`
    - _Requirements: 20.1_

  - [ ] 3.5 Check the working tree
    - `git status` and `git diff --stat` list only: `package.json` (the one script line), `bench/evidence.ts`, `bench/evidence-stats.ts`, `tests/evidence/` (new files), `docs/evidence/EVIDENCE-NUMBERS.md`, and files under `.kiro/specs/honest-verdicts/`
    - No file under `src/` changed. No Committed_Test_File, Baseline, committed `fixtures/` or `examples/` file changed. `package-lock.json` unchanged; `dependencies` and `devDependencies` unchanged.
    - No `scripts/tmp-*.ts` file exists
    - _Requirements: 20.2, 20.3, 20.4, 20.5, 21.2_

  - [ ] 3.6 Write the final Report
    - Every STOP that fired, with criterion number, evidence and blocked requirements: OI-1 (Requirement 1.7, 23.8; blocks 3 to 8), OI-2 (Requirement 15.4, 23.9; blocks 9 to 15), and any STOP from tasks 1.3, 2.8, 2.9 or 3.1 to 3.4 (Requirement 23.13)
    - The user decisions still needed: OI-1 options (a) to (c), OI-2 options (a) to (c), OI-3, NC-1 (datasheet section numbers)
    - Calibration results from `report-notes.md` (Requirements 2.3, 2.4, 22.1)
    - Seed_Sweep summary and every Single_Press_Sweep finding (Requirements 18.5, 22.1)
    - "Choices I made": design Choices C1 to C15 that applied, plus the choices made in this plan (exit codes of the Calibration_Script, its transparency self-check, `report-notes.md`, `BOARD_BRAND_NAMES` in `findForbiddenWords`) (Requirement 22.2)
    - Every changed file with paths and line ranges (Requirement 22.3)
    - New conflicts NC-1 to NC-6 from the design
    - Tests described as evidence, not proof (Requirement 20.6)
    - Ask the user if questions arise
    - _Requirements: 20.6, 22.1, 22.2, 22.3, 23.11, 23.12, 23.13_

- [ ] 4. Part 1: unmodelled peripheral detection (BLOCKED: OI-1 STOP, waiting for the user's decision)
  - Do not start any sub-task until 4.1 passes. Apply the user's OI-1 option (a), (b) or (c) as recorded in `requirements.md`; where the decision changes a criterion below, the recorded criterion wins.

  - [ ] 4.1 Confirm the user's decision on OI-1 is recorded in requirements.md before starting
    - `requirements.md` must state the chosen option for OI-1 and the changed text of Requirements 1.7, 8.2 and 8.5 (or their removal). If it does not, make no change and report that group 4 is still blocked.
    - Also confirm whether the user answered OI-3 and NC-1; if not, follow the design's literal reading of Requirement 4.1 and the `iom328p.h` sources
    - _Requirements: 1.7, 8.2, 8.5, 23.8, 23.12_

  - [ ] 4.2 Add the Peripheral_Diagnostic type and optional fields in `src/engine/types.ts`
    - `PeripheralDiagnostic { peripheral, register, cycle, access }`
    - Optional `peripheralUses?: PeripheralDiagnostic[]` on `AdvanceResult` and `RunResult`, present only when non-empty (design D3, Choices C1)
    - _Requirements: 3.1, 3.4, 3.6, 8.4_

  - [ ] 4.3 Write the Peripheral_Table module `src/engine/peripherals.ts`
    - Frozen `UNMODELLED_PERIPHERALS` rows U1 to U16 in table order, with Peripheral_ID, Plain_Name, register names, data-space addresses and Disable_Masks from the design tables (adjusted only as the OI-1 decision says)
    - `isUseAccess(reg, access, value)` per rule D2
    - `peripheralReason(row)` with the Requirement 5.3 template
    - `PeripheralRecorder` with `access(addr, access, value, cycle)` keeping the earliest Use_Access per peripheral and ignoring Disable_Writes and unknown addresses, and `take()` returning entries since the last take in ascending cycle
    - No avr8js import, no clock, no random source
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4, 3.8, 5.2, 5.3, 5.6, 6.2_

  - [ ] 4.4 Write unit tests `src/engine/__tests__/honest-peripherals.test.ts` (new file)
    - Table holds USART0, SPI, TWI, EEPROM, WDT, AC (and EXINT/PCINT only if the OI-1 decision adds them); ids and addresses distinct
    - A write of 0 to UCSR0B is a Disable_Write
    - USART0 reason is exactly "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked."
    - Every row's reason follows the template, is at most 200 UTF-16 units and holds no Banned_Words entry as a whole word
    - _Requirements: 1.3, 1.4, 1.6, 5.2, 5.3, 5.6_

  - [ ]* 4.5 Write property test for the access classification
    - **Property 1: Every unmodelled access is exactly one of Use_Access and Disable_Write**
    - New file `src/engine/__tests__/honest-peripherals.property.test.ts`
    - **Validates: Requirements 1.5, 1.6**

  - [ ]* 4.6 Write property test for the recorder
    - **Property 2: The recorder keeps the earliest Use_Access per peripheral**
    - Same file as 4.5
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**

  - [ ] 4.7 Add peripheral detection to `src/engine/emulator-bridge.ts`
    - New step 11d after step 11c and before step 12, as in design component C2: wrap the read and write hooks of every table register; each wrapper returns what the previous hook or `cpu.data` returns and calls the recorder with `cpu.cycles`
    - `advance()` returns `peripheralUses` only when `take()` is non-empty
    - Test seam `createWithTestHooks(..., { peripheralDetection: false })` that skips step 11d
    - All avr8js use stays in this file, behind `EmulatorBridgeInterface`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 6.2_

  - [ ]* 4.8 Write property test for detection transparency
    - **Property 3: Detection is transparent and replays deep-equal**
    - New file `src/engine/__tests__/honest-bridge.property.test.ts`, 120,000 ms timeout, runs at most 400,000 cycles
    - **Validates: Requirements 3.5, 3.7, 3.9**

  - [ ] 4.9 Carry Peripheral_Diagnostics through `src/engine/campaign.ts`
    - `runEventList` appends `r.peripheralUses ?? []` after each `advance()` and returns `peripheralUses` on `RunPathResult` only when non-empty; `runOne` copies it into the RunResult the same way
    - Checkers do not receive it; the reducer's Run_Path ignores it; no Run is extended past today's stop point
    - _Requirements: 3.6, 3.9, 8.4_

  - [ ] 4.10 Add the peripheral step to `computeVerdict` in `src/engine/verdict.ts`
    - Step 0 after the `finished` check, as in design component C4: blocking diagnostics are those of a Run with no Violation, or with `cycle <= violation.cycle`
    - With any blocking diagnostic: COULDN'T TELL with `buildReason([...peripheralReasons(blocking), ...todayCouldntTellParts(input)])`; `buildReason` and `truncateReason` unchanged
    - `peripheralReasons`: one Peripheral_Reason per distinct peripheral, ordered by lowest blocking cycle, ties by table row order; an unknown id uses its id as Plain_Name and sorts last (design Choices C7, C12)
    - `todayCouldntTellParts` is today's branch 2 part list moved into a helper with no change
    - With no blocking diagnostic, steps 1 to 3 run unchanged; an unfinished Campaign still returns `null`; the function stays pure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.4, 5.5, 5.7, 6.1, 6.2, 6.3_

  - [ ]* 4.11 Write property test for the verdict rule
    - **Property 4: Peripheral use decides COULDN'T TELL, and nothing else changes**
    - New file `src/engine/__tests__/honest-verdict.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.7, 6.1, 8.3, 8.6**

  - [ ]* 4.12 Write property test for the Reason order
    - **Property 5: The Reason leads with the Peripheral_Reasons in order**
    - Same file as 4.11
    - **Validates: Requirements 5.1, 5.4, 5.5**

  - [ ] 4.13 Write and compile the New_Fixture `fixtures/serial_hello`
    - `fixtures/serial_hello/serial_hello.ino`: `Serial.begin(9600)` in `setup()`; `loop()` calls `Serial.print("hello ")`, toggles the LED on PB5 (pin 13), `delay(100)`; original code; comment names the chip "ATmega328P"; no Banned_Words entry (design Choices C8)
    - `fixtures/serial_hello/fixture.json`: `{ "pins": [ { "signal": "LED", "port": "B", "bit": 5, "direction": "output" } ] }`
    - Compile with exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/serial_hello/build fixtures/serial_hello`
    - Confirm `fixtures/serial_hello/build` holds exactly the Build_File_Set for `serial_hello`
    - Compile failure: STOP and report the compiler output; write no build file by other means (Requirements 7.9, 23.5)
    - _Requirements: 7.1, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 23.5_

  - [ ] 4.14 Write and compile the New_Fixture `fixtures/ext_interrupt` (only if the OI-1 decision keeps it)
    - Skip this task and record why if the decision is option (c)
    - `fixtures/ext_interrupt/ext_interrupt.ino`: `pinMode(2, INPUT_PULLUP)`, `pinMode(13, OUTPUT)`, `attachInterrupt(digitalPinToInterrupt(2), onEdge, CHANGE)`, `onEdge` toggles the LED on PB5; original code; comment names the chip "ATmega328P"; no Banned_Words entry (design Choices C8)
    - `fixtures/ext_interrupt/fixture.json`: `{ "pins": [ { "signal": "TRIGGER", "port": "D", "bit": 2, "direction": "input" }, { "signal": "LED", "port": "B", "bit": 5, "direction": "output" } ] }`
    - Compile with exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/ext_interrupt/build fixtures/ext_interrupt`
    - Confirm `fixtures/ext_interrupt/build` holds exactly the Build_File_Set for `ext_interrupt`
    - Compile failure: STOP and report the compiler output; write no build file by other means
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 23.5_

  - [ ] 4.15 Write the verdict tests `src/engine/__tests__/honest-verdict.test.ts` (new file)
    - `serial_hello` Campaign (rule `LED is 1 must never last 600 ms or longer.`, empty `gremlinSet`, `runs` 2, `runCycles` 1,600,000; design Choices C8) gives COULDN'T TELL with a Reason that holds the USART0 Peripheral_Reason (Requirement 8.1)
    - BROKE when the violating Run's only Peripheral_Diagnostic is at Violation_Cycle + 1, with that Run's trace (Requirement 8.3)
    - COULDN'T TELL when the only Peripheral_Diagnostic is at the Violation_Cycle (Requirement 8.6)
    - New_Fixture file checks: `validateFixture` returns `null` for each `fixture.json`; pins match the sketch; Build_File_Set present; "ATmega328P" in comments; no Banned_Words entry (Requirements 7.3, 7.4, 7.5, 7.7, 7.8)
    - `ext_interrupt` test of Requirement 8.2: write it only as the OI-1 decision recorded in `requirements.md` states. If 8.2 still expects COULDN'T TELL while EXINT is modelled, write no such test, keep the expected verdict unchanged, and STOP with the OI-1 evidence (Requirement 8.5)
    - _Requirements: 7.3, 7.4, 7.5, 7.7, 7.8, 8.1, 8.2, 8.3, 8.5, 8.6_

  - [ ] 4.16 Checkpoint: run the Part 1 checks and report
    - Run `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`
    - Every Baseline, Pinned_Literal, Example test and fixture test gives the same result as before Part 1; a change is a STOP (Requirements 8.4, 23.3)
    - `git status` shows no changed Committed_Test_File, Baseline or committed `fixtures/` or `examples/` file; no `scripts/tmp-*.ts`
    - Report changed files with line ranges, any STOP, and Choices I made; tests are evidence, not proof. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 8.4, 20.1, 20.2, 20.3, 20.5, 20.6, 21.2, 22.2, 22.3, 23.3, 23.13_

- [ ] 5. Part 2: failure story wording (BLOCKED: OI-2 STOP, waiting for the user's decision)
  - Do not start any sub-task until 5.1 passes. Apply the user's OI-2 option (a), (b) or (c) as recorded in `requirements.md`; where the decision changes a criterion below, the recorded criterion wins.

  - [ ] 5.1 Confirm the user's decision on OI-2 is recorded in requirements.md before starting
    - `requirements.md` must state the chosen option for OI-2, including NC-2 (the `refStory` "and held" case), and which lines of `src/engine/__tests__/reducer-arbitraries.ts` and `src/engine/__tests__/reducer-story.property.test.ts` may change, if any. If it does not, make no change and report that group 5 is still blocked.
    - Under option (b), make no wording change and report that Requirements 9 to 12 stay unmet
    - _Requirements: 15.3, 15.4, 23.9, 23.12_

  - [ ] 5.2 Change the violation and span sentences in `src/engine/reducer/story.ts`
    - Add `cycleText(n)`: `String(n)` with a U+002C comma before each group of 3 digits from the right, by string operations only, never `toLocaleString` or `Intl`
    - Violation sentence: `` `At ${msText(vcycle)} (cycle ${cycleText(vcycle)}), the program broke this rule: ${rule}` ``
    - Span sentence: `` `The violation lasted ${span.cut ? "at least " : ""}${msText(span.lengthCycles)}.` ``
    - Digit groups of the violation Cycle_Text count as allowed Story_Numbers
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 13.4_

  - [ ] 5.3 Add Story_Labels and Held_Press wording in `src/engine/reducer/story.ts`
    - `StoryLabel` type and optional `labels` on `StoryInput`
    - Labels check right after the `violationSpan` check, in its own `try`, as in design component C6 and Choices C9; every failure returns `invalid-input` naming the field `labels`, never a throw; entries copied into a `Map` keyed by own property names
    - Held_Press flags from the full Reduced_List: a later `"release"` on the same signal at a higher index, any `gremlinId`, equal cycle included
    - `eventPhrase` per the design phrase table; Summary_Form and analog wording unchanged; "and held" and label words count toward the 30-word limit
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.5, 13.6_

  - [ ] 5.4 Make the Pre_Approved_Edits in `src/engine/__tests__/reducer-story.test.ts`
    - Lines 37, 53, 60, 63, 70 and 78 only, as listed in design component C7; the part before "At 978.0 ms" stays unchanged
    - Build each new string by applying Requirements 9 to 12 to the old string and the test's inputs (violation cycle 15,648,000: Ms_Text `978.0 ms`, Cycle_Text `15,648,000`), not by copying `failureStory` output
    - Make no change to `src/engine/__tests__/reducer-examples.test.ts` (it holds no expected story string) and record that in the Report
    - Record each edit as file, line, old string, new string for the Report
    - _Requirements: 15.1, 15.2, 15.5, 15.6_

  - [ ] 5.5 Apply the OI-2 decision to the committed story property test
    - Option (a): change only the user-approved lines (`reducer-arbitraries.ts` lines 705-713 and 740-741, the allowed-number set at `reducer-story.property.test.ts` lines 69-80), keeping the check as strict as today
    - Option (c): retire Property 11 only as the user explicitly approved
    - Any other failure of a Committed_Test_File outside the Pre_Approved_Edits: STOP and report what the test expects, what `failureStory` returned and the evidence; leave the test unchanged
    - _Requirements: 15.1, 15.3, 15.4, 23.7, 23.9_

  - [ ] 5.6 Write story unit tests `src/engine/__tests__/honest-story.test.ts` (new file)
    - Violation cycle 15,647,543 gives "At 978.0 ms (cycle 15,647,543), the program broke this rule: "; cycle 0 gives "At 0.0 ms (cycle 0), ..."; cycle 16,000 gives "At 1.0 ms (cycle 16,000), ..."
    - Both span sentences; no span ends with the violation sentence; no "The rule stayed broken for"
    - Labelled press and release (BEAM_CLEAR "blocked the beam" and "cleared the beam"); Held_Press with and without labels; a press released by a `"rest"` event is not held
    - Each malformed `labels` case of Requirements 11.6, 11.7 and 11.10 returns `invalid-input` naming `labels`
    - No `labels` keeps "pressed", "released", "drove", "set"
    - _Requirements: 9.2, 9.4, 10.1, 10.2, 10.3, 10.4, 11.2, 11.3, 11.4, 11.6, 11.7, 11.10, 12.1, 12.2, 12.3, 12.4, 14.1, 14.2_

  - [ ]* 5.7 Write property test for Cycle_Text
    - **Property 6: Cycle_Text round trip**
    - New file `src/engine/__tests__/honest-story.property.test.ts`
    - **Validates: Requirements 9.1**

  - [ ]* 5.8 Write property test for the phrase table
    - **Property 7: The story matches the phrase table**
    - Write the generators and reference model in the new file `src/engine/__tests__/honest-story-arbitraries.ts`; add the test to the file of 5.7
    - **Validates: Requirements 9.1, 10.1, 10.2, 10.3, 11.2, 11.3, 11.4, 11.5, 11.8, 12.1, 12.2, 12.3, 12.4**

  - [ ]* 5.9 Write property test for the rules of form
    - **Property 8: The story keeps its rules of form**
    - Same file as 5.7
    - **Validates: Requirements 9.3, 9.5, 10.4, 11.9, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5**

  - [ ]* 5.10 Write property test for malformed labels
    - **Property 9: Malformed labels are rejected without throwing**
    - Same file as 5.7
    - **Validates: Requirements 11.6, 11.7, 11.10, 13.6**

  - [ ] 5.11 Checkpoint: run the Part 2 checks and report
    - Run `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`
    - Every Pinned_Literal (including `PINNED` in `reducer-examples.test.ts`) and Baseline gives the same result; a change is a STOP (Requirement 23.3)
    - `git diff` of Committed_Test_Files shows only the Pre_Approved_Edits and the lines the OI-2 decision approved; no `scripts/tmp-*.ts`
    - Report each Pre_Approved_Edit by file, line, old string and new string, any STOP, and Choices I made; tests are evidence, not proof. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 15.2, 15.5, 20.1, 20.2, 20.6, 21.2, 22.1, 22.2, 22.3, 23.3, 23.13_

## Notes

- Tasks marked with `*` are optional property tests and can be skipped for a faster run. Unit tests tied to acceptance values are not optional.
- Groups 1 to 3 run now. Groups 4 and 5 wait for the user's decisions on OI-1 and OI-2.
- Each task references requirement clauses for traceability. Property tests check the universal properties of the design; unit tests check specific examples and edge cases. Both are evidence, not proof.

## Task Dependency Graph

Waves 0 to 8 are the runnable work. Waves 9 to 17 are blocked until tasks 4.1 and 5.1 pass.

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.4"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.3", "2.5"] },
    { "id": 3, "tasks": ["1.4", "2.6"] },
    { "id": 4, "tasks": ["2.7", "2.8"] },
    { "id": 5, "tasks": ["2.9"] },
    { "id": 6, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 7, "tasks": ["3.5"] },
    { "id": 8, "tasks": ["3.6"] },
    { "id": 9, "tasks": ["4.1", "5.1"] },
    { "id": 10, "tasks": ["4.2", "4.13", "4.14", "5.2"] },
    { "id": 11, "tasks": ["4.3", "5.3"] },
    { "id": 12, "tasks": ["4.4", "4.5", "4.7", "5.4", "5.5", "5.6"] },
    { "id": 13, "tasks": ["4.6", "4.8", "4.9", "5.7"] },
    { "id": 14, "tasks": ["4.10", "5.8"] },
    { "id": 15, "tasks": ["4.11", "4.15", "5.9"] },
    { "id": 16, "tasks": ["4.12", "5.10"] },
    { "id": 17, "tasks": ["4.16", "5.11"] }
  ]
}
```
