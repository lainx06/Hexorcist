/**
 * EmulatorBridge â€” the ONLY file in src/ that imports avr8js.
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
  AVRADC,
  adcConfig,
} from 'avr8js';

import { hexToProgMem } from './hex-parser.js';
import { isAnalogInputEvent, isAnalogPin, validateEvents, validateFixture } from './fixture.js';
import { analogCountToVolts } from './adc-scale.js';
import { PeripheralRecorder, unmodelledRegisters } from './peripherals.js';
import type {
  Fixture,
  FixturePin,
  PinValue,
  OutputEvent,
  InputEvent,
  AppliedInputEvent,
  AppliedAnalogInputEvent,
  ScheduledInput,
  BridgeError,
  AdvanceResult,
  Diagnostic,
  FloatingInputDiagnostic,
  InputValue,
  PeripheralDiagnostic,
} from './types.js';

export type {
  Fixture,
  FixturePin,
  PinValue,
  OutputEvent,
  InputEvent,
  AppliedInputEvent,
  AppliedAnalogInputEvent,
  ScheduledInput,
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
  adcResultListener?: (result: AdcResult) => void;
}

/** One finished ADC conversion as seen by the test hook. */
export interface AdcResult {
  cycle: number;
  value: number;
  adcl: number;
  adch: number;
  admux: number;
}

/** One digital output pin, resolved once in _build. Kept in ascending fixture pin-index order. */
interface OutPin {
  readonly idx: number;
  readonly port: AVRIOPort;
  readonly bit: number;
  readonly signal: string;
}

// â”€â”€ Type guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function isBridgeError(x: unknown): x is BridgeError {
  return x != null && typeof x === 'object' && 'kind' in x;
}

// â”€â”€ EmulatorBridgeInterface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EmulatorBridgeInterface {
  advance(requestedCycles: number): AdvanceResult | BridgeError;
  schedule(event: InputEvent): void | BridgeError;
  supports(capability: string): true | BridgeError;
  readonly clockHz: number;
  readonly cycleCount: number;
}

// â”€â”€ EmulatorBridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class EmulatorBridge implements EmulatorBridgeInterface {
  readonly clockHz: number;

  get cycleCount(): number {
    return this._cpu.cycles;
  }

  private readonly _cpu: CPU;
  private readonly _portMap: Map<'B' | 'C' | 'D', AVRIOPort>;
  private readonly _fixture: Fixture;
  private readonly _pinShadow: Array<PinValue>;
  private readonly _sortedInputs: ScheduledInput[];
  private readonly _adc: AVRADC;
  // Digital output pins in ascending fixture pin-index order (built in _build step 9).
  private readonly _outPins: ReadonlyArray<OutPin>;
  // Output scan skip (see advance() step 5). Set by a listener on every port that holds an
  // output pin and by every applied input; cleared by the scan.
  private _outDirty: boolean = true;
  // DDRx address of each port that holds an output pin, and its byte at the last scan.
  private readonly _watchDdrAddr: number[] = [];
  private readonly _watchDdrSeen: number[] = [];
  private _nextInputIdx: number = 0;
  private _initialSnapshot: OutputEvent[];
  private _firstAdvance: boolean = true;
  // External state per fixture pin (same index as fixture.pins). All start released.
  private readonly _extState: Array<'released' | 0 | 1>;
  // Filled by the PIN read hook. One entry per signal per run.
  readonly _floatingReported: Set<string> = new Set();
  _pendingDiagnostics: Diagnostic[] = [];
  // Unmodelled-peripheral uses, earliest per peripheral (step 11d).
  readonly _peripherals: PeripheralRecorder = new PeripheralRecorder();

  private constructor(
    cpu: CPU,
    portMap: Map<'B' | 'C' | 'D', AVRIOPort>,
    fixture: Fixture,
    pinShadow: Array<PinValue>,
    sortedInputs: ScheduledInput[],
    adc: AVRADC,
    initialSnapshot: OutputEvent[],
    clockHz: number,
    extState: Array<'released' | 0 | 1>,
    outPins: ReadonlyArray<OutPin>,
  ) {
    this._extState = extState;
    this._outPins = outPins;
    this._cpu = cpu;
    this._portMap = portMap;
    this._fixture = fixture;
    this._pinShadow = pinShadow;
    this._sortedInputs = sortedInputs;
    this._adc = adc;
    this._initialSnapshot = initialSnapshot;
    this.clockHz = clockHz;
  }

  // â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  static create(
    hex: string,
    fixture: Fixture,
    inputEvents?: ScheduledInput[],
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
    inputEvents: ScheduledInput[],
    hooks: {
      pinReadStubs?: Partial<Record<'PINB' | 'PINC' | 'PIND', (addr: number) => number>>;
      portListeners?: Partial<Record<'B' | 'C' | 'D', (value: number, oldValue: number) => void>>;
      adcResultListener?: (result: AdcResult) => void;
    },
  ): EmulatorBridge | BridgeError {
    return EmulatorBridge._build(hex, fixture, inputEvents, hooks);
  }

  /** Shared construction path used by create() and createWithTestHooks(). */
  private static _build(
    hex: string,
    fixture: Fixture,
    inputEvents: ScheduledInput[] | undefined,
    hooks: BuilderHooks | undefined,
  ): EmulatorBridge | BridgeError {
    // 1. Parse HEX
    const progMem = hexToProgMem(hex);
    if (isBridgeError(progMem)) return progMem;

    // 2. Validate fixture (before any CPU exists)
    const fixtureError = validateFixture(fixture);
    if (fixtureError) return fixtureError;

    // 3. Validate inputEvents (before any CPU exists, so nothing is applied from a rejected list)
    const events = inputEvents ?? [];
    const eventsError = validateEvents(fixture, events);
    if (eventsError) return eventsError;

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

    // 6b. ADC. Every analog pin presents its rest level before any instruction runs.
    const adc = new AVRADC(cpu, adcConfig);
    for (const pin of fixture.pins) {
      if (!isAnalogPin(pin)) continue;
      adc.channelValues[pin.channel] = analogCountToVolts(pin.restLevel ?? 512);
    }
    if (hooks?.adcResultListener) {
      const listener = hooks.adcResultListener;
      const original = adc.completeADCRead.bind(adc);
      adc.completeADCRead = (value: number): void => {
        original(value);
        listener({
          cycle: cpu.cycles,
          value,
          adcl: cpu.data[adcConfig.ADCL],
          adch: cpu.data[adcConfig.ADCH],
          admux: cpu.data[adcConfig.ADMUX],
        });
      };
    }

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
    const outPins: OutPin[] = [];
    for (let i = 0; i < fixture.pins.length; i++) {
      const pin = fixture.pins[i];
      if (isAnalogPin(pin)) continue;
      if (pin.direction !== 'output') continue;
      const port = portMap.get(pin.port)!;
      outPins.push(Object.freeze({ idx: i, port, bit: pin.bit, signal: pin.signal }));
      const raw = port.pinState(pin.bit);
      const value = mapPinState(raw);
      pinShadow[i] = value;
      // Always emit cycle-0 event for every output pin (including "input" state)
      initialSnapshot.push({ signal: pin.signal, value, cycle: 0 });
    }

    // 10. Return bridge instance
    const clockHz = fixture.clockHz ?? 16_000_000;
    const bridge = new EmulatorBridge(
      cpu, portMap, fixture, pinShadow, sortedInputs, adc, initialSnapshot, clockHz, extState, Object.freeze(outPins),
    );

    // 11. Track DDR/PORT changes. Listeners are additive, so no existing hook is displaced.
    //     Runs after the AVRIOPort constructors. Driven pins are skipped.
    for (const [letter, port] of portMap) {
      const hasInput = fixture.pins.some(
        p => !isAnalogPin(p) && p.port === letter && p.direction === 'input',
      );
      if (!hasInput) continue;
      port.addListener(() => {
        for (let i = 0; i < fixture.pins.length; i++) {
          const p = fixture.pins[i];
          if (isAnalogPin(p)) continue;
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
        const fp = fixture.pins[i];
        if (isAnalogPin(fp)) continue;
        if (fp.port === letter && fp.direction === 'input') pinIdxs.push(i);
      }
      if (pinIdxs.length === 0) continue;
      const pinAddr = letter === 'B' ? portBConfig.PIN : letter === 'C' ? portCConfig.PIN : portDConfig.PIN;
      const register = PIN_REGISTER_NAME[letter];
      const prev = cpu.readHooks[pinAddr];
      cpu.readHooks[pinAddr] = (addr: number): number => {
        const original = prev ? prev(addr) : cpu.data[addr];
        for (const i of pinIdxs) {
          const p = fixture.pins[i];
          if (isAnalogPin(p)) continue;
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

    // 11c. Output scan skip. In avr8js 0.21.1 an output pin's mapped state depends only on
    //      its DDRx bit, the port's output latch (lastValue) and openCollector. The latch is
    //      written only in AVRIOPort.writeGpio, which calls every port listener when it
    //      changes; DDR/PORT/PIN writes and timer compare-output overrides all go through
    //      it. openCollector is set only by the USI peripheral, which is not built here.
    //      Direct cpu.data writes (stack pushes, XCH) can change a DDRx byte with no
    //      listener call, so the scan also runs whenever a watched DDRx byte moved.
    //      Added after every other listener, so their order is unchanged.
    const watched: AVRIOPort[] = [];
    for (const o of bridge._outPins) {
      if (watched.includes(o.port)) continue;
      watched.push(o.port);
      bridge._watchDdrAddr.push(
        o.port === portB ? portBConfig.DDR : o.port === portC ? portCConfig.DDR : portDConfig.DDR,
      );
      o.port.addListener(() => {
        bridge._outDirty = true;
      });
    }

    // 11d. Unmodelled-peripheral detection (honest-verdicts Part 1). Wraps the read and write
    //      hooks of every register in src/engine/peripherals.ts. Each wrapper returns what the
    //      previous hook (or cpu.data) returns, so values, cycles and output are unchanged.
    //      avr8js calls readHooks/writeHooks for every data-space access at addresses >= 32.
    for (const reg of unmodelledRegisters()) {
      const prevR = cpu.readHooks[reg.addr];
      cpu.readHooks[reg.addr] = (addr: number): number => {
        const v = prevR ? prevR(addr) : cpu.data[addr];
        bridge._peripherals.access(addr, 'read', v, cpu.cycles);
        return v;
      };
      const prevW = cpu.writeHooks[reg.addr];
      cpu.writeHooks[reg.addr] = (value: number, oldValue: number, addr: number, mask: number): boolean => {
        bridge._peripherals.access(addr, 'write', value, cpu.cycles);
        return prevW ? Boolean(prevW(value, oldValue, addr, mask)) : false;
      };
    }

    // 12. Make the initial presented level of every input pin consistent.
    for (let i = 0; i < fixture.pins.length; i++) {
      const fp = fixture.pins[i];
      if (isAnalogPin(fp)) continue;
      if (fp.direction === 'input') bridge._presentReleased(i);
    }

    // 12b. DDRx bytes as of the snapshot, for the step 5 check.
    for (const addr of bridge._watchDdrAddr) bridge._watchDdrSeen.push(cpu.data[addr]);

    return bridge;
  }

  // â”€â”€ advance() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  advance(requestedCycles: number): AdvanceResult | BridgeError {
    const outputEvents: OutputEvent[] = [];
    const appliedInputs: AppliedInputEvent[] = [];
    const appliedAnalogInputs: AppliedAnalogInputEvent[] = [];

    // Prepend initial snapshot on the very first advance() call
    if (this._firstAdvance) {
      outputEvents.push(...this._initialSnapshot);
      this._firstAdvance = false;
    }

    if (requestedCycles <= 0) {
      return this._withPeripheralUses({ cyclesConsumed: 0, outputEvents, appliedInputs, appliedAnalogInputs, diagnostics: this._takeDiagnostics() });
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
        if (isAnalogInputEvent(ev)) {
          if (isAnalogPin(pin)) this._adc.channelValues[pin.channel] = analogCountToVolts(ev.analog);
          appliedAnalogInputs.push({ ...ev, appliedCycle: this._cpu.cycles });
        } else {
          this._applyInput(this._fixture.pins.indexOf(pin), ev.value);
          appliedInputs.push({ ...ev, appliedCycle: this._cpu.cycles });
        }
        this._outDirty = true;
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

      // 5. Detect output pin changes in ascending fixture pin-index order.
      //    The pins were resolved once in _build, so no per-pin lookups happen here.
      //    The scan is skipped when no listener fired, no input was applied and no watched
      //    DDRx byte moved since the last scan: then no output pin's mapped state changed
      //    (see _build step 11c), so the scan would emit nothing.
      const ddr = this._cpu.data;
      const ddrAddr = this._watchDdrAddr;
      const ddrSeen = this._watchDdrSeen;
      let scan = this._outDirty;
      if (!scan) {
        for (let k = 0; k < ddrAddr.length; k++) {
          if (ddr[ddrAddr[k]] !== ddrSeen[k]) {
            scan = true;
            break;
          }
        }
      }
      if (scan) {
        const outs = this._outPins;
        const shadow = this._pinShadow;
        for (let k = 0; k < outs.length; k++) {
          const o = outs[k];
          const newValue = mapPinState(o.port.pinState(o.bit));
          if (newValue !== shadow[o.idx]) {
            shadow[o.idx] = newValue;
            outputEvents.push({ signal: o.signal, value: newValue, cycle: this._cpu.cycles });
          }
        }
        this._outDirty = false;
        for (let k = 0; k < ddrAddr.length; k++) ddrSeen[k] = ddr[ddrAddr[k]];
      }
    }

    return this._withPeripheralUses({
      cyclesConsumed: this._cpu.cycles - startCycles,
      outputEvents,
      appliedInputs,
      appliedAnalogInputs,
      diagnostics: this._takeDiagnostics(),
    });
  }

  /** Adds peripheralUses only when this step recorded one, so results without uses keep their shape. */
  private _withPeripheralUses(r: AdvanceResult): AdvanceResult {
    const uses: PeripheralDiagnostic[] = this._peripherals.take();
    if (uses.length > 0) r.peripheralUses = uses;
    return r;
  }

  private _takeDiagnostics(): Diagnostic[] {
    const out = this._pendingDiagnostics;
    this._pendingDiagnostics = [];
    return out;
  }

  // â”€â”€ Released-pin model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _applyInput(pinIdx: number, value: 0 | 1 | 'release'): void {
    const pin = this._fixture.pins[pinIdx];
    if (isAnalogPin(pin)) return;
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
    if (isAnalogPin(pin)) return;
    const port = this._portMap.get(pin.port)!;
    const state = port.pinState(pin.bit);
    if (state === PinState.High || state === PinState.Low) return;
    port.setPin(pin.bit, state === PinState.InputPullUp);
  }

  // â”€â”€ schedule() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ supports() â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  supports(capability: string): true | BridgeError {
    const wired = new Set([
      'gpio',
      'external-interrupt',
      'pin-change-interrupt',
      'timer0',
      'timer1',
      'timer2',
      'adc',
    ]);
    if (wired.has(capability)) return true;
    return {
      kind: 'unsupported-capability',
      capability,
      message: `Capability "${capability}" is not wired by this bridge`,
    };
  }
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function mapPinState(state: PinState): PinValue {
  switch (state) {
    case PinState.High:        return 1;
    case PinState.Low:         return 0;
    case PinState.Input:       return 'input';
    case PinState.InputPullUp: return 'input';
  }
}
