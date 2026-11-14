// Campaign_Config_Builder. Builds a whole CampaignConfig from one Rule_Set and one Fixture,
// so the Fixture given to the compiler is the Fixture the Campaign runs.
// CampaignConfig is a type-only import: this file loads no Campaign code at run time.

import type { CampaignConfig } from "../campaign";
import type { Fixture } from "../types";
import { compileRuleSet } from "./compile";

export type CampaignConfigRest = Omit<
  CampaignConfig,
  "fixture" | "checker" | "checkerSignals" | "findUntriggeredRules"
>;

export type BuildResult = { ok: true; config: CampaignConfig } | { ok: false; reasons: string[] };

/** Req 13.10, 13.11, 13.12. Never throws. */
export function buildCampaignConfig(ruleSet: unknown, fixture: Fixture, rest: CampaignConfigRest): BuildResult {
  try {
    const compiled = compileRuleSet(ruleSet, fixture);
    if (!compiled.ok) return { ok: false, reasons: compiled.reasons };
    const { checker, checkerSignals, findUntriggeredRules } = compiled.compiled;
    const config: CampaignConfig = { ...rest, fixture, checker, checkerSignals, findUntriggeredRules };
    return { ok: true, config };
  } catch {
    return { ok: false, reasons: ["Rule set: the campaign settings could not be read."] };
  }
}
