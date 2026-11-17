// Feature: bench-ui-stage, Requirements 18.2, 18.3, 20.4. Copy scan of every string table the stage
// feature added or changed, with the Requirement 18.1 word lists. Passing runs are evidence, not proof.
// The lists are imported, never written here.
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { findGremlin } from "../../src/engine/gremlins/catalogue";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import type { Verdict } from "../../src/engine/types";
import { loadExample } from "../../src/ui/app/data/examples";
import { EXAMPLE_COPY, STORY_ENDING } from "../../src/ui/app/model/example-copy";
import { incompatibleReason } from "../../src/ui/app/model/gremlin-picker";
import { EXAMPLE_STORY_LABELS, FRIENDLY_LABELS, GREMLIN_LEGEND, PLAIN_STORY_LABELS } from "../../src/ui/app/model/labels";
import { speedBadge } from "../../src/ui/app/model/pacing";
import { LIMIT_REASON, presetHeadline } from "../../src/ui/app/model/presets";
import {
  CARD_TEXT,
  CAUSE,
  FIX_EXPLAIN,
  FIX_TEXT,
  HERO,
  PLAYER_TEXT,
  REDUCTION_TEXT,
  SETUP,
  STAGE_TEXT,
  TAB_TEXT,
  VERDICT_WORD,
  WHY,
  brokeTryLine,
  couldntTellCard,
  cyclesRateText,
  elapsedSeconds,
  fixBadgeText,
  fixHeading,
  fixReplayText,
  fixedCampaignText,
  fixedProgressText,
  legendLines,
  moreNeedText,
  reductionCard,
  runLengthText,
  setupSummary,
  shorterText,
  triesLine,
  tryProgress,
} from "../../src/ui/app/model/stage-copy";
import { stripPhrase } from "../../src/ui/app/model/strip";
import { BOARD_BRAND_NAMES, wholeWordMatches } from "../examples/examples-support";

/** Requirement 18.1 list: the engine's banned words, their hyphen-free forms, and the board brand names. */
const WORDS: readonly string[] = [
  ...BANNED_WORDS,
  ...BANNED_WORDS.filter((w) => w.includes("-")).map((w) => w.replace(/-/g, "")),
  ...BOARD_BRAND_NAMES,
  "safety",
  "safe",
  "secure",
  "guaranteed",
  "certified",
  "real-time",
  "realtime",
  "first",
  "unique",
  "shortest",
];

/** Requirement 18.3: words that must not describe a replay outside the exact phrase. */
const RANK_WORDS = ["shortest", "smallest", "minimal", "minimum", "optimal"] as const;
const SMALLEST_PHRASE = "The smallest replay this reducer found.";

/** Every nested string value with its key path. Functions are not called here; samples are listed below. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === "string") out.push([path, v]);
  else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

/** Matches as "<table>.<key>: <word>". */
function scan(table: Record<string, unknown>): { count: number; found: string[] } {
  const found: string[] = [];
  let count = 0;
  for (const [name, t] of Object.entries(table)) {
    for (const [path, s] of strings(t, name)) {
      count++;
      for (const m of wholeWordMatches(s, WORDS)) found.push(`${path}: ${m.word}`);
      // The phrase is the one place a rank word may stand; cut it out, then look for the rest.
      for (const m of wholeWordMatches(s.split(SMALLEST_PHRASE).join(""), RANK_WORDS)) found.push(`${path}: ${m.word}`);
    }
  }
  return { count, found };
}

// Sample inputs for the text functions.
const crosswalk = loadExample("crosswalk");
if (!crosswalk.ok) throw new Error("crosswalk did not load");
const fixture = crosswalk.example.fixture;
const ev = (cycle: number, signal: string, value: number): ReducerEvent =>
  ({ cycle, signal, gremlinId: "masher", value }) as unknown as ReducerEvent;
const strip: string[] = [];
for (const signal of ["REQUEST", "CLOSE", "BEAM_CLEAR", "PULSE", "OTHER"]) {
  const lists = [[ev(0, signal, 1)], [ev(0, signal, 1), ev(100, signal, 0)], [ev(0, signal, 0)]];
  for (const l of lists) for (let i = 0; i < l.length; i++) strip.push(stripPhrase(l, i, fixture));
}

const held = { verdict: "HELD", text: "No violation found in 24 emulated runs of this gremlin set. Not a proof." } as unknown as Verdict;
const broke = { verdict: "BROKE", trace: { runIndex: 3 } } as unknown as Verdict;
const couldnt = { verdict: "COULDN'T TELL", reason: "pin X is unmapped; run too short" } as unknown as Verdict;
const gremlinIds = ["masher", "bouncer", "stuck", "dropout", "spike", "drifter"];

const TABLES: Record<string, unknown> = {
  // stage-copy.ts
  VERDICT_WORD,
  HERO,
  SETUP,
  WHY,
  CAUSE,
  FIX_EXPLAIN,
  STAGE_TEXT,
  CARD_TEXT,
  REDUCTION_TEXT,
  FIX_TEXT,
  TAB_TEXT,
  PLAYER_TEXT,
  // presets.ts
  LIMIT_REASON,
  presetHeadline: [
    presetHeadline("crosswalk", 1),
    presetHeadline("garage", 20),
    presetHeadline("garage", 35),
    presetHeadline("heartbeat", 600),
    presetHeadline("heartbeat", 1200),
  ],
  // Tables changed in task 1.1.
  EXAMPLE_COPY,
  FRIENDLY_LABELS,
  EXAMPLE_STORY_LABELS,
  PLAIN_STORY_LABELS,
  GREMLIN_LEGEND,
  STORY_ENDING,
  analogReason: ["spike", "drifter", "stuck", "dropout", "masher", "bouncer"].map((id) => {
    const def = findGremlin(id);
    return def === undefined ? "" : incompatibleReason(def);
  }),
  // Outputs of the text functions.
  speedBadge: [
    { num: 1, den: 1 },
    { num: 3, den: 2 },
    { num: 4, den: 1 },
    { num: 7, den: 1 },
    { num: 50, den: 1 },
    { num: 400, den: 1 },
  ].map(speedBadge),
  fixBadgeText: [fixBadgeText(speedBadge({ num: 1, den: 1 })), fixBadgeText(speedBadge({ num: 4, den: 1 }))],
  fixHeading: [fixHeading(1), fixHeading(3)],
  fixReplayText: [1, 3].flatMap((k) => (["none", "target", "other"] as const).map((o) => fixReplayText(k, o))),
  fixedProgressText: [fixedProgressText(null, 24), fixedProgressText(3, 24)],
  fixedCampaignText: [
    fixedCampaignText(held, 24, null, "plain"),
    fixedCampaignText(broke, 24, null, "The walk sign was on while the car light was green."),
    fixedCampaignText(broke, 24, 5, "plain"),
    fixedCampaignText(couldnt, 24, null, "plain"),
  ],
  couldntTellCard: [
    couldntTellCard("pin X is unmapped; run too short", false),
    couldntTellCard("pin X is unmapped", true, {
      runIndex: 0,
      uses: [{ peripheral: "USART0", register: "UDR0", cycle: 1234, access: "write" }],
    }),
  ],
  reductionCard: [
    reductionCard({ ok: true, originalEventCount: 8, reducedEventCount: 3, stoppedAtBudget: false }),
    reductionCard({ ok: true, originalEventCount: 1, reducedEventCount: 1, stoppedAtBudget: false }),
    reductionCard({ ok: true, originalEventCount: 7, reducedEventCount: 3, stoppedAtBudget: true }),
    reductionCard({ ok: false, message: "The reducer could not run." }),
  ],
  setupSummary: [
    setupSummary("Crosswalk", EXAMPLE_COPY.crosswalk.headline, ["Masher", "Bouncer"]),
    setupSummary("Garage door", EXAMPLE_COPY.garage.headline, ["Stuck"]),
  ],
  moreNeedText: [moreNeedText(1), moreNeedText(3)],
  triesLine: [triesLine(1, 16_000_000), triesLine(24, 9_600_000), triesLine(40, 8_000_000)],
  runLengthText: [runLengthText(16_000_000), runLengthText(9_600_000)],
  tryProgress: [tryProgress(null, 24).text, tryProgress(0, 24).text, tryProgress(30, 24).text],
  shorterText: [shorterText(0), shorterText(1), shorterText(2), shorterText(40)],
  brokeTryLine: [brokeTryLine(3, 24, 870), brokeTryLine(7, 40, 2500)],
  elapsedSeconds: [elapsedSeconds(0), elapsedSeconds(870)],
  cyclesRateText: [cyclesRateText(50_000_000, 870) ?? "", cyclesRateText(1, 0) ?? ""],
  legendLines: legendLines(gremlinIds.map((g, i) => ({ cycle: i, signal: "REQUEST", gremlinId: g, value: 1 }) as unknown as ReducerEvent)),
  stripPhrase: strip,
};

describe("stage copy scan (Requirements 18.2, 18.3, 20.4)", () => {
  it("every table is present and holds at least one string", () => {
    const empty = Object.entries(TABLES)
      .filter(([, t]) => t === undefined || strings(t, "").length === 0)
      .map(([name]) => name);
    expect(empty, `missing or empty: ${empty.join(", ")}`).toEqual([]);
  });

  it("no stage table string holds a listed word, a brand name or a rank word outside the phrase", () => {
    const { count, found } = scan(TABLES);
    console.log(`[stage-copy-scan] strings scanned: ${count}; matches: ${found.length}`);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the phrase 'The smallest replay this reducer found.' is the shrink label", () => {
    expect(REDUCTION_TEXT.smallest).toBe(SMALLEST_PHRASE);
    expect(reductionCard({ ok: true, originalEventCount: 8, reducedEventCount: 3, stoppedAtBudget: false })).toMatchObject({
      smallest: SMALLEST_PHRASE,
    });
  });

  it("self-check: the scanner catches planted words, brand names and rank words, and spares the phrase", () => {
    const planted = scan({
      a: { x: "This is safe to flash." },
      b: ["A guaranteed fix", "Runs real-time", "Runs realtime"],
      c: { y: "It is the First of its kind", z: "a unique gadget" },
      d: { w: `Board: ${BOARD_BRAND_NAMES[0] as string}` },
      e: { v: "The shortest replay", u: "a minimal replay", t: "the optimal replay", s: "a minimum replay", r: "smallest" },
      f: { q: `${SMALLEST_PHRASE} It is also the smallest.` },
    });
    const keys = planted.found.map((m) => m.split(":")[0]);
    for (const k of ["a.x", "b.0", "b.1", "b.2", "c.y", "c.z", "d.w", "e.v", "e.u", "e.t", "e.s", "e.r", "f.q"]) {
      expect(keys, `not caught: ${k}`).toContain(k);
    }
    const clean = scan({ g: { p: SMALLEST_PHRASE }, h: { p: "Nothing has broken yet." } });
    expect(clean.found).toEqual([]);
  });
});
