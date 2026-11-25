// Copy tables and text functions of the stage page. Pure: no DOM, no clock, no randomness.
// Strings are those of docs/stage-design.md. Every number about a run comes from the run's data.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { PeripheralDiagnostic, Verdict } from "../../../engine/types";
import type { ExampleId } from "../data/examples";
import { GREMLIN_LEGEND } from "./labels";
import { distinctGremlinIds } from "./moves";
import { PINNED_CROSSWALK_FINGERPRINT } from "./speed";
import { SHRINK_LABEL, UI_COPY, fill } from "./ui-copy";
import { couldntTellLines } from "./verdict-text";

const CYCLES_PER_SECOND = 16_000_000;

/** The only verdict words the page shows. */
export const VERDICT_WORD = { broke: "BROKE", held: "HELD", couldntTell: "COULDN'T TELL" } as const;

export const HERO = {
  line1: "AI wrote your gadget's code.",
  line2: "Let gremlins break it here, before it breaks for real.",
  paragraph:
    "Hexorcist runs the real compiled program on a simulated chip, right in this page. Gremlins (simple scripted pests, not AI) poke its buttons at awkward moments. If your rule breaks, you see the few moves that did it, replayed step by step.",
  chips: ["Runs the real compiled program", "Same gremlins, same result, every time", "Runs in your browser"],
  tagline: "AI wrote your gadget's code. Let gremlins break it here, before it breaks for real.",
} as const;

export const SETUP = {
  deviceHeading: "1 \u00b7 PICK A DEVICE",
  ruleHeading: "2 \u00b7 RULE",
  gremlinHeading: "3 \u00b7 GREMLINS \u00b7 scripted pests, not AI",
  whyPrefix: "Why it matters: ",
  changeRule: "Change rule \u25be",
  limitLabel: "Time limit in ms",
  changeSetup: "Change setup \u25be",
  /** Where "Change rule" would be, for a rule that has no number to change. */
  noNumber: "This rule has no number to change.",
  runAgain: "Run again",
  summaryTail: "gremlins are scripted pests, not AI",
} as const;

/** "Why it matters" text per example. */
export const WHY: Readonly<Record<ExampleId, string>> = {
  crosswalk: "A walker could step out while cars are moving.",
  garage: "The door could keep closing on something in the doorway.",
  heartbeat: "The light blinks to show the program is running. If it freezes, the program is stuck.",
};

/** Cause line of the BROKE card, shown only for the pinned fingerprint of its example. */
export const CAUSE: Readonly<Record<ExampleId, { fingerprint: string; line: string }>> = {
  crosswalk: { fingerprint: PINNED_CROSSWALK_FINGERPRINT, line: "Two quick presses, the second one held, did it." },
  garage: {
    fingerprint: "616062947f71a1ae",
    line: "A flickering beam (blocked, cleared, blocked again within 4 ms) did it.",
  },
  heartbeat: { fingerprint: "19827a4e0a7ad440", line: "Holding the sensor on did it." },
};

/** Plain fix explanation per example, checked against the buggy and fixed sources. */
export const FIX_EXPLAIN: Readonly<Record<ExampleId, string>> = {
  crosswalk:
    "In the original program, pressing the button again during a crossing restarted the walk timer. The car lights did not wait for it, so cars got a green while the walk sign was still on. The fix removes that restart.",
  garage:
    "The original program treated several quick beam breaks as noise and kept closing. Only a single clean break made the door reverse. The fix reverses the door on any break.",
  heartbeat:
    "The original program waited for the sensor to let go, with no time limit. A stuck sensor froze it, so the light stopped blinking. The fix stops waiting after a time limit.",
};

export const STAGE_TEXT = {
  idleTitle: "Nothing has broken yet.",
  idleLine: "Press Unleash gremlins. If a rule breaks, the replay plays here.",
  shrinkTitle: "Finding the moves that matter\u2026",
  legendNeeded: "needed",
  legendTesting: "testing now",
  legendNotNeeded: "not needed",
  illustrative: "Illustrative",
  stopped: "Stopped at the break",
  bothGreen: "Both have a green!",
  storyPlaceholder: "Working out what happened\u2026",
  /** Stage line while the replay of one held try is made ready. */
  heldPending: "Getting one of the tries ready to show\u2026",
  /** Stage line when that replay could not be made. */
  heldFailed: "This try could not be replayed here.",
  /** Solid note panel after COULDN'T TELL, in place of the replay. */
  noReplay: "Nothing to replay.",
} as const;

export const CARD_TEXT = {
  couldntHeadline: "This program can't be judged here.",
  couldntFooter: "No result is better than a wrong one.",
} as const;

export const REDUCTION_TEXT = {
  smallest: SHRINK_LABEL,
  oneMove: "Take away this move and this replay no longer breaks the rule.",
  atLimit: "Shrinking stopped at its limit; fewer moves may still break it.",
  seeFix: "See the fix work \u2192",
} as const;

export const FIX_TEXT = {
  leftTitle: "Original program",
  rightTitle: "Fixed program",
  badgePrefix: "Same moves, same moment \u00b7 ",
  whatChanged: "What the fix changed",
  showCode: "Show the code change \u25be",
} as const;

export const TAB_TEXT = {
  names: ["What happened", "Signals", "The fix", "Details"],
  idle: "The story of the run shows here after you unleash the gremlins.",
  noReplayNote: "No replay: the verdict card explains why this program has no result.",
  fixNotRun: "Press See the fix work to compare.",
} as const;

export const PLAYER_TEXT = {
  play: "Play",
  pause: "Pause",
  replay: "Replay",
  speedLabel: "Speed",
  slower: "Slower",
  realSpeed: "Real speed (1x)",
} as const;

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${String(n)} ${many}`;
}

/** Tenths of a unit as "i.d". */
function tenthsText(t: number): string {
  return `${String(Math.floor(t / 10))}.${String(t % 10)}`;
}

/** Run_Length_Text: runCycles / 16,000,000 s, rounded half up to one decimal, trailing ".0" dropped. */
export function runLengthText(runCycles: number): string {
  const t = Math.floor((runCycles * 10 + CYCLES_PER_SECOND / 2) / CYCLES_PER_SECOND);
  return t % 10 === 0 ? `${String(t / 10)} s` : `${tenthsText(t)} s`;
}

/** "<M> tries \u00b7 <Run_Length_Text> of device time each" ("1 try" at M = 1). */
export function triesLine(tries: number, runCycles: number): string {
  return `${plural(tries, "try", "tries")} \u00b7 ${runLengthText(runCycles)} of device time each`;
}

/** Elapsed_Seconds: "<x> s", x = floor((ms + 50) / 100) / 10 with one decimal. */
export function elapsedSeconds(ms: number): string {
  return `${tenthsText(Math.floor((ms + 50) / 100))} s`;
}

/** "Try N of M" and the progress bar fill. N = min(runsCompleted + 1, M), 0 before a progress message. */
export function tryProgress(runsCompleted: number | null, tries: number): { n: number; text: string; fill: number } {
  const n = runsCompleted === null ? 0 : Math.min(runsCompleted + 1, tries);
  const done = runsCompleted === null ? 0 : runsCompleted;
  return { n, text: fill(UI_COPY.plainRunning, { n, m: tries }), fill: tries > 0 ? Math.min(1, done / tries) : 0 };
}

/** Plain sentence of the HELD card for the buggy build: "No gremlin broke it in M tries." ("its 1 try" at M = 1). */
export function heldPlainText(tries: number): string {
  return tries === 1 ? "No gremlin broke it in its 1 try." : `No gremlin broke it in ${String(tries)} tries.`;
}

/** Label above the scene of a held try: "Try N of M, one of the tries where the rule held". `runIndex` is zero-based. */
export function heldTryLabel(runIndex: number, tries: number): string {
  return `Try ${String(runIndex + 1)} of ${String(tries)}, one of the tries where the rule held`;
}

/** "tried <Shorter_Count> shorter versions of the attack so far" ("1 shorter version" at 1). */
export function shorterText(candidatesTried: number): string {
  const count = Math.max(0, candidatesTried - 1);
  return `tried ${plural(count, "shorter version", "shorter versions")} of the attack so far`;
}

/** "<r> million chip cycles/s on this computer", or null when the elapsed time is 0 ms. */
export function cyclesRateText(totalCycles: number, elapsedMs: number): string | null {
  if (!(elapsedMs > 0)) return null;
  // r = totalCycles / (elapsedMs / 1000) / 1,000,000, rounded half up to one decimal, in integers.
  const t = Math.floor((20 * totalCycles + 1000 * elapsedMs) / (2000 * elapsedMs));
  return `${tenthsText(t)} million chip cycles/s on this computer`;
}

/** "Broke on try N of M \u00b7 found in <Elapsed_Seconds>" with N = violatingRunIndex + 1. */
export function brokeTryLine(violatingRunIndex: number, tries: number, elapsedMs: number): string {
  return `Broke on try ${String(violatingRunIndex + 1)} of ${String(tries)} \u00b7 found in ${elapsedSeconds(elapsedMs)}`;
}

/** The cause line when the reduction ended with a result whose fingerprint is the pinned one; else null. */
export function causeLine(id: ExampleId, fingerprint: string | null): string | null {
  return fingerprint !== null && fingerprint === CAUSE[id].fingerprint ? CAUSE[id].line : null;
}

export type ReductionInput =
  | { ok: true; originalEventCount: number; reducedEventCount: number; stoppedAtBudget: boolean }
  | { ok: false; message: string };

export type ReductionCardText =
  | { error: string }
  | { summary: string; smallest: string; note: string };

/** Reduction_Card text. An error shows only its message. */
export function reductionCard(r: ReductionInput): ReductionCardText {
  if (!r.ok) return { error: r.message };
  const k = r.reducedEventCount;
  const note = r.stoppedAtBudget
    ? REDUCTION_TEXT.atLimit
    : k === 1
      ? REDUCTION_TEXT.oneMove
      : `Take away any one of these ${String(k)} moves and this replay no longer breaks the rule.`;
  return {
    summary: `${plural(r.originalEventCount, "move", "moves")} \u2192 ${String(k)} needed`,
    smallest: REDUCTION_TEXT.smallest,
    note,
  };
}

/** Heading of the Fix_View: "The same K moves, on both programs". */
export function fixHeading(k: number): string {
  return `The same ${plural(k, "move", "moves")}, on both programs`;
}

/** Fix_View badge: the prefix, then the Speed_Badge text with its initial letter in lower case. */
export function fixBadgeText(speedBadgeText: string): string {
  return FIX_TEXT.badgePrefix + speedBadgeText.charAt(0).toLowerCase() + speedBadgeText.slice(1);
}

export type FixOutcome = "none" | "target" | "other";

/** Right card sentence after the reduced replay on the fixed build ends. */
export function fixReplayText(k: number, outcome: FixOutcome): string {
  const same = `Same ${plural(k, "move", "moves")}`;
  if (outcome === "none") return `${same}: no break.`;
  return outcome === "target"
    ? `${same} still ${k === 1 ? "breaks" : "break"} the fixed program.`
    : `${same} ${k === 1 ? "breaks" : "break"} a different rule on the fixed program.`;
}

/** "Checking the fixed program: try N of M" while the Fixed_Campaign runs. */
export function fixedProgressText(runsCompleted: number | null, tries: number): string {
  return `Checking the fixed program: try ${String(tryProgress(runsCompleted, tries).n)} of ${String(tries)}`;
}

/** Right card text after the Fixed_Campaign ends: a prefix, then the lines that follow it. */
export function fixedCampaignText(
  verdict: Verdict,
  tries: number,
  violatingRunIndex: number | null,
  plainBroke: string,
): { prefix: string; lines: string[] } {
  if (verdict.verdict === "HELD") {
    return { prefix: `${VERDICT_WORD.held} \u00b7 fixed program, ${tries === 1 ? "its 1 try" : `all ${String(tries)} tries`}:`, lines: [verdict.text] };
  }
  if (verdict.verdict === "BROKE") {
    const n = (violatingRunIndex === null ? verdict.trace.runIndex : violatingRunIndex) + 1;
    return {
      prefix: `${VERDICT_WORD.broke} \u00b7 fixed program, try ${String(n)} of ${String(tries)}:`,
      lines: [plainBroke],
    };
  }
  return {
    prefix: `${VERDICT_WORD.couldntTell} \u00b7 fixed program:`,
    lines: couldntTellLines(verdict.reason).map((l) => l.text),
  };
}

export interface PeripheralUses {
  runIndex: number;
  uses: readonly PeripheralDiagnostic[];
}

/** COULDN'T TELL card: headline, one item per reason, Technical_View use lines, footer. */
export function couldntTellCard(
  reason: string,
  technical: boolean,
  peripheralUses?: PeripheralUses,
): { headline: string; reasons: string[]; uses: string[]; footer: string } {
  const uses =
    technical && peripheralUses !== undefined
      ? peripheralUses.uses.map(
          (u) => `${u.peripheral} \u00b7 ${u.register} \u00b7 cycle ${String(u.cycle)} (try ${String(peripheralUses.runIndex + 1)})`,
        )
      : [];
  return {
    headline: CARD_TEXT.couldntHeadline,
    reasons: couldntTellLines(reason).map((l) => l.text),
    uses,
    footer: CARD_TEXT.couldntFooter,
  };
}

/** One line per distinct gremlin of the list, in order of appearance: "<Name>: a gremlin that <plain text>". */
export function legendLines(list: readonly ReducerEvent[]): string[] {
  const out: string[] = [];
  for (const id of distinctGremlinIds(list)) {
    const line = GREMLIN_LEGEND[id];
    if (line !== undefined) out.push(line);
  }
  return out;
}

/** Setup_Summary: "<Device title> \u00b7 <Rule_Headline> \u00b7 <gremlin names> \u00b7 gremlins are scripted pests, not AI". */
export function setupSummary(deviceTitle: string, headline: string, gremlinNames: readonly string[]): string {
  return [deviceTitle, headline, gremlinNames.join(", "), SETUP.summaryTail].join(" \u00b7 ");
}

/** "N more need other inputs". */
export function moreNeedText(n: number): string {
  return `${String(n)} more need other inputs`;
}
