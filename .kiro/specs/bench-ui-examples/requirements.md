# Requirements Document

Note (Nov 26, 2026): user-facing error message texts were updated with the owner's approval; the quotes below match the app.

## Introduction

bench-ui-examples builds on bench-ui-core. The goal: a judge or viewer with no electronics background understands the page in 5 seconds, and an engineer can still see every exact detail. The App gets a plain view by default with a "Show technical details" switch, a gallery of three examples (Crosswalk, Garage door, Heartbeat) that each run the full flow, plain-English verdicts and stories, a violation span that is no longer cut at the violation, scenes for Garage and Heartbeat, rule editing and a gremlin picker.

The Engine in `src/engine/` does not change. No new npm package is added. No committed test, baseline, fixture or example file changes. Every glossary term of `.kiro/specs/bench-ui-core/requirements.md` keeps its meaning here unless this document redefines it.

Facts checked in the workspace that constrain this feature:

- G1. Fixtures (`examples/*/fixture.json`) list every signal in one `pins` list, each pin with `direction` `"input"` or `"output"`. Crosswalk: input REQUEST (activeLevel low); outputs CAR_GREEN, CAR_YELLOW, CAR_RED, WALK, DONT_WALK. Garage: inputs CLOSE and BEAM_CLEAR (both activeLevel low); outputs MOTOR_CLOSE, MOTOR_OPEN, LAMP. Heartbeat: input PULSE (activeLevel low); output HEARTBEAT. No pin has `restState: "active"` and no pin is analog.
- G2. Rules files. Crosswalk: "all of (CAR_GREEN is 1, WALK is 1) must never happen." Garage: "Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true." Heartbeat holds two rules: "HEARTBEAT is 0 must never last 600 ms or longer." and "HEARTBEAT is 1 must never last 600 ms or longer."
- G3. meta.json defaults. Crosswalk: masher, seed 20261101, 24 runs, Run_Cycles 16,000,000. Garage: bouncer + masher, seed 20261102, 40 runs, Run_Cycles 10,000,000. Heartbeat: stuck, seed 20261103, 24 runs, Run_Cycles 16,000,000.
- G4. Committed engine tests pin `violatingRunIndex` 3 / 7 / 1 and reductions 8 → 3 / 7 → 3 / 2 → 1 with fingerprints `47078989121ebc1d` / `616062947f71a1ae` / `19827a4e0a7ad440` (`src/engine/__tests__/reducer-examples.test.ts`, `tests/examples/*.test.ts`). These agree with the user's acceptance values (run 4 of 24, run 8 of 40, run 2 of 24).
- G5. `GREMLIN_CATALOGUE` (`src/engine/gremlins/catalogue.ts`) holds six gremlins, each with one `targets` entry: masher, bouncer, stuck (digital), dropout (digital with `restState: "active"`), spike and drifter (analog). Bouncer `gapCycles` defaults to 1,600 to 48,000 cycles. The Engine renders five rule forms: never, notLongerThan, respond, count, hold.
- G6. `failureStory` takes optional `labels` (`active`, `inactive`, optional `held`) and an optional `violationSpan { lengthCycles, cut }`. A press is an event whose value equals the pin's press value (0 for an active-low pin); a held press has no later `"release"` of the same signal in the list.
- G7. `readRulesFile` reports parse failures as "Line N: No rule template matches at position P (counting from 0); allowed there: X." (`src/engine/rules/parse.ts`, `rules-file.ts`). `compileRuleSet` reports structure and fixture problems with no line number. A signal that is not mapped to a pin compiles and becomes a COULDN'T TELL reason at campaign time.
- G8. `runEventList` stops after the step in which its checker reports a violation (bench-ui-core F8). The Checker is a plain function type, so UI code can wrap a compiled checker without changing the Engine.
- G9. Committed UI tests pin these current exports, which therefore keep their behaviour: `LANES` (REQUEST, CAR_GREEN, CAR_YELLOW, CAR_RED, WALK, DONT_WALK, GREMLINS) and `windowEnd` (`model/timeline.ts`), `shrinkText` ("8 events -> 3 events") and `elapsedText` ("Elapsed 0:00") (`model/format.ts`), `STORY_LABELS` and `buildStoryInput` with REQUEST labels only (`model/story-input.ts`), `SCENE_SIGNALS`, `SCENE_NOTE` ("Illustrative scene · firmware outputs shown") and `sceneAt` (`model/scene.ts`), `coverageLine` and `NEVER_RULE_PART` (`model/coverage.ts`), the `FlowState` functions (`model/flow.ts`), and `CROSSWALK_TEXTS` / `loadCrosswalk` (`data/crosswalk.ts`).
- G10. The current campaign panel labels the run field "Runs (N)" and the seed field "Seed"; the fix panel title is "Sketch source" (aria-label "Sketch source changes") and shows "buggy -> fixed"; the apply-fix button reads "Load this example's bundled fixed .hex"; the BROKE card holds the trace table in a scrolling region; `SHRINK_LABEL` in `views/panels.ts` is "The smallest replay this reducer found.".
- G11. `scripts/guard.mjs` rejects the claim words (including "first") as whole words anywhere under `src/ui`, code and comments included. `BANNED_WORDS` (`src/engine/copy-rules.ts`) does not hold "safety". `BOARD_BRAND_NAMES` and `wholeWordMatches` live in `tests/examples/examples-support.ts`.
- G12. The UI Span_Helper `spanFor` (`src/ui/app/model/span.ts`) returns `{ end, lengthCycles, cut }`, or null for count and hold rules. The test helper `violationSpan` (`tests/examples/examples-support.ts`) names the same values `spanCycles` and `cutByReplayEnd`.
- G13. Colours: amber selection is #F3C982 (`--c-gremlin` in `src/ui/app/app.css`, "Gremlin events / selection" in `docs/design-direction.md`); coral is #FF8A80 (`--c-broke`). The design guide labels the garage beam "Beam interrupted"; this document keeps the user's label "Beam blocked", and the Agent updates the "Beam interrupted" line of `docs/design-direction.md` to "Beam blocked".
- G14. The Speed_Page is out of scope for this feature, including the "->" rule of Requirement 14.4.
- G15. Requirement 19 is checked by the user's manual browser check.
- G16. `examples/crosswalk/buggy/buggy.ino` lines 94-99 return before the walk-light code once cars go green, so WALK stays on until the next press; the overlap does not end by itself. This is why the crosswalk and heartbeat violation spans are cut at the Display_Limit, while the garage span ends on its own.

## Glossary

- **App**, **Engine**, **Engine_Worker**, **Worker_Host**, **Message_Codec**, **Canonical_Sentence**, **Campaign**, **Run_Count**, **Campaign_Seed**, **Run_Cycles**, **Buggy_Build**, **Fixed_Build**, **Verdict_Card**, **HELD_Text**, **Coverage_Line**, **Gremlin_Event**, **Rest_Event**, **Reducer**, **Reduced_List**, **Shrink_Label**, **Minimality_Tooltip**, **Replay**, **Reached_End**, **Trace_Fingerprint**, **Violation_Cycle**, **Target_Rule**, **Display_Margin**, **Timeline_Window**, **Timeline_Event**, **Span_Helper**, **Failure_Story**, **Scene**, **Timeline**, **Lane**, **Cursor**, **Ms_Text**, **Diff_Hunk**, **UI_Clock**, **Banned_Words**, **Board_Brand_Names**, **UI_Strings_Scan**, **Global_Checks**, **Speed_Page**, **Agent**: as defined in bench-ui-core.
- **Apply_Fix**: the flow started by the button "Try the fixed program". This redefines the bench-ui-core term.
- **Example**: one of the bundled examples, identified by its Example_Id `crosswalk`, `garage` or `heartbeat`, with the files `buggy/buggy.hex`, `fixed/fixed.hex`, `fixture.json`, `rules.txt`, `meta.json`, `buggy/buggy.ino` and `fixed/fixed.ino` under `examples/<Example_Id>/`.
- **Current_Example**: the Example whose card is selected in the Example_Gallery.
- **Example_Gallery**: the row of three Example_Cards in the App.
- **Example_Card**: the selectable card of one Example, showing its Card_Text.
- **Details_Switch**: the header switch labelled "Show technical details".
- **Plain_View**: the App state while the Details_Switch is off.
- **Technical_View**: the App state while the Details_Switch is on.
- **Details_Key**: the localStorage key `hexorcist.showTechnicalDetails`, holding `"on"` or `"off"`.
- **Technical_Element**: a UI element that this document marks as shown only in the Technical_View.
- **Example_Copy**: the UI data table that holds, per Example_Id, the Card_Text, the Rule_Headline and the Plain_Broke_Sentence (Requirement 4).
- **Card_Text**, **Rule_Headline**, **Plain_Broke_Sentence**: the three texts of one Example_Copy entry.
- **Rule_Area**: the "Rule area" panel that holds the Rule_Headline, the Canonical_Sentence lines and the "Edit rule" button.
- **Example_Rule_Set**: the rule set that `readRulesFile` reads from the Current_Example's `rules.txt`.
- **Active_Rule_Set**: the rule set the next Campaign uses: the Example_Rule_Set, or the rule set from the Rule_Box.
- **Custom_Rule_Set**: an Active_Rule_Set whose list of Canonical_Sentences, in order, differs from that of the Example_Rule_Set.
- **Friendly_Label**: the plain name of a fixture signal from the Friendly_Label table (Requirement 5).
- **Story_Labels**: the `labels` record passed to `failureStory` for the Current_Example (Requirement 10). This redefines the bench-ui-core term, which held REQUEST only.
- **Plain_Story_Label**: per input signal, the six plain story phrases of Requirement 11.
- **Plain_Story**: the UI-side story sentence built by the Plain_Story_Builder (Requirement 11).
- **Plain_Story_Builder**: the pure function under `src/ui/app/model/` that builds the Plain_Story.
- **Exact_Story**: the Failure_Story text, unchanged, shown under the heading "Exact story".
- **Story_Card**: the part of the BROKE Verdict_Card that holds the heading of Requirement 11.20, the Plain_Story and the Gremlin_Legend lines.
- **Gremlin_Legend**: the table of one plain legend line per gremlin id (Requirement 11).
- **Plain_Ms**: the text "<k> ms" where k = floor((cycles + 8,000) / 16,000), written in base 10; WHEN k is 1,000 or more, k carries a thousands comma ("1,000 ms", "3,833 ms"); WHEN k is below 1,000, k carries no comma.
- **Story_Ending**: the UI data table that holds, per Target_Rule Canonical_Sentence, the ending text of sentence 2 of the Plain_Story (Requirement 11.5). It holds 5 entries: the 4 Canonical_Sentences of the three Examples and the entry for any other rule.
- **Span_Sentence**: the UI data table that holds the sentence 3 text for a span with `cut` false: per Example_Id, and one entry for custom rules; it holds 4 entries (Requirement 11.6).
- **Display_Limit**: 16,000,000 cycles (1,000 ms at 16 MHz).
- **Display_Replay**: a replay used for display: a fresh bridge, the same HEX, fixture, rule set and ordered event list as a Replay, `maxStepCycles` 160,000, `runCycles` = min(v + Display_Limit, 4,294,967,296) where v is the Violation_Cycle of the matching Replay, and a Checker_Wrapper in place of the compiled checker. No snapshot is used.
- **Checker_Wrapper**: UI code that calls the compiled checker of the rule set, records the violation with the lowest cycle that the compiled checker reports, and returns a `CheckerOutcome` with `violation: null` and the same `cannotCheck` value to `runEventList`, so the run continues past the violation.
- **Display_Span**: the span the Span_Helper returns for the Target_Rule with v = the Replay's Violation_Cycle, the Display_Replay output edges and M = min(v + Display_Limit, Display_Replay Reached_End).
- **Display_Window**: the cycle range from 0 to min(Display_Span end + Display_Margin, Display_Replay Reached_End), both ends included; for count and hold rules, from 0 to min(v + Display_Margin, Display_Replay Reached_End).
- **Rule_Box**: the text box opened by the "Edit rule" button.
- **Rule_Box_Check**: the pure function under `src/ui/app/model/` that reads the Rule_Box text with `readRulesFile`, compiles the result with `compileRuleSet` against the Current_Example's fixture, and returns a rule set or a list of Rule_Errors.
- **Rule_Error**: one problem found by the Rule_Box_Check, with an optional line number, an optional 1-based position and a plain reason text.
- **Sentence_Pattern**: one of the five rule-form templates (never, notLongerThan, respond, count, hold) listed beside the Rule_Box.
- **Gremlin_Picker**: the 3 × 2 grid of six Gremlin_Tiles.
- **Gremlin_Tile**: the tile of one gremlin of `GREMLIN_CATALOGUE`.
- **Compatible**: a gremlin is Compatible with a fixture when, for at least one entry of its catalogue `targets`, the fixture holds an input pin of that kind (`digital` or `analog`) and, when the entry has `restState: "active"`, a pin with `restState: "active"`.
- **Selected_Gremlin_Set**: the ordered list of gremlins whose tiles are selected, as `GremlinSpec` entries with no `params`. The defaults keep the order of the Current_Example's meta.json `gremlinSet`; a gremlin the user selects is appended at the end; a gremlin the user deselects is removed and the rest keep their order. This order is the order the Engine draws gremlins from the PRNG; Gremlin_Tiles still display in `GREMLIN_CATALOGUE` order.
- **Reduction_Row**: the row that reports the shrink of a reduction.
- **Gremlin_Log**: the disclosure "Show the full gremlin log (N moves)" inside a BROKE Verdict_Card, collapsed by default, that holds the trace table of the BROKE trace.
- **Lane_Word**: the plain value word of a Lane at a cycle (Requirement 16).
- **Essential_Text**: the verdict title, the Plain_Broke_Sentence and other verdict finding text, the HELD_Text, the Rule_Headline, the Plain_Story, the "What is this?" paragraph, the three-step strip, the Reduction_Row sentence, button labels and Rule_Error texts.
- **Example_Acceptance_Test**: the new Vitest file under `tests/ui/` that calls the Worker_Host in Node for all three Examples (Requirement 21).

## Requirements

### Requirement 1: Technical details switch

**User Story:** As a viewer with no electronics background, I want a plain page by default, so that I understand it quickly; as an engineer, I want one switch that shows every exact detail.

#### Acceptance Criteria

1. THE App SHALL show the Details_Switch in the header in both the Plain_View and the Technical_View, labelled "Show technical details", reachable with Tab, exposed with `role="switch"`, with `aria-checked="true"` in the Technical_View and `aria-checked="false"` in the Plain_View.
2. WHEN the App loads and reading the Details_Key returns `"on"`, THE App SHALL start in the Technical_View.
3. IF localStorage is unavailable, reading the Details_Key throws, or reading the Details_Key returns any value other than `"on"` (including `null` and `"off"`), THEN THE App SHALL start in the Plain_View with the Details_Switch off.
4. WHEN the user clicks the Details_Switch, or presses Space while the Details_Switch has keyboard focus, THE App SHALL toggle the view, write `"on"` or `"off"` to the Details_Key inside a `try`/`catch` block, and keep the new view and the keyboard focus whether or not the write throws.
5. WHILE the Technical_View is shown, THE App SHALL show every Technical_Element with the same text and values that the App shows for it before this feature, except for the renames of Requirements 12, 13 and 14.
6. WHILE the Plain_View is shown, THE App SHALL leave every Technical_Element out of the document or give it the `hidden` attribute, so that no Technical_Element is on screen or in the accessibility tree.
7. WHEN the user changes the Details_Switch, THE App SHALL keep the verdicts, the Replay, the Cursor, the reduction result, every field value, the Current_Example, the Active_Rule_Set and the Selected_Gremlin_Set unchanged, and SHALL start, cancel or restart no Campaign, reduction or Replay.
8. THE App SHALL show every Essential_Text in both the Plain_View and the Technical_View.

### Requirement 2: Header, explanation and steps

**User Story:** As a judge, I want the header to tell me what this is in one paragraph, so that I know what I am looking at.

#### Acceptance Criteria

1. WHILE the Plain_View is shown, THE App SHALL show the header subtitle "Runs in your browser" and SHALL show no "ATmega328P · Browser only" chip line.
2. WHILE the Technical_View is shown, THE App SHALL show the header chip line "ATmega328P · Browser only" and SHALL show no "Runs in your browser" subtitle.
3. WHEN the Details_Switch changes, THE App SHALL swap the subtitle and the chip line without a page reload and SHALL leave the tagline, the "What is this?" paragraph and the three-step strip unchanged.
4. THE App SHALL show, directly below the tagline and in both views, a paragraph headed "What is this?" with the exact text "Small devices like traffic lights and garage doors run tiny programs. Hexorcist runs the real compiled program in your browser, sends mischievous gremlins to press its buttons at awkward moments, and checks your rules. If a rule breaks, it shrinks the attack down to the few moves that matter and replays it."
5. THE App SHALL show, below the "What is this?" paragraph and in both views, a three-step strip of three separate items with the exact texts "1. Pick a device and a rule.", "2. Gremlins attack its inputs." and "3. See where it broke, shrunk to the few moves that matter.", in that order.

### Requirement 3: Example gallery and full flow per Example

**User Story:** As a student, I want three examples, each with the whole flow, so that I can see different kinds of bugs.

#### Acceptance Criteria

1. THE App SHALL show the Example_Gallery with three Example_Cards in the order crosswalk, garage, heartbeat, each showing its Card_Text.
2. WHEN the App loads, THE App SHALL select the crosswalk Example_Card and apply the crosswalk Example as criterion 4 states, with no Campaign started.
3. THE App SHALL import the seven files of every Example with Vite `?raw` and SHALL make no network request for them.
4. WHEN the user selects an Example_Card that is not selected while no Campaign, reduction or Replay is running, THE App SHALL make that Example the Current_Example, set the Active_Rule_Set to its Example_Rule_Set, set the Rule_Box text to its `rules.txt` text, clear the Rule_Errors, set the Selected_Gremlin_Set, Run_Count, Campaign_Seed and Run_Cycles to its meta.json defaults, keep the Details_Switch state, clear the verdicts, the Reduction_Row, the stories, the Replay, the Scene and the Timeline, and show the Scene of that Example.
5. WHEN the user selects the Example_Card that is already selected, THE App SHALL leave the App state unchanged.
6. WHILE a Campaign, reduction or Replay is running, THE App SHALL disable every Example_Card that is not selected and SHALL ignore every Example_Card selection.
7. THE App SHALL run, for each Example, the flow that bench-ui-core defines for Crosswalk: Campaign, BROKE card, automatic reduction with shrink, Exact_Story, Plain_Story, Scene, Timeline, "Try the fixed program" with the code diff, "Replay again", "Try removing", and the HELD card with its Coverage_Line, using that Example's files and meta.json defaults.
8. IF a file of the Current_Example fails to parse, THEN THE App SHALL show each failing file name with its parse reasons (the `readRulesFile` "Line N: ..." texts unchanged), SHALL disable "Unleash gremlins" until another Example is selected, and SHALL keep the other Example_Cards selectable.

### Requirement 4: Example copy and rule headline

**User Story:** As a viewer, I want each example and its rule described in plain words, so that I know what is being checked.

#### Acceptance Criteria

1. THE Example_Copy SHALL hold for `crosswalk`, character for character: Card_Text "Crosswalk: a traffic light with a walk button", Rule_Headline "Cars and walkers must never get a green at the same time.", Plain_Broke_Sentence "The light gave cars and walkers a green at the same time."
2. THE Example_Copy SHALL hold for `garage`, character for character: Card_Text "Garage door: a door that must stop when something blocks the beam", Rule_Headline "When the beam is blocked, the door must stop closing within 20 ms.", Plain_Broke_Sentence "After the beam was blocked, the door kept closing for more than 20 ms."
3. THE Example_Copy SHALL hold for `heartbeat`, character for character: Card_Text "Heartbeat: a light that must keep blinking", Rule_Headline "The heartbeat light must never freeze on or off for 600 ms.", Plain_Broke_Sentence "The heartbeat light froze for 600 ms or longer."
4. WHILE the Active_Rule_Set is a Custom_Rule_Set, THE App SHALL use the Rule_Headline "Custom rule" and the Plain_Broke_Sentence "The program broke your rule." in place of the Current_Example's Example_Copy texts.
5. WHILE the Active_Rule_Set is not a Custom_Rule_Set, THE App SHALL use the Rule_Headline and the Plain_Broke_Sentence of the Current_Example's Example_Copy entry, including when an edited rule set equals the Example_Rule_Set again.
6. THE App SHALL show the Rule_Headline of criterion 4 or 5 as the topmost text of the Rule_Area in both views; the Rule_Headline is not a Technical_Element.
7. WHILE the Technical_View is shown, THE App SHALL show under the Rule_Headline every Canonical_Sentence of the Active_Rule_Set, unchanged and in rule-set order, in monospace, one per line (2 lines for heartbeat); these lines are Technical_Elements.

### Requirement 5: Friendly signal labels

**User Story:** As a viewer, I want signals called by what they do, so that I do not have to decode pin names.

#### Acceptance Criteria

1. THE Friendly_Label table SHALL map REQUEST "Walk button", CAR_GREEN "Car light: green", CAR_YELLOW "Car light: yellow", CAR_RED "Car light: red", WALK "Walk sign", DONT_WALK "Don't walk sign", CLOSE "Close button", BEAM_CLEAR "Obstacle beam", MOTOR_CLOSE "Motor: closing", MOTOR_OPEN "Motor: opening", LAMP "Warning lamp", PULSE "Pulse input" and HEARTBEAT "Heartbeat light".
2. THE Friendly_Label table SHALL hold exactly one entry for each input and output signal in the `pins` lists of the three Example `fixture.json` files, with signal names matched case-sensitively.
3. WHILE the Plain_View is shown, THE App SHALL show the Friendly_Label, and not the signal name, in Lane labels, Scene labels, the Plain_Story and the Gremlin_Tiles, and SHALL show the Rule_Box text, the Rule_Errors, the Canonical_Sentences and the Exact_Story unchanged.
4. WHILE the Technical_View is shown, THE App SHALL show each Friendly_Label of criterion 3 followed by the signal name in monospace, in the same element; the signal name is a Technical_Element.
5. IF a signal has no Friendly_Label entry, THEN THE App SHALL show the signal name once in place of the Friendly_Label, in both views, with no second copy of the signal name in the Technical_View.
6. THE App SHALL look up Friendly_Labels with a pure function under `src/ui/app/model/`.

### Requirement 6: BROKE card

**User Story:** As a maker, I want the BROKE card to say in plain words what went wrong, with the exact values one switch away.

#### Acceptance Criteria

1. WHEN a Campaign finishes with BROKE, THE BROKE Verdict_Card SHALL show, in both views, the title "BROKE" and the Plain_Broke_Sentence of Requirement 4.
2. WHEN a Campaign finishes with BROKE, THE BROKE Verdict_Card SHALL show, in both views, the run text "run k of N" with k = `trace.runIndex` + 1 and N = the Run_Count of that Campaign.
3. WHILE the Technical_View is shown, THE BROKE Verdict_Card SHALL show, as Technical_Elements, the Target_Rule Canonical_Sentence, the observed text of bench-ui-core Requirements 8.2 to 8.4 (including "not driven"), the Violation_Cycle written with `cycleText` followed by " cycles", and "Seed: <seed>" with the Campaign_Seed.
4. WHEN the Details_Switch changes, THE BROKE Verdict_Card SHALL show the elements of criterion 3 in the Technical_View and hide them in the Plain_View, without a new Campaign, reduction or Replay.
5. THE App SHALL show one Gremlin_Log per BROKE Verdict_Card, including a BROKE Verdict_Card of the Fixed_Build, inside that card and in both views, collapsed when the Gremlin_Log appears.
6. WHEN the Details_Switch changes, THE App SHALL keep the open or closed state of every Gremlin_Log.
7. THE Gremlin_Log summary SHALL read "Show the full gremlin log (N moves)", with N = the number of Gremlin_Events in the unreduced `trace.eventList` (Rest_Events excluded), "1 move" when N = 1 and "0 moves" when N = 0.
8. THE Gremlin_Log table SHALL list every entry of `trace.eventList` in list order, Rest_Events included, with the columns of bench-ui-core Requirement 8.7, and SHALL stay unchanged while a reduction runs and after the reduction ends.
9. WHILE a BROKE Verdict_Card is shown, THE App SHALL keep the trace that caused the BROKE visible without the user opening anything: the Gremlin_Log summary inside the card at all times, the reduced moves list of criterion 10 once a reduction result exists, and, once the reduction ends with a result, the Reduced_List rows with their "Try removing" buttons, the Plain_Story and the Timeline.
10. WHEN a reduction result exists for a BROKE Verdict_Card, THE BROKE Verdict_Card SHALL list the reduced moves in plain words inside the card, in both views, one line per Gremlin_Event of the Reduced_List in list order, each line written as "<time>: <phrase>" with <time> the Ms_Text of the event and <phrase> the Plain_Story_Label full phrase for that event, for example "<time>: pressed the walk button", with Rest_Events skipped; WHILE the reduction runs, THE BROKE Verdict_Card SHALL show no reduced moves list and no placeholder for it.

### Requirement 7: HELD card

**User Story:** As a teacher, I want HELD in plain words and the exact bounded claim, so that nobody reads it as proof.

#### Acceptance Criteria

1. IF the HELD Verdict_Card is for the Fixed_Build, THEN THE HELD Verdict_Card SHALL show "No gremlin broke the fixed program in N tries." with N = the `runs` of the HELD verdict written in base 10 with no digit grouping, and "1 try" in place of "1 tries" when N = 1.
2. IF the HELD Verdict_Card is for the Buggy_Build, THEN THE HELD Verdict_Card SHALL show "No gremlin broke this program in N tries." with the same N rule as criterion 1.
3. THE HELD Verdict_Card SHALL show, directly after the sentence of criterion 1 or 2 and in both the Plain_View and the Technical_View, the `text` of the HELD verdict from `computeVerdict`, unchanged character for character.
4. WHEN the Details_Switch changes, THE HELD Verdict_Card SHALL keep the sentence of criterion 1 or 2, the text of criterion 3 and the same N.
5. WHILE the Technical_View is shown, THE HELD Verdict_Card SHALL show the Coverage_Line as a Technical_Element.
6. WHEN a Coverage_Line part equals `NEVER_RULE_PART` ("Rule trigger: none, a never rule has no trigger"), THE App SHALL display "Checked at every cycle of every run (a never rule has no trigger)." in its place, keep the order of the parts and every other part unchanged, and leave `coverageLine` and `NEVER_RULE_PART` of `model/coverage.ts` unchanged.

### Requirement 8: COULDN'T TELL card

**User Story:** As a user, I want COULDN'T TELL in plain words with the exact reasons, so that I know what to change.

#### Acceptance Criteria

1. IF at least one part of the COULDN'T TELL reason, split on "; ", contains "which this emulator setup does not model" or starts with "Peripherals not supported", matched case-sensitively, THEN THE COULDN'T TELL Verdict_Card SHALL show, in both views, "This program can't be judged here: it uses a part this emulator does not model."
2. IF no part of the reason matches criterion 1, THEN THE COULDN'T TELL Verdict_Card SHALL show, in both views, "This program can't be judged here with these settings."
3. THE COULDN'T TELL Verdict_Card SHALL show, after the sentence of criterion 1 or 2 and in both views, the reason split on "; " as a list with one item per part, in reason order, each part unchanged; a reason with a single part gives one item.
4. THE COULDN'T TELL Verdict_Card SHALL show each hint of bench-ui-core directly under its matching part and no hint under a part that matches no hint.
5. THE COULDN'T TELL Verdict_Card SHALL show exactly one of the sentences of criteria 1 and 2.

### Requirement 9: Display replay and violation span

**User Story:** As a student, I want the story and timeline to show how long the violation really lasted, so that the failure is not cut off at the instant it is found.

#### Acceptance Criteria

1. WHEN a Replay of the original violating run, of the Reduced_List, of "Replay again" or of a "Try removing" list finishes with a violation, THE App SHALL run a Display_Replay of the same event list on the same build in the Engine_Worker.
2. THE Worker_Host SHALL run the Display_Replay with `runEventList` and the Checker_Wrapper, with no Engine change.
3. THE Worker_Host SHALL return for a Display_Replay its output edges in cycle order, its `endCycle` as its Reached_End, and the recorded violation with the lowest cycle, or no violation when none was recorded.
4. WHEN a Display_Replay finishes, THE violation recorded by the Checker_Wrapper SHALL have the same rule and the same cycle as the violation of the matching Replay.
5. FOR ALL Display_Replays, THE Display_Replay output edges with a cycle at or below the matching Replay's Reached_End SHALL equal the Replay's output edges, in the same order (prefix property).
6. THE App SHALL keep using the Replay, not the Display_Replay, for every Trace_Fingerprint, for "Replay again" and "Try removing" results and for the fixed-build replay text.
7. WHEN the Target_Rule has form never, notLongerThan or respond, THE App SHALL compute the Display_Span with the Span_Helper `spanFor` and SHALL pass `violationSpan { lengthCycles, cut }` from its result (the `spanCycles` and `cutByReplayEnd` of `violationSpan` in `tests/examples/examples-support.ts`) to `failureStory` and to the Plain_Story_Builder; for count and hold rules THE App SHALL pass no span.
8. THE Timeline and the Scene SHALL show the Display_Replay output edges over the Display_Window, with the Cursor limited to the Display_Window.
9. WHILE a Display_Replay is running, THE App SHALL show the Replay over the bench-ui-core Timeline_Window and the Failure_Story with the bench-ui-core span.
10. IF the Display_Replay returns an error, records no violation, or breaks criterion 4 or 5, THEN THE App SHALL show the Replay over the bench-ui-core Timeline_Window, SHALL call `failureStory` with the bench-ui-core span, SHALL show the error `kind` and `message` when an error was returned, and SHALL leave the verdict, the Trace_Fingerprint and the Reduction_Row unchanged.
11. WHEN the crosswalk Example runs with its meta.json defaults, THE Display_Span of the violating run (full event list) and the Display_Span of the Reduced_List SHALL each have `lengthCycles` (`spanCycles`) greater than 16,000 and `cut` (`cutByReplayEnd`) true at the 1,000 ms Display_Limit (G16).
12. WHEN the garage Example runs with its meta.json defaults, THE Display_Span of the Reduced_List SHALL have `lengthCycles` (`spanCycles`) 3,833,643 and `cut` (`cutByReplayEnd`) false, and THE Agent SHALL pin the computed `lengthCycles` and `cut` of the Display_Span of the violating run (full event list) in the test and report them.
13. WHEN the heartbeat Example runs with its meta.json defaults, THE Display_Span of the violating run (full event list) SHALL have `lengthCycles` (`spanCycles`) 1,152,850 and `cut` (`cutByReplayEnd`) false, and THE Display_Span of the Reduced_List SHALL have `lengthCycles` (`spanCycles`) greater than 16,000 and `cut` true. The full heartbeat run holds 2 Gremlin_Events and the Reduced_List holds 1; the span of the full run ends on its own, not by the replay end, and its value matches the committed examples test (span 1152850 cycles, not cut by replay end).
14. IF a Display_Span of criteria 11 to 13 differs from the stated values, THEN THE Agent SHALL stop, report the expected value, the actual value and the evidence, and wait for the user's decision.
### Requirement 10: Story labels and Exact_Story

**User Story:** As a student, I want the engine story in words about buttons and beams, with the exact text kept for engineers.

#### Acceptance Criteria

1. THE Story_Labels SHALL hold REQUEST: active "pressed the walk button", inactive "released the walk button", held "pressed and held the walk button".
2. THE Story_Labels SHALL hold CLOSE: active "pressed the close button", inactive "released the close button", held "pressed and held the close button".
3. THE Story_Labels SHALL hold BEAM_CLEAR: active "blocked the beam", inactive "cleared the beam", held "blocked the beam and kept it blocked".
4. THE Story_Labels SHALL hold PULSE: active "started a pulse", inactive "ended the pulse", held "held the pulse input on".
5. WHEN the App calls `failureStory`, THE App SHALL pass a `labels` record that holds exactly the Story_Labels entries of the input signals of the Current_Example fixture: {REQUEST} for crosswalk, {CLOSE, BEAM_CLEAR} for garage, {PULSE} for heartbeat.
6. WHILE the Technical_View is shown, THE App SHALL show under the heading "Exact story" the Exact_Story, equal character for character to the output of `failureStory`; the heading and the text are Technical_Elements.
7. WHILE the Plain_View is shown, THE App SHALL show neither the "Exact story" heading nor the Exact_Story.
8. IF `failureStory` returns a `ReducerError`, THEN THE App SHALL show no "Exact story" heading and SHALL leave the rest of the BROKE Verdict_Card and its trace unchanged.
9. THE App SHALL keep `STORY_LABELS` of `model/story-input.ts` holding REQUEST only, and `buildStoryInput` with its current behaviour for callers that pass no Example.

### Requirement 11: Plain story and gremlin legend

**User Story:** As a viewer, I want one plain sentence about what the gremlin did and what broke, so that I get the failure in seconds.

#### Acceptance Criteria

1. THE Plain_Story_Label table SHALL hold, per input signal, the full phrases equal to the Story_Labels of Requirement 10 and these short phrases: REQUEST and CLOSE: active "pressed it", held "pressed and held it", inactive "let go"; BEAM_CLEAR: active "blocked it", held "blocked it and kept it blocked", inactive "cleared it"; PULSE: active "started another pulse", held "held it on", inactive "ended it".
2. THE Plain_Story_Builder SHALL take the Reduced_List, the fixture, the Violation_Cycle v, the Story_Ending, the Span_Sentence text and an optional span `{ lengthCycles, cut }`, SHALL read no clock, random source, DOM or Engine state, and SHALL return the same string for the same inputs.
3. THE Plain_Story_Builder SHALL build one phrase per Gremlin_Event of the Reduced_List in list order, skip Rest_Events, choose the active phrase for a press, the held phrase for a held press (G6), and the inactive phrase for a `"release"` or a non-press value, and use the short phrase when the previous phrase's event has the same signal and the full phrase otherwise.
4. THE Plain_Story_Builder SHALL write sentence 1 as the subject ("The gremlin" when every Gremlin_Event has the same `gremlinId`, else "The gremlins"), a space, the phrases (one phrase alone; two as "A, then B"; three or more as "A, B, ..., then Z"), then ", all within <Plain_Ms of last Gremlin_Event cycle − earliest Gremlin_Event cycle>" when there are two or more phrases, then ".".
5. THE Plain_Story_Builder SHALL write sentence 2 as "<Plain_Ms of v − last Gremlin_Event cycle> later, <Story_Ending>", with the Story_Ending looked up by the Target_Rule Canonical_Sentence, and SHALL change no character of the Story_Ending. THE Story_Ending table SHALL hold, character for character: "all of (CAR_GREEN is 1, WALK is 1) must never happen." → "the light gave cars and walkers a green at the same time."; "Within 20 ms after BEAM_CLEAR is 0 becomes true, MOTOR_CLOSE is 0 must be true." → "the door was still closing, 20 ms after the gremlin blocked the beam."; "HEARTBEAT is 1 must never last 600 ms or longer." → "the heartbeat light had been stuck on for 600 ms."; "HEARTBEAT is 0 must never last 600 ms or longer." → "the heartbeat light had been stuck off for 600 ms."; any other rule → "the program broke your rule." The Plain_Broke_Sentence of the BROKE Verdict_Card stays as Requirement 4 states.
6. WHEN a span with `cut` false is given, THE Plain_Story_Builder SHALL add sentence 3 from the Span_Sentence table: garage "The door kept closing for another <Plain_Ms of lengthCycles>."; crosswalk, heartbeat and custom rules "It stayed that way for another <Plain_Ms of lengthCycles>."
7. WHEN a span with `cut` true is given, THE Plain_Story_Builder SHALL add sentence 3 "It was still that way <Plain_Ms of lengthCycles> later, when the replay stopped."
8. WHEN no span is given, THE Plain_Story_Builder SHALL write no sentence 3.
9. IF the Reduced_List holds no Gremlin_Event, THEN THE Plain_Story_Builder SHALL return exactly "No gremlin move was needed: the program broke the rule on its own." and no other sentence.
10. THE Plain_Story_Builder SHALL join the sentences with one space.
11. WHEN a BROKE Verdict_Card is shown, THE App SHALL show the Plain_Story in both views, before the Exact_Story in document order.
12. WHEN the App calls the Plain_Story_Builder, THE App SHALL pass the Violation_Cycle of the Replay as v and the Display_Span as the span for never, notLongerThan and respond rules, and no span for count and hold rules.
13. THE Gremlin_Legend SHALL hold: masher "masher: a gremlin that presses buttons over and over"; bouncer "bouncer: a gremlin that makes a contact flicker on and off very fast"; stuck "stuck: a gremlin that holds an input on and does not let go"; dropout "dropout: a gremlin that briefly cuts an input that is normally on"; spike "spike: a gremlin that makes one sudden jump on an analog input"; drifter "drifter: a gremlin that slowly ramps an analog input up or down".
14. THE App SHALL show under the Plain_Story one Gremlin_Legend line per distinct `gremlinId` among the Gremlin_Events of the Reduced_List, in order of appearance.
15. IF the Reduced_List holds no Gremlin_Event, THEN THE App SHALL show no Gremlin_Legend line.
16. WHEN the Reduced_List of the crosswalk Example is built from the meta.json defaults, THE Plain_Story, with its Display_Span sentence 3, SHALL equal "The gremlin pressed the walk button, let go, then pressed and held it, all within 131 ms. 319 ms later, the light gave cars and walkers a green at the same time. It was still that way 1,000 ms later, when the replay stopped."
17. WHEN the Reduced_List of the garage Example is built from the meta.json defaults, THE Plain_Story, with its Display_Span sentence 3, SHALL equal "The gremlin blocked the beam, cleared it, then blocked it and kept it blocked, all within 4 ms. 16 ms later, the door was still closing, 20 ms after the gremlin blocked the beam. The door kept closing for another 240 ms."
18. WHEN the Reduced_List of the heartbeat Example is built from the meta.json defaults, THE Plain_Story, with its Display_Span sentence 3, SHALL equal "The gremlin held the pulse input on. 505 ms later, the heartbeat light had been stuck on for 600 ms. It was still that way 1,000 ms later, when the replay stopped."
19. IF a Plain_Story computed for criteria 16 to 18 differs from its stated text only in a rounded number, THEN THE Agent SHALL use the computed number, pin the computed text in the test and report the expected text, the computed text and the Reduced_List cycles; IF the wording differs, THEN THE Agent SHALL stop, report the expected text, the computed text and the Reduced_List cycles, and wait for the user's decision.
20. THE Plain_Story SHALL describe the Reduced_List replay, and THE App SHALL show the Story_Card heading "What happened, replaying only the moves that matter" above the Plain_Story in both the Plain_View and the Technical_View; the pinned story texts of criteria 16 to 18 stay unchanged.
21. WHILE the Technical_View is shown, THE App SHALL show, directly after the Story_Card heading, the text "(reduced replay, Y of X events)" with Y = `reducedEventCount` and X = `originalEventCount` of the reduction result; this text is a Technical_Element.
22. WHILE the Timeline shows the toggle selection "Original run", THE App SHALL show under the Timeline, in both views, the text "The original run had X gremlin moves; the story above uses only the Y that matter, so lengths can differ." with X = the number of Gremlin_Events of the original list and Y = the number of Gremlin_Events of the Reduced_List.
23. THE App SHALL build the texts of criteria 20 to 22 with the pure functions `storyHeading`, `reducedReplayNote` and `originalRunNote` of `model/verdict-plain.ts`.
### Requirement 12: Campaign panel

**User Story:** As a viewer, I want the campaign controls in plain words, so that I know what each number does.

#### Acceptance Criteria

1. THE App SHALL label the run-count field "How many tries" in both views and SHALL show the label "Runs (N)" in neither view.
2. THE App SHALL show the seed field, labelled "Seed (same number, same gremlins)", as a Technical_Element, so that the Plain_View hides the seed field.
3. WHEN the Details_Switch changes, THE App SHALL keep the values of the run-count field and the seed field and SHALL use both values for the next Campaign.
4. WHILE a Campaign runs, THE App SHALL show the elapsed UI_Clock time as "Elapsed <s> s", where s = floor(elapsed ms / 100) / 10 written with exactly one decimal and no minutes field (0 ms "Elapsed 0.0 s", 99 ms "Elapsed 0.0 s", 700 ms "Elapsed 0.7 s", 61,250 ms "Elapsed 61.2 s").
5. WHEN a Campaign ends, THE App SHALL keep showing the final elapsed text of criterion 4 until the next Campaign starts or the Current_Example changes.
6. THE App SHALL keep `elapsedText` of `model/format.ts` with its current behaviour ("Elapsed 0:00") and SHALL produce the text of criterion 4 with a new pure function in `model/format.ts`.

### Requirement 13: Reduction row

**User Story:** As a viewer, I want to see how much the attack shrank, so that I know the replay holds only what matters.

#### Acceptance Criteria

1. WHEN the Reducer ends with a result whose `stoppedAtBudget` is false, THE Reduction_Row SHALL show, in both views, "The gremlins made X moves. Only Y are needed to cause the bug." with X = `originalEventCount` and Y = `reducedEventCount` written in base 10, "1 move" in place of "1 moves" when X = 1, "Only 1 is needed" in place of "Only 1 are needed" when Y = 1, and the plural for 0 (crosswalk "The gremlins made 8 moves. Only 3 are needed to cause the bug.", garage "The gremlins made 7 moves. Only 3 are needed to cause the bug.", heartbeat "The gremlins made 2 moves. Only 1 is needed to cause the bug.").
2. IF the Reducer ends with a result whose `stoppedAtBudget` is true, THEN THE Reduction_Row SHALL show, in both views, "The gremlins made X moves. Y of them are enough to cause the bug." with the singular rules of criterion 1 ("1 of them is enough" when Y = 1).
3. WHILE the Reducer runs, THE Reduction_Row SHALL show the activity label "Reducing" and neither sentence of criteria 1 and 2.
4. WHEN the Reducer ends with a result, THE Reduction_Row SHALL remove "Reducing" and show the Shrink_Label "The smallest replay this reducer found." in both views.
5. WHILE the Technical_View is shown, THE Reduction_Row SHALL show, as Technical_Elements, "X events → Y events" with the counts of bench-ui-core Requirements 11.2 (while running) and 11.5 (after the end), each count written "1 event" when it is 1, "Candidates tried: K" as bench-ui-core Requirements 11.3 and 11.12 state, the Minimality_Tooltip only when `stoppedAtBudget` is false, and the budget note of bench-ui-core Requirement 11.8 only when `stoppedAtBudget` is true.
6. THE App SHALL enable and disable the "Replay again" button in both views as bench-ui-core Requirements 17.1 and 17.2 state.
7. THE App SHALL keep `shrinkText` of `model/format.ts` with its current behaviour and SHALL produce the "→" text with a new pure function whose output equals the `shrinkText` output with "->" replaced by "→" (U+2192).
8. IF the reduction ends with an error, THEN THE Reduction_Row SHALL show neither sentence of criteria 1 and 2, no Shrink_Label and no "X events → Y events" text.

### Requirement 14: Fix panel renames

**User Story:** As a student, I want the fix flow named in plain words.

#### Acceptance Criteria

1. THE App SHALL label the apply-fix button "Try the fixed program" and SHALL show the label "Load this example's bundled fixed .hex" nowhere.
2. THE App SHALL title the fix panel "What changed in the code" and SHALL show "Sketch source" nowhere, in text, `aria-label` or `title`.
3. THE App SHALL write the sketch line exactly as "buggy → fixed" with "→" (U+2192).
4. THE App SHALL show no "->" in any text node, `aria-label` or `title` of the App page, except in Diff_Hunk lines taken from the `.ino` files.
5. THE App SHALL keep the remaining Apply_Fix behaviour of bench-ui-core Requirement 16 for every Example, with every bench-ui-core criterion that names "Load this example's bundled fixed .hex" or "Sketch source" applying to "Try the fixed program" or "What changed in the code".

### Requirement 15: Gremlin picker

**User Story:** As a maker, I want to choose which gremlins attack, so that I can try different kinds of input trouble.

#### Acceptance Criteria

1. THE Gremlin_Picker SHALL show six Gremlin_Tiles in a 3 × 2 grid, in `GREMLIN_CATALOGUE` order, with the names "Masher", "Bouncer", "Stuck", "Dropout", "Spike" and "Drifter".
2. THE Gremlin_Tile SHALL show, in both views, the gremlin's name, its behaviour sentence and the Friendly_Labels of the fixture input pins that match an entry of the gremlin's catalogue `targets`, in fixture order; the behaviour sentences SHALL be masher "Presses a button again and again.", bouncer "Makes a contact flicker on and off very fast.", stuck "Holds an input on and does not let go.", dropout "Briefly cuts an input that is normally on.", spike "Makes one sudden jump on an analog input.", drifter "Slowly ramps an analog input up or down."
3. WHILE the Technical_View is shown, THE Gremlin_Tile SHALL show, as Technical_Elements, the heading "Synthetic input ranges" and, per catalogue parameter, its name, its default value (scalar) or default min–max (range) and its unit, with every cycle value also written in ms as cycles ÷ 16,000, exact (bouncer `gapCycles`: 1,600–48,000 cycles = 0.1–3 ms).
4. WHEN the App starts or the Current_Example changes, THE Gremlin_Picker SHALL select exactly the Compatible gremlins of that Example's meta.json `gremlinSet` and discard every manual selection.
5. WHEN the user clicks a Compatible Gremlin_Tile, or presses Enter or Space while that tile has keyboard focus, THE Gremlin_Picker SHALL toggle the selection of that one tile.
6. WHILE a Gremlin_Tile is selected, THE Gremlin_Tile SHALL show an amber border in #F3C982 (`--c-gremlin`), a selection mark and `aria-pressed="true"`.
7. WHILE a Gremlin_Tile is not selected, THE Gremlin_Tile SHALL show neither the amber border nor the selection mark, and `aria-pressed="false"`.
8. IF a gremlin is not Compatible with the Current_Example fixture, THEN THE Gremlin_Tile SHALL stay visible, be disabled and unselected, and show the reason for the first entry of its catalogue `targets`: "Needs an analog input" for an analog target, "Needs an input that is normally on" for a target with `restState: "active"`, "Needs a button or switch input" for a digital target.
9. WHILE any of the three Examples is the Current_Example, THE Gremlin_Picker SHALL enable masher, bouncer and stuck, and SHALL disable dropout with "Needs an input that is normally on" and spike and drifter with "Needs an analog input".
10. WHEN a Campaign starts, THE App SHALL read the Selected_Gremlin_Set and run that Campaign with it.
11. WHILE the Selected_Gremlin_Set is empty, THE App SHALL disable "Unleash gremlins" and show "Pick at least one gremlin."
12. WHEN the Selected_Gremlin_Set becomes non-empty, THE App SHALL enable "Unleash gremlins" unless another criterion of this document or of bench-ui-core disables it.
13. WHEN the App starts or the Current_Example changes to any of the three Examples, THE Gremlin_Picker SHALL set the Selected_Gremlin_Set equal, entry for entry and in order, to that Example's meta.json `gremlinSet` (garage: bouncer then masher).

### Requirement 16: Timeline in plain words

**User Story:** As a viewer, I want the timeline lanes in plain words, so that I can read it without knowing pin levels.

#### Acceptance Criteria

1. THE Timeline SHALL show one Lane per signal of the Current_Example fixture in `fixture.json` order, then the GREMLINS Lane as the last Lane, each labelled with its Friendly_Label, over the Display_Window.
2. THE Timeline SHALL write the Lane_Word of an output at cycle c from the latest output edge of that signal at or before c: "on" for 1, "off" for 0, and "not driven" for the value `"input"` or when no such edge exists.
3. THE Timeline SHALL write the Lane_Word of an input at cycle c as "pressed" when the latest event of that signal at or before c has the pin's press value, and "released" otherwise, including before any event.
4. THE Timeline SHALL draw an input Lane dotted from each `"release"` event to the next event of that signal or to the end of the Display_Window, and solid elsewhere.
5. THE Timeline SHALL show, in both views, the legend "Solid line: on or off. Dotted: input released (not driven by a gremlin)."
6. WHILE the Plain_View is shown, WHEN a Timeline_Event is selected, THE Timeline SHALL show "<Ms_Text> · <Friendly_Label> = <Lane_Word>" with no cycle value.
7. WHILE the Technical_View is shown, WHEN a Timeline_Event is selected, THE Timeline SHALL show the selected-event text of bench-ui-core Requirement 14.14, with its cycle value.
8. THE App SHALL keep `LANES` and `windowEnd` of `model/timeline.ts` with their current values and behaviour.
9. THE App SHALL compute the per-Example lanes and the Display_Window with new pure functions under `src/ui/app/model/`.

### Requirement 17: Scenes

**User Story:** As a student, I want a picture of each device, driven by the replay, so that the contradiction is obvious.

#### Acceptance Criteria

1. THE Scene SHALL take each value at Cursor cycle c as follows: an output from its last Display_Replay output edge at or before c, read as not 1 when no such edge exists; an input from its last recorded input event at or before c, read as its inactive level when no such event exists.
2. THE Scene SHALL be drawn only from Display_Replay output edges and recorded input events at or before the Cursor, and SHALL show "Illustrative scene · firmware outputs shown" for all three Examples.
3. IF no Display_Replay is shown, THEN THE Scene SHALL show the state at cycle 0, with the garage door fully open and no marker or bracket.
4. WHILE WALK is 1 at the Cursor, THE crosswalk Scene SHALL draw the ghost on the crossing.
5. WHILE WALK is not 1 at the Cursor, THE crosswalk Scene SHALL draw the ghost at the curb.
6. THE crosswalk Scene SHALL show no collision and no injury at every Cursor cycle.
7. THE garage Scene SHALL draw a frame, a slatted door, an emitter and a receiver joined by an amber dashed beam, and a cartoon cat, all as original SVG.
8. THE garage Scene SHALL compute the door position p in integer cycles: p = 0 (fully open) at cycle 0; per cycle, p rises by 1/4,800,000 while MOTOR_CLOSE is 1 and MOTOR_OPEN is not 1, falls by 1/4,800,000 while MOTOR_OPEN is 1 and MOTOR_CLOSE is not 1, and stays still while both or neither is 1; p is clamped to 0..1 (1 = fully closed); THE garage Scene SHALL show the label "Door position is illustrative".
9. WHILE BEAM_CLEAR is 0 at the Cursor, THE garage Scene SHALL show "Beam blocked" and draw the cat in the beam.
10. WHILE BEAM_CLEAR is not 0 at the Cursor, THE garage Scene SHALL show no "Beam blocked" label and no cat in the beam.
11. WHILE the Cursor is at or after the Violation_Cycle of a garage BROKE replay, THE garage Scene SHALL show a coral (#FF8A80) marker on the door labelled "20 ms deadline missed".
12. WHILE the Cursor is before the Violation_Cycle, or no garage BROKE replay is shown, THE garage Scene SHALL show no "20 ms deadline missed" marker.
13. WHILE HEARTBEAT is 1 at the Cursor, THE heartbeat Scene SHALL draw the status lamp lit.
14. WHILE PULSE is pressed at the Cursor (Requirement 16.3), THE heartbeat Scene SHALL draw the PULSE switch on.
15. WHILE the Cursor is within the Display_Span of a heartbeat BROKE replay, both ends included, THE heartbeat Scene SHALL show a coral bracket labelled "frozen".
16. WHILE the Cursor is outside the Display_Span, or no heartbeat BROKE replay is shown, THE heartbeat Scene SHALL show no "frozen" bracket.
17. THE App SHALL keep `SCENE_SIGNALS`, `SCENE_NOTE` and `sceneAt` of `model/scene.ts` with their current behaviour.
18. THE App SHALL compute the garage and heartbeat Scene states with new pure functions under `src/ui/app/model/`.

### Requirement 18: Rule editing

**User Story:** As a teacher, I want to edit the rule and see mistakes as I type, so that students can try their own rules.

#### Acceptance Criteria

1. WHEN the user activates "Edit rule", THE App SHALL open the Rule_Box holding the Canonical_Sentences of the Active_Rule_Set, one per line.
2. WHEN the Rule_Box text changes by typing, paste, a Sentence_Pattern insert or a reset, THE App SHALL run the Rule_Box_Check before the next render and show every Rule_Error under the Rule_Box, in the order the Rule_Box_Check returns them.
3. WHEN `readRulesFile` returns a reason of the form "Line N: No rule template matches at position P (counting from 0); allowed there: X.", THE Rule_Box_Check SHALL return a Rule_Error with line N, position Q = P + 1 and the text "Line N, position Q: this part does not match any rule pattern. Allowed here: X.", where X is the text after "allowed there: " without its final period.
4. WHEN `readRulesFile` or `compileRuleSet` returns any other reason, THE Rule_Box_Check SHALL return that reason unchanged as a Rule_Error with no line and no position.
5. WHEN the Rule_Box_Check returns no Rule_Error, THE App SHALL set the Active_Rule_Set to the checked rule set.
6. WHILE the Rule_Box text has at least one Rule_Error, THE App SHALL disable "Unleash gremlins" and keep the Active_Rule_Set at its last valid value.
7. THE App SHALL list the five Sentence_Patterns beside the Rule_Box, each filled with the Current_Example's first input signal and first output signal in fixture order, so that each filled sentence passes the Rule_Box_Check alone and when appended to the Current_Example's `rules.txt` text, each with an insert button.
8. WHEN the user activates an insert button, THE App SHALL append its sentence as a new last line of the Rule_Box text, adding a line break before the sentence only when the text does not already end with one.
9. WHEN the user activates "Reset to the example rule", THE App SHALL set the Rule_Box text to the Current_Example `rules.txt` text, set the Active_Rule_Set to the Example_Rule_Set and clear the Rule_Errors.
10. IF the Rule_Box text is empty, THEN THE Rule_Box_Check SHALL return exactly one Rule_Error with the text "The gremlins have no rule to test against. Add at least one rule."
11. WHILE a Campaign, reduction or Replay is running, THE App SHALL make the Rule_Box read-only and disable its insert buttons and its "Reset to the example rule" button.
12. THE App SHALL keep the bench-ui-core `FlowState` functions with their current behaviour and SHALL combine the Rule_Error and Selected_Gremlin_Set gates outside them.

### Requirement 19: Layout and type

**User Story:** As a reader, I want cards that fit their content and text I can read.

#### Acceptance Criteria

1. THE Verdict_Card SHALL have no fixed height and no maximum height in both views.
2. THE App SHALL give no element inside a Verdict_Card a computed `overflow-x` or `overflow-y` of `auto` or `scroll` (the trace table now sits in the Gremlin_Log inside the card; the opened log table grows the card and nothing in the card scrolls).
3. WHILE the viewport is 1,280 px wide at 100% zoom, WHEN content inside a Verdict_Card opens, THE Verdict_Card SHALL grow to hold that content with nothing clipped.
4. THE App SHALL keep the bench-ui-core font sizes for every element that is not Essential_Text.
5. THE App SHALL set every Essential_Text to a computed font size of at least 16 px at 100% zoom, in both views.
6. IF an Essential_Text has a computed font size below 16 px in bench-ui-core, THEN THE App SHALL raise that font size to exactly 16 px and change no other style of that element.
7. THE App SHALL follow the palette, contrast and motion rules of bench-ui-core Requirements 20 and 21 for every new element.

### Requirement 20: Copy rules and scans

**User Story:** As the product owner, I want every new word on screen checked, so that the app never promises what it cannot show.

#### Acceptance Criteria

1. THE App SHALL hold every new UI string, including the Example_Copy, Friendly_Label, Story_Labels, Plain_Story_Label, Gremlin_Legend, Gremlin_Tile, Story_Ending and Span_Sentence tables, in files under `src/ui/app/` or in `index.html`, the inputs of the committed UI_Strings_Scan.
2. THE App SHALL contain in files under `src/ui/app/`, code, comments and identifiers included, no whole-word, ASCII case-insensitive match of safe, safety, secure, guaranteed, certified, real-time, realtime, first, unique, shortest or any Board_Brand_Name.
3. THE copy scan test SHALL be a new Node Vitest file under `tests/ui/` that imports each table of criterion 1 and checks every nested string value with `wholeWordMatches` against `BANNED_WORDS`, the hyphen-less variants of its hyphenated entries, `BOARD_BRAND_NAMES` and "safety".
4. THE copy scan test SHALL also check, with the same word lists, the `title`, `story` and `timingNote` fields of `meta.json`, the `rules.txt`, `buggy/buggy.ino` and `fixed/fixed.ino` of all three Examples, and SHALL check every file under `src/ui/app/` and `index.html` for "safety".
5. THE copy scan test SHALL check that it scanned 3 Example_Copy entries, 13 Friendly_Label entries, 4 × 6 Plain_Story_Label phrases, 6 Gremlin_Legend lines, 6 Gremlin_Tile behaviour sentences, 5 Story_Ending entries, 4 Span_Sentence entries (crosswalk, garage, heartbeat, custom rules) and the 3 texts of Requirement 11.20 to 11.22 ("What happened, replaying only the moves that matter", "(reduced replay, Y of X events)" and "The original run had X gremlin moves; the story above uses only the Y that matter, so lengths can differ." as templates).
6. IF the copy scan test finds a match, THEN THE copy scan test SHALL fail and list every match with its file or table name, its line or key path, and the matched word.
7. IF an input of the copy scan test is missing, THEN THE copy scan test SHALL fail and name the missing input.
8. THE Agent SHALL keep every committed test file byte-identical.

### Requirement 21: Node acceptance test for all Examples

**User Story:** As a maintainer, I want the three examples held to pinned numbers in Node, so that the browser flow gives the same results.

#### Acceptance Criteria

1. THE Example_Acceptance_Test SHALL be a new Vitest file under `tests/ui/` that runs in Node under `npx vitest --run` with no browser, no network and no new package, calls `runCampaignJob`, `runReductionJob` and `runReplayJob` of `src/ui/app/worker/host.ts` (and the Display_Replay host function of Requirement 9.2) the same way `tests/ui/worker-host.acceptance.test.ts` does, encodes each result with `encodeMessage` and decodes it with `decodeReply` of the Message_Codec, and asserts on the decoded values.
2. THE Example_Acceptance_Test SHALL run each buggy Campaign with that Example's `buggy/buggy.hex`, `fixture.json`, `rules.txt` and meta.json `gremlinSet`, `campaignSeed`, `runs` and `runCycles`, and each fixed Campaign with only the HEX changed to `fixed/fixed.hex`.
3. WHEN the crosswalk buggy Campaign runs, THE Example_Acceptance_Test SHALL find BROKE, `violatingRunIndex` 3 shown as "run 4 of 24", seed 20261101, a reduction of 8 → 3 events, reduced-replay Trace_Fingerprint `47078989121ebc1d`, and a fixed-build Campaign HELD with text "No violation found in 24 emulated runs of this gremlin set. Not a proof."
4. WHEN the garage buggy Campaign runs, THE Example_Acceptance_Test SHALL find BROKE, `violatingRunIndex` 7 shown as "run 8 of 40", seed 20261102, a reduction of 7 → 3 events, reduced-replay Trace_Fingerprint `616062947f71a1ae`, and a fixed-build Campaign HELD with text "No violation found in 40 emulated runs of this gremlin set. Not a proof."
5. WHEN the heartbeat buggy Campaign runs, THE Example_Acceptance_Test SHALL find BROKE, `violatingRunIndex` 1 shown as "run 2 of 24", seed 20261103, a reduction of 2 → 1 events, reduced-replay Trace_Fingerprint `19827a4e0a7ad440`, and a fixed-build Campaign HELD with text "No violation found in 24 emulated runs of this gremlin set. Not a proof."
6. WHEN the Span_Helper runs on the Display_Replay of the Reduced_List, THE Example_Acceptance_Test SHALL find, for crosswalk and heartbeat, `lengthCycles` greater than 16,000 and `cut` true, and, for garage, `lengthCycles` 3,833,643 and `cut` false.
7. THE Example_Acceptance_Test SHALL check Requirements 9.4 and 9.5 on the Display_Replay of the Reduced_List of each Example.
8. IF a host call returns an error or a Campaign ends with a verdict other than the stated one, THEN THE Example_Acceptance_Test SHALL fail and report the Example_Id, the build, and the verdict or the error `kind` and `message`.
9. IF a value of criteria 3 to 6 differs from the stated value, THEN THE Agent SHALL stop, report the expected value, the actual value and the evidence, leave the test and its expected values unchanged, and wait for the user's decision.

### Requirement 22: Model tests

**User Story:** As a maintainer, I want the new UI logic tested in Node, as evidence that it does what the copy says.

#### Acceptance Criteria

1. THE Agent SHALL add Vitest tests under `tests/ui/` that check the Friendly_Label, Story_Labels, Plain_Story_Label, Gremlin_Legend, Example_Copy, Gremlin_Tile, Story_Ending and Span_Sentence text tables entry by entry against the texts of Requirements 4, 5, 10, 11 and 15, and fail on any extra or missing key.
2. THE Agent SHALL add a test that the Plain_Story_Builder, given the Reduced_Lists the Engine produces from the meta.json defaults of all three Examples, gives the crosswalk, garage and heartbeat texts of Requirements 11.16 to 11.18, each with its span sentence from the Display_Span of Requirements 9.11 and 9.12.
3. THE Agent SHALL add a test that the HELD card text model, with the Details_Switch off, returns the sentence of Requirement 7.1 or 7.2 followed by the exact HELD_Text for N = 24 and N = 1, for the Fixed_Build and the Buggy_Build, and the replacement of Requirement 7.6 with every other Coverage_Line part unchanged.
4. THE Agent SHALL add tests that the Rule_Box_Check maps parse reasons as Requirement 18.3 states, passes other reasons through as Requirement 18.4 states, and accepts each filled Sentence_Pattern of Requirement 18.7 for each Example.
5. THE Agent SHALL add a test that Compatible and the reasons of Requirement 15.8 give, for each of the three Example fixtures, masher, bouncer and stuck Compatible, dropout "Needs an input that is normally on", spike and drifter "Needs an analog input", and, for one test-local fixture object with a digital input pin with `restState: "active"` and an analog input pin, all six gremlins Compatible.
6. THE Agent SHALL add tests for the formatting of Requirements 6.7, 7.1, 12.4 and 13.1, including the singular cases, and for Plain_Ms at 0, 7,999, 8,000, 16,000 and 16,000,000 cycles giving "0 ms", "0 ms", "1 ms", "1 ms" and "1,000 ms".
7. THE Agent SHALL add a test that the copy scan input of Requirement 20.3 includes every table of Requirement 20.1 and that each table holds at least one string.
8. THE Agent SHALL run the tests of this requirement in Node only, with no headless browser, no new package and no change to a committed file.
9. IF a test of this requirement and the system disagree, THEN THE Agent SHALL stop, report what the test expects, what happened and the evidence, and wait for the user's decision.
10. THE Agent SHALL describe passing tests as evidence, not proof.

### Requirement 23: Constraints

**User Story:** As the product owner, I want this feature to leave the engine and the committed tests alone.

#### Acceptance Criteria

1. THE Agent SHALL, compared with the commit at which this feature's work starts, edit, delete or rename no file under `src/engine/`, no committed test or baseline file, no file under `examples/` or `fixtures/`, and neither `src/ui/main.ts` nor `src/ui/style.css`; new files outside `src/engine/`, `examples/` and `fixtures/` are allowed.
2. THE Agent SHALL keep the `dependencies` and `devDependencies` of `package.json` and the file `package-lock.json` unchanged.
3. THE App SHALL compute the Violation_Cycle, the Display_Span, the Display_Window, the Run_Cycles and every Plain_Ms from integer CPU cycles only, with no `Date.now`, `performance.now`, `setTimeout` or `setInterval` for them.
4. THE App SHALL use the UI_Clock only for the elapsed text, playback and motion, and SHALL pass no UI_Clock value to the Engine, the Checker_Wrapper or a Replay.
5. THE App SHALL call no `Math.random` and no `crypto.getRandomValues`, SHALL take gremlin randomness only from the Engine's seeded PRNG with the Campaign_Seed passed in, and SHALL make no network request outside the App's own origin.
6. WHEN the feature is complete, THE Agent SHALL run each Global_Check once, with no headless-browser run, report each command, its result and its counts, and describe passing tests as evidence, not proof.
7. IF a Global_Check fails or a test the user wrote disagrees with the system, THEN THE Agent SHALL leave the test unchanged, report what the test expects, what happened and the evidence, and wait for the user's decision.
8. IF a requirement needs a change under `src/engine/`, THEN THE Agent SHALL stop and report the needed change without making it.
9. THE Agent SHALL delete every temporary debug script before reporting a task done.
