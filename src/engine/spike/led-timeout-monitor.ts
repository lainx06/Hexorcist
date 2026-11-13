// SPIKE: temporary monitor harness - to be replaced by the rule-compiler spec

import type { OutputEvent } from '../types.js';

export interface MonitorViolation {
  verdict: 'BROKE';
  violationCycle: number;
}

export interface MonitorClean {
  verdict: 'no violation in this run';
}

export type MonitorResult = MonitorViolation | MonitorClean;

/**
 * LED Timeout Monitor
 *
 * Rule: LED must never remain ON (value === 1) for more than 300 ms of simulated
 * time, which at 16 MHz = 4,800,000 cycles.
 *
 * The monitor is a pure function that consumes the OutputEvent[] stream produced
 * by EmulatorBridge.advance(). It does NOT import avr8js.
 *
 * @param events   OutputEvent[] from AdvanceResult.outputEvents
 * @param runEndCycle  The bridge's cycleCount after the final advance() call (required)
 * @param signal   The signal name to watch (default: 'LED')
 * @param maxOnCycles  Maximum allowed ON duration in cycles (default: 4_800_000)
 */
export function checkLedTimeout(
  events: OutputEvent[],
  runEndCycle: number,
  signal = 'LED',
  maxOnCycles = 4_800_000,
): MonitorResult {
  // Current LED state: initially unknown ("input")
  let ledState: 0 | 1 | 'input' = 'input';
  // Cycle at which LED last transitioned to ON
  let onCycle = -1;

  for (const ev of events) {
    if (ev.signal !== signal) continue;

    // While LED is ON, check if the current event's cycle shows we've crossed the threshold.
    // This catches both:
    //   (a) a subsequent LED event (e.g. LED going OFF) that arrives after the timeout, and
    //   (b) a continuing-ON event at a cycle past the limit.
    if (ledState === 1 && onCycle >= 0 && ev.cycle >= onCycle + maxOnCycles) {
      return { verdict: 'BROKE', violationCycle: onCycle + maxOnCycles };
    }

    // Detect transition to ON from a non-1 state
    if (ev.value === 1 && ledState !== 1) {
      onCycle = ev.cycle;
    }

    // Update state
    ledState = ev.value as 0 | 1 | 'input';

    // After updating state: check if LED is still ON and already past the limit
    // (handles an ON event whose own cycle is already beyond the threshold)
    if (ledState === 1 && onCycle >= 0 && ev.cycle >= onCycle + maxOnCycles) {
      return { verdict: 'BROKE', violationCycle: onCycle + maxOnCycles };
    }
  }

  // End-of-run check: if LED is still ON and the run has passed onCycle + maxOnCycles,
  // report a violation using runEndCycle (the bridge's cycleCount after the final advance).
  if (ledState === 1 && onCycle >= 0 && runEndCycle >= onCycle + maxOnCycles) {
    return { verdict: 'BROKE', violationCycle: onCycle + maxOnCycles };
  }

  return { verdict: 'no violation in this run' };
}
