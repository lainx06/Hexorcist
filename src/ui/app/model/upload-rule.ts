// The rule check of the Upload_Device: Rule_Box_Check plus the signal-not-in-the-pin-table check. Pure.
import type { RuleForm } from "../../../engine/rules/ir";
import { readRulesFile } from "../../../engine/rules/rules-file";
import { checkRuleBox, sentencePatterns } from "./rule-box";
import type { RuleBoxResult, RuleError } from "./rule-box";
import { ruleSignals } from "./rules";
import { UNMAPPED_SIGNAL_TEXT } from "./upload-copy";
import { previewFixture, validSubsetFixture } from "./pin-table";
import type { PinRow, PinTableCheck } from "./pin-table";

export type UploadRuleCheck = RuleBoxResult;

export const unmappedSignalText = UNMAPPED_SIGNAL_TEXT;

/**
 * Compile against the rows with a usable pin (D2); then, when the grammar passed, one error per distinct
 * signal that no row names, in the order the signals appear, after the compile errors.
 */
export function checkUploadRule(text: string, rows: readonly PinRow[], table: PinTableCheck): UploadRuleCheck {
  const r = checkRuleBox(text, validSubsetFixture(rows, table));
  if (text === "") return r;
  const read = readRulesFile(text);
  if (!read.ok) return r;
  const names = new Set(rows.map((row) => row.signal));
  const missing: string[] = [];
  for (const rule of read.ruleSet) {
    for (const s of ruleSignals(rule)) if (!names.has(s) && !missing.includes(s)) missing.push(s);
  }
  if (missing.length === 0) return r;
  const extra: RuleError[] = missing.map((s) => ({ line: null, position: null, text: unmappedSignalText(s) }));
  return { ok: false, errors: [...(r.ok ? [] : r.errors), ...extra] };
}

/** The five rule patterns for the table, as sentencePatterns gives them. */
export function uploadPatterns(rows: readonly PinRow[]): { form: RuleForm; sentence: string }[] {
  return sentencePatterns(previewFixture(rows));
}