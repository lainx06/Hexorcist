// Compiles every example sketch and keeps only its HEX. Plain Node, no dependencies.
// Run with: npm run examples:build
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const examples = join(root, "examples");
const VARIANTS = ["buggy", "fixed"];
const rel = (p) => relative(root, p).split(sep).join("/");
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

const dirs = [];
if (isDir(examples)) {
  for (const id of readdirSync(examples).filter((n) => isDir(join(examples, n))).sort()) {
    for (const variant of VARIANTS) {
      const dir = join(examples, id, variant);
      if (isDir(dir)) dirs.push({ id, variant, dir });
    }
  }
}
if (dirs.length === 0) {
  console.log("examples:build: no sketch directory found under examples/");
  process.exit(1);
}

let passed = 0;
const failed = [];
for (const { id, variant, dir } of dirs) {
  const build = join(dir, "build");
  const r = spawnSync("arduino-cli", ["compile", "-b", "arduino:avr:uno", "--output-dir", build, dir], {
    encoding: "utf8",
  });
  const built = join(build, `${variant}.ino.hex`);
  let ok = r.error === undefined && r.status === 0;
  let why = r.error ? `arduino-cli could not be started: ${r.error.message}` : `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (ok && !existsSync(built)) {
    ok = false;
    why = `compile passed but ${rel(built)} is missing`;
  }
  if (ok) copyFileSync(built, join(dir, `${variant}.hex`));
  rmSync(build, { recursive: true, force: true });
  if (ok) {
    passed++;
    console.log(`PASS ${rel(dir)}`);
  } else {
    failed.push({ id, variant });
    console.log(`FAIL ${rel(dir)}`);
    console.log(why.trimEnd());
  }
}
console.log(`examples:build: ${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  not rebuilt: ${f.id} ${f.variant}`);
process.exit(failed.length === 0 ? 0 : 1);
