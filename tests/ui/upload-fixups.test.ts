// Feature: bench-ui-upload, fix-ups after the browser check (design "Fix-ups after browser check", P2, P4,
// P5, P7). Node only, no DOM. Passing runs are evidence, not proof.
import { describe, expect, it } from "vitest";
import { UNMODELLED_PERIPHERALS } from "../../src/engine/peripherals";
import type { ReducerEvent } from "../../src/engine/reducer/types";
import { sampleDownloads } from "../../src/ui/app/data/upload-sample";
import { CAPABILITY_COPY, notModelledPlain } from "../../src/ui/app/model/capability";
import { movePhrase } from "../../src/ui/app/model/moves";
import { importPinMap } from "../../src/ui/app/model/pin-map-file";
import type { PinRow } from "../../src/ui/app/model/pin-table";
import { plainStory } from "../../src/ui/app/model/plain-story";
import { stripDots } from "../../src/ui/app/model/strip";
import {
  addRow,
  deriveUpload,
  editRow,
  initialUpload,
  loadSample,
  revealAll,
  uploadChecklist,
  uploadLabels,
  visibleErrors,
} from "../../src/ui/app/model/upload-state";

const comparable = (rows: readonly PinRow[]) =>
  rows.map((r) => ({ signal: r.signal, plainName: r.plainName, port: r.port, bit: r.bit, direction: r.direction, pressed: r.pressed }));

describe("P2: upload moves use the press wording with the plain name", () => {
  const s = loadSample(initialUpload());
  const labels = uploadLabels(s.rows);
  const fixture = deriveUpload(s).previewFixture;
  const list: ReducerEvent[] = [
    { cycle: 1_000, signal: "REQUEST", value: 0, gremlinId: "masher" },
    { cycle: 2_000, signal: "REQUEST", value: "release", gremlinId: "masher" },
    { cycle: 3_000, signal: "REQUEST", value: 0, gremlinId: "masher" },
  ];

  it("strip labels read pressed, let go and pressed and held, with a short form without the name", () => {
    const dots = stripDots(list, fixture, 10_000, labels);
    expect(dots.map((d) => d.label)).toEqual(["+0 ms pressed Walk button", "+0 ms let go of Walk button", "+0 ms pressed and held Walk button"]);
    expect(dots.map((d) => d.short)).toEqual(["+0 ms pressed", "+0 ms let go", "+0 ms pressed and held"]);
  });

  it("the plain story and the gremlin log use the Examples' button words", () => {
    const story = plainStory({ reducedList: list, fixture, v: 20_000, storyEnding: "the program broke your rule.", spanSentence: "", labels });
    expect(story.startsWith("Masher pressed Walk button, let go, then pressed and held it")).toBe(true);
    expect(list.map((_, i) => movePhrase(list, i, fixture, labels))).toEqual([
      "pressed Walk button",
      "released Walk button",
      "pressed and held Walk button",
    ]);
  });

  it("a blank plain name falls back to the signal name", () => {
    const rows = s.rows.map((r) => ({ ...r, plainName: "" }));
    expect(stripDots(list.slice(0, 1), fixture, 10_000, uploadLabels(rows))[0]?.label).toBe("+0 ms pressed and held REQUEST");
  });
});

describe("P4: the sample pin map keeps the plain names", () => {
  it("importing the downloaded crosswalk-pins.json gives the rows of Try the sample", () => {
    const file = sampleDownloads().find((f) => f.name === "crosswalk-pins.json");
    if (file === undefined) throw new Error("no crosswalk-pins.json");
    const r = importPinMap(file.text, new TextEncoder().encode(file.text).length, 1);
    if (!r.ok) throw new Error(r.error);
    expect(comparable(r.rows)).toEqual(comparable(loadSample(initialUpload()).rows));
    expect(r.rows[0]?.plainName).toBe("Walk button");
  });
});

describe("P5: no red errors before the visitor acts", () => {
  it("a fresh or added row shows none; an edited row shows its own; a blocked Unleash shows all", () => {
    let s = addRow(addRow(initialUpload()));
    let v = visibleErrors(s, deriveUpload(s));
    expect(v.table.rowErrors.flat()).toEqual([]);
    expect(v.table.tableErrors).toEqual([]);
    expect(v.rule).toEqual([]);
    expect(deriveUpload(s).table.rowErrors.flat().length).toBeGreaterThan(0);

    const first = s.rows[0]?.id ?? -1;
    s = editRow(s, first, { signal: "1bad" });
    v = visibleErrors(s, deriveUpload(s));
    expect(v.table.rowErrors[0]?.length).toBeGreaterThan(0);
    expect(v.table.rowErrors[1]).toEqual([]);

    s = revealAll(s);
    v = visibleErrors(s, deriveUpload(s));
    expect(v.table.rowErrors[1]?.length).toBeGreaterThan(0);
    expect(v.table.tableErrors).toContain("No output to watch. Add at least one output pin.");
    expect(v.rule).toEqual(["The gremlins have no rule to test against. Add at least one rule."].map((text) => ({ line: null, position: null, text })));
  });

  it("the checklist ticks each step as it is done", () => {
    expect(uploadChecklist(initialUpload()).map((x) => x.done)).toEqual([false, false, false, false]);
    expect(uploadChecklist(loadSample(initialUpload())).map((x) => x.done)).toEqual([true, true, true, true]);
  });
});

describe("P7: the Plain_View not-modelled list", () => {
  it("names six parts from the engine table and counts the rest", () => {
    const named = ["USART0", "SPI", "TWI", "EEPROM", "WDT", "AC"].map((id) => UNMODELLED_PERIPHERALS.find((r) => r.id === id)?.plainName);
    expect(notModelledPlain()).toEqual([...named, CAPABILITY_COPY.registersLine(UNMODELLED_PERIPHERALS.length - 6)]);
    expect(notModelledPlain().at(-1)).toBe("and 10 low-level registers");
  });
});
