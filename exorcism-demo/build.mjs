// Builds exorcism-demo/sketch/sketch.ino into exorcism-demo/build/sketch.hex for an ATmega328P at 16 MHz.
// Plain Node, no dependencies. Uses the same compiler command as scripts/build-examples.mjs.
// Prints one line on success; on failure prints the compiler's output and exits 1.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const sketch = join(root, "exorcism-demo", "sketch");
const outDir = join(root, "exorcism-demo", "build");
const tmp = join(outDir, "tmp");
if (!existsSync(join(sketch, "sketch.ino"))) {
  console.log("build: exorcism-demo/sketch/sketch.ino is missing");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const r = spawnSync("arduino-cli", ["compile", "-b", "arduino:avr:uno", "--output-dir", tmp, sketch], { encoding: "utf8" });
const built = join(tmp, "sketch.ino.hex");
if (r.error !== undefined || r.status !== 0 || !existsSync(built)) {
  console.log(r.error ? `build: the compiler could not be started: ${r.error.message}` : `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd());
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
copyFileSync(built, join(outDir, "sketch.hex"));
rmSync(tmp, { recursive: true, force: true });
console.log("build: exorcism-demo/build/sketch.hex");
