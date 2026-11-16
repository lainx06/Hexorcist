// The plain story sentence for a BROKE card. Pure, integer maths.
import type { ReducerEvent } from "../../../engine/reducer/types";
import type { Fixture } from "../../../engine/types";
import { friendlyLabel, PLAIN_STORY_LABELS } from "./labels";

/** Cycles to whole milliseconds at 16 MHz, rounded half up. */
export function plainMs(cycles: number): string {
  const k = Math.floor((cycles + 8000) / 16000);
  const digits = String(k);
  return `${k >= 1000 ? `${digits.slice(0, -3)},${digits.slice(-3)}` : digits} ms`;
}

type Kind = "active" | "held" | "inactive";

export function plainStory(a: {
  reducedList: readonly ReducerEvent[];
  fixture: Fixture;
  v: number;
  /** Story_Ending text, used unchanged (looked up by the caller). */
  storyEnding: string;
  /** Span_Sentence template for a span with cut false; holds "<Plain_Ms>". */
  spanSentence: string;
  span?: { lengthCycles: number; cut: boolean };
}): string {
  const list = a.reducedList;
  const g = list.filter((e) => e.gremlinId !== "rest");
  if (g.length === 0) return "No gremlin move was needed: the program broke the rule on its own.";
  const phrases = g.map((e, i) => {
    const pin = a.fixture.pins.find((p) => p.signal === e.signal);
    const press = pin !== undefined && pin.kind !== "analog" && pin.activeLevel === "high" ? 1 : 0;
    let kind: Kind = "inactive";
    if ("value" in e && e.value === press) {
      const at = list.indexOf(e);
      kind = list.some((o, j) => j > at && o.signal === e.signal && "value" in o && o.value === "release")
        ? "active"
        : "held";
    }
    const label = Object.prototype.hasOwnProperty.call(PLAIN_STORY_LABELS, e.signal) ? PLAIN_STORY_LABELS[e.signal] : undefined;
    const same = i > 0 && g[i - 1].signal === e.signal;
    if (label === undefined) return same ? "changed it" : `changed ${friendlyLabel(e.signal).text}`;
    return (same ? label.short : label.full)[kind];
  });
  const joined = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(", ")}, then ${phrases[phrases.length - 1]}`;
  const last = g[g.length - 1].cycle;
  const subject = g.every((e) => e.gremlinId === g[0].gremlinId) ? "The gremlin" : "The gremlins";
  const within = g.length >= 2 ? `, all within ${plainMs(last - Math.min(...g.map((e) => e.cycle)))}` : "";
  const out = [`${subject} ${joined}${within}.`, `${plainMs(a.v - last)} later, ${a.storyEnding}`];
  if (a.span !== undefined) {
    out.push(
      a.span.cut
        ? `It was still that way ${plainMs(a.span.lengthCycles)} later, when the replay stopped.`
        : a.spanSentence.split("<Plain_Ms>").join(plainMs(a.span.lengthCycles)),
    );
  }
  return out.join(" ");
}
