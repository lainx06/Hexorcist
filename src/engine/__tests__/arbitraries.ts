/**
 * Shared fast-check generators for the gremlin-engine tests. Helper file, not a test file.
 * Imports fast-check, engine types, and the gremlin catalogue data (no emulator code).
 */
import fc from 'fast-check';
import type {
  AnalogFixturePin,
  DigitalFixturePin,
  Fixture,
  FixturePin,
} from '../types.js';

type Port = 'B' | 'C' | 'D';
type Bit = DigitalFixturePin['bit'];

/** Full 32-bit range, biased toward 0, 1 and 4294967295. */
export const arbSeed: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.constantFrom(0, 1, 0xffffffff), weight: 1 },
  { arbitrary: fc.integer({ min: 0, max: 0xffffffff }), weight: 3 },
);

/** Full range of Run_Index values. */
export const arbRunIndex: fc.Arbitrary<number> = fc.integer({ min: 0, max: 0xffffffff });

/** Small Run_Index values (0 to 9) for emulator properties. */
export const arbSmallRunIndex: fc.Arbitrary<number> = fc.integer({ min: 0, max: 9 });

/** Run_Cycles: 1 to 50,000,000 plus boundary constants. */
export const arbRunCycles: fc.Arbitrary<number> = fc.oneof(
  { arbitrary: fc.integer({ min: 1, max: 50_000_000 }), weight: 3 },
  {
    arbitrary: fc.constantFrom(1, 1_600_000, 1_600_001, 8_000_000, 4_294_967_296),
    weight: 1,
  },
);

const ALL_PORTS: readonly Port[] = ['B', 'C', 'D'];
const ALL_BITS: readonly Bit[] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Draw `count` distinct analog channels from 0..5 (order is drawn too). */
function arbChannels(maxCount: number): fc.Arbitrary<number[]> {
  return fc
    .integer({ min: 0, max: maxCount })
    .chain(n =>
      fc.shuffledSubarray([0, 1, 2, 3, 4, 5], { minLength: n, maxLength: n }),
    );
}

function arbAnalogPin(signal: string, channel: number): fc.Arbitrary<AnalogFixturePin> {
  return fc
    .option(fc.integer({ min: 0, max: 1023 }), { nil: undefined })
    .map(restLevel => {
      const pin: AnalogFixturePin = { signal, kind: 'analog', channel };
      if (restLevel !== undefined) pin.restLevel = restLevel;
      return pin;
    });
}

function arbDigitalPin(
  signal: string,
  places: readonly { port: Port; bit: Bit }[],
): fc.Arbitrary<DigitalFixturePin> {
  return fc
    .record({
      place: fc.constantFrom(...places),
      direction: fc.constantFrom<'input' | 'output'>('input', 'output'),
      withKind: fc.boolean(),
      activeLevel: fc.constantFrom<'low' | 'high' | undefined>(undefined, 'low', 'high'),
      restState: fc.constantFrom<'released' | 'active' | undefined>(
        undefined,
        'released',
        'active',
      ),
    })
    .map(({ place, direction, withKind, activeLevel, restState }) => {
      const pin: DigitalFixturePin = {
        signal,
        port: place.port,
        bit: place.bit,
        direction,
      };
      if (withKind) pin.kind = 'digital';
      // activeLevel and restState are allowed on input pins only.
      if (direction === 'input') {
        if (activeLevel !== undefined) pin.activeLevel = activeLevel;
        if (restState !== undefined) pin.restState = restState;
      }
      return pin;
    });
}

/**
 * Valid Fixtures: 0 to 6 pins with distinct signal names, up to 3 of them analog
 * on distinct channels. The analog channels are drawn first. Each digital pin is
 * then drawn from the (port, bit) places that exclude port C with a bit equal to
 * any drawn channel, so the shared physical pin rule cannot trip. No filtering
 * and no retry.
 */
export const arbFixture: fc.Arbitrary<Fixture> = arbChannels(3).chain(channels => {
  const places: { port: Port; bit: Bit }[] = [];
  for (const port of ALL_PORTS) {
    for (const bit of ALL_BITS) {
      if (port === 'C' && channels.includes(bit)) continue;
      places.push({ port, bit });
    }
  }
  return fc.integer({ min: 0, max: 6 - channels.length }).chain(digitalCount => {
    const total = channels.length + digitalCount;
    const analogArbs = channels.map((ch, i) => arbAnalogPin(`A${i}`, ch));
    const digitalArbs = Array.from({ length: digitalCount }, (_, i) =>
      arbDigitalPin(`D${i}`, places),
    );
    return fc
      .tuple(fc.tuple(...analogArbs), fc.tuple(...digitalArbs))
      .chain(([analog, digital]) => {
        const all: FixturePin[] = [...digital, ...analog];
        return fc
          .shuffledSubarray(all, { minLength: total, maxLength: total })
          .map((pins): Fixture => ({ pins }));
      });
  });
});

/** A Fixture that breaks the shared physical pin rule on purpose, with the two names involved. */
export interface SharedPinCase {
  fixture: Fixture;
  analogSignal: string;
  digitalSignal: string;
}

/**
 * The opposite case of `arbFixture`: one analog pin on channel N and one
 * non-analog pin (input or output) on port C bit N. Any other pins sit on
 * ports B and D, so the conflict is the only one and its signals are known.
 */
export const arbSharedPinFixture: fc.Arbitrary<SharedPinCase> = fc
  .record({
    channel: fc.integer({ min: 0, max: 5 }),
    restLevel: fc.option(fc.integer({ min: 0, max: 1023 }), { nil: undefined }),
    direction: fc.constantFrom<'input' | 'output'>('input', 'output'),
    analogFirst: fc.boolean(),
    extraCount: fc.integer({ min: 0, max: 3 }),
  })
  .chain(({ channel, restLevel, direction, analogFirst, extraCount }) => {
    const extraPlaces: { port: Port; bit: Bit }[] = [];
    for (const port of ['B', 'D'] as const) {
      for (const bit of ALL_BITS) extraPlaces.push({ port, bit });
    }
    const extras = Array.from({ length: extraCount }, (_, i) =>
      arbDigitalPin(`X${i}`, extraPlaces),
    );
    return fc.tuple(...extras).map((extraPins): SharedPinCase => {
      const analog: AnalogFixturePin = { signal: 'SHARED_ANALOG', kind: 'analog', channel };
      if (restLevel !== undefined) analog.restLevel = restLevel;
      const digital: DigitalFixturePin = {
        signal: 'SHARED_DIGITAL',
        port: 'C',
        bit: channel as Bit,
        direction,
      };
      const conflict: FixturePin[] = analogFirst ? [analog, digital] : [digital, analog];
      return {
        fixture: { pins: [...extraPins, ...conflict] },
        analogSignal: analog.signal,
        digitalSignal: digital.signal,
      };
    });
  });

// ---- Gremlin sets (task 14.1) ----
import { GREMLIN_CATALOGUE } from '../gremlins/catalogue.js';
import type { GremlinDefinition, GremlinSpec, ParamSpec } from '../gremlins/catalogue.js';

/** One override for a parameter, always inside its allowed range. */
function arbParamValue(spec: ParamSpec): fc.Arbitrary<number | { min: number; max: number }> {
  const { min, max } = spec.allowed;
  const arbInRange = fc.oneof(
    { arbitrary: fc.constantFrom(min, max), weight: 1 },
    { arbitrary: fc.integer({ min, max }), weight: 3 },
  );
  if (spec.shape === 'scalar') return arbInRange;
  return fc
    .tuple(arbInRange, arbInRange)
    .map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) }));
}

function arbGremlinEntry(def: GremlinDefinition): fc.Arbitrary<GremlinSpec> {
  const optional: Record<string, fc.Arbitrary<number | { min: number; max: number } | undefined>> = {};
  for (const p of def.params) {
    optional[p.name] = fc.option(arbParamValue(p), { nil: undefined });
  }
  return fc.record(optional).map(overrides => {
    const params: Record<string, number | { min: number; max: number }> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) params[k] = v;
    }
    return Object.keys(params).length === 0
      ? { id: def.id }
      : { id: def.id, params };
  });
}

/** 0 to 5 gremlin entries (repeats allowed), every override inside its allowed range. */
export const arbGremlinSet: fc.Arbitrary<GremlinSpec[]> = fc.array(
  fc.oneof(...GREMLIN_CATALOGUE.map(arbGremlinEntry)),
  { minLength: 0, maxLength: 5 },
);
