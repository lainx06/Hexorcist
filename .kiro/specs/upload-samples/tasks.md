# Implementation Plan: Upload Samples

## Overview

TypeScript only. All changes live in `src/ui/app`, `fixtures/serial_hello` and `index.html`. No engine code changes, and `EmulatorBridge` is never imported by anything this plan adds. Every new sample runs through the same worker and host job runners as today's Crosswalk sample. Order of work: data and fixtures, sample loading and buttons, story wording with the one permitted test update, picker, Fixed_Card headline, COULDN'T TELL text, hidden pin-level columns, `index.html`, acceptance tests with cross-checks, then the full run.

Property tests use `fast-check` with at least 100 iterations each, tagged `Feature: upload-samples, Property N: <title>`. Passing tests are evidence, not proof.

## Recorded test change (Requirement 4.6)

The user permitted exactly one change to an existing test.

- File: `tests/ui/plain-story.property.test.ts`.
- Test: `it("Property 21: Plain story naming", ...)`, and its `reference()` function, span handling around lines 76-81.
- Change: update the EXPECTED text only, and only for non-cut spans with `lengthCycles` under 8000. The expected sentence becomes "It lasted X.Y microseconds, too short to round to a whole millisecond." with X.Y = cycles / 16 to one decimal (78 cycles gives 4.9).
- Unchanged: spans of 8000 cycles or more keep today's expected text. All cut spans keep today's expected text (including under 8000 cycles). The `plainMs` test (line ~100, "plainMs at 0, 7,999, 8,000, 16,000 and 16,000,000 cycles") stays exactly as it is.
- No other existing test may be changed, weakened or deleted. That includes the scanner file lists in `upload-no-network.test.ts`, `upload-copy-scan.test.ts`, `stage-copy-scan.test.ts` and `copy-scan.test.ts`: new scan coverage goes into NEW test files (task 9.1), never into those files.

## Stop rules

- The acceptance tests for Requirements 2 and 3 are the user's. Never change, weaken or delete them to make them pass.
- If a run differs from the expected results below, stop, report what the test expects, what happened, and the evidence, then wait for the user.
- Debug scripts are temporary. Delete them before reporting any task done.
- Passing tests are evidence, not proof.
- Never touch: the F4-pinned left card source lines in `fix-view.ts` (`leftCard` and its children array), `isCompatible` and `matches` in `model/gremlin-picker.ts`, the `TAB_TEXT.fixNotRun` lines, or `sampleDownloads` and its two files (`crosswalk-buggy.hex`, `crosswalk-pins.json`).

## Expected results (cross-check, stop on any difference)

The user observed these earlier with the same engine. Tasks 10.3 and 10.4 compare real runs against them.

- Chat-written sketch with Requirement 2 settings: BROKE on try 1 of 24, reduced to 1 move (Masher pressed and held the walk button), violation of "all of (WALK is 1, DONT_WALK is 1) must never happen." lasting 78 cycles, story "It lasted 4.9 microseconds, too short to round to a whole millisecond.", fingerprint `a535ab6ae6984890`. The acceptance test asserts BROKE on try 1 of 24 and records the fingerprint the run produces (Requirement 2.8: no fingerprint value written before the run is hard-coded). A separate cross-check step compares the recorded fingerprint, the 1-move reduction and the 78-cycle span with the values above.
- `serial_hello` with Requirement 3 settings: COULDN'T TELL, reason names the serial port (USART0). The acceptance test asserts COULDN'T TELL and a reason containing "serial port".
- Both acceptance tests are written by running the real host job runners (`runCampaignJob`, `runReductionJob`, `runReplayJob`, as in `tests/ui/examples-host.acceptance.test.ts`) headlessly, with no browser.

## Tasks

- [x] 1. Data and fixtures
  - [x] 1.1 Create `fixtures/serial_hello/pins.json`
    - Content: `{ "pins": [ { "signal": "LED", "port": "B", "bit": 5, "direction": "output" }, { "signal": "BUTTON", "port": "D", "bit": 2, "direction": "input", "activeLevel": "low" } ] }`.
    - Do not edit `fixtures/serial_hello/fixture.json` or the built HEX.
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 1.2 Create `src/ui/app/data/upload-samples-extra.ts` and the new copy keys
    - Build-time `?raw` imports of `exorcism-demo/benchmark/round2/chatgpt-high.hex`, `fixtures/serial_hello/build/serial_hello.ino.hex` and `fixtures/serial_hello/pins.json`. No fetch, no runtime file access.
    - Export `CHAT_SKETCH_HEX_NAME` ("chat-written-crossing.hex"), `CHAT_SKETCH_RULE_TEXT`, `CHAT_SKETCH_FIELDS` (runs "24", seed "20261101", runLengthMs "1000"), `chatSketchProgram()`, `chatSketchRows(firstId)` (reuse `sampleRows`).
    - Export `UNJUDGEABLE_HEX_NAME` ("serial_hello.ino.hex"), `UNJUDGEABLE_RULE_TEXT` ("LED is 1 must never last 500 ms or longer."), `UNJUDGEABLE_FIELDS` (runs "8", seed "20261101", runLengthMs "1000"), `unjudgeableProgram()`, `unjudgeableRows(firstId)` (via `importPinMap`).
    - Add `UPLOAD_COPY.tryChatSketch` ("Try a chat-written sketch"), `UPLOAD_COPY.tryUnjudgeable` ("Try one it can't check") and `UPLOAD_COPY.sampleLoadError` ("This sample could not be loaded.") in `model/upload-copy.ts`.
    - Do not touch `data/upload-sample.ts` or `sampleDownloads`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.5, 3.6, 3.7_

  - [ ]* 1.3 Write unit tests for the sample data
    - New file `tests/ui/upload-samples-data.test.ts`. Bundled HEX text equals the file on disk byte for byte, `pins.json` content and import result, exact names, rule texts and fields, no network call in the data module.
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.4, 3.6, 3.7_

- [x] 2. Sample loading and program-section buttons
  - [x] 2.1 Add `loadChatSketchSample` and `loadUnjudgeableSample` to `upload-state.ts`
    - Return `SampleLoadResult` (`{ ok: true; state } | { ok: false }`). The state sets program, rows, rule text, fields, `selected: ["masher"]`, `autoMasher: false`, `lastValid`, clears `hexError`, `importError`, `reading`, then `pruneGremlins`.
    - `{ ok: false }` when the bundled HEX is empty or rejected by the HEX parser, or the pin map import fails. The input state is never mutated.
    - Leave `loadSample` unchanged.
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.10, 3.1, 3.5, 3.6, 3.7, 3.10_

  - [x] 2.2 Add the two buttons, the disabled wiring and the page handlers
    - `program-section.ts`: add `onChatSketchSample` and `onUnjudgeableSample` callbacks; `program-row` order is Choose .hex file, Try the sample, Try a chat-written sketch, Try one it can't check, Download the sample.
    - In `paint(s, d, busy)`, disable the two new buttons and add `download.disabled = busy`, in the same render update that shows the outcome.
    - `app-page.ts`: new handlers that return when `lockedNow()`, call the loaders, on `!r.ok` call `showError(UPLOAD_COPY.sampleLoadError)` and leave `upload` untouched, otherwise assign, `setup.rules.setText`, `ctl.setTexts`, `afterUploadEdit()`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.10, 3.10_

  - [ ]* 2.3 Write unit tests for loading and buttons
    - New file `tests/ui/upload-samples-state.test.ts`: loaders replace earlier program, rule text and settings; a forced failure returns `{ ok: false }` and the original state object is unchanged; button order and labels; `disabled` follows `busy` for all five; `sampleDownloads()` still returns the same two files.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.10, 3.10_

- [x] 3. Story wording (Requirement 4)
  - [x] 3.1 Add the microsecond sentence to `model/plain-story.ts`
    - Add `SHORT_SPAN_LIMIT_CYCLES = 8000` and an integer-only `microseconds(cycles)` (tenths = `floor((cycles * 10 + 8) / 16)`, always shows the decimal digit).
    - In the `a.span !== undefined` branch: cut spans keep today's text; non-cut spans under 8000 cycles write "It lasted X.Y microseconds, too short to round to a whole millisecond."; spans of 8000 cycles or more keep the `spanSentence` substitution. Do not edit `plainMs`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8_

  - [x] 3.2 Apply the single permitted Property 21 update
    - Edit only the expected text in `reference()` of `tests/ui/plain-story.property.test.ts` as recorded in "Recorded test change (Requirement 4.6)". Leave every other line and every other test in the file unchanged, including the `plainMs` test.
    - Run the file and confirm it passes. If anything else in the file fails, stop and report.
    - _Requirements: 4.5, 4.6, 4.7_

  - [ ]* 3.3 Write property tests for the wording
    - New file `tests/ui/plain-story-micro.property.test.ts`.
    - **Property 1: Microsecond sentence matches the cycles/16 formula**, plus a unit assertion that 78 cycles gives "4.9".
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - **Property 2: plainMs never renders "0 ms" at 8000 cycles or more**
    - **Validates: Requirements 4.8**

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the tests in `tests/ui`. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Gremlin picker on the Upload_Path (Requirement 8)
  - [x] 5.1 Add the upload-only compatibility filter
    - `model/gremlin-picker.ts`: add `isCompatibleForUpload(def, fixture)` (every target is a digital input present in the fixture; analog never counts). Do not edit `isCompatible` or `matches`.
    - `views/picker.ts`: `setFixture(fixture, selected, labels, compatibleOverride?)` overrides `tile.compatible` (and `reason`) when given.
    - `app-page.ts` `paintUpload()`: pass `isCompatibleForUpload`. `applyExample` stays unchanged.
    - _Requirements: 8.1_

  - [x] 5.2 Gate the "Pick at least one gremlin." message on touched or tried
    - `views/picker.ts`: `touched` (set in the chip click handler) and `tried` (new `setTried()`), both reset when `setFixture` gets a new fixture. Message text only when `selected.length === 0 && (touched || tried)`, updated in the same interaction.
    - `app-page.ts` `onBlockedUnleash`: call `setup.gremlins.setTried()`.
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

  - [ ]* 5.3 Write property tests for the picker
    - New file `tests/ui/upload-picker.property.test.ts`. Leave `gremlin-picker.test.ts` untouched.
    - **Property 5: Upload_Path gremlin compatibility requires every target to be a digital input**
    - **Validates: Requirements 8.1**
    - **Property 6: Pick-message visibility is a function of selection count, touch, and try state**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**

- [x] 6. Fixed_Card headline (Requirement 5)
  - [x] 6.1 Add the headline to the right card in `views/fix-view.ts` and `app.css`
    - Add `fixedHeadline` (hidden, empty) as the first child of `rightCard` only. `showCampaignDone` sets its text to the matching `VERDICT_WORD` and shows it; `begin()` hides and clears it.
    - CSS: `.fixed-verdict-headline` at 22px, bold, with `--mint` under `.fix-card--held`, `--coral` under `.fix-card--broke`, `--text-2` under `.fix-card--tell`.
    - Do not edit the `leftCard` line, its children array, or `TAB_TEXT.fixNotRun`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write unit tests for the headline
    - New file `tests/ui/fixed-headline.test.ts`: one per verdict word, colour variable per verdict, DOM order above `replayLine` and `campaignBox`, no headline before a verdict, HELD text from `fixedCampaignText` with the real N.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 7. COULDN'T TELL screen text (Requirement 6)
  - [x] 7.1 Stage text and solid panel
    - `model/stage-copy.ts`: add `STAGE_TEXT.noReplay = "Nothing to replay."`. Keep `STAGE_TEXT.idleTitle` unchanged.
    - `views/stage.ts`: `showNote(line, dim, opts?)` with an optional `{ solid: true }`; add `.stage-note-block--solid { background: #0E1513; }` in `app.css`. Show no replay controls in this state.
    - `app-page.ts`: the COULDN'T TELL path calls `stage.showNote(STAGE_TEXT.noReplay, true, { solid: true })`. Other `showNote` callers are unchanged.
    - _Requirements: 6.1, 6.4_

  - [x] 7.2 Tab text, including the `TAB_TEXT.idle` change
    - `model/stage-copy.ts`: change `TAB_TEXT.idle` to "The story of the run shows here after you unleash the gremlins."; add `TAB_TEXT.noReplayNote = "No replay: the verdict card explains why this program has no result."`. Do not edit the `TAB_TEXT.fixNotRun` lines.
    - `views/tabs.ts`: add `setCouldntTell(on)`; `paintReplay()` uses `noReplayNote` over `idle` when on.
    - `app-page.ts`: call `setCouldntTell(true)` with the COULDN'T TELL phase and `setCouldntTell(false)` in `clearOutputs()`.
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ]* 7.3 Write unit tests for the text
    - New file `tests/ui/couldnt-tell-text.test.ts`: `TAB_TEXT.idle` and `STAGE_TEXT.idleTitle` values, What happened and Signals tabs show the idle text before any run, solid note panel, `noReplayNote` shown and idle text absent for COULDN'T TELL, both texts cleared when a new run starts.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Hidden pin-level columns (Requirement 7)
  - [x] 8.1 Confirm the hiding with a regression test and change code only if it fails
    - The design found that `stage.ts` `look("dim")` already blanks the Upload scene (`waiting: true`) while the reducer runs. Write the test first in a new file `tests/ui/pin-levels-hidden.test.ts` (driving `scene-pin-levels.ts` and the stage `showShrinking` path) for 7.1 to 7.4.
    - If the test shows a gap, fix it in `stage.ts` or `scene-pin-levels.ts` with the smallest change. If it passes, make no source change and report that.
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.2 Write property tests for stale pin levels
    - New file `tests/ui/pin-levels-hidden.property.test.ts`.
    - **Property 3: No stale pin levels while the reducer runs and the scene is dimmed**
    - **Validates: Requirements 7.1, 7.2, 7.4**
    - **Property 4: Pin_Levels_View shows only the resulting trace, never a stale one**
    - **Validates: Requirements 7.3**

- [x] 9. Page description and scan coverage
  - [x] 9.1 Add the meta description and noscript block to `index.html`
    - One `<meta name="description">` in `<head>`; one `<noscript>` as a direct child of `<body>`. Both say the app runs a compiled program on a simulated ATmega328P chip, seeded gremlins attack the inputs, and three verdicts are reported. The noscript names BROKE, HELD and COULDN'T TELL and holds the exact string "No violation found in N emulated runs of this gremlin set. Not a proof." with a literal N. No run count, pass result or verdict for a specific program. None of the banned words and no board brand name in title, meta or noscript.
    - Keep the exactly-one `<script>`, `<title>` and `<div id="app">` that `source-rules.test.ts` pins.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 9.2 Write the `index.html` test and the new-file scan tests
    - New file `tests/ui/upload-samples-scan.test.ts`: element counts (one meta description, one body-child noscript), required phrases, absence of run-count or verdict phrasing, banned words (whole-word and suffixed forms) and board brand names via the existing `wholeWordMatches`, `BANNED_WORDS` and `BOARD_BRAND_NAMES` helpers. The same file scans the new strings (`tryChatSketch`, `tryUnjudgeable`, `sampleLoadError`, `noReplay`, `noReplayNote`, new `idle`) and the new source files (`upload-samples-extra.ts`) for banned words, brand names, network calls, `Date.now`, `performance.now`, `setTimeout` and `Math.random`.
    - Do not edit the existing scanner tests or their file lists.
    - _Requirements: 2.2, 3.2, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [x] 10. Acceptance tests and cross-checks
  - [x] 10.1 Write the Chat_Sketch_Sample acceptance test
    - New file `tests/ui/upload-samples.acceptance.test.ts` (or a section of it). Build the input through `loadChatSketchSample`, run the real `runCampaignJob`, `runReductionJob` and `runReplayJob` headlessly as `tests/ui/examples-host.acceptance.test.ts` does, with no browser.
    - Assert verdict BROKE on try 1 of 24. Record the fingerprint the run produces (log it and keep it in a local variable). Do not hard-code a fingerprint (Requirement 2.8).
    - If the run disagrees, stop and report expected, actual and evidence. Do not edit the test.
    - _Requirements: 2.7, 2.8, 2.9_

  - [x] 10.2 Write the Unjudgeable_Sample acceptance test
    - Same file, same method with `loadUnjudgeableSample` and Requirement 3 settings (500 ms rule, 8 runs, 1000 ms per run, seed 20261101).
    - Assert COULDN'T TELL (exact verdict string) and a reason containing "serial port". Also assert no BROKE or HELD and no violation trace.
    - If the run disagrees, stop and report expected, actual and evidence. Do not edit the test.
    - _Requirements: 3.8, 3.9, 3.11, 3.12_

  - [x] 10.3 Cross-check the Chat_Sketch_Sample run against the observed results
    - Run 10.1 and read the recorded fingerprint, the reduced move count and the violation span. Compare with the expected results above: fingerprint `a535ab6ae6984890`, 1 move (Masher pressed and held the walk button), 78 cycles, story "It lasted 4.9 microseconds, too short to round to a whole millisecond.", BROKE on try 1 of 24.
    - Stop on any difference and report expected, actual and evidence. Wait for the user. Any helper script used to print values is deleted before this task is reported done.
    - _Requirements: 2.7, 2.8, 2.9, 4.1, 4.3_

  - [x] 10.4 Cross-check the Unjudgeable_Sample run against the observed results
    - Run 10.2 and read the verdict and reason text. Expected: COULDN'T TELL with a reason naming the serial port (USART0). Stop on any difference and report; delete any helper script before reporting done.
    - _Requirements: 3.8, 3.9, 3.12_

- [x] 11. Whole-repo checks
  - [x] 11.1 Run the full test suite
    - `npm test -- --run` (the `test` script is `vitest`; `--run` gives a single pass). Compare the count of existing tests with the count before this spec: unchanged except the one permitted Property 21 update. Report failures, do not edit tests to clear them.
    - _Requirements: 4.7_

  - [x] 11.2 Run typecheck, guard and build
    - `npm run typecheck`, `npm run guard`, `npm run build`. The repo defines no lint script, so none is run. Fix source problems in new code only.
    - _Requirements: 1.1, 9.7, 9.8_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Run the whole existing test suite and confirm all pass; the existing test count is unchanged except the one permitted Property 21 update.
  - Delete any temporary debug scripts and confirm none remain (check `git status` for untracked scratch files).
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Upload-path gremlin pruning (review decision)
  - [x] 13.1 Prune with the upload rule on the upload path
    - In `src/ui/app/model/upload-state.ts`, `pruneGremlins` must use `isCompatibleForUpload` (the same rule as the upload picker), so a gremlin the picker hides can never stay selected.
    - `isCompatible` and `matches` stay unchanged. The example path keeps using `isCompatible`.
    - Add a NEW test file `tests/ui/upload-prune.test.ts` proving a hidden gremlin (for example Spike with only an analog pin and no matching digital input) is removed from the selection while a visible one stays. Do not edit existing tests.
    - Run `tests/ui` and typecheck. If an existing test fails, stop and report what it expects, what happened, and the evidence. Wait for the user's decision.
    - _Requirements: 8.1_

- [x] 14. Remove unused copy
  - [x] 14.1 Remove `STAGE_TEXT.couldntTell` if unreferenced
    - Grep `src` and `tests` for `STAGE_TEXT.couldntTell` and the string "This program can't be judged here. The card says why.".
    - If nothing references either, remove the entry from `src/ui/app/model/stage-copy.ts`. If anything references it, leave it and report where.
    - _Requirements: 6.1_

- [x] 15. COULDN'T TELL screen cleanup
  - [x] 15.1 COULDN'T TELL screen: hide pin-level columns and style the note as a panel
    - When the verdict is COULDN'T TELL, the pin-level columns are hidden: no labels or levels are visible (for example "BUTTON not pressed" and "LED not driven" must not show).
    - The "Nothing to replay." note is a clearly visible panel: padding, a border using the existing line token, the solid background, centred in the stage.
    - Nothing else on the screen changes. Edit only `stage.ts`, `scene-pin-levels.ts` and `app.css` as needed, with the smallest change.
    - Add a NEW source-level test in a new file, like `tests/ui/pin-levels-hidden.test.ts` (Requirement 7) but a separate file (for example `tests/ui/couldnt-tell-screen.test.ts`). Do not edit existing tests, including `tests/ui/pin-levels-hidden.test.ts`.
    - Then run `npx vitest --run tests/ui`, `npm run typecheck` and `node scripts/guard.mjs`. If an existing test fails, stop and report what it expects, what happened, and the evidence. Wait for the user's decision.
    - _Requirements: 6.1, 7.1_

## Notes

- Tasks marked `*` are optional extras (unit and property tests beyond the required ones). Required tests: the Property 21 update (3.2), the regression test (8.1), the scan test (9.2) and the acceptance tests with cross-checks (10.1 to 10.4).
- Each task references requirement clauses for traceability. Property tests check the universal properties of the design; they are evidence, not proof.
- Requirements 7.1 to 7.3 are expected to hold already; task 8.1 checks that before any code change.
- `app-page.ts` is edited by tasks 2.2, 5.1, 5.2, 7.1 and 7.2, so they sit in different waves.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "3.3", "6.1"] },
    { "id": 2, "tasks": ["1.3", "2.1", "5.1", "6.2"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "5.2"] },
    { "id": 5, "tasks": ["5.3", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["7.3", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.2", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2"] },
    { "id": 12, "tasks": ["13.1", "14.1"] },
    { "id": 13, "tasks": ["15.1"] }
  ]
}
```
