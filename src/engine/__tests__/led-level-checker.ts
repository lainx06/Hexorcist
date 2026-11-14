// Test helper, not a test file. Level-timeout Checker for emulator properties.
// Imports only Checker types.

import type { Checker, CheckerOutcome } from "../checker";

export interface LevelTimeoutOptions {
  signal: string;
  limitCycles: number;
}

export function makeLevelTimeoutChecker(options: LevelTimeoutOptions): Checker {
  const { signal, limitCycles: limit } = options;
  const rule = `${signal} stays at one level longer than ${limit} cycles`;
  let known = false;
  let currentLevel: 0 | 1 | "input" = 0;
  let levelStart = 0;
  let reported = false;

  return (observation): CheckerOutcome => {
    if (observation.stepIndex === 0) {
      known = false;
      currentLevel = 0;
      levelStart = 0;
      reported = false;
    }
    if (reported) return { violation: null };

    for (const event of observation.outputEvents) {
      if (event.signal !== signal) continue;
      if (!known) {
        known = true;
        currentLevel = event.value;
        levelStart = event.cycle;
        continue;
      }
      if (event.value === currentLevel) continue;
      if (event.cycle - levelStart > limit) {
        reported = true;
        return { violation: { rule, cycle: levelStart + limit } };
      }
      currentLevel = event.value;
      levelStart = event.cycle;
    }

    if (observation.endOfRun && known && observation.cycle - levelStart > limit) {
      reported = true;
      return { violation: { rule, cycle: levelStart + limit } };
    }
    return { violation: null };
  };
}
