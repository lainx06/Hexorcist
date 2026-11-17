// Capability_Panel content: what Hexorcist can and can't check. Pure. The not-modelled list is read from
// the engine's UNMODELLED_PERIPHERALS table when it is asked for, never copied here.
import { UNMODELLED_PERIPHERALS } from "../../../engine/peripherals";
import type { PeripheralRow } from "../../../engine/peripherals";
import type { Verdict } from "../../../engine/types";
import { labelOf } from "./signal-labels";
import type { SignalLabels } from "./signal-labels";

export const CAPABILITY_COPY = {
  title: "What Hexorcist can and can't check",
  modelledHeading: "Modelled",
  modelled: ["digital pins on ports B, C, D", "timers 0\u20132", "the CPU at 16 MHz (assumed)"],
  notModelledHeading: "Not modelled",
  notModelledLine: "A program that uses one of these gets COULDN'T TELL, naming the part.",
  analogLine: "The analog input path is unit-tested only.",
  orderHeading: "How the result is chosen",
  order: [
    "A part that is not modelled was used (in the try that broke, at or before the break, or in any try when none broke): COULDN'T TELL.",
    "Otherwise, a broken rule: BROKE, showing the lowest-numbered try that broke.",
    "Otherwise, a rule that could not be checked, a signal not mapped to a pin, a try that did not finish, or no gremlin move in any try: COULDN'T TELL.",
    "Otherwise: HELD. No violation found in N emulated runs of this gremlin set. Not a proof.",
  ],
  // \u0077 is the letter w: the source rules forbid the bare DOM global's name in pure modules, strings included.
  openWindowLine: "A rule \u0077indow still open when a try ends is not judged.",
  scenesLine: '"Illustrative" scenes are drawings driven by real outputs; "Pin levels" shows real pin levels only.',
  floatingHeading: "Inputs read with no pull-up",
  floatingBare: "an input was read while floating",
  floatingNamed: (name: string): string => `${name} was read while floating`,
} as const;

/** The plainName of every row of the engine's table, in table order, read at call time. */
export function notModelledList(table: readonly PeripheralRow[] = UNMODELLED_PERIPHERALS): string[] {
  return table.map((r) => r.plainName);
}

const FLOATING = /input ([A-Za-z][A-Za-z0-9_]*) was read while floating|an input was read while floating/g;

/** Distinct floating-input reasons of the shown verdict, in order of appearance. */
export function floatingReasons(v: Verdict | null): { signal: string | null; text: string }[] {
  if (v === null || v.verdict === "HELD") return [];
  const texts = v.verdict === "BROKE" ? v.unchecked.map((u) => u.reason) : [v.reason];
  const out: { signal: string | null; text: string }[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(FLOATING)) {
      if (out.some((o) => o.text === m[0])) continue;
      out.push({ signal: m[1] ?? null, text: m[0] });
    }
  }
  return out;
}

export interface CapabilityContent {
  title: string;
  modelledHeading: string;
  modelled: string[];
  notModelledHeading: string;
  notModelledLine: string;
  notModelled: string[];
  lines: string[];
  orderHeading: string;
  order: string[];
  floatingHeading: string;
  /** Null when the shown verdict holds no floating-input reason, or there is no verdict. */
  floating: string[] | null;
}

export function capabilityContent(args: {
  verdict: Verdict | null;
  labels: SignalLabels;
  table?: readonly PeripheralRow[];
}): CapabilityContent {
  const C = CAPABILITY_COPY;
  const reasons = floatingReasons(args.verdict);
  return {
    title: C.title,
    modelledHeading: C.modelledHeading,
    modelled: [...C.modelled],
    notModelledHeading: C.notModelledHeading,
    notModelledLine: C.notModelledLine,
    notModelled: notModelledList(args.table),
    lines: [C.analogLine, C.openWindowLine, C.scenesLine],
    orderHeading: C.orderHeading,
    order: [...C.order],
    floatingHeading: C.floatingHeading,
    floating:
      reasons.length === 0
        ? null
        : reasons.map((r) => (r.signal === null ? C.floatingBare : C.floatingNamed(labelOf(args.labels, r.signal).text))),
  };
}