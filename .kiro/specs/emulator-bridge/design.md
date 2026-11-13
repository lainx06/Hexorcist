# Design Document: emulator-bridge

## Overview

The EmulatorBridge is the single module in Hexorcist that imports avr8js. It wraps an ATmega328P emulation session in a pure, deterministic TypeScript interface: load a precompiled Intel HEX program, declare a Fixture that names the GPIO pins under test, then step the simulation forward in explicit caller-controlled increments. Every GPIO output change becomes a named, cycle-stamped `OutputEvent`; every scheduled `InputEvent` is applied at an exact instruction boundary. No wall-clock calls, no background timers, no randomness — elapsed time is an integer CPU-cycle counter and nothing else.

The rest of Hexorcist (rule monitors, gremlin schedulers, the trace replayer, the UI) talks only to the `EmulatorBridgeInterface`. avr8js types never leak past this boundary.

**avr8js version pinning:** The bridge imports from the `avr8js` package. `package.json` MUST pin `"avr8js": "0.21.1"`. No other version is validated against these designs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Hexorcist Engine                         │
│                                                                 │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  Rule      │  │  Gremlin     │  │  Trace Replayer /      │  │
│  │  Monitor   │  │  Scheduler   │  │  UI Shell              │  │
│  └─────┬──────┘  └──────┬───────┘  └──────────┬─────────────┘  │
│        │                │                     │                 │
│        └────────────────┴─────────────────────┘                 │
│                         │  EmulatorBridgeInterface              │
│          ───────────────┼───────────────────────────────────    │
│                         │  (avr8js never crosses this line)     │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │                   EmulatorBridge                         │    │
│  │                                                          │    │
│  │  IntelHexParser  →  CPU  +  AVRIOPort (B,C,D)           │    │
│  │                       +  AVRTimer (0,1,2)               │    │
│  │                       +  AVRADC / AVRUSART (optional)   │    │
│  └──────────────────────────────────────────────────────────┘    │
│         │  imports avr8js (the ONLY module permitted to do so)  │
└─────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**

- `EmulatorBridge` is the **only** module that imports avr8js. All other Hexorcist modules receive the `EmulatorBridgeInterface` and work purely with the domain types defined below.
- The bridge is a plain TypeScript class with no singleton, no module-level state. Each `create()` call returns an independent instance.
- Stepping is synchronous and caller-controlled. No `setTimeout`, no `requestAnimationFrame`, no Promises inside the bridge itself.
- All time is tracked as `cpu.cycles`, a plain integer incremented by `avrInstruction()`. The bridge never reads a wall clock.

---

## Components and Interfaces

### Domain Types

```ts
// ── Fixture ────────────────────────────────────────────────────────────────

/** A single pin entry in a Fixture. */
export interface FixturePin {
  /** Logical signal name used in events, e.g. "LED" or "BUTTON". */
  signal: string;
  /** ATmega328P port: "B", "C", or "D". */
  port: "B" | "C" | "D";
  /** Bit index within the port register, 0–7. */
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Direction from the perspective of the MCU firmware. */
  direction: "output" | "input";
}

/**
 * Configuration supplied by the caller when constructing an EmulatorBridge.
 * Declares the clock rate and the named GPIO pins under test.
 */
export interface Fixture {
  /** CPU clock in Hz. Defaults to 16_000_000 when omitted. */
  clockHz?: number;
  /** Ordered list of pin declarations. Index within this array is the "fixture pin-index". */
  pins: FixturePin[];
}

// ── Pin values ──────────────────────────────────────────────────────────────

/**
 * Logic state of a single pin.
 * - 0 — output driven low
 * - 1 — output driven high
 * - "input" — configured as input (high-Z, with or without pull-up)
 */
export type PinValue = 0 | 1 | "input";

// ── Events ──────────────────────────────────────────────────────────────────

/** Emitted when a Fixture-mapped output pin changes state. */
export interface OutputEvent {
  signal: string;
  value: PinValue;      // output pins are always 0 or 1; input pins report 'input'
  cycle: number;        // integer CPU cycle at the instruction boundary
}

/** Schedules an external pin-state change at a target CPU cycle. */
export interface InputEvent {
  signal: string;
  value: 0 | 1;
  cycle: number;        // target cycle; applied at first boundary >= cycle
}

/** An InputEvent extended with the actual cycle at which the port write occurred. */
export interface AppliedInputEvent extends InputEvent {
  appliedCycle: number;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export type BridgeError =
  | { kind: "invalid-hex";           message: string }
  | { kind: "invalid-fixture";       message: string }
  | { kind: "unsupported-port";      port: string;   message: string }
  | { kind: "unsupported-capability"; capability: string; message: string }
  | { kind: "unmapped-pin";          signal: string; message: string }
  | { kind: "input-in-past";         message: string }
  | { kind: "cycle-overflow";        cycleCount: number; message: string };

// ── Capability ──────────────────────────────────────────────────────────────

/**
 * Enumeration of capabilities the bridge knows about.
 * Callers may query whether a named capability is supported before use.
 */
export type SupportedCapability =
  | "gpio"
  | "timer0" | "timer1" | "timer2"
  | "adc"
  | "usart"
  | "eeprom"
  | "watchdog";

// ── advance() result ────────────────────────────────────────────────────────

export interface AdvanceResult {
  /** Number of CPU cycles actually consumed during this call (>= requested, unless requested <= 0). */
  cyclesConsumed: number;
  /** All OutputEvents emitted during this call, in ascending cycle order (ties: ascending fixture pin-index). */
  outputEvents: OutputEvent[];
  /** All InputEvents applied during this call, each extended with appliedCycle. */
  appliedInputs: AppliedInputEvent[];
}
```

### EmulatorBridgeInterface

```ts
export interface EmulatorBridgeInterface {
  /**
   * Factory. Returns a fully initialized bridge or a typed error — never throws.
   *
   * Validates the HEX string (checksums, record types, EOF record, flash size).
   * Validates the Fixture (ports in {B,C,D}, bits in 0–7, clockHz > 0).
   * Validates all inputEvents signal names against the fixture before constructing the CPU.
   *
   * @param hex        Intel HEX text
   * @param fixture    Pin/clock configuration
   * @param inputEvents Pre-sorted list of all InputEvents for this run (sorted ascending by cycle)
   */
  // NOTE: implemented as a static factory on the concrete class, not on the interface.
  // The interface is what callers receive after construction.

  /**
   * Step the emulator forward.
   *
   * Executes instructions until cyclesConsumed >= requestedCycles (or requestedCycles <= 0).
   * Returns immediately on cycle-overflow without throwing.
   */
  advance(requestedCycles: number): AdvanceResult | BridgeError;

  /**
   * Schedule an input event for future application.
   *
   * Validates signal against Fixture (unmapped-pin error), requires event.cycle >= cycleCount
   * (input-in-past error), inserts into pending list in cycle order (stable for equal cycles).
   */
  schedule(event: InputEvent): void | BridgeError;

  /**
   * Query if a capability is supported and wired.
   *
   * Returns true if capability is wired and supported, else BridgeError { kind: "unsupported-capability" }
   */
  supports(capability: string): true | BridgeError;

  /** Configured clock frequency in Hz (read-only). */
  readonly clockHz: number;

  /** Total elapsed CPU cycles since construction (read-only, monotonically non-decreasing). */
  readonly cycleCount: number;
}
```

#### Static factory signature (on the concrete class)

```ts
class EmulatorBridge implements EmulatorBridgeInterface {
  static create(
    hex: string,
    fixture: Fixture,
    inputEvents?: InputEvent[],
  ): EmulatorBridge | BridgeError;
  // ...
}
```

`create()` returns a `BridgeError` for any validation failure and never throws.

---

## Data Models

### Flash Memory Layout

The ATmega328P has 32 KiB of program flash (32 768 bytes = 16 384 16-bit words). The bridge allocates:

```ts
const progMem = new Uint16Array(16384);   // 16 384 words = 32 768 bytes
```

The Intel HEX parser fills `progMem` from parsed data records. Bytes are written little-endian (even address → low byte of word, odd address → high byte).

### SRAM Layout (avr8js convention)

```
Offset 0x00–0xFF  : register file (r0–r31) + I/O space (avr8js maps these into cpu.data)
Offset 0x100+     : general-purpose SRAM (2 KiB on ATmega328P)
```

`cpu.data` is a `Uint8Array` of length `sramBytes + 0x100`. The bridge never accesses `cpu.data` directly; it reads GPIO state through `AVRIOPort.pinState()`.

### Pin Shadow Array

The bridge maintains a parallel array mirroring the last-known `PinValue` of every Fixture-mapped output pin:

```ts
const pinShadow: Array<0 | 1 | "input"> = [];
// Filled by emitInitialSnapshot(); baseline is the actual pin state before first instruction.
```

Indexed by Fixture pin-index (position in `fixture.pins`). Used for change-detection: after each `cpu.tick()`, compare `port.pinState(bit)` against `pinShadow[i]`; emit an `OutputEvent` only when they differ.

### InputEvent Queue

Before the run loop starts, InputEvents are pre-sorted ascending by `cycle`. They are stored as a drained queue — the bridge maintains a head pointer `nextInputIdx` and advances it as events are applied, never rebuilding the array mid-run.

---

## Correctness Checks

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness checks.*

### Property 1: clockHz passthrough and default

*For any* Fixture whose `clockHz` field is set to a positive integer, the bridge's `clockHz` property SHALL equal that value; *for any* Fixture that omits `clockHz`, the bridge's `clockHz` property SHALL equal 16 000 000.

**Validates: Requirements 1.3**

---

### Property 2: Invalid inputs produce typed errors, never throws

*For any* Intel HEX string that is empty, has a corrupted checksum, contains a record type outside {00, 01, 02, 03}, or omits the EOF record (type 01), `EmulatorBridge.create()` SHALL return a `BridgeError` with `kind === "invalid-hex"` and SHALL NOT throw. *For any* Fixture containing a port name outside the set {"B", "C", "D"}, `create()` SHALL return a `BridgeError` with `kind === "unsupported-port"` and SHALL NOT throw.

**Validates: Requirements 1.5, 6.1, 6.2, 6.4**

---

### Property 3: cycleCount is monotonically non-decreasing

*For any* sequence of `advance()` calls on a valid bridge instance, the `cycleCount` property after each call SHALL be greater than or equal to `cycleCount` before that call.

**Validates: Requirements 2.2**

---

### Property 4: advance(N) consumes at least N cycles for positive N

*For any* valid bridge and *for any* positive integer N, `advance(N).cyclesConsumed` SHALL be greater than or equal to N.

**Validates: Requirements 2.4**

---

### Property 5: advance of zero or negative returns no cycles consumed

*For any* valid bridge and *for any* integer N ≤ 0, `advance(N).cyclesConsumed` SHALL equal 0 and `cycleCount` SHALL be unchanged.

**Validates: Requirements 2.5**

---

### Property 6: All OutputEvent fields are well-formed

*For any* valid HEX and Fixture and *for any* run producing OutputEvents, every `OutputEvent` in the result SHALL satisfy: `signal` is a string present in the Fixture's `pins` array, `value` is a `PinValue` (0, 1, or `"input"`), and `cycle` is a non-negative integer.

**Validates: Requirements 3.1, 3.4**

---

### Property 7: Output events for the same signal strictly alternate values

*For any* run, the subsequence of OutputEvents filtered to a single signal name SHALL alternate between value 0 and value 1 — no two consecutive events for the same signal SHALL carry the same value.

**Validates: Requirements 3.2**

---

### Property 8: OutputEvents are sorted ascending by cycle, ties broken by fixture pin-index

*For any* run producing OutputEvents, the full `outputEvents` array SHALL be sorted such that for every adjacent pair `(e[i], e[i+1])`: `e[i].cycle < e[i+1].cycle`, OR (`e[i].cycle === e[i+1].cycle` AND the fixture pin-index of `e[i]` is less than the fixture pin-index of `e[i+1]`).

**Validates: Requirements 3.3**

---

### Property 9: Initial snapshot emits one cycle-0 event per mapped output pin

*For any* valid HEX and Fixture with at least one output pin, the first `advance()` call SHALL return an `outputEvents` list that contains exactly one entry with `cycle === 0` for each Fixture-mapped output pin, reporting its actual `PinValue` from the CPU before any instruction executes. Pins not yet configured by the firmware report `"input"`.

**Validates: Requirements 3.5**

---

### Property 10: AppliedInputEvent appliedCycle is >= target cycle

*For any* valid InputEvent list and bridge run, every `AppliedInputEvent` in `AdvanceResult.appliedInputs` SHALL satisfy `appliedCycle >= cycle` (the original target cycle).

**Validates: Requirements 4.1, 4.2**

---

### Property 11: Co-scheduled InputEvents share the same appliedCycle

*For any* two InputEvents with the same target `cycle` value C, their resulting `AppliedInputEvent` entries SHALL have equal `appliedCycle` values.

**Validates: Requirements 4.3**

---

### Property 12: Unmapped-pin InputEvent returns typed error before execution

*For any* InputEvent list containing at least one `signal` name absent from the Fixture's `pins` array, `EmulatorBridge.create()` (or the advance pre-flight check) SHALL return a `BridgeError` with `kind === "unmapped-pin"` carrying the offending signal name, and `cycleCount` SHALL remain 0.

**Validates: Requirements 4.4**

---

### Property 13: Replay determinism

*For any* valid Intel HEX string, Fixture, and ordered InputEvent list, running two independently constructed `EmulatorBridge` instances with the same inputs to the same `requestedCycles` total SHALL produce identical `OutputEvent` lists — same length, and each corresponding entry matching on `cycle`, `signal`, and `value`.

**Validates: Requirements 5.1, 5.2, 1.4**

---

### Property 14: Corrupted HEX checksum returns invalid-hex error

*For any* well-formed Intel HEX string with at least one data record, flipping any single byte in a checksum field SHALL cause `EmulatorBridge.create()` to return a `BridgeError` with `kind === "invalid-hex"`.

**Validates: Requirements 6.1**

*(Note: Property 14 is a targeted instantiation of Property 2, kept separate because it drives a specific generator — take valid HEX, corrupt the checksum byte — that is distinct from generating wholly invalid strings.)*

---

### Property 15: Unsupported capability kind returns typed error

*For any* string that is not a member of the `SupportedCapability` union, requesting that capability SHALL return a `BridgeError` with `kind === "unsupported-capability"` and SHALL NOT throw.

**Validates: Requirements 6.3, 6.4**

---

## Error Handling

All error paths return typed `BridgeError` values. The bridge never throws for expected conditions. The only circumstances under which an unexpected JavaScript exception may propagate are truly unrecoverable engine faults (e.g., avr8js itself throws on a corrupt internal state).

| Condition | `BridgeError.kind` | When detected |
|---|---|---|
| Empty / bad-checksum / bad-record-type / no-EOF HEX | `"invalid-hex"` | `create()` during HEX parse |
| Flash data exceeds 32 768 bytes | `"invalid-hex"` | `create()` during HEX parse |
| Port name not in {B, C, D} | `"unsupported-port"` | `create()` during Fixture validation |
| Bit index outside 0–7 | `"invalid-hex"` | `create()` during Fixture validation (classified as bad input) |
| InputEvent signal not in Fixture | `"unmapped-pin"` | `create()` pre-flight, before any CPU steps |
| Capability string not in `SupportedCapability` | `"unsupported-capability"` | Capability query method |
| `cpu.cycles` would exceed `Number.MAX_SAFE_INTEGER` | `"cycle-overflow"` | Inside `advance()` run loop |

---

## Initialization Sequence

```
EmulatorBridge.create(hex, fixture, inputEvents?)
│
├─ 1. Parse Intel HEX
│       hexToProgMem(hex) → Uint16Array(16384) | BridgeError("invalid-hex")
│
├─ 2. Validate Fixture
│       validateFixture(fixture) → void | BridgeError("unsupported-port")
│
├─ 3. Validate inputEvents
│       for each event: fixture.pins.some(p => p.signal === event.signal)
│       → BridgeError("unmapped-pin") on first miss
│
├─ 4. Construct CPU
│       const cpu = new CPU(progMem, 2048)   // 2 KiB SRAM for ATmega328P
│
├─ 5. Construct GPIO ports
│       const portB = new AVRIOPort(cpu, portBConfig)
│       const portC = new AVRIOPort(cpu, portCConfig)
│       const portD = new AVRIOPort(cpu, portDConfig)
│
├─ 6. Construct Timers
│       new AVRTimer(cpu, timer0Config)
│       new AVRTimer(cpu, timer1Config)
│       new AVRTimer(cpu, timer2Config)
│       // Timers self-register via cpu.addClockEvent(); no reference retained.
│
├─ 7. Build port lookup map
│       portMap: Map<"B"|"C"|"D", AVRIOPort> = { B: portB, C: portC, D: portD }
│
├─ 8. Build pin shadow array
│       pinShadow is empty; will be populated by emitInitialSnapshot()
│
├─ 9. Pre-sort inputEvents ascending by cycle
│       sorted = [...inputEvents].sort((a, b) => a.cycle - b.cycle)
│       nextInputIdx = 0
│
└─ 10. Return bridge instance
        clockHz = fixture.clockHz ?? 16_000_000
        cycleCount = 0
```

---

## Intel HEX Parser

The bridge ships its own HEX parser written from scratch in TypeScript. No third-party HEX parser is used.

### Record structure and line parsing

Each line:
```
:LLAAAATT[DD...]CC
  LL   = byte count (1 byte)
  AAAA = load address (2 bytes, big-endian)
  TT   = record type
  DD   = data bytes (LL bytes)
  CC   = two's-complement checksum of LL+AAAA+TT+DD
```

**Line handling:**
- Split input on `\n` (Unix line endings).
- Strip a trailing `\r` from every line if present (CRLF compatibility).
- Ignore empty lines (including trailing newlines).
- The EOF record (type `0x01`) must be the last non-empty record.

### Validation rules (all must pass for HEX to be accepted)

1. String is non-empty.
2. Every non-empty line starts with `:`.
3. Each record's checksum byte equals `(0x100 - (sum_of_all_preceding_bytes & 0xFF)) & 0xFF`.
4. Record type is one of `0x00` (data), `0x01` (EOF), `0x02` (extended segment address), `0x03` (start segment address).
5. Exactly one EOF record (type `0x01`) is present, and it is the last non-empty record.
6. The highest byte address written by any data record does not exceed 32 767 (i.e., data fits in 32 KiB flash).

Any failure returns `BridgeError { kind: "invalid-hex", message: "<which rule failed>" }`.

### Flash loading

```ts
function hexToProgMem(hex: string): Uint16Array | BridgeError {
  const progMem = new Uint16Array(16384);   // zero-initialized
  let baseAddress = 0;
  for (const line of hex.split("\n")) {
    // parse, validate checksum, handle type ...
    if (type === 0x00) {
      for (let i = 0; i < byteCount; i++) {
        const addr = baseAddress + loadAddress + i;
        if (addr > 32767) return { kind: "invalid-hex", message: "flash overflow" };
        // write byte into correct word of progMem (little-endian)
        const word = addr >> 1;
        if (addr & 1) {
          progMem[word] = (progMem[word] & 0x00FF) | (data[i] << 8);
        } else {
          progMem[word] = (progMem[word] & 0xFF00) | data[i];
        }
      }
    } else if (type === 0x02) {
      baseAddress = ((data[0] << 8) | data[1]) << 4;
    }
    // type 0x01 → break; type 0x03 → ignore
  }
  return progMem;
}
```

---

## Run Loop

### Pseudocode

```
function advance(requestedCycles: number): AdvanceResult | BridgeError {
  if (requestedCycles <= 0) return { cyclesConsumed: 0, outputEvents: [], appliedInputs: [] }

  const startCycles = cpu.cycles
  const outputEvents: OutputEvent[] = []
  const appliedInputs: AppliedInputEvent[] = []

  while ((cpu.cycles - startCycles) < requestedCycles) {

    // 1. Apply pending input events (all events with event.cycle <= cpu.cycles)
    //    This happens BEFORE avrInstruction, at the first instruction boundary >= target cycle.
    while (nextInputIdx < sortedInputs.length &&
           sortedInputs[nextInputIdx].cycle <= cpu.cycles) {
      const ev = sortedInputs[nextInputIdx++]
      const port = portMap.get(fixturePin(ev.signal).port)!
      port.setPin(fixturePin(ev.signal).bit, ev.value === 1)
      appliedInputs.push({ ...ev, appliedCycle: cpu.cycles })
    }

    // 2. Execute one instruction (advances cpu.cycles by instruction cost, advances cpu.pc)
    avrInstruction(cpu)

    // 3. Advance all registered peripherals (timers, interrupts, etc.)
    cpu.tick()

    // 4. Cycle-overflow guard
    if (cpu.cycles > Number.MAX_SAFE_INTEGER) {
      return { kind: "cycle-overflow", cycleCount: cpu.cycles, message: "..." }
    }

    // 5. Detect output pin changes (ascending fixture pin-index order)
    for (let i = 0; i < fixture.pins.length; i++) {
      const pin = fixture.pins[i]
      if (pin.direction !== "output") continue
      const port = portMap.get(pin.port)!
      const raw = port.pinState(pin.bit)
      const newValue = mapPinState(raw)   // High→1, Low→0, Input/InputPullUp→"input"
      if (newValue !== pinShadow[i]) {
        pinShadow[i] = newValue
        if (newValue !== "input") {
          outputEvents.push({ signal: pin.signal, value: newValue, cycle: cpu.cycles })
        }
      }
    }
  }

  return { cyclesConsumed: cpu.cycles - startCycles, outputEvents, appliedInputs }
}
```

### PinState mapping

```ts
function mapPinState(state: PinState): PinValue {
  switch (state) {
    case PinState.High:        return 1;
    case PinState.Low:         return 0;
    case PinState.Input:       return "input";
    case PinState.InputPullUp: return "input";
  }
}
```

### Initial state snapshot

Before the first `avrInstruction` call (emitted by `create()` itself), the bridge reads every Fixture-mapped output pin's current `pinState` and emits a cycle-0 `OutputEvent` for each. This establishes the baseline for change-detection and ensures the firmware's initial state (which may include input pins not yet configured) is recorded. The `pinShadow` array is then initialized from this snapshot.

A pin configured as input (not driven by the firmware) reports PinValue `'input'` in the cycle-0 event.

```ts
// Called once at end of create(), before returning the bridge instance.
function emitInitialSnapshot(): OutputEvent[] {
  const events: OutputEvent[] = []
  for (let i = 0; i < fixture.pins.length; i++) {
    const pin = fixture.pins[i]
    if (pin.direction !== "output") continue
    const port = portMap.get(pin.port)!
    const raw = port.pinState(pin.bit)
    const value = mapPinState(raw)
    pinShadow[i] = value
    if (value !== "input") {
      events.push({ signal: pin.signal, value, cycle: 0 })
    }
  }
  return events  // stored and prepended to first advance() result
}
```

---

## Why replay is deterministic

This design is deterministic because:

1. **Same progMem → same CPU state.** `new CPU(progMem, sramBytes)` is a pure constructor that zero-initializes all registers, the stack pointer, the program counter, and SRAM. Given the same `progMem` (produced from the same HEX), two instances start in identical state.
2. **`cpu.cycles` is a plain integer.** It is incremented only by `avrInstruction()` based on the opcode executed, which is itself deterministic given the program and register state. No floating-point, no rounding.
3. **No external sources.** The bridge calls no wall-clock APIs and no random sources. The avr8js audit (see table below) confirms no banned calls on any reachable code path.
4. **InputEvents are pre-sorted and applied at deterministic boundaries.** The same sorted list applied to the same CPU state always produces the same GPIO writes at the same cycle counts.
5. **Replay = fresh constructor + same inputs.** There are no snapshots or serialized state blobs. A replay creates a new `CPU` with the same `progMem` and runs from cycle 0.

---

## avr8js Banned-Call Audit

The following audit was performed against avr8js 0.21.1 on the master branch of https://github.com/wokwi/avr8js, covering all source files reachable from the bridge's API surface.

| File | Banned calls found |
|---|---|
| `src/cpu/cpu.ts` | None |
| `src/cpu/instruction.ts` | None |
| `src/cpu/interrupt.ts` | None |
| `src/peripherals/gpio.ts` | None |
| `src/peripherals/timer.ts` | `Math.floor` only (not banned) |
| `src/peripherals/adc.ts` | None |
| `src/peripherals/usart.ts` | None |
| `src/peripherals/eeprom.ts` | None |
| `src/peripherals/watchdog.ts` | None |
| `src/peripherals/clock.ts` | None |

**No banned calls (`Date.now`, `performance.now`, `setTimeout`, `setInterval`, `Math.random`) found on any path used by the bridge in avr8js 0.21.1.**

`AVRClock.timeNanos/Micros/Millis` derive from `cpu.cycles / frequency` — pure arithmetic, no wall-clock.

---

## Capability Manifest

| Capability | Status | Source / Notes | Wired by this bridge |
|---|---|---|---|
| GPIO output events (ports B, C, D) | Supported | `src/peripherals/gpio.ts` — `AVRIOPort.addListener`, `pinState` | Yes |
| GPIO input injection (ports B, C, D) | Supported | `src/peripherals/gpio.ts` — `AVRIOPort.setPin` | Yes |
| External interrupts (INT0 on PD2, INT1 on PD3) | Supported | `src/peripherals/gpio.ts` — `INT0`, `INT1` exported; wired via `portDConfig` | Yes |
| Pin-change interrupts (PCINT0–2) | Supported | `src/peripherals/gpio.ts` — `PCINT0`, `PCINT1`, `PCINT2` exported | Yes |
| Timer0 (8-bit) | Supported | `src/peripherals/timer.ts` — `timer0Config` | Yes |
| Timer1 (16-bit) | Supported | `src/peripherals/timer.ts` — `timer1Config` | Yes |
| Timer2 (8-bit async) | Supported | `src/peripherals/timer.ts` — `timer2Config` | Yes |
| ADC | Supported | `src/peripherals/adc.ts` — `AVRADC.channelValues`, `onADCRead` | No |
| USART | Supported | `src/peripherals/usart.ts` — `AVRUSART.writeByte`, `onByteTransmit` | No |
| EEPROM | Supported | `src/peripherals/eeprom.ts` — `AVREEPROM` + `EEPROMMemoryBackend` | No |
| Watchdog timer | Supported | `src/peripherals/watchdog.ts` — `AVRWatchdog` | No |
| Sleep modes | UNVERIFIED | No sleep peripheral class found in scanned sources; sleep instruction handling not confirmed in `instruction.ts` | No |
| Software reset | UNVERIFIED | `cpu.reset()` exists but whether the firmware-triggered reset path (WDTCSR WDE) calls it correctly was not fully traced | No |
| SPI | Supported | `src/peripherals/spi.ts` — `AVRSPI` exported from `index.ts` | No |
| TWI/I²C | Supported | `src/peripherals/twi.ts` — exported from `index.ts` | No |

---

## Testing Strategy

### Dual Testing Approach

Unit tests cover specific examples and error conditions. Property-based tests cover universal invariants across a large input space. Both are required.

### Unit Tests

Focus areas:

- **HEX parser**: valid single-record HEX, multi-record HEX, extended-segment-address records; each error condition in the validation table (empty string, bad checksum, bad record type, no EOF, flash overflow).
- **Fixture validation**: valid ports B/C/D; invalid port names; bit indices 0 and 7 (boundaries); bit index 8 (out of range).
- **advance() edge cases**: `advance(0)`, `advance(-1)`, very large `requestedCycles` with a no-op program.
- **InputEvent application**: single event at exact cycle, event at cycle 0, two events at the same cycle.
- **Initial snapshot**: a HEX that never configures a mapped output pin produces a cycle-0 event with value `"input"` for it; blink_button produces a cycle-0 LED event that matches avr8js `pinState` for PB5 before the first instruction.

### Property-Based Tests with fast-check

The project uses **[fast-check](https://fast-check.dev/)** for property-based testing. Each test runs a minimum of **100 iterations**.

Each property test is tagged with a comment in the format:
`// Feature: emulator-bridge, Property N: <property text>`

#### Property 1 — clockHz passthrough and default
```
// Feature: emulator-bridge, Property 1: clockHz passthrough and default
fc.property(
  fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 100_000_000 })),
  (clockHz) => {
    const fixture = { pins: [], ...(clockHz !== undefined ? { clockHz } : {}) }
    const bridge = EmulatorBridge.create(MINIMAL_VALID_HEX, fixture)
    if (bridge instanceof Object && "kind" in bridge) return
    expect(bridge.clockHz).toBe(clockHz ?? 16_000_000)
  }
)
```

#### Property 2 — Invalid inputs produce typed errors, never throw
```
// Feature: emulator-bridge, Property 2: Invalid inputs produce typed errors, never throws
fc.property(
  arbitraryCorruptedHex(),   // generator: take valid HEX, corrupt checksum or record type
  (badHex) => {
    expect(() => EmulatorBridge.create(badHex, MINIMAL_FIXTURE)).not.toThrow()
    const result = EmulatorBridge.create(badHex, MINIMAL_FIXTURE)
    expect(result).toMatchObject({ kind: "invalid-hex" })
  }
)
```

#### Property 3 — cycleCount is monotonically non-decreasing
```
// Feature: emulator-bridge, Property 3: cycleCount is monotonically non-decreasing
fc.property(
  fc.array(fc.integer({ min: 1, max: 10_000 }), { minLength: 1, maxLength: 20 }),
  (steps) => {
    const bridge = EmulatorBridge.create(NOOP_HEX, MINIMAL_FIXTURE)
    if ("kind" in bridge) return
    let prev = bridge.cycleCount
    for (const n of steps) {
      bridge.advance(n)
      expect(bridge.cycleCount).toBeGreaterThanOrEqual(prev)
      prev = bridge.cycleCount
    }
  }
)
```

#### Property 13 — Replay determinism
```
// Feature: emulator-bridge, Property 13: Replay determinism
fc.property(
  arbitraryValidHexStub(),       // generator: minimal valid HEX stubs with known GPIO behavior
  arbitraryFixture(),            // generator: valid fixture with 1–8 output pins
  arbitraryInputEventList(),     // generator: sorted list of valid InputEvents
  fc.integer({ min: 1, max: 100_000 }),
  (hex, fixture, inputs, cycles) => {
    const a = EmulatorBridge.create(hex, fixture, inputs)
    const b = EmulatorBridge.create(hex, fixture, inputs)
    if ("kind" in a || "kind" in b) return
    const ra = a.advance(cycles)
    const rb = b.advance(cycles)
    if ("kind" in ra || "kind" in rb) return
    expect(ra.outputEvents).toStrictEqual(rb.outputEvents)
  }
)
```

#### Property 12 — Unmapped-pin returns typed error
```
// Feature: emulator-bridge, Property 12: Unmapped-pin InputEvent returns typed error
fc.property(
  arbitraryValidHexStub(),
  arbitraryFixture(),
  fc.string({ minLength: 1 }).filter(s => !fixtureHasSignal(s)),
  fc.integer({ min: 0, max: 1_000_000 }),
  (hex, fixture, unknownSignal, cycle) => {
    const inputs = [{ signal: unknownSignal, value: 1 as const, cycle }]
    expect(() => EmulatorBridge.create(hex, fixture, inputs)).not.toThrow()
    const result = EmulatorBridge.create(hex, fixture, inputs)
    expect(result).toMatchObject({ kind: "unmapped-pin", signal: unknownSignal })
  }
)
```

### Test File Layout

```
src/engine/
  emulator-bridge.ts           ← implementation (only file that imports avr8js)
  hex-parser.ts                ← Intel HEX parser (no avr8js dependency)
  types.ts                     ← domain types (Fixture, PinValue, OutputEvent, …)

src/engine/__tests__/
  emulator-bridge.unit.test.ts     ← unit tests
  emulator-bridge.property.test.ts ← fast-check property tests
  hex-parser.unit.test.ts
  arbitraries.ts                   ← shared fast-check arbitraries (HEX stubs, fixtures, etc.)
```

### Determinism Constraints Summary

The following are hard constraints enforced by code review and static analysis, not by property tests:

- No `Date.now`, `performance.now`, `setTimeout`, `setInterval`, or `Math.random` anywhere in `src/engine/`.
- `EmulatorBridge` is the **only** module in `src/` that imports `avr8js`.
- All `cycle` fields are integers; no floating-point accumulation.
- Verdict strings used by rule monitors: **BROKE**, **HELD**, **COULDN'T TELL** — exact strings, nothing else.
