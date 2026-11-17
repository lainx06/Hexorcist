# Implementation Plan: bench-ui-upload

## Overview

The work is UI-only, in TypeScript. Nothing under `src/engine/`, `examples/` or `fixtures/` changes, and nothing changes in a baseline file, the `package.json` dependencies or `package-lock.json`. The plan builds the pure Upload_Model first. Then come the user's acceptance tests A1 to A5 and the A6 property test, run through the model, the Message_Codec and the Worker_Host job functions, and the no-network source test A7. After that the plan wires the UI step by step and adds the copy scan. It ends with a run of the whole existing suite (A8) and the final commands.

No task runs until the user has reviewed requirements.md, design.md and this file.

Rules that apply to every task:

- **Engine change needed:** stop and report. No engine change is planned (design D1). If a task finds it needs a change under `src/engine/`, `examples/`, `fixtures/`, a baseline file, the `package.json` dependencies or `package-lock.json`, it stops and reports what it needs and why, then waits for the user (Requirements 10.10, 20.1, 20.2, 20.4).
- **Acceptance test disagrees with the system:** stop and report. A1 to A8 are the user's tests, written with their names and values unchanged. If one of them and the system disagree, the task leaves the test as written and reports what the test expects, what happened and the evidence, then waits for the user's decision. It never weakens, edits or deletes the test (Requirement 19.10).
- **Test comments:** every new test file opens with a comment saying that passing runs are evidence, not proof (Requirement 19.11).
- **Property test (A6):** it uses fast-check with `{ numRuns: 100, seed: 20261204 }` or more runs and carries the tag comment `// Feature: bench-ui-upload, Property 11: Pin map round trip`.
- **Tests run in Node only:** `npx vitest --run`, with no DOM and no headless browser. No task runs `npm run dev`, `npm run preview` or any other long-running process (Requirements 19.9, 20.10).
- **Debug scripts:** a temporary debug script is deleted before its task is reported done.

## Tasks

- [x] 1. Record the Start_Commit
  - [x] 1.1 Record the Start_Commit with no code change
    - Run `git rev-parse HEAD` and `git status --short`.
    - Write the hash into the "Start_Commit:" line of the Notes section of this file. Report the hash and the status output.
    - If `git status --short` shows any change, stop and ask the user how to treat it, because later `git diff --name-status <Start_Commit>` checks compare against this commit.
    - No other file changes.
    - _Requirements: 20.1, 20.3, 20.4_

- [x] 2. Upload copy table and run length field
  - [x] 2.1 Create `src/ui/app/model/upload-copy.ts`
    - Holds `UPLOAD_COPY` (including `gremlinOrder: "Gremlin order: {names}"`), `HEX_ERROR_TEXT`, `ROW_ERROR_TEXT`, `TABLE_ERROR_TEXT`, `IMPORT_ERROR_TEXT`, `PIN_LEVELS_TEXT` and `UNMAPPED_SIGNAL_TEXT`, with the exact strings of design "Copy", the Hex_Check table, the Pin_Table steps and the import checks table.
    - The remove-button texts follow D5: "Remove {name}" and "Remove row {n}". The import error texts say "Entry <n> of the pins list", including the analog pin error of Requirement 7.13.
    - The strings contain no claim word, no board brand and no board pin number.
    - _Requirements: 1.1, 2.7, 3.1–3.8, 3.12, 4.1, 5.1, 5.4, 5.6, 5.11, 6.2–6.10, 7.6–7.8, 7.13, 8.7, 9.10, 11.2, 12.4, 16.6_
  - [x] 2.2 Create `src/ui/app/model/upload-fields.ts`
    - Holds `CYCLES_PER_MS` (16,000), `UPLOAD_DEFAULTS` (`{ runs: 24, runLengthMs: 1000, seed: 20261100 }`), `RUN_LENGTH_MESSAGE`, `checkRunLength(text)` and `msToCycles(ms)`.
    - `checkRunLength` accepts ASCII digits only, compares as a BigInt and allows 1 to 60,000. It returns the `FieldCheck` shape of `model/fields.ts`.
    - _Requirements: 9.5, 9.6, 18.1, 18.5_

- [x] 3. Hex_Check
  - [x] 3.1 Create `src/ui/app/model/upload-hex.ts`
    - Holds `SIZE_LIMIT`, `LoadedProgram`, `HexError`, `HexCheckResult`, `hexPreCheck(name, bytes)`, `hexCheck(name, bytes, text)`, `hexErrorText(message)` and `sizeText(bytes)`.
    - The name check lowercases ASCII letters only. Checks run in the order name, size, `hexToProgMem`, and the first failure is the only one returned.
    - `hexErrorText` tries the rows of the design's mapping table in their listed order and covers every message form. Anything else gives "This file is not a valid .hex file."
    - `sizeText` uses integer arithmetic only. `hexToProgMem` is imported and stays unchanged.
    - _Requirements: 2.2, 2.3, 2.9, 3.1–3.8, 3.10–3.12_

- [x] 4. Pin_Row types and Pin_Table validation
  - [x] 4.1 Create `src/ui/app/model/pin-table.ts` (types and helpers)
    - Holds `MAX_PINS`, `PLAIN_NAME_MAX`, `DigitalRow`, `PinRow` (an alias of `DigitalRow`; there is no analog row type), `newDigitalRow`, `setDirection`, `displayName` and `portBitText`.
    - Also holds `removeButtonLabel(row, position)`, which uses the D5 texts from `upload-copy.ts`.
    - Also holds `previewFixture` (an unchecked Fixture of every row, fixed field list, never `plainName`).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.9_
  - [x] 4.2 Add `checkPinTable`, `PinTableCheck`, `validSubsetFixture` and `toUploadFixture` to `src/ui/app/model/pin-table.ts`
    - Implement steps 1 to 5, 8, 9 and 10 of design "Pin_Rows and Pin_Table validation": signal name, duplicate signal, duplicate port/bit, port and bit not chosen, the per-row `validateFixture` call, Plain_Name length in code points, the table errors and the whole-table backstop.
    - Each row's errors are in the order 6.2, 6.3, 6.4, 5.11/6.5/6.6/6.7, 6.10. `pinValid` is set as the design gives it.
    - `toUploadFixture` uses the same fixed field list as `previewFixture` (inputs carry `activeLevel`, outputs none, never `plainName`) and returns null unless `ok` is true.
    - _Requirements: 5.2, 5.11, 6.1–6.10, 6.12–6.14, 7.12, 18.4_

- [x] 5. Pin_Map_File import and export
  - [x] 5.1 Create `src/ui/app/model/pin-map-file.ts`
    - Holds `PLAIN_NAME_FIELD`, `exportPinMap(rows)` and `importPinMap(text, bytes, firstId)`.
    - Export writes the fixed field order of design "Pin_Map_File import and export", writes `plainName` only when it is not empty, and writes unset values as `""` and `null` (D7).
    - Import runs checks 1 to 9 of the design table in order, including check 5a: an analog pin gives one error naming its entry number (Requirement 7.13). The allowed fields follow D8. Rows are built as the design gives.
    - _Requirements: 7.3, 7.5–7.13_
  - [x] 5.2 Write the acceptance property test A6 in `tests/ui/pin-map-file.property.test.ts`
    - Test name, verbatim: "Export then import of a pin map round-trips exactly (property test over random valid tables)."
    - **Property 11: Pin map round trip**
    - Create `tests/ui/upload-arbitraries.ts` with `pinTableArb` (valid tables). Each generated table must pass `checkPinTable` with `ok` true.
    - Use a fixed seed and at least 100 runs, and print the seed and the failing table on failure.
    - If the test and the system disagree, stop and report as the rules above say.
    - **Validates: Requirements 7.5, 7.9, 16.8, 19.6**

- [x] 6. Signal labels and the upload rule check
  - [x] 6.1 Create `src/ui/app/model/signal-labels.ts`
    - Holds `SignalLabels`, `EXAMPLE_LABELS`, `labelOf`, `plainStoryTableFor` and `exactLabelsFor`, as design "Signal labels" gives them.
    - With upload labels, nothing reads `FRIENDLY_LABELS`.
    - _Requirements: 13.1, 13.4, 13.5, 14.10_
  - [x] 6.2 Create `src/ui/app/model/upload-rule.ts`
    - Holds `checkUploadRule(text, rows, table)`, `uploadPatterns(rows)` and `unmappedSignalText`.
    - The rule is compiled against `validSubsetFixture` (D2). Unmapped-signal errors come after the Rule_Box_Check errors, in the order each signal first appears, using `ruleSignals`.
    - _Requirements: 8.2, 8.4, 8.5, 8.6, 8.7_

- [x] 7. The Sample
  - [x] 7.1 Create `src/ui/app/data/upload-sample.ts`
    - Build the Sample from `CROSSWALK_TEXTS` (`src/ui/app/data/crosswalk.ts`), with no new raw import.
    - It holds the program `{ name: "crosswalk-buggy.hex", text, bytes }`, where `bytes` comes from `TextEncoder`.
    - It holds the crosswalk pins as rows, with Plain_Names from the Friendly_Label table (Q7), the `rules.txt` text, and the fields "24", "20261101" and "1000".
    - `sampleDownloads()` returns `crosswalk-buggy.hex` and `crosswalk-pins.json` with the bundled strings unchanged.
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 8. Upload state, readiness and the Campaign request
  - [x] 8.1 Create `src/ui/app/model/upload-state.ts` with the state and its actions
    - Holds `UploadState` and `initialUpload()`, which starts with no program, no rows, an empty rule text and the Upload_Defaults.
    - Holds the actions `beginHexRead`, `hexChosen` and `hexReadFailed`, with a token check so that only the file chosen last applies.
    - Holds `loadSample`, `addRow` (no-op at 16 rows), `removeRow`, `editRow` (which uses `setDirection`) and `importPins`.
    - Holds `setRuleText`, `toggleGremlin` and `setField`, which updates `lastValid`.
    - `pruneGremlins` and `autoMasher` follow Q9 and D3.
    - _Requirements: 1.6, 2.2, 2.3, 2.6, 2.9, 4.2, 4.3, 4.6, 5.3, 5.5, 5.9, 5.10, 7.5, 7.6, 8.10, 9.2, 9.3, 9.5, 15.2, 15.3_
  - [x] 8.2 Add the derived values and the request builder to `src/ui/app/model/upload-state.ts`
    - Holds `UploadDerived` and `deriveUpload`, which includes the tries line built from `triesLine` with the last valid values.
    - Holds `uploadReady(state, busy)` and `buildCampaignRequest(state)`, which returns null unless the state is ready.
    - Holds `orderGremlins` (in `GREMLIN_CATALOGUE` order, Q11), `gremlinOrderLine(ids)` ("Gremlin order: Masher, Bouncer" from `UPLOAD_COPY.gremlinOrder`, in the order of the request's `gremlinSet`; null when none are selected) and `uploadLabels(rows)`.
    - The request has exactly the top-level fields `kind, hex, fixture, ruleSet, gremlinSet, campaignSeed, runs, runCycles, measure` and holds no Plain_Name.
    - _Requirements: 2.5, 4.7, 4.8, 6.11, 8.8, 9.6–9.10, 10.1, 10.12, 18.2, 18.4, 18.5, 18.6_

- [x] 9. Checkpoint: model layer
  - Run `npm test -- --run` and `npm run typecheck`. Report each exit code and the test counts.
  - On any failure, stop and report the failing output. Do not go on to task 10.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Acceptance tests A1 to A5 in `tests/ui/upload.acceptance.test.ts`
  - [ ] 10.1 Write A1, with the codec helper and the determinism repeat
    - Test name, verbatim: "The sample path through the upload model (the same functions the UI calls) produces BROKE on try 4 of 24, reduction 8 -> 3, fingerprint 47078989121ebc1d."
    - Add a helper that passes each request through `encodeMessage({ ...req, jobId })` and `decodeRequest` before it reaches its job function.
    - Steps: `loadSample(initialUpload())`, then `buildCampaignRequest`, then `runCampaignJob`, then `runReductionJob` with the BROKE trace's event list and violation and the same `hex`, `fixture`, `ruleSet` and `runCycles`, then `runReplayJob` of the Reduced_List.
    - Check five things: the verdict is BROKE, `runIndex` is 3 of 24 tries, the original count is 8, the reduced count is 3, and the fingerprint is `47078989121ebc1d`.
    - Extra check (4.8): the request deep-equals the crosswalk Example's campaign fields, and its `fixture` deep-equals the parsed `fixture.json` with no `plainName`.
    - Add a separate `it` (18.3): a second campaign and reduction give the same verdict, try, Reduced_List and fingerprint.
    - Allow 600,000 ms per test, and print the expected and the actual value when a check fails.
    - If the test and the system disagree, stop and report.
    - _Requirements: 4.8, 10.1–10.5, 18.3, 19.1, 19.9, 19.10_
  - [ ] 10.2 Write A2
    - Test name, verbatim: "The garage buggy .hex with the garage pin map, rule, gremlins (bouncer, masher), 40 tries, 0.6 s, seed 20261102 through the upload model gives fingerprint 616062947f71a1ae."
    - Load `examples/garage/buggy/buggy.hex` through `hexCheck` and `hexChosen`, and import `examples/garage/fixture.json` with `importPins`.
    - Set the rule with `setRuleText` from `rules.txt`. Toggle bouncer, and toggle masher only if the preselection has not already selected it.
    - Set tries to "40", run length to "625" (625 ms, Q1) and seed to "20261102".
    - Check that `uploadReady` is true and that the request's `runCycles` is 10,000,000. Run the Campaign, the reduction and the reduced replay, and assert only that the fingerprint is `616062947f71a1ae`.
    - Do not assert the breaking try number or the reduction counts (Q11).
    - If the test and the system disagree, stop and report.
    - _Requirements: 18.5, 18.6, 19.2, 19.9, 19.10_
  - [ ] 10.3 Write A3
    - Test name, verbatim: "fixtures/serial_hello/build/serial_hello.ino.hex with a minimal pin map gives COULDN'T TELL naming the serial port."
    - Use the Q3 map (`LED` on port B, bit 5, output; `BUTTON` on port D, bit 2, input, low), the rule `LED is 1 must never last 500 ms or longer.`, Masher and the defaults.
    - Check that `uploadReady` is true, that the verdict is COULDN'T TELL, and that a reason contains the `plainName` of the `USART0` row, read from `UNMODELLED_PERIPHERALS`.
    - If the test and the system disagree, stop and report.
    - _Requirements: 10.7, 19.3, 19.9, 19.10_
  - [ ] 10.4 Write A4
    - Test name, verbatim: "Bad hex cases (bad checksum, bad record type, data beyond 32 KB, file over 256 KB, empty file) each give a plain error and leave Unleash disabled."
    - Start each case from the ready Sample state. Use cases (a) to (e) of the design's A4 row.
    - Check the Requirement 3 text for each case, that `program === null` and that `uploadReady` is false.
    - If the test and the system disagree, stop and report.
    - _Requirements: 2.6, 3.2–3.4, 3.7, 3.8, 19.4, 19.10_
  - [ ] 10.5 Write A5
    - Test name, verbatim: "Pin table cases (port E, bit 9, duplicate signal, duplicate port/bit, analog conflict, no output) each give a row error and leave Unleash disabled."
    - Start each case from the ready Sample state and make exactly one change, as in cases (a) to (f) of the design's A5 row.
    - Cases (a) to (d) and (f): check the exact Requirement 6 text on every row involved (case f: the Table_Error "Add at least one output pin.") and that `uploadReady` is false.
    - Case (e) is an import error check: `importPins` of the crosswalk map plus an analog entry as entry 7 gives the import error "Entry 7 of the pins list is an analog pin. Analog pins are not supported in the pin table.", and `rows`, `program` and `ruleText` equal their values before the import. `uploadReady` is still true.
    - If the test and the system disagree, stop and report.
    - _Requirements: 6.3–6.6, 6.9, 6.11, 7.13, 19.5, 19.10_

- [ ] 11. No-network source test A7
  - [ ] 11.1 Create `tests/ui/upload-no-network.test.ts`
    - Test name for the main scan, verbatim: "The no-network source test above."
    - `UPLOAD_CODE_PATHS` must equal the list in design "No_Network_Test", item for item. `DETERMINISM_PATHS` is filtered from it as the design gives.
    - Write the matcher table of the design, the self-check samples (17.4 plus `localStorage`, `window.parent` and `Date.now()`), and tests 1 to 6.
    - Each match is printed as `<path>:<line>: <text>`.
    - Expected while tasks 12 to 20 are not done: test 1 (file exists) and tests 5 and 6 fail for the view files that do not exist yet. Report the missing files. Do not shorten the list or skip a test. Task 21 requires the whole file to pass.
    - _Requirements: 15.6, 17.1–17.8, 18.1, 18.2, 19.7_

- [ ] 12. The "Your own program" card and the device grid
  - [ ] 12.1 Add `deviceArt("upload")` to `src/ui/app/views/icons.ts`
    - The art is a rounded rectangle with an upward arrow. It is marked `aria-hidden="true"` and holds no `text` element.
    - _Requirements: 1.1, 16.4_
  - [ ] 12.2 Add the Upload_Card to `src/ui/app/views/setup.ts`
    - Add a fourth `button.device-card` with `data-device="upload"`, `aria-pressed`, the art, the title and the line. Remove `.device-slot`.
    - Add `onDevice(DeviceId)`, `setSelectedDevice(DeviceId)`, `setProgramSection(node)` and `setUploadMode(on)`. Upload mode hides "Why it matters", "Change rule ▾", the preset line and the reset button.
    - Add the summary title for the upload. Busy disables the card, as it disables every card.
    - _Requirements: 1.1, 1.3, 1.4, 1.7, 1.8, 8.1, 12.7_
  - [ ] 12.3 Update `src/ui/app/app.css` for the card and the grid
    - The upload card keeps the solid 1 px border of the other cards (Q4). Add no dashed rule and no note. `docs/stage-design.md` does not change.
    - Set the grid to 4 columns above 768 px and 2 × 2 at 768 px and below (Q10). Remove the `.device-slot` styles.
    - _Requirements: 1.2, 1.3_

- [ ] 13. Device switching and RunTarget
  - [ ] 13.1 Add `texts()` and `setTexts(runs, seed)` to `ControlsView` in `src/ui/app/views/panels.ts`
    - These read and write the raw field text.
    - _Requirements: 1.6_
  - [ ] 13.2 Add `DeviceId` and `RunTarget` to `src/ui/app/views/app-page.ts` and route every Example job through them
    - Export `exampleRunTarget(bundle)`.
    - Example requests stay field-for-field the same as today: `buggyHex`, `fixedHex`, `fixture`, `meta.runCycles` and `EXAMPLE_LABELS`.
    - Example behaviour does not change.
    - _Requirements: 1.5, 1.9_
  - [ ] 13.3 Add `applyUpload` and the memory-only `UploadState` to `src/ui/app/views/app-page.ts`
    - `currentDevice` replaces the `currentId` guard.
    - `applyUpload` calls `leaveFix()` and `clearOutputs()`, sets the Stage idle, mounts the Program_Section, calls `setUploadMode(true)` and paints from `UploadState`. On the first entry in a tab, `UploadState` is `initialUpload()`.
    - Before the user leaves the Upload_Device, save the tries and seed texts with `controls().texts()`.
    - Selecting an Example calls today's `applyExample`, which reads nothing from `UploadState`.
    - Nothing is written to storage, the URL or a cookie.
    - _Requirements: 1.4, 1.5, 1.6, 1.9, 2.4, 12.3, 15.2, 15.3_

- [ ] 14. Program_Section and Pin_Table views
  - [ ] 14.1 Create `src/ui/app/views/file-io.ts`
    - `readFileText(file)` uses `File.text()`.
    - `offerDownload(name, text, type)` uses a `Blob`, an object URL and a temporary `<a download>`, then revokes the URL.
    - No `fetch` anywhere in the file.
    - _Requirements: 2.2, 4.4, 7.2, 17.6, 17.7_
  - [ ] 14.2 Create `src/ui/app/views/pin-table.ts`
    - Above 600 px it is a `<table>`. At 600 px and below the same DOM shows as stacked cards with visible column labels.
    - Port and Bit are `<select>` controls. An imported value outside the list shows as an extra option.
    - Show the Port_Bit_Text when both port and bit are set. Show Pressed level for inputs only.
    - Remove buttons take their names from `removeButtonLabel`.
    - Row_Errors and Table_Errors use `aria-live="polite"`.
    - Repaint by row id so that focus is kept. While busy, controls are disabled or read-only.
    - _Requirements: 5.1–5.11, 6.1, 6.14_
  - [ ] 14.3 Create `src/ui/app/views/program-section.ts`
    - Holds the section title and the hidden `<input type="file" accept=".hex">` with its `<label>` "Choose .hex file", with a focus ring on the label.
    - Holds the loaded line "<name> · <size text>" and the Hex_Error (`role="alert"`). The parser message sits on a tech-only line under it.
    - Holds the Help_Line, the two sample buttons and the Pin_Table mount.
    - Holds "Add pin", "Import pin map" (with `accept=".json"`) and "Export pin map", which is disabled with 0 rows, and the import error.
    - After each `change` the file input's value resets to `""`. A `change` with no file does nothing.
    - There are exactly two file inputs. The view holds no state and paints from `paint(state, derived, busy)`.
    - _Requirements: 2.1, 2.3, 2.6, 2.7, 2.8, 2.10, 3.9, 3.13, 4.1, 5.8, 7.1, 7.4, 15.1, 15.6_
  - [ ] 14.4 Add the Program_Section and Pin_Table styles to `src/ui/app/app.css`
    - Includes the 600 px stacked-card rules and the visually hidden file inputs with a visible focus ring.
    - _Requirements: 2.1, 5.6_
  - [ ] 14.5 Wire the Program_Section into `src/ui/app/views/app-page.ts`
    - File flow: `hexPreCheck`, then `beginHexRead`, `readFileText`, and `hexChosen` or `hexReadFailed`.
    - Wire "Try the sample" to `loadSample` and "Download the sample" to `sampleDownloads` and `offerDownload`.
    - Import goes through `readFileText`, `file.size` and `importPins`. Export goes through `exportPinMap` and `offerDownload`.
    - Row add, remove and edit each repaint in the same render.
    - _Requirements: 2.2, 2.3, 2.5, 2.6, 2.9, 4.2–4.7, 6.1, 7.2, 7.5, 7.6, 7.13, 17.6_

- [ ] 15. Rule area, gremlins and fields on the Upload_Device
  - [ ] 15.1 Add `setResetShown(on)` and `setEditShown(on)` to `src/ui/app/views/rule-box.ts`
    - _Requirements: 8.1_
  - [ ] 15.2 Create `src/ui/app/views/run-length-field.ts`
    - Holds a `<label for>` "Run length in ms", an input and a message line, using `checkRunLength` and `RUN_LENGTH_MESSAGE`.
    - _Requirements: 9.4, 9.6_
  - [ ] 15.3 Wire the rule area, gremlins and fields into `src/ui/app/views/app-page.ts`
    - The Rule_Box is open and shown in both views. Patterns come from `uploadPatterns`, each with its Insert button.
    - Rule errors show in the Technical_View as their own text and in the Plain_View through `plainRuleError`. `CUSTOM_COPY` is used.
    - The picker is rebuilt from `previewFixture` in the same render as every table change.
    - The tries, seed and Run_Length_Field sit in the tech-only Details fields host. The tries line comes from `deriveUpload`.
    - "Unleash gremlins" is gated on `uploadReady`. While busy, the Rule_Box is read-only and the Insert buttons are disabled.
    - Any upload input change returns the Stage to idle (D4).
    - _Requirements: 8.1–8.10, 9.1–9.9, 10.12, 11.7_

- [ ] 16. Running an upload Campaign
  - [ ] 16.1 Add the upload branch of `unleash` to `src/ui/app/views/app-page.ts`
    - Check `uploadReady` again, then use `buildCampaignRequest`.
    - Snapshot `uploadLabels(rows)` and `pinLevelRows(rows)` into the `RunTarget`, with `fixedHex: null`, `example: null` and `limitMs` null.
    - `reduce`, `replay` and `display-replay` take every value from the `RunTarget`, in the Examples' order. No Fixed_Campaign runs.
    - The verdict card, the HELD text, the COULDN'T TELL reasons and the Reduction_Card wording are today's.
    - Job errors use today's error area and keep the setup values.
    - If the change seems to need an engine change, stop and report.
    - _Requirements: 10.1–10.9, 10.11, 10.12, 12.2, 13.6, 18.4, 18.5, 20.5_

- [ ] 17. Pin_Levels_View
  - [ ] 17.1 Create `src/ui/app/model/pin-levels.ts`
    - Holds `PinLevelRow`, `PinLevelsReplay`, `PinLevelsState`, `pinLevelRows(rows)` and `pinLevelsAt(rows, replay, cursor)`, following the rules of design "Pin_Levels_View".
    - It reads only its arguments: no clock, no randomness and no emulator.
    - _Requirements: 11.3–11.8, 18.1, 18.2_
  - [ ] 17.2 Add an optional `badge` to `SceneChromeSpec` in `src/ui/app/views/scene-chrome.ts`
    - The default is `STAGE_TEXT.illustrative`. `setLine` uses it.
    - _Requirements: 11.2_
  - [ ] 17.3 Create `src/ui/app/views/scene-pin-levels.ts`
    - Holds `createPinLevelsScene()`, which has the `{ node, frame, update }` shape plus `setRows`, in the 830 × 460 viewBox.
    - Inputs sit on the left and output lamps on the right. Rows use the design's row pitch. The coral ring uses the `conflict-ring` class.
    - Every text is an HTML `SceneLabel` with no SVG `text`. The gremlin icon comes from `gremlinIcon`. The badge is "Pin levels". At Phone_Width a summary line shows.
    - _Requirements: 11.1–11.7, 11.9, 16.4_
  - [ ] 17.4 Update `src/ui/app/views/stage.ts` and its call sites in `src/ui/app/views/app-page.ts`
    - `setDevice(DeviceId)` replaces `setExample` at every call site. Add `setPinRows(rows)`, `makeScene("upload")` and `ShownReplay.ringSignals?`.
    - The idle, running, shrinking and note states redraw the upload scene with `replay = null`. HELD maps to `v` null.
    - The page passes `ringSignals`, the output signals of the Target_Rule.
    - _Requirements: 11.1, 11.6, 11.7_
  - [ ] 17.5 Add the Pin_Levels_View styles to `src/ui/app/app.css`
    - The SVG uses `width: 100%` and `height: auto`. Idle shows at 60% opacity. "Not driven" lamps are hollow and dashed.
    - _Requirements: 11.7, 11.9_
  - [ ] 17.6 Add the display-replay determinism test to `tests/ui/upload.acceptance.test.ts`
    - For the A1 Reduced_List, run two `runDisplayReplayJob` calls through the codec. They give equal `pinLevelsAt` states at cycle 0, at every event and edge cycle, and at v.
    - Leave the A1 to A5 tests unchanged.
    - _Requirements: 18.7, 19.9_

- [ ] 18. Story, lanes and log labels
  - [ ] 18.1 Add an optional `labels` parameter to the story model functions
    - The files are `src/ui/app/model/plain-story.ts`, `moves.ts`, `strip.ts`, `gremlin-picker.ts` and `story-input.ts`.
    - The parameter defaults to `EXAMPLE_LABELS`. The functions use `plainStoryTableFor` and `labelOf` in place of direct table reads.
    - With the default, every code path and string stays as it is today. No committed test changes.
    - _Requirements: 1.5, 13.1, 13.2, 13.4_
  - [ ] 18.2 Create `src/ui/app/views/signal-label.ts`
    - `labelNode(signal, labels)` calls `signalLabel` for the Examples. For uploads it shows the Display_Name, plus a tech-only `<code>` holding the Signal_Name when the Plain_Name is not blank.
    - _Requirements: 13.4, 13.5_
  - [ ] 18.3 Pass labels through the timeline, move strip and picker views
    - In `src/ui/app/views/timeline.ts`, add `setFixture(fixture, labels?)`, which uses `labelNode`, and `setFixedOffered(on)`.
    - In `move-strip.ts`, add `showMoves(..., labels?)`.
    - In `picker.ts`, add `setFixture(fixture, selected, labels?)`.
    - _Requirements: 9.1, 12.5, 13.4, 13.5_
  - [ ] 18.4 Update `src/ui/app/views/tabs.ts`
    - Add `ReplayTabData.labels?` for the Gremlin_Log Signal cell, following D6.
    - Add `setNoFix(on)`, which shows only "Your own program has no fixed version to compare."
    - Add `setGremlinOrder(line)`, which sets a `techOnly` line in the Details tab (null removes it), so the Plain_View shows none.
    - _Requirements: 9.10, 12.4, 13.4, 13.5_
  - [ ] 18.5 Wire the labels and the gremlin order line into `src/ui/app/views/app-page.ts`
    - Use `RunTarget.labels` for the story, the strip, the timeline, the log and the picker.
    - Use the custom Story_Ending and `SPAN_SENTENCE.custom` for uploads. Labels come from the snapshot taken at Unleash.
    - While the Upload_Device is selected, call `tabs.setGremlinOrder(gremlinOrderLine(selected))` in the same render as every gremlin change. Call it with null for the Examples.
    - _Requirements: 9.10, 13.1–13.6_

- [ ] 19. No fixed build and no Cause_Line for uploads
  - [ ] 19.1 Update the aside and the verdict card
    - Add `noFix` to `AsideState` in `src/ui/app/views/aside.ts`. When it is set, no "See the fix work →" button is built.
    - In `src/ui/app/views/verdict-card.ts`, change the type to `StageBrokeInput.exampleId: ExampleId | null`. Null means `causeLine` is not called.
    - _Requirements: 12.1, 12.6, 13.7_
  - [ ] 19.2 Wire the no-fix state into `src/ui/app/views/app-page.ts`
    - `canSeeFix()` also requires `ctx.target.fixedHex !== null`. Aside `noFix` is true for uploads.
    - Call `tabs.setNoFix(true)` and `timeline.setFixedOffered(false)`, and pass `exampleId: null` to the BROKE card.
    - The Example-only strings are reachable only through `example !== null` paths.
    - _Requirements: 12.1–12.7, 13.7_

- [ ] 20. Capability_Panel for every device
  - [ ] 20.1 Create `src/ui/app/model/capability.ts`
    - Holds `CAPABILITY_COPY` with the exact strings of the design, including the four order steps and the HELD text with "N".
    - `notModelledList(table?)` reads `UNMODELLED_PERIPHERALS` at call time, with no copied `plainName`.
    - Holds `floatingReasons(verdict)` and `capabilityContent({ verdict, labels, table? })`.
    - _Requirements: 14.2–14.13_
  - [ ] 20.2 Create `src/ui/app/views/capability-panel.ts`
    - The DOM is built from `capabilityContent`, with `update({ verdict, labels })`. It is marked neither tech nor plain.
    - _Requirements: 14.1, 14.9–14.11_
  - [ ] 20.3 Add `setCapability(node)` to `src/ui/app/views/tabs.ts`
    - It mounts the panel at the end of the Details tab.
    - _Requirements: 14.1_
  - [ ] 20.4 Add the Capability_Panel styles to `src/ui/app/app.css`
    - _Requirements: 14.1_
  - [ ] 20.5 Wire the Capability_Panel into `src/ui/app/views/app-page.ts`
    - Mount it once for every device. Update it when the buggy Campaign ends, with the shown verdict and the target's labels.
    - On `clearOutputs()`, update it with `verdict: null`.
    - _Requirements: 14.1, 14.9, 14.10, 14.11_

- [ ] 21. Checkpoint: UI wiring
  - Run `npm test -- --run` and `npm run typecheck`. Report each exit code and the test counts.
  - `tests/ui/upload-no-network.test.ts` (A7) must now pass whole.
  - On any failure, stop and report the failing output. Do not go on to task 22.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Copy scan for the upload strings
  - [ ] 22.1 Create `tests/ui/upload-copy-scan.test.ts`
    - Import the word lists: `BANNED_WORDS`, the hyphen-free forms of its hyphenated entries, `BOARD_BRAND_NAMES` and the extra noun form of `copy-scan.test.ts`. Match with `wholeWordMatches`.
    - Walk `UPLOAD_COPY`, `HEX_ERROR_TEXT`, `ROW_ERROR_TEXT`, `TABLE_ERROR_TEXT`, `IMPORT_ERROR_TEXT`, `PIN_LEVELS_TEXT`, `CAPABILITY_COPY`, `RUN_LENGTH_MESSAGE` and `notModelledList()` at every depth.
    - Keep a `SAMPLES` entry for every function-valued key path. Also scan `sizeText`, `portBitText`, `hexErrorText`, `unmappedSignalText`, `gremlinOrderLine`, `capabilityContent`, `removeButtonLabel` and the upload `plainStory` and `stripPhrase` outputs.
    - Check the rank words, allowing "smallest" only in "The smallest replay this reducer found."
    - Check the board pin number patterns. Raw-scan every added or changed file under `src/ui/app/`, plus `index.html`, for the word lists, for "atmega" not starting "ATmega328P", and for `guard-allow`.
    - The test fails on a missing or empty table. It prints table, key path and word for each match.
    - _Requirements: 2.8, 5.8, 9.10, 10.8, 16.1, 16.2, 16.3, 16.6, 16.7, 16.8_

- [ ] 23. Checkpoint: existing suite unchanged (A8)
  - A8, verbatim: "Every existing test and acceptance value unchanged."
  - Run `npm test -- --run`. Every existing test passes, including:
    - crosswalk try 4 of 24, 8 → 3, `47078989121ebc1d`;
    - garage try 8 of 40, 7 → 3, `616062947f71a1ae`;
    - heartbeat try 2 of 24, 2 → 1, `19827a4e0a7ad440`;
    - the fixed-build HELD texts and the span pins.
  - Run `git diff --name-status <Start_Commit>` and check that it shows:
    - no change under `src/engine/`, `examples/` or `fixtures/`;
    - no change to a file whose name contains "baseline";
    - no committed test file changed, inside or outside `tests/ui/`.
  - Run `git diff <Start_Commit> -- package-lock.json` and check that its output is empty.
  - Check that the `dependencies` and `devDependencies` of `package.json` are unchanged.
  - On any failure or disagreement, stop and report what was expected, what happened and the evidence. Never edit an existing test to make it pass.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 19.8, 19.10, 20.1, 20.3, 20.4_

- [ ] 24. Final cleanup and checks
  - [ ] 24.1 Delete temporary debug scripts
    - Delete every file created during this work that neither tasks.md nor design.md names as a deliverable.
    - Show `git status --short` and confirm that no such file is left.
    - _Requirements: 20.7_
  - [ ] 24.2 Run the final commands and report
    - Run in this order: `npm test -- --run`, `npm run typecheck`, `npm run guard`, `npm run build`.
    - Report each command exactly as written with its exit code, and the passed, failed and skipped counts that `npm test -- --run` prints.
    - `npm run guard` should print `guard: clean` as its only line.
    - If any exit code is not 0, report the feature as not complete, quote the failing output and leave every user-written test unchanged.
    - Describe passing tests as evidence, not proof. Do not describe them as showing that the program is correct.
    - Add the browser checklist from the Notes to the report for the user.
    - _Requirements: 16.5, 17.9, 19.11, 20.6, 20.7, 20.8, 20.9_

## Notes

- Start_Commit: 70a78e618a26e7454a7898cca4cc02767a4c7430 (git status at start: only `?? .kiro/specs/bench-ui-upload/`)
- The plan has no optional sub-tasks. The property tests other than A6, the unit tests and the view source tests were dropped by decision. The tests that remain are A1 to A5, A6 (Property 11), A7, the display-replay determinism test (17.6), the copy scan (22.1) and the checkpoints.
- `removeButtonLabel(row, position)` in `model/pin-table.ts` is the pure form of the design's remove-button names (5.4, D5), so the copy scan can reach it.
- A7 (task 11.1) is written before the views exist, in the user's order. Its file-exists, `file-io.ts` and file-input checks fail until tasks 14 to 20 are done. Task 21 requires it to pass in full.
- Each task names the files it touches and the criteria it covers.
- Browser checklist, for the user to do by hand (no task runs a headless browser):
  1. Load the page: Crosswalk is selected, four cards sit in one row and the upload card has the same solid border as the others.
  2. Narrow the window to 768 px: the cards form a 2 × 2 grid.
  3. Pick "Your own program": the Program_Section appears between sections 1 and 2, the rule editor is open in both views, and there is no "Change rule ▾".
  4. Press "Try the sample", then "Unleash gremlins". Check that you see:
     - BROKE on try 4 of 24 and "8 moves → 3 needed";
     - the Pin_Levels_View with "Pin levels", and the walk button pressed with the Masher icon;
     - coral rings on the green car light and the walk sign at the break;
     - no "See the fix work →" button;
     - the text in "The fix" tab, and no "Fixed program" toggle.
  5. Load a `.with_bootloader.hex`: the bootloader sentence shows.
  6. Import, edit and export a pin map. Check the Row_Errors on bad rows, and the stacked cards at 600 px.
  7. Switch to Garage and back: the upload values are restored, and Garage shows its own values.
  8. Details tab: the Capability_Panel shows for every device, in both views. In the Technical_View, with Masher and Bouncer selected, the Upload_Device shows "Gremlin order: Masher, Bouncer"; the Plain_View shows no such line.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "4.1", "6.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["5.1", "6.2"] },
    { "id": 5, "tasks": ["5.2", "7.1"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["10.2"] },
    { "id": 10, "tasks": ["10.3"] },
    { "id": 11, "tasks": ["10.4"] },
    { "id": 12, "tasks": ["10.5"] },
    { "id": 13, "tasks": ["11.1"] },
    { "id": 14, "tasks": ["12.1", "13.1", "14.1", "15.1", "15.2", "17.1", "17.2", "18.1", "18.2", "19.1", "20.1"] },
    { "id": 15, "tasks": ["12.2", "12.3", "13.2", "14.2", "17.3", "18.3", "18.4", "20.2"] },
    { "id": 16, "tasks": ["13.3", "14.3", "20.3"] },
    { "id": 17, "tasks": ["14.4"] },
    { "id": 18, "tasks": ["14.5", "17.5"] },
    { "id": 19, "tasks": ["15.3", "20.4"] },
    { "id": 20, "tasks": ["16.1"] },
    { "id": 21, "tasks": ["17.4"] },
    { "id": 22, "tasks": ["17.6", "18.5"] },
    { "id": 23, "tasks": ["19.2"] },
    { "id": 24, "tasks": ["20.5"] },
    { "id": 25, "tasks": ["22.1"] },
    { "id": 26, "tasks": ["24.1"] },
    { "id": 27, "tasks": ["24.2"] }
  ]
}
```
