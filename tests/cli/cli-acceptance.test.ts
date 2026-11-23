// Feature: headless-runner. Acceptance 9.1 to 9.6 and the determinism task (task 3), on the real engine
// through main() with the committed HEX files. The pinned values are the page's values (the same ones
// tests/ui/examples-host.acceptance.test.ts pins for the page's worker path). Passing runs are evidence,
// not proof. If a value here disagrees with the system: report it, never edit the pinned value.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { main } from "../../cli/main";
import { nodeReader, REPO_ROOT } from "../../cli/node-io";

const T = 600_000;
const reader = nodeReader(REPO_ROOT);
const VERSION = (JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

function run(argv: string[]): { code: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const code = main(argv, { out: (t) => (stdout += t), err: (t) => (stderr += t), reader, toolVersion: VERSION });
  return { code, stdout, stderr };
}

const BROKE_WANT = {
  crosswalk: { fingerprint: "47078989121ebc1d", try: 4, runs: 24, from: 8, to: 3 },
  garage: { fingerprint: "616062947f71a1ae", try: 8, runs: 40, from: 7, to: 3 },
  heartbeat: { fingerprint: "19827a4e0a7ad440", try: 2, runs: 24, from: 2, to: 1 },
} as const;

const heldText = (n: number): string =>
  `No violation found in ${n} emulated ${n === 1 ? "run" : "runs"} of this gremlin set. Not a proof.`;

type Json = Record<string, unknown>;
const results = new Map<string, { code: number; stdout: string; stderr: string }>();

beforeAll(() => {
  for (const id of Object.keys(BROKE_WANT)) {
    results.set(`${id} buggy`, run(["--example", id, "--json"]));
    results.set(`${id} fixed`, run(["--example", id, "--fixed", "--json"]));
  }
}, T);

describe("headless-runner acceptance (Requirement 9)", () => {
  for (const [id, want] of Object.entries(BROKE_WANT)) {
    it(`9.1-9.3 ${id} buggy: exit 1, fingerprint ${want.fingerprint}, try ${want.try} of ${want.runs}, moves ${want.from} to ${want.to}`, () => {
      const r = results.get(`${id} buggy`);
      if (r === undefined) throw new Error("no result");
      expect(r.stderr, "stderr").toBe("");
      expect(r.code, "exit code").toBe(1);
      const j = JSON.parse(r.stdout) as Json;
      expect(j.verdict).toBe("BROKE");
      expect(j.fingerprint).toBe(want.fingerprint);
      expect(j.try).toBe(want.try);
      expect(j.runs).toBe(want.runs);
      expect(j.movesBefore).toBe(want.from);
      expect(j.movesAfter).toBe(want.to);
      expect((j.reducedList as unknown[]).length).toBe(want.to);
    });

    it(`9.4 ${id} fixed: exit 0 and the exact HELD text`, () => {
      const r = results.get(`${id} fixed`);
      if (r === undefined) throw new Error("no result");
      expect(r.code, "exit code").toBe(0);
      const j = JSON.parse(r.stdout) as Json;
      expect(j.verdict).toBe("HELD");
      expect(j.n).toBe(want.runs);
      expect(j.text).toBe(heldText(want.runs));
    });
  }

  it("9.4 the plain summary prints the exact HELD text", { timeout: T }, () => {
    const r = run(["--example", "heartbeat", "--fixed"]);
    expect(r.code).toBe(0);
    expect(r.stdout.split("\n")).toContain(heldText(24));
  });

  it("9.5 serial_hello: exit 2, the reason names the serial port", { timeout: T }, () => {
    const rules = resolve(REPO_ROOT, "tests/cli/serial-rule.txt");
    const r = run([
      "--hex", "fixtures/serial_hello/build/serial_hello.ino.hex",
      "--pins", "fixtures/serial_hello/pins-with-button.json",
      "--rules", rules,
      "--gremlins", "masher",
      "--runs", "8",
      "--json",
    ]);
    expect(r.code, r.stderr).toBe(2);
    const j = JSON.parse(r.stdout) as Json;
    expect(j.verdict).toBe("COULDN'T TELL");
    expect(String(j.reason)).toContain("serial port");
    expect(j.peripherals).toEqual(["USART0"]);
    expect(j.rules).toEqual(["LED is 1 must never last 500 ms or longer."]);
  });

  it("9.6 / task 3: the same inputs give byte-identical JSON with no path, time or host in it", { timeout: T }, () => {
    const a = results.get("crosswalk buggy");
    if (a === undefined) throw new Error("no result");
    const b = run(["--example", "crosswalk", "--json"]);
    expect(b.stdout).toBe(a.stdout);
    for (const out of [...results.values()].map((r) => r.stdout)) {
      expect(out.includes("\r")).toBe(false);
      expect(out.charCodeAt(0)).not.toBe(0xfeff);
      expect(out.endsWith("}\n")).toBe(true);
      expect(out).not.toContain(REPO_ROOT);
      expect(out).not.toMatch(/[A-Za-z]:\\|\/home\/|\/Users\/|\d{4}-\d{2}-\d{2}T\d{2}:/);
    }
  });

  it("task 3: the CLI is wired as `npm run check` and `npm run mcp`, with no dependency change", () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts.check).toBe("tsx --no-deprecation cli/bin.ts");
    expect(pkg.scripts.mcp).toBe("tsx --no-deprecation mcp/bin.ts");
  });
});
