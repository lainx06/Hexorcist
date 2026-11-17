// Page copy shared by the models and the views. Pure: no DOM, no clock, no randomness.
// views/panels.ts re-exports these names, so older imports keep working.

export const UI_COPY = {
  switchLabel: "Technical details",
  switchOff: "Off",
  switchOn: "On",
  pitch: "Flashing AI-written firmware? Let the gremlins break it before your board does.",
  plainPitch: "AI wrote your gadget's code? Let gremlins break it here before it breaks for real.",
  campaignHeading: "Campaign",
  plainCampaignHeading: "Tries",
  emptyTech: "Run a campaign to inspect the result.",
  emptyPlain: "Press Unleash gremlins to start.",
  unleash: "Unleash gremlins",
  sendsMany: "Sends {n} gremlin tries at this program.",
  sendsOne: "Sends 1 gremlin try at this program.",
  sendsInvalid: "Fix the number of tries to continue.",
  plainRunning: "Try {n} of {m}",
  plainBroke: "Broke on try {n} of {m}, stopped early.",
  plainBrokeLast: "Broke on try {n} of {m}.",
  plainDone: "All {m} tries done.",
  plainDoneOne: "All 1 try done.",
  plainStopped: "Stopped after {k} of {m} tries.",
  tryHeading: "Events in the reduced replay",
  plainTryHeading: "Try removing a move",
  waiting: "waiting for a run",
  subtitle: "Runs in your browser",
  chip: "ATmega328P \u00b7 Browser only",
  whatHeading: "What is this?",
  whatText:
    "Small devices like traffic lights and garage doors run tiny programs. Hexorcist runs the real compiled program in your browser, sends mischievous gremlins to press its buttons at awkward moments, and checks your rules. If a rule breaks, it shrinks the attack down to the few moves that matter and replays it.",
  steps: [
    "1. Pick a device and a rule.",
    "2. Gremlins attack its inputs.",
    "3. See where it broke, shrunk to the few moves that matter.",
  ],
  runsLabel: "How many tries",
  seedLabel: "Seed (same number, same gremlins)",
  reducing: "Reducing",
  applyFix: "Try the fixed program",
  fixTitle: "What changed in the code",
  fixRegion: "Code changes",
  sketchLine: "buggy \u2192 fixed",
  pickOne: "Pick at least one gremlin.",
  playLabel: "Play",
  pauseLabel: "Pause",
  prevEvent: "Previous event",
  nextEvent: "Next event",
  jumpBreak: "Jump to the break",
  backToStart: "Back to start",
  scrubLabel: "Replay position",
  speedLabel: "Speed",
  cursorLabel: "Cursor",
  trialRun: "One move removed",
} as const;

export const SHRINK_LABEL = "The smallest replay this reducer found.";

/** Fills {name} slots of a copy template. */
export function fill(template: string, vars: Readonly<Record<string, number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}
