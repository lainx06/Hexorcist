# Implementation Plan: emulator-bridge

## Overview

Implement the EmulatorBridge module as the sole TypeScript wrapper around avr8js that loads precompiled ATmega328P firmware and runs it deterministically. The bridge exposes a pure, cycle-accurate interface: load HEX, configure GPIO pin names via a Fixture, step the CPU forward in explicit caller-controlled increments, and emit named, cycle-stamped events for every pin change. All other Hexorcist modules receive only the EmulatorBridgeInterface; avr8js internals never leak past the bridge boundary. Build is Vite + TypeScript, hosting is GitHub Pages (static).

The implementation follows five required tasks, each designed to validate core functionality in isolation before moving to the next. After Task 1, there is an explicit STOP where you compile the Arduino sketch and provide the .hex file. Tasks 2–5 are spikes implementing high-level correctness (determinism, error handling, monitoring, performance). Optional tasks beyond Task 5 convert the remaining design properties into automated tests.

---

## Tasks

- [x] 0. Project Scaffold + Verify avr8js Installation
  - Set up a new Vite + TypeScript project at the workspace root
  - Install exact pinned versions:
    - `avr8js@0.21.1` (pinned exactly, no `^` or `~` range)
    - `fast-check` (latest stable)
    - `vitest` (latest stable)
  - Create `.gitattributes` at workspace root with content: `* text=auto eol=lf`
  - Verify the installed avr8js version and key exported signatures:
    - `CPU` class with `cycles: number`, `pc: u32`, `data: Uint8Array`, `progBytes: Uint8Array`, `tick()`, `reset()`, constructor `(progMem: Uint16Array, sramBytes?: number)`
    - `avrInstruction(cpu: CPU): void` exported from avr8js index
    - `AVRIOPort` class with `addListener(listener: GPIOListener): void`, `pinState(index: number): PinState`, `setPin(index: number, value: boolean): void`
    - `portBConfig`, `portCConfig`, `portDConfig` exported as `AVRPortConfig`
    - `timer0Config`, `timer1Config`, `timer2Config` exported as `AVRTimerConfig`
    - `PinState` enum with values `Low`, `High`, `Input`, `InputPullUp`
  - **If any signature or version differs from design.md, STOP and report the difference. Do not proceed to Task 1.**
  - **Verification checklist:**
    1. version pinning
    2. [5 more items from above]
    3. Search `node_modules/avr8js` for the banned calls `Date.now`, `performance.now`, `setTimeout`, `setInterval`, and `Math.random`. Report all findings (expected: no matches on the paths used by the bridge). Note: the design audit used the GitHub master branch; verify the installed package version matches.
  - _Requirements: 1.1, 1.2_

- [x] 1. Write blink_button.ino
  - Create `fixtures/blink_button/blink_button.ino` with the following behavior:
    - GPIO setup: D2 (PD2) as INPUT_PULLUP (external button, active-low); D13 (PB5) as OUTPUT (LED)
    - When button is held (D2 reads LOW): LED toggles every 100 ms (1.6M cycles at 16 MHz)
    - When button is released (D2 reads HIGH): LED toggles every 500 ms (8M cycles at 16 MHz)
    - At startup: LED is OFF (D13 drives LOW initially)
  - **Implementation notes:**
    - Use `millis()`-based non-blocking timing to exercise Timer0 and its overflow interrupt. Do NOT use `delay()` — blocking waits would prevent the spike from testing real timer hardware behavior. Initialize a timer variable on startup; in the main loop, check if `(millis() - lastToggle) >= interval`, where `interval` is 100 or 500 ms depending on button state. If true, toggle LED and update `lastToggle`.
    - This ensures Timer0 overflow interrupts are handled correctly by avr8js.
  - **After writing the .ino file, STOP here and run:**
    ```
    arduino-cli compile -b arduino:avr:uno --output-dir fixtures/blink_button/build fixtures/blink_button
    ```
  - **Do NOT proceed to Task 2 until you confirm compilation succeeded and provide the .hex file path.**
  - _Requirements: 1.1, 1.2_

- [ ] 2. Minimal EmulatorBridge + Interactive UI (Spike S1+S2)
  - **Part A: EmulatorBridge core**
    - Implement `src/engine/emulator-bridge.ts` with:
      - `EmulatorBridge.create(hex: string, fixture: Fixture, inputEvents?: InputEvent[]): EmulatorBridge | BridgeError` factory
      - `advance(cycles: number): AdvanceResult | BridgeError` method
      - `readonly clockHz: number` property
      - `readonly cycleCount: number` property
    - Implement Intel HEX parser (per design.md spec) in `src/engine/hex-parser.ts` with checksum validation and flash-size checks
    - Define shared domain types in `src/engine/types.ts`: Fixture, PinValue, OutputEvent, InputEvent, AppliedInputEvent, BridgeError, AdvanceResult
    - Construct CPU with ports B, C, D and Timer0, Timer1, Timer2
    - Implement run loop: `avrInstruction` → `cpu.tick()` → pin-change detection → input event drain
    - Emit OutputEvents (ascending cycle order, fixture pin-index tie-break)
    - Record AppliedInputEvent for each applied input
    - Handle typed error discriminated unions for all error kinds
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3_
  - **Part B: Minimal UI (Vite + TypeScript + vanilla HTML/CSS)**

Create `src/ui/index.html` and `src/ui/main.ts`:
- Load the compiled `blink_button.ino.hex` file (fetch or inline it).
- Create a simple fixture: D2 (input, "BUTTON"), D13 (output, "LED").
- Initialize the bridge.
- **On-screen LED**: A `<div>` or SVG circle that visually represents D13. Color changes based on OutputEvents for the LED signal:
  - value 1 (driven high): bright red
  - value 0 (driven low): dark gray
  - value "input" (high-Z, not driven): dim blue
- **On-screen BUTTON**: A `<button>` element labeled "BUTTON". When pressed (mousedown), call `bridge.schedule({ signal: "BUTTON", value: 0, cycle: bridge.cycleCount })`. When released (mouseup), call `bridge.schedule({ signal: "BUTTON", value: 1, cycle: bridge.cycleCount })`. Display button state visually (pressed/unpressed).
- **Run/Pause mode** (instead of step button): A toggle button "Run / Pause". 
  - While running: use `requestAnimationFrame` only to pace the display (refresh rate ~60 fps). On each frame, call `bridge.advance(bridge.clockHz / 60)` to simulate one frame's worth of CPU cycles (approximately 1/60th of a second at 16 MHz ≈ 267,000 cycles). The bridge itself never reads any clock.
  - While paused: do not call `advance()`.
  - Display simulated time as `(bridge.cycleCount / bridge.clockHz).toFixed(3)` seconds. Update in real-time as the simulation runs.

**Constraint:** No complex frameworks. Plain HTML/CSS/TypeScript. Vite handles bundling.

    - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3, 3.5_

  - [ ]* 2.1 Write unit tests for Intel HEX parser
    - Create `src/engine/__tests__/hex-parser.test.ts`
    - Test valid single-record and multi-record HEX files
    - Test extended-segment-address records (record type 02)
    - Test each error condition: empty string, bad checksum, bad record type, missing EOF, flash overflow
    - _Requirements: 6.1, 1.5_

  - [ ]* 2.2 Write unit tests for Fixture validation
    - Create `src/engine/__tests__/fixture.test.ts`
    - Test valid ports B, C, D with bit indices 0–7
    - Test invalid port names outside {B, C, D}
    - Test bit indices at boundaries (0 and 7) and out-of-range (8)
    - _Requirements: 1.5, 6.2_

  - [ ]* 2.3 Write unit tests for advance() edge cases
    - Create `src/engine/__tests__/emulator-bridge.test.ts`
    - Test `advance(0)` returns 0 cycles consumed with cycleCount unchanged
    - Test `advance(-1)` returns 0 cycles consumed with cycleCount unchanged
    - Test very large `requestedCycles` with a no-op program
    - Test cycleCount monotonically increases across multiple advance() calls
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.4 Write unit tests for InputEvent application and initial snapshot
    - In `src/engine/__tests__/emulator-bridge.test.ts`
    - Test single InputEvent applied at exact target cycle
    - Test InputEvent at cycle 0
    - Test two InputEvents at the same target cycle; verify both have same appliedCycle
    - Test initial snapshot: a HEX that never configures a mapped output pin produces a cycle-0 event with value `"input"` for it; blink_button produces a cycle-0 LED event that matches avr8js `pinState` for PB5 before the first instruction.
    - _Requirements: 3.5, 4.1, 4.2, 4.3_

- [ ] 3. Temporary Hard-Coded Monitor + Replay (Spike S3+S4)
  - **Part A: Monitor**

Create `src/engine/__tests__/ledTimeoutMonitor.ts`:
- Consume the OutputEvent stream from a bridge run.
- Track the state of the LED signal: on/off/unknown.
- When LED transitions to ON (value 1), record the cycle count `onCycle`.
- The violation cycle is `onCycle + 4_800_000` (300 ms at 16 MHz = 4.8M cycles).
- **Check for violation continuously**: After each OutputEvent, if the LED is currently ON, check if `cpu.cycles >= onCycle + 4_800_000` (where 4.8M cycles = 300 ms at 16 MHz). If true, emit a BROKE verdict with the violation cycle `onCycle + 4_800_000` and the output events up to that point.
- **If a run ends with no violation detected**, report "no violation in this run" (not HELD; HELD requires multiple gremlin runs and is not applicable here).

**Marker:** Add `// SPIKE: temporary monitor harness — to be replaced by rule-compiler` at the top of the file.

  - **Part B: Replay with AppliedInputEvent list**

In the UI or a new test file, after the first run completes:
1. Extract the HEX, Fixture, and **the complete `AppliedInputEvent` list** from the first run (use `advance()` result's `appliedInputs`).
2. Create a new `EmulatorBridge` instance with the compiled HEX and Fixture.
3. Feed the recorded AppliedInputEvent list to the new bridge. Since AppliedInputEvent has `appliedCycle` set (the actual cycle at which the input was applied), pass these events to `create()` with `cycle = appliedCycle` to ensure they apply at the exact same cycles.
4. Run the exact same total number of cycles as the first run: `bridge.advance(totalCycles)`.
5. **Critical:** Replay must produce the same violation cycle regardless of how `advance()` calls are chunked. Add a check that runs the replay twice with two different chunk sizes (1,000 cycles and 160,000 cycles per call) and compares the violation cycles — they must match exactly.
6. Re-run the monitor on the second run's OutputEvents.
7. **Assert:** The monitor reports the same violation cycle (if any). If the first run had no violation, the second run must also have none.

Display or log: "Violation detected at cycle X. Replay confirmed: same violation at cycle X." or "No violation detected in both runs."

    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 3.1 Write unit tests for monitor BROKE verdict
    - Create `src/engine/__tests__/ledTimeoutMonitor.test.ts`
    - Create a test fixture with LED on for > 300 ms; verify monitor emits BROKE verdict with correct cycle range
    - _Requirements: 5.1_

- [ ] 4. Property-Based Tests (Property 13 + Property 12)
  - Write property-based tests using `fast-check` in `src/engine/__tests__/emulator-bridge.test.ts`:
    - Implement fast-check generators using a **small fixed set of real compiled HEX fixtures** (e.g., blink_button.ino and one or two minimal GPIO-toggle programs). Randomize the Fixture, InputEvent list, and cycle count:
      - `arbitraryFixture()`: generates valid Fixtures by selecting 1–4 real pins from ports B, C, D and randomizing direction (input or output).
      - `arbitraryInputEventList()`: generates sorted lists of InputEvents using signal names from the current fixture, with cycle values from 0 to 100,000.
      - `arbitraryValidHexStub()`: returns a small fixed set of compiled AVR programs (blink_button.ino or similar). Do NOT generate random AVR programs.
      - `arbitraryInputEventWithUnmappedSignal()`: generates InputEvents where the signal name is NOT in the fixture.
    - This approach tests the bridge's logic deterministically against real firmware behavior, rather than random synthetic HEX.
  - **Property 13: Replay Determinism**
    - Comment: `// Feature: emulator-bridge, Property 13: Replay determinism`
    - Test: identical runs with identical inputs produce identical OutputEvent lists
    - Two EmulatorBridge instances created with same HEX, fixture, inputEvents
    - Both advanced the same number of cycles
    - Assert: output events match exactly (same length, each corresponding entry matches on cycle, signal, value)
    - Run with 100+ iterations
    - _Requirements: 5.1, 5.2, 5.3, 1.4_
  - **Property 12: Unmapped-pin error**
    - Comment: `// Feature: emulator-bridge, Property 12: Unmapped-pin returns typed error`
    - Test: InputEvent with unmapped signal returns typed error before execution
    - Generate InputEvents with signal names absent from fixture
    - Assert: EmulatorBridge.create() returns error with `kind === "unmapped-pin"`
    - Run with 100+ iterations
    - _Requirements: 4.4, 6.4_

- [ ] 5. Benchmark Script (Spike S5)
  - **Status:** required spike  
  - **Dependency:** Task 2 complete  
  - **Description:**

Create a standalone benchmark script `bench/benchmark.ts` (outside `src/`). Execute it via Node.js (e.g., `npm run benchmark` runs `node bench/benchmark.ts`).

**Behavior:**

1. Load a small but non-trivial HEX (e.g., blink_button.ino or a simple GPIO-toggle loop).
2. Run the bridge for a fixed number of cycles (e.g., 10 million cycles total).
3. Measure wall-clock elapsed time using Node's `performance.now()` or `Date.now()` (wall-clock timing is ALLOWED ONLY in this benchmark script, outside the bridge and engine).
4. Compute: simulated seconds per real second (speedup factor).
5. Write results to `SPIKE.md` at the project root:
   ```
   # Benchmark Results

   - **Simulated seconds per real second:** X.XX
   - **avr8js version:** 0.21.1
   - **Node version:** <version>
   - **Test date:** YYYY-MM-DD
   ```

**Constraint:** Wall-clock timing is BANNED everywhere in the bridge and engine. This script is the ONLY exception — mark it clearly with `// SPIKE: wall-clock timing allowed ONLY in this benchmark script` at the top.

**Execution:** Run via `npm run benchmark` or directly as `node bench/benchmark.ts`. Output is written to the project root.

**Success Criteria:**
- Script runs without error.
- SPIKE.md is generated with realistic speedup numbers (expect 100–1000x speedup on modern hardware, depending on system).

    - _Requirements: 2.3, 7.1, 7.2, 7.3_

---

## Optional Tasks (After Task 5)

Remaining correctness properties from design.md, each converted into one automated test:

- [ ]* 6. Property 1: clockHz passthrough and default
  - Write property test: any Fixture with numeric `clockHz` > 0 produces bridge with same `clockHz`; omitted `clockHz` defaults to 16 000 000
  - _Requirements: 1.3_

- [ ]* 7. Property 2: Invalid inputs produce typed errors, never throw
  - Write property test: generate corrupted HEX (bad checksums, bad record types, missing EOF); assert returns BridgeError, never throws
  - _Requirements: 1.5, 6.1, 6.4_

- [ ]* 8. Property 3: cycleCount is monotonically non-decreasing
  - Write property test: sequence of advance() calls; cycleCount after each >= cycleCount before
  - _Requirements: 2.2_

- [ ]* 9. Property 4: advance(N) consumes at least N cycles for positive N
  - Write property test: positive integer N; `advance(N).cyclesConsumed >= N`
  - _Requirements: 2.4_

- [ ]* 10. Property 5: advance of zero or negative returns no cycles consumed
  - Write property test: N ≤ 0; `advance(N).cyclesConsumed === 0` and cycleCount unchanged
  - _Requirements: 2.5_

- [ ]* 11. Property 6: All OutputEvent fields are well-formed
  - Write property test: every OutputEvent has signal in Fixture, value is 0 or 1, cycle is non-negative integer
  - _Requirements: 3.1, 3.4_

- [ ]* 12. Property 7: Output events for the same signal strictly alternate values
  - Write property test: subsequence of OutputEvents for a single signal; no two consecutive events have same value
  - _Requirements: 3.2_

- [ ]* 13. Property 8: OutputEvents sorted by cycle, ties by fixture pin-index
  - Write property test: full outputEvents array is sorted ascending by cycle; ties broken by pin-index
  - _Requirements: 3.3_

- [ ]* 14. Property 9: Initial snapshot emits one cycle-0 event per output pin
  - Write unit test: any valid HEX and Fixture with ≥1 output pin; first advance() includes cycle-0 event for each output pin
  - _Requirements: 3.5_

- [ ]* 15. Property 10: AppliedInputEvent appliedCycle >= target cycle
  - Write property test: every AppliedInputEvent has `appliedCycle >= cycle`
  - _Requirements: 4.1, 4.2_

- [ ]* 16. Property 11: Co-scheduled InputEvents share same appliedCycle
  - Write property test: two InputEvents with same target cycle; verify both have equal appliedCycle
  - _Requirements: 4.3_

- [ ]* 17. Property 14: Corrupted HEX checksum returns invalid-hex error
  - Write property test: take valid HEX, flip any single byte in checksum field; assert returns `kind === "invalid-hex"`
  - _Requirements: 6.1_

- [ ]* 18. Property 15: Unsupported capability returns typed error
  - Write unit test: query capability not in SupportedCapability union; assert returns BridgeError with `kind === "unsupported-capability"`, never throws
  - _Requirements: 6.3, 6.4_

---

## Notes

- **Stop points:** Task 1 has an explicit STOP where the user must compile blink_button.ino via arduino-cli. Do not auto-proceed to Task 2 until the user confirms the .hex file is available.
- **No implementation yet:** tasks.md is for approval only. Implementation tasks 0–5 begin only after this document is approved.
- **Spike labeling:** Tasks 2, 3, and 5 are labeled as spikes (S1, S2, S3, S4, S5). Future spec work will replace or generalize these.
- **Determinism in tests:** Property-based tests use seeded PRNG from fast-check; DO NOT use Math.random.
- **Error paths:** Every task constructing a bridge must handle both success and error paths (BridgeError).
- **Test tasks marked with `*`:** These are optional sub-tasks and can be skipped for faster MVP. Core bridge implementation (tasks 0–2 Part A and Part B basics, 3, 4) must be completed.
- **avr8js pinning:** Task 0 verifies that installed avr8js is exactly version 0.21.1. No other version is supported by this design.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["0"] },
    { "id": 1, "tasks": ["1"] },
    { "id": 2, "tasks": ["2"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.3", "2.4", "3", "4", "5"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"] }
  ]
}
```

---

## Completion

Once tasks 0–5 are approved and completed, the EmulatorBridge will be fully functional with core correctness properties validated via property-based tests. Optional tasks (6–18) add coverage for the remaining design properties and can be completed incrementally. The bridge is ready for integration with the gremlin scheduler, rule monitor, and trace replayer modules once Task 5 is complete.
