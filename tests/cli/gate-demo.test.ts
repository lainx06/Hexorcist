import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const text = fs.readFileSync(path.join(repoDir, ".github/workflows/gate-demo.yml"), "utf8");
const job = (name: string) => {
  const m = new RegExp(`^  ${name}:\\n((?:    .*\\n|\\n)*)`, "m").exec(text);
  return m ? m[1] : "";
};

describe("gate-demo workflow", () => {
  it("triggers on push and workflow_dispatch", () => {
    expect(text).toMatch(/^on:\n {2}push:\n {2}workflow_dispatch:/m);
  });

  it("fixed job uses the local Action on the fixed build", () => {
    const fixed = job("fixed");
    expect(fixed).toContain("uses: ./");
    expect(fixed).toContain("examples/crosswalk/fixed/fixed.hex");
    expect(fixed).not.toContain("continue-on-error");
  });

  it("buggy step has continue-on-error and a later step reads both outputs", () => {
    const buggy = job("buggy");
    expect(buggy).toContain("id: gate");
    expect(buggy).toContain("continue-on-error: true");
    expect(buggy).toContain("examples/crosswalk/buggy/buggy.hex");
    expect(buggy).toMatch(/VERDICT: \$\{\{ steps\.gate\.outputs\.verdict \}\}/);
    expect(buggy).toMatch(/EXIT_CODE: \$\{\{ steps\.gate\.outputs\.exit-code \}\}/);
    expect(buggy).toContain('"$VERDICT" != "BROKE"');
    expect(buggy).toContain('"$EXIT_CODE" != "1"');
    // outputs go through env, not interpolated into the script
    const run = buggy.slice(buggy.lastIndexOf("run: |"));
    expect(run).not.toContain("${{");
  });

  it("makes no network call beyond checkout, setup-node and the Action", () => {
    expect(text).not.toMatch(/\b(curl|wget|fetch)\b/);
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(new Set(uses)).toEqual(new Set(["actions/checkout@v4", "actions/setup-node@v4", "./"]));
  });
});
