// headless-runner: the GitHub Action's Markdown summary (Requirement 5.4). Pure stepSummary() plus a
// small entry: `tsx cli/step-summary.ts <json-file> <exit-code> <stderr-file>` appends to $GITHUB_STEP_SUMMARY.
import { appendFileSync, readFileSync } from "node:fs";
import { isMain } from "./node-io";

const VERDICT_LINE: Record<string, string> = {
  BROKE: "**BROKE**: a rule broke.",
  HELD: "**HELD**",
  "COULDN'T TELL": "**COULDN'T TELL**: the program can't be judged here.",
};

export function stepSummary(jsonText: string, code: number, stderrText: string): string {
  const lines = ["## Hexorcist gate", ""];
  let j: Record<string, unknown> | null = null;
  try {
    j = jsonText.trim() === "" ? null : (JSON.parse(jsonText) as Record<string, unknown>);
  } catch {
    j = null;
  }
  if (j === null || typeof j.verdict !== "string") {
    lines.push(`No verdict (exit code ${code}).`, "");
    const why = stderrText.trim();
    if (why !== "") lines.push("```", why, "```", "");
    return `${lines.join("\n")}\n`;
  }
  const v = j.verdict;
  lines.push(VERDICT_LINE[v] ?? `**${v}**`, "");
  lines.push("| | |", "|---|---|");
  lines.push(`| Exit code | ${code} |`, `| Seed | ${String(j.seed)} |`, `| Tries | ${String(j.runs)} |`);
  if (Array.isArray(j.gremlins)) lines.push(`| Gremlins | ${j.gremlins.join(", ")} |`);
  if (v === "BROKE") {
    const vio = j.violation as { rule?: string } | undefined;
    lines.push(`| Broken rule | ${String(vio?.rule ?? "")} |`, `| Try | ${String(j.try)} of ${String(j.runs)} |`);
    lines.push(`| Moves | ${String(j.movesAfter)} of ${String(j.movesBefore)} (the smallest replay this reducer found) |`, `| Fingerprint | \`${String(j.fingerprint)}\` |`);
  } else if (v === "HELD") {
    lines.push("", String(j.text));
  } else {
    lines.push("", String(j.reason));
  }
  return `${lines.join("\n")}\n`;
}

const isEntry = isMain(import.meta.url);
if (isEntry) {
  const [jsonFile, codeText, stderrFile] = process.argv.slice(2);
  const read = (f: string | undefined): string => {
    try {
      return f === undefined ? "" : readFileSync(f, "utf8");
    } catch {
      return "";
    }
  };
  const md = stepSummary(read(jsonFile), Number(codeText ?? "3"), read(stderrFile));
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target !== undefined && target !== "") appendFileSync(target, md);
  else process.stdout.write(md);
}
