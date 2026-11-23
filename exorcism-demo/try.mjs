// Checks one sketch file against the Exorcism demo device, the same way the Agent Stop hook does.
//   node exorcism-demo/try.mjs exorcism-demo/benchmark/some-ai.ino [config.json]
// Copies it to exorcism-demo/sketch/sketch.ino, builds it, then runs the check with the config
// (default exorcism-demo/check.json, the conveyor; exorcism-demo/crosswalk-check.json for the crossing).
// Exit code: 0 HELD, 1 BROKE, 2 COULDN'T TELL, 3 error, 4 the build failed. Plain Node, no dependencies.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const file = process.argv[2];
if (file === undefined || !existsSync(resolve(file))) {
  console.log("usage: node exorcism-demo/try.mjs <sketch.ino> [config.json]");
  process.exit(3);
}
mkdirSync(join(root, "exorcism-demo", "sketch"), { recursive: true });
copyFileSync(resolve(file), join(root, "exorcism-demo", "sketch", "sketch.ino"));
const b = spawnSync(process.execPath, [join(root, "exorcism-demo", "build.mjs")], { encoding: "utf8" });
if (b.status !== 0) {
  console.log(`${b.stdout ?? ""}${b.stderr ?? ""}`.trimEnd());
  process.exit(4);
}
const configPath = process.argv[3] !== undefined ? resolve(process.argv[3]) : join(root, "exorcism-demo", "check.json");
const c = JSON.parse(readFileSync(configPath, "utf8"));
const args = ["--hex", c.hex, "--pins", c.pins, "--rules", c.rules, "--gremlins", c.gremlins, "--runs", String(c.runs), "--seed", String(c.seed), "--run-ms", String(c.runMs)];
const r = spawnSync(process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), "--no-deprecation", join(root, "cli", "bin.ts"), ...args.map((a, i) => (i % 2 === 1 && i <= 5 ? join(root, a) : a))], { encoding: "utf8", cwd: root });
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
process.exit(r.status ?? 3);
