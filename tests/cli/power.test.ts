import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const powerDir = path.join(repoDir, "power", "hexorcist");
const TRUNC = "true when the reason reached the 200-character limit, so it may have been cut";
const LOG = path.join(os.tmpdir(), "hexorcist-launcher.log");

const mcpText = fs.readFileSync(path.join(powerDir, "mcp.json"), "utf8");
const mcp = JSON.parse(mcpText);
const server = Object.values(mcp.mcpServers)[0] as { command: string; args: string[] };
const script = server.args[1];

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(path.join(dir, e.name)).map((f) => `${e.name}/${f}`)
        : [e.name],
    )
    .sort();
}

const INIT = `${JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
})}\n`;

function runLauncher(env: Record<string, string | undefined>, cwd: string) {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete merged[k];
  return spawnSync(process.execPath, ["-e", script], {
    cwd,
    env: merged,
    input: INIT,
    encoding: "utf8",
    timeout: 60000,
  });
}

describe("power/hexorcist files", () => {
  it("holds exactly the four files", () => {
    expect(listFiles(powerDir)).toEqual([
      "README.md",
      "mcp.json",
      "plugin.json",
      "skills/check-firmware/SKILL.md",
    ]);
  });

  it("mcp.json runs node -e with no npm, absolute path, plugin-root variable or launcher file", () => {
    expect(Object.keys(mcp.mcpServers)).toHaveLength(1);
    expect(server.command).toBe("node");
    expect(server.args[0]).toBe("-e");
    expect(server.args).toHaveLength(2);
    expect(mcpText).not.toMatch(/\bnpm\b/i);
    for (const arg of server.args) expect(arg).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(mcpText).not.toMatch(/(^|[\s"'=])\/[A-Za-z]/);
    expect(mcpText).not.toMatch(/PLUGIN_ROOT|\$\{|%[A-Z_]+%/);
    expect(mcpText).not.toMatch(/launch\.mjs|\.mjs["']\s*[,\]]/);
  });

  it("both manifests carry the Agent Plugins 1.0.0 $schema and the server type is stdio", () => {
    const plugin = JSON.parse(fs.readFileSync(path.join(powerDir, "plugin.json"), "utf8"));
    expect(plugin.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(mcp.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    expect((Object.values(mcp.mcpServers)[0] as { type: string }).type).toBe("stdio");
  });

  it("the inline script reads no clock or random value, makes no network call and installs nothing", () => {
    expect(script).not.toMatch(/Date|performance|setTimeout|setInterval|Math\.random|randomBytes|randomUUID/);
    expect(script).not.toMatch(/fetch|XMLHttpRequest|WebSocket|require\(['"](?:node:)?(?:https?|net|dgram|dns)['"]\)/);
    expect(script).not.toMatch(/install|\bnpm\b|\bnpx\b/i);
  });
});

describe("inline Launcher run with node -e", () => {
  it("an empty HEXORCIST_ROOT exits non-zero, logs, and prints nothing to stdout", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hex-power-"));
    try {
      const before = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
      const r = runLauncher({ HEXORCIST_ROOT: empty }, empty);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
      expect(fs.existsSync(LOG)).toBe(true);
      expect(fs.statSync(LOG).size).toBeGreaterThan(before);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("answers initialize with HEXORCIST_ROOT unset and the working folder at the repo", () => {
    const r = runLauncher({ HEXORCIST_ROOT: undefined }, repoDir);
    expect(JSON.parse(r.stdout.split("\n")[0]).id).toBe(1);
    expect(r.stdout).toContain('"result"');
  });

  it("answers initialize with HEXORCIST_ROOT at the repo and a different working folder", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "hex-power-"));
    try {
      const r = runLauncher({ HEXORCIST_ROOT: repoDir }, other);
      expect(JSON.parse(r.stdout.split("\n")[0]).id).toBe(1);
      expect(r.stdout).toContain('"result"');
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

describe("inline Launcher resolves relative paths against the repo folder", () => {
  it("a relative hex, pins and rules check from a different working folder answers HELD", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "hex-power-"));
    try {
      const call = `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "check",
          arguments: {
            hex: "examples/heartbeat/fixed/fixed.hex",
            pins: "examples/heartbeat/fixture.json",
            rules: "examples/heartbeat/rules.txt",
          },
        },
      })}\n`;
      const merged: NodeJS.ProcessEnv = { ...process.env, HEXORCIST_ROOT: repoDir };
      delete merged.INIT_CWD;
      const r = spawnSync(process.execPath, ["-e", script], {
        cwd: other,
        env: merged,
        input: INIT + call,
        encoding: "utf8",
        timeout: 120000,
      });
      const replies = r.stdout.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
      const reply = replies.find((x) => x.id === 2);
      expect(reply).toBeDefined();
      expect(reply.result.isError).not.toBe(true);
      const text: string = reply.result.content[0].text;
      expect(text).not.toContain("Cannot read the file");
      expect(text).toContain("HELD");
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  }, 150000);
});

describe("Power text", () => {
  const skill = fs.readFileSync(path.join(powerDir, "skills", "check-firmware", "SKILL.md"), "utf8");
  const readme = fs.readFileSync(path.join(powerDir, "README.md"), "utf8");

  it("SKILL.md carries the four instructions", () => {
    expect(skill).toMatch(/call `capabilities` before any other tool/i);
    expect(skill).toMatch(/five sentence forms/);
    expect(skill).toMatch(/call `check` after the rules are written/i);
    expect(skill).toContain("No violation found in N emulated runs of this gremlin set. Not a proof.");
    expect(skill).toContain("the smallest replay this reducer found");
  });

  it("README.md and SKILL.md each hold the reasonTruncated sentence", () => {
    expect(readme).toContain(TRUNC);
    expect(skill).toContain(TRUNC);
  });

  it("README.md names HEXORCIST_ROOT, both shells and the log file", () => {
    expect(readme).toContain("HEXORCIST_ROOT");
    expect(readme).toContain("PowerShell");
    expect(readme).toMatch(/POSIX/);
    expect(readme).toContain("hexorcist-launcher.log");
  });

  it("no Power file holds a banned word", () => {
    const banned = /(?<![\w-])(safe|secure|guaranteed|certified|real-time|realtime|first|unique|shortest)(?![\w-])/i;
    for (const f of listFiles(powerDir)) {
      const text = fs.readFileSync(path.join(powerDir, ...f.split("/")), "utf8");
      expect(text, f).not.toMatch(banned);
    }
  });
});
