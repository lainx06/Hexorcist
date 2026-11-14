// This file wraps one compiled Rule: "<signal> is 1 must never last <window> ms or longer."
// It keeps the exports of the earlier spike monitor and hands the checking to the Rule_Compiler.

import type { OutputEvent } from '../types.js';
import { compileRuleSet } from '../rules/compile';
import { isSignalName } from '../rules/ir';
import type { Rule } from '../rules/ir';

export interface MonitorViolation {
  verdict: 'BROKE';
  violationCycle: number;
}

export interface MonitorClean {
  verdict: 'no violation in this run';
}

export type MonitorResult = MonitorViolation | MonitorClean;

const MAX_SAFE_TEXT = '9007199254740991';
const MAX_ON_CYCLES_LIMIT = 159_999_999_999;
const SPIKE_CLOCK_HZ = 16_000_000;
const CYCLES_PER_MS = 16_000;

/**
 * LED Timeout Monitor
 *
 * Rule: the signal must never stay at 1 for maxOnCycles cycles or longer. With the
 * defaults that is 300 ms at 16 MHz = 4,800,000 cycles.
 *
 * The function compiles the Rule `notLongerThan(eq(signal, 1), maxOnCycles / 16000)`,
 * feeds the signal's events to the compiled checker, and maps the outcome to a
 * MonitorResult. It does NOT import avr8js.
 *
 * Arguments that are rejected throw an Error whose message is a fixed Reason. No
 * argument text is copied into a message.
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
  if (!isSignalName(signal)) {
    throw new Error(
      'signal must be a signal name: a letter, then up to 31 letters, digits or underscores',
    );
  }
  if (!Number.isInteger(maxOnCycles) || maxOnCycles < 1 || maxOnCycles > MAX_ON_CYCLES_LIMIT) {
    throw new Error('maxOnCycles must be an integer from 1 to 159999999999');
  }
  if (!Number.isInteger(runEndCycle) || runEndCycle < 0) {
    throw new Error('runEndCycle must be a non-negative integer');
  }
  if (runEndCycle > Number.MAX_SAFE_INTEGER) {
    throw new Error('runEndCycle must be at most ' + MAX_SAFE_TEXT);
  }

  const mine: OutputEvent[] = [];
  let previousCycle = -1;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.signal !== signal) continue;
    const c = ev.cycle;
    if (!Number.isInteger(c)) {
      throw new Error('events[' + i + '].cycle must be an integer');
    }
    if (c > Number.MAX_SAFE_INTEGER) {
      throw new Error('events[' + i + '].cycle must be at most ' + MAX_SAFE_TEXT);
    }
    if (c > runEndCycle) {
      throw new Error('events[' + i + '].cycle is above runEndCycle');
    }
    if (c < previousCycle) {
      throw new Error(
        'events[' + i + '].cycle is below the cycle of the previous element for the signal',
      );
    }
    previousCycle = c;
    mine.push(ev);
  }

  const rule: Rule = {
    form: 'notLongerThan',
    condition: { op: 'eq', signal, value: 1 },
    ms: maxOnCycles / CYCLES_PER_MS,
  };
  const compiled = compileRuleSet([rule], {
    clockHz: SPIKE_CLOCK_HZ,
    pins: [{ signal, port: 'B', bit: 5, direction: 'output' }],
  });
  if (!compiled.ok) {
    // The argument checks above make this unreachable; report it without copying input.
    throw new Error('the monitor rule could not be compiled');
  }
  const checker = compiled.compiled.checker;

  const first = checker({
    runIndex: 0,
    stepIndex: 0,
    endOfRun: false,
    cycle: runEndCycle,
    outputEvents: mine,
    appliedInputs: [],
    diagnostics: [],
  });
  if (first.violation) {
    return { verdict: 'BROKE', violationCycle: first.violation.cycle };
  }

  const second = checker({
    runIndex: 0,
    stepIndex: 1,
    endOfRun: true,
    cycle: runEndCycle,
    outputEvents: [],
    appliedInputs: [],
    diagnostics: [],
  });
  if (second.violation) {
    return { verdict: 'BROKE', violationCycle: second.violation.cycle };
  }

  return { verdict: 'no violation in this run' };
}
