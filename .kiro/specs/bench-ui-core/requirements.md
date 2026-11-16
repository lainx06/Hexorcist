# Requirements Document

## Introduction

bench-ui-core is the core of the Hexorcist web app. It runs the Crosswalk example end to end in the browser: the app opens on the Crosswalk buggy build, the user unleashes the gremlins, a verdict card shows the result, a BROKE result is reduced automatically with a visible shrink, and the reduced replay drives a crosswalk scene and a signal timeline that share one cursor. The user can then load the bundled fixed build, replay the counterexample on it, and rerun the same campaign. A separate speed page at `index.html#bench` measures engine throughput inside the browser Worker and compares results with the values pinned by the Node tests.

The engine in `src/engine/` does not change. All emulation runs in a Web Worker through the existing engine functions. The existing spike page (`src/ui/main.ts`, `src/ui/style.css`) stays unchanged and reachable. The visual design follows `docs/design-direction.md` (layout, palette, type, motion, verdict cards, scenes, timeline).

Facts checked in the workspace that constrain this feature:

- F1. `index.html` loads only `/src/ui/main.ts` today (title "Hexorcist (spike)"). The only committed test that touches `src/ui` is `src/engine/__tests__/ui-input-pullup.source.test.ts`, which reads the source text of `src/ui/main.ts` only. No committed test reads `index.html`. `main.ts` runs its setup in a `window` `DOMContentLoaded` listener.
- F2. `scripts/guard.mjs` scans `index.html`, every file under `src/ui`, `README.md` and `docs/` for the claim words as whole words (code, comments, identifiers, CSS and tests included), and scans `index.html` and `src/ui` for the brand word with no `guard-allow` escape. Lists of banned words and brand names therefore cannot live under `src/ui`. The determinism scans cover `src/engine` only, so the wall clock may be read in `src/ui` only.
- F3. `tsconfig.json` covers `src` without `src/**/__tests__/**`; `tsconfig.node.json` covers `scripts`, `bench`, `src/**/__tests__/**/*.ts`, `tests` and `src/vite-env.d.ts`. Vitest default include collects `tests/ui/*.test.ts` and handles `?raw` imports. No `vite.config` file exists. Vite 5 builds `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })` with defaults (worker format `iife`, so the worker code cannot use dynamic `import()`).
- F4. Node values pinned by committed tests: Crosswalk buggy campaign (seed 20261101, N 24, Run_Cycles 16,000,000, gremlin set `[{ id: "masher" }]`) gives BROKE with `violatingRunIndex` 3 (0-based), violation cycle 15,647,543 and 8 gremlin events. The reducer gives 8 -> 3 with `candidatesTried` 30 and fingerprint `47078989121ebc1d` (`traceFingerprint` of the `replayEventList` output edges with `maxStepCycles` 160,000 and `runCycles` 16,000,000). The reduced list replayed on the fixed build gives violation `null`. The Crosswalk fixed campaign gives `{ verdict: "HELD", text: heldText(24), runs: 24 }`. The Garage fixed campaign (seed 20261102, N 40, Run_Cycles 10,000,000, gremlin set bouncer + masher) gives `{ verdict: "HELD", text: heldText(40), runs: 40 }`. No fingerprint is pinned for the Garage fixed campaign.
- F5. The engine's `failureStory` accepts an optional `violationSpan { lengthCycles, cut }` from the caller and does not compute it. `violationSpan` in `tests/examples/examples-support.ts` gives, for the Crosswalk original campaign trace with v = 15,647,543 and edges from `replayRun` to M = 16,032,000, a span of 384,457 cycles, cut = yes.
- F6. `runSlice(k)` returns a `SliceProgress` whose `runs` holds a deep copy of every `RunResult`.
- F7. The Display_Margin of 32,000 cycles (2 ms) equals the Replay_End margin of `tests/examples`.
- F8. The Run_Path (`runEventList` in `src/engine/campaign.ts`, used by `replayEventList`) stops after the step in which a violation is found. A replay with a violation therefore ends at its Reached_End, which can be below Run_Cycles. `ReplayResult` holds `violation` and `outputEdges` only; `RunPathResult` from `runEventList` holds `endCycle`.

## Glossary

- **App**: the Hexorcist web application under `src/ui/app/`, served by `index.html` on every route except `#spike` and `#bench`.
- **Router**: the module `src/ui/app/boot.ts` that `index.html` loads; it picks the page from `location.hash`.
- **Spike_Page**: the existing page made of `src/ui/main.ts` and `src/ui/style.css`, reachable at `index.html#spike`.
- **Speed_Page**: the page at `index.html#bench`, rendered by the App code, that measures engine throughput in the Engine_Worker.
- **Engine**: the code under `src/engine/`. It is read-only for this feature.
- **Engine_Worker**: the Web Worker under `src/ui/app/worker/` that runs every campaign, reduction and replay of the App and the Speed_Page.
- **Worker_Host**: the functions under `src/ui/app/worker/` that call the Engine and return Compact_Data. They read no clock, touch no DOM or worker global, and can be imported and called directly in Node.
- **Worker_Entry**: the worker script under `src/ui/app/worker/` that receives Worker_Messages, calls the Worker_Host, reads the UI_Clock for the Speed_Page, and posts Worker_Messages back.
- **Worker_Message**: one message posted between the App and the Engine_Worker.
- **Message_Codec**: the pure encode and decode functions for Worker_Messages under `src/ui/app/worker/` or `src/ui/app/model/`.
- **Compact_Data**: plain JSON data made only of event lists, output edges, verdicts, violation data, counts, fingerprints, progress counters and texts. Compact_Data holds no `RunResult` array, no `SliceProgress.runs`, no typed array and no per-cycle array.
- **Counting_Factory**: a function in the Worker_Host that the Speed_Page passes to the Reducer as the `bridgeFactory` field of `ReducerOptions`. It calls `EmulatorBridge.create` with the arguments it received, returns that result unchanged, and keeps every returned bridge that is not a `BridgeError`. Because it lives in the Worker_Host, Node tests can call it directly.
- **Example_Data**: the Crosswalk files imported with Vite `?raw`: `buggy/buggy.hex`, `fixed/fixed.hex`, `fixture.json`, `rules.txt`, `meta.json`, `buggy/buggy.ino` and `fixed/fixed.ino` under `examples/crosswalk/`. For the Speed_Page, the same set of Garage files under `examples/garage/`.
- **Buggy_Build**: the Crosswalk HEX in `examples/crosswalk/buggy/buggy.hex`.
- **Fixed_Build**: the Crosswalk HEX in `examples/crosswalk/fixed/fixed.hex`.
- **Canonical_Sentence**: the rule sentence read from `rules.txt` by the Engine's `readRulesFile`, for Crosswalk "all of (CAR_GREEN is 1, WALK is 1) must never happen.".
- **Campaign**: one Engine campaign built with `buildCampaignConfig` and `createCampaign` and advanced with `runSlice`.
- **Run_Count**: the N of a Campaign; the meta.json default for Crosswalk is 24.
- **Campaign_Seed**: the seed of a Campaign; the meta.json default for Crosswalk is 20261101.
- **Run_Cycles**: `meta.runCycles` of the example (Crosswalk 16,000,000; Garage 10,000,000).
- **Run_Index**: the run index argument of the Engine's `runEventList`.
- **Verdict_Card**: the card that shows one Engine verdict: BROKE, HELD or COULDN'T TELL.
- **HELD_Text**: the string returned by the Engine's `heldText(n)`: "No violation found in N emulated runs of this gremlin set. Not a proof." ("1 emulated run" when N = 1).
- **Coverage_Line**: the line under the HELD_Text whose parts are the rule trigger parts, "Gremlin events: <count>", "Run length: <Ms_Text>" and "Seed: <seed>", joined with " · ".
- **Gremlin_Event**: an event-list entry whose `gremlinId` is not `"rest"`.
- **Rest_Event**: an event-list entry whose `gremlinId` is `"rest"`.
- **Reducer**: the Engine reducer created with `createReducer` and advanced with `step(k)`, with `onProgress` reports.
- **Reduced_List**: `ReducerResult.reducedList`, the smallest replay this reducer found, Rest_Events included.
- **Shrink_Label**: the exact text "The smallest replay this reducer found."
- **Minimality_Tooltip**: the exact text "1-minimal by deletion: removing any one of these events stops this failure."
- **Replay**: one call of the Engine's `runEventList` with Run_Index 0 and a checker that `compileRuleSet` compiles for that Replay alone, on a fresh bridge with the same HEX, the same fixture, the same rule set, an ordered event list, `runCycles` = Run_Cycles and `maxStepCycles` = 160,000 (the Engine default `DEFAULT_MAX_STEP_CYCLES`). No snapshot is used. Its violation and output edges equal those that `replayEventList` returns for the same inputs (Requirement 4.6), and its `endCycle` is the Reached_End.
- **Reached_End**: the `endCycle` that `runEventList` returns for a Replay, the bridge cycle count at which the Replay stopped (see F8).
- **Trace_Fingerprint**: the string returned by the Engine's `traceFingerprint` for the output edges of a Replay.
- **Pinned_Crosswalk_Fingerprint**: `47078989121ebc1d`.
- **Violation_Cycle**: the `cycle` of the violation reported by a Replay or a BROKE trace, written v.
- **Target_Rule**: the rule named in `trace.violation.rule` of the BROKE trace shown on the BROKE Verdict_Card.
- **Display_Margin**: 32,000 cycles (2 ms at 16 MHz).
- **Timeline_Window**: the cycle range from 0 to min(v + Display_Margin, Reached_End) of the Replay shown on the Timeline, both ends included.
- **Span_Helper**: the pure function under `src/ui/app/model/` that computes a violation span with the same rules as `violationSpan` in `tests/examples/examples-support.ts`.
- **Failure_Story**: the text returned by the Engine's `failureStory`.
- **Story_Labels**: the `labels` record passed to `failureStory`: for `REQUEST`, `active` "pressed the walk button", `inactive` "released the walk button", `held` "pressed and held the walk button".
- **Scene**: the original SVG crosswalk illustration driven by Replay output edges at the Cursor.
- **Timeline**: the signal view with one Lane per mapped fixture signal and one GREMLINS Lane.
- **Lane**: one horizontal row of the Timeline for one signal or for gremlin markers.
- **Cursor**: the single selected cycle shared by the Scene and every Lane.
- **Timeline_Event**: an entry of the Replay event list or an output edge inside the Timeline_Window, ordered by cycle.
- **Ms_Text**: the Engine's `msText(cycles)` formatting (tenths of a millisecond, for example "1000.0 ms").
- **Diff_Hunk**: one hunk of a line-based unified diff from `buggy.ino` to `fixed.ino` with 3 context lines.
- **Apply_Fix**: the flow started by the button "Load this example's bundled fixed .hex".
- **UI_Clock**: `performance.now()`, `requestAnimationFrame` timestamps and timers, used only in code under `src/ui/`.
- **Banned_Words**: the words in `BANNED_WORDS` of `src/engine/copy-rules.ts`, plus the unhyphenated spelling of the hyphenated entry, which the claim-word regex of `scripts/guard.mjs` also rejects.
- **Board_Brand_Names**: the words in `BOARD_BRAND_NAMES` of `tests/examples/examples-support.ts`.
- **UI_Strings_Scan**: the test under `tests/ui/` that checks user-visible strings for Banned_Words and Board_Brand_Names with `wholeWordMatches`.
- **Node_Acceptance_Test**: the test under `tests/ui/` that calls the Worker_Host functions directly in Node for Crosswalk.
- **Global_Checks**: `npx vitest --run`, `npm run typecheck`, `npm run guard` and `npm run build`.
- **Start_Commit**: the commit that was HEAD when this feature started, `05a3c96`.
- **Agent**: the implementer of this spec.

## Requirements

### Requirement 1: Routing and coexistence with the spike page

**User Story:** As a maintainer, I want the new app and the existing spike page to share `index.html`, so that nothing that already works breaks.

#### Acceptance Criteria

1. THE `index.html` file SHALL contain exactly one `<script>` element, and that element SHALL have `type="module"` and `src="/src/ui/app/boot.ts"`.
2. THE `index.html` file SHALL have a `<title>` element whose text is exactly "Hexorcist".
3. THE `index.html` file SHALL contain an element with id `app` in its body, because the Spike_Page setup in `src/ui/main.ts` throws an error when that element is missing.
4. WHEN `location.hash` equals `#spike` exactly, THE Router SHALL wait until the browser fires `DOMContentLoaded` on `window` before it starts the dynamic import of `../main.ts`.
5. WHEN the dynamic import of `../main.ts` resolves on the `#spike` route, THE Router SHALL dispatch exactly one `new Event('DOMContentLoaded')` on `window`, so that the `DOMContentLoaded` listener of `src/ui/main.ts` runs exactly once and the Spike_Page controls appear exactly once in the element with id `app`.
6. WHILE the route is `#spike`, THE Router SHALL load `src/ui/style.css` only through the `import './style.css'` inside `src/ui/main.ts` and SHALL load no stylesheet from `src/ui/app/`.
7. WHILE the route is `#spike`, THE Router SHALL render no App content and no Speed_Page content.
8. THE Router SHALL import neither `src/ui/main.ts` nor `src/ui/style.css` with a static `import` statement, so that neither file runs or loads on the `#bench` route or on any App route.
9. WHEN `location.hash` equals `#bench` exactly, THE Router SHALL render the Speed_Page and SHALL render no App content.
10. WHEN `location.hash` is any value other than exactly `#spike` or `#bench`, THE Router SHALL render the App. This includes the empty string, `#`, and case variants such as `#SPIKE` or `#Bench`.
11. WHEN a `hashchange` event fires on `window` on any route, THE Router SHALL reload the page once for that event and SHALL NOT replace the rendered page without a reload.
12. THE Agent SHALL leave `src/ui/main.ts` and `src/ui/style.css` byte-for-byte identical to their committed content from before this feature started, so that `src/engine/__tests__/ui-input-pullup.source.test.ts` passes without being modified.
13. THE Agent SHALL place every source file that this feature adds for the Router, the App, the Speed_Page, the Engine_Worker and the Message_Codec under `src/ui/app/`.

### Requirement 2: Example data

**User Story:** As a student, I want the Crosswalk example built into the page, so that I can try Hexorcist without compiling anything.

#### Acceptance Criteria

1. THE App SHALL import each of the seven Crosswalk Example_Data files (`buggy/buggy.hex`, `fixed/fixed.hex`, `fixture.json`, `rules.txt`, `meta.json`, `buggy/buggy.ino` and `fixed/fixed.ino` under `examples/crosswalk/`) with a Vite `?raw` import, so that each imported string equals the content of that file at build time.
2. WHILE the App is running in the browser, THE App SHALL make no network request for any Example_Data file.
3. WHEN the App loads, THE App SHALL pass the imported `rules.txt` text unchanged to the Engine's `readRulesFile` and SHALL use the returned `ruleSet` as the rule set, which for the bundled Crosswalk `rules.txt` holds exactly 1 rule, the rule of the Canonical_Sentence.
4. WHEN the App loads, THE App SHALL parse the imported `fixture.json` text and the imported `meta.json` text as JSON and SHALL use the results as the fixture and the meta data, which for the bundled Crosswalk `meta.json` give `runs` 24, `campaignSeed` 20261101, `runCycles` 16,000,000 and `gremlinSet` `[{ id: "masher" }]`.
5. IF `readRulesFile` returns `ok: false` for the imported `rules.txt` text, THEN THE App SHALL show every returned reason as plain text (markup characters such as `<` and `&` shown literally), one reason per line, in the returned order, with the Engine wording unchanged, SHALL show no Verdict_Card, SHALL keep the "Unleash gremlins" button disabled and SHALL start no Campaign.
6. IF the imported `fixture.json` text or the imported `meta.json` text does not parse as JSON, THEN THE App SHALL show, as plain text, the name of each file that failed with its parse error message, SHALL show no Verdict_Card, SHALL keep the "Unleash gremlins" button disabled and SHALL start no Campaign.
7. THE App SHALL send HEX text to the Engine_Worker only as the imported Buggy_Build text or the imported Fixed_Build text, unchanged.
8. THE App SHALL show no control that compiles source code, uploads a file, or accepts pasted or typed HEX text, and SHALL make no request to a compile server.

### Requirement 3: Opening state

**User Story:** As a student, I want the page to open ready to run, so that I can see a result with one click.

#### Acceptance Criteria

1. WHEN the App loads, THE App SHALL show exactly one example card, the Crosswalk card, labelled "Buggy example".
2. WHEN the App loads, THE App SHALL select the Buggy_Build as the HEX that the next Campaign uses.
3. WHEN the App loads, THE App SHALL show the Canonical_Sentence read from `rules.txt` character for character, which for Crosswalk is "all of (CAR_GREEN is 1, WALK is 1) must never happen.".
4. THE App SHALL show the Canonical_Sentence as text that the user cannot edit, in a font whose generic font family is monospace.
5. WHEN the App loads, THE App SHALL show one gremlin tile per entry of the meta.json `gremlinSet`, in `gremlinSet` order, which for Crosswalk is exactly one tile, for the gremlin `masher`.
6. THE App SHALL show on each gremlin tile the gremlin's display name from the gremlin table of `docs/design-direction.md` ("Masher" for `masher`), the icon art named by the `iconName` of that gremlin in `GREMLIN_CATALOGUE`, its behaviour label ("Presses the input again and again" for `masher`), its target signal (REQUEST for Crosswalk) and the default parameter ranges of that gremlin in `GREMLIN_CATALOGUE`.
7. WHEN the user activates a gremlin tile with pointer or keyboard, THE App SHALL leave the tile's appearance and the gremlin set of the next Campaign unchanged.
8. WHEN the App loads, THE App SHALL fill the Run_Count field with the meta.json `runs` value (24 for Crosswalk) and the Campaign_Seed field with the meta.json `campaignSeed` value (20261101 for Crosswalk).
9. THE App SHALL show exactly one primary button with the label "Unleash gremlins", spanning the full width of the campaign controls.
10. IF the Run_Count field text is empty, contains any character other than the digits 0 to 9, or denotes an integer below 1 or above 1000, THEN THE App SHALL disable the "Unleash gremlins" button and show the message "Runs must be a whole number from 1 to 1000.", independently of the Campaign_Seed field.
11. IF the Campaign_Seed field text is empty, contains any character other than the digits 0 to 9, or denotes an integer below 0 or above 4294967295, THEN THE App SHALL disable the "Unleash gremlins" button and show the message "Seed must be a whole number from 0 to 4294967295.", independently of the Run_Count field.
12. WHEN the text of the Run_Count field or the Campaign_Seed field changes to a value that criterion 10 or criterion 11 accepts, THE App SHALL remove that field's message.
13. WHILE no Campaign has finished since the App loaded, THE App SHALL reserve the verdict area at its full verdict-card size and show "Run a campaign to inspect the result." in it.
14. WHEN the user activates the enabled "Unleash gremlins" button, THE App SHALL start one Campaign in the Engine_Worker with the Buggy_Build text, the parsed fixture, the rule set from `readRulesFile`, the meta.json `gremlinSet` unchanged, the Run_Count field value as an integer, the Campaign_Seed field value as an integer and Run_Cycles (16,000,000 for Crosswalk).
15. WHILE a Campaign, a reduction or a Replay is running, THE App SHALL disable the "Unleash gremlins" button and the Apply_Fix button, so that activating either button starts nothing.
16. WHILE both fields hold values that criteria 10 and 11 accept, no Campaign, reduction or Replay is running, and Requirement 2.5/2.6 report no failure, THE App SHALL keep the "Unleash gremlins" button enabled.

### Requirement 4: Engine Worker

**User Story:** As a user, I want the emulation to run off the main thread, so that the page stays usable while gremlins run.

#### Acceptance Criteria

1. THE Engine_Worker SHALL run every Campaign of the App and the Speed_Page with `createCampaign` and `runSlice`.
2. THE App and the Speed_Page SHALL call `createCampaign`, `runSlice`, `createReducer`, `replayEventList` and `runEventList` only inside the Engine_Worker and never from a module that runs on the page's main thread.
3. THE Engine_Worker SHALL run every reduction with `createReducer`, advance it with `step(k)`, and receive its progress through the `onProgress` callback.
4. THE Engine_Worker SHALL run every Replay on a fresh bridge, with no snapshot, from the Replay's HEX, fixture and rule set, the ordered event list, `runCycles` equal to Run_Cycles and `maxStepCycles` 160,000.
5. THE Engine_Worker SHALL run every Replay with `runEventList` called with Run_Index 0 and a checker that `compileRuleSet` compiles for that Replay alone, so that the Reached_End (`endCycle`) of every Replay is available.
6. THE Worker_Host SHALL return, for every event list that `replayEventList` accepts, a `violation` (rule and cycle, or `null`) and an ordered list of output edges (signal, value and cycle) that are deep-equal to the `violation` and `outputEdges` that `replayEventList` returns for the same HEX, fixture, rule set, event list, Run_Cycles and `maxStepCycles` 160,000. The check SHALL include the Crosswalk Reduced_List replayed on the Buggy_Build, whose Trace_Fingerprint SHALL equal the Pinned_Crosswalk_Fingerprint `47078989121ebc1d`, and the same Reduced_List replayed on the Fixed_Build, whose violation SHALL be `null`.
7. WHEN a Replay ends without an error, THE Worker_Host SHALL return the Replay's Reached_End together with its violation and output edges, and the Reached_End SHALL equal the `endCycle` that `runEventList` returns for the same HEX, fixture, rule set, event list, Run_Cycles and `maxStepCycles` 160,000.
8. THE Worker_Entry SHALL post only Compact_Data in every Worker_Message.
9. WHEN `runSlice` returns a `SliceProgress` whose `finished` is `false`, THE Worker_Host SHALL reduce the `SliceProgress` to the counters `runsCompleted`, `total` and `finished`.
10. WHEN `runSlice` returns a `SliceProgress` whose `finished` is `true`, THE Worker_Host SHALL reduce the `SliceProgress` to the counters `runsCompleted`, `total` and `finished` plus a compact result that holds the verdict, the run index, the Coverage_Line counts and, for a BROKE verdict, the BROKE trace event list, output events and violation.
11. THE Worker_Host SHALL import Engine modules other than `src/engine/emulator-bridge.ts` only through their exported functions.
12. THE Worker_Host, the Worker_Entry and every other file under `src/ui/app/` SHALL contain no import of `avr8js`, so that `src/engine/emulator-bridge.ts` stays the only file under `src/` that imports `avr8js` (the isolation check of `scripts/guard.mjs`).
13. THE Worker_Host SHALL read no clock (`Date.now`, `performance.now`, `requestAnimationFrame`, `setTimeout`, `setInterval`) and use no random source (`Math.random`, `crypto.getRandomValues`).
14. THE Worker_Host SHALL make no network call (`fetch`, `XMLHttpRequest`, `WebSocket`).
15. THE Worker_Host SHALL reference no DOM or worker global (`window`, `document`, `self`, `postMessage`, `onmessage`), so that a Vitest test running in Node can import the Worker_Host modules and call the Worker_Host functions directly.
16. THE Worker_Entry and the Worker_Host SHALL contain no dynamic `import()` expression.
17. THE App SHALL create the Engine_Worker with `new Worker(new URL(<worker module>, import.meta.url), { type: 'module' })`, where `<worker module>` is the relative path of the Worker_Entry under `src/ui/app/worker/`.
18. FOR ALL inputs, THE Worker_Host SHALL return a verdict, BROKE trace, Reduced_List, counts, Trace_Fingerprint and Reached_End that are deep-equal to those the same Engine functions return when called directly in Node with the same inputs, slice size and step size.
19. IF an Engine function returns a `CampaignError`, `BridgeError` or `ReducerError`, THEN THE Worker_Host SHALL return an error result that holds the error's `kind` and `message` and holds no verdict.
20. WHEN the App receives an error result from the Engine_Worker, THE App SHALL show the error `kind` and `message` as error text outside every Verdict_Card and SHALL create no Verdict_Card from that error.
21. IF the Engine_Worker raises an `error` event, THEN THE App SHALL show "The engine worker stopped: " followed by the error message of that event.
22. IF the Engine_Worker raises an `error` event, THEN THE App SHALL enable the "Unleash gremlins" button.

### Requirement 5: Worker message codec

**User Story:** As a maintainer, I want typed, checked worker messages, so that a malformed message is caught instead of shown.

#### Acceptance Criteria

1. WHEN a Worker_Message of any kind posted between the App and the Engine_Worker is encoded, THE Message_Codec SHALL return a plain JSON value, built only from `null`, booleans, finite numbers, strings, arrays and plain objects, for which `JSON.parse(JSON.stringify(value))` is deep-equal to the value.
2. WHEN a Worker_Message is encoded, THE Message_Codec SHALL leave the input message unchanged and SHALL return deep-equal encoded values for deep-equal input messages.
3. WHEN a well-formed encoded Worker_Message is decoded, THE Message_Codec SHALL return the typed Worker_Message of the kind that the encoded value identifies.
4. FOR ALL valid Worker_Messages of every kind, THE Message_Codec SHALL decode the encoded message, and the result of `JSON.parse(JSON.stringify(...))` on the encoded message, each to a value deep-equal to the original message (round-trip property).
5. IF the value to decode is not a plain object, THEN THE Message_Codec SHALL return, without throwing, an error value indicating that the message as a whole is at fault.
6. IF the value to decode is a plain object whose field identifying the message kind is missing or names no Worker_Message kind, THEN THE Message_Codec SHALL return, without throwing, an error value that names that kind field.
7. IF the value to decode identifies a known Worker_Message kind and a required field of that kind is missing, holds a value of another type, or (for a cycle, count, run index or progress counter field) holds a value that is not a non-negative integer, THEN THE Message_Codec SHALL return, without throwing, an error value that names the field at fault by its path from the top level of the message.
8. THE Message_Codec SHALL return encoded Worker_Messages that hold, at any nesting depth, no field named `runs` that holds `RunResult` data, no `SliceProgress.runs` and no typed array.
9. WHEN the App receives a Worker_Message from the Engine_Worker, THE App SHALL decode it with the Message_Codec before using any of its fields.
10. IF the Message_Codec returns an error for a Worker_Message received by the App, THEN THE App SHALL show the error, including the name of the field at fault, as error text, SHALL show no Verdict_Card for that message, and SHALL leave any Verdict_Card already on screen unchanged.

### Requirement 6: Campaign progress

**User Story:** As a user, I want to see progress while the gremlins run, so that I know the page is working.

#### Acceptance Criteria

1. WHILE a Campaign is running, THE App SHALL show the text "Completed k / N runs", with k the `runsCompleted` of the latest progress report for that Campaign (0 before any report arrives) and N the Run_Count the Campaign was started with, both written as decimal integers with no digit grouping, and with the word "runs" for every N including 1.
2. WHEN the Engine_Worker reports progress for the running Campaign, THE App SHALL set k in "Completed k / N runs" to the reported `runsCompleted` and SHALL leave N unchanged, also when the Run_Count field has been edited since the Campaign started.
3. WHILE a Campaign is running, THE App SHALL show the text "Elapsed m:ss", measured with the UI_Clock from the moment the App started that Campaign, where s is the elapsed whole seconds rounded down, m = floor(s / 60) with no leading zero and ss = s mod 60 written with two digits (for example "Elapsed 0:00", "Elapsed 0:59", "Elapsed 1:00", "Elapsed 61:05"), and SHALL refresh that text at least once per second of UI_Clock time.
4. WHEN a Campaign finishes with a verdict, THE App SHALL stop the elapsed timer and SHALL keep the final "Elapsed m:ss" text and the final "Completed k / N runs" text, with k the final `runsCompleted` also when it is below N, on screen until the user starts another Campaign.
5. IF a Campaign ends with an Engine error (Requirement 4.19-4.20) or the Engine_Worker raises an `error` event (Requirement 4.21-4.22), THEN THE App SHALL stop the elapsed timer and SHALL keep the last "Elapsed m:ss" text and the last "Completed k / N runs" text on screen.
6. THE App SHALL show no text that estimates the remaining time, the finish time or the total duration of a Campaign, a reduction or a Replay, before, during or after it runs.
7. THE App SHALL show the words "Loading", "Replaying" and "Reducing" only as activity labels placed outside every Verdict_Card, never as a Verdict_Card title, and with no Verdict_Card left rail, border style or verdict icon.
8. WHILE a reduction is running, THE App SHALL show the activity label "Reducing".
9. WHILE a Replay is running, THE App SHALL show the activity label "Replaying".

### Requirement 7: Verdict card structure

**User Story:** As a user, I want each result shown the same way, so that I can read BROKE, HELD and COULDN'T TELL without learning three layouts.

#### Acceptance Criteria

1. THE Verdict_Card SHALL be built from the same four parts, title, finding, evidence scope and actions, for each of the verdicts BROKE, HELD and COULDN'T TELL, for Campaigns on the Buggy_Build and on the Fixed_Build.
2. THE Verdict_Card SHALL place the four parts in document order and in top-to-bottom visual order as title, then finding, then evidence scope, then actions.
3. THE Verdict_Card SHALL show as its title the Engine `verdict` string character for character, which is exactly "BROKE", "HELD" or "COULDN'T TELL" (with the ASCII apostrophe of the Engine constant `VERDICT_COULDNT_TELL`), with no added word, prefix, suffix or punctuation.
4. WHEN the Engine returns a verdict for a Campaign, THE App SHALL show the Verdict_Card of that verdict only, with no title, icon, border or placeholder of either of the other two verdicts for that Campaign.
5. WHILE a Campaign is running, THE App SHALL show no Verdict_Card for that Campaign.
6. IF a Campaign ends with a `CampaignError`, `BridgeError` or `ReducerError` instead of a verdict, THEN THE App SHALL show no Verdict_Card for that Campaign.
7. THE Verdict_Card SHALL differ, for every pair of the three verdicts, in title wording, in icon shape and in border style in addition to colour, so that each pair can be told apart in a greyscale rendering of the cards.
8. WHEN a Campaign finishes with a verdict, THE App SHALL write the verdict title followed by the finding of that Verdict_Card into an `aria-live="polite"` region exactly once, where the finding is the violated rule's Canonical_Sentence and observed values for BROKE (Requirement 8.1 and 8.2), the Engine verdict `text` for HELD (Requirement 9.1), and the reason lines for COULDN'T TELL (Requirement 10.1).
9. THE App SHALL keep the `aria-live="polite"` region of criterion 8 in the document from App load onward.

### Requirement 8: BROKE card

**User Story:** As a maker, I want the BROKE card to say what broke and where, so that I can find the bug.

#### Acceptance Criteria

1. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL show the violated rule's Canonical_Sentence, taken unchanged from `trace.violation.rule`.
2. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL show the observed values in the pattern "Observed at <Ms_Text of v>: <signal> = <level>, <signal> = <level>.", with one "<signal> = <level>" pair for each signal named by the violated rule, in the order the rule names them, and v the Violation_Cycle (Crosswalk: "Observed at <Ms_Text of v>: CAR_GREEN = 1, WALK = 1.").
3. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL take the level of each observed signal from the last output edge of that signal in `trace.outputEvents` with a cycle at or before the Violation_Cycle, using list order to pick between edges with equal cycles.
4. IF a signal named by the violated rule has no output edge in `trace.outputEvents` at or before the Violation_Cycle, or its last such edge has the value `"input"`, THEN THE Verdict_Card SHALL write "not driven" as the level of that signal.
5. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL show "run k of N", with k = `trace.runIndex` + 1 (1-based) and N the Run_Count of the Campaign that returned the verdict (Crosswalk Buggy_Build Campaign of F4: "run 4 of 24").
6. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL show the Campaign_Seed of the Campaign that returned the verdict (Crosswalk default: 20261101).
7. WHEN a Campaign finishes with a BROKE verdict, THE Verdict_Card SHALL show the trace that caused the verdict as a list with one row per entry of `trace.eventList`, Rest_Events included, in list order, each row holding the event cycle as Ms_Text, the signal, the value and the gremlin name (the event's `gremlinId`).
8. IF a BROKE verdict has an empty `trace.eventList`, THEN THE Verdict_Card SHALL show, in place of the event rows, a line stating that the trace holds no input events, and SHALL still show the content of criteria 1 to 6.
9. THE App SHALL show the trace list of criterion 7 on every BROKE Verdict_Card, including a BROKE verdict from the Fixed_Build rerun, and SHALL keep that list on screen while a reduction runs and after it ends.
10. WHEN a Campaign finishes with a BROKE verdict whose `unchecked` list is non-empty, THE Verdict_Card SHALL list each `unchecked` entry with its `rule` and its `reason`, in the order the Engine returns them.
11. THE BROKE Verdict_Card SHALL use the solid 4 px coral (#FF8A80) left rail of Requirement 20.30.
12. THE BROKE Verdict_Card SHALL show the broken-link icon.
13. THE BROKE Verdict_Card SHALL show its title in a larger font size than the finding text of the same card.
14. THE BROKE Verdict_Card SHALL show no warning banner.

### Requirement 9: HELD card and coverage line

**User Story:** As a teacher, I want HELD to state exactly what was tried, so that students do not read it as a proof.

#### Acceptance Criteria

1. WHEN a Campaign finishes with the verdict HELD, THE Verdict_Card SHALL show the verdict `text` exactly as returned by the Engine, character for character, which equals HELD_Text for the completed run count `runs` of that verdict (for the Crosswalk Fixed_Build Campaign with Run_Count 24: "No violation found in 24 emulated runs of this gremlin set. Not a proof.").
2. WHEN a Campaign finishes with the verdict HELD, THE Verdict_Card SHALL show both sentences of the HELD_Text in the same font size and the same non-bold font weight.
3. WHEN a Campaign finishes with the verdict HELD, THE Verdict_Card SHALL show the Coverage_Line directly under the HELD_Text, with no other element between them.
4. WHEN a Campaign finishes with the verdict HELD, THE Coverage_Line SHALL contain one part for each rule of the rule set that does not have the form `never`, in rule-set order, written "Rule trigger happened in R of N runs". In each part, R SHALL be the number of completed runs of that Campaign in which the Engine's `triggerOccurred` returned true for that rule, with each run counted at most once and 0 ≤ R ≤ N, and N SHALL be the `runs` value of the HELD verdict.
5. WHEN a Campaign finishes with the verdict HELD and a rule of the rule set has the form `never`, THE Coverage_Line SHALL write "Rule trigger: none, a never rule has no trigger" for that rule, in its rule-set position, in place of the "Rule trigger happened in R of N runs" part.
6. WHEN a Campaign finishes with the verdict HELD, THE Coverage_Line SHALL contain the part "Gremlin events: <count>", with <count> the gremlin event count written as a whole number in decimal digits. The count SHALL be the number of Gremlin_Events with a cycle below Run_Cycles, summed over the event lists of every completed run of that Campaign, with Rest_Events not counted.
7. WHEN a Campaign finishes with the verdict HELD, THE Coverage_Line SHALL contain the part "Run length: <Ms_Text of Run_Cycles>" ("Run length: 1000.0 ms" for Crosswalk).
8. WHEN a Campaign finishes with the verdict HELD, THE Coverage_Line SHALL contain the part "Seed: <seed>", with <seed> the Campaign_Seed that Campaign ran with, written as its decimal digits with no separators ("Seed: 20261101" for the Crosswalk default).
9. WHEN a Campaign finishes with the verdict HELD, THE Coverage_Line SHALL join its parts with " · " in this order: the rule trigger parts of criteria 4 and 5, the "Gremlin events: <count>" part, the "Run length: <Ms_Text>" part, the "Seed: <seed>" part.
10. THE HELD Verdict_Card SHALL use the 1 px solid #6F8777 outline of Requirement 20.32 and the small bounded-trace icon, with no coral (#FF8A80) and no lavender (#C4B5FD) left rail and no large bold title.
11. THE HELD Verdict_Card SHALL contain no checkmark, shield or seal icon, no celebratory fill (its background is the same surface colour as the BROKE and COULDN'T TELL Verdict_Cards) and no percentage (no "%" character and no word "percent" in any text of the card).
12. IF a Campaign finishes with the verdict BROKE or COULDN'T TELL, THEN THE App SHALL show no Coverage_Line.

### Requirement 10: COULDN'T TELL card

**User Story:** As a user, I want COULDN'T TELL to say why and what to try next, so that I can make the rule checkable.

#### Acceptance Criteria

1. WHEN the verdict is COULDN'T TELL, THE Verdict_Card SHALL split the Engine `reason` on "; " exactly and show each part on its own line, in the order the parts appear in `reason`.
2. IF a reason part contains "trigger never happened" (case-sensitive), THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: adjust the stimulus (other gremlins, more runs or a longer run) so the trigger can happen." on its own line under that part's line and above the next part's line.
3. IF a reason part contains "floating" (case-sensitive), THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: review the input configuration." on its own line under that part's line and above the next part's line.
4. IF a reason part starts with "Signals not mapped to a pin" (case-sensitive), THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: map these signals to pins in the fixture." on its own line under that part's line and above the next part's line.
5. IF a reason part starts with "Peripherals not supported" or contains "which this emulator setup does not model" (both case-sensitive), THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: this program uses hardware this emulator does not model; check this part on a board." on its own line under that part's line and above the next part's line.
6. IF a reason part starts with "Only " and ends with " runs completed" (both case-sensitive), THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: run the campaign again." on its own line under that part's line and above the next part's line.
7. IF a reason part is exactly "No gremlin produced an event in any run", THEN THE COULDN'T TELL Verdict_Card SHALL show the hint "Next step: pick gremlins that target this program's inputs." on its own line under that part's line and above the next part's line.
8. IF a reason part matches none of criteria 2 to 7, THEN THE COULDN'T TELL Verdict_Card SHALL show the part with no hint line under it.
9. THE COULDN'T TELL Verdict_Card SHALL use the dashed 4 px lavender (#C4B5FD) left rail of Requirement 20.31 and the open-bracket icon.
10. WHEN the verdict is COULDN'T TELL, THE Verdict_Card SHALL show the text of each part exactly as it appears in the Engine `reason`, character for character, with nothing added, removed or changed on the part line.
11. IF a reason part matches more than one of criteria 2 to 7, THEN THE COULDN'T TELL Verdict_Card SHALL show the hint of every matching criterion under that part, each on its own line, in criterion number order.
12. THE COULDN'T TELL Verdict_Card SHALL show no error triangle, SHALL use no #FF8A80, and SHALL use no colour that Requirement 20.12 does not allow.

### Requirement 11: Automatic reduction with shrink animation

**User Story:** As a maker, I want a BROKE trace cut down automatically, so that I see only the events that matter.

#### Acceptance Criteria

1. WHEN a Campaign on the Buggy_Build finishes with BROKE, THE App SHALL start one reduction in the Engine_Worker by calling `createReducer` with `hex` = the Buggy_Build text, `fixture` = the Crosswalk fixture, `ruleSet` = the rule set of the Campaign, `originalList` = `trace.eventList`, `violation` = `trace.violation`, `runCycles` = Run_Cycles and `maxStepCycles` = 160,000. The call SHALL pass no `budget` field, so the Engine default budget applies, as in the Node tests that pin F4.
2. WHILE a reduction is running, THE App SHALL show "X events -> Y events". X is the number of Gremlin_Events in `trace.eventList` (Crosswalk: 8). Y equals X until a `ProgressReport` arrives, then equals the `bestGremlinCount` of the latest `ProgressReport`. Each count is written "1 event" when it is 1 and "n events" for every other n, 0 included.
3. WHILE a reduction is running, THE App SHALL show "Candidates tried: k", with k = 0 until a `ProgressReport` arrives and then k = the `candidatesTried` of the latest `ProgressReport`.
4. WHEN a `ProgressReport` arrives whose `bestGremlinCount` is lower than the number of markers on the GREMLINS Lane, THE Timeline SHALL remove each marker that has no Gremlin_Event with the same `cycle`, `signal` and `gremlinId` in that report's `bestList`, so that the GREMLINS Lane then holds exactly one marker per Gremlin_Event of that `bestList`.
5. WHEN the reduction ends with a result, THE App SHALL replace the running counts with "X events -> Y events", with X = `originalEventCount` and Y = `reducedEventCount` of the `ReducerResult`, each count written as in criterion 2 (Crosswalk: "8 events -> 3 events").
6. WHEN the reduction ends with a result, THE App SHALL show the Shrink_Label "The smallest replay this reducer found." above the Timeline, next to the "X events -> Y events" text.
7. WHEN the reduction ends with a result whose `stoppedAtBudget` is false, THE App SHALL make the Shrink_Label reachable by keyboard focus, show the Minimality_Tooltip "1-minimal by deletion: removing any one of these events stops this failure." while the pointer hovers over the Shrink_Label or keyboard focus is on it, and expose the Minimality_Tooltip text as the accessible description of the Shrink_Label.
8. IF the reduction ends with a result whose `stoppedAtBudget` is true, THEN THE App SHALL show no Minimality_Tooltip and SHALL show "The reducer stopped at its budget; removing one event may still break the rule." next to the Shrink_Label.
9. WHEN the reduction ends with a result, THE App SHALL run one Replay of the Reduced_List on the Buggy_Build.
10. IF the reduction ends with an error (`createReducer` returns a `ReducerError`, `step` returns a `ReducerError`, or a `StepReport` has `ended` true and an `error` field), THEN THE App SHALL show the error `kind` and `message` as an error styled apart from every Verdict_Card, SHALL show no Shrink_Label and no Minimality_Tooltip, SHALL run no Replay of a Reduced_List, and SHALL keep the BROKE Verdict_Card with its full trace event list on screen.
11. WHEN the Replay of the Reduced_List from criterion 9 finishes, THE App SHALL select "Reduced replay" on the Timeline toggle and show the Timeline and the Scene from that Replay.
12. WHEN the reduction ends with a result, THE App SHALL show "Candidates tried: k" with k = the `candidatesTried` of the `ReducerResult` (Crosswalk: 30).
13. IF a Campaign on the Fixed_Build finishes with BROKE, THEN THE App SHALL start no reduction and SHALL keep the Shrink_Label, the counts and the Reduced_List of the Buggy_Build reduction unchanged.
14. WHEN a Campaign on the Buggy_Build finishes with BROKE, THE App SHALL run one Replay of `trace.eventList` on the Buggy_Build, the "Original run" Replay.
15. WHILE a reduction is running, THE Timeline and the Scene SHALL show the "Original run" Replay of criterion 14 with "Original run" selected, so that the markers that criterion 4 removes drop off the GREMLINS Lane of that Replay.
16. WHILE `prefers-reduced-motion: reduce` is not set, WHEN criterion 4 removes a marker from the GREMLINS Lane, THE Timeline SHALL fade that marker out by changing only its opacity, from its shown value to 0 over 160 ms, and then remove the marker. Under `prefers-reduced-motion: reduce`, Requirement 21.10 applies instead.

### Requirement 12: Failure story and violation span

**User Story:** As a student, I want a plain-English story of the failure, so that I understand the bug without reading signal data.

#### Acceptance Criteria

1. WHEN the Replay of the Reduced_List on the Buggy_Build finishes with a violation, THE App SHALL call `failureStory` once with the Reduced_List, the Crosswalk fixture, the Replay violation, the Replay output edges and the Story_Labels.
2. WHEN `failureStory` returns a string, THE App SHALL show that string unchanged, character for character, as the story text of the story card.
3. THE App SHALL pass the Story_Labels to `failureStory` under the key `REQUEST` with `active` "pressed the walk button", `inactive` "released the walk button" and `held` "pressed and held the walk button", each text exactly as written here.
4. WHEN the Replay of the Reduced_List finishes with a violation of a rule of form `never`, `notLongerThan` or `respond`, THE App SHALL call the Span_Helper with the rule of the rule set whose Canonical_Sentence equals the violation `rule`, v = the violation `cycle`, the Replay output edges and M = the Reached_End of that Replay.
5. WHEN the Span_Helper returns a span, THE App SHALL pass `violationSpan { lengthCycles, cut }` to `failureStory`, with `lengthCycles` = the span length (end − v) and `cut` = the `cut` value from the Span_Helper.
6. IF the violated rule has form `count` or `hold`, THEN THE App SHALL call `failureStory` with no `violationSpan` field and SHALL NOT call the Span_Helper.
7. WHEN the Span_Helper is given a rule of form `never`, `notLongerThan` or `respond`, an integer v, a list of output edges and an integer M, THE Span_Helper SHALL apply every edge with cycle ≤ v to the signal levels before it applies any later edge. It SHALL then apply the edges with v < cycle < M one cycle at a time, applying all edges of one cycle together. It SHALL return end = the lowest such cycle at which the end test holds, span length = end − v, and `cut` false. The end test is "the rule condition is false" for `never` and `notLongerThan`, and "the expect condition is true" for `respond`.
8. IF no edge cycle e with v < e < M passes the end test, THEN THE Span_Helper SHALL return end = M, span length = M − v, and `cut` true, and SHALL ignore every edge with cycle ≥ M.
9. WHEN the Span_Helper is given the Crosswalk original campaign trace with v = 15,647,543 and the output edges of `replayRun` to M = 16,032,000, THE Span_Helper SHALL return a span of 384,457 cycles with `cut` true.
10. FOR ALL rules, Violation_Cycles, edge lists and end cycles for which `violationSpan` of `tests/examples/examples-support.ts` returns a result, THE Span_Helper SHALL return the same span length and `cut` value as `violationSpan`, checked with one `fc.assert` that uses an integer-literal `seed` and an integer-literal `numRuns` of at least 100, as Requirement 25.7 states (model-based property).
11. IF `failureStory` returns a `ReducerError`, THEN THE App SHALL show the `ReducerError` `message` in the story card in place of the Failure_Story and SHALL keep the Timeline and Scene of that Replay on screen.

### Requirement 13: Crosswalk scene

**User Story:** As a student, I want to see the lights the firmware drives, so that the contradiction is obvious at a glance.

#### Acceptance Criteria

1. THE Scene SHALL be an SVG flat side view that contains exactly one road rectangle with five crossing bars, one curb, one car with a rounded body, a trapezoid cabin and two wheels, one traffic light with a housing, three circles and a pole, one WALK sign with a walking figure, one ghost with an oval cap, a two-lobed hem and dot eyes, and zero to two shrubs.
2. THE Scene SHALL be original SVG art written for the App, with no embedded raster image, no external image file, no third-party character, logo or name, and a ghost drawn only from the shapes listed in criterion 1.
3. WHEN the Cursor moves to a cycle c inside the Timeline_Window, or the shown Replay changes between "Original run" and "Reduced replay", THE Scene SHALL set the level of each of CAR_RED, CAR_YELLOW, CAR_GREEN and WALK from the output edges of the shown Replay only, using the edge of that signal with the greatest cycle at or below c. When two such edges have equal cycles, the later one in list order wins.
4. THE Scene SHALL map the top, middle and bottom traffic-light circles to CAR_RED, CAR_YELLOW and CAR_GREEN, and the walking figure to WALK. Each one SHALL be drawn lit when its signal's level at the Cursor is 1 and unlit when the level is 0 or "not driven".
5. THE Scene SHALL show the label "CAR_GREEN = <level>" beside the traffic light and the label "WALK = <level>" beside the WALK sign. <level> is "0", "1" or "not driven", as set by criteria 3 and 10.
6. WHILE the shown Replay has a Violation_Cycle v, the Cursor is at or after v, and the levels of CAR_GREEN and WALK at the Cursor are both 1, THE Scene SHALL show the labels "CAR_GREEN = 1" and "WALK = 1" joined by a coral (#FF8A80) bracket.
7. IF no Replay is shown, the shown Replay has no violation, the Cursor is before the Violation_Cycle, or the level of CAR_GREEN or WALK at the Cursor is not 1, THEN THE Scene SHALL show no coral bracket.
8. THE Scene SHALL show the exact text "Illustrative scene · firmware outputs shown" at every Cursor cycle, in both the "Original run" and "Reduced replay" views, and while no Replay is shown.
9. THE Scene SHALL draw the car at one fixed position, at the stop line outside the five crossing bars, for every Cursor cycle and every level, with the car shape overlapping neither the crossing bars nor the ghost, and SHALL draw no collision, impact or injury.
10. IF no Replay is shown, or a signal has no output edge at or before the Cursor, or that signal's edge chosen by criterion 3 has level `"input"`, THEN THE Scene SHALL write "not driven" as the level of that signal and draw its lamp or figure unlit.

### Requirement 14: Timeline model and lanes

**User Story:** As a maker, I want a signal timeline under the scene, so that I can read the exact order of events.

#### Acceptance Criteria

1. THE Timeline SHALL show exactly seven Lanes, ordered top to bottom as REQUEST, CAR_GREEN, CAR_YELLOW, CAR_RED, WALK, DONT_WALK, GREMLINS, and each Lane SHALL carry its signal name ("GREMLINS" for the gremlin Lane) as a text label.
2. THE Timeline SHALL draw each of the CAR_GREEN, CAR_YELLOW, CAR_RED, WALK and DONT_WALK Lanes as a step line whose level at every cycle c inside the Timeline_Window equals the timeline-model level of criterion 11 for that signal at c, changing only at output edge cycles with vertical transitions and no slope or smoothing.
3. THE Timeline SHALL draw an output level of `"input"` as a "not driven" state that looks different from both level 0 and level 1, and SHALL draw no level for a cycle at which criterion 11 gives no level.
4. THE Timeline SHALL draw the REQUEST Lane only from the Replay event list entries whose signal is REQUEST, Gremlin_Events and Rest_Events both included, using the level rule of criterion 11 applied to those entries, with value 0 or 1 drawn as that level and value `"release"` drawn as a "released" state that looks different from both level 0 and level 1.
5. THE Timeline SHALL draw exactly one amber (#F3C982) marker on the GREMLINS Lane for each Gremlin_Event whose cycle is inside the Timeline_Window, placed at that event's cycle and carrying the gremlin's mini icon or letter, and SHALL draw no GREMLINS Lane marker for a Rest_Event.
6. THE Timeline SHALL treat a cycle c as inside the Timeline_Window when c is an integer with 0 ≤ c ≤ min(v + 32,000, Reached_End), where v is the Violation_Cycle and Reached_End is the Reached_End of the Replay shown.
7. THE Timeline SHALL draw no signal level, edge, marker or hatched interval at any cycle greater than the Reached_End of the Replay.
8. THE Timeline SHALL draw exactly one coral violation marker, placed at the Violation_Cycle.
9. WHEN the Span_Helper returns a span with length L for the Replay shown, THE Timeline SHALL show a hatched interval from cycle v to cycle min(v + L, min(v + 32,000, Reached_End)).
10. THE Timeline SHALL write every time-axis label as the Ms_Text of the cycle at that label's position, and SHALL show no raw cycle number on the time axis.
11. FOR ALL lists of output edges (each with a signal, a value 0, 1 or `"input"`, and an integer cycle from 0 to 2^53 − 1), FOR ALL signals and FOR ALL integer Cursor cycles c from 0 to 2^53 − 1, THE timeline model SHALL give the Lane of that signal the value of the edge of that signal with the greatest cycle at or below c, take the edge that comes later in list order when two such edges share that cycle, and give no level when the signal has no edge with cycle at or below c (property-based).
12. FOR ALL Replay event lists and output edge lists, THE timeline model SHALL return the Timeline_Events as a list sorted by non-decreasing cycle, in which entries with equal cycles keep their order from their source list and every event list entry comes before every output edge that has the same cycle (property-based).
13. FOR ALL integers v and R with 0 ≤ v ≤ R ≤ 2^53 − 1 and FOR ALL event lists and output edge lists, THE timeline model SHALL give a window end of min(v + 32,000, R), and SHALL return a Timeline_Event list that contains exactly the event list entries and output edges whose cycle is from 0 to that window end inclusive, each once (property-based).
14. WHEN a Timeline_Event is selected, THE Timeline SHALL show as text the event's exact integer cycle written with the Engine's `cycleText`, its Ms_Text, its signal name and its value written as `0`, `1`, `release` or `input`.

### Requirement 15: Timeline playback and cursor

**User Story:** As a user, I want to step and play through the replay, so that I can watch the failure happen.

#### Acceptance Criteria

1. THE Timeline SHALL hold one Cursor, an integer cycle from 0 to the end of the Timeline_Window inclusive.
2. WHEN the Cursor moves, THE Scene and every Lane SHALL show the levels at the new Cursor cycle.
3. WHEN a Replay is shown on the Timeline, including after each change of the "Original run" / "Reduced replay" toggle, THE Timeline SHALL set the Cursor to the Violation_Cycle of that Replay and SHALL stay paused until the user activates play.
4. THE Timeline SHALL offer a play control, a pause control, a previous event control, a next event control, a 0.1x speed control and a 1x speed control, and SHALL mark which of 0.1x and 1x is selected.
5. WHEN the user activates play while the Cursor is below the end of the Timeline_Window, THE Timeline SHALL start advancing the Cursor from its current cycle at the selected speed.
6. WHEN the user activates pause, THE Timeline SHALL stop advancing the Cursor and keep the Cursor at its current cycle.
7. WHILE playing at 1x, THE Timeline SHALL set the Cursor to min(c0 + floor(16,000 × t), end of the Timeline_Window), with c0 the Cursor cycle at the latest play start (after any restart of criterion 26), speed change or user Cursor move, and t the UI_Clock milliseconds elapsed since that moment.
8. WHILE playing at 0.1x, THE Timeline SHALL set the Cursor to min(c0 + floor(1,600 × t), end of the Timeline_Window), with c0 and t defined as in criterion 7.
9. WHEN the user selects the 0.1x or 1x speed, THE Timeline SHALL keep the Cursor at its current cycle and keep the current play or pause state.
10. WHEN the Cursor reaches the end of the Timeline_Window during play, THE Timeline SHALL hold the Cursor at the end of the Timeline_Window and pause.
11. WHEN the user activates next event, THE Timeline SHALL move the Cursor to the cycle of the next Timeline_Event in the order of Requirement 14.12 and select that event. The next Timeline_Event is the entry after the selected Timeline_Event when one is selected, otherwise the earliest entry with a cycle above the Cursor.
12. WHEN the user activates previous event, THE Timeline SHALL move the Cursor to the cycle of the previous Timeline_Event in the order of Requirement 14.12 and select that event. The previous Timeline_Event is the entry before the selected Timeline_Event when one is selected, otherwise the latest entry with a cycle below the Cursor.
13. IF the user activates previous event or next event and no Timeline_Event exists in that direction, THEN THE Timeline SHALL keep the Cursor and the selection unchanged.
14. WHILE keyboard focus is inside the Timeline, WHEN the user presses Space, THE Timeline SHALL switch between play and pause exactly once per press and SHALL not scroll the page.
15. WHILE keyboard focus is inside the Timeline, WHEN the user presses Left Arrow or Right Arrow, THE Timeline SHALL give the same result as activating previous event or next event, respectively.
16. WHILE keyboard focus is inside the Timeline, WHEN the user presses Home, THE Timeline SHALL set the Cursor to cycle 0.
17. WHILE keyboard focus is inside the Timeline, WHEN the user presses End, THE Timeline SHALL set the Cursor to the Violation_Cycle of the shown Replay.
18. THE Timeline SHALL use the UI_Clock only to compute Cursor moves during play, and SHALL change no Replay event list, output edge, verdict, Violation_Cycle, Trace_Fingerprint or event cycle.
19. THE Timeline SHALL offer a toggle with the two options "Original run" and "Reduced replay".
20. WHEN "Original run" is selected, THE Timeline and the Scene SHALL show a Replay of the BROKE `trace.eventList` on the Buggy_Build.
21. WHEN "Reduced replay" is selected, THE Timeline and the Scene SHALL show the Replay of the Reduced_List on the Buggy_Build.
22. WHEN the reduction ends with a result, THE Timeline SHALL select "Reduced replay".
23. IF no Reduced_List exists because the reduction is still running or ended with an error, THEN THE Timeline SHALL show "Original run" and SHALL disable the "Reduced replay" option.
24. THE Timeline SHALL show the label of the selected option, "Original run" or "Reduced replay", above the Lanes.
25. WHEN the App loads, THE Timeline SHALL select the 1x speed.
26. WHILE the Cursor is at the end of the Timeline_Window, WHEN the user activates play, THE Timeline SHALL set the Cursor to cycle 0 and start advancing the Cursor from cycle 0 at the selected speed.

### Requirement 16: Apply fix

**User Story:** As a student, I want to load the fixed build and test it the same way, so that I can see whether the fix holds up.

#### Acceptance Criteria

1. WHEN a reduction ends with a `ReducerResult` and not with an error, THE App SHALL show the button "Load this example's bundled fixed .hex".
2. WHEN the user activates the Apply_Fix button, THE App SHALL show every Diff_Hunk from `buggy.ino` to `fixed.ino`, with 3 context lines, under the heading "Sketch source". Each line SHALL be marked as context, removed or added.
3. THE "Sketch source" section SHALL show the sketch names with no file name extension, so the string ".ino" appears nowhere in that section.
4. WHEN the "Sketch source" section shows the Crosswalk Example_Data, THE App SHALL show exactly 2 Diff_Hunks: Hunk A covers old lines 1 to 4 and new lines 1 to 4; it removes `// crosswalk, buggy build`, adds `// crosswalk, fixed build`, and has no context lines before its changed lines and 3 context lines after them. Hunk B covers old lines 78 to 85 and new lines 78 to 83; it removes `  } else if (pressed && crossing) {` and `    walkStart = now;  // a new press restarts the walk countdown`, adds no line, and has 3 context lines before and 3 after.
5. FOR ALL pairs of texts (old, new), where each text is split into lines at every "\n", applying the Diff_Hunks of the diff model to old SHALL give a string equal to new, character for character (round-trip property).
6. FOR ALL pairs of texts (old, new), the context lines and removed lines of each Diff_Hunk, kept in hunk order, SHALL equal the old-text lines of that hunk's old range. Its context lines and added lines, kept in hunk order, SHALL equal the new-text lines of its new range.
7. FOR ALL pairs of texts (old, new), each Diff_Hunk SHALL begin with exactly min(3, b) context lines and end with exactly min(3, a) context lines. Here b counts the unchanged old-text lines between the hunk's earliest changed line and the preceding changed line or the start of the text. a counts the unchanged old-text lines between the hunk's latest changed line and the next changed line or the end of the text.
8. FOR ALL pairs of texts (old, new), the Diff_Hunks SHALL meet all of these: each hunk holds at least 1 removed or added line; hunks appear in ascending order of old-text position and do not overlap; each run of unchanged lines inside a hunk holds at most 6 lines; each run of unchanged lines between two consecutive hunks holds more than 6 lines; equal texts give zero hunks.
9. WHEN the user activates the Apply_Fix button, THE App SHALL run a Replay of the Reduced_List on the Fixed_Build.
10. WHEN the Fixed_Build Replay finishes with violation `null`, THE App SHALL show "The reduced replay does not break the rule on the fixed build." For the Crosswalk defaults in F4 (seed 20261101, N 24, gremlin set `[{ id: "masher" }]`), the App SHALL show this text.
11. WHEN the Fixed_Build Replay finishes with a violation of the rule named in `trace.violation.rule` of the BROKE trace, THE App SHALL show "The reduced replay still breaks the rule on the fixed build."
12. WHEN the Fixed_Build Replay finishes with a violation of a rule other than the one named in `trace.violation.rule` of the BROKE trace, THE App SHALL show "The reduced replay breaks a different rule on the fixed build: " followed by that other rule's Canonical_Sentence.
13. WHEN the Fixed_Build Replay finishes without an error, THE App SHALL start a Campaign in the Engine_Worker on the Fixed_Build. The Campaign SHALL use the fixture, the rule set, Run_Cycles, the same gremlin set as the BROKE Campaign (the meta.json `gremlinSet`), and the Campaign_Seed and Run_Count values that the BROKE Campaign used, even if the user has edited the fields since.
14. WHEN the Fixed_Build Campaign finishes with a verdict, THE App SHALL show the Fixed_Build Verdict_Card in the verdict area as the element right after the BROKE Verdict_Card.
15. WHEN the Fixed_Build Verdict_Card is shown, THE App SHALL label the BROKE Verdict_Card "Buggy build" and the Fixed_Build Verdict_Card "Fixed build".
16. WHEN the Fixed_Build Verdict_Card is shown, THE App SHALL keep the BROKE Verdict_Card on screen with its title, finding and trace events unchanged.
17. THE App SHALL show the Fixed_Build verdict exactly as the Engine returns it, whichever of BROKE, HELD and COULDN'T TELL it is, using the card rules of Requirements 7 to 10. For the Crosswalk defaults in F4, the card SHALL be HELD with the text "No violation found in 24 emulated runs of this gremlin set. Not a proof."
18. IF the Fixed_Build Campaign verdict is BROKE, THEN THE App SHALL list that trace's events as Requirement 8.7 says and SHALL start no reduction for it.
19. IF the Fixed_Build Replay ends with a `CampaignError`, `BridgeError` or `ReducerError`, THEN THE App SHALL show the error `kind` and `message` as Requirement 4.20 says, keep the BROKE Verdict_Card on screen, and start no Fixed_Build Campaign.
20. IF the Fixed_Build Campaign ends with a `CampaignError`, `BridgeError` or `ReducerError`, THEN THE App SHALL show the error `kind` and `message` as Requirement 4.20 says, in place of the Fixed_Build Verdict_Card, and keep the BROKE Verdict_Card on screen.
21. WHEN the Apply_Fix flow ends (with a Fixed_Build verdict, or with an error of criterion 19 or 20), THE App SHALL keep the Apply_Fix button disabled until the user starts the next Campaign on the Buggy_Build.
22. THE App SHALL use the "Sketch source" diff as the description of the change and SHALL identify the Fixed_Build on screen by the label "Fixed build".

### Requirement 17: Replay again

**User Story:** As a skeptic, I want to replay the reduced trace again, so that I can see it gives the same outputs.

#### Acceptance Criteria

1. WHEN a reduction has ended with a result, THE App SHALL show a "Replay again" button.
2. WHILE a Campaign, a reduction or a Replay is running, or while no Replay of the Reduced_List on the Buggy_Build has finished without an error, THE App SHALL disable the "Replay again" button.
3. WHEN the user activates "Replay again", THE App SHALL run exactly one new Replay of the Reduced_List on the Buggy_Build on a fresh bridge, with the same fixture, rule set, Run_Cycles and `maxStepCycles` 160,000 as every other Replay, and with no snapshot.
4. WHEN the new Replay finishes without an error, THE App SHALL show its Trace_Fingerprint next to the "Replay again" button as the full string returned by `traceFingerprint`, not shortened.
5. WHEN the new Replay finishes without an error, THE App SHALL show "matches" next to the Trace_Fingerprint if the Trace_Fingerprint equals the Trace_Fingerprint of the previous Replay, and "differs" otherwise. The previous Replay is the most recent earlier Replay of the Reduced_List on the Buggy_Build that finished without an error: either the Replay started by Requirement 11.9 or an earlier "Replay again" Replay. It is never a Fixed_Build Replay, a "Try removing" Replay or an "Original run" Replay.
6. WHEN a "Replay again" Replay finishes for the Reduced_List of the Crosswalk Campaign with Campaign_Seed 20261101 and Run_Count 24, THE App SHALL show the Pinned_Crosswalk_Fingerprint `47078989121ebc1d` and "matches".
7. WHEN a "Replay again" Replay finishes, THE App SHALL leave the Timeline, the Scene, the Cursor and the selected toggle option unchanged.

### Requirement 18: Try removing

**User Story:** As a student, I want to remove one event and replay, so that I can see why each event is needed.

#### Acceptance Criteria

1. WHEN a reduction has ended with a result, THE App SHALL list every event of the Reduced_List in list order, each with its cycle as Ms_Text, its signal and its value.
2. WHEN a reduction has ended with a result, THE App SHALL give each Gremlin_Event of the list exactly one button with the text "Try removing".
3. WHEN a reduction has ended with a result, THE App SHALL label each Rest_Event of the list "rest state" and SHALL give it no "Try removing" button.
4. WHEN the user activates "Try removing" on a Gremlin_Event, THE App SHALL run exactly one Replay on the Buggy_Build whose event list is the Reduced_List without that one event, with every other event kept in list order with unchanged cycle, signal and value, and SHALL leave the Reduced_List, the Shrink_Label, the Timeline and the Scene unchanged.
5. WHEN that Replay finishes with a violation of the Target_Rule, THE App SHALL show "Without this event the rule still breaks." next to that event, replacing any earlier result shown for that event.
6. WHEN that Replay finishes with violation `null` or with a violation of a rule other than the Target_Rule, THE App SHALL show "Without this event the rule does not break." next to that event, replacing any earlier result shown for that event.
7. WHILE a Campaign, a reduction or a Replay is running, THE App SHALL disable every "Try removing" button.
8. IF that Replay ends with an Engine error, THEN THE App SHALL show the error `kind` and `message` next to that event instead of either result text, and SHALL keep the Reduced_List and the results already shown for other events unchanged.

### Requirement 19: Speed page

**User Story:** As a maintainer, I want to measure the engine in the browser and compare it with Node, so that I know the browser gives the same results.

#### Acceptance Criteria

1. WHEN `location.hash` is `#bench` at page load, THE Router SHALL show the Speed_Page from `index.html`, and the build SHALL contain no HTML entry file other than `index.html`.
2. WHEN the user activates the "Run speed check" button, THE Speed_Page SHALL run the Garage fixed Campaign in the Engine_Worker with the Garage Example_Data meta.json values (seed 20261102, N 40, Run_Cycles 10,000,000, gremlin set bouncer + masher).
3. WHEN the user activates the "Run speed check" button, THE Speed_Page SHALL run three steps in the Engine_Worker in this order: the Crosswalk buggy Campaign with the meta.json values (seed 20261101, N 24, Run_Cycles 16,000,000, gremlin set `[{ id: "masher" }]`), then the reduction of that Campaign's BROKE `trace.eventList`, then a Replay of the Reduced_List.
4. WHEN a Campaign of the Speed_Page finishes, THE Speed_Page SHALL show three values for that Campaign: total cycles as the sum of `endCycle` over its runs, seconds as the UI_Clock difference read in the Worker_Entry between just before `createCampaign` and just after the `runSlice` call that completes the last run, and cycles per second as total cycles divided by seconds.
5. WHEN the Speed_Page starts the Crosswalk reduction, THE Speed_Page SHALL pass the Reducer a Counting_Factory as the `bridgeFactory` field of `ReducerOptions` (`src/engine/reducer/reducer.ts`). The Counting_Factory calls `EmulatorBridge.create` with the arguments it received, returns that result unchanged, and keeps every returned value that is not a `BridgeError`.
6. WHEN the Crosswalk Replay finishes, THE Speed_Page SHALL show its Trace_Fingerprint next to the Pinned_Crosswalk_Fingerprint `47078989121ebc1d`, with "matches" when the two strings are equal and "differs" otherwise.
7. WHEN the Garage Campaign finishes, THE Speed_Page SHALL compare its verdict with the Node-pinned result `{ verdict: "HELD", text: "No violation found in 40 emulated runs of this gremlin set. Not a proof.", runs: 40 }`, show "matches" when the two are deep-equal and "differs" otherwise, and show no Trace_Fingerprint comparison for Garage.
8. THE Speed_Page SHALL label its numbers "Local performance information".
9. THE App and the Speed_Page SHALL read the wall clock only in code under `src/ui/`.
10. WHEN the Crosswalk reduction ends with a result, THE Speed_Page SHALL show four values for the reduction: total cycles as the sum of `cycleCount` over every bridge the Counting_Factory kept, seconds as the UI_Clock difference read in the Worker_Entry between just before `createReducer` and just after the `step` call whose report has `ended` true, cycles per second as total cycles divided by seconds, and `candidatesTried`.
11. THE App SHALL pass no `bridgeFactory` option to `createReducer`, `buildCampaignConfig` or any other Engine function. The Speed_Page SHALL pass one only to the Crosswalk reduction.
12. WHEN the Node_Acceptance_Test runs the Worker_Host Crosswalk reduction once with the Counting_Factory and once without it, THE two `ReducerResult` values SHALL have deep-equal `originalEventCount`, `reducedEventCount`, `reducedList` and `candidatesTried` (8, 3 and 30 for the counts, per F4).
13. IF a Speed_Page step returns an error or the Crosswalk Campaign does not end with the verdict BROKE, THEN THE Speed_Page SHALL show the error `kind` and `message` (or the verdict) for that step, SHALL show "differs" for the comparison of that step, and SHALL run no later step that depends on that step.

### Requirement 20: Visual design

**User Story:** As a user, I want a calm, readable signal lab, so that the evidence stands out.

#### Acceptance Criteria

1. WHILE the viewport is wider than 430 px, THE App SHALL lay out a configuration column 360 px wide on the left and an evidence column on the right that fills the remaining workspace width.
2. WHILE the viewport is wider than 430 px, THE App SHALL use 32 px outer page padding and a 24 px gap between the configuration column and the evidence column.
3. THE App SHALL limit the workspace width to at most 1,760 px.
4. THE App SHALL show a header with the wordmark "Hexorcist", the one-line explanation "Flashing AI-written firmware? Let the gremlins break it before your board does." and the text "ATmega328P · Browser only".
5. THE App SHALL place the regions of the evidence column in this order from top to bottom: the verdict area (the BROKE Verdict_Card, followed by the Fixed_Build Verdict_Card when it is shown), the story card, the Scene with the replay controls, the reduction counter ("X events -> Y events" and "Candidates tried: k") with the Shrink_Label, the Timeline, the "Try removing" list, and the "Sketch source" diff. Only the reduction counter with the Shrink_Label SHALL sit between the Scene and the Timeline.
6. THE App SHALL render the Scene region with a larger area (width times height in CSS px) than any other region of the evidence column.
7. THE App SHALL use #0B100F as the page background, #121B18 as the panel background and #1B2923 as the raised surface background.
8. THE App SHALL use #EDF4EF for primary text and #A5B5AA for secondary text.
9. THE App SHALL use #99F5AC for signal activity and as the background of the "Unleash gremlins" button, with #0B100F as the colour of the button label.
10. THE App SHALL use #FF8A80 as the BROKE accent, #C4B5FD as the COULDN'T TELL accent, #F3C982 for gremlin events and selection, and #6F8777 for control outlines.
11. THE App SHALL use #6F8777 for no text.
12. THE App SHALL use in its CSS and SVG no colour other than the palette colours of criteria 7 to 10, those colours with an alpha channel, `transparent`, `currentColor` and `none`.
13. THE App SHALL set prose and controls in the system UI sans-serif font.
14. THE App SHALL set signal names, seeds, timestamps and Canonical_Sentences in the system monospace font.
15. THE App SHALL declare no `@font-face` rule and SHALL request no font file.
16. THE App SHALL set the BROKE and COULDN'T TELL verdict titles at 36 px bold, and at 28 px bold while the viewport is at most 430 px wide.
17. THE App SHALL set the HELD verdict title at the same sizes as criterion 16 in ordinary weight (400), as Requirement 9.10 requires.
18. THE App SHALL set the page title at 28 px, and at 24 px while the viewport is at most 430 px wide.
19. THE App SHALL set region titles at 18 px semibold (600).
20. THE App SHALL set body text at 16 px with line height 1.5, and chips and meta text at 14 px with line height 1.4.
21. THE Timeline SHALL set its values in the system monospace font at 14 px to 16 px inclusive, with tabular numerals.
22. THE App SHALL give every margin, padding and gap a value of 0 or of one step of the scale 4, 8, 12, 16, 24, 32 and 48 px.
23. THE App SHALL use 24 px panel padding, and 16 px panel padding while the viewport is at most 430 px wide.
24. THE App SHALL use a corner radius of 10 px on panels and 6 px on controls.
25. WHEN the pointer enters or leaves a control, THE App SHALL run any hover transition with a duration from 120 ms to 160 ms inclusive.
26. WHEN a disclosure element opens or closes, THE App SHALL run its transition with a duration of 180 ms.
27. WHEN a BROKE Verdict_Card is shown, THE App SHALL play one emphasis animation on that card: one opacity ramp of 400 ms in one direction, with one iteration. The animation SHALL move or rotate no element and SHALL change no other property, with no flashing and no shake.
28. THE App SHALL render the Scene area and the Timeline area before any Campaign at the same width and height they have when a Replay is shown.
29. WHEN a Campaign progress count or a reduction progress count updates, THE App SHALL change the position and size of no region.
30. WHEN the verdict is BROKE, THE Verdict_Card SHALL show a solid 4 px left rail in #FF8A80 and no border on its top, right or bottom side.
31. WHEN the verdict is COULDN'T TELL, THE Verdict_Card SHALL show a dashed 4 px left rail in #C4B5FD and no border on its top, right or bottom side.
32. WHEN the verdict is HELD, THE Verdict_Card SHALL show a 1 px solid #6F8777 outline on all four sides, no left rail, and no #99F5AC fill or text.
33. THE App SHALL draw all art as original inline SVG or CSS written in this repository and SHALL load no image file, icon font or SVG file from outside the repository.
34. THE App SHALL draw each gremlin icon on a 32 x 32 grid (SVG `viewBox` 0 0 32 32) with 2 px strokes and two eyes.
35. THE App SHALL apply no animation or transition to a gremlin icon unless the user is interacting with it.
36. THE App SHALL use no new npm package.

### Requirement 21: Accessibility

**User Story:** As a keyboard or screen-reader user, I want to use every part of the app, so that I get the same evidence as everyone else.

#### Acceptance Criteria

1. THE App and the Speed_Page SHALL let the user move keyboard focus to and away from each enabled control with Tab and Shift+Tab alone. The controls are: the "Unleash gremlins" button, the Run_Count field, the Campaign_Seed field, the Apply_Fix button, the "Replay again" button, every "Try removing" button, the "View result" button, the play, pause, previous event, next event, 0.1x and 1x controls, the "Original run" and "Reduced replay" toggle, the Timeline, the Shrink_Label while it carries the Minimality_Tooltip, and the "Run speed check" button.
2. THE App SHALL move keyboard focus on Tab through the regions in the order header and cards, rule, gremlins, controls, verdict area, story card, scene, reduction counter, timeline, "Try removing" list, at every viewport width from 360 px upward.
3. WHEN a focused button or toggle receives Enter or Space, THE App and the Speed_Page SHALL perform the same action as a pointer click on that control.
4. WHEN an element receives keyboard focus, THE App and the Speed_Page SHALL draw a focus indicator around that element that is at least 2 CSS px thick, has a contrast ratio of at least 3:1 against the adjacent background, and is not fully covered by other content.
5. THE App and the Speed_Page SHALL give each control of criterion 1, and every other element that responds to a pointer click, a target area of at least 44 by 44 CSS px at every viewport width from 360 px upward.
6. THE App SHALL give each control that shows no visible text label an accessible name that states its action, and SHALL give every other control an accessible name that contains its visible label text.
7. THE Timeline and the Scene SHALL present the selected Timeline_Event text (Requirement 14.14), the run label (Requirement 15.24) and the signal level labels (Requirements 13.5 and 13.10) as text that assistive technology can read. These texts SHALL NOT exist only as drawn SVG shapes.
8. WHILE `prefers-reduced-motion: reduce` is set, THE App SHALL run every CSS transition and CSS animation with a duration of 0 ms. This includes the hover and disclosure transitions of Requirement 20.25 and 20.26. THE App SHALL also apply the setting when it changes while the page is open, without a reload.
9. WHILE `prefers-reduced-motion: reduce` is set, THE App SHALL omit the violation emphasis of Requirement 20.27 and show the BROKE Verdict_Card directly in its final state.
10. WHILE `prefers-reduced-motion: reduce` is set, WHEN a progress report removes markers from the GREMLINS Lane (Requirement 11.4), THE Timeline SHALL remove each marker in one step with no fade, slide or other movement.
11. WHILE `prefers-reduced-motion: reduce` is set, THE Timeline SHALL move the Cursor only in response to a user action on play, previous event, next event or a Timeline key of Requirement 15.14-15.17. For previous event, next event, Home and End, THE Timeline SHALL move the Cursor in one step and keep the previous event and next event controls shown and operable. THE Timeline SHALL keep the play control shown and operable, and play SHALL advance the Cursor only after the user activates play.
12. THE App SHALL distinguish the three Verdict_Cards by title wording, icon shape and border style (Requirement 7.7), so that each card in a greyscale rendering of the page can be told apart by its title and icon.
13. THE Timeline SHALL mark the violation marker, the Gremlin_Event markers, the hatched violation span and the selected Timeline_Event each with a distinct shape or pattern, so that each can be told apart in a greyscale rendering of the page.
14. THE App and the Speed_Page SHALL state each check result as its exact text, never by colour alone. The check results are: "matches" and "differs" (Requirements 17.5, 19.6, 19.7 and 19.13), the Fixed_Build Replay texts (Requirements 16.10 to 16.12) and the "Try removing" texts (Requirements 18.5 and 18.6).
15. WHEN the App loads, THE App SHALL contain one `aria-live="polite"` region, and that region SHALL be empty.
16. WHEN a Campaign starts, THE App SHALL announce through the `aria-live="polite"` region a message that names the build ("Buggy build" or "Fixed build") and the Run_Count.
17. WHEN a Campaign finishes with a verdict, THE App SHALL announce through the `aria-live="polite"` region the build label, the verdict title and the finding of the Verdict_Card.
18. WHEN a reduction ends with a result, THE App SHALL announce through the `aria-live="polite"` region the final "X events -> Y events" text and the Shrink_Label.
19. IF a reduction ends with an error, THEN THE App SHALL announce through the `aria-live="polite"` region the error `kind` and `message`.
20. THE App SHALL keep "Completed k / N runs", "Elapsed m:ss", "Candidates tried: k", the in-progress "X events -> Y events" text and every Cursor position outside every element with `aria-live` "polite" or "assertive" and outside every element with role `status`, `alert` or `log`. As a result, one Crosswalk buggy Campaign with the meta.json defaults followed by its reduction SHALL change the text of the `aria-live="polite"` region exactly 3 times.
21. THE App and the Speed_Page SHALL give all text a contrast ratio of at least 4.5:1 against its background, measured with the WCAG 2 contrast formula. This includes labels of disabled controls, Scene and Timeline labels, and text over tints and overlays.

### Requirement 22: Narrow screens

**User Story:** As a phone user, I want the app to fit a narrow screen, so that I can try it anywhere.

#### Acceptance Criteria

1. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE App SHALL keep 16 CSS px of padding between the left and right viewport edges and the page content.
2. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE App SHALL stack the regions in one column, in this order from top to bottom and in the same order in the document: header with the Crosswalk card, rule, gremlin tiles, campaign controls, verdict area (with the BROKE Verdict_Card and, when shown, the Fixed_Build Verdict_Card), story card, Scene, reduction counter with the Shrink_Label, Timeline, "Try removing" list, "Sketch source" diff. The top edge of each region SHALL sit below the bottom edge of the region before it.
3. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE App SHALL lay out the gremlin tiles in a grid of 2 equal-width columns filled left to right, so that the single Masher gremlin tile takes the left column.
4. WHILE the viewport width is from 360 to 430 CSS px inclusive, WHEN a Campaign finishes with a verdict, THE App SHALL show a "View result" button in the campaign controls region, directly below the "Completed k / N runs" progress text.
5. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE Timeline SHALL keep the Lane label column fully visible at the same horizontal position while the user scrolls the plot horizontally inside the Timeline region. The column includes the GREMLINS Lane label.
6. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE App SHALL keep the document scroll width equal to the viewport width, with no horizontal page scroll, in the opening state, after the reduced Replay is shown, and after the Fixed_Build Verdict_Card is shown.
7. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE App SHALL change the page scroll position only in response to user input (a scroll gesture, a key press or activating a control), including when a Campaign, a reduction or a Replay finishes.
8. WHILE the viewport width is from 360 to 430 CSS px inclusive, WHEN the user activates "View result", THE App SHALL scroll the page so that the title of the Verdict_Card of the most recently finished Campaign is fully inside the viewport, and SHALL move keyboard focus to that Verdict_Card.
9. WHILE the viewport width is from 360 to 430 CSS px inclusive, THE Timeline SHALL show the previous event button, the next event button and the selected event text of Requirement 14.14 outside the horizontally scrolling plot, so that all three stay visible at every plot scroll position.

### Requirement 23: Copy rules and UI strings scan

**User Story:** As the product owner, I want the copy to stay plain and free of claims and brand names, so that the app never promises what it cannot show.

#### Acceptance Criteria

1. THE App SHALL contain no Banned_Word in any file under `src/ui/app/`, including code, comments, identifiers, string literals and CSS, where a Banned_Word occurrence is any match that `wholeWordMatches` reports for the Banned_Words list (ASCII letter case ignored, each side of the match being the text edge or a character that is not an ASCII letter or digit).
2. THE App SHALL contain no Board_Brand_Name in any file under `src/ui/app/` or in `index.html`, where a Board_Brand_Name occurrence is any match that `wholeWordMatches` reports for `BOARD_BRAND_NAMES`.
3. THE App SHALL contain no occurrence of the substring `guard-allow` in any file under `src/ui/app/`.
4. THE UI_Strings_Scan SHALL be a Vitest test file under `tests/ui/` that imports `BANNED_WORDS` from `src/engine/copy-rules.ts` and imports `BOARD_BRAND_NAMES` and `wholeWordMatches` from `tests/examples/examples-support.ts`.
5. THE UI_Strings_Scan SHALL build the Banned_Words list from `BANNED_WORDS` plus each hyphenated `BANNED_WORDS` entry with its hyphen removed, and SHALL contain no word list of its own.
6. THE UI_Strings_Scan SHALL read as UTF-8 text every file under `src/ui/app/`, including files in subfolders, together with `index.html`, and SHALL check each of them against criteria 1, 2, 3 and 7, checking `index.html` for Banned_Words and Board_Brand_Names.
7. THE App SHALL name the chip only as the exact, case-sensitive string "ATmega328P", so that every occurrence of the letters "atmega" in any letter case in a file under `src/ui/app/` begins the string "ATmega328P".
8. THE UI_Strings_Scan SHALL check for Banned_Words and Board_Brand_Names these Example_Data texts that the App displays: the `title`, `story` and `timingNote` string fields of `examples/crosswalk/meta.json`, the full text of `examples/crosswalk/rules.txt`, and the full text of `examples/crosswalk/buggy/buggy.ino` and `examples/crosswalk/fixed/fixed.ino`.
9. IF the UI_Strings_Scan finds one or more matches, THEN THE UI_Strings_Scan SHALL fail and report every match with its workspace-relative file path (or meta.json field name), its 1-based line and the list word that matched.
10. IF no file exists under `src/ui/app/`, `index.html` is missing, any file named in criterion 8 is missing, or any meta.json field named in criterion 8 is not a string, THEN THE UI_Strings_Scan SHALL fail and report which input is missing.

### Requirement 24: Node-side acceptance test

**User Story:** As a maintainer, I want the worker logic tested in Node against the pinned values, so that the browser path is held to the same numbers.

#### Acceptance Criteria

1. THE Node_Acceptance_Test SHALL be one Vitest file matching `tests/ui/*.test.ts` that runs in Node under `npx vitest --run`, with no Web Worker, no DOM and no browser.
2. THE Node_Acceptance_Test SHALL import and call the same exported Worker_Host functions that the Worker_Entry calls, with no copy, wrapper or reimplementation of Worker_Host logic inside the test.
3. THE Node_Acceptance_Test SHALL build every Campaign from the Crosswalk Example_Data and the meta.json defaults: Campaign_Seed 20261101, Run_Count 24, Run_Cycles 16,000,000 and gremlin set `[{ id: "masher" }]`.
4. WHEN the Node_Acceptance_Test runs the Crosswalk Buggy_Build Campaign through the Worker_Host, THE Worker_Host SHALL return the verdict BROKE with its trace.
5. WHEN the Node_Acceptance_Test passes that BROKE result and Run_Count 24 to the BROKE card text model (the verdict card text logic of Requirement 25.1), THE BROKE card text model SHALL give the text "run 4 of 24" and the seed 20261101.
6. WHEN the Node_Acceptance_Test runs the reduction of the BROKE trace's event list on the Buggy_Build through the Worker_Host, THE Worker_Host SHALL return `originalEventCount` 8 and `reducedEventCount` 3.
7. WHEN the Node_Acceptance_Test runs the Replay of the Reduced_List on the Buggy_Build through the Worker_Host with `runCycles` 16,000,000 and `maxStepCycles` 160,000, THE Worker_Host SHALL return the Trace_Fingerprint `47078989121ebc1d`.
8. WHEN the Node_Acceptance_Test runs the Replay of the Reduced_List on the Fixed_Build through the Worker_Host with `runCycles` 16,000,000 and `maxStepCycles` 160,000, THE Worker_Host SHALL return violation `null`, so the reduced replay does not break the fixed build.
9. WHEN the Node_Acceptance_Test runs the Fixed_Build Campaign through the Worker_Host with Campaign_Seed 20261101, Run_Count 24 and gremlin set `[{ id: "masher" }]`, THE Worker_Host SHALL return the verdict HELD with a text exactly equal to "No violation found in 24 emulated runs of this gremlin set. Not a proof."
10. THE Node_Acceptance_Test SHALL advance every Campaign with `runSlice(1)` and every reduction with `step(1)`, the slice size and step size the Engine_Worker uses in the browser.
11. THE Node_Acceptance_Test SHALL pass every Worker_Host result through the Message_Codec encode and decode functions and SHALL check criteria 4 to 9 against the decoded values.
12. IF a Worker_Host call returns an error, or a value checked in criteria 4 to 9 differs from the value stated there, THEN THE Node_Acceptance_Test SHALL fail and report the expected value and the actual value.
13. IF the Node_Acceptance_Test fails on a value from criteria 4 to 9, THEN THE Agent SHALL stop, report the expected value, the actual value and the evidence, and leave the test and its expected values unchanged.
14. THE Node_Acceptance_Test SHALL run against the committed Engine, with no file under `src/engine/` changed.

### Requirement 25: Pure model tests

**User Story:** As a maintainer, I want the UI logic in pure modules with tests, so that it can be checked without a browser.

#### Acceptance Criteria

1. THE App SHALL keep the timeline model, verdict card text, Coverage_Line, Story_Labels, Diff_Hunk, Message_Codec and Span_Helper logic in pure modules under `src/ui/app/model/` or `src/ui/app/worker/`, each of which meets criterion 6.
2. THE test suite SHALL include new Vitest files named `*.test.ts` under `tests/ui/`. Each file SHALL import the pure module it tests and run under `npx vitest --run` in the Vitest default Node environment with no DOM library. There SHALL be at least one file for each of these checks: the timeline model checks Requirements 14.11 to 14.13; the verdict card text is checked as in criterion 4; the Coverage_Line checks Requirements 9.4 to 9.9; the Story_Labels pass-through is checked as in criterion 3; the Diff_Hunk checks Requirements 16.4 to 16.8; the Message_Codec checks Requirements 5.2 to 5.8 with every Worker_Message kind generated; the Span_Helper checks Requirements 12.9 and 12.10.
3. THE Story_Labels test SHALL check that the `failureStory` input built by the App's pure model has a `labels` record deep-equal to the Story_Labels: for `REQUEST`, `active` "pressed the walk button", `inactive` "released the walk button" and `held` "pressed and held the walk button", with no other signal key and no other text.
4. THE verdict card text test SHALL check that the title is exactly "BROKE", "HELD" or "COULDN'T TELL" for the matching Engine verdict. It SHALL also check that the HELD text equals both the Engine's `heldText(n)` and the literal "No violation found in 1 emulated run of this gremlin set. Not a proof." for N = 1, and "No violation found in 24 emulated runs of this gremlin set. Not a proof." for N = 24.
5. WHEN the Agent reports the results of the tests of this requirement, THE Agent SHALL describe each result only as "pass" or "fail" and as evidence, and SHALL not describe a passing result as proof of correctness.
6. THE pure modules of criterion 1 SHALL contain no reference to `document`, `window`, `self`, `postMessage`, `navigator`, `fetch`, `performance`, `requestAnimationFrame`, `setTimeout`, `setInterval`, `Date` or `Math.random`. They SHALL import only from `src/engine/` and from other pure modules of criterion 1.
7. THE tests of this requirement SHALL check each "FOR ALL" criterion named in criterion 2 with one `fc.assert` from the existing `fast-check` 4.10.2 devDependency. Each `fc.assert` SHALL use an integer-literal `seed` and an integer-literal `numRuns` of at least 100, and the tests SHALL add no npm package.
8. IF a test of this requirement fails and making it pass would need a change to an assertion, an expected value, a `seed`, a `numRuns`, a `skip`, `only` or `todo` marker, or an Engine file, THEN THE Agent SHALL stop, leave the test unchanged, and report what the test expects, what happened and the evidence (command, exit code, output lines and file:line).

### Requirement 26: Global checks and unchanged files

**User Story:** As a maintainer, I want every existing check to stay green and every committed file to stay as it is, so that the feature adds without breaking.

#### Acceptance Criteria

1. WHEN the Agent has made the last file change of the feature and before the Agent reports the feature done, THE Global_Checks SHALL each exit with code 0 when run from the workspace root on that working tree.
2. THE Agent SHALL leave the working tree so that `git diff HEAD --name-status` and `git status --porcelain --untracked-files=all`, compared against the Start_Commit, list no added, modified, deleted or renamed path under `src/engine/` (Engine source, committed Engine tests and `src/engine/__tests__/baselines/`), `fixtures/` or `examples/`, and no modified, deleted or renamed file that was tracked under `tests/` at that commit.
3. IF the Agent adds a `vite.config.*` file at the workspace root, THEN THE Agent SHALL record in design.md the list of test file paths that `npx vitest --run` collects without the file and the list it collects with the file, and the two lists SHALL be identical.
4. THE Agent SHALL leave the `dependencies` and `devDependencies` entries of `package.json` and the whole of `package-lock.json` identical to the Start_Commit.
5. WHERE the Agent writes a temporary script, THE Agent SHALL name the script `scripts/tmp-<name>.ts`.
6. WHEN the Agent reports the task done, THE Agent SHALL have deleted every temporary script, so that no file matching `scripts/tmp-*` exists and `git status --porcelain --untracked-files=all` lists none.
7. THE source files under `src/ui/app/` SHALL contain no `Math.random` and no `crypto.getRandomValues`.
8. WHEN the App or the Speed_Page starts a Campaign, THE App SHALL pass the Campaign_Seed to `buildCampaignConfig` as the only input that sets the Campaign's randomness, so that the Engine's seeded PRNG is the only random source.
9. THE App SHALL take every verdict, Violation_Cycle, Reached_End and Coverage_Line run length from integer CPU cycle values returned by the Engine, and the modules under `src/ui/app/model/` and the Worker_Host SHALL contain no reference to `Date`, `performance.now`, `requestAnimationFrame`, `setTimeout` or `setInterval`.
10. THE source files under `src/ui/app/` SHALL contain no call of `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`, so that no Campaign, reduction or Replay sends a network request.
11. THE Agent SHALL run no `git commit`, `git push`, `git reset`, `git checkout` or `git stash` during the feature, so that the Start_Commit stays the reference for criteria 2 and 4.

### Requirement 27: Stop conditions

**User Story:** As the product owner, I want the agent to stop and report instead of working around a blocker, so that I make the call.

#### Acceptance Criteria

1. IF `npm run guard` reports a finding that the Agent cannot remove by changing only files added by this feature, without adding a `guard-allow` marker, THEN THE Agent SHALL stop work on the feature, report the file, the line and the word or check the guard reported, and wait for the product owner's decision.
2. IF a requirement of this document can be met only by changing a file under `src/engine/`, THEN THE Agent SHALL stop work on the feature, report the requirement number, the Engine function and the change needed, leave every Engine file unchanged, and wait for the product owner's decision.
3. IF a requirement of this document can be met only by changing `src/ui/main.ts`, `src/ui/style.css` or a committed test file, THEN THE Agent SHALL stop work on the feature, report the file and the reason, leave the file unchanged, and wait for the product owner's decision.
4. IF a value observed in Node by the Node_Acceptance_Test or by another test under `tests/ui/` differs from the acceptance value it is checked against, THEN THE Agent SHALL stop work on the feature, report the expected value, the actual value and the evidence (test name, command run and the output that shows the actual value), leave the test and the acceptance value unchanged, and wait for the product owner's decision.
5. IF a check against an acceptance value needs a value that this document does not give, THEN THE Agent SHALL stop work on the feature, report the missing value and the criterion that needs it, choose or estimate no value for it, and wait for the product owner's decision.
6. THE Agent SHALL treat only these values as acceptance values: the violation span values of Requirement 12.9 (384,457 cycles, `cut` true); the pinned comparisons of Requirement 19.6 and 19.7 (the Pinned_Crosswalk_Fingerprint `47078989121ebc1d` and the Garage verdict `{ verdict: "HELD", text: "No violation found in 40 emulated runs of this gremlin set. Not a proof.", runs: 40 }`); and the values of Requirement 24.4 to 24.9.
7. IF a value that is not an acceptance value is needed and this document does not give it, THEN THE Agent SHALL pick the most conservative option, list the value and the reason for it under "Choices I made", and continue work without stopping.
8. IF a test written from an acceptance criterion of this document and the system disagree, THEN THE Agent SHALL stop work on the feature, report what the test expects, what actually happened and the evidence, leave the test unchanged, and wait for the product owner's decision.

## Choices I made

These are non-acceptance values and behaviours that the request did not fix. Each is the most conservative option I found. None of them changes an acceptance value.

1. Routing (F1): `index.html` loads `src/ui/app/boot.ts`; `#spike` runs the spike through a dynamic import plus one synthetic `DOMContentLoaded`; `#bench` shows the Speed_Page; every other hash shows the App; `hashchange` reloads the page; `style.css` loads only on `#spike`; the title becomes "Hexorcist". The Router is not inside the Engine_Worker, so its dynamic import does not conflict with the `iife` worker format.
2. Garage on the Speed_Page (F4): no Garage fingerprint is pinned, so the Speed_Page compares the Garage verdict with the Node-pinned HELD result and compares a fingerprint for the Crosswalk reduction only.
3. Speed_Page reduction cycles: the Reducer reports no emulated cycle count. On the Speed_Page only, the reduction gets a counting bridgeFactory (the existing ReducerOptions field). It calls EmulatorBridge.create with the same arguments, returns its result unchanged and keeps each bridge that is not a BridgeError. After the reduction ends, total cycles is the sum of cycleCount over those bridges. The App never passes a bridgeFactory. Requirement 19.12 checks in Node that the counting factory does not change the reduction result.
4. The Speed_Page runs on a "Run speed check" button press, not on page load.
5. Scope (F8): the gallery shows only the Crosswalk card labelled "Buggy example". There is no "Load .hex" upload, no rule editing, no gremlin picking and no capability panel. Garage appears only on the Speed_Page; Heartbeat does not appear.
6. Field bounds (F8): Run_Count integer 1 to 1000, Campaign_Seed integer 0 to 4294967295; invalid input disables the button with a plain message.
7. Slice and step sizes: the Engine_Worker calls `runSlice(1)` per progress message and `step(1)` per reducer message, so every run and every candidate is reported. Requirement 24.10 makes the Node_Acceptance_Test use the same sizes, so a size effect on results would show up there.
8. Reached_End (F8): the Run_Path stops after the step in which a violation is found, so a violating Replay does not run to Run_Cycles. This corrects the assumption in the brief that the Replay always reaches Run_Cycles. The App uses the Reached_End as M for the Span_Helper and as the upper bound of the Timeline_Window, so it never draws or claims cycles it did not emulate. `ReplayResult` does not hold the Reached_End, so every Replay calls `runEventList` (Run_Index 0, a fresh checker from `compileRuleSet`) and takes the Reached_End from its `endCycle`. This needs no Engine change. Requirement 4.6 checks that the violation and output edges equal those of `replayEventList`. The Reached_End can sit slightly above Run_Cycles because the bridge can overshoot the last step; Requirement 4.7 sets no upper bound.
9. Timeline_Window: the end is min(v + 32,000, Reached_End). With the BROKE trace values this is at most 15,679,543, below Run_Cycles.
10. Original run view: the "Original run" toggle shows a fresh Replay of `trace.eventList`, so both views come from the same Replay function and both have a Reached_End. That Replay runs when the Buggy_Build Campaign ends BROKE (Requirement 11.14), and the Timeline shows it while the reduction runs, with markers dropping off (Requirement 11.15). After the reduction ends, the toggle defaults to "Reduced replay".
11. Observed values on the BROKE card: each signal the violated rule names, with its level at v, written "Observed at <Ms_Text of v>: CAR_GREEN = 1, WALK = 1." in that pattern.
12. "Always show the trace" for BROKE: every BROKE Verdict_Card, including a BROKE on the Fixed_Build rerun, lists its trace events. A Fixed_Build BROKE is not reduced automatically.
13. Coverage_Line wording: "Rule trigger happened in R of N runs" per rule, with R from the Engine's `triggerOccurred`; a `never` rule gets "Rule trigger: none, a never rule has no trigger" because `triggerOccurred` returns false for `never` rules by design. The gremlin event count uses the `gremlinCoverage` definition of `tests/examples` (Gremlin_Events with cycle below Run_Cycles). The other parts are labelled "Gremlin events: <count>", "Run length: <Ms_Text>" (Crosswalk: "Run length: 1000.0 ms") and "Seed: <seed>". Parts are joined with " · ".
14. COULDN'T TELL hints: the hint texts and the matching substrings in Requirement 10 come from the Engine reason wording in `src/engine/verdict.ts`, `src/engine/peripherals.ts` and `src/engine/rules/rule-checker.ts` (lines 127-128, the "was read while floating" reasons) and from the two examples in `docs/design-direction.md`. The Engine cuts a reason at 200 characters, so a cut part can lose the text a hint matches and show no hint; that is accepted.
15. Budget case: when `stoppedAtBudget` is true, the Minimality_Tooltip is not shown, because the 1-minimal claim does not hold then.
16. Apply_Fix diff: the Crosswalk sketches differ in the header comment line and in the `else if` branch, so the diff has more than one hunk. The App shows every hunk.
17. Fixed_Build Replay wording for a violation of a rule other than the Target_Rule (Requirement 16.12).
18. Try removing is offered on Gremlin_Events only, matching the Reducer's 1-minimality, which skips Rest_Events.
19. REQUEST Lane: a `"release"` value is drawn as a distinct "released" state rather than as level 1, because the pulled-up level is modelled by the bridge and not reported as an output edge.
20. Scene levels: a signal with no edge at or before the Cursor, or with level `"input"`, reads "not driven". The car stays at the stop line outside the crossing.
21. Playback rates: 1x = 16,000 cycles per UI_Clock ms, 0.1x = 1,600 cycles per UI_Clock ms. The 1x speed is selected when the App loads. Playback starts paused at the Violation_Cycle. Activating play while the Cursor is at the end of the Timeline_Window restarts the Cursor from cycle 0.
22. Keyboard map on the focused Timeline: Space play and pause, Left and Right Arrow previous and next event, Home cycle 0, End Violation_Cycle.
23. Previous and next event step through the event list entries and output edges inside the Timeline_Window, ordered by cycle.
24. Elapsed time format "Elapsed m:ss"; the timer stops when the Campaign finishes.
25. Live announcements: Campaign start, each verdict and the end of a reduction; no per-run ticks.
26. Header explanation line: the product pitch "Flashing AI-written firmware? Let the gremlins break it before your board does."
27. Gremlin tile behaviour label for Masher: "Presses the input again and again". The tile also shows the target signal (REQUEST, the only digital input of the fixture) and the catalogue default parameter ranges from `GREMLIN_CATALOGUE`.
28. "X events -> Y events" uses the ASCII arrow "->" as written in the brief, with "1 event" for a count of 1.
29. Worker crash text: "The engine worker stopped: " followed by the error message.
30. Contrast floor of 4.5:1 for all text (Requirement 21.21), the WCAG AA level; every palette text colour in the design guide meets it.
31. The `.config.kiro` uses the specId given by the workflow, which equals the specId of `.kiro/specs/trace-reducer/.config.kiro`.
32. Gremlin display name: "Masher", taken from the gremlin table in `docs/design-direction.md`, because `GREMLIN_CATALOGUE` holds only `id` and `iconName` (Requirement 3.6).
33. Shrink animation: each removed GREMLINS marker fades out over 160 ms, opacity only (Requirement 11.16). Under reduced motion the marker is removed in one step (Requirement 21.10).
34. Timeline model details: the Timeline_Window includes both ends; at equal cycles, event-list entries come before output edges; the selected cycle is written with the Engine's `cycleText` (comma groups) (Requirements 14.6, 14.12 and 14.14).
35. Apply_Fix: a Fixed_Build Replay error starts no Fixed_Build Campaign (Requirement 16.19). The Apply_Fix button stays disabled after its flow has run, until the next Campaign on the Buggy_Build (Requirement 16.21). The "Sketch source" diff is the short description of the change, and the build identity shown is the label "Fixed build" (Requirement 16.22).
36. "Replay again" changes no Timeline, Scene, Cursor or toggle state (Requirement 17.7); it only adds the fingerprint and the "matches" or "differs" text.
37. Speed_Page errors: a failed step shows its error `kind` and `message` (or the unexpected verdict), its comparison shows "differs", and steps that depend on it do not run (Requirement 19.13). The Garage Campaign does not depend on the Crosswalk steps.
38. BROKE emphasis: one opacity ramp of 400 ms with one iteration (Requirement 20.27).
39. Reduced motion: the Speed_Page is covered by Requirement 21 as written. Play stays available under reduced motion because it is a user-started action (Requirement 21.11).
40. Evidence column layout: the story card, the reduction counter with the Shrink_Label, the "Try removing" list, the "Sketch source" diff and the Fixed_Build Verdict_Card sit in the evidence column. The order is verdict area (both Verdict_Cards), story card, Scene, reduction counter with Shrink_Label above the Timeline, Timeline, "Try removing" list, "Sketch source" diff, on wide and narrow screens alike (Requirements 20.5 and 22.2). Requirement 20.5 therefore allows the reduction counter between the Scene and the Timeline, and Requirement 21.2 lists the added regions in the same order.
41. Property tests: every `fc.assert` uses an integer-literal `seed` and an integer-literal `numRuns` of at least 100 (Requirements 12.10 and 25.7).
42. Scene lamps: the traffic-light circles are red, yellow and green from top to bottom (CAR_RED, CAR_YELLOW, CAR_GREEN). DONT_WALK has no Scene element and appears on the Timeline only.
43. M in Requirement 12.9: M = 16,032,000 is Run_Cycles + 32,000, the end used by the test harness in `tests/examples`, and not the App's Reached_End.
44. Start_Commit: HEAD `05a3c96` at the start of this feature. The user-approved edit to `.kiro/specs/honest-verdicts/design.md` line 896 lies outside the paths that Requirement 26.2 checks.
45. Requirement 16.4 Hunk B ranges corrected to old 78-85 / new 78-83 to match `git diff --no-index -U3` of the committed sketches; the earlier 77-84 / 77-82 came from the QA pass, not from the user.
