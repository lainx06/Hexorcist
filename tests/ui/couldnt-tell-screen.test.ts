// Feature: upload-samples, task 15.1. COULDN'T TELL screen: pin-level columns hidden, note drawn as a panel.
// There is no DOM environment in this repo (vitest runs in node), so nothing is mounted or rendered. These
// checks read the source of stage.ts, app-page.ts and app.css. They show the source is written in the required
// order and with the required rules. They do not show rendered pixels. Evidence, not proof.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const STAGE = readFileSync(resolve(ROOT, "src/ui/app/views/stage.ts"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/ui/app/views/app-page.ts"), "utf8");
const CSS = readFileSync(resolve(ROOT, "src/ui/app/app.css"), "utf8");

/** Text of `function name(...) { ... }` or `name(...) { ... }` by brace matching. */
function body(src: string, header: RegExp): string {
  const m = header.exec(src);
  if (m === null) throw new Error(`header not found: ${String(header)}`);
  const open = m[0].endsWith("{") ? m.index + m[0].length - 1 : src.indexOf("{", src.indexOf(")", m.index + m[0].length - 1));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unbalanced braces");
}

/** Declarations of the first rule whose selector line equals `selector`. */
function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`rule not found: ${selector}`);
  return CSS.slice(at, CSS.indexOf("}", at));
}

describe("COULDN'T TELL screen", () => {
  it("only the COULDN'T TELL path asks for the solid note", () => {
    expect(PAGE.match(/\{ solid: true \}/g)?.length).toBe(1);
    expect(PAGE).toMatch(/showNote\(STAGE_TEXT\.noReplay, true, \{ solid: true \}\)/);
  });

  it("showNote sets the hide flag only for a solid note, after look() has cleared it", () => {
    const b = body(STAGE, /showNote\(line, dim, opts\) \{/);
    const look = b.indexOf("look(");
    const flag = b.indexOf('toggle("is-levels-hidden", opts?.solid === true)');
    expect(look).toBeGreaterThan(-1);
    expect(flag).toBeGreaterThan(look);
  });

  it("every look() clears the hide flag, so the next run or look restores the columns", () => {
    const look = body(STAGE, /function look\(/);
    expect(look).toMatch(/toggle\("is-levels-hidden", false\)/);
  });

  it("no other stage method sets the hide flag", () => {
    const sets = STAGE.match(/is-levels-hidden", (?!false)/g) ?? [];
    expect(sets.length).toBe(1);
  });

  it("CSS hides the pin-level columns (no labels or levels) under the flag", () => {
    const r = rule(".scene-card.is-levels-hidden .pin-levels-columns");
    expect(r).toMatch(/visibility:\s*hidden/);
  });

  it("the solid note is a panel: padding, a border on the line token, the solid background", () => {
    const r = rule(".stage-overlay .stage-note-block.stage-note-block--solid");
    expect(r).toMatch(/padding:\s*var\(--s-\d\)/);
    expect(r).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(r).toMatch(/background:\s*#0E1513;/);
  });

  it("the overlay still centres the note in the stage, and the plain note block is unchanged", () => {
    const o = rule(".stage-overlay");
    expect(o).toMatch(/align-items:\s*center/);
    expect(o).toMatch(/justify-content:\s*center/);
    expect(CSS).toMatch(/\.stage-overlay \.stage-note-block \{[^}]*background: #0E1513D9;/);
  });
});
