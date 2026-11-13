# Requirements Document

## Introduction

The EmulatorBridge is the sole module that imports avr8js. It loads a precompiled Intel HEX program onto an emulated ATmega328P and runs it at a configurable clock rate (default 16 MHz). It translates GPIO output changes into named, cycle-stamped events, and applies external input events at exact simulated CPU cycle boundaries. All other Hexorcist modules interact with the emulator exclusively through the EmulatorBridge interface; avr8js internals are never exposed beyond this boundary.

## Glossary

- **EmulatorBridge**: The TypeScript module that wraps avr8js and exposes a deterministic run interface to the rest of Hexorcist. The only module permitted to import avr8js.
- **ATmega328P**: The 8-bit AVR microcontroller being emulated.
- **avr8js**: The MIT-licensed JavaScript emulator library used to simulate the ATmega328P.
- **Intel HEX**: A text-based file format encoding binary firmware as ASCII hex records. Input to the EmulatorBridge.
- **Fixture**: A configuration object that maps logical signal names to ATmega328P port/pin identifiers and declares which pins are inputs and which are outputs.
- **Signal**: A named, logical pin identifier defined in a Fixture (e.g., `"LED"`, `"BUTTON"`).
- **PinValue**: A pin's logic state, represented as one of: `0` (logic low), `1` (logic high), or `"input"` (high-impedance input state).
- **OutputEvent**: A record `{ signal: string, value: 0 | 1, cycle: number }` emitted when a mapped output pin changes state.
- **InputEvent**: A record `{ signal: string, value: 0 | 1, cycle: number }` scheduling an external pin-state change at a target cycle.
- **AppliedInputEvent**: An InputEvent extended with `appliedCycle: number` recording the actual CPU cycle at which the input was applied.
- **CPU cycle**: An integer count of clock ticks since emulation started. The only time unit used in the bridge and engine.
- **Instruction boundary**: The moment after `cpu.tick()` completes a full instruction, at which point pin state may be sampled and input may be applied.
- **Typed error**: A TypeScript discriminated-union error value (not a thrown exception) that carries a machine-readable `kind` field.

## Requirements

### Requirement 1: Initialization

**User Story:** As a firmware checker, I want to load a HEX program and fixture into a fresh emulator instance, so that every run starts from a known, clean state.

#### Acceptance Criteria

1. WHEN an Intel HEX string whose every data record has a valid checksum and whose combined data records fit within the ATmega328P flash size of 32 768 bytes, and a Fixture config that contains a numeric `clockHz` field greater than zero and a `pins` array where every entry has a named port in {B, C, D} and a bit index in 0–7, are provided to the EmulatorBridge constructor, THE EmulatorBridge SHALL create a fresh avr8js CPU instance initialised with ports B, C, and D and peripherals Timer0, Timer1, and Timer2.
2. WHEN an Intel HEX string and Fixture config that satisfy the validity conditions in criterion 1 are provided, THE EmulatorBridge SHALL load the HEX program data into the CPU flash memory before the first call to `advance`.
3. THE EmulatorBridge SHALL expose the configured clock frequency in Hz as a read-only numeric property, defaulting to 16 000 000 when the Fixture config omits the `clockHz` field.
4. WHEN two EmulatorBridge instances are created with identical HEX strings and identical Fixture configs, THE EmulatorBridge SHALL initialise both instances to the same state across all 32 general-purpose registers, the stack pointer, the program counter, the status register, and all SRAM bytes.
5. IF the Intel HEX string fails checksum validation or its data records exceed 32 768 bytes, or the Fixture config is missing the `pins` array or contains a port name outside {B, C, D} or a bit index outside 0–7, THEN THE EmulatorBridge constructor SHALL return a typed error indicating which validation condition failed, and SHALL NOT create a CPU instance.

### Requirement 2: Stepping and Peripheral Advancement

**User Story:** As a firmware checker, I want peripherals to advance in lockstep with the CPU, so that timer and interrupt behaviour is faithfully reproduced.

#### Acceptance Criteria

1. WHILE the EmulatorBridge is executing, THE EmulatorBridge SHALL call `cpu.tick()` once per executed instruction so that all registered avr8js peripherals advance their internal state at every instruction boundary.
2. WHILE the EmulatorBridge is executing, THE EmulatorBridge SHALL track the total elapsed cycle count as a non-negative integer that increments by the cycle cost of each executed instruction and SHALL NOT allow the cycle counter to decrease or wrap.
3. THE EmulatorBridge SHALL advance execution in explicit, caller-controlled steps rather than in a background timer or scheduler, so that the caller determines how many cycles are simulated per call.
4. WHEN the caller invokes a step, THE EmulatorBridge SHALL execute instructions until the cumulative cycle count has advanced by at least the number of cycles requested, then return the actual number of cycles consumed in that step.
5. IF the EmulatorBridge is called with a requested step size of zero or a negative number, THEN THE EmulatorBridge SHALL return zero cycles consumed and leave the cycle counter unchanged.

### Requirement 3: Output Event Emission

**User Story:** As a rule monitor, I want named, cycle-stamped events for every GPIO output change, so that I can evaluate rules without reading avr8js internals directly.

#### Acceptance Criteria

1. WHEN a Fixture-mapped output pin changes its logic level at an instruction boundary, THE EmulatorBridge SHALL emit an OutputEvent containing the signal name, the new PinValue, and the CPU cycle count at the end of the instruction that caused the change.
2. IF a Fixture-mapped output pin's logic level is identical before and after an instruction boundary, THEN THE EmulatorBridge SHALL NOT emit an OutputEvent for that pin at that boundary.
3. THE EmulatorBridge SHALL emit OutputEvents in ascending CPU cycle order within a single run; when two or more Fixture-mapped pins change at the same instruction boundary, THE EmulatorBridge SHALL emit their OutputEvents in ascending Fixture pin-index order.
4. IF a pin is not mapped in the Fixture, THEN THE EmulatorBridge SHALL NOT emit OutputEvents for that pin.
5. WHEN a run begins, THE EmulatorBridge SHALL treat every Fixture-mapped output pin's baseline logic level as 0 before the first instruction executes, so that any pin driven to 1 by the first instruction boundary produces an OutputEvent, and SHALL emit an OutputEvent for each at cycle 0 reporting its actual PinValue from the CPU.

### Requirement 4: Input Event Application

**User Story:** As a gremlin scheduler, I want to inject input pin changes at exact cycle boundaries, so that fault injection is deterministic and reproducible.

#### Acceptance Criteria

1. WHEN an InputEvent is scheduled at target cycle C, THE EmulatorBridge SHALL apply the pin-state change at the first instruction boundary whose cycle count is greater than or equal to C.
2. WHEN an InputEvent is applied, THE EmulatorBridge SHALL record an AppliedInputEvent containing the original fields of that event plus an `appliedCycle` field set to the value of the cycle counter at the moment the port register write is performed, before the next instruction fetch begins.
3. WHEN multiple InputEvents share the same target cycle C, THE EmulatorBridge SHALL apply them all at the same instruction boundary, in the order they appear in the input list.
4. IF any InputEvent in the submitted list references a signal name not present in the Fixture, THEN THE EmulatorBridge SHALL return a typed error of kind `"unmapped-pin"` containing the offending signal name before execution begins, and SHALL NOT execute any CPU steps.
5. THE EmulatorBridge SHALL accept the full ordered InputEvent list before execution begins and SHALL NOT require the caller to push events mid-run.
6. THE EmulatorBridge SHALL provide a `schedule(event: InputEvent): void | BridgeError` method that accepts an InputEvent with `cycle >= cycleCount` and validates the event's signal name against the Fixture; IF the signal is unmapped, THEN return a typed error of kind `"unmapped-pin"`; IF the event's cycle is less than the current `cycleCount`, THEN return a typed error of kind `"input-in-past"`; IF valid, insert the event into the ordered pending-event list in cycle-ascending order (stable for equal cycles), so that a later `advance()` call will apply it.

### Requirement 5: Deterministic Replay

**User Story:** As a trace replayer, I want identical runs given identical inputs, so that a recorded failure can be reproduced exactly on demand.

#### Acceptance Criteria

1. WHEN the same Intel HEX string, the same Fixture, the same avr8js version, the same configured clock frequency in Hz, and the same ordered InputEvent list are provided to two separate EmulatorBridge instances each run to the same non-negative integer cycle count, THE EmulatorBridge SHALL produce identical OutputEvent lists in both runs, where two OutputEvent lists are identical if and only if they contain the same number of events and each corresponding event matches on all three fields — cycle (integer), signal (string), and value (PinValue) — compared in ascending cycle order.
2. WHEN an EmulatorBridge instance is used for replay, THE EmulatorBridge SHALL initialise from a clean power-on state in which all CPU registers, all SRAM bytes, and all peripheral registers are set to the initial values a freshly constructed avr8js CPU and peripheral set provide, and SHALL NOT carry forward any register, memory, or peripheral state from a prior run.
3. THE EmulatorBridge SHALL NOT consult any external clock, random source, or network resource during a run, so that replay depends only on the inputs enumerated in criterion 1.

### Requirement 6: Error Handling

**User Story:** As a tool integrator, I want clear, typed errors for invalid inputs and unsupported capabilities, so that callers never receive silent wrong results.

#### Acceptance Criteria

1. IF the provided Intel HEX string is empty, contains a record with a checksum that does not match the computed checksum of that record's data bytes, contains a record type other than `00`, `01`, `02`, or `03`, or does not contain a type-`01` EOF record, THEN THE EmulatorBridge SHALL return a typed error of kind `"invalid-hex"` and SHALL NOT create a CPU instance.
2. IF a Fixture references a port identifier that the ATmega328P does not expose (not B, C, or D), THEN THE EmulatorBridge SHALL return a typed error of kind `"unsupported-port"` and SHALL NOT create a CPU instance.
3. IF a caller requests a capability whose kind value is not one of the string literals enumerated in the bridge's published `SupportedCapability` type, THEN THE EmulatorBridge SHALL return a typed error of kind `"unsupported-capability"` and SHALL NOT produce any output value for that capability.
4. IF THE EmulatorBridge produces any error outcome that is an expected condition listed in criteria 1–3, THEN THE EmulatorBridge SHALL represent that outcome as a typed discriminated-union value carrying a `kind` string field and SHALL NOT throw a JavaScript exception for that condition.

### Requirement 7: Deterministic Time and Randomness Constraints

**User Story:** As a determinism enforcer, I want the bridge to be free of wall-clock calls and unchecked randomness, so that every run on any machine produces the same output for the same input.

#### Acceptance Criteria

1. THE EmulatorBridge SHALL NOT call `Date.now`, `performance.now`, or `setTimeout` anywhere in its own source or in any module reachable by following its import chain within the engine layer, regardless of import depth.
2. THE EmulatorBridge SHALL NOT call `Math.random` anywhere in its own source or in any module reachable by following its import chain within the engine layer, regardless of import depth.
3. THE EmulatorBridge SHALL represent all elapsed time exclusively as integer CPU cycle counts stored as 53-bit safe integers, with no floating-point accumulation, and SHALL treat a cycle count that would exceed `Number.MAX_SAFE_INTEGER` as a fatal error that halts the current run and reports an overflow condition to the caller.
