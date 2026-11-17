# Requirements Document

## Introduction

This feature rebuilds the App page of Hexorcist around a "stage": a header and hero, a numbered setup, a stage with an illustrative scene, a move strip and a player, a verdict aside, and four tabs. `docs/stage-design.md` (the Contract) is the source of every layout, copy and motion rule; the screenshots `docs/mockup/01.png` to `07.png` show the target look, and where they differ the Contract wins. The mockup's clipping and crowding are not copied.

The feature is UI-only. It reuses the models and views under `src/ui/app/` (Example_Copy, Friendly_Label, Plain_Story_Builder, Span_Helper, Display_Replay, scene models, player, Rule_Box_Check, Gremlin_Picker, Diff_Hunk, Message_Codec, Worker_Host). It changes nothing under `src/engine/`.

Findings made while writing this document:

- **Shrink view case (Contract section 5).** The Reducer's `onProgress` receives a `ProgressReport` after each oracle call that returned an outcome, with `candidatesTried`, `bestGremlinCount`, `bestList`, `part` and `accepted` (`src/engine/reducer/types.ts` lines 24–31, `src/engine/reducer/core.ts` lines 264–272). It does not report the candidate subset being tried, and the report arrives after the attempt. The Worker forwards `candidatesTried`, `bestGremlinCount` and `bestList` (`src/ui/app/worker/messages.ts`, `ReduceProgressMsg`). So the **counts-only case** applies for the candidate being tried: the shrink view shows the counter, fades the dots of moves that an accepted step removed from `bestList`, then shows the final collapse. No engine change is needed.
- **Peripheral uses (Requirement 7.6).** Each `RunResult` already carries the public optional field `peripheralUses: PeripheralDiagnostic[]` (`peripheral`, `register`, `cycle`, `access`; `src/engine/types.ts`), and `runCampaignJob` in `src/ui/app/worker/host.ts` already reads the full `SliceProgress.runs` array. The Worker can pass the field through with no engine change.
- **Fix explanations (Contract section 9).** The three texts agree with the `buggy.ino` → `fixed.ino` diffs: crosswalk removes the `else if (pressed && crossing) walkStart = now;` restart while the car lights run from `crossStart`; garage replaces `if (breaks == 1) enter(DOOR_OPENING, now);` with an unconditional `enter(DOOR_OPENING, now);`; heartbeat adds `millis() - start < PULSE_TIMEOUT_MS` to the wait loop. No mismatch was found.
- **No engine change** was found to be needed for any requirement below.

## Glossary

Terms defined in `.kiro/specs/bench-ui-core/requirements.md` and `.kiro/specs/bench-ui-examples/requirements.md` keep their meaning (App, Engine, Engine_Worker, Worker_Host, Message_Codec, Example, Current_Example, Example_Copy, Rule_Headline, Plain_Broke_Sentence, Friendly_Label, Story_Labels, Plain_Story, Plain_Story_Builder, Exact_Story, Gremlin_Legend, Plain_Ms, Display_Replay, Display_Span, Reduced_List, Gremlin_Event, Rest_Event, Violation_Cycle, Target_Rule, Trace_Fingerprint, HELD_Text, Canonical_Sentence, Rule_Box, Rule_Box_Check, Compatible, Selected_Gremlin_Set, Gremlin_Log, Diff_Hunk, Cursor, Timeline, Lane, UI_Clock, Banned_Words, Board_Brand_Names, Global_Checks, Agent, Plain_View, Technical_View, Details_Key), except where redefined here.

- **Contract**: `docs/stage-design.md`.
- **Stage**: the two-column area under the setup: the Scene_Area and the Aside.
- **Scene_Area**: the left column of the Stage, holding the Scene, the Move_Strip and the Player.
- **Aside**: the right column of the Stage (about 300 px wide), holding the verdict card and the Reduction_Card.
- **Scene**: the original SVG illustration of the Current_Example, a pure function of the shown replay's output edges, its recorded input events and the Cursor.
- **Shown_Replay**: the Display_Replay whose data drives the Scene at a moment: the reduced replay on the buggy build, or, in the Fix_View, the reduced replay on the fixed build.
- **Details_Switch**: the header switch labelled "Technical details" with visible state text "Off" or "On". This redefines the bench-ui-examples term.
- **Device_Card**: one of the three example buttons in setup section "1 · PICK A DEVICE".
- **Gremlin_Chip**: one gremlin button in setup section "3 · GREMLINS · scripted pests, not AI".
- **Setup_Summary**: the one-line bar that replaces the expanded setup after a run.
- **Earliest_Move**: the Gremlin_Event of the Reduced_List with the lowest cycle, written e0.
- **Break_Cycle**: the Violation_Cycle of the reduced replay on the buggy build, written v.
- **Segment**: the cycle range from S = max(0, e0 − 3,200,000) to v (3,200,000 cycles = 200 ms at 16 MHz).
- **Cluster**: a maximal group of Gremlin_Events of the Reduced_List, ordered by cycle, in which each pair of neighbours is less than 800,000 cycles (50 ms) apart; a Cluster holds at least 2 events.
- **Pacing_Plan**: the pure function under `src/ui/app/model/` that maps UI milliseconds since the start of an auto-play to a whole-cycle Cursor inside the Segment, and reports the Slow_Factor at each UI millisecond.
- **Slow_Factor**: UI milliseconds per simulated millisecond at a moment of playback; 1 means real speed.
- **Friendly_Factor**: the Slow_Factor f written for the badge: f rounded half-up to a whole number when f < 10, to the nearest multiple of 5 when 10 ≤ f < 100, and to the nearest multiple of 10 when f ≥ 100, then raised to at least 2.
- **Speed_Badge**: the scene badge "Slowed N× so you can see it" (N = Friendly_Factor), or "Real speed" when the Slow_Factor is exactly 1.
- **Player**: the controls under the Move_Strip: Play/Pause, "Replay" and the Speed_Slider.
- **Speed_Slider**: the slider labelled "Slower ←→ Real speed (1x)" whose default position is the Pacing_Plan and whose right end is 1x.
- **Move_Strip**: the row of one dot per Gremlin_Event of the Reduced_List, placed by cycle, with a coral ✕ at v.
- **Relative_Time**: "+<k> ms", with k = floor((cycle − e0 + 8,000) / 16,000) written in base 10.
- **Strip_Phrase**: the short move word of a Gremlin_Event, chosen with the active/held/inactive kind of `movePhrase`: REQUEST and CLOSE "pressed" / "pressed and held" / "let go"; BEAM_CLEAR "blocked" / "blocked" / "cleared"; PULSE "sensor on" / "sensor held on" / "sensor off"; any other input "on" / "held on" / "off".
- **Shrink_View**: the Stage state while the Reducer runs.
- **Shorter_Count**: max(0, `candidatesTried` − 1), the candidates tried without the confirmation run.
- **Reduction_Card**: the Aside card that reports the shrink result. It replaces the Reduction_Row.
- **Cause_Line**: the BROKE card line of Contract section 9, gated by fingerprint.
- **Pinned_Fingerprint**: crosswalk `47078989121ebc1d`, garage `616062947f71a1ae`, heartbeat `19827a4e0a7ad440`.
- **Fix_View**: the Stage state after "See the fix work →": two Scenes on one shared Cursor and one Player.
- **Fixed_Campaign**: the Campaign of the fixed build with the same rule set, gremlin set, seed, tries and run length as the buggy Campaign.
- **Elapsed_Seconds**: the UI_Clock time from the start of the buggy Campaign request to its `campaign-done` message, written "<x> s" with x = floor((ms + 50) / 100) / 10 and one decimal (870 ms gives "0.9 s").
- **Run_Length_Text**: `runCycles` / 16,000,000 seconds rounded half-up to one decimal, with a trailing ".0" dropped ("1 s", "0.6 s").
- **Cycles_Rate_Text**: "<r> million chip cycles/s on this computer", with r = the Campaign's `totalCycles` / (the UI_Clock time of Elapsed_Seconds, in seconds) / 1,000,000 rounded half-up to one decimal.
- **Rule_Preset**: the rule of the Current_Example offered in "Change rule ▾", with a Limit_Control for garage and heartbeat.
- **Limit_Control**: a whole-millisecond number control from 1 to 60,000; default 20 (garage) or 600 (heartbeat).
- **Tabs**: the four tabs below the Stage: "What happened", "Signals", "The fix", "Details".
- **Phone_Width**: the narrow-screen breakpoint of bench-ui-core Requirement 22.
- **Reduced_Motion**: the user agent reports `prefers-reduced-motion: reduce`.
- **Stage_Tests**: the new Node Vitest files under `tests/ui/` added by this feature.

## Requirements

### Requirement 1: Header and hero

**User Story:** As a student, I want a plain header and hero, so that I know what the page does before I press anything.

#### Acceptance Criteria

1. THE App SHALL show a header with an inline-SVG ghost-mark logo with a mint stroke, the word "Hexorcist" and the Details_Switch with `role="switch"`, `aria-checked` and the visible state text "Off" or "On", and SHALL store the switch state under the Details_Key so that the state is the same after a page reload.
2. THE App SHALL show the h1 "AI wrote your gadget's code." and, on a new line in mint, "Let gremlins break it here, before it breaks for real."
3. THE App SHALL show under the h1 the paragraph of Contract section 3 verbatim and the three plain chips "Runs the real compiled program", "Same gremlins, same result, every time" and "Runs in your browser", as text that is not a button.
4. WHEN a Campaign has ended, THE App SHALL remove the h1, paragraph and chips and SHALL show the tagline "AI wrote your gadget's code. Let gremlins break it here, before it breaks for real." as small text on the header line after the word "Hexorcist".

### Requirement 2: Setup

**User Story:** As a maker, I want to pick a device, a rule and gremlins in three numbered steps, so that starting a check takes one press.

#### Acceptance Criteria

1. THE App SHALL show section "1 · PICK A DEVICE" with three Device_Cards (buttons with `aria-pressed`), each with an original illustration, the title "Crosswalk", "Garage door" or "I'm-alive light" and the line of Contract section 4, plus one empty grid slot for a later card. THE App SHALL give the Current_Example's card `aria-pressed="true"` and a 2 px pumpkin border, and give the other two cards `aria-pressed="false"` and no pumpkin border.
2. THE App SHALL show section "2 · RULE" with the Rule_Headline, "Why it matters: " followed by the Current_Example's text of Contract section 9, and the "Change rule ▾" menu of Requirement 12.
3. WHILE the Technical_View is shown, THE App SHALL show the Canonical_Sentence and the existing Rule_Box editor in section 2.
4. THE App SHALL show section "3 · GREMLINS · scripted pests, not AI" with one Gremlin_Chip (icon, name, `aria-pressed`) per gremlin Compatible with the Current_Example's fixture. A chip whose gremlin is in the Selected_Gremlin_Set SHALL have `aria-pressed="true"` and a check mark. Every other chip SHALL have `aria-pressed="false"` and no check mark.
5. IF N ≥ 1 gremlins are not Compatible with the fixture, THEN THE App SHALL show the link "N more need other inputs" (N = their count), and IF N = 0, THEN THE App SHALL show no such link. WHEN the user activates the link, THE App SHALL show those N gremlins as disabled chips, each with its plain reason; the analog reason SHALL read "Needs a dial-type input, like a temperature sensor".
6. WHILE the setup is expanded, THE App SHALL show the primary button "Unleash gremlins" and the line "<M> tries · <Run_Length_Text> of device time each" ("1 try · …" when M = 1), where M is the current tries value. THE App SHALL never show more than one primary button at a time.
7. WHILE a Campaign runs, THE App SHALL keep the setup expanded and SHALL disable every Device_Card, the "Change rule ▾" menu, every Gremlin_Chip, the "N more need other inputs" link and "Unleash gremlins".
8. WHEN a Campaign has ended, THE App SHALL collapse the setup into the Setup_Summary "<Device title> · <Rule_Headline> · <gremlin names in Selected_Gremlin_Set order joined by ", "> · gremlins are scripted pests, not AI" with the buttons "Change setup ▾" and "Run again". Activating "Change setup ▾" SHALL re-expand the setup with its current selections. Activating "Run again" SHALL start a Campaign with the current setup, as "Unleash gremlins" does.
9. WHILE the Technical_View is shown, THE App SHALL show the tries and seed fields in the Details tab and nowhere else. WHILE the Plain_View is shown, THE App SHALL not show them.

### Requirement 3: Stage idle and running

**User Story:** As a student, I want the stage to say plainly what is happening, so that an empty view never looks like a result.

#### Acceptance Criteria

1. WHILE no Campaign has run since the App loaded or since the Current_Example, rule or gremlin set last changed, THE Stage SHALL show the Current_Example's Scene at 60% opacity, "Nothing has broken yet." and "Press Unleash gremlins. If a rule breaks, the replay plays here.", and SHALL show no empty timeline and no waiting label.
2. WHILE a Campaign runs, THE Stage SHALL show "Try N of M" and a slim progress bar filled to `runsCompleted` / M. M is the Campaign's tries value. N = min(`runsCompleted` + 1, M), using `runsCompleted` from the latest progress message, or 0 before the first progress message arrives.

### Requirement 4: Shrink view (counts-only case)

**User Story:** As a viewer, I want to see the reducer working, so that I trust the short replay came from real attempts.

#### Acceptance Criteria

1. WHEN a buggy Campaign ends with BROKE, THE App SHALL show the BROKE card in the Aside in the same render that shows the BROKE result, before any `reduce-progress` message is handled, with a placeholder in place of the Plain_Story until the `reduce-done` message arrives.
2. WHILE the Reducer runs, THE Shrink_View SHALL show the dimmed Scene, "Finding the moves that matter…" and "tried <Shorter_Count> shorter versions of the attack so far" ("1 shorter version" when the count is 1), with Shorter_Count computed from the `candidatesTried` of the latest `reduce-progress` message (0 before the first message).
3. WHILE the Reducer runs, THE Shrink_View SHALL show the Move_Strip with one dot per Gremlin_Event of the original list and the legend "needed / testing now / not needed", with every dot in the "testing now" style unless criterion 4 has faded it.
4. WHEN a `reduce-progress` message arrives whose `bestList` holds no match for a dot's Gremlin_Event (same cycle, signal and gremlinId, and the same value for a digital event; each `bestList` entry matches at most one dot), THE Shrink_View SHALL fade that dot to the "not needed" style and keep the counter label of criterion 2 unchanged. A faded dot SHALL never return to "testing now", and THE Shrink_View SHALL fade no dot that has a match in the latest `bestList`.
5. WHEN the `reduce-done` message arrives with a Reduced_List, THE Shrink_View SHALL, within 400 ms, fade the dots of events absent from the Reduced_List to the "not needed" style, and slide the remaining dots together in the "needed" style (one step change under Reduced_Motion).
6. THE App SHALL drive the Shrink_View only from `reduce-progress` and `reduce-done` messages.

### Requirement 5: Broke scene and pacing

**User Story:** As a student, I want the break replayed slowly enough to see, so that I can follow each move.

#### Acceptance Criteria

1. WHEN the reduction ends with a result and Reduced_Motion is off, THE App SHALL auto-play the Shown_Replay once from S to v with the Pacing_Plan and then stop on the frame at v.
2. WHILE Reduced_Motion is on, WHEN the reduction ends with a result, THE App SHALL show the frame at v with no auto-play.
3. THE Pacing_Plan SHALL give a Cursor that is a whole cycle, non-decreasing in UI time, equal to S at 0 ms and equal to v at the plan end.
4. THE Pacing_Plan SHALL give each Gremlin_Event inside a Cluster at least 400 UI ms between the Cursor reaching that event and the Cursor reaching the next Gremlin_Event with a higher cycle, or v if there is none, where the Cursor reaches a cycle at the earliest UI ms at which Cursor ≥ that cycle.
5. WHERE the Segment (v − S) is at most 16,000,000 cycles and the count of Gremlin_Events inside Clusters times 400 ms is at most 6,000 ms, THE Pacing_Plan SHALL last from 7,000 to 9,000 UI ms in total, inclusive.
6. THE Pacing_Plan SHALL use a Slow_Factor of at least 1 at every moment.
7. THE Scene SHALL show the Speed_Badge for the current Slow_Factor at every moment of playback, "Illustrative" at top right, "Stopped at the break" at bottom right while the Cursor equals v and playback is stopped, and, for crosswalk, "Both have a green!" at top left while the car light is green and the walk sign is on (the garage and I'm-alive conflict badges are those of Requirements 14.5 and 15.3).
8. WHEN the Cursor reaches v, THE Scene SHALL fade every element except the outputs named by the Target_Rule to 40% opacity in 300 ms (one step under Reduced_Motion) and hold that state until the Cursor moves away from v.

### Requirement 6: Move strip and player

**User Story:** As a viewer, I want each move labelled with its time, so that I see how close together the moves were.

#### Acceptance Criteria

1. THE Move_Strip SHALL label each dot "<Relative_Time> <Strip_Phrase>" and the ✕ "<Relative_Time of v> broke".
2. WHEN the crosswalk default flow runs, THE Move_Strip SHALL show "+0 ms", "+65 ms" and "+131 ms" for the three moves and "+450 ms broke" for the ✕.
3. WHEN the Cursor reaches or passes the cycle of a dot's Gremlin_Event during playback, THE Move_Strip SHALL pulse that dot once for 150 UI ms, or not at all while Reduced_Motion is on.
4. THE Player SHALL offer a Play/Pause button of at least 44 × 44 CSS px whose accessible name is "Play" while paused and "Pause" while playing, a "Replay" button that plays the Shown_Replay again from S to v as in Requirement 5.1 using the current Speed_Slider position, and the Speed_Slider.
5. WHEN the Speed_Slider moves, THE Player SHALL change only the mapping from UI time to Cursor, SHALL keep the Cursor at the cycle it held at that moment, and SHALL leave every event cycle, length and value unchanged.
6. THE App SHALL show the existing scrubber, previous/next event and preset speeds only in the Signals tab, and nowhere in the Stage or the Player.

### Requirement 7: BROKE, HELD and COULDN'T TELL cards

**User Story:** As a student, I want one honest verdict card, so that I never read a result into missing evidence.

#### Acceptance Criteria

1. THE App SHALL show only the verdict words BROKE, HELD and COULDN'T TELL, and every HELD card SHALL contain the exact HELD_Text "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N = 1) from `computeVerdict`.
2. THE BROKE card SHALL show "BROKE", the Plain_Broke_Sentence, the Cause_Line of Requirement 8 and "Broke on try N of M · found in <Elapsed_Seconds>" with N = `violatingRunIndex` + 1 and M = the buggy Campaign's tries.
3. WHEN the buggy Campaign ends with HELD or COULDN'T TELL, THE Aside SHALL show that verdict card with no Shrink_View and no "See the fix work →" button.
4. THE COULDN'T TELL card SHALL show "This program can't be judged here.", each Engine reason (split on "; ") as a list item, and "No result is better than a wrong one."
5. WHEN a verdict card appears, THE App SHALL fade it in and draw its coral edge in over 250 ms, or, under Reduced_Motion, show the finished card in a single step with no tween.
6. WHILE the Technical_View is shown, THE COULDN'T TELL card SHALL also list each entry of the `peripheralUses` field of the lowest-index run of the Campaign whose RunResult has that field, as "<peripheral> · <register> · cycle <cycle> (try N)" with N = that run's `runIndex` + 1, and SHALL list nothing extra when no run of the Campaign has the field.

### Requirement 8: Cause line

**User Story:** As a student, I want a one-line cause only when it is known to fit, so that the app never guesses.

#### Acceptance Criteria

1. WHEN the Reducer ends with a result and the Trace_Fingerprint of the reduced replay on the buggy build equals the Current_Example's Pinned_Fingerprint, THE BROKE card SHALL show that example's cause line from Contract section 9, character for character.
2. IF the Reducer ends with a result and the Trace_Fingerprint of the reduced replay on the buggy build differs from the Current_Example's Pinned_Fingerprint, or the Reducer ends without a result, THEN THE BROKE card SHALL show no Cause_Line.
3. WHILE the Reducer runs, THE BROKE card SHALL show no Cause_Line.

### Requirement 9: Reduction card

**User Story:** As a viewer, I want to see how much the attack shrank, so that I know the replay holds only what matters.

#### Acceptance Criteria

1. WHEN the Reducer ends with a result, THE Reduction_Card SHALL show "<X> moves → <Y> needed" (X = `originalEventCount`, Y = `reducedEventCount`, "1 move" when X = 1) and "The smallest replay this reducer found."
2. WHEN the Reducer ends with a result whose `stoppedAtBudget` is false, THE Reduction_Card SHALL show "Take away any one of these K moves and this replay no longer breaks the rule." with K = Y, or "Take away this move and this replay no longer breaks the rule." when K = 1.
3. WHEN the Reducer ends with a result whose `stoppedAtBudget` is true, THE Reduction_Card SHALL show "Shrinking stopped at its limit; fewer moves may still break it." and no sentence of criterion 2.
4. WHEN the Reducer ends with a result, THE Aside SHALL show the primary button "See the fix work →".
5. IF the Reducer ends with an error, THEN THE Reduction_Card SHALL show the error message and none of the sentences of criteria 1 to 3, and THE Aside SHALL show no "See the fix work →" button.

### Requirement 10: Fix view

**User Story:** As a teacher, I want the same moves played on both programs side by side, so that the class sees what the fix changed.

#### Acceptance Criteria

1. WHEN the user presses "See the fix work →", THE App SHALL start the Fixed_Campaign and the reduced replay on the fixed build, and SHALL show the Fix_View with the heading "The same K moves, on both programs" (K = `reducedEventCount`; "The same 1 move, on both programs" when K = 1) and the badge "Same moves, same moment · " followed by the Speed_Badge text for the current Slow_Factor with its initial letter in lower case (for example "slowed 4× so you can see it", "real speed").
2. THE Fix_View SHALL show the left Scene "Original program" (reduced replay, buggy build) and the right Scene "Fixed program" (same Reduced_List, fixed build) on one Cursor and one Player.
3. WHILE the shared Cursor is at or past v, THE left Scene SHALL stay frozen at v with a coral border and the card "BROKE · Stopped at the break."
4. WHILE the Fix_View plays, THE right Scene SHALL follow the shared Cursor up to v + 8,000,000 cycles (500 ms), stop there, and show a badge built from the Shown_Replay's output levels at the Cursor (an output is on at level 1), with parts joined by " · ": crosswalk "Car light: <green|yellow|red>" (the lit light) and "Walk sign: <on|off>" (WALK); garage "Door: <closing|opening|stopped>" (closing when MOTOR_CLOSE is on, opening when MOTOR_OPEN is on, stopped only when neither is on); I'm-alive "I'm-alive light: <on|off>" (HEARTBEAT). WHEN more than one car light is lit, THE badge SHALL name each lit light in the order green, yellow, red joined by " and " (for example "Car light: green and red"); WHEN no car light is lit, it SHALL read "Car light: off"; WHEN both motors are on, it SHALL read "Door: closing and opening".
5. WHEN the reduced replay on the fixed build ends, THE right card SHALL show "Same K moves: no break." if that replay has no violation, "Same K moves still break the fixed program." if it has a violation of the Target_Rule, and "Same K moves break a different rule on the fixed program." if it has violations of other rules only (K = `reducedEventCount`; "Same 1 move: no break.", "Same 1 move still breaks the fixed program." and "Same 1 move breaks a different rule on the fixed program." when K = 1).
6. WHILE the Fixed_Campaign runs, THE right card SHALL show "Checking the fixed program: try N of M" with N = min(`runsCompleted` + 1, M) from the latest Fixed_Campaign progress message, as in Requirement 3.2.
7. WHEN the Fixed_Campaign ends, THE right card SHALL show "HELD · fixed program, all M tries:" followed by the exact HELD_Text, or, for BROKE, "BROKE · fixed program, try N of M:" (N = `violatingRunIndex` + 1, M = the tries) followed by the Plain_Broke_Sentence, or, for COULDN'T TELL, "COULDN'T TELL · fixed program:" followed by the reasons of Requirement 7.4.
8. THE Fix_View SHALL show "What the fix changed" with the Current_Example's fix explanation from Contract section 9, a collapsed "Show the code change ▾" disclosure holding the Diff_Hunks with comment-only hunks hidden, and a "Replay both" button that restarts the shared auto-play of both Scenes from S.

### Requirement 11: Tabs

**User Story:** As a maker, I want details grouped in tabs, so that the stage stays readable.

#### Acceptance Criteria

1. THE App SHALL show the Tabs with `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected="true"` on the selected tab only, and roving `tabindex` (`0` on the selected tab, `-1` on every other tab).
2. WHEN the user presses Left or Right while a tab has focus, THE App SHALL move focus and selection to the previous or next tab, wrapping at both ends, and cross-fade the tabpanel in 150 ms (one step under Reduced_Motion).
3. THE "What happened" tab SHALL show the Plain_Story and one line per distinct gremlin named in it, in order of appearance, with its icon: "<Name>: a gremlin that <plain text of Contract section 9>".
4. THE "Signals" tab SHALL show the existing Timeline with Friendly_Label lane names, the scrubber, previous/next event, "Jump to the break", the preset speeds and the toggles "Reduced replay" and "Fixed program", plus "Original run" in the Technical_View only.
5. WHEN the fixed program has run at least once, THE "The fix" tab SHALL show the fix explanation and the code change.
6. THE "Details" tab SHALL show the Gremlin_Log with columns Time · Move · Gremlin (Technical_View: Time · Signal · Value · Gremlin), and, in the Technical_View only, the tries and seed fields, the Cycles_Rate_Text, the Canonical_Sentence, the Exact_Story and "Try removing a move".
7. IF the UI_Clock time of Elapsed_Seconds is 0 ms, THEN THE Details tab SHALL show no Cycles_Rate_Text.
8. IF the fixed program has not yet run, THEN THE "The fix" tab SHALL show "Press See the fix work to compare." in place of the fix explanation and the code change.
9. THE App SHALL show the Tabs at all times. IF no Campaign has produced a replay since the App loaded or since the Current_Example, rule or gremlin set last changed, THEN THE "What happened" and "Signals" tabs SHALL each show "Nothing has broken yet." in place of the Plain_Story, the legend and the Timeline.
10. WHILE the Technical_View is shown, THE "Details" tab SHALL show the existing "Replay again" button, enabled only while no job runs and the reduced replay on the buggy build has succeeded. WHEN the user activates it, THE App SHALL replay the Reduced_List on the buggy build on a fresh EmulatorBridge and show "Fingerprint <Trace_Fingerprint> · matches" when the fingerprint equals the previous reduced-replay fingerprint, "Fingerprint <Trace_Fingerprint> · differs" otherwise, or the replay error text. WHILE the Plain_View is shown, THE App SHALL not show the button or its line.

### Requirement 12: Rule presets

**User Story:** As a teacher, I want to change the time limit of a rule, so that students can see where a program starts to fail.

#### Acceptance Criteria

1. THE "Change rule ▾" menu SHALL offer the Current_Example's Rule_Preset, with a Limit_Control for garage and heartbeat and none for crosswalk, and no drop-down rule builder.
2. WHEN the Limit_Control value changes to a whole number from 1 to 60,000, THE App SHALL rebuild the Canonical_Sentence of each preset rule with the existing render and parse path, check it with the Rule_Box_Check, remove any reason shown by criterion 3 and stop disabling "Unleash gremlins" for that reason.
3. IF the Limit_Control value is not a whole number from 1 to 60,000 (including an empty field), THEN THE App SHALL keep the last valid rule set, show a reason beside the control stating that the value must be a whole number from 1 to 60,000, and disable "Unleash gremlins".
4. WHILE the limit of the current valid rule set differs from the Limit_Control default (20 for garage, 600 for heartbeat), THE App SHALL show the headline "Custom rule: When the beam is blocked, the door must stop closing within N ms." (garage) or "Custom rule: The I'm-alive light must never freeze on or off for N ms." (heartbeat), with N = that limit, and SHALL otherwise show the default Rule_Headline.
5. FOR ALL whole N from 1 to 60,000, rendering the preset rule with N, parsing the result and rendering again SHALL give the same Canonical_Sentence, and the parsed limit SHALL equal N (round-trip property).
6. THE App SHALL keep the free-text Rule_Box in the Technical_View only.

### Requirement 13: Crosswalk scene

**User Story:** As a student, I want a crosswalk scene I can read at a glance, so that I see the conflict without reading signals.

#### Acceptance Criteria

1. THE crosswalk Scene SHALL draw a left-to-right road, zebra stripes, a stop line, sidewalks, a car with hood, windshield and headlights that are always lit, a vertical three-light car signal at the stop line, a walk signal box at the crossing, a neutral walker figure that is not a ghost, and a walk-button post with the Masher icon on the top sidewalk.
2. THE car position SHALL be a pure function of the Shown_Replay output edges and the Cursor, so that the same edges and Cursor always give the same position. The car advances only while the car light at the Cursor is green or yellow, and it holds at the stop line while the car light is red.
3. FOR ALL output edge sequences and all Cursor cycles, THE car SHALL have no overlap with the stripes region while the walk sign is on or while the walker overlaps the stripes region (property test).
4. THE walker SHALL wait on the top sidewalk while the walk sign is off and no crossing has started, cross while the walk sign is on, and, once a crossing has started, finish it even if the sign goes off.
5. WHILE the car light is green and the walk sign is on, THE Scene SHALL ring both signals in coral and show "Both have a green!".
6. WHILE the walk-button input is pressed at the Cursor, THE Scene SHALL light the button lamp, and it SHALL keep the lamp unlit at every other Cursor position.
7. WHEN the Cursor reaches a REQUEST Gremlin_Event of the Shown_Replay, THE Scene SHALL show a press burst lasting 150 ms of on-screen time.
8. THE App SHALL show the HTML labels "Car light: green/yellow/red", "Walk sign: on/off" and "Walk button" outside the SVG, and each label's value SHALL match the Scene state at the Cursor.

### Requirement 14: Garage scene

**User Story:** As a student, I want to see the beam and the door, so that I understand the missed deadline.

#### Acceptance Criteria

1. THE garage Scene SHALL draw a frame and a slatted door whose position follows `doorTravelAt` continuously.
2. THE Scene SHALL show the pumpkin at every Cursor at or after the cycle of the earliest BEAM_CLEAR Gremlin_Event of the Shown_Replay, and SHALL show no pumpkin before that cycle or when the Shown_Replay has no BEAM_CLEAR Gremlin_Event.
3. THE beam line SHALL show the BEAM_CLEAR level at the Cursor. Blocked means BEAM_CLEAR is at its fixture active level. While blocked, the line SHALL be an amber dashed line broken at the pumpkin with "Beam blocked" beside the receiver on the right. Otherwise it SHALL be a solid line with "Beam clear" in the same place.
4. IF BEAM_CLEAR changed level more than once at cycles c with Cursor − 160,000 < c ≤ Cursor (160,000 cycles = 10 ms), THEN THE Scene SHALL show "Sensor reading flickers". Otherwise the Scene SHALL NOT show it.
5. IF the Shown_Replay is the reduced replay on the buggy build and the Cursor is at or past v, THEN THE Scene SHALL show the coral badge "<N> ms deadline missed · door still closing" above the frame (N = the active rule's limit in whole ms). Otherwise the Scene SHALL NOT show the badge. THE Scene SHALL never draw an outline over the door.

### Requirement 15: I'm-alive scene

**User Story:** As a student, I want to see the light freeze, so that "stuck" means something visible.

#### Acceptance Criteria

1. THE I'm-alive Scene SHALL draw "Sensor", a "Program" box and the "I'm-alive light", with a ring around the light whose fill equals the CPU cycles since the light last changed (or since the run started, before any change) divided by the rule limit × 16,000 cycles/ms, capped at 1 and reset to 0 on every change.
2. WHILE the time since the last change is below the rule limit, THE Scene SHALL label the light "blinking = program running".
3. WHEN the time since the last change reaches the rule limit, THE Scene SHALL turn the ring coral and label it "stuck on for <N> ms" if the light's level is high or "stuck off for <N> ms" if it is low (N = the rule limit, 600 by default), until the light next changes.
4. WHILE a stuck Gremlin_Event holds PULSE active, THE Scene SHALL place the stuck icon on the sensor.
5. WHERE an I'm-alive rule broke on the buggy build, THE App SHALL show under the Scene "While waiting on the sensor, the program forgot to blink.", and SHALL hide that line for every other verdict and for the fixed build.

### Requirement 16: Gremlin icons and copy tables

**User Story:** As the product owner, I want one icon set and one set of plain texts, so that every view names gremlins the same way.

#### Acceptance Criteria

1. THE App SHALL hold six original pumpkin line-art icons (masher with a hammer, bouncer on a spring with jitter marks, stuck sitting on a button, dropout with a pulled plug, spike with a lightning bolt, drifter with a slow wave), each with a dimmed variant. It SHALL use them on chips, Timeline markers, the legend and Scenes, and SHALL show the dimmed variant for each disabled gremlin.
2. THE App SHALL use the Friendly_Labels "I'm-alive light" for HEARTBEAT and "Sensor" for PULSE, and SHALL write "I'm-alive light" in place of "heartbeat light" in every Example_Copy, Story_Ending and scene text.
3. THE Story_Labels for PULSE SHALL be active "turned the sensor on", inactive "turned the sensor off" and held "held the sensor on", and the short Plain_Story_Labels for PULSE SHALL be active "turned it on again", inactive "turned it off" and held "held it on".
4. THE Plain_Story_Builder SHALL replace "The gremlin" with the gremlin's name, capitalised (for example "Masher"), on the opening move. It SHALL name the gremlin again on each move whose gremlin differs from the previous move's, and SHALL keep the span sentences unchanged.
5. WHEN the Details_Switch changes state, THE App SHALL keep every visible label text unchanged and SHALL only add or remove detail, with no "Campaign" / "Rule area" swap and no second tagline.

### Requirement 17: Layout, look and accessibility

**User Story:** As any user, I want a page that never clips or overlaps and works by keyboard, so that I can use it on any screen.

#### Acceptance Criteria

1. THE App SHALL use the colour tokens, radii, spacing scale, type sizes and the system font stacks of Contract section 1, with monospace only for times and code, and dashed borders only for disabled elements.
2. THE App SHALL give every interactive element a touch target of at least 44 × 44 px and a focus ring that shows whenever the element has keyboard focus, and SHALL give every control an accessible name.
3. THE App SHALL scale each Scene to its container with `width: 100%` and `height: auto` and SHALL place every label outside a Scene in HTML.
4. WHILE the viewport is 1440, 1280, 1024, 768 or 375 px wide, THE App SHALL show no clipped text and no text overlapping other text, shapes or Scene elements (checked by the user in a browser).
5. WHILE the viewport is at Phone_Width, THE App SHALL show one column in this order: Setup_Summary, Scene, BROKE card with Cause_Line, the Move_Strip moves as one row per move, "Replay" and "See the fix work →", then the Tabs, and SHALL show the text "scripted pests, not AI" on the page without it being hidden.
6. WHILE Reduced_Motion is on, THE App SHALL run no auto-play and no tween, using step changes only, and SHALL still show the frame at v and the Scene badges of Requirement 5.7.
7. WHEN the setup collapses or expands, THE App SHALL animate its height over 250 ms (one step under Reduced_Motion).

### Requirement 18: Copy rules

**User Story:** As the product owner, I want every new string checked, so that the app never promises what it cannot show.

#### Acceptance Criteria

1. THE App SHALL contain no whole-word, ASCII case-insensitive match of safe, safety, secure, guaranteed, certified, real-time, realtime, first, unique, shortest or any entry of Board_Brand_Names in any file under `src/ui/app/` or in `index.html`, code, comments and identifiers included.
2. THE copy scan test SHALL scan every string table (a module-level object or array whose values are UI copy strings) added or changed by this feature with the word lists of criterion 1, and SHALL fail and list each match with its table, key and word.
3. THE App SHALL write the shrink result with the phrase "The smallest replay this reducer found." and SHALL use no other text that calls a replay shortest, smallest, minimal, minimum or optimal.
4. THE App SHALL derive every number it shows about the current run (elapsed time, cycles per second, counts, try numbers) from that run's data, and no such number SHALL appear as a literal in UI code or copy strings.

### Requirement 19: Determinism

**User Story:** As a maintainer, I want display code kept apart from checking, so that pacing never changes a verdict.

#### Acceptance Criteria

1. THE App SHALL compute Relative_Time, the Segment, Clusters, the Pacing_Plan input, Scene positions and every Plain_Ms from integer CPU cycles only.
2. THE App SHALL use the UI_Clock only for Elapsed_Seconds, the Cycles_Rate_Text, playback and motion, and SHALL put no UI_Clock value, Slow_Factor or Speed_Slider value in any Worker_Message it posts to the Engine_Worker.
3. THE App SHALL call no `Math.random` and no `crypto.getRandomValues`, and SHALL make no network request outside its own origin.
4. THE App SHALL build each Display_Replay on a fresh EmulatorBridge from the same HEX, fixture, rule set and ordered event list as its matching Replay, with no snapshot.

### Requirement 20: Stage tests

**User Story:** As a maintainer, I want the new display logic held to stated values in Node, as evidence that it does what the copy says.

#### Acceptance Criteria

1. THE Agent SHALL add Stage_Tests, run in Node under `npx vitest --run` with no headless browser, for: the Pacing_Plan (Requirements 5.3 to 5.6) as a property test over random Reduced_Lists; the Friendly_Factor and Speed_Badge, covering each rounding band, the floor of 2 and "Real speed" at a Slow_Factor of exactly 1; Relative_Time with the crosswalk values of Requirement 6.2; Cause_Line gating (Requirement 8); the Shrink_View dot fading of Requirement 4.4; car, walker, door and ring positions including Requirement 13.3 as a property test over random edge sequences; the pumpkin and flicker rules (Requirements 14.2 and 14.4); Elapsed_Seconds (870 ms gives "0.9 s"); the Cycles_Rate_Text, including the 0 ms case of Requirement 11.7; the Reduction_Card sentences of Requirement 9 for both values of `stoppedAtBudget` and K = 1; and the Rule_Preset round-trip of Requirement 12.5.
2. THE Stage_Tests SHALL assert the values or behaviour stated in the cited requirement or Glossary definition, and every property test SHALL use a fixed seed and at least 100 runs.
3. WHEN the Agent reports this requirement done, THE Agent SHALL have every Stage_Test passing under `npx vitest --run`.
4. THE Agent SHALL add each string table introduced by this spec to the copy scan of Requirement 18.2.
5. THE Agent SHALL describe passing tests as evidence, not proof.

### Requirement 21: Constraints and existing pins

**User Story:** As the product owner, I want this feature to leave the engine, the examples and the pinned numbers alone.

#### Acceptance Criteria

1. THE Agent SHALL, compared with the commit at which this feature's work starts, edit, delete or rename no file under `src/engine/`, `examples/` or `fixtures/`, no baseline file, `src/ui/main.ts` or `src/ui/style.css`, and no committed test file outside `tests/ui/`.
2. THE Agent SHALL change a committed file under `tests/ui/` only where this document changes a pinned string (Details_Switch label, device card texts, analog reason, gremlin legend lines, HEARTBEAT and PULSE labels, story naming, Reduction_Row and fix-flow labels), and SHALL change no pinned number, seed, run count, reduction count, fingerprint, HELD_Text or span value.
3. THE Agent SHALL leave every committed test that pins one of these values passing under `npx vitest --run` on the final working tree: crosswalk BROKE on run 4 of 24, seed 20261101, 8 → 3, fingerprint `47078989121ebc1d`; garage BROKE on run 8 of 40, seed 20261102, 7 → 3, fingerprint `616062947f71a1ae`; heartbeat BROKE on run 2 of 24, seed 20261103, 2 → 1, fingerprint `19827a4e0a7ad440`; the fixed-build HELD_Texts for 24, 40 and 24 runs; and the span pins of bench-ui-examples Requirement 21.6.
4. THE Agent SHALL keep the `dependencies` and `devDependencies` of `package.json` and the whole of `package-lock.json` identical to the commit at which this feature's work starts.
5. IF a requirement needs a change under `src/engine/`, THEN THE Agent SHALL stop and report the needed change without making it.
6. IF a test the user wrote and the system disagree, THEN THE Agent SHALL leave the test unchanged, report what the test expects, what happened and the evidence, and wait for the user's decision.
7. WHEN the feature is complete, THE Agent SHALL delete every temporary debug script, run each Global_Check once, and report each command with its exit code and, for `npx vitest --run`, the passed, failed and skipped test counts it prints.
