// Failure_Story: 2 to 4 short plain sentences about the smallest replay this reducer found.
// Every number comes from the trace: times are Ms_Text of cycle counts (cycles / 16,000, 1 decimal).
// Pure: the same input always gives the same text. No wall clock, no random source.

import type { Violation } from "../checker";
import { BANNED_WORDS } from "../copy-rules";
import type { Fixture, OutputEvent } from "../types";
import { checkEventList, isAnalogEvent, isRest, pinOf, pressValue } from "./events";
import { fingerprintEdgeProblem } from "./fingerprint";
import { invalidInput } from "./reducer-error";
import type { ReducerError, ReducerEvent } from "./types";

export interface StoryInput {
  reducedList: readonly ReducerEvent[];
  fixture: Fixture;
  violation: Violation;
  outputEdges: readonly OutputEvent[];
  violationSpan?: { lengthCycles: number; cut: boolean };
  /** Optional plain action words per digital signal. */
  labels?: Readonly<Record<string, StoryLabel>>;
}

/**
 * Story words for a digital signal: `active` for a press, `inactive` for a release or the other
 * level, and optional `held` for a press with no later release (default "<active> and held").
 */
export interface StoryLabel {
  active: string;
  inactive: string;
  held?: string;
}

const MAX_WORDS = 30;
const OPENING = "In the smallest replay this reducer found, ";
const NO_EVENT = "In the smallest replay this reducer found, no gremlin event was needed.";
const NOT_FIT = "the story does not fit in 4 sentences of at most 30 words";

/** Ms_Text: t = floor((c + 800) / 1600), written t/10 "." t%10 " ms". Precondition: integer 0 .. 2^53 - 1. */
export function msText(cycles: number): string {
  const t = (BigInt(cycles) + 800n) / 1600n;
  return `${t / 10n}.${t % 10n} ms`;
}

/** Cycle_Text: base-10 digits with an ASCII comma between groups of 3 from the right. No locale. */
export function cycleText(cycles: number): string {
  const digits = String(cycles);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BANNED_RES: readonly RegExp[] = BANNED_WORDS.map(
  (w) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(w)}(?![A-Za-z0-9_-])`, "i"),
);

function holdsBannedWord(text: string): boolean {
  return BANNED_RES.some((re) => re.test(text));
}

const SMALLEST_RE = /(?<![A-Za-z0-9_-])smallest(?![A-Za-z0-9_-])/i;

const LINE_BREAK = /[\n\r\u2028\u2029]/;

function badName(s: string): boolean {
  return s.length === 0 || LINE_BREAK.test(s) || s !== s.trim() || s.startsWith(" ") || s.endsWith(" ");
}

function words(sentence: string): number {
  return sentence.split(" ").length;
}

function joinList(items: readonly string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Greedy packing of phrases into sentences; null when a phrase does not fit an empty sentence. */
function pack(phrases: readonly string[], continuation: string): string[] | null {
  const sentences: string[] = [];
  let current: string[] = [];
  const build = (items: string[], first: boolean): string => (first ? OPENING : continuation) + joinList(items) + ".";
  for (const p of phrases) {
    const first = sentences.length === 0;
    if (current.length > 0 && words(build([...current, p], first)) <= MAX_WORDS) {
      current.push(p);
      continue;
    }
    if (current.length > 0) {
      sentences.push(build(current, first));
      current = [];
    }
    if (words(build([p], sentences.length === 0)) > MAX_WORDS) return null;
    current = [p];
  }
  if (current.length > 0) sentences.push(build(current, sentences.length === 0));
  return sentences;
}

/**
 * Detailed_Form phrase. `held`: a press with no later "release" of the same signal in the list.
 * `label`: the Story_Label of the signal, if any; analog events never use one.
 */
function eventPhrase(e: ReducerEvent, fixture: Fixture, held: boolean, label: StoryLabel | undefined): string {
  const t = msText(e.cycle);
  if (isAnalogEvent(e)) return `${e.gremlinId} set ${e.signal} to ${e.analog} at ${t}`;
  const v = (e as { value: 0 | 1 | "release" }).value;
  if (v === "release") return label ? `${e.gremlinId} ${label.inactive} at ${t}` : `${e.gremlinId} released ${e.signal} at ${t}`;
  const pin = pinOf(fixture, e.signal);
  if (pin !== undefined && v === pressValue(pin)) {
    if (label) {
      if (!held) return `${e.gremlinId} ${label.active} at ${t}`;
      return label.held !== undefined ? `${e.gremlinId} ${label.held} at ${t}` : `${e.gremlinId} ${label.active} and held at ${t}`;
    }
    return held ? `${e.gremlinId} pressed and held ${e.signal} at ${t}` : `${e.gremlinId} pressed ${e.signal} at ${t}`;
  }
  return label ? `${e.gremlinId} ${label.inactive} at ${t}` : `${e.gremlinId} drove ${e.signal} to ${v} at ${t}`;
}

/** True when event i is a press of its pin and no later event in the list releases the same signal. */
function isHeldPress(list: readonly ReducerEvent[], i: number, fixture: Fixture): boolean {
  const e = list[i];
  if (isAnalogEvent(e)) return false;
  const pin = pinOf(fixture, e.signal);
  if (pin === undefined || (e as { value: unknown }).value !== pressValue(pin)) return false;
  for (let j = i + 1; j < list.length; j++) {
    const x = list[j];
    if (x.signal === e.signal && !isAnalogEvent(x) && (x as { value: unknown }).value === "release") return false;
  }
  return true;
}

function summaryPhrases(events: readonly ReducerEvent[]): string[] {
  const order: string[] = [];
  const groups = new Map<string, ReducerEvent[]>();
  for (const e of events) {
    const key = JSON.stringify([e.gremlinId, e.signal]);
    const g = groups.get(key);
    if (g === undefined) {
      groups.set(key, [e]);
      order.push(key);
    } else g.push(e);
  }
  return order.map((key) => {
    const g = groups.get(key) as ReducerEvent[];
    const a = g[0];
    if (g.length === 1) return `${a.gremlinId} acted on ${a.signal} 1 time at ${msText(a.cycle)}`;
    const z = g[g.length - 1];
    return `${a.gremlinId} acted on ${a.signal} ${g.length} times from ${msText(a.cycle)} to ${msText(z.cycle)}`;
  });
}

function read(o: object, name: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: (o as Record<string, unknown>)[name] };
  } catch {
    return { ok: false };
  }
}

/** The Failure_Story text, or a Reducer_Error of kind invalid-input. Never throws. */
export function failureStory(input: unknown): string | ReducerError {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return invalidInput("Field input: must be an object.", { field: "input" });
    }
    const fx = read(input, "fixture");
    let fixture: Fixture;
    try {
      const f = fx.ok ? fx.value : undefined;
      if (typeof f !== "object" || f === null || !Array.isArray((f as Fixture).pins)) throw new Error("bad");
      fixture = structuredClone(f as Fixture);
    } catch {
      return invalidInput("Field fixture: must be an object with a pins array.", { field: "fixture" });
    }
    const rl = read(input, "reducedList");
    if (!rl.ok || !Array.isArray(rl.value)) return invalidInput("Field reducedList: must be an array.", { field: "reducedList" });
    const bad = checkEventList(rl.value as unknown[], fixture, { runCycles: null });
    if (bad !== null) return invalidInput(bad.message, { field: bad.field, index: bad.index });
    const list = (rl.value as ReducerEvent[]).map((e) => ({ ...e }));

    const vi = read(input, "violation");
    let rule: string;
    let vcycle: number;
    try {
      const v = vi.ok ? vi.value : undefined;
      if (typeof v !== "object" || v === null) throw new Error("bad");
      const r = (v as { rule?: unknown }).rule;
      const c = (v as { cycle?: unknown }).cycle;
      if (typeof r !== "string" || r.length === 0 || !r.endsWith(".") || LINE_BREAK.test(r)) throw new Error("bad");
      if (typeof c !== "number" || !Number.isSafeInteger(c) || c < 0) throw new Error("bad");
      rule = r;
      vcycle = c;
    } catch {
      return invalidInput(
        "Field violation: must be an object with a one-line rule sentence ending in a period and an integer cycle of at least 0.",
        { field: "violation" },
      );
    }

    const oe = read(input, "outputEdges");
    const edgeBad = fingerprintEdgeProblem(oe.ok ? oe.value : undefined);
    if (edgeBad !== null) {
      return invalidInput(
        edgeBad.index === null ? "Field outputEdges: the input is not a list." : `Field outputEdges: ${edgeBad.message}`,
        edgeBad.index === null ? { field: "outputEdges" } : { field: "outputEdges", index: edgeBad.index },
      );
    }

    const sp = read(input, "violationSpan");
    let span: { lengthCycles: number; cut: boolean } | null = null;
    try {
      if (!sp.ok) throw new Error("bad");
      if (sp.value !== undefined) {
        const s = sp.value;
        if (typeof s !== "object" || s === null) throw new Error("bad");
        const len = (s as { lengthCycles?: unknown }).lengthCycles;
        const cut = (s as { cut?: unknown }).cut;
        if (typeof len !== "number" || !Number.isSafeInteger(len) || len < 0 || typeof cut !== "boolean") throw new Error("bad");
        span = { lengthCycles: len, cut };
      }
    } catch {
      return invalidInput("Field violationSpan: must be absent or an object with an integer lengthCycles and a boolean cut.", {
        field: "violationSpan",
      });
    }

    const lb = read(input, "labels");
    const labels = new Map<string, StoryLabel>();
    const badLabels = invalidInput(
      "Field labels: must be absent or an object whose entries hold one-line active and inactive texts, and an optional held text, with no leading or trailing space.",
      { field: "labels" },
    );
    try {
      if (!lb.ok) return badLabels;
      if (lb.value !== undefined) {
        const o = lb.value;
        if (typeof o !== "object" || o === null || Array.isArray(o)) return badLabels;
        for (const key of Object.keys(o)) {
          const entry = (o as Record<string, unknown>)[key];
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return badLabels;
          const active = (entry as { active?: unknown }).active;
          const inactive = (entry as { inactive?: unknown }).inactive;
          const heldText = (entry as { held?: unknown }).held;
          if (typeof active !== "string" || typeof inactive !== "string") return badLabels;
          if (heldText !== undefined && typeof heldText !== "string") return badLabels;
          const texts = heldText === undefined ? [active, inactive] : [active, inactive, heldText];
          if (texts.some(badName)) return badLabels;
          for (const text of texts) {
            if (holdsBannedWord(text) || SMALLEST_RE.test(text)) {
              return invalidInput("Field labels: a label holds a word the story may not use.", { field: "labels" });
            }
          }
          labels.set(key, heldText === undefined ? { active, inactive } : { active, inactive, held: heldText });
        }
      }
    } catch {
      return badLabels;
    }

    const gremlins = list.filter((e) => !isRest(e));
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (isRest(e)) continue;
      if (badName(e.gremlinId)) {
        return invalidInput(`Event ${i}: field gremlinId must be one line with no leading or trailing space.`, { field: "gremlinId", index: i });
      }
      if (badName(e.signal)) {
        return invalidInput(`Event ${i}: field signal must be one line with no leading or trailing space.`, { field: "signal", index: i });
      }
      if (holdsBannedWord(e.gremlinId)) {
        return invalidInput(`Event ${i}: field gremlinId holds a word the story may not use.`, { field: "gremlinId", index: i });
      }
      if (holdsBannedWord(e.signal)) {
        return invalidInput(`Event ${i}: field signal holds a word the story may not use.`, { field: "signal", index: i });
      }
    }
    if (holdsBannedWord(rule)) {
      return invalidInput("Field violation: the rule holds a word the story may not use.", { field: "violation" });
    }

    const maxEventSentences = span === null ? 3 : 2;
    let eventSentences: string[] | null;
    if (gremlins.length === 0) {
      eventSentences = [NO_EVENT];
    } else {
      const phrases: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (isRest(e)) continue;
        phrases.push(eventPhrase(e, fixture, isHeldPress(list, i, fixture), labels.get(e.signal)));
      }
      eventSentences = pack(phrases, "Then ");
      if (eventSentences === null || eventSentences.length > maxEventSentences) {
        eventSentences = pack(summaryPhrases(gremlins), "Also, ");
        if (eventSentences === null || eventSentences.length > maxEventSentences) {
          return invalidInput(`Field reducedList: ${NOT_FIT}.`, { field: "reducedList" });
        }
      }
    }
    const out = [...eventSentences, `At ${msText(vcycle)} (cycle ${cycleText(vcycle)}), the program broke this rule: ${rule}`];
    if (span !== null) {
      out.push(`The violation lasted ${span.cut ? "at least " : ""}${msText(span.lengthCycles)}.`);
    }
    return out.join(" ");
  } catch {
    return invalidInput("Field input: the input could not be read.", { field: "input" });
  }
}