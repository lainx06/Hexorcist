// The three bundled Examples as one bundle type. Pure: no DOM, no clock.
import type { RuleSet } from "../../../engine/rules/ir";
import type { Fixture } from "../../../engine/types";
import { CROSSWALK_TEXTS } from "./crosswalk";
import { parseExample } from "./example";
import type { ExampleMeta } from "./example";
import { loadGarageExample } from "./garage";
import { loadHeartbeat } from "./heartbeat";

export const EXAMPLE_IDS = ["crosswalk", "garage", "heartbeat"] as const;
export type ExampleId = (typeof EXAMPLE_IDS)[number];

export interface ExampleTexts {
  buggyHex: string;
  fixedHex: string;
  fixtureText: string;
  rulesText: string;
  metaText: string;
  buggySketch: string;
  fixedSketch: string;
}

export interface ExampleBundle {
  id: ExampleId;
  buggyHex: string;
  fixedHex: string;
  fixture: Fixture;
  ruleSet: RuleSet;
  sentences: string[];
  rulesText: string;
  meta: ExampleMeta;
  buggySketch: string;
  fixedSketch: string;
}

export interface FileProblem {
  file: "rules.txt" | "fixture.json" | "meta.json";
  reasons: string[];
}

export type LoadedExample =
  | { ok: true; example: ExampleBundle }
  | { ok: false; id: ExampleId; problems: FileProblem[] };

function textsFor(id: ExampleId): ExampleTexts {
  if (id === "crosswalk") return CROSSWALK_TEXTS;
  return id === "garage" ? loadGarageExample() : loadHeartbeat();
}

export function loadExample(id: ExampleId): LoadedExample {
  const t = textsFor(id);
  const p = parseExample(t.fixtureText, t.rulesText, t.metaText);
  if (!p.ok) {
    const problems: FileProblem[] = [];
    if (p.rulesReasons.length > 0) problems.push({ file: "rules.txt", reasons: p.rulesReasons });
    for (const e of p.jsonErrors) problems.push({ file: e.file, reasons: [e.message] });
    return { ok: false, id, problems };
  }
  const { fixture, ruleSet, sentences, meta } = p;
  const { buggyHex, fixedHex, rulesText, buggySketch, fixedSketch } = t;
  return {
    ok: true,
    example: { id, buggyHex, fixedHex, fixture, ruleSet, sentences, rulesText, meta, buggySketch, fixedSketch },
  };
}
