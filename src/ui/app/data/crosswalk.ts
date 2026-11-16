// The bundled Crosswalk example, imported as text at build time (no request at run time).
import buggyHex from "../../../../examples/crosswalk/buggy/buggy.hex?raw";
import buggySketch from "../../../../examples/crosswalk/buggy/buggy.ino?raw";
import fixedHex from "../../../../examples/crosswalk/fixed/fixed.hex?raw";
import fixedSketch from "../../../../examples/crosswalk/fixed/fixed.ino?raw";
import fixtureText from "../../../../examples/crosswalk/fixture.json?raw";
import metaText from "../../../../examples/crosswalk/meta.json?raw";
import rulesText from "../../../../examples/crosswalk/rules.txt?raw";
import { parseExample } from "./example";
import type { ParsedExample } from "./example";

export const CROSSWALK_TEXTS = {
  buggyHex,
  fixedHex,
  fixtureText,
  rulesText,
  metaText,
  buggySketch,
  fixedSketch,
} as const;

export type LoadedCrosswalk =
  | (Extract<ParsedExample, { ok: true }> & {
      buggyHex: string;
      fixedHex: string;
      buggySketch: string;
      fixedSketch: string;
    })
  | Extract<ParsedExample, { ok: false }>;

export function loadCrosswalk(): LoadedCrosswalk {
  const parsed = parseExample(fixtureText, rulesText, metaText);
  if (!parsed.ok) return parsed;
  return { ...parsed, buggyHex, fixedHex, buggySketch, fixedSketch };
}