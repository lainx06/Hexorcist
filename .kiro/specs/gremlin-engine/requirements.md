# Requirements Document

## Introduction

The Gremlin_Engine generates seeded, reproducible input disturbances ("gremlins") for a precompiled ATmega328P program running on the EmulatorBridge. It runs a Campaign of up to N Runs. Each Run uses a fresh EmulatorBridge, applies that Run's Input_Events (rest events plus generated gremlin events) in cycle order, and stops at the earliest Violation reported by a Checker callback. By default a Campaign also stops at the earliest violating Run (option `stopOnFirstViolation`, default true). The rule-compiler spec replaces the callback later. The shrinker is out of scope here.

This spec is additive to two existing specs and to the current code in `src/engine/`:

- `emulator-bridge`: keeps its rules that the EmulatorBridge is the only module importing avr8js, that input is applied at the earliest instruction boundary at or after the event cycle, and that replay is deterministic.
- `input-pullup`: keeps the `InputEvent` value `"release"`, the "released" external state, and the one-per-signal-per-run `floating-input` diagnostic. Today `supports("adc")` returns an `unsupported-capability` error; this spec changes that.

Everything here follows the workspace rules: simulated time is integer CPU cycles at 16 MHz, there is no `Date.now`, `performance.now`, `setTimeout` or `Math.random` in engine code, all randomness comes from one seeded PRNG passed in explicitly, replay is a fresh emulator plus the same HEX, fixture and ordered event list (no snapshots), and the Checker contains no AI and makes no network calls. Test evidence from this spec is evidence, not proof.

Known Limitations: with the 1.1 V ADC reference selection, counts from 225 upward saturate and cannot be read back. The engine's analog counts read back exactly only under the AVCC reference.

Process constraints carried into design and tasks: the design must name the PRNG algorithm; the design must quote the installed avr8js ADC API and units from `node_modules` (that part is UNVERIFIED until quoted); when a task records a baseline file, work stops after that task so the user can commit; nothing is committed by the agent; acceptance tests written by the user are never changed or weakened to make them pass; no code is written until the user approves `tasks.md`.

## Glossary

- **Gremlin_Engine**: The TypeScript engine code in `src/engine/` that generates Input_Events and runs Campaigns.
- **EmulatorBridge**: The existing module that wraps avr8js. It stays the only module that imports avr8js.
- **PRNG**: The single seeded 32-bit pseudo-random number generator in `src/engine/prng.ts`. Its algorithm is named in `design.md`.
- **Campaign**: A set of N Runs over one HEX, one Fixture, one Gremlin_Set and one Campaign_Seed.
- **Campaign_Seed**: An unsigned 32-bit integer chosen by the caller.
- **Run**: One execution on a fresh EmulatorBridge, identified by a zero-based integer Run_Index.
- **Run_Seed**: The unsigned 32-bit integer derived deterministically from (Campaign_Seed, Run_Index).
- **Run_Cycles**: The integer CPU cycle length of a Run, from 1 to 2^32 (4294967296) inclusive. Every generated Input_Event has a cycle in [0, Run_Cycles).
- **Gremlin**: A named disturbance generator with an id, an icon name, target pin kinds and parameters with defaults.
- **Gremlin_Set**: The ordered list of Gremlins, with optional parameter overrides, used by a Campaign.
- **Gremlin_Id**: The string id of a Gremlin: `masher`, `bouncer`, `stuck`, `dropout`, `spike` or `drifter`.
- **Icon_Name**: A string naming an original SVG icon for a Gremlin.
- **Digital_Input**: A Fixture pin with `direction: "input"` and `kind: "digital"`.
- **Analog_Input**: A Fixture pin with `kind: "analog"` and a `channel` from 0 to 5.
- **Active_Level**: The level a press drives on a Digital_Input: `"low"` drives 0, `"high"` drives 1. Default `"low"`.
- **Rest_State**: The optional Fixture field `restState` of a Digital_Input, either `"released"` or `"active"`. Default `"released"`.
- **Rest_Event**: A digital Input_Event that drives a Digital_Input with Rest_State `"active"` to its Active_Level at cycle 0 in every Run. It carries `gremlinId` `"rest"` and is not produced by a Gremlin in the Gremlin_Set.
- **Press**: A digital Input_Event that drives the Active_Level value (0 or 1).
- **Release**: A digital Input_Event with value `"release"`. A Release is never a driven inactive level.
- **Analog_Event**: An input event `{ signal, analog, cycle }` where `analog` is an integer from 0 to 1023.
- **Rest_Level**: The analog value an Analog_Input presents when no Analog_Event has been applied. It comes from the optional Fixture field `restLevel` (integer 0 to 1023, default 512).
- **Input_Event**: A digital event `{ signal, value, cycle }` or an Analog_Event. When produced by a Gremlin it also carries that Gremlin's `gremlinId`, and a Rest_Event carries `gremlinId` `"rest"`.
- **Event_List**: The ordered list of Input_Events for one Run (Rest_Events ahead of Gremlin events), sorted by cycle, with equal cycles in generation order.
- **Skipped_List**: The per-Run list of `{ gremlinId, reason }` entries for Gremlins that generated no events in that Run, where reason is `"no-target-pin"` or `"run-too-short"`.
- **Max_Step_Size**: The maximum number of CPU cycles the EmulatorBridge advances in one Step of a Run. Parameter `maxStepCycles`, default 160 000.
- **Step**: One advance of the EmulatorBridge within a Run, after which the Checker is called.
- **stopOnFirstViolation**: The Campaign option (boolean, default true) that decides whether a Campaign stops after the earliest violating Run.
- **Checker**: The violation callback supplied by the caller. It receives observations and returns a Violation or none.
- **Violation**: A value returned by the Checker that names the rule and the cycle at which it was observed.
- **Run_Result**: The record for one Run: seed, Event_List, Skipped_List, applied inputs, output events, diagnostics, and Violation or none.
- **Campaign_Result**: The record for a Campaign: runs completed, the violating Run_Index (the earliest one when several exist) or none, and a verdict.
- **Verdict**: One of the exact strings `BROKE`, `HELD` (rendered as "No violation found in N runs of this gremlin set. Not a proof.") or `COULDN'T TELL`.
- **Slice**: A call that executes k consecutive Runs of a Campaign and then returns control to the caller.

## Requirements

### Requirement 1: Seeded PRNG and Run Seeds

**User Story:** As a maker replaying a failure, I want every random choice to come from one seeded generator, so that the same seed always gives the same gremlin attack.

#### Acceptance Criteria

1. THE PRNG SHALL be a 32-bit seeded generator implemented in `src/engine/prng.ts` using a published algorithm that `design.md` names.
2. WHEN the PRNG is constructed with an integer seed in [0, 4294967295], THE PRNG SHALL expose a function that returns the next unsigned 32-bit integer in [0, 4294967295].
3. WHEN the integer-range function is called with integers min and max where min ≤ max, THE PRNG SHALL return an integer in the inclusive range [min, max], for any range width up to 2^32 values (min = 0, max = 4294967295 included).
4. THE PRNG SHALL draw integers from an inclusive range without modulo bias, using a method that `design.md` names, and the PRNG unit tests SHALL include a distribution check over a range whose width is not a power of two.
5. IF the integer-range function is called with min greater than max, or with a min or max that is not an integer, or with a range wider than 2^32 values, THEN THE PRNG SHALL return a typed error of kind `"invalid-range"` and SHALL NOT advance its state.
6. WHEN the PRNG is constructed twice with the same seed, THE PRNG SHALL produce identical output sequences over the initial 1,000 calls to the next-integer function and the initial 1,000 calls to the integer-range function.
7. THE PRNG unit tests SHALL include the reference test vectors published for the chosen algorithm.
8. IF the supplied seed is not an integer in [0, 4294967295], THEN THE PRNG SHALL return a typed error of kind `"invalid-seed"` and SHALL NOT construct a generator.
9. WHEN the Gremlin_Engine derives a Run_Seed from a Campaign_Seed and a Run_Index, THE Gremlin_Engine SHALL return an unsigned 32-bit integer that depends only on those two inputs, so that the same pair always gives the same Run_Seed.
10. IF the Campaign_Seed is not an integer in [0, 4294967295], or the Run_Index is not an integer in [0, 4294967295], THEN THE Gremlin_Engine SHALL return a typed error of kind `"invalid-seed"` for the Campaign_Seed or of kind `"invalid-run-index"` for the Run_Index, and SHALL NOT derive a Run_Seed.
11. THE Gremlin_Engine SHALL give different Run_Seed values for different Run_Index values under one Campaign_Seed, and `design.md` SHALL state how this is ensured (for example, a bijective mix of Run_Index for a fixed Campaign_Seed), and a test SHALL check that Run_Index 0 through 9,999 under at least 3 different Campaign_Seed values produce no duplicate Run_Seed. This test is evidence, not proof; the assurance comes from the construction.
12. THE Gremlin_Engine SHALL obtain all random values from a PRNG instance passed explicitly as an argument, and SHALL NOT call `Math.random`.

### Requirement 2: Analog Input Support in the EmulatorBridge

**User Story:** As a firmware checker, I want the bridge to drive ADC channels, so that gremlins can attack sensor readings.

#### Acceptance Criteria

1. THE EmulatorBridge SHALL accept Fixture pins of the form `{ signal, kind: "analog", channel }` and `{ signal, kind: "analog", channel, restLevel }`, where channel is an integer from 0 to 5 and the optional restLevel is an integer from 0 to 1023.
2. WHEN the EmulatorBridge is constructed, THE EmulatorBridge SHALL wire the avr8js ADC peripheral, and THE EmulatorBridge SHALL return `true` from `supports("adc")`.
3. THE `design.md` SHALL quote the installed avr8js ADC API and its units from `node_modules`, and any statement about that API SHALL stay marked UNVERIFIED until the quote is present.
4. WHEN an Analog_Event `{ signal, analog, cycle }` is scheduled for an Analog_Input, THE EmulatorBridge SHALL apply it at the earliest instruction boundary whose cycle count is greater than or equal to the event cycle, and SHALL set the ADC channel value to `analog`.
5. WHILE no Analog_Event has been applied to an Analog_Input, THE EmulatorBridge SHALL present the pin's restLevel on its ADC channel, and IF the Fixture pin has no restLevel, THEN THE EmulatorBridge SHALL present a Rest_Level of 512.
6. WHEN an Analog_Event is applied, THE EmulatorBridge SHALL record an applied-input entry containing the original event fields (`signal`, `analog`, `cycle`) and `appliedCycle`.
7. IF an Analog_Event has an `analog` value that is not an integer from 0 to 1023, THEN THE EmulatorBridge SHALL return a typed error of kind `"invalid-analog-value"` containing the signal name before execution begins, and SHALL apply no events from that event list.
8. IF an Analog_Event targets a Digital_Input, or a digital event targets an Analog_Input, THEN THE EmulatorBridge SHALL return a typed error of kind `"pin-kind-mismatch"` containing the signal name before execution begins.
9. IF an Analog_Event names a signal that is not a pin in the Fixture, THEN THE EmulatorBridge SHALL return the same typed error kind that it returns today for a digital event with an unknown signal, containing the signal name, before execution begins.
10. IF two Fixture pins are Analog_Inputs with the same channel, or an Analog_Input has a channel that is not an integer from 0 to 5, or an Analog_Input has a restLevel that is not an integer from 0 to 1023, THEN THE EmulatorBridge SHALL return a typed error of kind `"invalid-fixture"` before execution begins.
11. WHEN a Fixture is supplied without any analog pin, THE EmulatorBridge SHALL produce output events, applied inputs and diagnostics identical to those it produced before this change for the same HEX, Fixture and ordered event list, and `supports()` and `unsupported()` results for peripherals other than ADC SHALL be unchanged.
12. IF an Analog_Input with `channel` N and a Fixture pin that is not an Analog_Input (a Digital_Input or an output pin) are on the same physical pin, meaning the other pin has `port` `"C"` and `bit` equal to N (ATmega328P ADC channel N is port C bit N, so A0 to A5 are PC0 to PC5), THEN THE EmulatorBridge SHALL return a typed error of kind `"invalid-fixture"` whose message names both signals, before execution begins.

### Requirement 3: Digital Pin Kind and Active Level

**User Story:** As a teacher, I want each button to say whether pressing it drives low or high, so that INPUT_PULLUP buttons and active-high buttons both behave correctly.

#### Acceptance Criteria

1. THE EmulatorBridge SHALL accept Digital_Input Fixture pins that carry `kind: "digital"` and `activeLevel: "low" | "high"`.
2. WHEN a Fixture pin has no `kind` field, THE EmulatorBridge SHALL treat the pin as `kind: "digital"`, so existing fixtures keep working unchanged.
3. WHEN a Digital_Input has no `activeLevel` field, THE EmulatorBridge SHALL treat its Active_Level as `"low"`.
4. IF a Fixture pin has an `activeLevel` value other than `"low"` or `"high"`, or an analog or output pin carries `activeLevel`, THEN THE EmulatorBridge SHALL reject the Fixture, SHALL return a typed error of kind `"invalid-fixture"` naming the signal, and SHALL start no Run with that Fixture.
5. WHEN a Gremlin produces a Press for a Digital_Input with Active_Level `"low"`, THE Gremlin_Engine SHALL emit an Input_Event with value 0.
6. WHEN a Gremlin produces a Press for a Digital_Input with Active_Level `"high"`, THE Gremlin_Engine SHALL emit an Input_Event with value 1.
7. WHEN a Gremlin ends a Press, THE Gremlin_Engine SHALL emit an Input_Event with value `"release"` and SHALL NOT emit an Input_Event whose value is a driven inactive level.
8. WHILE a Digital_Input is released, THE EmulatorBridge SHALL keep the existing `input-pullup` behaviour: the pin reads HIGH when a pull-up is enabled, and reads LOW when no pull-up is enabled, in which case THE EmulatorBridge SHALL emit exactly one `floating-input` diagnostic per signal per Run.
9. WHEN a Run applies Input_Events on a Fixture that has a floating-input case (such as `fixtures/floating_input`), THE EmulatorBridge SHALL produce `floating-input` diagnostics whose kind, signal, cycle and register are identical to those the `input-pullup` spec defines for the same applied events.
10. WHEN the same HEX, Fixture and ordered Event_List are replayed on a fresh EmulatorBridge, THE EmulatorBridge SHALL produce output events, applied inputs and diagnostics identical to the original Run, including for Fixtures with analog pins.
11. WHEN a recorded Input_Event carries a `gremlinId` field, THE EmulatorBridge SHALL ignore the field when deciding how to apply the event and SHALL copy its value unchanged into the applied-input entry.
12. THE EmulatorBridge SHALL accept Digital_Input Fixture pins that carry `restState: "released" | "active"`.
13. WHEN a Digital_Input has no `restState` field, THE EmulatorBridge SHALL treat its Rest_State as `"released"`.
14. IF a Fixture pin has a `restState` value other than `"released"` or `"active"`, or an analog or output pin carries `restState`, THEN THE EmulatorBridge SHALL reject the Fixture, SHALL return a typed error of kind `"invalid-fixture"` naming the signal, and SHALL start no Run with that Fixture.
15. WHERE a Digital_Input has Rest_State `"active"`, THE Gremlin_Engine SHALL generate a Rest_Event at cycle 0 that drives the pin to its Active_Level, and THE EmulatorBridge SHALL apply that Rest_Event as an ordinary Input_Event with `gremlinId` `"rest"` and SHALL NOT generate Rest_Events itself.

### Requirement 4: Gremlin Catalogue

**User Story:** As a maker, I want a small set of named gremlins with clear behaviour, so that I can pick the attacks I care about.

#### Acceptance Criteria

1. THE Gremlin_Engine SHALL provide exactly six Gremlins: Masher, Bouncer, Stuck, Dropout, Spike and Drifter, where Dropout targets only Digital_Inputs with Rest_State `"active"` and Masher, Bouncer and Stuck target any Digital_Input.
2. THE Gremlin_Engine SHALL give each Gremlin an id, an Icon_Name, a list of target pin kinds, and parameters that each have a default value and an allowed range (minimum and maximum, both inclusive).
3. THE Gremlin_Engine SHALL record the producing Gremlin_Id on every Input_Event a Gremlin generates, and SHALL record `"rest"` on every Rest_Event, so that a Rest_Event is never counted as an event of any Gremlin.
4. THE Gremlin_Engine SHALL generate only Input_Events (Rest_Events included) whose cycle is an integer in [0, Run_Cycles).
5. THE Gremlin_Engine SHALL convert every duration given in milliseconds to an integer cycle count using integer arithmetic on the Fixture clock rate (16 000 cycles per millisecond at 16 MHz), with 0.1 ms equal to 1 600 cycles.
6. WHERE a caller supplies a parameter override, THE Gremlin_Engine SHALL use the override in place of the default for that parameter and SHALL use the default for every parameter without an override.
7. IF a parameter override lies outside the allowed range of that parameter, or its min is greater than its max, THEN THE Gremlin_Engine SHALL return a typed error of kind `"invalid-gremlin-parameter"` naming the Gremlin_Id and parameter, and SHALL generate no events for the Run.
8. IF a Gremlin_Set contains a Gremlin id that is not one of the six Gremlins, THEN THE Gremlin_Engine SHALL return a typed error of kind `"unknown-gremlin"` naming the unknown id, and SHALL generate no events for the Run.
9. WHERE a Gremlin_Set lists the same Gremlin_Id more than once, THE Gremlin_Engine SHALL run each listed entry as a separate instance, each with its own parameter overrides and its own draws from the seeded PRNG, in the order listed.
10. WHEN a Gremlin has no eligible target pin in the Fixture (for Dropout: no Digital_Input with Rest_State `"active"`), THE Gremlin_Engine SHALL generate no events for that Gremlin and SHALL record the Gremlin_Id as skipped with the reason `"no-target-pin"` in the Skipped_List of that Run.
11. WHEN a Gremlin selects a target pin, THE Gremlin_Engine SHALL choose one pin by a single draw from the seeded PRNG, uniformly among Fixture pins in Fixture pin order whose kind matches the target kinds of that Gremlin and whose direction is `"input"`, and for Dropout only among those with Rest_State `"active"`.
12. IF a Stuck or a Drifter cannot place its whole span inside [0, Run_Cycles), THEN THE Gremlin_Engine SHALL draw its start cycle only from the range that fits, and WHEN no such range exists THE Gremlin_Engine SHALL generate no events for it and record the Gremlin_Id as skipped with the reason `"run-too-short"` in the Skipped_List of that Run, where the Stuck makes that decision before any draw (Requirement 5, criterion 6) and the Drifter makes it after its draws (a) to (c) (Requirement 6, criterion 3), so that the Drifter consumes those three draws; Masher, Bouncer, Dropout and Spike SHALL instead discard events whose cycle is not below Run_Cycles and keep the earlier events unchanged.
13. WHEN a Run is generated, THE Gremlin_Engine SHALL emit one Rest_Event at cycle 0 for each Digital_Input with Rest_State `"active"`, in Fixture pin order, driving the value of its Active_Level, whether or not any Gremlin runs, including when Run_Cycles is 1.
14. WHEN the same Fixture, Gremlin_Set (with overrides), Run_Cycles and PRNG seed are given twice, THE Gremlin_Engine SHALL produce identical ordered event lists and identical Skipped_Lists, with draws taken in this order: Gremlin_Set entries in listed order, and within each entry in the order stated in that Gremlin's own criteria in Requirements 5 and 6.

### Requirement 5: Digital Gremlin Behaviour

**User Story:** As a student, I want button gremlins that mash, chatter, stick and drop out, so that I can see how my sketch handles messy buttons.

#### Acceptance Criteria

1. WHEN the Masher runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Digital_Input, (b) the Press count as an integer from 1 to 6 inclusive, (c) the start cycle as an integer from 0 to Run_Cycles minus 1 inclusive, and (d) one gap per Press after the first, each as a whole number of cycles from 80,000 to 2,400,000 inclusive (5 ms to 150 ms at 16 MHz), AND SHALL emit for each Press one Press event at the Press start cycle and one Release event at the Press start cycle plus floor(gap / 2) cycles, where the gap for the last Press of a burst with more than one Press is the last drawn gap, and the single Press of a burst with one Press is released at the Press start cycle plus floor(gapCycles.min / 2) cycles, where gapCycles.min is the resolved minimum of the Masher gap parameter (default 80,000, so 40,000 cycles).
2. IF a Masher event cycle is greater than or equal to Run_Cycles, THEN THE Gremlin_Engine SHALL discard that event and every later event of the same burst, and SHALL keep the earlier events unchanged.
3. WHEN the Bouncer runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Digital_Input, (b) the bounced edge as one binary draw where 0 means press edge and 1 means release edge, (c) the flip count as an integer from 2 to 8 inclusive, (d) the start cycle as an integer from 0 to Run_Cycles minus 1 inclusive, and (e) one gap per flip after the first, each as a whole number of cycles from 1,600 to 48,000 inclusive (0.1 ms to 3 ms at 16 MHz).
4. WHEN the Bouncer emits its flips, THE Gremlin_Engine SHALL place flip 1 at the start cycle and each later flip at the previous flip's cycle plus its drawn gap, SHALL alternate the flip values so that the final flip carries the Press value for a press edge or the Release value for a release edge (the Press and Release values being those defined in Requirement 3), and SHALL discard any flip at a cycle greater than or equal to Run_Cycles while keeping earlier flips unchanged, in which case the final flip is the last kept flip.
5. WHEN the Stuck runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Digital_Input, (b) the start cycle as an integer from 0 to Run_Cycles minus 1,600,000 inclusive, and (c) the span as a whole number of cycles from 1,600,000 (100 ms) to Run_Cycles minus the start cycle inclusive, AND SHALL emit one Press event at the start cycle and, only if start cycle plus span is less than Run_Cycles, one Release event at start cycle plus span.
6. IF Run_Cycles is less than 1,600,001, THEN THE Gremlin_Engine SHALL skip the Stuck before any draw, generate no Stuck events, and record the Gremlin_Id `stuck` as skipped with the reason `"run-too-short"`.
7. WHEN the Dropout runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Digital_Input from those with Rest_State `"active"`, (b) the start cycle as an integer from 0 to Run_Cycles minus 1 inclusive, and (c) the gap as a whole number of cycles from 16,000 to 800,000 inclusive (1 ms to 50 ms at 16 MHz), AND SHALL emit one Release event at the start cycle and one Press event at the Active_Level at start cycle plus gap, discarding the Press event if its cycle is greater than or equal to Run_Cycles.
8. THE Gremlin_Engine SHALL draw every gap as at least 1 cycle, so that no two events from one Gremlin run on the same Digital_Input share a cycle.
9. THE Masher, Bouncer and Stuck SHALL target only Digital_Inputs, and THE Dropout SHALL target only Digital_Inputs with Rest_State `"active"`.
10. THE Gremlin_Engine SHALL give each digital Gremlin parameters for its count range and its timing range, with the ranges named in criteria 1, 3, 5 and 7 as defaults, and SHALL treat a parameter range whose minimum is greater than its maximum, or whose minimum is below 1 cycle for a gap (below 2 cycles for the Masher gap, so that its Release falls strictly between its Press and the next Press), as invalid and return the `"invalid-gremlin-parameter"` error of Requirement 4.
11. IF the Fixture has no Digital_Input with Rest_State `"active"`, THEN THE Gremlin_Engine SHALL skip the Dropout, generate no Dropout events, record the Gremlin_Id `dropout` as skipped with the reason `"no-target-pin"`, and make no PRNG draw for it.

### Requirement 6: Analog Gremlin Behaviour

**User Story:** As a maker with a sensor, I want gremlins that spike and drift my analog readings, so that I can see how my sketch handles bad sensor data.

#### Acceptance Criteria

1. WHEN the Spike runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Analog_Input, (b) the spike value as one binary draw choosing 0 or 1023, (c) the start cycle as an integer from 0 to Run_Cycles minus 1 inclusive, and (d) the gap as an integer number of milliseconds from 1 to 20 inclusive, converted to cycles at 16,000 cycles per millisecond.
2. WHEN the Spike emits its events, THE Gremlin_Engine SHALL emit one Analog_Event at the start cycle that sets the Analog_Input to the spike value and a second Analog_Event at the start cycle plus the gap in cycles that sets the same Analog_Input to its Rest_Level, and SHALL discard the second event if its cycle is greater than or equal to Run_Cycles.
3. WHEN the Drifter runs, THE Gremlin_Engine SHALL draw, in this order from the seeded PRNG: (a) the Analog_Input, (b) the direction as one binary draw choosing target 0 or target 1023, (c) the duration as an integer number of milliseconds from 50 to 500 inclusive, converted to D cycles at 16,000 cycles per millisecond, and (d) the start cycle as an integer from 0 to Run_Cycles minus 1 minus D inclusive. IF Run_Cycles minus 1 minus D is below 0, THEN THE Gremlin_Engine SHALL skip the Drifter after draw (c), having consumed draws (a) to (c), and record `drifter` as skipped with the reason `"run-too-short"`; the step count S is a parameter and is not drawn.
4. WHEN the Drifter runs with S steps, THE Gremlin_Engine SHALL emit S Analog_Events for step i = 1 to S, where step i has cycle start + floor(D * i / S) and analog value rest + trunc((target - rest) * i / S), using integer arithmetic with truncation toward zero, so that step S has cycle start + D and analog value equal to target.
5. THE Gremlin_Engine SHALL emit Drifter step cycles that are strictly increasing, and IF D is less than S, THEN THE Gremlin_Engine SHALL return an `"invalid-gremlin-parameter"` error naming `drifter` and indicating that the duration is too short for the step count, and SHALL emit no Analog_Events for that Drifter.
6. IF the Rest_Level equals the Drifter target, THEN THE Gremlin_Engine SHALL still emit all S Analog_Events, each with an analog value equal to the target.
7. THE Drifter SHALL leave the Analog_Input at the target value after step S and SHALL NOT emit any Analog_Event that returns the pin to its Rest_Level after the drift (unlike the Spike); early steps whose value equals the Rest_Level because of truncation are allowed.
8. THE Drifter SHALL have a step-count parameter S with a default of 8 and an allowed range of 2 to 32 inclusive, and IF a configured value is outside that range or not an integer, THEN THE Gremlin_Engine SHALL return the `"invalid-gremlin-parameter"` error of Requirement 4 and SHALL emit no Analog_Events for that Drifter.
9. THE Spike SHALL have a gap parameter range with defaults of 1 ms minimum and 20 ms maximum, and THE Drifter SHALL have a duration parameter range with defaults of 50 ms minimum and 500 ms maximum, and IF a configured range is not made of integers, has a minimum above its maximum, or has a minimum below 1 ms, THEN THE Gremlin_Engine SHALL return the `"invalid-gremlin-parameter"` error of Requirement 4.
10. THE Gremlin_Engine SHALL take the Rest_Level of an Analog_Input from the pin's `restLevel` when present and 512 when absent; validation of `restLevel` is the EmulatorBridge's duty under Requirement 2 criterion 10.
11. THE Spike and Drifter SHALL target only Analog_Inputs, and IF the Fixture defines no Analog_Input, THEN THE Gremlin_Engine SHALL emit no Analog_Events for the Spike or Drifter, record the Gremlin_Id as skipped with the reason `"no-target-pin"`, and make no PRNG draw for it.
12. THE Gremlin_Engine SHALL emit Analog_Events whose `analog` value is an integer from 0 to 1023 inclusive.

### Requirement 7: Event List Construction

**User Story:** As a trace replayer, I want each Run's events in a stable order, so that a recorded run can be replayed exactly.

#### Acceptance Criteria

1. WHEN a Run is generated, THE Gremlin_Engine SHALL derive exactly one PRNG from the Run_Seed and pass that same instance explicitly, in Gremlin_Set order, to each Gremlin in the Gremlin_Set.
2. THE Gremlin_Engine SHALL generate all Rest_Events before any Gremlin event and SHALL draw 0 values from the PRNG while generating Rest_Events.
3. THE Gremlin_Engine SHALL sort the combined events of a Run using a stable sort keyed on cycle ascending (integer CPU cycles), so that events with equal cycles keep generation order and Rest_Events precede Gremlin events at equal cycles. THE Gremlin_Engine SHALL NOT rely on a default sort that is not specified to be stable.
4. WHEN the same Campaign_Seed, Gremlin_Set, Fixture, Run_Cycles and Run_Index are supplied twice, THE Gremlin_Engine SHALL return Event_Lists that are identical in length, and identical in order, cycle, and every event field at every position.
5. THE Gremlin_Engine SHALL generate the Event_List of Run i from only the Campaign_Seed, Gremlin_Set, Fixture, Run_Cycles and Run_Index, and SHALL NOT read the results, Event_Lists or PRNG state of any other Run.
6. WHEN the same Campaign_Seed, Gremlin_Set, Fixture, Run_Cycles and Run_Index are supplied under any slice size or any `stopOnFirstViolation` setting, THE Gremlin_Engine SHALL return the identical Event_List for that Run_Index.
7. IF a Gremlin in the Gremlin_Set is skipped for a Run with the reason `"no-target-pin"`, or the Stuck is skipped with the reason `"run-too-short"`, THEN THE Gremlin_Engine SHALL make the skip decision before any draw for that Gremlin, SHALL draw 0 values from the PRNG on that Gremlin's behalf, and SHALL pass the PRNG unchanged to the next Gremlin. IF the Drifter is skipped with the reason `"run-too-short"`, THEN THE Gremlin_Engine SHALL consume the Drifter's draws (a) to (c) of Requirement 6, criterion 3, before the skip. The draws of each later Gremlin SHALL depend only on the Gremlin_Set order and on the draws actually made by the Gremlins before it.

### Requirement 8: Campaign Execution

**User Story:** As a maker, I want to run many seeded attacks against my HEX and stop each run at a rule violation, so that I can see which attack broke it.

#### Acceptance Criteria

1. THE Gremlin_Engine SHALL accept as Campaign input: the program HEX, the Fixture, the Gremlin_Set, the Campaign_Seed, the run count N, Run_Cycles, a Checker callback, the option `stopOnFirstViolation` and the parameter `maxStepCycles`.
2. WHERE N is not supplied, THE Gremlin_Engine SHALL use N = 64.
3. WHERE Run_Cycles is not supplied, THE Gremlin_Engine SHALL use the value given by the selected example, and WHERE the example gives none, THE Gremlin_Engine SHALL use 8 000 000 cycles (0.5 s at 16 MHz).
4. WHERE the caller supplies no value for `maxStepCycles`, THE Gremlin_Engine SHALL use `maxStepCycles` = 160 000 and SHALL call that value Max_Step_Size.
5. WHERE the caller supplies no value for `stopOnFirstViolation`, THE Gremlin_Engine SHALL use true.
6. IF N is not a positive integer, or Run_Cycles is not a positive integer no greater than 2^32 (4294967296), or `maxStepCycles` is not a positive integer, or `stopOnFirstViolation` is supplied and is not a boolean, THEN THE Gremlin_Engine SHALL return a typed error of kind `"invalid-campaign"` before any Run starts, and SHALL return no Campaign_Result.
7. IF the HEX is invalid (it fails HEX parsing or the EmulatorBridge rejects it when loading), THEN THE Gremlin_Engine SHALL return a typed error identifying the HEX as the cause before any Run starts, SHALL return no Campaign_Result, and SHALL NOT report a Verdict of `HELD`.
8. WHEN a Run starts, THE Gremlin_Engine SHALL create a fresh EmulatorBridge from the HEX, the Fixture and the Run's Event_List, and SHALL reuse no state from any earlier Run.
9. WHEN a Run executes, THE Gremlin_Engine SHALL advance the EmulatorBridge in Steps toward an absolute target cycle, where each Step calls advance(target minus `cycleCount`) and the target is the smallest of: (a) the cycle of the next pending Input_Event that is greater than the current target, (b) Run_Cycles, and (c) the previous target plus Max_Step_Size, with the previous target of the first Step equal to 0 (so the first Step's candidate (c) is 0 plus Max_Step_Size). A "pending Input_Event" is an Input_Event in the Run's Event_List that has not yet been applied. An Input_Event with cycle 0, and any Input_Event whose cycle is less than or equal to the current `cycleCount`, SHALL be applied before the next Step advances. Because each target derives from the previous target and not from `cycleCount`, instruction overshoot SHALL NOT accumulate across Steps.
10. WHEN an advance finishes with an EmulatorBridge `cycleCount` greater than the requested target because the last instruction crossed the boundary, THE Gremlin_Engine SHALL treat the EmulatorBridge `cycleCount` as the true current cycle, SHALL use it for Run_Cycles comparison and for every cycle passed to the Checker, SHALL NOT move any later target because of the overshoot, and SHALL NOT report an error. WHEN, after applying all Input_Events that are due at the current `cycleCount`, the next computed target is less than or equal to `cycleCount` (an overshoot already passed it), THE Gremlin_Engine SHALL skip that target and compute the next target by criterion 9 from the skipped target, repeating until a target greater than `cycleCount` is found, so that no Step advances by zero or a negative number of cycles, and a skipped target SHALL cause no advance call and no Checker call.
11. WHEN a Step finishes, THE Gremlin_Engine SHALL call the Checker once with only the data produced since the previous Checker call in the same Run (the new output events, the Input_Events applied in this Step, the new diagnostics) and the EmulatorBridge `cycleCount`, and SHALL NOT resend earlier data.
12. WHEN the Checker returns a Violation for a Step, THE Gremlin_Engine SHALL stop that Run after that Step, SHALL execute no further Step, SHALL NOT call the Checker again for that Run, and SHALL record the Violation in the Run_Result. The Violation SHALL name the violated rule and the cycle at which it was observed.
13. WHEN the EmulatorBridge `cycleCount` is greater than or equal to Run_Cycles after a Step and no Violation has been returned, THE Gremlin_Engine SHALL end the Run's Steps, and SHALL call the Checker one more time with an end-of-run marker, the data produced since the previous Checker call, and the EmulatorBridge `cycleCount` as the end-of-run cycle, which SHALL NOT be inferred from the last Input_Event, so that bounded rules can conclude. IF the Checker returns a Violation for that call, THEN THE Gremlin_Engine SHALL record it in the Run_Result as in criterion 12.
14. THE Gremlin_Engine SHALL record in each Run_Result the Run_Seed, the Event_List with Gremlin_Ids, the Skipped_List, the applied inputs, the output events, the diagnostics, and the Violation or none, covering events up to the stop point (the end of the Step in which the Violation was returned, or the end-of-run cycle).
15. THE Gremlin_Engine SHALL produce Run_Result content (applied inputs, output events, diagnostics, and the cycles recorded on them) that is identical for any valid `maxStepCycles` value, given the same HEX, Fixture and Event_List, up to the cycle of the Violation when one is recorded; because a Run stops at the end of the Step in which the Violation was returned, the amount of data recorded after the Violation cycle MAY differ between step sizes and is not covered by this requirement.
16. WHILE `stopOnFirstViolation` is true, WHEN a Run records a Violation, THE Gremlin_Engine SHALL execute no further Run and SHALL return a Campaign_Result recording the runs completed (counting the violating Run) and the violating Run_Index.
17. WHILE `stopOnFirstViolation` is false, THE Gremlin_Engine SHALL execute all N Runs and SHALL return a Campaign_Result recording N runs completed and the earliest violating Run_Index or none.
18. WHEN a Campaign ends with no Violation, THE Gremlin_Engine SHALL return a Campaign_Result recording the runs completed (N) and no violating Run_Index.
19. IF the EmulatorBridge returns a typed error while building or advancing a Run, THEN THE Gremlin_Engine SHALL stop the Campaign, SHALL return that error with the Run_Index, and SHALL NOT report a Verdict of `HELD`.
20. IF the Checker throws an exception, THEN THE Gremlin_Engine SHALL stop the Campaign, SHALL return a typed error of kind `"checker-error"` with the Run_Index and the cycle of the failing call, and SHALL NOT report a Verdict of `HELD`.
21. THE Checker SHALL receive no clock, no PRNG and no network handle, and THE Gremlin_Engine SHALL NOT call `Date.now`, `performance.now` or `setTimeout` for any timing.

### Requirement 9: Pause and Resume

**User Story:** As a user watching a progress bar, I want the campaign to run in slices, so that the page stays responsive and the results do not change.

#### Acceptance Criteria

1. WHEN a Slice of k Runs is requested on a Campaign handle that has not ended, THE Gremlin_Engine SHALL execute min(k, N minus completed Runs) Runs in ascending Run_Index order, and SHALL return progress containing the number of Runs completed, the total N, a finished flag, the next Run_Index, and the Run_Results so far.
2. WHEN a Campaign is run in one call or in Slices of any size k, THE Gremlin_Engine SHALL produce identical Run_Results and an identical Campaign_Result for the same HEX, Fixture, Gremlin_Set, Campaign_Seed and N, for `stopOnFirstViolation` true and for false.
3. WHEN a Slice returns, THE Campaign handle SHALL hold no EmulatorBridge from any Run, because a Run is never split and pausing happens only between Runs.
4. WHEN a Campaign is resumed from only the next Run_Index and the stored Run_Results, THE Gremlin_Engine SHALL produce Run_Results and a Campaign_Result identical to those of an uninterrupted Campaign.
5. THE Gremlin_Engine SHALL store the Run_Results held by a Campaign handle as plain serializable data, such that a JSON round trip yields a value deeply equal to the original.
6. IF a Slice is requested after the Campaign has ended (all N Runs completed, or stopped at a violating Run with `stopOnFirstViolation` true), THEN THE Gremlin_Engine SHALL return the final Campaign_Result with the finished flag set to true, SHALL run no additional Run, and SHALL leave the stored Run_Results unchanged.
7. WHILE `stopOnFirstViolation` is true, THE Gremlin_Engine SHALL end a Slice at the violating Run, SHALL set the finished flag to true, and SHALL NOT execute any Run after it, even when k exceeds the number of Runs left before N.
8. IF k is not a positive integer (zero, negative, fractional, NaN, or infinite), THEN THE Gremlin_Engine SHALL return a typed error of kind `"invalid-campaign"`, SHALL run no Run, and SHALL leave the Campaign handle's next Run_Index and stored Run_Results unchanged.

### Requirement 10: Verdict Reporting

**User Story:** As a student, I want results in plain words that do not overclaim, so that I know what the check did and did not show.

#### Acceptance Criteria

1. THE Gremlin_Engine SHALL compute the Verdict as a pure function of the Campaign_Result data and the Checker outcomes, using no wall-clock time, no randomness and no network calls.
2. WHEN a Campaign finishes and at least one Run has a Violation, THE Gremlin_Engine SHALL report the Verdict `BROKE` together with the trace of the earliest violating Run (its Run_Seed, Event_List, output events and Violation), whether the Campaign stopped at that Run or went on to run all N Runs.
3. WHEN a Campaign finishes with at least one Violation, THE Gremlin_Engine SHALL report `BROKE` even if the Checker also reported that other rules could not be checked, and SHALL list each such unchecked rule with its reason alongside the `BROKE` trace without changing the Verdict.
4. WHEN a Campaign has completed all N Runs, no Run has a Violation, the Checker reported no rule as unable to be checked, and at least one Gremlin generated at least one event across the Campaign, THE Gremlin_Engine SHALL report the Verdict text "No violation found in N runs of this gremlin set. Not a proof." where N equals the number of Runs completed and equals the requested run count.
5. IF no Run has a Violation and the Checker reports that a rule cannot be checked with the available signals, peripherals or run length, THEN THE Gremlin_Engine SHALL report the Verdict `COULDN'T TELL` with a plain-language reason of 1 to 200 characters naming the rule and what was missing, and SHALL NOT report `HELD`.
6. IF no Run has a Violation and no Gremlin generated events in any Run (Rest_Events do not count as Gremlin events), THEN THE Gremlin_Engine SHALL report the Verdict `COULDN'T TELL` with a plain-language reason of 1 to 200 characters stating that the gremlins produced no events and the program was only run at rest, and SHALL NOT report `HELD`.
7. IF no Run has a Violation and the Fixture leaves a signal named by the Checker unmapped, or the HEX uses a peripheral the EmulatorBridge does not support, THEN THE Gremlin_Engine SHALL report `COULDN'T TELL` with a plain-language reason naming the unmapped signal or unsupported peripheral, and SHALL NOT guess a value for it.
8. IF a rule's property depends on an unbounded "eventually" condition, THEN THE Gremlin_Engine SHALL treat that rule as one that cannot be checked with the available run length and SHALL apply criterion 5.
9. IF the Campaign is stopped by a Violation before completing N Runs, THEN THE Gremlin_Engine SHALL report `BROKE` per criterion 2 and SHALL NOT report `HELD`.
10. WHILE a Campaign has completed fewer than N Runs, THE Gremlin_Engine SHALL NOT report `HELD`.
11. WHEN more than one Verdict condition applies, THE Gremlin_Engine SHALL select the Verdict in this order: `BROKE`, then `COULDN'T TELL`, then `HELD`, and SHALL report exactly one Verdict per Campaign.
12. THE Gremlin_Engine SHALL use only these Verdict strings: `BROKE`, the HELD sentence in criterion 4, and `COULDN'T TELL`.
13. THE Gremlin_Engine, its user-visible strings and its docs SHALL NOT contain any word the workspace `product` rule bans in UI copy, docs and video scripts (matched case-insensitively as whole words, with a test reading the list from one constant in code), and SHALL NOT state or imply that the program will behave correctly outside the Runs performed. Do NOT list the banned words in this document.

### Requirement 11: Correctness Properties

**User Story:** As the project owner, I want property-based tests for the engine, so that I have evidence for determinism and validity. These tests are evidence, not proof.

#### Acceptance Criteria

1. FOR ALL Campaign_Seed, Gremlin_Set, Fixture and Run_Cycles inputs, generating the Event_List twice SHALL produce identical lists, compared event by event on cycle, target, value and Gremlin_Id (determinism). The test SHALL use at least 100 fast-check runs. Validates: Requirement 7, criterion 4.
2. FOR ALL events in an Event_List, THE event SHALL target a Fixture input whose kind matches the producing Gremlin (or the pin of a Rest_Event). Dropout events SHALL target only pins with Rest_State `"active"`. THE event's cycle SHALL be an integer in [0, Run_Cycles). The test SHALL use at least 100 fast-check runs. Validates: Requirement 4, criteria 1, 4 and 13.
3. FOR ALL generated Analog_Events, THE `analog` value SHALL be an integer in 0..1023 inclusive. The test SHALL use at least 100 fast-check runs. Validates: Requirement 6, criterion 12.
4. FOR ALL generated Event_Lists, THE list SHALL be sorted by cycle in non-decreasing order, and events with equal cycles SHALL keep generation order. The test SHALL use at least 100 fast-check runs. Validates: Requirement 7, criterion 3.
5. FOR ALL generated digital events, THE value SHALL be either the Active_Level value of the target pin or `"release"`. The test SHALL use at least 100 fast-check runs. Validates: Requirement 3, criteria 5 to 7.
6. FOR ALL events in an Event_List, THE event SHALL carry the Gremlin_Id of a Gremlin in the Gremlin_Set, or `"rest"` for a Rest_Event. The test SHALL use at least 100 fast-check runs. Validates: Requirement 4, criterion 3.
7. FOR ALL Campaigns and for both values of `stopOnFirstViolation`, running in one call or in Slices of k Runs (k an integer from 1 to the Campaign's Run count) SHALL produce identical Run_Results, an identical Campaign_Result, and an identical Event_List for each Run. The test runs the emulator and SHALL use at least 20 fast-check runs. Validates: Requirement 9, criterion 2 and Requirement 7, criterion 6.
8. FOR ALL Runs, including Runs on a Fixture with analog pins, replaying the recorded Event_List on a fresh EmulatorBridge SHALL produce the same output events and diagnostics. For analog pins, the replayed Analog_Events SHALL apply the same `analog` values at the same cycles as the recorded Run. The test runs the emulator and SHALL use at least 20 fast-check runs. Validates: Requirement 3, criterion 10.
9. FOR ALL Runs on a Fixture that has floating-input pins, THE Gremlin_Engine SHALL leave the one-per-signal-per-run `floating-input` rule intact. The test runs the emulator and SHALL use at least 20 fast-check runs. Validates: Requirement 3, criteria 8 and 9.
10. FOR ALL Runs, results with `maxStepCycles` 160 000 and with `maxStepCycles` 16 000 SHALL be identical. "Identical" covers the Run_Result fields output events, applied inputs, diagnostics and Violation, including the rule and the cycle at which the Violation is observed; WHEN a Violation is recorded, output events, applied inputs and diagnostics are compared only up to the Violation cycle (see Requirement 8, criterion 15). FOR Runs that end with no Violation, the run's end cycle (the EmulatorBridge `cycleCount` at the end of the Run) is also compared and SHALL be identical for `maxStepCycles` 160 000 and 16 000. It excludes the number of Checker calls. A Violation cycle that depends on Step boundaries SHALL NOT be allowed, and the property SHALL fail if the two Violation cycles differ. The test runs the emulator, SHALL use at least 20 fast-check runs, and SHALL use a Checker that is a pure function of the observation content accumulated so far. A Checker that reacts to Step boundaries is outside this property. Validates: Requirement 8, criteria 9 to 15.
11. THE test suite SHALL include the PRNG reference vectors, the existing `emulator-bridge` and `input-pullup` tests unchanged, and example tests for each Gremlin's documented ranges. Validates: Requirement 1, criterion 7, and Requirements 5 and 6.
12. FOR ALL Campaign_Seed values and Run indices, THE Run_Seed derivation SHALL be a pure function: calling it twice with the same inputs SHALL return identical Run_Seeds, and its result SHALL NOT depend on call order, earlier calls or Slice size. The test SHALL use at least 100 fast-check runs. Validates: Requirement 1, criterion 9.
13. FOR ALL seeds and integer bounds min ≤ max, THE PRNG range function SHALL return an integer r with min ≤ r ≤ max, inclusive on both ends, including when min equals max. The test SHALL use at least 100 fast-check runs. Validates: Requirement 1, criterion 3.
14. IF an acceptance test written by the user disagrees with the system, THEN THE agent SHALL stop, report what the test expects, what happened and the evidence, and wait for the user's decision. THE agent SHALL NOT change, weaken or delete the test.
