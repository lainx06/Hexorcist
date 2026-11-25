import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const guardSource = path.join(repoDir, "scripts", "guard.mjs");
const temps: string[] = [];

// The guard finds its root from its own location, so run a copy inside a fake layout.
function fakeRepo(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hexorcist-guard-"));
  temps.push(dir);
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.copyFileSync(guardSource, path.join(dir, "scripts", "guard.mjs"));
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  }
  const r = spawnSync(process.execPath, [path.join(dir, "scripts", "guard.mjs")], {
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout };
}

afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("scripts/guard.mjs on cli/, mcp/ and power/", () => {
  it("reports file, line and word for a claim word, a clock call and a node:http import", () => {
    const { status, out } = fakeRepo({
      "cli/a.ts": "const a = 1;\n// this is safe\n",
      "mcp/b.mjs": "const t = Date.now();\n",
      "cli/c.ts": 'import http from "node:http";\n',
    });
    expect(status).toBe(2);
    expect(out).toContain('cli/a.ts:2: claim word "safe"');
    expect(out).toContain('mcp/b.mjs:1: nondeterministic API "Date.now"');
    expect(out).toContain('cli/c.ts:1: network module import "node:http"');
  });

  it("scans power/ text and json for claim words, and flags dgram, dns, fetch, new Date", () => {
    const { status, out } = fakeRepo({
      "power/p/README.md": "ok\nThe first step\n",
      "power/p/mcp.json": '{ "x": "secure" }\n',
      "mcp/d.ts": 'import dns from "dns";\nconst d = new Date();\nawait fetch("x");\n',
      "cli/e.ts": 'const n = require("dgram");\n',
    });
    expect(status).toBe(2);
    expect(out).toContain('power/p/README.md:2: claim word "first"');
    expect(out).toContain('power/p/mcp.json:1: claim word "secure"');
    expect(out).toContain('mcp/d.ts:1: network module import "dns"');
    expect(out).toContain("mcp/d.ts:2: nondeterministic API");
    expect(out).toContain('mcp/d.ts:3: network API "fetch("');
    expect(out).toContain('cli/e.ts:1: network module import "dgram"');
  });

  it("reports zero findings and exits 0 on a clean layout", () => {
    const { status, out } = fakeRepo({
      "cli/ok.ts": "export const x = 1;\n",
      "mcp/ok.mjs": "export const y = 2;\n",
      "power/p/README.md": "Plain text.\n",
    });
    expect(status).toBe(0);
    expect(out).toContain("0 findings");
  });
});
