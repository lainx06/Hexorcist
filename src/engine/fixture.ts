/**
 * Fixture and event validation. Pure: no avr8js import, no clock, no randomness.
 *
 * Digital-pin checks, their order and their messages match the checks that
 * the bridge ran inline before this module existed.
 */
import type {
  AnalogFixturePin,
  AnalogInputEvent,
  BridgeError,
  DigitalFixturePin,
  Fixture,
  FixturePin,
  ScheduledInput,
} from './types.js';

/** True for a pin declared with `kind: "analog"`. */
export function isAnalogPin(pin: FixturePin): pin is AnalogFixturePin {
  return pin.kind === 'analog';
}

/** True for an event that carries an ADC count. */
export function isAnalogInputEvent(ev: ScheduledInput): ev is AnalogInputEvent {
  return 'analog' in ev;
}

const ACTIVE_LEVELS: ReadonlySet<unknown> = new Set(['low', 'high']);
const REST_STATES: ReadonlySet<unknown> = new Set(['released', 'active']);

function invalid(message: string, signal?: string): BridgeError {
  return signal === undefined
    ? { kind: 'invalid-fixture', message }
    : { kind: 'invalid-fixture', message, signal };
}

function validateDigitalPin(pin: DigitalFixturePin): BridgeError | null {
  // Same checks, order and messages as before.
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

  const isInput = pin.direction === 'input';
  if (pin.activeLevel !== undefined) {
    if (!ACTIVE_LEVELS.has(pin.activeLevel)) {
      return invalid(
        `Pin "${pin.signal}": activeLevel must be "low" or "high"`,
        pin.signal,
      );
    }
    if (!isInput) {
      return invalid(
        `Pin "${pin.signal}": activeLevel is only allowed on input pins`,
        pin.signal,
      );
    }
  }
  if (pin.restState !== undefined) {
    if (!REST_STATES.has(pin.restState)) {
      return invalid(
        `Pin "${pin.signal}": restState must be "released" or "active"`,
        pin.signal,
      );
    }
    if (!isInput) {
      return invalid(
        `Pin "${pin.signal}": restState is only allowed on input pins`,
        pin.signal,
      );
    }
  }
  return null;
}

function validateAnalogPin(pin: AnalogFixturePin, seen: Set<number>): BridgeError | null {
  const s = pin.signal;
  if (!Number.isInteger(pin.channel) || pin.channel < 0 || pin.channel > 5) {
    return invalid(`Analog pin "${s}": channel ${pin.channel} must be an integer 0–5`, s);
  }
  if (seen.has(pin.channel)) {
    return invalid(`Analog pin "${s}": channel ${pin.channel} is already used by another analog pin`, s);
  }
  seen.add(pin.channel);
  if (
    pin.restLevel !== undefined &&
    (!Number.isInteger(pin.restLevel) || pin.restLevel < 0 || pin.restLevel > 1023)
  ) {
    return invalid(`Analog pin "${s}": restLevel ${pin.restLevel} must be an integer 0–1023`, s);
  }
  if (pin.direction !== undefined && pin.direction !== 'input') {
    return invalid(`Analog pin "${s}": direction must be absent or "input"`, s);
  }
  const extra = pin as unknown as { activeLevel?: unknown; restState?: unknown };
  if (extra.activeLevel !== undefined) {
    return invalid(`Analog pin "${s}": activeLevel is not allowed on analog pins`, s);
  }
  if (extra.restState !== undefined) {
    return invalid(`Analog pin "${s}": restState is not allowed on analog pins`, s);
  }
  return null;
}

/**
 * Validate a Fixture. Returns the first error found, or null when it is accepted.
 * Order: clockHz, then each pin in Fixture order, then the shared physical pin check.
 */
export function validateFixture(fixture: Fixture): BridgeError | null {
  if (fixture.clockHz !== undefined && fixture.clockHz <= 0) {
    return { kind: 'invalid-fixture', message: 'clockHz must be positive' };
  }

  const seenChannels = new Set<number>();
  for (const pin of fixture.pins) {
    const err = isAnalogPin(pin)
      ? validateAnalogPin(pin, seenChannels)
      : validateDigitalPin(pin);
    if (err) return err;
  }

  // On the ATmega328P, ADC channel N is port C bit N. Earliest conflict wins.
  for (const analog of fixture.pins) {
    if (!isAnalogPin(analog)) continue;
    for (const other of fixture.pins) {
      if (isAnalogPin(other)) continue;
      if (other.port === 'C' && other.bit === analog.channel) {
        return invalid(
          `analog pin "${analog.signal}" (channel ${analog.channel}) and digital pin ` +
            `"${other.signal}" (port C, bit ${other.bit}) are on the same physical pin`,
        );
      }
    }
  }
  return null;
}

/**
 * Validate events against a Fixture, in list order. Returns the first error, or null.
 * Digital event values are not checked here, as before.
 */
export function validateEvents(
  fixture: Fixture,
  events: readonly ScheduledInput[],
): BridgeError | null {
  for (const ev of events) {
    const pin = fixture.pins.find(p => p.signal === ev.signal);
    if (!pin) {
      return {
        kind: 'unmapped-pin',
        signal: ev.signal,
        message: `Signal "${ev.signal}" is not mapped in the fixture`,
      };
    }
    if (isAnalogInputEvent(ev)) {
      if (!isAnalogPin(pin)) {
        return {
          kind: 'pin-kind-mismatch',
          signal: ev.signal,
          message: `Signal "${ev.signal}" is a digital pin; it cannot take an analog event`,
        };
      }
      if (!Number.isInteger(ev.analog) || ev.analog < 0 || ev.analog > 1023) {
        return {
          kind: 'invalid-analog-value',
          signal: ev.signal,
          message: `Analog value ${ev.analog} for "${ev.signal}" must be an integer 0–1023`,
        };
      }
    } else if (isAnalogPin(pin)) {
      return {
        kind: 'pin-kind-mismatch',
        signal: ev.signal,
        message: `Signal "${ev.signal}" is an analog pin; it cannot take a digital event`,
      };
    }
  }
  return null;
}
