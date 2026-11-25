# Requirements Document

## Introduction

The benchmark tools check sketches written by AI chat tools with the headless runner (`npm run check`). They add a one-sketch wrapper script, three config files, a motor pin fixture and rule file, a script that measures how long two outputs were on together, and a results README in `exorcism-demo/benchmark/`. The README lists the briefs, the commands, the results tables, and a plain explanation. The earlier results listed in Requirement 7 are expectations to confirm or report as different, not facts to copy into the README.

## Glossary

- **Try_Script**: The Node script `exorcism-demo/try.mjs`, run as `node exorcism-demo/try.mjs <sketch.ino> <config.json>`. It is plain `.mjs` because the user named it.
- **Build_Script**: The existing script `exorcism-demo/build.mjs`, which compiles `exorcism-demo/sketch/sketch.ino` to `exorcism-demo/build/sketch.hex`.
- **Work_Sketch**: The file `exorcism-demo/sketch/sketch.ino`.
- **Check_Config**: A JSON file with the same keys as `exorcism-demo/loop-check.json`: `source`, `build`, `hex`, `pins`, `rules`, `gremlins`, `runs`, `seed`, and `runMs`.
- **CLI**: The headless runner defined by the headless-runner spec, whose `npm run check` script runs `cli/bin.ts`. It exits 0 for HELD, 1 for BROKE, 2 for COULDN'T TELL, and 3 for an input or internal error.
- **Crosswalk_Check**: `exorcism-demo/crosswalk-check.json`.
- **Crosswalk_Full_Check**: `exorcism-demo/crosswalk-full-check.json`.
- **Motor_Check**: `exorcism-demo/motor-check.json`.
- **Motor_Pins**: The pin fixture `exorcism-demo/motor/pins.json`, in the same format as `examples/crosswalk/fixture.json`.
- **Motor_Rules**: The rule file `exorcism-demo/motor/rules.txt`.
- **Overlap_Script**: The TypeScript script `exorcism-demo/measure-overlap.ts`, run with the repo's tsx.
- **Overlap_Result**: The longest stretch, in CPU cycles and microseconds, during which both named outputs were 1 together, within the replay or the tries that were measured.
- **Reduced_Replay**: The reduced event list that the CLI reports for a BROKE try, replayed by the Engine_Replay.
- **Hook_Launch**: The way the repo hooks start the CLI: `node` with the repo's tsx on `cli/bin.ts` and the `--no-deprecation` flag, passed as an argument array with no shell.
- **Engine_Replay**: The engine's existing replay path (fresh emulator, same HEX, same fixture, same ordered event list).
- **Benchmark_Sketch**: A `.ino` file under `exorcism-demo/benchmark/` and its subfolders, holding an unedited answer from a chat tool.
- **Benchmark_Folder**: `exorcism-demo/benchmark/`.
- **Results_README**: The file `exorcism-demo/benchmark/README.md`.
- **Brief**: The text of a task given to a chat tool. The user supplied both briefs, which are quoted in Requirement 8.
- **Round_2_Sketches**: The 8 sketches `chatgpt-fast`, `chatgpt-high`, `claude-fast`, `claude-high`, `deepseek-fast`, `deepseek-high`, `gemini-fast`, and `gemini-medium`, each a `.ino` file in `exorcism-demo/benchmark/round2/`, that answer the crossing brief. The file `chatgpt-high-kiro-fixed.ino` in the same folder is the user's own fixed version from the Kiro loop demo, is not a chat answer, and is not a Round_2_Sketch.
- **Round_3_Sketches**: The 8 `.ino` files in `exorcism-demo/benchmark/round3/` with the same 8 names as the Round_2_Sketches, which answer the motor brief.
- **Earlier_Sketches**: The four `.ino` files `chatgpt.ino`, `claude.ino`, `deepseek.ino`, and `gemini.ino` at the top level of the Benchmark_Folder, written for an earlier brief.
- **Verdict_Strings**: Exactly `BROKE`, `HELD` with the text "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N is 1), and `COULDN'T TELL`.
- **Banned_Words**: The words safe, secure, guaranteed, certified, real-time, first, unique, and shortest.
- **Reduced_Replay_Phrase**: The phrase "the smallest replay this reducer found".

## Requirements

### Requirement 1: Try script

**User Story:** As a maker, I want one command that checks one sketch, so that I can compare chat answers without editing files by hand.

#### Acceptance Criteria

1. WHEN the Try_Script receives a sketch path and a Check_Config path, THE Try_Script SHALL copy the sketch file to the Work_Sketch.
2. WHEN the sketch is copied, THE Try_Script SHALL run the Build_Script and wait for it to finish.
3. WHEN the Build_Script exits with code 0, THE Try_Script SHALL start the CLI by the Hook_Launch, with the Check_Config values for `pins`, `rules`, `gremlins`, `runs`, `seed`, and `runMs`, and with the built HEX named by the Check_Config `hex` value, so that the run has the same meaning as `npm run check`.
4. WHEN the CLI finishes, THE Try_Script SHALL print the CLI output unchanged and exit with the CLI's exit code, passing the code through.
5. IF the Build_Script exits with a non-zero code, THEN THE Try_Script SHALL print the Build_Script output, print no verdict string, and exit with code 3.
6. IF the Try_Script receives fewer than two arguments, a sketch path that cannot be read, or a Check_Config that is unreadable, not valid JSON, or lacks a key, THEN THE Try_Script SHALL print one line that names the cause, change no file, and exit with code 3.
7. THE Try_Script SHALL start every child process with an argument array and no shell, SHALL NOT start `npm` as a child process, and SHALL work on Windows, macOS, and Linux.
8. THE Try_Script SHALL resolve relative paths in the Check_Config against the repo folder, whatever the current working folder is.
9. THE Try_Script SHALL read no clock, call no Math.random, make no network call, and add no npm package.
10. THE Try_Script SHALL write only the Work_Sketch and the files the Build_Script writes, and SHALL leave every Benchmark_Sketch byte-for-byte unchanged.

### Requirement 2: Check configs

**User Story:** As a maker, I want fixed configs for each round, so that every sketch is checked against the same rules, gremlins, and seed.

#### Acceptance Criteria

1. THE Crosswalk_Check SHALL use the same keys as `exorcism-demo/loop-check.json`, with `rules` set to `examples/crosswalk/rules.txt`, `gremlins` set to `masher`, and `runs` set to 24.
2. THE Crosswalk_Full_Check SHALL use the same keys, with `rules` set to `exorcism-demo/crosswalk-full-rules.txt`, `gremlins` set to `masher,bouncer`, and `runs` set to 200.
3. THE Motor_Check SHALL use the same keys, with `pins` set to `exorcism-demo/motor/pins.json`, `rules` set to `exorcism-demo/motor/rules.txt`, `gremlins` set to `masher,bouncer`, and `runs` set to 200.
4. THE Crosswalk_Check and THE Crosswalk_Full_Check SHALL set `pins` to `examples/crosswalk/fixture.json`.
5. THE Crosswalk_Check, THE Crosswalk_Full_Check, and THE Motor_Check SHALL each set `source` to `exorcism-demo/sketch/sketch.ino`, `build` to `["node","exorcism-demo/build.mjs"]`, `hex` to `exorcism-demo/build/sketch.hex`, `seed` to 20261101, and `runMs` to 1000.
6. THE Crosswalk_Check, THE Crosswalk_Full_Check, and THE Motor_Check SHALL leave `exorcism-demo/loop-check.json` and `exorcism-demo/crosswalk-full-rules.txt` byte-for-byte unchanged.

### Requirement 3: Motor pins and rules

**User Story:** As a maker, I want a motor-controller fixture and rule file, so that I can check a three-button, two-output sketch.

#### Acceptance Criteria

1. THE Motor_Pins SHALL define FWD_BUTTON on PD2, REV_BUTTON on PD3, and STOP_BUTTON on PD4, each with direction input and activeLevel low.
2. THE Motor_Pins SHALL define FORWARD on PB0 and REVERSE on PB1, each with direction output.
3. THE Motor_Rules SHALL contain exactly these three lines, one rule per line, with no blank line, each line LF-terminated, in this order, in the same format as `exorcism-demo/crosswalk-full-rules.txt`:
   - `all of (FORWARD is 1, REVERSE is 1) must never happen.`
   - `Within 50 ms after STOP_BUTTON is 0 becomes true, FORWARD is 0 must be true.`
   - `Within 50 ms after STOP_BUTTON is 0 becomes true, REVERSE is 0 must be true.`
4. WHEN the CLI loads the Motor_Pins and the Motor_Rules, THE rule compiler SHALL accept all three rules without an error.
5. IF the rule compiler rejects a Motor_Rules line (the "Within N ms after X becomes true, Y must be true" form is the app's "Must answer in time" rule form and is expected to compile), THEN THE benchmark tools SHALL stop, report the rejected line and the compiler message, and leave the Motor_Rules text unchanged.

### Requirement 4: Overlap measurement

**User Story:** As a maker, I want to know how long two outputs were on together, so that I can tell a brief glitch from a long overlap.

#### Acceptance Criteria

1. WHEN the Overlap_Script receives a HEX path, a pin fixture path, and two output signal names, THE Overlap_Script SHALL report the Overlap_Result in CPU cycles and in microseconds.
2. THE Overlap_Script SHALL compute microseconds from cycles at 16 MHz as cycles divided by 16, printed with two decimal places.
3. THE Overlap_Script SHALL take its numbers from the Engine_Replay and SHALL read no wall clock.
4. WHEN the Overlap_Script receives the same inputs twice, THE Overlap_Script SHALL print identical output.
5. WHEN the two outputs are never on together, THE Overlap_Script SHALL report 0 cycles and 0.00 microseconds.
6. IF a signal name is missing from the pin fixture, is not an output, or the HEX file is unreadable, THEN THE Overlap_Script SHALL print one line that names the cause, report no number, and exit with a non-zero code.
7. THE Overlap_Script SHALL be written in TypeScript, SHALL read no clock, SHALL call no Math.random, and SHALL make no network call.
8. WHERE the Overlap_Script takes the gremlin set, seed, and try number as optional arguments, THE Overlap_Script SHALL replay that run and report the Overlap_Result for it.
9. WHERE the Overlap_Script takes a Reduced_Replay selection for a gremlin set, seed, and try number, THE Overlap_Script SHALL measure the Overlap_Result on the Reduced_Replay of that try.
10. WHERE the Overlap_Script takes a campaign selection with a gremlin set, seed, and run count, THE Overlap_Script SHALL measure every try of that campaign and report the largest Overlap_Result found, with the try number where it occurred.
11. WHEN a campaign measurement finds no overlap in any try, THE Overlap_Script SHALL report 0 cycles and 0.00 microseconds and SHALL describe the result as no overlap found in those tries.

### Requirement 5: Benchmark inputs stay unedited

**User Story:** As the project owner, I want the chat answers kept as they came, so that the results compare the tools and not my edits.

#### Acceptance Criteria

1. THE benchmark tools SHALL leave every Benchmark_Sketch byte-for-byte unchanged.
2. WHEN the benchmark tools need a changed copy of a Benchmark_Sketch, THE benchmark tools SHALL write the copy outside the Benchmark_Folder.
3. WHEN the work is finished, THE benchmark tools SHALL leave no debug script in the repo.

### Requirement 6: Re-run the benchmark

**User Story:** As the project owner, I want the old results confirmed by a fresh run, so that the README states what the tools measure today.

#### Acceptance Criteria

1. WHEN the benchmark is re-run, THE benchmark tools SHALL check each of the 8 Round_2_Sketches (excluding `chatgpt-high-kiro-fixed.ino`) with the Crosswalk_Check and with the Crosswalk_Full_Check, and each of the 8 Round_3_Sketches with the Motor_Check, through the Try_Script, and SHALL NOT run the Earlier_Sketches.
2. WHEN a check finishes, THE benchmark tools SHALL record the sketch name, the config name, the verdict string, the exit code, the try number and the moves before and after reduction when the verdict is BROKE, and the fingerprint when the verdict is BROKE.
3. WHEN a Round_2_Sketch is BROKE on a rule that names WALK and DONT_WALK, THE benchmark tools SHALL run the Overlap_Script on the built HEX with the crosswalk fixture and the outputs WALK and DONT_WALK, measured on the Reduced_Replay of that BROKE try, and SHALL record the Overlap_Result.
4. WHEN a Round_3_Sketch is checked, THE benchmark tools SHALL run the Overlap_Script with the outputs FORWARD and REVERSE, measured across every try of the Motor_Check campaign (same gremlin set, seed, and run count), and SHALL record the largest Overlap_Result found.
5. THE benchmark tools SHALL print every verdict exactly as one of the Verdict_Strings.
6. THE benchmark tools SHALL record the seed, the gremlin set, and the run count with every result.

### Requirement 7: Expected results gate

**User Story:** As the project owner, I want a stop when a result differs from my expectation, so that no README states something the tools did not show.

The expected results from earlier runs:

- Round 2, crossing, Crosswalk_Check: all 8 Round_2_Sketches HELD with 24 tries.
- Round 2, crossing, Crosswalk_Full_Check: all 8 BROKE on "all of (WALK is 1, DONT_WALK is 1) must never happen.", with WALK and DONT_WALK both on for 73 to 78 cycles (4.56 to 4.88 microseconds).
- Round 3, motor, Motor_Check: 7 HELD with 200 tries. The sketch `chatgpt-fast` BROKE on try 159 on a STOP rule after a 0.7 ms blip on STOP_BUTTON. No sketch turned FORWARD and REVERSE on together in any try of the campaign.
- Explanation, to confirm by reading the sketch and not by measuring: `chatgpt-fast` waits 10 ms per loop while a direction button is held.

#### Acceptance Criteria

1. WHEN the benchmark is re-run, THE benchmark tools SHALL compare every recorded result with the expected results above.
2. IF any recorded result differs from an expected result, THEN THE benchmark tools SHALL stop before writing the Results_README and SHALL show the sketch, the config, the expected result, the actual result, and the trace or output that shows the difference.
3. IF a check cannot run because `arduino-cli` is missing or a build fails, THEN THE benchmark tools SHALL stop before writing the Results_README and SHALL report the build output.
4. WHEN a stop happens, THE benchmark tools SHALL wait for the user's decision and SHALL NOT edit a test, an expected value, a config, or a rule to make the result match.
5. WHEN every recorded result matches the expected results, THE benchmark tools SHALL report that the results were confirmed and SHALL then write the Results_README.
6. WHEN the `chatgpt-fast` Round_3_Sketch is checked with the Motor_Check, THE benchmark tools SHALL compare the verdict, the try number (159), and the violated rule with the expected result, and SHALL measure the low time of STOP_BUTTON in the Reduced_Replay of that try to confirm the 0.7 ms blip.
7. WHEN the benchmark is re-run, THE benchmark tools SHALL read `exorcism-demo/benchmark/round3/chatgpt-fast.ino` to confirm the 10 ms wait per loop while a direction button is held, and SHALL record it as an explanation from reading the code.
8. THE benchmark tools SHALL treat a match as evidence for this seed and this gremlin set, and SHALL NOT describe a match as proof.

### Requirement 8: Results README

**User Story:** As a student or teacher, I want a plain README of the benchmark, so that I can see what each chat tool wrote and what the gremlins found.

#### Acceptance Criteria

1. THE Results_README SHALL be the file `exorcism-demo/benchmark/README.md`.
2. THE Results_README SHALL contain these two Briefs word for word, labeled round 2 (crossing) and round 3 (motor):
   - Round 2 (crossing): "Write a sketch for an ATmega328P board (Uno-compatible) for a pedestrian crossing. A REQUEST button is wired from pin 2 to GND (use the internal pull-up). Car lights: green on pin 8, yellow on pin 9, red on pin 10. Pedestrian lights: WALK on pin 11, DON'T WALK on pin 12. Cars have green until someone presses REQUEST. Then: yellow for 150 ms, all red for 50 ms, WALK for 200 ms, all red for 50 ms, then cars get green again. The button can be pressed at any time, including during a crossing. Don't use blocking delays. Keep it simple. Reply with the code only."
   - Round 3 (motor): "Write a sketch for an ATmega328P board (Uno-compatible) that drives a DC motor through two transistor switches. The FORWARD switch is on pin 8 and the REVERSE switch is on pin 9 (HIGH = on). Turning both on at the same time, even for a moment, shorts the supply. Three buttons are wired to GND (use the internal pull-ups): FORWARD on pin 2, REVERSE on pin 3, STOP on pin 4. Pressing FORWARD runs the motor forward, pressing REVERSE runs it in reverse (it can switch directly from one direction to the other), and STOP turns both switches off. Keep it simple. Reply with the code only."
3. THE Results_README SHALL list the commands that reproduce each results table, including the Try_Script command, the Overlap_Script command, the config file, the seed, the gremlin set, and the run count.
4. THE Results_README SHALL contain one results table per round and config, with one row per sketch and the columns sketch, verdict, exit code, try number, and a note.
5. THE Results_README SHALL give the Overlap_Result in cycles and microseconds for each crosswalk sketch that BROKE on the WALK and DONT_WALK rule.
6. THE Results_README SHALL print each HELD result with the exact HELD text and the real N.
7. THE Results_README SHALL describe a BROKE reduced list as "the smallest replay this reducer found".
8. THE Results_README SHALL include a plain explanation of what HELD, BROKE, and COULDN'T TELL mean, why a HELD result is not a proof, and why a 73 to 78 cycle overlap is brief but is still a violation of the rule.
9. THE Results_README SHALL state that tests are evidence, not proof, and SHALL describe the results as evidence from this seed and this gremlin set.
10. THE Results_README SHALL state that the Benchmark_Sketch files are the chat tools' unedited answers.
11. THE Results_README SHALL leave the Banned_Words out of its text.
12. THE Results_README SHALL use no third-party logo and no board brand name, and SHALL name the chip "ATmega328P".
13. THE Results_README SHALL state in one line that the Earlier_Sketches are kept from an earlier brief and are not part of the results tables.
14. WHERE the Results_README gives the 10 ms wait per loop of `chatgpt-fast`, THE Results_README SHALL label it "from reading the code" and SHALL NOT present it as a measured result.
15. WHERE the Results_README names a chat tool, THE Results_README SHALL describe the tool only as the tool and setting that wrote the sketch file, and SHALL make no claim about the tool beyond what the results show.
16. WHEN a result in the Results_README differs from an expected result in Requirement 7 and the user approved the difference, THE Results_README SHALL show the actual result.

### Requirement 9: Project constraints

**User Story:** As a maintainer, I want the new files to follow the project rules, so that the guard and the build keep passing.

#### Acceptance Criteria

1. THE benchmark tools SHALL be written in TypeScript, except the Try_Script, which is `.mjs` as the user named it.
2. THE benchmark tools SHALL leave `dependencies` and `devDependencies` in `package.json` unchanged.
3. THE benchmark tools SHALL read no clock for rule timing and SHALL use integer CPU cycles as the unit of simulated time.
4. THE benchmark tools SHALL call no Math.random.
5. THE benchmark tools SHALL contain no AI call and no network call in any checking step.
6. THE benchmark tools SHALL leave the Banned_Words out of every file they add, including comments, console output, and docs.
7. THE benchmark tools SHALL keep the Overlap_Script behind the existing EmulatorBridge interface, with no direct avr8js import outside it.
8. WHEN the guard script scans the files the benchmark tools add, THE guard script SHALL report zero findings.

### Requirement 10: Config and fixture format round trip

**User Story:** As a maintainer, I want the new JSON files to load the same way every time, so that a config cannot silently change a check.

#### Acceptance Criteria

1. THE Try_Script SHALL parse a Check_Config into an object that holds every key listed in the Glossary.
2. THE Try_Script SHALL pass the parsed `gremlins` string to the CLI unchanged.
3. FOR ALL valid Check_Config objects, serializing the object to JSON and parsing the result SHALL produce an equal object.
4. FOR ALL valid pin fixtures, loading the fixture through the CLI SHALL produce the same signal list as the signal list in the file.
5. IF a Check_Config key has the wrong type, THEN THE Try_Script SHALL print one line that names the key, run no build, and exit with code 3.
