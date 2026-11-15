// Feature: trace-reducer. Static checks of the reducer source files. Evidence, not proof.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_MAX_STEP_CYCLES as CAMPAIGN_STEP, MAX_RUN_CYCLES as CAMPAIGN_MAX } from "../campaign";
import { DEFAULT_BUDGET, DEFAULT_MAX_STEP_CYCLES, MAX_RUN_CYCLES } from "../reducer/events";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(HERE, "..");
const DIR = resolve(ENGINE, "reducer");
const files = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const text = (f: string) => readFileSync(resolve(DIR, f), "utf8");

interface Imp {
  spec: string;
  typeOnly: boolean;
}

function importsOf(src: string): Imp[] {
  const out: Imp[] = [];
  const re = /^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) out.push({ spec: m[2], typeOnly: m[1] !== undefined });
  const dyn = /\b(?:import|require)\s*\(\s*["']([^"']+)["']/g;
  for (let m = dyn.exec(src); m !== null; m = dyn.exec(src)) out.push({ spec: m[1], typeOnly: false });
  return out;
}

function resolveTs(from: string, spec: string): string {
  const p = resolve(dirname(from), spec);
  return existsSync(p + ".ts") ? p + ".ts" : p;
}

describe("trace-reducer source files", () => {
  it("every import is a relative path into src/engine outside __tests__, with no avr8js", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const i of importsOf(text(f))) {
        expect(i.spec.startsWith("."), `${f}: ${i.spec}`).toBe(true);
        const p = resolveTs(resolve(DIR, f), i.spec).split("\\").join("/");
        expect(p.startsWith(ENGINE.split("\\").join("/") + "/"), `${f}: ${i.spec}`).toBe(true);
        expect(p.includes("/__tests__/"), `${f}: ${i.spec}`).toBe(false);
      }
      expect(/avr8js/.test(text(f)), f).toBe(false);
    }
  });

  it("no runtime import of prng, run-seed or event-list", () => {
    for (const f of files) {
      for (const i of importsOf(text(f))) {
        if (i.typeOnly) continue;
        expect(/\/(prng|run-seed|event-list)$/.test(i.spec), `${f}: ${i.spec}`).toBe(false);
      }
    }
  });

  it("the runtime import closure of core.ts reaches neither emulator-bridge.ts nor campaign.ts", () => {
    const seen = new Set<string>();
    const walk = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const i of importsOf(readFileSync(file, "utf8"))) {
        if (i.typeOnly || !i.spec.startsWith(".")) continue;
        walk(resolveTs(file, i.spec));
      }
    };
    walk(resolve(DIR, "core.ts"));
    const names = [...seen].map((p) => p.split("\\").join("/"));
    expect(names.some((p) => p.endsWith("/emulator-bridge.ts"))).toBe(false);
    expect(names.some((p) => p.endsWith("/campaign.ts"))).toBe(false);
  });

  it("no file holds the four letters h-a-s-h or a clock, random or network API", () => {
    const four = ["h", "a", "s", "h"].join("");
    for (const f of files) {
      const s = text(f);
      expect(s.toLowerCase().includes(four), f).toBe(false);
      expect(/\b(Date\.now|performance\.now|setTimeout|setInterval|Math\.random|fetch\s*\(|XMLHttpRequest|WebSocket|getRandomValues|randomUUID|randomBytes)\b|\bnew\s+Date\s*\(/.test(s), f).toBe(false);
    }
  });

  it("emulator-run.ts uses runEventList and compileRuleSet; no file calls advance( or planTarget(", () => {
    const er = text("emulator-run.ts");
    expect(er.includes("runEventList(")).toBe(true);
    expect(er.includes("compileRuleSet(")).toBe(true);
    for (const f of files) {
      expect(text(f).includes("advance("), f).toBe(false);
      expect(text(f).includes("planTarget("), f).toBe(false);
    }
  });

  it("the events.ts constants equal the campaign.ts ones, and the budget default is 300", () => {
    expect(DEFAULT_MAX_STEP_CYCLES).toBe(CAMPAIGN_STEP);
    expect(MAX_RUN_CYCLES).toBe(CAMPAIGN_MAX);
    expect(DEFAULT_BUDGET).toBe(300);
  });
});