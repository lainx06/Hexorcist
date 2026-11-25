// Checks one sketch the way `npm run check` would: copy it to the work sketch, build it, run the headless CLI.
// Run with: node exorcism-demo/try.mjs <sketch.ino> <config.json>
// Plain Node, no dependencies. No clock, no random source, no network, no shell, no npm child process.
import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(here, "..");

// Same nine keys and types as parseLoopConfig in cli/input-loader.ts, same message shape.
const KEYS = [
  ["source", "string"],
  ["build", "array"],
  ["hex", "string"],
  ["pins", "string"],
  ["rules", "string"],
  ["gremlins", "string"],
  ["runs", "number"],
  ["seed", "number"],
  ["runMs", "number"],
];

/** Parse and check a Check_Config text. Returns { ok: true, config } or { ok: false, reason }. */
export function validateConfig(text) {
  let v;
  try {
    v = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return { ok: false, reason: "The loop config is not valid JSON." };
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ok: false, reason: "The loop config must be a JSON object." };
  }
  for (const [key, type] of KEYS) {
    const x = v[key];
    if (x === undefined) return { ok: false, reason: `The loop config lacks the key "${key}".` };
    const good =
      type === "array"
        ? Array.isArray(x) && x.length > 0 && x.every((s) => typeof s === "string")
        : type === "number"
          ? typeof x === "number" && Number.isInteger(x)
          : typeof x === "string";
    if (!good) {
      const want = type === "array" ? "a non-empty array of strings" : type === "number" ? "a whole number" : "a string";
      return { ok: false, reason: `The loop config key "${key}" must be ${want}.` };
    }
  }
  return {
    ok: true,
    config: {
      source: v.source,
      build: v.build,
      hex: v.hex,
      pins: v.pins,
      rules: v.rules,
      gremlins: v.gremlins,
      runs: v.runs,
      seed: v.seed,
      runMs: v.runMs,
    },
  };
}

/** Config paths are repo-relative. They become absolute against repoDir, whatever the working folder is. */
export function resolveConfigPaths(config, repoDir) {
  return {
    hex: path.resolve(repoDir, config.hex),
    pins: path.resolve(repoDir, config.pins),
    rules: path.resolve(repoDir, config.rules),
  };
}

/** Arguments for process.execPath: the tsx entry, then the CLI with the config values. */
export function buildCliArgs(config, repoDir) {
  const p = resolveConfigPaths(config, repoDir);
  return [
    path.join(repoDir, "node_modules", "tsx", "dist", "cli.mjs"),
    "--no-deprecation",
    "cli/bin.ts",
    "--hex",
    p.hex,
    "--pins",
    p.pins,
    "--rules",
    p.rules,
    "--gremlins",
    config.gremlins,
    "--runs",
    String(config.runs),
    "--seed",
    String(config.seed),
    "--run-ms",
    String(config.runMs),
    "--json",
  ];
}

function die(line) {
  process.stderr.write(`${line}\n`);
  return 3;
}

/** Returns the exit code. */
export function main(argv) {
  if (argv.length < 2) return die("Usage: node exorcism-demo/try.mjs <sketch.ino> <config.json>");
  const sketchPath = path.resolve(argv[0]);
  const configPath = path.resolve(argv[1]);

  try {
    readFileSync(sketchPath);
  } catch {
    return die(`Cannot read the sketch file "${argv[0]}".`);
  }
  let configText;
  try {
    configText = readFileSync(configPath, "utf8");
  } catch {
    return die(`Cannot read the config file "${argv[1]}".`);
  }
  const parsed = validateConfig(configText);
  if (!parsed.ok) return die(parsed.reason);
  const config = parsed.config;

  const workSketch = path.resolve(REPO_DIR, "exorcism-demo", "sketch", "sketch.ino");
  if (path.resolve(sketchPath) !== workSketch) {
    try {
      copyFileSync(sketchPath, workSketch);
    } catch {
      return die("Cannot copy the sketch to exorcism-demo/sketch/sketch.ino.");
    }
  }

  const built = spawnSync(process.execPath, [path.join(REPO_DIR, "exorcism-demo", "build.mjs")], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (built.error || built.status !== 0) {
    const text = built.error ? `The build could not be started: ${built.error.message}\n` : "";
    process.stdout.write(`${text}${built.stdout ?? ""}`);
    process.stderr.write(built.stderr ?? "");
    return 3;
  }

  const ran = spawnSync(process.execPath, buildCliArgs(config, REPO_DIR), {
    cwd: REPO_DIR,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (ran.error) return die(`The check could not be started: ${ran.error.message}`);
  process.stdout.write(ran.stdout ?? "");
  process.stderr.write(ran.stderr ?? "");
  return ran.status ?? 3;
}

const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
if (process.argv[1] !== undefined && norm(fileURLToPath(import.meta.url)) === norm(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
