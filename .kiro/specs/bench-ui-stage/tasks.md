# Implementation Plan: bench-ui-stage

## Overview

TypeScript, UI only. Build the pure models under `src/ui/app/model/` first, with their Node tests. Then build the views and wire them in `views/app-page.ts`. Rules that apply to every task:

- No change under `src/engine/`, `examples/`, `fixtures/`, baselines, `src/ui/main.ts`, `src/ui/style.css`, or committed tests outside `tests/ui/`. If a task seems to need an engine change, STOP and report it (Req 21.1, 21.5).
- No new packages. `package.json` dependencies and `package-lock.json` stay identical (Req 21.4).
- Committed `tests/ui/` files change only for the pinned strings in design.md "Pinned strings that change". Every pinned number, seed, run count, 8 → 3 / 7 → 3 / 2 → 1, fingerprint, HELD_Text and span pin stays (Req 21.2, 21.3).
- If a user-written test and the system disagree, leave the test unchanged, report what it expects, what happened and the evidence, and wait (Req 21.6).
- No Banned_Word or Board_Brand_Name in `src/ui/app/` copy, comments or identifiers (Req 18.1). Integer cycles only in models; no UI_Clock, `Math.random` or network in `model/` (Req 19).
- Property tests: fast-check, fixed seed, `numRuns ≥ 100`, tagged `// Feature: bench-ui-stage, Property N: <title>`. Passing tests are evidence, not proof.

## Tasks

- [x] 0. Let the guard skip the contract's banned-word list
  - Append " <!-- guard-allow -->" to the end of line 10 of `docs/stage-design.md` (that line only, no other change), then run `npm run guard` and confirm it exits 0
  - _Requirements: 21.7_

- [x] 1. Pinned strings, worker field and test helpers
  - [x] 1.1 Update changed strings and their pins
    - `model/labels.ts`, `model/example-copy.ts` (`card` → `title` + `line`), `STORY_ENDING`, `EXAMPLE_STORY_LABELS.PULSE`, `PLAIN_STORY_LABELS.PULSE.short` ("turned it on again" / "held it on" / "turned it off", Req 16.3), `GREMLIN_LEGEND`, analog reason in `model/gremlin-picker.ts`, story naming in `model/plain-story.ts`
    - Update existing consumers (e.g. `views/gallery.ts`) only enough to keep typecheck green until task 6
    - Update only those strings in `plain-tables.test.ts`, `gremlin-picker.test.ts` and `PINNED_STORY` in `examples-host.acceptance.test.ts` (new values listed in design.md)
    - _Requirements: 2.5, 16.2, 16.3, 16.4, 21.2_
  - [x] 1.2 Update the reference model in `plain-story.property.test.ts`
    - **Property 21: Plain story naming**
    - **Validates: Requirements 16.4**
  - [x] 1.3 Pass `peripheralUses` through `CompactCampaignResult`
    - `worker/messages.ts`: optional `peripheralUses?: { runIndex; uses: PeripheralDiagnostic[] }`; `worker/host.ts`: on COULDN'T TELL copy the lowest-index `p.runs` entry that has `peripheralUses` unchanged, no filtering, no private engine code; `worker/codec.ts` checks the optional object; `codec.test.ts` must keep passing unchanged
    - _Requirements: 7.6_
  - [x] 1.4 Write `tests/ui/stage-couldnt-tell.acceptance.test.ts`
    - `runCampaignJob` on `fixtures/serial_hello` as specified in design.md: COULDN'T TELL, `peripheralUses.runIndex` 0, `uses` deep-equal to run 0's `RunResult.peripheralUses` (USART0, register, integer cycle)
    - _Requirements: 7.4, 7.6_
  - [x] 1.5 Create `tests/ui/stage-arbitraries.ts`
    - Reduced_Lists with v above every event, output edge sequences, REQUEST/BEAM_CLEAR events, HEARTBEAT edges, limits 1..60,000; `arbitraries.ts` stays unchanged
    - _Requirements: 20.2_

- [x] 2. Pacing and move strip models
  - [x] 2.1 Implement `model/pacing.ts`
    - Constants, pieces, Clusters, `cursorAt`, `slowFactorAt`, `positionOf`, `withTail`, Friendly_Factor, Speed_Badge, all integer/`BigInt` as in design.md; Segments outside the Req 5.5 bound keep 5.4 and 5.6
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 6.5, 19.1_
  - [x] 2.2 Write property test in `stage-pacing.property.test.ts`
    - **Property 1: Pacing plan shape**, plus the crosswalk, garage and heartbeat D/badge/reach rows from design.md
    - **Validates: Requirements 5.3, 5.6, 19.1**
  - [x] 2.3 Write property test
    - **Property 2: Cluster dwell**
    - **Validates: Requirements 5.4**
  - [x] 2.4 Write property test
    - **Property 3: Plan length** (draw inside the Req 5.5 bound)
    - **Validates: Requirements 5.5**
  - [ ]* 2.5 Write property test
    - **Property 4: Slider changes timing only**
    - **Validates: Requirements 5.6, 6.5**
  - [x] 2.6 Write property test
    - **Property 5: Friendly_Factor and Speed_Badge**, plus bands 9.25 → 9, 12.31 → 10, 129.3 → 130, 1.2 → 2, and "Real speed" at exactly 1
    - **Validates: Requirements 5.7, 10.1**
  - [x] 2.7 Implement `model/strip.ts`
    - `relativeTime`, `stripPhrase`, `stripDots`, `fadeShrinkDots` (multiset match on cycle, signal, gremlinId, digital value; union with earlier faded set), `shrinkDots`, `crossed`
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 6.1, 6.3_
  - [x] 2.8 Write property test in `stage-strip.test.ts`
    - **Property 6: Strip labels and pulses**, plus crosswalk "+0 / +65 / +131 / +450 ms broke" from the real cycles
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [ ]* 2.9 Write property test
    - **Property 7: Shrink dots**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
  - [x] 2.10 Write `tests/ui/stage-shrink-fade.test.ts`
    - Crosswalk `runReductionJob` with `onProgress` feeding `fadeShrinkDots`: faded set only grows, holds no dot matched in the latest `bestList`, ends with exactly the dots absent from the Reduced_List
    - _Requirements: 4.4, 4.5_

- [x] 3. Copy, stage phase, tabs and presets models
  - [x] 3.1 Implement `model/stage-copy.ts`, `model/stage.ts`, `model/tabs.ts`
    - Tables and text functions from design.md with Contract strings verbatim; "1 try" at M = 1; `TAB_TEXT.idle` and `stageFlags(…).tabsIdle`; Technical_View use lines in `couldntTellCard`; every number from run data (Req 18.4)
    - _Requirements: 1.2, 1.3, 1.4, 2.6, 2.8, 3.1, 3.2, 4.2, 7.1, 7.2, 7.4, 7.6, 8.1, 9.1, 9.2, 9.3, 10.1, 10.5, 10.6, 10.7, 11.1, 11.2, 11.3, 11.7, 11.8, 11.9, 18.3, 18.4_
  - [x] 3.2 Write property test in `stage-copy.test.ts`
    - **Property 8: Run-data number texts**, plus 870 ms → "0.9 s", (63,788,954, 870 ms) → "73.3 million chip cycles/s on this computer", 0 ms → none, Run_Length "1 s" / "0.6 s", and stage phase flags
    - **Validates: Requirements 2.6, 3.2, 7.2, 10.6, 11.7, 18.4**
  - [x] 3.3 Write property test
    - **Property 9: Cause line gate**
    - **Validates: Requirements 8.1, 8.2, 8.3**
  - [x] 3.4 Write property test
    - **Property 10: Reduction card** (both `stoppedAtBudget` values, K = 1, error case)
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**
  - [ ]* 3.5 Write property test
    - **Property 11: Verdict text pass-through**
    - **Validates: Requirements 7.1, 7.4, 10.7**
  - [ ]* 3.6 Write property test
    - **Property 12: Fix replay sentence**
    - **Validates: Requirements 10.1, 10.5**
  - [ ]* 3.7 Write property test
    - **Property 14: Tabs keyboard**
    - **Validates: Requirements 11.1, 11.2, 11.9**
  - [ ]* 3.8 Write property test
    - **Property 15: Legend lines**
    - **Validates: Requirements 11.3**
  - [x] 3.9 Implement `model/presets.ts`
    - `presetFor`, `checkLimit`, `presetRuleText` through the existing render and parse path, `presetHeadline`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 3.10 Write property test in `stage-presets.property.test.ts`
    - **Property 16: Rule preset round-trip and validation**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.5**
  - [x] 3.11 Write `tests/ui/stage-copy-scan.test.ts`
    - Scan every new or changed table with the Req 18.1 word lists; list table, key and word per match; ranking words only inside "The smallest replay this reducer found."; `copy-scan.test.ts` stays unchanged
    - _Requirements: 18.2, 18.3, 20.4_

- [x] 4. Scene and fix-view models
  - [x] 4.1 Implement `model/crosswalk-scene.ts`
    - `crosswalkFrame` with look-ahead passes and walker crossings as in design.md
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.8_
  - [x] 4.2 Write property test in `stage-scenes.property.test.ts`
    - **Property 17: Crosswalk car**
    - **Validates: Requirements 13.2, 13.3**
  - [x] 4.3 Write property test
    - **Property 18: Crosswalk walker, signals and labels**
    - **Validates: Requirements 13.4, 13.5, 13.6, 13.8**
  - [x] 4.4 Extend `model/scenes.ts`
    - `pumpkinShown`, `beamText`, `flickers`, `deadlineBadge`, `ringAt`, heartbeat stuck icon and the 15.5 line; `model/scene.ts` stays unchanged
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4, 15.5_
  - [x] 4.5 Write property test
    - **Property 19: Garage pumpkin, beam, flicker and badge**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5**
  - [x] 4.6 Write property test
    - **Property 20: I'm-alive ring**, plus the stuck icon and the 15.5 line truth table
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**
  - [x] 4.7 Implement `model/fix-view.ts`
    - `leftCursor`, `rightCursorEnd`, `fixBadge` (grouped wording of Req 10.4: "Car light: …" · "Walk sign: …", "Door: …", "I'm-alive light: …", with the odd-state rules), `fixedDisplayAgrees`, `codeHunks`
    - _Requirements: 10.3, 10.4, 10.8_
  - [ ]* 4.8 Write `stage-fix.test.ts`
    - **Property 13: Fix view cursors and badge**, plus `codeHunks` on the three diffs and `fixedDisplayAgrees` on the real crosswalk fixed replay
    - **Validates: Requirements 10.3, 10.4, 10.8**

- [x] 5. Checkpoint - Ensure all tests pass
  - Run `npx vitest --run` and `npm run typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 6. Views and wiring
  - [x] 6.1 Rewrite `views/icons.ts` and `app.css`
    - Six pumpkin icons with dimmed variants, ghost mark, play/pause; Contract section 1 tokens, three breakpoints, Phone_Width order, 44 px targets, focus rings, `prefers-reduced-motion` → 0 ms
    - _Requirements: 16.1, 17.1, 17.2, 17.3, 17.5, 17.6, 17.7_
  - [x] 6.2 Build `views/hero.ts` and `views/setup.ts`; rewrite `views/picker.ts`; trim `views/panels.ts`; delete `views/gallery.ts`
    - Keep `PICKER_COPY`, `UI_COPY`, `SHRINK_LABEL`, `BUDGET_TEXT`, `MINIMALITY_TOOLTIP`, `fill` exports; Details_Switch moves to the header; Limit_Control uses `presets.ts`
    - If a committed test imports a deleted file or export, STOP and report
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 12.1, 12.3, 12.4, 12.6, 16.5_
  - [x] 6.3 Build `views/scene-crosswalk.ts` (delete `views/scene.ts`); rewrite `views/scene-garage.ts` and `views/scene-heartbeat.ts`
    - Keep `GARAGE_TEXT` / `HEARTBEAT_TEXT` names; labels in HTML outside the SVG; render from the task 4 models
    - _Requirements: 5.7, 5.8, 13.1, 13.7, 13.8, 14.1, 14.2, 14.3, 14.4, 14.5, 15.1, 15.2, 15.3, 15.4, 15.5, 17.3_
  - [x] 6.4 Build `views/move-strip.ts` and `views/player-bar.ts`
    - rAF loop reads the UI_Clock and calls `pacing.ts`; Speed_Slider re-anchors with `positionOf`; pulses via `crossed`; no UI_Clock value in any Worker_Message
    - _Requirements: 4.3, 4.4, 4.5, 5.1, 5.2, 6.1, 6.3, 6.4, 6.5, 19.2_
  - [x] 6.5 Rewrite `views/verdict-card.ts`; build `views/aside.ts` and `views/stage.ts`
    - Keep `CARD_COPY`, `violatedRule`; idle, running, Shrink_View (dots fade on each `reduce-progress` via `fadeShrinkDots`), broke, reduce-error states; COULDN'T TELL `peripheralUses` list in Technical_View only
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.4, 4.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4, 9.5_
  - [x] 6.6 Build `views/fix-view.ts` and `views/tabs.ts`; small change to `views/timeline.ts`
    - Two Scenes on one Player with the 4× tail; tabs always shown with roving tabindex; "What happened" and "Signals" show "Nothing has broken yet." until a replay exists; timeline gains "Fixed program" and `techOnly` "Original run"; scrubber and preset speeds only in the Signals tab
    - Move the existing Replay-again row ("Replay again", "Fingerprint <fp> · matches/differs") into the Details tab, Technical_View only, keeping its strings and `canReplayAgain`
    - _Requirements: 6.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 2.9_
  - [x] 6.7 Rewrite `views/app-page.ts`
    - Phase state from `model/stage.ts`; job order reduce → reduced replay + display → original replay + display; fix flow with display `violationCycle` = buggy v; fresh EmulatorBridge per Display_Replay; error handling table from design.md
    - _Requirements: 2.7, 2.8, 4.1, 5.1, 5.2, 10.1, 17.6, 19.2, 19.3, 19.4_

- [x] 7. Final checkpoint - Global_Checks and handover
  - Delete every temporary debug script
  - Run once each: `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`; report each command with its exit code, and the passed, failed and skipped counts for vitest
  - Confirm no diff under `src/engine/`, `examples/`, `fixtures/`, baselines, `package.json` dependencies or `package-lock.json`
  - Hand the "Browser checklist" from design.md to the user for a manual check; plan no headless-browser run
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 17.4, 20.3, 20.5, 21.1, 21.3, 21.4, 21.7_

## Notes

- Tasks marked `*` are optional. Required test tasks are the ones Req 20 lists, the 7.6 acceptance test, the shrink-fade test, the copy scan and the pinned-string updates.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0", "1.1", "1.3", "1.5", "2.1", "2.7", "3.1", "3.9", "4.1", "4.4", "4.7", "6.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2", "2.8", "3.2", "3.10", "3.11", "4.2", "4.8", "6.2", "6.3"] },
    { "id": 2, "tasks": ["2.3", "2.9", "2.10", "3.3", "4.3", "6.4"] },
    { "id": 3, "tasks": ["2.4", "3.4", "4.5", "6.5"] },
    { "id": 4, "tasks": ["2.5", "3.5", "4.6", "6.6"] },
    { "id": 5, "tasks": ["2.6", "3.6", "6.7"] },
    { "id": 6, "tasks": ["3.7"] },
    { "id": 7, "tasks": ["3.8"] }
  ]
}
```
