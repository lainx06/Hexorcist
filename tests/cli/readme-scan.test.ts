import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const banned = new RegExp(
  `(?<![\\w-])(${[...BANNED_WORDS, "realtime"].join("|")})(?![\\w-])`,
  "i",
);

const readme = fs.readFileSync(path.join(repoDir, "README.md"), "utf8");
const start = readme.indexOf("## Headless runner");
const end = readme.indexOf("\n## ", start + 1);
const section = start === -1 ? "" : readme.slice(start, end === -1 ? undefined : end);

function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
    )
    .filter((f) => /\.(?:ts|mjs|json|md|yml)$/.test(f));
}

describe("headless runner text scan for claim words", () => {
  it("README has a Headless runner section that covers each part", () => {
    for (const part of ["--json", "hexorcist-gate", "npm run mcp", "hook-stop", "hook-guard", "HEXORCIST_ROOT"]) {
      expect(section, part).toContain(part);
    }
  });

  it("the README section holds no banned word", () => {
    section.split("\n").forEach((line, i) => {
      expect(line, `README section line ${i + 1}`).not.toMatch(banned);
    });
  });

  it("cli/, mcp/ and power/ text holds no banned word", () => {
    for (const d of ["cli", "mcp", "power"]) {
      for (const f of files(path.join(repoDir, d))) {
        fs.readFileSync(f, "utf8")
          .split(/\r?\n/)
          .forEach((line, i) => {
            expect(line, `${path.relative(repoDir, f)}:${i + 1}`).not.toMatch(banned);
          });
      }
    }
  });
});
