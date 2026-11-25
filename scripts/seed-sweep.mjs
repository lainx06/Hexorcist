// Seed sweep: runs the CLI for every example, build and seed, and counts false alarms and misses.
// Usage: node scripts/seed-sweep.mjs [--seeds A-B] [--jobs N] [--out file.jsonl]
// Exit 0 when finished (whatever the verdicts), 3 on a usage error.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const EXAMPLES = ["crosswalk", "garage", "heartbeat"];
const BUILDS = ["buggy", "fixed"];
const VERDICTS = ["HELD", "BROKE", "COULDN'T TELL"];

function usage(msg) {
  process.stderr.write(`seed-sweep: ${msg}\nUsage: node scripts/seed-sweep.mjs [--seeds A-B] [--jobs N] [--out file]\n`);
  process.exit(3);
}

function parseArgs(argv) {
  const opts = { from: 1, to: 100, jobs: Math.max(1, availableParallelism() - 1), out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag !== "--seeds" && flag !== "--jobs" && flag !== "--out") usage(`unknown argument "${flag}"`);
    const value = argv[++i];
    if (value === undefined) usage(`${flag} needs a value`);
    if (flag === "--seeds") {
      const m = /^(\d+)-(\d+)$/.exec(value);
      if (!m) usage(`--seeds must look like A-B, got "${value}"`);
      opts.from = Number(m[1]);
      opts.to = Number(m[2]);
      if (!Number.isSafeInteger(opts.from) || !Number.isSafeInteger(opts.to) || opts.from > opts.to) {
        usage(`--seeds needs A <= B, got "${value}"`);
      }
    } else if (flag === "--jobs") {
      if (!/^\d+$/.test(value) || Number(value) < 1) usage(`--jobs must be a whole number of 1 or more, got "${value}"`);
      opts.jobs = Number(value);
    } else {
      if (value === "") usage("--out needs a file name");
      opts.out = value;
    }
  }
  return opts;
}

function runCheck(example, build, seed) {
  const args = [tsxCli, "--no-deprecation", "cli/bin.ts", "--example", example];
  if (build === "fixed") args.push("--fixed");
  args.push("--seed", String(seed), "--json");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", () => {});
    const done = (exit) => {
      let verdict = "ERROR";
      let runs = null;
      const a = stdout.indexOf("{");
      const b = stdout.lastIndexOf("}");
      if (a >= 0 && b > a) {
        try {
          const j = JSON.parse(stdout.slice(a, b + 1));
          if (typeof j.verdict === "string") verdict = j.verdict;
          if (typeof j.runs === "number") runs = j.runs;
        } catch {}
      }
      resolve({ example, build, seed, verdict, exit: exit, runs });
    };
    child.on("error", () => done(null));
    child.on("close", (code) => done(code));
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tasks = [];
  for (const example of EXAMPLES) {
    for (const build of BUILDS) {
      for (let seed = opts.from; seed <= opts.to; seed++) tasks.push([example, build, seed]);
    }
  }
  const started = process.hrtime.bigint();
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await runCheck(...tasks[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.jobs, tasks.length) }, worker));

  if (opts.out) {
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    const lines = results.map((r) =>
      JSON.stringify({ example: r.example, build: r.build, seed: r.seed, verdict: r.verdict, exitCode: r.exit, runs: r.runs }),
    );
    writeFileSync(opts.out, lines.join("\n") + "\n");
  }

  const rows = [["example", "build", "HELD", "BROKE", "COULDN'T TELL", "other", "not as expected (seeds)"]];
  for (const example of EXAMPLES) {
    for (const build of BUILDS) {
      const rs = results.filter((r) => r.example === example && r.build === build);
      const count = (v) => rs.filter((r) => r.verdict === v).length;
      const other = rs.filter((r) => !VERDICTS.includes(r.verdict)).length;
      const want = build === "fixed" ? "HELD" : "BROKE";
      const bad = rs.filter((r) => r.verdict !== want).map((r) => `${r.seed}${VERDICTS.includes(r.verdict) ? "" : "(" + r.verdict + ")"}`);
      rows.push([example, build, ...VERDICTS.map(count).map(String), String(other), bad.length ? bad.join(" ") : "-"]);
    }
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  const fmt = (r) => r.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd();
  const out = [fmt(rows[0]), widths.map((w) => "-".repeat(w)).join("  ")];
  for (const r of rows.slice(1)) out.push(fmt(r));
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  out.push("", `seeds ${opts.from}-${opts.to}, ${tasks.length} checks, ${opts.jobs} jobs, ${seconds.toFixed(1)} s`);
  console.log(out.join("\n"));
  process.exit(0);
}

main();
