# Implementation Plan: gremlin-engine

## Overview

Build the Gremlin_Engine in the order fixed by the design section "Implementation order constraints": guard extension and `PRIOR_WORK.md` entry, then PRNG and Run_Seed, then the additive bridge changes, then the ADC fixture stop, then gremlins and the event-list builder, then the baseline stop, then the campaign runner, verdict, slices, the level-timeout test Checker and the emulator properties, then a final checkpoint with timing. Language: TypeScript everywhere (the design uses TypeScript). Tests use vitest 1.6.0 and fast-check 4.10.2, both already pinned in `package.json`.

## Rules for every task

- Tasks run one at a time, in order. A task does not start while an earlier task is unfinished or stopped. The agent never commits, never stages and never pushes. Where a task stops for a commit, the user commits.
- Never change, weaken or delete an acceptance test the user wrote into a prompt or spec. This covers the PRNG reference vectors, the two anchor Runs, the branch counters and every numeric literal copied from the requirements. If a test and the system disagree, stop and report what the test expects, what actually happened and the evidence. Wait for the user's decision.
- Debug scripts and scratch files are temporary. Delete them before reporting a task done.
- Tests are evidence, not proof. Never describe passing tests as proof of correctness.
- No `Date.now`, `performance.now`, `setTimeout` or `Math.random` in `src/engine` (tests excluded). Time is integer CPU cycles. All randomness comes from the one seeded PRNG passed in explicitly. The checker has no AI and makes no network calls.
- avr8js is imported only inside `src/engine/emulator-bridge.ts`. Tests never import it. Pin maps are fixture data.
- Engine comments must not name the APIs that `scripts/guard.mjs` scans for (clock, timer, random, network and entropy calls). The guard reads raw lines, comments included, and has no allow marker for engine code. Describe the rule in other words.
- User-visible strings (verdict text, COULDN'T TELL reasons, exported text constants) avoid the words in `copy-rules.ts` (task 23.1). The list is one constant in that file and is not repeated here. This rule covers those strings only, not code comments or identifiers.
- fast-check: `numRuns` is at least 100 for non-emulator properties (the design table uses 200) and at least 20 for emulator properties (the design table uses 20). `numRuns` is never lowered to meet a time budget. Every `fc.assert` carries a fixed `seed` recorded in the test file and a tag comment `Feature: gremlin-engine, Property N: <text>`. Emulator tests set an explicit 60,000 ms timeout through the third argument of `it`.
- Existing tests (`emulator-bridge.*`, `input-pullup.*`, `floating-input`, `hook-chaining`, `spike-monitor`, `ui-input-pullup.source`) stay unchanged. Where a task says so, the agent runs `git diff --stat` on them (read only, no git commands inside tests) and reports the output.
- No hand-assembled HEX. The new HEX is `fixtures/analog_read/build/analog_read.ino.hex`, compiled by the user. If a task needs it and it is missing, stop and ask the user. There is no fallback.
- Verdict strings are exact: `BROKE` (always with its trace), the HELD sentence "No violation found in N runs of this gremlin set. Not a proof." with the real N, and `COULDN'T TELL` with a reason.
- STOP tasks (11 and 19) end with the line `STOP: report and wait for the user`. The next task must not start until the user confirms.
- If a save hook runs vitest on files under `src/engine`, do not react to its output and do not change code or tests because of it.

## Tasks

- [x] 1. Extend `scripts/guard.mjs` with the network and entropy check (Q7)
  - Add one new check on the same file set as the determinism check (everything under `src/engine`, folders named `__tests__` excluded). Keep every existing check unchanged
  - Flag, per line: `fetch(`, `XMLHttpRequest`, `WebSocket`, imports of `http`, `https` or `net` (bare or with the `node:` prefix, by `import ... from`, bare `import "..."`, dynamic `import()` or `require()`), `crypto.getRandomValues`, `randomUUID` and `randomBytes`
  - Print findings as `file:line: message` and exit 2 on any finding, like the other checks. No allow marker for this check
  - Verify: run `npm run guard` on the current tree and report the result (expected: clean). If it reports findings in existing files, stop and report them
  - Verify the check fires: create one temporary violating file under `src/engine` (not in `__tests__`) with one offending line per flagged pattern, run `npm run guard`, confirm exit code 2 (`$LASTEXITCODE`) and one finding per pattern. Put the same lines in a temporary file under `src/engine/__tests__` and confirm that file is not flagged. Delete both temporary files, run `npm run guard` again and confirm `guard: clean`
  - Report the finding list from the violating run and the final clean run
  - _Requirements: 8.21, 1.12_

- [x] 2. Add the `PRIOR_WORK.md` entry (Q8)
  - Append one line to `PRIOR_WORK.md`, exact wording: "Algorithms re-implemented, no code copied: PCG32 XSH-RR (M. O'Neill; reference implementation is Apache-2.0; test vectors from imneme/pcg-c, `check-pcg32.out`) and the MurmurHash3 fmix32 finalizer (A. Appleby, public domain)."
  - Change nothing else in the file
  - _Requirements: 1.1_

- [x] 3. Checkpoint - guard and disclosure
  - Run `npm run guard` and `npm run typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 4. PRNG (PCG32)
  - [x] 4.1 Create `src/engine/errors.ts`
    - Define the `EngineError` union, `CampaignError` and `isEngineError` exactly as in the design "errors.ts" section. `PrngError` is defined in `prng.ts` and imported here, and `BridgeError` comes from the existing `types.ts`
    - Type-only content plus the guard function. No other code
    - _Requirements: 1.5, 1.8, 1.10, 4.7, 4.8, 8.6, 8.19, 8.20_

  - [x] 4.2 Implement `src/engine/prng.ts`
    - PCG32 XSH-RR, 64-bit state in `BigInt`, `createPrng(seed)` as `srandom(initstate = seed, initseq = 54)`, `inc = 109`, multiplier `6364136223846793005`
    - `nextU32()` increments `drawCount`; `nextInt(min, max)` uses rejection sampling with `threshold = (2^32 - bound) mod bound`, width 2^32 returns the raw output, a width of 1 still consumes one output
    - `invalid-range` (min above max, non-integer bound, width above 2^32) and `invalid-seed` return typed errors and leave state and `drawCount` unchanged
    - Factor the bounded draw into an internal exported function that takes a raw-output source, so a test can script raw outputs. Mark it `@internal`. `createPrng` uses it. No module-level generator instance
    - Written new from the published algorithm. No code copied from the reference
    - Comments must not name the flagged APIs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.12_

  - [x] 4.3 Write `src/engine/__tests__/prng.test.ts`
    - Reference vectors for seed 42 (stream 54): round 1 raw outputs, coins and rolls, and round 2 and 3 raw outputs, copied literally from the design. The test replays the 52-card shuffle draws of earlier rounds to stay aligned. These vectors are acceptance tests: never change them to pass
    - Distribution check: width 6, fixed seed, 60,000 draws, chi-square below the 0.001 critical value 20.515 for 5 degrees of freedom
    - Scripted-source rejection example: bound 6 has threshold 4, scripted outputs 0 and 3 are rejected and 4 returns 4
    - Examples: `invalid-range` and `invalid-seed` cases, state and `drawCount` unchanged after `invalid-range`, a width-1 draw consumes one output, `[0, 4294967295]` takes the raw path
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 11.11_

  - [x] 4.4 Write property test for range draw bounds in `src/engine/__tests__/prng.property.test.ts`
    - **Property 13: Range draw bounds**
    - numRuns 200. Seeds from `arbSeed`-style inline generators (the shared helper file arrives in task 9.1), bounds with width up to 2^32 including `min = max` and `[0, 4294967295]`
    - **Validates: Requirements 1.3, 11.13**

  - [x] 4.5 Write property test for PRNG determinism and error handling in the same file
    - **Property 14: PRNG determinism and error handling**
    - numRuns 200. Two generators agree over 1,000 `nextU32` and 1,000 `nextInt` calls. Invalid range leaves the next outputs and `drawCount` equal to an untouched twin. Non-integer or out-of-range seeds give `invalid-seed`
    - **Validates: Requirements 1.2, 1.5, 1.6, 1.8**

- [x] 5. Run_Seed derivation
  - [x] 5.1 Implement `src/engine/run-seed.ts`
    - `fmix32(h)` and `deriveRunSeed(campaignSeed, runIndex)` = `fmix32((fmix32(campaignSeed) + runIndex) >>> 0)`, with `invalid-seed` and `invalid-run-index` errors and no Run_Seed on error
    - A comment states why distinct Run_Index values give distinct Run_Seed values (bijection construction) without naming flagged APIs
    - _Requirements: 1.9, 1.10, 1.11_

  - [x] 5.2 Write property test for Run_Seed purity in `src/engine/__tests__/run-seed.property.test.ts`
    - **Property 12: Run_Seed is a pure function**
    - numRuns 200. Same inputs give the same value regardless of call order or earlier calls
    - **Validates: Requirements 1.9, 11.12**

  - [x] 5.3 Write property test for Run_Seed distinctness and validation in the same file
    - **Property 15: Run_Seed distinctness and validation**
    - numRuns 200 for the generated parts. Run_Index 0 to 9,999 gives 10,000 distinct Run_Seed values for each of the Campaign_Seed values 0, 1, 42 and 4294967295 plus generated ones. Invalid Campaign_Seed or Run_Index gives the matching typed error. `fmix32` composed with the test-side inverse (multipliers `0x7ed1b41d` and `0xa5cb9243`) is the identity over 100,000 sampled values. State in a comment that the assurance comes from the construction and the test is evidence
    - **Validates: Requirements 1.10, 1.11**

- [x] 6. Checkpoint - PRNG and Run_Seed
  - Run `npm run guard`, `npm run typecheck` and `npx vitest --run`. Ensure all tests pass, ask the user if questions arise.

- [x] 7. Bridge types and pure helpers
  - [x] 7.1 Add the additive types in `src/engine/types.ts`
    - `DigitalFixturePin`, `AnalogFixturePin` (with `direction?: "input"`, `port?: undefined`, `bit?: undefined`), `FixturePin` as their union, `gremlinId?` on `InputEvent`, `AnalogInputEvent`, `ScheduledInput`, `AppliedAnalogInputEvent`, `AppliedInput`, `appliedAnalogInputs` on `AdvanceResult` (always present), `invalid-analog-value` and `pin-kind-mismatch` in `BridgeError`, optional `signal` on `invalid-fixture`. `appliedInputs` keeps its current type
    - Add the Data Models run and campaign types later, in task 21.1
    - Run `npm run typecheck` and report it (design Finding F17: existing tests that read `direction` must still type check). Do not edit any existing test to fix a type error. If one fails, stop and report
    - _Requirements: 2.1, 2.6, 3.1, 3.11, 3.12_

  - [x] 7.2 Implement `src/engine/adc-scale.ts`
    - `ADC_FULL_SCALE_VOLTS = 5` and `analogCountToVolts(c) = ((2c + 1) * 5) / 2048`. Pure, no avr8js import
    - _Requirements: 2.4, 2.5_

  - [x] 7.3 Write `src/engine/__tests__/adc-scale.test.ts` (pure half of Property 23)
    - **Property 23 (pure half): ADC count round trip**
    - Exhaustive over counts 0 to 1023 (no random generator): a copy of the quoted conversion formula, labelled "mirror of adc.js:109-110", applied to `analogCountToVolts(c)` returns `c`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 7.4 Implement `src/engine/fixture.ts`
    - `validateFixture` with the same checks and messages as today for digital pins, in the same order, then `activeLevel` and `restState` checks (allowed set, input digital pins only), analog pin checks (channel integer 0 to 5, no duplicate channel, `restLevel` integer 0 to 1023, `direction` absent or `"input"`, no `activeLevel` or `restState`), then the shared physical pin check (analog channel N against a non-analog pin with `port: "C"` and `bit` N, earliest conflict in Fixture order, message names both signals, `signal` field absent). Single-signal failures set `signal`
    - `validateEvents`: per event in list order, unknown signal gives `unmapped-pin` with today's text, kind mismatch gives `pin-kind-mismatch`, bad analog value gives `invalid-analog-value`. `isAnalogInputEvent(ev)` is `'analog' in ev`. Helper `isAnalogPin`
    - Pure, no avr8js import
    - _Requirements: 2.1, 2.7, 2.8, 2.9, 2.10, 2.12, 3.1, 3.2, 3.3, 3.4, 3.12, 3.13, 3.14_

- [x] 8. Wire the bridge
  - [x] 8.1 Use the validation and guard digital loops in `src/engine/emulator-bridge.ts`
    - Replace the inline fixture and event checks in `_build` with `validateFixture` and `validateEvents`, run before the CPU is built so no event is applied from a rejected list
    - Add a digital-pin guard to every loop that reads `pin.port`, `pin.bit` or `pin.direction` so analog pins are skipped (no snapshot entry, no listener, no PIN read hook)
    - Digital applied entries keep `{ ...ev, appliedCycle }`, which copies `gremlinId` unchanged. Nothing else reads `gremlinId`
    - Behaviour for Fixtures without new fields must stay identical, including error messages and order
    - _Requirements: 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 3.1, 3.2, 3.3, 3.4, 3.11, 3.12, 3.13, 3.14_

  - [x] 8.2 Wire the ADC in `src/engine/emulator-bridge.ts`
    - After the timers: `new AVRADC(cpu, adcConfig)` kept as `_adc`; for each analog pin set `channelValues[channel] = analogCountToVolts(restLevel ?? 512)` before any instruction runs
    - Apply analog events at the earliest instruction boundary at or after the event cycle, push `{ ...ev, appliedCycle }` to a local analog list, return it as `appliedAnalogInputs` on every path (always present, possibly empty, including `requestedCycles <= 0` and Fixtures with no analog pin)
    - `supports("adc")` returns true by adding `'adc'` to the wired set. Other capabilities unchanged
    - `createWithTestHooks` gains the optional `adcResultListener`: assign an own `completeADCRead` on the `AVRADC` instance that calls the original and then the listener with `{ cycle, value, adcl, adch, admux }` read from `cpu.data` with the addresses from `adcConfig`. `scripts/guard.mjs` check "c2" already limits `createWithTestHooks` to the bridge and tests
    - avr8js imports stay inside this file
    - _Requirements: 2.2, 2.4, 2.5, 2.6, 2.11, 3.10, 3.11_

  - [x] 8.3 Verify the existing suites are unchanged and passing
    - Run `npm run typecheck`, `npm run guard` and `npx vitest --run`
    - Run `git diff --stat` on the existing test files listed in the rules and report the output (expected: no changes)
    - If any existing test fails or fails to compile, stop and report what it expects, what happened and the evidence. Do not edit it
    - Approved exception: input-pullup.property supports() assertion updated for adc (superseded by R2.2), approved by the user
    - _Requirements: 2.11, 3.8, 3.9, 11.11_

- [x] 9. Bridge tests
  - [x] 9.1 Create `src/engine/__tests__/arbitraries.ts` (helper, not a test file)
    - `arbSeed` (full range, biased toward 0, 1, 4294967295), `arbRunIndex` (full range; small values for emulator properties), `arbRunCycles` (1 to 50,000,000 plus the constants 1, 1,600,000, 1,600,001, 8,000,000 and 4,294,967,296), `arbFixture` (0 to 6 pins with distinct signals, digital pins with random direction, port, bit, `activeLevel`, `restState`, and 0 to 3 analog pins on distinct channels with optional `restLevel`; built so no digital pin on port C uses a bit equal to a drawn analog channel, by construction and not by retry), `arbSharedPinFixture` (the opposite case, on purpose)
    - Imports only types and `fixture.ts`. No avr8js
    - _Requirements: 2.10, 2.12_

  - [x] 9.2 Write `src/engine/__tests__/emulator-bridge.analog.test.ts` (examples)
    - Analog Fixture acceptance (`{ signal, kind: "analog", channel }` with and without `restLevel`), `supports("adc")` true, digital `kind`, `activeLevel`, `restState` acceptance and defaults, rejection of bad `activeLevel` and `restState` and of those fields on analog or output pins (`invalid-fixture` naming the signal)
    - Analog events on `blink_button` plus a `POT` pin on channel 0 are applied and recorded in `appliedAnalogInputs` with `appliedCycle`; `appliedAnalogInputs` is present and empty for a Fixture with no analog pin; `gremlinId` is copied unchanged into applied entries
    - Rejections before execution with `cycleCount` unchanged and no event applied: `invalid-analog-value` (out of range, non-integer), `pin-kind-mismatch` (both directions), unknown signal gives the same kind as a digital event today
    - Shared pin (R2.12): analog `POT` channel 0 with a digital input on port C bit 0 is rejected and the message contains both signal names; the same with an output pin; channel 3 with port C bit 3 is rejected; channel 0 with port C bit 1, and with port B bit 0, is accepted; the error has no `signal` field; an earlier per-pin error (for example a duplicate channel) wins
    - Duplicate channel, channel out of range 0 to 5, `restLevel` out of range or non-integer give `invalid-fixture`
    - Load HEX with `readFileSync`, no fallback
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 3.1, 3.2, 3.3, 3.4, 3.11, 3.12, 3.13, 3.14_

  - [x] 9.3 Write property test for generated Fixtures in `src/engine/__tests__/emulator-bridge.analog.property.test.ts`
    - **Property 27: Generated fixtures are valid**
    - numRuns 200. `validateFixture` accepts every `arbFixture` output, including that no analog channel N shares a pin with a digital pin on port C bit N
    - **Validates: Requirements 2.10, 2.12**

  - [x] 9.4 Write property test for rejected Fixtures and events in the same file
    - **Property 26: Invalid fixtures and events are rejected before execution**
    - numRuns 200. No CPU run needed: duplicate analog channel, out-of-range channel or `restLevel`, bad `activeLevel` or `restState`, those fields on analog or output pins give `invalid-fixture` naming the signal; `arbSharedPinFixture` gives `invalid-fixture` with both names in the message; bad analog values give `invalid-analog-value`; kind mismatches give `pin-kind-mismatch`; `cycleCount` stays 0
    - **Validates: Requirements 2.7, 2.8, 2.9, 2.10, 2.12, 3.4, 3.14**

  - [x] 9.5 Write property test that the bridge ignores `gremlinId` in the same file
    - **Property 25: Bridge ignores gremlinId**
    - numRuns 20 (emulator). `blink_button` plus `POT` Fixture, Run_Cycles at most 200,000. Running with and without `gremlinId` gives identical output events and diagnostics; every applied entry carries the original `gremlinId`
    - **Validates: Requirements 3.11**

  - [ ]* 9.6 Write extra example for unchanged capabilities
    - `supports()` and `unsupported()` results for peripherals other than ADC are unchanged, with literals recorded from the pre-change behaviour of the existing smoke test
    - _Requirements: 2.11_

- [x] 10. Checkpoint - bridge changes
  - Run `npm run guard`, `npm run typecheck` and `npx vitest --run`. Run `git diff --stat` on the existing test files and report it. Ensure all tests pass, ask the user if questions arise.

- [x] 11. Write the `analog_read` sketch, then STOP for the user to compile
  - Create `fixtures/analog_read/analog_read.ino`. Write only this one file. Do not create `build/` or any HEX. Do not run `arduino-cli` or any compiler
  - Sketch per design: `setup()` configures D13 (PB5) as output. `loop()` stores `analogRead(A0)` in a `volatile` variable and drives D13 high when the reading is above 600. Fixture used by tests: LED on port B bit 5 (output) and an analog pin `POT` on channel 0
  - Original code and comments only. No third-party logos, names or music
  - Tell the user the sketch is written and ask them to compile it with this command, then wait for them to confirm:
    ```
    arduino-cli compile -b arduino:avr:uno --output-dir fixtures/analog_read/build fixtures/analog_read
    ```
  - Tasks 12 onward must not start until the user confirms. When the user confirms, check that `fixtures/analog_read/build/analog_read.ino.hex` exists. If it does not, stop and ask again. There is no fallback
  - _Requirements: 2.2, 2.4_
  - STOP: report and wait for the user

- [x] 12. ADC through the bridge (needs the user-compiled HEX)
  - **Dependency**: each sub-task begins by checking that `fixtures/analog_read/build/analog_read.ino.hex` exists. If it is missing, stop and ask the user to compile. Do not skip, weaken or substitute another HEX
  - [x] 12.1 Smoke and rest-level examples in `src/engine/__tests__/adc-roundtrip.test.ts`
    - Using `createWithTestHooks` with `adcResultListener`: confirm the own `completeADCRead` wrapper is honoured (settles the "UNVERIFIED by running" row), record ADMUX at each conversion
    - Rest level: with no analog event the delivered value matches `restLevel` when given and 512 when absent
    - Report what ADMUX shows (ADLAR clear? REFS 01?). This settles the UNVERIFIED rows of the design evidence table; report them as observations
    - _Requirements: 2.2, 2.4, 2.5_

  - [x] 12.2 Exhaustive round trip in the same file
    - **Property 23 (through-bridge half): ADC count round trip**
    - Exhaustive over counts 0 to 1023, one run of about 8.2 million cycles, events 8,000 cycles apart; for each count only conversions delivered in the second half of its interval are checked; the result decoded with ADLAR taken from the recorded ADMUX equals the applied count; REFS bits are asserted to be 00 or 01 so the test cannot pass on a reference it does not model. Timeout 60,000 ms
    - If a count fails to read back, report it as a finding with the counts, the registers and ADMUX, and stop for a decision
    - **Validates: Requirements 2.4, 2.5**

- [x] 13. Checkpoint - ADC
  - Run `npm run guard`, `npm run typecheck` and `npx vitest --run`. Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Gremlin catalogue
  - [-] 14.1 Implement `src/engine/gremlins/pins.ts` and `src/engine/gremlins/catalogue.ts`
    - `pins.ts`: eligible lists (`digitalInputs`, `restActiveInputs`, `analogInputs`, all in Fixture order), press value, Rest_Level (`restLevel ?? 512`), `msToCycles` by integer arithmetic (16,000 per ms; 0.1 ms is the constant 1,600 cycles), `floorDiv`, `truncDiv`
    - `catalogue.ts`: six `GremlinDefinition` entries with ids, icon names (`gremlin-masher` and so on), targets, the parameter table from the design (names, shapes, units, defaults, allowed ranges), `resolveParams` with the error order of the design (`unknown-gremlin`, then `invalid-gremlin-parameter` naming Gremlin and parameter; earliest in listed order wins; nothing drawn yet), and the Drifter defensive duration check
    - Append `arbGremlinSet` to `arbitraries.ts` (0 to 5 entries, overrides inside `allowed`)
    - Comments avoid the flagged API names
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7, 4.8, 4.9, 5.10, 6.8, 6.9, 6.10_

  - [ ] 14.2 Write `src/engine/__tests__/catalogue.test.ts`
    - Table-driven: every default and allowed range compared with literal numbers copied from R5 and R6 (Masher gap 80,000 and 2,400,000; Bouncer gap 1,600 and 48,000; Dropout gap 16,000 and 800,000; Stuck 1,600,000; Spike 1 and 20 ms; Drifter 50 and 500 ms; steps 2 to 32 with default 8). These literals are acceptance values: never change them to pass
    - `msToCycles(1)` is 16,000; Bouncer minimum is the integer constant 1,600
    - Each override at, just inside and just outside every allowed bound is accepted or rejected with `invalid-gremlin-parameter`; `unknown-gremlin`; unknown parameter name; scalar given as range and the reverse; min above max
    - Exactly six Gremlins, targets and icon names as in the design table
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 4.7, 4.8, 5.10, 6.8, 6.9_

- [ ] 15. Digital generators
  - [ ] 15.1 Implement `src/engine/gremlins/digital.ts`
    - Masher, Bouncer, Stuck, Dropout with the skip checks and draw orders of the design table. Every draw is `prng.nextInt(min, max)`; `pick(list)` is `nextInt(0, list.length - 1)`
    - Masher single Press releases after `floor(gapCycles.min / 2)` of the resolved minimum (no literal 80,000 in the generator). Bouncer assigns values over the full flip list, then cuts flips at or above Run_Cycles. Stuck skips before any draw when `runCycles < minSpanCycles + 1`. `no-target-pin` wins over `run-too-short`. Dropout draws nothing without an active-rest input
    - Press events carry the pin's press value, Release events carry `"release"`, every event carries its `gremlinId`, every gap is at least 1 cycle
    - _Requirements: 3.5, 3.6, 3.7, 4.3, 4.4, 4.10, 4.11, 4.12, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.11_

  - [ ] 15.2 Write digital examples in `src/engine/__tests__/gremlins.test.ts`
    - Scripted `Prng` objects (plain objects implementing the interface) returning each range minimum and maximum, one example per digital Gremlin per documented range
    - Masher single Press: default releases at start plus 40,000, with `gapCycles` min overridden to 1,000 it releases at start plus 500, and no literal 80,000 appears in the generator source
    - Stuck with Run_Cycles 1,600,000 (skipped, zero draws) and 1,600,001 (generated); Dropout and others with no eligible pin (`no-target-pin`, zero draws); Run_Cycles 1; target pin selection by one `pick` in Fixture order (R4.11 draw trace); discard at Run_Cycles keeps earlier events
    - _Requirements: 4.10, 4.11, 4.12, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.11, 11.11_

- [ ] 16. Analog generators
  - [ ] 16.1 Implement `src/engine/gremlins/analog.ts`
    - Spike (draws pin, value 0 or 1023, start, gap in ms converted with `msToCycles`) and Drifter (draws pin, direction, duration ms then `D`, then the three-draw `run-too-short` skip, then start; `S` is a parameter and never drawn; step `i` at `start + floorDiv(D * i, S)` with value `rest + truncDiv((target - rest) * i, S)`, integer arithmetic only)
    - Drifter returns `invalid-gremlin-parameter` naming `drifter` when `D < S`, emits all `S` events when `rest == target`, never returns the pin to Rest_Level. Both skip with `no-target-pin` and zero draws when no analog pin exists
    - _Requirements: 4.10, 4.12, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_

  - [ ] 16.2 Write analog examples in `src/engine/__tests__/gremlins.test.ts`
    - Scripted `Prng` range examples for Spike and Drifter, Drifter with Run_Cycles smaller than `D + 1` (exactly three `nextInt` calls then skip), no analog pin (zero draws), Rest_Level present and absent, the `D < S` defence tested through the internal generator function, invalid `steps` and range overrides
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.8, 6.9, 6.10, 6.11, 11.11_

  - [ ] 16.3 Write property test for Drifter arithmetic in `src/engine/__tests__/gremlins.test.ts`
    - **Property 18: Drifter arithmetic**
    - numRuns 200. Against a `BigInt` reference: cycles `start + floor(D * i / S)`, values `rest + trunc((target - rest) * i / S)`, strictly increasing cycles, step `S` at `start + D` with value `target`, nothing returns to Rest_Level, `rest == target` still gives `S` events
    - **Validates: Requirements 6.4, 6.5, 6.6, 6.7**

  - [ ] 16.4 Write property test for digital and Spike Gremlin shape in the same file
    - **Property 19: Digital Gremlin shape**
    - numRuns 200. Run_Cycles long enough that nothing is cut: Masher 1 to 6 Presses each followed by its Release (single Press released `floor(gapCycles.min / 2)` later, default and overridden), Bouncer 2 to 8 alternating flips ending on its edge value, Stuck Press then Release at least 1,600,000 cycles later when it fits, Dropout Release then Press 16,000 to 800,000 cycles later, Spike value then Rest_Level 16,000 to 320,000 cycles later; no two events of one instance on one pin share a cycle; for short runs every kept event is a prefix of the uncut list
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 6.1, 6.2**

- [ ] 17. Event-list builder
  - [ ] 17.1 Implement `src/engine/event-list.ts`
    - `buildEventList(input)` as in the design: resolve all entries before any draw, derive `runSeed` and exactly one PRNG, emit Rest_Events in Fixture order with `gremlinId: "rest"` and zero draws (also when Run_Cycles is 1), run each entry in listed order passing the same PRNG, append skips, sort by decorated key `(cycle, generation index)`, defensive cycle-range check returning `internal-error`
    - Expose an `@internal` function that takes an already created PRNG (`buildEventList` calls it with the one it creates). This is the seam that scripted-PRNG tests for R7.1 and Property 16 need; it changes no behaviour. If the user prefers another seam, stop and ask
    - Reads nothing from any other Run
    - _Requirements: 3.15, 4.3, 4.4, 4.9, 4.13, 4.14, 7.1, 7.2, 7.3, 7.5, 7.7_

  - [ ] 17.2 Write property test for event list determinism in `src/engine/__tests__/event-list.property.test.ts`
    - **Property 1: Event list determinism**
    - numRuns 200. Two calls give identical length, order, and every field of every event, and identical Skipped_Lists
    - **Validates: Requirements 7.4, 4.14, 11.1**

  - [ ] 17.3 Write property test for targets, kinds and cycle range in the same file
    - **Property 2: Targets, kinds and cycle range**
    - numRuns 200. Targets match the producing Gremlin's kinds, Dropout only on active-rest pins, cycles are integers in `[0, Run_Cycles)`, one leading Rest_Event per active-rest input in Fixture order including Run_Cycles 1
    - **Validates: Requirements 4.1, 4.4, 4.13, 5.9, 11.2**

  - [ ] 17.4 Write property test for analog values in the same file
    - **Property 3: Analog values in range**
    - numRuns 200. Every `analog` is an integer from 0 to 1023
    - **Validates: Requirements 6.12, 11.3**

  - [ ] 17.5 Write property test for sorted and stable order in the same file
    - **Property 4: Sorted and stable**
    - numRuns 200. Cycles non-decreasing; equal cycles keep generation order with Rest_Events ahead of Gremlin events
    - **Validates: Requirements 7.3, 11.4**

  - [ ] 17.6 Write property test for digital values in the same file
    - **Property 5: Digital values**
    - numRuns 200. Each digital value is the pin's Active_Level value or `"release"`
    - **Validates: Requirements 3.5, 3.6, 3.7, 11.5**

  - [ ] 17.7 Write property test for Gremlin ids in the same file
    - **Property 6: Gremlin ids**
    - numRuns 200. Every `gremlinId` is an id in the set or `"rest"` for Rest_Events only
    - **Validates: Requirements 4.3, 11.6**

  - [ ] 17.8 Write property test that skips draw nothing in the same file
    - **Property 16: Skips draw nothing (with one named exception)**
    - numRuns 200. Using a counting PRNG through the seam of 17.1: `no-target-pin` and Stuck `run-too-short` make zero draws and later entries draw as if the skipped entry were removed; an empty set draws zero; a Drifter `run-too-short` skip makes exactly three `nextInt` calls (counted on the scripted PRNG, not `drawCount`)
    - **Validates: Requirements 4.10, 4.12, 5.6, 5.11, 6.11, 7.2, 7.7**

  - [ ] 17.9 Write property test for Run independence in the same file
    - **Property 17: Run independence**
    - numRuns 200. `buildEventList` for Run_Index `i` returns the same result alone, after other indices, or in any order
    - **Validates: Requirements 7.5**

  - [ ] 17.10 Write event-list examples in the same file
    - Repeated Gremlin ids run as separate instances in listed order with their own overrides (R4.9); one PRNG instance passed in set order (R7.1, scripted); Rest_Event ordering ahead of Gremlin events at equal cycles; `unknown-gremlin` and `invalid-gremlin-parameter` generate no events
    - _Requirements: 4.8, 4.9, 7.1, 7.2, 7.3_

  - [ ]* 17.11 Write extra example for the largest Run_Cycles
    - `buildEventList` with Run_Cycles 4,294,967,296 returns events and never `invalid-range` for each Gremlin (pure, no emulator)
    - _Requirements: 8.6, 1.3_

- [ ] 18. Checkpoint - gremlins and event list
  - Run `npm run guard`, `npm run typecheck` and `npx vitest --run`. Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Record the Event_List baseline, then STOP for the user to commit
  - **Precondition**: every generator, the catalogue and `buildEventList` are written and their tests pass (tasks 14 to 17). This is the final draw order, including the post-Q4 Masher behaviour
  - Write `src/engine/__tests__/baselines/gremlin-eventlists.json` once, from the current generator: Campaign_Seed 0, 1, 42 and 4294967295; Run_Index 0 to 2; the full six-Gremlin set with default parameters; three Fixtures: the two existing ones, `blink_button` and `floating_input` (same pin maps as their existing tests), and the synthetic Fixture `synthetic_events` exactly as the design "Baseline file policy" defines it (clock 16,000,000 Hz; `BUTTON` digital input on port D bit 2 with `activeLevel: "low"`; `BEAM` digital input on port D bit 3 with `activeLevel: "high"` and `restState: "active"`; `POT` analog channel 0 with `restLevel: 300`; `LED` output on port B bit 5; no HEX, event generation only, never run on an emulator). The same seeds and Run_Index values apply to all three Fixtures; Run_Cycles 8,000,000. Record `runSeed`, the ordered events and the Skipped_List for each case. On `blink_button` and `floating_input`, Spike and Drifter still appear as `no-target-pin` skips (design Finding F21); on `synthetic_events` they appear with real events, as does Dropout (BEAM gives a Rest_Event at cycle 0 with value 1)
  - Add `src/engine/__tests__/gremlin-baseline.test.ts`, which regenerates the same cases for all three Fixtures (the synthetic one without any HEX or emulator, after `validateFixture` accepts it) and compares them with the file. No git commands inside the test
  - Checks before stopping: in the recorded baseline, `synthetic_events` holds at least one Spike event, one Drifter event and one Dropout event (report the counts per Gremlin); the test fails if any of the three is absent from that Fixture's recorded cases; the test regenerates and compares all three Fixtures
  - Any helper script used to write the file is temporary: delete it before reporting. Run `npx vitest --run src/engine/__tests__/gremlin-baseline.test.ts` and report that it passes against the written file
  - No later task may regenerate, refresh, edit or delete this file. A later mismatch is reported (what the baseline holds, what the generator now produces, evidence) and never regenerated
  - Do not commit. Tell the user the file is ready for review and commit
  - The next task must not start until the user confirms the commit is done
  - _Requirements: 7.4, 4.14, 11.1_
  - STOP: report and wait for the user

- [ ] 20. Step planner
  - [ ] 20.1 Implement `src/engine/step-plan.ts`
    - `planTarget` exactly as the design pseudocode: candidates are the next pending cycle above `prevTarget`, `runCycles`, and `prevTarget + maxStepCycles`; a target at or below `cycleCount` is skipped and the next is derived from the skipped target. Pure, no emulator import
    - _Requirements: 8.9, 8.10_

  - [ ] 20.2 Write property test for the step planner in `src/engine/__tests__/step-plan.property.test.ts`
    - **Property 20: Step planner**
    - numRuns 200. Result strictly above `cycleCount` and at most `runCycles`, equals a reference loop of the R8.9 and R8.10 rules (overshoot up to 8 cycles); repeated calls with simulated overshoot give strictly increasing targets ending at `runCycles`
    - **Validates: Requirements 8.9, 8.10**

- [ ] 21. Checker contract and run data types
  - [ ] 21.1 Create `src/engine/checker.ts` and add the Data Models run and campaign types to `src/engine/types.ts`
    - `checker.ts`: types only (`CheckerObservation`, `Violation`, `CannotCheck`, `CheckerOutcome`, `Checker`) as in the design. The observation holds data only: no clock, PRNG or network handle
    - `types.ts`: `RunResult`, `CampaignResult`, `SliceProgress`, `CampaignState`. Plain JSON shapes only (no `undefined`, `NaN`, `BigInt`, `Date`, class instances; absent values are `null`)
    - `npm run typecheck` passes
    - _Requirements: 8.11, 8.12, 8.13, 8.14, 8.21, 9.5_

- [ ] 22. Campaign runner and step loop
  - [ ] 22.1 Implement `runOne` and `mergeApplied` in `src/engine/campaign.ts`
    - Follow the design pseudocode: `buildEventList`, fresh bridge from `bridgeFactory` (default `EmulatorBridge.create`) per Run, `planTarget` with absolute targets, `advance(target - cycleCount)`, merge applied digital and analog entries by consuming both arrays exactly (otherwise `internal-error`), one Checker call per Step with only new data (frozen shallow copies), the end-of-run call with `endOfRun: true` and the bridge `cycleCount`, stop at the Step that returned a Violation, collect de-duplicated `cannotCheck`, `bridge-error` and `checker-error` (throw or malformed outcome) with Run_Index
    - The engine reads the bridge `cycleCount` and nothing else for time
    - Stored Run_Result fields are plain data. Event_Lists are never read back from stored results
    - _Requirements: 7.5, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 8.19, 8.20, 8.21_

  - [ ] 22.2 Write runner examples in `src/engine/__tests__/campaign.test.ts`
    - Using the `blink_button` HEX (no new HEX): Checker called once per Step plus the end-of-run call, with only new data; a scripted Violation stops the Run with no further Checker call; end-of-run cycle comes from `cycleCount`; a failing `bridgeFactory` gives `bridge-error` with the Run_Index and no `HELD`; a throwing Checker and a malformed outcome (empty rule, non-integer cycle, cycle above `observation.cycle`) give `checker-error` with Run_Index and cycle; `cannotCheck` entries are collected without repeats
    - _Requirements: 8.8, 8.11, 8.12, 8.13, 8.14, 8.19, 8.20_

- [ ] 23. Verdict and copy rules
  - [ ] 23.1 Implement `src/engine/copy-rules.ts` and `src/engine/verdict.ts`
    - `copy-rules.ts`: one constant holding the product-rule banned word list, used by the copy test
    - `verdict.ts`: `VERDICT_BROKE`, `VERDICT_COULDNT_TELL`, `heldText(n)` with the exact HELD sentence, `computeVerdict` with the selection order of the design (`BROKE` with the lowest violating Run_Index trace and unchecked rules listed, then `COULDN'T TELL` with a reason of 1 to 200 characters truncated deterministically, then `HELD`), returns `null` while not finished. Pure
    - Verdict strings and any user-visible text avoid the banned words and never imply correct behaviour outside the Runs performed
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13_

  - [ ] 23.2 Write property test for the verdict function in `src/engine/__tests__/verdict.property.test.ts`
    - **Property 22: Verdict function**
    - numRuns 200. Pure (input not mutated), `null` when not finished, exactly one verdict, priority BROKE then COULDN'T TELL then HELD, BROKE trace from the lowest violating Run_Index, unchecked rules never change BROKE, reason length 1 to 200, HELD never while runs completed is below N
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12**

  - [ ] 23.3 Write `src/engine/__tests__/copy-rules.test.ts`
    - Scan only the user-visible strings, not whole source files or comments: the exported text constants (`VERDICT_BROKE`, `VERDICT_COULDNT_TELL` and any other exported constant holding text shown to a user), `heldText(n)` for several values of `n`, and the verdict and COULDN'T TELL reason strings that `computeVerdict` generates on every reason path (including the fixed plain sentence used when a reason would be empty). Match the words in `copy-rules.ts` as whole words, case-insensitively
    - Caller or Checker supplied text (a rule name, a Checker's own `reason`) is passed through data, so the test feeds neutral inputs for those parts
    - _Requirements: 10.13_

  - [ ]* 23.4 Write extra example for the HELD sentence
    - `heldText(n)` for several N equals "No violation found in N runs of this gremlin set. Not a proof." with the real N (including 1)
    - _Requirements: 10.4, 10.12_

- [ ] 24. Campaign handle and slices
  - [ ] 24.1 Implement `createCampaign`, `resumeCampaign`, `runCampaign` and `runSlice` in `src/engine/campaign.ts`
    - Validate and resolve defaults (N 64, Run_Cycles from `defaultRunCycles` or 8,000,000, `maxStepCycles` 160,000, `stopOnFirstViolation` true); `invalid-campaign` for N, Run_Cycles (above 4,294,967,296 included), `maxStepCycles` or `stopOnFirstViolation` invalid; one probe construction through `bridgeFactory` so an invalid HEX or Fixture returns the bridge error before any Run and never `HELD`
    - `runSlice(k)`: `invalid-campaign` for non-positive-integer `k` with state untouched; finished handle returns final progress and runs nothing; otherwise `min(k, N - completed)` Runs in ascending order; `stopOnFirstViolation` true ends the Slice at the violating Run and sets finished; with false all N Runs run and the earliest violating Run_Index is recorded; a bridge or checker error stops the Campaign and later slices return the same error (Q6)
    - Handle state is `{ nextRunIndex, runs }`, plain data, no bridge between Slices. `resumeCampaign` checks `nextRunIndex === runs.length` and `runs[i].runIndex === i`, else `invalid-campaign`
    - `checkerSignals` produces `unmappedSignals` for the verdict
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.16, 8.17, 8.18, 8.19, 8.20, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.7, 10.9, 10.10_

  - [ ] 24.2 Write campaign examples in `src/engine/__tests__/campaign.test.ts`
    - Defaults, `invalid-campaign` cases (Run_Cycles 4,294,967,296 accepted by validation, 4,294,967,297, 0, negative, fractional, NaN and infinite rejected; same for N and `maxStepCycles`), invalid HEX gives a bridge error and no `HELD`, scripted Checkers for stop at the violating Run and for running all N with `stopOnFirstViolation` false, slice edge cases (`k` of 0, negative, fractional, NaN, infinite, finished handle, stop at violation with `k` above runs left), `state()` is plain data, resume with inconsistent state gives `invalid-campaign`
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.16, 8.17, 8.18, 9.1, 9.3, 9.6, 9.7, 9.8_

- [ ] 25. Level-timeout test Checker (design "Violation coverage for emulator properties")
  - [ ] 25.1 Create `src/engine/__tests__/led-level-checker.ts` (helper, not a test file)
    - `makeLevelTimeoutChecker({ signal: "LED", limitCycles: L })` exactly as specified: segments measured between output event cycles, Violation `{ rule, cycle: levelStart + L }` when a segment is longer than L, an open level reported only on the end-of-run call, `observation.cycle` read only there, state reset when `stepIndex` is 0, the reported cycle never equals the Step cycle. Rule text: `LED stays at one level longer than ${L} cycles`
    - Imports no avr8js and nothing from the engine except the `Checker` types
    - _Requirements: 8.13, 11.7, 11.10_

  - [ ] 25.2 Write `src/engine/__tests__/led-level-checker.test.ts`
    - Unit cases: a segment of exactly L is not a Violation and L + 1 is, reported at `levelStart + L`; end-of-run reports an open level at `levelStart + L`; an open level of exactly L at end-of-run reports nothing; events split across two calls give the same Violation as one call; a repeated value does not move the level start; a reset at `stepIndex` 0 forgets the previous Run
    - Two anchor Runs on `blink_button` through `runOne`, fixed example tests outside any property: Run_Cycles 60,000 with L 20,000 gives a Violation at the end-of-run call; Run_Cycles 60,000 with L 100,000 gives none. These anchors are acceptance tests: never change them to pass
    - _Requirements: 8.13, 11.7, 11.10_

- [ ] 26. Emulator properties
  - Each sub-task uses `blink_button` or `floating_input` HEX read with `readFileSync` (no fallback), numRuns 20, a fixed seed, an explicit 60,000 ms timeout, and the Run_Cycles and N ranges of the design "Test time budget". Cost is controlled by Run_Cycles and N, never by `numRuns`
  - [ ] 26.1 Slice invariance in `src/engine/__tests__/campaign.property.test.ts`
    - **Property 7: Slice invariance**
    - N 1 to 3, Run_Cycles 30,000 to 150,000, level-timeout Checker with `branch` drawn from violating or clean and L from the branch ranges of the design, both `stopOnFirstViolation` values, slice size `k` from 1 to N, one call versus Slices versus resumed from `{ nextRunIndex, runs }`. Counters `violatingRuns` and `cleanRuns` are declared before `fc.assert` and count the Run_Results of the single-call `stopOnFirstViolation` false execution only; after `fc.assert`, `expect(violatingRuns).toBeGreaterThan(0)` and `expect(cleanRuns).toBeGreaterThan(0)` with messages naming the missing branch and the counts. If a counter is 0: report it as a test failure, repair the generator ranges (not `numRuns`, not the assertion, not a re-picked seed), and report
    - **Validates: Requirements 9.1, 9.2, 9.4, 7.6, 11.7**

  - [ ] 26.2 Replay in the same file
    - **Property 8: Replay**
    - Includes a Fixture with the analog pin `POT` on channel 0 added to `blink_button`. Recorded Event_List replayed on a fresh bridge gives identical output events, applied inputs (digital and analog, same `analog` values at the same cycles) and diagnostics. Run_Cycles at most 400,000
    - **Validates: Requirements 3.10, 11.8**

  - [ ] 26.3 Floating-input rule intact in the same file
    - **Property 9: Floating-input rule intact**
    - `floating_input` Fixture with generated events: at most one `floating-input` diagnostic per signal, and diagnostics equal those of a replay of the recorded applied events. Run_Cycles at most 400,000
    - **Validates: Requirements 3.8, 3.9, 11.9**

  - [ ] 26.4 Step size invariance in the same file
    - **Property 10: Step size invariance**
    - `maxStepCycles` 160,000 versus 16,000, Run_Cycles 30,000 to 399,000, level-timeout Checker with the branch generator. Output events, applied inputs, diagnostics and Violation (rule and cycle) identical; with a Violation, lists compared only up to the Violation cycle (output events `cycle <= v.cycle`; diagnostics and applied inputs strictly below `v.cycle`); with no Violation `endCycle` also identical; a Violation present in one result and absent in the other fails; Checker call counts excluded. Counters `violatingRuns` and `cleanRuns` from the 160,000 result with the same assertions as 26.1
    - **Validates: Requirements 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.15, 11.10**

  - [ ] 26.5 Checker feed in the same file
    - **Property 21: Checker feed**
    - Three branches counted across cases, each count must be above 0: (a) a recording Checker with no Violation, (b) a scripted violator at a drawn Step `j` from 0 to 2 (used only when the Run has at least `j + 1` Steps), (c) the level-timeout Checker whose Violation arrives on the end-of-run call. Observations concatenated equal the Run_Result lists, the final call has `endOfRun: true` and `cycle` equal to `endCycle`, calls equal Steps plus one, no call after a Violation. Run_Cycles at most 300,000
    - **Validates: Requirements 8.11, 8.12, 8.13, 8.14**

  - [ ] 26.6 Run_Result JSON round trip in the same file
    - **Property 24: Run_Result JSON round trip**
    - Emulator property: numRuns 20, Run_Cycles at most 100,000, each case one Run on the real bridge (`blink_button` or `floating_input`, generated Gremlin_Set and seeds, a Fixture that may add an analog pin so analog applied inputs appear). `JSON.parse(JSON.stringify(x))` deeply equals `x` for the Run_Results
    - **Validates: Requirements 9.5**

- [ ] 27. Checkpoint - campaign and emulator properties
  - Run `npm run guard`, `npm run typecheck` and `npx vitest --run`. Ensure all tests pass, ask the user if questions arise.

- [ ] 28. Final checkpoint - full run, timing and cleanup
  - Run `npx vitest --run`, `npm run typecheck`, `npm run build` and `npm run guard`. Report each result as evidence, not proof
  - Run the existing-suite check: `git diff --stat` on the existing test files, expecting no changes, and report the output. Confirm `src/engine/__tests__/baselines/gremlin-eventlists.json` and `input-pullup-preservation.json` show no change since the user's commit (`git status`, `git diff --stat`); do not regenerate either
  - Measure with the design command, writing the JSON to a temporary file outside the repository: `npx vitest --run --reporter=verbose --reporter=json --outputFile.json=$env:TEMP\hexorcist-vitest.json`. If the installed vitest rejects `--outputFile.json`, use `--reporter=json --outputFile=<path>` plus a second plain run for the verbose list and record which was used
  - From the JSON print `name` and `endTime - startTime` for each of the 17 new gremlin-engine test files and their sum: `catalogue`, `prng`, `prng.property`, `run-seed.property`, `gremlins`, `event-list.property`, `step-plan.property`, `verdict.property`, `copy-rules`, `emulator-bridge.analog`, `emulator-bridge.analog.property`, `adc-scale`, `adc-roundtrip`, `campaign`, `campaign.property`, `led-level-checker`, `gremlin-baseline`
  - Added time = wall `Duration` of the full run minus the `Duration` of the same command with the new files excluded (`--exclude` for each new file plus `**/node_modules/**`, because `--exclude` replaces the default list). Report both durations, the difference and the per-file table. Confirm the new tests add at most 60 seconds. Also report the measured emulated cycles per second (sum of Run_Cycles executed by emulator tests divided by their summed test time)
  - If the difference is above 60 seconds, report the per-file table to the user before any change. After the user agrees, lower Run_Cycles, then N, per the design levers (Property 7 to 60,000, Properties 8 and 9 to 200,000, then Property 7 N to 2, then example Campaigns to 100,000 cycles), keeping every Run_Cycles floor above 30,000. Never lower `numRuns`. Re-measure and report
  - Delete the temporary JSON output file and every debug script or scratch file. Confirm with `git status` that only expected paths changed (`src/engine/`, `scripts/guard.mjs`, `PRIOR_WORK.md`, `fixtures/analog_read/`, the new baseline file). Do not commit
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional extra examples. Every property test, the baseline task and both STOP tasks are mandatory.
- STOP tasks: 11 (compile `analog_read`) and 19 (commit the baseline). The agent never runs `arduino-cli` and never commits.
- Tasks 12 onward that need the `analog_read` HEX check for it at the start and stop to ask if it is missing. No other task needs it.
- Task 19 records the baseline once. Later tasks never regenerate it.
- Passing tests are evidence, not proof. Property tests sample inputs and do not cover every case.
- Property 11 (reference vectors, unchanged existing tests, one example per Gremlin range) is covered by tasks 4.3, 8.3, 15.2, 16.2 and 28 and has no separate property sub-task.
- Property 24 is an emulator property: task 26.6 uses numRuns 20 and Run_Cycles at most 100,000, as the design table states.
- F24 (R10.13 "docs" wording) remains open for the user's decision. The copy test covers user-visible strings only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["4.4"] },
    { "id": 6, "tasks": ["4.5"] },
    { "id": 7, "tasks": ["5.1"] },
    { "id": 8, "tasks": ["5.2"] },
    { "id": 9, "tasks": ["5.3"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2"] },
    { "id": 12, "tasks": ["7.3"] },
    { "id": 13, "tasks": ["7.4"] },
    { "id": 14, "tasks": ["8.1"] },
    { "id": 15, "tasks": ["8.2"] },
    { "id": 16, "tasks": ["8.3"] },
    { "id": 17, "tasks": ["9.1"] },
    { "id": 18, "tasks": ["9.2"] },
    { "id": 19, "tasks": ["9.3"] },
    { "id": 20, "tasks": ["9.4"] },
    { "id": 21, "tasks": ["9.5"] },
    { "id": 22, "tasks": ["9.6"] },
    { "id": 23, "tasks": ["11"] },
    { "id": 24, "tasks": ["12.1"] },
    { "id": 25, "tasks": ["12.2"] },
    { "id": 26, "tasks": ["14.1"] },
    { "id": 27, "tasks": ["14.2"] },
    { "id": 28, "tasks": ["15.1"] },
    { "id": 29, "tasks": ["15.2"] },
    { "id": 30, "tasks": ["16.1"] },
    { "id": 31, "tasks": ["16.2"] },
    { "id": 32, "tasks": ["16.3"] },
    { "id": 33, "tasks": ["16.4"] },
    { "id": 34, "tasks": ["17.1"] },
    { "id": 35, "tasks": ["17.2"] },
    { "id": 36, "tasks": ["17.3"] },
    { "id": 37, "tasks": ["17.4"] },
    { "id": 38, "tasks": ["17.5"] },
    { "id": 39, "tasks": ["17.6"] },
    { "id": 40, "tasks": ["17.7"] },
    { "id": 41, "tasks": ["17.8"] },
    { "id": 42, "tasks": ["17.9"] },
    { "id": 43, "tasks": ["17.10"] },
    { "id": 44, "tasks": ["17.11"] },
    { "id": 45, "tasks": ["19"] },
    { "id": 46, "tasks": ["20.1"] },
    { "id": 47, "tasks": ["20.2"] },
    { "id": 48, "tasks": ["21.1"] },
    { "id": 49, "tasks": ["22.1"] },
    { "id": 50, "tasks": ["22.2"] },
    { "id": 51, "tasks": ["23.1"] },
    { "id": 52, "tasks": ["23.2"] },
    { "id": 53, "tasks": ["23.3"] },
    { "id": 54, "tasks": ["23.4"] },
    { "id": 55, "tasks": ["24.1"] },
    { "id": 56, "tasks": ["24.2"] },
    { "id": 57, "tasks": ["25.1"] },
    { "id": 58, "tasks": ["25.2"] },
    { "id": 59, "tasks": ["26.1"] },
    { "id": 60, "tasks": ["26.2"] },
    { "id": 61, "tasks": ["26.3"] },
    { "id": 62, "tasks": ["26.4"] },
    { "id": 63, "tasks": ["26.5"] },
    { "id": 64, "tasks": ["26.6"] }
  ]
}
```
