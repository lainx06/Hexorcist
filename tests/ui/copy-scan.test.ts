// Feature: bench-ui-examples. Copy scan (Requirement 20): every UI copy table, the Example texts and
// every file under src/ui/app/ checked for banned words, board brand names and "safety".
// The lists are imported, never written here. Evidence, not proof.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { CUSTOM_COPY, EXAMPLE_COPY, SPAN_SENTENCE, STORY_ENDING } from "../../src/ui/app/model/example-copy";
import { NEVER_RULE_PART } from "../../src/ui/app/model/coverage";
import { RUNS_MESSAGE, SEED_MESSAGE } from "../../src/ui/app/model/fields";
import { PICKER_TEXT } from "../../src/ui/app/model/gremlin-picker";
import { EXAMPLE_STORY_LABELS, FRIENDLY_LABELS, GREMLIN_LEGEND, PLAIN_STORY_LABELS } from "../../src/ui/app/model/labels";
import { SCENE_NOTE } from "../../src/ui/app/model/scene";
import { checkRuleBox, ruleErrorFrom } from "../../src/ui/app/model/rule-box";
import { STORY_LABELS } from "../../src/ui/app/model/story-input";
import {
  VERDICT_PLAIN,
  couldntTellHeadline,
  heldSentence,
  originalRunNote,
  reducedReplayNote,
  reductionSentence,
  storyHeading,
} from "../../src/ui/app/model/verdict-plain";
import { EMPTY_TRACE_TEXT } from "../../src/ui/app/model/verdict-text";
import { PICKER_COPY } from "../../src/ui/app/views/picker";
import { BUDGET_TEXT, MINIMALITY_TOOLTIP, SHRINK_LABEL, UI_COPY } from "../../src/ui/app/views/panels";
import { RULE_TEXT } from "../../src/ui/app/views/rule-box";
import { GARAGE_TEXT } from "../../src/ui/app/views/scene-garage";
import { HEARTBEAT_TEXT } from "../../src/ui/app/views/scene-heartbeat";
import { TIMELINE_LEGEND } from "../../src/ui/app/views/timeline";
import { CARD_COPY } from "../../src/ui/app/views/verdict-card";
import { BOARD_BRAND_NAMES, wholeWordMatches } from "../examples/examples-support";

const ROOT = resolve(__dirname, "..", "..");
const APP = join(ROOT, "src", "ui", "app");
const WORDS = [
  ...BANNED_WORDS,
  ...BANNED_WORDS.filter((w) => w.includes("-")).map((w) => w.replace(/-/g, "")),
  ...BOARD_BRAND_NAMES,
  "safety",
];
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

/** Every nested string value with its key path. */
function strings(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === "string") out.push([path, v]);
  else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) strings(x, `${path}.${k}`, out);
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function hits(label: string, text: string, words: readonly string[]): string[] {
  return wholeWordMatches(text, words).map((m) => `${label}:${m.line} ${m.word}`);
}

const TABLES: Record<string, unknown> = {
  EXAMPLE_COPY,
  CUSTOM_COPY,
  FRIENDLY_LABELS,
  EXAMPLE_STORY_LABELS,
  PLAIN_STORY_LABELS,
  GREMLIN_LEGEND,
  PICKER_TEXT,
  STORY_ENDING,
  SPAN_SENTENCE,
  VERDICT_PLAIN,
  UI_COPY,
  STORY_LABELS,
  PICKER_COPY,
  RULE_TEXT,
  CARD_COPY,
  GARAGE_TEXT,
  HEARTBEAT_TEXT,
  TIMELINE_LEGEND,
  SCENE_NOTE,
  EMPTY_TRACE_TEXT,
  RUNS_MESSAGE,
  SEED_MESSAGE,
  NEVER_RULE_PART,
  SHRINK_LABEL,
  MINIMALITY_TOOLTIP,
  BUDGET_TEXT,
  // Outputs of the text functions.
  storyHeading: storyHeading(),
  reducedReplayNote: reducedReplayNote(2, 5),
  originalRunNote: originalRunNote(7, 2),
  reductionSentence: [reductionSentence(7, 2, false), reductionSentence(7, 2, true), reductionSentence(1, 1, true)],
  heldSentence: [heldSentence("buggy", 1), heldSentence("fixed", 40)],
  couldntTellHeadline: couldntTellHeadline("pin X is unmapped"),
  ruleBoxErrors: [
    ...strings(checkRuleBox("", { pins: [] } as never), "empty").map(([, s]) => s),
    ruleErrorFrom("Line 2: No rule template matches at position 3 (counting from 0); allowed there: a, b.").text,
    ruleErrorFrom("some other reason").text,
  ],
};

describe("copy scan", () => {
  it("every table is present and holds at least one string", () => {
    const empty = Object.entries(TABLES)
      .filter(([, t]) => t === undefined || strings(t, "").length === 0)
      .map(([name]) => name);
    expect(empty, `missing or empty: ${empty.join(", ")}`).toEqual([]);
  });

  it("scans the Requirement 20.5 entry counts and texts", () => {
    expect(Object.keys(EXAMPLE_COPY)).toHaveLength(3);
    expect(Object.keys(FRIENDLY_LABELS)).toHaveLength(13);
    expect(strings(PLAIN_STORY_LABELS, "").length).toBe(24);
    expect(Object.keys(GREMLIN_LEGEND)).toHaveLength(6);
    expect(Object.values(PICKER_TEXT).map((p) => p.behaviour)).toHaveLength(6);
    expect(Object.keys(STORY_ENDING)).toHaveLength(5);
    expect(Object.keys(SPAN_SENTENCE)).toHaveLength(4);
    expect(storyHeading()).toBe("What happened, replaying only the moves that matter");
    expect(reducedReplayNote(2, 5)).toBe("(reduced replay, 2 of 5 events)");
    expect(originalRunNote(7, 2)).toBe(
      "The original run had 7 gremlin moves; the story above uses only the 2 that matter, so lengths can differ.",
    );
  });

  it("no copy table string holds a listed word, a brand name or safety", () => {
    const found: string[] = [];
    let n = 0;
    for (const [name, t] of Object.entries(TABLES)) {
      for (const [path, s] of strings(t, name)) {
        n++;
        for (const m of wholeWordMatches(s, WORDS)) found.push(`${path} ${m.word}`);
      }
    }
    console.log(`[copy-scan] table strings scanned: ${n}; matches: ${found.length}`);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("no copy table string holds an arrow", () => {
    const found = Object.entries(TABLES).flatMap(([name, t]) => strings(t, name).filter(([, s]) => s.includes("->")).map(([p]) => p));
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the Example texts hold no listed word and no brand name", () => {
    const found: string[] = [];
    for (const id of ["crosswalk", "garage", "heartbeat"]) {
      const dir = join(ROOT, "examples", id);
      const metaFile = join(dir, "meta.json");
      expect(existsSync(metaFile), `${rel(metaFile)} is missing`).toBe(true);
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as Record<string, unknown>;
      for (const field of ["title", "story", "timingNote"]) {
        expect(typeof meta[field], `${id} meta.json ${field} is not a string`).toBe("string");
        found.push(...hits(`${id} meta.json ${field}`, meta[field] as string, WORDS));
      }
      for (const p of ["rules.txt", "buggy/buggy.ino", "fixed/fixed.ino"]) {
        const f = join(dir, p);
        expect(existsSync(f), `${rel(f)} is missing`).toBe(true);
        found.push(...hits(rel(f), readFileSync(f, "utf8"), WORDS));
      }
    }
    expect(found, found.join("\n")).toEqual([]);
  });

  it("no file under src/ui/app or index.html holds the word safety", () => {
    expect(existsSync(APP), "src/ui/app is missing").toBe(true);
    const index = join(ROOT, "index.html");
    expect(existsSync(index), "index.html is missing").toBe(true);
    const files = [...walk(APP), index];
    const found = files.flatMap((f) => hits(rel(f), readFileSync(f, "utf8"), ["safety"]));
    console.log(`[copy-scan] files scanned for safety: ${files.length}; matches: ${found.length}`);
    expect(found, found.join("\n")).toEqual([]);
  });
});
