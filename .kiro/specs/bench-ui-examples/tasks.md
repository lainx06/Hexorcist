# Implementation Plan: bench-ui-examples

## Overview

TypeScript, Vite, Vitest in Node. The plan builds the risky parts first: the three Example data modules, the Display_Replay with the Checker_Wrapper, and the Node acceptance test that pins run index, reduction, fingerprint, HELD text, gremlin order and the crosswalk span. The pure model modules come next, then the views and the page wiring, then one run of the Global_Checks. The user does the browser check from design.md's "Browser checklist".

Standing guards for every task:

- No file under `src/engine/` changes. If a task seems to need an Engine change, stop and report the needed change without making it (Requirement 23.8).
- No new package; `package.json` dependencies and `package-lock.json` stay unchanged (23.2).
- No committed test, baseline, fixture or example file changes; new tests are new files under `tests/ui/` (20.8, 23.1). `src/ui/main.ts` and `src/ui/style.css` stay unchanged.
- Pinned exports (G9) keep their behaviour: `LANES`, `windowEnd`, `shrinkText`, `elapsedText`, `STORY_LABELS`, `buildStoryInput`, `SCENE_SIGNALS`, `SCENE_NOTE`, `sceneAt`, `coverageLine`, `NEVER_RULE_PART`, the `FlowState` functions, `CROSSWALK_TEXTS`, `loadCrosswalk`, `loadGarage`, `runReplayJob`, `WORKER_MESSAGE_KINDS`.
- No claim word of G11 and no "safety" in UI copy or anywhere under `src/ui` (code, comments, identifiers, ordinal forms included); use names like `leadInput` and `targets[0]` (20.2).
- Simulated time is integer cycles; no clock or `Math.random` in model code (23.3 to 23.5).
- If a test and the system disagree, or a pinned value differs, stop and report expected value, actual value and evidence; never change a test the user wrote into the spec to make it pass (9.14, 11.19, 21.9, 22.9).
- Delete every temporary debug script before reporting a task done (23.9). Describe passing tests as evidence, not proof (22.10).

## Tasks

- [x] 1. Example data, Display_Replay and the Node acceptance test
  - [x] 1.1 Add the Example data modules
    - `src/ui/app/data/heartbeat.ts` (`loadHeartbeat`) and `loadGarageExample()` in `data/garage.ts`, each with the seven `?raw` imports, following the `data/crosswalk.ts` pattern; `loadGarage` unchanged
    - `src/ui/app/data/examples.ts`: `EXAMPLE_IDS`, `ExampleId`, `ExampleBundle` (with `rulesText`, `sentences`), `FileProblem`, `LoadedExample`, `loadExample(id)`; parse failures keep `readRulesFile` reasons unchanged; no DOM, no clock
    - _Requirements: 3.1, 3.3, 3.8_
  - [x] 1.2 Add the display model, the Checker_Wrapper and the display-replay protocol
    - `src/ui/app/model/display.ts`: `DISPLAY_LIMIT`, `displayRunCycles`, `ReplayView`, `displayAgrees`, `displaySpan`, `displayWindowEnd` as in design.md "Display model"; `spanFor` unchanged
    - `worker/host.ts`: `wrapChecker`, `DisplayReplayJobInput`, `runDisplayReplayJob`; move the shared replay steps into a private helper so `runReplayJob` keeps its committed behaviour; `violationCycle` check text "Field violationCycle: must be a whole number of 0 or more."
    - `worker/messages.ts`: `DISPLAY_REPLAY_KIND`, `DisplayReplayRequest` (not added to `REQUEST_KINDS` or `WORKER_MESSAGE_KINDS`); `worker/codec.ts`: `encodeDisplayRequest`, `decodeDisplayRequest`; `engine.worker.ts`: route `"display-replay"` before `decodeRequest`; `views/worker-client.ts`: `runDisplay(req)` settling on the matching `jobId`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 23.3, 23.4_
  - [x] 1.3 Add the text tables, verdict texts and gremlin compatibility models
    - `model/labels.ts`: `FRIENDLY_LABELS`, `friendlyLabel`, `EXAMPLE_STORY_LABELS`, `storyLabelsFor`, `PLAIN_STORY_LABELS`, `GREMLIN_LEGEND`
    - `model/example-copy.ts`: `EXAMPLE_COPY`, `CUSTOM_COPY`, `isCustomRuleSet`, `copyFor`
    - `model/verdict-plain.ts`: `VERDICT_PLAIN`, `runOfText`, `gremlinLogSummary`, `heldSentence`, `heldCardText`, `plainCoverageParts`, `couldntTellHeadline`, `reductionSentence`, `storyHeading`, `reducedReplayNote`, `originalRunNote`
    - `model/gremlin-picker.ts`: `PICKER_TEXT`, `isCompatible`, `incompatibleReason`, `defaultSelection` (keeps meta.json `gremlinSet` order), `pickerTile` with exact cycles-to-ms text; existing `gremlinTile` unchanged
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.6, 6.2, 6.7, 7.1, 7.2, 7.3, 7.6, 8.1, 8.2, 10.1, 10.2, 10.3, 10.4, 10.5, 11.1, 11.13, 13.1, 13.2, 15.1, 15.2, 15.3, 15.4, 15.8, 15.13_
  - [x] 1.4 Add the Plain_Story_Builder and the new format and story-input functions
    - `model/plain-story.ts`: `plainMs` (integer maths), `plainStory` following design.md "Plain_Story_Builder" steps 1 to 8
    - `model/format.ts`: add `elapsedSecondsText`, `shrinkArrowText`; `model/story-input.ts`: add `exampleStoryInput`
    - _Requirements: 10.5, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.12, 12.4, 12.6, 13.7_
  - [x] 1.5 Write `tests/ui/examples-host.acceptance.test.ts`
    - For crosswalk, garage, heartbeat via `loadExample` and meta.json defaults: `runCampaignJob`, `runReductionJob`, `runReplayJob`, `runDisplayReplayJob`, each result through `encodeMessage` then `decodeReply`, asserting on decoded values
    - Exact user values: BROKE with `violatingRunIndex` 3 / 7 / 1 and `runOfText` "run 4 of 24" / "run 8 of 40" / "run 2 of 24"; seeds 20261101 / 20261102 / 20261103; reductions 8 → 3 / 7 → 3 / 2 → 1; reduced-replay fingerprints `47078989121ebc1d` / `616062947f71a1ae` / `19827a4e0a7ad440`; fixed-build HELD texts "No violation found in 24 emulated runs of this gremlin set. Not a proof." / 40 / 24
    - `displayAgrees` true on the Display_Replay of each Reduced_List; `displaySpan` per list: crosswalk violating run (full event list) and Reduced_List `lengthCycles` > 16,000 and `cut` true at the 1,000 ms Display_Limit; garage Reduced_List `lengthCycles` 3,833,643 and `cut` false, garage violating run: pin the computed values and report them; heartbeat violating run (full event list) `lengthCycles` 1,152,850 and `cut` false (the full run holds 2 gremlin moves, the Reduced_List 1, and the full run's span ends on its own; matches the committed examples test, span 1152850 cycles, not cut by replay end), heartbeat Reduced_List `lengthCycles` > 16,000 and `cut` true
    - `defaultSelection(meta.gremlinSet, fixture)` deep-equals `meta.gremlinSet` (garage: bouncer then masher)
    - `plainStory`, with the span sentence, on the three Reduced_Lists equals the full texts of Requirements 11.16 (crosswalk), 11.17 (garage) and 11.18 (heartbeat) (if only a rounded number differs, use the computed number, pin the computed text and report both texts with the Reduced_List cycles; if the wording differs, stop)
    - Failures name the Example_Id, the build and the verdict or error `kind` and `message`; long per-test timeout
    - If any pinned value differs, or a Plain_Story wording differs (rounded-number differences follow 11.19), stop and report expected, actual and evidence; leave the test unchanged
    - _Requirements: 9.11, 9.12, 9.13, 9.14, 11.16, 11.17, 11.18, 11.19, 15.13, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 22.2_

- [x] 2. Checkpoint - Ensure the acceptance test passes
  - Run `npx vitest --run tests/ui/examples-host.acceptance.test.ts`; on any disagreement stop and report expected, actual and evidence. Ensure all tests pass, ask the user if questions arise.

- [x] 3. Remaining model modules and model tests
  - [x] 3.1 Add the lanes, scenes and details models
    - `model/lanes.ts`: `exampleLanes`, `outputLaneWord`, `inputLaneWord`, `releaseRanges`, `plainSelectedText`
    - `model/scenes.ts`: `DOOR_TRAVEL_CYCLES`, `doorTravelAt`, `garageSceneAt`, `heartbeatSceneAt`
    - `model/details.ts`: `DETAILS_KEY`, `detailsFromStored`
    - _Requirements: 1.2, 1.3, 16.1, 16.2, 16.3, 16.4, 16.6, 16.9, 17.1, 17.3, 17.8, 17.9, 17.11, 17.13, 17.14, 17.15, 17.18_
  - [x] 3.2 Add the Rule_Box_Check model
    - `model/rule-box.ts`: `RuleError`, `RuleBoxResult`, `ruleErrorFrom`, `checkRuleBox` (empty text gives exactly "Add at least one rule."), `sentencePatterns` from `leadInput` and the leading output
    - _Requirements: 18.3, 18.4, 18.7, 18.10_
  - [x] 3.3 Write property test for the Plain_Story_Builder
    - `tests/ui/plain-story.property.test.ts`, fast-check `{ numRuns: 100 }`, tag `// Feature: bench-ui-examples, Property 1: Plain story follows the stated sentence rules`; plus `plainMs` at 0, 7,999, 8,000, 16,000, 16,000,000 gives "0 ms", "0 ms", "1 ms", "1 ms", "1,000 ms"
    - **Property 1: Plain story follows the stated sentence rules**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 22.6**
  - [x] 3.4 Write property test for the Rule_Box reason mapping
    - `tests/ui/rule-box.test.ts`: Property 2 with `{ numRuns: 100 }` and its tag; one real `readRulesFile` failure mapped end to end; one `compileRuleSet` reason passed through unchanged; `""` gives exactly "Add at least one rule."; each of the five Sentence_Patterns passes `checkRuleBox` alone and appended to each Example's `rules.txt`
    - **Property 2: Rule_Box reason mapping**
    - **Validates: Requirements 18.3, 18.4, 18.7, 18.10, 22.4**
  - [x] 3.5 Write the table, verdict-text and gremlin compatibility tests
    - `tests/ui/plain-tables.test.ts`: `EXAMPLE_COPY`, `FRIENDLY_LABELS`, `EXAMPLE_STORY_LABELS`, `PLAIN_STORY_LABELS`, `GREMLIN_LEGEND`, `PICKER_TEXT`, `STORY_ENDING` (5 entries), `SPAN_SENTENCE` (4 entries) entry by entry, failing on extra or missing keys; `FRIENDLY_LABELS` keys equal the union of the three fixtures' pin signals; `storyLabelsFor` gives {REQUEST} / {CLOSE, BEAM_CLEAR} / {PULSE}
    - `tests/ui/verdict-plain.test.ts`: `heldCardText` for N = 24 and N = 1, Fixed_Build and Buggy_Build, giving the 7.1 / 7.2 sentence then the exact HELD_Text; `plainCoverageParts` replaces only `NEVER_RULE_PART`; `gremlinLogSummary` 0 / 1 / 8 moves; `storyHeading()`, `reducedReplayNote(3, 8)` = "(reduced replay, 3 of 8 events)" and `originalRunNote(2, 1)` = "The original run had 2 gremlin moves; the story above uses only the 1 that matter, so lengths can differ." exact texts; `reductionSentence` for the three Examples and the budget singulars; `elapsedSecondsText` 0, 99, 700, 61,250 ms; `shrinkArrowText`
    - `tests/ui/gremlin-picker.test.ts`: per Example fixture masher, bouncer, stuck Compatible, dropout "Needs an input that is normally on", spike and drifter "Needs an analog input"; a test-local fixture with a digital `restState: "active"` input and an analog input makes all six Compatible
    - _Requirements: 5.2, 7.1, 7.2, 7.3, 7.6, 10.5, 13.1, 13.2, 13.7, 15.8, 15.9, 22.1, 22.3, 22.5, 22.6_

- [x] 4. Views and page wiring
  - [x] 4.1 Add the Details_Switch, header and panel texts
    - `views/details.ts`: `techOnly`, `plainOnly`, `applyDetails`, `readDetails`, `writeDetails` (both in `try`/`catch`), `signalLabel`
    - `views/panels.ts`: header switch (`<button role="switch" aria-checked>` "Show technical details"), "Runs in your browser" subtitle vs "ATmega328P · Browser only" chip, "What is this?" paragraph, three-step strip; "How many tries"; seed field "Seed (same number, same gremlins)" as Technical_Element; Reduction_Row sentences, "Reducing", Shrink_Label, tech-only counts with "→"; renames "Try the fixed program", "What changed in the code", "buggy → fixed"; no "->" outside Diff_Hunk lines; `UI_COPY` constants
    - `app.css`: `[hidden] { display: none !important; }`, 16 px Essential_Text, no fixed or max height and no scrolling inside Verdict_Cards
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4, 5.5, 12.1, 12.2, 12.4, 13.1, 13.2, 13.3, 13.4, 13.5, 13.8, 14.1, 14.2, 14.3, 14.4, 19.1, 19.2, 19.4, 19.5, 19.6_
  - [x] 4.2 Add the gallery, Rule_Area / Rule_Box and Gremlin_Picker views
    - `views/gallery.ts`: three Example_Cards with Card_Text, file problems listed per file
    - `views/rule-box.ts`: Rule_Headline topmost, tech-only Canonical_Sentence lines, "Edit rule", Rule_Box with Rule_Errors in order, Sentence_Pattern insert buttons, "Reset to the example rule"
    - `views/picker.ts`: 3 × 2 `<button aria-pressed>` tiles in catalogue order, amber border and selection mark when selected, disabled tiles with their reason, tech-only "Synthetic input ranges"
    - `app.css`: gallery, rule box and picker styles
    - _Requirements: 3.1, 3.8, 4.6, 4.7, 15.1, 15.2, 15.3, 15.5, 15.6, 15.7, 15.8, 18.1, 18.2, 18.7, 18.8, 18.9_
  - [x] 4.3 Update the verdict card, timeline and scene views
    - `views/verdict-card.ts`: plain BROKE sentence and run text, tech-only rule sentence, observed text, "<cycles> cycles", "Seed: <seed>"; HELD sentence then exact HELD_Text, tech-only plain Coverage_Line; COULDN'T TELL headline, reason list and hints; Gremlin_Log `<details>` inside the card, collapsed on appear, opened table grows the card (no overflow auto or scroll anywhere in the card); reduced moves list ("<time>: <phrase>", one line per Gremlin_Event of the Reduced_List, Plain_Story_Label full phrases and Ms_Text times, Rest_Events skipped) shown once a reduction result exists, nothing extra while reducing; Plain_Story before the tech-only "Exact story", under the Story_Card heading `storyHeading()` "What happened, replaying only the moves that matter" (both views) followed in the Technical_View by `reducedReplayNote(reducedEventCount, originalEventCount)` "(reduced replay, Y of X events)"; Gremlin_Legend lines
    - `views/timeline.ts`: while the toggle "Original run" is selected, `originalRunNote(X, Y)` "The original run had X gremlin moves; the story above uses only the Y that matter, so lengths can differ." under the Timeline in both views (X = Gremlin_Events of the original list, Y = of the Reduced_List); lanes from `exampleLanes` with `signalLabel`, Lane_Words, dotted release ranges, legend, plain and tech selected-event texts, Cursor limited to the Display_Window
    - `views/scene.ts` (ghost on the crossing or at the curb), new `views/scene-garage.ts` and `views/scene-heartbeat.ts` (original SVG, "Beam blocked", "Door position is illustrative", "20 ms deadline missed", "frozen", `SCENE_NOTE`)
    - `app.css`: scene and log styles
    - `docs/design-direction.md`: change the "Beam interrupted" line to "Beam blocked"
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 10.6, 10.7, 10.8, 11.11, 11.14, 11.15, 16.1, 16.4, 16.5, 16.6, 16.7, 17.2, 17.4, 17.5, 17.6, 17.7, 17.9, 17.10, 17.11, 17.12, 17.13, 17.14, 17.15, 17.16, 19.7_
  - [x] 4.4 Wire the App page
    - `views/app-page.ts`: `ExampleState`; crosswalk selected on load; Example selection resets state per 3.4, ignores re-selection and selection while busy; switch toggles only `hidden` and `aria-checked`, keeps focus and state, writes the Details_Key
    - Display_Replay after each violating Replay as `busy: "replay"`; `displayAgrees` decides Display_Span / Display_Window or the core fallback with error `kind` and `message`; fingerprints, "Replay again", "Try removing" and fixed-build texts keep using the Replay
    - `failureStory` with `storyLabelsFor(fixture)` and the span; Plain_Story with v and the Display_Span (none for count and hold)
    - Gates outside `FlowState`: `loaded.ok`, no Rule_Errors, non-empty Selected_Gremlin_Set ("Pick at least one gremlin."); Rule_Box read-only and its buttons disabled while busy; Campaign reads the Selected_Gremlin_Set, run count and seed; final elapsed text kept until the next Campaign or Example change
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 3.2, 3.4, 3.5, 3.6, 3.7, 6.6, 9.1, 9.6, 9.7, 9.8, 9.9, 9.10, 10.5, 11.12, 12.3, 12.5, 13.6, 14.5, 15.4, 15.10, 15.11, 15.12, 18.2, 18.5, 18.6, 18.9, 18.11, 18.12, 23.4, 23.5_
  - [x] 4.5 Write `tests/ui/copy-scan.test.ts`
    - Every nested string of `EXAMPLE_COPY`, `CUSTOM_COPY`, `FRIENDLY_LABELS`, `EXAMPLE_STORY_LABELS`, `PLAIN_STORY_LABELS`, `GREMLIN_LEGEND`, `PICKER_TEXT`, `STORY_ENDING`, `SPAN_SENTENCE`, `VERDICT_PLAIN`, `UI_COPY` checked with `wholeWordMatches` against `BANNED_WORDS`, its hyphen-less variants, `BOARD_BRAND_NAMES` and "safety"
    - meta.json `title` / `story` / `timingNote`, `rules.txt` and both `.ino` files of all three Examples; every file under `src/ui/app/` and `index.html` for "safety"
    - Counts 3 / 13 / 24 / 6 / 6 / 5 (`STORY_ENDING`) / 4 (`SPAN_SENTENCE`), the story heading, `reducedReplayNote` and `originalRunNote` texts of Requirement 11.20 to 11.22, each table non-empty, matches listed with table or file, key path or line and word, missing input fails with its name
    - _Requirements: 20.1, 20.3, 20.4, 20.5, 20.6, 20.7, 22.7_

- [x] 5. Final checkpoint - Global_Checks, report and stop for the user's browser check
  - Run once each: `npx vitest --run`, `npm run typecheck`, `npm run guard`, `npm run build`; report each command, result and counts; describe passing tests as evidence, not proof
  - Confirm no change under `src/engine/`, `examples/`, `fixtures/`, committed tests or baselines, `package.json` dependencies or `package-lock.json` (`git status` / `git diff --stat`); delete any temporary debug script
  - Report any rounded-number difference in the three pinned Plain_Story texts with the Reduced_List cycles; on any failure stop and report expected, actual and evidence
  - Stop and wait for the user's browser check from design.md "Browser checklist"; no headless browser
  - _Requirements: 11.19, 22.8, 22.10, 23.1, 23.2, 23.6, 23.7, 23.9_

## Notes

- Test sub-tasks are not marked optional: each one guards a stated value or behaviour that Requirements 21 and 22 require, and the set matches design.md's Testing Strategy exactly. No other tests are planned.
- The committed `tests/ui/ui-strings.test.ts` and `scripts/guard.mjs` cover the claim-word scan of `src/ui` code, comments and identifiers; `copy-scan.test.ts` adds the new tables, Example files and "safety".
- The browser check (Requirement 19 and the design checklist) is the user's; no task runs a headless browser.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4"] },
    { "id": 2, "tasks": ["1.5"] },
    { "id": 3, "tasks": ["3.1", "3.2", "3.3", "3.5"] },
    { "id": 4, "tasks": ["3.4", "4.1"] },
    { "id": 5, "tasks": ["4.2"] },
    { "id": 6, "tasks": ["4.3"] },
    { "id": 7, "tasks": ["4.4"] },
    { "id": 8, "tasks": ["4.5"] }
  ]
}
```
