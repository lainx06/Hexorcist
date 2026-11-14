/**
 * ADC count to volts conversion. Pure, no emulator import.
 *
 * The emulated converter turns a voltage into a 10-bit count. Mapping a count
 * to the middle of its bin (the 2c + 1 term over 2048) keeps the voltage away
 * from the bin edges, so the converter reads back exactly the count applied.
 */

/** Reference voltage the converter scales against, in volts. */
export const ADC_FULL_SCALE_VOLTS = 5;

/** Voltage at the centre of the bin for a count `c` (0 to 1023). */
export function analogCountToVolts(c: number): number {
  return ((2 * c + 1) * ADC_FULL_SCALE_VOLTS) / 2048;
}
