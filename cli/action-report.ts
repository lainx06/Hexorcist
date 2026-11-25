// Action report step. Reads the CLI's JSON file and exit code, then writes the
// Markdown summary and the step outputs. Runs only when started as a script.
import fs from "node:fs";
import { isEntryPoint } from "./entry";

export interface ReportEnv {
  summaryPath: string | undefined;
  outputPath: string | undefined;
}

export interface ParsedRun {
  verdict: string;
  seed: number | null;
  runs: number | null;
}

/** An empty, unreadable or mistyped file reads as no verdict. */
export function parseRunJson(text: string): ParsedRun | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.verdict !== "BROKE" && o.verdict !== "HELD" && o.verdict !== "COULDN'T TELL") return null;
  return {
    verdict: o.verdict,
    seed: typeof o.seed === "number" ? o.seed : null,
    runs: typeof o.runs === "number" ? o.runs : null,
  };
}

export function buildSummary(parsed: ParsedRun | null, code: number, stderrText: string): string {
  if (parsed === null) {
    const reason = stderrText.trim() || "no reason was printed";
    return [
      "## Hexorcist gate",
      "",
      "- Verdict: none (the check did not run to a verdict)",
      `- Exit code: ${code}`,
      `- Reason: ${reason}`,
      "",
    ].join("\n");
  }
  return [
    "## Hexorcist gate",
    "",
    `- Verdict: ${parsed.verdict}`,
    `- Exit code: ${code}`,
    `- Seed: ${parsed.seed ?? "unknown"}`,
    `- Runs: ${parsed.runs ?? "unknown"}`,
    "",
  ].join("\n");
}

/** Writes summary and outputs. Returns 0 on success, 3 when the arguments are unusable. */
export function report(
  args: { jsonPath: string; code: string; errPath?: string },
  env: ReportEnv,
): number {
  const code = Number(args.code);
  if (!Number.isInteger(code) || code < 0) return 3;
  const read = (p: string | undefined): string => {
    if (p === undefined) return "";
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      return "";
    }
  };
  const parsed = code === 3 ? null : parseRunJson(read(args.jsonPath));
  const summary = buildSummary(parsed, code, read(args.errPath));
  if (env.summaryPath) fs.appendFileSync(env.summaryPath, summary + "\n");
  if (env.outputPath) {
    fs.appendFileSync(env.outputPath, `verdict=${parsed?.verdict ?? ""}\nexit-code=${code}\n`);
  }
  return 0;
}

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const [jsonPath, code, errPath] = process.argv.slice(2);
  if (jsonPath === undefined || code === undefined) {
    process.stderr.write("usage: action-report <json-file> <exit-code> [stderr-file]\n");
    process.exitCode = 3;
  } else {
    process.exitCode = report(
      { jsonPath, code, errPath },
      { summaryPath: process.env.GITHUB_STEP_SUMMARY, outputPath: process.env.GITHUB_OUTPUT },
    );
  }
}
