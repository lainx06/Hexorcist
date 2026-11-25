# Requirements Document

## Introduction

This feature makes small additions to the existing Hexorcist web app in `src/ui/app`. It adds two bundled sample programs to the "Your own program" path (a chat-written sketch and a program the checker cannot judge), a new wording for sub-millisecond violations in the "What happened" story, a headline verdict on the fixed program's card, clearer COULDN'T TELL and idle text, hidden pin-level columns while the reducer runs, a narrower gremlin picker on the upload path, and a meta description plus noscript block in `index.html`. The 8000-cycle limit is 0.5 ms at 16 MHz, chosen because the existing story rounds to whole milliseconds and spans under 0.5 ms would read "0 ms".

Scope limits that apply to every requirement: the target is the ATmega328P at 16 MHz via avr8js only, all code is TypeScript, simulated time is integer CPU cycles, verdict strings are exact, and all existing tests keep passing. The one allowed test change is the expected text in Property 21 of `tests/ui/plain-story.property.test.ts`, for spans under 8000 cycles only (Requirement 4).

Acceptance tests named in Requirements 2 and 3 are written by the user. A later phase must not change, weaken, or delete them to make them pass. If such a test and the system disagree, the later phase reports the expected result, the actual result, and the evidence, then waits for the user's decision.

## Glossary

- **Web_App**: The existing Hexorcist browser app under `src/ui/app`.
- **Upload_Path**: The "Your own program" screen where a visitor supplies a program, pins, a rule, and gremlins.
- **Program_And_Pins_Section**: The part of the Upload_Path that holds the program and pin buttons.
- **Sample_Button**: Any of the five buttons in the Program_And_Pins_Section: "Choose .hex file", "Try the sample", "Try a chat-written sketch", "Try one it can't check", "Download the sample".
- **Run_In_Progress**: The state from when the visitor unleashes the gremlins until the verdict is shown.
- **Chat_Sketch_Sample**: The sample loaded by "Try a chat-written sketch", built from `exorcism-demo/benchmark/round2/chatgpt-high.hex`.
- **Unjudgeable_Sample**: The sample loaded by "Try one it can't check", built from `fixtures/serial_hello/build/serial_hello.ino.hex`.
- **Unjudgeable_Pin_Map**: A JSON file stored next to the `serial_hello` fixture that holds the pin map of the Unjudgeable_Sample.
- **Crosswalk_Pin_Map**: The pin map of the existing Crosswalk example.
- **Masher**: The existing gremlin that mashes inputs, as named in the gremlin picker.
- **Verdict**: One of BROKE, HELD, or COULDN'T TELL, shown with the exact strings defined in the workspace verdict rules.
- **HELD_Text**: The exact string "No violation found in N emulated runs of this gremlin set. Not a proof." with N the real run count, or "1 emulated run" when N is 1.
- **Fingerprint**: The identifier of a failing trace that the existing checker records for a BROKE verdict.
- **Plain_Story_Builder**: The existing component that builds the "What happened" story text.
- **Story_Panel**: The "What happened" area that shows the output of the Plain_Story_Builder.
- **Short_Span**: A violation whose length is less than 8000 cycles.
- **Fix_View**: The view that compares the buggy program card and the fixed program card.
- **Fixed_Card**: The card for the fixed program in the Fix_View.
- **Campaign_Line**: The text line on a program card that summarizes the campaign result.
- **Stage**: The area of the Web_App that shows the replay of a run.
- **Tab_Area**: The area under the Stage that holds the story and other tabs.
- **Pin_Level_Columns**: The columns of the Web_App that show pin levels over time.
- **Reducer**: The existing component that shrinks a failing trace to the smallest replay it can find.
- **Gremlin_Picker**: The list of gremlin chips from which the visitor selects gremlins.
- **Chip**: One selectable entry in the Gremlin_Picker.
- **Digital_Input_Target**: A pin target that is a digital input.
- **Acceptance_Test**: A test written by the user for this spec, named in Requirement 2 or 3.
- **Index_Page**: The file `index.html` at the project root.

## Requirements

### Requirement 1: Program and pins button set

**User Story:** As a visitor on the Upload_Path, I want a fixed, labelled set of program buttons, so that I can pick a file or a sample without guessing.

#### Acceptance Criteria

1. THE Program_And_Pins_Section SHALL show exactly five Sample_Buttons, in this left-to-right (or top-to-bottom, where the layout stacks) order, each with this exact visible label: "Choose .hex file", "Try the sample", "Try a chat-written sketch", "Try one it can't check", "Download the sample".
2. WHILE a Run_In_Progress exists, THE Program_And_Pins_Section SHALL disable all five Sample_Buttons so that activating any of them by click, tap, or keyboard (Enter or Space) starts no action and opens no file picker.
3. WHEN a Run_In_Progress ends with any outcome (a verdict, a user cancel, or an error), THE Program_And_Pins_Section SHALL enable all five Sample_Buttons in the same render update that shows the outcome.
4. WHEN the page loads and no Run_In_Progress exists, THE Program_And_Pins_Section SHALL show all five Sample_Buttons enabled.
5. WHEN a visitor activates "Choose .hex file", "Try the sample", "Try a chat-written sketch", or "Try one it can't check" while no Run_In_Progress exists, THE Program_And_Pins_Section SHALL run only that button's own action (open a file picker for "Choose .hex file", or load the named precompiled example), and SHALL leave the other four Sample_Buttons unchanged in label and order.
6. WHEN a visitor activates "Download the sample" while no Run_In_Progress exists, THE Program_And_Pins_Section SHALL offer two file downloads, unchanged from today: the bundled Crosswalk buggy HEX named "crosswalk-buggy.hex", byte for byte, and the Crosswalk pin map named "crosswalk-pins.json" in the fixture.json format with a plainName field per pin, and SHALL not start a run.

### Requirement 2: Chat-written sketch sample

**User Story:** As a visitor, I want one click that loads a sketch written by a chat assistant, so that I can watch the gremlins break it.

#### Acceptance Criteria

1. WHEN the visitor activates the "Try a chat-written sketch" control, THE Web_App SHALL load the bytes of `exorcism-demo/benchmark/round2/chatgpt-high.hex` as the program, with zero bytes edited, added, or removed.
2. THE Web_App SHALL bundle the Chat_Sketch_Sample HEX at build time, so that loading it causes 0 network requests.
3. WHEN the Chat_Sketch_Sample is loaded, THE Web_App SHALL show the program name "chat-written-crossing.hex" in place of the source file name.
4. WHEN the Chat_Sketch_Sample is loaded, THE Web_App SHALL apply the Crosswalk_Pin_Map and SHALL label pins with their plain names (for example WALK and DONT_WALK) instead of raw pin numbers.
5. WHEN the Chat_Sketch_Sample is loaded, THE Web_App SHALL set the rule text to exactly "all of (WALK is 1, DONT_WALK is 1) must never happen." and SHALL replace any rule text that was there before.
6. WHEN the Chat_Sketch_Sample is loaded, THE Web_App SHALL select the Masher as the only selected gremlin, set the run count to 24, the seed to 20261101, and the run length to 1000 ms (16,000,000 CPU cycles at 16 MHz), and SHALL replace any earlier settings.
7. WHEN the visitor unleashes the gremlins on the loaded Chat_Sketch_Sample without changing the rule text or settings, THE Web_App SHALL show the verdict BROKE, together with the trace that caused it, and SHALL report the violation as found on try 1 of 24.
8. THE Acceptance_Test for the Chat_Sketch_Sample SHALL assert the verdict BROKE on try 1 of 24 and SHALL record the Fingerprint that the run produces, without asserting a Fingerprint value that was written before the run.
9. IF the Acceptance_Test for the Chat_Sketch_Sample and the system disagree, THEN the implementer SHALL stop, SHALL report the expected result, the actual result, and the evidence, and SHALL NOT change, weaken, or delete the test until the user decides.
10. IF the bundled Chat_Sketch_Sample HEX cannot be loaded (missing, empty, or rejected by the HEX parser), THEN THE Web_App SHALL show an error message saying the sample could not be loaded, SHALL keep the previously loaded program, rule text, and settings unchanged, and SHALL NOT show a BROKE, HELD, or COULDN'T TELL verdict for it.

### Requirement 3: Program the checker cannot judge

**User Story:** As a visitor, I want a sample that shows a COULDN'T TELL verdict, so that I can see what the checker does when it has no usable signal.

#### Acceptance Criteria

1. WHEN the visitor activates the "Try one it can't check" control, THE Web_App SHALL load the contents of `fixtures/serial_hello/build/serial_hello.ino.hex` byte-for-byte, with no edit, and SHALL make that HEX the program for the next run.
2. THE Web_App SHALL bundle the Unjudgeable_Sample HEX at build time, so that loading it makes 0 network requests.
3. THE Unjudgeable_Pin_Map SHALL be a JSON file stored next to the `serial_hello` fixture in `fixtures/serial_hello`.
4. THE Unjudgeable_Pin_Map SHALL map LED to PB5 as an output and BUTTON to PD2 as an input where pressed is low.
5. WHEN the Unjudgeable_Sample is loaded, THE Web_App SHALL read its pin map from the Unjudgeable_Pin_Map.
6. WHEN the Unjudgeable_Sample is loaded, THE Web_App SHALL set the rule text to exactly "LED is 1 must never last 500 ms or longer." and SHALL replace any rule text the visitor entered before.
7. WHEN the Unjudgeable_Sample is loaded, THE Web_App SHALL select the Masher as the only gremlin, set the run count to 8, set the seed to 20261101, and set the run length to 1000 ms per run, replacing any previous selections.
8. WHEN the visitor unleashes the gremlins on the loaded Unjudgeable_Sample, THE Web_App SHALL show the verdict COULDN'T TELL, using the exact verdict string, with a reason that contains the words "serial port".
9. WHEN the visitor unleashes the gremlins on the loaded Unjudgeable_Sample, THE Web_App SHALL NOT show the verdict BROKE or HELD, and SHALL NOT show a violation trace.
10. IF the Unjudgeable_Sample HEX or the Unjudgeable_Pin_Map fails to load or parse, THEN THE Web_App SHALL show an error message saying the sample could not be loaded, SHALL keep the previously loaded program, rule text, and settings unchanged, and SHALL NOT show any verdict.
11. THE Acceptance_Test for the Unjudgeable_Sample SHALL assert the verdict COULDN'T TELL and a reason that contains the words "serial port".
12. IF the Acceptance_Test for the Unjudgeable_Sample and the system disagree, THEN the implementer SHALL report the expected result, the actual result, and the evidence, and SHALL leave the test unchanged until the user decides.

### Requirement 4: Sub-millisecond story wording

**User Story:** As a visitor reading "What happened", I want a very short violation described in microseconds, so that the story does not say it lasted zero milliseconds.

#### Acceptance Criteria

1. WHEN a violation is a Short_Span (0 to 7999 CPU cycles inclusive, under 500 microseconds at 16 MHz), THE Plain_Story_Builder SHALL write the sentence "It lasted X.Y microseconds, too short to round to a whole millisecond." into the Story_Panel, with X.Y replaced by the value from criterion 2.
2. THE Plain_Story_Builder SHALL compute X.Y as the span length in cycles divided by 16 (microseconds at 16 MHz), rounded to exactly one decimal place, and SHALL always show the decimal digit (for example "5.0", not "5").
3. WHEN a violation lasts 78 cycles, THE Plain_Story_Builder SHALL write X.Y as 4.9.
4. WHEN a violation lasts 8000 cycles or more, THE Plain_Story_Builder SHALL keep the existing wording for that span and SHALL NOT write the microsecond sentence.
5. THE implementation SHALL change only the expected text in Property 21 of `tests/ui/plain-story.property.test.ts`, and only for spans under 8000 cycles. Property 21 expected text for spans of 8000 cycles or more SHALL stay as it is.
6. THE tasks.md of this spec SHALL contain a note for the tasks phase recording the Property 21 expected-text change, naming the file `tests/ui/plain-story.property.test.ts` and the 8000-cycle limit.
7. THE implementation SHALL keep every test other than the Property 21 expected text unchanged, and all tests SHALL pass after the change.
8. FOR a span of 8000 cycles or more, THE Plain_Story_Builder SHALL never write "0 ms" for that span, because plainMs rounds half up (8000 cycles gives "1 ms").

### Requirement 5: Verdict headline on the fixed program's card

**User Story:** As a visitor in the Fix_View, I want the verdict word to stand out on the fixed program's card, so that I can see the outcome at a glance.

#### Acceptance Criteria

1. WHEN the Fixed_Card is displayed with a verdict, THE Fixed_Card SHALL show the verdict word as a large headline, using exactly one of the strings "HELD", "BROKE", or "COULDN'T TELL", with a font size larger than the Campaign_Line text.
2. WHEN the Fixed_Card is displayed with a verdict, THE Fixed_Card SHALL colour the headline with the same colour that the Web_App uses for that Verdict in every other place where it renders that Verdict.
3. WHEN the Fixed_Card is displayed with a verdict, THE Fixed_Card SHALL place the headline above the Campaign_Line.
4. WHEN the Fixed_Card verdict is HELD, THE Fixed_Card SHALL show the HELD_Text in the Campaign_Line, with the run count N equal to the number of emulated runs actually completed.
5. IF the Fixed_Card has no verdict because the run has not finished or has failed, THEN THE Fixed_Card SHALL show no verdict word.

### Requirement 6: COULDN'T TELL screen text

**User Story:** As a visitor who got COULDN'T TELL, I want clear text where a replay would be, so that I know no replay exists and why.

#### Acceptance Criteria

1. WHEN the Verdict is COULDN'T TELL, THE Stage SHALL show the exact text "Nothing to replay." in a solid note panel (opaque background) in place of the replay view, and SHALL NOT show any replay playback controls.
2. WHILE no run has finished since the page loaded or since the last reset, THE Tab_Area SHALL show the exact idle text "The story of the run shows here after you unleash the gremlins."
3. WHEN the Verdict is COULDN'T TELL, THE Tab_Area SHALL show the exact text "No replay: the verdict card explains why this program has no result." and SHALL NOT show the idle text from criterion 2.
4. WHEN a new run starts after a COULDN'T TELL Verdict, THE Stage and THE Tab_Area SHALL remove the COULDN'T TELL texts from criteria 1 and 3 before the new Verdict is shown.

### Requirement 7: No stale pin levels while the reducer runs

**User Story:** As a visitor, I want old pin levels removed while the reducer works, so that I never read levels that belong to a different trace.

#### Acceptance Criteria

1. WHILE the Reducer is running and the scene is dimmed, THE Web_App SHALL hide every Pin_Level_Column, so that no pin level from any previous trace is visible.
2. WHEN the Reducer starts, THE Web_App SHALL hide every Pin_Level_Column before the scene is dimmed or in the same render update as the dimming.
3. WHEN the Reducer finishes with a resulting trace, THE Web_App SHALL show the Pin_Level_Columns for that resulting trace only, in the same render update as the un-dimming of the scene.
4. IF the Reducer stops without producing a resulting trace, THEN THE Web_App SHALL keep every Pin_Level_Column hidden and un-dim the scene.

### Requirement 8: Gremlin picker on the Upload_Path

**User Story:** As a visitor with my own program, I want to see only gremlins that can act on my pins, so that I do not pick one that has nothing to attack.

#### Acceptance Criteria

1. WHILE the Upload_Path is shown, THE Gremlin_Picker SHALL list only gremlins whose targets are all Digital_Input_Targets of the loaded pin map.
2. WHILE the Upload_Path is shown AND the visitor has not touched a Chip AND the visitor has not tried to unleash, THE Upload_Path SHALL keep the message "Pick at least one gremlin." hidden.
3. IF zero gremlins are selected AND the visitor has touched a Chip, THEN THE Upload_Path SHALL show the message "Pick at least one gremlin." within the same user interaction that touched the Chip.
4. IF zero gremlins are selected AND the visitor tries to unleash, THEN THE Upload_Path SHALL show the message "Pick at least one gremlin." and SHALL NOT start an emulated run.
5. WHEN the visitor selects at least one gremlin while the message "Pick at least one gremlin." is shown, THE Upload_Path SHALL hide that message within the same user interaction.

### Requirement 9: Page description and noscript block

**User Story:** As a visitor whose browser blocks scripts, or who finds the page in a search result, I want a plain description of the app, so that I know what it does.

#### Acceptance Criteria

1. THE Index_Page SHALL contain exactly one meta description element.
2. THE Index_Page SHALL contain exactly one noscript block that is a direct child of the body element.
3. THE meta description and the noscript block SHALL each state, in plain English, that the app runs a compiled program on a simulated ATmega328P chip, that seeded gremlins attack the program's inputs, and that the app reports one of three verdicts.
4. THE noscript block SHALL name the three verdicts BROKE, HELD, and COULDN'T TELL, each spelled exactly as written here.
5. THE noscript block SHALL contain the HELD_Text as the exact string "No violation found in N emulated runs of this gremlin set. Not a proof.", with the letter N kept as a literal placeholder.
6. THE noscript block SHALL NOT state or imply a run count, a pass result, or a verdict for any specific program.
7. THE Index_Page text, including the meta description, the noscript block, and the document title, SHALL contain none of the words safe, secure, guaranteed, certified, real-time, first, unique, or shortest, matched case-insensitively as whole words and as suffixed forms (for example "safely", "security").
8. THE Index_Page text, including the meta description, the noscript block, and the document title, SHALL contain no board brand names.
