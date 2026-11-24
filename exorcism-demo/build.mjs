// Compiles exorcism-demo/sketch/sketch.ino to exorcism-demo/build/sketch.hex. Plain Node, no dependencies.
// Run with: node exorcism-demo/build.mjs
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const demo = fileURLToPath(new URL(".", import.meta.url));
const sketchDir = join(demo, "sketch");
const sketch = join(sketchDir, "sketch.ino");
const outHex = join(demo, "build", "sketch.hex");

let work;
function fail(text) {
  if (work) rmSync(work, { recursive: true, force: true });
  console.log(String(text).trimEnd());
  process.exit(1);
}

if (!existsSync(sketch)) fail("exorcism-demo/sketch/sketch.ino is missing.");

work = mkdtempSync(join(tmpdir(), "hexorcist-demo-"));
try {
  const r = spawnSync("arduino-cli", ["compile", "-b", "arduino:avr:uno", "--output-dir", work, sketchDir], {
    encoding: "utf8",
  });
  if (r.error) fail(`arduino-cli could not be started: ${r.error.message}`);
  if (r.status !== 0) fail(`${r.stdout ?? ""}${r.stderr ?? ""}` || `arduino-cli exited with code ${r.status}.`);
  const built = join(work, "sketch.ino.hex");
  if (!existsSync(built)) fail("The compile passed but sketch.ino.hex is missing.");
  mkdirSync(join(demo, "build"), { recursive: true });
  copyFileSync(built, outHex);
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log("Built exorcism-demo/build/sketch.hex");
