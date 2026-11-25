// Feature: upload-samples (Requirement 9, plus scans of the strings and files this feature adds).
// Reads text only, so passing is evidence, not proof. The word lists are imported, never rewritten.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "../../src/engine/copy-rules";
import { STAGE_TEXT, TAB_TEXT } from "../../src/ui/app/model/stage-copy";
import { UPLOAD_COPY } from "../../src/ui/app/model/upload-copy";
import { BOARD_BRAND_NAMES, wholeWordMatches } from "../examples/examples-support";

const ROOT = resolve(__dirname, "..", "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

// ---- Index_Page parsing (no DOM library in the repo, so a small tag walker) ------------------------

const VOID = new Set(["meta", "link", "br", "hr", "img", "input", "base", "col", "area", "source", "track", "wbr"]);

interface Parsed {
  /** Tag names in document order with the stack depth at open, for every element. */
  elements: { name: string; parents: string[]; attrs: string; inner: string }[];
}

function parse(html: string): Parsed {
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<!doctype[^>]*>/i, "");
  const elements: Parsed["elements"] = [];
  const stack: { name: string; start: number; idx: number }[] = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  for (const m of text.matchAll(tag)) {
    const closing = m[1] === "/";
    const name = (m[2] as string).toLowerCase();
    const at = m.index ?? 0;
    if (closing) {
      const top = stack.pop();
      if (top !== undefined && top.name === name) {
        const e = elements[top.idx];
        if (e !== undefined) e.inner = text.slice(top.start, at);
      }
      continue;
    }
    const parents = stack.map((s) => s.name);
    elements.push({ name, parents, attrs: m[3] as string, inner: "" });
    if (!VOID.has(name) && !(m[3] as string).trimEnd().endsWith("/")) {
      stack.push({ name, start: at + m[0].length, idx: elements.length - 1 });
    }
  }
  return { elements };
}

const html = read("index.html");
const page = parse(html);
const metaDescriptions = page.elements.filter(
  (e) => e.name === "meta" && /\bname\s*=\s*["']description["']/i.test(e.attrs),
);
const noscripts = page.elements.filter((e) => e.name === "noscript");
const attr = (attrs: string, name: string): string => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  return m === null ? "" : (m[1] as string);
};
const decode = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const squash = (s: string): string => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

const metaText = metaDescriptions.length === 1 ? decode(attr((metaDescriptions[0] as { attrs: string }).attrs, "content")).replace(/\s+/g, " ") : "";
const noscriptText = noscripts.length === 1 ? squash((noscripts[0] as { inner: string }).inner) : "";
const titleEl = page.elements.find((e) => e.name === "title");
const titleText = titleEl === undefined ? "" : squash(titleEl.inner);

// ---- Banned-word matching: whole words and suffixed forms ------------------------------------------

/** Suffixed forms start at a word edge: "safely" and "security" count, as the requirement says. */
const stem = (w: string): string => {
  const base = w.replace(/-/g, "");
  if (base === "secure") return "secur";
  if (base === "guaranteed") return "guarant";
  if (base === "certified") return "certif";
  return base;
};
const BANNED_FORMS = BANNED_WORDS.flatMap((w) => [stem(w), ...(w.includes("-") ? [w] : [])]);
const suffixedRe = new RegExp(`(?<![A-Za-z0-9])(${BANNED_FORMS.map((s) => s.replace(/-/g, "-?")).join("|")})`, "gi");

function bannedHits(label: string, text: string): string[] {
  const out: string[] = [];
  for (const m of wholeWordMatches(text, BANNED_WORDS)) out.push(`${label}:${String(m.line)} whole word ${m.word}`);
  for (const m of text.matchAll(suffixedRe)) out.push(`${label} suffixed form ${m[0]}`);
  return out;
}
const brandHits = (label: string, text: string): string[] =>
  wholeWordMatches(text, BOARD_BRAND_NAMES).map((m) => `${label}:${String(m.line)} brand ${m.word}`);

const HELD_STRING = "No violation found in N emulated runs of this gremlin set. Not a proof.";

describe("Index_Page (Requirement 9)", () => {
  it("has exactly one meta description and one noscript, which is a direct child of body (9.1, 9.2)", () => {
    expect(metaDescriptions).toHaveLength(1);
    expect(noscripts).toHaveLength(1);
    const ns = noscripts[0] as { parents: string[] };
    expect(ns.parents[ns.parents.length - 1]).toBe("body");
    expect(ns.parents).toEqual(["html", "body"]);
  });

  for (const [label, get] of [
    ["meta description", () => metaText],
    ["noscript", () => noscriptText],
  ] as const) {
    it(`${label} states the chip, the seeded gremlins and the three verdicts (9.3)`, () => {
      const t = get();
      expect(t.length).toBeGreaterThan(0);
      expect(t).toMatch(/compiled program/i);
      expect(t).toContain("simulated ATmega328P chip");
      expect(t).toMatch(/seeded gremlins/i);
      expect(t).toMatch(/three (verdicts|results)/i);
    });
  }

  it("noscript names BROKE, HELD and COULDN'T TELL exactly (9.4)", () => {
    for (const v of ["BROKE", "HELD", "COULDN'T TELL"]) expect(noscriptText).toContain(v);
  });

  it("noscript holds the exact HELD string with a literal N (9.5)", () => {
    expect(noscriptText).toContain(HELD_STRING);
    expect(noscriptText).not.toMatch(/No violation found in \d/);
  });

  it("noscript states no run count, pass result or verdict for a program (9.6)", () => {
    // Run counts: a digit near "run". The only "N" allowed is the literal placeholder.
    expect(noscriptText).not.toMatch(/\d+\s+(emulated\s+)?runs?\b/i);
    expect(noscriptText).not.toMatch(/\bruns?\s+\d/i);
    expect(noscriptText).not.toMatch(/\b(passed|passes|pass result|all clear|no problems?)\b/i);
    // Verdict phrasing about a program: "your program ... BROKE", "it BROKE", "this program held" and so on.
    expect(noscriptText).not.toMatch(/\b(your|this|the)\s+(program|sketch|firmware|code)\b[^.]*\b(BROKE|HELD)\b/i);
    expect(noscriptText).not.toMatch(/\b(it|result|verdict)\s+(is|was|says)\s+(BROKE|HELD|COULDN'T TELL)\b/i);
    // Each verdict word appears only as a name (list or "HELD means:"), never after a number.
    expect(noscriptText).not.toMatch(/\d[^.]*\b(BROKE|HELD)\b/);
  });

  it("title, meta and noscript hold no banned word, whole or suffixed (9.7)", () => {
    const found = [
      ...bannedHits("title", titleText),
      ...bannedHits("meta", metaText),
      ...bannedHits("noscript", noscriptText),
      ...bannedHits("index.html", html),
    ];
    expect(found, found.join("\n")).toEqual([]);
  });

  it("title, meta and noscript hold no board brand name (9.8)", () => {
    const found = [
      ...brandHits("title", titleText),
      ...brandHits("meta", metaText),
      ...brandHits("noscript", noscriptText),
      ...brandHits("index.html", html),
    ];
    expect(found, found.join("\n")).toEqual([]);
  });

  it("the scanners flag known bad text (matcher sanity)", () => {
    expect(bannedHits("x", "It runs safely and has security").length).toBeGreaterThanOrEqual(2);
    expect(bannedHits("x", "a real-time, realtime and Unique firstly").length).toBeGreaterThanOrEqual(4);
    expect(brandHits("x", "built for an Uno").length).toBe(1);
    expect(brandHits("x", "a simulated ATmega328P chip")).toEqual([]);
  });
});

describe("New strings of upload-samples", () => {
  const strings: [string, string][] = [
    ["UPLOAD_COPY.tryChatSketch", UPLOAD_COPY.tryChatSketch],
    ["UPLOAD_COPY.tryUnjudgeable", UPLOAD_COPY.tryUnjudgeable],
    ["UPLOAD_COPY.sampleLoadError", UPLOAD_COPY.sampleLoadError],
    ["STAGE_TEXT.noReplay", STAGE_TEXT.noReplay],
    ["TAB_TEXT.noReplayNote", TAB_TEXT.noReplayNote],
    ["TAB_TEXT.idle", TAB_TEXT.idle],
  ];

  it("are all non-empty strings", () => {
    for (const [name, s] of strings) expect(s.length, name).toBeGreaterThan(0);
  });

  it("hold no banned word, whole or suffixed, and no board brand name", () => {
    const found = strings.flatMap(([name, s]) => [...bannedHits(name, s), ...brandHits(name, s)]);
    expect(found, found.join("\n")).toEqual([]);
  });
});

describe("New source files of upload-samples", () => {
  const FILES = ["src/ui/app/data/upload-samples-extra.ts"] as const;

  const FORBIDDEN: readonly [string, RegExp][] = [
    ["fetch", /(?<![A-Za-z0-9_$])fetch(?![A-Za-z0-9_$])/g],
    ["XMLHttpRequest", /(?<![A-Za-z0-9_$])XMLHttpRequest(?![A-Za-z0-9_$])/g],
    ["Date.now", /Date\.now/g],
    ["performance.now", /performance\.now/g],
    ["setTimeout", /\bsetTimeout\b/g],
    ["Math.random", /Math\.random/g],
  ];

  for (const file of FILES) {
    it(`${file} has no banned word and no board brand name`, () => {
      const t = read(file);
      // Whole words only, as the existing source scanners do: code identifiers such as "firstId" are not copy.
      const found = [
        ...wholeWordMatches(t, BANNED_WORDS).map((m) => `${file}:${String(m.line)} banned ${m.word}`),
        ...brandHits(file, t),
      ];
      expect(found, found.join("\n")).toEqual([]);
    });

    it(`${file} has no network call, clock read, timer or random source`, () => {
      const t = read(file);
      const found: string[] = [];
      for (const [name, re] of FORBIDDEN) {
        for (const m of t.matchAll(re)) found.push(`${file}: ${name} at offset ${String(m.index ?? 0)}`);
      }
      expect(found, found.join("\n")).toEqual([]);
    });
  }

  it("the forbidden-call patterns flag known samples (matcher sanity)", () => {
    const sample = 'fetch("x"); new XMLHttpRequest(); Date.now(); performance.now(); setTimeout(f); Math.random()';
    for (const [name, re] of FORBIDDEN) expect([...sample.matchAll(re)].length, name).toBe(1);
  });
});
