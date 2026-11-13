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

export interface InputEvent {
  signal: string;
  value: 0 | 1;
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

export interface AdvanceResult {
  cyclesConsumed: number;
  outputEvents: OutputEvent[];
  appliedInputs: AppliedInputEvent[];
}
