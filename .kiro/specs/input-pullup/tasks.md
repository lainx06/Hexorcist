# Implementation Plan

## Overview

Fix undriven input pins reading LOW under pull-up, using explore, preserve, implement, validate. Constraints for every task:
- Only touch `src/engine/`, `src/ui/main.ts`, new test files, the new baseline `src/engine/__tests__/baselines/input-pullup-preservation.json` (task 2), `scripts/guard.mjs` (user-authorized, task 9.4 only), and the new sketch `fixtures/floating_input/floating_input.ino`. Existing fixtures are not modified.
- Do not modify, weaken or delete any existing test. Smoke and spike tests get new cases only, in new files. If a test and the system disagree, stop and report what the test expects, what happened, and the evidence. Wait for the user's decision.
- Tests are evidence, not proof. Do not describe passing tests as proof of correctness.
- Time is integer CPU cycles. No `Math.random`, `Date.now`, `performance.now` or `setTimeout` in engine code. All randomness comes from an explicitly passed seed.
- Delete every temporary debug script before reporting the work done.
- Do not commit. The user will not commit until the fix tasks pass. No task in this plan commits.
- Failing tests are written and shown failing before any fix code is written.
- Before the fix, `"release"` is not in the `InputEvent.value` type and `diagnostics` is not in `AdvanceResult`. New tests use narrow casts (for example `as unknown as InputEvent`) so they compile and fail at runtime for the right reason.
- No hand-assembled HEX anywhere. The only new HEX is `fixtures/floating_input/build/floating_input.ino.hex`, compiled by the user. If it is missing when a dependent task needs it, stop and ask the user to compile it. There is no fallback and no downgraded verdict.
- Verdict strings are exact. BROKE shows the trace that caused it. HELD reads "No violation found in N runs of this gremlin set. Not a proof." with the real N. COULDN'T TELL gives the reason.
- Diagnostic shape: `{ kind: "floating-input", signal, cycle, register }`. `register` is `"PINB"`, `"PINC"` or `"PIND"`. At most one diagnostic per signal per run. `cycle` is the earliest covering PIN register read.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Idle blink_button presents BUTTON HIGH under pull-up
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: The bug is deterministic, so scope the property to the concrete case: `fixtures/blink_button/build/blink_button.ino.hex`, BUTTON = port D bit 2 input, LED = port B bit 5 output, BUTTON released (no input events), 20,000,000 cycles
  - Create `src/engine/__tests__/input-pullup.test.ts`. Load the HEX and build the fixture the same way the existing smoke test does
  - Bug condition from design: `isBugCondition` holds when the pin is released, `pinState = InputPullUp`, and the presented level is not HIGH
  - Assert expected behavior: LED toggle spacing matches the released cadence, 8,000,000 cycles within 1% (the rate the existing "Released" smoke test observes with BUTTON driven to 1). Assert the spacing is NOT within 1% of the held cadence, 1,600,000 cycles
  - Also assert the LED event list equals the one from a bridge with BUTTON driven to 1 at cycle 0, as a second view of the same property
  - Run the test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found, for example "no events: LED toggles about every 1,600,000 cycles instead of 8,000,000"
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.10_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Driven 0 and driven 1, outputs, errors and snapshot unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create `src/engine/__tests__/input-pullup.property.test.ts` (fast-check is already in the repo)
  - Observe on UNFIXED code: BUTTON driven 0 at cycle 0 gives the held cadence (1,600,000 cycles apart, within 1%) and BUTTON driven 1 at cycle 0 gives the released cadence (8,000,000 cycles apart, within 1%). Record the exact `outputEvents` and `appliedInputs`
  - Observe on UNFIXED code: the cycle-0 snapshot, `schedule()` and `supports()` results for values 0 and 1, and the `BridgeError` kinds for bad HEX, unmapped signal, unsupported port or capability, past-cycle schedule and overflow
  - Baseline file (written once): on UNFIXED code, generate 25 seeded cases with fast-check (the seed is a fixed constant in the test) of event lists over 0 and 1 on BUTTON, each including a cycle-0 drive. Run them and save `outputEvents`, `appliedInputs` and `cyclesConsumed` for each case to `src/engine/__tests__/baselines/input-pullup-preservation.json`
  - The baseline file is written once, in this task, on UNFIXED code. It is never regenerated after the fix. No later task, including the post-fix re-run in 9.8, may rewrite, refresh or delete it. If a post-fix run disagrees with it, stop and report (see Overview)
  - Write property-based tests that replay the same 25 cases (same fixed seed, same generator) and compare `outputEvents`, `appliedInputs` and `cyclesConsumed` to the baseline file. On top of that, a property over event lists restricted to 0 and 1 on BUTTON that include a cycle-0 drive: `outputEvents` and `appliedInputs` equal the recorded baseline, `cyclesConsumed` is unchanged
  - Property: for driven 0 and driven 1 inputs, `diagnostics` is absent or empty. Guard the check so it also runs on unfixed code, where `diagnostics` is undefined
  - Add example-based cases for the error kinds and the cycle-0 snapshot with the recorded values
  - No git commands inside any test file. The existing suites (`emulator-bridge.smoke`, `emulator-bridge.property`, `spike-monitor`) are checked by the agent, not by a test: at the end of this task the agent itself runs `git diff --stat` on those existing test files, expects no changes, and reports the output
  - Verify the tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Write release event test (uses the existing blink_button HEX)
  - **Property 1: Bug Condition** - A "release" event returns the pin to the level its configuration implies
  - Add to `src/engine/__tests__/input-pullup.test.ts`. Use `blink_button.ino.hex` and the same fixture as task 1. Cast `"release"` events as described in the Overview
  - Assert: events `[{BUTTON, 0, c1}, {BUTTON, "release", c2}]` (cycles after setup has enabled the pull-up) give the held cadence (1,600,000 cycles spacing, within 1%) between c1 and c2 and the released cadence (8,000,000 cycles spacing, within 1%) after c2
  - Assert: `schedule()` accepts `"release"` and still rejects unmapped signals and past cycles with the existing error kinds
  - Assert: with BUTTON driven 0 or 1, firmware DDR/PORT writes do not change the driven level
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (`"release"` is not honored on unfixed code)
  - Document the counterexample
  - _Requirements: 1.3, 2.3, 2.5, 3.5, 3.6_

- [x] 4. Write the floating_input sketch, then STOP for the user to compile
  - Create `fixtures/floating_input/floating_input.ino`. Write only this one file. Do not create the `build/` directory or any HEX. Do not run `arduino-cli` or any compiler
  - Sketch per design (see "Floating-Pin Fixture"):
    - D13 is an output (the LED, port B bit 5)
    - D3: `pinMode(3, INPUT)` (no pull-up), read with `digitalRead(3)` on every `loop()` pass, with the result stored in a `volatile` variable so the PIND read stays in the binary
    - D4: `pinMode(4, INPUT)` for the earliest 100 ms, then `pinMode(4, INPUT_PULLUP)` once (switch made in `loop()` from `millis() >= 100`)
    - The loop reads D4 and turns the LED on (D13 HIGH) when D4 reads HIGH, off otherwise
  - Write original code and comments. No third-party logos, names or music. No banned words in comments (safe, secure, guaranteed, certified, real-time, first, unique, shortest)
  - Do not edit any other file in this task
  - **STOP. The agent must not proceed to any later task.** Tell the user the sketch is written, and ask them to compile it with this command, then wait for them to confirm:
    ```
    arduino-cli compile -b arduino:avr:uno --output-dir fixtures/floating_input/build fixtures/floating_input
    ```
  - Do not run `arduino-cli` itself. Do not hand-assemble, generate or copy a HEX
  - Do not start tasks 5, 6, 7, 8 or 9 until the user confirms the compile. When the user confirms, check that `fixtures/floating_input/build/floating_input.ino.hex` exists. If it does not, stop and ask again. There is no fallback
  - _Requirements: 2.9_

- [x] 5. Write floating-input diagnostic test (needs the user-compiled HEX)
  - **Property 1: Bug Condition** - Released plain input presents LOW and records one floating-input diagnostic per signal
  - **Dependency**: runs only after the user confirmed the compile in task 4. Load `fixtures/floating_input/build/floating_input.ino.hex`. If the file is missing, stop and ask the user to compile. Do not skip the test, weaken it, or substitute another HEX
  - Add `src/engine/__tests__/floating-input.test.ts`. Fixture (pin maps are fixture data in the test file): LED = port B bit 5 output, D3_IN = port D bit 3 input, D4_IN = port D bit 4 input. No scheduled input events
  - Assert for D3_IN: `diagnostics` holds exactly one `{ kind: "floating-input", signal: "D3_IN", cycle, register: "PIND" }` with an integer `cycle`
  - Assert for D4_IN before the pull-up is enabled: the presented level is LOW, and `diagnostics` holds one `{ kind: "floating-input", signal: "D4_IN", cycle, register: "PIND" }` whose `cycle` is before the cycle at which the pull-up is enabled. Do NOT assert that this cycle equals a specific read: D3 and D4 share PIND, so it may come from a read aimed at D3
  - Assert for D4_IN after the pull-up: the presented level is HIGH (the LED turns on), and no new D4_IN diagnostic appears after that point
  - Assert the shape of every diagnostic is `{ kind, signal, cycle, register: "PIND" }`, there is at most one per signal per run, and `cycle` is the earliest occurrence (a later read does not add or move an entry). Same-cycle order follows fixture pin index (D3_IN, then D4_IN)
  - Assert: the same HEX with D3_IN and D4_IN driven 0 or 1 at cycle 0 gives no diagnostic
  - Assert: `advance(0)` returns an empty `diagnostics` array
  - Note in a test comment: diagnostics are per PIN register read, not per bit, so with several released inputs on one port a diagnostic can be recorded for a pin the firmware did not mean to read
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (`diagnostics` is undefined on unfixed code)
  - Document the counterexample
  - _Requirements: 1.4, 1.6, 2.4, 2.4a, 2.8, 2.9_

- [x] 6. Write late pull-up test (needs the user-compiled HEX)
  - **Property 1: Bug Condition** - Presented level tracks the firmware's pull-up change after the run starts
  - **Dependency**: runs only after the user confirmed the compile in task 4. Use the same `fixtures/floating_input/build/floating_input.ino.hex` and fixture as task 5. Do not hand-assemble a second HEX. If the file is missing, stop and ask the user to compile
  - Add to `src/engine/__tests__/floating-input.test.ts`
  - Use `outputEvents` on the LED (B5) to see the D4_IN level, so the test does not read avr8js directly
  - Assert: before the pull-up (earliest 100 ms) D4_IN reads LOW (LED off) with one D4_IN diagnostic. After the pull-up D4_IN reads HIGH (LED on) with no second D4_IN diagnostic
  - Assert: driving D4_IN to 0 at cycle 0 keeps the LED off after the pull-up, and a `"release"` event afterwards (cast) turns it on
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (on unfixed code D4_IN stays LOW and `"release"` is not honored)
  - Document the counterexample
  - _Requirements: 1.5, 1.6, 2.5, 2.8_

- [x] 7. Write hook chaining and no-under-report tests
  - **Property 5: Chaining** - A pre-existing PIN read hook is preserved and its return value is what the firmware sees
  - **Property 4: No under-report** - Every read of a PIN register containing a released, non-pulled-up input is covered by that signal's diagnostic, with at most one per signal
  - Add `src/engine/__tests__/hook-chaining.test.ts`. The avr8js types stay inside the bridge, so the tests use the test-only construction path `EmulatorBridge.createWithTestHooks(hex, fixture, inputEvents, hooks)` (see task 9.4). `hooks.pinReadStubs` installs stub read hooks on PINB, PINC or PIND, and `hooks.portListeners` adds listeners to port B, C or D, both after the ports are built and before the bridge wraps the read hook. Before the fix this method does not exist, so the tests reach it through a narrow cast and fail for that reason
  - Chaining, part A (uses `blink_button.ino.hex`, no new HEX needed): install a stub read hook on PIND (`pinReadStubs.PIND`) that returns a value with bit 2 clear. Assert the firmware sees the stub's value, shown by the LED holding the held cadence (1,600,000 cycles spacing, within 1%) even though BUTTON is released with the pull-up on. Assert the stub was called with the PIND address
  - Chaining, part B (**depends on task 4**: uses `floating_input.ino.hex`): with a stub PIND hook installed, assert the stub value is still returned and the D3_IN diagnostic still fires. If the HEX is missing, stop and ask the user to compile
  - Chaining, part C: a listener passed in `portListeners` (for example `portListeners.D`) still runs on DDR/PORT writes after the bridge adds its own
  - No-under-report property (**depends on task 4**), using fast-check with the seed passed explicitly: for random `advance()` chunkings and random ordered event lists over 0, 1 and `"release"` on D3_IN and D4_IN, count PIND reads with a counting stub hook passed as `pinReadStubs.PIND` to `createWithTestHooks`. Whenever a PIND read occurs while a released signal has `pinState = Input`, assert `diagnostics` holds an entry for that signal with `cycle` at or before that read. Assert at most one entry per signal. Over-report is allowed and is not asserted against
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (`createWithTestHooks` does not exist, no `diagnostics`)
  - Document the counterexample
  - _Requirements: 2.4, 2.4a, 3.3, 3.4_

- [x] 8. Write replay determinism test including diagnostics (needs the user-compiled HEX)
  - **Property 3: Replay Determinism** - Fresh bridge, same HEX, fixture and ordered events give identical outputs and diagnostics
  - **Dependency**: the `floating_input` part runs only after the user confirmed the compile in task 4. If the file is missing, stop and ask. The `blink_button` part needs no new HEX
  - Add to `src/engine/__tests__/input-pullup.property.test.ts`
  - Property-based test with fast-check, seeds passed explicitly: random ordered event lists over `0`, `1` and `"release"` on BUTTON (`blink_button`) and on D3_IN and D4_IN (`floating_input`). Two fresh bridges with the same `advance()` sequence must produce identical `outputEvents`, `appliedInputs` and `diagnostics` (kind, signal, cycle, register)
  - Replay from `appliedInputs`: build a fresh bridge from the same HEX, fixture and the recorded `appliedInputs` (including `"release"`), with no snapshots, and compare `outputEvents` and `diagnostics`
  - Property: no signal appears in `diagnostics` more than once per run, and every diagnostic cycle is an integer within the run
  - Property: output and diagnostic ordering is the same across different `advance()` chunkings of the same total cycles
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL on unfixed code (`diagnostics` and `"release"` are missing). Cases that avoid both may pass. Record which
  - _Requirements: 2.6_

- [x] 9. Fix for undriven input pins reading LOW under pull-up
  - **Precondition**: tasks 1 to 8 are written and shown failing (task 2 shown passing). No fix code before that

  - [x] 9.1 Add types in `src/engine/types.ts`
    - Add `export type InputValue = 0 | 1 | "release";` and set `InputEvent.value: InputValue`
    - Add `FloatingInputDiagnostic { kind: "floating-input"; signal: string; cycle: number; register: string }` (`register` is `"PINB"`, `"PINC"` or `"PIND"`) and `export type Diagnostic = FloatingInputDiagnostic;`
    - Add `diagnostics: Diagnostic[]` to `AdvanceResult`. It is always present, possibly empty
    - _Bug_Condition: isBugCondition(input) where pin is released and config IN { InputPullUp, Input } and the presented level or diagnostic is wrong_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: Preservation Requirements from design (existing callers compile unchanged because the type only widens)_
    - _Requirements: 2.3, 2.4, 3.5_

  - [x] 9.2 Add released-pin model in `src/engine/emulator-bridge.ts`
    - Add `_extState` (per fixture pin, `"released" | 0 | 1`, all `"released"` at creation), `_floatingReported: Set<string>` and `_pendingDiagnostics: Diagnostic[]`
    - Add `_applyInput(pinIdx, value)`: 0 or 1 stores the state and calls `setPin(bit, value === 1)` as today. `"release"` stores `"released"` and calls `_presentReleased(pinIdx)`
    - Add `_presentReleased(pinIdx)`: read `port.pinState(bit)` and call `port.setPin(bit, state === PinState.InputPullUp)`. Leave `High` and `Low` states alone
    - In `create()`, after the `AVRIOPort` constructors, add a listener (`port.addListener`) on each port with fixture input pins that re-runs `_presentReleased` for released input pins on that port. Skip driven pins. After construction call `_presentReleased` once for every input pin
    - Keep all avr8js use inside this file, behind `EmulatorBridge`
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: driven 0 and 1 go through the same `setPin` call as today_
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.1, 3.2_

  - [x] 9.3 Add chained read hook, diagnostics and result plumbing
    - After the `AVRIOPort` constructors (they overwrite DDR, PORT and PIN write hooks, so install nothing earlier), install a chained read hook on `cpu.readHooks[portConfig.PIN]` for each port with fixture input pins, in the order B, C, D. Capture `prev = cpu.readHooks[PIN]`. Inside the wrapper: if `prev` exists call `prev(addr)` first and keep its value, else use `cpu.data[addr]`. Then, for each released input pin on that port with `pinState = Input` and a signal not in `_floatingReported`, in ascending fixture pin index, add the signal to the set and push `{ kind: "floating-input", signal, cycle: cpu.cycles, register }`. Return the original value unchanged
    - Do not add write hooks. Observe DDR/PORT only through `port.addListener`
    - `register` comes from a small constant table keyed by port letter (`PINB`, `PINC`, `PIND`)
    - Move `_pendingDiagnostics` into the result in `advance()` and clear it. Return `diagnostics` on every path, including `requestedCycles <= 0`
    - Re-export `InputValue`, `Diagnostic` and `FloatingInputDiagnostic` from the bridge module
    - Add a code comment stating the per-register read limit (may over-report, never under-reports) and that avr8js `pinState()` does not model the MCUCR PUD bit
    - Keep `create()` and `schedule()` checks as they are. `"release"` goes through the same unmapped-pin and past-cycle checks
    - Use only integer cycles, no `Date.now`, `Math.random` or network calls
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: error kinds, output events and the cycle-0 snapshot are unchanged_
    - _Requirements: 2.4, 2.4a, 2.6, 3.3, 3.4, 3.6, 3.7_

  - [x] 9.4 Add the test-only construction path for chaining tests
    - The shape is fixed. Add to `EmulatorBridge` in `src/engine/emulator-bridge.ts`:
      ```ts
      static createWithTestHooks(
        hex: string,
        fixture: Fixture,
        inputEvents: InputEvent[],
        hooks: {
          pinReadStubs?: Partial<Record<"PINB" | "PINC" | "PIND", (addr: number) => number>>;
          portListeners?: Partial<Record<"B" | "C" | "D", (value: number, oldValue: number) => void>>;
        },
      ): EmulatorBridge
      ```
      Use the same parameter and return types as `create()` for `hex`, `fixture`, `inputEvents` and the result (match whatever `create()` declares, including any `Result` wrapper)
    - JSDoc on the method: `@internal test-only`
    - Stubs and listeners are installed after the `AVRIOPort` constructors and before the bridge wraps the read hook, so the bridge's wrapper chains onto the stub. Plain functions only. avr8js types stay inside `emulator-bridge.ts`
    - `createWithTestHooks` shares all code with `create()` except installing the stubs and listeners (for example both call one private builder that takes optional hooks). `create()` behaves the same as before when the hooks are absent
    - Do not edit the tests from task 7 to fit the path. If the path does not match what the tests expect, stop and report what the test expects, what happened and the evidence, then wait
    - Extend `scripts/guard.mjs` (user-authorized for this spec) with an isolation check: the string `createWithTestHooks` may appear only in `src/engine/emulator-bridge.ts` and in files under `src/engine/__tests__/`. Any other file under `src/` that contains it is a finding, and the script exits 2 as it does for its other findings. Keep the existing checks unchanged. Run `node scripts/guard.mjs` and report the result
    - _Requirements: 2.4, 3.3_

  - [x] 9.5 Update the UI in `src/ui/main.ts`
    - `initBridge()` calls `EmulatorBridge.create(hexData, FIXTURE)` with no cycle-0 BUTTON event
    - Rename `scheduleButtonUp` to `scheduleButtonRelease`. It schedules `{ signal: 'BUTTON', value: 'release', cycle: bridge.cycleCount }`. Bind it to `pointerup`, `pointerleave` and the Space `keyup`. Pointer-down and keydown keep scheduling value 0
    - Replace the SPIKE workaround comment with one saying the bridge now models the pull-up, so the UI never drives BUTTON = 1 to fake a released button
    - Add no UI copy. Any comment or text avoids the words safe, secure, guaranteed, certified, real-time, first, unique and shortest
    - Add a source-check test in a new file, `src/engine/__tests__/ui-input-pullup.source.test.ts`: no BUTTON event at cycle 0 in `initBridge()`, release scheduled from `pointerup`, `pointerleave` and Space `keyup`, and the pull-up comment present. The UI has no browser harness in the repo, so state that this checks source text only
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: pointer-down and keydown still drive BUTTON = 0_
    - _Requirements: 1.3, 2.3, 2.7_

  - [x] 9.6 Verify bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Released inputs present the level their configuration implies
    - **IMPORTANT**: Re-run the SAME tests from tasks 1, 3, 5 and 6 - do NOT write new tests and do NOT edit them to pass
    - The tests encode the expected behavior. When they pass, the expected behavior is satisfied for the cases covered
    - **EXPECTED OUTCOME**: Tests PASS. If a test and the system disagree, stop and report what the test expects, what actually happened, and the evidence, then wait for a decision
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_

  - [x] 9.7 Verify chaining and no-under-report tests now pass
    - **Property 4: No under-report** and **Property 5: Chaining**
    - **IMPORTANT**: Re-run the SAME tests from task 7 - do NOT write new tests and do NOT edit them to pass
    - **EXPECTED OUTCOME**: Tests PASS. If not, stop and report expected, actual and evidence
    - _Requirements: 2.4, 2.4a, 3.3, 3.4_

  - [x] 9.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Driven pins, outputs and error paths unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - The baseline file `src/engine/__tests__/baselines/input-pullup-preservation.json` was written once in task 2 on UNFIXED code. Do NOT regenerate, refresh or edit it here. The re-run compares post-fix output to that same file
    - Run the existing suites unmodified: `emulator-bridge.smoke`, `emulator-bridge.property`, `spike-monitor`
    - The agent runs `git diff --stat` on the existing test files (no git commands inside test files) and expects no changes. The required report of this output is in task 11
    - **EXPECTED OUTCOME**: Tests PASS (no regressions seen in the cases covered)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 9.9 Verify replay determinism now passes
    - **Property 3: Replay Determinism** - Identical outputs and diagnostics on replay
    - **IMPORTANT**: Re-run the SAME tests from task 8 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS
    - _Requirements: 2.6_

- [x] 10. Spike monitor idle-run check (new cases only)
  - Add a new test file, for example `src/engine/__tests__/input-pullup.spike.test.ts`. Do not edit `spike-monitor.test.ts`
  - Run the LED-timeout monitor on the idle `blink_button` run with no workaround event, 20,000,000 cycles, and compare against the existing "Released" result observed with BUTTON driven to 1
  - Assert LED toggle spacing on the idle run is 8,000,000 cycles within 1%, and not within 1% of 1,600,000 cycles
  - Report the monitor result using only the exact verdict strings from the Overview
  - _Requirements: 2.2, 3.8_

- [x] 11. Cleanup and checkpoint - Ensure all tests pass
  - Run the type check and the full test suite once with `vitest --run` (single execution, no watch mode)
  - Delete every temporary debug script and scratch file created during the work. Confirm with `git status` that only these changed: `src/engine/`, `src/ui/main.ts`, new test files, the baseline `src/engine/__tests__/baselines/input-pullup-preservation.json`, `scripts/guard.mjs` (user-authorized), `fixtures/floating_input/floating_input.ino` and the user-built `fixtures/floating_input/build/`. Do not commit
  - The agent runs `git diff --stat` on the existing test files (`emulator-bridge.smoke`, `emulator-bridge.property`, `spike-monitor`), expects no changes, and reports the output. No git commands inside any test file
  - Confirm the baseline JSON is the version written in task 2 (it was not regenerated)
  - Report results as evidence, not proof. Record the per-register read limit
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Applies to all tasks: the engine-tests-on-save hook runs vitest whenever a file under `src/engine` is saved. During tasks 1-8 some tests fail by design. Do not react to that hook output, and do not change code or tests because of it.
- Tasks 1, 3, 5, 6, 7 and 8 are expected to fail on unfixed code. Task 2 is expected to pass on unfixed code.
- Task 4 ends with a hard STOP. Tasks 5 to 9 that need the floating_input HEX wait for the user's confirmation that they compiled it. The agent never runs `arduino-cli`.
- Diagnostics are per PIN register read, not per bit. This is an accepted limitation in the design: it may over-report and never under-reports.
- The UI has no browser harness, so task 9.5 checks source text only.
- No commits until the fix tasks pass, and then only when the user asks.
- Passing tests are evidence, not proof.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] },
    { "id": 1, "tasks": ["4"] },
    { "id": 2, "tasks": ["5", "6", "7", "8"] },
    { "id": 3, "tasks": ["9.1"] },
    { "id": 4, "tasks": ["9.2"] },
    { "id": 5, "tasks": ["9.3"] },
    { "id": 6, "tasks": ["9.4"] },
    { "id": 7, "tasks": ["9.5"] },
    { "id": 8, "tasks": ["9.6", "9.7", "9.8", "9.9", "10"] },
    { "id": 9, "tasks": ["11"] }
  ]
}
```
