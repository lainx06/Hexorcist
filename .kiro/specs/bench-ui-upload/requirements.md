# Requirements Document

## Introduction

This feature adds the fourth Device_Card, "Your own program", to the App page. A visitor loads a compiled ATmega328P `.hex` file, maps its pins in a Pin_Table, writes a rule in the exact-text Rule_Box, picks gremlins and presses "Unleash gremlins". The run goes through the existing Engine_Worker jobs (`campaign`, `reduce`, `replay`, `display-replay`), which already take `{ hex, fixture, ruleSet, ... }`. The Stage shows a Pin_Levels_View in place of an illustrated Scene. A Capability_Panel in the Details tab, shown for every device, lists what the checker models and what it does not.

Sources: the user's request (sections U1 to U8, OUT OF SCOPE, HONESTY AND COPY RULES, ACCEPTANCE A1 to A8), `docs/stage-design.md` (the Contract) for wording and behaviour, and `docs/mockup/html/setup.html` and `docs/mockup/01.png` for the look. The decision records D59, D60, D65 and D66 are not in the repository (a search of the workspace found no match); this document relies on the user's summary of them.

The three Examples keep their Stage, Tabs, Player, Move_Strip, Shrink_View and verdict cards exactly as they are today.

Findings made while writing this document (each cites the code it comes from):

- **Crosswalk tries.** `examples/crosswalk/meta.json` holds `runs: 24`, `runCycles: 16000000` (1 s) and `campaignSeed: 20261101`. A1's "try 4 of 24" therefore agrees with U2's "the crosswalk tries". No contradiction.
- **Pressed level.** `DigitalFixturePin.activeLevel` (`"low"` | `"high"`, input pins only, default `"low"`, `src/engine/types.ts`) expresses the Pressed level column directly. `validateFixture` already rejects `activeLevel` on output pins.
- **Analog pins.** The Pin_Table of U3 has no analog column. An imported pin map that holds an analog pin is rejected with one import error (Requirement 7.13).
- **Duplicate signal and duplicate port/bit.** `validateFixture` checks neither. The rule binder reports `signal X is mapped to more than one pin` only at check time (`src/engine/rules/bind.ts`). The Pin_Table adds both checks (U3).
- **Unmapped rule signal.** `compileRuleSet` accepts a rule that names a signal missing from the Fixture; the Campaign then gives COULDN'T TELL ("Signals not mapped to a pin: ..."). U4 asks the Rule_Box to block such a rule before a run instead. This stops a run; it gives no verdict, so it does not conflict with the rule that unmapped pins give COULDN'T TELL.
- **HEX parser line numbers.** `hexToProgMem` (`src/engine/hex-parser.ts`) gives a line number only for "line N is too short", "line N is too short for declared byte count" and "checksum mismatch at line N". The messages "line does not start with ':'", "unknown record type 0xNN", "flash overflow: ...", "data after EOF record", "missing EOF record" and "empty HEX string" carry none. `hexToProgMem` has no file size check; the 256 KB limit is a UI check on `File.size`.
- **Bootloader HEX files.** Every `*.with_bootloader.hex` under `fixtures/*/build/` starts with the record `:020000040000FA` (type 0x04, extended linear address), which `hexToProgMem` rejects as "unknown record type 0x04". The plain files (for example `fixtures/serial_hello/build/serial_hello.ino.hex`) have no such record. Decided: no engine change (see Decisions).
- **Run length field.** `src/ui/app/model/fields.ts` has only the Run_Count and Campaign_Seed checks; there is no run length field today. Every Example takes its run length from `meta.runCycles`. U5's "existing technical fields" therefore covers tries and seed only; this feature adds a Run_Length_Field.
- **Story labels.** `plainStory` (`src/ui/app/model/plain-story.ts`) looks up `PLAIN_STORY_LABELS` and `friendlyLabel` by signal name in global tables (`src/ui/app/model/labels.ts`). An upload that uses the signal name `REQUEST` would get "pressed the walk button". Uploads need the builder to take its labels from the Pin_Table; this is a UI model change, not an engine change.
- **Floating-input diagnostics.** The Worker's `CompactCampaignResult` (`src/ui/app/worker/messages.ts`) carries no `RunResult.diagnostics`. A floating-input read reaches the UI today only as the CannotCheck reason "input X was read while floating" (`src/engine/rules/rule-checker.ts`) inside the Verdict (BROKE `unchecked` or the COULDN'T TELL reason).
- **Capability data.** The not-modelled parts are `UNMODELLED_PERIPHERALS` in `src/engine/peripherals.ts` (16 rows, each with a `plainName`, for example "serial port", "data EEPROM", "watchdog timer"). The modelled set is a local `Set` inside `AVR8jsBridge.supports()` (`gpio`, `external-interrupt`, `pin-change-interrupt`, `timer0`, `timer1`, `timer2`, `adc`) and is not exported.
- **Serial example.** `fixtures/serial_hello/fixture.json` maps only `LED` (PB5, output). U3 requires at least one input to unleash.
- **Config.** The spec id in `.config.kiro` was supplied by the workflow and equals the id in `.kiro/specs/bench-ui-stage/.config.kiro`.
- **Additions not in the request.** Imported pin maps are capped at the Size_Limit; an imported pin field that a Pin_Row cannot hold (for example `restState: "active"`) is an import error (Requirement 7.7); a Digital_Row with no port or bit is a Row_Error (Requirement 5.11). The user approved these additions.
- **Start_Commit.** Start_Commit (Requirement 20.1) is the commit at which this feature's work starts.

## Decisions

All eleven questions are decided. The requirements state each result without "provisional" markers.

- **Q1 Run length.** The Run_Length_Field takes whole milliseconds, 1 to 60,000, converted at 16,000 cycles per millisecond. A2 uses 625 ms (10,000,000 cycles, shown "0.6 s").
- **Q2 Analog pins.** An imported pin map that holds any analog pin is rejected with one import error (Requirement 7.13). There is no Analog_Row.
- **Q3 A3 pin map.** `LED` (PB5, output) and `BUTTON` (PD2, input, Pressed level Low), the rule `LED is 1 must never last 500 ms or longer.`, Masher, default fields.
- **Q4 Upload_Card border.** A solid 1 px border like the other cards, because dashed means disabled. No note is added to `docs/stage-design.md`.
- **Q5 Bootloader HEX.** No engine change; Requirement 3.6 gives the plain error.
- **Q6 Modelled list.** The Capability_Panel shows the three items of Requirement 14.2 and nothing more.
- **Q7 Sample plain names.** "Try the sample" fills the Friendly_Label names; "Download the sample" gives the bundled `fixture.json` text unchanged.
- **Q8 Story wording.** Keep "changed <Name>" and "changed it".
- **Q9 Default gremlins.** Masher is preselected when Compatible; no other gremlin is.
- **Q10 Device grid.** 4 columns above 768 px, 2 x 2 at 768 px and below.
- **Q11 Gremlin order.** `gremlinSet` uses the fixed GREMLIN_CATALOGUE order (masher, bouncer, stuck, dropout, spike, drifter), whatever order the chips were clicked in. The Technical_View shows it (Requirement 9.10). A2 asserts only fingerprint `616062947f71a1ae`; "Broke on try 1 of 40" and 9 -> 3, as measured, are accepted for A2.
- **Approved additions.** The 256 KB import cap, the unholdable-field import error, the `clockHz` check, the no-port/no-bit Row_Error, 40-character Plain_Names and the plain wording of messages.

## Glossary

Terms defined in `.kiro/specs/bench-ui-core/requirements.md`, `.kiro/specs/bench-ui-examples/requirements.md` and `.kiro/specs/bench-ui-stage/requirements.md` keep their meaning (App, Engine, Engine_Worker, Worker_Host, Message_Codec, Example, Current_Example, Contract, Stage, Scene, Scene_Area, Aside, Shown_Replay, Device_Card, Gremlin_Chip, Setup_Summary, Move_Strip, Player, Speed_Badge, Pacing_Plan, Shrink_View, Reduction_Card, Cause_Line, Pinned_Fingerprint, Fix_View, Tabs, Rule_Box, Rule_Box_Check, Rule_Headline, Canonical_Sentence, Compatible, Selected_Gremlin_Set, Friendly_Label, Plain_Story_Builder, Plain_Story, Display_Replay, Reduced_List, Gremlin_Event, Target_Rule, Trace_Fingerprint, HELD_Text, Run_Length_Text, Plain_View, Technical_View, Phone_Width, Reduced_Motion, Banned_Words, Board_Brand_Names, Global_Checks, Agent), except where redefined here.

- **Upload_Card**: the fourth Device_Card, titled "Your own program".
- **Upload_Device**: the device state in which the Upload_Card is selected.
- **Program_Section**: the setup section shown above section "2 · RULE" while the Upload_Device is selected; it holds the HEX file controls, the sample controls, the Help_Line and the Pin_Table.
- **Loaded_Program**: the HEX text and file name that the App holds in memory for the current tab after a successful load, together with its byte size.
- **Hex_Check**: the pure function under `src/ui/app/model/` that takes a file name, a byte size and the file text and returns either a Loaded_Program or one Hex_Error. It calls the existing `hexToProgMem`.
- **Hex_Error**: one plain-language sentence describing why a file was not loaded, with the parser's line number when the parser gives one.
- **Size_Limit**: 262,144 bytes (256 KB).
- **Flash_Limit**: 32,768 bytes (the ATmega328P's 32 KB of program memory); `hexToProgMem` rejects data at addresses above 32,767.
- **Help_Line**: the sentence "Compile for an ATmega328P at 16 MHz and use the plain .hex, not the one with a bootloader. Other clock speeds give wrong timings."
- **Sample**: the bundled crosswalk buggy HEX (`examples/crosswalk/buggy/buggy.hex`), its pin map (`examples/crosswalk/fixture.json`), its rule (`examples/crosswalk/rules.txt`), the gremlin Masher, and its tries (24), run length (16,000,000 cycles) and seed (20261101) from `examples/crosswalk/meta.json`.
- **Pin_Table**: the editable table of Pin_Rows in the Program_Section.
- **Pin_Row**: one row of the Pin_Table. A Digital_Row holds Signal_Name, Plain_Name, Port, Bit, Direction and, for inputs, Pressed_Level. Every Pin_Row is a Digital_Row.
- **Signal_Name**: the name rules use for a pin. A valid Signal_Name passes the rule grammar's `isSignalName` (`src/engine/rules/ir.ts`): pattern `^[A-Za-z][A-Za-z0-9_]{0,31}$`, not "all" or "any", and not a blocked word, in any letter case. Comparison between Signal_Names is exact (case-sensitive), as in the rule grammar.
- **Plain_Name**: an optional name of at most 40 characters, used in Plain_Stories, Timeline lanes, the Gremlin_Log and the Pin_Levels_View. Where it is blank, the Signal_Name is used.
- **Display_Name**: the Plain_Name of a Pin_Row when it is not blank, otherwise its Signal_Name.
- **Port_Bit_Text**: "Port <P>, bit <B> (P<P><B>)", for example "Port D, bit 2 (PD2)".
- **Pressed_Level**: the input's pressed level, shown as "Low (button to ground)" (the default, stored as `activeLevel: "low"`) or "High" (stored as `activeLevel: "high"`).
- **Max_Pins**: 16 Pin_Rows.
- **Row_Error**: a plain-language message shown on the Pin_Row it concerns.
- **Table_Error**: a plain-language message about the Pin_Table as a whole, shown directly under the Pin_Table.
- **Upload_Fixture**: the Fixture built from the Pin_Table: `{ pins: [...] }` in Pin_Table order, with no Plain_Name field, as posted to the Engine_Worker.
- **Pin_Map_File**: JSON text in the format of the Examples' `fixture.json` (an object with a `pins` array of `DigitalFixturePin` objects; an analog pin is an import error, Requirement 7.13), where each pin object may also carry one optional extra string field holding the Plain_Name. The design names the field and states why the Engine ignores it.
- **Export_Text**: the Pin_Map_File text the App writes for "Export pin map".
- **Run_Length_Field**: the new technical field for the run length of a Campaign on the Upload_Device (whole milliseconds, 1 to 60,000, converted to cycles × 16,000).
- **Upload_Defaults**: 24 tries, a run length of 1 s (16,000,000 cycles) and seed 20261100.
- **Upload_Model**: the pure, DOM-free functions under `src/ui/app/model/` that the UI calls for the Upload_Device: Hex_Check, Pin_Table validation, Pin_Map_File import and export, the upload rule check, the readiness check for "Unleash gremlins" and the building of the Campaign request.
- **Upload_Ready**: the state in which the Upload_Model allows "Unleash gremlins": a Loaded_Program exists, the Pin_Table has no Row_Error and no Table_Error, the upload rule check passes, the Selected_Gremlin_Set is not empty, the tries, seed and run length fields are valid, and no job runs.
- **Pin_Levels_View**: the Scene used on the Upload_Device: an 830 × 460 card listing input pins on the left and output pins as lamps on the right, driven only by the Shown_Replay's recorded input events and output edges at the Cursor.
- **Capability_Panel**: the Details tab section titled "What Hexorcist can and can't check", shown for every device.
- **Not_Modelled_List**: the `plainName` of every row of `UNMODELLED_PERIPHERALS`, in table order.
- **Upload_Tests**: the new Node Vitest files under `tests/ui/` added by this feature.
- **No_Network_Test**: the source test of Requirement 17.
- **Upload_Code_Paths**: the source files added or changed by this feature for the Program_Section, the Pin_Table, the Sample and the Upload_Model.
- **Start_Commit**: the commit hash recorded when this feature's work starts; all "unchanged" checks compare against it.

## Requirements

### Requirement 1: The "Your own program" card

**User Story:** As a maker, I want a fourth card for my own program, so that I can check firmware that is not one of the examples.

#### Acceptance Criteria

1. THE App SHALL show the Upload_Card as the fourth Device_Card in section "1 · PICK A DEVICE", after the Crosswalk, Garage door and I'm-alive light cards in that order. The card SHALL be a button with `aria-pressed` whose accessible name includes "Your own program". It SHALL hold the title "Your own program", the line "Load a compiled .hex for this chip and map its pins." and an original SVG illustration of an upward arrow inside a rounded rectangle, in the mockup's style. The illustration SHALL be marked `aria-hidden="true"` and SHALL hold no text, no logo and no board drawing.
2. WHILE the Upload_Device is not selected, THE App SHALL draw the Upload_Card with a solid 1 px border, as it draws the other Device_Cards, and SHALL give it `aria-pressed="false"` and no pumpkin border.
3. THE App SHALL lay out the four Device_Cards in the order of criterion 1, in one row of 4 columns at viewport widths above 768 px and in a 2 × 2 grid filled row by row at viewport widths of 768 px and below. It SHALL remove the empty grid slot that bench-ui-stage Requirement 2.1 reserved for this card, so that section "1 · PICK A DEVICE" holds exactly four grid items at every width.
4. WHEN the user selects the Upload_Card, THE App SHALL show the Program_Section inside the setup card in the same render, after section "1 · PICK A DEVICE" and before section "2 · RULE".
5. WHEN the user selects one of the three Example cards, THE App SHALL hide the Program_Section, make that Example the Current_Example, and show that Example's setup, Stage and Tabs with the same content and values they show before this feature. No rule text, Pin_Row, Selected_Gremlin_Set entry, tries, seed or run length value SHALL be taken from the Upload_Device.
6. WHEN the user selects the Upload_Card again after selecting an Example card in the same browser tab, THE App SHALL show the values held in memory (Requirement 2.4) as they were when the Upload_Card was last deselected: the Loaded_Program's file name and size, every Pin_Row in the same order with the same field values, the same rule text, the same Selected_Gremlin_Set, the same tries, seed and Run_Length_Field values, and the same Row_Errors, Table_Errors and rule errors.
7. WHILE the Upload_Device is selected, THE App SHALL give the Upload_Card `aria-pressed="true"` and the 2 px pumpkin border of a selected Device_Card in place of the 1 px border, and SHALL give each of the three Example cards `aria-pressed="false"` and no pumpkin border.
8. WHILE a Campaign runs, THE App SHALL disable the Upload_Card, as bench-ui-stage Requirement 2.7 disables every Device_Card.
9. WHEN the page loads, THE App SHALL open with the Crosswalk card selected as before this feature, the Upload_Card at `aria-pressed="false"` and the Program_Section hidden.

### Requirement 2: Loading a .hex file

**User Story:** As a student, I want to load my compiled file and see that it loaded, so that I know which program the gremlins will attack.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE Program_Section SHALL show a file input that has the visible label "Choose .hex file" as its accessible name, has the `accept` value `.hex`, allows one file per choice, and can be opened with the keyboard alone, in both the Plain_View and the Technical_View.
2. WHEN the user chooses a file, including a file with the same name as the current Loaded_Program, THE App SHALL pass its `File.name` and `File.size` to Hex_Check. THE App SHALL read the file text in the current tab with `FileReader` (or `File.text()`, as in Requirement 17.6) and pass that text to Hex_Check only when the name ends in ".hex" (ASCII case-insensitive) and `File.size` is at most the Size_Limit, so that Requirements 3.1 and 3.2 hold. IF the user chooses another file before the earlier read or check ends, THEN THE App SHALL apply only the result for the file chosen last.
3. WHEN Hex_Check returns a Loaded_Program, THE App SHALL replace any previous Loaded_Program with it and SHALL remove any Hex_Error shown. THE Program_Section SHALL show the file name exactly as `File.name` gives it, together with its size. A size below 1,024 bytes SHALL be written "<n> bytes", where n is the integer byte count with no thousands separator (1,023 bytes gives "1023 bytes"). Any other size SHALL be written "<k> KB", where k = bytes / 1,024 rounded half-up to one decimal, always with one digit after the "." (1,024 bytes gives "1.0 KB", 1,280 gives "1.3 KB" and 262,144 gives "256.0 KB"). THE App SHALL leave the Pin_Table, the rule text, the Selected_Gremlin_Set and the tries, seed and run length fields unchanged.
4. THE App SHALL hold the Loaded_Program, including its file name, HEX text and byte size, only in the memory of the current tab. THE App SHALL write no part of the file name, the HEX text or the Pin_Table to `localStorage`, `sessionStorage`, IndexedDB, cookies or the URL.
5. WHILE no Loaded_Program exists for the Upload_Device, or a chosen file is still being read or checked, THE App SHALL keep "Unleash gremlins" disabled.
6. IF a newly chosen file fails Hex_Check, THEN THE App SHALL show its Hex_Error in the Program_Section, SHALL discard any previous Loaded_Program and remove its file name and size from view, SHALL keep "Unleash gremlins" disabled until a later file passes Hex_Check or the Sample loads, and SHALL leave the Pin_Table, the rule text, the Selected_Gremlin_Set and the tries, seed and run length fields unchanged.
7. WHILE the Upload_Device is selected, THE Program_Section SHALL show the Help_Line verbatim in both the Plain_View and the Technical_View, whether or not a Loaded_Program exists.
8. THE Program_Section SHALL contain no Board_Brand_Names, no board logo and no board pin numbers, and the copy scan of Requirement 16.2 SHALL find no match in its strings.
9. IF the file read reports an error, THEN THE App SHALL show a Hex_Error in plain words saying that the file could not be read, SHALL discard any previous Loaded_Program, SHALL keep "Unleash gremlins" disabled and SHALL leave the Pin_Table, the rule text, the Selected_Gremlin_Set and the tries, seed and run length fields unchanged.
10. IF the user closes the file chooser without choosing a file, THEN THE App SHALL keep the current Loaded_Program, any Hex_Error shown and the state of "Unleash gremlins" unchanged.

### Requirement 3: HEX errors in plain words

**User Story:** As a student, I want a plain reason when my file is rejected, so that I can fix the file and try again.

#### Acceptance Criteria

1. IF the file name does not end in ".hex" (ASCII case-insensitive, so "prog.HEX" passes and "prog.hex.txt" fails), THEN Hex_Check SHALL return the Hex_Error "This is not a .hex file. Choose the compiled .hex file for your program." without inspecting the file text and without calling `hexToProgMem`.
2. IF the file name passes criterion 1 and the byte size is greater than the Size_Limit (262,144 bytes; 262,144 passes and 262,145 fails), THEN Hex_Check SHALL return the Hex_Error "This file is larger than 256 KB, too big to be a program for this chip." without calling `hexToProgMem`.
3. IF `hexToProgMem` returns the message "empty HEX string" (a 0-byte file, or text made only of whitespace), THEN Hex_Check SHALL return the Hex_Error "This file is empty."
4. IF `hexToProgMem` returns the message "checksum mismatch at line N", THEN Hex_Check SHALL return the Hex_Error "Line N has a wrong checksum. The file may be damaged or cut short.", where N is the same decimal line number that the parser reports (1-based, counting every line of the text split at line feeds, blank lines included).
5. IF `hexToProgMem` returns the message "line N is too short" or "line N is too short for declared byte count", THEN Hex_Check SHALL return the Hex_Error "Line N is not a valid .hex record.", where N is the same decimal line number that the parser reports.
6. IF `hexToProgMem` returns exactly the message "unknown record type 0x04", THEN Hex_Check SHALL return the Hex_Error "This looks like the .hex with a bootloader. Use the plain .hex instead.".
7. IF `hexToProgMem` returns a message "unknown record type 0x<XX>" other than 0x04 (including "unknown record type 0xNaN", which the parser returns for a record with non-hexadecimal characters), "line does not start with ':'", "data after EOF record" or "missing EOF record", THEN Hex_Check SHALL return the Hex_Error "This file is not a valid .hex file."
8. IF `hexToProgMem` returns a message that starts with "flash overflow:" (data at an address above 32,767, past the Flash_Limit), THEN Hex_Check SHALL return the Hex_Error "This program is bigger than the chip's 32 KB of program memory."
9. WHILE the Technical_View is shown and a Hex_Error from criteria 3 to 8 is shown, THE Program_Section SHALL show the parser's `message` text, character for character, on the line directly under the Hex_Error.
10. THE Hex_Check SHALL use the existing `hexToProgMem` unchanged, SHALL return exactly one Hex_Error for each failing input, and SHALL map each of the nine `invalid-hex` message forms in `src/engine/hex-parser.ts` to exactly one of the Hex_Errors in criteria 3 to 8.
11. THE Hex_Check SHALL apply its checks in this order and return the first failure only: the file name check (criterion 1), then the size check (criterion 2), then `hexToProgMem` (criteria 3 to 8).
12. IF `hexToProgMem` returns an `invalid-hex` message that matches none of the forms in criteria 3 to 8, THEN Hex_Check SHALL return the Hex_Error "This file is not a valid .hex file." and SHALL return no Loaded_Program.
13. WHILE the Plain_View is shown, THE Program_Section SHALL show only the Hex_Error and SHALL NOT show the parser's own message.

### Requirement 4: The sample

**User Story:** As a teacher, I want a ready sample, so that students can see the upload flow before they have a file of their own.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE Program_Section SHALL show two buttons labelled exactly "Try the sample" and "Download the sample", in both the Plain_View and the Technical_View, with "Try the sample" disabled while a Campaign, reduction or replay runs (Requirement 5.7).
2. WHEN the user activates "Try the sample", THE App SHALL replace any previous Loaded_Program with the bundled crosswalk buggy HEX text under the name "crosswalk-buggy.hex" and a byte size equal to the UTF-8 byte length of that text, SHALL clear any Hex_Error on screen, and SHALL show that name and size in the Program_Section as Requirement 2.3 describes.
3. WHEN the user activates "Try the sample", THE App SHALL fill each Plain_Name of the Sample's Pin_Rows with that signal's Friendly_Label text, giving REQUEST "Walk button", CAR_GREEN "Car light: green", CAR_YELLOW "Car light: yellow", CAR_RED "Car light: red", WALK "Walk sign" and DONT_WALK "Don't walk sign".
4. WHEN the user activates "Download the sample", THE App SHALL offer two downloads built with `Blob` and object URLs from the bundled strings: "crosswalk-buggy.hex" holding the bundled buggy HEX text and "crosswalk-pins.json" holding the bundled crosswalk `fixture.json` text. Each file's content SHALL equal its bundled string byte for byte, line endings included. The App SHALL leave the Loaded_Program, the Pin_Table, the rule text, the Selected_Gremlin_Set and the field values unchanged.
5. THE App SHALL take the Sample's HEX text, `fixture.json` text, `rules.txt` text and `meta.json` values only from strings embedded in the built static files at build time, and SHALL make no network request when the user activates "Try the sample" or "Download the sample".
6. WHEN the user activates "Try the sample", THE App SHALL replace the Pin_Table with one Digital_Row per pin of the bundled crosswalk `fixture.json`, in file order (REQUEST, CAR_GREEN, CAR_YELLOW, CAR_RED, WALK, DONT_WALK), each with the file's signal, port, bit and direction, and with Pressed_Level "Low (button to ground)" for REQUEST. It SHALL set the rule text to the bundled crosswalk `rules.txt` text character for character, set the Selected_Gremlin_Set to Masher alone (clearing every other gremlin), and set tries to 24, run length to 16,000,000 cycles (1,000 in the Run_Length_Field) and seed to 20261101. The setup line SHALL then read "24 tries · 1 s of device time each".
7. WHEN "Try the sample" has filled the Program_Section and no job runs, THE App SHALL show no Hex_Error, no Row_Error, no Table_Error and no rule error, SHALL enable "Unleash gremlins" (Upload_Ready holds), and SHALL show the Stage in the no-Campaign state of Requirement 11.7, with no verdict, replay or Shrink_View left over from an earlier upload Campaign.
8. WHEN the user activates "Unleash gremlins" right after "Try the sample", with no change in between, THE App SHALL post a `campaign` request with the same HEX text, Fixture, rule set, gremlin set, seed (20261101), tries (24) and run length in cycles (16,000,000) as the crosswalk Example's Campaign request. Its Upload_Fixture SHALL deep-equal the parsed crosswalk `fixture.json` and SHALL hold no Plain_Name.

### Requirement 5: The pin table

**User Story:** As a maker, I want to map my program's pins in a table, so that rules and gremlins know which pin is which.

#### Acceptance Criteria

1. THE Pin_Table SHALL show for each Digital_Row the columns "Signal name", "Plain name", "Port" (a choice of B, C or D), "Bit" (a choice of 0 to 7), "Direction" (a choice of "Input" or "Output") and "Pressed level" (a choice of "Low (button to ground)" or "High"). It SHALL show the row's Port_Bit_Text (for example "Port D, bit 2 (PD2)") next to its Port and Bit whenever both are set. It SHALL show a port or bit read from an imported Pin_Map_File unchanged, including a value outside these lists (for example port "E" or bit 9), so that Requirement 6 can report it as a Row_Error.
2. WHILE a Digital_Row's Direction is "Output", THE Pin_Table SHALL show no Pressed level control on that row, and THE Upload_Model SHALL write no `activeLevel` for that row into the Upload_Fixture.
3. WHEN the user changes a Digital_Row's Direction from "Output" to "Input", THE Pin_Table SHALL set that row's Pressed_Level to "Low (button to ground)", whatever Pressed_Level the row held before.
4. THE Pin_Table SHALL show one "Add pin" button. Each Pin_Row SHALL have a remove button. The button's accessible name SHALL include the row's Display_Name, or the row's 1-based position in the Pin_Table when both its Signal_Name and its Plain_Name are blank.
5. WHILE the Pin_Table holds Max_Pins (16) Pin_Rows, THE Pin_Table SHALL disable "Add pin". WHILE it holds 0 to 15 Pin_Rows and no job of criterion 7 runs, THE Pin_Table SHALL enable "Add pin".
6. WHILE the viewport is 600 px wide or narrower, THE Pin_Table SHALL show each Pin_Row as a stacked card, in Pin_Table order. Each control on the card SHALL have a visible text label naming its column ("Signal name", "Plain name", "Port", "Bit", "Direction" or "Pressed level"). WHILE the viewport is wider than 600 px, THE Pin_Table SHALL show one table row per Pin_Row under one header row of column names.
7. WHILE a `campaign`, `reduce`, `replay` or `display-replay` job of the Upload_Device runs, THE App SHALL:
   - disable "Add pin", every remove button, "Choose .hex file", "Try the sample" and "Import pin map";
   - make every Signal name, Plain name, Port, Bit, Direction and Pressed level control read-only or disabled;
   - leave every Pin_Row's values unchanged.
8. THE Pin_Table SHALL show no Board_Brand_Names, no board logo and no board pin numbers in any text the App supplies. Board pin numbers here means header labels such as "D2", "A0" or "pin 13". The App SHALL name each pin only by its Signal_Name, Plain_Name or Port_Bit_Text.
9. WHEN the user activates "Add pin" while it is enabled, THE Pin_Table SHALL append one Digital_Row after the last row. The new row SHALL have a blank Signal name, a blank Plain name, no Port and no Bit chosen, Direction "Input" and Pressed level "Low (button to ground)". Every other row SHALL stay unchanged.
10. WHEN the user activates a Pin_Row's remove button, THE Pin_Table SHALL remove only that row, keep the other rows and their values in their previous order, and validate the Pin_Table as in Requirement 6. Removing the only remaining row SHALL leave a Pin_Table with 0 rows.
11. IF a Digital_Row has no Port or no Bit chosen, THEN THE Pin_Table SHALL show on that row a Row_Error saying the row needs a port and a bit, SHALL show no Port_Bit_Text for that row, and THE App SHALL keep "Unleash gremlins" disabled.

### Requirement 6: Pin table validation

**User Story:** As a student, I want each mistake shown on the row that has it, so that I can fix my pin map quickly.

#### Acceptance Criteria

1. WHEN a Pin_Row is added, removed or edited, or the Pin_Table is replaced by "Import pin map" or "Try the sample", THE Upload_Model SHALL validate the whole Pin_Table. In the same render, THE Pin_Table SHALL show every Row_Error and Table_Error that applies to the new Pin_Table, and SHALL remove every Row_Error and Table_Error that no longer applies.
2. IF a Signal_Name is empty, holds only whitespace, or fails `isSignalName`, THEN THE Pin_Table SHALL show on that row the Row_Error "Signal name must start with a letter and use only letters, digits and _ (at most 32), and cannot be all, any or a blocked word."
3. IF two or more Pin_Rows have the same non-blank Signal_Name, compared exactly and case-sensitively ("LED" and "Led" are different names), THEN THE Pin_Table SHALL show on each of those rows the Row_Error "Another pin already uses the signal name <Signal_Name>." Blank Signal_Names SHALL NOT count as duplicates of each other.
4. IF two or more Digital_Rows have the same port and the same bit, whatever their Direction, THEN THE Pin_Table SHALL show on each of those rows the Row_Error "Another pin already uses <Port_Bit_Text>."
5. IF `validateFixture` returns an error of kind `unsupported-port` for a Digital_Row's pin (a port other than B, C or D, which can only enter through "Import pin map"), THEN THE Pin_Table SHALL show on that row the Row_Error "Port <P> is not on this chip's list. Use port B, C or D.", where <P> is the error's `port` value, and SHALL keep the imported port value on the row.
6. IF `validateFixture` returns the `invalid-fixture` error "Bit index <n> is out of range; must be 0–7" for a Digital_Row's pin (a bit below 0 or above 7, which can only enter through "Import pin map"), THEN THE Pin_Table SHALL show on that row the Row_Error "Bit <n> is out of range. Use a bit from 0 to 7." and SHALL keep the imported bit value on the row. This error has no `signal` field, so it is attributed to the row whose pin produced it.
7. IF `validateFixture` returns any error for a Pin_Row's pin other than those of criteria 5 and 6 (an `activeLevel` or `restState` error), THEN THE Pin_Table SHALL show that error's message as a Row_Error on the Pin_Row whose pin produced it. IF a `validateFixture` error concerns no single pin, THEN THE Pin_Table SHALL show its message as a Table_Error.
8. IF the Pin_Table holds no Digital_Row with Direction "Input", THEN THE Pin_Table SHALL show the Table_Error "Add at least one input pin."
9. IF the Pin_Table holds no Digital_Row with Direction "Output", THEN THE Pin_Table SHALL show the Table_Error "Add at least one output pin." When the Pin_Table holds zero rows, it SHALL show both the Table_Error of criterion 8 and this one.
10. IF a Plain_Name is longer than 40 characters, counted in Unicode code points, THEN THE Pin_Table SHALL show on that row the Row_Error "Plain name can be at most 40 characters." A Plain_Name of exactly 40 code points SHALL show no such error.
11. WHILE any Row_Error or Table_Error is shown, THE App SHALL keep "Unleash gremlins" disabled.
12. THE Upload_Model SHALL use the existing `validateFixture`, unchanged, for the checks of criteria 5 to 7. It SHALL add the blank Signal_Name check, the duplicate Signal_Name check, the duplicate port/bit check, the input and output checks and the Plain_Name length check beside it, with no change to any file under `src/engine/`.
13. IF two or more Pin_Rows each have a `validateFixture` error, THEN THE Pin_Table SHALL show each of those rows' Row_Errors at the same time, not only the error of the earliest row in Pin_Table order.
14. IF one Pin_Row has more than one Row_Error, THEN THE Pin_Table SHALL show all of them on that row in the order of criteria 2, 3, 4, 5, 6, 7, 10. For a row whose port and bit are both invalid, it SHALL show only the port error of criterion 5, because `validateFixture` checks the port before the bit.

### Requirement 7: Import and export of a pin map

**User Story:** As a maker, I want to save and reload my pin map, so that I do not retype it every visit.

#### Acceptance Criteria

1. THE Program_Section SHALL show an "Import pin map" button, which opens a file input that accepts `.json` files, and an "Export pin map" button.
2. WHEN the user activates "Export pin map" while the Pin_Table holds at least one Pin_Row, THE App SHALL offer exactly one download, built with `Blob` and an object URL, that holds the Export_Text under a file name ending in ".json".
3. THE Upload_Model SHALL build the Export_Text as a Pin_Map_File whose top-level object holds only the `pins` array, with one pin object per Pin_Row in Pin_Table order and fields in a fixed order. Each Digital_Row SHALL be written with `signal`, `port`, `bit`, `direction` and, for an input, `activeLevel`. A row's Plain_Name field SHALL be written only when the Plain_Name is not the empty string, and its value SHALL be the Plain_Name exactly as entered. Rows that show a Row_Error SHALL be written with the values they hold. The same Pin_Table SHALL always give byte-identical Export_Text.
4. WHILE the Pin_Table holds no Pin_Row, THE App SHALL disable "Export pin map".
5. WHEN the user imports a file that passes the checks of criteria 6, 7, 8 and 13 and parses as a Pin_Map_File with 0 to Max_Pins (16) pins, THE App SHALL do all of the following:
   - replace the Pin_Table with one Pin_Row per pin, in file order;
   - set each Plain_Name to the extra field's string exactly, or to the empty string when the field is absent;
   - set the Pressed_Level of each input that has no `activeLevel` to "Low (button to ground)";
   - keep each `port` and `bit` value as written in the file, also when it is outside the Pin_Table's choices (for example port "E" or bit 9);
   - validate the Pin_Table as in Requirement 6 in the same render;
   - remove any import error that is shown;
   - leave the Loaded_Program, the rule text and the tries, seed and run length values unchanged.
6. IF an imported file fails any of the checks below, THEN THE App SHALL show exactly one import error in the Program_Section, SHALL leave the Pin_Table, the Loaded_Program, the rule text and the field values unchanged, and SHALL keep "Unleash gremlins" in the enabled or disabled state it had before the import. The import error SHALL name the check that failed and, when the check concerns one pin, that pin's 1-based position in `pins`. The checks are:
   - the file is no larger than the Size_Limit;
   - the file is valid JSON;
   - the JSON is an object with a `pins` array;
   - `pins` holds no more than Max_Pins (16) entries;
   - every entry is an object with a string `signal`;
   - every digital pin has a string `port`, an integer `bit`, and a `direction` of "input" or "output";
   - every Plain_Name field present is a string.
7. IF an imported pin holds a field that a Pin_Row cannot hold, THEN THE App SHALL show exactly one import error naming that pin's `signal` and the field, and SHALL leave the Pin_Table unchanged. A digital pin may hold only `signal`, `port`, `bit`, `direction`, `kind` with value "digital", `activeLevel` (on an input only), `restState` with value "released", and the Plain_Name field. Any other field is one a Pin_Row cannot hold.
8. IF an imported file has a `clockHz` field whose value is anything other than the number 16,000,000, THEN THE App SHALL show the import error "This pin map is for a clock other than 16 MHz. Hexorcist runs the chip at 16 MHz." and SHALL leave the Pin_Table unchanged. A file with no `clockHz` field, or with `clockHz` equal to 16,000,000, SHALL pass this check.
9. THE Upload_Model SHALL import the Export_Text of every valid Pin_Table back into a Pin_Table equal to the original, row for row and field for field (round-trip property, A6). Here a valid Pin_Table is one that has 1 to Max_Pins (16) Pin_Rows and shows no Row_Error and no Table_Error. "Equal" means the same row count and order and, on each row, the same Signal_Name, Plain_Name (exact string), Port, Bit, Direction and, for inputs, Pressed_Level.
10. THE Upload_Model SHALL give, for every valid Pin_Table, an Export_Text that stays byte-identical after export, import and a second export.
11. WHEN the bundled `fixture.json` of the crosswalk, garage or heartbeat Example is imported, THE App SHALL build a Pin_Table whose Upload_Fixture deep-equals that Example's parsed Fixture, with every Plain_Name set to the empty string.
12. THE App SHALL leave the Plain_Name field out of every pin object of the Upload_Fixture that it posts to the Engine_Worker.
13. IF an imported pin map holds any analog pin (an entry whose `kind` is "analog"), THEN THE App SHALL show exactly one import error, "Entry <n> of the pins list is an analog pin. Analog pins are not supported in the pin table.", where <n> is the 1-based entry number in `pins` of the first such pin. THE App SHALL leave the Pin_Table, the Loaded_Program, the rule text and the field values unchanged, and SHALL keep "Unleash gremlins" in the enabled or disabled state it had before the import.

### Requirement 8: Rule for the Upload_Device

**User Story:** As a maker, I want to write my own rule with the pin names I chose, so that the check matches what my device must do.

#### Acceptance Criteria

1. WHEN the user selects the Upload_Card, THE Rule area SHALL show the exact-text Rule_Box editor open in both the Plain_View and the Technical_View, and SHALL show no "Change rule ▾" preset menu, no "Why it matters" line and no "Reset to the example rule" button for as long as the Upload_Device stays selected.
2. WHILE the Upload_Device is selected, THE Rule area SHALL offer the rule patterns that the existing `sentencePatterns` returns for the current Upload_Fixture: five patterns in its order, filled with the leading input's and leading output's Signal_Name exactly as typed in the Pin_Table. Each pattern SHALL have an "Insert" button that adds the pattern sentence as a new last line of the rule text.
3. WHEN any Pin_Row is added, removed or changed, or a pin map is imported, THE Rule area SHALL recompute the offered rule patterns, run Rule_Box_Check again and show the resulting rule errors in the same render as the Pin_Table change.
4. IF the Pin_Table holds no input row or no output row, THEN THE Rule area SHALL offer no rule pattern and no "Insert" button.
5. IF the rule text has zero characters, THEN THE Rule area SHALL show the existing Rule_Box_Check error "Add at least one rule." as its only rule error. Rule text made only of whitespace SHALL get the existing Rule_Box_Check rule count error instead.
6. IF the rule text fails Rule_Box_Check, including the existing limits of 1 to 32 rules and at most 65,536 UTF-16 code units, THEN THE Rule area SHALL show every Rule_Box_Check error in the order Rule_Box_Check returns them. Each error SHALL be shown as its own text in the Technical_View and as the text from the existing `plainRuleError` in the Plain_View.
7. IF the rule text has no grammar error and a rule names a signal that is not, by exact case-sensitive comparison, the Signal_Name of any Pin_Row, THEN THE Rule area SHALL show the rule error "Signal <S> is not in the pin table." once for each distinct such signal. These errors SHALL be ordered by where each signal first appears in the rule text (line by line, then left to right), SHALL come after any other Rule_Box_Check errors, and SHALL appear in both the Plain_View and the Technical_View.
8. WHILE any rule error is shown, THE App SHALL keep "Unleash gremlins" disabled. While a Campaign, reduction or replay runs, THE App SHALL also make the Rule_Box read-only and disable every "Insert" button.
9. WHILE the Upload_Device is selected and the rule text passes Rule_Box_Check with no rule error, THE App SHALL use the existing custom-rule copy (`CUSTOM_COPY`): the Rule_Headline "Custom rule", with the Canonical_Sentences that Rule_Box_Check returns listed under it in rule order, and the BROKE sentence "The program broke your rule."
10. WHEN the Upload_Device is selected for the first time in a tab, THE App SHALL set the rule text to empty, so the Rule area shows "Add at least one rule." and "Unleash gremlins" stays disabled until the user enters a rule or activates "Try the sample".

### Requirement 9: Gremlins and run fields for the Upload_Device

**User Story:** As a student, I want only gremlins that fit my pins, so that every try attacks something real.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE App SHALL show the Gremlin_Chips and the "N more need other inputs" link by applying the existing `isCompatible`, `incompatibleReason` and `pickerTile` functions (`src/ui/app/model/gremlin-picker.ts`) to the current Upload_Fixture. The Compatible / not-Compatible split, the count N and the reasons SHALL follow the same rules as the Examples' picker, and the picker SHALL be rebuilt in the same render as any Pin_Table change, pin map import or "Try the sample". When the Pin_Table holds no input row, every gremlin SHALL count toward N.
2. WHEN the Upload_Fixture changes through a Pin_Table edit, an "Add pin" or remove action, an "Import pin map" or "Try the sample", THE App SHALL remove from the Selected_Gremlin_Set, in that same render, every gremlin for which `isCompatible` now returns false. A removed gremlin SHALL NOT be selected again automatically when it becomes Compatible later.
3. WHILE the user has not toggled any Gremlin_Chip on the Upload_Device and has not activated "Try the sample" in the current tab, WHEN Masher becomes Compatible with the Upload_Fixture (including at the moment the Upload_Device is selected), THE App SHALL select Masher and no other gremlin.
4. WHILE the Technical_View is shown and the Upload_Device is selected, THE Details tab SHALL show the existing tries field (checked by `checkRuns`, 1 to 1000), the existing seed field (checked by `checkSeed`, 0 to 4294967295) and the Run_Length_Field. WHILE the Plain_View is shown, THE Details tab SHALL show none of these three fields.
5. WHEN the Upload_Device is selected for the first time in a browser tab, THE App SHALL set the fields to the Upload_Defaults: 24 tries, a run length of 1 s (16,000,000 cycles; the Run_Length_Field shows 1000) and seed 20261100. On later selections in the same tab, THE App SHALL keep the field values the user left (Requirement 1.6), and "Try the sample" SHALL overwrite them with the Sample values (Requirement 4.6).
6. IF the Run_Length_Field text is empty, contains any character other than the ASCII digits 0 to 9 (a sign, a decimal point, a space or a unit, for example), or holds a whole number outside its allowed range (1 to 60,000 ms), THEN THE App SHALL show the message "Run length must be a whole number of milliseconds from 1 to 60000." beside the Run_Length_Field and SHALL keep "Unleash gremlins" disabled until the text is valid. WHILE the text is valid, THE App SHALL send the run length as the field value × 16,000 cycles.
7. IF the tries field or the seed field holds a value that `checkRuns` or `checkSeed` rejects, THEN THE App SHALL show that function's existing message ("Runs must be a whole number from 1 to 1000." or "Seed must be a whole number from 0 to 4294967295.") beside that field and SHALL keep "Unleash gremlins" disabled until the value is valid.
8. IF the Selected_Gremlin_Set of the Upload_Device is empty, THEN THE App SHALL keep "Unleash gremlins" disabled.
9. WHILE the Upload_Device is selected, THE setup SHALL show the line built by the existing `triesLine` function (`src/ui/app/model/stage-copy.ts`): "<M> tries · <Run_Length_Text> of device time each", with "1 try" when M = 1. The line SHALL use the current tries value and the current run length in cycles, and SHALL be updated in the same render as any valid change to either field. While a field is invalid, the line SHALL use that field's last valid value.
10. WHILE the Technical_View is shown, the Upload_Device is selected and the Selected_Gremlin_Set is not empty, THE Details tab SHALL show the line "Gremlin order: <names>", where <names> are the display names of the Selected_Gremlin_Set in GREMLIN_CATALOGUE order (masher, bouncer, stuck, dropout, spike, drifter) separated by ", ", for example "Gremlin order: Masher, Bouncer". This order SHALL be the order of the request's `gremlinSet`, whatever order the Gremlin_Chips were toggled in. WHILE the Plain_View is shown, THE Details tab SHALL show no such line.

### Requirement 10: Running a Campaign on an upload

**User Story:** As a maker, I want my program checked exactly like the examples, so that the verdict means the same thing.

#### Acceptance Criteria

1. WHEN the user activates "Unleash gremlins" while Upload_Ready holds, THE App SHALL post exactly one `campaign` request with `measure: false`. The request SHALL hold the Loaded_Program's HEX text byte for byte, the Upload_Fixture, the rule set returned by Rule_Box_Check, the Selected_Gremlin_Set, the seed, the tries and the run length in whole CPU cycles (Run_Length_Field value × 16,000). Every value SHALL be the one shown at the moment of activation, and the request SHALL hold no Plain_Name.
2. WHEN an upload Campaign gives BROKE, THE App SHALL post one `reduce` request. The request SHALL hold the Campaign's HEX text, Upload_Fixture, rule set and run length in cycles, plus the BROKE trace's event list and violation. After the reduction, the App SHALL post the `replay` of the Reduced_List and then the `replay` of the original event list, in the same order the Examples use. Each `replay` request SHALL hold the Campaign's HEX text, Upload_Fixture, rule set and run length in cycles.
3. WHEN a `replay` of an upload returns a violation, THE App SHALL post one `display-replay` request. The request SHALL hold the same HEX text, Upload_Fixture, rule set and event list as that replay, with `violationCycle` equal to that replay's violation cycle in integer CPU cycles.
4. THE App SHALL post each `replay` and `display-replay` of an upload as its own Engine_Worker job. Each job SHALL run on a fresh EmulatorBridge built from the same HEX, Upload_Fixture and ordered event list, with no snapshot.
5. WHEN an upload Campaign ends, THE App SHALL show exactly one verdict card, BROKE, HELD or COULDN'T TELL, matching the `verdict` that `computeVerdict` returned in the `campaign-done` reply. For BROKE, the card SHALL show the try number and the tries, and the Shrink_View SHALL show the trace that caused the violation, as for the Examples.
6. WHEN an upload Campaign gives HELD, THE App SHALL show `computeVerdict`'s text exactly: "No violation found in N emulated runs of this gremlin set. Not a proof.", with N the real count of completed runs and "1 emulated run" when N = 1.
7. WHEN an upload Campaign gives COULDN'T TELL, THE App SHALL show the existing COULDN'T TELL card with every reason of `computeVerdict` in the order returned, including each unmodelled part it names.
8. WHEN the reduction of an upload ends, THE Reduction_Card SHALL use the existing sentences. That includes "The smallest replay this reducer found." wherever the existing card uses it. The card SHALL show no text that calls the replay shortest, minimal or optimal.
9. IF the Engine_Worker answers an upload `campaign` job with `job-error`, or the Worker_Host reports a codec error or a stopped worker for that job, THEN THE App SHALL show one error text that includes the error's message, in the same error area the Examples use. It SHALL also show no verdict card, keep the Loaded_Program, the Pin_Table, the rule text and the field values unchanged, and enable "Unleash gremlins" again once Upload_Ready holds.
10. THE App SHALL make no change to any file under `src/engine/` for this feature, unless design.md names a minimal engine change and the user approves it.
11. IF the Engine_Worker answers an upload `reduce`, `replay` or `display-replay` job with `job-error`, THEN THE App SHALL keep the Campaign's BROKE verdict card, show the same error state and error text the Examples show for a failure of that job, and keep the Loaded_Program, the Pin_Table, the rule text and the field values unchanged.
12. IF Upload_Ready does not hold when "Unleash gremlins" is activated by any means, THEN THE App SHALL post no `campaign` request and SHALL leave the verdict area unchanged.

### Requirement 11: Pin levels view

**User Story:** As a student, I want to see my real pins change, so that I can follow the break without a made-up drawing.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE Stage SHALL show the Pin_Levels_View in the Scene_Area in place of the Scene, in the same 830 × 460 card, with the same Move_Strip, Player, Speed_Badge, Pacing_Plan, Shrink_View, verdict cards and Tabs as the Examples, and SHALL show no Example Scene drawing.
2. WHILE the Upload_Device is selected, THE Pin_Levels_View SHALL show the badge "Pin levels" and SHALL NOT show the badge "Illustrative" or any other Example Scene note.
3. THE Pin_Levels_View SHALL list every input Digital_Row on the left, in Pin_Table order, up to Max_Pins rows, with none hidden or cut off. Each row SHALL show its Display_Name and its state at the Cursor. The state SHALL be "pressed" when the latest recorded input event for that signal has a value equal to the row's Pressed_Level (0 for "Low (button to ground)", 1 for "High"). The state SHALL be "not pressed" when that event has the other level or "release", or when no such event exists. The latest event is the one with the highest `cycle` at or before the Cursor; among events with the same `cycle`, the one later in the Shown_Replay's ordered event list counts.
4. WHILE the latest recorded input event on an input at or before the Cursor (chosen by the rule of criterion 3) is a Gremlin_Event whose value is not "release", THE Pin_Levels_View SHALL show beside that input the icon of the gremlin named by the event's `gremlinId`, the same icon as that gremlin's Gremlin_Chip. THE Pin_Levels_View SHALL show no gremlin icon for an event whose `gremlinId` is "rest", for an event whose value is "release", or for an input with no event yet.
5. THE Pin_Levels_View SHALL show every output Pin_Row on the right, in Pin_Table order, as a lamp with its Display_Name. The lamp SHALL be on when the Shown_Replay's latest output edge for that signal at or before the Cursor has value 1. It SHALL be off when that edge has value 0. It SHALL be off with the text "not driven" when that edge has value "input" or when no edge exists at or before the Cursor. Ties at the same `cycle` are settled as in criterion 3.
6. WHILE the Shown_Replay holds a violation and the Cursor is at or after that violation's cycle, THE Pin_Levels_View SHALL draw the coral ring on each output named by the Target_Rule, as the Example Scenes do. WHILE the Cursor is before that cycle, or the Shown_Replay holds no violation, THE Pin_Levels_View SHALL draw no coral ring.
7. WHILE the Upload_Device is selected and no Shown_Replay exists for the current Loaded_Program, Pin_Table, rule text, Selected_Gremlin_Set, tries, seed and run length, THE Stage SHALL show the Pin_Levels_View at 60% opacity with every current Pin_Row listed, every input "not pressed" with no gremlin icon, every output off and "not driven", and the texts "Nothing has broken yet." and "Press Unleash gremlins. If a rule breaks, the replay plays here."
8. THE Pin_Levels_View state SHALL be computed by a DOM-free pure function of the Pin_Table rows (Display_Name, Direction, Pressed_Level), the Shown_Replay's ordered event list, output edges and violation, and the Cursor as an integer CPU cycle. Two calls with equal arguments SHALL return deep-equal results, and the function SHALL read no clock, no random source and no emulator state.
9. THE Pin_Levels_View SHALL put every text label (Display_Names, states, "not driven", the badge and the waiting texts) in HTML outside the SVG. It SHALL scale with `width: 100%` and `height: auto`, keeping the 830 × 460 aspect ratio.

### Requirement 12: No fixed build for uploads

**User Story:** As a student, I want the page to be honest that my program has no fixed version, so that I do not look for a comparison that cannot exist.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE App SHALL show no "See the fix work →" button in the Aside, the BROKE card or the phone layout of bench-ui-stage Requirement 17.5. This holds at every viewport width, in both the Plain_View and the Technical_View, and for every verdict (BROKE, HELD and COULDN'T TELL).
2. WHILE the Upload_Device is selected, THE App SHALL run no Fixed_Campaign and no reduced replay on a fixed build. Every `campaign`, `reduce`, `replay` and `display-replay` request that the App posts for the Upload_Device SHALL carry the Loaded_Program's HEX text and no other HEX text.
3. WHILE the Upload_Device is selected, THE Stage SHALL show no Fix_View, no Scene titled "Original program" or "Fixed program", and no result of a Fixed_Campaign. This holds also when the user selected the Upload_Card while an Example's Fix_View was shown.
4. WHILE the Upload_Device is selected, THE "The fix" tab SHALL stay in the Tabs and SHALL show exactly the text "Your own program has no fixed version to compare." It SHALL show no fix explanation, no "Show the code change ▾" disclosure, no "Replay both" button and no "Press See the fix work to compare." text. This holds in both the Plain_View and the Technical_View, before any Campaign, while a job runs, and after each verdict.
5. WHILE the Upload_Device is selected, THE Signals tab SHALL offer no "Fixed program" toggle in either the Plain_View or the Technical_View.
6. WHILE the Upload_Device is selected, THE BROKE card SHALL show no Cause_Line: not while the Reducer runs, not after it ends with or without a result, and not when the Trace_Fingerprint equals a Pinned_Fingerprint. This includes a Campaign run on the Sample whose Trace_Fingerprint is `47078989121ebc1d`.
7. WHILE the Upload_Device is selected, THE App SHALL show none of these Example-specific texts, character for character, anywhere on the page: the three "Why it matters" strings of Contract section 9, the three cause lines of Contract section 9, the three fix explanations of Contract section 9, the `timingNote` field of each Example's `meta.json`, and the line "While waiting on the sensor, the program forgot to blink." This holds also when the Loaded_Program is the Sample.

### Requirement 13: Story, lanes and logs with plain names

**User Story:** As a student, I want the story to use the names I gave my pins, so that I can read it without knowing the signal names.

#### Acceptance Criteria

1. WHILE the Upload_Device is selected, THE App SHALL build the Plain_Story with the existing Plain_Story_Builder, taking each signal's label only from the Display_Name of the Pin_Row with that Signal_Name, and never from the Examples' `FRIENDLY_LABELS`, `PLAIN_STORY_LABELS` or `EXAMPLE_STORY_LABELS` tables, also when a Signal_Name equals a signal name used by an Example (for example, a Pin_Row with Signal_Name `REQUEST` and a blank Plain_Name is written "REQUEST" and never "Walk button" or "the walk button").
2. WHILE the Upload_Device is selected, THE Plain_Story SHALL write every gremlin move on an input, whatever its value, as the builder writes a signal without a story label: "changed <Display_Name>", or "changed it" when the previous gremlin move in the Reduced_List was on the same input, and SHALL name the gremlin as the existing builder does (capitalised name on the opening move and again whenever the gremlin differs from the previous move's).
3. WHILE the Upload_Device is selected, THE Plain_Story SHALL end sentence 2 with the existing custom Story_Ending "the program broke your rule." for every Target_Rule, including a Target_Rule whose Canonical_Sentence equals one of the Example rules (as the Sample's rule does), and SHALL use the existing custom span sentence "It stayed that way for another <Plain_Ms>." for a span that ends on its own and the existing sentence "It was still that way <Plain_Ms> later, when the replay stopped." for a span cut by the end of the replay.
4. WHILE the Upload_Device is selected and the Plain_View is shown, THE Timeline lane labels, the Move_Strip phrases and the Gremlin_Log rows SHALL name each pin by its Display_Name only, and SHALL show a Signal_Name only where it is the Display_Name (Plain_Name blank).
5. WHILE the Upload_Device is selected and the Technical_View is shown, THE Gremlin_Log rows and the Timeline lane labels SHALL show each pin's Signal_Name beside its Display_Name, and SHALL show the Signal_Name once, not twice, when the Plain_Name is blank.
6. WHILE the Upload_Device is selected, THE App SHALL take the Display_Names used in the Plain_Story, the Timeline lanes, the Move_Strip and the Gremlin_Log from the Pin_Table as it was when "Unleash gremlins" was activated for the Campaign shown, so that the same Campaign result always gives the same text.
7. WHILE the Upload_Device is selected, THE BROKE card, the Plain_Story and the "What happened" tab SHALL show no Example Cause_Line and no text that begins with "Two quick presses", including when the Trace_Fingerprint equals a Pinned_Fingerprint (for the Sample, `47078989121ebc1d`).

### Requirement 14: Capability panel

**User Story:** As a teacher, I want the page to say what it can and cannot check, so that students never read a result as covering parts it does not model.

#### Acceptance Criteria

1. THE Details tab SHALL show, for every device (the three Examples and the Upload_Device), the Capability_Panel titled "What Hexorcist can and can't check", in both the Plain_View and the Technical_View, before any Campaign has run, while a Campaign, reduction or replay runs, and after a verdict is shown, with the same content in every one of these states except the floating-input list of criteria 9 to 11.
2. THE Capability_Panel SHALL show under the heading "Modelled" exactly the items "digital pins on ports B, C, D", "timers 0–2" and "the CPU at 16 MHz (assumed)", in that order, and no other item.
3. THE Capability_Panel SHALL show under the heading "Not modelled" the line "A program that uses one of these gets COULDN'T TELL, naming the part." followed by the Not_Modelled_List: one entry per row of `UNMODELLED_PERIPHERALS` (`src/engine/peripherals.ts`; 16 rows when this document was written), each entry exactly that row's `plainName`, in table order, with no entry repeated, left out or added.
4. THE Upload_Model or UI code SHALL build the Not_Modelled_List by reading `UNMODELLED_PERIPHERALS` when the panel renders, so that a test which renders the panel from a changed table gets the changed list. THE `src/ui/app/` sources SHALL contain no hand-written copy of any `plainName` string from that table for this list.
5. THE Capability_Panel SHALL show the line "The analog input path is unit-tested only."
6. THE Capability_Panel SHALL show the verdict order of `computeVerdict` (`src/engine/verdict.ts`) in plain words as four ordered steps, in this order: (1) a part that is not modelled was used (in the try that broke, at or before the break, or in any try when none broke) gives COULDN'T TELL; (2) otherwise a broken rule gives BROKE, showing the lowest-numbered try that broke; (3) otherwise a rule that could not be checked, a signal not mapped to a pin, a try that did not finish or no gremlin move in any try gives COULDN'T TELL; (4) otherwise the result is HELD.
7. THE Capability_Panel SHALL show the line "A rule window still open when a try ends is not judged."
8. THE Capability_Panel SHALL show the line "\"Illustrative\" scenes are drawings driven by real outputs; \"Pin levels\" shows real pin levels only."
9. WHILE the verdict shown on the Stage for the current Campaign (not a Fixed_Campaign) holds one or more floating-input reasons, THE Capability_Panel SHALL show the heading "Inputs read with no pull-up" and, under it, one entry per distinct reason text. A floating-input reason is a reason string "input <S> was read while floating" or "an input was read while floating". The App SHALL look for these strings in the BROKE verdict's `unchecked` reasons or in the COULDN'T TELL verdict's `reason` text, exactly as the Engine_Worker returned them.
10. WHILE the Upload_Device is selected, THE Capability_Panel SHALL name the pin of each "input <S> was read while floating" entry by the Display_Name of the Pin_Row whose Signal_Name is S. WHILE an Example is selected, THE Capability_Panel SHALL name that pin by the Friendly_Label of S, or by S when S has no Friendly_Label. THE Capability_Panel SHALL show the reason "an input was read while floating" as one entry with no pin name.
11. WHILE no Campaign has finished for the current setup, or the verdict shown for the current Campaign holds no floating-input reason, THE Capability_Panel SHALL show neither the heading "Inputs read with no pull-up" nor a floating-input list.
12. THE Capability_Panel SHALL show, as step (4) of the verdict order, the HELD text exactly as "No violation found in N emulated runs of this gremlin set. Not a proof.", with the capital letter N as written and the plural "runs".
13. THE App SHALL show the `plainName` of a Not_Modelled_List entry only in the "Not modelled" list of the Capability_Panel and in COULDN'T TELL reasons returned by `computeVerdict`. No verdict card, HELD text, Plain_Story, Setup_Summary or Capability_Panel line SHALL name such an entry as modelled, checked or covered.

### Requirement 15: Out of scope

**User Story:** As the product owner, I want this feature kept to its scope, so that it ships whole.

#### Acceptance Criteria

1. THE App SHALL offer no second "fixed" upload, no save-as-test, no export of results, no share link, no chip drawing and no compiling of source code. In observable terms, the App SHALL show no button, link, menu item or file input whose visible label or accessible name offers any of these: loading a fixed version of the program; saving a Campaign, rule or replay as a test; downloading or copying a verdict, Plain_Story, Reduced_List, Display_Replay or Trace_Fingerprint; making or copying a link that holds the Loaded_Program, Pin_Table, rule text, seed or Selected_Gremlin_Set; drawing the ATmega328P package or its pin layout; or compiling source code. "Export pin map" (Requirement 7) and "Download the sample" (Requirement 4) are allowed and do not count as an export of results.
2. WHEN the App page loads, whether by a page reload or by opening the App in a new browser tab, THE App SHALL show no Loaded_Program from a previous visit. No file name or file size shows in the Program_Section, and "Unleash gremlins" stays disabled while the Upload_Device is selected until the user loads a file or activates "Try the sample".
3. WHEN the App page loads, whether by a page reload or by opening the App in a new browser tab, THE App SHALL show none of the Pin_Rows and none of the rule text that the Upload_Device held before the load, and SHALL set the tries, seed and Run_Length_Field to the Upload_Defaults (24 tries, a run length of 1 s, seed 20261100) when the Upload_Device is first selected after that load.
4. WHEN the user changes the Details_Switch, whether an Example or the Upload_Device is selected, THE App SHALL store the new state under the Details_Key as `"on"` or `"off"`, as bench-ui-stage Requirement 1.1 requires, with no change to that behaviour.
5. WHEN the App page reloads after the user has set the Details_Switch while the Upload_Device was selected, THE App SHALL show the Details_Switch in the stored state ("On" or "Off") and SHALL still meet criteria 2 and 3 of this requirement.
6. WHILE the Upload_Device is selected, THE Program_Section SHALL hold exactly two file inputs: "Choose .hex file", which accepts `.hex` files only, and "Import pin map", which accepts `.json` files only. It SHALL hold no file input that accepts source code files and no file input for a second program.

### Requirement 16: Copy and brand rules

**User Story:** As the product owner, I want every new string checked, so that the page never promises what it cannot show.

#### Acceptance Criteria

1. THE App SHALL contain no whole-word, ASCII case-insensitive match of safe, safety, secure, guaranteed, certified, real-time, realtime, first, unique, shortest or any entry of Board_Brand_Names in any file added or changed under `src/ui/app/` or in `index.html`, code, comments and identifiers included. A match counts as whole-word when the character on each side of it is either the edge of the text or a character that is not an ASCII letter or digit. This is the rule of the existing `wholeWordMatches`, so `-` and `_` count as word edges and `is_safe` matches. "Added or changed" is measured against the Start_Commit.
2. THE copy scan test SHALL take its word lists by import, never by writing them out. The lists are `BANNED_WORDS`, the hyphen-free forms of its hyphenated entries, `BOARD_BRAND_NAMES` and "safety". THE copy scan test SHALL scan every string of every string table added or changed by this feature, at every nesting depth. It SHALL also scan the output of each new text function called with at least one set of example arguments. This covers the Upload_Card title and line, the Help_Line, every Hex_Error of Requirement 3, every Row_Error and Table_Error of Requirement 6, every import error of Requirement 7, the rule error of Requirement 8.7, the Run_Length_Field message, the Pin_Levels_View badge and empty-state lines, the "The fix" tab text of Requirement 12.4, and every Capability_Panel line including each Not_Modelled_List entry. THE copy scan test SHALL fail when any of these tables is missing or holds no string. It SHALL also fail when any scanned string holds a match, and SHALL then print one line per match naming the table, the key path and the listed word.
3. THE App SHALL write the chip name only as "ATmega328P". Every ASCII case-insensitive occurrence of "atmega" in a file added or changed under `src/ui/app/` SHALL be the start of the exact text "ATmega328P". THE App SHALL show no entry of Board_Brand_Names and no board logo.
4. THE App SHALL draw the Upload_Card illustration, the Pin_Levels_View and the Capability_Panel only with inline SVG elements and CSS written in this repository for this feature. THE App SHALL add no raster image file (.png, .jpg, .jpeg, .gif or .webp) to the built App. THE App SHALL load no image, icon, font or SVG from outside the repository.
5. WHEN `npm run guard` runs on the final working tree, after every temporary debug script has been deleted, THE guard SHALL print "guard: clean" as its only output line and exit with code 0.
6. THE App SHALL show no board pin number in any string table or text function output added or changed by this feature. A board pin number is a whole-word `D0` to `D13`, a whole-word `A0` to `A7`, or the word "pin" followed by a space and one or more digits. THE App SHALL name pins only by Port_Bit_Text, Signal_Name or Plain_Name.
7. THE Agent SHALL add no `guard-allow` marker to any line of any file that `npm run guard` scans, so that no finding of the guard is skipped for this feature.
8. IF text that the user typed or loaded contains a word of criterion 1 or a board pin number of criterion 6, THEN THE App SHALL show that text exactly as the user entered it, SHALL raise no copy error for it, and THE copy scan test SHALL not count it as a match. This covers a file name, a Signal_Name, a Plain_Name, rule text or the contents of an imported Pin_Map_File.

### Requirement 17: Nothing is uploaded

**User Story:** As a visitor, I want my firmware to stay on my computer, so that "Nothing is uploaded" is true.

#### Acceptance Criteria

1. THE No_Network_Test SHALL read the raw source text of every Upload_Code_Path, comments and string literals included, and SHALL fail when any of them contains one of these forms:
   - (a) the whole word `fetch` (case-sensitive), for example `fetch(`, `window.fetch(` or `globalThis.fetch(`;
   - (b) the whole word `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon` (case-sensitive);
   - (c) an `import(` (optional whitespace before the parenthesis) whose argument is not a single- or double-quoted string literal;
   - (d) an `import(` whose string literal argument begins with a URL scheme (letters followed by `:`, for example `https:`, `http:`, `data:` or `blob:`) or with `//`.
   A template literal counts as not a string literal.
2. IF the No_Network_Test finds one or more forbidden forms, THEN THE No_Network_Test SHALL fail and list every match with the file path relative to the repository root, the 1-based line number and the matched text.
3. THE No_Network_Test SHALL take the Upload_Code_Paths from a fixed list written in the test file. The list SHALL name every source file that design.md assigns to the Program_Section, the Pin_Table, the Sample and the Upload_Model. THE No_Network_Test SHALL fail when the list is empty or when any listed file does not exist.
4. THE No_Network_Test SHALL also check its own matcher on built-in sample texts, so that it cannot pass by matching nothing. It SHALL fail unless the matcher flags each of these samples:
   - `fetch("x")`
   - `new XMLHttpRequest()`
   - `new WebSocket("x")`
   - `new EventSource("x")`
   - `navigator.sendBeacon("x")`
   - `import(name)`
   - `` import(`./${n}`) ``
   - `import("https://x")`
   - `import("//x")`

   It SHALL also fail unless the matcher flags nothing in the sample `import("./pin-table")`.
5. THE Upload_Code_Paths SHALL contain none of the forms listed in criterion 1, so that the No_Network_Test (A7) passes on the final working tree.
6. WHEN the user chooses a HEX file or imports a Pin_Map_File, THE App SHALL read the file's contents only with `FileReader` or `File.text()` in the current tab, with no `fetch` of an object URL or a file URL.
7. THE App SHALL let HEX text or Pin_Map_File text leave the current tab's memory only in two ways:
   - as fields of Worker_Messages that the Worker_Host posts to the Engine_Worker created by the same page;
   - as a `Blob` download that the user starts with "Download the sample" or "Export pin map".
   THE Upload_Code_Paths SHALL contain no `postMessage` to `window.parent`, `window.opener` or another frame, no `BroadcastChannel` and no form submission.
8. THE Upload_Code_Paths SHALL contain no whole-word `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` (case-sensitive), and THE No_Network_Test SHALL fail and list the file, line and matched text when one is found.
9. THE checker SHALL make no network call and call no AI model or AI service. THE App SHALL add no file under `src/engine/` for this feature (Requirement 20.1). WHEN `npm run guard` runs on the final working tree, THE guard SHALL report no finding from its engine network and entropy check ("b2") and SHALL print "guard: clean".

### Requirement 18: Determinism

**User Story:** As a maintainer, I want an upload replayed the same way every time, so that the same gremlins give the same result.

#### Acceptance Criteria

1. THE Upload_Model and the Pin_Levels_View SHALL compute every rule time, run length and pin state of an upload as integer CPU cycles. Their source files SHALL contain no `Date.now`, `performance.now`, `setTimeout`, `setInterval` or `new Date(`. The UI clock SHALL affect only how fast the Player moves the Cursor, and the Cursor SHALL always hold an integer cycle.
2. THE Campaign request of an upload SHALL carry the seed as the integer that `checkSeed` returns for the Campaign_Seed field (0 to 4,294,967,295). The Upload_Code_Paths and the Pin_Levels_View source SHALL contain no `Math.random`, `crypto.getRandomValues` or `randomUUID`.
3. WHEN two Campaigns run, each as its own `campaign` job followed by its own `reduce` job, with the same Loaded_Program HEX text, Upload_Fixture, rule set, gremlin list, tries, run length in cycles and seed, THE App SHALL produce the same results both times. That means the same verdict kind (BROKE, HELD or COULDN'T TELL), the same verdict text, the same broken try number, and the same Reduced_List: the same events in the same order, each with the same cycle, signal, value and gremlin id. It also means the same 16-hex-digit Trace_Fingerprint.
4. THE App SHALL post upload requests to the Engine_Worker whose top-level fields are exactly the fields of the Example Campaign request (`kind`, `hex`, `fixture`, `ruleSet`, `gremlinSet`, `campaignSeed`, `runs`, `runCycles`, `measure`, plus any job id that the client adds). Each Upload_Fixture pin object SHALL hold only `DigitalFixturePin` fields. No Worker_Message SHALL hold a UI clock value, a slow factor or a Plain_Name. As a result, two Pin_Tables that differ only in Plain_Names SHALL give deep-equal requests.
5. THE Upload_Model SHALL convert the Run_Length_Field value to the request's `runCycles` as the integer milliseconds × 16,000. For example, 625 ms gives 10,000,000 cycles and 1,000 ms gives 16,000,000 cycles. The same integer SHALL go to the `campaign`, `reduce`, `replay` and `display-replay` jobs of that Campaign.
6. THE Upload_Model SHALL list the Selected_Gremlin_Set in the request's `gremlinSet` in the fixed GREMLIN_CATALOGUE order (masher, bouncer, stuck, dropout, spike, drifter), whatever order the user toggled the Gremlin_Chips in. This matters because `generateWithPrng` (`src/engine/event-list.ts`) draws from the PRNG in listed order. The Technical_View shows this order (Requirement 9.10).
7. WHEN the same Reduced_List is run through `display-replay` twice, each time on a fresh EmulatorBridge with the same HEX text, Upload_Fixture and run length in cycles and with no snapshot, THE Pin_Levels_View SHALL show the same input states, gremlin icons and lamp states both times. The comparison covers cycle 0, every cycle at which the Shown_Replay records an input event or output edge, and the break cycle.

### Requirement 19: Acceptance tests

**User Story:** As the user, I want the stated values checked in Node, as evidence that the upload path behaves like the examples.

#### Acceptance Criteria

1. THE Upload_Tests SHALL include A1, verbatim: "The sample path through the upload model (the same functions the UI calls) produces BROKE on try 4 of 24, reduction 8 -> 3, fingerprint 47078989121ebc1d." A1 SHALL run these steps in order: (a) call the Upload_Model function that "Try the sample" calls; (b) call the Upload_Model function that builds the Campaign request; (c) pass that request to `runCampaignJob`; (d) pass the BROKE trace's event list and violation to `runReductionJob`, using the same HEX text, Upload_Fixture, rule set and run length; (e) pass the Reduced_List to `runReplayJob`. A1 SHALL check five things: the verdict is BROKE; the breaking try is try 4 (zero-based run index 3) of 24 tries; the reduction's original event count is 8; its reduced event count is 3; and the reduced replay's Trace_Fingerprint equals `47078989121ebc1d`.
2. THE Upload_Tests SHALL include A2, verbatim: "The garage buggy .hex with the garage pin map, rule, gremlins (bouncer, masher), 40 tries, 0.6 s, seed 20261102 through the upload model gives fingerprint 616062947f71a1ae." The run length is 625 ms, which is 10,000,000 cycles and is written "0.6 s". A2 SHALL set up the upload model as follows: load `examples/garage/buggy/buggy.hex` through Hex_Check; import `examples/garage/fixture.json` through the Upload_Model's Pin_Map_File import; set the rule text to `examples/garage/rules.txt`; select the gremlins bouncer and masher (the request lists them in catalogue order, masher then bouncer, Requirement 18.6); set tries to 40, the Run_Length_Field to 625 and the seed to 20261102. A2 SHALL then run the Campaign, the reduction and the reduced replay as in criterion 1. A2 SHALL assert only that the reduced replay's Trace_Fingerprint equals `616062947f71a1ae`. A2 SHALL NOT assert the breaking try number or the reduction counts; "Broke on try 1 of 40" and 9 -> 3, as measured, are accepted.
3. THE Upload_Tests SHALL include A3, verbatim: "fixtures/serial_hello/build/serial_hello.ino.hex with a minimal pin map gives COULDN'T TELL naming the serial port." The pin map is `LED` (port B, bit 5, output) and `BUTTON` (port D, bit 2, input, Pressed level Low), the rule is `LED is 1 must never last 500 ms or longer.`, the gremlin is Masher, and the fields are the Upload_Defaults. A3 SHALL load that file through Hex_Check, enter that pin map, rule and gremlin through the Upload_Model, check that the Upload_Ready check passes, and run the Campaign through `runCampaignJob`. A3 SHALL check that the verdict is COULDN'T TELL and that at least one reason contains the `plainName` of the serial port row of `UNMODELLED_PERIPHERALS`.
4. THE Upload_Tests SHALL include A4, verbatim: "Bad hex cases (bad checksum, bad record type, data beyond 32 KB, file over 256 KB, empty file) each give a plain error and leave Unleash disabled." Each case SHALL begin from a state in which the Sample is loaded and the Upload_Ready check passes. Each case SHALL then pass one bad file to Hex_Check. The five bad files are: (a) the Sample HEX with one record's checksum byte changed; (b) the Sample HEX with one record's type changed to a type that `hexToProgMem` rejects; (c) a HEX with a data record at address 32,768 or above; (d) a file whose byte size is 262,145; (e) a file of 0 bytes with empty text. For each case, A4 SHALL check three things: Hex_Check returns the Hex_Error that Requirement 3 gives for that parser message or size check; the earlier Loaded_Program is discarded; and the Upload_Ready check fails.
5. THE Upload_Tests SHALL include A5, verbatim: "Pin table cases (port E, bit 9, duplicate signal, duplicate port/bit, analog conflict, no output) each give a row error and leave Unleash disabled." Case (e) is decided as an import error (see Decisions), and the "no output" case shows as a Table_Error under the Pin_Table (Requirement 6.9). Each case SHALL begin from a state in which the Sample is loaded and the Upload_Ready check passes. Each case SHALL then make exactly one change, either through the Upload_Model's row-edit functions or through an imported Pin_Map_File: (a) a pin on port E; (b) a pin with bit 9; (c) two rows with the same Signal_Name; (d) two Digital_Rows with the same port and bit; (e) an imported pin map that holds an analog pin; (f) every output row removed. For cases (a) to (d) and (f), A5 SHALL check two things: the Upload_Model returns, on every row involved, the Row_Error text that Requirement 6 gives for that case (for case f, the Table_Error "Add at least one output pin."); and the Upload_Ready check fails, so that Unleash stays disabled. For case (e), A5 SHALL check two things: the import returns the import error of Requirement 7.13, naming the analog pin's entry number; and the Pin_Table and the Upload_Ready check are the same as before the import (Upload_Ready still holds).
6. THE Upload_Tests SHALL include A6, verbatim: "Export then import of a pin map round-trips exactly (property test over random valid tables)." The property test SHALL use a fixed seed and at least 100 runs. Each generated Pin_Table SHALL hold 2 to Max_Pins rows, at least one input row and at least one output row, unique Signal_Names that pass `isSignalName`, unique port and bit pairs on ports B, C and D with bits 0 to 7, and Plain_Names that are blank or 1 to 40 characters long. Each generated table SHALL pass the Pin_Table validation of Requirement 6 with no Row_Error and no Table_Error. For each table, A6 SHALL check that importing its Export_Text gives a Pin_Table equal to the original, row for row and field for field. A6 SHALL report the seed and the failing table when the check fails.
7. THE Upload_Tests SHALL include A7, verbatim: "The no-network source test above." (the No_Network_Test of Requirement 17.1). A7 SHALL fail when its list of Upload_Code_Paths is empty or names a file that does not exist.
8. THE Agent SHALL keep A8, verbatim: "Every existing test and acceptance value unchanged.", including crosswalk BROKE on run 4 of 24, seed 20261101, 8 → 3, fingerprint `47078989121ebc1d`; garage BROKE on run 8 of 40, seed 20261102, 7 → 3, fingerprint `616062947f71a1ae`; heartbeat BROKE on run 2 of 24, seed 20261103, 2 → 1, fingerprint `19827a4e0a7ad440`; the fixed-build HELD texts; and the span pins. THE Agent SHALL show A8 by running the full existing test suite with every existing test passing, and by showing that no committed test file has changed since the Start_Commit except as Requirement 20.3 allows.
9. THE Upload_Tests SHALL run A1 to A7 in Node under `npx vitest --run`, with no headless browser and no DOM, through the Upload_Model functions and the Worker_Host job functions (`runCampaignJob`, `runReductionJob`, `runReplayJob`) that the UI calls. Each request SHALL pass through the Message_Codec (`encodeMessage`, then `decodeRequest`) before it reaches its job function. Each test SHALL allow up to 600,000 ms. Each failed check SHALL print the expected value and the actual value.
10. IF an acceptance test written by the user and the system disagree, THEN THE Agent SHALL leave the test unchanged, report what the test expects, what happened and the evidence, and wait for the user's decision.
11. THE Agent SHALL describe passing tests as evidence, not proof, in every report, document and test comment, and SHALL not describe them as showing that the program is correct.

### Requirement 20: Constraints and completion

**User Story:** As the product owner, I want the engine, the examples and the pinned numbers left alone, so that nothing that works today breaks.

#### Acceptance Criteria

1. THE Agent SHALL record the Start_Commit and, compared with it, SHALL edit, delete or rename no file under `src/engine/`, `examples/` or `fixtures/`, no file whose name contains "baseline", and no committed test file outside `tests/ui/`, as shown by `git diff --name-status <Start_Commit>` on the final working tree.
2. IF design.md names a minimal engine change, THEN THE Agent SHALL make that change only after the user approves it in writing in the conversation, SHALL change only the files design.md names for it, and SHALL list each such file in the completion report.
3. THE Agent SHALL change a committed file under `tests/ui/` only where this document changes a pinned string or a layout (the device grid and its empty slot), and SHALL change no pinned number, seed, run count, reduction count, fingerprint, HELD text or span value, so that each value listed in Requirement 19.8 has the same text in the final working tree as at the Start_Commit.
4. THE Agent SHALL keep the `dependencies` and `devDependencies` objects of `package.json` and the whole of `package-lock.json` byte for byte equal to their state at the Start_Commit.
5. THE App SHALL keep avr8js behind the EmulatorBridge interface, so that no file added or changed by this feature imports from `avr8js`, and SHALL target the ATmega328P at 16 MHz only, so that every `campaign`, `reduce`, `replay` and `display-replay` request posted for an upload uses a clock of 16,000,000 Hz.
6. THE App SHALL be TypeScript built with Vite: every source and test file added by this feature SHALL end in `.ts`, and `npm run build` SHALL produce static files that need no server-side code, compile server or network service to run on GitHub Pages.
7. WHEN the feature is complete, THE Agent SHALL first delete every temporary debug script it created (any file that tasks.md and design.md do not name as a deliverable), so that `git status` shows none of them, and SHALL then run, in this order, `npm test -- --run`, `npm run typecheck`, `npm run guard` and `npm run build`.
8. WHEN the four commands of criterion 7 have run, THE Agent SHALL report each command exactly as written with its exit code, and for `npm test -- --run` the passed, failed and skipped test counts that it prints.
9. IF any command of criterion 7 exits with a code other than 0, THEN THE Agent SHALL report the feature as not complete, quote the failing output, and leave every user-written acceptance test unchanged as Requirement 19.10 requires.
10. THE Agent SHALL run no headless browser and no long-running process (including `npm run dev` and `npm run preview`). The user checks the look in a browser.
