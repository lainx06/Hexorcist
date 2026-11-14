// Eligible pin lists and small integer helpers shared by the gremlin generators.
// Pure integer arithmetic. No clock, no shared generator.

import type { AnalogFixturePin, DigitalFixturePin, Fixture } from "../types";

/** CPU cycles per millisecond at the default 16 MHz clock. */
export const DEFAULT_CLOCK_HZ = 16_000_000;

/** Rest_Level of an analog pin that declares no `restLevel`. */
export const DEFAULT_REST_LEVEL = 512;

function isDigitalPin(p: Fixture["pins"][number]): p is DigitalFixturePin {
  return p.kind !== "analog";
}

/** Digital input pins in Fixture order. */
export function digitalInputs(fixture: Fixture): DigitalFixturePin[] {
  return fixture.pins.filter(
    (p): p is DigitalFixturePin => isDigitalPin(p) && p.direction === "input",
  );
}

/** Digital input pins whose rest state is active, in Fixture order. */
export function restActiveInputs(fixture: Fixture): DigitalFixturePin[] {
  return digitalInputs(fixture).filter((p) => p.restState === "active");
}

/** Analog pins in Fixture order. */
export function analogInputs(fixture: Fixture): AnalogFixturePin[] {
  return fixture.pins.filter((p): p is AnalogFixturePin => p.kind === "analog");
}

/** Value that drives a digital input to its active level: 1 for high, 0 for low or absent. */
export function pressValue(pin: DigitalFixturePin): 0 | 1 {
  return pin.activeLevel === "high" ? 1 : 0;
}

/** Rest_Level of an analog pin. */
export function restLevelOf(pin: AnalogFixturePin): number {
  return pin.restLevel ?? DEFAULT_REST_LEVEL;
}

/** Floor of a / b for a >= 0 and b > 0, without float division. */
export function floorDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

/** Truncation toward zero of a / b for b > 0. `%` keeps the dividend's sign, so this truncates. */
export function truncDiv(a: number, b: number): number {
  return (a - (a % b)) / b;
}

/** Milliseconds to whole cycles: floor(ms * clockHz / 1000). 16,000 per ms at 16 MHz. */
export function msToCycles(ms: number, clockHz: number = DEFAULT_CLOCK_HZ): number {
  return floorDiv(ms * clockHz, 1000);
}
