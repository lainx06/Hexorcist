// Collapsed setup (visual match pass, V6): nothing of the setup body shows or takes focus under the summary
// bar. No browser: this checks the state function the view uses, the view source and the stylesheet rules.
// Evidence, not proof of what a browser draws.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { setupBodyState } from "../../src/ui/app/model/setup-state";

const APP = join(resolve(__dirname, "..", ".."), "src", "ui", "app");
const css = readFileSync(join(APP, "app.css"), "utf8").replace(/\/\*[^]*?\*\//g, "");
const setupSource = readFileSync(join(APP, "views", "setup.ts"), "utf8");

/** Bodies of every rule whose selector list is exactly `selector`, outside media queries and inside them. */
function rules(selector: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    const sel = (m[1] as string).trim().replace(/\s+/g, " ");
    if (sel === selector) out.push(m[2] as string);
  }
  return out;
}

describe("setupBodyState", () => {
  it("closed after a run: inert, hidden from assistive tech, no Unleash row, the summary bar shows", () => {
    expect(setupBodyState(true, false)).toEqual({ closed: true, inert: true, ariaHidden: true, summaryShown: true, actionShown: false });
  });

  it("re-opened with Change setup, and before any run: open, focusable, with the Unleash row", () => {
    expect(setupBodyState(true, true)).toEqual({ closed: false, inert: false, ariaHidden: false, summaryShown: true, actionShown: true });
    expect(setupBodyState(false, false)).toEqual({ closed: false, inert: false, ariaHidden: false, summaryShown: false, actionShown: true });
  });
});

describe("collapsed setup in the view and the stylesheet", () => {
  it("the view takes inert and aria-hidden from setupBodyState", () => {
    expect(setupSource).toMatch(/setupBodyState\(collapsed, userOpen\)/);
    expect(setupSource).toMatch(/if \(s\.inert\) inner\.setAttribute\("inert", ""\)/);
    expect(setupSource).toMatch(/if \(s\.ariaHidden\) inner\.setAttribute\("aria-hidden", "true"\)/);
  });

  it("collapsed: the body row is 0fr and the clipping box is not visible", () => {
    expect(rules(".setup.is-collapsed .setup-body").join("")).toMatch(/grid-template-rows:\s*0fr/);
    expect(rules(".setup.is-collapsed .setup-inner").join("")).toMatch(/visibility:\s*hidden/);
  });

  it("the clipping box has no padding, margin or border, so a 0fr row leaves zero height", () => {
    const inner = rules(".setup-inner");
    expect(inner.length).toBeGreaterThan(0);
    for (const body of inner) {
      expect(body).toMatch(/overflow:\s*hidden/);
      expect(body).toMatch(/min-height:\s*0/);
      expect(body).not.toMatch(/\b(padding|margin|border)(-[a-z]+)?\s*:/);
    }
  });

  it("the card with the padding sits inside the clipping box", () => {
    expect(setupSource).toMatch(/el\("div", \{ class: "setup-inner" \}, \[card\]\)/);
    expect(rules(".setup-card").join("")).toMatch(/padding:/);
  });
});
