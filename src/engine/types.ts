import type { CannotCheck, Violation } from "./checker";
import type { SkippedEntry } from "./event-list";
import type { GeneratedEvent } from "./gremlins/generate-types";

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

/**
 * The earliest use of one unmodelled peripheral in one Run (honest-verdicts Part 1).
 * Kept apart from Diagnostic so that Checkers never see it.
 */
export interface PeripheralDiagnostic {
  /** Peripheral_ID, e.g. "USART0" or "CLKPR". */
  peripheral: string;
  /** Datasheet register name, e.g. "UCSR0A". */
  register: string;
  /** Integer CPU cycle of the access. */
  cycle: number;
  access: "read" | "write";
}

export interface AdvanceResult {
  cyclesConsumed: number;
  outputEvents: OutputEvent[];
  /** Digital only. */
  appliedInputs: AppliedInputEvent[];
  /** Always present, possibly empty, also when the Fixture has no analog pin. */
  appliedAnalogInputs: AppliedAnalogInputEvent[];
  /** Always present, possibly empty. */
  diagnostics: Diagnostic[];
  /** Unmodelled-peripheral uses recorded in this step. Present only when non-empty, ascending cycle. */
  peripheralUses?: PeripheralDiagnostic[];
}

// Run and Campaign data. Plain JSON shapes: no undefined, NaN, BigInt, Date or
// class instances. Absent values are null.

/** Everything needed to show the lowest violating Run. */
export interface BrokeTrace {
  runIndex: number;
  runSeed: number;
  eventList: GeneratedEvent[];
  outputEvents: OutputEvent[];
  violation: Violation;
}

export type Verdict =
  | { verdict: "BROKE"; trace: BrokeTrace; unchecked: CannotCheck[] }
  | { verdict: "HELD"; text: string; runs: number }
  | { verdict: "COULDN'T TELL"; reason: string };

export interface RunResult {
  runIndex: number;
  runSeed: number;
  eventList: GeneratedEvent[];
  skipped: SkippedEntry[];
  /** Digital and analog merged, in application order. */
  appliedInputs: AppliedInput[];
  outputEvents: OutputEvent[];
  diagnostics: Diagnostic[];
  cannotCheck: CannotCheck[];
  violation: Violation | null;
  /** Bridge cycleCount at the stop point. */
  endCycle: number;
  /** At most one per unmodelled peripheral, ascending cycle. Present only when non-empty. */
  peripheralUses?: PeripheralDiagnostic[];
}

export interface CampaignResult {
  runsCompleted: number;
  requestedRuns: number;
  /** Earliest violating Run_Index, or null. */
  violatingRunIndex: number | null;
  verdict: Verdict;
}

export interface SliceProgress {
  runsCompleted: number;
  total: number;
  finished: boolean;
  nextRunIndex: number;
  runs: RunResult[];
  /** Set when finished, otherwise null. */
  result: CampaignResult | null;
}

export interface CampaignState {
  nextRunIndex: number;
  runs: RunResult[];
}
