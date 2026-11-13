# Bugfix Requirements Document

## Introduction

The emulator bridge reads input bits from the value last passed to the underlying emulator's `setPin()`, which starts at 0. On a real ATmega328P, a pin configured with the internal pull-up (`pinMode(pin, INPUT_PULLUP)`) reads HIGH when nothing drives it. So with `fixtures/blink_button/build/blink_button.ino.hex`, BUTTON = port D bit 2 (input) and LED = port B bit 5 (output), and no scheduled input events, the bridge presents BUTTON as LOW. The firmware sees "button held" and toggles the LED about every 1,600,000 cycles over a 20,000,000 cycle run. The UI and tests currently work around this by driving BUTTON = 1 at cycle 0.

The fix gives every Fixture input pin an external state of "released" (not driven), driven 0, or driven 1. The bridge derives the presented level of a released pin from the pin's configuration. A released pin with no pull-up is floating. The bridge presents it LOW and records a diagnostic, and never guesses HIGH.

Scope: changes are limited to `src/engine/`, `src/ui/main.ts`, new test files, and the new `fixtures/floating_input/` directory (new files only, explicitly authorized by the user). Existing fixtures are not modified. Simulated time stays in integer CPU cycles, no `Math.random` or `Date.now` in engine code, and avr8js stays behind `EmulatorBridge`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an input pin has no scheduled input events and the firmware has enabled its internal pull-up (avr8js pinState `InputPullUp`) THEN the system presents the pin as LOW, so an unconnected, released button reads as held.

1.2 WHEN `blink_button.ino.hex` runs with BUTTON = port D bit 2 input, LED = port B bit 5 output, no scheduled input events, and 20,000,000 cycles are advanced THEN the system toggles the LED about every 1,600,000 cycles (the "button held" rate).

1.3 WHEN a caller needs to model a released button THEN the system offers no way to express "not driven". `InputEvent.value` accepts only 0 or 1, so callers must drive BUTTON = 1 at cycle 0 and cannot represent a release.

1.4 WHEN an input pin is read while the firmware has not enabled the pull-up and nothing drives the pin THEN the system presents LOW silently and gives no indication that the pin is floating.

1.5 WHEN the firmware enables the pull-up on a pin after the run starts (for example in `setup()`) THEN the system has no released-pin logic, so no change in the presented level can follow the DDR/PORT change.

1.6 WHEN a sketch reads one input with no pull-up (D3) and another input that is plain INPUT for the earliest 100 ms and then INPUT_PULLUP (D4) THEN the system has no released-pin logic and no diagnostic shape that carries the register, so neither the floating read nor the later pull-up is reported or reflected.

### Expected Behavior (Correct)

2.1 WHEN an input pin is released and the firmware has enabled its internal pull-up (avr8js pinState `InputPullUp`) THEN the system SHALL present the pin as HIGH.

2.2 WHEN `blink_button.ino.hex` runs with BUTTON = port D bit 2 input, LED = port B bit 5 output, no scheduled input events, and 20,000,000 cycles are advanced THEN the system SHALL present BUTTON as HIGH once the firmware has enabled the pull-up, and SHALL NOT toggle the LED at the "button held" rate.

2.3 WHEN a Fixture is loaded THEN the system SHALL give every Fixture input pin an external state of "released", driven 0, or driven 1. All inputs SHALL start "released". `InputEvent.value` SHALL accept `0 | 1 | "release"`, and a "release" event SHALL return the pin to the "released" state at its scheduled cycle.

2.4 WHEN an input pin is released, the firmware has not enabled the pull-up (avr8js pinState `Input`), and a read of the PIN register containing that pin occurs THEN the system SHALL present the pin as LOW (the avr8js default) and SHALL record a diagnostic `{ kind: "floating-input", signal, cycle, register }` in `AdvanceResult.diagnostics`, where `register` names the PIN register read (for example `"PIND"`) and `cycle` is the cycle of the earliest such read. The system SHALL record exactly one floating-input diagnostic per signal per run, and SHALL NOT record a second one for the same signal in the same run. It SHALL NOT present a floating pin as HIGH.

2.4a The floating-input diagnostic means "a read of the PIN register containing this released, non-pulled-up pin occurred". Accepted limitation: detection is per register, not per bit, so it MAY over-report (a read of the register for another bit of the same port can trigger it, which leads to a COULDN'T TELL verdict downstream). It SHALL NOT under-report: every read of a PIN register containing a released, non-pulled-up input pin SHALL be covered by the diagnostic for that signal.

2.5 WHEN the firmware changes DDR or PORT for a released input pin THEN the system SHALL update the presented level of that pin to match the new pin state: HIGH when the pull-up becomes enabled, LOW (with the floating diagnostic on a read) when it becomes plain input.

2.6 WHEN a run is replayed with a fresh emulator, the same HEX, the same Fixture, and the same ordered event list THEN the system SHALL produce the same outputs and the same `diagnostics` (kind, signal, cycle) as the original run.

2.7 WHEN the UI releases the button (pointerup, pointerleave, keyup) THEN the UI SHALL schedule a "release" event. The UI SHALL NOT drive BUTTON = 1 at cycle 0, and `src/ui/main.ts` SHALL keep a comment saying the bridge now models the pull-up.

2.8 WHEN `fixtures/floating_input/build/floating_input.ino.hex` runs with Fixture LED = port B bit 5 (output), D3_IN = port D bit 3 (input), D4_IN = port D bit 4 (input), and no scheduled input events THEN the system SHALL:
- record a floating-input diagnostic for D3_IN;
- present D4_IN as LOW and record a floating-input diagnostic for D4_IN before the firmware enables its pull-up;
- present D4_IN as HIGH after the pull-up is enabled, with no new diagnostic for D4_IN after that point (and none beyond the one per signal per run).

2.9 WHEN the floating-input test HEX is needed THEN it SHALL be a precompiled `fixtures/floating_input/build/floating_input.ino.hex` built from a new sketch `fixtures/floating_input/floating_input.ino`. It SHALL NOT be hand-assembled. The sketch SHALL: set D13 as output; set D3 as INPUT (no pull-up) and read it every loop; set D4 as INPUT for the earliest 100 ms and then INPUT_PULLUP; and turn the LED on when D4 reads HIGH.

2.10 WHEN tests for this fix are written THEN the failing tests (blink_button released-button behavior, floating-input diagnostics, floating_input fixture behavior) SHALL be written and shown failing before any fix code is written. The user will not commit until the fix tasks pass.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN an input pin is driven 0 THEN the system SHALL CONTINUE TO present it LOW exactly as today, with no floating diagnostic.

3.2 WHEN an input pin is driven 1 THEN the system SHALL CONTINUE TO present it HIGH exactly as today, with no floating diagnostic.

3.3 WHEN output pins change THEN the system SHALL CONTINUE TO emit output events as today.

3.4 WHEN the emulator is created or reset THEN the system SHALL CONTINUE TO produce the same cycle-0 snapshot.

3.5 WHEN `schedule()` or `supports()` is called THEN the system SHALL CONTINUE TO behave as today for the existing input values 0 and 1.

3.6 WHEN invalid input is supplied (bad HEX, unmapped pins, unsupported peripherals, out-of-order events) THEN the system SHALL CONTINUE TO return the same error kinds as today.

3.7 WHEN HEX text is parsed THEN the system SHALL CONTINUE TO parse it as today.

3.8 WHEN the existing test suite runs THEN all existing tests SHALL CONTINUE TO pass unchanged. Smoke and spike tests gain new cases only, and existing cases are not modified.
