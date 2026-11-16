// Feature: bench-ui-core. Source rules for src/ui/app (Requirements 4.12 to 4.16, 25.6, 26.7,
// 26.10). Reads source text only. Evidence, not proof.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const APP = join(ROOT, "src", "ui", "app");
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const code = walk(APP).filter((f) => f.endsWith(".ts"));
const pure = code.filter((f) => /[\\/](model)[\\/]/.test(f) || /worker[\\/](host|codec|messages)\.ts$/.test(f));
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[^]*?\*\//g, "");

describe("source rules", () => {
  it("no avr8js import, no random source, no network call, no innerHTML in src/ui/app", () => {
    const bad: string[] = [];
    for (const f of code) {
      const t = strip(readFileSync(f, "utf8"));
      if (/from\s*["']avr8js/.test(t)) bad.push(`${rel(f)} avr8js`);
      if (/Math\.random|getRandomValues/.test(t)) bad.push(`${rel(f)} random`);
      if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(t)) bad.push(`${rel(f)} network`);
      if (/innerHTML/.test(t)) bad.push(`${rel(f)} innerHTML`);
      if (/createWithTestHooks/.test(t)) bad.push(`${rel(f)} test hooks`);
    }
    expect(bad).toEqual([]);
  });

  it("pure modules use no DOM, worker global or clock", () => {
    const bad: string[] = [];
    for (const f of pure) {
      const t = strip(readFileSync(f, "utf8"));
      const m = t.match(/\b(document|window|self|postMessage|navigator|performance|requestAnimationFrame|setTimeout|setInterval|Date)\b/);
      if (m !== null) bad.push(`${rel(f)} ${m[0]}`);
      if (/import\s*\(/.test(t)) bad.push(`${rel(f)} dynamic import`);
    }
    expect(pure.length).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });

  it("the worker entry has no dynamic import and the clock is read only under src/ui", () => {
    const t = strip(readFileSync(join(APP, "worker", "engine.worker.ts"), "utf8"));
    expect(/import\s*\(/.test(t)).toBe(false);
  });

  it("the spike route waits for DOMContentLoaded and loads the unchanged spike page", () => {
    const t = readFileSync(join(APP, "boot.ts"), "utf8");
    expect(t).toMatch(/"#spike"/);
    expect(t).toMatch(/import\("\.\.\/main"\)/);
    expect(t).toMatch(/dispatchEvent\(new Event\("DOMContentLoaded"\)\)/);
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script type="module" src="/src/ui/app/boot.ts"></script>');
    expect(html).toContain("<title>Hexorcist</title>");
    expect(html).toContain('<div id="app"></div>');
  });
});