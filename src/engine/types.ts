export interface FixturePin {
  signal: string;
  port: "B" | "C" | "D";
  bit: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  direction: "output" | "input";
}

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
}

export interface AppliedInputEvent extends InputEvent {
  appliedCycle: number;
}

export type BridgeError =
  | { kind: "invalid-hex";           message: string }
  | { kind: "invalid-fixture";       message: string }
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
  appliedInputs: AppliedInputEvent[];
  /** Always present, possibly empty. */
  diagnostics: Diagnostic[];
}
