// Feature: upload-samples, task 7.3. COULDN'T TELL and idle text (Requirement 6).
// Vitest runs in node here, so no view is mounted. The text constants are checked by value (real checks). The
// tab and stage behaviour is checked by reading the source of tabs.ts, stage.ts and app-page.ts, which shows the
// code is written in the required shape. It does not show rendered output. Evidence, not proof.
//
// Already covered elsewhere, so not repeated here:
//  - tests/ui/couldnt-tell-screen.test.ts: "only the COULDN'T TELL path asks for the solid note",
//    "the solid note is a panel: padding, a border on the line token, the solid background",
//    "showNote sets the hide flag only for a solid note, after look() has cleared it".
//  - tests/ui/upload-samples-scan.test.ts: banned-word and brand scan of these strings (not their values).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STAGE_TEXT, TAB_TEXT } from "../../src/ui/app/model/stage-copy";

const ROOT = resolve(__dirname, "..", "..");
const TABS = readFileSync(resolve(ROOT, "src/ui/app/views/tabs.ts"), "utf8");
const STAGE = readFileSync(resolve(ROOT, "src/ui/app/views/stage.ts"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/ui/app/views/app-page.ts"), "utf8");

/** Text of the first `{ ... }` block after the header match, by brace matching. */
function body(src: string, header: RegExp): string {
  const m = header.exec(src);
  if (m === null) throw new Error(`header not found: ${String(header)}`);
  const open = src.indexOf("{", m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unbalanced braces");
}

describe("Requirement 6 text values", () => {
  it("TAB_TEXT.idle is the exact idle text (6.2)", () => {
    expect(TAB_TEXT.idle).toBe("The story of the run shows here after you unleash the gremlins.");
  });

  it("STAGE_TEXT.idleTitle is unchanged", () => {
    expect(STAGE_TEXT.idleTitle).toBe("Nothing has broken yet.");
  });

  it("STAGE_TEXT.noReplay and TAB_TEXT.noReplayNote are the exact COULDN'T TELL texts (6.1, 6.3)", () => {
    expect(STAGE_TEXT.noReplay).toBe("Nothing to replay.");
    expect(TAB_TEXT.noReplayNote).toBe("No replay: the verdict card explains why this program has no result.");
  });
});

describe("Tab text (source level)", () => {
  it("What happened and Signals both start from TAB_TEXT.idle and are repainted through one paintReplay (6.2)", () => {
    expect(TABS).toMatch(/const happenedIdle = el\("p", \{ class: "tab-idle" \}, \[TAB_TEXT\.idle\]\)/);
    expect(TABS).toMatch(/const signalsIdle = el\("p", \{ class: "tab-idle" \}, \[TAB_TEXT\.idle\]\)/);
    const b = body(TABS, /function paintReplay\(\): void \{/);
    expect(b).toMatch(/happenedIdle\.textContent = idleText/);
    expect(b).toMatch(/signalsIdle\.textContent = idleText/);
    // Shown while no replay exists, hidden once one does.
    expect(b).toMatch(/happenedIdle\.hidden = hasReplay/);
    expect(b).toMatch(/signalsIdle\.hidden = hasReplay/);
  });

  it("before any run the flags are off and the tabs are painted once, so the idle text shows (6.2)", () => {
    expect(TABS).toMatch(/let couldntTell = false;/);
    expect(TABS).toMatch(/let pending = false;/);
    expect(TABS).toMatch(/let hasReplay = false;/);
    expect(TABS).toMatch(/paintSelection\(\);\s*paintReplay\(\);/);
  });

  it("idle text choice: pending wins, then noReplayNote for COULDN'T TELL, else TAB_TEXT.idle (6.3)", () => {
    const b = body(TABS, /function paintReplay\(\): void \{/);
    expect(b).toMatch(
      /const idleText = pending \? STAGE_TEXT\.storyPlaceholder : couldntTell \? TAB_TEXT\.noReplayNote : TAB_TEXT\.idle;/,
    );
  });

  it("setCouldntTell stores the flag and repaints (6.3, 6.4)", () => {
    const b = body(TABS, /setCouldntTell\(on\) \{/);
    expect(b).toMatch(/couldntTell = on;/);
    expect(b).toMatch(/paintReplay\(\);/);
  });
});

describe("COULDN'T TELL path and new run (source level)", () => {
  it("the COULDN'T TELL branch turns the tab note on and shows the stage note (6.1, 6.3)", () => {
    const branch = body(PAGE, /else if \(v\.verdict === "COULDN'T TELL"\) \{/);
    expect(branch).toMatch(/tabs\.setCouldntTell\(true\);/);
    expect(branch).toMatch(/stage\.showNote\(STAGE_TEXT\.noReplay, true, \{ solid: true \}\)/);
    // It never sets a replay, so the idle slot is the one that shows the note text.
    expect(branch).not.toMatch(/tabs\.setReplay\(/);
  });

  it("clearOutputs clears the tab flag, and every run start (upload and example) calls clearOutputs first (6.4)", () => {
    const clear = body(PAGE, /const clearOutputs = \(\): void => \{/);
    expect(clear).toMatch(/tabs\.setReplay\(null\);/);
    expect(clear).toMatch(/tabs\.setCouldntTell\(false\);/);
    const starts = PAGE.match(/leaveFix\(\);\s*clearOutputs\(\);\s*ctx = \{/g) ?? [];
    expect(starts.length).toBe(2);
  });

  it("starting a run replaces the stage note: showRunning calls look() and look() clears the solid flag (6.4)", () => {
    const running = body(STAGE, /showRunning\(runsCompleted, tries\) \{/);
    expect(running).toMatch(/look\("idle"\);/);
    const look = body(STAGE, /function look\(/);
    expect(look).toMatch(/toggle\("is-levels-hidden", false\)/);
  });

  it("the stage note and tab note texts never name the idle texts, so both cannot be shown for one state (6.3)", () => {
    expect(TAB_TEXT.noReplayNote).not.toBe(TAB_TEXT.idle);
    expect(STAGE_TEXT.noReplay).not.toBe(STAGE_TEXT.idleTitle);
  });
});
