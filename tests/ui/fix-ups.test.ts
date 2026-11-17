// Fix-ups after the visual match pass (F1 to F8). No browser: these read the source text and the stylesheet,
// and call the few pure functions. Evidence about the source, not proof of how the page looks.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fixPanelScroll } from "../../src/ui/app/model/fix-view";
import { FIX_TEXT, SETUP, TAB_TEXT } from "../../src/ui/app/model/stage-copy";

const APP = join(resolve(__dirname, "..", ".."), "src", "ui", "app");
const read = (...p: string[]) => readFileSync(join(APP, ...p), "utf8");
const strip = (t: string) => t.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const fixView = strip(read("views", "fix-view.ts"));
const tabs = strip(read("views", "tabs.ts"));
const appPage = strip(read("views", "app-page.ts"));
const setup = strip(read("views", "setup.ts"));
const ruleBox = strip(read("views", "rule-box.ts"));
const heartbeat = strip(read("views", "scene-heartbeat.ts"));
const moveStrip = strip(read("views", "move-strip.ts"));
const css = read("app.css").replace(/\/\*[^]*?\*\//g, "");

/** The declaration bodies of every rule whose selector list is exactly `selector`. */
function rules(selector: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m !== null; m = re.exec(css)) {
    if ((m[1] as string).trim().replace(/\s+/g, " ") === selector) out.push(m[2] as string);
  }
  return out.join("\n");
}

describe("F1: the fix tab button opens the code change in the panel", () => {
  it("scrolls smoothly, or instantly under reduced motion", () => {
    expect(fixPanelScroll(false)).toBe("smooth");
    expect(fixPanelScroll(true)).toBe("auto");
  });

  it('"Show the code change" and the tab button share one open path (openCode)', () => {
    // The panel button opens through openCode, and openCode shows the code, scrolls and focuses it.
    expect(fixView).toMatch(/show\.addEventListener\("click", \(\) => \{\s*if \(diff\.hidden\) openCode\(\);/);
    expect(fixView).toMatch(/function openCode\(\): void \{\s*diff\.hidden = false;/);
    expect(fixView).toMatch(/node\.scrollIntoView\(\{ block: "center", behavior: fixPanelScroll\(prefersReducedMotion\(\)\) \}\)/);
    expect(fixView).toMatch(/diff\.focus\(/);
    // The tab button calls onOpen, which the page wires to the Fix_View's openCode (and so to that same function).
    expect(fixView).toMatch(/go\.addEventListener\("click", \(\) => onOpen\(\)\)/);
    expect(fixView).toMatch(/openCode\(\) \{\s*change\?\.openCode\(\);/);
    expect(appPage).toMatch(/tabs\.setFixChange\(c\.example\.id, \(\) => fv\.openCode\(\)\)/);
    expect(tabs).toMatch(/createFixTab\(id, onOpenCode\)/);
  });

  it("uses no hash link and no document lookup", () => {
    expect(fixView).not.toMatch(/location\.hash|href:\s*"#|getElementById/);
  });

  it('before the fix view opens the tab keeps "Press See the fix work to compare."', () => {
    expect(TAB_TEXT.fixNotRun).toBe("Press See the fix work to compare.");
    expect(tabs).toMatch(/id === null \? el\("p", \{ class: "tab-idle" \}, \[TAB_TEXT\.fixNotRun\]\)/);
  });
});

describe("F2: no Replay both", () => {
  it("is gone from the copy table and the panel", () => {
    expect(Object.keys(FIX_TEXT)).not.toContain("replayBoth");
    expect(fixView).not.toMatch(/Replay both|replayBoth/);
  });
});

describe("F3: the crosswalk rule row", () => {
  it("shows one muted line where the button would be", () => {
    expect(SETUP.noNumber).toBe("This rule has no number to change.");
    expect(setup).toMatch(/\[SETUP\.noNumber\]/);
    expect(setup).toMatch(/menuBtn\.hidden = ex === null \|\| def === null;\s*noNumber\.hidden = ex === null \|\| def !== null;/);
    expect(rules(".rule-menu-note")).toMatch(/min-height:\s*var\(--target\)/);
  });
});

describe("F4: the left card of the fix view", () => {
  it("is built when the view is, with the BROKE word, headline, cause line and the stopped line", () => {
    expect(fixView).toMatch(/const leftCard = el\("div", \{ class: "card fix-card fix-card--left is-waiting" \}, \[leftWord, leftHead, leftForgot, leftCause, leftStopped\]\)/);
    expect(fixView).toMatch(/leftHead\.textContent = next\.broke/);
    expect(fixView).toMatch(/leftCause\.textContent = next\.cause \?\? ""/);
    expect(appPage).toMatch(/broke: copyFor\(c\.example\.id, c\.custom\)\.broke,\s*cause: causeLine\(c\.example\.id, previousFingerprint\)/);
  });

  it("puts the I'm-alive line in the card, and keeps nothing between the scenes row and the cards row", () => {
    expect(fixView).toMatch(/leftForgot\.hidden = next\.exampleId !== "heartbeat"/);
    expect(rules(".fix-view .scene-frame:not(.keeps-labels) .scene-labels, .fix-view .scene-phone-line, .fix-view .scene-line")).toMatch(/display:\s*none/);
  });

  it("is dimmed before the break and keeps its height", () => {
    expect(rules(".fix-card--left.is-waiting")).toMatch(/opacity:\s*0?\.5/);
    expect(rules(".fix-card--left.is-waiting .fix-left-stopped")).toMatch(/visibility:\s*hidden/);
    expect(css).not.toMatch(/\.fix-card\.is-waiting\s*\{[^}]*display:\s*none/);
  });
});

describe("F5: a free band under each fix scene", () => {
  it("is 48 of 830 units, with the badges inside it", () => {
    expect(rules(".scene-frame.is-fix")).toMatch(/padding-bottom:\s*calc\(100% \* 48 \/ 830\)/);
    expect(rules(".scene-frame.is-fix .scene-corner--bl, .scene-frame.is-fix .scene-corner--br")).toMatch(/bottom:\s*4px/);
    expect(strip(read("views", "scene-chrome.ts"))).toMatch(/frame\.classList\.toggle\("is-fix", layout === "fix"\)/);
    expect(fixView).toMatch(/layout: "fix"/);
  });
});

describe("F6: the I'm-alive scene", () => {
  it("puts the three names on one top line and the three parts on one centre line", () => {
    const ys = [...heartbeat.matchAll(/node: column\([^\n]*\), x: \w+, y: (\w+)/g)].map((m) => m[1]);
    expect(ys).toEqual(["LABEL_Y", "LABEL_Y", "LABEL_Y"]);
    expect(heartbeat).toMatch(/const LIGHT_Y = CY;/);
    expect(heartbeat).toMatch(/const SENSOR_Y = CY - 28;/);
    expect(heartbeat).toMatch(/y: CY - PROGRAM_H \/ 2/);
  });
});

describe("F7: the shrink legend", () => {
  it("gives each item a 20 px icon box and a 6 px gap before the text", () => {
    expect(moveStrip).toMatch(/class: "legend-icon"/);
    expect(rules(".legend-icon")).toMatch(/width:\s*20px/);
    expect(rules(".strip-legend-item")).toMatch(/gap:\s*6px/);
  });
});

describe("F8: the rule editor", () => {
  it("shows the rule once: the read-only box while closed, the text box while open", () => {
    expect(ruleBox).toMatch(/editor\.hidden = !open;[^}]*lines\.hidden = open;/);
  });

  it("puts the one button beside the heading and keeps buttons as wide as their text", () => {
    expect(ruleBox).toMatch(/class: "rule-area-head"/);
    expect(ruleBox).toMatch(/\]\),\s*edit,\s*\]\),\s*headline,/);
    expect(rules(".rule-edit-button, .rule-reset-button")).toMatch(/align-self:\s*flex-start/);
    expect(rules(".rule-edit-button, .rule-reset-button")).toMatch(/width:\s*auto/);
    expect(ruleBox).toMatch(/patterns, reset\]/);
  });

  it("the text box is 4 lines, full width, resizable vertically only", () => {
    expect(ruleBox).toMatch(/rows: 4/);
    const box = rules(".rule-box");
    expect(box).toMatch(/width:\s*100%/);
    expect(box).toMatch(/resize:\s*vertical/);
  });

  it("template rows are one grid: name 200 px, example, Insert 88 px; stacked at 600 px and narrower", () => {
    expect(rules(".pattern")).toMatch(/grid-template-columns:\s*200px minmax\(0, 1fr\) 88px/);
    expect(rules(".pattern")).toMatch(/border-bottom:\s*1px solid/);
    expect(rules(".pattern-list")).toMatch(/gap:\s*var\(--s-3\)/);
    expect(rules(".pattern button")).toMatch(/width:\s*88px/);
    expect(css).toMatch(/@media \(max-width: 600px\)[^]*\.pattern \{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  });
});
