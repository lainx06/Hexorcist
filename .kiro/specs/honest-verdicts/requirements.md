# Requirements Document

## Introduction

Honest Verdicts closes three gaps in what Hexorcist reports about an ATmega328P program.

- Part 1 (unmodelled peripheral detection). Today a program that uses a peripheral the Emulator_Bridge does not model, such as the serial port, can still get HELD. That HELD is not backed by the run. This part lists the modelled and unmodelled peripherals in `design.md`, calibrates the detection on the committed programs before any code changes, records a Peripheral_Diagnostic when a program uses an Unmodelled_Peripheral, and turns the campaign verdict into COULDN'T TELL when that use could matter. Three new fixtures exercise the path: `fixtures/serial_hello` and `fixtures/eeprom_boot` must give COULDN'T TELL, and `fixtures/ext_interrupt` is a positive test of the modelled external interrupts (round 2 decisions).
- Part 2 (failure story wording). The Failure_Story in `src/engine/reducer/story.ts` gets plainer wording: "the program broke this rule", the violation cycle with thousands separators, "The violation lasted X ms.", optional signal labels, and "pressed and held" for a press that is never released.
- Part 3 (evidence bench). A new bench, `bench/evidence.ts`, run with `npm run bench:evidence`, sweeps seeds and single presses over the committed examples and writes the numbers to `docs/evidence/EVIDENCE-NUMBERS.md`.

The work runs unattended. The STOP conditions in Requirement 23 end the work and produce a Report instead of a change.

### Open issues found while writing these requirements

These were found by reading the code before any design work. Each one ties to a STOP condition and needs a user decision.

- **OI-1 (resolved in round 2). avr8js 0.21.1 already models INT0, INT1 and the pin-change interrupts through the GPIO ports the bridge builds.** `node_modules/avr8js/dist/esm/peripherals/gpio.js` defines `INT0` and `INT1` (lines 3-18, EICRA 0x69, EIMSK 0x3D, EIFR 0x3C) and `PCINT0` to `PCINT2` (lines 19-45, PCICR 0x68, PCIFR 0x3B, PCMSK0-2 0x6B-0x6D). `portBConfig`, `portCConfig` and `portDConfig` (lines 52-75) attach them, with `externalInterrupts: [null, null, INT0, INT1]` on port D. The `AVRIOPort` constructor installs write hooks for these registers (lines 180-227), and `updatePinRegister` calls `toggleInterrupt` on every PIN bit change (lines 300-363), which raises the interrupt. `src/engine/emulator-bridge.ts` builds `AVRIOPort` for ports B, C and D (step 5). So the user's request lists INT0/INT1 and pin-change interrupts as unmodelled, and asks that `fixtures/ext_interrupt` give COULDN'T TELL, but the source shows they are modelled. Requirement 1, criterion 7 and Requirement 23, criterion 8 make the Agent stop and report this before implementing Part 1 behaviour.
- **OI-2 (resolved in round 2). The new story wording disagrees with a committed property test that is outside the pre-approved edits.** `src/engine/__tests__/reducer-story.property.test.ts` (Property 11) compares the story with `refStory` in `src/engine/__tests__/reducer-arbitraries.ts`, whose lines 740-741 build "the chip broke this rule" and "The rule stayed broken for". Its number check (about lines 69-84) allows only Ms_Text numbers, analog values, 0, 1 and counts, so the digit runs of "15,647,543" fail it. Neither file holds an expected story string literal, so the pre-approval does not cover them. Requirement 15, criterion 4 and Requirement 23, criterion 9 make the Agent stop and report.
- **OI-3 (resolved in round 2). Mixed campaigns.** The request says use "anywhere in a run without a violation" gives COULDN'T TELL. Read literally, a campaign whose violating Run used a peripheral only after its Violation, but whose earlier non-violating Run used it, gives COULDN'T TELL. The first version of Requirement 4 followed the literal reading. The user replaced that sentence in round 2; Requirement 4 now follows the round 2 precedence.
- **OI-4. `src/engine/__tests__/reducer-examples.test.ts` holds no expected story string.** It prints the story (line 82 and the `story` log line) and pins counts and fingerprints only. The pre-approved edit there is empty unless the user adds a string.
- **OI-5. Peripheral_Reason length.** One Peripheral_Reason is about 116 UTF-16 units, so with REASON_MAX_LENGTH of 200 a second Peripheral_Reason is cut. Requirement 5 keeps the limit and keeps only the leading Peripheral_Reason whole.
- **OI-6. Accesses classed as other.** Requirement 2, criterion 6 stops calibration on an access that is neither a Use_Access nor a Disable_Write. For an uploaded HEX at run time the spec does not say whether such an access records a Peripheral_Diagnostic. The design treats it as a Use_Access, the conservative reading, which can only turn HELD into COULDN'T TELL.

### Decisions recorded (round 2)

The user's decisions, verbatim:

```text
1. Interrupts: my error. INT0/INT1 and pin-change interrupts are modelled, so do not flag them. Use options (a) + (c):
 - Keep fixtures/ext_interrupt as a positive test. attachInterrupt on PD2 toggles an output. With scripted PD2 edges, the output must toggle on each edge, and the run must have no unmodelled-peripheral diagnostic.
 - Add fixtures/eeprom_boot. It reads a byte with EEPROM.read(0) in setup and uses it to pick a blink rate. It must give COULDN'T TELL naming the EEPROM.
 - Keep fixtures/serial_hello as planned. It hangs; COULDN'T TELL still holds. Test the reason text.
 - The detection list stays as in design.md (conservative), minus the interrupts. CLKPR, SMCR, MCUCR, PRR, GTCCR, DIDR0/1, OSCCAL, ASSR, MCUSR and SPMCSR count as use under your rules. The reason names the register when there is no plainer name.
 Compile each new fixture with arduino-cli exactly as before.
2. Verdict precedence (this replaces my earlier sentence):
 - BROKE stands when the violating run has no unmodelled-peripheral use at or before its violation cycle, whatever the other runs did.
 - If the violating run had such a use at or before its violation, the verdict is COULDN'T TELL.
 - With no violation in any run, any use in any run gives COULDN'T TELL. It can never be HELD.
 - Everything else follows the existing computeVerdict precedence. Quote it in design.md, and do not change the floating-input behaviour.
3. Story: approved committed-test edits, in addition to the six story strings in reducer-story.test.ts:
 - refStory in src/engine/__tests__/reducer-arbitraries.ts: wording, "and held", labels, the span sentence, and the cycle with thousands separators;
 - its number check, so it accepts comma-grouped cycles.
 Same seeds, numRuns and counters; nothing else in Property 11 changes. Name every edited line in the report.
4. For each example, report the original campaign violation cycle and the reduced replay's violation cycle side by side (crosswalk: 15,647,543 vs 15,647,515). The story uses the reduced replay's own cycle.
Then finish Parts 1 and 2. At the end, re-run npm run bench:evidence and report any difference from the committed docs/evidence/EVIDENCE-NUMBERS.md. There should be none.
```

Status of the open issues after these decisions:

- **OI-1: resolved.** INT0/INT1 (EXINT) and PCINT0 to PCINT2 are Modelled_Peripherals and are not detected (Requirement 1, criterion 7). `fixtures/ext_interrupt` becomes a positive test (Requirement 8, criterion 2), and `fixtures/eeprom_boot` is added (Requirements 7 and 8). The STOPs of Requirement 1, criterion 7, Requirement 8, criterion 5 (removed) and Requirement 23, criterion 8 no longer block work.
- **OI-2: resolved.** The Pre_Approved_Edits now cover `refStory` and the number check of Property 11 (Requirement 15). The STOP of Requirement 23, criterion 9 no longer blocks work.
- **OI-3: resolved.** Requirement 4 follows decision 2: only the Violating_Run's use at or before its Violation_Cycle overrides BROKE.
- OI-4, OI-5 and OI-6 are unchanged.

## Glossary

- **Agent**: The coding agent that writes the design, tasks and code for this spec.
- **Report**: The Agent's final message for a task or a STOP. It names what was done, what was found, and the evidence.
- **STOP**: The Agent ends the work that the STOP blocks (Requirement 23), changes nothing more for that work, records the STOP condition and its evidence for the Report, and waits for the user's decision on that work. Work that the STOP does not block continues.
- **Emulator_Bridge**: The class `EmulatorBridge` in `src/engine/emulator-bridge.ts`, the only file in `src/` that imports avr8js, behind `EmulatorBridgeInterface`.
- **Campaign**: A set of Runs made by `createCampaign`, `resumeCampaign` or `runCampaign` in `src/engine/campaign.ts`.
- **Run**: One emulated execution of a HEX with a Fixture and one ordered event list on a fresh Emulator_Bridge, as made by `runOne` or `runEventList` in `src/engine/campaign.ts`.
- **Run_Index**: The 0-based index of a Run in its Campaign.
- **Violation**: The `{ rule, cycle }` value a Run reports when the Checker observes a broken Rule. Its `cycle` is the Violation_Cycle.
- **Violating_Run**: In a finished Campaign, the completed Run with the lowest Run_Index that has a Violation: the Run whose trace a BROKE verdict shows.
- **Reduced_Replay**: The replay of the Reduced_List that `src/engine/__tests__/reducer-examples.test.ts` makes for an Example (`replayEventList` with `res.reducedList`, about line 58). The reducer result's `violation` (`res.violation`) holds the Reduced_Replay's own Violation_Cycle, which can differ from the Violation_Cycle of the original Campaign trace (`trace.violation`).
- **Floating_Diagnostic**: A `FloatingInputDiagnostic` (kind `"floating-input"`) in `src/engine/types.ts`, reported by the Emulator_Bridge and collected per Run by `runEventList`.
- **Verdict_Function**: `computeVerdict` in `src/engine/verdict.ts`.
- **Verdict_Strings**: The exact verdict texts of the workspace verdict rule: `BROKE`; `COULDN'T TELL`; and the HELD text "No violation found in N emulated runs of this gremlin set. Not a proof." with "1 emulated run" when N is 1, where N is the real count of completed Runs.
- **CannotCheck_Path**: The existing way a rule is reported as not checkable: the `CannotCheck` type `{ rule, reason }` in `src/engine/checker.ts`, collected per Run by `runEventList`, and turned into COULDN'T TELL reason parts by the Verdict_Function.
- **Reason**: The `reason` text of a COULDN'T TELL verdict, built by `buildReason` in `src/engine/verdict.ts` and cut at `REASON_MAX_LENGTH` (200 UTF-16 units).
- **Modelled_Peripheral**: An ATmega328P peripheral that a component built by the Emulator_Bridge emulates, according to the avr8js 0.21.1 source.
- **Unmodelled_Peripheral**: An ATmega328P peripheral that the Peripheral_Table marks as not modelled.
- **Peripheral_Table**: The table in `design.md` that lists every Modelled_Peripheral and every Unmodelled_Peripheral with its Peripheral_ID, Plain_Name, register addresses, Use_Accesses, Disable_Writes and sources.
- **Peripheral_ID**: The short datasheet name of a peripheral, for example `USART0`, `SPI`, `TWI`. For a row that is a single register with no plainer peripheral name, the register name (Requirement 1, criterion 10).
- **Plain_Name**: The plain-words name of a peripheral given in the Peripheral_Table, for example "serial port" for `USART0`.
- **Use_Access**: A register read or write that the Peripheral_Table marks as meaning the program is using the peripheral, for example a data register access or a write that sets an enable bit.
- **Disable_Write**: A register write that the Peripheral_Table marks as only keeping the peripheral disabled, for example the start-up write of 0 to `UCSR0B` that disconnects the serial pins.
- **Peripheral_Diagnostic**: The record `{ peripheral, register, cycle, access }` of the earliest Use_Access of one Unmodelled_Peripheral in one Run. `peripheral` is the Peripheral_ID, `register` is the datasheet register name, `cycle` is the integer CPU cycle of the access, and `access` is `"read"` or `"write"`.
- **Peripheral_Reason**: The sentence "The program uses the <Plain_Name> (<Peripheral_ID>), which this emulator setup does not model, so the rule cannot be checked." For `USART0` the sentence is "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked."
- **Calibration_Set**: The programs calibrated in Requirement 2: the `crosswalk`, `garage` and `heartbeat` examples (buggy and fixed builds, Run_Index 0 to 3 at each example's committed `campaignSeed`), and the fixtures `blink_button`, `analog_read`, `pwm_out` and `floating_input`.
- **Calibration_Script**: A temporary script named `scripts/tmp-*.ts` that logs register accesses for the Calibration_Set.
- **New_Fixture**: `fixtures/serial_hello`, `fixtures/eeprom_boot` or `fixtures/ext_interrupt`.
- **Build_File_Set**: The file set of `fixtures/pwm_out/build`: `<name>.ino.eep`, `<name>.ino.elf`, `<name>.ino.hex`, `<name>.ino.with_bootloader.bin` and `<name>.ino.with_bootloader.hex`.
- **Failure_Story**: The function `failureStory` in `src/engine/reducer/story.ts` and the text it returns, as specified by Requirement 13 of the `trace-reducer` spec and changed by Part 2 of this spec.
- **Ms_Text**: The millisecond text of a cycle count defined by the `trace-reducer` spec and `msText` in `src/engine/reducer/story.ts`, for example `978.0 ms`.
- **Cycle_Text**: The base-10 digits of a non-negative integer cycle count, with no leading zero, and a comma between each group of 3 digits counted from the right, for example `15,647,543`, `16,000`, `512` and `0`.
- **Story_Labels**: The optional Failure_Story input `labels` of shape `{ [signal]: { active: string, inactive: string } }`.
- **Press_Value**: For a digital Fixture pin, 1 when its `activeLevel` is `"high"` and 0 when it is `"low"` or absent, as `pressValue` in `src/engine/reducer/events.ts` computes it.
- **Held_Press**: A digital Gremlin_Event in the Reduced_List whose `value` is the Press_Value of its pin, with no later event in the Reduced_List on the same signal whose `value` is `"release"`.
- **Gremlin_Event**: A Reduced_List event whose `gremlinId` is not `"rest"`.
- **Reduced_List**: The `reducedList` input of the Failure_Story.
- **Detailed_Form** and **Summary_Form**: The two story wordings defined by the `trace-reducer` spec.
- **Violation_Span**: The `violationSpan` input `{ lengthCycles, cut }` of the Failure_Story, as the `trace-reducer` spec defines it.
- **Canonical_Sentence**: As the `trace-reducer` spec defines it.
- **Story_Sentence**: As the `trace-reducer` spec defines it.
- **Story_Words**: As the `trace-reducer` spec defines it.
- **Story_Number**: As the `trace-reducer` spec defines it.
- **Output_Edges**: As the `trace-reducer` spec defines it.
- **Reducer_Error**: As the `trace-reducer` spec defines it.
- **Scripted_Run**: As the `example-firmware` spec defines it.
- **Run_Path**: As the `trace-reducer` spec defines it.
- **Evidence_Bench**: The script `bench/evidence.ts`.
- **Evidence_Doc**: The file `docs/evidence/EVIDENCE-NUMBERS.md`.
- **Example**: One of `crosswalk`, `garage` and `heartbeat` under `examples/`, each with a buggy and a fixed build, `fixture.json`, `meta.json` and `rules.txt`.
- **Seed_Sweep**: The Evidence_Bench part that runs Example Campaigns over a range of `campaignSeed` values.
- **Violating_Run_Number**: For a BROKE Campaign, its `violatingRunIndex` plus 1 (1-based).
- **Single_Input**: The term defined by the `example-firmware` spec: for each Example, one ordinary user action as a Scripted_Run event list. Its values are `crosswalk` REQUEST Press at 4,800,000 and Release at 5,600,000; `garage` BEAM_CLEAR Press at 6,400,000 and Release at 6,432,000; `heartbeat` PULSE Press at 4,000,000 and Release at 5,600,000 (`.kiro/specs/example-firmware/tasks.md`, tasks 4.5, 6.5 and 8.5).
- **Hold_Cycles**: The Single_Input Release cycle minus its Press cycle.
- **Single_Press_Sweep**: The Evidence_Bench part that moves the Single_Input to many start cycles.
- **Sweep_Start**: A Press cycle of the Single_Press_Sweep: k × 160,000 cycles (k × 10 ms) for an integer k of at least 1.
- **Guard**: `scripts/guard.mjs`, run by `npm run guard`.
- **Banned_Words**: The `BANNED_WORDS` list in `src/engine/copy-rules.ts` and the claim-word list in `scripts/guard.mjs`.
- **Committed_Test_File**: Every file under `src/engine/__tests__/` and `tests/` that is committed when this spec starts, including test helpers such as `reducer-arbitraries.ts`.
- **Baseline**: Every committed file under `src/engine/__tests__/baselines/` and `.kiro/specs/bridge-output-scan/BASELINE-HASH.txt`.
- **Pinned_Literal**: A literal value in a Committed_Test_File that a test compares a computed result against, for example the `PINNED` table in `src/engine/__tests__/reducer-examples.test.ts`.
- **Pre_Approved_Edit**: One of these changes to a Committed_Test_File: (a) a change to an expected Failure_Story string literal in `src/engine/__tests__/reducer-story*.test.ts` or `src/engine/__tests__/reducer-examples.test.ts` (the six story strings in `reducer-story.test.ts`); (b) a change to `refStory` in `src/engine/__tests__/reducer-arbitraries.ts` for its wording, "and held", labels, the span sentence and the cycle with thousands separators, plus any helper `refStory` needs for those; (c) a change to the number check of Property 11 in `src/engine/__tests__/reducer-story.property.test.ts` so that the check accepts comma-grouped cycles. Kinds (b) and (c) were approved in round 2.

## Requirements

### Requirement 1: Peripheral_Table in design.md

**User Story:** As a maker, I want a clear list of which ATmega328P peripherals the emulator models, so that I know when a verdict is backed by the run.

#### Acceptance Criteria

1. THE Agent SHALL list in the Peripheral_Table, as a Modelled_Peripheral row, every avr8js peripheral component that `src/engine/emulator-bridge.ts` constructs (GPIO ports, timers, ADC and any other avr8js peripheral class it constructs). Each row SHALL give the avr8js class, the config name and the line in `src/engine/emulator-bridge.ts` where the component is constructed.
2. THE Agent SHALL give every Modelled_Peripheral row in the Peripheral_Table, including any row added by criterion 7, the construction line in `src/engine/emulator-bridge.ts` of the component that emulates it, and SHALL list no Modelled_Peripheral without one.
3. THE Agent SHALL list in the Peripheral_Table, as an Unmodelled_Peripheral row, every ATmega328P peripheral that has at least one register in the ATmega328P register map and that no component built by the Emulator_Bridge emulates according to the avr8js 0.21.1 source. The list SHALL include at least USART0, SPI, TWI, EEPROM, watchdog, analog comparator (ACSR, DIDR1), plus DIDR0, ASSR, GTCCR, PRR, SMCR, CLKPR, MCUCR, MCUSR, SPMCSR and OSCCAL, plus every other unmodelled peripheral the Agent finds (round 2 decision 1).
4. THE Peripheral_Table SHALL give each Peripheral_ID in exactly one row. For each Unmodelled_Peripheral the row SHALL give its Peripheral_ID, its Plain_Name, and the name and data-space address of each of its registers.
5. THE Peripheral_Table SHALL state each Use_Access and each Disable_Write of an Unmodelled_Peripheral as a register name, an access kind (`read` or `write`) and, where the classification depends on the value, the bit or value condition. The table SHALL write "none" for a peripheral that has no Disable_Write, and no single register access SHALL match both a Use_Access and a Disable_Write.
6. THE Peripheral_Table SHALL classify the core start-up write of 0 to `UCSR0B` as a Disable_Write of USART0.
7. THE Peripheral_Table SHALL list the external interrupts INT0/INT1 (EXINT: EICRA, EIMSK, EIFR) and the pin-change interrupts PCINT0 to PCINT2 (PCICR, PCIFR, PCMSK0 to PCMSK2) as Modelled_Peripheral rows, with the avr8js 0.21.1 file and line evidence of Open issue OI-1, so that the Emulator_Bridge records no Peripheral_Diagnostic for an access to their registers. (Resolved in round 2, decision 1: this criterion no longer STOPs work.)
8. THE Peripheral_Table SHALL give a source for every row, every register address, every Use_Access and every Disable_Write. A source is one of: a file and line in the avr8js 0.21.1 source, a file and line in the Arduino AVR core, or an ATmega328P datasheet section given by section number and title.
9. THE Agent SHALL quote in `design.md`, each with file and line range, the existing CannotCheck_Path code: the `CannotCheck` type in `src/engine/checker.ts`, its collection in `runEventList` in `src/engine/campaign.ts`, and its use in `computeVerdict` in `src/engine/verdict.ts`. `design.md` SHALL then state "reuses" or "does not reuse" for the Peripheral_Diagnostic verdict path, with at least one reason that refers to the quoted code.
10. WHERE an Unmodelled_Peripheral row is a single register with no plainer peripheral name, THE Peripheral_Table SHALL give the register name as the row's Peripheral_ID, so that the Peripheral_Reason names the register.

### Requirement 2: Calibration before implementation

**User Story:** As a maintainer, I want the detection checked against the committed programs before any code changes, so that the new verdict path cannot change today's results by surprise.

#### Acceptance Criteria

1. WHILE no file under `src/` differs from its committed content, WHEN the Peripheral_Table in `design.md` is complete, THE Agent SHALL run a Calibration_Script that logs every read and every write of every register the Peripheral_Table lists for an Unmodelled_Peripheral, for every program of the Calibration_Set. Each log entry SHALL hold the register name, the data-space address, the integer CPU cycle, the access kind (`"read"` or `"write"`) and the byte value.
2. THE Calibration_Script SHALL run the buggy build and the fixed build of each Example for Run_Index 0, 1, 2 and 3. Each Run SHALL use the ordered event list that the existing Campaign code in `src/engine/campaign.ts` builds for that Run_Index at the Example's committed `campaignSeed` from its `meta.json`, with the Example's `fixture.json` and `gremlinSet`, on a fresh Emulator_Bridge, and SHALL continue to the Example's `runCycles` even if a Violation occurs earlier.
3. THE Calibration_Script SHALL run `blink_button`, `analog_read`, `pwm_out` and `floating_input` once for each distinct Fixture that a Committed_Test_File or a committed `bench/` script passes with that program's HEX. Each run SHALL last at least as many cycles as the longest run that any Committed_Test_File or committed `bench/` script makes with that HEX. The Agent SHALL write in the Report, for each run, the Fixture, the file and line it came from, the event list and the run length in cycles.
4. WHEN the Calibration_Script has run, THE Agent SHALL write in the Report, per program, each logged access classified as Use_Access, Disable_Write or other by the Peripheral_Table.
5. IF the Calibration_Script logs a Use_Access by any program of the Calibration_Set, THEN THE Agent SHALL STOP and report the program, Run_Index, register, cycle, access and value as a finding that changes the plan.
6. IF the Calibration_Script logs an access to an Unmodelled_Peripheral register that the Peripheral_Table classifies as neither a Use_Access nor a Disable_Write, THEN THE Agent SHALL STOP and report the access as a value not given.
7. THE Calibration_Script SHALL log accesses without changing any register value returned to the program or any data-memory byte.
8. IF the Calibration_Script cannot load a program's HEX, Fixture or `meta.json`, or a run returns a bridge error, THEN THE Agent SHALL STOP, report the program, the Run_Index or Fixture and the error, and change no file under `src/`.

### Requirement 3: Peripheral_Diagnostic recording

**User Story:** As a student, I want the run to note when my program touches hardware the emulator does not model, so that the verdict can say so.

#### Acceptance Criteria

1. WHEN a program performs a Use_Access on an Unmodelled_Peripheral during a Run, THE Emulator_Bridge SHALL record a Peripheral_Diagnostic `{ peripheral, register, cycle, access }` for that access.
2. THE Emulator_Bridge SHALL record at most one Peripheral_Diagnostic per Unmodelled_Peripheral per Run, for the earliest Use_Access of that peripheral in the Run.
3. WHEN a program performs a Disable_Write on an Unmodelled_Peripheral, THE Emulator_Bridge SHALL record no Peripheral_Diagnostic for that write.
4. THE Peripheral_Diagnostic `cycle` SHALL be the integer CPU cycle count of the Emulator_Bridge at the access, and `access` SHALL be `"read"` or `"write"`.
5. WHILE detecting Use_Accesses, THE Emulator_Bridge SHALL return the same register values to the program and leave the same data-memory bytes as an Emulator_Bridge without detection, for every access, and SHALL reach the same CPU cycle count and report the same output events and the same floating-input diagnostics as an Emulator_Bridge without detection.
6. THE Campaign SHALL carry each Peripheral_Diagnostic of a Run in that Run's result, in ascending `cycle` order.
7. WHEN the same HEX, Fixture and ordered event list are run twice on fresh Emulator_Bridges, THE Emulator_Bridge SHALL record deep-equal Peripheral_Diagnostic lists for the two Runs.
8. THE Agent SHALL keep every use of avr8js for detection inside `src/engine/emulator-bridge.ts`, behind `EmulatorBridgeInterface`.
9. THE Emulator_Bridge SHALL detect Use_Accesses only in the cycles a Run already executes, from cycle 0 to the Run's `endCycle`. THE Campaign SHALL NOT extend a Run past the point where the Run_Path stops today in order to look for Use_Accesses.

### Requirement 4: Verdict when a peripheral is used

**User Story:** As a maker flashing AI-written firmware, I want COULDN'T TELL instead of HELD when my program uses hardware the emulator does not model, so that I do not trust a check that did not happen.

#### Acceptance Criteria

Note: these criteria follow round 2 decision 2, which replaces the literal reading of Open issue OI-3.

1. WHEN a Campaign finishes with a Violating_Run that holds no Peripheral_Diagnostic whose `cycle` is less than or equal to its Violation_Cycle, THE Verdict_Function SHALL return the `BROKE` verdict deep-equal to the verdict the Verdict_Function returns before this change for the same argument with every Peripheral_Diagnostic removed, whatever Peripheral_Diagnostics the other completed Runs hold.
2. WHEN a Campaign finishes with a Violating_Run that holds a Peripheral_Diagnostic whose `cycle` is less than or equal to its Violation_Cycle, THE Verdict_Function SHALL return the verdict `COULDN'T TELL`.
3. WHEN a Campaign finishes, no completed Run has a Violation, and any completed Run holds a Peripheral_Diagnostic, THE Verdict_Function SHALL return the verdict `COULDN'T TELL`, never the HELD verdict.
4. WHEN a Campaign finishes and no completed Run holds a Peripheral_Diagnostic, THE Verdict_Function SHALL return a verdict deep-equal to the verdict it returns before this change.
5. THE Verdict_Function SHALL follow the precedence of `computeVerdict` before this change for every part of the verdict that criteria 1 to 4 do not decide, and SHALL keep the handling of Floating_Diagnostics and of the CannotChecks reported for floating inputs unchanged. `design.md` SHALL quote that precedence with file and line range.
6. IF the Campaign is not finished, THEN THE Verdict_Function SHALL return the same value it returns before this change for an unfinished Campaign (`null`), whatever Peripheral_Diagnostics the completed Runs hold.

### Requirement 5: COULDN'T TELL Reason for a peripheral

**User Story:** As a student, I want the reason to name the peripheral in plain words, so that I know what blocked the check.

#### Acceptance Criteria

1. WHEN the Verdict_Function returns `COULDN'T TELL` because of Requirement 4, criterion 2 or 3, THE Reason SHALL hold one Peripheral_Reason for each distinct Unmodelled_Peripheral whose Peripheral_Diagnostic caused that verdict. Under Requirement 4, criterion 2, the causing Peripheral_Diagnostics are those of the Violating_Run with a `cycle` less than or equal to its Violation_Cycle. Under Requirement 4, criterion 3, they are every Peripheral_Diagnostic of every completed Run.
2. THE Peripheral_Reason for USART0 SHALL be exactly "The program uses the serial port (USART0), which this emulator setup does not model, so the rule cannot be checked."
3. THE Peripheral_Reason for every other Unmodelled_Peripheral SHALL be "The program uses the <Plain_Name> (<Peripheral_ID>), which this emulator setup does not model, so the rule cannot be checked." with the Plain_Name and Peripheral_ID of its Peripheral_Table row.
4. THE Reason SHALL place the Peripheral_Reasons before every other Reason part, ordered by the lowest `cycle` of each peripheral among the causing Peripheral_Diagnostics of criterion 1, with ties ordered by Peripheral_Table row order.
5. WHEN the Verdict_Function returns a Reason that holds Peripheral_Reasons, THE Reason SHALL begin with the leading Peripheral_Reason in full, character for character. THE Verdict_Function SHALL join the parts and cut the text at `REASON_MAX_LENGTH` (200 UTF-16 units) with the existing `buildReason` and `truncateReason` in `src/engine/verdict.ts`, unchanged. The cut may shorten or drop parts after the leading Peripheral_Reason (see OI-5).
6. THE Peripheral_Table SHALL give Plain_Names such that every Peripheral_Reason is at most 200 UTF-16 units long and holds no Banned_Words entry as a whole word, ignoring letter case.
7. WHEN the same finished Campaign input is given to the Verdict_Function twice, THE Verdict_Function SHALL return character-for-character equal Reasons.
8. THE Peripheral_Reason for the EEPROM row SHALL name the EEPROM: its text SHALL hold the word "EEPROM".

### Requirement 6: Verdict computation stays pure

**User Story:** As a maintainer, I want the new verdict path to follow the determinism rules, so that a replay gives the same verdict.

#### Acceptance Criteria

1. THE Verdict_Function SHALL compute the verdict from its argument only, leave the argument unchanged, and return deep-equal verdicts for deep-equal arguments.
2. THE Emulator_Bridge and the Verdict_Function SHALL measure time for Peripheral_Diagnostics in integer CPU cycles only, with no wall clock, timer callback or random source.
3. THE Checker and the Verdict_Function SHALL make no network call and contain no AI.

### Requirement 7: New fixtures

**User Story:** As a teacher, I want small programs that use unmodelled hardware, and one that uses the modelled external interrupt, so that the COULDN'T TELL path and the modelled path both have real evidence.

#### Acceptance Criteria

1. THE Agent SHALL write `fixtures/serial_hello/serial_hello.ino` that calls `Serial.begin(9600)` in setup, calls `Serial.print` in loop, and drives one LED output.
2. THE Agent SHALL write `fixtures/ext_interrupt/ext_interrupt.ino` that calls `attachInterrupt` on PD2 with a handler that toggles one output, with an interrupt mode under which each scripted PD2 edge of Requirement 8, criterion 2 runs the handler once.
3. THE Agent SHALL write `fixtures/serial_hello/fixture.json`, `fixtures/eeprom_boot/fixture.json` and `fixtures/ext_interrupt/fixture.json` in the same shape as `fixtures/pwm_out/fixture.json`: an object with a `pins` array of `{ signal, port, bit, direction }` entries.
4. THE `fixture.json` of each New_Fixture SHALL list every pin that its sketch passes to `pinMode`, `digitalWrite` or `attachInterrupt`, with `direction` `"output"` for each driven pin, and `fixtures/ext_interrupt/fixture.json` SHALL list PD2 as port `"D"`, bit 2, with `direction` `"input"`.
5. WHEN `validateFixture` in `src/engine/fixture.ts` is given the `fixture.json` of a New_Fixture, THE `validateFixture` function SHALL return `null`.
6. THE Agent SHALL compile each New_Fixture with `arduino-cli compile -b arduino:avr:uno --output-dir fixtures/<name>/build fixtures/<name>`, where `<name>` is `serial_hello`, `eeprom_boot` or `ext_interrupt`.
7. WHEN a New_Fixture compiles, THE `fixtures/<name>/build` folder SHALL hold exactly the Build_File_Set for `<name>`.
8. THE New_Fixture sketches and fixture files SHALL be original code written for this spec, SHALL name the chip as "ATmega328P" in comments, and SHALL hold no Banned_Words entry.
9. IF a New_Fixture fails to compile with the command of criterion 6, THEN THE Agent SHALL STOP as Requirement 23, criterion 5 states, and SHALL write no build file for it by any other means.
10. WHERE this spec gives no value for a New_Fixture detail (LED pin, output pin, the interrupt mode within criterion 2, Serial.print text, loop delay, signal names, the mapping from the EEPROM byte to a blink rate), THE Agent SHALL choose it as Requirement 23, criterion 10 states and list it under Choices I made.
11. THE Agent SHALL write `fixtures/eeprom_boot/eeprom_boot.ino` that calls `EEPROM.read(0)` in setup and uses the byte read to pick the blink rate of one LED output, and `fixtures/eeprom_boot/fixture.json` SHALL list that LED pin with `direction` `"output"`. The sketch SHALL be compiled with the command form of criterion 6 and SHALL produce the Build_File_Set of criterion 7.
12. THE Agent SHALL keep `fixtures/ext_interrupt` as a positive test of the modelled external interrupt (round 2 decision 1).

### Requirement 8: Part 1 tests

**User Story:** As a maintainer, I want tests for each verdict outcome of the new path, so that the behaviour has evidence.

#### Acceptance Criteria

1. WHEN a Campaign runs `fixtures/serial_hello` with its `fixture.json`, THE Verdict_Function SHALL return `COULDN'T TELL` with a Reason that holds the USART0 Peripheral_Reason, and the test SHALL check the Reason text.
2. WHEN a test runs `fixtures/ext_interrupt` with scripted PD2 edges, THE output of the `ext_interrupt` sketch SHALL toggle once for each edge, and THE Run SHALL hold no Peripheral_Diagnostic.
3. THE Agent SHALL add Verdict_Function tests for the precedence of Requirement 4 that show: (a) a Violating_Run whose only Peripheral_Diagnostic has a `cycle` equal to its Violation_Cycle plus 1 keeps `BROKE` with that Run's trace; (b) a Peripheral_Diagnostic in a completed Run other than the Violating_Run, with none in the Violating_Run, does not change the `BROKE` verdict; (c) a Violating_Run whose Peripheral_Diagnostic has a `cycle` equal to its Violation_Cycle gives `COULDN'T TELL`; (d) a finished Campaign with no Violation in any completed Run and a Peripheral_Diagnostic in any completed Run gives `COULDN'T TELL`.
4. WHEN the committed tests run after Part 1, THE Campaign, the Emulator_Bridge and the Verdict_Function SHALL give exactly the same results as before Part 1 for every existing Example, fixture, Baseline and Pinned_Literal.
5. WHEN a test gives the Verdict_Function a finished Campaign whose only Peripheral_Diagnostic is in the Violating_Run, at a `cycle` equal to that Run's Violation_Cycle, THE Verdict_Function SHALL return the verdict `COULDN'T TELL`.
6. WHEN a test runs a Campaign of `fixtures/eeprom_boot` with its `fixture.json`, THE Verdict_Function SHALL return `COULDN'T TELL` with a Reason that holds the EEPROM Peripheral_Reason.

### Requirement 9: Failure_Story violation sentence

**User Story:** As a student, I want the story to say the program broke the rule and give the exact cycle, so that I can find the moment in a trace.

#### Acceptance Criteria

1. THE Failure_Story SHALL write the violation Story_Sentence as "At <Ms_Text> (cycle <Cycle_Text>), the program broke this rule: <rule>", where Ms_Text and Cycle_Text are of the Violation `cycle`, the Cycle_Text group separator is the ASCII comma (U+002C) whatever the host locale, and `<rule>` is the Violation `rule` text character for character.
2. WHEN the Violation `cycle` is 15,647,543, THE Failure_Story SHALL write the violation Story_Sentence beginning "At 978.0 ms (cycle 15,647,543), the program broke this rule: ".
3. THE Failure_Story SHALL treat the digit groups of the Cycle_Text of the Violation `cycle` as allowed Story_Numbers, in addition to the numbers that `trace-reducer` Requirement 13, criterion 9 allows.
4. WHEN the Violation `cycle` is 0, THE Failure_Story SHALL write the violation Story_Sentence beginning "At 0.0 ms (cycle 0), the program broke this rule: ". WHEN the Violation `cycle` is 16,000, THE Failure_Story SHALL write the violation Story_Sentence beginning "At 1.0 ms (cycle 16,000), the program broke this rule: ".
5. THE Failure_Story SHALL hold the words "the program broke this rule" exactly once, and SHALL NOT hold the words "the chip broke this rule".
6. THE Failure_Story SHALL write the Ms_Text and Cycle_Text of the Violation it is given. In `src/engine/__tests__/reducer-examples.test.ts` that Violation is the reducer result's `violation`, so the story writes the Reduced_Replay's own Violation_Cycle (round 2 decision 4; for `crosswalk` the user gives 15,647,515 for the Reduced_Replay and 15,647,543 for the original Campaign).

### Requirement 10: Failure_Story span sentence

**User Story:** As a student, I want plain words for how long the rule stayed broken, so that I understand the size of the failure.

#### Acceptance Criteria

1. WHEN the Failure_Story is given a Violation_Span whose cut flag is false, THE Failure_Story SHALL end with "The violation lasted <Ms_Text>." where Ms_Text is of the span length.
2. WHEN the Failure_Story is given a Violation_Span whose cut flag is true, THE Failure_Story SHALL end with "The violation lasted at least <Ms_Text>." where Ms_Text is of the span length.
3. WHEN the Failure_Story is given no Violation_Span, THE Failure_Story SHALL end with the violation Story_Sentence of Requirement 9.
4. THE Failure_Story SHALL hold no text "The rule stayed broken for", whether or not a Violation_Span is given.

### Requirement 11: Story_Labels

**User Story:** As a teacher, I want to give signals plain action words, so that the story reads like what happened in the room.

#### Acceptance Criteria

1. THE Failure_Story function SHALL accept an optional `labels` input of shape `{ [signal]: { active: string, inactive: string } }`.
2. WHEN the Detailed_Form describes a digital Gremlin_Event that is not a Held_Press, whose `value` is the Press_Value of its pin, and Story_Labels has an entry for its signal, THE Failure_Story SHALL write "<gremlinId> <active> at <Ms_Text>" for that event, for example "bouncer blocked the beam at 340.5 ms" for BEAM_CLEAR with active "blocked the beam".
3. WHEN the Detailed_Form describes a digital Gremlin_Event whose `value` is `"release"` or the one of 0 and 1 that is not the Press_Value, and Story_Labels has an entry for its signal, THE Failure_Story SHALL write "<gremlinId> <inactive> at <Ms_Text>" for that event, for example "bouncer cleared the beam at <Ms_Text>" for BEAM_CLEAR with inactive "cleared the beam".
4. WHEN Story_Labels is absent, or has no entry for the signal of a Gremlin_Event, THE Failure_Story SHALL describe that event with the verbs it uses today ("pressed", "released", "drove", "set").
5. THE Failure_Story SHALL leave the Summary_Form and analog Gremlin_Event wording unchanged by Story_Labels.
6. IF `labels` is present and is `null`, an array, or not an object, or an entry is not an object with `active` and `inactive` strings that are non-empty, on one line, with no leading or trailing space, THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that names the field `labels`.
7. IF a Story_Labels `active` or `inactive` text holds a Banned_Words entry as a whole word or the word "smallest", ignoring letter case, THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that names the field `labels`.
8. THE Failure_Story SHALL ignore Story_Labels entries whose signal is not the signal of a digital Gremlin_Event in the Reduced_List.
9. THE Failure_Story SHALL treat digits inside Story_Labels texts like digits inside signal names for the Story_Number rule.
10. IF any entry of a present `labels` object, including an entry that criterion 8 ignores, is not an object, or lacks an `active` or `inactive` string, or has an `active` or `inactive` text that is empty, holds a line-break character (LF, CR, U+2028 or U+2029), or has a leading or trailing space, THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that names the field `labels`.

### Requirement 12: Held presses

**User Story:** As a student, I want the story to say when a press was never let go, so that I see a stuck input at a glance.

#### Acceptance Criteria

1. WHEN the Detailed_Form describes a Held_Press and Story_Labels has no entry for its signal, THE Failure_Story SHALL write "<gremlinId> pressed and held <signal> at <Ms_Text>" for that event.
2. WHEN the Detailed_Form describes a Held_Press and Story_Labels has an entry for its signal, THE Failure_Story SHALL write "<gremlinId> <active> and held at <Ms_Text>" for that event.
3. WHEN the Detailed_Form describes a press that a later event on the same signal with `value` `"release"` follows in the Reduced_List, THE Failure_Story SHALL write that press without the words "and held".
4. THE Failure_Story SHALL decide whether each Press_Value event is a Held_Press from the Reduced_List alone. THE Failure_Story SHALL count as a later release any event at a higher index in the Reduced_List on the same signal with `value` `"release"`, whatever its `gremlinId` (including `"rest"`) and including an event with an equal `cycle`.
5. THE Failure_Story SHALL count the words "and held" as Story_Words for the 30-word limit.

### Requirement 13: Story properties kept

**User Story:** As a maintainer, I want the story changes to keep the story's existing rules of form, so that replays and copy rules still hold.

Note: "existing rules of form" means `trace-reducer` Requirement 13, criteria 1, 2, 9, 11 to 16 and 18.

#### Acceptance Criteria

1. THE Failure_Story function SHALL return a character-for-character equal text, or a deep-equal Reducer_Error, for deep-equal inputs, SHALL leave its arguments unchanged, and SHALL read no wall clock and draw no random value.
2. THE Failure_Story SHALL begin with "In the smallest replay this reducer found," and SHALL hold the words "the smallest replay this reducer found" exactly once.
3. THE Failure_Story SHALL hold no Banned_Words entry as a whole word, ignoring letter case.
4. THE Failure_Story SHALL take every time and every cycle it writes from the Reduced_List, the Violation, the Output_Edges or the Violation_Span of its input.
5. THE Failure_Story SHALL keep the `trace-reducer` Requirement 13 limits of 2 to 4 Story_Sentences and at most 30 Story_Words per Story_Sentence outside the Canonical_Sentence, with the Summary_Form fallback and the "does not fit" Reducer_Error of that requirement.
6. THE Failure_Story function SHALL return a Reducer_Error in place of throwing for every input value, including a malformed `labels` value.

### Requirement 14: Part 2 tests

**User Story:** As a maintainer, I want tests for each new phrase, so that the wording has evidence.

#### Acceptance Criteria

1. THE Agent SHALL add tests that show the violation sentence with Cycle_Text, both span sentences, a labelled press and release, a Held_Press with and without Story_Labels, and each malformed `labels` case of Requirement 11.
2. THE Agent SHALL add tests that show a Failure_Story without `labels` keeps today's verbs.

### Requirement 15: Pre-approved test edits

**User Story:** As the user, I want only the story strings I approved to change in committed tests, so that no test is weakened to pass.

#### Acceptance Criteria

1. THE Agent SHALL change, among Committed_Test_Files, only Pre_Approved_Edits, and only as far as the Part 2 wording requires.
2. THE Report SHALL name each Pre_Approved_Edit by file, line, old string and new string, and SHALL name every edited line of every Committed_Test_File.
3. THE Agent SHALL leave every other line of every Committed_Test_File unchanged. In `src/engine/__tests__/reducer-arbitraries.ts` only `refStory` and the helpers it needs for Pre_Approved_Edit kind (b) change, and in `src/engine/__tests__/reducer-story.property.test.ts` only the number check of Property 11 changes.
4. IF a Committed_Test_File fails because of the Part 2 wording, and the failure is outside the Pre_Approved_Edits (the six story strings in `reducer-story.test.ts`, `refStory` and the number check of Property 11), THEN THE Agent SHALL STOP and report what the test expects, what the Failure_Story returned, and the evidence. (OI-2 resolved in round 2: `refStory` and the number check no longer cause this STOP.)
5. IF `src/engine/__tests__/reducer-examples.test.ts` holds no expected story string, THEN THE Agent SHALL make no change to that file, and THE Report SHALL state that no Pre_Approved_Edit was made there (see OI-4).
6. WHEN the Agent writes the new string or code of a Pre_Approved_Edit, THE Agent SHALL build the new string or code by applying Requirements 9 to 12 to the old string or code and that test's inputs, and SHALL NOT copy the new string from the Failure_Story output.
7. THE Agent SHALL keep Property 11 in `src/engine/__tests__/reducer-story.property.test.ts` with the same seeds, `numRuns` and counters, and SHALL change nothing else in Property 11 apart from the number check, which SHALL accept comma-grouped cycles (Cycle_Text).

### Requirement 16: Evidence_Bench script

**User Story:** As a teacher, I want one command that produces the evidence numbers, so that anyone can rerun them.

#### Acceptance Criteria

1. THE Agent SHALL add the script `"bench:evidence": "tsx bench/evidence.ts"` to `package.json`.
2. THE Evidence_Bench SHALL run each Example with its committed HEX, `fixture.json`, `rules.txt`, `gremlinSet`, `runs` and `runCycles`, through the existing Campaign and Run code.
3. THE Evidence_Bench SHALL read the wall clock, and the wall clock SHALL be read only in `bench/evidence.ts` among the files this spec adds or changes.
4. WHEN `npm run bench:evidence` finishes, THE Evidence_Bench SHALL write the Evidence_Doc.

### Requirement 17: Seed_Sweep

**User Story:** As a student, I want to see how often the gremlins find each bug across many seeds, so that I know how much one HELD means.

#### Acceptance Criteria

1. THE Evidence_Bench SHALL run a Campaign of each Example's buggy build for each `campaignSeed` from 1 to 100, and SHALL report the count of `BROKE`, `HELD` and `COULDN'T TELL` verdicts.
2. THE Evidence_Bench SHALL report, for each Example's buggy build, the minimum, median and maximum Violating_Run_Number over its BROKE Campaigns of criterion 1.
3. WHEN an even count of BROKE Campaigns holds the Violating_Run_Numbers, THE Evidence_Bench SHALL report the median as the mean of the two middle values in ascending order, written with one decimal when the mean is not an integer and without a decimal point when the mean is an integer.
4. WHEN an odd count of BROKE Campaigns holds the Violating_Run_Numbers, THE Evidence_Bench SHALL report the median as the middle value in ascending order.
5. IF an Example's buggy build has no BROKE Campaign in criterion 1, THEN THE Evidence_Bench SHALL write "none" for its minimum, median and maximum.
6. THE Evidence_Bench SHALL run a Campaign of each Example's fixed build for each `campaignSeed` from 1 to 20, and SHALL report the count of `BROKE`, `HELD` and `COULDN'T TELL` verdicts.
7. IF a Seed_Sweep Campaign ends with an error instead of a verdict, THEN THE Evidence_Bench SHALL print the Example, build, seed and error, exit non-zero, and leave the Evidence_Doc unwritten.
8. IF a fixed build Campaign gives `BROKE`, THEN THE Evidence_Bench SHALL print the Example, the `campaignSeed` and the BROKE trace, and THE Agent SHALL STOP with that seed and trace in the Report and change no example, rule, fixture or test.

### Requirement 18: Single_Press_Sweep

**User Story:** As a teacher, I want to check that one ordinary press never breaks a rule wherever it lands, so that the examples' bugs need a gremlin.

#### Acceptance Criteria

1. THE Evidence_Bench SHALL take, for each Example, the Single_Input and its Hold_Cycles from the `example-firmware` spec: 800,000 cycles for `crosswalk` REQUEST, 32,000 cycles for `garage` BEAM_CLEAR and 1,600,000 cycles for `heartbeat` PULSE.
2. THE Evidence_Bench SHALL run, for each Example and each Sweep_Start in ascending order with a step of 160,000 cycles, from 160,000 cycles (10 ms) up to the largest Sweep_Start whose Release cycle (Sweep_Start plus Hold_Cycles) is below the Example's `runCycles`, one Run of the Single_Input moved to Press at the Sweep_Start and Release at the Sweep_Start plus Hold_Cycles, on a fresh Emulator_Bridge to the Example's `runCycles`.
3. THE Evidence_Bench SHALL run the Single_Press_Sweep on the buggy build and on the fixed build of each Example.
4. THE Evidence_Bench SHALL report, per Example and build, the count of Sweep_Starts, the count of Runs with a Violation, the Sweep_Start of each Run with a Violation, and the count of Runs that reported a CannotCheck. Peripheral_Diagnostics of the Examples show up in the Seed_Sweep verdicts instead, and the Evidence_Doc format stays as written.
5. IF a Single_Press_Sweep reports a non-zero Violation count, THEN THE Agent SHALL list it as a finding in the Report and continue.
6. THE Evidence_Bench SHALL give each sweep Run an event list built like the `example-firmware` Scripted_Run: the "rest" events for the Fixture, then the moved Press, then the moved Release, with no gremlin events.

### Requirement 19: Evidence_Doc

**User Story:** As a reader, I want the numbers with the machine and seeds they came from, so that I can judge and rerun them.

#### Acceptance Criteria

1. THE Evidence_Doc SHALL hold the results of the Seed_Sweep and the Single_Press_Sweep as written by the Evidence_Bench.
2. THE Evidence_Doc SHALL hold the machine info (operating system, CPU model, CPU core count, Node version and avr8js version), the seed ranges, the date of the bench run, and the wall-clock time of each sweep and of the whole bench.
3. THE Evidence_Doc SHALL write verdicts with the Verdict_Strings, and SHALL state that the numbers are evidence from emulated runs and not a proof.
4. THE Evidence_Doc SHALL name the chip "ATmega328P", SHALL name no board brand (including "Arduino"), and SHALL hold none of the words "safe", "secure", "guaranteed", "certified", "real-time", "realtime", "first", "unique" or "shortest", nor any other Banned_Words entry, as a whole word, ignoring letter case.
5. WHEN `npm run guard` scans the Evidence_Doc, THE Guard SHALL report no finding for it.
6. THE Evidence_Doc SHALL hold no `guard-allow` text on any line.
7. THE Agent SHALL write in the Evidence_Doc only numbers that the Evidence_Bench produced.

### Requirement 20: Global acceptance

**User Story:** As the user, I want the whole repository clean after this work, so that nothing else broke.

#### Acceptance Criteria

1. WHEN the work is done, THE Agent SHALL have run `npx vitest --run`, `npm run typecheck`, `npm run guard` and `npm run build`, and each command SHALL have finished with no failure and no error.
2. THE Agent SHALL leave every Committed_Test_File unchanged except for Pre_Approved_Edits.
3. THE Agent SHALL leave every Baseline, every committed file under `fixtures/` and every committed file under `examples/` unchanged.
4. THE Agent SHALL leave the `dependencies` and `devDependencies` of `package.json` and the package set of `package-lock.json` unchanged.
5. THE Agent SHALL keep engine code under `src/engine/` free of wall-clock reads, timer callbacks, `Math.random` and network calls.
6. THE Report SHALL describe passing tests as evidence, not as proof of correctness.

### Requirement 21: Temporary scripts

**User Story:** As a maintainer, I want debug scripts gone when the work is done, so that the repository holds only real code.

#### Acceptance Criteria

1. THE Agent SHALL name every temporary script `scripts/tmp-*.ts`.
2. WHEN a task is reported done, THE Agent SHALL have deleted every `scripts/tmp-*.ts` file it made.

### Requirement 22: Report content

**User Story:** As the user away from the keyboard, I want each Report to hold the facts I need, so that I can decide without rerunning anything.

#### Acceptance Criteria

1. THE Report SHALL list the Calibration_Script results of Requirement 2, the Pre_Approved_Edits of Requirement 15, and the findings of Requirement 18.
2. THE Report SHALL list every non-acceptance value the Agent chose, under "Choices I made".
3. THE Report SHALL give file paths and line ranges for every changed file.

### Requirement 23: STOP conditions

**User Story:** As the user, I want the Agent to stop and report at known risk points, so that it never guesses or weakens a check.

#### Acceptance Criteria

1. IF `npm run guard` reports a finding, THEN THE Agent SHALL STOP and report the Guard output.
2. IF the Calibration_Script shows that a program of the Calibration_Set performs a Use_Access, THEN THE Agent SHALL STOP and report it as Requirement 2, criterion 5 states.
3. IF any Pinned_Literal or Baseline result changes, THEN THE Agent SHALL STOP and report the test, the expected value, the actual value and the evidence.
4. IF a fixed build Campaign gives `BROKE` in the Seed_Sweep, THEN THE Agent SHALL STOP and report the Example, the seed and the trace, changing nothing.
5. IF a New_Fixture fails to compile with the command of Requirement 7, criterion 6, THEN THE Agent SHALL STOP and report the compiler output.
6. IF the Agent needs an acceptance value that this spec does not give, THEN THE Agent SHALL STOP and report the value needed, and SHALL invent no acceptance value.
7. IF an acceptance test that the user wrote into a prompt or spec disagrees with the system, THEN THE Agent SHALL STOP and report what the test expects, what happened and the evidence, and SHALL leave the test unchanged.
8. (Resolved in round 2, decision 1: OI-1 is decided, and this criterion no longer blocks work.) THE Agent SHALL treat INT0/INT1 and PCINT0 to PCINT2 as Modelled_Peripherals as Requirement 1, criterion 7 states, with no STOP for them.
9. (Resolved in round 2, decision 3: OI-2 is decided, and this criterion no longer blocks work for `refStory` or the number check of Property 11.) IF Requirement 15, criterion 4 applies, THEN THE Agent SHALL STOP and report as that criterion states. This STOP blocks only Requirements 9 to 15.
10. IF a non-acceptance value is needed, THEN THE Agent SHALL choose the most conservative value, continue, and list the value under "Choices I made" in the Report.
11. WHEN a STOP of criteria 1 to 9 fires, THE Agent SHALL continue the work that the STOP does not block, including the Peripheral_Table (Requirement 1), the Calibration (Requirement 2) and Part 3 (Requirements 16 to 19) when they are not blocked, and SHALL treat as blocked any work that needs a result of blocked work.
12. WHILE a STOP is waiting for the user's decision, THE Agent SHALL make no further change for the requirements that the STOP blocks and SHALL not report Requirement 20 as met for them.
13. WHEN all work that no STOP blocks is finished, THE Agent SHALL write one final Report that lists every STOP that fired, with the criterion number, the evidence and the requirements it blocked.

### Requirement 24: Round-2 report additions

**User Story:** As the user, I want the Report to compare the cycles and re-check the evidence numbers, so that I can see that the round 2 changes moved nothing they should not.

Note: the user called the Evidence_Doc "committed". `git ls-files` lists `docs/evidence/EVIDENCE-NUMBERS.md`, and `git log` shows it in commit 109f615, so the file is committed. The comparison of criterion 2 is against the Evidence_Doc as it stood before the re-run.

#### Acceptance Criteria

1. THE Report SHALL give, per Example, the original Campaign Violation_Cycle and the Reduced_Replay's Violation_Cycle side by side, for example `crosswalk`: 15,647,543 vs 15,647,515.
2. WHEN Parts 1 and 2 are done, THE Agent SHALL re-run `npm run bench:evidence`, and THE Report SHALL list every difference between the new Evidence_Doc and the Evidence_Doc as it stood before the re-run, apart from the date and the wall-clock times.
3. IF any count in the re-run Evidence_Doc differs from the Evidence_Doc as it stood before the re-run, THEN THE Agent SHALL report the difference as a finding (the user expects none).
