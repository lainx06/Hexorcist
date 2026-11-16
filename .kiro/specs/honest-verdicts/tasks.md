# Implementation Plan: Honest Verdicts

## Overview

The work runs unattended, in this order:

1. Calibration (Requirement 2). Done: 72 cases with `src/` unchanged, no Use_Access, no "other" access, no mismatch (`report-notes.md`).
2. Part 3, the Evidence_Bench (Requirements 16 to 19). Done: `docs/evidence/EVIDENCE-NUMBERS.md` written, exit 0 (`report-notes.md`). The optional property tests 2.5 to 2.7 are not done.
3. Part 1, unmodelled peripheral detection (Requirements 3 to 8), with the round 2 decisions 1 and 2 recorded in `requirements.md`.
4. Part 2, failure story wording (Requirements 9 to 15), with the round 2 decisions 3 and 4 recorded in `requirements.md`.
5. Final checks and the final Report (Requirements 15.2, 20 to 24), last.

The OI-1 and OI-2 STOPs of round 1 are resolved (`requirements.md`, "Decisions recorded (round 2)"), so groups 3 and 4 are not blocked. Groups 3 and 4 are independent of each other. Group 5 runs after both.

Rules for every task:

- Kiro never commits.
- No Committed_Test_File, Baseline, committed file under `fixtures/` or `examples/`, or package entry changes, except the Pre_Approved_Edits of group 4 (Requirements 15.1, 15.3, 20.2, 20.3, 20.4). The three New_Fixture folders are new files, not changes to committed ones.
- Never change, weaken or delete an acceptance test to make it pass. If a test and the system disagree, STOP and report what the test expects, what happened and the evidence (Requirement 23.7).
- Temporary scripts are named `scripts/tmp-*.ts` and are deleted before a task is reported done (Requirement 21).
- Tests are evidence, not proof. Reports never describe passing tests otherwise (Requirement 20.6).
- Verdicts are written only with the Verdict_Strings: `BROKE`, `COULDN'T TELL`, and the exact HELD text with its real N.
- Findings that the final Report needs are written to `.kiro/specs/honest-verdicts/report-notes.md` as they happen, so that task 5.8 can quote them.

## Tasks

- [x] 1. Calibration on the committed programs, with `src/` unchanged
  - Done. Changed no file under `src/`. Results in `report-notes.md`, "Calibration inventory and results (task 1)".

  - [x] 1.1 Inventory the Fixtures and run lengths of the four fixture programs
    - For each of `fixtures/blink_button`, `fixtures/analog_read`, `fixtures/pwm_out` and `fixtures/floating_input`, search every Committed_Test_File (`src/engine/__tests__/`, `tests/`) and every committed `bench/` script for code that reads that program's HEX (for example `bench/campaign-bench.ts`, `bench/example-campaign-bench.ts`, `src/engine/__tests__/rules-arbitraries-campaign.ts` lines 14-30)
    - Record each distinct Fixture literal with its file and line, and the longest run length in cycles made with that HEX
    - Where a property test builds Fixtures from a generator, record the generator's base pin-map literal and say so (design NC-4)
    - Write the inventory into `.kiro/specs/honest-verdicts/report-notes.md` under "Calibration inventory"; task 1.2 hard-codes it as constants
    - _Requirements: 2.3_

  - [x] 1.2 Write the Calibration_Script `scripts/tmp-calibrate.ts`
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

  - [x] 1.3 Run the Calibration_Script and record the results
    - Before running, confirm `git status --porcelain src/` prints nothing (Requirement 2.1)
    - Run `npx tsx scripts/tmp-calibrate.ts`
    - Copy into `report-notes.md` under "Calibration results": per run the Fixture, its file and line, the event list (or its seed and Run_Index), the run length; per program every logged access with its classification
    - Exit 2: STOP (Requirement 2.5, 23.2). Exit 3: STOP (Requirement 2.6). Exit 1: STOP (Requirement 2.8). Exit 4: STOP (Requirement 2.7).
    - Result: exit 0; the only logged access was the Disable_Write `UCSR0B = 0x00` from the core start-up code
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 2.8, 22.1, 23.2_

  - [x] 1.4 Delete the Calibration_Script
    - Delete `scripts/tmp-calibrate.ts`, whatever the result of task 1.3
    - Confirm no `scripts/tmp-*.ts` file remains and `git status --porcelain src/` prints nothing
    - _Requirements: 2.8, 21.2_

- [x] 2. Part 3: the Evidence_Bench and the Evidence_Doc
  - Done, except the optional property tests 2.5 to 2.7. Uses only the existing Campaign and Run code through `tests/examples/examples-support.ts` (design D5). Changed no file under `src/`.

  - [x] 2.1 Write the pure helpers `bench/evidence-stats.ts`
    - Types `SeedSweepRow`, `PressSweepRow`, `EvidenceResults` as in the design's Part 3 data model
    - `sweepStarts(runCycles, holdCycles, step = 160_000)`: every `k * step` with `k >= 1` and `k * step + holdCycles < runCycles`, ascending (Requirement 18.2)
    - `medianText(values)`: "none" for an empty list; middle value for an odd count; mean of the two middle values for an even count, without a decimal point when it is an integer and with one decimal otherwise (Requirements 17.3, 17.4, 17.5)
    - `minMaxText(values)` (or equivalent): min and max, "none" for an empty list (Requirements 17.2, 17.5)
    - `renderEvidenceDoc(results)`: the layout in design component C8; names "ATmega328P"; says the numbers are evidence from emulated runs and not a proof; writes BROKE and COULDN'T TELL as Verdict_Strings and quotes each HELD text exactly as seen; machine block, seed ranges, date, wall-clock seconds per sweep and in total; column "Violating run number" (Requirements 19.1, 19.2, 19.3, 19.4)
    - `findForbiddenWords(text)`: whole-word, case-insensitive matches of `BANNED_WORDS` (imported from `src/engine/copy-rules.ts`, unchanged), "realtime", every `BOARD_BRAND_NAMES` entry from `tests/examples/examples-support.ts` (includes "Arduino"), plus any line holding `guard-allow` (Requirements 19.4, 19.6)
    - No wall-clock read, no `Math.random` in this file (Requirement 16.3)
    - _Requirements: 16.3, 17.2, 17.3, 17.4, 17.5, 18.2, 19.1, 19.2, 19.3, 19.4, 19.6_

  - [x] 2.2 Write small unit tests `tests/evidence/evidence-stats.test.ts` (new file)
    - `medianText`: `[]` gives "none"; `[3]` gives "3"; `[1, 2]` gives "1.5"; `[1, 3]` gives "2"; unsorted input is sorted first
    - `sweepStarts` counts with the Single_Input constants: crosswalk (16,000,000, 800,000) gives 94 starts, 160,000 to 15,040,000; garage (10,000,000, 32,000) gives 62, 160,000 to 9,920,000; heartbeat (16,000,000, 1,600,000) gives 89, 160,000 to 14,240,000
    - `renderEvidenceDoc` on a small hand-built `EvidenceResults` holds every count, the machine block, "ATmega328P", "not a proof", and gives an empty `findForbiddenWords` list
    - `findForbiddenWords` flags "Arduino", "realtime", "Shortest" and a `guard-allow` line
    - _Requirements: 17.3, 17.4, 17.5, 18.1, 18.2, 18.4, 19.1, 19.2, 19.4, 19.6_

  - [x] 2.3 Write the bench `bench/evidence.ts`
    - Imports `loadExample`, `readHex`, `runExampleCampaign`, `buildScriptedEvents`, `scriptedRun` from `tests/examples/examples-support.ts`; copies no engine logic (design D5, Requirement 16.2)
    - Seed_Sweep: Examples in the order `crosswalk`, `garage`, `heartbeat`; buggy build seeds 1 to 100, fixed build seeds 1 to 20; count BROKE, HELD and COULDN'T TELL; collect `violatingRunIndex + 1` for buggy BROKE Campaigns; collect the distinct HELD texts (Requirements 17.1, 17.2, 17.6)
    - Single_Press_Sweep: REQUEST 800,000, BEAM_CLEAR 32,000, PULSE 1,600,000 hold cycles; each build and each `sweepStarts` value through `buildScriptedEvents` and `scriptedRun(..., { untilEnd: true })` (Requirements 18.1 to 18.4, 18.6; design Choices C11)
    - Machine info, avr8js version, UTC date and wall-clock seconds, read only in this file (Requirements 16.3, 19.2; design Choices C14)
    - Exit codes 1, 3 and 4 as in design Choices C15; otherwise writes `docs/evidence/EVIDENCE-NUMBERS.md` (Requirements 16.4, 17.7, 17.8, 19.4)
    - _Requirements: 16.2, 16.3, 16.4, 17.1, 17.2, 17.6, 17.7, 17.8, 18.1, 18.2, 18.3, 18.4, 18.6, 19.1, 19.2, 19.7_

  - [x] 2.4 Add the `bench:evidence` script to `package.json`
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

  - [x] 2.8 Run the bench and record the findings
    - Ran `npm run bench:evidence` once: exit 0, no fixed-build BROKE, no Single_Press_Sweep Violation; counts copied into `report-notes.md` (Requirement 18.5)
    - Exit 3 would have been STOP 17.8, 23.4; exit 1 STOP 17.7; exit 4 a text fix or STOP 23.6. None fired.
    - _Requirements: 16.4, 17.7, 17.8, 18.5, 19.7, 22.1, 23.4_

  - [x] 2.9 Check the Evidence_Doc with the Guard
    - Run `npm run guard`. Any finding for `docs/evidence/EVIDENCE-NUMBERS.md` or any other file: STOP and report the Guard output (Requirements 19.5, 23.1)
    - Confirm the doc holds no `guard-allow` text and no board brand (Requirements 19.4, 19.6)
    - _Requirements: 19.4, 19.5, 19.6, 23.1_

- [ ] 3. Part 1: unmodelled peripheral detection
  - Follows round 2 decisions 1 and 2 (`requirements.md`) and design components C2 to C5. EXINT (EICRA, EIMSK, EIFR) and PCINT (PCICR, PCIFR, PCMSK0 to PCMSK2) are Modelled_Peripherals and are never detected (Requirement 1.7).
  - Where NC-1 (datasheet section numbers) is still open, follow the `iom328p.h` and avr8js line sources in the design.

  - [ ] 3.1 Add the Peripheral_Diagnostic type and the optional `peripheralUses` fields
    - In `src/engine/types.ts`: `PeripheralDiagnostic { peripheral, register, cycle, access }` with `access: "read" | "write"`, as in the design's Part 1 data model
    - Optional `peripheralUses?: PeripheralDiagnostic[]` on `AdvanceResult` and `RunResult`; in `src/engine/campaign.ts`, the same optional field on `RunPathResult` (type only, no logic yet)
    - The field is present only when non-empty, so every existing result and baseline comparison stays deep-equal (design D3, Choices C1)
    - _Requirements: 3.1, 3.4, 3.6, 8.4_

  - [ ] 3.2 Write the Peripheral_Table module `src/engine/peripherals.ts`
    - Frozen `UNMODELLED_PERIPHERALS`: rows U1 to U16 in table order with the round 2 ids USART0, SPI, TWI, EEPROM, WDT, AC, DIDR0, ASSR, GTCCR, PRR, SMCR, CLKPR, MCUCR, MCUSR, SPMCSR, OSCCAL and their Plain_Names ("serial port", "SPI bus", "two-wire bus", "data EEPROM", "watchdog timer", "analog comparator", then the register names in plain words for U7 to U16), register names, data-space addresses and Disable_Masks from the design tables; no EXINT or PCINT register
    - `isUseAccess(reg, access, value)` per rule D2: every read is a Use_Access; a write is a Use_Access unless the register has a Disable_Mask and `value & mask` is 0
    - `peripheralReason(row)` with the Requirement 5.3 template; USART0 gives the exact Requirement 5.2 text, EEPROM the design's "data EEPROM (EEPROM)" text
    - `PeripheralRecorder`: `access(addr, access, value, cycle)` keeps the earliest Use_Access per peripheral and ignores Disable_Writes and unknown addresses; `take()` returns the entries since the last take in ascending cycle
    - No avr8js import, no clock, no random source
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.10, 3.1, 3.2, 3.3, 3.4, 5.2, 5.3, 5.6, 5.8, 6.2_

  - [ ] 3.3 Write unit tests for the table and the recorder `src/engine/__tests__/honest-peripherals.test.ts` (new file)
    - Table ids are exactly the 16 round 2 ids in row order, with no EXINT or PCINT register address (0x69, 0x3D, 0x3C, 0x68, 0x3B, 0x6B to 0x6D); ids and addresses distinct
    - A write of 0 to UCSR0B is a Disable_Write; a write with TXEN0 set is a Use_Access; every read is a Use_Access
    - USART0 reason is exactly "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked."; EEPROM reason is exactly "The program uses the data EEPROM (EEPROM), which this emulator setup does not model, so the rule cannot be checked."; SMCR reason names the register (design Unmodelled_Peripheral rows)
    - Every row's reason follows the template, is at most 200 UTF-16 units and holds no Banned_Words entry as a whole word
    - Recorder: earliest Use_Access per peripheral kept, later ones dropped; Disable_Writes and an EICRA write add nothing; `take()` twice gives the entries once, in ascending cycle
    - _Requirements: 1.3, 1.4, 1.6, 1.7, 1.10, 3.1, 3.2, 3.3, 3.4, 5.2, 5.3, 5.6, 5.8_

  - [ ]* 3.4 Write property test for the access classification
    - **Property 1: Every unmodelled access is exactly one of Use_Access and Disable_Write**
    - New file `src/engine/__tests__/honest-peripherals.property.test.ts`, tag comment, fixed `seed`, `numRuns` at least 100
    - **Validates: Requirements 1.5, 1.6**

  - [ ]* 3.5 Write property test for the recorder
    - **Property 2: The recorder keeps the earliest Use_Access per peripheral**
    - Same file as 3.4; the generated addresses include the EXINT and PCINT registers
    - **Validates: Requirements 1.7, 3.1, 3.2, 3.3, 3.4, 3.6**

  - [ ] 3.6 Add the detection hooks to `src/engine/emulator-bridge.ts`
    - New step 11d after step 11c and before step 12, as in design component C2: wrap the read and write hooks of every table register; each wrapper returns what the previous hook or `cpu.data` returns and calls the recorder with `cpu.cycles`
    - `advance()` returns `peripheralUses` only when `take()` is non-empty
    - Test seam `createWithTestHooks(..., { peripheralDetection: false })` that skips step 11d
    - All avr8js use stays in this file, behind `EmulatorBridgeInterface`; detection sees only the cycles the Run executes
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 6.2_

  - [ ]* 3.7 Write property test for detection transparency
    - **Property 3: Detection is transparent and replays deep-equal**
    - New file `src/engine/__tests__/honest-bridge.property.test.ts`, 120,000 ms timeout, runs at most 400,000 cycles; corpus includes the three New_Fixtures
    - **Validates: Requirements 3.5, 3.7, 3.9**

  - [ ] 3.8 Carry Peripheral_Diagnostics through `src/engine/campaign.ts`
    - `runEventList` appends `r.peripheralUses ?? []` after each `advance()` and returns `peripheralUses` on `RunPathResult` only when non-empty; `runOne` copies it into the RunResult the same way
    - Checkers do not receive it; the reducer's Run_Path ignores it; no Run is extended past today's stop point
    - _Requirements: 3.6, 3.9, 8.4_

  - [ ] 3.9 Add the round 2 verdict step to `computeVerdict` in `src/engine/verdict.ts`
    - First split today's code into helpers with unchanged behaviour: `collectUnchecked(runs)` (the CannotCheck half of the loop at lines 61-71) and `couldntTellParts(input, unchecked)` (today's branch 2 part list, lines 92-114); today's branch 2 calls `couldntTellParts`, so its output does not change
    - Step 0 right after the `finished` check, as in design component C4: find the Violating_Run (lowest Run_Index with a Violation); when it exists, `blocking` is its own uses with `cycle <= violation.cycle`, whatever other Runs used; when no Run has a Violation, `blocking` is every use of every Run
    - With `blocking` non-empty: COULDN'T TELL with `buildReason([...peripheralReasons(blocking), ...couldntTellParts(input, collectUnchecked(runs))])`; `buildReason` and `truncateReason` unchanged
    - `peripheralReasons`: one Peripheral_Reason per distinct peripheral, ordered by lowest blocking cycle, ties by table row order U1 to U16; an unknown id uses its id as Plain_Name and sorts last, ties by id (design Choices C7, C12)
    - With `blocking` empty, steps 1 to 3 run unchanged and never read `peripheralUses`; an unfinished Campaign still returns `null`; floating-input handling unchanged; the function stays pure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.4, 5.5, 5.7, 6.1, 6.2, 6.3_

  - [ ] 3.10 Write the verdict precedence tests `src/engine/__tests__/honest-verdict.test.ts` (new file)
    - (a) The Violating_Run's only Peripheral_Diagnostic at Violation_Cycle + 1 keeps BROKE with that Run's trace, deep-equal to today's verdict without the diagnostic
    - (b) A Peripheral_Diagnostic in a completed Run other than the Violating_Run, none in the Violating_Run, keeps BROKE
    - (c) The Violating_Run's only Peripheral_Diagnostic at the Violation_Cycle gives COULDN'T TELL (also Requirement 8.5)
    - (d) No Violation in any completed Run and a Peripheral_Diagnostic in any completed Run gives COULDN'T TELL, never HELD
    - A floating-input CannotCheck with a blocking use gives the Peripheral_Reason first, then the CannotCheck part in today's words; an unfinished Campaign with uses gives `null`
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 5.1, 5.4, 8.3, 8.5_

  - [ ]* 3.11 Write property test for the round 2 precedence
    - **Property 4: The round 2 precedence**
    - New files `src/engine/__tests__/honest-verdict.property.test.ts` and `src/engine/__tests__/honest-verdict-arbitraries.ts` (generators, reference `blocking` model, frozen copy of today's `computeVerdict` from verdict.ts lines 52-121; design Choices C19)
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.7, 6.1, 8.3, 8.5**

  - [ ]* 3.12 Write property test for the Reason order
    - **Property 5: The Reason leads with the Peripheral_Reasons in order**
    - Same file as 3.11
    - **Validates: Requirements 4.5, 5.1, 5.4, 5.5**

  - [ ] 3.13 Write and compile the New_Fixture `fixtures/serial_hello`
    - `fixtures/serial_hello/serial_hello.ino`: `pinMode(13, OUTPUT)` and `Serial.begin(9600)` in `setup()`; `loop()` calls `Serial.print("hello ")`, toggles the LED on PB5 (pin 13), `delay(100)`; original code; comment names the chip "ATmega328P"; no Banned_Words entry (design C5, Choices C8)
    - `fixtures/serial_hello/fixture.json`: `{ "pins": [ { "signal": "LED", "port": "B", "bit": 5, "direction": "output" } ] }`
    - Compile with exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/serial_hello/build fixtures/serial_hello`
    - Confirm `fixtures/serial_hello/build` holds exactly the 5-file Build_File_Set: `serial_hello.ino.eep`, `.ino.elf`, `.ino.hex`, `.ino.with_bootloader.bin`, `.ino.with_bootloader.hex`
    - Compile failure: STOP 23.5 and report the compiler output; write no build file by other means
    - _Requirements: 7.1, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 23.5_

  - [ ] 3.14 Write and compile the New_Fixture `fixtures/ext_interrupt`
    - `fixtures/ext_interrupt/ext_interrupt.ino`: `pinMode(2, INPUT_PULLUP)`, `pinMode(13, OUTPUT)`, `attachInterrupt(digitalPinToInterrupt(2), onEdge, CHANGE)`; `onEdge` toggles the LED on PB5; original code; comment names the chip "ATmega328P"; no Banned_Words entry (design C5, Choices C8)
    - `fixtures/ext_interrupt/fixture.json`: `{ "pins": [ { "signal": "TRIGGER", "port": "D", "bit": 2, "direction": "input", "activeLevel": "low" }, { "signal": "LED", "port": "B", "bit": 5, "direction": "output" } ] }`
    - Compile with exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/ext_interrupt/build fixtures/ext_interrupt`
    - Confirm `fixtures/ext_interrupt/build` holds exactly the 5-file Build_File_Set for `ext_interrupt`
    - Compile failure: STOP 23.5 and report the compiler output; write no build file by other means
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 7.12, 23.5_

  - [ ] 3.15 Write and compile the New_Fixture `fixtures/eeprom_boot`
    - `fixtures/eeprom_boot/eeprom_boot.ino`: `#include <EEPROM.h>`; in `setup()`: `pinMode(13, OUTPUT)`, `byte b = EEPROM.read(0);`, half-period 100 ms when `b == 0xFF` and 250 ms otherwise; `loop()` toggles the LED on PB5, then `delay(halfPeriod)`; original code; comment names the chip "ATmega328P"; no Banned_Words entry (design C5, Choices C8)
    - `fixtures/eeprom_boot/fixture.json`: `{ "pins": [ { "signal": "LED", "port": "B", "bit": 5, "direction": "output" } ] }`
    - Compile with exactly `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/eeprom_boot/build fixtures/eeprom_boot`
    - Confirm `fixtures/eeprom_boot/build` holds exactly the 5-file Build_File_Set for `eeprom_boot`
    - Compile failure: STOP 23.5 and report the compiler output; write no build file by other means
    - _Requirements: 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 23.5_

  - [ ] 3.16 Write the New_Fixture tests `src/engine/__tests__/honest-fixtures.test.ts` (new file)
    - `serial_hello` Campaign with the design Choices C8 settings (rule `LED is 1 must never last 2000 ms or longer.`, `gremlinSet` `[]` or the smallest set the config builder accepts, `runs` 2, `runCycles` 8,000,000, `campaignSeed` 1): verdict COULDN'T TELL and the Reason starts with the exact USART0 Peripheral_Reason (Requirement 8.1)
    - `eeprom_boot` Campaign with the same settings: verdict COULDN'T TELL and the Reason starts with the exact EEPROM Peripheral_Reason "The program uses the data EEPROM (EEPROM), which this emulator setup does not model, so the rule cannot be checked." (Requirements 5.8, 8.6)
    - `ext_interrupt` Scripted_Run with scripted PD2 (TRIGGER) edges at chosen cycles: the LED toggles exactly once per edge within 2,000 cycles of the edge, and no step returns `peripheralUses` (Requirement 8.2)
    - File checks for each New_Fixture: `validateFixture` returns `null`; pins match the sketch; the build folder holds exactly the Build_File_Set; "ATmega328P" in a sketch comment; no Banned_Words entry (Requirements 7.3, 7.4, 7.5, 7.7, 7.8, 7.11)
    - If a test disagrees with the system: STOP 23.7, report what the test expects, what happened and the evidence; leave the test unchanged
    - _Requirements: 5.8, 7.3, 7.4, 7.5, 7.7, 7.8, 7.11, 8.1, 8.2, 8.6, 23.7_

  - [ ] 3.17 Checkpoint: run the full suite after Part 1
    - Run `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`
    - Every committed test, Baseline, Pinned_Literal, Example test and fixture test gives the same result as before Part 1; a change is STOP 23.3
    - `git status` shows no changed Committed_Test_File, Baseline or committed `fixtures/` or `examples/` file; no `scripts/tmp-*.ts`
    - Record in `report-notes.md` the changed files with line ranges, any STOP and the Choices I made; tests are evidence, not proof. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 8.4, 20.1, 20.2, 20.3, 20.5, 20.6, 21.2, 22.2, 22.3, 23.3_

- [ ] 4. Part 2: failure story wording
  - Follows round 2 decisions 3 and 4 (`requirements.md`) and design components C6 and C7. The only Committed_Test_File edits are the Pre_Approved_Edits of tasks 4.2 to 4.4.
  - Any Committed_Test_File failure outside the Pre_Approved_Edits: STOP 15.4 and 23.9, report what the test expects, what `failureStory` returned and the evidence; leave the test unchanged.

  - [ ] 4.1 Change the story wording in `src/engine/reducer/story.ts`
    - `cycleText(n)`: `String(n)` with a U+002C comma before each group of 3 digits from the right, by string operations only, never `toLocaleString` or `Intl`
    - Violation sentence: `` `At ${msText(vcycle)} (cycle ${cycleText(vcycle)}), the program broke this rule: ${rule}` ``, from the Violation the story is given (the Reduced_Replay's own cycle in `reducer-examples.test.ts`)
    - Span sentence: `` `The violation lasted ${span.cut ? "at least " : ""}${msText(span.lengthCycles)}.` ``
    - Digit groups of the violation Cycle_Text count as allowed Story_Numbers
    - `StoryLabel` type and optional `labels` on `StoryInput`; labels check right after the `violationSpan` check, in its own `try` (design C6, Choices C9): non-null non-array object; every own entry an object with non-empty, one-line `active` and `inactive` strings with no leading or trailing space, holding no Banned_Words entry or "smallest"; every failure returns `invalid-input` naming `labels`, never a throw; entries copied into a `Map` keyed by own property names
    - Held_Press flags from the full Reduced_List: a press is held when no later index on the same signal has `value === "release"`, any `gremlinId`, equal cycle included; `eventPhrase` per the design phrase table, including "pressed and held" and "<active> and held"
    - Summary_Form and analog wording unchanged; "and held" and label words count toward the 30-word limit
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ] 4.2 Make the approved edits to the six story strings in `src/engine/__tests__/reducer-story.test.ts`
    - Lines 37, 53, 60, 63, 70 and 78 only, as listed in design component C7, edit kind (a); the part before "At 978.0 ms" stays unchanged
    - Build each new string by applying Requirements 9 to 12 to the old string and the test's inputs (violation cycle 15,648,000: Ms_Text `978.0 ms`, Cycle_Text `15,648,000`), not by copying `failureStory` output
    - Make no change to `src/engine/__tests__/reducer-examples.test.ts` (it holds no expected story string) and record that for the Report
    - Record each edit as file, line, old string, new string in `report-notes.md`
    - _Requirements: 15.1, 15.2, 15.5, 15.6_

  - [ ] 4.3 Make the approved edits to `refStory` in `src/engine/__tests__/reducer-arbitraries.ts`
    - Design component C7, edit kind (b), about lines 700-742: add `refCycleText(n)` next to `refStory`, written independently of `cycleText` (Choices C16); Held_Press case in the Detailed_Form phrase builder (today lines 705-713); optional `labels` on the widened parameter type, `StoryCase` unchanged; line 740 becomes the new violation sentence with Cycle_Text; line 741 becomes "The violation lasted [at least ]X."
    - Written from Requirements 9 to 12, importing nothing new from `story.ts`; `arbStoryCase` unchanged; every other line of the file unchanged
    - Record every edited line number with old and new text in `report-notes.md`
    - _Requirements: 15.1, 15.2, 15.3, 15.6_

  - [ ] 4.4 Make the approved edit to the Property 11 number check in `src/engine/__tests__/reducer-story.property.test.ts`
    - Design component C7, edit kind (c): one line added after line 73 that adds the comma groups of the violation Cycle_Text to the allowed set, built inline so the import on line 7 does not change
    - Property 11 keeps `seed: 20261211`, `numRuns: 300`, the counters `detailedForm`, `summaryForm`, `zeroEvents`, `withSpan`, `cutSpan` and every other assertion
    - Record the added line number and text in `report-notes.md`
    - _Requirements: 15.1, 15.2, 15.3, 15.7_

  - [ ] 4.5 Write story unit tests `src/engine/__tests__/honest-story.test.ts` (new file)
    - Violation cycle 15,647,543 gives "At 978.0 ms (cycle 15,647,543), the program broke this rule: "; cycle 0 gives "At 0.0 ms (cycle 0), the program broke this rule: "; cycle 16,000 gives "At 1.0 ms (cycle 16,000), the program broke this rule: "
    - Both span sentences; no span ends with the violation sentence; no "The rule stayed broken for"
    - Labelled press and release (BEAM_CLEAR "blocked the beam" and "cleared the beam"); Held_Press with and without labels; a press released by a `"rest"` event is not held
    - Each malformed `labels` case of Requirements 11.6, 11.7 and 11.10 returns `invalid-input` naming `labels`
    - No `labels` keeps "pressed", "released", "drove", "set"
    - _Requirements: 9.2, 9.4, 10.1, 10.2, 10.3, 10.4, 11.2, 11.3, 11.4, 11.6, 11.7, 11.10, 12.1, 12.2, 12.3, 12.4, 14.1, 14.2_

  - [ ]* 4.6 Write property test for Cycle_Text
    - **Property 6: Cycle_Text round trip**
    - New file `src/engine/__tests__/honest-story.property.test.ts`
    - **Validates: Requirements 9.1**

  - [ ]* 4.7 Write property test for the phrase table
    - **Property 7: The story matches the phrase table**
    - Generators that add valid labels to `arbStoryCase` cases in the new file `src/engine/__tests__/honest-story-arbitraries.ts`; compares `failureStory` with the updated `refStory`; test added to the file of 4.6
    - **Validates: Requirements 9.1, 9.6, 10.1, 10.2, 10.3, 11.2, 11.3, 11.4, 11.5, 11.8, 12.1, 12.2, 12.3, 12.4**

  - [ ]* 4.8 Write property test for the rules of form
    - **Property 8: The story keeps its rules of form**
    - Same file as 4.6
    - **Validates: Requirements 9.3, 9.5, 10.4, 11.9, 12.5, 13.1, 13.2, 13.3, 13.4, 13.5**

  - [ ]* 4.9 Write property test for malformed labels
    - **Property 9: Malformed labels are rejected without throwing**
    - Same file as 4.6
    - **Validates: Requirements 11.6, 11.7, 11.10, 13.6**

  - [ ] 4.10 Checkpoint: run the full suite after Part 2
    - Run `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`
    - Every Pinned_Literal (including `PINNED` in `reducer-examples.test.ts`) and Baseline gives the same result; a change is STOP 23.3
    - `git diff` of Committed_Test_Files shows only the Pre_Approved_Edits of tasks 4.2 to 4.4; no `scripts/tmp-*.ts`
    - Record in `report-notes.md` any STOP and the Choices I made; tests are evidence, not proof. Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 15.1, 15.3, 20.1, 20.2, 20.6, 21.2, 22.2, 23.3_

- [ ] 5. Final checks and the final Report
  - Runs after groups 3 and 4. Covers all the work of this spec.

  - [ ] 5.1 Record the Violation_Cycles per Example
    - Write `scripts/tmp-cycles.ts` that follows the steps of `src/engine/__tests__/reducer-examples.test.ts` for each Example and prints the original Campaign Violation_Cycle (`trace.violation.cycle`) and the Reduced_Replay's Violation_Cycle (`res.violation.cycle`) as Cycle_Text
    - Run it with `npx tsx scripts/tmp-cycles.ts`, write the side-by-side table into `report-notes.md`, then delete the script
    - The user gave `crosswalk` 15,647,543 vs 15,647,515; a different value is recorded as a finding, and no test changes
    - _Requirements: 9.6, 21.1, 21.2, 24.1_

  - [ ] 5.2 Re-run the Evidence_Bench and compare the Evidence_Doc
    - Before the re-run, confirm `git diff --quiet docs/evidence/EVIDENCE-NUMBERS.md` (the working copy is the committed one); otherwise keep a copy of the working copy as the "before" doc
    - Run `npm run bench:evidence` once, with a timeout of 30 minutes
    - Diff the new `docs/evidence/EVIDENCE-NUMBERS.md` against the previous one (`git diff docs/evidence/EVIDENCE-NUMBERS.md`), ignoring the date row and the wall-clock times only (design Choices C18); every other difference, including the machine block, goes into `report-notes.md`
    - Any count difference is a finding (Requirement 24.3); the user expects none
    - Exit 3: STOP 17.8, 23.4 with Example, seed and trace. Exit 1: STOP 17.7. Exit 4: STOP 23.6 with the word and line. Change no example, rule, fixture or test.
    - _Requirements: 16.4, 17.7, 17.8, 19.7, 23.4, 24.2, 24.3_

  - [ ] 5.3 Run `npx vitest --run`
    - Report pass and fail counts as evidence, not proof (Requirement 20.6)
    - A failing committed test: STOP and report the test, what it expects, what happened and the evidence (Requirements 23.3, 23.7)
    - _Requirements: 20.1, 20.6, 23.3, 23.7_

  - [ ] 5.4 Run `npm run typecheck`
    - _Requirements: 20.1_

  - [ ] 5.5 Run `npm run guard`
    - A finding: STOP and report the Guard output
    - _Requirements: 19.5, 20.1, 20.5, 23.1_

  - [ ] 5.6 Run `npm run build`
    - _Requirements: 20.1_

  - [ ] 5.7 Check the working tree
    - `git status` and `git diff --stat` list only: `src/engine/types.ts`, `src/engine/peripherals.ts` (new), `src/engine/emulator-bridge.ts`, `src/engine/campaign.ts`, `src/engine/verdict.ts`, `src/engine/reducer/story.ts`, the new `src/engine/__tests__/honest-*` files, the three Pre_Approved_Edit files, the new `fixtures/serial_hello`, `fixtures/ext_interrupt` and `fixtures/eeprom_boot` folders, `docs/evidence/EVIDENCE-NUMBERS.md` (re-run), any uncommitted Part 3 files, and files under `.kiro/specs/honest-verdicts/`
    - No other Committed_Test_File, no Baseline, no committed `fixtures/` or `examples/` file changed; `package-lock.json`, `dependencies` and `devDependencies` unchanged
    - Engine code under `src/engine/` holds no wall-clock read, timer callback, `Math.random` or network call
    - No `scripts/tmp-*.ts` file exists
    - _Requirements: 15.3, 20.2, 20.3, 20.4, 20.5, 21.2_

  - [ ] 5.8 Write the final Report
    - Every STOP that fired, with criterion number, evidence and blocked requirements; OI-1 and OI-2 are listed as resolved in round 2 (Requirement 23.13)
    - Calibration results and the Seed_Sweep and Single_Press_Sweep findings from `report-notes.md` (Requirements 2.3, 2.4, 18.5, 22.1)
    - Per Example, the original Campaign Violation_Cycle and the Reduced_Replay's Violation_Cycle side by side (Requirement 24.1)
    - Every difference between the re-run Evidence_Doc and the previous one, apart from the date and wall-clock times, and any count difference as a finding (Requirements 24.2, 24.3)
    - Every Pre_Approved_Edit by file, line, old string and new string, and every edited line of every Committed_Test_File (`reducer-story.test.ts`, `reducer-arbitraries.ts`, `reducer-story.property.test.ts`); no edit to `reducer-examples.test.ts` (Requirements 15.2, 15.5)
    - "Choices I made": design Choices C1 to C19 that applied, plus the choices made in this plan (Requirement 22.2)
    - Every changed file with paths and line ranges (Requirement 22.3)
    - Open conflicts NC-1 to NC-7 from the design
    - Tests described as evidence, not proof (Requirement 20.6)
    - _Requirements: 15.2, 15.5, 20.6, 22.1, 22.2, 22.3, 23.13, 24.1, 24.2, 24.3_

## Notes

- Tasks marked with `*` are optional property tests and can be skipped for a faster run. Unit tests tied to acceptance values are not optional.
- Groups 1 and 2 are done; their optional property tests 2.5 to 2.7 are not.
- Each task references requirement clauses for traceability. Property tests check the universal properties of the design; unit tests check specific examples and edge cases. Both are evidence, not proof.

## Task Dependency Graph

Completed tasks are not listed. Tasks that write the same file, or `report-notes.md`, sit in different waves. The three `arduino-cli` compiles sit in different waves so that they do not share the build cache at the same time.

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.5", "3.1", "3.13", "4.1"] },
    { "id": 1, "tasks": ["2.6", "3.2", "3.14", "4.2"] },
    { "id": 2, "tasks": ["2.7", "3.3", "3.4", "3.6", "3.9", "3.15", "4.3", "4.5", "4.6"] },
    { "id": 3, "tasks": ["3.5", "3.8", "3.10", "3.11", "4.4", "4.7"] },
    { "id": 4, "tasks": ["3.7", "3.12", "3.16", "4.8"] },
    { "id": 5, "tasks": ["4.9"] },
    { "id": 6, "tasks": ["3.17"] },
    { "id": 7, "tasks": ["4.10"] },
    { "id": 8, "tasks": ["5.1"] },
    { "id": 9, "tasks": ["5.2"] },
    { "id": 10, "tasks": ["5.3", "5.4", "5.5", "5.6"] },
    { "id": 11, "tasks": ["5.7"] },
    { "id": 12, "tasks": ["5.8"] }
  ]
}
```
