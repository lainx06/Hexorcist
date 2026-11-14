export interface DigitalFixturePin {
  signal: string;
  port: "B" | "C" | "D";
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  direction: "output" | "input";
  kind?: "digital";
  /** Input pins only; default "low". */
  activeLevel?: "low" | "high";
  /** Input pins only; default "released". */
  restState?: "released" | "active";
}

export interface AnalogFixturePin {
  signal: string;
  kind: "analog";
  /** Integer 0..5. */
  channel: number;
  /** Integer 0..1023; default 512. */
  restLevel?: number;
  direction?: "input";
  port?: undefined;
  bit?: undefined;
}

export type FixturePin = DigitalFixturePin | AnalogFixturePin;

export interface Fixture {
  clockHz?: number;
  pins: FixturePin[];
}

export type PinValue = 0 | 1 | "input";

export interface OutputEvent {
  signal: string;
  value: PinValue;
  cycle: number;
}

/** External state a caller can apply to an input pin. "release" stops driving it. */
export type InputValue = 0 | 1 | "release";

export interface InputEvent {
  signal: string;
  value: InputValue;
  cycle: number;
  gremlinId?: string;
}

export interface AnalogInputEvent {
  signal: string;
  /** Integer ADC count, 0..1023. */
  analog: number;
  cycle: number;
  gremlinId?: string;
}

export type ScheduledInput = InputEvent | AnalogInputEvent;

export interface AppliedInputEvent extends InputEvent {
  appliedCycle: number;
}

export interface AppliedAnalogInputEvent extends AnalogInputEvent {
  appliedCycle: number;
}

export type AppliedInput = AppliedInputEvent | AppliedAnalogInputEvent;

export type BridgeError =
  | { kind: "invalid-hex";           message: string }
  | { kind: "invalid-fixture";       message: string; signal?: string }
  | { kind: "invalid-analog-value";  signal: string; message: string }
  | { kind: "pin-kind-mismatch";     signal: string; message: string }
  | { kind: "unsupported-port";      port: string;   message: string }
  | { kind: "unsupported-capability"; capability: string; message: string }
  | { kind: "unmapped-pin";          signal: string; message: string }
  | { kind: "input-in-past";         message: string }
  | { kind: "cycle-overflow";        cycleCount: number; message: string };

export type SupportedCapability =
  | "gpio"
  | "timer0" | "timer1" | "timer2"
  | "adc"
  | "usart"
  | "eeprom"
  | "watchdog";

/**
 * A released input pin with no pull-up was read. Detection is per PIN register,
 * not per bit, so it may over-report and never under-reports.
 */
export interface FloatingInputDiagnostic {
  kind: "floating-input";
  signal: string;
  /** Integer CPU cycle of the earliest covering PIN register read. */
  cycle: number;
  /** "PINB", "PINC" or "PIND". */
  register: string;
}

export type Diagnostic = FloatingInputDiagnostic;

export interface AdvanceResult {
  cyclesConsumed: number;
  outputEvents: OutputEvent[];
  /** Digital only. */
  appliedInputs: AppliedInputEvent[];
  /** Always present, possibly empty, also when the Fixture has no analog pin. */
  appliedAnalogInputs: AppliedAnalogInputEvent[];
  /** Always present, possibly empty. */
  diagnostics: Diagnostic[];
}
