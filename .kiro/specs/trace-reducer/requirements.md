# Requirements Document

## Introduction

The Trace_Reducer takes a BROKE trace (a HEX, a Fixture, a Rule_Set and the Run's ordered event list) and looks for a smaller event list that still breaks the same Rule. Every Candidate is checked by a Run on a fresh EmulatorBridge with the same HEX, the same Fixture and the Candidate's ordered events, with no snapshots, stopping at the earliest Violation. The result is described to users only as "the smallest replay this reducer found". The spec also adds two pure functions over a reduced trace: the Failure_Story (2 to 4 plain sentences) and the Trace_Fingerprint (FNV-1a 64-bit over the output edges).

All new engine code goes under `src/engine/reducer/`. All new tests go under `src/engine/__tests__/`. The browser Worker and the UI shrink animation are later consumers of the sliced API and progress reports defined here. This spec does not build them.

This spec is additive to the `emulator-bridge`, `input-pullup`, `gremlin-engine`, `rule-compiler`, `example-firmware`, `bridge-output-scan` and `held-text` specs and keeps their rules. The EmulatorBridge is the only module that imports avr8js. Replay is a fresh emulator plus the same HEX, Fixture and ordered event list. Simulated time is integer CPU cycles. Engine code uses no wall clock and no `Math.random`. The checker contains no AI and makes no network calls. Test evidence from this spec is evidence, not proof.

Facts from the current code that these requirements rely on. `design.md` quotes each one from the source and does not restate it from memory:

- F1. `runOne(cfg: RunConfig, runIndex: number)` in `src/engine/campaign.ts` builds its event list with `buildEventList` from `campaignSeed` and `runIndex`. It accepts no explicit event list. Its step loop calls `checkPlanInput` and `planTarget` (`src/engine/step-plan.ts`), `bridge.advance`, `mergeApplied` and `callChecker`, stops at the earliest Violation, and makes one end-of-run Checker call when no Violation was found. `callChecker` is not exported.
- F2. `compileRuleSet(ruleSet: unknown, fixture: Fixture): CompileResult` in `src/engine/rules/compile.ts` returns `{ ok: true, compiled: { checker, checkerSignals, findUntriggeredRules } }` or `{ ok: false, reasons }`. It rejects a Rule_Set in which two Rules have the same Canonical_Sentence (`findRepeatedSentences`), so a Canonical_Sentence names at most one Rule index.
- F3. `Violation` in `src/engine/checker.ts` is `{ rule: string; cycle: number }`. The Rule_Checker sets `rule` to the Canonical_Sentence of the violated Rule (`src/engine/rules/rule-checker.ts`, `rule: chosen.plan.sentence`). `render(rule)` in `src/engine/rules/render.ts` returns that Canonical_Sentence.
- F4. `GeneratedEvent` in `src/engine/gremlins/generate-types.ts` is `(InputEvent | AnalogInputEvent) & { gremlinId: string }`. A digital `InputEvent.value` is `0`, `1` or `"release"`. An `AnalogInputEvent.analog` is an integer ADC count from 0 to 1023.
- F5. `generateWithPrng` in `src/engine/event-list.ts` puts Rest_Events (`gremlinId` `"rest"`, cycle 0, the press value of the pin) ahead of gremlin events, and sorts the list by cycle with generation order breaking ties.
- F6. `EmulatorBridge._build` sets every analog channel to `restLevel ?? 512` before any event (`src/engine/emulator-bridge.ts`, near line 252). A digital input starts undriven.
- F7. `BrokeTrace` in `src/engine/types.ts` holds `runIndex`, `runSeed`, `eventList`, `outputEvents` and `violation`. `computeVerdict` puts the lowest violating Run in it.
- F8. `scripts/guard.mjs` fails (exit 2) when engine code outside `__tests__` contains `Date.now`, `performance.now`, `setTimeout`, `setInterval`, `Math.random`, `new Date(`, `fetch(`, `XMLHttpRequest`, `WebSocket`, a network module import, `crypto.getRandomValues`, `randomUUID` or `randomBytes`. The hook `.kiro/hooks/guard-before-task.json` runs the guard before every task.
- F9. `BANNED_WORDS` in `src/engine/copy-rules.ts` is the word list that user-visible text must not contain. This document does not write the words out.
- F10. `tests/examples/examples-support.ts` exports `loadExample`, `readHex`, `runExampleCampaign`, `scriptedRun`, `replayRun` and `violationSpan`. The Examples are `crosswalk`, `garage` and `heartbeat`, each with `buggy` and `fixed` builds and a committed `meta.json` (`gremlinSet`, `runCycles`, `campaignSeed`, `runs`).

## Glossary

- **Trace_Reducer**: The new engine code under `src/engine/reducer/`. It holds the Reducer_Core, the Emulator_Oracle, the Replay_Function, the Failure_Story function and the Trace_Fingerprint function.
- **Reducer_Core**: The pure part of the Trace_Reducer that searches over event lists using only an Oracle. It creates no EmulatorBridge and imports nothing from `emulator-bridge.ts`.
- **Oracle**: A function from an ordered event list to an Oracle_Outcome.
- **Oracle_Outcome**: Either `breaks` together with the Violation that the Run reported, or `does-not`.
- **Malformed_Outcome**: A value returned by an Oracle that is neither `does-not` nor `breaks` together with a Violation whose `rule` is a string and whose `cycle` is an integer from 0 to 2^53 − 1. A Promise or any other object with a `then` function is a Malformed_Outcome.
- **Synthetic_Oracle**: A test-only Oracle written as a plain function with no emulator.
- **Emulator_Oracle**: The Oracle that runs a Candidate on a fresh EmulatorBridge (Requirement 3).
- **Run_Path**: The existing step loop of `runOne` (fact F1): plan the Step, advance the bridge, merge applied inputs, call the Checker, stop at the earliest Violation, then make the end-of-run call when none was found.
- **Replay_Function**: The Trace_Reducer function that runs one event list through the Run_Path on a fresh EmulatorBridge and returns the Violation (or none) and the Output_Edges.
- **Reduction_Input**: The HEX text, the Fixture, the Rule_Set, the Original_List, the target Violation, Run_Cycles, Max_Step_Cycles and the Budget given to the Trace_Reducer.
- **Input_Check**: One of the checks of Requirement 1, criteria 3, 4 and 5, and of Requirement 3, criterion 2, that the Trace_Reducer applies to a Reduction_Input before it makes any Oracle call.
- **Original_List**: The ordered event list of the BROKE trace (`BrokeTrace.eventList`, fact F7).
- **Gremlin_Event**: An event of an event list whose `gremlinId` is not `"rest"`.
- **Rest_Event**: An event of an event list whose `gremlinId` is `"rest"`.
- **Candidate**: An event list that the Reducer_Core gives to the Oracle.
- **Source_Event**: For an event of a Candidate, the event of the Best_List (as held at the time of that Oracle call) from which the Candidate event was copied. For the Confirmation_Run, the Best_List is the Original_List.
- **Removal_Change**: A change to the Best_List that deletes one or more Gremlin_Events and changes no other event in any way.
- **Snap_Change**: A change to the Best_List that replaces the `analog` value of one or more analog Gremlin_Events, each with an `analog` value other than 0, 512 and 1023, with the Snap_Value of that value, and that removes no event and changes nothing else.
- **Best_List**: The event list that the Reducer_Core holds as its current result. At the start it is the Original_List.
- **Reduced_List**: The Best_List when the reduction ends.
- **Target_Rule**: The pair (Rule index in the Rule_Set, Canonical_Sentence) of the Rule named by the target Violation.
- **Same_Rule_Break**: An Oracle_Outcome of `breaks` whose Violation names the Target_Rule, meaning the Violation's `rule` equals the Canonical_Sentence of the Target_Rule and that sentence belongs to the Rule at the Target_Rule's index.
- **Canonical_Sentence**, **Rule**, **Rule_Set**, **Rule_Checker**, **Reason**: As defined in the `rule-compiler` spec.
- **Checker**, **Violation**, **Fixture**, **Run**, **Run_Cycles**, **Step**, **Gremlin**, **Gremlin_Set**, **Active_Level**, **Rest_Level**, **Campaign**, **Run_Result**: As defined in the `gremlin-engine` spec.
- **Max_Step_Cycles**: The largest Step in cycles. The Campaign default is 160,000 (`DEFAULT_MAX_STEP_CYCLES`).
- **Budget**: The largest number of Candidates the Trace_Reducer may give to the Oracle in one reduction. The default is 300.
- **Unlimited_Budget**: A Budget of 2^53 − 1.
- **Unlimited_Reduction**: The reduction of the same Reduction_Input with the same deterministic Oracle and the Unlimited_Budget.
- **Candidates_Tried**: The number of Oracle calls made so far in one reduction, including the Confirmation_Run.
- **Confirmation_Run**: The Oracle call on the Original_List, made before any other Candidate.
- **Pending_Candidate**: The Candidate that the Reducer_Core would give to the Oracle next, worked out from the Best_List and the current search position with no Oracle call. No Pending_Candidate exists when the next search step is the end of the reduction under Requirement 5, criterion 4.
- **ddmin**: The delta-debugging minimization algorithm of Zeller and Hildebrandt, run over the Gremlin_Events of the Best_List.
- **Presented_Value**: For one input signal at one position in an event list, the value of the latest earlier event of that signal in the list. Before any event of the signal it is `"release"` for a digital input (fact F6) and the Rest_Level (`restLevel`, default 512) for an analog input. Digital values `0`, `1` and `"release"` are three different values.
- **No_Change_Event**: A Gremlin_Event whose value (digital `value` or analog `analog`) equals the Presented_Value at its position.
- **Burst**: A maximal sequence of two or more Gremlin_Events of the Best_List that have the same `gremlinId` and the same `signal` and that follow each other with no event of that signal from another `gremlinId` between them.
- **Pass_B_Start_List**: The Best_List at the moment Pass_B starts in a Round.
- **Snap_Value**: For an analog value x, the nearest of 0, 512 and 1023 to x. For x = 256, which is equally near 0 and 512, the Snap_Value is 512.
- **Snap_Eligible_Event**: An analog Gremlin_Event of the Best_List whose `analog` value is not 0, 512 or 1023.
- **Snapped_Event**: An analog Gremlin_Event of a Candidate whose `analog` value the Reducer_Core replaced with its Snap_Value in Pass_C.
- **Pass_A**, **Pass_B**, **Pass_C**: The No_Change_Event pass (Requirement 6), the Burst pass (Requirement 7) and the snap pass (Requirement 8).
- **Round**: One ddmin followed by Pass_A, Pass_B and Pass_C, in that order.
- **Candidate_Part**: The part of the reduction that built a Candidate, written as one of the strings `confirm` (the Confirmation_Run), `ddmin`, `passA` (Pass_A), `passB` (Pass_B) and `passC` (Pass_C).
- **Accepted_Change**: A Candidate that gives a Same_Rule_Break and becomes the Best_List.
- **Reducer_Handle**: The object that holds one reduction's state and exposes `step(k)`.
- **Progress_Report**: The data given to the progress callback after each Oracle call that does not end in `oracle-error` (Requirement 10, criterion 5): Candidates_Tried, the Gremlin_Event count of the Best_List, a copy of the Best_List, the Candidate_Part of the Candidate just tested and a boolean that says whether that Candidate gave a Same_Rule_Break.
- **Step_Report**: The plain-data value that one `step(k)` call returns: a flag that is true when the reduction has ended and false otherwise, Candidates_Tried, the Gremlin_Event count of the Best_List and, when the flag is true, either the Reducer_Result or the Reducer_Error that ended the reduction.
- **Oracle_Call_Sequence**: The ordered list of Candidates that the Reducer_Core gives to the Oracle in one reduction, one entry per Oracle call.
- **Reducer_Result**: The output of a finished reduction (Requirement 11).
- **Reducer_Error**: A plain-data error value the Trace_Reducer returns in place of a result. It names a kind and a message.
- **Deep_Equal**: Two values are Deep_Equal when they are the same primitive value, or arrays of the same length whose elements are Deep_Equal in order, or plain objects with the same set of own keys whose values are Deep_Equal key by key (key order is not compared).
- **Same_Answer_Oracles**: Two Oracles that, at each Candidate number n (1-based count of Oracle calls in one reduction), either both return Deep_Equal Oracle_Outcomes or both throw.
- **Output_Edge**: An `OutputEvent` (`signal`, `value` 0, 1 or `"input"`, `cycle`) reported by the EmulatorBridge, including the cycle-0 snapshot.
- **Violation_Span**: An optional input to the Failure_Story: a length in cycles and a flag that says whether the span was cut by the end of the replay.
- **Ms_Text**: The millisecond text of a cycle count c ≥ 0: let t = floor((c + 800) / 1600), computed in integer arithmetic; Ms_Text is floor(t / 10), a period, t mod 10, a space and `ms`, with no digit-group separator (for example 24,000 cycles give `1.5 ms` and 0 cycles give `0.0 ms`).
- **Failure_Story**: The pure function of Requirement 13 and the text it returns.
- **Story_Sentence**: A part of the Failure_Story that ends with a period followed by one space, or with the final period of the text. A period inside the Canonical_Sentence (other than its last character), inside a `gremlinId` text, inside a signal name, or inside an Ms_Text does not end a Story_Sentence.
- **Story_Word**: A maximal run of characters other than the space character within a Story_Sentence. An Ms_Text such as `1.5 ms` counts as 2 Story_Words.
- **Story_Number**: A maximal run of ASCII digits in the Failure_Story, together with a following period and digit when there is one (as in `1.5`).
- **Detailed_Form**: The Failure_Story wording that describes each Gremlin_Event of the Reduced_List, in Reduced_List order, with its `gremlinId`, its action (Requirement 13, criteria 4 to 7), its signal name and the Ms_Text of its `cycle`, in the wording that `design.md` fixes.
- **Summary_Form**: The Failure_Story wording that gives, for each (`gremlinId`, `signal`) pair of the Gremlin_Events of the Reduced_List, in the order of the pair's earliest event in the Reduced_List, the `gremlinId`, the signal name, the count of that pair's events, and the Ms_Text of that pair's earliest and latest event cycles.
- **Trace_Fingerprint**: The pure function of Requirement 14 and the 16-character hex text it returns. It is a fingerprint for telling traces apart, not a security measure.
- **Edge_Line**: For one Output_Edge, the text `JSON.stringify([cycle, signal, value])` built from that edge's `cycle`, `signal` and `value`, followed by one line-feed character (U+000A, byte 0x0A). For example, the edge (`cycle` 0, `signal` `"LED"`, `value` `"input"`) gives `[0,"LED","input"]` and a line feed, and the edge (`cycle` 24000, `signal` `"LED"`, `value` 1) gives `[24000,"LED",1]` and a line feed.
- **Fingerprint_Bytes**: The UTF-8 bytes of all Edge_Lines of an ordered list of Output_Edges, joined in list order with nothing between them. An empty list gives zero bytes.
- **BANNED_WORDS**: The exported list in `src/engine/copy-rules.ts` (fact F9). A text contains an entry when the entry appears as a whole word, ignoring letter case, as the copy test matches.
- **Example**: One of `crosswalk`, `garage` and `heartbeat` under `examples/` (fact F10).
- **Example_Trace**: The BROKE trace of an Example's buggy build from `runExampleCampaign` with the committed `meta.json` values.
- **Pure_Property**: A property test that calls only the Reducer_Core with Synthetic_Oracles, the Failure_Story function or the Trace_Fingerprint function, and creates no EmulatorBridge.
- **Emulator_Property**: A property test that calls the Emulator_Oracle or the Replay_Function.
- **Branch_Counter**: An integer variable in a property test file. It is 0 before the `fc.assert` call, and the test adds 1 to it each time a generated case reaches the one branch it names.
- **Oracle_Log**: The ordered list of deep copies of the Candidates that one reduction gave to its Oracle, one entry per Oracle call. The test records it inside the Oracle it passes in.
- **Pinned_Literal**: One of `originalEventCount`, `reducedEventCount`, `candidatesTried` or the Trace_Fingerprint of one Example, written into the acceptance test as a literal copied from the test's printed output.
- **First_Green_Run**: The first run of the acceptance test file in which the test cases of all three Examples pass Requirement 16, criteria 1 to 5, 8 and 9.
- **Reduction_Wall_Time**: The wall time of one complete reduction of one Example, measured in the Temporary_Script, from just before the call that creates the Reducer_Handle until `step` reports that the reduction has ended. It includes every Candidate's Emulator_Oracle run and the Rule_Set compile done inside the Trace_Reducer. It excludes the `runExampleCampaign` call, file loading, and the Replay_Function, Failure_Story and Trace_Fingerprint calls.
- **Per_Candidate_Time**: The median of an Example's 3 Reduction_Wall_Times divided by that Example's `candidatesTried`.
- **Method_Text**: Plain sentences in the "Reducer speed" section that say what span was timed, the number of repeats, that the median is reported, the slice size passed to `step`, and that the timing ran in a deleted Temporary_Script under `npx tsx`.
- **Done_Checks**: The four commands `npx vitest --run`, `npm run typecheck`, `npm run guard` (the `package.json` script that runs `node scripts/guard.mjs`) and `npm run build`, each run once from the workspace root with no extra arguments, file filters, `-t` name filters or `--exclude` options.
- **Final_Tree**: The working tree after the agent's last file change of the task and after every Temporary_Script has been deleted.
- **Clean_Result**: The outcome of a Done_Check that exits with code 0, where in addition `npx vitest --run` reports 0 failed tests and 0 failed test files and skips no test except a test that a committed file itself marks skip or todo, and `npm run guard` prints the line `guard: clean`.
- **Committed_Test_File**: A committed file under `src/engine/__tests__/` (outside `src/engine/__tests__/baselines/`) or under `tests/`, including helper files that hold no test.
- **Baseline_File**: A committed file under `src/engine/__tests__/baselines/`.
- **Fixture_File**: A committed file under `fixtures/`, or any committed file named `fixture.json`.
- **Reference_Run**: The exit codes and failing test names of `npx vitest --run` and `node scripts/guard.mjs`, recorded before the agent's first file change in this spec.
- **agent**: The AI coding assistant that carries out the tasks of this spec.
- **committed file**: A file that `git ls-files` lists at the start of a task.
- **Temporary_Script**: A script at `scripts/tmp-*.ts` that the agent deletes before reporting the task done.

## Requirements

### Requirement 1: Reduction input and Target_Rule

**User Story:** As a maker, I want to hand the reducer the BROKE trace I already have, so that it shrinks the exact failure I saw.

#### Acceptance Criteria

1. THE Trace_Reducer SHALL accept a Reduction_Input made of eight fields: the HEX text, the Fixture, the Rule_Set, the Original_List, the target Violation, Run_Cycles, Max_Step_Cycles (default 160,000) and the Budget (default 300).
2. WHEN a Reduction_Input passes every Input_Check of criteria 4 and 5 and of Requirement 3, criterion 2, THE Trace_Reducer SHALL set the Target_Rule to the pair (i, s), where i is the 0-based index in the Rule_Set of the one Rule whose Canonical_Sentence (from `render`) equals the target Violation's `rule`, and s is that Canonical_Sentence.
3. IF no Rule in the Rule_Set has a Canonical_Sentence equal to the target Violation's `rule`, THEN THE Trace_Reducer SHALL return a Reducer_Error of kind `invalid-input` that says the Violation names no Rule of the Rule_Set, SHALL return no Reducer_Handle, and SHALL make no Oracle call.
4. IF the HEX text is not a string, or the Fixture is not an object with an array of pins, or the Original_List is not an array, or the target Violation is not an object with a string `rule` and a `cycle` that is an integer of at least 0, or Run_Cycles is not an integer from 1 to 2^32, or a given Max_Step_Cycles is not an integer from 1 to 2^53 − 1, or a given Budget is not an integer from 1 to 2^53 − 1, THEN THE Trace_Reducer SHALL return a Reducer_Error of kind `invalid-input` that names the failing field, SHALL return no Reducer_Handle, and SHALL make no Oracle call.
5. IF the event at 0-based index j of the Original_List is not an object, or has a `cycle` that is not an integer from 0 to Run_Cycles − 1, or has a `cycle` lower than the `cycle` of the event at index j − 1, or has a `gremlinId` that is not a string, or has a `signal` that names no input pin of the Fixture, or holds both or neither of a digital `value` and an `analog` value, or is a digital event whose `value` is not `0`, `1` or `"release"` or whose pin is analog, or is an analog event whose `analog` is not an integer from 0 to 1023 or whose pin is digital, THEN THE Trace_Reducer SHALL return a Reducer_Error of kind `invalid-input` that names the lowest such index j, SHALL return no Reducer_Handle, and SHALL make no Oracle call.
6. WHEN the Trace_Reducer accepts a Reduction_Input, THE Trace_Reducer SHALL take private copies of all eight fields, including every event of the Original_List, before it returns, so that later changes by the caller to the passed objects leave every later Candidate, Oracle call, Progress_Report, Reducer_Error and Reducer_Result unchanged, and SHALL change none of the passed objects.
7. THE Trace_Reducer SHALL return a Reducer_Error in place of throwing for every value passed as the Reduction_Input or as any of its fields, including `undefined`, `null`, a Reduction_Input that is not an object, `NaN`, `Infinity`, and a field whose read throws, which gives a Reducer_Error of kind `invalid-input` that names that field.
8. WHEN a Reduction_Input omits Max_Step_Cycles or the Budget, or gives either as `undefined`, THE Trace_Reducer SHALL use 160,000 for a missing Max_Step_Cycles and 300 for a missing Budget, and SHALL check every other value, including `null`, under criterion 4.
9. IF a Reduction_Input fails more than one Input_Check, THEN THE Trace_Reducer SHALL return only the Reducer_Error of the first failing Input_Check in this order: the Reduction_Input is an object; the field checks of criterion 4, in the field order HEX text, Fixture, Rule_Set, Original_List, target Violation, Run_Cycles, Max_Step_Cycles, Budget; the compile check of Requirement 3, criterion 2; the event checks of criterion 5; the Target_Rule check of criterion 3.
10. WHEN a Reduction_Input passes every Input_Check, THE Trace_Reducer SHALL return a Reducer_Handle and SHALL make no Oracle call before the first `step` call.

### Requirement 2: Reducer_Core over an Oracle

**User Story:** As a developer, I want the search logic separate from the emulator, so that I can test it with fast synthetic oracles.

#### Acceptance Criteria

1. THE Reducer_Core SHALL take the Original_List, the Fixture, the Target_Rule's Canonical_Sentence, the Budget and an Oracle as its only inputs, SHALL decide whether a Candidate is a Same_Rule_Break only from the value returned by one Oracle call on that Candidate, and SHALL make exactly one Oracle call for every Candidate it tests, including a Candidate equal to one it tested earlier.
2. THE Reducer_Core SHALL have no runtime import of `src/engine/emulator-bridge.ts` or of avr8js, either directly or through any module it imports (type-only imports excepted), and SHALL create no EmulatorBridge.
3. WHEN the Oracle returns `breaks` with a Violation whose `rule` is the same string as the Target_Rule's Canonical_Sentence (same characters in the same order, with no change of letter case and no trimming), THE Reducer_Core SHALL treat the Candidate as a Same_Rule_Break and SHALL keep its own copy of that Violation, so that later changes to the returned object leave the recorded Violation unchanged.
4. WHEN the Oracle returns `does-not`, or returns `breaks` with a Violation that is not a Malformed_Outcome and whose `rule` differs from the Target_Rule's Canonical_Sentence, THE Reducer_Core SHALL treat the Candidate as not breaking the Target_Rule, SHALL keep the Best_List unchanged, and SHALL count the call in Candidates_Tried.
5. IF the Oracle throws or returns a Malformed_Outcome, including on the Confirmation_Run, THEN THE Reducer_Core SHALL stop the reduction, SHALL return a Reducer_Error of kind `oracle-error` that names the Candidate number (the value of Candidates_Tried counting the failing call, starting at 1) and says whether the Oracle threw or returned a Malformed_Outcome, SHALL make no further Oracle call, and SHALL leave the Best_List as it was before the failing call.
6. WHEN the Reducer_Core calls the Oracle, THE Reducer_Core SHALL pass a deep copy of the Candidate that shares no object or array with the Best_List, the Original_List or any earlier Candidate, so that changes the Oracle makes to its argument, during or after the call, leave the Best_List, the Reduced_List and every later Candidate unchanged.
7. THE Reducer_Core SHALL complete a reduction in a test that gives it only a Synthetic_Oracle, an Original_List, a Fixture, a Canonical_Sentence and a Budget, with no HEX text, no Rule_Set and no EmulatorBridge created during the test.
8. IF the Oracle is not a function, the Canonical_Sentence is not a non-empty string, the Budget is not an integer from 1 to 2^53 − 1, the Original_List is not an array, or an event of the Original_List has a cycle that is not an integer of at least 0, a cycle lower than the event before it, or no string `gremlinId`, THEN THE Reducer_Core SHALL return a Reducer_Error of kind `invalid-input` that names the field or the event's index, and SHALL make no Oracle call.

### Requirement 3: Emulator_Oracle and Replay_Function

**User Story:** As a student, I want every shrunk candidate checked on a fresh emulated chip, so that the shrunk trace is a real replay and not a guess.

#### Acceptance Criteria

1. THE Emulator_Oracle SHALL build the Checker for each Candidate by calling `compileRuleSet` with the Rule_Set and the Fixture (fact F2) and taking `compiled.checker`, and THE Trace_Reducer SHALL contain no other rule compiler, no other Checker and no other Rule evaluation code.
2. IF `compileRuleSet` returns `ok: false` for the Rule_Set and Fixture of a Reduction_Input, THEN THE Trace_Reducer SHALL return a Reducer_Error of kind `invalid-input` that holds every string of the compiler's `reasons` in their original order, SHALL make no Oracle call, and SHALL create no EmulatorBridge.
3. WHEN the Emulator_Oracle is given a Candidate, THE Emulator_Oracle SHALL create one new EmulatorBridge from the same HEX text, the same Fixture and a copy of the Candidate's events in list order, and SHALL carry no snapshot, no EmulatorBridge, no Checker and no Run state from an earlier Candidate.
4. THE Emulator_Oracle and the Replay_Function SHALL run every event list through the existing Run_Path code of `src/engine/campaign.ts` (fact F1), with the given event list in place of the `buildEventList` result, with the Run_Cycles and Max_Step_Cycles of the Reduction_Input, and SHALL hold no second copy of the Step loop, the end-of-run Checker call or the Checker-outcome validation.
5. WHERE the design moves the Run_Path out of `runOne` into an exported function, THE Trace_Reducer SHALL keep `runOne` calling that function, so that for every `RunConfig` and Run_Index the Run_Result (every field: `runIndex`, `runSeed`, `eventList`, `skipped`, `appliedInputs`, `outputEvents`, `diagnostics`, `cannotCheck`, `violation`, `endCycle`) or the returned error stays deep-equal to the value before the move, and every committed test passes unchanged.
6. WHEN the Checker reports a Violation during the Run of a Candidate, THE Emulator_Oracle SHALL end that Run after the Step in which the Violation was reported, with no further `bridge.advance` call and no end-of-run Checker call, as the Run_Path does.
7. WHEN the Run of a Candidate reports a Violation, from a Step Checker call or from the end-of-run Checker call, whose `rule` equals the Target_Rule's Canonical_Sentence and that sentence is the Canonical_Sentence of the Rule at the Target_Rule's index, THE Emulator_Oracle SHALL return `breaks` with a Violation whose `rule` and `cycle` equal the reported ones.
8. WHEN the Run of a Candidate reports a Violation whose `rule` differs from the Target_Rule's Canonical_Sentence, or reports no Violation by the end of Run_Cycles and the end-of-run Checker call, THE Emulator_Oracle SHALL return `does-not`.
9. IF EmulatorBridge creation, a Step, or the Run_Path returns an error (kind `bridge-error`, `internal-error` or `checker-error`) for a Candidate, THEN THE Emulator_Oracle SHALL report the error so that the Reducer_Core stops with a Reducer_Error of kind `oracle-error` that holds the error's kind, the error's message and the Candidate number, and makes no further Oracle call.
10. WHEN the Replay_Function is given the HEX text, the Fixture, the Rule_Set, an event list, Run_Cycles and Max_Step_Cycles, THE Replay_Function SHALL run that list once on a new EmulatorBridge through the Run_Path and return plain JSON data holding the Run's Violation (`rule` and `cycle`, for any Rule of the Rule_Set) or `null`, and every Output_Edge the EmulatorBridge reported in that Run in reported order, from the cycle-0 snapshot through the last Step run, including Output_Edges of that Step whose cycle is above the Violation cycle.
11. IF the Replay_Function is given a Run_Cycles that is not an integer from 1 to 2^32, a Max_Step_Cycles that is not an integer of at least 1, or an event list that fails the checks of Requirement 1, criterion 5, THEN THE Replay_Function SHALL return a Reducer_Error of kind `invalid-input` that names the field or the event index, and SHALL create no EmulatorBridge.
12. IF `compileRuleSet` returns `ok: false` for the Replay_Function's Rule_Set and Fixture, or EmulatorBridge creation, a Step or the Run_Path returns an error during the replay, THEN THE Replay_Function SHALL return, in place of throwing, a Reducer_Error of kind `invalid-input` holding the compiler's `reasons` in the first case and of kind `replay-error` holding the error's kind and message in the other cases, and SHALL return no Output_Edges.
13. WHEN the Emulator_Oracle is given two Candidates with deep-equal events in the same reduction, THE Emulator_Oracle SHALL return deep-equal Oracle_Outcomes for both, whatever Candidates it was given between them.

### Requirement 4: What a Candidate may change

**User Story:** As a teacher, I want the shrunk trace to be a cut-down copy of the real one, so that every remaining event happened in the original run.

#### Acceptance Criteria

1. THE Reducer_Core SHALL give the Oracle, as the Confirmation_Run, a Candidate deep-equal to the Original_List, and SHALL build every later Candidate from the Best_List held at the time of that Oracle call by exactly one Removal_Change or exactly one Snap_Change, and by no other change.
2. THE Reducer_Core SHALL keep every Rest_Event of the Original_List in every Candidate and in the Reduced_List with the same `cycle`, `signal`, `gremlinId` and `value` as in the Original_List and in the same order relative to every other event that stays, so that the number of Rest_Events in every Candidate and in the Reduced_List equals the number of Rest_Events in the Original_List.
3. THE Reducer_Core SHALL give every event of every Candidate the same `cycle`, `signal` and `gremlinId` as its Source_Event, the same kind (digital with `value`, or analog with `analog`) as its Source_Event, the same digital `value` when the Source_Event is digital, the same `analog` value when the Source_Event is analog and the Candidate's Snap_Change does not change it, and no property that its Source_Event lacks, and SHALL keep the events of every Candidate in the same relative order as their Source_Events in the Best_List.
4. THE Reducer_Core SHALL add no event to a Candidate, so that every event of a Candidate has a Source_Event, no two events of one Candidate have the same Source_Event, and every Candidate holds at most as many events as the Best_List it was built from.
5. WHEN ddmin, Pass_A or Pass_B builds a Candidate, THE Reducer_Core SHALL build that Candidate by a Removal_Change, so that the Candidate holds fewer Gremlin_Events than the Best_List and every analog event in it keeps the `analog` value of its Source_Event.
6. WHEN Pass_C builds a Candidate, THE Reducer_Core SHALL build that Candidate by a Snap_Change, so that the Candidate holds the same number of events as the Best_List and differs from it only in the `analog` value of one or more analog Gremlin_Events.

### Requirement 5: Search order and Rounds

**User Story:** As a maker, I want the reducer to strip the trace down with a known method, so that the result is repeatable and explainable.

#### Acceptance Criteria

1. WHEN a reduction starts with a valid Reduction_Input, THE Reducer_Core SHALL make the Confirmation_Run on the Original_List as Oracle call number 1, before any other Candidate.
2. IF the Confirmation_Run does not give a Same_Rule_Break (the Oracle returns `does-not`, or returns `breaks` with a Violation of a Rule other than the Target_Rule), THEN THE Reducer_Core SHALL stop, make no further Oracle call, and return a Reducer_Error of kind `original-does-not-break` with Candidates_Tried 1 and no Reduced_List.
3. WHEN the Confirmation_Run gives a Same_Rule_Break, THE Reducer_Core SHALL run Rounds, each made of ddmin over the Gremlin_Events of the Best_List, then Pass_A, then Pass_B, then Pass_C, where each part starts from the Best_List as the previous part left it.
4. WHEN a Round ends with no Accepted_Change in its ddmin, Pass_A, Pass_B or Pass_C, THE Reducer_Core SHALL end the reduction and return the Best_List as the Reduced_List with `stoppedAtBudget` false; a Round that is cut short by the Budget (Requirement 9) or by a Reducer_Error (Requirement 2, criterion 5) ends the reduction as those requirements state.
5. WHEN a Round has at least one Accepted_Change in any of its four parts, including a Pass_C Candidate that replaces analog values and removes no event, THE Reducer_Core SHALL start another Round from the new Best_List.
6. WHEN a Candidate gives a Same_Rule_Break, THE Reducer_Core SHALL make a copy of that Candidate the Best_List and record a copy of the Violation that the Oracle returned for that Candidate as the Violation of the Best_List.
7. WHEN a Candidate does not give a Same_Rule_Break, THE Reducer_Core SHALL keep the Best_List and its recorded Violation unchanged.
8. WHEN the ddmin of a Round runs on a Best_List with exactly one Gremlin_Event, THE Reducer_Core SHALL test the Candidate that holds every Rest_Event and no Gremlin_Event, so that a lone Gremlin_Event is also tested for removal; WHEN the ddmin of a Round runs on a Best_List with zero Gremlin_Events, THE Reducer_Core SHALL make no Oracle call in that ddmin.
9. WHEN the reduction ends without reaching the Budget and without a Reducer_Error, and the Oracle returns the same Oracle_Outcome for equal Candidates, THE Reducer_Core SHALL return a Reduced_List from which removing any one Gremlin_Event gives a list that the Oracle does not report as a Same_Rule_Break (1-minimal).
10. THE Reducer_Core SHALL make the same sequence of Oracle calls, with deep-equal Candidates in the same order, for deep-equal Reduction_Inputs and the same Oracle answers.
11. WHEN the Original_List holds no Gremlin_Event and the Confirmation_Run gives a Same_Rule_Break, THE Reducer_Core SHALL make no Oracle call after the Confirmation_Run and SHALL return the Original_List as the Reduced_List with Candidates_Tried 1 and `stoppedAtBudget` false.
12. WHEN the ddmin of a Round runs, THE Reducer_Core SHALL end that ddmin only after the Best_List holds zero Gremlin_Events, or after it has tested on the ddmin's final Best_List every Candidate that removes exactly one Gremlin_Event and none of them gave a Same_Rule_Break, or after Candidates_Tried reaches the Budget.
13. WHILE the Reducer_Core runs Rounds, THE Reducer_Core SHALL give the Oracle no Candidate that is deep-equal to the Best_List at the time of that Oracle call.

### Requirement 6: Pass_A, No_Change_Events

**User Story:** As a student, I want events that changed nothing on the pin removed, so that the trace shows only inputs that mattered.

#### Acceptance Criteria

1. WHEN Pass_A starts, THE Reducer_Core SHALL compute the Presented_Value at each Gremlin_Event of the Best_List as the value of the event of the same `signal` at the highest list index lower than that Gremlin_Event's index, counting Rest_Events and Gremlin_Events, or, when no such event exists, as `"release"` for a digital input pin of the Fixture and as the pin's `restLevel` (512 when absent) for an analog pin of the Fixture.
2. WHEN Pass_A starts and the Best_List holds at least one No_Change_Event, THE Reducer_Core SHALL first test exactly one Candidate that removes every No_Change_Event of the Best_List and keeps every other event in its list order with its `cycle`, `signal`, `gremlinId` and value unchanged.
3. WHEN Pass_A starts and the Best_List holds no No_Change_Event, THE Reducer_Core SHALL make no Oracle call in Pass_A, SHALL leave the Best_List unchanged and SHALL count Pass_A as having no Accepted_Change.
4. THE Reducer_Core SHALL count a Gremlin_Event as a No_Change_Event only when it is a digital event whose `value` is strictly equal to the Presented_Value (so `0`, `1` and `"release"` never equal each other), or an analog event whose `analog` integer equals the Presented_Value, and SHALL never count a Rest_Event as a No_Change_Event.
5. IF the Candidate of criterion 2 does not give a Same_Rule_Break and the Best_List held 2 or more No_Change_Events when Pass_A started, THEN THE Reducer_Core SHALL test, for each of those No_Change_Events in increasing list index order, one Candidate that removes exactly that event from the current Best_List, making each accepted Candidate the Best_List before the next Candidate, until all of them are tested or Candidates_Tried equals the Budget (Requirement 9).
6. IF a Gremlin_Event of the Original_List has a `signal` that names no input pin of the Fixture, or is an analog event on a digital pin, or is a digital event on an analog pin, THEN THE Reducer_Core SHALL return a Reducer_Error of kind `invalid-input` that names the event's index, and SHALL make no Oracle call, including no Confirmation_Run.

### Requirement 7: Pass_B, Bursts

**User Story:** As a maker, I want a burst of flips shrunk to fewer flips, so that I can see how few presses the bug needs.

#### Acceptance Criteria

1. WHEN Pass_B builds a Candidate, THE Reducer_Core SHALL find every Burst of the Best_List at that moment. A Burst holds two or more Gremlin_Events with the same `gremlinId` and the same `signal` that come one after another among that `signal`'s events, in list order. Events of other signals between them do not split a Burst. Any event of that `signal` with a different `gremlinId`, including a Rest_Event, splits it. The last event of a Burst is its event with the highest list index.
2. WHEN Pass_B builds a Candidate from a Best_List that holds a Burst of n events (n ≥ 2), THE Reducer_Core SHALL make that Candidate remove from 1 to n − 1 events of exactly one Burst and keep that Burst's last event. THE Reducer_Core SHALL keep every event outside that Burst, including every Rest_Event, at its position and with its `cycle`, `signal`, `gremlinId` and value unchanged.
3. IF the Pass_B_Start_List holds no Burst, THEN THE Reducer_Core SHALL make no Oracle call in Pass_B.
4. WHEN Pass_B ends with Candidates_Tried below the Budget, THE Reducer_Core SHALL have tested in that Pass_B at least one Candidate for each Burst of the Pass_B_Start_List.

### Requirement 8: Pass_C, analog snapping

**User Story:** As a teacher, I want odd analog readings rounded to plain values, so that the story says "set to 0" or "set to 1023" when that is enough.

#### Acceptance Criteria

1. WHEN Pass_C builds a Candidate, THE Reducer_Core SHALL build it from the Best_List held at that moment by replacing the `analog` value of one or more Snap_Eligible_Events with their Snap_Values, and SHALL change no other field of any event, remove no event, add no event and change no event order.
2. THE Reducer_Core SHALL change in Pass_C only Snap_Eligible_Events, and SHALL leave every Rest_Event, every digital event and every analog Gremlin_Event whose `analog` value is 0, 512 or 1023 identical to its entry in the Best_List.
3. WHEN Pass_C starts and the Best_List holds no Snap_Eligible_Event, THE Reducer_Core SHALL make no Oracle call in Pass_C.
4. THE Reducer_Core SHALL compute each Snap_Value as the Glossary defines it, so that `analog` values 1 to 255 snap to 0, 256 to 767 snap to 512, and 768 to 1022 snap to 1023.
5. WHEN Pass_C ends with Candidates_Tried below the Budget, THE Reducer_Core SHALL have given the Oracle, in that Pass_C, for each Snap_Eligible_Event of the Best_List at the start of Pass_C, at least one Candidate in which that event is a Snapped_Event.
6. WHEN a Pass_C Candidate gives a Same_Rule_Break, THE Reducer_Core SHALL keep each Snapped_Event of that Candidate at its Snap_Value in every later Candidate and in the Reduced_List, unless a later Candidate removes the event.

### Requirement 9: Budget

**User Story:** As a maker on a slow laptop, I want the reducer to stop after a fixed number of tries, so that it never runs for an unbounded time.

#### Acceptance Criteria

1. WHEN a Reduction_Input has no Budget field or has a Budget of `undefined`, THE Trace_Reducer SHALL use a Budget of 300, so that the reduction makes at most 300 Oracle calls, the Confirmation_Run included.
2. THE Reducer_Core SHALL start Candidates_Tried at 0 and SHALL add exactly 1 to it for each Oracle call: the Confirmation_Run, every Candidate of ddmin, Pass_A, Pass_B and Pass_C, and every Oracle call that throws or returns a value that is not an Oracle_Outcome.
3. WHILE Candidates_Tried equals the Budget, THE Reducer_Core SHALL make no further Oracle call, in the current `step(k)` call or in any later `step(k)` call.
4. WHEN an Oracle call makes Candidates_Tried equal to the Budget, that call leads to no Reducer_Error and a Pending_Candidate exists, THE Reducer_Core SHALL end the reduction without calling the Oracle on the Pending_Candidate and SHALL return a Reducer_Result with `stoppedAtBudget` true, `candidatesTried` equal to the Budget, the Best_List as the Reduced_List and the Violation recorded for that Best_List (Requirement 5, criterion 6).
5. WHEN the reduction ends under Requirement 5, criterion 4 (a Round with no Accepted_Change), THE Reducer_Core SHALL return a Reducer_Result with `stoppedAtBudget` false, also when Candidates_Tried equals the Budget.
6. FOR ALL Reduction_Inputs and deterministic Oracles whose Unlimited_Reduction ends with a Reducer_Result after T Oracle calls, a reduction with Budget B from 1 to T − 1 SHALL make the same first B Oracle calls with the same Candidates in the same order as the Unlimited_Reduction, give the same first B Progress_Reports, and return `candidatesTried` B, `stoppedAtBudget` true, and the Best_List and its Violation that the Unlimited_Reduction held after B Oracle calls; a reduction with Budget B ≥ T SHALL return a Reducer_Result deep-equal to that of the Unlimited_Reduction, with `stoppedAtBudget` false. FOR ALL Reduction_Inputs and deterministic Oracles whose Unlimited_Reduction ends with a Reducer_Error after Oracle call E, a reduction with Budget B ≥ E SHALL return the same Reducer_Error, and a reduction with Budget B < E SHALL return a Reducer_Result with `candidatesTried` B and `stoppedAtBudget` true.
7. IF the Oracle call that makes Candidates_Tried equal to the Budget leads to a Reducer_Error of kind `original-does-not-break`, `oracle-error` or `callback-error`, THEN THE Reducer_Core SHALL return that Reducer_Error and SHALL return no Reducer_Result and no `stoppedAtBudget` value.
8. WHILE one reduction runs over several `step(k)` calls of one Reducer_Handle, THE Reducer_Core SHALL count Candidates_Tried across all of those calls against the one Budget, so that a `step(k)` call with k greater than Budget − Candidates_Tried makes at most Budget − Candidates_Tried Oracle calls.
9. THE Trace_Reducer SHALL return every Reducer_Result with `candidatesTried` from 1 to the Budget.

### Requirement 10: Slicing and progress

**User Story:** As the browser Worker, I want to run the reduction a few candidates at a time and show each new best list, so that the page stays responsive and the shrink can be animated.

#### Acceptance Criteria

1. WHEN the Trace_Reducer is given a Reduction_Input that Requirement 1 and Requirement 3, criterion 2 accept, THE Trace_Reducer SHALL return a Reducer_Handle and SHALL make no Oracle call before the first `step` call, so that the Confirmation_Run is the first Oracle call of the first `step` call; for any other Reduction_Input it SHALL return the Reducer_Error of those criteria in place of a Reducer_Handle.
2. WHEN `step(k)` is called with a valid k on a reduction that has not ended, THE Reducer_Handle SHALL make at most k Oracle calls, SHALL make fewer than k Oracle calls only when the reduction ends (with a Reducer_Result or a Reducer_Error) during that call, and SHALL then return.
3. WHEN `step(k)` returns for a valid k, THE Reducer_Handle SHALL return a Step_Report whose Candidates_Tried and Gremlin_Event count are those of the reduction state after the last Oracle call of that `step` call, and whose ended flag is true exactly when the reduction has ended.
4. FOR ALL Reduction_Inputs, Oracles and finite sequences of slice sizes, each an integer from 1 to 2^53 − 1, calling `step` with those sizes in order until the Step_Report's ended flag is true SHALL give the same Oracle_Call_Sequence (deep-equal Candidates in the same order), the same ordered list of Progress_Reports (deep-equal) and a deep-equal Reducer_Result or Reducer_Error as one call `step(Budget)` on a fresh Reducer_Handle for the same Reduction_Input and the same Oracle answers (slicing invariance).
5. WHEN an Oracle call returns an Oracle_Outcome that the Reducer_Core does not turn into a Reducer_Error of kind `oracle-error` (the Confirmation_Run included) and a progress callback was given, THE Reducer_Handle SHALL call the progress callback exactly once, after it has applied that outcome to the Best_List and before the next Oracle call, with a Progress_Report holding Candidates_Tried (counting that call), the Gremlin_Event count of the Best_List, a copy of the Best_List whose later change by the callback leaves the Best_List unchanged, the Candidate_Part (`confirm`, `ddmin`, `passA`, `passB` or `passC`) of the Candidate just tested, and a boolean that is true exactly when that Candidate gave a Same_Rule_Break.
6. IF an Oracle call ends the reduction with a Reducer_Error of kind `oracle-error`, THEN THE Reducer_Handle SHALL make no progress callback call for that Oracle call.
7. IF `step` is given a k that is not an integer from 1 to 2^53 − 1 (including a non-number, `NaN`, an infinity, 0, a negative number and a fraction), THEN THE Reducer_Handle SHALL return a Reducer_Error of kind `invalid-input` that names k, make no Oracle call and no progress callback call, and leave the reduction state unchanged, so that a later `step` call with a valid k continues the reduction as if the invalid call had not been made.
8. WHEN `step` is called after the reduction has ended with a Reducer_Result, THE Reducer_Handle SHALL make no Oracle call and no progress callback call, and SHALL return a Step_Report whose Reducer_Result is deep-equal to the first one returned, also when the caller has changed an earlier returned Reducer_Result.
9. IF the progress callback throws, THEN THE Reducer_Handle SHALL stop the reduction with no further Oracle call and return a Reducer_Error of kind `callback-error` that names the Candidate number (1-based count of Oracle calls) of the Oracle call whose Progress_Report was being delivered, with Candidates_Tried counting that Oracle call.
10. WHEN a reduction has stopped with a Reducer_Error of any kind, THE Reducer_Handle SHALL return a deep-equal Reducer_Error for every later `step` call, with no Oracle call and no progress callback call.
11. THE Trace_Reducer SHALL measure progress only in Candidates_Tried and CPU cycles, and SHALL read no wall clock.

### Requirement 11: Reducer_Result

**User Story:** As a student, I want a plain summary of how much the trace shrank, so that I can see what the reducer did.

#### Acceptance Criteria

1. WHEN a reduction ends without a Reducer_Error, either because a Round ended with no Accepted_Change (Requirement 5, criterion 4) or because the Budget was reached (Requirement 9, criterion 4), THE Trace_Reducer SHALL return, through the Reducer_Handle's `step` (Requirement 10, criterion 2), a Reducer_Result holding `originalEventCount`, `reducedEventCount`, `candidatesTried`, `stoppedAtBudget`, the Reduced_List and the Violation (`rule`, `cycle`) of the Reduced_List.
2. THE Trace_Reducer SHALL set `originalEventCount` to the number of Gremlin_Events in the Original_List and `reducedEventCount` to the number of Gremlin_Events in the Reduced_List, each as a non-negative integer, with no Rest_Event counted in either.
3. THE Trace_Reducer SHALL set the Violation of the Reducer_Result to a value deep-equal to the Violation recorded for the Best_List when the reduction ended (Requirement 5, criterion 6), which is the Violation of the latest Accepted_Change, or the Confirmation_Run's Violation when no Candidate was accepted, and whose `rule` equals the Target_Rule's Canonical_Sentence, with no extra Oracle call made to obtain it.
4. THE Reducer_Result SHALL be plain JSON data, meaning that `JSON.parse(JSON.stringify(result))` is deep-equal to the result under strict comparison and that no value anywhere in it is `undefined`, `NaN`, `Infinity`, `-Infinity`, a BigInt, a Date, a function, or an object whose prototype is other than `Object.prototype` or `Array.prototype`.
5. FOR ALL Reducer_Results, `reducedEventCount` SHALL be at most `originalEventCount`, and for a reduction with no Accepted_Change the Reduced_List SHALL be deep-equal to the Original_List and `reducedEventCount` SHALL equal `originalEventCount`.
6. FOR ALL Reducer_Results, the Reduced_List SHALL be a subsequence of the Original_List under the mapping of Requirement 4: each event maps to a distinct Original_List event at a strictly increasing index, of the same kind (digital or analog), with the same `cycle`, `signal`, `gremlinId` and digital `value`; an analog event keeps its original `analog` value or carries the Snap_Value of that original value; every Rest_Event of the Original_List is the image of exactly one Reduced_List event; and the Reduced_List length equals the Original_List's Rest_Event count plus `reducedEventCount`.
7. THE Trace_Reducer SHALL set `candidatesTried` to the Candidates_Tried of the reduction when it ended, as an integer from 1 to the Budget, and SHALL set `stoppedAtBudget` to the boolean `true` or `false` as Requirement 9, criteria 4 and 5 state.
8. WHEN `step` returns a Reducer_Result after the caller has changed any object of a Reducer_Result returned earlier by the same Reducer_Handle, THE Reducer_Handle SHALL return a Reducer_Result deep-equal to the first returned Reducer_Result as it was when first returned.
9. IF a reduction ends with a Reducer_Error, THEN THE Trace_Reducer SHALL return that Reducer_Error and no Reducer_Result, from that `step` call and from every later `step` call (Requirement 10, criterion 10).

### Requirement 12: Determinism and engine rules

**User Story:** As a teacher, I want the same trace to shrink the same way every time, so that a class can compare results.

#### Acceptance Criteria

1. WHEN two reductions are run with Deep_Equal Reduction_Inputs and Same_Answer_Oracles, in the same process or in different processes, and with any sequences of positive slice sizes for `step(k)`, THE Trace_Reducer SHALL give the two Oracles Deep_Equal Candidates in the same order, SHALL call the two progress callbacks with Deep_Equal Progress_Reports in the same order, and SHALL return Deep_Equal Reducer_Results or Deep_Equal Reducer_Errors (same kind and same message text).
2. THE Trace_Reducer SHALL express every time value it takes, holds, reports or returns (event `cycle`, Violation `cycle`, Output_Edge `cycle`, Run_Cycles, Max_Step_Cycles and the Violation_Span length) as a non-negative integer count of CPU cycles, SHALL put no millisecond, second or wall-clock value in any Reducer_Result, Progress_Report or Reducer_Error, and SHALL write time as text only as the Failure_Story's Ms_Text computed from such a cycle count.
3. THE Trace_Reducer SHALL contain none of the APIs listed in fact F8 in any file under `src/engine/reducer/` or in any engine file changed by the Run_Path move of Requirement 3, criterion 5, so that the output of `node scripts/guard.mjs` holds no finding line for any of those files.
4. THE Trace_Reducer SHALL make no network call and SHALL contain no AI, meaning that every import, dynamic import and `require` in a file under `src/engine/reducer/` names a relative path that resolves to a module under `src/engine/` outside `src/engine/__tests__/`, so that no package, no Node built-in module and no network or model client is loaded directly by the Trace_Reducer's files.
5. THE Trace_Reducer SHALL import avr8js only through the existing EmulatorBridge module, so that no file under `src/engine/reducer/` names `avr8js` in an import, dynamic import or `require`, and the guard's avr8js isolation check reports no finding for any file under `src/engine/reducer/`.
6. THE Trace_Reducer SHALL draw no random value, meaning that no file under `src/engine/reducer/` has a non-type import of `src/engine/prng.ts`, `src/engine/run-seed.ts` or `src/engine/event-list.ts`, and the Emulator_Oracle and the Replay_Function pass each Candidate or event list to the Run_Path unchanged and in list order, building no event list from a seed.
7. WHILE two or more Reducer_Handles exist in one process, THE Trace_Reducer SHALL keep each reduction's state only in its own Reducer_Handle, so that calling `step` on the handles in any interleaving gives each handle a Deep_Equal Oracle call sequence, Deep_Equal Progress_Reports and a Deep_Equal Reducer_Result or Reducer_Error compared with running that handle alone.
8. WHEN the Emulator_Oracle or the Replay_Function is called twice with Deep_Equal HEX text, Fixture, Rule_Set, event list, Run_Cycles and Max_Step_Cycles, with any other Emulator_Oracle or Replay_Function calls between the two calls, THE Trace_Reducer SHALL return Deep_Equal results for the two calls.

### Requirement 13: Failure_Story

**User Story:** As a student, I want two to four plain sentences that say what the gremlin did and which rule broke, so that I understand the failure without reading a trace table.

#### Acceptance Criteria

1. WHEN the Failure_Story function is called with the Reduced_List, the Fixture, the Violation, the Output_Edges of the Replay_Function run of the Reduced_List and an optional Violation_Span, THE Failure_Story function SHALL return a text on one line, with no newline character, made of 2 to 4 Story_Sentences joined by exactly one space, each Story_Sentence ending with a period.
2. THE Failure_Story SHALL begin with the exact, case-sensitive words "In the smallest replay this reducer found," and SHALL use no other phrase to describe the reducer result: the words "the smallest replay this reducer found" SHALL appear exactly once, and the word "smallest" SHALL appear nowhere else outside the Canonical_Sentence, the `gremlinId` texts and the signal names.
3. THE Failure_Story SHALL write every distinct `gremlinId` of the Gremlin_Events of the Reduced_List at least once, character for character, and SHALL describe the Gremlin_Events in the Detailed_Form unless criterion 12 applies.
4. WHEN the Detailed_Form describes a digital Gremlin_Event whose `value` is the press value of the Fixture pin whose `signal` equals the event's `signal` (1 for Active_Level `"high"`, 0 for `"low"` or absent), THE Failure_Story SHALL write, in the Story_Sentence that describes the event, the word "pressed" followed by one space and the signal name.
5. WHEN the Detailed_Form describes a digital Gremlin_Event whose `value` is `"release"`, THE Failure_Story SHALL write, in the Story_Sentence that describes the event, the word "released" followed by one space and the signal name.
6. WHEN the Detailed_Form describes a digital Gremlin_Event whose `value` is the one of 0 and 1 that is not the press value of its Fixture pin, THE Failure_Story SHALL write, in the Story_Sentence that describes the event, the word "drove", one space, the signal name, the word "to" and that value, separated by single spaces.
7. WHEN the Detailed_Form describes an analog Gremlin_Event, THE Failure_Story SHALL write, in the Story_Sentence that describes the event, the word "set", one space, the signal name, the word "to" and N, separated by single spaces, where N is the event's `analog` value in base-10 digits with no digit-group separator.
8. WHEN the Reduced_List holds no Gremlin_Event, THE Failure_Story SHALL hold the words "no gremlin event was needed" in its first Story_Sentence, SHALL write no `gremlinId`, and SHALL have exactly 2 Story_Sentences when no Violation_Span is given and exactly 3 when one is given.
9. THE Failure_Story SHALL write every time as an Ms_Text of a cycle count taken from a Reduced_List event `cycle`, the Violation `cycle`, an Output_Edge `cycle` or the Violation_Span length, and every Story_Number outside the Canonical_Sentence, the `gremlinId` texts and the signal names SHALL be the number part of such an Ms_Text, an `analog` value of a Reduced_List event, a digital `value` 0 or 1 of a Reduced_List event, or a count of Reduced_List Gremlin_Events.
10. THE Failure_Story SHALL hold one Story_Sentence that contains the Ms_Text of the Violation's `cycle` and ends with the Violation's `rule` text (the Canonical_Sentence) character for character, and that Story_Sentence SHALL be the last one when no Violation_Span is given and the second to last when a Violation_Span is given.
11. THE Failure_Story SHALL hold at most 30 Story_Words in each Story_Sentence, not counting the Story_Words of the Canonical_Sentence.
12. IF the Detailed_Form for the input would have more than 4 Story_Sentences or a Story_Sentence of more than 30 Story_Words (not counting the Story_Words of the Canonical_Sentence), THEN THE Failure_Story SHALL use the Summary_Form in place of the Detailed_Form.
13. THE Failure_Story function SHALL return a character-for-character equal text, or a deep-equal Reducer_Error, for deep-equal inputs, SHALL leave its arguments unchanged, and SHALL read no wall clock and draw no random value.
14. THE Failure_Story SHALL contain no BANNED_WORDS entry as a whole word, ignoring letter case, as the copy test matches, anywhere in the text, including the Canonical_Sentence, the `gremlinId` texts and the signal names.
15. IF a signal name or `gremlinId` that the Failure_Story would write, or the Violation's `rule` text, contains a BANNED_WORDS entry, THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that names the field and SHALL return no text.
16. THE Failure_Story function SHALL return a Reducer_Error in place of throwing for every input value, including `undefined`, `null`, values that are not objects, and objects with missing or wrongly typed fields.
17. WHEN the Failure_Story function is given a Violation_Span, THE Failure_Story SHALL end with one Story_Sentence that holds the Ms_Text of the span length, with the words "at least" and one space immediately before that Ms_Text when the span's cut flag is true, and without the words "at least" when the flag is false.
18. IF the Summary_Form would also have more than 4 Story_Sentences or a Story_Sentence of more than 30 Story_Words (not counting the Story_Words of the Canonical_Sentence), THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that says the story does not fit in 4 sentences of at most 30 words, and SHALL return no text.
19. IF a Reduced_List event has a `signal` that no Fixture pin has, a digital `value` other than 0, 1 and `"release"`, an `analog` value that is not an integer from 0 to 1023, an analog value on a digital Fixture pin or a digital value on an analog Fixture pin, a `cycle` that is not a non-negative integer or is lower than the cycle of the event before it, or no string `gremlinId`; or the Violation has a `rule` that is not a non-empty string or a `cycle` that is not a non-negative integer; or the Violation_Span has a length that is not a non-negative integer or a cut flag that is not a boolean; or an Output_Edge fails a check of Requirement 14, criterion 5, THEN THE Failure_Story function SHALL return a Reducer_Error of kind `invalid-input` that names the field, the event index or the edge index, and SHALL return no text.

### Requirement 14: Trace_Fingerprint

**User Story:** As a teacher, I want a short code for a trace, so that students can check they replayed the same trace.

#### Acceptance Criteria

1. WHEN the Trace_Fingerprint function is given an array of 0 or more valid Output_Edges, THE Trace_Fingerprint function SHALL return a text of exactly 16 characters, each one of `0` to `9` or `a` to `f`, with leading zeros kept so that the 64-bit value is always written in 16 digits.
2. WHEN the Trace_Fingerprint function is given an array of valid Output_Edges, THE Trace_Fingerprint function SHALL compute FNV-1a 64-bit over the Fingerprint_Bytes of that array in list order. It starts from the offset basis `cbf29ce484222325`. For each byte, it XORs the byte into the value and then multiplies by the prime `100000001b3` modulo 2^64. The function SHALL read only the `cycle`, `signal` and `value` of each Output_Edge, and SHALL not sort or regroup the edges or require their cycles to be non-decreasing.
3. THE Trace_Fingerprint function SHALL return `cbf29ce484222325` for an empty list, and its FNV-1a step SHALL return `af63dc4c8601ec8c` for the single byte of `a` (0x61).
4. WHEN the Trace_Fingerprint function is called two or more times with ordered lists whose Output_Edges have equal `cycle`, `signal` and `value` at each index, THE Trace_Fingerprint function SHALL return the same text on every call. It SHALL read no wall clock, draw no random value, and leave the passed array and its Output_Edges unchanged.
5. IF the input is not an array, or an element at index i is not an object, or has a `cycle` that is not an integer from 0 to 2^53 − 1, or has a `signal` that is not a string, or has a `value` other than the number 0, the number 1 or the string `"input"`, THEN THE Trace_Fingerprint function SHALL return a Reducer_Error of kind `invalid-input`, and SHALL return no fingerprint text. The error SHALL name the lowest such 0-based edge index and the failing field when an element is invalid, and SHALL say the input is not a list when the input is not an array.
6. THE Trace_Reducer SHALL call this value a fingerprint in every name, comment, doc and user-visible text. Every exported function, type or field name for it SHALL contain "fingerprint" (any letter case), and no such name SHALL contain "hash" (any letter case). No comment, doc or user-visible text SHALL describe it as a hash for security, a tamper check or a security measure.
7. THE text returned by the Trace_Fingerprint function and the message of every Reducer_Error it returns SHALL contain no BANNED_WORDS entry.
8. THE Trace_Fingerprint function SHALL return a fingerprint text or a Reducer_Error, and SHALL not throw, for every input value. This includes `null`, `undefined`, a non-array value, a sparse array, and an array with non-object elements.

### Requirement 15: Correctness properties

**User Story:** As a developer, I want property tests over many generated cases, so that the reducer's claims rest on evidence.

#### Acceptance Criteria

1. THE agent SHALL write every property test of this spec with fast-check and SHALL pass each `fc.assert` call a `seed` and a `numRuns`, each written as an integer literal in the test file. `numRuns` SHALL be at least 200 for every Pure_Property and at least 20 for every Emulator_Property.
2. THE agent SHALL give the property tests Branch_Counters, each counted in at least one property test, for these branches: a reduction that ends with `stoppedAtBudget` true; a reduction that ends with `stoppedAtBudget` false; an Accepted_Change whose Candidate_Part is `ddmin`; one whose Candidate_Part is `passA`; one whose Candidate_Part is `passB`; one whose Candidate_Part is `passC`; and, in a Pure_Property, a Synthetic_Oracle answer of `breaks` with a Violation of a Rule other than the Target_Rule. After each `fc.assert` call returns, the test SHALL assert that every Branch_Counter of that test is greater than 0.
3. WHEN a reduction in a property test ends with a Reducer_Result, THE agent's test SHALL call the same Oracle once more on a copy of the Reduced_List, outside the reduction. The test SHALL check that the answer is `breaks` with a Violation whose `rule` equals the Target_Rule's Canonical_Sentence and whose `rule` and `cycle` equal the Violation of the Reducer_Result.
4. WHEN a reduction in a property test ends with a Reducer_Result, THE agent's test SHALL check that `originalEventCount` equals the number of Gremlin_Events in the Original_List, that `reducedEventCount` equals the number of Gremlin_Events in the Reduced_List, and that `reducedEventCount` is at most `originalEventCount`.
5. WHEN a reduction in a property test ends with a Reducer_Result, THE agent's test SHALL check the subsequence mapping of Requirement 11, criterion 6. Each Reduced_List event SHALL map to a distinct Original_List event at a strictly increasing index, with the same `cycle`, `signal`, `gremlinId` and digital `value`. Each analog event SHALL carry either the original `analog` value or the Snap_Value of that original value. Every Rest_Event of the Original_List SHALL appear in the Reduced_List with the same `cycle` and value.
6. WHEN a reduction in a property test ends with `stoppedAtBudget` false, THE agent's test SHALL check 1-minimality outside the reduction. For each Gremlin_Event of the Reduced_List, the test SHALL call the same Oracle once on a copy of the Reduced_List with only that event removed, and SHALL check that no answer is a Same_Rule_Break.
7. WHEN a property test runs a generated case, THE agent's test SHALL run the reduction twice, each time on a fresh Reducer_Handle with a deep copy of the same input. The test SHALL check that the two Oracle_Logs, the two Progress_Report sequences and the two Reducer_Results or Reducer_Errors are deep-equal. The test SHALL then run the reduction a third time, calling `step` with a generated sequence of slice sizes (each an integer from 1 to the Budget) until the reduction ends, and SHALL check that its Oracle_Log, Progress_Reports and Reducer_Result deep-equal those of one `step(Budget)` call.
8. WHEN a property test has run a reduction with the Unlimited_Budget and got Candidates_Tried T, THE agent's test SHALL check Requirement 9, criterion 6 at the boundary. It SHALL rerun the reduction with Budget T and with Budget T + 1, and SHALL check that each returns the same Reducer_Result as the unlimited reduction, with `stoppedAtBudget` false. When T ≥ 2, it SHALL rerun the reduction with Budget T − 1 and with one generated Budget B from 1 to T − 1. Each of those reruns SHALL return Candidates_Tried equal to its Budget, `stoppedAtBudget` true, and a Reduced_List deep-equal to the Best_List in the unlimited reduction's Progress_Report after that many Oracle calls.
9. WHEN a Pure_Property calls the Failure_Story function or the Trace_Fingerprint function twice on deep copies of the same generated input, THE agent's test SHALL check that the two returned texts are identical strings, or that the two Reducer_Errors are deep-equal. The test SHALL also check that neither the Failure_Story text nor the Trace_Fingerprint text contains a BANNED_WORDS entry, matched as a whole word ignoring letter case. The generated inputs SHALL include Reduced_Lists with 0 Gremlin_Events, lists with digital events, lists with analog events, and inputs with and without a Violation_Span.
10. THE agent SHALL put every new test file under `src/engine/__tests__/`.
11. THE agent's Pure_Properties SHALL generate Original_Lists that hold 0 to 40 Gremlin_Events on signals of the generated Fixture, together with Rest_Events, No_Change_Events, Bursts and analog values other than 0, 512 and 1023. They SHALL generate Budgets from 1 to 300 and the Unlimited_Budget. Their Synthetic_Oracles SHALL be pure functions of the Candidate's contents that give a Same_Rule_Break on the Original_List. The agent's Emulator_Properties SHALL generate cases from the three Example_Traces, with the Example's Fixture, Rule_Set and Run_Cycles and a Budget from 1 to 300.
12. IF a property test finds a counterexample or a Branch_Counter is 0, THEN THE agent SHALL record the seed and the counterexample that fast-check reports and SHALL leave the test's seed, `numRuns`, generators and assertions unchanged, and SHALL proceed as Requirement 19, criterion 11 states.
13. WHEN the agent reports the results of these property tests, THE agent SHALL call passing tests evidence, not proof of correctness, as Requirement 18, criterion 2 states.

### Requirement 16: Acceptance on the real Examples

**User Story:** As a maker, I want the reducer tried on the three shipped examples, so that I can see it shrink real AI-style bugs.

#### Acceptance Criteria

1. WHEN the acceptance test runs for an Example, THE agent's test SHALL load the Example with `loadExample`, run `runExampleCampaign` on the buggy build with the committed `meta.json` values (`gremlinSet`, `runCycles`, `campaignSeed`, `runs`), take the Example_Trace from the Campaign result's BROKE verdict `trace`, and run the Trace_Reducer on a Reduction_Input made of the buggy HEX text from `readHex`, the Fixture and Rule_Set from `loadExample`, `trace.eventList` as the Original_List, `trace.violation` as the target Violation, `meta.runCycles` as Run_Cycles, the default Max_Step_Cycles of 160,000 and the default Budget of 300.
2. WHEN the reduction of an Example ends with a Reducer_Result, THE agent's test SHALL print, on lines that start with the Example id: `originalEventCount -> reducedEventCount` as two integers, `candidatesTried`, `stoppedAtBudget`, every event of the Reduced_List in list order (Rest_Events included) with its `cycle`, `signal`, `gremlinId` and digital `value` or `analog` value, the Failure_Story text returned for the Reduced_List, the Fixture, the Reducer_Result Violation and the Output_Edges of the criterion 3 replay with no Violation_Span, and the Trace_Fingerprint of those same Output_Edges.
3. WHEN the Reduced_List of an Example is replayed by the Replay_Function on a fresh EmulatorBridge with the buggy HEX text, the Example's Fixture and Rule_Set, `meta.runCycles` as Run_Cycles and Max_Step_Cycles 160,000, THE agent's test SHALL check that the returned Violation is not `null`, that its `rule` equals the Target_Rule's Canonical_Sentence, and that its `cycle` equals the `cycle` of the Reducer_Result Violation.
4. WHEN the Reduced_List of an Example is replayed by the Replay_Function on a fresh EmulatorBridge with the fixed HEX text, the Example's Fixture and Rule_Set, `meta.runCycles` as Run_Cycles and Max_Step_Cycles 160,000, THE agent's test SHALL check that the returned Violation is `null` (no Violation of any Rule), and SHALL print the returned Violation when it is not `null`.
5. WHEN the reduction of an Example ends with `stoppedAtBudget` false, THE agent's test SHALL, for each Gremlin_Event of the Reduced_List in turn, build the list that removes only that one Gremlin_Event and keeps every other event (every Rest_Event included) in its order, give it to an Emulator_Oracle built from the same Reduction_Input on a fresh EmulatorBridge, and check that the outcome is `does-not`; these checks are not counted in the reduction's Candidates_Tried, and a Reduced_List with no Gremlin_Event passes with no Oracle call.
6. WHEN the First_Green_Run has happened, THE agent SHALL add the four Pinned_Literals of each Example to the acceptance test, copied character for character from that run's printed output, with no rounding and no tuning, and THE agent's test SHALL check each Pinned_Literal by exact equality; THE agent SHALL change neither the Budget, Max_Step_Cycles, Run_Cycles nor any `meta.json` value, nor any reducer code, so that a printed value matches a wanted number.
7. THE agent SHALL put the acceptance test in a new file under `src/engine/__tests__/`, with one test case per Example (`crosswalk`, `garage`, `heartbeat`) so that each Example passes or fails on its own, and SHALL use the helpers of `tests/examples/examples-support.ts` unchanged.
8. IF the Campaign result of an Example's buggy build has a verdict other than BROKE, THEN THE agent's test SHALL fail that Example's test case with a message that names the Example id and the verdict, run no reduction for that Example, and THE agent SHALL stop and write the report of Requirement 19, criterion 12.
9. IF the Trace_Reducer, the Reducer_Handle, the Replay_Function, the Failure_Story function or the Trace_Fingerprint function returns a Reducer_Error or an error for an Example, THEN THE agent's test SHALL fail that Example's test case with a message that names the Example id, the function, and the error's kind and message.
10. IF a run of the acceptance test after the Pinned_Literals are in place prints a value that differs from a Pinned_Literal, THEN THE agent's test SHALL fail with a message that names the Example id, the field, the pinned value and the printed value, and THE agent SHALL leave the Pinned_Literal unchanged and stop under Requirement 19, criterion 16.

### Requirement 17: Reducer speed note

**User Story:** As the project owner, I want the reducer's cost written down, so that I can judge whether it fits in the browser.

#### Acceptance Criteria

1. WHEN the literals of Requirement 16, criterion 6 are in the acceptance test and that test passes, THE agent SHALL add exactly one section titled "Reducer speed" to `SPIKE.md`, placed after the last existing section, and SHALL leave every other line of `SPIKE.md` unchanged.
2. THE "Reducer speed" section SHALL give, for each of `crosswalk`, `garage` and `heartbeat`: `candidatesTried`, the three Reduction_Wall_Times in run order, their median, and the Per_Candidate_Time. It SHALL also give, once for the section: the Node version (`process.version`), the OS (`os.type()`, `os.release()` and `os.arch()`), the CPU model and logical core count (`os.cpus()`), the date of the measurement, and the Method_Text.
3. THE agent SHALL measure wall time only in a Temporary_Script, run standalone with `npx tsx` (not under Vitest and not in a browser), and SHALL add no wall-clock read, timing parameter or timing callback to any file under `src/engine/`. The Temporary_Script SHALL run each Example's reduction with the same inputs as Requirement 16, criterion 1.
4. WHEN the agent reports the task done, THE agent SHALL have deleted the Temporary_Script, so that no file matches `scripts/tmp-*.ts` and `git status` lists no `scripts/tmp-*` file.
5. THE "Reducer speed" section SHALL contain no BANNED_WORDS entry, and SHALL refer to the Reduced_List only with the exact phrase "the smallest replay this reducer found".
6. THE Temporary_Script SHALL run the reduction of each Example 3 times in one process, keep every run in the reported figures with none dropped as warm-up, and report each Reduction_Wall_Time in seconds with 3 decimals and each Per_Candidate_Time in milliseconds with 1 decimal.
7. IF any of the 3 timed reductions of an Example returns a Reducer_Error, or returns a `candidatesTried`, `originalEventCount` or `reducedEventCount` that differs from the literal pinned for that Example under Requirement 16, criterion 6, THEN THE agent SHALL write no "Reducer speed" section, SHALL stop, and SHALL write the report of Requirement 19, criterion 12.
8. THE "Reducer speed" section SHALL state that all figures were measured on one machine, standalone under `tsx`, and SHALL state that it holds no browser measurement.

### Requirement 18: Checks before done

**User Story:** As the project owner, I want the whole project clean before the work is called done, so that nothing else broke.

#### Acceptance Criteria

1. WHEN the agent reports the work done, THE agent SHALL have run each of the four Done_Checks on the Final_Tree, and each Done_Check SHALL have given a Clean_Result, so that a Done_Check run before any later file change or before a Temporary_Script was deleted does not count.
2. THE agent SHALL describe each test result only with the words "pass" and "fail" and as evidence, not proof, SHALL use the words "proof", "proves" and "proven" about a test result only in the phrase "evidence, not proof", and SHALL use none of the verdict strings BROKE, HELD or COULDN'T TELL to describe a test result.
3. THE agent SHALL run no command that adds, removes or updates a package, and SHALL leave `package.json` and `package-lock.json` byte-identical to their content at the start of the task.
4. IF a Done_Check does not give a Clean_Result, THEN THE agent SHALL not report the work done, and SHALL either change only the agent's new code (with no edit that Requirement 19, criteria 1 to 3 forbid) and then run all four Done_Checks again on the new Final_Tree, or, when the cause is not the agent's new code, stop and write the report of Requirement 19, criterion 12 with the command, its exit code and its failing output.
5. WHEN the agent reports the work done, THE agent's report SHALL give, for each Done_Check, the command and its exit code, and for `npx vitest --run` the number of test files, the number of tests, and the pass, fail and skip counts.

### Requirement 19: House rules and STOP conditions

**User Story:** As the project owner, I want the agent to stop and report instead of working around a problem, so that I keep control of every hard decision.

#### Acceptance Criteria

1. THE agent SHALL make no change (content edit, rename, move or deletion) to any Committed_Test_File, any Baseline_File, any Fixture_File or any committed file under `examples/`, including `tests/examples/examples-support.ts`.
2. THE agent SHALL write new engine code only in new files under `src/engine/reducer/`, and SHALL change committed files under `src/engine/` outside `src/engine/__tests__/` only in `src/engine/campaign.ts` and only by the behavior-preserving Run_Path move of Requirement 3, criterion 5.
3. THE agent SHALL change, weaken or delete no acceptance test of Requirement 15 or Requirement 16 in order to make it pass, where weakening includes removing or loosening an assertion, lowering a fast-check run count below the minimum of Requirement 15, criterion 1, changing a fixed fast-check seed after a failure, removing or lowering a branch counter check, marking a test `skip`, `only` or `todo`, and changing a literal pinned under Requirement 16, criterion 6.
4. THE agent SHALL put every temporary or debug script at a path matching `scripts/tmp-*.ts`, and WHEN the agent reports a task done, `git status --porcelain --untracked-files=all` SHALL list no path matching `scripts/tmp-*`.
5. THE agent SHALL run none of the git subcommands `commit`, `push`, `reset`, `checkout`, `switch`, `restore`, `stash`, `rm`, `mv`, `clean`, `merge`, `rebase`, `cherry-pick` and `revert`, and SHALL use git only through read-only subcommands such as `status`, `diff`, `log`, `show` and `ls-files`.
6. IF the guard hook (`.kiro/hooks/guard-before-task.json`) blocks a task, or any run of `node scripts/guard.mjs` exits with a code other than 0, THEN THE agent SHALL stop and write the report of criterion 12.
7. IF a test in a Committed_Test_File fails in a run of `npx vitest --run`, and either that test also failed in the Reference_Run or the agent cannot name the file and line of its own change that causes the failure, THEN THE agent SHALL stop and write the report of criterion 12.
8. IF the Replay_Function run of an Example's Reduced_List on the buggy build reports no Violation, or reports a Violation whose `rule` differs from the Canonical_Sentence of the Target_Rule (Requirement 16, criterion 3), THEN THE agent SHALL stop and write the report of criterion 12.
9. IF the Replay_Function run of an Example's Reduced_List on the fixed build for the Example's Run_Cycles reports a Violation of any Rule (Requirement 16, criterion 4), THEN THE agent SHALL stop and write the report of criterion 12.
10. IF the 1-minimality check of Requirement 16, criterion 5 finds a Gremlin_Event of an Example's Reduced_List whose removal gives a Same_Rule_Break on the Emulator_Oracle, THEN THE agent SHALL stop and write the report of criterion 12.
11. IF a test of Requirement 15 or Requirement 16 fails, THEN THE agent MAY change only its own new non-test code (files under src/engine/reducer/ and the Run_Path move) to make it pass, and SHALL stop and write the report of criterion 12 when the agent concludes that the test's expectation itself is wrong, when making it pass would need any change to the test, or when the cause is outside the agent's new code.
12. WHEN the agent stops under criteria 6 to 11 or criterion 16, THE agent SHALL write a report that names the criterion that caused the stop and states what the test or check expects, what happened and the evidence (the command, its exit code, the relevant output lines and file:line), lists every file the agent created or changed as shown by `git status --porcelain --untracked-files=all`, lists every `scripts/tmp-*.ts` file still present, and SHALL then change no file and start no further task until the user replies.
13. THE agent SHALL delete, rename or move no committed file.
14. WHEN the agent starts the first task of this spec, THE agent SHALL run `npx vitest --run` and `node scripts/guard.mjs` before changing any file, and SHALL keep each command's exit code and the names of any failing tests as the Reference_Run.
15. THE agent SHALL write none of `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval` and `new Date(` in any file it creates or changes under `src/engine/`, including files under `src/engine/__tests__/`.
16. IF a printed `originalEventCount`, `reducedEventCount`, `candidatesTried` or Trace_Fingerprint of an Example differs on a later run from the literal pinned under Requirement 16, criterion 6, THEN THE agent SHALL stop and write the report of criterion 12.

## Choices I made

Values the request did not give. Each is the most conservative reading I could find. None changes an acceptance value, a rule meaning, a verdict text or the Budget default of 300.

### Reducer_Core and Oracle answers

1. The Confirmation_Run on the Original_List counts as a Candidate and toward the Budget. Without it, a list that does not break could be reported as the result. Counting it keeps the Budget an exact cap on emulator runs.
2. If the Original_List does not give a Same_Rule_Break (the Oracle answers `does-not`, or a well-formed `breaks` of another Rule), the reducer returns the error `original-does-not-break` and no reduced list. A throw or a Malformed_Outcome on the Confirmation_Run gives `oracle-error` with Candidate number 1 instead.
3. `originalEventCount` and `reducedEventCount` both count Gremlin_Events only. Rest_Events are never removable, so counting them would only add a constant.
4. An Oracle error (a throw, a Malformed_Outcome, or a bridge or Run_Path error) stops the reduction with `oracle-error`. It is not counted as "does not", because that would hide a broken run. The failing call still counts in Candidates_Tried.
5. Following the user's rule, a Candidate that breaks a Rule other than the Target_Rule counts as "does not" everywhere. The Emulator_Oracle maps it to `does-not`, and the Reducer_Core treats a well-formed `breaks` naming another Rule as not a Same_Rule_Break (Requirement 2, criterion 4). Only a throw or a Malformed_Outcome is an `oracle-error`.
6. The Reducer_Core compares only the Canonical_Sentence and never a Rule index. Fact F2 makes equal sentences mean the same Rule.
7. An Oracle must return its outcome synchronously. A Promise counts as a Malformed_Outcome.
8. The import ban of Requirement 2, criterion 2 also covers indirect imports and avr8js.
9. The Reducer_Core checks its own inputs (Requirement 2, criterion 8) because tests call it directly. It cannot check the Run_Cycles bound; the Trace_Reducer still checks that bound.
10. The Reducer_Core keeps no cache of tried Candidates. Every tested Candidate is one Oracle call and one count in Candidates_Tried.

### Reduction_Input

11. The Rule index of the Target_Rule is 0-based in Rule_Set order. Fact F2 (duplicate Canonical_Sentences are rejected) makes the matching Rule unique.
12. Only an omitted or `undefined` Max_Step_Cycles or Budget gets the default. `null`, `NaN`, strings and other values are `invalid-input`, so a caller bug is not hidden by a default.
13. The Budget, Max_Step_Cycles and the step size k accept integers from 1 to 2^53 − 1. A k larger than the Budget left is valid. Run_Cycles keeps 1 to 2^32, which matches `MAX_RUN_CYCLES` in `src/engine/campaign.ts`.
14. The target Violation's `cycle` must be an integer of at least 0, with no upper bound against Run_Cycles, because the end-of-run Checker call can report a Violation at the end of the Run. Only `rule` is used to pick the Target_Rule. The Reducer_Result's Violation comes from the Confirmation_Run or a later Oracle call, not from this input, and gets no upper bound either.
15. Events with equal `cycle` are valid (fact F5). An Original_List of length 0 or with no Gremlin_Event is valid input. No maximum list length is set; the Budget caps the work.
16. The event checks of Requirement 1, criterion 5 include `signal`, pin kind and value range, so that a list the Presented_Value and Snap_Value rules cannot read is rejected before the Confirmation_Run. A Gremlin_Event on an unmapped pin, or on a pin of the wrong kind, is rejected before any Oracle call.
17. The compile check runs before the event checks, so that event checks read a Fixture that `compileRuleSet` accepted. The Target_Rule check runs last. Deeper HEX and Fixture validity is left to `compileRuleSet` and the EmulatorBridge.
18. A field whose read throws is treated as an invalid value of that field.

### Candidates, Rounds and passes

19. A Candidate either removes events (ddmin, Pass_A, Pass_B) or snaps analog values (Pass_C), never both.
20. "At its original position" for a Rest_Event means the same order relative to every event that stays, not the same list index.
21. Every Candidate after the Confirmation_Run is built from the Best_List at the time of its Oracle call, so earlier Accepted_Changes carry into later Candidates. Every such Candidate differs from the Best_List, and a Candidate event carries exactly the properties of its Source_Event.
22. A Round is ddmin, Pass_A, Pass_B, Pass_C. The reduction ends after a Round with no Accepted_Change, so the final ddmin ran on the final list and the result is 1-minimal. ddmin also tests the empty Gremlin_Event list when one Gremlin_Event is left.
23. An Original_List with no Gremlin_Events that still breaks the Target_Rule is a valid result with Candidates_Tried 1, not an error.
24. The 1-minimality claim and the no-repeat rule hold for an Oracle that gives the same answer for equal Candidates.
25. Presented_Value starts at `"release"` for a digital input and at the Rest_Level (default 512) for an analog input, matching the bridge. `0`, `1` and `"release"` are three different values, so a press after a release is never a No_Change_Event, whatever the pull-up does. "Earlier" means a lower list index, not a lower cycle.
26. Pass_A first tries removing all No_Change_Events in one Candidate, then tries each one alone, in list order. One Pass_A makes at most 1 + n Oracle calls. With exactly one No_Change_Event, a rejected all-at-once Candidate is not tried again alone.
27. The No_Change_Events found when Pass_A starts stay No_Change_Events after any of them is removed, so Presented_Values are not recomputed inside Pass_A.
28. A Burst has at least two events. A Pass_B Candidate keeps the Burst's last event, so the level left after the Burst is the one the original run left. "Follow each other" means "come one after another among events of the same `signal`". A Rest_Event is never part of a Burst, and a Rest_Event of the same `signal` splits a Burst.
29. Bursts are worked out again from the current Best_List for every Pass_B Candidate. Removing events of a Burst other than its last never joins two Bursts.
30. Requirement 7, criterion 4 asks only for at least one Candidate per starting Burst. `design.md` fixes which events each Candidate removes and the order in which Bursts are tried.
31. Snap_Value is the nearest of 0, 512 and 1023. The one tie, 256, snaps to 512, the default Rest_Level. Pass_C touches only analog Gremlin_Events not already at 0, 512 or 1023.
32. Pass_C relies on fact F4 (an `analog` value is an integer from 0 to 1023); the range check belongs to Requirement 1, criterion 5.
33. `design.md` fixes which groups of Snap_Eligible_Events each Pass_C Candidate snaps and in what order, within Requirement 5, criterion 10. When the Budget ends the reduction partway through Pass_C, Requirement 8, criterion 5 does not apply.

### Budget, slicing and progress

34. `stoppedAtBudget` is true whenever a Pending_Candidate exists at the Budget, even if that Candidate would have been rejected.
35. A Reducer_Error on the Oracle call that reaches the Budget takes precedence over `stoppedAtBudget`.
36. The Budget applies to one whole reduction across all `step(k)` calls.
37. Requirement 9, criterion 6 assumes a deterministic Oracle and uses the Unlimited_Budget (2^53 − 1) as the "no reachable Budget" baseline.
38. Creating a Reducer_Handle makes no Oracle call.
39. `step(k)` makes fewer than k Oracle calls only when the reduction ends during that call. Parts that need no Oracle call run inside the same `step` call and don't count against k.
40. The progress callback is called for the Confirmation_Run too, including one that leads to `original-does-not-break`. It is not called for an Oracle call that ends in `oracle-error`. Each Progress_Report carries the Candidate_Part and an accepted flag, so tests can count Accepted_Changes per part.
41. An invalid k does not end the reduction; every other Reducer_Error is final.
42. A throwing progress callback stops the reduction with `callback-error`. Candidates_Tried then includes the Oracle call whose Progress_Report was being delivered.
43. "The same Reducer_Result" and "the same Reducer_Error" mean deep-equal plain data, not object identity.

### Reducer_Result and determinism

44. The Violation of the Reducer_Result is the Violation recorded at the last Accepted_Change (or at the Confirmation_Run); the Reduced_List is not re-run to get it.
45. "Plain JSON data" is tested as a strict deep-equal JSON round-trip plus the listed banned values. Optional fields are left out, never set to `undefined`.
46. `candidatesTried` is at least 1 and at most the Budget.
47. `design.md` names the fields for the Reduced_List and the Violation in the Reducer_Result.
48. Deep_Equal does not compare key order. Reducer_Errors count as the same only when both kind and message text are identical.
49. "Same Oracle answers" is read per Candidate number.
50. "Draws no random value" is checked by imports. A transitive import through `src/engine/campaign.ts` is allowed. Type-only imports are allowed.
51. "Contains no AI" and "no network call" are checked by limiting reducer imports to relative paths into `src/engine/`.
52. The guard criterion of Requirement 12 is checked per file; the guard's overall exit 0 is required by Requirement 18.

### Emulator_Oracle and Replay_Function

53. The Emulator_Oracle gets a fresh Checker for each Candidate by calling `compileRuleSet` again, and compiles once before the Confirmation_Run so that a compile failure stops the reduction before any Oracle call.
54. Every Candidate Run and every Replay_Function Run passes the same fixed Run_Index (0) to the Run_Path.
55. The Replay_Function reports bridge and Run_Path errors with a new Reducer_Error kind `replay-error`.
56. The Replay_Function reports a Violation of any Rule, not only the Target_Rule. In the acceptance test, "does NOT break the fixed build" means the replay on the fixed build reports no Violation of any Rule over `meta.runCycles`. This is stricter than "not the Target_Rule".
57. Output_Edges include the whole last Step, including edges after the Violation cycle, because the Run_Path adds a Step's output events before it calls the Checker. The Trace_Fingerprint of a replay therefore depends on Max_Step_Cycles.

### Failure_Story

58. Ms_Text uses 16,000 cycles per ms as the request states, rounded half up to 1 decimal in integer arithmetic, with no digit-group separator.
59. The Failure_Story takes the Violation_Span as an optional input. The engine does not compute the span. The acceptance test can compute it with `violationSpan` from `tests/examples/examples-support.ts`. A span cut by the end of the replay is written with "at least".
60. Each Failure_Story sentence holds at most 30 words, not counting the Canonical_Sentence. The Detailed_Form is the default; the Summary_Form (counts with earliest and latest times) is used only when the Detailed_Form would break the sentence or word limits. `design.md` fixes the exact packing. If even the Summary_Form does not fit, the function returns `invalid-input` and no text.
61. A digital event that drives the inactive level (not a press, not a release) is written "drove SIGNAL to v". The catalogue gremlins never make one, but the type allows it.
62. If a signal name, a `gremlinId` or the Violation's `rule` text that the story would write contains a BANNED_WORDS entry, the story function returns an error and no text. Fixture signal names are not checked for those words today.
63. Story_Sentence boundaries ignore periods inside the Canonical_Sentence, gremlinIds, signal names and Ms_Text.
64. "Use no other phrase" is tested by requiring the phrase exactly once and the word "smallest" nowhere else outside the Canonical_Sentence and names.
65. The no-event case uses the literal words "no gremlin event was needed".
66. Digits inside gremlinIds, signal names and the Canonical_Sentence are exempt from the number rule of Requirement 13, criterion 9.
67. Output_Edges are validated and may supply times; the story is not required to describe them.
68. Failure_Story input validation reuses the existing bounds. The cycle upper bound is not checked because the story function does not take Run_Cycles. The function leaves its arguments unchanged.

### Trace_Fingerprint

69. The Trace_Fingerprint encodes each edge as `JSON.stringify([cycle, signal, value])` plus a newline, so that a comma or newline inside a signal name cannot make two traces encode the same.
70. `cycle` must be a JavaScript safe integer from 0; −0 passes and `JSON.stringify` writes it as `0`.
71. `value` is checked strictly. Properties of an Output_Edge other than `cycle`, `signal` and `value` are ignored.
72. The list order is the order fingerprinted; the spec does not claim that two different lists always give different fingerprints. No maximum list length is set.
73. When more than one edge is invalid, the error names the lowest index; fields are checked in the order `cycle`, `signal`, `value`.
74. Requirement 14, criterion 7 also covers the error messages the function returns.
75. Comments may name the method "FNV-1a 64-bit"; identifiers must not contain "hash".

### Property tests

76. The ddmin, Pass_A, Pass_B and Pass_C counters read the Candidate_Part and the accepted flag from each Progress_Report (Requirement 10, criterion 5).
77. The "different Rule" branch is required to be greater than 0 only in a Pure_Property, where the Reducer_Core treats it as not a Same_Rule_Break (Requirement 2, criterion 4). Emulator_Properties may count it but are not required to reach it.
78. The listed Branch_Counters are a minimum.
79. Pure_Property Original_Lists hold at most 40 Gremlin_Events. This bound applies only to test generation.
80. The re-check calls of Requirement 15, criteria 3, 6 and 8 run outside the reduction under test and do not count toward its Candidates_Tried.
81. Requirement 15, criterion 9 checks both the Failure_Story and the Trace_Fingerprint for BANNED_WORDS entries.
82. "Fixed seed" means an integer literal in the test file, one per `fc.assert` call.

### Acceptance on the Examples

83. The Pinned_Literals are `originalEventCount`, `reducedEventCount`, `candidatesTried` and the Trace_Fingerprint for each Example.
84. "BROKE of the same rule" on the fresh replay is checked as a Violation whose `rule` equals the Target_Rule's Canonical_Sentence, plus the same `cycle` as the Reducer_Result Violation.
85. The printed Failure_Story is built with no Violation_Span unless `design.md` computes one with `violationSpan`; it is printed but is not a Pinned_Literal.
86. The Trace_Fingerprint is computed over the Output_Edges of the buggy-build Replay_Function run of the Reduced_List.
87. 1-minimality is checked only when `stoppedAtBudget` is false; when it is true the test prints that the check was skipped because the Budget was reached. `design.md` states the per-test timeout.

### Reducer speed note

88. The speed note is measured with a Temporary_Script run with `npx tsx` (already a devDependency) that is then deleted, so `package.json` scripts stay unchanged. The note records the method in words.
89. "Wall time per Example" means one complete reduction, not the campaign that found the BROKE trace.
90. Each Example is timed 3 times and the median is reported with all 3 values shown, following the existing "median of 3 runs" convention in `SPIKE.md`.
91. "Per Candidate" is the median divided by `candidatesTried`, so no timing hook enters engine code.
92. Reduction_Wall_Times are written in seconds with 3 decimals; Per_Candidate_Times in milliseconds with 1 decimal.
93. A mismatch between the timed counts and the Pinned_Literals is a STOP.
94. The section says it holds no browser measurement.

### Checks before done

95. `npm run guard` and `node scripts/guard.mjs` run the same script. A clean run is exit code 0 with the line `guard: clean` for the whole project.
96. "No failure" for `npx vitest --run` means 0 failed tests and 0 failed test files on an unfiltered run; new tests may not be marked skip, todo or only.
97. The Done_Checks count only when run on the Final_Tree.
98. `package.json` and `package-lock.json` stay byte-identical, scripts included.
99. If a Done_Check fails for a reason other than the agent's new code, the agent stops and reports.

### House rules and STOPs

100. The only allowed edit to existing engine code is moving the Run_Path out of `runOne` in `src/engine/campaign.ts` into an exported function that `runOne` calls, with Run_Results unchanged. `design.md` decides whether that move is needed.
101. "The guard hook blocks" also covers a direct run of `node scripts/guard.mjs` that exits with a code other than 0.
102. "The cause is not the agent's new code" is decided against a Reference_Run taken before any change.
103. The agent makes no git commit, as in the `held-text` spec. "Checkout" also covers `git switch` and `git restore`; "delete tracked files" also covers `git rm`, `git mv` and `git clean`; `merge`, `rebase`, `cherry-pick` and `revert` are also banned. Read-only git subcommands are allowed.
104. The ban on `Math.random` and clocks also applies to new and changed test files under `src/engine/__tests__/`. Wall-time measurement happens only in a Temporary_Script under `scripts/`.
105. At a STOP the agent does not delete `scripts/tmp-*.ts` files; the report lists them, and they are deleted before the task is later reported done.
106. A failing test of Requirement 15 or Requirement 16 lets the agent change only its own new non-test code (files under `src/engine/reducer/` and the Run_Path move). The agent stops and reports when it concludes the test's expectation is wrong, when a fix would need a test change, or when the cause is outside its new code. A real-Example replay that does not break the Target_Rule, a fixed-build Violation, a failed 1-minimality check on an Example and a Pinned_Literal mismatch on a later run stay immediate STOPs (Requirement 19, criteria 8, 9, 10 and 16).

### Scope

107. This spec builds no Worker and no UI. It defines the `step(k)` API and the Progress_Report they will use.
