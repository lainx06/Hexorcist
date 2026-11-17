// Feature: bench-ui-upload. Generators for valid Pin_Tables. Passing runs are evidence, not proof.
import fc from "fast-check";
import { isSignalName } from "../../src/engine/rules/ir";
import { MAX_PINS } from "../../src/ui/app/model/pin-table";
import type { PinRow } from "../../src/ui/app/model/pin-table";

const signalArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_]{0,31}$/).filter((s) => isSignalName(s));

const portBits = ["B", "C", "D"].flatMap((port) => [0, 1, 2, 3, 4, 5, 6, 7].map((bit) => ({ port, bit })));

const plainArb = fc.oneof(
  fc.constant(""),
  fc.string({ minLength: 1, maxLength: 40 }),
  fc.string({ unit: "binary", minLength: 1, maxLength: 40 }),
);

/** Valid tables: 2 to 16 rows, at least one input and one output, unique names and port/bit pairs. */
export const pinTableArb: fc.Arbitrary<PinRow[]> = fc
  .integer({ min: 2, max: MAX_PINS })
  .chain((n) =>
    fc.record({
      signals: fc.uniqueArray(signalArb, { minLength: n, maxLength: n }),
      places: fc.shuffledSubarray(portBits, { minLength: n, maxLength: n }),
      outputs: fc.array(fc.boolean(), { minLength: n, maxLength: n }),
      pressed: fc.array(fc.constantFrom<"low" | "high">("low", "high"), { minLength: n, maxLength: n }),
      plains: fc.array(plainArb, { minLength: n, maxLength: n }),
    }),
  )
  .map(({ signals, places, outputs, pressed, plains }) =>
    signals.map((signal, i): PinRow => {
      const direction = i === 0 ? "input" : i === 1 ? "output" : outputs[i] ? "output" : "input";
      const place = places[i] as { port: string; bit: number };
      return {
        kind: "digital",
        id: i,
        signal,
        plainName: plains[i] as string,
        port: place.port,
        bit: place.bit,
        direction,
        pressed: direction === "input" ? (pressed[i] as "low" | "high") : "low",
      };
    }),
  );