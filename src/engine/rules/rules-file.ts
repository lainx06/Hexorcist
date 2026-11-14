// Rules_File_Reader: text of a rules file in, Rule_Set or Reasons out. No file access.

import type { ReadResult, Rule } from "./ir";
import { MAX_RULES, readIr } from "./ir";
import { parse } from "./parse";
import { cutReason } from "./reason";
import { render } from "./render";

export const MAX_RULES_FILE_UNITS = 65_536;

function isBlankChar(c: string): boolean {
  return c === " " || c === "\t" || c === "\r" || c === "\n";
}

/** Reads a rules file: IR JSON when the first non-blank character is `{`, else one sentence per line. Never throws. */
export function readRulesFile(text: string): ReadResult {
  try {
    // Step 1: one leading byte-order mark is dropped.
    const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

    // Step 2: length limit.
    if (body.length > MAX_RULES_FILE_UNITS) {
      return { ok: false, reasons: [`The text is longer than ${MAX_RULES_FILE_UNITS} UTF-16 code units.`] };
    }

    // Step 3: IR JSON.
    let first = 0;
    while (first < body.length && isBlankChar(body.charAt(first))) first++;
    if (body.charAt(first) === "{") return readIr(body);

    // Step 4: one sentence per line.
    const lines = body.split("\n");
    const rules: Rule[] = [];
    const lineOfRule: number[] = [];
    const failures: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i] as string;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (/^[ \t]*$/.test(line)) continue;
      if (line.charAt(0) === "#") continue;
      const parsed = parse(line);
      if (parsed.ok) {
        rules.push(parsed.rule);
        lineOfRule.push(i + 1);
      } else {
        // Step 5: the line number stays when the Reason is cut.
        failures.push(cutReason(`Line ${i + 1}: ${parsed.reason}`));
      }
    }
    if (failures.length > 0) return { ok: false, reasons: failures };

    // Step 6: count and repeated sentences.
    const reasons: string[] = [];
    if (rules.length < 1 || rules.length > MAX_RULES) {
      reasons.push(`Found ${rules.length} rules; a rules file needs 1 to ${MAX_RULES}.`);
    }
    const groups = new Map<string, number[]>();
    for (let k = 0; k < rules.length; k++) {
      const r = render(rules[k]);
      if (!r.ok) continue;
      const list = groups.get(r.sentence);
      if (list) list.push(lineOfRule[k] as number);
      else groups.set(r.sentence, [lineOfRule[k] as number]);
    }
    for (const [sentence, lineNumbers] of groups) {
      if (lineNumbers.length < 2) continue;
      reasons.push(cutReason(`Lines ${lineNumbers.join(", ")} repeat the sentence "${sentence}"`));
    }
    if (reasons.length > 0) return { ok: false, reasons };
    return { ok: true, ruleSet: rules };
  } catch {
    return { ok: false, reasons: ["The text could not be read."] };
  }
}
