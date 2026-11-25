// Command entry. Runs only when this file is the script Node was started with.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isEntryPoint } from "./entry";
import { invocationDirOf } from "./input-loader";
import { main } from "./main";

if (isEntryPoint(import.meta.url, process.argv[1])) {
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.exitCode = main(process.argv.slice(2), {
    stdout: (t) => void process.stdout.write(t),
    stderr: (t) => void process.stderr.write(t),
    env: {
      readText: (p) => fs.readFileSync(p, "utf8"),
      invocationDir: invocationDirOf(process.env, process.cwd()),
      repoDir,
    },
  });
}
