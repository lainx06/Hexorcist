// Parsing of bundled example files. Pure: no DOM, no clock, no file access.
import type { GremlinSpec } from "../../../engine/gremlins/catalogue";
import type { RuleSet } from "../../../engine/rules/ir";
import { render } from "../../../engine/rules/render";
import { readRulesFile } from "../../../engine/rules/rules-file";
import type { Fixture } from "../../../engine/types";

export interface ExampleMeta {
  title: string;
  story: string;
  timingNote: string;
  gremlinSet: GremlinSpec[];
  runCycles: number;
  campaignSeed: number;
  runs: number;
}

export interface JsonError {
  file: "fixture.json" | "meta.json";
  message: string;
}

export type ParsedExample =
  | { ok: true; fixture: Fixture; ruleSet: RuleSet; sentences: string[]; meta: ExampleMeta }
  | { ok: false; rulesReasons: string[]; jsonErrors: JsonError[] };

function parseJson(file: JsonError["file"], text: string, errors: JsonError[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    errors.push({ file, message: e instanceof Error ? e.message : String(e) });
    return undefined;
  }
}

export function parseExample(fixtureText: string, rulesText: string, metaText: string): ParsedExample {
  const jsonErrors: JsonError[] = [];
  const fixture = parseJson("fixture.json", fixtureText, jsonErrors) as Fixture | undefined;
  const meta = parseJson("meta.json", metaText, jsonErrors) as ExampleMeta | undefined;
  const rules = readRulesFile(rulesText);
  const rulesReasons = rules.ok ? [] : rules.reasons;
  if (!rules.ok || jsonErrors.length > 0 || fixture === undefined || meta === undefined) {
    return { ok: false, rulesReasons, jsonErrors };
  }
  const sentences = rules.ruleSet.map((r) => {
    const s = render(r);
    return s.ok ? s.sentence : s.reason;
  });
  return { ok: true, fixture, ruleSet: rules.ruleSet, sentences, meta };
}