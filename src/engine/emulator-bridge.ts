/**
 * EmulatorBridge — the ONLY file in src/ that imports avr8js.
 *
 * All avr8js types are confined to this module; nothing leaks past EmulatorBridgeInterface.
 */
import {
  CPU,
  avrInstruction,
  AVRIOPort,
  PinState,
  portBConfig,
  portCConfig,
  portDConfig,
  AVRTimer,
  timer0Config,
  timer1Config,
  timer2Config,
} from 'avr8js';

import { hexToProgMem } from './hex-parser.js';
import type {
  Fixture,
  FixturePin,
  PinValue,
  OutputEvent,
  InputEvent,
  AppliedInputEvent,
  BridgeError,
  AdvanceResult,
  Diagnostic,
  FloatingInputDiagnostic,
  InputValue,
} from './types.js';

export type {
  Fixture,
  FixturePin,
  PinValue,
  OutputEvent,
  InputEvent,
  AppliedInputEvent,
  BridgeError,
  AdvanceResult,
  Diagnostic,
  FloatingInputDiagnostic,
  InputValue,
};
export { hexToProgMem };

// PIN register name per port letter, used in floating-input diagnostics.
const PIN_REGISTER_NAME: Record<'B' | 'C' | 'D', FloatingInputDiagnostic['register']> = {
  B: 'PINB',
  C: 'PINC',
  D: 'PIND',
};

type PinRegisterName = 'PINB' | 'PINC' | 'PIND';

/**
 * Optional hooks a builder can install after the AVRIOPort constructors and
 * before the bridge wraps the PIN read hook. create() passes none.
 */
interface BuilderHooks {
  pinReadStubs?: Partial<Record<PinRegisterName, (addr: number) => number>>;
  portListeners?: Partial<Record<'B' | 'C' | 'D', (value: number, oldValue: number) => void>>;
}

// ── Type guard ──────────────────────────────────────────────────────────────

export function isBridgeError(x: unknown): x is BridgeError {
  return x != null && typeof x === 'object' && 'kind' in x;
}

// ── EmulatorBridgeInterface ─────────────────────────────────────────────────

export interface EmulatorBridgeInterface {
  advance(requestedCycles: number): AdvanceResult | BridgeError;
  schedule(event: InputEvent): void | BridgeError;
  supports(capability: string): true | BridgeError;
  readonly clockHz: number;
  readonly cycleCount: number;
}

// ── EmulatorBridge ──────────────────────────────────────────────────────────

export class EmulatorBridge implements EmulatorBridgeInterface {
  readonly clockHz: number;

  get cycleCount(): number {
    return this._cpu.cycles;
  }

  private readonly _cpu: CPU;
  private readonly _portMap: Map<'B' | 'C' | 'D', AVRIOPort>;
  private readonly _fixture: Fixture;
  private readonly _pinShadow: Array<PinValue>;
  private readonly _sortedInputs: InputEvent[];
  private _nextInputIdx: number = 0;
  private _initialSnapshot: OutputEvent[];
  private _firstAdvance: boolean = true;
  // External state per fixture pin (same index as fixture.pins). All start released.
  private readonly _extState: Array<'released' | 0 | 1>;
  // Filled by the PIN read hook. One entry per signal per run.
  readonly _floatingReported: Set<string> = new Set();
  _pendingDiagnostics: Diagnostic[] = [];

  private constructor(
    cpu: CPU,
    portMap: Map<'B' | 'C' | 'D', AVRIOPort>,
    fixture: Fixture,
    pinShadow: Array<PinValue>,
    sortedInputs: InputEvent[],
    initialSnapshot: OutputEvent[],
    clockHz: number,
    extState: Array<'released' | 0 | 1>,
  ) {
    this._extState = extState;
    this._cpu = cpu;
    this._portMap = portMap;
    this._fixture = fixture;
    this._pinShadow = pinShadow;
    this._sortedInputs = sortedInputs;
    this._initialSnapshot = initialSnapshot;
    this.clockHz = clockHz;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    hex: string,
    fixture: Fixture,
    inputEvents?: InputEvent[],
  ): EmulatorBridge | BridgeError {
    return EmulatorBridge._build(hex, fixture, inputEvents, undefined);
  }

  /**
   * Same as create(), plus stub PIN read hooks and extra port listeners installed
   * after the AVRIOPort constructors and before the bridge wraps the PIN read hook,
   * so the bridge's wrapper chains onto the stub.
   *
   * @internal test-only
   */
  static createWithTestHooks(
    hex: string,
    fixture: Fixture,
    inputEvents: InputEvent[],
    hooks: {
      pinReadStubs?: Partial<Record<'PINB' | 'PINC' | 'PIND', (addr: number) => number>>;
      portListeners?: Partial<Record<'B' | 'C' | 'D', (value: number, oldValue: number) => void>>;
    },
  ): EmulatorBridge | BridgeError {
    return EmulatorBridge._build(hex, fixture, inputEvents, hooks);
  }

  /** Shared construction path used by create() and createWithTestHooks(). */
  private static _build(
    hex: string,
    fixture: Fixture,
    inputEvents: InputEvent[] | undefined,
    hooks: BuilderHooks | undefined,
  ): EmulatorBridge | BridgeError {
    // 1. Parse HEX
    const progMem = hexToProgMem(hex);
    if (isBridgeError(progMem)) return progMem;

    // 2. Validate fixture
    if (fixture.clockHz !== undefined && fixture.clockHz <= 0) {
      return { kind: 'invalid-fixture', message: 'clockHz must be positive' };
    }
    for (const pin of fixture.pins) {
      if (pin.port !== 'B' && pin.port !== 'C' && pin.port !== 'D') {
        return {
          kind: 'unsupported-port',
          port: pin.port,
          message: `Port ${pin.port} is not supported; use B, C, or D`,
        };
      }
      if (pin.bit < 0 || pin.bit > 7) {
        return {
          kind: 'invalid-fixture',
          message: `Bit index ${pin.bit} is out of range; must be 0–7`,
        };
      }
    }

    // 3. Validate inputEvents
    const events = inputEvents ?? [];
    for (const ev of events) {
      if (!fixture.pins.some(p => p.signal === ev.signal)) {
        return {
          kind: 'unmapped-pin',
          signal: ev.signal,
          message: `Signal "${ev.signal}" is not mapped in the fixture`,
        };
      }
    }

    // 4. Construct CPU
    const cpu = new CPU(progMem, 2048);

    // 5. Construct GPIO ports
    const portB = new AVRIOPort(cpu, portBConfig);
    const portC = new AVRIOPort(cpu, portCConfig);
    const portD = new AVRIOPort(cpu, portDConfig);

    // 5b. Optional stubs/listeners. They go after the AVRIOPort constructors (which
    //     overwrite DDR/PORT/PIN write hooks) and before the bridge wraps the PIN read hook.
    if (hooks?.pinReadStubs) {
      const pinAddr: Record<PinRegisterName, number> = {
        PINB: portBConfig.PIN,
        PINC: portCConfig.PIN,
        PIND: portDConfig.PIN,
      };
      for (const name of ['PINB', 'PINC', 'PIND'] as const) {
        const stub = hooks.pinReadStubs[name];
        if (stub) cpu.readHooks[pinAddr[name]] = stub;
      }
    }
    if (hooks?.portListeners) {
      if (hooks.portListeners.B) portB.addListener(hooks.portListeners.B);
      if (hooks.portListeners.C) portC.addListener(hooks.portListeners.C);
      if (hooks.portListeners.D) portD.addListener(hooks.portListeners.D);
    }

    // 6. Construct Timers (self-register via cpu.addClockEvent(); no reference retained)
    new AVRTimer(cpu, timer0Config);
    new AVRTimer(cpu, timer1Config);
    new AVRTimer(cpu, timer2Config);

    // 7. Build port lookup map
    const portMap = new Map<'B' | 'C' | 'D', AVRIOPort>([
      ['B', portB],
      ['C', portC],
      ['D', portD],
    ]);

    // 7b. External state: every fixture pin starts released.
    const extState: Array<'released' | 0 | 1> = new Array(fixture.pins.length).fill('released');

    // 8. Pre-sort inputEvents ascending by cycle (stable sort)
    const sortedInputs = [...events].sort((a, b) => a.cycle - b.cycle);

    // 9. Build initial snapshot (cycle-0 events for every output pin, including "input" state)
    const pinShadow: Array<PinValue> = new Array(fixture.pins.length).fill('input' as PinValue);
    const initialSnapshot: OutputEvent[] = [];
    for (let i = 0; i < fixture.pins.length; i++) {
      const pin = fixture.pins[i];
      if (pin.direction !== 'output') continue;
      const port = portMap.get(pin.port)!;
      const raw = port.pinState(pin.bit);
      const value = mapPinState(raw);
      pinShadow[i] = value;
      // Always emit cycle-0 event for every output pin (including "input" state)
      initialSnapshot.push({ signal: pin.signal, value, cycle: 0 });
    }

    // 10. Return bridge instance
    const clockHz = fixture.clockHz ?? 16_000_000;
    const bridge = new EmulatorBridge(cpu, portMap, fixture, pinShadow, sortedInputs, initialSnapshot, clockHz, extState);

    // 11. Track DDR/PORT changes. Listeners are additive, so no existing hook is displaced.
    //     Runs after the AVRIOPort constructors. Driven pins are skipped.
    for (const [letter, port] of portMap) {
      const hasInput = fixture.pins.some(p => p.port === letter && p.direction === 'input');
      if (!hasInput) continue;
      port.addListener(() => {
        for (let i = 0; i < fixture.pins.length; i++) {
          const p = fixture.pins[i];
          if (p.port !== letter || p.direction !== 'input') continue;
          if (extState[i] !== 'released') continue;
          bridge._presentReleased(i);
        }
      });
    }

    // 11b. Chained PIN read hook, ports in the order B, C, D.
    //
    //     Limit: detection is per PIN register read, not per bit. Any read of PINx counts
    //     as covering every released, non-pulled-up input on that port, so a diagnostic can
    //     appear for a pin the firmware did not mean to read. It may over-report and never
    //     under-reports. Also, avr8js pinState() does not model the MCUCR PUD bit, so a
    //     pull-up that PUD disables on real hardware is still treated as a pull-up here.
    //     The wrapper returns the value of the previous hook (or cpu.data) unchanged.
    for (const letter of ['B', 'C', 'D'] as const) {
      const port = portMap.get(letter)!;
      const pinIdxs: number[] = [];
      for (let i = 0; i < fixture.pins.length; i++) {
        if (fixture.pins[i].port === letter && fixture.pins[i].direction === 'input') pinIdxs.push(i);
      }
      if (pinIdxs.length === 0) continue;
      const pinAddr = letter === 'B' ? portBConfig.PIN : letter === 'C' ? portCConfig.PIN : portDConfig.PIN;
      const register = PIN_REGISTER_NAME[letter];
      const prev = cpu.readHooks[pinAddr];
      cpu.readHooks[pinAddr] = (addr: number): number => {
        const original = prev ? prev(addr) : cpu.data[addr];
        for (const i of pinIdxs) {
          const p = fixture.pins[i];
          if (extState[i] !== 'released') continue;
          if (bridge._floatingReported.has(p.signal)) continue;
          if (port.pinState(p.bit) !== PinState.Input) continue;
          bridge._floatingReported.add(p.signal);
          bridge._pendingDiagnostics.push({
            kind: 'floating-input',
            signal: p.signal,
            cycle: cpu.cycles,
            register,
          });
        }
        return original;
      };
    }

    // 12. Make the initial presented level of every input pin consistent.
    for (let i = 0; i < fixture.pins.length; i++) {
      if (fixture.pins[i].direction === 'input') bridge._presentReleased(i);
    }

    return bridge;
  }

  // ── advance() ─────────────────────────────────────────────────────────────

  advance(requestedCycles: number): AdvanceResult | BridgeError {
    const outputEvents: OutputEvent[] = [];
    const appliedInputs: AppliedInputEvent[] = [];

    // Prepend initial snapshot on the very first advance() call
    if (this._firstAdvance) {
      outputEvents.push(...this._initialSnapshot);
      this._firstAdvance = false;
    }

    if (requestedCycles <= 0) {
      return { cyclesConsumed: 0, outputEvents, appliedInputs, diagnostics: this._takeDiagnostics() };
    }

    const startCycles = this._cpu.cycles;

    while ((this._cpu.cycles - startCycles) < requestedCycles) {
      // 1. Apply pending inputs where event.cycle <= cpu.cycles
      while (
        this._nextInputIdx < this._sortedInputs.length &&
        this._sortedInputs[this._nextInputIdx].cycle <= this._cpu.cycles
      ) {
        const ev = this._sortedInputs[this._nextInputIdx++];
        const pin = this._fixture.pins.find(p => p.signal === ev.signal)!;
        this._applyInput(this._fixture.pins.indexOf(pin), ev.value);
        appliedInputs.push({ ...ev, appliedCycle: this._cpu.cycles });
      }

      // 2. Execute one instruction
      avrInstruction(this._cpu);

      // 3. Tick peripherals
      this._cpu.tick();

      // 4. Overflow guard
      if (this._cpu.cycles > Number.MAX_SAFE_INTEGER) {
        return {
          kind: 'cycle-overflow',
          cycleCount: this._cpu.cycles,
          message: 'cpu.cycles exceeded Number.MAX_SAFE_INTEGER',
        };
      }

      // 5. Detect output pin changes in ascending fixture pin-index order
      for (let i = 0; i < this._fixture.pins.length; i++) {
        const pin = this._fixture.pins[i];
        if (pin.direction !== 'output') continue;
        const port = this._portMap.get(pin.port)!;
        const raw = port.pinState(pin.bit);
        const newValue = mapPinState(raw);
        if (newValue !== this._pinShadow[i]) {
          this._pinShadow[i] = newValue;
          outputEvents.push({ signal: pin.signal, value: newValue, cycle: this._cpu.cycles });
        }
      }
    }

    return {
      cyclesConsumed: this._cpu.cycles - startCycles,
      outputEvents,
      appliedInputs,
      diagnostics: this._takeDiagnostics(),
    };
  }

  private _takeDiagnostics(): Diagnostic[] {
    const out = this._pendingDiagnostics;
    this._pendingDiagnostics = [];
    return out;
  }

  // ── Released-pin model ────────────────────────────────────────────────────

  private _applyInput(pinIdx: number, value: 0 | 1 | 'release'): void {
    const pin = this._fixture.pins[pinIdx];
    if (value === 'release') {
      this._extState[pinIdx] = 'released';
      this._presentReleased(pinIdx);
      return;
    }
    this._extState[pinIdx] = value;
    this._portMap.get(pin.port)!.setPin(pin.bit, value === 1);
  }

  /**
   * Present a released pin at the level its configuration implies:
   * pull-up on gives HIGH, plain input gives LOW. High and Low mean the
   * firmware made it an output, so the pin is left alone.
   */
  private _presentReleased(pinIdx: number): void {
    const pin = this._fixture.pins[pinIdx];
    const port = this._portMap.get(pin.port)!;
    const state = port.pinState(pin.bit);
    if (state === PinState.High || state === PinState.Low) return;
    port.setPin(pin.bit, state === PinState.InputPullUp);
  }

  // ── schedule() ────────────────────────────────────────────────────────────

  schedule(event: InputEvent): void | BridgeError {
    if (!this._fixture.pins.some(p => p.signal === event.signal)) {
      return {
        kind: 'unmapped-pin',
        signal: event.signal,
        message: `Signal "${event.signal}" is not mapped in the fixture`,
      };
    }
    if (event.cycle < this._cpu.cycles) {
      return {
        kind: 'input-in-past',
        message: `event.cycle (${event.cycle}) is in the past; current cycle is ${this._cpu.cycles}`,
      };
    }
    // Insert in cycle order, stable (append within equal-cycle group)
    let insertIdx = this._sortedInputs.length;
    for (let i = this._nextInputIdx; i < this._sortedInputs.length; i++) {
      if (this._sortedInputs[i].cycle > event.cycle) {
        insertIdx = i;
        break;
      }
    }
    this._sortedInputs.splice(insertIdx, 0, event);
  }

  // ── supports() ────────────────────────────────────────────────────────────

  supports(capability: string): true | BridgeError {
    const wired = new Set([
      'gpio',
      'external-interrupt',
      'pin-change-interrupt',
      'timer0',
      'timer1',
      'timer2',
    ]);
    if (wired.has(capability)) return true;
    return {
      kind: 'unsupported-capability',
      capability,
      message: `Capability "${capability}" is not wired by this bridge`,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapPinState(state: PinState): PinValue {
  switch (state) {
    case PinState.High:        return 1;
    case PinState.Low:         return 0;
    case PinState.Input:       return 'input';
    case PinState.InputPullUp: return 'input';
  }
}
