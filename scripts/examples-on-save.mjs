// Runs what the examples-on-save hook ran before (build the examples, then
// `npx vitest --run tests/examples`) on any OS, and passes the exit code through.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const vitest = createRequire(import.meta.url).resolve("vitest/vitest.mjs");
const steps = [
  ["scripts/build-examples.mjs"],
  [vitest, "--run", "tests/examples"],
];

for (const args of steps) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.error) {
    console.error(r.error.message);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
}