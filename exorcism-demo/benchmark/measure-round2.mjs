// Builds every round 2 sketch, keeps its HEX next to it, and measures the WALK + DONT_WALK overlap.
//   node exorcism-demo/benchmark/measure-round2.mjs
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const dir = join(root, "exorcism-demo", "benchmark", "round2");
const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
mkdirSync(join(root, "exorcism-demo", "sketch"), { recursive: true });
for (const f of readdirSync(dir).filter((n) => n.endsWith(".ino")).sort()) {
  copyFileSync(join(dir, f), join(root, "exorcism-demo", "sketch", "sketch.ino"));
  const b = spawnSync(process.execPath, [join(root, "exorcism-demo", "build.mjs")], { encoding: "utf8" });
  if (b.status !== 0) {
    console.log(`${f}: build failed`);
    continue;
  }
  const hex = join(dir, f.replace(/\.ino$/, ".hex"));
  copyFileSync(join(root, "exorcism-demo", "build", "sketch.hex"), hex);
  const m = spawnSync(process.execPath, [tsx, "--no-deprecation", join(root, "exorcism-demo", "benchmark", "overlap.ts"), hex], { encoding: "utf8", cwd: root });
  console.log(`${f}:`);
  console.log(`${m.stdout ?? ""}${m.stderr ?? ""}`.trimEnd().replace(/^/gm, "  "));
}
