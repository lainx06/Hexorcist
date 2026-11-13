# Input Pull-Up Bugfix Design

## Overview

The bridge presents an undriven input pin as LOW, because avr8js `setPin()` starts at 0 and nothing ever changes it. A real ATmega328P with `INPUT_PULLUP` reads HIGH when nothing drives the pin. With `blink_button.ino.hex`, an idle button reads as held and the LED toggles about every 1,600,000 cycles. `InputEvent.value` only accepts `0 | 1`, so callers cannot express "released". The UI works around this by driving BUTTON = 1 at cycle 0.

The fix gives each fixture input pin a three-state external model: `released`, driven 0, driven 1. All pins start `released`. For a released pin the bridge computes the presented level from the pin's configuration (avr8js `pinState`):

- `InputPullUp` presents HIGH.
- `Input` (floating) presents LOW. The bridge records one `floating-input` diagnostic per signal per run, carrying the cycle of the earliest read of the PIN register that contains the pin, and the register name (for example `"PIND"`).
- The level follows DDR/PORT changes made by the firmware.

All avr8js use stays inside `src/engine/emulator-bridge.ts`. Changes are limited to `src/engine/`, `src/ui/main.ts`, new test files (including one baseline JSON under `src/engine/__tests__/baselines/`), the new sketch directory `fixtures/floating_input/` (new files only, user-authorized), and `scripts/guard.mjs` (user-authorized, one added isolation check for the test-only construction path). Time stays in integer CPU cycles. There is no `Math.random`, `Date.now` or network call in engine code.

The bridge adds its PIN read hook by chaining onto whatever hook is already installed, and it observes DDR/PORT through the avr8js listener list, which is additive. It never replaces a hook it did not install. See "avr8js Hook Evidence" and "Hook Chaining".

## Glossary

- **Bug_Condition (C)**: An input pin is released (no event has driven it, or the latest event was "release") and the firmware has configured it as `InputPullUp` or `Input`. The bridge presents LOW where the pull-up should give HIGH, or gives no diagnostic where the pin floats and a read of its PIN register occurs.
- **Property (P)**: A released pin presents HIGH under `InputPullUp`. Under `Input` it presents LOW and records one `floating-input` diagnostic per signal per run, at the earliest PIN register read that covers it. Presented level tracks DDR/PORT.
- **Preservation**: Behavior for driven pins, output events, the cycle-0 snapshot, `schedule()`/`supports()` for 0 and 1, existing error kinds, HEX parsing, and the existing test suite.
- **External state**: Per fixture input pin, one of `"released" | 0 | 1`. Set by input events. Starts `"released"`.
- **Presented level**: The bit the bridge holds in avr8js `AVRIOPort.pinValue` for the pin, which is what the firmware reads from the PIN register.
- **Floating**: A released input whose avr8js `pinState` is `PinState.Input` (DDR bit 0, PORT bit 0).
- **PIN register read**: Any `cpu.readData(addr)` call where `addr` is the port's `portConfig.PIN` address (IN, LDS, LD*, SBIC, SBIS, SBI all go through `readData`).
- **Register name**: `"PINB"`, `"PINC"` or `"PIND"`, taken from the port letter of the fixture pin. It is bridge data, not an avr8js value.
- **`EmulatorBridge.advance()`**: In `src/engine/emulator-bridge.ts`. Applies due input events, runs one instruction at a time, and collects output events.
- **`mapPinState`**: In `src/engine/emulator-bridge.ts`. Maps avr8js `PinState` to `PinValue` for output pins. It is not used for input pins and does not change.
- **Chaining**: Capturing the previously installed hook, calling it, and returning its result, instead of overwriting it.

## Bug Details

### Bug Condition

The bug manifests when an input pin has no driving event and the firmware reads it. `advance()` only calls `port.setPin(bit, ev.value === 1)` when an event is applied, so `pinValue` stays 0 for an undriven pin whatever DDR/PORT say. The bridge has no per-pin external state and no listener on DDR/PORT changes. `InputEvent.value` cannot express "release", and `AdvanceResult` has no channel for a floating warning.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { fixture, events, run }, observed at a pin P with direction "input"
  OUTPUT: boolean

  state  := externalState(P, events, cycle)      // "released" | 0 | 1
  config := pinStateOf(P, cycle)                 // InputPullUp | Input | High | Low

  RETURN state = "released"
         AND config IN { InputPullUp, Input }
         AND ( (config = InputPullUp AND presentedLevel(P, cycle) != HIGH)
            OR (config = Input AND registerReadOccurs(registerOf(P), cycle)
                AND NOT floatingDiagnosticRecorded(signalOf(P))) )
END FUNCTION
```

Callers cannot construct `"release"` under the old type, so the type change is part of the fix. Any event list containing `"release"` is also in scope.

### Examples

- `blink_button.ino.hex`, no events, 20,000,000 cycles. Expected: after `setup()` enables the pull-up on D2, BUTTON is HIGH and the LED toggles at the released rate (about 8M cycles apart, as the existing "Released" test observes with BUTTON driven to 1). Actual: BUTTON is LOW and the LED toggles about every 1.6M cycles.
- Events `[{BUTTON, 0, 500000}, {BUTTON, "release", 900000}]`. Expected: at 900000 the pin returns to released and presents HIGH if the pull-up is on. Actual: `"release"` is not accepted.
- Firmware leaves D2 as plain input (DDR 0, PORT 0) and reads PIND. Expected: LOW plus `{ kind: "floating-input", signal: "BUTTON", cycle: <earliest read cycle>, register: "PIND" }` once. Actual: LOW and no diagnostic.
- Firmware reads the pin while released as `Input`, then sets PORT bit 2 (pull-up on). Expected: one diagnostic from the earlier read, then HIGH from the PORT write onward, and no second diagnostic. Actual: LOW throughout.
- `floating_input.ino.hex`, no events. Expected: a diagnostic for D3_IN; LOW and a diagnostic for D4_IN before the pull-up; HIGH and no new diagnostic for D4_IN after. Actual: no diagnostics and D4_IN stays LOW.
- Edge: BUTTON driven to 0 or 1. Expected: unchanged, no diagnostic, firmware DDR/PORT writes do not alter the driven level.
- Edge: released pin, firmware sets DDR bit to output. Expected: the pin is no longer an input. avr8js reports the driven output level and the bridge adds nothing. A later switch back to input recomputes from `pinState`.
- Edge: two released floating inputs on port D, firmware reads PIND for one of them. Expected: both signals may get a diagnostic (over-report). See Known limitations.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Driven 0 presents LOW and driven 1 presents HIGH exactly as today, with no diagnostic (3.1, 3.2).
- Output-pin event detection, ordering and cycles are unchanged (3.3).
- The cycle-0 snapshot is unchanged (3.4).
- `schedule()` and `supports()` behave as today for 0 and 1 (3.5).
- Error kinds for bad HEX, unmapped pins, unsupported ports and capabilities, past-cycle inputs and overflow are unchanged (3.6).
- HEX parsing is unchanged (3.7).
- Existing tests pass unchanged. New cases go in new files (3.8).
- Existing hooks and listeners that other avr8js peripherals installed keep working, because the bridge chains instead of replacing.

**Scope:**
Inputs that never produce a released pin read as `Input` or `InputPullUp` are unaffected. This includes:
- Runs where every input is driven by an event at cycle 0 (the existing smoke and spike tests).
- Output pins and fixtures without input pins.
- Invalid-input paths.

### Known limitations

This subsection is written so a future capability panel can show it as is.

**Floating-input diagnostics are per register, not per bit.**

The `floating-input` diagnostic means: "a read of the PIN register containing this released, non-pulled-up pin occurred." It does not mean the firmware used the value of that specific pin.

- It may over-report. A read of PIND for D3 can raise a diagnostic for D4 if D4 is also released and not pulled up at that moment. A downstream rule that depends on the diagnostic can then end as COULDN'T TELL when the firmware never meant to read that bit.
- It never under-reports. Every read of a PIN register that contains a released, non-pulled-up input pin is covered by one diagnostic for that signal, on the earliest such read. Reads go through `cpu.readData`, and the hook sits on that path for the PIN address.
- Bit-level attribution would need decoding the reading instruction and following the register into later instructions. This design does not do that. This is an accepted decision, not an open item.
- `cycle` is the cycle of the earliest covering read, which can be earlier than the read the firmware cared about.
- avr8js `pinState()` does not model the MCUCR PUD (pull-up disable) bit. The bridge inherits that limit.
- Reads that bypass `cpu.readData` (direct `cpu.data[...]` access from host code) do not raise a diagnostic. Engine and test code must not use direct access to stand in for a firmware read.

## avr8js Hook Evidence

Installed version: `node_modules/avr8js/package.json` line 3, `"version": "0.21.1"` (checked). The package ships compiled output only, so line numbers below refer to the ESM build under `node_modules/avr8js/dist/esm/`. Short verbatim excerpts follow.

**`AVRIOPort` writes its own write hooks, unconditionally.** `peripherals/gpio.js`, lines 156-171:

```js
cpu.gpioByPort[portConfig.PORT] = this;
cpu.writeHooks[portConfig.DDR] = (value) => {
...
cpu.writeHooks[portConfig.PORT] = (value) => {
...
cpu.writeHooks[portConfig.PIN] = (value, oldValue, addr, mask) => {
```

Assignment replaces any hook that was already in those slots. So anything installed before `new AVRIOPort(...)` on DDR, PORT or PIN write hooks is lost.

**The DDR and PORT write hooks store the value, then notify, then recompute PIN.** `gpio.js`, lines 157-169:

```js
cpu.data[portConfig.DDR] = value;
this.writeGpio(portValue, value);
this.updatePinRegister(value);
return true;
```

and the same shape for PORT at 164-169. Returning `true` tells `cpu.writeData` not to store the value itself (`cpu/cpu.js`, lines 57-64: `if (hook(value, this.data[addr], addr, mask)) { return; }`).

**`AVRIOPort` does not install a read hook.** A search of `peripherals/gpio.js` for `readHooks` finds nothing. The PIN register is a plain `cpu.data` byte that `updatePinRegister` keeps current. The slot `cpu.readHooks[PIN addr]` is therefore empty after construction.

**How reads reach hooks.** `cpu/cpu.js`, lines 14-15 declare `this.readHooks = [];` and `this.writeHooks = [];`. Lines 51-56:

```js
readData(addr) {
    if (addr >= 32 && this.readHooks[addr]) {
        return this.readHooks[addr](addr);
    }
    return this.data[addr];
}
```

The hook receives only `addr`, and its return value is what the instruction sees. `cpu/instruction.js` routes IN (line 325), SBI (656), SBIC (661), SBIS (671) and the LD/LDS family (lines 375 to 447) through `cpu.readData`.

**`pinState` reads DDR and PORT straight from `cpu.data`.** `gpio.js`, lines 248-259:

```js
const openState = port & bitMask ? PinState.InputPullUp : PinState.Input;
...
if (ddr & bitMask) {
    return this.lastValue & bitMask ? highValue : PinState.Low;
}
else {
    return openState;
}
```

So `pinState` is correct as soon as the DDR/PORT write hook has stored the value, and it needs no extra bookkeeping.

**`setPin` stores the external level and recomputes PIN.** `gpio.js`, lines 265-271:

```js
setPin(index, value) {
    const bitMask = 1 << index;
    this.pinValue &= ~bitMask;
    ...
    this.updatePinRegister(this.cpu.data[this.portConfig.DDR]);
```

**PIN register recompute.** `gpio.js`, lines 306-309:

```js
updatePinRegister(ddr) {
    const newPin = (this.pinValue & ~ddr) | (this.lastValue & ddr);
    this.cpu.data[this.portConfig.PIN] = newPin;
```

Input bits come from `pinValue`; output bits come from `lastValue`.

**Listeners.** `gpio.js`, lines 234-236 (`addListener(listener) { this.listeners.push(listener); }`) and 411-421:

```js
writeGpio(value, ddr) {
    ...
    if (newValue !== prevValue || ddr !== this.lastDdr) {
        this.lastValue = newValue;
        this.lastDdr = ddr;
        for (const listener of this.listeners) {
            listener(newValue, prevValue);
```

Listeners are additive. The call happens inside `writeGpio`, before `updatePinRegister` runs in the same write hook. Two consequences: a listener sees the new DDR via `cpu.data[DDR]` and `lastDdr` already updated, and any `setPin` the listener makes triggers its own `updatePinRegister`, which the hook then repeats with the same inputs. That repeat is idempotent.

One more fact matters: `writeGpio` only notifies when the output value or `ddr` changed. A PORT write that only changes a bit of an input pin (the pull-up bit, where DDR is 0) still changes `newValue` because `value & ~ddr` is part of it, so the pull-up toggle does notify. The tests cover this case rather than assuming it.

### Hook Chaining

Rules the bridge follows:

1. **All hook installation happens after the `new AVRIOPort(...)` calls** in `EmulatorBridge.create()`. The constructor overwrites `writeHooks` for DDR, PORT and PIN unconditionally (lines 157-171), so a hook installed earlier on those slots would vanish. The bridge does the capture at the point where the slot's final owner is known: right after `portB`, `portC` and `portD` are constructed and before any instruction runs.
2. **Read hook on the PIN address (the only new hook).** The bridge captures `const prev = cpu.readHooks[portConfig.PIN]` and installs a wrapper:
   - If `prev` exists, call `prev(addr)` before anything else and keep its value as `original`. Otherwise `original = cpu.data[addr]`. Today `prev` is `undefined` for the three ports (see the evidence above), but the bridge does not rely on that.
   - Then run the bridge's own check: collect the released input fixture pins on this port whose `pinState` is `PinState.Input` and whose signal is not yet in `_floatingReported`, in ascending fixture pin index. For each, add the signal to the set and push `{ kind: "floating-input", signal, cycle: cpu.cycles, register }`.
   - Return `original`. The wrapper never changes the value the firmware reads. The presented level comes from `setPin`/`pinValue`, not from the read hook. The only reason to return something else would be to inject a level at read time, and this design does not do that, because `setPin` already keeps `cpu.data[PIN]` current.
   - Order: previous hook, then bridge check. The check reads `pinState`, `cpu.data` and the set only. It cannot change any state the previous hook used, so the order does not affect the returned value. It is fixed so replays stay identical.
3. **DDR/PORT observation uses `port.addListener`.** Listeners are an array, so adding one cannot displace anyone else's. No capture is needed. The listener returns nothing.
4. **No new write hooks.** The bridge does not touch `cpu.writeHooks`. If a later change needs one, it must capture the previous hook after construction, call it with `(value, oldValue, addr, mask)`, and return the previous hook's boolean, so that `cpu.writeData` keeps its "hook handled the store" meaning. Returning `undefined` from a wrapper would make `writeData` store the raw value over what the avr8js hook already stored.
5. **Same-address collisions.** If two hooks target the same read address, the one installed later wraps the earlier one. The bridge installs its wrapper once per port, in the order B, C, D, and keeps the captured hook in a closure variable.
6. **Test-only construction path.** `static EmulatorBridge.createWithTestHooks(hex, fixture, inputEvents, hooks)`, with `hooks = { pinReadStubs?: Partial<Record<"PINB" | "PINC" | "PIND", (addr: number) => number>>; portListeners?: Partial<Record<"B" | "C" | "D", (value: number, oldValue: number) => void>> }`. JSDoc: `@internal test-only`. Stubs and listeners are installed after the `AVRIOPort` constructors and before the bridge wraps the read hook, so the wrapper in rule 2 captures the stub as `prev`. The method shares all code with `create()` except installing the stubs and listeners. `scripts/guard.mjs` reports a finding (exit 2) if `createWithTestHooks` appears anywhere other than `src/engine/emulator-bridge.ts` and `src/engine/__tests__/**`.

## Hypothesized Root Cause

1. **No external state per input pin**: `advance()` only calls `setPin` when an event is applied. An untouched pin keeps avr8js's initial `pinValue` of 0, which the pull-up never changes. This is the most likely cause of 1.1 and 1.2.
2. **Input type too narrow**: `InputEvent.value: 0 | 1` cannot say "not driven" (1.3). This forced the cycle-0 BUTTON = 1 workaround.
3. **No reaction to DDR/PORT changes**: The bridge never re-evaluates input levels when the firmware writes DDR or PORT (1.5). avr8js notifies `AVRIOPort` listeners via `writeGpio()`, but the bridge registers none.
4. **No diagnostics channel**: `AdvanceResult` has no `diagnostics`, and the bridge has no hook on PIN register reads (1.4, 1.6). avr8js installs none either, so nothing else would provide it.

Confirmed against the avr8js source cited above: `pinState()` returns `InputPullUp` when the DDR bit is 0 and the PORT bit is 1; `setPin()` only stores `pinValue`; the PIN register is `(pinValue & ~ddr) | (lastValue & ddr)`; `writeGpio()` calls listeners when value or DDR changes and runs before `updatePinRegister()`; no read hook is installed by `AVRIOPort`.

## Correctness Properties

Property 1: Bug Condition - Released inputs present the level their configuration implies

_For any_ fixture, HEX and ordered event list where an input pin is released (initial state, or after a `"release"` event) and the firmware has configured it as input, the fixed bridge SHALL present HIGH when pinState is `InputPullUp`, and LOW when pinState is `Input`. For the `Input` case, when a read of the PIN register containing that pin occurs, it SHALL record exactly one `{ kind: "floating-input", signal, cycle, register }` in `AdvanceResult.diagnostics`, where `cycle` is the cycle of the earliest such read and `register` names the PIN register (for example `"PIND"`), and no second one for the same signal in the same run. The presented level SHALL follow later DDR/PORT changes. `InputEvent.value` SHALL accept `0 | 1 | "release"`, and `"release"` SHALL return the pin to released at its scheduled cycle. For `blink_button.ino.hex` with no events over 20,000,000 cycles, BUTTON SHALL read HIGH after the pull-up is enabled and the LED SHALL NOT toggle at the held rate.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.7**

Property 2: Preservation - Driven pins, outputs and error paths are unchanged

_For any_ input where the bug condition does NOT hold (pins driven 0 or 1, output pins, the cycle-0 snapshot, invalid inputs), the fixed bridge SHALL produce the same `outputEvents`, `appliedInputs` (for values 0 and 1), `cyclesConsumed` and `BridgeError` kinds as the original, with no `floating-input` diagnostic.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

Property 3: Replay determinism includes diagnostics

_For any_ fixture, HEX and ordered event list, two fresh bridges run with the same `advance()` sequence SHALL produce identical `outputEvents`, `appliedInputs` and `diagnostics` (kind, signal, cycle, register).

**Validates: Requirements 2.6**

Property 4: No under-report, at most one per signal

_For any_ run and any released input signal whose pinState is `Input` at the time of a read of the PIN register containing it, `diagnostics` SHALL contain a `floating-input` entry for that signal whose `cycle` is at or before that read, and SHALL contain at most one entry per signal. Over-report (an entry caused by a read aimed at another bit of the same register) is permitted.

**Validates: Requirements 2.4**

Property 5: Chaining preserves the original read value

_For any_ pre-existing read hook on a PIN address, the bridge's wrapper SHALL call it and return its value unchanged. Pre-existing listeners on the port SHALL still be called.

**Validates: Requirements 2.4, 3.3, 3.4**

Property 6: floating_input fixture behavior

_For any_ run of `floating_input.ino.hex` with fixture LED = B5 output, D3_IN = D3 input, D4_IN = D4 input and no events, the fixed bridge SHALL record a diagnostic for D3_IN, SHALL present D4_IN LOW with a diagnostic for D4_IN before the pull-up is enabled, and SHALL present D4_IN HIGH after, with no further diagnostic for D4_IN.

**Validates: Requirements 2.8, 2.9**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `src/engine/types.ts`

1. **Input value type**: add `export type InputValue = 0 | 1 | "release";` and set `InputEvent.value: InputValue`. `AppliedInputEvent` inherits it. Existing callers compile unchanged because the type only widens.
2. **Diagnostic type**: add
   ```ts
   export interface FloatingInputDiagnostic {
     kind: "floating-input";
     signal: string;
     cycle: number;      // integer CPU cycle of the earliest covering PIN register read
     register: string;   // "PINB" | "PINC" | "PIND"
   }
   export type Diagnostic = FloatingInputDiagnostic;
   ```
3. **Result shape**: add `diagnostics: Diagnostic[]` to `AdvanceResult`. It is always present, possibly empty.

**File**: `src/engine/emulator-bridge.ts`

**Function**: `EmulatorBridge.create`, constructor, `advance`

1. **External state**: add `_extState: Array<"released" | 0 | 1>` indexed like `fixture.pins`, all `"released"` at creation. Add `_floatingReported: Set<string>` and `_pendingDiagnostics: Diagnostic[]`.
2. **Applying events**: in `advance()` step 1, replace `port.setPin(pin.bit, ev.value === 1)` with a private `_applyInput(pinIdx, value)`. For 0 or 1 it stores the state and calls `setPin(bit, value === 1)`, exactly as today. For `"release"` it stores `"released"` and calls `_presentReleased(pinIdx)`.
3. **Released level**: `_presentReleased(pinIdx)` reads `port.pinState(bit)` and calls `port.setPin(bit, state === PinState.InputPullUp)`. A pin whose state is `High` or `Low` (firmware made it an output) is left alone.
4. **Track DDR/PORT**: in `create()`, after the ports are constructed, for each port that has fixture input pins call `port.addListener(...)`. The listener runs `_presentReleased` for every released input pin on that port. Driven pins are skipped. After construction, call `_presentReleased` once for every input pin so the initial level is consistent.
5. **Floating diagnostic**: in `create()`, also after the ports are constructed, install the chained read hook described in "Hook Chaining" on `cpu.readHooks[portConfig.PIN]` for each port with fixture input pins. `_pendingDiagnostics` is moved into the result and cleared by `advance()`. The set is per bridge instance, so it is per run. Register names come from a small constant table keyed by port letter.
6. **Result and exports**: `advance()` returns `diagnostics` on every path, including the `requestedCycles <= 0` path. Re-export `InputValue`, `Diagnostic` and `FloatingInputDiagnostic` from the bridge module.
7. **Validation**: `create()` and `schedule()` keep their existing checks. `"release"` goes through the same unmapped-pin and past-cycle checks, so error kinds for 0 and 1 are unchanged. A `"release"` event on an `output` pin follows the existing behavior for events on non-input pins.
8. **Comments**: the read hook carries a comment pointing at "Known limitations" (per register, may over-report, never under-reports).

Design notes:
- Nothing here uses wall-clock time or randomness. Diagnostics carry `cpu.cycles`, an integer.
- Hook order inside the wrapper is fixed (previous hook, then check, then return the previous value), so replays match.

**File**: `src/ui/main.ts`

1. **Remove workaround**: `initBridge()` calls `EmulatorBridge.create(hexData, FIXTURE)` with no cycle-0 BUTTON event.
2. **Release events**: rename `scheduleButtonUp` to `scheduleButtonRelease`. It schedules `{ signal: 'BUTTON', value: 'release', cycle: bridge.cycleCount }`. Bind it to `pointerup`, `pointerleave` and the Space `keyup`. Pointer-down and keydown keep scheduling value 0.
3. **Comment**: replace the SPIKE workaround comment with one stating that the bridge models the pull-up, so the UI never drives BUTTON = 1 to fake a released button.
4. **Copy**: no new UI copy is needed. Any comment or text added avoids the banned words.

**Files**: new test files only, e.g. `src/engine/__tests__/input-pullup.test.ts`, `src/engine/__tests__/input-pullup.property.test.ts` and `src/engine/__tests__/floating-input.test.ts`. No existing test file is edited.

## Floating-Pin Fixture

New files, user-authorized, in a new directory. Existing fixtures are not touched.

**Sketch**: `fixtures/floating_input/floating_input.ino`. Intended behavior:

- D13 is an output (the LED, port B bit 5).
- D3 is `INPUT` with no pull-up, and the loop reads it with `digitalRead(3)` on every pass.
- D4 is `INPUT` for the earliest 100 ms (1,600,000 cycles at 16 MHz) and then `INPUT_PULLUP`. The switch is made inside `loop()` based on `millis()`.
- The loop reads D4 and turns the LED on when D4 reads HIGH, off otherwise.

Reference shape, for the task author to follow:

```cpp
bool pulledUp = false;
void setup() {
  pinMode(13, OUTPUT);
  pinMode(3, INPUT);
  pinMode(4, INPUT);
}
void loop() {
  if (!pulledUp && millis() >= 100) {
    pinMode(4, INPUT_PULLUP);
    pulledUp = true;
  }
  (void)digitalRead(3);
  digitalWrite(13, digitalRead(4) == HIGH ? HIGH : LOW);
}
```

The `(void)digitalRead(3)` read must not be optimized away. The sketch should store the result in a `volatile` variable so the PIND read stays in the binary. The task author checks this by looking for the D3 diagnostic in the test.

**HEX**: `fixtures/floating_input/build/floating_input.ino.hex`, precompiled by the user with:

```
arduino-cli compile -b arduino:avr:uno --output-dir fixtures/floating_input/build fixtures/floating_input
```

The HEX is never hand-assembled and never generated by the tasks. The `.ino` file may be written by the tasks. The HEX is produced by the user.

**Fixture mapping** (pin maps are fixture data, defined in the new test file, not in the bridge):

| Signal | Port | Bit | Direction |
|---|---|---|---|
| LED | B | 5 | output |
| D3_IN | D | 3 | input |
| D4_IN | D | 4 | input |

**Expected with no events**:

- A `floating-input` diagnostic for D3_IN with `register: "PIND"`.
- D4_IN is LOW and a diagnostic for D4_IN exists before the pull-up is enabled. Since D3 and D4 share PIND, the D4_IN diagnostic may carry the cycle of a read aimed at D3 (per register). Tests assert that its cycle is before the pull-up cycle, not that it equals a particular read.
- After the pull-up, D4_IN reads HIGH, so the LED turns on. No new diagnostic for D4_IN appears, and there is never more than one per signal.
- Both diagnostics can share a cycle. Same-cycle order follows fixture pin index (D3_IN, then D4_IN).

**Missing HEX**: if `fixtures/floating_input/build/floating_input.ino.hex` does not exist when a task needs it, the task stops and asks the user to run the compile command above. There is no hand-assembled fallback and no downgraded verdict. Tests that depend on the file are not skipped or weakened to hide its absence.

## Testing Strategy

### Validation Approach

Surface counterexamples on the unfixed code, then confirm the fix and preservation. Tests are evidence, not proof. Because `InputEvent.value` does not accept `"release"` before the fix, exploratory tests that use it need a type cast.

**Ordering rule**: the failing tests are written and shown failing before any fix code is written. The tests that need the floating_input HEX wait for the user to supply it; the task stops and asks. The user will not commit until the fix tasks pass, so no task commits. Acceptance tests written by the user into the spec or prompt are never changed, weakened or deleted to get a pass. If a test and the system disagree, the task stops and reports what the test expects, what happened, and the evidence.

### Exploratory Bug Condition Checking

**Goal**: Show the bug on unfixed code and confirm or refute the root cause.

**Test Plan**: Run `blink_button.ino.hex` with no events and inspect the LED event cadence and the level the firmware sees. Run on the UNFIXED code.

**Test Cases**:
1. **Idle cadence**: no events, 20,000,000 cycles. Count LED toggles and check spacing (will fail on unfixed code: spacing near 1.6M instead of near 8M).
2. **Release event**: schedule `{BUTTON, "release", cycle}` (cast) and observe that the pin is not returned to the pull-up level (will fail on unfixed code).
3. **Floating fixture**: run `floating_input.ino.hex` with no events and check `diagnostics` for D3_IN and D4_IN (will fail on unfixed code: field missing). Needs the user-compiled HEX. If it is absent, stop and ask the user to compile.
4. **Late pull-up**: confirm the level changes when PORT is written after the run starts (may fail on unfixed code).
5. **Hook evidence**: read `cpu.readHooks` for the PIN addresses on a freshly built bridge and confirm no avr8js hook is present (documents the evidence above).

**Expected Counterexamples**:
- Idle run toggles at the held rate.
- `"release"` is ignored or rejected, and `diagnostics` is undefined.
- Possible causes: no external state, narrow input type, no DDR/PORT listener, no read hook.

### Fix Checking

**Goal**: For all inputs where the bug condition holds, the fixed bridge presents the expected level and diagnostics.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := advance_fixed(input)
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  RETURN presentedLevel = HIGH WHEN pinState = InputPullUp
         AND presentedLevel = LOW WHEN pinState = Input
         AND count(diagnostics WHERE signal = S) <= 1 per run
         AND (pinState = Input AND registerReadOccurs) IMPLIES
               diagnostics contains { floating-input, S, cycle <= readCycle, register }
         AND presentedLevel tracks every DDR/PORT change on released pins
END FUNCTION
```

### Preservation Checking

**Goal**: For all inputs where the bug condition does NOT hold, the fixed bridge matches the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT original(input).outputEvents = fixed(input).outputEvents
  ASSERT original(input).appliedInputs = fixed(input).appliedInputs
  ASSERT fixed(input).diagnostics = []
END FOR
```

**Testing Approach**: Property-based testing (fast-check, already in the repo) fits because it varies fixtures, event lists and run lengths and catches edge cases a few hand-written cases miss.

**Test Plan**: Observe the unfixed output on fixtures where BUTTON is driven at cycle 0 and on error paths, record those as expectations in new tests, then confirm they still hold. The existing suite is run unmodified as a regression check.

**Test Cases**:
1. **Driven-0 and driven-1**: BUTTON driven at cycle 0 gives the same `outputEvents` as today and `diagnostics` is empty.
2. **Cycle-0 snapshot and output events**: unchanged for generated fixtures.
3. **Error kinds**: bad HEX, unmapped signal (including with `"release"`), unsupported port, past-cycle schedule.
4. **Existing suites**: `emulator-bridge.smoke`, `emulator-bridge.property` and `spike-monitor` run without edits.

### Unit Tests

- Idle `blink_button` run: BUTTON reads HIGH after setup, LED cadence matches the released-and-driven-1 cadence, no diagnostics.
- `"release"` after driven 0 returns the pin to HIGH under pull-up.
- Floating read records exactly one diagnostic with the right signal, cycle and register; a second read does not add another.
- DDR/PORT change after the run starts moves the level in both directions, including a PORT write that only toggles the pull-up bit.
- `schedule()` accepts `"release"` and rejects unmapped signals and past cycles with the existing error kinds.
- `advance(0)` returns an empty `diagnostics` array.
- Chaining: install a stub `cpu.readHooks[PIN]` before the bridge wraps it (through `EmulatorBridge.createWithTestHooks(hex, fixture, inputEvents, hooks)`, described under "Hook Chaining", which does not expose avr8js outside the bridge), and confirm its value is returned and the diagnostic still fires. Confirm an existing listener added to the port still runs.
- Over-report case: two released floating inputs on one port, one register read, both signals get one diagnostic.
- `floating_input` fixture: D3_IN diagnostic with `register: "PIND"`; D4_IN diagnostic with cycle before the pull-up; LED off before and on after; no D4_IN diagnostic after the pull-up. Needs the user-compiled HEX.

### Property-Based Tests

- Random event lists over 0, 1 and `"release"` on BUTTON: two fresh bridges give identical `outputEvents`, `appliedInputs` and `diagnostics` (Property 3).
- Random event lists restricted to 0 and 1 with cycle-0 drive: `diagnostics` is empty and output events match a recorded baseline (Property 2).
- For any event list, no signal appears in `diagnostics` more than once, and every diagnostic cycle is an integer within the run (Property 4).
- Diagnostic and output ordering is stable across different `advance()` chunkings of the same total cycles.

### Integration Tests

- UI-level check by reading `src/ui/main.ts`: no BUTTON event at cycle 0 in `initBridge()`, release scheduled from `pointerup`, `pointerleave` and Space `keyup`, and the pull-up comment present. This is a source check, since the UI has no browser test harness in the repo.
- Replay: build a fresh bridge from the same HEX, fixture and `appliedInputs` (with `"release"`) and compare `outputEvents` and `diagnostics`.
- Spike monitor on the idle run: the LED-timeout monitor sees the released behavior with no workaround event.

### Notes

- The existing smoke test comments mention the cycle-0 workaround. They stay as written because existing tests are not edited.
- Per-register attribution is an accepted decision, documented under "Known limitations". There is no open item about bit-level attribution.
