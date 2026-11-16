// The bundled Garage example, imported as text at build time.
import buggyHex from "../../../../examples/garage/buggy/buggy.hex?raw";
import buggySketch from "../../../../examples/garage/buggy/buggy.ino?raw";
import fixedHex from "../../../../examples/garage/fixed/fixed.hex?raw";
import fixedSketch from "../../../../examples/garage/fixed/fixed.ino?raw";
import fixtureText from "../../../../examples/garage/fixture.json?raw";
import metaText from "../../../../examples/garage/meta.json?raw";
import rulesText from "../../../../examples/garage/rules.txt?raw";
import { parseExample } from "./example";
import type { ParsedExample } from "./example";
import type { ExampleTexts } from "./examples";

export type LoadedGarage =
  | (Extract<ParsedExample, { ok: true }> & { fixedHex: string })
  | Extract<ParsedExample, { ok: false }>;

export function loadGarage(): LoadedGarage {
  const parsed = parseExample(fixtureText, rulesText, metaText);
  if (!parsed.ok) return parsed;
  return { ...parsed, fixedHex };
}

export function loadGarageExample(): ExampleTexts {
  return { buggyHex, fixedHex, fixtureText, rulesText, metaText, buggySketch, fixedSketch };
}
