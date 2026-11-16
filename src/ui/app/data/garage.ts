// The bundled Garage example (fixed build only), for the speed page.
import fixedHex from "../../../../examples/garage/fixed/fixed.hex?raw";
import fixtureText from "../../../../examples/garage/fixture.json?raw";
import metaText from "../../../../examples/garage/meta.json?raw";
import rulesText from "../../../../examples/garage/rules.txt?raw";
import { parseExample } from "./example";
import type { ParsedExample } from "./example";

export type LoadedGarage =
  | (Extract<ParsedExample, { ok: true }> & { fixedHex: string })
  | Extract<ParsedExample, { ok: false }>;

export function loadGarage(): LoadedGarage {
  const parsed = parseExample(fixtureText, rulesText, metaText);
  if (!parsed.ok) return parsed;
  return { ...parsed, fixedHex };
}