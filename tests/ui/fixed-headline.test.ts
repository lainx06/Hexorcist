// Fixed_Card headline (upload-samples, Requirement 5). The repo has no DOM environment (vitest runs in node), so
// fix-view.ts cannot be mounted. The view and the stylesheet are checked at SOURCE level (text of fix-view.ts and
// app.css); the HELD text and the verdict words are checked by calling the real pure functions. Evidence about
// the source, not proof of how the page looks.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VERDICT_WORD, fixedCampaignText } from "../../src/ui/app/model/stage-copy";
import type { Verdict } from "../../src/engine/types";

const APP = join(resolve(__dirname, "..", ".."), "src", "ui", "app");
const strip = (t: string) => t.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const fixView = strip(readFileSync(join(APP, "views", "fix-view.ts"), "utf8"));
const css = readFileSync(join(APP, "app.css"), "utf8").replace(/\/\*[^]*?\*\//g, "");

/** The declaration bodies of every rule whose selector list is exactly `selector`. */
function rules(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    if ((m[1] as string).trim().replace(/\s+/g, " ") === selector) out.push(m[2] as string);
  }
  return out.join("\n");
}
/** The declaration bodies of every rule whose selector list contains `selector` as one of its parts. */
function rulesWith(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    const parts = (m[1] as string).split(",").map((s) => s.trim().replace(/\s+/g, " "));
    if (parts.includes(selector)) out.push(m[2] as string);
  }
  return out.join("\n");
}
/** Source of a method of the object returned by createFixView, from its name to the next method. */
function method(name: string, next: string): string {
  const a = fixView.indexOf(`${name}(`, fixView.indexOf("return {\n    root,"));
  const b = fixView.indexOf(`${next}(`, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return fixView.slice(a, b);
}
const done = method("showCampaignDone", "showCampaignError");
const begin = method("begin", "showCampaignProgress");

const held = (runs: number): Extract<Verdict, { verdict: "HELD" }> => ({
  verdict: "HELD",
  text: `No violation found in ${String(runs)} emulated ${runs === 1 ? "run" : "runs"} of this gremlin set. Not a proof.`,
  runs,
});

describe("Fixed_Card headline: verdict words (5.1)", () => {
  it("the three words are exactly HELD, BROKE and COULDN'T TELL", () => {
    expect(VERDICT_WORD.held).toBe("HELD");
    expect(VERDICT_WORD.broke).toBe("BROKE");
    expect(VERDICT_WORD.couldntTell).toBe("COULDN'T TELL");
  });

  it("showCampaignDone sets the headline text to the matching word for each verdict and shows it", () => {
    expect(done).toMatch(/verdict\.verdict === "HELD" \? VERDICT_WORD\.held/);
    expect(done).toMatch(/verdict\.verdict === "BROKE" \? VERDICT_WORD\.broke : VERDICT_WORD\.couldntTell/);
    expect(done).toMatch(/fixedHeadline\.textContent =/);
    expect(done).toMatch(/fixedHeadline\.hidden = false/);
  });

  it("the headline is larger than the campaign line text (22px against 14px)", () => {
    const head = rules(".fixed-verdict-headline");
    expect(head).toMatch(/font-size:\s*22px/);
    expect(head).toMatch(/font-weight:\s*700/);
    const line = rules(".fix-card--right .fix-campaign-line, .fix-card--right .fix-campaign-prefix, .fix-card--right .fix-progress");
    expect(line).toMatch(/font-size:\s*14px/);
    expect(22).toBeGreaterThan(14);
  });
});

describe("Fixed_Card headline: colour per verdict (5.2)", () => {
  it("HELD uses --mint, BROKE uses --coral, COULDN'T TELL uses --text-2, under the right card tone class", () => {
    expect(rules(".fix-card--held .fixed-verdict-headline")).toMatch(/color:\s*var\(--mint\)/);
    expect(rules(".fix-card--broke .fixed-verdict-headline")).toMatch(/color:\s*var\(--coral\)/);
    expect(rules(".fix-card--tell .fixed-verdict-headline")).toMatch(/color:\s*var\(--text-2\)/);
  });

  it("each colour variable is the one the verdict card gives that verdict's word", () => {
    expect(rulesWith(".verdict-card--held .verdict-word")).toMatch(/color:\s*var\(--mint\)/);
    expect(rulesWith(".verdict-card--broke .verdict-word")).toMatch(/color:\s*var\(--coral\)/);
    expect(rulesWith(".verdict-card--tell .verdict-word")).toMatch(/color:\s*var\(--text-2\)/);
  });

  it("showCampaignDone puts the matching tone class on the right card", () => {
    expect(done).toMatch(/cardTone\(verdict\.verdict === "HELD" \? "held" : verdict\.verdict === "BROKE" \? "broke" : "tell"\)/);
    expect(fixView).toMatch(/rightCard\.classList\.toggle\("fix-card--held", tone === "held"\)/);
    expect(fixView).toMatch(/rightCard\.classList\.toggle\("fix-card--broke", tone === "broke"\)/);
    expect(fixView).toMatch(/rightCard\.classList\.toggle\("fix-card--tell", tone === "tell"\)/);
  });
});

describe("Fixed_Card headline: placement (5.3)", () => {
  it("fixedHeadline is the first child of rightCard, above replayLine and campaignBox", () => {
    expect(fixView).toMatch(/const rightCard = el\("div", \{[^}]*\}, \[fixedHeadline, replayLine, campaignBox\]\)/);
  });

  it("the headline is not a child of the left card", () => {
    const left = /const leftCard = el\([^\n]*\n/.exec(fixView);
    expect(left).not.toBeNull();
    expect((left as RegExpExecArray)[0]).not.toContain("fixedHeadline");
  });
});

describe("Fixed_Card headline: HELD text (5.4)", () => {
  it("the HELD campaign line is the verdict's own text, with the real N", () => {
    for (const n of [1, 2, 24, 100]) {
      const v = held(n);
      const t = fixedCampaignText(v, n, null, "plain");
      expect(t.lines).toEqual([v.text]);
      expect(t.lines[0]).toContain(`No violation found in ${String(n)} emulated run`);
      expect(t.prefix).toBe(`HELD \u00b7 fixed program, ${n === 1 ? "its 1 try" : `all ${String(n)} tries`}:`);
    }
  });

  it("showCampaignDone renders the fixedCampaignText lines in the campaign box", () => {
    expect(done).toMatch(/fixedCampaignText\(verdict, tries, violatingRunIndex, plainBroke\)/);
    expect(done).toMatch(/t\.lines\.map\(/);
  });
});

describe("Fixed_Card headline: no verdict, no word (5.5)", () => {
  it("the headline starts hidden and empty", () => {
    expect(fixView).toMatch(/const fixedHeadline = el\("p", \{ class: "fixed-verdict-headline" \}, \[""\]\)/);
    expect(fixView).toMatch(/fixedHeadline\.hidden = true;/);
  });

  it("begin() hides and clears the headline", () => {
    expect(begin).toMatch(/fixedHeadline\.hidden = true/);
    expect(begin).toMatch(/fixedHeadline\.textContent = ""/);
  });

  it("only showCampaignDone shows the headline; progress and error paths do not touch it", () => {
    expect(method("showCampaignProgress", "showCampaignDone")).not.toContain("fixedHeadline");
    expect(method("showCampaignError", "ready")).not.toContain("fixedHeadline");
    expect(fixView.match(/fixedHeadline\.hidden = false/g)).toHaveLength(1);
  });
});
